'use strict';
// Storage with fail-safes. Everything read from disk, an imported file or the phone's Health Connect
// passes through sanitize(), so damaged or hostile data cannot inject markup, break rendering or grow without bound.
const KEY = 'health.v1';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = { weights: [30, 250], waist: [40, 200], steps: [1, 100000], sleep: [0.5, 24], rhr: [25, 150] };
const MANUAL = ['weights', 'steps', 'sleep'];   // streams the watch can fill; what you type always wins
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
let loadNote = '', saveFailed = false, loadedMain = false;

function num(v, lo, hi) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  v = Number(v);
  return Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}
function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function dated(o, fn, max = 4000) {
  const r = {};
  if (obj(o)) for (const k of Object.keys(o).slice(-max)) if (DATE.test(k)) { const v = fn(o[k], k); if (v != null) r[k] = v; }
  return r;
}
function cleanFood(e, logged) {
  if (!obj(e)) return null;
  const k = num(e.k, 0, 5000), id = str(e.id, 40), n = str(e.n, 80).trim();
  if (k == null || !id || !n || BAD.has(id)) return null;
  const f = { id, n, u: str(e.u, 40) || '1 serving', k, p: num(e.p, 0, 500) || 0, fb: num(e.fb, 0, 200) || 0, cat: str(e.cat, 12) };
  if (!logged) return f;
  const q = num(e.q, 0.1, 50);
  if (q == null) return null;
  return Object.assign(f, { q, m: MEALS.some(m => m[0] === e.m) ? e.m : 'lunch' });
}
function cleanLift(v) {
  if (!obj(v) || !PLAN[v.day] || !obj(v.ex)) return null;
  const ex = {};
  for (const name of Object.keys(v.ex).slice(0, 30)) {
    if (BAD.has(name) || name.length > 60 || !Array.isArray(v.ex[name])) continue;
    const sets = v.ex[name].slice(0, 8).map(s => Array.isArray(s) ? [num(s[0], 0, 500), num(s[1], 0, 600)] : [null, null]);
    if (sets.some(s => s[0] != null || s[1] != null)) ex[name] = sets;
  }
  return Object.keys(ex).length ? { day: v.day, ex } : null;   // an emptied session is not a session
}
function cleanCardio(c) {
  if (!obj(c) || !Array.isArray(c.z)) return null;
  const dur = num(c.dur, 1, 36000), avg = num(c.avg, 30, 230), max = num(c.max, 30, 230);
  if (dur == null || avg == null || max == null) return null;
  const r = { dur, avg, max, z: [0, 1, 2, 3].map(i => num(c.z[i], 0, 36000) || 0) };
  const t = num(c.t, 1e12, 1e13); if (t != null) r.t = t;
  const kind = str(c.kind, 12); if (KINDS.some(x => x[0] === kind)) r.kind = kind;
  return r;
}
function cleanSleepx(v) {
  if (!obj(v)) return null;
  const r = { d: num(v.d, 0, 1440) || 0, l: num(v.l, 0, 1440) || 0, r: num(v.r, 0, 1440) || 0, w: num(v.w, 0, 1440) || 0, on: num(v.on, -720, 720) };
  for (const [k, lo, hi] of [['off', -720, 2160], ['bed', 0, 1440], ['nap', 0, 1440], ['hr', 25, 150]]) { const x = num(v[k], lo, hi); if (x != null) r[k] = x; }
  return r;
}
// Extra daily figures from the watch: distance m, active and total kcal, body fat %, SpO2 %, breaths/min, VO2max, watch HRV ms.
const WX = { di: [0, 200000], ak: [0, 10000], tk: [0, 15000], bf: [3, 70], o2: [70, 100], br: [4, 40], vo: [10, 90], hv: [1, 300] };
function cleanWx(v) {
  if (!obj(v)) return null;
  const r = {};
  for (const k in WX) { const x = num(v[k], ...WX[k]); if (x != null) r[k] = x; }
  if (v.rp === true) r.rp = true;   // resting HR was estimated from the day's lowest readings
  return Object.keys(r).length ? r : null;
}
// A workout the watch recorded, with its heart rate as a histogram: [[bpm, seconds], ...].
function cleanEx(e) {
  if (!obj(e)) return null;
  const s = num(e.s, 1e12, 1e13), en = num(e.e, 1e12, 1e13);
  if (s == null || en == null || en <= s || en - s > 864e5) return null;
  const h = Array.isArray(e.h) ? e.h.slice(0, 240).map(x => Array.isArray(x) ? [num(x[0], 30, 230), num(x[1], 0, 86400)] : null).filter(x => x && x[0] != null && x[1] != null) : [];
  return { s, e: en, k: str(e.k, 24) || 'Workout', src: str(e.src, 30), h, kcal: num(e.kcal, 0, 5000) };
}
function sanitize(raw) {
  raw = obj(raw) || {};
  const p = obj(raw.profile) || {}, meta = obj(raw.meta) || {};
  const freq = {};
  for (const [m] of MEALS) {
    freq[m] = {};
    const src = obj(raw.freq) && obj(raw.freq[m]);
    if (src) for (const id of Object.keys(src).slice(0, 400)) if (!BAD.has(id) && id.length <= 40) { const c = num(src[id], 1, 1e6); if (c) freq[m][id] = c; }
  }
  const list = (a, max, fn) => Array.isArray(a) ? a.slice(0, max).map(fn).filter(Boolean) : [];
  const manual = {};
  for (const s of MANUAL) manual[s] = dated(obj(raw.manual) && raw.manual[s], v => v === 1 || v === true ? 1 : null);
  const pairs = {};
  if (obj(raw.pairs)) for (const t of Object.keys(raw.pairs).slice(-400)) {
    const v = raw.pairs[t];
    if (/^\d{13}$/.test(t) && obj(v) && num(v.a, 30, 230) != null && num(v.n, 1, 1e6) != null) pairs[t] = { a: +v.a, n: +v.n };
  }
  const h9 = obj(meta.h9);
  return {
    v: 3,
    profile: {
      sex: p.sex === 'f' || p.sex === 'm' ? p.sex : ME.sex, dob: DATE.test(p.dob) ? p.dob : ME.dob,
      h: num(p.h, 120, 230) ?? ME.h, w0: num(p.w0, 30, 250) ?? ME.w0, waist0: num(p.waist0, 40, 200) ?? ME.waist0,
      days: num(p.days, 2, 4) ?? ME.days, equip: p.equip === 'home' || p.equip === 'gym' ? p.equip : ME.equip,
      shoulder: typeof p.shoulder === 'boolean' ? p.shoulder : ME.shoulder,
    },
    weights: dated(raw.weights, v => num(v, ...LIMITS.weights)), waist: dated(raw.waist, v => num(v, ...LIMITS.waist)),
    steps: dated(raw.steps, v => num(v, ...LIMITS.steps)), sleep: dated(raw.sleep, v => num(v, ...LIMITS.sleep)),
    rhr: dated(raw.rhr, v => num(v, ...LIMITS.rhr)), sleepx: dated(raw.sleepx, cleanSleepx), manual,
    wx: dated(raw.wx, cleanWx),
    ex: dated(raw.ex, a => { const x = list(a, 20, cleanEx); return x.length ? x : null; }),
    food: dated(raw.food, a => { const x = list(a, 80, e => cleanFood(e, true)); return x.length ? x : null; }),
    full: dated(raw.full, v => v === false || v === true ? v : null),
    lifts: dated(raw.lifts, cleanLift), prehab: dated(raw.prehab, v => v === true ? true : null),
    hrv: dated(raw.hrv, v => obj(v) && num(v.rmssd, 1, 300) != null && num(v.hr, 25, 220) != null ? Object.assign({ rmssd: +v.rmssd, hr: +v.hr }, num(v.q, 0, 100) != null ? { q: +v.q } : {}) : null),
    cardio: dated(raw.cardio, a => { const x = list(a, 10, cleanCardio); return x.length ? x : null; }),
    pairs,
    custom: list(raw.custom, 300, e => cleanFood(e, false)), freq,
    meta: {
      exported: DATE.test(meta.exported) ? meta.exported : null, watch: DATE.test(meta.watch) ? meta.watch : null,
      sync: num(meta.sync, 1e12, 1e13), backup: DATE.test(meta.backup) ? meta.backup : null,
      h9: h9 && str(h9.id, 64) ? { id: str(h9.id, 64), name: str(h9.name, 40) } : null,
    },
  };
}

// Main copy first, then yesterday's automatic backup. Unreadable data is set aside, never silently discarded.
function load() {
  try {
    for (const key of [KEY, KEY + '.bak']) {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      try {
        const s = sanitize(JSON.parse(raw));
        if (key === KEY) loadedMain = true; else loadNote = 'Saved data was unreadable. Restored the automatic backup from the day before.';
        return s;
      } catch (e) { try { localStorage.setItem(KEY + '.corrupt', raw.slice(0, 2e6)); } catch (_) { /* no room */ } }
    }
    if (localStorage.getItem(KEY + '.corrupt')) loadNote = 'Saved data was unreadable and has been set aside. Import your last export from Me.';
  } catch (e) { loadNote = 'This browser is blocking storage. Nothing you enter will be kept.'; }
  return sanitize({});
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); saveFailed = false; }
  catch (e) { if (!saveFailed) toast('Storage is full or blocked. Export a backup from Me now.', 4000); saveFailed = true; }
  // Cached figures depend on the data; drop them on every write.
  memo.clear();
}
// Once a day, before anything is written, keep a copy of the last good state.
function dailyBackup() {
  try {
    const t = todayKey();
    if (!loadedMain || localStorage.getItem(KEY + '.bak.date') === t) return;
    localStorage.setItem(KEY + '.bak', localStorage.getItem(KEY));
    localStorage.setItem(KEY + '.bak.date', t);
  } catch (e) { /* backup is best effort */ }
}
// A typed value marks the day as yours; clearing it hands the day back to the watch.
function setManual(stream, k, v) {
  if (v == null) { delete S[stream][k]; delete S.manual[stream][k]; }
  else { S[stream][k] = v; S.manual[stream][k] = 1; }
}

// Derived figures are recomputed at most once per render; save() clears them.
const memo = new Map();
function cached(key, fn) { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); }

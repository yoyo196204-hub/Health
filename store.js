'use strict';
// Storage with fail-safes. Everything read from disk or from an imported file passes through
// sanitize(), so a damaged or hostile file cannot inject markup, break rendering or grow without bound.
const KEY = 'health.v1';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = { weights: [30, 250], waist: [40, 200], steps: [1, 100000], sleep: [0.5, 24], rhr: [25, 150] };
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
let loadNote = '', saveFailed = false, loadedMain = false;

function num(v, lo, hi) {
  if (v === null || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  v = Number(v);
  return Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}
function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function dated(o, fn) {
  const r = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of Object.keys(o)) if (DATE.test(k)) { const v = fn(o[k]); if (v != null) r[k] = v; }
  return r;
}
function cleanFood(e, logged) {
  if (!e || typeof e !== 'object') return null;
  const k = num(e.k, 0, 5000), id = str(e.id, 40), n = str(e.n, 80).trim();
  if (k == null || !id || !n || BAD.has(id)) return null;
  const f = { id, n, u: str(e.u, 40) || '1 serving', k, p: num(e.p, 0, 500) || 0, fb: num(e.fb, 0, 200) || 0, cat: str(e.cat, 12) };
  if (!logged) return f;
  const q = num(e.q, 0.1, 50);
  if (q == null) return null;
  return Object.assign(f, { q, m: MEALS.some(m => m[0] === e.m) ? e.m : 'lunch' });
}
function cleanLift(v) {
  if (!v || typeof v !== 'object' || !PLAN[v.day] || !v.ex || typeof v.ex !== 'object') return null;
  const ex = {};
  for (const name of Object.keys(v.ex).slice(0, 30)) {
    if (BAD.has(name) || name.length > 60 || !Array.isArray(v.ex[name])) continue;
    ex[name] = v.ex[name].slice(0, 8).map(s => Array.isArray(s) ? [num(s[0], 0, 500), num(s[1], 0, 600)] : [null, null]);
  }
  return { day: v.day, ex };
}
function cleanCardio(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.z)) return null;
  const dur = num(c.dur, 1, 36000), avg = num(c.avg, 30, 230), max = num(c.max, 30, 230);
  return dur == null || avg == null || max == null ? null : { dur, avg, max, z: [0, 1, 2, 3].map(i => num(c.z[i], 0, 36000) || 0) };
}
function cleanSleepx(v) {
  if (!v || typeof v !== 'object') return null;
  return { d: num(v.d, 0, 1440) || 0, l: num(v.l, 0, 1440) || 0, r: num(v.r, 0, 1440) || 0, w: num(v.w, 0, 1440) || 0, on: num(v.on, -720, 720) };
}
function sanitize(raw) {
  raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const p = raw.profile && typeof raw.profile === 'object' ? raw.profile : {}, meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const freq = {};
  for (const [m] of MEALS) {
    freq[m] = {};
    const src = raw.freq && typeof raw.freq === 'object' && raw.freq[m];
    if (src && typeof src === 'object') for (const id of Object.keys(src).slice(0, 400)) if (!BAD.has(id) && id.length <= 40) { const c = num(src[id], 1, 1e6); if (c) freq[m][id] = c; }
  }
  const list = (a, max, fn) => Array.isArray(a) ? a.slice(0, max).map(fn).filter(Boolean) : [];
  return {
    v: 2,
    profile: {
      sex: p.sex === 'f' || p.sex === 'm' ? p.sex : ME.sex, dob: DATE.test(p.dob) ? p.dob : ME.dob,
      h: num(p.h, 120, 230) ?? ME.h, w0: num(p.w0, 30, 250) ?? ME.w0, waist0: num(p.waist0, 40, 200) ?? ME.waist0,
      days: num(p.days, 2, 4) ?? ME.days, equip: p.equip === 'home' || p.equip === 'gym' ? p.equip : ME.equip,
      shoulder: typeof p.shoulder === 'boolean' ? p.shoulder : ME.shoulder,
    },
    weights: dated(raw.weights, v => num(v, ...LIMITS.weights)), waist: dated(raw.waist, v => num(v, ...LIMITS.waist)),
    steps: dated(raw.steps, v => num(v, ...LIMITS.steps)), sleep: dated(raw.sleep, v => num(v, ...LIMITS.sleep)),
    rhr: dated(raw.rhr, v => num(v, ...LIMITS.rhr)), sleepx: dated(raw.sleepx, cleanSleepx),
    food: dated(raw.food, a => { const x = list(a, 80, e => cleanFood(e, true)); return x.length ? x : null; }),
    lifts: dated(raw.lifts, cleanLift), prehab: dated(raw.prehab, v => v === true ? true : null),
    hrv: dated(raw.hrv, v => v && num(v.rmssd, 1, 300) != null && num(v.hr, 25, 220) != null ? { rmssd: +v.rmssd, hr: +v.hr } : null),
    cardio: dated(raw.cardio, a => { const x = list(a, 10, cleanCardio); return x.length ? x : null; }),
    custom: list(raw.custom, 300, e => cleanFood(e, false)), freq,
    meta: { exported: DATE.test(meta.exported) ? meta.exported : null, watch: DATE.test(meta.watch) ? meta.watch : null },
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
  catch (e) { if (!saveFailed) toast('Storage is full or blocked. Export a backup from Me now.'); saveFailed = true; }
}
// Once a day, before anything is written, keep a copy of the last good state.
function dailyBackup() {
  try {
    const t = dk(new Date());
    if (!loadedMain || localStorage.getItem(KEY + '.bak.date') === t) return;
    localStorage.setItem(KEY + '.bak', localStorage.getItem(KEY));
    localStorage.setItem(KEY + '.bak.date', t);
  } catch (e) { /* backup is best effort */ }
}

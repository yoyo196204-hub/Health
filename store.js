'use strict';
// Storage with fail-safes. Everything read from disk, an imported file, Halftone or Health Connect passes through
// sanitize(), so damaged or hostile data cannot inject markup, break rendering or grow without bound.
// Copies kept, newest first: the live copy; inside the app a mirror in the app's private files; yesterday's
// automatic backup; and a snapshot taken before anything that removes data, so it can be undone.
const KEY = 'health.v1', SNAP = KEY + '.snap', VERSION = 4;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = { weights: [30, 250], waist: [40, 200], steps: [1, 100000], sleep: [0.5, 24], rhr: [25, 150] };
const MANUAL = ['weights', 'steps', 'sleep'];   // streams the watch can fill; what you type always wins
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const SETTINGS = {
  pace: [Object.keys(PACE), 'steady'], protein: [['std', 'high'], 'std'], prog: [Object.keys(PROGRAMS), 'hfb'],
  rest: [[0, 60, 90, 120, 150, 180, 240], 0], bar: [BARS, 20], dbStep: [[1, 2, 2.5], 2.5],
  haptics: [['full', 'subtle', 'off'], 'full'], motion: [['system', 'full', 'reduced'], 'system'], theme: [['system', 'light', 'dark'], 'system'],
};
let loadNote = '', saveFailed = false, loadedMain = false, recovered = '';

function num(v, lo, hi) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  v = Number(v);
  return Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}
function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function dated(o, fn, max = 4000) {
  const r = {};
  if (obj(o)) for (const k of Object.keys(o).sort().slice(-max)) if (DATE.test(k)) { const v = fn(o[k], k); if (v != null) r[k] = v; }
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
// An exercise is a library id, 'og:' and the number of an exercise from openGym's library, or 'x:' and a name for
// anything else the library does not know.
function liftId(name) {
  if (typeof name !== 'string' || BAD.has(name) || !name || name.length > 64) return null;
  if (EXD[name] || /^x:./.test(name) || (/^og:\d{1,6}$/.test(name) && ogx(name.slice(3)))) return name;
  return OLDNAMES[name] || 'x:' + name.slice(0, 50);
}
function cleanLift(v) {
  if (!obj(v) || !obj(v.ex)) return null;
  const ex = {};
  for (const name of Object.keys(v.ex).slice(0, 30)) {
    const id = liftId(name);
    if (!id || !Array.isArray(v.ex[name])) continue;
    const sets = v.ex[name].slice(0, 12).map(s => Array.isArray(s) ? [num(s[0], 0, 500), num(s[1], 0, 600)] : [null, null]);
    if (sets.some(s => s[0] != null || s[1] != null)) ex[id] = (ex[id] || []).concat(sets).slice(0, 12);
  }
  if (!Object.keys(ex).length) return null;   // an emptied session is not a session
  const prog = PROGRAMS[v.prog] ? v.prog : 'hfb', day = str(v.day, 8);
  const r = { prog, day: PROGRAMS[prog].days[day] ? day : Object.keys(PROGRAMS[prog].days)[0], ex };
  const sx = {};
  if (obj(v.sx)) for (const id of Object.keys(v.sx).slice(0, 30)) if (ex[id] && SX[v.sx[id]]) sx[id] = v.sx[id];
  if (Object.keys(sx).length) r.sx = sx;
  const t0 = num(v.t0, 1e12, 1e13), t1 = num(v.t1, 1e12, 1e13);
  if (t0 != null) r.t0 = t0;
  if (t1 != null && t0 != null && t1 >= t0) r.t1 = t1;
  // Logged in openGym: the next read from openGym may update it. ow: openGym's own ids for the workouts of that day.
  if (v.src === 'og') {
    r.src = 'og';
    const ow = Array.isArray(v.ow) ? v.ow.filter(x => typeof x === 'string' && x && x.length <= 40 && !BAD.has(x)).slice(0, 6) : [];
    if (ow.length) r.ow = ow;
  }
  return r;
}
// A cardio session from the strap (heart rate and zones), or one typed in by hand (m: 1, with an effort).
function cleanCardio(c) {
  if (!obj(c)) return null;
  const dur = num(c.dur, 1, 36000), t = num(c.t, 1e12, 1e13), kind = str(c.kind, 12);
  if (dur == null) return null;
  const r = { dur };
  if (t != null) r.t = t;
  if (KINDS.some(x => x[0] === kind)) r.kind = kind;
  if (c.m === 1) {
    r.m = 1; r.eff = c.eff === 'vig' ? 'vig' : 'mod';
    r.z = [0, r.eff === 'mod' ? dur : 0, r.eff === 'vig' ? dur : 0, 0];
    return r;
  }
  if (!Array.isArray(c.z)) return null;
  const avg = num(c.avg, 30, 230), max = num(c.max, 30, 230);
  if (avg == null || max == null) return null;
  return Object.assign(r, { avg, max, z: [0, 1, 2, 3].map(i => num(c.z[i], 0, 36000) || 0) });
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
function cleanSettings(v) {
  v = obj(v) || {};
  const r = {};
  for (const [k, [allowed, def]] of Object.entries(SETTINGS)) r[k] = allowed.includes(v[k]) ? v[k] : def;
  return r;
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
  const h9 = obj(meta.h9), tg = obj(meta.tgt);
  const ids = o => { const r = {}; if (obj(o)) for (const id of Object.keys(o).slice(0, 60)) if (EXD[id] && DATE.test(o[id])) r[id] = o[id]; return r; };
  return {
    v: VERSION,
    profile: {
      sex: p.sex === 'f' || p.sex === 'm' ? p.sex : ME.sex, dob: DATE.test(p.dob) ? p.dob : ME.dob,
      h: num(p.h, 120, 230) ?? ME.h, w0: num(p.w0, 30, 250) ?? ME.w0, waist0: num(p.waist0, 40, 200) ?? ME.waist0,
      days: num(p.days, 2, 6) ?? ME.days, equip: p.equip === 'home' || p.equip === 'gym' ? p.equip : ME.equip,
      shoulder: typeof p.shoulder === 'boolean' ? p.shoulder : ME.shoulder,
    },
    settings: cleanSettings(raw.settings),
    weights: dated(raw.weights, v => num(v, ...LIMITS.weights)), waist: dated(raw.waist, v => num(v, ...LIMITS.waist)),
    steps: dated(raw.steps, v => num(v, ...LIMITS.steps)), sleep: dated(raw.sleep, v => num(v, ...LIMITS.sleep)),
    rhr: dated(raw.rhr, v => num(v, ...LIMITS.rhr)), sleepx: dated(raw.sleepx, cleanSleepx), manual,
    wx: dated(raw.wx, cleanWx),
    ex: dated(raw.ex, a => { const x = list(a, 20, cleanEx); return x.length ? x : null; }),
    food: dated(raw.food, a => { const x = list(a, 80, e => cleanFood(e, true)); return x.length ? x : null; }),
    full: dated(raw.full, v => v === false || v === true ? v : null),
    lifts: dated(raw.lifts, cleanLift), prehab: dated(raw.prehab, v => v === true ? true : null),
    swaps: dated(raw.swaps, v => { const r = {}; if (obj(v)) for (const a of Object.keys(v).slice(0, 12)) if (EXD[a] && EXD[v[a]]) r[a] = v[a]; return Object.keys(r).length ? r : null; }, 30),
    cleared: ids(raw.cleared),
    hrv: dated(raw.hrv, v => obj(v) && num(v.rmssd, 1, 300) != null && num(v.hr, 25, 220) != null ? Object.assign({ rmssd: +v.rmssd, hr: +v.hr }, num(v.q, 0, 100) != null ? { q: +v.q } : {}) : null),
    cardio: dated(raw.cardio, a => { const x = list(a, 10, cleanCardio); return x.length ? x : null; }),
    pairs,
    custom: list(raw.custom, 300, e => cleanFood(e, false)), freq,
    meta: {
      exported: DATE.test(meta.exported) ? meta.exported : null, watch: DATE.test(meta.watch) ? meta.watch : null,
      sync: num(meta.sync, 1e12, 1e13), backup: DATE.test(meta.backup) ? meta.backup : null,
      h9: h9 && str(h9.id, 64) ? { id: str(h9.id, 64), name: str(h9.name, 40) } : null,
      tgt: tg && num(tg.k, 800, 6000) != null && DATE.test(tg.at) ? { k: +tg.k, p: num(tg.p, 20, 400) || 0, at: tg.at, sig: str(tg.sig, 80) } : null,
      welcomed: meta.welcomed === true, imported: str(meta.imported, 40) || null,
      og: obj(meta.og) && num(meta.og.at, 1e12, 1e13) != null ? { at: +meta.og.at, file: str(meta.og.file, 60), seen: str(meta.og.seen, 90) } : null,
      ogplan: obj(meta.ogplan) && DATE.test(meta.ogplan.at) ? { sig: str(meta.ogplan.sig, 16), at: meta.ogplan.at } : null,
    },
  };
}

// ---------- reading and writing ----------
function readKey(key) {
  const raw = localStorage.getItem(key);
  return raw == null ? undefined : sanitize(JSON.parse(raw));
}
// Main copy first, then the app's private mirror, then yesterday's automatic backup.
// Unreadable data is set aside, never silently discarded.
function load() {
  let main;
  try {
    try { main = readKey(KEY); }
    catch (e) { try { localStorage.setItem(KEY + '.corrupt', String(localStorage.getItem(KEY)).slice(0, 4e6)); } catch (_) { /* no room */ } main = null; }
    if (main) { loadedMain = true; return main; }
    const mirror = typeof mirrorRead === 'function' ? mirrorRead() : null;
    if (mirror) { recovered = 'mirror'; loadNote = main === null ? 'Saved data was damaged. Restored the app’s own copy from your last session.' : ''; return mirror; }
    try {
      const bak = readKey(KEY + '.bak');
      if (bak) { recovered = 'bak'; loadNote = 'Saved data was unreadable. Restored the automatic backup from the day before.'; return bak; }
    } catch (e) { /* the backup is damaged too */ }
    if (main === null) loadNote = 'Saved data was unreadable and has been set aside. Import your last backup from Me › Backup & data.';
  } catch (e) { loadNote = 'This browser is blocking storage. Nothing you enter will be kept.'; }
  return sanitize({});
}
let mirrorTimer = null;
function save() {
  memo.clear();   // cached figures depend on the data
  let text;
  try { text = JSON.stringify(S); localStorage.setItem(KEY, text); saveFailed = false; }
  catch (e) { if (!saveFailed) toast('Storage is full or blocked. Export a backup from Me now.', 5000); saveFailed = true; }
  // Inside the app, a second copy in private storage, written a moment after the last change.
  if (typeof mirrorWrite === 'function' && text) { clearTimeout(mirrorTimer); mirrorTimer = setTimeout(() => mirrorWrite(text), 1200); }
}
function flushMirror() { if (mirrorTimer) { clearTimeout(mirrorTimer); mirrorTimer = null; if (typeof mirrorWrite === 'function') mirrorWrite(JSON.stringify(S)); } }
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
  if (v == null) { delete S[stream][k]; delete S.manual[stream]?.[k]; }
  else { S[stream][k] = v; if (S.manual[stream]) S.manual[stream][k] = 1; }
}

// ---------- snapshots: every destructive action can be undone ----------
function snapshot(why) {
  try { localStorage.setItem(SNAP, JSON.stringify({ at: Date.now(), why: str(why, 80), data: S })); return true; }
  catch (e) { return false; }
}
function snapInfo() {
  try { const s = JSON.parse(localStorage.getItem(SNAP) || 'null'); return s && num(s.at, 1e12, 1e13) ? { at: s.at, why: str(s.why, 80) } : null; }
  catch (e) { return null; }
}
function restoreSnapshot() {
  try {
    const s = JSON.parse(localStorage.getItem(SNAP) || 'null');
    if (!s || !obj(s.data)) return false;
    const before = S;
    S = sanitize(s.data); save();
    localStorage.setItem(SNAP, JSON.stringify({ at: Date.now(), why: 'Before undo', data: before }));
    return true;
  } catch (e) { return false; }
}

// ---------- what is stored, and cutting old data ----------
const STREAMS = {
  food: ['Food log', ['food', 'full']],
  body: ['Weigh-ins and waist', ['weights', 'waist']],
  activity: ['Watch and recovery', ['steps', 'sleep', 'sleepx', 'rhr', 'wx', 'ex', 'hrv']],
  training: ['Training', ['lifts', 'cardio', 'prehab', 'swaps']],
};
function usage() {
  let bytes = 0;
  try { bytes = new Blob([JSON.stringify(S)]).size; } catch (e) { bytes = JSON.stringify(S).length; }
  const groups = Object.entries(STREAMS).map(([g, [label, keys]]) => {
    const days = new Set();
    for (const k of keys) for (const d of Object.keys(S[k] || {})) days.add(d);
    const sorted = [...days].sort();
    return { g, label, days: sorted.length, first: sorted[0] || null };
  });
  const first = groups.map(x => x.first).filter(Boolean).sort()[0] || null;
  return { bytes, groups, first };
}
// Everything dated before `before` in the chosen groups. dry = count only.
function prune(before, groups, dry = false) {
  const n = {}, keys = groups.flatMap(g => STREAMS[g][1]), days = new Set();
  for (const k of keys) {
    n[k] = 0;
    for (const d of Object.keys(S[k] || {})) if (d < before) { n[k]++; days.add(d); if (!dry) delete S[k][d]; }
  }
  if (!dry) {
    for (const s of MANUAL) if (keys.includes(s)) for (const d of Object.keys(S.manual[s])) if (d < before) delete S.manual[s][d];
    if (keys.includes('ex')) { const cut = Date.parse(before + 'T00:00'); for (const t of Object.keys(S.pairs)) if (+t < cut) delete S.pairs[t]; }
  }
  return { n, days: days.size };
}

// ---------- bringing in Halftone ----------
// Halftone kept several profiles in one backup ({app:'halftone', db:{users:{...}}}) or its raw store (forge.v2).
// Its first launch seeded five demonstration sessions at fixed weights; those are recognised and left out.
const HT_SEED = {
  r: { 'incline-db-press': 26, 'neutral-pulldown': 55, 'landmine-press': 30, 'chest-supported-row': 45, 'cable-lateral': 9, 'face-pull': 20, 'hack-squat': 90, rdl: 70, 'leg-press': 140, 'leg-curl': 40, 'standing-calf': 40, 'cable-crunch': 30, 'hip-thrust': 80, 'goblet-squat': 24, 'db-row': 30, 'ez-curl': 25, 'triceps-pushdown': 30 },
  v: { 'incline-db-press': 10, 'neutral-pulldown': 27, 'landmine-press': 12, 'chest-supported-row': 22, 'cable-lateral': 4, 'face-pull': 9, 'hack-squat': 35, rdl: 25, 'leg-press': 60, 'leg-curl': 20, 'standing-calf': 20, 'cable-crunch': 12, 'hip-thrust': 40, 'goblet-squat': 12, 'db-row': 12, 'ez-curl': 10, 'triceps-pushdown': 12 },
};
const HT_DAY = { upperA: ['ul4', 'UA'], lowerA: ['ul4', 'LA'], upperB: ['ul4', 'UB'], lowerB: ['ul4', 'LB'], fullA: ['fb3', 'A'], fullB: ['fb3', 'B'], fullC: ['fb3', 'C'],
  push: ['ppl6', 'P'], pull: ['ppl6', 'U'], legs: ['ppl6', 'L'], push2: ['ppl6', 'P2'], pull2: ['ppl6', 'U2'], legs2: ['ppl6', 'L2'] };
function halftoneProfiles(o) {
  const db = obj(o) && (o.app === 'halftone' || o.app === 'inkplate') ? obj(o.db) : obj(o) && obj(o.users) ? o : null;
  if (!db || !obj(db.users)) return null;
  return Object.entries(db.users).filter(([k, u]) => obj(u) && obj(u.log) && !BAD.has(k)).map(([k, u]) => {
    const conv = halftoneConvert(k, u);
    return { key: k, name: str(u.name, 30) || k, conv };
  });
}
function halftoneConvert(key, u) {
  const seed = HT_SEED[key], lifts = {}, sx = obj(u.sx) || {};
  let sets = 0, seeded = 0;
  const logDays = Object.keys(u.log).filter(d => DATE.test(d)).sort();
  for (const d of logDays) {
    const day = obj(u.log[d]);
    if (!day) continue;
    const ex = {}, rep = {};
    let isSeed = !!seed && gapDays(logDays[0], d) <= 7;
    for (const id of Object.keys(day).slice(0, 30)) {
      const e = obj(day[id]);
      if (!EXD[id] || !e || !Array.isArray(e.sets)) continue;
      const w = num(e.w, 0, 500) ?? 0;
      const done = e.sets.filter(x => obj(x) && x.done && num(x.r, 1, 600) != null).slice(0, 12).map(x => [w, +x.r]);
      if (!done.length) continue;
      ex[id] = done;
      // The demonstration sessions used the seed weight and a fixed pattern: top, top, then one fewer.
      const r = done.map(x => x[1]);
      if (!seed || seed[id] !== w || r[1] !== r[0] || r.slice(2).some(x => x !== r[0] - 1)) isSeed = false;
      const st = obj(sx[d]) && sx[d][id];
      if (SX[st]) rep[id] = st;
    }
    if (!Object.keys(ex).length) continue;
    if (isSeed) { seeded++; continue; }
    // Which programme day it was is not stored per session in Halftone, so it is read from the lifts.
    let best = ['hfb', 'A'], score = -1;
    for (const [pid, P] of Object.entries(PROGRAMS)) for (const [did, D] of Object.entries(P.days)) {
      const hit = D.lifts.filter(l => ex[l[0]]).length;
      if (hit > score) { score = hit; best = [pid, did]; }
    }
    lifts[d] = Object.assign({ prog: best[0], day: best[1], ex }, Object.keys(rep).length ? { sx: rep } : {});
    sets += Object.values(ex).reduce((a, s) => a + s.length, 0);
  }
  const weights = {}, cardio = {};
  if (obj(u.hc)) for (const d of Object.keys(u.hc)) { const w = num(u.hc[d]?.wt, ...LIMITS.weights); if (DATE.test(d) && w != null) weights[d] = r1(w); }
  const KIND = { 'incline-walk': 'incline', bike: 'cycle', rower: 'row', intervals: 'cardio' };
  if (obj(u.cardio)) for (const d of Object.keys(u.cardio)) {
    const c = obj(u.cardio[d]), min = num(c?.min, 1, 300);
    if (DATE.test(d) && min != null) cardio[d] = [{ t: num(c.at, 1e12, 1e13) ?? Date.parse(d + 'T18:00'), kind: KIND[c.id] || 'cardio', dur: min * 60, m: 1, eff: c.id === 'intervals' ? 'vig' : 'mod' }];
  }
  return { lifts, weights, cardio, sets, seeded, days: Object.keys(lifts).length };
}
// Adds Halftone's sessions without touching anything already in Health: a day you trained in both keeps Health's.
function halftoneMerge(conv) {
  const got = { days: 0, weights: 0, cardio: 0 };
  for (const [d, L] of Object.entries(conv.lifts)) { const c = cleanLift(L); if (c && !S.lifts[d]) { S.lifts[d] = c; got.days++; } }
  for (const [d, w] of Object.entries(conv.weights)) if (S.weights[d] == null) { S.weights[d] = w; S.manual.weights[d] = 1; got.weights++; }
  for (const [d, a] of Object.entries(conv.cardio)) if (!S.cardio[d]) { const x = a.map(cleanCardio).filter(Boolean); if (x.length) { S.cardio[d] = x; got.cardio++; } }
  return got;
}

// Derived figures are recomputed at most once per render; save() clears them.
const memo = new Map();
function cached(key, fn) { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); }
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('store.js');

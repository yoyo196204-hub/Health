'use strict';
// openGym (github.com/DuarteSantos8/openGym) and Health, working together through files on the phone. No internet
// is involved in either direction.
//  openGym → Health: openGym's backup (the copy its "Auto-backup on changes" drops in a folder, a backup exported by
//    hand, or its workout spreadsheet) brings in every completed set, the weigh-ins you typed there and its cardio.
//    Review, the muscle map, strength and the next session's targets then count training logged in openGym
//    exactly as if it had been logged here.
//  Health → openGym: a plan file with Health's programme as it stands for you today: shoulder care, home kit,
//    anything pain has taken out, rep ranges, double progression, rest, the next loads and the weekdays. openGym
//    imports it as ordinary routines.

// Health's exercises under openGym's own numbers. The one with no close match travels as one of your own
// exercises, with Health's name, description and muscles.
const OG_OF = {
  'incline-db-press': '0314', 'machine-chest-press': '0577', 'cable-fly': '0227', pushup: '0662', 'landmine-press': '5074',
  'db-shoulder-press': '0405', 'cable-lateral': '0178', 'face-pull': '5609', 'rear-delt-fly': '0380', 'neutral-pulldown': '7583',
  'chest-supported-row': '0327', 'db-row': '0292', shrug: '0406', 'back-extension': '0489', 'ez-curl': '0447', 'hammer-curl': '0313',
  'triceps-pushdown': '0201', skullcrusher: '5873', 'cable-crunch': '0175', 'pallof-press': '1202', 'hip-thrust': '1060', rdl: '0085',
  'leg-curl': '0599', 'hack-squat': '0743', 'leg-press': '0739', 'goblet-squat': '1760', 'standing-calf': '0605', 'seated-calf': '0594',
  'db-lateral': '0334', 'leg-raise': '0865', 'side-plank': '0715', cossack: '2569', adduction: '0598', 'db-bench': '0352',
  'cable-row': '2661', 'split-squat': '2960', plank: '0463', 'dead-bug': '0276', 'db-curl': '0294', 'band-pulldown': '4358',
  'glute-bridge': '3335', 'half-kneeling-press': '11016', 'db-leg-curl': '6161', 'db-kickback': '0354',
};
// Back the other way, plus openGym's near-twins of the same movement, so their history joins Health's.
const OG_BACK = Object.assign(Object.fromEntries(Object.entries(OG_OF).map(([h, o]) => [o, h])), {
  '0576': 'machine-chest-press', '1269': 'cable-fly', '0200': 'triceps-pushdown', '7744': 'face-pull', '5658': 'face-pull',
  '0404': 'db-shoulder-press', '0312': 'hammer-curl', '0979': 'pallof-press', '0488': 'back-extension', '1860': 'back-extension',
});
const OG_PLAN_NAME = 'Health plan for openGym.json';

// ---------- an openGym exercise, in Health ----------
// A Health exercise when openGym's number is one of Health's, 'og:<number>' when openGym's library has it, or 'x:' and
// its name for one of your own openGym exercises.
function ogHealthId(ogId, name) {
  ogId = String(ogId ?? '').slice(0, 40);
  if (Object.hasOwn(OG_BACK, ogId)) return OG_BACK[ogId];
  if (/^\d{1,6}$/.test(ogId) && ogx(ogId)) return 'og:' + ogId;
  const n = String(name || '').trim().slice(0, 50);
  if (n) return Object.keys(EXD).find(k => EXD[k].n.toLowerCase() === n.toLowerCase()) || OLDNAMES[n] || 'x:' + n;
  return ogId ? 'x:openGym exercise ' + ogId.slice(0, 12) : null;
}
function ogKg(w, unit) { const x = Number(w) || 0; return x > 0 ? Math.round((unit === 'lb' ? x * 0.45359237 : x) * 100) / 100 : 0; }
function ogNum(v) { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; }
function ogDayOf(w) {
  if (DATE.test(w.d)) return w.d;
  const t = num(w.start, 1e12, 1e13);
  return t == null ? null : dk(new Date(t));
}
function ogCardioKind(name) {
  const n = String(name || '').toLowerCase();
  return /incline/.test(n) ? 'incline' : /walk|treadmill|stair|step/.test(n) ? 'walk' : /run|jog|sprint/.test(n) ? 'run'
    : /bike|cycl|spin/.test(n) ? 'cycle' : /row/.test(n) ? 'row' : 'cardio';
}

// ---------- reading openGym's files ----------
// One shape for both files: { kind, workouts: [{ d, t0, t1, name, entries: [{ og, name, sets }] }], weighins }.
// A set is { kg, r } for reps, { kg, sec } for a hold, { min } for cardio. Warm-ups and unticked sets never happened.
function ogParse(text) {
  text = String(text || '').replace(/^﻿/, '');
  const t = text.trimStart();
  if (t.startsWith('{')) {
    let o;
    try { o = JSON.parse(t); } catch (e) { return null; }
    if (obj(o) && o.opengym_plan) return { error: 'That is an openGym plan file: routines, but no workouts. In openGym, export a backup instead.' };
    if (!obj(o) || !Array.isArray(o.workouts) || o.profile || o.food) return null;
    return ogFromBackup(o);
  }
  const rows = ogCsvRows(text.slice(0, 40e6));
  return rows.length > 1 ? ogFromCsv(rows) : null;
}
function ogSet(s, unit) {
  if (!obj(s)) return null;
  const sides = obj(s.sides) && obj(s.sides.L) && obj(s.sides.R) ? s.sides : null;
  const done = sides ? sides.L.done === true || sides.R.done === true : s.done === true;
  const warm = s.phase != null && s.phase !== '' ? /^warm[-_ ]?up$/i.test(String(s.phase).trim()) : s.warmup === true;
  if (!done || warm) return null;
  // A per-side set counts one side's reps, the way Health logs "each side".
  const r = sides ? Math.max(ogNum(sides.L.r), ogNum(sides.R.r)) : ogNum(s.r);
  const w = sides ? Math.max(ogNum(sides.L.w), ogNum(sides.R.w)) : ogNum(s.w);
  if (r > 0) return { kg: ogKg(w, unit), r: Math.min(600, Math.round(r)) };
  if (ogNum(s.sec) > 0) return { kg: ogKg(w, unit), sec: Math.min(600, Math.round(s.sec)) };
  if (ogNum(s.min) > 0) return { min: Math.min(600, ogNum(s.min)) };
  return null;
}
function ogFromBackup(o) {
  const unit = o.unit === 'lb' ? 'lb' : 'kg', own = new Map();
  for (const c of Array.isArray(o.customEx) ? o.customEx.slice(0, 3000) : []) if (obj(c) && c.id != null) own.set(String(c.id), str(c.n, 50));
  const workouts = [];
  for (const w of o.workouts.slice(-6000)) {
    if (!obj(w)) continue;
    const d = ogDayOf(w);
    if (!d) continue;
    const entries = [];
    for (const e of (Array.isArray(w.entries) ? w.entries : []).slice(0, 60)) {
      if (!obj(e) || e.id == null) continue;
      const sets = (Array.isArray(e.sets) ? e.sets : []).slice(0, 60).map(s => ogSet(s, unit)).filter(Boolean);
      if (sets.length) entries.push({ og: String(e.id), name: own.get(String(e.id)) || '', sets });
    }
    if (entries.length) workouts.push({ id: str(String(w.id ?? ''), 40), d, t0: num(w.start, 1e12, 1e13), t1: num(w.end, 1e12, 1e13), name: str(w.name, 60), entries });
  }
  // Weigh-ins you typed in openGym, or imported there from another app's file. One openGym read from Health Connect is
  // left to Health's own sync, which reads the same scale.
  const weighins = [];
  for (const b of Array.isArray(o.bodyweight) ? o.bodyweight.slice(-6000) : []) {
    if (!obj(b) || !DATE.test(b.d)) continue;
    const rs = (Array.isArray(b.ins) ? b.ins : [b]).filter(r => obj(r) && ogNum(r.w) && r.src !== 'health');
    rs.sort((x, y) => String(x.at || '').localeCompare(String(y.at || '')) || (Number(x.t) || 0) - (Number(y.t) || 0));
    if (rs.length) weighins.push({ d: b.d, kg: ogKg(rs[0].w, unit) });   // the morning one, as openGym shows it
  }
  return { kind: 'backup', workouts, weighins };
}
// RFC 4180: quoted fields may hold commas, quotes and line breaks.
function ogCsvRows(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length && rows.length < 300000; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
// openGym's "Export as CSV" (workouts), and spreadsheets shaped like it: one row per set.
function ogFromCsv(rows) {
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const C = { d: col('date', 'workoutdate'), ex: col('exercise', 'exercisename', 'exercisetitle'), id: col('exerciseid'), w: col('weight'),
    kg: col('weightkg'), lb: col('weightlbs', 'weightlb'), unit: col('unit', 'weightunit'), r: col('reps', 'repetitions'),
    sec: col('seconds', 'durationseconds'), km: col('distancekm'), type: col('settype'), side: col('side'), set: col('set', 'setorder'),
    t0: col('starttime', 'startdate'), t1: col('endtime'), wo: col('workout', 'workoutname', 'title') };
  if (C.d < 0 || C.ex < 0 || (C.w < 0 && C.kg < 0 && C.lb < 0 && C.r < 0)) return null;
  const at = v => { const t = Date.parse(String(v || '').trim().replace(' ', 'T')); return Number.isFinite(t) && t > 1e12 ? t : null; };
  const by = new Map(), sides = new Map();
  for (const r of rows.slice(1)) {
    const cell = i => (i >= 0 ? String(r[i] ?? '').trim().replace(/^'/, '') : '');
    const d = cell(C.d).slice(0, 10), name = cell(C.ex);
    if (!DATE.test(d) || !name) continue;
    const type = cell(C.type).toLowerCase();
    if (type === 'warmup' || type === 'warm-up' || type === 'drop') continue;
    const unit = C.kg >= 0 && cell(C.kg) !== '' ? 'kg' : C.lb >= 0 && cell(C.lb) !== '' ? 'lb' : /^lb/i.test(cell(C.unit)) ? 'lb' : 'kg';
    const w = ogKg(C.kg >= 0 && cell(C.kg) !== '' ? cell(C.kg) : C.lb >= 0 && cell(C.lb) !== '' ? cell(C.lb) : cell(C.w), unit);
    const reps = ogNum(cell(C.r)), sec = ogNum(cell(C.sec)), km = cell(C.km);
    let set = null;
    if (reps > 0) set = { kg: w, r: Math.min(600, Math.round(reps)) };
    else if (sec > 0 && km !== '') set = { min: Math.min(600, sec / 60) };
    else if (sec > 0) set = { kg: w, sec: Math.min(600, Math.round(sec)) };
    if (!set) continue;
    const key = `${d}|${cell(C.t0)}|${cell(C.wo)}`;
    if (!by.has(key)) by.set(key, { d, t0: at(cell(C.t0)), t1: at(cell(C.t1)), name: cell(C.wo).slice(0, 60), entries: [], at: new Map() });
    const W = by.get(key), ek = cell(C.id) || name;
    if (!W.at.has(ek)) { const e = { og: cell(C.id), name, sets: [] }; W.at.set(ek, e); W.entries.push(e); }
    const E = W.at.get(ek), side = cell(C.side).toUpperCase();
    // The right side of a per-side set is the same set as the left: one side's reps, the heavier load.
    const sk = `${key}|${ek}|${cell(C.set)}`;
    if (side === 'R' && sides.has(sk)) { const s = sides.get(sk); s.r = Math.max(s.r || 0, set.r || 0); s.kg = Math.max(s.kg || 0, set.kg || 0); continue; }
    if (side === 'L') sides.set(sk, set);
    if (E.sets.length < 60) E.sets.push(set);
  }
  const workouts = [...by.values()].map(({ at: _, ...w }) => w);
  return workouts.length ? { kind: 'csv', workouts, weighins: [] } : null;
}

// ---------- into Health's shape ----------
// Health keeps one lifting session a day, so two openGym workouts on one day become one. Which programme day it was
// comes from the routine's name when Health sent it, otherwise from the exercises it shares with each day.
function ogMatchDay(ex, names) {
  const ids = Object.keys(ex);
  let best = [S.settings.prog, Object.keys(prog().days)[0]], score = -1;
  for (const [pid, P] of Object.entries(PROGRAMS)) for (const [did, D] of Object.entries(P.days)) {
    const mine = pid === S.settings.prog;
    if (mine && names.some(n => n && (n === ogRoutineName(D) || n === D.n))) return [pid, did];
    const want = new Set(D.lifts.map(l => l[0]));
    if (mine) for (const L of sessionPlan(todayKey(), did).lifts) want.add(L.id);
    const sc = ids.filter(id => want.has(id)).length + (mine ? 0.5 : 0);
    if (sc > score) { score = sc; best = [pid, did]; }
  }
  return best;
}
function ogConvert(P) {
  const days = {};
  for (const w of P.workouts) (days[w.d] ||= []).push(w);
  const lifts = {}, cardio = {}, other = new Map(), dates = Object.keys(days).sort();
  let sets = 0;
  for (const d of dates) {
    const ws = days[d].sort((a, b) => (a.t0 || 0) - (b.t0 || 0)), ex = {}, cs = [];
    for (const w of ws) for (const e of w.entries) {
      const id = ogHealthId(e.og, e.name);
      if (!id) continue;
      const cardioEx = ogx(e.og)?.kind === 'c';
      const mins = e.sets.reduce((a, s) => a + (s.min || (cardioEx && s.sec ? s.sec / 60 : 0)), 0);
      if (mins >= 1) cs.push({ t: w.t0 || Date.parse(d + 'T18:00'), kind: ogCardioKind(e.name || ogx(e.og)?.n), dur: Math.round(mins * 60), m: 1, eff: 'mod' });
      const lift = cardioEx ? [] : e.sets.filter(s => s.r || s.sec).map(s => [s.kg, s.r || s.sec]);
      if (!lift.length) continue;
      ex[id] = (ex[id] || []).concat(lift).slice(0, 12);
      if (!EXD[id]) other.set(id, exName(id));
    }
    const n = Object.keys(ex);
    if (n.length) {
      for (const id of n.slice(30)) delete ex[id];
      const [p, dayId] = ogMatchDay(ex, ws.map(w => w.name)), t0 = ws.find(w => w.t0)?.t0, t1 = ws.map(w => w.t1).filter(Boolean).pop();
      const ow = ws.filter(w => w.id && w.entries.some(e => ogHealthId(e.og, e.name) in ex)).map(w => w.id);
      lifts[d] = Object.assign({ prog: p, day: dayId, ex, src: 'og' }, t0 ? { t0 } : {}, t0 && t1 && t1 >= t0 ? { t1 } : {}, ow.length ? { ow } : {});
      sets += Object.values(ex).reduce((a, s) => a + s.length, 0);
    }
    if (cs.length) cardio[d] = cs.slice(0, 10);
  }
  const weights = {};
  for (const x of P.weighins) { const w = num(x.kg, ...LIMITS.weights); if (w != null) weights[x.d] = r1(w); }
  return { kind: P.kind, lifts, cardio, weights, sets, other: [...other.values()], first: dates[0] || null, last: dates[dates.length - 1] || null };
}
// Adds openGym's sessions without touching anything logged in Health. A day that came from openGym before is replaced
// by openGym's current version, keeping any shoulder report made for it here. One openGym no longer has was moved or
// deleted there and leaves here too: a backup says so by openGym's own workout ids (moved anywhere, or gone from the
// history it holds); a spreadsheet, which has no ids, only for the dates it covers. dry = count only.
function ogMerge(C, dry = false) {
  const got = { added: 0, updated: 0, kept: 0, removed: 0, weights: 0, cardio: 0 };
  for (const [d, L] of Object.entries(C.lifts)) {
    const cur = S.lifts[d];
    if (cur && cur.src !== 'og') { got.kept++; continue; }
    const c = cleanLift(Object.assign({}, L, cur?.sx ? { sx: cur.sx } : {}));
    if (!c || (cur && JSON.stringify(cur) === JSON.stringify(c))) continue;
    if (!dry) S.lifts[d] = c;
    if (cur) got.updated++; else got.added++;
  }
  const where = new Set(Object.values(C.lifts).flatMap(L => L.ow || []));
  if (C.first) for (const d of Object.keys(S.lifts)) {
    const L = S.lifts[d];
    if (L.src !== 'og' || C.lifts[d]) continue;
    const gone = C.kind === 'backup' && L.ow ? L.ow.some(w => where.has(w)) || d <= C.last : d >= C.first && d <= C.last;
    if (gone) { if (!dry) delete S.lifts[d]; got.removed++; }
  }
  for (const [d, w] of Object.entries(C.weights)) if (S.weights[d] == null) { if (!dry) { S.weights[d] = w; S.manual.weights[d] = 1; } got.weights++; }
  for (const [d, a] of Object.entries(C.cardio)) if (!S.cardio[d]) { const x = a.map(cleanCardio).filter(Boolean); if (x.length) { if (!dry) S.cardio[d] = x; got.cardio++; } }
  return got;
}
function ogGotLine(g) {
  const parts = [g.added && plural(g.added, 'new session'), g.updated && plural(g.updated, 'session') + ' updated', g.removed && plural(g.removed, 'session') + ' removed',
    g.weights && plural(g.weights, 'weigh-in'), g.cardio && plural(g.cardio, 'cardio day')].filter(Boolean);
  return parts.join(', ');
}

// ---------- Health's plan, as an openGym plan file ----------
const OG_MUSCLE = { chest: 'chest', frontDelts: 'deltoids', sideDelts: 'deltoids', rearDelts: 'deltoids', biceps: 'biceps', triceps: 'triceps',
  forearms: 'forearm', abs: 'abs', obliques: 'obliques', lats: 'upper-back', upperBack: 'upper-back', traps: 'trapezius', erectors: 'lower-back',
  glutes: 'gluteal', hamstrings: 'hamstring', quads: 'quadriceps', adductors: 'adductors', calves: 'calves' };
const OG_PART = { Chest: 'chest', Back: 'back', Shoulders: 'shoulders', Arms: 'upper arms', Core: 'waist', Quads: 'upper legs', 'Hamstrings & glutes': 'upper legs', Calves: 'lower legs' };
// The weekdays a programme of n sessions lands on in openGym (0 is Sunday). Health itself goes by rotation.
const OG_DAYS = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6] };
function ogRoutineName(D) { return `${D.n} (Health)`; }
function ogCustom(id) {
  const e = EXD[id], h = e.hits, m = f => [...new Set(Object.keys(h).filter(f).map(k => OG_MUSCLE[k]).filter(Boolean))];
  const prim = m(k => h[k] === 1), secd = m(k => h[k] < 1).filter(x => !prim.includes(x));
  const eq = /dumbbell/i.test(e.eq) ? 'dumbbell' : /barbell|ez bar/i.test(e.eq) ? 'barbell' : /cable/i.test(e.eq) ? 'cable' : /band/i.test(e.eq) ? 'band' : /machine/i.test(e.eq) ? 'leverage machine' : 'body weight';
  return Object.assign({ id: 'health-' + id, n: e.n, bp: OG_PART[MUS[primaryOf(id)]?.[2]] || 'full body', eq, desc: [e.why, ...(e.setup || []), ...(e.exec || [])].join(' ').slice(0, 1500) },
    prim.length ? { tg: prim[0], primaries: prim } : {}, secd.length ? { secondaries: secd } : {});
}
// One exercise of a session: Health's rep range under double progression (or a hold that adds time), the next load,
// the rest Health would give it, and the notes that make it yours.
function ogSlot(L, k, custom) {
  const id = OG_OF[L.id] || 'health-' + L.id, G = progression(L, k), hold = isHold(L.id);
  if (!OG_OF[L.id] && !custom.has(id)) custom.set(id, ogCustom(L.id));
  const o = { id, sets: L.sets };
  if (hold) Object.assign(o, { mode: 'time', sec: G.kind === 'first' ? L.lo : clamp(G.reps[0] || L.lo, L.lo, L.hi), prog: 'time' });
  else {
    Object.assign(o, { reps: L.hi, repsMin: L.lo, prog: 'double' });
    if (G.kg > 0) o.weight = G.kg;
    if (!isBw(L.id)) o.inc = stepFor(L.id);
  }
  o.restSec = restFor(L.id);
  const note = [L.note, S.profile.shoulder ? SHOULDER_CUE[L.id] : '', L.from ? `In place of ${exName(L.from)}. ${L.why}` : ''].filter(Boolean).join(' ');
  if (note) o.note = note.slice(0, 500);
  return o;
}
// k: the day the plan is for. Tomorrow by default, so today's reports count and today's one-off swaps do not.
function ogPlan(k = shift(todayKey(), 1)) {
  const P = prog(), custom = new Map(), routines = [], week = {};
  for (const did of Object.keys(P.days)) {
    const plan = sessionPlan(k, did);
    routines.push({ id: 'health-' + did, name: ogRoutineName(P.days[did]), prog: 'double', ex: plan.lifts.map(L => ogSlot(L, k, custom)) });
  }
  (OG_DAYS[P.per] || OG_DAYS[3]).forEach((wd, i) => { week[wd] = [routines[i % routines.length].id]; });
  return { opengym_plan: 1, exported: todayKey(), name: `Health · ${P.n}`, unit: 'kg', week, routines, customEx: [...custom.values()] };
}
// What the plan is, without its loads: when this changes, the copy in openGym is out of date.
function ogPlanSig(plan = ogPlan()) {
  const t = JSON.stringify([plan.name, plan.routines.map(r => r.ex.map(e => [e.id, e.sets, e.reps, e.repsMin, e.sec]))]);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
function ogSendPlan(toFolder) {
  const plan = ogPlan(), text = JSON.stringify(plan, null, 2);
  S.meta.ogplan = { sig: ogPlanSig(plan), at: todayKey() }; save();
  if (toFolder && NATIVE && OGF.folder) nat('ogWrite', OG_PLAN_NAME, text);
  else saveText(OG_PLAN_NAME, text);
  render();
}
function ogPlanStale() { return !!S.meta.ogplan && S.meta.ogplan.sig !== cached('ogsig', () => ogPlanSig()); }

// ---------- the openGym folder, inside the Android app ----------
// Pick openGym's backup folder once. Each time Health opens it looks there for a newer backup and brings it in.
const OGF = { folder: null, busy: false, msg: '', app: false };
function ogInfo() {
  if (!NATIVE || typeof NATIVE.ogStatus !== 'function') return;
  const st = parse(nat('ogStatus')) || {};
  OGF.folder = st.folder || null; OGF.app = !!st.app;
}
function ogAuto(force = false) {
  if (!NATIVE || !OGF.folder || OGF.busy) return;
  OGF.busy = true;
  nat('ogCheck', force ? '' : S.meta.og?.seen || '');
}
NEV.og = r => {
  if (r?.folder !== undefined) OGF.folder = r.folder;
  if (r?.msg) { OGF.msg = r.msg; toast(r.msg, 5000); }
  if (r?.picked) { OGF.msg = ''; OGF.first = true; OGF.busy = false; ogAuto(true); }
  if (r?.none || r?.same || r?.error) OGF.busy = false;
  if (r?.none && OGF.first) { OGF.first = false; toast('No openGym backup in that folder yet. In openGym, turn on Auto-backup on changes, then come back.', 7000); }
  if (r?.ready) {
    // The first read from a folder is shown before anything is added; after you accept it, newer backups come in by themselves.
    const text = nat('ogTake'), auto = !OGF.first && !!S.meta.og?.seen;
    OGF.busy = false; OGF.first = false;
    if (text) ogReceive(text, str(r.file, 60), `${str(r.file, 60)}|${num(r.mod, 0, 1e14) || 0}`, auto);
  }
  renderSoft();
};
// auto: merge straight away and say what came in. Otherwise show what would come in first.
function ogReceive(text, from, seen, auto) {
  const P = ogParse(text);
  if (!P || P.error) { if (!auto) { buzz('warn'); toast(P?.error || 'That is not an openGym backup or spreadsheet', 5000); } else OGF.msg = 'The newest file in the openGym folder could not be read.'; return; }
  const C = ogConvert(P);
  if (!auto) { pending = { type: 'opengym', C, from, seen }; render(); return; }
  const got = ogMerge(C);
  S.meta.og = { at: Date.now(), file: from, seen };
  save();
  const line = ogGotLine(got);
  if (line) toast(`From openGym: ${line}`, 5000);
}
function ogFile(f) {
  if (f.size > 40e6) { buzz('warn'); return toast('That file is too large to be an openGym backup'); }
  f.text().then(t => ogReceive(t, str(f.name, 60), '', false)).catch(() => { buzz('warn'); toast('That file could not be read'); });
}

// ---------- screens ----------
function vOpenGym(P) {
  const C = P.C, g = ogMerge(C, true), n = o => Object.keys(o).length;
  const others = C.other.slice(0, 8).map(esc).join(', ') + (C.other.length > 8 ? ` and ${C.other.length - 8} more` : '');
  return `<div class="scrim"></div><aside class="sheet" role="dialog" aria-label="Bring in openGym" data-key="opengym"><div class="grab"></div>
    <div class="eyebrow">From ${esc(P.from || 'openGym')}</div><h1>Bring in openGym?</h1>
    ${table([trow('Lifting sessions in the file', fmt(n(C.lifts))), trow('New here', fmt(g.added), 'strong'), g.updated ? trow('Updated from openGym', fmt(g.updated)) : '',
      g.removed ? trow('No longer in openGym, removed', fmt(g.removed)) : '', g.kept ? trow('Logged in Health that day, kept', fmt(g.kept), 'muted') : '',
      trow('Sets in the file', fmt(C.sets)), trow('Weigh-ins', fmt(g.weights)), g.cardio ? trow('Cardio days', fmt(g.cardio)) : ''])}
    ${C.other.length ? para(`Also in it, outside Health’s plan: ${others}. Their sets count toward your muscles and strength here.`) : ''}
    ${para('A day already logged in Health keeps Health’s version. A copy of everything is kept first, so this can be undone.')}
    <div class="rowb"><button class="solid" data-act="ogok" ${g.added + g.updated + g.removed + g.weights + g.cardio ? '' : 'disabled'}>Add to Health</button><button class="ghost" data-act="importno">Cancel</button></div></aside>`;
}
// Me › Data sources: openGym's workouts coming in.
function ogSourcesBlock() {
  const last = S.meta.og?.at ? `Last read ${ago(S.meta.og.at)}${S.meta.og.file ? ` from <b>${esc(S.meta.og.file)}</b>` : ''}.` : 'Nothing read yet.';
  const byHand = `<ol class="sub steps"><li>In openGym: Settings › Data &amp; backup › <b>Export backup</b>, or <b>Export as CSV</b> for the workouts.</li><li>Tap below and pick that file.</li></ol>
    <button class="ghost" data-act="ogpick">Choose an openGym file</button><input type="file" id="ogimp" accept=".json,.csv,application/json,text/csv,text/comma-separated-values" hidden>`;
  if (!NATIVE) return `${para('Workouts you log in openGym count here: every set goes into Review, the muscle map, strength and your next targets. Days logged in Health are never overwritten.')}${byHand}
    ${para('Inside the Android app this happens by itself each time you open Health.')}`;
  const link = OGF.folder
    ? `${para(`Linked to <b>${esc(OGF.folder)}</b>. ${last} Health looks for a newer backup each time you open it.`)}
      ${OGF.msg ? para(esc(OGF.msg), 'flag') : ''}
      <div class="rowb"><button class="solid" data-act="ogread" ${OGF.busy ? 'disabled' : ''}>${OGF.busy ? 'Reading…' : 'Read now'}</button><button class="ghost" data-act="oglink">Change folder</button>${OGF.app ? '<button class="ghost" data-act="ogopen">Open openGym</button>' : ''}</div>
      <p class="note"><button class="link" data-act="ogunlink">Unlink</button>: sessions already brought in stay.</p>`
    : `${para('Workouts you log in openGym come in by themselves: every set counts in Review, the muscle map, strength and your next targets. Days logged in Health are never overwritten.')}
      <ol class="sub steps"><li>In openGym: Settings › Data &amp; backup › turn on <b>Auto-backup on changes</b>.</li><li>Here: tap <b>Link openGym’s folder</b> and choose <b>Documents › openGym</b>, or the backup folder you picked in openGym.</li></ol>
      <div class="rowb"><button class="solid" data-act="oglink">Link openGym’s folder</button></div>`;
  return `${link}<details class="inner"><summary>Or bring in a file by hand</summary>${byHand}</details>`;
}
// Me › Training: Health's plan going out.
function ogPlanBlock() {
  const P = prog(), p = S.profile, retired = new Set(Object.keys(P.days).flatMap(d => sessionPlan(shift(todayKey(), 1), d).retired)).size;
  const sent = S.meta.ogplan, stale = ogPlanStale();
  const what = [esc(P.n), p.equip === 'home' ? 'dumbbells at home' : 'the gym', p.shoulder ? 'shoulder care' : '', retired ? `${plural(retired, 'exercise')} out after pain` : ''].filter(Boolean).join(', ');
  const folder = NATIVE && OGF.folder;
  return `${para(`Train in openGym with Health’s plan: its animations, rest timer and watch app, with your programme as Health has it now: ${what}. Rep ranges, the next loads, rest times and notes go with it, and openGym moves the weights up by the same double progression Health uses.`)}
    ${stale ? para(`Your plan has changed since the file made on ${dateLabel(sent.at)}. Make it again and import it in openGym, so openGym has the new one.`, 'flag') : sent ? para(`Plan file made on ${dateLabel(sent.at)}; it still matches your plan.`) : ''}
    <div class="rowb">${folder ? '<button class="solid" data-act="ogplan" data-v="folder">Put the plan in the openGym folder</button><button class="ghost" data-act="ogplan">Save it elsewhere</button>' : '<button class="solid" data-act="ogplan">Save the plan file</button>'}</div>
    <ol class="sub steps"><li>In openGym: <b>Plan</b> › share icon (top right) › <b>Import a plan file</b>.</li><li>Pick <b>${OG_PLAN_NAME}</b>${folder ? ` in ${esc(OGF.folder)}` : ''}.</li><li>Turn on <b>Use this weekly schedule</b>, then <b>Add to my plan</b>.</li>
      <li>Sending a newer version later? In openGym, delete the old routines marked “(Health)” first, so there are not two of each.</li></ol>
    ${para(NATIVE ? 'Then link openGym’s folder in Me › Data sources, and what you lift there comes back here by itself.' : 'Then bring openGym’s backup in from Me › Data sources, and what you lift there counts here too.')}`;
}
// Train: a session that came from openGym, and what it holds beyond today's plan.
function ogTrainNote(k, plan) {
  const L = S.lifts[k];
  if (L?.src !== 'og') return '';
  const extra = Object.keys(L.ex).filter(id => !plan.lifts.some(x => x.id === id)).map(exName);
  return `<p class="note">Logged in openGym${extra.length ? `, also: ${esc(extra.join(', '))}` : ''}. Changes made in openGym come through here; change a set here and the day becomes Health’s own.</p>`;
}
function ogTrainStrip() {
  if (!S.meta.og && !S.meta.ogplan) return '';
  const stale = ogPlanStale();
  return `<div class="strip ${stale ? 'lv-care' : ''}">${stale ? '<span class="dot"></span>' : ''}<span class="grow"><b>${stale ? 'Your plan changed: send it to openGym again' : 'Training in openGym?'}</b><span class="sub">${stale ? 'Me › Training › Train in openGym.' : NATIVE && OGF.folder ? 'Sessions come in by themselves when you open Health.' : 'Bring its backup in from Me › Data sources.'}</span></span>
    ${stale ? '<a class="mini" href="#set-train">Send</a>' : NATIVE && OGF.app ? '<button class="mini" data-act="ogopen">Open openGym</button>' : ''}</div>`;
}
function ogAct(a, el) {
  switch (a) {
    case 'ogpick': $('#ogimp').click(); return true;
    case 'oglink': nat('ogPick'); return true;
    case 'ogunlink': nat('ogUnlink'); OGF.folder = null; OGF.msg = ''; buzz('tick'); render(); return true;
    case 'ogread': buzz('tick'); ogAuto(true); renderSoft(); return true;
    case 'ogopen': nat('openOpenGym'); return true;
    case 'ogplan': buzz('ok'); ogSendPlan(el.dataset.v === 'folder'); return true;
    case 'ogok': {
      snapshot('Before bringing in openGym');
      const got = ogMerge(pending.C);
      S.meta.og = Object.assign({}, S.meta.og, { at: Date.now(), file: pending.from }, pending.seen ? { seen: pending.seen } : {});
      pending = null; save(); buzz('done'); render();
      toast(`From openGym: ${ogGotLine(got) || 'nothing new'}`, 6000, { label: 'Undo', fn: () => { restoreSnapshot(); render(); toast('openGym import undone'); } });
      return true;
    }
  }
  return false;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('opengym.js');

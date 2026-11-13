// Engine tests: node test/run.js. Loads the app's own files into a sandbox (no browser needed) and checks
// storage, migration, the trend, targets, progression, shoulder care, cutting old data, snapshots, Halftone and openGym.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const { seedV3 } = require('./seed.js');
const root = path.join(__dirname, '..');

function sandbox() {
  const store = new Map();
  const ctx = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Blob, Intl, setTimeout, clearTimeout,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    toast: () => {}, document: { querySelector: () => null, querySelectorAll: () => [] },
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['lib.js', 'data.js', 'exercises.js', 'opengym-ids.js', 'body-data.js', 'store.js', 'model.js', 'train.js'])
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  // What native.js would define outside the app, then the openGym link, which uses it.
  ctx.window = ctx; ctx.location = { origin: 'https://x', pathname: '/' };
  vm.runInContext(fs.readFileSync(path.join(root, 'native.js'), 'utf8'), ctx, { filename: 'native.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'opengym.js'), 'utf8'), ctx, { filename: 'opengym.js' });
  // The globals app.js would normally define.
  vm.runInContext("var S = sanitize({}); var day = todayKey(); var trainDay = null;", ctx);
  return ctx;
}
// Results are copied out of the sandbox, so arrays compare equal to plain ones.
const run = (ctx, code) => { const v = vm.runInContext(code, ctx); return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; };
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(sandbox()); passed++; console.log('  ok  ', name); }
  catch (e) { failed++; console.log('  FAIL', name, '\n       ', e.message); }
}

test('old lifts stored by name migrate to library ids, with nothing lost', c => {
  c.raw = seedV3();
  run(c, 'S = sanitize(raw)');
  const lifts = run(c, 'S.lifts'), rawLifts = c.raw.lifts;
  assert.strictEqual(Object.keys(lifts).length, Object.keys(rawLifts).length);
  for (const [k, L] of Object.entries(lifts)) {
    assert.strictEqual(L.prog, 'hfb');
    for (const id of Object.keys(L.ex)) assert.ok(run(c, `!!EXD[${JSON.stringify(id)}]`), `unknown id ${id}`);
    const sets = a => Object.values(a).reduce((n, s) => n + s.length, 0);
    assert.strictEqual(sets(L.ex), sets(rawLifts[k].ex), k);
  }
  assert.strictEqual(run(c, 'S.v'), 4);
});
test('a name the library does not know is kept, not dropped', c => {
  c.raw = { lifts: { '2026-01-05': { day: 'A', ex: { 'Bulgarian thing': [[20, 10]] } } } };
  run(c, 'S = sanitize(raw)');
  assert.deepStrictEqual(Object.keys(run(c, "S.lifts['2026-01-05'].ex")), ['x:Bulgarian thing']);
});
test('sanitize is idempotent and rejects hostile keys', c => {
  c.raw = seedV3(); c.raw.lifts['2026-01-01'] = { day: 'A', ex: { __proto__: [[1, 1]], constructor: [[1, 1]] } };
  c.raw.food['<img>'] = [{ id: 'x', n: 'y', k: 1, q: 1 }];
  const a = run(c, 'JSON.stringify(sanitize(raw))'), b = run(c, 'JSON.stringify(sanitize(JSON.parse(JSON.stringify(sanitize(raw)))))');
  assert.strictEqual(a, b);
  assert.ok(!a.includes('<img>'));
});
test('Theil–Sen ignores one wild weigh-in that least squares does not', c => {
  const pts = Array.from({ length: 12 }, (_, i) => [i, 90 - 0.1 * i]);
  pts[11][1] += 4;   // a festival dinner and no toilet
  const ts = run(c, `theilSen(${JSON.stringify(pts)}).m`), ls = run(c, `linfit(${JSON.stringify(pts)}).m`);
  assert.ok(Math.abs(ts + 0.1) < 0.005, `Theil–Sen ${ts}`);
  assert.ok(ls > -0.02, `least squares should be thrown off (${ls})`);
});
test('targets hold for the week, move at most 150 kcal, and recalc at once on a goal change', c => {
  c.raw = seedV3(); run(c, 'S = sanitize(raw); settleTargets()');
  const k0 = run(c, 'S.meta.tgt.k');
  run(c, "for (const k of range(7)) S.steps[k] = 16000; save();");
  assert.strictEqual(run(c, 'targets().kcal'), k0, 'same week: held');
  run(c, "S.meta.tgt.at = shift(weekStart(), -7); settleTargets()");
  const k1 = run(c, 'S.meta.tgt.k');
  assert.ok(k1 > k0 && k1 - k0 <= 150, `capped move ${k0} -> ${k1}`);
  run(c, "S.settings.pace = 'maintain'; settleTargets()");
  assert.ok(run(c, 'S.meta.tgt.k') - k1 > 150, 'a changed goal is not capped');
});
test('double progression: raise, reps, hold, deload', c => {
  const L = { id: 'leg-press', sets: 3, lo: 8, hi: 12 };
  c.L = L;
  const at = sets => { run(c, `S.lifts = {}; ${sets.map((s, i) => `S.lifts[shift(todayKey(), -${(i + 1) * 2})] = { prog: 'hfb', day: 'A', ex: { 'leg-press': ${JSON.stringify(s)} } };`).join('')} memo.clear();`); return run(c, 'progression(L)'); };
  let g = at([[[100, 12], [100, 12], [100, 12]]]);
  assert.strictEqual(g.kind, 'raise'); assert.strictEqual(g.kg, 102.5); assert.deepStrictEqual(g.reps, [8, 8, 8]);
  g = at([[[100, 10], [100, 9], [100, 9]]]);
  assert.strictEqual(g.kind, 'reps'); assert.strictEqual(g.kg, 100); assert.deepStrictEqual(g.reps, [11, 10, 10]);
  g = at([[[100, 9], [100, 7], [100, 6]]]);
  assert.strictEqual(g.kind, 'hold');
  g = at([[[100, 7], [100, 7], [100, 6]], [[100, 7], [100, 6], [100, 6]], [[100, 8], [100, 7], [100, 7]]]);
  assert.strictEqual(g.kind, 'deload'); assert.strictEqual(g.kg, 90);
  g = run(c, "progression({ id: 'incline-db-press', sets: 3, lo: 8, hi: 12 })");
  assert.strictEqual(g.kind, 'first');
});
test('dumbbell steps follow the setting', c => {
  run(c, "S.settings.dbStep = 2; S.lifts[shift(todayKey(), -2)] = { prog: 'hfb', day: 'B', ex: { 'incline-db-press': [[20, 12], [20, 12], [20, 12]] } }; memo.clear()");
  assert.strictEqual(run(c, "progression({ id: 'incline-db-press', sets: 3, lo: 8, hi: 12 }).kg"), 22);
});
test('shoulder care: overhead press swapped, pain swaps next time, pain twice retires, bring back restores', c => {
  run(c, "S.profile.shoulder = true; S.settings.prog = 'fb3';");
  // fb3 has no overhead press; check the SHOULDER_SUB rule through a swap of the programme day contents instead.
  run(c, "PROGRAMS.fb3.days.A.lifts.push(['db-shoulder-press', 2, 8, 12]); memo.clear()");
  const ids = () => run(c, "memo.clear(), sessionPlan(todayKey(), 'A').lifts.map(l => l.id)");
  assert.ok(!ids().includes('db-shoulder-press'), 'overhead press must be swapped out');
  run(c, "S.lifts[shift(todayKey(), -4)] = { prog: 'fb3', day: 'A', ex: { 'incline-db-press': [[20, 10]] }, sx: { 'incline-db-press': 'pain' } }");
  assert.ok(!ids().includes('incline-db-press'), 'pain last time: swapped today');
  run(c, "S.lifts[shift(todayKey(), -2)] = { prog: 'fb3', day: 'A', ex: { 'incline-db-press': [[20, 10]] }, sx: { 'incline-db-press': 'pain' } }");
  assert.ok(run(c, "memo.clear(), sessionPlan(todayKey(), 'A').retired").includes('incline-db-press'), 'pain twice: retired');
  run(c, "S.cleared['incline-db-press'] = shift(todayKey(), -1)");
  assert.ok(ids().includes('incline-db-press'), 'brought back');
});
test('dumbbells at home: every exercise in every programme is home kit', c => {
  run(c, "S.profile.equip = 'home'; S.profile.shoulder = true");
  for (const p of Object.keys(run(c, 'PROGRAMS'))) {
    run(c, `S.settings.prog = '${p}'`);
    for (const d of Object.keys(run(c, `PROGRAMS['${p}'].days`))) {
      const bad = run(c, `memo.clear(), sessionPlan(todayKey(), '${d}').lifts.filter(l => !freeKit(l.id)).map(l => l.id)`);
      assert.deepStrictEqual(bad, [], `${p}/${d}`);
    }
  }
});
test('weekly volume counts direct sets fully and secondary ones by half', c => {
  run(c, "S.lifts[todayKey()] = { prog: 'hfb', day: 'C', ex: { 'chest-supported-row': [[40, 10], [40, 10], [40, null]] } }; memo.clear()");
  const v = run(c, 'volume()');
  assert.strictEqual(v.upperBack, 2); assert.strictEqual(v.lats, 2); assert.strictEqual(v.biceps, 1);
});
// ---- beat-to-beat analysis ----
function noise(n, f) { let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, g = () => { let s = 0; for (let i = 0; i < 12; i++) s += rnd(); return s - 6; }; return Array.from({ length: n }, (_, i) => f(g, i)); }
test('DFA α1: about 0.5 for uncorrelated beats, about 1.5 for a random walk', c => {
  c.white = noise(240, g => 600 + 40 * g());
  let w = 0; c.walk = noise(240, g => (w += 10 * g(), 800 + w));
  const a = run(c, 'dfaA1(white)'), b = run(c, 'dfaA1(walk)');
  assert.ok(a > 0.35 && a < 0.7, `white ${a}`); assert.ok(b > 1.3 && b < 1.7, `walk ${b}`);
  assert.strictEqual(run(c, 'dfaA1(white.slice(0, 30))'), null, 'too few beats');
});
test('RR artefacts are corrected and counted; the threshold needs a real crossing', c => {
  c.rr = noise(200, g => 700 + 20 * g()); c.rr[40] = 1400; c.rr[90] = 350;
  const C = run(c, 'cleanRR(rr)');
  assert.ok(Math.abs(C.bad - 0.01) < 0.006, `bad ${C.bad}`); assert.ok(Math.abs(C.rr[40] - 700) < 60);
  c.win = noise(11, (g, i) => [i * 30, 1.25 - 0.01 * (110 + 5 * i - 100) + 0.02 * g(), 110 + 5 * i]);
  assert.ok(Math.abs(run(c, 'hrvThreshold(win).hr') - 150) <= 3);
  c.flat = noise(11, (g, i) => [i * 30, 0.95 + 0.02 * g(), 110 + 5 * i]);
  assert.strictEqual(run(c, 'hrvThreshold(flat)'), null, 'never crossed 0.75');
});
test('a strap session keeps its trace, α1 windows and threshold; a morning check keeps its beats', c => {
  c.cx = { t: Date.now(), kind: 'run', dur: 1800, avg: 140, max: 171, z: [10, 600, 900, 290], tr: [120, 0, 999, 131], a1: [[150, 1.02, 121], ['x'], [180, 0.7, 150]], vt1: 148 };
  const r = run(c, 'cleanCardio(cx)');
  assert.deepStrictEqual(r.tr, [120, 0, 0, 131]); assert.deepStrictEqual(r.a1, [[150, 1.02, 121], [180, 0.7, 150]]); assert.strictEqual(r.vt1, 148);
  c.hv = { rmssd: 52.1, hr: 58, q: 96, sd: 61, rr: [1000, 1010, 990, 5000].concat(Array(30).fill(1005)) };
  const h = run(c, 'cleanHrv(hv)');
  assert.strictEqual(h.rr.length, 33, 'an impossible beat is dropped'); assert.strictEqual(h.sd, 61);
});

// ---- Health Connect ----
test('a failed workout read never wipes the watch workouts already here', c => {
  const k = run(c, 'todayKey()'), s = Date.now() - 36e5;
  run(c, `S.ex['${k}'] = [cleanEx({ s: ${s}, e: ${s + 18e5}, k: 'Walk', src: 'Zepp', h: [] })]`);
  run(c, `mergeSync({ days: {}, ex: null, from: shift(todayKey(), -3) })`);
  assert.strictEqual(run(c, `S.ex['${k}'].length`), 1);
  run(c, `mergeSync({ days: {}, ex: [], from: shift(todayKey(), -3) })`);
  assert.strictEqual(run(c, `S.ex['${k}']`), undefined, 'an empty successful read does replace the range');
});
test('an openGym workout from Health Connect counts as a lifting day, with its routine name', c => {
  const k = run(c, 'shift(todayKey(), -1)'), s = Date.parse(k + 'T18:00');
  run(c, `S.ex['${k}'] = [cleanEx({ s: ${s}, e: ${s + 3e6}, k: 'Strength training', src: 'openGym', og: true, ti: 'Day B (Health)', h: [[120, 1800], [135, 1200]] })]; memo.clear()`);
  assert.ok(run(c, `liftedOn('${k}')`));
  assert.strictEqual(run(c, `sessions('${k}')[0].kind`), 'Day B (Health)');
  assert.ok(run(c, `liftHr('${k}').avg`) > 120);
});

// ---- recovery ----
test('the watch’s overnight HRV can only nudge the day, and only without a strap verdict', c => {
  for (let i = 1; i <= 30; i++) run(c, `S.wx[shift(todayKey(), -${i})] = { hv: ${i <= 6 ? 30 : 50 + (i % 3)}, br: 14 + ${(i % 2) * 0.2} }`);
  run(c, 'S.wx[todayKey()] = { hv: 30, br: 16.5 }; S.sleep[todayKey()] = 7.5; memo.clear()');
  const R = run(c, 'readiness()');
  assert.strictEqual(R.WH.state, 'low');
  assert.ok(R.why.some(w => w[2] === 'night' && /overnight HRV/.test(w[1])));
  assert.ok(R.why.some(w => /Breathing rate/.test(w[1])), 'breathing 2.4 above usual is flagged');
  assert.strictEqual(R.level, 'care', 'the watch can only ever nudge: never "keep it easy" on its own');
  run(c, 'S.wx[todayKey()].br = 14.2; memo.clear()');
  assert.ok(!run(c, 'readiness()').why.some(w => /Breathing/.test(w[1])), 'a usual night is not flagged');
});
test('HRV read with morning heart rate', c => {
  for (let i = 0; i < 35; i++) run(c, `S.hrv[shift(todayKey(), -${i})] = { rmssd: ${i < 5 ? 30 : 60 + (i % 4)}, hr: ${i < 5 ? 62 : 55} }`);
  run(c, 'memo.clear()');
  const R = run(c, 'readiness()');
  assert.strictEqual(R.V.state, 'low'); assert.ok(R.V.hrDelta > 3);
  assert.ok(/usual pattern/.test(R.why[0][1]));
});

// ---- the burn estimate ----
test('training energy follows the sessions actually done once there is a month of them', c => {
  run(c, "S.profile.days = 3; memo.clear()");
  const f0 = run(c, 'liveTargets().formula');
  run(c, "for (let i = 1; i <= 40; i += 7) S.lifts[shift(todayKey(), -i)] = { prog: 'hfb', day: 'A', ex: { 'leg-press': [[100, 10]] } }; memo.clear()");
  const T = run(c, 'liveTargets()');
  assert.strictEqual(T.perWk, 1, 'one a week in the last four');
  assert.ok(Math.round(f0 - T.formula) === Math.round(2 * 250 / 7), `${f0} → ${T.formula}`);
});

// ---- reminders ----
test('reminders skip what is already done today', c => {
  run(c, "S.settings.remAm = '23:59'; S.settings.remPm = '23:58'; S.meta.h9 = { id: 'x', name: 'H9' }");
  const tk = run(c, 'todayKey()');
  let it = run(c, 'remindItems()').filter(x => x.id.endsWith(tk));
  assert.deepStrictEqual(it.map(x => x.title).sort(), ['Food log', 'Morning check']);
  run(c, "S.hrv[todayKey()] = { rmssd: 50, hr: 55 }; S.weights[todayKey()] = 90");
  it = run(c, 'remindItems()').filter(x => x.id.endsWith(tk));
  assert.deepStrictEqual(it.map(x => x.title), ['Food log']);
  assert.ok(run(c, 'remindItems()').length > 6, 'the week ahead is scheduled');
});
test('cutting old data removes only what is older, in the groups chosen, and a snapshot undoes it', c => {
  c.raw = seedV3(); run(c, 'S = sanitize(raw); save()');
  const cut = run(c, 'shift(todayKey(), -20)');
  const dry = run(c, `prune('${cut}', ['food', 'activity'], true)`);
  const foodOld = run(c, `Object.keys(S.food).filter(k => k < '${cut}').length`), liftsBefore = run(c, 'Object.keys(S.lifts).length');
  assert.strictEqual(dry.n.food, foodOld);
  run(c, `snapshot('test'); prune('${cut}', ['food', 'activity'])`);
  assert.strictEqual(run(c, `Object.keys(S.food).filter(k => k < '${cut}').length`), 0);
  assert.strictEqual(run(c, `Object.keys(S.steps).filter(k => k < '${cut}').length`), 0);
  assert.strictEqual(run(c, 'Object.keys(S.lifts).length'), liftsBefore, 'training untouched');
  assert.ok(run(c, `Object.keys(S.food).length`) > 0, 'recent food kept');
  assert.ok(run(c, 'restoreSnapshot()'));
  assert.strictEqual(run(c, `Object.keys(S.food).filter(k => k < '${cut}').length`), foodOld);
});
test('a damaged main copy falls back to the backup instead of an empty app', c => {
  c.raw = seedV3(); run(c, "S = sanitize(raw); save(); localStorage.setItem(KEY + '.bak', localStorage.getItem(KEY)); localStorage.setItem(KEY, '{broken');");
  run(c, 'S = load()');
  assert.ok(run(c, 'Object.keys(S.lifts).length') > 0);
  assert.ok(run(c, 'loadNote').includes('backup'));
  assert.ok(run(c, "localStorage.getItem(KEY + '.corrupt')").startsWith('{broken'));
});
test('Halftone: real sessions come in, demonstration ones do not, Health days win', c => {
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return run(c, `dk(new Date(${x.getTime()}))`); };
  const seedW = run(c, "HT_SEED.r");
  const demo = id => ({ w: seedW[id], sets: [{ r: 12, done: true }, { r: 12, done: true }, { r: 11, done: true }] });
  const log = {};
  log[d(40)] = { 'hack-squat': demo('hack-squat'), rdl: demo('rdl') };                       // the seed
  log[d(30)] = { 'hack-squat': { w: 95, sets: [{ r: 10, done: true }, { r: 9, done: true }, { r: 8, done: true }] } };
  log[d(20)] = { 'incline-db-press': { w: 24, sets: [{ r: 9, done: true }, { r: 8, done: false }] } };
  log[d(2)] = { rdl: { w: 80, sets: [{ r: 10, done: true }] } };
  c.ht = { app: 'halftone', v: 1, db: { users: { r: { name: 'R', log, hc: { [d(30)]: { wt: 92.3 } }, cardio: { [d(29)]: { id: 'bike', min: 25, at: Date.now() - 29 * 864e5 } } } } } };
  run(c, `S.lifts['${d(2)}'] = { prog: 'hfb', day: 'A', ex: { 'leg-press': [[100, 10]] } }`);
  const pr = run(c, 'halftoneProfiles(ht)');
  assert.strictEqual(pr.length, 1);
  assert.strictEqual(pr[0].conv.seeded, 1);
  assert.strictEqual(pr[0].conv.days, 3);
  c.conv = pr[0].conv;
  const got = run(c, 'halftoneMerge(conv)');
  assert.strictEqual(got.days, 2, 'the day already in Health is kept');
  assert.ok(run(c, `!!S.lifts['${d(2)}'].ex['leg-press'] && !S.lifts['${d(2)}'].ex.rdl`));
  assert.deepStrictEqual(run(c, `S.lifts['${d(20)}'].ex['incline-db-press']`), [[24, 9]], 'only completed sets');
  assert.strictEqual(run(c, `S.weights['${d(30)}']`), 92.3);
  assert.strictEqual(run(c, `S.cardio['${d(29)}'][0].kind`), 'cycle');
});
test('manual cardio counts by effort toward WHO minutes', c => {
  run(c, "S.cardio[todayKey()] = [cleanCardio({ t: Date.now(), kind: 'walk', dur: 1800, m: 1, eff: 'vig' })]; memo.clear()");
  assert.strictEqual(Math.round(run(c, 'activityWeek().who')), 60);
});
test('every food has a unique id, a known category, and calories that match its protein, carbs and fat', c => {
  const F = run(c, 'FOODS'), cats = new Set(run(c, 'CATS').map(x => x[0])), ids = new Set();
  for (const f of F) {
    assert.ok(!ids.has(f[0]), `duplicate ${f[0]}`); ids.add(f[0]);
    assert.ok(cats.has(f[8]), `${f[0]}: category ${f[8]}`);
    const e = 4 * f[4] + 4 * f[5] + 9 * f[6];
    if (f[3] > 20) assert.ok(Math.abs(e - f[3]) / f[3] <= 0.15, `${f[0]}: ${f[3]} kcal vs ${e} from macros`);
  }
  for (const [name, parts] of run(c, 'THALI')) for (const [id] of parts) assert.ok(ids.has(id), `${name}: ${id}`);
  for (const id of [...Object.values(run(c, 'USUAL')).flat(), ...run(c, 'GAP')]) assert.ok(ids.has(id), id);
});
test('every programme exercise exists and every rep range is sane', c => {
  for (const [p, P] of Object.entries(run(c, 'PROGRAMS'))) for (const [d, D] of Object.entries(P.days)) for (const l of D.lifts) {
    assert.ok(run(c, `!!EXD['${l[0]}']`), `${p}/${d}/${l[0]}`);
    assert.ok(l[1] >= 1 && l[1] <= 6 && l[2] < l[3], `${p}/${d}/${l[0]} range`);
  }
});

// ---- openGym ----
// An openGym backup in openGym's own shape (its state as auto-backup writes it): workouts of entries of sets.
function ogState(c, opts = {}) {
  const d = n => run(c, `shift(todayKey(), -${n})`), at = (n, h) => Date.parse(d(n) + `T${String(h).padStart(2, '0')}:00`);
  const sets = (w, reps, extra = {}) => reps.map(r => Object.assign({ w, r, done: true }, extra));
  return { d, state: {
    unit: opts.unit, routines: [], week: {},
    customEx: [{ id: 'c_mine', n: 'Sled push', bp: 'upper legs', custom: true }],
    workouts: [
      { id: 'w1', d: d(6), start: at(6, 18), end: at(6, 19), name: 'Day A (Health)', entries: [
        { id: '0739', sets: [{ w: 60, r: 10, done: true, warmup: true }, ...sets(120, [12, 11, 10]), { w: 120, r: 9, done: false }] },
        { id: '0352', sets: sets(22, [10, 10, 9]) },
        { id: '0463', sets: [{ w: 0, sec: 45, done: true }, { w: 0, sec: 40, done: true }] },
      ] },
      { id: 'w2', d: d(4), start: at(4, 7), end: at(4, 8), name: 'Push', entries: [
        { id: '0025', sets: sets(60, [8, 8, 7]) },
        { id: '2960', sets: [{ sides: { L: { w: 14, r: 10, done: true }, R: { w: 14, r: 9, done: true } }, w: 14, r: 19, done: true }] },
        { id: 'c_mine', sets: sets(40, [20]) },
      ] },
      { id: 'w3', d: d(4), start: at(4, 19), end: at(4, 20), name: 'Cardio', entries: [{ id: '2138', sets: [{ min: 25, speed: 20, done: true }] }] },
    ],
    bodyweight: [
      { d: d(6), w: 92.4, t: at(6, 7) },
      { d: d(4), ins: [{ id: 'a', at: '07:10', w: 92.1, src: 'health' }] },
      { d: d(2), ins: [{ id: 'b', at: '21:00', w: 92.6 }, { id: 'c', at: '07:00', w: 91.9 }] },
    ],
  } };
}
test('openGym: a backup comes in with Health’s own exercises, only completed work sets, holds, per-side sets and cardio', c => {
  const { d, state } = ogState(c);
  c.og = JSON.stringify(state);
  run(c, 'C = ogConvert(ogParse(og))');
  const L6 = run(c, `C.lifts['${d(6)}']`), L4 = run(c, `C.lifts['${d(4)}']`);
  assert.deepStrictEqual(L6.ex['leg-press'], [[120, 12], [120, 11], [120, 10]], 'no warm-up, no unticked set');
  assert.deepStrictEqual(L6.ex['db-bench'], [[22, 10], [22, 10], [22, 9]]);
  assert.deepStrictEqual(L6.ex.plank, [[0, 45], [0, 40]], 'a hold is logged in seconds');
  assert.deepStrictEqual([L6.prog, L6.day], ['hfb', 'A'], 'the routine Health sent is recognised by its name');
  assert.deepStrictEqual(L4.ex['og:0025'], [[60, 8], [60, 8], [60, 7]], 'an exercise from openGym’s library keeps its number');
  assert.deepStrictEqual(L4.ex['split-squat'], [[14, 10]], 'a per-side set counts one side');
  assert.deepStrictEqual(L4.ex['x:Sled push'], [[40, 20]], 'your own openGym exercise keeps its name');
  assert.ok(!L4.ex['og:2138'], 'cardio is not a lift');
  assert.strictEqual(run(c, `C.cardio['${d(4)}'][0].dur`), 1500);
  assert.strictEqual(run(c, `C.weights['${d(6)}']`), 92.4);
  assert.strictEqual(run(c, `C.weights['${d(4)}']`), undefined, 'a weigh-in openGym read from Health Connect is left to Health’s own sync');
  assert.strictEqual(run(c, `C.weights['${d(2)}']`), 91.9, 'the morning reading of the day');
  assert.strictEqual(run(c, "exName('og:0025')"), 'Barbell bench press');
});
test('openGym: weights in pounds arrive in kilograms', c => {
  const { d, state } = ogState(c, { unit: 'lb' });
  c.og = JSON.stringify(state);
  run(c, 'C = ogConvert(ogParse(og))');
  assert.strictEqual(run(c, `C.lifts['${d(6)}'].ex['leg-press'][0][0]`), 54.43);
  assert.strictEqual(run(c, `C.weights['${d(6)}']`), 41.9);
});
test('openGym: Health’s own days are never overwritten; openGym’s are updated, moved and kept with their shoulder reports', c => {
  const { d, state } = ogState(c);
  run(c, `S.lifts['${d(4)}'] = { prog: 'hfb', day: 'B', ex: { 'hip-thrust': [[80, 10]] } }; S.weights['${d(6)}'] = 93`);
  c.og = JSON.stringify(state);
  let got = run(c, 'ogMerge(ogConvert(ogParse(og)))');
  assert.deepStrictEqual([got.added, got.kept, got.updated], [1, 1, 0]);
  assert.deepStrictEqual(Object.keys(run(c, `S.lifts['${d(4)}'].ex`)), ['hip-thrust'], 'the day logged in Health is kept');
  assert.strictEqual(run(c, `S.weights['${d(6)}']`), 93, 'a weigh-in already here is kept');
  assert.strictEqual(run(c, `S.lifts['${d(6)}'].src`), 'og');
  // Reading the same file again changes nothing.
  got = run(c, 'ogMerge(ogConvert(ogParse(og)))');
  assert.deepStrictEqual([got.added, got.updated, got.removed, got.weights], [0, 0, 0, 0]);
  // A shoulder report made in Health on openGym's day survives openGym editing that day.
  run(c, `S.lifts['${d(6)}'].sx = { 'db-bench': 'niggle' }`);
  state.workouts[0].entries[1].sets[2].r = 10;
  c.og = JSON.stringify(state);
  got = run(c, 'ogMerge(ogConvert(ogParse(og)))');
  assert.strictEqual(got.updated, 1);
  assert.deepStrictEqual(run(c, `S.lifts['${d(6)}'].ex['db-bench'][2]`), [22, 10]);
  assert.strictEqual(run(c, `S.lifts['${d(6)}'].sx['db-bench']`), 'niggle');
  // Moved to another day in openGym, even to before anything else in the file: it leaves its old day here.
  state.workouts[0].d = d(8); state.workouts[0].start -= 2 * 864e5; state.workouts[0].end -= 2 * 864e5;
  c.og = JSON.stringify(state);
  got = run(c, 'ogMerge(ogConvert(ogParse(og)))');
  assert.deepStrictEqual([got.added, got.removed], [1, 1]);
  assert.ok(run(c, `!S.lifts['${d(6)}'] && S.lifts['${d(8)}'].src === 'og'`));
  // Deleted in openGym: gone here too. A day newer than anything in an older backup is left alone.
  run(c, `S.lifts['${d(1)}'] = cleanLift({ prog: 'hfb', day: 'B', ex: { 'leg-press': [[100, 10]] }, src: 'og', ow: ['w9'] })`);
  state.workouts.shift();
  c.og = JSON.stringify(state);
  got = run(c, 'ogMerge(ogConvert(ogParse(og)))');
  assert.deepStrictEqual([got.added, got.removed], [0, 1]);
  assert.ok(run(c, `!S.lifts['${d(8)}'] && !!S.lifts['${d(1)}']`));
  // Survives a save and reload.
  run(c, 'S = sanitize(JSON.parse(JSON.stringify(S)))');
  assert.deepStrictEqual(run(c, `S.lifts['${d(1)}'].ow`), ['w9']);
  assert.deepStrictEqual(run(c, `S.lifts['${d(4)}'].ex['hip-thrust']`), [[80, 10]]);
});
test('openGym: its sets count toward the muscle map, Health’s exercises and openGym’s alike', c => {
  const { state } = ogState(c);
  c.og = JSON.stringify(state);
  run(c, 'ogMerge(ogConvert(ogParse(og))); memo.clear()');
  const v = run(c, 'volume()');
  // Leg press: 3 sets, quads full. openGym's barbell bench (0025): 3 sets of chest. Split squat: 1 set of quads.
  assert.strictEqual(v.quads, 4); assert.strictEqual(v.chest, 3 + 3); assert.strictEqual(v.triceps, 1.5 + 1.5);
});
test('openGym: its spreadsheet export reads the same as its backup', c => {
  const { d } = ogState(c);
  const head = 'date,start_time,end_time,workout,workout_note,exercise,exercise_id,body_part,superset_id,set,set_type,side,weight,unit,reps,rpe,rir,distance_km,seconds,incline,note,set_note';
  const t = `${d(3)} 18:00`, row = (...a) => [d(3), t, '', 'Day A (Health)', '"felt good, strong"', ...a].join(',');
  c.csv = '﻿' + [head,
    row('Sled 45° Leg Press', '0739', 'upper legs', '', 1, 'warmup', '', 60, 'kg', 10, '', '', '', '', '', '', ''),
    row('Sled 45° Leg Press', '0739', 'upper legs', '', 2, 'normal', '', 120, 'kg', 12, '', '', '', '', '', '', ''),
    row('Sled 45° Leg Press', '0739', 'upper legs', '', 2, 'drop', '', 90, 'kg', 8, '', '', '', '', '', '', ''),
    row('"Split squat, ""deep"""', '2960', 'upper legs', '', 1, 'normal', 'L', 14, 'kg', 10, '', '', '', '', '', '', ''),
    row('"Split squat, ""deep"""', '2960', 'upper legs', '', 1, 'normal', 'R', 16, 'kg', 9, '', '', '', '', '', '', ''),
    row('Front Plank', '0463', 'waist', '', 1, 'normal', '', 0, 'kg', '', '', '', '', 50, '', '', ''),
    row('Treadmill', 'c_tm', 'cardio', '', 1, 'normal', '', '', 'kg', '', '', '', 3.2, 1800, 1, '', ''),
  ].join('\r\n') + '\r\n';
  run(c, 'C = ogConvert(ogParse(csv))');
  const L = run(c, `C.lifts['${d(3)}']`);
  assert.deepStrictEqual(L.ex['leg-press'], [[120, 12]], 'warm-ups and drops left out');
  assert.deepStrictEqual(L.ex['split-squat'], [[16, 10]], 'left and right are one set');
  assert.deepStrictEqual(L.ex.plank, [[0, 50]]);
  assert.strictEqual(L.day, 'A');
  assert.strictEqual(run(c, `C.cardio['${d(3)}'][0].dur`), 1800);
  assert.strictEqual(run(c, `C.cardio['${d(3)}'][0].kind`), 'walk');
});
test('openGym: other files are told apart', c => {
  c.hb = JSON.stringify(run(c, 'S'));
  assert.strictEqual(run(c, 'ogParse(hb)'), null, 'a Health backup');
  assert.strictEqual(run(c, `ogParse('{"app":"halftone","db":{"users":{}}}')`), null, 'a Halftone backup');
  assert.ok(run(c, `ogParse('{"opengym_plan":1,"routines":[]}').error`).includes('plan file'), 'an openGym plan file says what it is');
  assert.strictEqual(run(c, "ogParse('date,steps\\n2026-01-01,5000')"), null, 'a Zepp spreadsheet');
});
test('openGym plan file: Health’s plan as it stands for you, in openGym’s format', c => {
  run(c, "S.profile.shoulder = true; S.profile.equip = 'gym'; S.settings.prog = 'ppl6'; memo.clear()");
  const P = run(c, 'ogPlan()');
  assert.strictEqual(P.opengym_plan, 1); assert.strictEqual(P.unit, 'kg');
  assert.strictEqual(P.routines.length, 6);
  assert.deepStrictEqual(Object.keys(P.week).map(Number).sort(), [1, 2, 3, 4, 5, 6], 'six weekdays');
  assert.ok(P.routines.every(r => r.name.endsWith('(Health)')));
  const all = P.routines.flatMap(r => r.ex), custom = new Set(P.customEx.map(x => x.id));
  for (const e of all) {
    assert.ok(/^\d{4,5}$/.test(e.id) || custom.has(e.id), `exercise ${e.id} must be openGym’s or travel with the file`);
    assert.ok(e.sets >= 1 && e.restSec > 0);
    if (e.mode === 'time') assert.ok(e.sec > 0 && e.prog === 'time');
    else assert.ok(e.prog === 'double' && e.repsMin < e.reps, 'a rep range under double progression');
  }
  assert.ok(!all.some(e => e.id === run(c, "OG_OF['cable-fly']")), 'shoulder care: no flyes');
  assert.ok(all.some(e => e.note && e.note.includes('shoulder height')), 'the shoulder cue travels as a note');
  // Every Health exercise has an openGym number, except the floor press, which travels as your own exercise.
  assert.deepStrictEqual(run(c, 'Object.keys(EXD).filter(id => !OG_OF[id])'), ['db-floor-press']);
  // At home the machine chest press becomes the floor press (the full-body plan keeps its dumbbell bench).
  run(c, "S.profile.equip = 'home'; S.settings.prog = 'fb3'; memo.clear()");
  const H = run(c, 'ogPlan()');
  assert.deepStrictEqual(H.customEx.map(x => x.id), ['health-db-floor-press'], 'home kit brings the floor press along');
  assert.ok(H.routines[1].ex.some(e => e.id === 'health-db-floor-press' && e.note.includes('Machine chest press')), 'and says what it replaces');
  const fp = H.customEx[0];
  assert.ok(fp.n && fp.bp === 'chest' && fp.eq === 'dumbbell' && fp.primaries.includes('chest'));
});
test('openGym plan file: backups from the catalogue, a warm-up ramp, and the rotation block', c => {
  run(c, "S.profile.shoulder = true; S.profile.equip = 'gym'; S.settings.prog = 'hfb'; memo.clear()");
  const P = run(c, 'ogPlan()'), subs = run(c, 'OG_SUBS'), ofv = new Set(Object.values(run(c, 'OG_OF')));
  for (const r of P.routines) {
    assert.ok(r.ex.filter(e => e.warmup === 'auto').length === 1, `${r.name}: one warm-up ramp, on the first big lift`);
    for (const e of r.ex) {
      assert.ok(e.subs && e.subs.length >= 1 && e.subs.length <= 3, `${e.id} has backups`);
      assert.ok(!e.subs.includes(e.id));
    }
  }
  const B = P.programmes[0];
  assert.strictEqual(P.programme_fmt, 1);
  assert.deepStrictEqual(B.sequence, P.routines.map(r => r.id), 'a rotation over the routines');
  assert.strictEqual(B.weeks.length, 8); assert.ok(B.weeks.every(w => w.rpe === 8 && !w.deload), 'RPE 8 and no planned deload');
  // Every backup is a real openGym number for the same main muscle group; holds only stand in for holds.
  for (const [id, list] of Object.entries(subs)) {
    const ex = run(c, `EXD['${id}']`), prim = Object.keys(ex.hits).find(m => ex.hits[m] === 1), grp = run(c, `MUS['${prim}'][2]`);
    for (const x of list) {
      const n = x.replace('*', ''), og = run(c, `ogx('${n}')`);
      assert.ok(og || ofv.has(n), `${id}: ${n} unknown`);
      if (!og) continue;
      // The same main group at full credit, or the exercise's own main muscle on the way (a shoulder-safe incline press for a landmine press).
      assert.ok(og.hits[prim] > 0 || Object.keys(og.hits).some(m => og.hits[m] === 1 && run(c, `MUS['${m}'][2]`) === grp), `${id}: ${n} (${og.n}) trains another group`);
      assert.strictEqual(og.kind === 'h', ex.unit === 's', `${id}: ${n} hold mismatch`);
    }
  }
  assert.deepStrictEqual(run(c, 'Object.keys(EXD).filter(id => !OG_SUBS[id])'), [], 'every exercise has backups');
  // At home, only backups that need no gym kit go along.
  run(c, "S.profile.equip = 'home'; memo.clear()");
  const home = new Set(Object.values(subs).flat().filter(x => x.endsWith('*')).map(x => x.slice(0, -1)));
  for (const e of run(c, 'ogPlan()').routines.flatMap(r => r.ex)) for (const x of e.subs || []) assert.ok(home.has(x), `${x} is not home kit`);
});
test('openGym plan file: the next loads come from Health’s progression, and a changed plan is noticed', c => {
  run(c, "S.lifts[shift(todayKey(), -2)] = { prog: 'hfb', day: 'A', ex: { 'leg-press': [[100, 12], [100, 12], [100, 12]] } }; memo.clear()");
  const slot = run(c, "ogPlan().routines[0].ex.find(e => e.id === OG_OF['leg-press'])");
  assert.strictEqual(slot.weight, 102.5); assert.strictEqual(slot.repsMin, 8); assert.strictEqual(slot.reps, 12); assert.strictEqual(slot.inc, 2.5);
  run(c, 'S.meta.ogplan = { sig: ogPlanSig(), at: todayKey() }; memo.clear()');
  assert.strictEqual(run(c, 'ogPlanStale()'), false);
  run(c, "S.lifts[shift(todayKey(), -1)] = { prog: 'hfb', day: 'B', ex: { 'leg-press': [[105, 8]] } }; memo.clear()");
  assert.strictEqual(run(c, 'ogPlanStale()'), false, 'new loads alone do not need a new file');
  run(c, "S.settings.prog = 'ul4'; memo.clear()");
  assert.strictEqual(run(c, 'ogPlanStale()'), true, 'a new programme does');
});
test('openGym round trip: a session trained from Health’s plan comes back as the same day with Health’s exercises', c => {
  run(c, "S.profile.shoulder = true; S.settings.prog = 'ul4'; memo.clear()");
  const P = run(c, 'ogPlan()'), r = P.routines[2], k = run(c, 'shift(todayKey(), -1)');
  const w = { id: 'w', d: k, start: Date.parse(k + 'T18:00'), name: r.name, entries: r.ex.map(e => ({ id: e.id, sets: [{ w: e.weight || 10, r: e.reps || 0, sec: e.sec, done: true }] })) };
  c.og = JSON.stringify({ workouts: [w], routines: [], bodyweight: [] });
  run(c, 'ogMerge(ogConvert(ogParse(og))); memo.clear()');
  const L = run(c, `S.lifts['${k}']`);
  assert.deepStrictEqual([L.prog, L.day], ['ul4', 'UB']);
  const want = run(c, `sessionPlan('${k}', 'UB').lifts.map(l => l.id)`);
  assert.deepStrictEqual(Object.keys(L.ex).sort(), [...want].sort(), 'every exercise maps back to Health’s own');
  assert.strictEqual(run(c, 'nextDay(shift(todayKey(), 1))'), 'LB', 'the rotation carries on from it');
});

// ---- the web app as files: these guard against the failures that only show up on a phone ----
const scripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script src="([a-z0-9-]+\.js)/g)].map(m => m[1]);
test('every file carries the current version stamp, the same one everywhere', () => {
  const { stamp, current } = require('./stamp.js');
  const c = current();
  assert.strictEqual(c.marks.length, 1, `files carry ${c.marks.length} different stamps`);
  assert.strictEqual(c.marks[0], stamp(), 'stamp is out of date: run node test/stamp.js');
  assert.strictEqual(c.sw, stamp(), 'sw.js stamp is out of date: run node test/stamp.js');
  assert.strictEqual([...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/\.(?:js|css|webmanifest)\?v=/g)].length, c.count);
});
test('every script reports that it loaded, as its last statement', () => {
  for (const f of scripts) {
    const t = fs.readFileSync(path.join(root, f), 'utf8').trimEnd();
    assert.ok(t.endsWith(`(self.LOADED ||= []).push('${f}');`), f);
  }
});
test('no two files declare the same name, and none hides a browser built-in', () => {
  // A name declared twice stops the second file from loading at all (const, let) or silently replaces the
  // first (function). A browser built-in such as history or close, redeclared, breaks the page in ways a
  // test in Node never sees.
  const BUILTIN = ['history', 'location', 'close', 'open', 'name', 'status', 'top', 'parent', 'self', 'frames', 'length', 'origin',
    'event', 'print', 'alert', 'confirm', 'prompt', 'stop', 'focus', 'blur', 'find', 'scroll', 'screen', 'navigator', 'document',
    'performance', 'crypto', 'caches', 'fetch', 'external', 'menubar', 'toolbar', 'opener', 'closed', 'Image', 'Option', 'Audio'];
  const seen = {};
  for (const f of scripts) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of t.matchAll(/^(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) (seen[m[1]] ||= []).push(f);
    // const a = 1, b = 2 on one top-level line
    for (const m of t.matchAll(/^(?:const|let|var)\s+([^;=\n]+=[^\n]*)$/gm)) for (const n of m[1].matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=/g)) if (!/[([{]/.test(m[1].split(n[0])[0].slice(-1))) (seen[n[1]] ||= []).push(f);
  }
  const dup = Object.entries(seen).filter(([, fs2]) => fs2.length > 1).map(([n, fs2]) => `${n} in ${fs2.join(', ')}`);
  assert.deepStrictEqual(dup, [], 'declared twice');
  const hit = BUILTIN.filter(n => seen[n]).map(n => `${n} in ${seen[n].join(', ')}`);
  assert.deepStrictEqual(hit, [], 'hides a browser built-in');
});
test('a script that fails to load is caught before the app starts', () => {
  const t = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(t.indexOf('(function boot()') >= 0 && t.indexOf('(function boot()') < t.indexOf('let S = load()'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

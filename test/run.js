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
  for (const f of ['lib.js', 'hrv.js', 'data.js', 'exercises.js', 'opengym-ids.js', 'body-data.js', 'store.js', 'model.js', 'energy.js', 'insights.js', 'train.js'])
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
// Beats with a known breathing rhythm: RR = base + amp·sin(2π·rate·t) + noise.
function breathing(n, perMin, amp, base = 1000, jit = 6) { let t = 0; return noise(n, g => { const x = base + amp * Math.sin(2 * Math.PI * perMin / 60 * t) + jit * g(); t += x / 1000; return x; }); }
test('HRV engine: breathing rate is read from the beats, and the spectrum puts it in the right band', c => {
  c.rr = breathing(300, 15, 40);
  const m = run(c, 'hrvMetrics(rr)');
  assert.ok(Math.abs(m.br - 15) < 0.3, `breathing ${m.br}`);
  assert.ok(m.hf > 10 * m.lf, 'a 15/min rhythm is high-frequency power');
  assert.strictEqual(m.q, 100);
  assert.ok(Math.abs(m.sd1 - m.rmssd / Math.SQRT2) < 0.5, 'SD1 is RMSSD/√2');
  c.slow = breathing(300, 6, 220);
  const s = run(c, 'hrvMetrics(slow)');
  assert.ok(Math.abs(s.br - 6) < 0.3, `slow breathing ${s.br}`);
  assert.strictEqual(s.q, 100, 'big swings from slow breathing are real beats, not artefacts');
  assert.ok(s.lf > s.hf, '6/min sits in the low-frequency band');
  assert.strictEqual(run(c, 'hrvMetrics(rr.slice(0, 50)).lf'), undefined, 'no LF under two minutes');
});
test('HRV engine: missed, ectopic and out-of-range beats are corrected, and the result stays close to the truth', c => {
  c.rr = breathing(120, 12, 30);
  const truth = run(c, 'hrvMetrics(rr).rmssd');
  run(c, 'var bad = rr.slice(); bad.splice(50, 2, bad[50] + bad[51]); bad[80] *= 0.6; bad[81] *= 1.4; bad[100] = 120');
  const m = run(c, 'hrvMetrics(bad)');
  assert.ok(Math.abs(m.rmssd - truth) / truth < 0.06, `${m.rmssd} vs ${truth}`);
  assert.ok(m.kinds.missed === 1 && m.kinds.ectopic === 1 && m.kinds.range === 1, JSON.stringify(m.kinds));
  assert.ok(m.q < 100 && m.q > 90);
  assert.strictEqual(run(c, 'hrvMetrics([800, 810, 790])'), null, 'too few beats');
});
test('HRV engine: RSA per breath, the rhythm share at resonance, and a value read against your own history', c => {
  c.rr = breathing(240, 6, 150, 900, 3);
  const end = run(c, 'rr.reduce((a, b) => a + b, 0)');
  c.end = end;
  const R = run(c, 'rsaCycles(beatTimes(rr, end), 0, 10000)');
  assert.ok(R.n >= 15 && R.amp > 15, `RSA ${R.amp} over ${R.n}`);
  assert.ok(run(c, 'rhythmShare(rr, 0.1)') > 0.6, 'most of the power sits at the breathing rate');
  c.wh = breathing(240, 6, 0, 900, 30);
  assert.ok(run(c, 'rhythmShare(wh, 0.1)') < 0.2, 'not for noise');
  const v = run(c, 'versus(70, [60, 61, 62, 59, 60, 63, 61, 60])');
  assert.strictEqual(v.word, 'very high'); assert.strictEqual(v.rec, 'highest');
  assert.strictEqual(run(c, 'versus(60, [60, 61]).word'), null, 'no usual from two values');
});
test('deleted watch data stays deleted through a sync; typed values win; the day curve and night stages are kept', c => {
  const k = run(c, 'shift(todayKey(), -1)'), hd = Array.from({ length: 288 }, (_, i) => i < 100 ? 60 : 0);
  c.P = { days: { [k]: { st: 9000, rh: 58, wt: 90.2, hd, sl: { d: 60, l: 240, r: 90, w: 20, on: -60, seg: [[0, 30, 2], [30, 60, 3], [90, 20, 4], [999, 1, 9]] } } } };
  run(c, 'mergeSync(P)');
  assert.strictEqual(run(c, `S.hrd['${k}'].length`), 288);
  assert.deepStrictEqual(run(c, `S.sleepx['${k}'].seg`), [[0, 30, 2], [30, 60, 3], [90, 20, 4]], 'a bad stage is dropped');
  run(c, `delete S.rhr['${k}']; S.gone.rhr['${k}'] = 1; delete S.steps['${k}']; S.gone.steps['${k}'] = 1; mergeSync(P)`);
  assert.strictEqual(run(c, `S.rhr['${k}']`), undefined, 'deleted resting HR not refilled');
  assert.strictEqual(run(c, `S.steps['${k}']`), undefined);
  run(c, `setManual('steps', '${k}', 4321); mergeSync(P)`);
  assert.strictEqual(run(c, `S.steps['${k}']`), 4321, 'typing clears the deletion and wins over the watch');
  assert.strictEqual(run(c, `S.gone.steps['${k}']`), undefined);
  const again = run(c, 'JSON.stringify(sanitize(JSON.parse(JSON.stringify(S))))');
  assert.strictEqual(again, run(c, 'JSON.stringify(sanitize(JSON.parse(JSON.stringify(sanitize(JSON.parse(JSON.stringify(S)))))))'), 'idempotent with the new fields');
});
test('verdict: on a day without a morning check a very low night from the watch nudges, and a strap reading takes over', c => {
  const t = run(c, 'todayKey()');
  run(c, `for (let i = 1; i <= 30; i++) S.wx[shift('${t}', -i)] = { hv: i % 2 ? 40 : 65 }; S.wx['${t}'] = { hv: 25 }; S.sleep['${t}'] = 7.5;`);
  const R = run(c, 'readiness()');
  assert.strictEqual(R.level, 'care');
  assert.ok(/No morning check today/.test(R.why[0][1]));
  assert.deepStrictEqual(R.src, { strap: false, week: false, night: true });
  run(c, `S.hrv['${t}'] = { rmssd: 60, hr: 55 }; memo.clear();`);
  const R2 = run(c, 'readiness()');
  assert.strictEqual(R2.level, 'go', 'a strap reading today outranks the night');
  assert.strictEqual(R2.src.strap, true);
});
test('Lab sessions: only known kinds and fields are kept, and a resonance result needs its rates', c => {
  c.L = [{ kind: 'breathe', t: Date.now(), dur: 300, pat: 'rf', rate: 6, rsa: 12.5, evil: '<b>' }, { kind: 'rf', t: Date.now(), seg: [[6, 10]], best: 6 }, { kind: 'nope', t: Date.now() },
    { kind: 'ortho', t: Date.now(), hrSup: 55, hrStd: 70, rmSup: 60, rmStd: 30 }];
  const r = run(c, 'L.map(cleanLab)');
  assert.deepStrictEqual(Object.keys(r[0]).sort(), ['dur', 'kind', 'pat', 'rate', 'rsa', 't']);
  assert.strictEqual(r[1], null, 'three rates at least'); assert.strictEqual(r[2], null); assert.ok(r[3]);
  c.cx = { t: Date.now(), dur: 900, avg: 140, max: 170, z: [0, 0, 900, 0], hr0: 165, hrr: 31 };
  assert.strictEqual(run(c, 'cleanCardio(cx).hrr'), 31, 'heart-rate recovery is kept with the session');
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
    // Carbs are available carbohydrate; fibre adds 2 kcal/g (FAO), as it does on Indian labels and in IFCT.
    const e = 4 * f[4] + 4 * f[5] + 9 * f[6] + 2 * f[7];
    if (f[3] > 20) assert.ok(Math.abs(e - f[3]) / f[3] <= 0.15, `${f[0]}: ${f[3]} kcal vs ${e} from macros`);
  }
  const G = run(c, 'GRAMS');
  for (const [id, g] of Object.entries(G)) { assert.ok(ids.has(id), `GRAMS: unknown ${id}`); assert.ok(g > 0 && g <= 500, `GRAMS ${id}: ${g}`); }
  // Packaged, powder and raw panels: unique, known category, every panel internally consistent within a fifth (the
  // filter they were chosen by), and each serving exactly its panel scaled by the serving's weight.
  for (const f of run(c, 'PANEL_FOODS')) {
    assert.ok(!ids.has(f.id), `duplicate ${f.id}`); ids.add(f.id);
    assert.ok(cats.has(f.cat), `${f.id}: category ${f.cat}`);
    assert.ok(['label', 'brand', 'derived', 'ifct', 'usda'].includes(f.src) && f.ref, `${f.id}: source`);
    assert.ok(f.g > 0 && f.k > 0 && f.p >= 0, f.id);
    if (f.per) {
      const [k, p, cb, ft, fb] = f.per, e = 4 * p + 4 * cb + 9 * ft + 2 * fb;
      assert.ok(Math.abs(e - k) / Math.max(e, k) <= 0.2, `${f.id}: panel ${k} kcal vs ${Math.round(e)} from its macros`);
      assert.ok(Math.abs(f.k - k * f.g / 100) <= 0.5 && Math.abs(f.p - p * f.g / 100) <= 0.05, `${f.id}: serving is not its panel scaled`);
    } else assert.ok(f.c == null && f.ft == null, `${f.id}: a maker-stated food must not invent carbs or fat`);
  }
  assert.strictEqual(run(c, 'allFoods().length'), ids.size);
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

// ---- the energy model and the insights engine ----
test('energy model: learns a burn far from the formula, and its interval narrows with data', c => {
  // 60 days: someone who truly burns 2,300 kcal, eats 1,800 on logged days, weighs in daily with ±0.5 kg of water noise.
  run(c, `S = sanitize({ profile: { sex: 'm', dob: '1995-01-01', h: 180, w0: 95, waist0: 104, days: 3 } });
    let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    let w = 95; for (let n = 60; n >= 0; n--) { const k = shift(todayKey(), -n);
      S.weights[k] = Math.round((w + (rnd() - 0.5) * 1.6) * 10) / 10; S.steps[k] = 6000;
      if (n > 0 && n % 4 !== 0) S.food[k] = [{ id: 'q' + n, n: 'Meal', u: 'entry', k: 1800, p: 120, fb: 25, q: 1, m: 'lunch' }, { id: 'r' + n, n: 'Meal', u: 'entry', k: 0.01, p: 0, fb: 0, q: 1, m: 'dinner' }];
      S.full[k] = n % 4 !== 0;
      w -= 500 / rhoOf(w, bodyFat().pct).rho; }
    memo.clear();`);
  const M = run(c, 'energyModel()'), early = run(c, `energyModel(shift(todayKey(), -45))`);
  assert.ok(Math.abs(M.E - 2300) < 200, `learned ${Math.round(M.E)} kcal against a true 2,300`);
  assert.ok(M.lo < 2300 && M.hi > 2300, `the 95% interval ${Math.round(M.lo)}–${Math.round(M.hi)} holds the truth`);
  assert.ok(M.sd < early.sd * 0.8, `interval narrowed: ${Math.round(early.sd)} → ${Math.round(M.sd)}`);
  assert.ok(M.formula > 2500, 'the formula alone would have been well off');
  assert.ok(M.rho > 6000 && M.rho < 8500, `energy in a kg of change ${Math.round(M.rho)}`);
  assert.ok(run(c, 'targets().trust') > 0.5, 'the target leans on the learned burn');
});
test('energy model: a missing log adds uncertainty, not bias; a wild weigh-in barely moves it', c => {
  run(c, `S = sanitize({}); for (let n = 40; n >= 0; n--) { const k = shift(todayKey(), -n); S.weights[k] = 90 - (40 - n) * 0.05; } memo.clear();`);
  const a = run(c, 'energyModel()');
  run(c, `S.weights[shift(todayKey(), -1)] = 96; memo.clear();`);
  const b = run(c, 'energyModel()');
  assert.ok(Math.abs(b.W - a.W) < 0.6, `trend weight moved ${r(b.W - a.W)} kg for a 6 kg typo`);
  assert.strictEqual(a.conf, 'calibrating', 'no food log: still calibrating, never confident');
  function r(x) { return Math.round(x * 100) / 100; }
});
test('links: detrending stops two things that drift together from looking linked', c => {
  // HRV rises and sleep rises over 90 days, but day to day they are independent noise.
  run(c, `S = sanitize({}); let r = 5; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let n = 90; n >= 0; n--) { const k = shift(todayKey(), -n), t = (90 - n) / 90;
      S.sleep[k] = Math.round((6 + t * 1.5 + (rnd() - 0.5) * 1.2) * 10) / 10; S.hrv[k] = { rmssd: 35 + t * 15 + (rnd() - 0.5) * 8, hr: 60, q: 95 }; } memo.clear();`);
  const raw = run(c, `pearson(range(90).filter(k => S.sleep[k] != null && S.hrv[k]).map(k => [S.sleep[k], Math.log(S.hrv[k].rmssd)]))`);
  const L = run(c, `linkRead(LINKS.find(l => l.id === 'sl-hrv'))`);
  assert.ok(raw > 0.4, `raw correlation is spuriously strong (${raw.toFixed(2)})`);
  assert.notStrictEqual(L.status, 'clear', `detrended: ${L.status}, r ${L.r && L.r.toFixed(2)}`);
});
test('links: a real day-to-day effect is found, in units, with an interval', c => {
  // Each extra hour of sleep adds 8% HRV the next morning, on top of noise.
  run(c, `S = sanitize({}); let r = 9; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let n = 70; n >= 0; n--) { const k = shift(todayKey(), -n), sl = 7 + (rnd() - 0.5) * 2.4;
      S.sleep[k] = Math.round(sl * 10) / 10; S.hrv[k] = { rmssd: 45 * Math.exp(0.077 * (sl - 7) + (rnd() - 0.5) * 0.12), hr: 60, q: 95 }; } memo.clear();`);
  const L = run(c, `linkRead(LINKS.find(l => l.id === 'sl-hrv'))`);
  assert.strictEqual(L.status, 'clear');
  assert.ok(L.elo < 8 && L.ehi > 8 && L.eff > 4 && L.eff < 12, `effect ${L.eff.toFixed(1)}% (${L.elo.toFixed(1)} to ${L.ehi.toFixed(1)})`);
  assert.ok(L.agrees, 'in the direction the research expects');
});
test('sleep regularity index: identical nights score 100, shifted nights score lower', c => {
  run(c, `S = sanitize({}); for (let n = 14; n >= 0; n--) { const k = shift(todayKey(), -n); S.sleep[k] = 7.5; S.sleepx[k] = { d: 80, l: 250, r: 100, w: 20, on: -30 }; } memo.clear();`);
  assert.strictEqual(Math.round(run(c, 'sri().v')), 100);
  // Alternate nights two hours later: half the pairs lose 2 h at each end, 240 of 1,440 minutes.
  run(c, `for (let n = 14; n >= 0; n -= 2) S.sleepx[shift(todayKey(), -n)].on = 90; memo.clear();`);
  const v = run(c, 'sri().v');
  assert.ok(Math.abs(v - (-100 + 200 * (1440 - 240) / 1440)) < 1, `SRI ${v}`);
});
test('recovery number sits inside the zone the verdict chose', c => {
  c.raw = seedV3(); run(c, 'S = sanitize(raw); memo.clear()');
  const R = run(c, 'recoveryScore(shift(todayKey(), -1))'), lv = R.level;
  if (R.score != null) {
    const [lo, hi] = { easy: [1, 33], care: [34, 66], go: [67, 99] }[lv];
    assert.ok(R.score >= lo && R.score <= hi, `${lv}: ${R.score}`);
  }
  assert.ok(R.parts.length >= 1);
});

// ---- the web app as files: these guard against the failures that only show up on a phone ----
const scripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script src="([a-z0-9-]+\.js)/g)].map(m => m[1]);
test('a logged food keeps its carbs, fat and weight through saving and loading; unknown stays unknown', c => {
  run(c, `S.food['2026-03-02'] = [
    { id: 'amul_pbm', n: 'x', u: '1 pack (200 ml)', k: 108, p: 15, c: 8, ft: 1, fb: 0, g: 200, src: 'label', m: 'snack', q: 1.5 },
    { id: 'amul_kool_protein', n: 'y', u: '1 bottle', k: 133, p: 10, fb: 0, m: 'snack', q: 1 },
    { id: 'z', n: 'only carbs', u: '1', k: 100, p: 0, c: 25, fb: 0, m: 'snack', q: 0.05 }];
    S = sanitize(JSON.parse(JSON.stringify(S)));`);
  const L = run(c, "S.food['2026-03-02']");
  assert.deepStrictEqual([L[0].c, L[0].ft, L[0].g, L[0].src, L[0].q], [8, 1, 200, 'label', 1.5]);
  assert.ok(!('c' in L[1]) && !('ft' in L[1]), 'a maker-stated food has no carbs or fat');
  assert.ok(!('c' in L[2]), 'carbs without fat cannot give a split, so neither is kept');
  assert.strictEqual(L[2].q, 0.05, 'a weighed few grams is kept');
  const t = run(c, "totals('2026-03-02')");
  assert.strictEqual(t.c, 12); assert.strictEqual(t.ft, 1.5); assert.strictEqual(t.kn, 162);
  assert.strictEqual(Math.round(t.k), 300);
});
test('old entries get carbs and fat from their food only when they still match it', c => {
  const f = run(c, "food('chapati')");
  run(c, `S.food['2026-03-03'] = [{ id: 'chapati', n: 'Chapati', u: '1 medium', k: ${f.k}, p: ${f.p}, fb: ${f.fb}, m: 'lunch', q: 2 },
    { id: 'chapati', n: 'Chapati, edited', u: '1 medium', k: ${f.k + 30}, p: ${f.p}, fb: ${f.fb}, m: 'dinner', q: 1 }]`);
  assert.strictEqual(run(c, 'backfillMacros()'), 1);
  const L = run(c, "S.food['2026-03-03']");
  assert.deepStrictEqual([L[0].c, L[0].ft, L[0].g], [f.c, f.ft, 40]);
  assert.ok(L[1].c == null, 'an entry that no longer matches its food is left alone');
  assert.strictEqual(run(c, "portion({ q: 1.5, u: '1 katori', g: 150 })"), '1½ × 1 katori · about 225 g');
  assert.strictEqual(run(c, "portion({ q: 0.65, u: '100 g', g: 100 })"), '65 g');
  assert.strictEqual(run(c, "Math.round(atwaterOff({ k: 400, p: 10, c: 10, ft: 1, fb: 0 }) * 100)"), 78);
});
test('a sync keeps the watch’s own steps, the merged count beside them, and when the watch last wrote', c => {
  const today = run(c, 'todayKey()'), now = Date.now();
  c.P = { from: today, to: today, ex: [], win: [], errors: ['vo2: not allowed'], read: now,
    days: { [today]: { st: 8412, sa: 9020, di: 6100 } },
    fresh: { watch: 'Zepp', apps: ['Zepp', 'Health Connect'], steps: { w: now - 36e5, e: now - 37e5, src: 'Zepp' }, heart: { w: now - 72e5, src: 'Zepp' }, bogus: { w: 1 } } };
  run(c, 'mergeSync(P); S.meta.fresh = cleanFresh(Object.assign({}, P.fresh, { read: P.read, err: P.errors }))');
  assert.strictEqual(run(c, `S.steps['${today}']`), 8412);
  assert.strictEqual(run(c, `S.wx['${today}'].sa`), 9020);
  const F = run(c, 'S.meta.fresh');
  assert.strictEqual(F.watch, 'Zepp'); assert.deepStrictEqual(F.err, ['vo2: not allowed']);
  assert.ok(!F.k.bogus, 'unknown kinds are dropped');
  assert.strictEqual(run(c, 'watchWrote().k'), 'steps', 'the newest write by the watch app');
  assert.deepStrictEqual(run(c, 'sanitize(JSON.parse(JSON.stringify(S))).meta.fresh'), F);
});
// A recording with known faults: breathing at 6 a minute, one missed beat, one extra, one far out of range.
function plantedBeats() {
  const rr = [];
  for (let i = 0; i < 400; i++) rr.push(900 + 80 * Math.sin(i * 0.9 / 6 * 2 * Math.PI / 1.5) + (i % 7) * 3);
  rr[100] = rr[100] * 2; rr.splice(200, 1, rr[200] * 0.4, rr[200] * 0.6); rr[300] = 4000;
  return rr;
}
test('every corrected beat says what was done to it and which beat it came from; nothing else changes', c => {
  c.raw = plantedBeats();
  const C = run(c, 'rrClean(raw)');
  assert.strictEqual(C.fix.length, C.rr.length); assert.strictEqual(C.src.length, C.rr.length);
  for (let i = 1; i < C.src.length; i++) assert.ok(C.src[i] >= C.src[i - 1], 'beats stay in order');
  const counted = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  C.fix.forEach((f, i) => { if (f && !(i && C.fix[i - 1] === f && C.src[i - 1] === C.src[i])) counted[f]++; });
  assert.ok(C.kinds.missed >= 1 && counted[1] === C.kinds.missed, 'missed beats are marked, once each');
  assert.ok(C.kinds.range >= 1, 'the out-of-range beat is found');
  assert.ok(C.fix[C.src.indexOf(100)] === 1, 'the doubled beat at 100 is the one split');
  // The flags change nothing about the result the app has always computed.
  const M = run(c, 'hrvMetrics(raw)'), W = run(c, 'rrStats(rrClean(raw).rr)');
  for (const k of ['rmssd', 'sdnn', 'pnn50', 'sd1', 'sd2', 'hr']) assert.ok(Math.abs(M[k] - W[k]) < 1e-9 * Math.max(1, M[k]), `${k}: ${M[k]} vs ${W[k]}`);
});
test('a window of beats is read exactly as the whole would be, and RMSSD rolls over its last 30 beats', c => {
  c.rr = plantedBeats().slice(0, 90).map(x => Math.min(1400, x));
  const part = run(c, 'rrStats(rr, 20, 70)'), alone = run(c, 'rrStats(rr.slice(20, 70))');
  assert.deepStrictEqual(part, alone);
  assert.strictEqual(run(c, 'rrStats(rr, 0, 9)'), null);
  const roll = run(c, 'rollingRmssd(rr, 30)'), d = c.rr.slice(31, 61).map((x, i) => x - c.rr[30 + i]);
  assert.ok(Math.abs(roll[60] - Math.sqrt(d.reduce((a, x) => a + x * x, 0) / 30)) < 1e-9);
  assert.strictEqual(roll[29], null);
});
test('data checks find planted mistakes, and pass clean data', c => {
  vm.runInContext('var SETPAGES = {};', c);
  vm.runInContext(fs.readFileSync(path.join(root, 'view-checks.js'), 'utf8'), c, { filename: 'view-checks.js' });
  const k = run(c, 'todayKey()'), y = run(c, 'shift(todayKey(), -1)');
  run(c, `S.sleepx['${k}'] = { d: 90, l: 240, r: 90, w: 20, on: -60, bed: 450 }; S.sleep['${k}'] = 7;`);
  run(c, `S.steps['${k}'] = 8000; S.wx['${k}'] = { di: 6000 };`);
  let C = Object.fromEntries(run(c, 'memo.clear(), runChecks()').map(x => [x.id, x]));
  assert.strictEqual(C['s-stage'].status, 'ok', C['s-stage'].result);
  assert.strictEqual(C['a-stride'].status, 'ok');
  assert.strictEqual(C['f-prot'].status, 'na');
  run(c, `S.sleep['${y}'] = 8; S.sleepx['${y}'] = { d: 60, l: 200, r: 60, w: 10, on: -60, bed: 300 };
    S.food['${k}'] = [{ id: 'q', n: 'Shake', u: '1', k: 50, p: 30, fb: 0, m: 'snack', q: 1 }, { id: 'r', n: 'Bar', u: '1', k: 400, p: 10, c: 10, ft: 1, fb: 0, m: 'snack', q: 1 }];
    S.wx['${k}'].di = 60000; S.wx['${k}'].ak = 900; S.wx['${k}'].tk = 600;`);
  C = Object.fromEntries(run(c, 'memo.clear(), runChecks()').map(x => [x.id, x]));
  assert.strictEqual(C['s-stage'].status, 'bad'); assert.strictEqual(C['s-stage'].items.length, 2, 'the total and the time in bed');
  assert.strictEqual(C['f-prot'].status, 'bad'); assert.strictEqual(C['f-atw'].status, 'look');
  assert.strictEqual(C['a-stride'].status, 'look'); assert.strictEqual(C['a-kcal'].status, 'bad');
  for (const x of Object.values(C)) assert.ok(['ok', 'look', 'bad', 'na'].includes(x.status) && x.result, x.id);
});
test('links in your data: the 95% interval decides whether a link is named, and too few days say so', c => {
  vm.runInContext(fs.readFileSync(path.join(root, 'view-review.js'), 'utf8'), c, { filename: 'view-review.js' });
  const q = l => run(c, `rRead(${JSON.stringify(l)})`);
  assert.match(q({ n: 9, r: null }).txt, /9 of 14 days/);
  assert.match(q({ n: 30, r: null }).txt, /too little variation/);
  // r 0.30 at n 29: z 0.31, se 0.196, interval -0.07 to 0.60, so not named. At n 60 it is (0.05 to 0.51).
  const a = q({ n: 29, r: 0.3 }), b = q({ n: 60, r: 0.3 });
  assert.match(a.txt, /no clear link/); assert.match(a.txt, /−0\.07 to \+0\.60/);
  assert.match(b.txt, /moderate positive link/); assert.match(b.txt, /\+0\.05 to \+0\.51/);
  assert.match(q({ n: 40, r: -0.6 }).txt, /strong negative link/);
});
test('recovery shows the four inputs of the verdict, each with its own state', c => {
  for (const f of ['ui.js', 'view-recovery.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), c, { filename: f });
  const k = run(c, 'todayKey()');
  run(c, `S.sleep['${k}'] = 5.5; S.sleepx['${k}'] = { d: 60, l: 200, r: 60, w: 10, on: -60 };`);
  const html = run(c, 'memo.clear(), signals(readiness())');
  assert.strictEqual((html.match(/class="sgn /g) || []).length, 4);
  assert.match(html, /5\.5<i> h<\/i>.*under 6 h/s);
  assert.match(html, /sgn s1" data-act="jump" data-to="rc-sleep"/);
});
test('the page root keeps its default overflow, so the page scrolls by touch', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/(?:^|})\s*(?:html|:root)\s*\{([^}]*)\}/g)) assert.ok(!/overflow(-[xy])?\s*:/.test(m[1]), 'html must not set overflow: ' + m[1].trim());
});
test('a Live session is kept with its stretches, its chart and its beats; unknown marks are dropped', c => {
  c.L = { kind: 'live', t: Date.now(), dur: 9000, rmssd: 40, hr: 60, q: 97, sd: 50, a1: 1.1, rr: Array.from({ length: 5000 }, () => 1000),
    ser: [[5, 60, 40], [10, 61, null], ['x', 1, 1]], seg: [['rest', 0, 300, 60, 40, 12, 99, 1.2], ['nope', 300, 60, 70, 20, 14, 90, 1], ['move', 360, 100, 80, null, null, null, null]] };
  const r = run(c, 'cleanLab(L)');
  assert.strictEqual(r.dur, 9000); assert.strictEqual(r.rr.length, 4000);
  assert.deepStrictEqual(r.ser, [[5, 60, 40], [10, 61, null]]);
  assert.deepStrictEqual(r.seg.map(x => x[0]), ['rest', 'move']);
  assert.strictEqual(run(c, 'cleanLab({ kind: "live", t: Date.now(), dur: 100 })'), null);
});
test('the beat timeline is read from its end, with the same result as searching all of it', c => {
  vm.runInContext('var HR = { beats: [] }; for (let i = 0; i < 500; i++) HR.beats.push([1000 + i * 10, 800]);' + fs.readFileSync(path.join(root, 'h9.js'), 'utf8').match(/function beatsSince[\s\S]*?\n}/)[0], c);
  for (const [a, b] of [[0, Infinity], [3000, Infinity], [3000, 4000], [5990, 9000], [9000, Infinity], [1000, 1010]])
    assert.deepStrictEqual(run(c, `beatsSince(${a}, ${b})`), run(c, `HR.beats.filter(x => x[0] >= ${a} && x[0] < ${b})`), `${a}..${b}`);
});
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

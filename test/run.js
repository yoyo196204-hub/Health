// Engine tests: node test/run.js. Loads the app's own files into a sandbox (no browser needed) and checks
// storage, migration, the trend, targets, progression, shoulder care, cutting old data, snapshots and Halftone.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const { seedV3 } = require('./seed.js');
const root = path.join(__dirname, '..');

function sandbox() {
  const store = new Map();
  const ctx = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Blob, Intl,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    toast: () => {}, document: { querySelector: () => null, querySelectorAll: () => [] },
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['lib.js', 'data.js', 'exercises.js', 'body-data.js', 'store.js', 'model.js', 'train.js'])
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
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
test('plate maths', c => {
  assert.deepStrictEqual(run(c, 'plates(62.5).side'), [20, 1.25]);
  assert.strictEqual(run(c, 'plates(20)'), null);
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
test('every programme exercise exists and every rep range is sane', c => {
  for (const [p, P] of Object.entries(run(c, 'PROGRAMS'))) for (const [d, D] of Object.entries(P.days)) for (const l of D.lifts) {
    assert.ok(run(c, `!!EXD['${l[0]}']`), `${p}/${d}/${l[0]}`);
    assert.ok(l[1] >= 1 && l[1] <= 6 && l[2] < l[3], `${p}/${d}/${l[0]} range`);
  }
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

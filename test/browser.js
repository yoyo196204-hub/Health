// Screen tests in a real browser: node test/browser.js. The engine tests (run.js) cannot see what only a browser
// shows: whether the page scrolls under a finger, where a fixed bar ends up, whether a live session runs end to end.
// Needs Playwright (npm i playwright-core) and a Chrome: CHROME=/path/to/chrome, or Playwright's own.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { seedV3 } = require('./seed.js');
const root = path.join(__dirname, '..');
let pw; try { pw = require('playwright'); } catch (e) { try { pw = require('playwright-core'); } catch (e2) { console.log('Playwright is not installed: screen tests skipped.'); process.exit(process.env.CI ? 1 : 0); } }
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', webmanifest: 'application/manifest+json' };

(async () => {
  const srv = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0);
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const ctx = await browser.newContext({ ...pw.devices['Pixel 7'], acceptDownloads: true });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(s => { if (!localStorage.getItem('health.v1')) localStorage.setItem('health.v1', s); }, JSON.stringify(seedV3()));
  await page.goto(url); await page.waitForSelector('#view header');
  const drag = async (x0, y0, x1, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 10, y: y0 + (y1 - y0) * i / 10 }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
  };
  let passed = 0, failed = 0;
  const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n       ', e.message.split('\n')[0]); } };
  const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(500); };

  for (const tab of ['today', 'recovery', 'review', 'me']) await test(`${tab}: a finger scrolls the page`, async () => {
    await go(tab); await page.evaluate(() => scrollTo(0, 0));
    await drag(200, 620, 200, 220);
    assert.ok(await page.evaluate(() => scrollY) > 150, `scrolled ${await page.evaluate(() => scrollY)} px of ${await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)}`);
  });
  await test('a sideways swipe changes tab, and the page is left where it belongs', async () => {
    await go('today'); await page.evaluate(() => scrollTo(0, 0));
    // Start on the heading: a swipe that begins on a field is left to the field, by design, and a fixed point on
    // the screen lands on whatever Today happens to show there.
    const y = await page.evaluate(() => { const r = document.querySelector('#view header h1').getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
    await drag(320, y, 60, y + 8);
    const s = await page.evaluate(() => ({ tab, tr: document.getElementById('view').style.transform }));
    assert.deepStrictEqual(s, { tab: 'food', tr: '' });
  });
  await test('adding food: the bar with the total stays at the bottom of the screen', async () => {
    await go('add-lunch');
    const r = await page.evaluate(() => { const b = document.querySelector('.addfoot').getBoundingClientRect(); return [Math.round(b.bottom), innerHeight]; });
    assert.ok(Math.abs(r[0] - r[1]) <= 1, `bar bottom ${r[0]}, screen ${r[1]}`);
  });
  await test('a Live session runs, marks stretches, saves, and exports its beats', async () => {
    await go('lab-live');
    // A strap that has been on for seven minutes: slow steady beats, then faster ones with less variation.
    await page.evaluate(() => {
      const now = Date.now(); let t = now - 420000, i = 0;
      while (t < now) { const calm = t < now - 180000, rr = (calm ? 1000 : 750) + (calm ? 60 : 15) * Math.sin(i / 2.4) + (i % 7) * (calm ? 4 : 1); t += rr; HR.beats.push([t, rr]); i++; }
      Object.assign(HR, { conn: 'on', name: 'Test strap' });
      const v = new DataView(new ArrayBuffer(4)); v.setUint8(0, 16); v.setUint8(1, 80); v.setUint16(2, 768, true); hrData(v, now);
    });
    await page.waitForTimeout(300);
    await page.tap('[data-act="labgo"][data-k="live"]');
    // Seven minutes ago it started; three minutes ago the mark changed.
    await page.evaluate(() => { HR.t0 -= 420000; LAB.segT0 = HR.t0; });
    await page.tap('[data-act="livetag"][data-v="move"]');
    await page.evaluate(() => { LAB.marks[1][0] = 240; });
    await page.waitForTimeout(7500);   // two points for the chart, five seconds apart
    if (process.env.DEBUG) console.log(await page.evaluate(() => ({ ser: LAB.ser, marks: LAB.marks, live: HR.live, mode: HR.mode, html: document.getElementById('livech')?.innerHTML.slice(0, 200) })));
    assert.match(await page.textContent('#lv_rm'), /^\d+$/, 'live RMSSD is shown');
    assert.ok((await page.innerHTML('#livech')).includes('<path'), 'the live chart draws');
    await page.tap('[data-act="labstop"]');
    await page.waitForTimeout(400);
    const rec = await page.evaluate(() => Object.values(S.lab).flat().find(x => x.kind === 'live'));
    assert.ok(rec, 'saved'); assert.strictEqual(rec.seg.length, 2); assert.deepStrictEqual(rec.seg.map(x => x[0]), ['rest', 'move']);
    assert.ok(rec.seg[0][4] > rec.seg[1][4] * 2, `calm RMSSD ${rec.seg[0][4]} well above moving ${rec.seg[1][4]}`);
    assert.ok(Math.abs(rec.seg[0][3] - 60) < 3 && Math.abs(rec.seg[1][3] - 80) < 3, `heart rates ${rec.seg[0][3]}, ${rec.seg[1][3]}`);
    assert.ok(rec.rr.length > 300 && rec.ser.length >= 1);
    assert.ok((await page.textContent('.result')).includes('Resting → moving'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.tap('[data-act="rrexp"]')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8').split('\n');
    assert.ok(/^health-beats-.*\.csv$/.test(dl.suggestedFilename()));
    assert.ok(csv.includes('time_s,rr_ms') && csv.some(l => l.startsWith('# mark at 240 s: Moving')) && csv.filter(l => /^\d/.test(l)).length > 400);
  });
  const shot = async name => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `${name}.png`), fullPage: true }); };
  await test('the beat explorer: a finger reads beats, a pinch zooms, and the numbers follow the window', async () => {
    // A morning check with a missed beat in it, saved the way a recording is.
    const k = await page.evaluate(() => {
      const rr = [];
      for (let i = 0; i < 260; i++) rr.push(Math.round(950 + 70 * Math.sin(i / 2.2) + (i % 5) * 3));
      rr[120] *= 2;
      const k = todayKey(), m = hrvMetrics(rr);
      S.hrv[k] = { rmssd: r1(m.rmssd), hr: r1(m.hr), q: m.q, rr, t: Date.now(), pos: 'lying', dur: 240 }; save();
      return k.replace(/-/g, '');
    });
    await go(`beats-h${k}`); await page.waitForTimeout(400);
    await shot('beats');
    const box = await page.evaluate(() => { const r = document.getElementById('bxt').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    assert.ok(box.w > 250 && box.h > 150, 'the chart has room');
    const inked = await page.evaluate(() => { const c = document.getElementById('bxt'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
    assert.ok(inked > 2000, 'the beats are drawn');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.w * 0.5, y: box.y + box.h / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(350);   // not a double tap
    await drag(box.x + box.w * 0.3, box.y + box.h / 2, box.x + box.w * 0.6, box.y + box.h / 2);
    const read = await page.evaluate(() => document.getElementById('bxread').textContent);
    assert.ok(/Beat \d+/.test(read) && /ms/.test(read) && /bpm/.test(read), read);
    assert.strictEqual(await page.evaluate(() => overlay?.type), 'beats', 'reading beats never swipes the page away');
    const before = await page.evaluate(() => [BX.v1 - BX.v0, document.getElementById('bxstats').textContent]);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - i * 14, y: cy, id: 1 }, { x: cx + 30 + i * 14, y: cy, id: 2 }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => [BX.v1 - BX.v0, document.getElementById('bxstats').textContent]);
    assert.ok(after[0] < before[0] * 0.6, `pinch zoomed in: ${before[0]} → ${after[0]} s`);
    assert.notStrictEqual(after[1], before[1], 'the window’s numbers changed with it');
    await page.tap('[data-act="bxgo"]');
    assert.ok(/missed beat, split/.test(await page.evaluate(() => document.getElementById('bxread').textContent)), 'a correction can be gone to and read');
    await shot('beats-zoomed');
  });
  await test('data checks: every check has a result, and a planted impossible food is caught', async () => {
    await page.evaluate(() => { (S.food[todayKey()] ||= []).push({ id: 'qt', n: 'Typo shake', u: '1', k: 60, p: 40, fb: 0, m: 'snack', q: 1 }); save(); });
    await go('set-checks');
    await shot('checks');
    const r = await page.evaluate(() => [...document.querySelectorAll('.ck')].map(li => [li.className, li.querySelector('summary .sub').textContent]));
    assert.ok(r.length >= 15, `${r.length} checks`);
    assert.ok(r.every(([, t]) => t.trim().length > 10), 'each says what it found');
    assert.ok(r.some(([c, t]) => /bad/.test(c) && /more energy in protein/.test(t)));
    await go('review');
    assert.ok(await page.evaluate(() => !!document.querySelector('.ckbanner.bad')), 'Review says something does not add up');
    await page.evaluate(() => { S.food[todayKey()] = S.food[todayKey()].filter(e => e.id !== 'qt'); save(); });
  });
  await test('wear time: short days are left out of the long game and said so, and the check lists them', async () => {
    const before = await page.evaluate(() => {
      const full = Array(288).fill(62), short = Array(288).fill(0).map((_, i) => i >= 96 && i < 168 ? 70 : 0), old = { hrd: S.hrd, steps: S.steps };
      S.hrd = {}; S.steps = { ...S.steps };
      for (let i = 1; i <= 20; i++) { const k = shift(todayKey(), -i); S.hrd[k] = i <= 3 ? short : full; S.steps[k] = i <= 3 ? 900 : 8000; }
      save(); window.__wear = old; return true;
    });
    assert.ok(before);
    await go('set-checks');
    const ck = await page.evaluate(() => { const li = [...document.querySelectorAll('.ck')].find(l => /Watch worn long enough/.test(l.textContent)); return li && [li.className, li.querySelector('summary .sub').textContent, li.querySelectorAll('.ckitems li').length]; });
    assert.ok(ck && /look/.test(ck[0]) && /17 days of 20 worn 10 h or more; 3 left out/.test(ck[1]) && ck[2] === 6, JSON.stringify(ck));
    await go('review'); await page.evaluate(() => { SUB.review = 'long'; renderView(); }); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => markers().find(m => m.id === 'steps').raw), 8000, 'the short days do not pull the median down');
    assert.ok(await page.evaluate(() => /3 days left out: watch worn under 10 h/.test(markers().find(m => m.id === 'steps').s)));
    await page.evaluate(() => { SUB.review = 'links'; renderView(); }); await page.waitForTimeout(300);
    assert.ok(/3 days left out: watch worn under 10 h/.test(await page.textContent('#in-links')), 'Links say what was left out');
    await shot('wear');
    await page.evaluate(() => { Object.assign(S, window.__wear); save(); render(); });
  });
  await test('watch against strap: a line by effort, its error in Data checks, and the protocol on Heart', async () => {
    await page.evaluate(() => {
      window.__cal = { cardio: S.cardio, pairs: S.pairs }; S.cardio = {}; S.pairs = {};
      [100, 110, 120, 130, 140, 150].forEach((w, i) => { const t = Date.now() - (i + 2) * 864e5, k = dk(new Date(t)); (S.cardio[k] ||= []).push({ t, dur: 1800, avg: Math.round(1.25 * w - 25) + (i % 2 ? 1 : -1), max: 180, z: [0, 1800, 0, 0] }); S.pairs[t] = { a: w, n: 300 }; });
      save(); render();
    });
    await go('set-checks');
    const r = await page.evaluate(() => [...document.querySelectorAll('.ck')].find(l => /corrected by effort/.test(l.textContent))?.querySelector('summary .sub').textContent);
    assert.ok(/strap = 1\.2\d × watch − 2\d, from 6 workouts over \d+ bpm; 95% of corrected workouts within ±\d bpm/.test(r), r);
    await go('recovery'); await page.evaluate(() => { SUB.recovery = 'cardio'; renderView(); }); await page.waitForTimeout(300);
    const t = await page.evaluate(() => document.getElementById('view').textContent);
    assert.ok(/put on the strap's scale by effort/.test(t) && /5 min resting, 10 min easy, 10 min moderate, 3–5 min hard/.test(t), 'the line and the protocol');
    await shot('calibration');
    await page.evaluate(() => { Object.assign(S, window.__cal); save(); render(); });
  });
  await test('recovery, training, review: the inputs behind the verdict, nights that end, short session list, honest links', async () => {
    await page.evaluate(() => { const k = shift(todayKey(), -1); S.sleepx[k] = { d: 60, l: 200, r: 60, w: 10, on: -60 }; S.sleep[k] = 5.5; save(); });
    const part = async (t, v) => { await page.evaluate(([t, v]) => { SUB[t] = v; renderView(); }, [t, v]); await page.waitForTimeout(300); };
    await go('recovery'); await part('recovery', 'rec');
    assert.ok(await page.evaluate(() => document.querySelectorAll('.rhero .part').length) >= 2, 'the recovery number shows its parts');
    await page.evaluate(() => { const k = todayKey(); S.sleep[k] = 6.2; save(); render(); });
    // An input of the verdict that lives in another part of Heart: that part comes up, at its section.
    await page.tap('.part[data-to="rc-sleep"]'); await page.waitForTimeout(700);
    assert.strictEqual(await page.evaluate(() => SUB.recovery), 'sleep');
    assert.ok(await page.evaluate(() => Math.abs(document.getElementById('rc-sleep').getBoundingClientRect().top) < 200), 'tapping an input scrolls to its section');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.nights .sub')].some(e => /23:00–04:30/.test(e.textContent))), 'a night with no time in bed ends when its stages do');
    await shot('recovery');
    // Heart and Insights are one part at a time, never pages long.
    for (const [t, parts] of [['recovery', ['rec', 'sleep', 'cardio']], ['review', ['energy', 'body', 'long', 'links']]]) {
      await go(t);
      for (const v of parts) { await part(t, v); const h = await page.evaluate(() => document.documentElement.scrollHeight / innerHeight); assert.ok(h < 2.6, `${t} ${v} is ${h.toFixed(1)} screens`); }
    }
    await go('recovery'); await page.tap('.subnav button[data-v="cardio"]'); await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('#view .block h2')].some(h => /Cardio with the H9/.test(h.textContent))), 'strap cardio lives on Heart');
    // No Train tab: an old link lands on Today, whose training card is two buttons: the next session and what you lifted.
    assert.strictEqual(await page.evaluate(() => document.querySelectorAll('#tabs a').length), 4);
    await go('training');
    assert.strictEqual(await page.evaluate(() => tab), 'today');
    assert.strictEqual(await page.evaluate(() => document.querySelectorAll('.trcard .rowb button').length), 2, 'two buttons');
    await page.tap('.trcard [data-act="trainlog"]'); await page.waitForTimeout(600);
    assert.ok(await page.evaluate(() => pop?.kind === 'train' && document.querySelector('#in-train').querySelectorAll(':scope > ul.list > li').length <= 4 + 7), 'short session list');
    await page.evaluate(() => closePop()); await page.waitForTimeout(400);
    await page.tap('.trcard [data-act="nextgo"]'); await page.waitForTimeout(600);
    assert.ok(await page.evaluate(() => pop?.kind === 'next' && !!document.querySelector('#sheet .nextog li')), 'the next session opens as a sheet with its exercises');
    await page.evaluate(() => closePop()); await page.waitForTimeout(400);
    await go('review'); await part('review', 'links');
    const lk = await page.evaluate(() => [...document.querySelectorAll('.lrow, .lneed span')].map(e => e.textContent));
    assert.ok(lk.length >= 5, lk.join(' | '));
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.lrow')].every(r => /No clear effect|\(.* to .*\)/.test(r.textContent))), 'every link with an effect carries its interval');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.lneed span')].every(e => /\d+ more days/.test(e.textContent))), 'links still waiting say how long');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('#in-links > .lrows .lrow')].every(r => !/No clear effect|Hint/.test(r.textContent))), 'only real links are in view');
    await part('review', 'energy');
    assert.ok(await page.evaluate(() => /kcal a day/.test(document.getElementById('in-burn')?.textContent || '')), 'the learned burn is shown');
  });
  await test('food: an Amul pack from its label, weighed by the gram, with carbs and fat on Today', async () => {
    await go('add-snack');
    await page.tap('.chips button[data-c="amul"]');
    await shot('add-amul');
    await page.tap('li[data-flash="snackamul_pbm"] .add');
    await go('food');
    const line = await page.evaluate(() => document.querySelector('.macros')?.textContent || '');
    assert.ok(/Carbs \d+ g/.test(line) && /Fat \d+ g/.test(line), line);
    const i = await page.evaluate(() => S.food[todayKey()].findIndex(e => e.id === 'amul_pbm'));
    await page.evaluate(i => openPop({ kind: 'fedit', i }), i); await page.waitForTimeout(400);
    await page.fill('#fg', '300'); await page.waitForTimeout(150);
    const e = await page.evaluate(i => S.food[todayKey()][i], i);
    assert.strictEqual(e.q, 1.5); assert.strictEqual(e.c, 8); assert.strictEqual(e.src, 'label');
    assert.ok(/Per 100 ml: 54 kcal/.test(await page.evaluate(() => document.getElementById('fsum').textContent)));
    await shot('food-edit');
    await page.evaluate(() => closePop());
  });
  await test('search speaks Marathi, Hindi and English, forgives a typo, and finds Pune food', async () => {
    await go('add-lunch');
    const top = async q => { await page.fill('#q', q); await page.waitForTimeout(120); return page.evaluate(() => [...document.querySelectorAll('#rows .nm')].slice(0, 4).map(e => e.textContent)); };
    assert.ok((await top('chawal')).some(n => /Bhaat/.test(n)), 'chawal finds bhaat');
    assert.ok((await top('anda')).some(n => /Egg|Anda/.test(n)), 'anda finds eggs');
    assert.match((await top('chapti'))[0], /Chapati/, 'a missing letter is forgiven');
    assert.ok((await top('pizza')).length >= 4, 'pizza has its own choices');
    assert.ok((await top('kolhapuri misal')).some(n => /Kolhapuri misal/.test(n)));
    assert.ok((await top('mastani')).some(n => /mastani/.test(n)));
    await page.tap('[data-act="qclear"]');
    assert.strictEqual(await page.inputValue('#q'), '');
  });
  await test('hold a food for any amount; tap still adds one', async () => {
    await go('add-lunch');
    await page.evaluate(() => { delete S.food[todayKey()]; save(); refreshAdd(); });
    const r = await page.evaluate(() => { const b = document.querySelector('li[data-id="chapati"] .nm').getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
    await page.waitForTimeout(650);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
    assert.ok(await page.isVisible('#pqin'), 'the portion sheet opened');
    assert.ok(!(await page.evaluate(() => S.food[todayKey()])), 'the hold itself added nothing');
    await page.fill('#pqin', '2.5'); await page.waitForTimeout(100);
    await page.tap('.seg button[data-act="pmeal"][data-v="dinner"]');
    await shot('portion');
    await page.tap('[data-act="padd"]'); await page.waitForTimeout(400);
    const e = await page.evaluate(() => S.food[todayKey()].find(x => x.id === 'chapati'));
    assert.strictEqual(e.q, 2.5); assert.strictEqual(e.m, 'dinner');
    await page.tap('li[data-id="varan"] .nm'); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => S.food[todayKey()].find(x => x.id === 'varan')?.q), 1, 'a tap adds one');
  });
  await test('a logged food: typed amount, its own numbers, another day, a plate, and back', async () => {
    await go('today');
    const i = await page.evaluate(() => S.food[todayKey()].findIndex(e => e.id === 'chapati'));
    await page.evaluate(i => openPop({ kind: 'fedit', i }), i); await page.waitForTimeout(400);
    await page.fill('#fqin', '1.75'); await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(i => S.food[todayKey()][i].q, i), 1.75, 'any amount can be typed');
    await page.tap('details.more summary'); await page.fill('#e_k', '130'); await page.fill('#e_n', 'Chapati, big');
    await page.tap('[data-act="fnum"]'); await page.waitForTimeout(300);
    const e = await page.evaluate(i => S.food[todayKey()][i], i);
    assert.strictEqual(e.k, 130); assert.strictEqual(e.n, 'Chapati, big'); assert.notStrictEqual(e.id, 'chapati', 'it became its own entry');
    assert.strictEqual(await page.evaluate(() => food('chapati').k), 100, 'the library food is unchanged');
    await page.evaluate(i => openPop({ kind: 'fedit', i }), i); await page.waitForTimeout(400);
    await page.evaluate(() => { document.querySelectorAll('details.more')[1].open = true; });
    await page.tap('[data-act="fcopyd"][data-d="-1"]'); await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => (S.food[shift(todayKey(), -1)] || []).some(x => x.n === 'Chapati, big')), 'copied to the day before');
    // Two foods in lunch, then saved as a plate.
    await go('food'); await page.evaluate(() => { day = todayKey(); S.food[todayKey()].forEach(x => { x.m = 'lunch'; }); save(); render(); });
    await page.tap('[data-act="psaveopen"][data-m="lunch"]'); await page.waitForTimeout(400);
    await page.fill('#pl_n', 'My usual lunch'); await page.tap('[data-act="psave"]'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => S.plates[0]?.n), 'My usual lunch');
    assert.strictEqual(await page.evaluate(() => sanitize(JSON.parse(JSON.stringify(S))).plates[0].items.length), 2, 'a plate survives saving and loading');
    await go('add-dinner'); await page.tap('.chips button[data-c="thali"]');
    await page.tap('li.plate[data-i="0"] .nm'); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => S.food[todayKey()].filter(x => x.m === 'dinner').length), 2, 'the plate went in with one tap');
    await page.evaluate(() => { const y = shift(todayKey(), -1); delete S.food[todayKey()]; if (S.food[y]) S.food[y] = S.food[y].filter(x => x.n !== 'Chapati, big'); S.plates = []; save(); });
  });
  await test('the log button: a meal from anywhere, the amount by ruler, one back gesture home', async () => {
    await go('recovery');
    await page.tap('#fab'); await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => document.querySelectorAll('.qgrid .qa').length) >= 12, 'every kind of log is offered');
    await page.tap('.qgrid [data-m="dinner"]:not([data-c])'); await page.waitForTimeout(700);
    assert.deepStrictEqual(await page.evaluate(() => [overlay?.type, overlay?.key, pop]), ['add', 'dinner', null]);
    // Hold a food: its amount, then drag the ruler three quarters further.
    await page.evaluate(() => PRESS.food(document.querySelector('#rows li[data-press]')));
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => { const q = document.querySelector('.sheet .scrub').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await page.mouse.move(r[0], r[1]); await page.mouse.down();
    for (let i = 1; i <= 11; i++) { await page.mouse.move(r[0] - i * 6, r[1]); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(700);
    assert.strictEqual(await page.evaluate(() => PORT.q), 1.75, 'dragging the ruler sets the amount');
    assert.strictEqual(await page.evaluate(() => +document.getElementById('pqin').value), 1.75, 'and the field follows');
    const id = await page.evaluate(() => pop.id);
    await page.tap('[data-act="padd"]'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(id => S.food[todayKey()].find(e => e.id === id && e.m === 'dinner')?.q, id), 1.75);
    assert.ok(await page.evaluate(id => S.food[todayKey()].find(e => e.id === id).t > 1e12, id), 'a log made on the day keeps its time');
    await page.tap('.addfoot .solid'); await page.waitForTimeout(700);
    assert.strictEqual(await page.evaluate(() => location.hash), '#recovery', 'Done goes back to where the log button was pressed');
  });
  await test('Food: a swipe across the page changes the day, never past today; the strip goes to any day', async () => {
    await go('food'); await page.evaluate(() => { day = todayKey(); render(); scrollTo(0, 0); });
    const y = await page.evaluate(() => { const r = document.querySelector('.fsum').getBoundingClientRect(); return Math.round(r.top + 40); });
    await drag(330, y, 60, y + 6);
    assert.strictEqual(await page.evaluate(() => day === todayKey()), true, 'no day after today');
    await drag(60, y, 330, y + 6);
    assert.strictEqual(await page.evaluate(() => day), await page.evaluate(() => shift(todayKey(), -1)));
    await page.evaluate(() => { location.hash = 'food'; });
    const first = await page.evaluate(() => document.querySelector('.ds:not([disabled])')?.dataset.k);
    assert.ok(first, 'the week strip offers a day: ' + await page.evaluate(() => JSON.stringify({ tab, day, overlay, hash: location.hash, view: document.getElementById('view').innerText.slice(0, 200), ds: [...document.querySelectorAll('.ds')].map(b => b.dataset.k + (b.disabled ? '×' : '')) })));
    await page.tap('.ds:not([disabled])'); await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => day), first);
    await page.evaluate(() => { day = todayKey(); render(); });
  });
  await test('weigh in: steppers, a reading kept, a typo caught and undone', async () => {
    await go('today');
    await page.evaluate(() => { delete S.weights[todayKey()]; save(); render(); });
    await page.tap('.duo .card.tap'); await page.waitForTimeout(400);
    const base = await page.evaluate(() => +document.getElementById('wgin').value);
    await page.tap('[data-act="wg"][data-d="1"]'); await page.tap('[data-act="wg"][data-d="1"]');
    await page.tap('[data-act="wgsave"]'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => S.weights[todayKey()]), Math.round((base + 0.2) * 10) / 10);
    await page.tap('.duo .card.tap'); await page.waitForTimeout(400);
    await page.fill('#wgin', String(base + 9)); await page.tap('[data-act="wgsave"]'); await page.waitForTimeout(400);
    assert.match(await page.textContent('#toast'), /from your trend\. A typo\?/);
    await page.tap('#toast button'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => S.weights[todayKey()]), Math.round((base + 0.2) * 10) / 10, 'undo puts the reading back');
  });
  await test('protein reaching its target is felt and said, once', async () => {
    await go('food');
    await page.evaluate(() => { day = todayKey(); delete S.food[todayKey()]; save(); render(); });
    const T = await page.evaluate(() => targets().protein);
    await page.evaluate(n => { const f = food('whey'); for (let i = 0; i < n; i++) bump('lunch', f, 1); }, Math.ceil(T / 24));
    await page.waitForTimeout(100);
    assert.match(await page.textContent('#toast'), /Protein target reached/);
    await page.evaluate(() => { delete S.food[todayKey()]; save(); render(); });
  });
  await test('a Zepp export zip, password-locked, comes in from the phone: wrong password said, right one previewed and imported', async () => {
    await go('set-sources');
    await page.setInputFiles('#wfile', path.join(__dirname, 'fixtures', 'zepp-aes.zip'));
    await page.waitForSelector('#wzippw', { timeout: 8000 });
    await page.fill('#wzippw', 'not it'); await page.tap('[data-act="wunlock"]');
    await page.waitForFunction(() => /did not open it/.test(document.body.textContent), null, { timeout: 8000 });
    await page.fill('#wzippw', 'Zepp-4821'); await page.press('#wzippw', 'Enter');
    await page.waitForSelector('[data-act="wsave"]', { timeout: 15000 });
    const prev = await page.evaluate(() => watchPreview.map(f => [f.kind, f.kind ? Object.keys(f.P.days).length : f.name]));
    assert.deepStrictEqual(prev.filter(x => x[0]).map(x => x.join(':')).sort(), ['heart rate:3', 'sleep:500', 'steps:500', 'weight:72']);
    await shot('zepp-preview');
    const before = await page.evaluate(() => Object.keys(S.sleepx).length);
    await page.tap('[data-act="wsave"]'); await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => Object.keys(S.sleepx).length) >= Math.max(before, 499), 'the nights are in');
    assert.match(await page.textContent('#toast'), /Imported \d+ days/);
    await page.tap('#toast button'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => Object.keys(S.sleepx).length), before, 'and undo takes them out');
  });
  await test('a Health Connect backup zip comes in the same way: what it holds is listed, imported, and undone', async () => {
    await go('set-sources');
    const before = await page.evaluate(() => [Object.keys(S.steps).length, Object.keys(S.ex).length]);
    await page.setInputFiles('#wfile', path.join(__dirname, 'fixtures', 'hc-backup.zip'));
    await page.waitForSelector('[data-act="wsave"]', { timeout: 15000 });
    const text = await page.textContent('#view');
    assert.match(text, /Health Connect backup · watch: Zepp/);
    assert.match(text, /Steps120 days, 3 Mar 2026 to 30 Jun 2026/);
    assert.match(text, /Workouts151/);
    await shot('hc-preview');
    await page.tap('[data-act="wsave"]'); await page.waitForTimeout(500);
    assert.match(await page.textContent('#toast'), /Imported 120 days and \d+ workouts/);
    assert.ok(await page.evaluate(() => S.sleepx['2026-06-30']?.nap === 40), 'the nights are in');
    await page.tap('#toast button'); await page.waitForTimeout(400);
    assert.deepStrictEqual(await page.evaluate(() => [Object.keys(S.steps).length, Object.keys(S.ex).length]), before, 'and undo takes them out');
  });
  await test('a Gadgetbridge export comes in the same way: the Bip 6 named, its minutes made days, imported, and undone', async () => {
    await go('set-sources');
    const before = await page.evaluate(() => [Object.keys(S.steps).length, Object.keys(S.sleepx).length]);
    await page.setInputFiles('#wfile', { name: 'Gadgetbridge_20260701.zip', mimeType: 'application/zip', buffer: fs.readFileSync(path.join(__dirname, 'fixtures', 'gadgetbridge.zip')) });
    await page.waitForSelector('[data-act="wsave"]', { timeout: 15000 });
    const text = await page.textContent('#view');
    assert.match(text, /Gadgetbridge database\. From Amazfit Bip 6 and Amazfit Bip\./);
    assert.match(text, /Steps40 days, 22 May 2026 to 30 Jun 2026/);
    assert.match(text, /the one worn longer that day counts/);
    await shot('gb-preview');
    await page.tap('[data-act="wsave"]'); await page.waitForTimeout(500);
    assert.match(await page.textContent('#toast'), /Imported 40 days and 4 workouts/);
    assert.ok(await page.evaluate(() => S.sleepx['2026-06-21']?.nap === 45 && S.steps['2026-06-03'] === 8400), 'nights and steps are in, the old watch’s steps not added');
    await page.tap('#toast button'); await page.waitForTimeout(400);
    assert.deepStrictEqual(await page.evaluate(() => [Object.keys(S.steps).length, Object.keys(S.sleepx).length]), before, 'and undo takes them out');
  });
  await test('a sheet is dragged down from its middle, the page sinking behind it until it goes', async () => {
    await go('today'); await page.evaluate(() => scrollTo(0, 0));
    await page.tap('#fab'); await page.waitForTimeout(700);
    const st = await page.evaluate(() => ({ up: document.documentElement.classList.contains('sheet-up'), sc: getComputedStyle(document.getElementById('view')).transform }));
    assert.ok(st.up, 'an open sheet lifts fully');
    assert.notStrictEqual(st.sc, 'none', 'the page behind recedes');
    const r = await page.evaluate(() => { const q = document.querySelector('.sheet .qgrid').getBoundingClientRect(); return [q.left + q.width / 2, q.top + 40]; });
    // A slow drag that stops short springs back.
    await drag(r[0], r[1], r[0], r[1] + 60);
    assert.ok(await page.evaluate(() => pop?.kind === 'log'), 'a short drag keeps it open');
    // A flick down from the middle of the sheet closes it.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r[0], y: r[1] }] });
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r[0], y: r[1] + i * 40 }] }); await page.waitForTimeout(12); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1400);
    assert.deepStrictEqual(await page.evaluate(() => [pop, document.body.classList.contains('sheet-open'), document.getElementById('view').style.transform]), [null, false, '']);
  });
  await test('the insight card is a deck: a fling brings the next', async () => {
    await go('today'); await page.evaluate(() => scrollTo(0, 0));
    const has = await page.evaluate(() => !!document.querySelector('.insight.deck'));
    if (!has) return;   // one insight only: nothing to fling to
    const before = await page.evaluate(() => document.querySelector('.insight b').textContent);
    await page.evaluate(() => document.querySelector('.insight').scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
    const r = await page.evaluate(() => { const q = document.querySelector('.insight').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await drag(r[0], r[1], r[0] - 260, r[1] + 4);
    await page.waitForTimeout(600);
    assert.notStrictEqual(await page.evaluate(() => document.querySelector('.insight b').textContent), before);
    assert.strictEqual(await page.evaluate(() => tab), 'today', 'the fling is the card’s, not a tab swipe');
  });
  await test('a toast is flung away', async () => {
    await page.evaluate(() => toast('Testing', 8000));
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const q = document.getElementById('toast').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await drag(r[0], r[1], r[0] + 200, r[1]);
    await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => document.getElementById('toast').classList.contains('show')), false);
  });
  await test('packs by barcode: a typed number is found offline, judged, and logged; an unknown pack is learned', async () => {
    await go('today'); await page.evaluate(() => { day = todayKey(); });
    await page.evaluate(() => navTo(`scan-lunch`)); await page.waitForTimeout(900);
    assert.strictEqual(await page.evaluate(() => overlay?.type), 'scan');
    await page.evaluate(() => offLoad());
    await page.fill('#scancode', '8901262010023'); await page.waitForTimeout(700);
    const card = await page.evaluate(() => ({ n: SCAN.hit?.n, v: document.querySelectorAll('.pv li').length, h: document.querySelector('.scard h2')?.textContent }));
    assert.ok(/butter/i.test(card.h), `found: ${card.h}`);
    assert.ok(card.v >= 2, 'the pack is judged per 100 kcal');
    await page.tap('[data-act="scanadd"]'); await page.waitForTimeout(600);
    assert.strictEqual(await page.evaluate(() => pop?.kind), 'portion');
    await page.tap('[data-act="padd"]'); await page.waitForTimeout(600);
    const e = await page.evaluate(() => (S.food[todayKey()] || []).find(x => x.id === 'b8901262010023'));
    assert.ok(e && e.k > 0 && e.c != null && e.ft != null && e.g, 'logged with its panel, carbs and fat');
    // Not in the list: its label is entered once, and the number finds it from then on.
    await page.evaluate(() => scanFound('4006381333931')); await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => SCAN.miss === '4006381333931' || !!SCAN.hit));
    if (await page.evaluate(() => !!SCAN.miss)) {
      await page.tap('[data-act="scanlabel"]'); await page.waitForTimeout(900);
      assert.deepStrictEqual(await page.evaluate(() => [overlay?.type, cat, CUSTOM.bc]), ['add', 'mine', '4006381333931']);
      await page.fill('#c_n', 'Test bar'); await page.fill('#c_g', '40'); await page.fill('#c_k', '400'); await page.fill('#c_p', '20'); await page.fill('#c_c', '40'); await page.fill('#c_ft', '16');
      await page.tap('[data-act="custom"]'); await page.waitForTimeout(400);
      assert.strictEqual(await page.evaluate(() => lookupCode('4006381333931')?.n), 'Test bar');
    }
    // Packs come up by name in the search too.
    await go('add-snack'); await page.waitForTimeout(400);
    await page.fill('#q', 'haldiram bhujia'); await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => document.querySelectorAll('#rows li[data-id^="b"]').length) > 0, 'Haldiram packs found by name');
    // Whole foods from OpenNutrition come up too, and log with their numbers.
    await page.fill('#q', 'quinoa'); await page.waitForTimeout(500);
    const wid = await page.evaluate(() => document.querySelector('#rows li[data-id^="n"]')?.dataset.id);
    assert.ok(wid, 'quinoa found in OpenNutrition');
    await page.tap(`#rows li[data-id="${wid}"] .grow`); await page.waitForTimeout(300);
    const w = await page.evaluate(id => (S.food[todayKey()] || []).find(x => x.id === id), wid);
    assert.ok(w && w.k > 0 && w.c != null && w.src === 'on', JSON.stringify(w));
    // Indian recipes from INDB come up under their own heading, first, and log as one serving with its numbers.
    await page.fill('#q', 'masoor'); await page.waitForTimeout(500);
    const heads = await page.evaluate(() => [...document.querySelectorAll('#rows .subhead')].map(e => e.textContent.trim()));
    assert.match(heads[0] || '', /^Indian recipes · INDB$/);
    const iid = await page.evaluate(() => document.querySelector('#rows li[data-id^="i"]')?.dataset.id);
    assert.ok(/^i(ASC|BFP|OSR)\d{3}$/.test(iid || ''), `an INDB recipe: ${iid}`);
    await page.tap(`#rows li[data-id="${iid}"] .grow`); await page.waitForTimeout(300);
    const r = await page.evaluate(id => (S.food[todayKey()] || []).find(x => x.id === id), iid);
    assert.ok(r && r.k > 0 && r.p > 0 && r.c != null && r.ft != null && r.g >= 10, JSON.stringify(r));
    assert.ok(await page.evaluate(id => food(id)?.src === 'indb', iid), 'it is found again by its id after logging');
    await go('today');
  });
  await test('a tab opens at the part its link names', async () => {
    await go('recovery-sleep');
    assert.deepStrictEqual(await page.evaluate(() => [tab, SUB.recovery, !!document.getElementById('rc-sleep'), document.querySelector('#tabs a.on')?.hash]), ['recovery', 'sleep', true, '#recovery']);
    await go('review-links');
    assert.deepStrictEqual(await page.evaluate(() => [tab, SUB.review, !!document.getElementById('in-links')]), ['review', 'links', true]);
    await go('today');
  });
  // Nothing drawn on a screen may sit on top of text: no two runs of text overlap, and no icon, button, meter or
  // input covers text it does not contain. Rings (text in the middle of a drawn circle) are what they are.
  await test('no text is covered by other text or by anything drawn, on any main screen or the log sheet', async () => {
    const audit = () => {
      const out = [], scope = document.querySelector('#sheet .sheet') || document.getElementById('view');
      const fixedUp = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
      const inSheet = !!scope.closest('#sheet'), boxes = [], tw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) {
        const t = tw.currentNode; if (!t.nodeValue.trim()) continue;
        const el = t.parentElement, cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || +cs.opacity === 0 || el.closest('details:not([open]) > :not(summary)') || (!inSheet && fixedUp(el))) continue;
        let clip = null; for (let e = el; e && e !== scope; e = e.parentElement) if (getComputedStyle(e).overflowX !== 'visible' && !e.matches('.chips, .seg.scroll, .scrub, .scrub *')) { clip = e.getBoundingClientRect(); break; }
        const r = document.createRange(); r.selectNodeContents(t);
        for (const b0 of r.getClientRects()) {
          const b = clip ? { l: Math.max(b0.left, clip.left), r: Math.min(b0.right, clip.right), t: Math.max(b0.top, clip.top), b: Math.min(b0.bottom, clip.bottom) } : { l: b0.left, r: b0.right, t: b0.top, b: b0.bottom };
          if (b.r - b.l > 1 && b.b - b.t > 1) boxes.push({ el, b, s: t.nodeValue.trim().slice(0, 24) });
        }
      }
      const hit = (a, b, mx, my) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > mx && Math.min(a.b, b.b) - Math.max(a.t, b.t) > my;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxes[i].el !== boxes[j].el && hit(boxes[i].b, boxes[j].b, 2, 3)) out.push(`"${boxes[i].s}" × "${boxes[j].s}"`);
      for (const o of scope.querySelectorAll('svg, button, input, .ico, .dot, .meter2, .chev, img')) {
        if (o.closest('.ring, .dr, details:not([open]) > :not(summary)') || (!inSheet && fixedUp(o)) || getComputedStyle(o).display === 'none') continue;
        const R = o.getBoundingClientRect(), ob = { l: R.left, r: R.right, t: R.top, b: R.bottom };
        for (const x of boxes) if (!o.contains(x.el) && !x.el.contains(o) && hit(ob, x.b, 3, 4)) out.push(`${o.tagName.toLowerCase()}.${o.className.baseVal ?? o.className} over "${x.s}"`);
      }
      return out;
    };
    const bad = [];
    for (const h of ['today', 'food', 'recovery-rec', 'recovery-sleep', 'recovery-cardio', 'review-energy', 'review-body', 'review-long', 'review-links', 'me', 'set-train']) {
      await go(h); await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
      bad.push(...(await page.evaluate(audit)).map(x => `${h}: ${x}`));
      // Scrolled to the end, the last thing on the page clears the tab bar, and the log button sits inside the bar.
      const end = await page.evaluate(() => { scrollTo(0, 1e6); const v = document.getElementById('view').lastElementChild.getBoundingClientRect(), t = document.getElementById('tabs').getBoundingClientRect(), f = document.getElementById('fab').getBoundingClientRect();
        if (getComputedStyle(document.getElementById('tabs')).display === 'none') return { last: 0, bar: 0, fab: true };
        return { last: Math.round(v.bottom), bar: Math.round(t.top), fab: getComputedStyle(document.getElementById('fab')).display === 'none' || (f.top >= t.top - 1 && f.bottom <= t.bottom + 1) }; });
      if (end.last > end.bar + 1) bad.push(`${h}: the page ends ${end.last - end.bar} px under the tab bar`);
      if (!end.fab) bad.push(`${h}: the log button floats outside the tab bar`);
    }
    await go('today'); await page.evaluate(() => openPop({ kind: 'log' })); await page.waitForTimeout(700);
    bad.push(...(await page.evaluate(audit)).map(x => `log sheet: ${x}`));
    await page.evaluate(() => closePop()); await page.waitForTimeout(400);
    assert.ok(!bad.length, bad.join(' | '));
  });
  await test('no errors were thrown on any screen', async () => assert.deepStrictEqual(errors, []));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close(); srv.close();
  process.exit(failed ? 1 : 0);
})();

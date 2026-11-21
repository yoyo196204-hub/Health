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

  for (const tab of ['today', 'recovery', 'training', 'review', 'me']) await test(`${tab}: a finger scrolls the page`, async () => {
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
  await test('recovery, training, review: the inputs behind the verdict, nights that end, short session list, honest links', async () => {
    await page.evaluate(() => { const k = shift(todayKey(), -1); S.sleepx[k] = { d: 60, l: 200, r: 60, w: 10, on: -60 }; S.sleep[k] = 5.5; save(); });
    await go('recovery');
    assert.ok(await page.evaluate(() => document.querySelectorAll('.rhero .part').length) >= 2, 'the recovery number shows its parts');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.nights .sub')].some(e => /23:00–04:30/.test(e.textContent))), 'a night with no time in bed ends when its stages do');
    await page.evaluate(() => { const k = todayKey(); S.sleep[k] = 6.2; save(); render(); });
    await page.tap('.part[data-to="rc-sleep"]'); await page.waitForTimeout(700);
    assert.ok(await page.evaluate(() => Math.abs(document.getElementById('rc-sleep').getBoundingClientRect().top) < 200), 'tapping an input scrolls to its section');
    await shot('recovery');
    await go('training');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('#view .block')].findIndex(b => /This week/.test(b.textContent)) < [...document.querySelectorAll('#view .block')].findIndex(b => /Last three weeks/.test(b.textContent))));
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('#view .block')].find(b => /Last three weeks/.test(b.querySelector('h2').textContent)).querySelectorAll(':scope > ul.list > li').length <= 4 + 7));
    await go('review');
    const lk = await page.evaluate(() => [...document.querySelectorAll('.lrow, .lneed span')].map(e => e.textContent));
    assert.ok(lk.length >= 5, lk.join(' | '));
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.lrow')].every(r => /No clear effect|\(.* to .*\)/.test(r.textContent))), 'every link with an effect carries its interval');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.lneed span')].every(e => /\d+ more days/.test(e.textContent))), 'links still waiting say how long');
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
  await test('no errors were thrown on any screen', async () => assert.deepStrictEqual(errors, []));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close(); srv.close();
  process.exit(failed ? 1 : 0);
})();

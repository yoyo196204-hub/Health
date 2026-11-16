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
    assert.deepStrictEqual(s, { tab: 'recovery', tr: '' });
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
  await test('food: an Amul pack from its label, weighed by the gram, with carbs and fat on Today', async () => {
    await go('add-snack');
    await page.tap('.chips button[data-c="amul"]');
    await shot('add-amul');
    await page.tap('li[data-flash="snackamul_pbm"] .add');
    await go('today');
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
  await test('no errors were thrown on any screen', async () => assert.deepStrictEqual(errors, []));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close(); srv.close();
  process.exit(failed ? 1 : 0);
})();

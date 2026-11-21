'use strict';
// The scanner: a packaged food by its barcode, read by the camera, looked up on the phone.
//
// Where the numbers come from, in order: your own foods (any you saved with a barcode), then Open Food Facts
// (products.js: every product sold in India with a nutrition panel, and the most-scanned ones worldwide, checked
// against their own macros). Nothing is looked up online: the app has no internet. A pack that is not there is
// entered once from its label, with the barcode, and is found by the scanner from then on.
//
// Reading the barcode: the browser's own BarcodeDetector where it has one (Chrome on Android), otherwise ZXing
// (zxing.min.js, Apache-2.0), which reads EAN-13, EAN-8, UPC-A and UPC-E from the camera frames. Both are loaded
// only when the scanner opens, so they cost nothing the rest of the time.
const SCAN = { stream: null, raf: 0, busy: false, last: '', lastN: 0, hit: null, miss: null, err: '', torch: false, det: null, zx: null, code: '' };
let OFF = null;              // { map: code -> line, rows: [[hay, code]] } once products.js is in
function loadScript(src) {
  return new Promise((ok, no) => {
    if (document.querySelector(`script[data-lazy="${src}"]`)) return ok();
    const s = document.createElement('script');
    s.src = `${src}?v=${BUILD}`; s.dataset.lazy = src; s.onload = ok; s.onerror = () => no(new Error(`${src} did not load`));
    document.head.appendChild(s);
  });
}
// The product list, read once into an index by barcode and a search list by name and brand.
function offLoad() {
  if (OFF) return Promise.resolve(OFF);
  return offLoad.p ||= loadScript('products.js').then(() => {
    const map = new Map(), rows = [];
    for (const line of (self.OFFDB || '').split('\n')) {
      const i = line.indexOf('|');
      if (i < 8) continue;
      const code = line.slice(0, i), [, n, b] = line.split('|', 3);
      map.set(code, line); rows.push([fnorm(`${n} ${b}`), code]);
    }
    self.OFFDB = '';
    OFF = { map, rows };
    if (overlay?.type === 'add' && query) refreshAdd();
    return OFF;
  });
}
// A product line as a food: one serving as the pack prints it when it gives one in grams, else 100 g (or ml).
function offFood(id) {
  if (!OFF || !/^b\d{8,14}$/.test(id || '')) return null;
  const line = OFF.map.get(id.slice(1));
  if (!line) return null;
  const [code, n, brand, pack, sv, sg, k, p, c, ft, fb, sug, salt, nova, ns] = line.split('|'), x = s => (s === '' ? null : +s);
  const ml = /\bml\b|\bl\b|litre/i.test(pack) && !/\bg\b|kg/i.test(pack), unit = ml ? 'ml' : 'g';
  const g = x(sg) || 100, f = g / 100;
  // Brand first when the name leaves it out; a name typed all in lower case gets its capitals.
  const cap = x => x && x === x.toLowerCase() ? x.replace(/(^|\s)\p{L}/gu, c => c.toUpperCase()) : x;
  const name = cap(brand && !fnorm(n).includes(fnorm(brand).split(' ')[0]) ? `${brand} ${n}` : n);
  const food = { id, n: name.slice(0, 80), u: sg ? `1 serving (${Math.round(g)} ${unit})` : `100 ${unit}`, g, k: Math.round(x(k) * f * 10) / 10, p: r1((x(p) || 0) * f), fb: r1((x(fb) || 0) * f), cat: 'pack', src: 'label',
    bc: code, per100: { k: x(k), p: x(p), c: x(c), ft: x(ft), fb: x(fb), sug: x(sug), salt: x(salt) }, pack, nova: x(nova), ns, unit };
  if (x(c) != null && x(ft) != null) Object.assign(food, { c: r1(x(c) * f), ft: r1(x(ft) * f) });
  return food;
}
// Packs by name, for the search on Add food: every word must be in the name or the brand.
function offSearch(q, n = 12) {
  if (!OFF) return [];
  const words = fnorm(q).split(' ').filter(w => w.length > 1);
  if (!words.length || words.join('').length < 3) return [];
  const out = [];
  for (const [hay, code] of OFF.rows) {
    if (words.every(w => hay.includes(w))) { out.push(offFood('b' + code)); if (out.length >= n) break; }
  }
  return out.filter(Boolean);
}
// The check digit of an EAN or UPC: a misread digit almost never passes it.
function eanOK(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const d = code.split('').map(Number), last = d.pop();
  const s = d.reverse().reduce((a, v, i) => a + v * (i % 2 ? 1 : 3), 0);
  return (10 - s % 10) % 10 === last;
}
// A code may come as UPC-A (12) or as the same product's EAN-13 (a leading 0); try both.
function lookupCode(code) {
  const alt = [code, code.length === 12 ? '0' + code : code.length === 13 && code[0] === '0' ? code.slice(1) : null].filter(Boolean);
  for (const c of alt) { const own = S.custom.find(f => f.bc === c); if (own) return own; }
  for (const c of alt) { const f = offFood('b' + c); if (f) return f; }
  return null;
}

// ---------- the camera ----------
async function scanStart() {
  if (SCAN.stream || SCAN.starting) return;
  SCAN.starting = true; SCAN.err = '';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (overlay?.type !== 'scan') { stream.getTracks().forEach(t => t.stop()); return; }
    SCAN.stream = stream;
    const v = $('#scanv');
    if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
    await scanDecoder();
    scanLoop();
  } catch (e) {
    SCAN.err = e?.name === 'NotAllowedError' ? 'denied' : e?.message === 'nocam' ? 'nocam' : 'fail';
    render();
  } finally { SCAN.starting = false; }
}
function scanStop() {
  cancelAnimationFrame(SCAN.raf); SCAN.raf = 0;
  SCAN.stream?.getTracks().forEach(t => t.stop()); SCAN.stream = null; SCAN.torch = false;
}
async function scanDecoder() {
  if (SCAN.det || SCAN.zx) return;
  try {
    if ('BarcodeDetector' in self) {
      const have = await BarcodeDetector.getSupportedFormats();
      const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter(f => have.includes(f));
      if (want.length) { SCAN.det = new BarcodeDetector({ formats: want }); return; }
    }
  } catch (e) { /* fall through to ZXing */ }
  await loadScript('zxing.min.js');
  const Z = self.ZXing, hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  SCAN.zx = new Z.MultiFormatReader(); SCAN.zx.setHints(hints);
}
// One frame: the middle of the picture, where the guide is, read for a barcode.
async function scanFrame(src, w, h) {
  if (SCAN.det) { const r = await SCAN.det.detect(src); return r[0]?.rawValue || null; }
  if (!SCAN.zx) return null;
  const cv = scanFrame.cv ||= document.createElement('canvas'), Z = self.ZXing;
  const cw = Math.min(960, w), ch = Math.round(cw * 0.45), sx = (w - w * 0.9) / 2, sw = w * 0.9, sh = sw * 0.45, sy = (h - sh) / 2;
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
  try { return SCAN.zx.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)))).getText(); }
  catch (e) { return null; } finally { SCAN.zx.reset(); }
}
function scanLoop() {
  let t = 0;
  const tick = async now => {
    if (!SCAN.stream || overlay?.type !== 'scan') return;
    SCAN.raf = requestAnimationFrame(tick);
    const v = $('#scanv');
    if (SCAN.busy || SCAN.hit || SCAN.miss || !v || v.readyState < 2 || now - t < 110) return;
    t = now; SCAN.busy = true;
    try {
      const code = await scanFrame(v, v.videoWidth, v.videoHeight);
      // A barcode must read the same twice in a row (and pass its check digit) before it counts.
      if (code && eanOK(code)) { if (code === SCAN.last) SCAN.lastN++; else { SCAN.last = code; SCAN.lastN = 1; } if (SCAN.lastN >= (SCAN.det ? 1 : 2)) scanFound(code); }
    } finally { SCAN.busy = false; }
  };
  SCAN.raf = requestAnimationFrame(tick);
}
async function scanFound(code) {
  await offLoad().catch(() => null);
  const f = lookupCode(code);
  SCAN.last = ''; SCAN.lastN = 0; SCAN.code = code;
  if (f) { SCAN.hit = f; SCAN.miss = null; buzz('ok'); } else { SCAN.miss = code; SCAN.hit = null; buzz('warn'); }
  render();
}
async function scanTorch() {
  const tr = SCAN.stream?.getVideoTracks()[0];
  if (!tr) return;
  try { SCAN.torch = !SCAN.torch; await tr.applyConstraints({ advanced: [{ torch: SCAN.torch }] }); buzz('tick'); render(); }
  catch (e) { SCAN.torch = false; toast('This camera has no light'); }
}
// Called after every render: the camera runs only while the scanner is on screen.
function scanKick() {
  if (overlay?.type === 'scan') {
    if (!SCAN.stream && !SCAN.err) scanStart();
    else if (SCAN.stream) { const v = $('#scanv'); if (v && v.srcObject !== SCAN.stream) { v.srcObject = SCAN.stream; v.play().catch(() => {}); } }
  } else if (SCAN.stream) { scanStop(); SCAN.hit = SCAN.miss = null; SCAN.err = ''; }
}

// ---------- what it says about a pack ----------
// For someone losing fat, three things on a label matter most, read per 100 kcal rather than per 100 g, because
// that is what fits into a fixed budget: how much protein comes with the energy, how dense the energy is (how much
// food a 100 kcal buys), and how much of it is added sugar. Ultra-processing (NOVA 4) is said, not scored.
function packVerdict(f) {
  const P = f.per100 || {}, out = [];
  if (P.k > 0) {
    const pp = P.p / P.k * 100;
    out.push([pp >= 8 ? 'good' : pp >= 4 ? 'mid' : 'bad', `${r1(pp)} g protein per 100 kcal`, pp >= 8 ? 'a high-protein food' : pp >= 4 ? 'some protein with the energy' : 'little protein for its energy']);
    out.push([P.k <= 150 ? 'good' : P.k <= 400 ? 'mid' : 'bad', `${fmt(P.k)} kcal per 100 ${f.unit || 'g'}`, P.k <= 150 ? 'light: a lot of food for the energy' : P.k <= 400 ? 'medium energy density' : 'dense: a small amount is a lot of energy']);
    if (P.sug != null) { const sp = P.sug * 4 / P.k * 100; out.push([sp <= 10 ? 'good' : sp <= 25 ? 'mid' : 'bad', `${Math.round(sp)}% of its energy from sugars`, sp <= 10 ? 'low in sugars' : sp <= 25 ? 'moderate sugars' : 'mostly sugar']); }
  }
  if (f.nova === 4) out.push(['mid', 'Ultra-processed (NOVA 4)', 'made mostly from refined ingredients and additives']);
  return out;
}
function packFit(f) {
  const T = targets(), left = T.kcal - totals(day).k, pl = T.protein - totals(day).p;
  if (!(f.k > 0)) return '';
  const per = left > 0 ? Math.round(f.k / left * 100) : null;
  return `One ${esc(f.u.replace(/^1 /, ''))}: ${fmt(f.k)} kcal${per != null ? `, ${per}% of the ${fmt(left)} left today` : ', and the day is already over target'}${pl > 0 && f.p ? ` · ${Math.round(f.p / pl * 100)}% of the protein to go` : ''}.`;
}

// ---------- the screen ----------
function vScan(meal) {
  const m = MEALS.some(x => x[0] === meal) ? meal : nextMeal();
  const head = masthead('Scan a pack', `Food · ${mealName(m).toLowerCase()}`, { before: `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>` });
  const err = { denied: 'The camera is not allowed. Allow it for Health in the phone’s settings, or type the number under the barcode.', nocam: 'No camera can be used here. Type the number under the barcode instead.', fail: 'The camera could not start. Type the number under the barcode instead.' }[SCAN.err];
  let card = '';
  if (SCAN.hit) {
    const f = SCAN.hit, V = packVerdict(f), P = f.per100;
    card = `<div class="scard" data-fling="scanagain"><div class="eyebrow">${f.cat === 'pack' ? 'Open Food Facts' : 'Your own food'} · ${esc(f.bc || SCAN.code)}</div><h2>${esc(f.n)}</h2>
      <p class="sub">${f.pack ? `${esc(f.pack)} pack · ` : ''}${esc(unitText(f))}</p>
      ${P ? `<div class="m4">${[['kcal', P.k, ''], ['protein', P.p, 'g'], ['carbs', P.c, 'g'], ['fat', P.ft, 'g']].map(([l, v, u]) => `<div><b class="num">${v == null ? DASH : r1(v)}${v != null && u ? `<i>${u}</i>` : ''}</b><span>${l}</span></div>`).join('')}</div><p class="sub small center">per 100 ${f.unit || 'g'}</p>` : ''}
      ${V.length ? `<ul class="pv">${V.map(([c, a, b]) => `<li class="${c}"><i></i><span><b>${a}</b><span class="sub">${b}</span></span></li>`).join('')}</ul>` : ''}
      <p class="sub">${packFit(f)}</p>
      <div class="rowb"><button class="ghost" data-act="scanagain">Scan another</button><button class="solid" data-act="scanadd" data-m="${m}">Choose amount</button></div></div>`;
  } else if (SCAN.miss) {
    card = `<div class="scard" data-fling="scanagain"><div class="eyebrow">${esc(SCAN.miss)}</div><h2>Not in the list on this phone</h2>
      <p class="sub">Copy its nutrition panel once, and the scanner knows this pack from then on.</p>
      <div class="rowb"><button class="ghost" data-act="scanagain">Scan again</button><button class="solid" data-act="scanlabel" data-m="${m}">Enter its label</button></div></div>`;
  }
  return `${head}
    <div class="scanbox ${SCAN.hit || SCAN.miss ? 'paused' : ''}"><video id="scanv" data-keep playsinline muted autoplay></video><div class="guide"><i></i></div>
      ${err ? `<p class="scanerr">${err}</p>` : !SCAN.stream ? '<p class="scanerr">Starting the camera…</p>' : ''}
      ${SCAN.stream ? `<button class="torch ${SCAN.torch ? 'on' : ''}" data-act="scantorch" aria-label="Light">${ic('bolt')}</button>` : ''}</div>
    ${card || `<p class="hint">Hold the barcode inside the frame, flat and lit</p>`}
    <div class="scanman"><input id="scancode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="14" placeholder="Or type the number under it" aria-label="Barcode number" autocomplete="off"><button class="ghost" data-act="scantype">Look up</button></div>`;
}
FLING.scanagain = () => { SCAN.hit = SCAN.miss = null; renderView(); };
function scanAct(a, el) {
  if (a === 'scango') { day = el.dataset.k || todayKey(); SCAN.hit = SCAN.miss = null; SCAN.err = ''; navTo(`scan-${el.dataset.m || nextMeal()}`); offLoad().catch(() => {}); return true; }
  if (a === 'scantorch') { scanTorch(); return true; }
  if (a === 'scanagain') { SCAN.hit = SCAN.miss = null; buzz('tick'); render(); return true; }
  if (a === 'scantype') {
    const c = ($('#scancode')?.value || '').replace(/\D/g, '');
    if (!eanOK(c)) { buzz('warn'); toast('That is not a whole barcode: check the digits'); return true; }
    $('#scancode').blur(); scanFound(c); return true;
  }
  if (a === 'scanadd') {
    const f = SCAN.hit;
    if (!f) return true;
    PORT.q = 1; PORT.m = el.dataset.m;
    openPop({ kind: 'portion', id: f.id });
    return true;
  }
  if (a === 'scanlabel') {
    // The own-food form on Add food, with the barcode kept for the next scan of this pack.
    CUSTOM.bc = SCAN.miss; CUSTOM.basis = '100'; addNext = 'mine';
    SCAN.miss = null;
    navTo(`add-${el.dataset.m}`);
    return true;
  }
  return false;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('scan.js');

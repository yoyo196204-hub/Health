'use strict';
// Packs: a packaged food by the barcode number you type, looked up on the phone.
//
// Where the numbers come from, in order: your own foods (any you saved with a barcode), then Open Food Facts
// (products.js: every product sold in India with a nutrition panel, and the most-scanned ones worldwide, checked
// against their own macros). Nothing is looked up online: the app has no internet. A pack that is not there is
// entered once from its label, with the barcode, and is found by the scanner from then on.

const SCAN = { hit: null, miss: null, code: '' };
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

// ---------- whole foods (OpenNutrition) ----------
// Everyday foods traced to national food tables, for the food search: what the library's own Indian and raw foods
// do not cover (tofu, quinoa, a cut of meat, a fruit). Loaded with the pack list, the first time Add food opens.
let WHOLE = null;
function wholeLoad() {
  if (WHOLE) return Promise.resolve(WHOLE);
  // Indian recipes from INDB come with it, in their own list, searched first.
  return wholeLoad.p ||= Promise.all([loadScript('whole.js'), loadScript('indb.js')]).then(() => {
    const read = s => { const map = new Map(), rows = []; for (const line of (s || '').split('\n')) { const id = line.slice(0, line.indexOf('|')); map.set(id, line); rows.push([fnorm(line.split('|', 2)[1]), id]); } return { map, rows }; };
    WHOLE = read(self.ONDB); WHOLE.indb = read(self.INDBD);
    self.ONDB = ''; self.INDBD = '';
    if (overlay?.type === 'add' && query) refreshAdd();
    return WHOLE;
  });
}
function wholeFood(id) {
  if (!WHOLE) return null;
  if (/^i(ASC|BFP|OSR)\d{3}$/.test(id || '')) return indbFood(id);
  if (!/^n[A-Za-z0-9]{6,20}$/.test(id || '')) return null;
  const line = WHOLE.map.get(id.slice(1));
  if (!line) return null;
  const [, n, u, sg, k, p, c, ft, fb, sug, tabs] = line.split('|'), x = s => (s === '' ? null : +s), g = +sg, f = g / 100;
  const food = { id, n, u, g, k: Math.round(x(k) * f * 10) / 10, p: r1(x(p) * f), fb: r1((x(fb) || 0) * f), cat: 'whole', src: 'on', tabs,
    per100: { k: x(k), p: x(p), c: x(c), ft: x(ft), fb: x(fb), sug: x(sug) }, unit: / ml\)/.test(u) ? 'ml' : 'g' };
  if (x(c) != null && x(ft) != null) Object.assign(food, { c: r1(x(c) * f), ft: r1(x(ft) * f) });
  return food;
}
// A recipe from the Indian Nutrient Databank, as a food: its own serving, or 100 g.
function indbFood(id) {
  const line = WHOLE?.indb.map.get(id.slice(1));
  if (!line) return null;
  const [, n, u, sg, k, p, c, ft, fb, sug] = line.split('|'), x = s => (s === '' ? null : +s), g = +sg, f = g / 100;
  return { id, n, u, g, k: Math.round(x(k) * f * 10) / 10, p: r1(x(p) * f), c: r1(x(c) * f), ft: r1(x(ft) * f), fb: r1((x(fb) || 0) * f), cat: 'whole', src: 'indb',
    per100: { k: x(k), p: x(p), c: x(c), ft: x(ft), fb: x(fb), sug: x(sug) }, unit: 'g' };
}
// Every word in the name; a name that starts with the first word comes first, then shorter names.
function findIn(rows, q, n) {
  const words = fnorm(q).split(' ').filter(w => w.length > 1);
  if (!words.length || words.join('').length < 3) return [];
  const hits = [];
  for (const [hay, id] of rows) if (words.every(w => hay.includes(w))) hits.push([(hay.startsWith(words[0]) ? 0 : 1) + hay.length / 200, id]);
  return hits.sort((a, b) => a[0] - b[0]).slice(0, n).map(h => h[1]);
}
function wholeSearch(q, n = 8) { return WHOLE ? findIn(WHOLE.rows, q, n).map(id => wholeFood('n' + id)).filter(Boolean) : []; }
function indbSearch(q, n = 8) { return WHOLE ? findIn(WHOLE.indb.rows, q, n).map(id => indbFood('i' + id)).filter(Boolean) : []; }

// ---------- a typed barcode ----------
// No camera: typing the 13 digits under the bars is as quick, needs no permission and costs nothing while you do it.
// The lookup runs as soon as the digits make a whole barcode (its check digit agrees).
async function scanFound(code) {
  await offLoad().catch(() => null);
  const f = lookupCode(code);
  SCAN.code = code;
  if (f) { SCAN.hit = f; SCAN.miss = null; buzz('ok'); } else { SCAN.miss = code; SCAN.hit = null; buzz('warn'); }
  render();
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
  const head = masthead('Pack by barcode', `Food · ${mealName(m).toLowerCase()}`, { before: `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>` });
  let card = '';
  if (SCAN.hit) {
    const f = SCAN.hit, V = packVerdict(f), P = f.per100;
    card = `<div class="scard" data-fling="scanagain"><div class="eyebrow">${f.cat === 'pack' ? 'Open Food Facts' : 'Your own food'} · ${esc(f.bc || SCAN.code)}</div><h2>${esc(f.n)}</h2>
      <p class="sub">${f.pack ? `${esc(f.pack)} pack · ` : ''}${esc(unitText(f))}</p>
      ${P ? `<div class="m4">${[['kcal', P.k, ''], ['protein', P.p, 'g'], ['carbs', P.c, 'g'], ['fat', P.ft, 'g']].map(([l, v, u]) => `<div><b class="num">${v == null ? DASH : r1(v)}${v != null && u ? `<i>${u}</i>` : ''}</b><span>${l}</span></div>`).join('')}</div><p class="sub small center">per 100 ${f.unit || 'g'}</p>` : ''}
      ${V.length ? `<ul class="pv">${V.map(([c, a, b]) => `<li class="${c}"><i></i><span><b>${a}</b><span class="sub">${b}</span></span></li>`).join('')}</ul>` : ''}
      <p class="sub">${packFit(f)}</p>
      <div class="rowb"><button class="ghost" data-act="scanagain">Another</button><button class="solid" data-act="scanadd" data-m="${m}">Choose amount</button></div></div>`;
  } else if (SCAN.miss) {
    card = `<div class="scard" data-fling="scanagain"><div class="eyebrow">${esc(SCAN.miss)}</div><h2>Not in the list on this phone</h2>
      <p class="sub">Copy its nutrition panel once, and this number finds the pack from then on.</p>
      <div class="rowb"><button class="ghost" data-act="scanagain">Another</button><button class="solid" data-act="scanlabel" data-m="${m}">Enter its label</button></div></div>`;
  }
  return `${head}
    <div class="scanman big"><input id="scancode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="14" placeholder="The number under the bars" aria-label="Barcode number" autocomplete="off" value="${esc(SCAN.hit || SCAN.miss ? SCAN.code : '')}"><button class="ghost" data-act="scantype">Look up</button></div>
    ${card || `<p class="hint">13 digits on most packs, 8 on small ones. It looks up as soon as the number is whole. Searching by name on Add food finds packs too.</p>`}`;
}
FLING.scanagain = () => { SCAN.hit = SCAN.miss = null; renderView(); setTimeout(() => { const i = $('#scancode'); if (i) { i.value = ''; i.focus(); } }, 0); };
// Typing: a whole, valid barcode looks itself up.
function scanTyped(el) {
  const c = el.value.replace(/\D/g, '');
  if (c !== el.value) el.value = c;
  if ((c.length === 8 || c.length === 12 || c.length === 13) && eanOK(c) && c !== SCAN.code) { el.blur(); scanFound(c); }
}
function scanAct(a, el) {
  if (a === 'scango') { day = el.dataset.k || todayKey(); SCAN.hit = SCAN.miss = null; SCAN.code = ''; navTo(`scan-${el.dataset.m || nextMeal()}`); offLoad().catch(() => {}); setTimeout(() => $('#scancode')?.focus(), 350); return true; }
  if (a === 'scanagain') { SCAN.hit = SCAN.miss = null; SCAN.code = ''; buzz('tick'); render(); const i = $('#scancode'); if (i) { i.value = ''; i.focus(); } return true; }
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
    // The own-food form on Add food, with the barcode kept for the next lookup of this pack.
    CUSTOM.bc = SCAN.miss; CUSTOM.basis = '100'; addNext = 'mine';
    SCAN.miss = null;
    navTo(`add-${el.dataset.m}`);
    return true;
  }
  return false;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('scan.js');

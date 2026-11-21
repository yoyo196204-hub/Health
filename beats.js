'use strict';
// The beat explorer: any saved recording, beat by beat. One finger scrubs from beat to beat and reads each one out;
// two fingers pinch to zoom and slide to pan; the strip underneath moves the window; arrow keys step a beat. Every
// number on the page (RMSSD, SDNN, pNN50, SD1/SD2, the spectrum) is worked out again for the stretch on screen, from
// the same corrected beats the saved reading used (hrv.js), so a stretch can be read on its own.
//
// Opened from a morning check (#beats-h20261116) or a Lab session (#beats-l<its start time>).

const BX = { key: null, D: null, v0: 0, v1: 0, cur: -1, unit: 'hr', raw: true, spec: null, specFor: '', specT: 0, raf: 0, ptr: new Map(), gest: null, lastTap: 0 };
const BX_MIN = 5;   // the narrowest window, in seconds

// The recording behind a key, corrected once, with each beat's time (the end of the beat, seconds from the start).
function bxData(key) {
  let x = null, title = '', when = 0, marks = [], back = '';
  if (/^h\d{8}$/.test(key)) {
    const k = `${key.slice(1, 5)}-${key.slice(5, 7)}-${key.slice(7, 9)}`;
    x = S.hrv[k]; title = 'Morning check'; when = x?.t || Date.parse(k + 'T07:00'); back = k;
  } else if (/^l\d{13}$/.test(key)) {
    const t = +key.slice(1);
    for (const list of Object.values(S.lab)) { const y = list.find(z => z.t === t); if (y) { x = y; break; } }
    title = x ? (LABS[x.kind]?.n || 'Lab session') : ''; when = t;
    marks = (x?.seg || []).filter(s => Array.isArray(s) && LIVETAGS[s[0]] && Number.isFinite(s[1])).map(s => [s[1], s[0]]);
  }
  if (!x?.rr || x.rr.length < 20) return null;
  const raw = x.rr, C = rrClean(raw), rr = C.rr, T = new Float64Array(rr.length), RT = new Float64Array(raw.length);
  let acc = 0;
  for (let i = 0; i < rr.length; i++) { acc += rr[i] / 1000; T[i] = acc; }
  acc = 0;
  for (let i = 0; i < raw.length; i++) { acc += raw[i] / 1000; RT[i] = acc; }
  return { title, when, marks, back, raw, RT, C, rr, T, dur: Math.max(T[T.length - 1], RT[RT.length - 1]), roll: rollingRmssd(rr, 30), q: Math.round((1 - C.bad) * 100) };
}
// The first and one-past-last corrected beat inside [a, b] seconds (binary search on the beat times).
function bxIdx(T, a, b) {
  const lb = v => { let lo = 0, hi = T.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < v) lo = m + 1; else hi = m; } return lo; };
  return [lb(a), lb(b + 1e-9)];
}
function bxClock(s) { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(3).padStart(6, '0')}`; }

// ---------- the page ----------
function vBeats(key) {
  if (BX.key !== key) { const D = bxData(key); Object.assign(BX, { key, D, v0: 0, v1: D ? D.dur : 0, cur: -1, spec: null, specFor: '' }); }
  const D = BX.D, back = `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>`;
  if (!D) return `${masthead('Beat by beat', '', { before: back })}${para('No beats were kept with this reading. Morning checks and Lab sessions recorded with the H9 keep theirs.')}`;
  const K = D.C.kinds, fixedN = Object.values(K).reduce((a, b) => a + b, 0);
  const at = new Date(D.when), stamp = `${dateLabel(dk(at), { weekday: 'short', day: 'numeric', month: 'short' })} · ${hm(at.getHours() * 60 + at.getMinutes())}`;
  return `${masthead('Beat by beat', `${esc(D.title)} · ${stamp}`, { before: back })}
    <div class="bxread" id="bxread" aria-live="polite">${bxReadout()}</div>
    <div class="bxstats" id="bxstats">${bxStatsHtml()}</div>
    <div class="bxtools">${seg('bxunit', [['hr', 'bpm'], ['rr', 'RR ms']], BX.unit, 'tight')}
      ${seg('bxzoom', [['all', 'All'], ['120', '2m'], ['60', '1m'], ['20', '20s']], bxZoomName(), 'tight')}
      <label class="toggle small"><input type="checkbox" data-act="bxraw" ${BX.raw ? 'checked' : ''}><span class="grow">Show each beat as the strap sent it</span><i class="sw"></i></label></div>
    <div class="bxwrap"><canvas id="bxt" class="bx" tabindex="0" role="img" aria-label="Heart rate beat by beat. Arrow keys step one beat; plus and minus zoom."></canvas>
      <canvas id="bxd" class="bx" role="img" aria-label="Change from each beat to the next, with RMSSD over 30 beats"></canvas>
      <canvas id="bxo" class="bx bxo" role="img" aria-label="The whole recording; drag to move the window"></canvas></div>
    <p class="key"><i class="k bxl"></i>corrected beats<i class="k bxr"></i>as the strap sent them<i class="k bxf"></i>corrected beat<i class="k bxd"></i>change over 50 ms<i class="k bxm"></i>RMSSD, 30 beats</p>
    <p class="sub small">One finger: read each beat. Two fingers: pinch to zoom, slide to move. The strip below the chart moves the window. Double-tap: the whole recording.</p>
    <div class="bxtwo"><figure><canvas id="bxp" class="bx sq" role="img" aria-label="Poincaré plot of the window"></canvas><figcaption class="key">Each beat against the next. The ellipse is SD1 (across) and SD2 (along)</figcaption></figure>
      <figure><canvas id="bxs" class="bx sq" role="img" aria-label="Spectrum of the window"></canvas><figcaption class="key" id="bxscap">Spectrum of the window</figcaption></figure></div>
    ${sec('Corrections', `${para(fixedN ? `${D.C.n} beats came from the strap; ${fixedN} needed correction (${r1(D.C.bad * 100)}%). ${Object.entries(K).filter(([, n]) => n).map(([k, n]) => `${n} ${{ missed: 'missed (split in two)', extra: 'extra (merged)', ectopic: 'ectopic (evened across the pair)', other: 'irregular (set to the local median)', range: 'outside 27–222 bpm' }[k]}`).join(', ')}. Tap one to go to it.` : `All ${D.C.n} beats were used as the strap sent them.`)}
      ${fixedN ? `<div class="bxfix">${bxFixList()}</div>` : ''}`, { why: ['metrics', 'How beats are corrected'] })}
    ${sec('Reading a window', para('RMSSD and pNN50 follow the beat-to-beat (vagal) changes and are meaningful from about 30 seconds; SDNN and SD2 include the slower swings, so they grow with the window and only compare between windows of the same length. The spectrum needs a minute for the breathing band (HF, 0.15–0.4 Hz) and two for LF (0.04–0.15 Hz) (Task Force 1996); with slow breathing under 9 a minute, breathing moves into LF, so LF/HF is not a balance. A stretch with corrected beats in it reads less reliably than a clean one.'), { why: ['hrv', 'The evidence'] })}
    <div class="rowb"><button class="ghost" data-act="rrexp" data-k="${D.back || dk(new Date(D.when))}" ${/^l/.test(BX.key) ? `data-t="${BX.key.slice(1)}"` : ''}>Save the beats as a file</button></div>`;
}
function bxZoomName() {
  const w = BX.v1 - BX.v0, D = BX.D;
  if (!D || w >= D.dur - 0.01) return 'all';
  return ['120', '60', '20'].find(z => Math.abs(w - +z) < 0.5) || '';
}
function bxFixList() {
  const D = BX.D, out = [];
  for (let i = 0; i < D.rr.length && out.length < 60; i++) {
    if (!D.C.fix[i] || (i && D.C.fix[i - 1] === D.C.fix[i] && D.C.src[i - 1] === D.C.src[i])) continue;
    out.push(`<button class="mini" data-act="bxgo" data-i="${i}">${bxClock(D.T[i] - D.rr[i] / 1000).replace(/\.\d+$/, '')} · ${FIXK[D.C.fix[i]] === 'other' ? 'irregular' : FIXK[D.C.fix[i]]}</button>`);
  }
  return out.join('');
}
// The beat under the finger, in full.
function bxReadout() {
  const D = BX.D;
  if (!D) return '';
  const i = BX.cur;
  if (i < 0) return `<span class="sub">Touch the chart to read a beat. ${fmt(D.rr.length)} beats over ${clock(D.dur)}.</span>`;
  const r = D.rr[i], d = i ? r - D.rr[i - 1] : null, f = D.C.fix[i], raw = D.raw[D.C.src[i]];
  const mark = D.marks.filter(m => m[0] <= D.T[i]).pop();
  return `<b class="num">Beat ${fmt(i + 1)}</b><span class="num">${bxClock(D.T[i] - r / 1000)}</span>
    <span class="num"><b>${Math.round(r)}</b> ms</span><span class="num"><b>${r1(60000 / r)}</b> bpm</span>
    <span class="num">Δ ${d == null ? DASH : `${sign(d, 0)} ms`}</span>
    ${f ? `<span class="flag">${{ 1: 'missed beat, split', 2: 'extra beat, merged', 3: 'ectopic, evened', 4: 'irregular, set to median', 5: 'out of range, replaced' }[f]}${raw && Math.round(raw) !== Math.round(r) ? ` · sent ${Math.round(raw)} ms` : ''}</span>` : ''}
    ${mark ? `<span class="sub">${esc(LIVETAGS[mark[1]])}</span>` : ''}`;
}
function bxStatsHtml() {
  const D = BX.D;
  if (!D) return '';
  const [a, b] = bxIdx(D.T, BX.v0, BX.v1), M = rrStats(D.rr, a, b);
  let fixed = 0;
  for (let i = a; i < b; i++) if (D.C.fix[i]) fixed++;
  if (!M) return `<p class="sub">Fewer than 10 beats in view: zoom out.</p>`;
  return stats([[r1(M.rmssd), 'RMSSD ms'], [r1(M.sdnn), 'SDNN ms'], [`${r1(M.pnn50)}%`, 'pNN50'], [Math.round(M.hr), 'mean bpm'],
    [`${r1(M.sd1)} / ${r1(M.sd2)}`, 'SD1 / SD2'], [`${Math.round(M.minHr)}–${Math.round(M.maxHr)}`, 'bpm range'], [fmt(M.n), `beats · ${clock(M.dur)}`], [`${Math.round((1 - fixed / M.n) * 100)}%`, 'as recorded']], 'bxs8');
}

// ---------- drawing ----------
function bxColors() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  return { ink: v('--ink'), soft: v('--soft'), line: v('--line'), haldi: v('--haldi'), leaf: v('--leaf'), alarm: v('--alarm'), sky: v('--sky'), track: v('--track'), raise: v('--raise') };
}
// A canvas sized to its box at the screen's pixel density; drawing is in CSS pixels.
function bxCanvas(id) {
  const c = document.getElementById(id);
  if (!c) return null;
  const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(3, devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.font = '10.5px system-ui, sans-serif'; g.textBaseline = 'middle';
  return { c, g, w, h };
}
function bxTicks(a, b, n) {
  const span = b - a, raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 5, 10].map(m => m * p).find(s => s >= raw) || p * 10;
  const out = [];
  for (let v = Math.ceil(a / st) * st; v <= b + 1e-9; v += st) out.push(+v.toFixed(6));
  return out;
}
const BX_PAD = { l: 34, r: 8, t: 20, b: 18 };
function bxX(t, w) { return BX_PAD.l + (t - BX.v0) / (BX.v1 - BX.v0) * (w - BX_PAD.l - BX_PAD.r); }
function bxT(x, w) { return BX.v0 + (x - BX_PAD.l) / (w - BX_PAD.l - BX_PAD.r) * (BX.v1 - BX.v0); }

function bxDraw() {
  BX.raf = 0;
  const D = BX.D;
  if (!D || !document.getElementById('bxt')) return;
  const col = bxColors(), [a, b] = bxIdx(D.T, BX.v0, BX.v1), a0 = Math.max(0, a - 1), b1 = Math.min(D.rr.length, b + 1);
  const val = r => BX.unit === 'hr' ? 60000 / r : r;
  // ---- the tachogram ----
  const P = bxCanvas('bxt');
  if (P) {
    const { g, w, h } = P;
    let lo = Infinity, hi = -Infinity;
    for (let i = a; i < b; i++) { const v = val(D.rr[i]); if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!Number.isFinite(lo)) { lo = 50; hi = 100; }
    const pad = Math.max((hi - lo) * 0.12, BX.unit === 'hr' ? 2 : 20); lo -= pad; hi += pad;
    const Y = v => BX_PAD.t + (1 - (v - lo) / (hi - lo)) * (h - BX_PAD.t - BX_PAD.b);
    g.strokeStyle = col.line; g.fillStyle = col.soft; g.lineWidth = 1; g.textAlign = 'right';
    for (const v of bxTicks(lo, hi, 4)) { const y = Y(v); g.globalAlpha = 0.6; g.beginPath(); g.moveTo(BX_PAD.l, y); g.lineTo(w - BX_PAD.r, y); g.stroke(); g.globalAlpha = 1; g.fillText(String(Math.round(v)), BX_PAD.l - 5, y); }
    g.textAlign = 'center';
    for (const v of bxTicks(BX.v0, BX.v1, Math.max(3, Math.floor(w / 80)))) { const x = bxX(v, w); g.fillText(v >= 60 ? clock(v) : `${+v.toFixed(1)} s`, x, h - 7); }
    for (const [s, tag] of D.marks) {
      if (s < BX.v0 || s > BX.v1) continue;
      const x = bxX(s, w); g.strokeStyle = col.sky; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, BX_PAD.t); g.lineTo(x, h - BX_PAD.b); g.stroke(); g.setLineDash([]);
      g.fillStyle = col.sky; g.textAlign = 'left'; g.fillText(LIVETAGS[tag], x + 3, BX_PAD.t + 6); g.textAlign = 'center';
    }
    g.save(); g.beginPath(); g.rect(BX_PAD.l, 0, w - BX_PAD.l - BX_PAD.r, h); g.clip();
    // As the strap sent them: faint dots, clamped to the chart with a tick where one is off it.
    if (BX.raw) {
      const [ra, rb] = bxIdx(D.RT, BX.v0, BX.v1);
      g.fillStyle = col.soft; g.globalAlpha = 0.55;
      for (let i = Math.max(0, ra - 1); i < Math.min(D.raw.length, rb + 1); i++) {
        const v = val(D.raw[i]), y = Y(v), x = bxX(D.RT[i] - D.raw[i] / 2000, w);
        if (y < BX_PAD.t || y > h - BX_PAD.b) { g.fillRect(x - 1, y < BX_PAD.t ? BX_PAD.t : h - BX_PAD.b - 3, 2, 3); continue; }
        g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    // The corrected beats: a line through each beat's midpoint, each beat a dot when there is room for it.
    g.strokeStyle = col.ink; g.lineWidth = 1.5; g.lineJoin = 'round'; g.beginPath();
    for (let i = a0; i < b1; i++) { const x = bxX(D.T[i] - D.rr[i] / 2000, w), y = Y(val(D.rr[i])); if (i === a0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    const room = (w - BX_PAD.l) / Math.max(1, b - a) > 5;
    for (let i = a0; i < b1; i++) {
      const f = D.C.fix[i]; if (!f && !room) continue;
      const x = bxX(D.T[i] - D.rr[i] / 2000, w), y = Y(val(D.rr[i]));
      g.beginPath(); g.arc(x, y, f ? 3.6 : 2, 0, 7);
      if (f) { g.strokeStyle = col.alarm; g.lineWidth = 1.6; g.stroke(); } else { g.fillStyle = col.ink; g.fill(); }
    }
    if (BX.cur >= 0 && BX.cur < D.rr.length) {
      const i = BX.cur, x = bxX(D.T[i] - D.rr[i] / 2000, w), y = Y(val(D.rr[i]));
      g.strokeStyle = col.haldi; g.lineWidth = 1; g.beginPath(); g.moveTo(x, BX_PAD.t); g.lineTo(x, h - BX_PAD.b); g.stroke();
      g.fillStyle = col.haldi; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
    }
    g.restore();
    g.fillStyle = col.soft; g.textAlign = 'left'; g.fillText(BX.unit === 'hr' ? 'bpm' : 'RR ms', 2, 8);
  }
  // ---- change from beat to beat, and RMSSD over 30 beats ----
  const Q = bxCanvas('bxd');
  if (Q) {
    const { g, w, h } = Q, mid = h / 2;
    let m = 60, rm = 10;
    for (let i = Math.max(1, a); i < b; i++) { m = Math.max(m, Math.abs(D.rr[i] - D.rr[i - 1])); if (D.roll[i] != null) rm = Math.max(rm, D.roll[i]); }
    m = Math.min(m * 1.1, 400);
    const Y = v => mid - v / m * (mid - 6);
    g.strokeStyle = col.line; g.lineWidth = 1; g.fillStyle = col.soft; g.textAlign = 'right';
    for (const v of [50, -50]) { const y = Y(v); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(BX_PAD.l, y); g.lineTo(w - BX_PAD.r, y); g.stroke(); g.setLineDash([]); g.fillText(`${v > 0 ? '+' : '−'}50`, BX_PAD.l - 5, y); }
    g.beginPath(); g.moveTo(BX_PAD.l, mid); g.lineTo(w - BX_PAD.r, mid); g.stroke();
    g.save(); g.beginPath(); g.rect(BX_PAD.l, 0, w - BX_PAD.l - BX_PAD.r, h); g.clip();
    const bw = Math.max(1, Math.min(6, (w - BX_PAD.l) / Math.max(1, b - a) * 0.7));
    for (let i = Math.max(1, a0); i < b1; i++) {
      const d = D.rr[i] - D.rr[i - 1], x = bxX(D.T[i] - D.rr[i] / 2000, w), y = Y(d);
      g.fillStyle = Math.abs(d) > 50 ? col.haldi : col.soft; g.globalAlpha = i === BX.cur ? 1 : 0.8;
      g.fillRect(x - bw / 2, Math.min(y, mid), bw, Math.max(1, Math.abs(y - mid)));
    }
    g.globalAlpha = 1;
    g.strokeStyle = col.sky; g.lineWidth = 1.5; g.beginPath(); let pen = false;
    for (let i = a0; i < b1; i++) {
      const v = D.roll[i]; if (v == null) { pen = false; continue; }
      const x = bxX(D.T[i] - D.rr[i] / 2000, w), y = h - 4 - v / rm * (h - 20);
      if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true;
    }
    g.stroke(); g.restore();
    g.fillStyle = col.sky; g.textAlign = 'right'; g.fillText(`RMSSD up to ${Math.round(rm)} ms`, w - BX_PAD.r, 7);
    g.fillStyle = col.soft; g.textAlign = 'left'; g.fillText('Δ ms', 2, 7);
  }
  // ---- the whole recording, with the window ----
  const O = bxCanvas('bxo');
  if (O) {
    const { g, w, h } = O, n = D.rr.length, X = t => BX_PAD.l + t / D.dur * (w - BX_PAD.l - BX_PAD.r);
    let lo = Infinity, hi = -Infinity;
    for (const r of D.rr) { const v = val(r); if (v < lo) lo = v; if (v > hi) hi = v; }
    const Y = v => 4 + (1 - (v - lo) / (hi - lo || 1)) * (h - 8), step = Math.max(1, Math.floor(n / (w * 1.5)));
    g.strokeStyle = col.soft; g.lineWidth = 1; g.beginPath();
    for (let i = 0; i < n; i += step) { const x = X(D.T[i]), y = Y(val(D.rr[i])); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = col.alarm;
    for (let i = 0; i < n; i++) if (D.C.fix[i]) g.fillRect(X(D.T[i]) - 0.5, h - 3, 1.5, 3);
    const x0 = X(BX.v0), x1 = X(BX.v1);
    g.fillStyle = col.haldi; g.globalAlpha = 0.16; g.fillRect(x0, 0, Math.max(2, x1 - x0), h); g.globalAlpha = 1;
    g.strokeStyle = col.haldi; g.lineWidth = 1.5; g.strokeRect(x0 + 0.75, 0.75, Math.max(2, x1 - x0) - 1.5, h - 1.5);
  }
  bxPoincare(col, a, b);
  bxSpectrum(col, a, b);
}
function bxPoincare(col, a, b) {
  const D = BX.D, P = bxCanvas('bxp');
  if (!P) return;
  const { g, w, h } = P, rr = D.rr, pad = 14;
  let lo = Infinity, hi = -Infinity;
  for (const r of rr) { if (r < lo) lo = r; if (r > hi) hi = r; }
  const sp = (hi - lo) * 0.08 || 20; lo -= sp; hi += sp;
  const S2 = v => pad + (v - lo) / (hi - lo) * (Math.min(w, h) - 2 * pad);
  g.strokeStyle = col.line; g.lineWidth = 1; g.beginPath(); g.moveTo(S2(lo), h - S2(lo)); g.lineTo(S2(hi), h - S2(hi)); g.stroke();
  g.fillStyle = col.soft; g.globalAlpha = 0.3;
  for (let i = 1; i < rr.length; i++) if (i < a + 1 || i >= b) { g.beginPath(); g.arc(S2(rr[i - 1]), h - S2(rr[i]), 1.3, 0, 7); g.fill(); }
  g.globalAlpha = 1; g.fillStyle = col.ink;
  for (let i = Math.max(1, a + 1); i < b; i++) { g.beginPath(); g.arc(S2(rr[i - 1]), h - S2(rr[i]), 1.8, 0, 7); g.fill(); }
  const M = rrStats(rr, a, b);
  if (M) {
    const k = (Math.min(w, h) - 2 * pad) / (hi - lo);
    g.strokeStyle = col.haldi; g.lineWidth = 1.5; g.beginPath(); g.ellipse(S2(M.rr), h - S2(M.rr), Math.max(1, M.sd2 * k), Math.max(1, M.sd1 * k), -Math.PI / 4, 0, 7); g.stroke();
  }
  const i = BX.cur;
  if (i > 0) { g.fillStyle = col.haldi; g.beginPath(); g.arc(S2(rr[i - 1]), h - S2(rr[i]), 4.5, 0, 7); g.fill(); }
  g.fillStyle = col.soft; g.textAlign = 'left'; g.fillText(`${Math.round(lo + sp)}–${Math.round(hi - sp)} ms`, 4, h - 6);
}
// The spectrum waits until the window has stopped moving: it is the one costly calculation here.
function bxSpectrum(col, a, b) {
  const D = BX.D, P = bxCanvas('bxs'), cap = document.getElementById('bxscap');
  if (!P) return;
  const { g, w, h } = P, id = `${a}-${b}`, secs = (D.T[b - 1] || 0) - (D.T[a] || 0) + D.rr[a] / 1000;
  if (secs < 55) { g.fillStyle = col.soft; g.textAlign = 'center'; g.fillText('Needs a minute in view', w / 2, h / 2); if (cap) cap.textContent = 'Spectrum: zoom out to a minute or more'; return; }
  if (BX.specFor !== id) {
    g.fillStyle = col.soft; g.textAlign = 'center'; g.fillText('…', w / 2, h / 2);
    clearTimeout(BX.specT);
    BX.specT = setTimeout(() => { if (!document.getElementById('bxs')) return; BX.spec = lombScargle(D.rr.slice(a, b), 0.45, 0.003); BX.specFor = id; bxSpectrum(bxColors(), a, b); }, 180);
    return;
  }
  const Sp = BX.spec;
  if (!Sp) return;
  const fx = f => 6 + f / 0.45 * (w - 12), mx = Math.max(...Sp.p) || 1, fy = p => h - 16 - p / mx * (h - 26);
  for (const [k, [f0, f1], c] of [['VLF', BAND.vlf, col.track], ['LF', BAND.lf, col.sky], ['HF', BAND.hf, col.leaf]]) {
    if (k === 'LF' && secs < 110) continue;
    g.fillStyle = c; g.globalAlpha = 0.18; g.fillRect(fx(f0), 4, fx(f1) - fx(f0), h - 20); g.globalAlpha = 1;
    g.fillStyle = col.soft; g.textAlign = 'center'; g.fillText(k, (fx(f0) + fx(f1)) / 2, h - 6);
  }
  g.strokeStyle = col.ink; g.lineWidth = 1.4; g.beginPath();
  Sp.f.forEach((f, i) => { const x = fx(f), y = fy(Sp.p[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke();
  const pk = peakFreq(Sp, 0.1, 0.45), hf = bandPower(Sp, BAND.hf), lf = secs >= 110 ? bandPower(Sp, BAND.lf) : null;
  if (pk) { g.strokeStyle = col.haldi; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(fx(pk.f), 4); g.lineTo(fx(pk.f), h - 16); g.stroke(); g.setLineDash([]); }
  if (cap) cap.textContent = `HF ${fmt(hf)} ms²${lf != null ? ` · LF ${fmt(lf)} ms²` : ''}${pk ? ` · breathing ${r1(pk.f * 60)} /min` : ''}`;
}
function bxPaint() {
  const r = document.getElementById('bxread'), s = document.getElementById('bxstats');
  if (r) r.innerHTML = bxReadout();
  if (s) s.innerHTML = bxStatsHtml();
  $$('.seg button[data-act="bxzoom"]').forEach(b => b.classList.toggle('on', b.dataset.v === bxZoomName()));
  if (!BX.raf) BX.raf = requestAnimationFrame(bxDraw);
}

// ---------- the window ----------
function bxSetView(v0, v1) {
  const D = BX.D, w = clamp(v1 - v0, Math.min(BX_MIN, D.dur), D.dur);
  let a = v0, b = v0 + w;
  if (a < 0) { a = 0; b = w; }
  if (b > D.dur) { b = D.dur; a = D.dur - w; }
  BX.v0 = a; BX.v1 = b;
}
function bxZoom(f, at) { const a = at - (at - BX.v0) * f, b = at + (BX.v1 - at) * f; bxSetView(a, b); }
function bxNear(t) {
  const D = BX.D, [i] = bxIdx(D.T, t, t);
  const c = [i - 1, i, i + 1].filter(j => j >= 0 && j < D.rr.length);
  return c.reduce((best, j) => Math.abs(D.T[j] - D.rr[j] / 2000 - t) < Math.abs(D.T[best] - D.rr[best] / 2000 - t) ? j : best, c[0]);
}
function bxGo(i) {
  const D = BX.D;
  BX.cur = clamp(i, 0, D.rr.length - 1);
  const t = D.T[BX.cur] - D.rr[BX.cur] / 2000;
  if (t < BX.v0 || t > BX.v1) { const w = Math.min(BX.v1 - BX.v0, 30); bxSetView(t - w / 2, t + w / 2); }
}

// Called after every render: size and draw the canvases, and attach the gestures once to each new canvas.
function bxKick() {
  const t = document.getElementById('bxt');
  if (!t || !BX.D) return;
  for (const id of ['bxt', 'bxd']) {
    const c = document.getElementById(id);
    if (c.dataset.on) continue;
    c.dataset.on = '1';
    c.addEventListener('pointerdown', bxDown);
    c.addEventListener('pointermove', bxMove);
    c.addEventListener('pointerup', bxUp); c.addEventListener('pointercancel', bxUp);
    c.addEventListener('wheel', e => { e.preventDefault(); const r = c.getBoundingClientRect(); bxZoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, bxT(e.clientX - r.left, r.width)); bxPaint(); }, { passive: false });
  }
  if (!t.dataset.key) {
    t.dataset.key = '1';
    t.addEventListener('keydown', e => {
      const D = BX.D, w = BX.v1 - BX.v0, mid = (BX.v0 + BX.v1) / 2;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); bxGo((BX.cur < 0 ? bxIdx(D.T, BX.v0, BX.v1)[0] : BX.cur) + (e.key === 'ArrowRight' ? 1 : -1)); }
      else if (e.key === '+' || e.key === '=') bxZoom(0.7, mid);
      else if (e.key === '-') bxZoom(1 / 0.7, mid);
      else if (e.key === 'Home') bxSetView(0, w); else if (e.key === 'End') bxSetView(D.dur - w, D.dur);
      else return;
      bxPaint();
    });
  }
  const o = document.getElementById('bxo');
  if (o && !o.dataset.on) {
    o.dataset.on = '1';
    const move = e => { const r = o.getBoundingClientRect(), t0 = (e.clientX - r.left - BX_PAD.l) / (r.width - BX_PAD.l - BX_PAD.r) * BX.D.dur, w = BX.v1 - BX.v0; bxSetView(t0 - w / 2, t0 + w / 2); bxPaint(); };
    o.addEventListener('pointerdown', e => { o.setPointerCapture(e.pointerId); move(e); });
    o.addEventListener('pointermove', e => { if (o.hasPointerCapture(e.pointerId)) move(e); });
  }
  bxPaint();
}
function bxDown(e) {
  const c = e.currentTarget;
  c.setPointerCapture(e.pointerId);
  BX.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const r = c.getBoundingClientRect();
  if (BX.ptr.size === 2) {
    const [p, q] = [...BX.ptr.values()];
    BX.gest = { d: Math.abs(p.x - q.x) || 1, mx: (p.x + q.x) / 2, v0: BX.v0, v1: BX.v1, r };
    return;
  }
  const now = performance.now();
  if (now - BX.lastTap < 300) { bxSetView(0, BX.D.dur); BX.lastTap = 0; bxPaint(); return; }
  BX.lastTap = now;
  bxScrub(e, r);
}
function bxScrub(e, r) {
  const i = bxNear(bxT(e.clientX - r.left, r.width));
  if (i !== BX.cur) { BX.cur = i; if (BX.D.C.fix[i]) buzz('tick'); }
  bxPaint();
}
function bxMove(e) {
  if (!BX.ptr.has(e.pointerId)) return;
  BX.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const c = e.currentTarget, r = c.getBoundingClientRect();
  if (BX.ptr.size >= 2 && BX.gest) {
    const [p, q] = [...BX.ptr.values()], G = BX.gest, d = Math.abs(p.x - q.x) || 1, mx = (p.x + q.x) / 2;
    const span = (G.v1 - G.v0) * G.d / d, frac = (G.mx - r.left - BX_PAD.l) / (r.width - BX_PAD.l - BX_PAD.r);
    const at = G.v0 + frac * (G.v1 - G.v0), shift = (mx - G.mx) / (r.width - BX_PAD.l - BX_PAD.r) * span;
    const a = at - frac * span - shift;
    bxSetView(a, a + span);
    bxPaint();
    return;
  }
  bxScrub(e, r);
}
function bxUp(e) { BX.ptr.delete(e.pointerId); if (BX.ptr.size < 2) BX.gest = null; }
addEventListener('resize', () => { if (document.getElementById('bxt')) bxPaint(); });

function bxAct(a, el) {
  if (!a.startsWith('bx')) return false;
  const D = BX.D;
  if (!D) return true;
  if (a === 'bxunit') { BX.unit = el.dataset.v; buzz('tick'); $$('.seg button[data-act="bxunit"]').forEach(b => b.classList.toggle('on', b.dataset.v === BX.unit)); }
  else if (a === 'bxzoom') {
    const v = el.dataset.v, mid = BX.cur >= 0 ? D.T[BX.cur] : (BX.v0 + BX.v1) / 2;
    if (v === 'all') bxSetView(0, D.dur); else { const w = +v; bxSetView(mid - w / 2, mid + w / 2); }
    buzz('tick');
  }
  else if (a === 'bxraw') { BX.raw = el.checked; buzz('tick'); }
  else if (a === 'bxgo') { bxGo(+el.dataset.i); buzz('tick'); document.getElementById('bxt')?.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' }); }
  bxPaint();
  return true;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('beats.js');

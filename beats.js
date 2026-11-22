'use strict';
// The beat explorer, the heart of a session's page (view-strap.js): any recording, beat by beat. One finger reads
// each beat (its time on the clock to the millisecond, its interval, its rate, the change from the last, and what
// correction it needed); two fingers pinch to zoom and slide to pan; the strip underneath moves the window; arrow keys
// step a beat. In Select, a finger drags out a stretch to analyse on its own, exclude, or mark. Every number on the
// page follows the window, worked out from the same series the session's analysis uses (analysis.js): excluded
// stretches, trims, lost beats and your beat edits included, so a stretch can be read on its own.

const BX = { key: null, at: 0, D: null, v0: 0, v1: 0, cur: -1, unit: 'hr', raw: true, mode: 'read', sel: null, spec: null, specFor: '', specT: 0, raf: 0, ptr: new Map(), gest: null, lastTap: 0, anim: 0 };
const BX_MIN = 5;   // the narrowest window, in seconds
const FIXW = { 1: 'missed beat, split', 2: 'extra beat, merged', 3: 'ectopic, evened', 4: 'irregular, set to the local median', 5: 'out of range, replaced', 6: 'kept as recorded, by you' };

// The recording behind a key: a recording id, or the older morning-check (h20261116) and Lab (l<start>) keys.
function bxRec(key, again = true) {
  if (/^r\d{13}/.test(key)) return recGet(key);
  // A reading added since the store opened (an imported backup) becomes a recording the first time it is asked for.
  if (again && RSTORE.ready && /^[hl]\d/.test(key)) { const r = bxRec(key, false); if (r) return r; recMigrate(); return bxRec(key, false); }
  if (/^h\d{8}$/.test(key)) { const k = `${key.slice(1, 5)}-${key.slice(5, 7)}-${key.slice(7, 9)}`; return recAll().find(r => r.ref?.s === 'hrv' && r.ref.k === k) || null; }
  if (/^l\d{13}$/.test(key)) { const t = +key.slice(1); return recAll().find(r => r.ref?.s === 'lab' && r.ref.t === t) || null; }
  return null;
}
// RMSSD over the last 30 beats at each beat, inside runs only: never across a gap or an excluded stretch.
function rollRuns(X, w = 30) {
  const out = new Array(X.n).fill(null);
  for (const [a, b] of X.runs) {
    let acc = 0;
    for (let i = a + 1; i < b; i++) {
      acc += (X.rr[i] - X.rr[i - 1]) ** 2;
      if (i - a > w) acc -= (X.rr[i - w] - X.rr[i - w - 1]) ** 2;
      if (i - a >= w) out[i] = Math.sqrt(Math.max(0, acc) / w);
    }
  }
  return out;
}
function bxData(r) {
  if (!r || !(r.ru || r.rr)) return null;
  const X = recSeries(r);
  if (!X || X.n < 20) return null;
  return { r, X, raw: X.raw, RT: X.E, rr: X.rr, T: X.T, fix: X.fix, inc: X.inc, dur: X.dur, marks: r.marks || [], ex: r.edits?.ex || [], trim: r.edits?.trim || null, gaps: X.gaps, roll: rollRuns(X), kinds: X.C.kinds, n0: X.C.n };
}
function bxIdx(T, a, b) { return [lowerBound(T, a), lowerBound(T, b + 1e-9)]; }
function bxClock(s) { const neg = s < 0; s = Math.abs(s); const m = Math.floor(s / 60), r = s - m * 60; return `${neg ? '−' : ''}${m}:${r.toFixed(3).padStart(6, '0')}`; }
function bxWall(s) { return hms(new Date(BX.D.r.t0 + s * 1000), true); }
// Make the explorer read this recording. A new version of the same recording (an edit) keeps the window and beat.
function bxLoad(r) {
  if (BX.key === r.id && BX.at === r.at && BX.D) return BX.D;
  const same = BX.key === r.id, D = bxData(r);
  Object.assign(BX, { key: r.id, at: r.at, D, spec: null, specFor: '' });
  if (!same || !D) Object.assign(BX, { v0: 0, v1: D ? D.dur : 0, cur: -1, sel: null, mode: 'read' });
  else { bxSetView(BX.v0, BX.v1); if (BX.cur >= D.X.n) BX.cur = -1; }
  return D;
}

// ---------- the explorer's markup ----------
function bxPanel() {
  const D = BX.D;
  if (!D) return '';
  return `<div class="bxread" id="bxread" aria-live="polite">${bxReadout()}</div>
    <div class="bxtools">${seg('bxmode', [['read', 'Read'], ['select', 'Select']], BX.mode, 'tight')}
      ${seg('bxunit', [['hr', 'bpm'], ['rr', 'ms']], BX.unit, 'tight')}
      ${seg('bxzoom', [['all', 'All'], ['300', '5m'], ['60', '1m'], ['20', '20s']], bxZoomName(), 'tight')}</div>
    <div class="bxwrap${BX.mode === 'select' ? ' selecting' : ''}"><canvas id="bxt" class="bx" tabindex="0" role="img" aria-label="Heart rate beat by beat. Arrow keys step one beat; plus and minus zoom."></canvas>
      <canvas id="bxd" class="bx" role="img" aria-label="Change from each beat to the next, with RMSSD over 30 beats"></canvas>
      <canvas id="bxo" class="bx bxo" role="img" aria-label="The whole recording; drag to move the window"></canvas></div>
    <div class="bxsel" id="bxsel">${bxSelBar()}</div>
    <p class="key"><i class="k bxl"></i>corrected<i class="k bxr"></i>as sent<i class="k bxf"></i>corrected beat<i class="k bxx"></i>excluded<i class="k bxg"></i>beats lost<i class="k bxm"></i>RMSSD, 30 beats</p>
    <label class="toggle small"><input type="checkbox" data-act="bxraw" ${BX.raw ? 'checked' : ''}><span class="grow">Show each beat as the strap sent it</span><i class="sw"></i></label>
    <div class="bxstats" id="bxstats">${bxStatsHtml()}</div>
    <div class="bxtwo"><figure><canvas id="bxp" class="bx sq" role="img" aria-label="Poincaré plot of the window"></canvas><figcaption class="key">Each beat against the next, on screen. Ellipse: SD1 across, SD2 along</figcaption></figure>
      <figure><canvas id="bxs" class="bx sq" role="img" aria-label="Spectrum of the window"></canvas><figcaption class="key" id="bxscap">Spectrum of the window</figcaption></figure></div>`;
}
function bxZoomName() {
  const w = BX.v1 - BX.v0, D = BX.D;
  if (!D || w >= D.dur - 0.01) return 'all';
  return ['300', '60', '20'].find(z => Math.abs(w - +z) < 0.5) || '';
}
// The beat under the finger, in full, with what you can do to it.
function bxReadout() {
  const D = BX.D;
  if (!D) return '';
  const i = BX.cur;
  if (i < 0) return `<span class="sub">${BX.mode === 'select' ? 'Drag across the chart to choose a stretch.' : 'Touch the chart to read a beat.'} ${fmt(D.X.n)} beats over ${clock(D.dur)}, from ${hms(new Date(D.r.t0))}.</span>`;
  const r = D.rr[i], st = D.T[i] - r / 1000, d = i && D.inc[i - 1] && Math.abs(st - D.T[i - 1]) < 0.25 ? r - D.rr[i - 1] : null, f = D.fix[i], s = D.X.src[i], raw = D.raw[s];
  const mark = D.marks.filter(m => m[0] <= st).pop(), ov = D.r.edits?.beat?.[s];
  const act = !D.inc[i] && ov !== 'drop' ? '<span class="sub">excluded</span>'
    : ov ? `<button class="mini" data-act="bxbeat" data-s="${s}" data-v="">Undo your change</button>`
    : `<button class="mini" data-act="bxbeat" data-s="${s}" data-v="drop">Drop this beat</button>${f ? `<button class="mini" data-act="bxbeat" data-s="${s}" data-v="keep">Use as recorded</button>` : ''}`;
  return `<span class="bxhead"><b class="num">Beat ${fmt(i + 1)}</b><span class="num">${bxWall(st)}</span><span class="num sub">${bxClock(st)} in</span></span>
    <span class="bxnums"><span class="num"><b>${Math.round(r)}</b> ms</span><span class="num"><b>${r1(60000 / r)}</b> bpm</span><span class="num">Δ ${d == null ? DASH : `${sign(d, 0)} ms`}</span></span>
    ${f || ov === 'drop' ? `<span class="flag">${ov === 'drop' ? 'dropped by you' : FIXW[f]}${raw && Math.round(raw) !== Math.round(r) ? ` · sent ${Math.round(raw)} ms` : ''}</span>` : ''}
    ${mark ? `<span class="sub">${esc(mark[1])}</span>` : ''}<span class="bxact">${act}</span>`;
}
function bxWinStats(a, b) { const D = BX.D, runs = runsIn(D.X, a, b); return { M: statsRuns(D.rr, runs), F: fixedIn(D.X, runs), runs }; }
function bxStatsHtml() {
  const D = BX.D;
  if (!D) return '';
  const [a, b] = bxIdx(D.T, BX.v0, BX.v1), { M, F } = bxWinStats(a, b);
  const head = `<p class="eyebrow">On screen · ${bxClock(BX.v0).replace(/\.\d+$/, '')}–${bxClock(BX.v1).replace(/\.\d+$/, '')}${b - a > F.n ? ` · ${fmt(b - a - F.n)} beats left out` : ''}</p>`;
  if (!M) return `${head}<p class="sub">Fewer than 10 included beats in view: zoom out.</p>`;
  return head + stats([[r1(M.rmssd), 'RMSSD ms'], [r1(M.sdnn), 'SDNN ms'], [`${r1(M.pnn50)}%`, 'pNN50'], [r1(M.hr), 'mean bpm'],
    [`${r1(M.sd1)}/${r1(M.sd2)}`, 'SD1/SD2 ms'], [`${Math.round(M.minHr)}–${Math.round(M.maxHr)}`, 'bpm range'], [fmt(M.n), `beats · ${clock(M.dur)}`], [`${Math.round((1 - F.share) * 100)}%`, 'as recorded']], 'bxs8');
}
// The stretch chosen in Select, and what can be done with it.
function bxSelBar() {
  const s = BX.sel, D = BX.D;
  if (!s || !D) return '';
  const [a, b] = bxIdx(D.T, s[0], s[1]), { M } = bxWinStats(a, b);
  return `<div class="selbar"><span class="grow"><b class="num">${bxClock(s[0]).replace(/\.\d+$/, '')}–${bxClock(s[1]).replace(/\.\d+$/, '')}</b><span class="sub num">${r1(s[1] - s[0])} s · ${b - a} beats${M ? ` · RMSSD ${r1(M.rmssd)} ms · ${Math.round(M.hr)} bpm` : ''}</span></span>
    <button class="mini" data-act="bxselzoom">Zoom to it</button><button class="mini" data-act="bxselex">Exclude</button><button class="mini" data-act="bxselmark">Mark</button><button class="mini" data-act="bxseltrim">Keep only this</button><button class="mini ghosty" data-act="bxselclear" aria-label="Clear the selection">×</button></div>`;
}

// ---------- drawing ----------
function bxColors() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  return { ink: v('--ink'), soft: v('--soft'), faint: v('--faint'), line: v('--line'), haldi: v('--accent'), leaf: v('--good'), alarm: v('--bad'), sky: v('--pro'), track: v('--track'), heart: v('--heart'), sleep: v('--sleep'), bg: v('--bg2') };
}
// A canvas sized to its box at the screen's pixel density; drawing is in CSS pixels.
function bxCanvas(id) {
  const c = document.getElementById(id);
  if (!c) return null;
  const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(3, devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.font = '500 10.5px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
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
// Hatching for what is left out of every number.
function bxHatch(g, col, x0, x1, y0, y1) {
  g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
  g.fillStyle = col.alarm; g.globalAlpha = 0.07; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.strokeStyle = col.alarm; g.globalAlpha = 0.28; g.lineWidth = 1; g.beginPath();
  for (let x = x0 - (y1 - y0); x < x1; x += 7) { g.moveTo(x, y1); g.lineTo(x + (y1 - y0), y0); }
  g.stroke(); g.restore();
}
// Excluded stretches, the parts a trim leaves out, beats lost in transit, and the selection, behind a chart.
function bxSpans(g, col, w, h, top, bot) {
  const D = BX.D, X = t => clamp(bxX(t, w), BX_PAD.l, w - BX_PAD.r);
  if (D.trim) { bxHatch(g, col, X(0), X(D.trim[0]), top, bot); bxHatch(g, col, X(D.trim[1]), X(D.dur), top, bot); }
  for (const [a, b] of D.ex) if (b > BX.v0 && a < BX.v1) bxHatch(g, col, X(a), X(b), top, bot);
  for (const [a, b] of D.gaps) if (b > BX.v0 && a < BX.v1) { g.fillStyle = col.sleep; g.globalAlpha = 0.14; g.fillRect(X(a), top, Math.max(2, X(b) - X(a)), bot - top); g.globalAlpha = 1; }
  if (BX.sel) { const [a, b] = BX.sel; g.fillStyle = col.haldi; g.globalAlpha = 0.13; g.fillRect(X(a), top, Math.max(2, X(b) - X(a)), bot - top); g.globalAlpha = 0.9; g.fillRect(X(a) - 1, top, 2, bot - top); g.fillRect(X(b) - 1, top, 2, bot - top); g.globalAlpha = 1; }
}
function bxDraw() {
  BX.raf = 0;
  const D = BX.D;
  if (!D || !document.getElementById('bxt')) return;
  const col = bxColors(), [a, b] = bxIdx(D.T, BX.v0, BX.v1), a0 = Math.max(0, a - 1), b1 = Math.min(D.rr.length, b + 1);
  const val = r => BX.unit === 'hr' ? 60000 / r : r, mid = i => D.T[i] - D.rr[i] / 2000;
  // ---- the tachogram ----
  const P = bxCanvas('bxt');
  if (P) {
    const { g, w, h } = P;
    let lo = Infinity, hi = -Infinity;
    for (let i = a; i < b; i++) if (D.inc[i]) { const v = val(D.rr[i]); if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!Number.isFinite(lo)) for (let i = a; i < b; i++) { const v = val(D.rr[i]); if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!Number.isFinite(lo)) { lo = 50; hi = 100; }
    const pad = Math.max((hi - lo) * 0.12, BX.unit === 'hr' ? 2 : 20); lo -= pad; hi += pad;
    const Y = v => BX_PAD.t + (1 - (v - lo) / (hi - lo)) * (h - BX_PAD.t - BX_PAD.b);
    bxSpans(g, col, w, h, BX_PAD.t, h - BX_PAD.b);
    g.strokeStyle = col.line; g.fillStyle = col.soft; g.lineWidth = 1; g.textAlign = 'right';
    for (const v of bxTicks(lo, hi, 4)) { const y = Y(v); g.beginPath(); g.moveTo(BX_PAD.l, y); g.lineTo(w - BX_PAD.r, y); g.stroke(); g.fillText(String(Math.round(v)), BX_PAD.l - 5, y); }
    g.textAlign = 'center';
    for (const v of bxTicks(BX.v0, BX.v1, Math.max(3, Math.floor(w / 80)))) { const x = bxX(v, w); g.fillText(v >= 60 ? clock(v) : `${+v.toFixed(1)} s`, x, h - 7); }
    for (const [s, tag] of D.marks) {
      if (s < BX.v0 || s > BX.v1) continue;
      const x = bxX(s, w); g.strokeStyle = col.sky; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, BX_PAD.t - 4); g.lineTo(x, h - BX_PAD.b); g.stroke(); g.setLineDash([]);
      g.fillStyle = col.sky; g.textAlign = 'left'; g.fillText(tag, x + 3, 8); g.textAlign = 'center';
    }
    g.save(); g.beginPath(); g.rect(BX_PAD.l, 0, w - BX_PAD.l - BX_PAD.r, h); g.clip();
    // As the strap sent them: faint dots, clamped to the chart with a tick where one is off it.
    if (BX.raw) {
      const [ra, rb] = bxIdx(D.RT, BX.v0, BX.v1);
      g.fillStyle = col.soft; g.globalAlpha = 0.5;
      for (let i = Math.max(0, ra - 1); i < Math.min(D.raw.length, rb + 1); i++) {
        const y = Y(val(D.raw[i])), x = bxX(D.RT[i] - D.raw[i] / 2000, w);
        if (y < BX_PAD.t || y > h - BX_PAD.b) { g.fillRect(x - 1, y < BX_PAD.t ? BX_PAD.t : h - BX_PAD.b - 3, 2, 3); continue; }
        g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    // The corrected beats: a line through each beat's midpoint, broken at gaps and faint where excluded.
    g.lineWidth = 1.6; g.lineJoin = 'round';
    let pen = false, inc = null;
    const flush = () => { if (pen) g.stroke(); pen = false; };
    for (let i = a0; i < b1; i++) {
      const x = bxX(mid(i), w), y = Y(val(D.rr[i])), on = !!D.inc[i], cont = i > a0 && Math.abs(D.T[i] - D.rr[i] / 1000 - D.T[i - 1]) < 0.25;
      if (!cont || on !== inc) { flush(); g.beginPath(); g.strokeStyle = on ? col.ink : col.faint; g.globalAlpha = on ? 1 : 0.6; g.moveTo(x, y); pen = true; inc = on; if (cont) { const xp = bxX(mid(i - 1), w), yp = Y(val(D.rr[i - 1])); g.moveTo(xp, yp); g.lineTo(x, y); } }
      else g.lineTo(x, y);
    }
    flush(); g.globalAlpha = 1;
    const room = (w - BX_PAD.l) / Math.max(1, b - a) > 5;
    for (let i = a0; i < b1; i++) {
      const f = D.fix[i]; if (!f && !room) continue;
      const x = bxX(mid(i), w), y = Y(val(D.rr[i]));
      g.beginPath(); g.arc(x, y, f ? 3.6 : 2, 0, 7);
      if (f === 6) { g.strokeStyle = col.sky; g.lineWidth = 1.6; g.stroke(); }
      else if (f) { g.strokeStyle = col.alarm; g.lineWidth = 1.6; g.stroke(); } else { g.fillStyle = D.inc[i] ? col.ink : col.faint; g.fill(); }
    }
    if (BX.cur >= 0 && BX.cur < D.rr.length) {
      const i = BX.cur, x = bxX(mid(i), w), y = Y(val(D.rr[i]));
      g.strokeStyle = col.haldi; g.lineWidth = 1; g.beginPath(); g.moveTo(x, BX_PAD.t); g.lineTo(x, h - BX_PAD.b); g.stroke();
      g.fillStyle = col.haldi; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.strokeStyle = col.bg; g.lineWidth = 2; g.stroke();
    }
    g.restore();
    g.fillStyle = col.soft; g.textAlign = 'left'; g.fillText(BX.unit === 'hr' ? 'bpm' : 'ms', 2, 8);
  }
  // ---- change from beat to beat, and RMSSD over 30 beats ----
  const Q = bxCanvas('bxd');
  if (Q) {
    const { g, w, h } = Q, midY = h / 2;
    let m = 60, rm = 10;
    for (let i = Math.max(1, a); i < b; i++) if (D.inc[i] && D.inc[i - 1]) { m = Math.max(m, Math.abs(D.rr[i] - D.rr[i - 1])); if (D.roll[i] != null) rm = Math.max(rm, D.roll[i]); }
    m = Math.min(m * 1.1, 400);
    const Y = v => midY - v / m * (midY - 6);
    bxSpans(g, col, w, h, 0, h);
    g.strokeStyle = col.line; g.lineWidth = 1; g.fillStyle = col.soft; g.textAlign = 'right';
    for (const v of [50, -50]) { const y = Y(v); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(BX_PAD.l, y); g.lineTo(w - BX_PAD.r, y); g.stroke(); g.setLineDash([]); g.fillText(`${v > 0 ? '+' : '−'}50`, BX_PAD.l - 5, y); }
    g.beginPath(); g.moveTo(BX_PAD.l, midY); g.lineTo(w - BX_PAD.r, midY); g.stroke();
    g.save(); g.beginPath(); g.rect(BX_PAD.l, 0, w - BX_PAD.l - BX_PAD.r, h); g.clip();
    const bw = Math.max(1, Math.min(6, (w - BX_PAD.l) / Math.max(1, b - a) * 0.7));
    for (let i = Math.max(1, a0); i < b1; i++) {
      if (!(D.inc[i] && D.inc[i - 1]) || Math.abs(D.T[i] - D.rr[i] / 1000 - D.T[i - 1]) > 0.25) continue;
      const d = D.rr[i] - D.rr[i - 1], x = bxX(mid(i), w), y = Y(d);
      g.fillStyle = Math.abs(d) > 50 ? col.haldi : col.soft; g.globalAlpha = i === BX.cur ? 1 : 0.8;
      g.fillRect(x - bw / 2, Math.min(y, midY), bw, Math.max(1, Math.abs(y - midY)));
    }
    g.globalAlpha = 1;
    g.strokeStyle = col.sky; g.lineWidth = 1.5; g.beginPath(); let pen = false;
    for (let i = a0; i < b1; i++) {
      const v = D.roll[i]; if (v == null) { pen = false; continue; }
      const x = bxX(mid(i), w), y = h - 4 - v / rm * (h - 20);
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
    for (let i = 0; i < n; i++) if (D.inc[i]) { const v = val(D.rr[i]); if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!Number.isFinite(lo)) { lo = 40; hi = 120; }
    const Y = v => 4 + (1 - (v - lo) / (hi - lo || 1)) * (h - 8), step = Math.max(1, Math.floor(n / (w * 1.5)));
    const sv = BX.v0, sw = BX.v1;
    BX.v0 = 0; BX.v1 = D.dur; bxSpans(g, col, w, h, 0, h); BX.v0 = sv; BX.v1 = sw;
    g.strokeStyle = col.soft; g.lineWidth = 1; g.beginPath();
    for (let i = 0; i < n; i += step) { const x = X(D.T[i]), y = Y(clamp(val(D.rr[i]), lo, hi)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = col.alarm;
    for (let i = 0; i < n; i++) if (D.fix[i] && D.fix[i] !== 6) g.fillRect(X(D.T[i]) - 0.5, h - 3, 1.5, 3);
    for (const [s] of D.marks) { g.fillStyle = col.sky; g.fillRect(X(s) - 0.5, 0, 1.5, 5); }
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
  const { g, w, h } = P, rr = D.rr, pad = 14, pairs = (i0, i1, fn) => { for (const [x, y] of runsIn(D.X, i0, i1)) for (let i = x + 1; i < y; i++) fn(i); };
  let lo = Infinity, hi = -Infinity;
  pairs(0, D.X.n, i => { if (rr[i] < lo) lo = rr[i]; if (rr[i] > hi) hi = rr[i]; });
  if (!Number.isFinite(lo)) return;
  const sp = (hi - lo) * 0.08 || 20; lo -= sp; hi += sp;
  const side = Math.min(w, h) - 2 * pad, S2 = v => pad + (v - lo) / (hi - lo) * side;
  g.strokeStyle = col.line; g.lineWidth = 1; g.beginPath(); g.moveTo(S2(lo), h - S2(lo)); g.lineTo(S2(hi), h - S2(hi)); g.stroke();
  g.fillStyle = col.soft; g.globalAlpha = 0.25;
  pairs(0, D.X.n, i => { if (i < a + 1 || i >= b) { g.beginPath(); g.arc(S2(rr[i - 1]), h - S2(rr[i]), 1.3, 0, 7); g.fill(); } });
  g.globalAlpha = 0.85; g.fillStyle = col.ink;
  pairs(a, b, i => { g.beginPath(); g.arc(S2(rr[i - 1]), h - S2(rr[i]), 1.8, 0, 7); g.fill(); });
  g.globalAlpha = 1;
  const M = bxWinStats(a, b).M;
  if (M) {
    const k = side / (hi - lo);
    g.strokeStyle = col.haldi; g.lineWidth = 1.6; g.beginPath(); g.ellipse(S2(M.rr), h - S2(M.rr), Math.max(1, M.sd2 * k), Math.max(1, M.sd1 * k), -Math.PI / 4, 0, 7); g.stroke();
  }
  const i = BX.cur;
  if (i > 0 && D.inc[i] && D.inc[i - 1]) { g.fillStyle = col.haldi; g.beginPath(); g.arc(S2(rr[i - 1]), h - S2(rr[i]), 4.5, 0, 7); g.fill(); }
  g.fillStyle = col.soft; g.textAlign = 'left'; g.fillText(`${Math.round(lo + sp)}–${Math.round(hi - sp)} ms`, 4, h - 6);
}
// The spectrum waits until the window has stopped moving: it is the one costly calculation here.
function bxSpectrum(col, a, b) {
  const D = BX.D, P = bxCanvas('bxs'), cap = document.getElementById('bxscap');
  if (!P) return;
  const { g, w, h } = P, id = `${BX.at}-${a}-${b}`, M = bxWinStats(a, b).M, secs = M ? M.dur : 0;
  if (secs < 55) { g.fillStyle = col.soft; g.textAlign = 'center'; g.fillText('Needs a minute in view', w / 2, h / 2); if (cap) cap.textContent = 'Spectrum: zoom out to a minute or more'; return; }
  if (BX.specFor !== id) {
    g.fillStyle = col.soft; g.textAlign = 'center'; g.fillText('…', w / 2, h / 2);
    clearTimeout(BX.specT);
    BX.specT = setTimeout(() => { if (!document.getElementById('bxs') || !BX.D) return; BX.spec = specOf(BX.D.X, runsIn(BX.D.X, a, b), 0.45, 0.003); BX.specFor = id; bxSpectrum(bxColors(), a, b); }, 180);
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
  const r = document.getElementById('bxread'), s = document.getElementById('bxstats'), sel = document.getElementById('bxsel');
  if (r) r.innerHTML = bxReadout();
  if (s) s.innerHTML = bxStatsHtml();
  if (sel) sel.innerHTML = bxSelBar();
  $$('.seg button[data-act="bxzoom"]').forEach(b => b.classList.toggle('on', b.dataset.v === bxZoomName()));
  if (!BX.raf) BX.raf = requestAnimationFrame(bxDraw);
}

// ---------- the window ----------
function bxSetView(v0, v1) {
  const D = BX.D;
  if (!D) return;
  const w = clamp(v1 - v0, Math.min(BX_MIN, D.dur), D.dur);
  let a = v0, b = v0 + w;
  if (a < 0) { a = 0; b = w; }
  if (b > D.dur) { b = D.dur; a = D.dur - w; }
  BX.v0 = a; BX.v1 = b;
}
// Glides the window to a new place, on the app's spring, instead of jumping there.
function bxGlide(v0, v1) {
  cancelAnimationFrame(BX.anim);
  if (!motionOK()) { bxSetView(v0, v1); return bxPaint(); }
  const s0 = BX.v0, s1 = BX.v1, t0 = performance.now(), T = 380;
  const step = now => {
    const p = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - p, 3);
    bxSetView(s0 + (v0 - s0) * e, s1 + (v1 - s1) * e); bxPaint();
    if (p < 1) BX.anim = requestAnimationFrame(step);
  };
  BX.anim = requestAnimationFrame(step);
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
  if (BX.mode === 'select') { const t = clamp(bxT(e.clientX - r.left, r.width), 0, BX.D.dur); BX.selAt = t; BX.sel = [t, t]; buzz('tick'); return bxPaint(); }
  const now = performance.now();
  if (now - BX.lastTap < 300) { bxGlide(0, BX.D.dur); BX.lastTap = 0; return; }
  BX.lastTap = now;
  bxScrub(e, r);
}
function bxScrub(e, r) {
  const i = bxNear(bxT(e.clientX - r.left, r.width));
  if (i !== BX.cur) { BX.cur = i; if (BX.D.fix[i]) buzz('tick'); }
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
  if (BX.mode === 'select' && BX.sel) { const t = clamp(bxT(e.clientX - r.left, r.width), 0, BX.D.dur); BX.sel = [Math.min(BX.selAt, t), Math.max(BX.selAt, t)]; return bxPaint(); }
  bxScrub(e, r);
}
function bxUp(e) {
  BX.ptr.delete(e.pointerId); if (BX.ptr.size < 2) BX.gest = null;
  if (BX.mode === 'select' && BX.sel && BX.sel[1] - BX.sel[0] < 1) { BX.sel = null; bxPaint(); }
  else if (BX.mode === 'select' && BX.sel) buzz('ok');
}
addEventListener('resize', () => { if (document.getElementById('bxt')) bxPaint(); });

// ---------- what a finger changes ----------
function bxEdit(fn, msg) {
  const r = recGet(BX.key);
  if (!r) return;
  const was = JSON.parse(JSON.stringify(r)), e = JSON.parse(JSON.stringify(r.edits || {}));
  fn(e, r);
  for (const k of Object.keys(e)) if (e[k] == null || (Array.isArray(e[k]) && !e[k].length) || (typeof e[k] === 'object' && !Array.isArray(e[k]) && !Object.keys(e[k]).length)) delete e[k];
  const next = recPut(Object.assign({}, r, { edits: e }));
  if (next) { recSyncS(next); save(); }
  render();
  toast(msg, 5000, { label: 'Undo', fn: () => { recPut(was); recSyncS(recGet(was.id)); save(); render(); buzz('tick'); } });
  buzz('ok');
}
// Spans merge with any they touch, so the list stays readable.
function mergeSpans(list) {
  const s = list.slice().sort((a, b) => a[0] - b[0]), out = [];
  for (const x of s) { const l = out[out.length - 1]; if (l && x[0] <= l[1] + 0.5) l[1] = Math.max(l[1], x[1]); else out.push(x.slice()); }
  return out;
}
function bxAct(a, el) {
  if (!a.startsWith('bx')) return false;
  const D = BX.D;
  if (!D) return true;
  if (a === 'bxunit') { BX.unit = el.dataset.v; buzz('tick'); $$('.seg button[data-act="bxunit"]').forEach(b => b.classList.toggle('on', b.dataset.v === BX.unit)); }
  else if (a === 'bxmode') { BX.mode = el.dataset.v; if (BX.mode === 'read') BX.sel = null; buzz('tick'); $$('.seg button[data-act="bxmode"]').forEach(b => b.classList.toggle('on', b.dataset.v === BX.mode)); document.querySelector('.bxwrap')?.classList.toggle('selecting', BX.mode === 'select'); }
  else if (a === 'bxzoom') {
    const v = el.dataset.v, mid = BX.cur >= 0 ? D.T[BX.cur] : (BX.v0 + BX.v1) / 2;
    buzz('tick');
    if (v === 'all') return bxGlide(0, D.dur), true;
    const w = Math.min(+v, D.dur); let s = clamp(mid - w / 2, 0, D.dur - w);
    return bxGlide(s, s + w), true;
  }
  else if (a === 'bxraw') { BX.raw = el.checked; buzz('tick'); }
  else if (a === 'bxgo') { bxGo(+el.dataset.i); buzz('tick'); document.getElementById('bxt')?.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' }); }
  else if (a === 'bxwin') { const s = +el.dataset.a, b = +el.dataset.b; buzz('tick'); bxGlide(s, Math.max(s + BX_MIN, b)); document.getElementById('bxt')?.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' }); return true; }
  else if (a === 'bxselclear') { BX.sel = null; buzz('tick'); }
  else if (a === 'bxselzoom' && BX.sel) { const [s, b] = BX.sel; BX.sel = null; buzz('tick'); BX.mode = 'read'; render(); return bxGlide(s, Math.max(s + BX_MIN, b)), true; }
  else if (a === 'bxselex' && BX.sel) { const s = BX.sel.map(r1); BX.sel = null; bxEdit(e => { e.ex = mergeSpans((e.ex || []).concat([s])); }, `${r1(s[1] - s[0])} s excluded from every number`); return true; }
  else if (a === 'bxseltrim' && BX.sel) { const s = BX.sel.map(r1); BX.sel = null; bxEdit(e => { e.trim = s; }, 'Only this stretch is analysed now'); return true; }
  else if (a === 'bxselmark' && BX.sel) { STU.markAt = r1(BX.sel[0]); openPop({ kind: 'recmark', id: BX.key, at: STU.markAt }); return true; }
  else if (a === 'bxbeat') {
    const s = el.dataset.s, v = el.dataset.v;
    bxEdit(e => { e.beat ||= {}; if (v) e.beat[s] = v; else delete e.beat[s]; }, v === 'drop' ? 'Beat dropped from every number' : v === 'keep' ? 'Beat used as the strap sent it' : 'Beat back as it was');
    return true;
  }
  bxPaint();
  return true;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('beats.js');

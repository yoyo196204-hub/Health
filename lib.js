'use strict';
// Shared helpers: dates, formatting and statistics. Nothing here reads or writes app data.

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const DAY = 864e5;

// ---------- dates (keys are local YYYY-MM-DD) ----------
function dk(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayKey() { return dk(new Date()); }
function shift(key, n) { const d = new Date(key + 'T12:00'); d.setDate(d.getDate() + n); return dk(d); }
// The n days ending on `end`, oldest first.
function range(n, end = todayKey()) { return Array.from({ length: n }, (_, i) => shift(end, i - n + 1)); }
function gapDays(a, b) { return Math.round((Date.parse(b + 'T12:00') - Date.parse(a + 'T12:00')) / DAY); }
function dateLabel(k, o = { day: 'numeric', month: 'short' }) { return new Date(k + 'T12:00').toLocaleDateString('en-IN', o); }
function weekday(k) { return new Date(k + 'T12:00').toLocaleDateString('en-IN', { weekday: 'narrow' }); }
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 6e4);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

// ---------- formatting ----------
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function r1(x) { return Math.round(x * 10) / 10; }
function fmt(n) { return Math.round(n).toLocaleString('en-IN'); }
function sign(v, d = 0) { const s = Math.abs(v).toFixed(d); return (+s === 0 ? '±' : v > 0 ? '+' : '−') + s; }
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function plural(n, one, many = one + 's') { return `${n} ${n === 1 ? one : many}`; }
// Minutes from midnight (negative = the evening before) to a clock time.
function hm(min) { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function dur(min) { min = Math.round(min); return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`; }
function kg(x) { return x == null ? '' : String(Math.round(x * 100) / 100); }
function bytes(n) { return n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${r1(n / 1048576)} MB`; }
function clock(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// ---------- statistics ----------
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
// Sample standard deviation (n − 1): these are small samples from one person.
function sd(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
function quantile(a, q) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}
function median(a) { return quantile(a, 0.5); }
function pearson(pairs) {
  if (pairs.length < 3) return null;
  const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1]));
  let a = 0, b = 0, c = 0;
  for (const [x, y] of pairs) { a += (x - mx) * (y - my); b += (x - mx) ** 2; c += (y - my) ** 2; }
  return b && c ? a / Math.sqrt(b * c) : null;
}
// Least-squares line through [x, y] points.
function linfit(pts) {
  if (pts.length < 2) return null;
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  let n = 0, d = 0;
  for (const [x, y] of pts) { n += (x - mx) * (y - my); d += (x - mx) ** 2; }
  return d ? { m: n / d, b: my - (n / d) * mx } : null;
}
// Median of the slopes between every pair of points (Theil–Sen). One wild reading cannot swing it.
function theilSen(pts) {
  if (pts.length < 2) return null;
  const sl = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const dx = pts[j][0] - pts[i][0]; if (dx) sl.push((pts[j][1] - pts[i][1]) / dx); }
  if (!sl.length) return null;
  const m = median(sl);
  return { m, b: median(pts.map(([x, y]) => y - m * x)) };
}
// Agreement between two methods (Bland & Altman 1986): pairs are [test, reference].
// bias = mean difference; 95% of single readings fall within bias ± 1.96 SD.
function agreement(pairs) {
  if (pairs.length < 3) return { n: pairs.length };
  const d = pairs.map(([a, b]) => a - b), bias = mean(d), s = sd(d);
  return { n: pairs.length, bias, sd: s, lo: bias - 1.96 * s, hi: bias + 1.96 * s, mape: mean(pairs.map(([a, b]) => Math.abs(a - b) / b * 100)) };
}

// ---------- beat-to-beat (RR) analysis ----------
// Artefact correction: a beat outside 300–2000 ms, or more than 20% away from the median of the 5 around it, is a
// missed or extra beat, not physiology. It is replaced by that local median (the usual medium-threshold approach).
// Returns the corrected series and the share that was corrected.
function cleanRR(rr) {
  const out = rr.slice(), n = rr.length;
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const nb = [];
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) if (j !== i && rr[j] > 300 && rr[j] < 2000) nb.push(rr[j]);
    const med = median(nb);
    const x = rr[i];
    if (med == null) { if (x <= 300 || x >= 2000) bad++; continue; }
    if (x <= 300 || x >= 2000 || Math.abs(x - med) > 0.2 * med) { out[i] = med; bad++; }
  }
  return { rr: out, bad: n ? bad / n : 0 };
}
// Short-term scaling exponent α1 of detrended fluctuation analysis (Peng 1995), box sizes 4 to 16 beats.
// Near 1 at easy effort; it falls through 0.75 around the aerobic (first ventilatory) threshold and towards 0.5
// near the second (Rogers 2021). Needs about two minutes of clean beats.
function dfaA1(rr) {
  const n = rr.length;
  if (n < 60) return null;
  const m = mean(rr);
  let acc = 0;
  const Y = rr.map(x => (acc += x - m));
  const pts = [];
  for (let s = 4; s <= 16; s++) {
    const boxes = Math.floor(n / s);
    if (boxes < 4) continue;
    let f = 0;
    const sx = s * (s - 1) / 2, sxx = (s - 1) * s * (2 * s - 1) / 6, d = s * sxx - sx * sx;
    for (let b = 0; b < boxes; b++) {
      let sy = 0, sxy = 0;
      for (let i = 0; i < s; i++) { const v = Y[b * s + i]; sy += v; sxy += i * v; }
      const sl = (s * sxy - sx * sy) / d, ic = (sy - sl * sx) / s;
      for (let i = 0; i < s; i++) { const r = Y[b * s + i] - (ic + sl * i); f += r * r; }
    }
    pts.push([Math.log10(s), Math.log10(Math.sqrt(f / (boxes * s)))]);
  }
  const fit = linfit(pts);
  return fit && Number.isFinite(fit.m) ? fit.m : null;
}
// Heart rate where α1 crosses 0.75, from the windows of one session: [[seconds, α1, bpm], ...]. Like the validation
// studies, a straight line of α1 on heart rate through the windows between 0.5 and 1.1, solved for 0.75. Only when the
// session actually crossed it (windows on both sides), over at least 15 bpm, with a clear negative relation.
function hrvThreshold(win) {
  const w = (win || []).filter(x => x[1] >= 0.5 && x[1] <= 1.1);
  if (w.length < 6 || !w.some(x => x[1] > 0.8) || !w.some(x => x[1] < 0.7)) return null;
  const hrs = w.map(x => x[2]);
  if (Math.max(...hrs) - Math.min(...hrs) < 15) return null;
  const r = pearson(w.map(x => [x[2], x[1]])), fit = linfit(w.map(x => [x[2], x[1]]));
  if (r == null || r > -0.6 || !fit || fit.m >= 0) return null;
  const hr = (0.75 - fit.b) / fit.m;
  return hr >= Math.min(...hrs) - 5 && hr <= Math.max(...hrs) + 5 ? { hr: Math.round(hr), r, n: w.length } : null;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('lib.js');

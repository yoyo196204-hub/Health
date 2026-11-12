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
// Agreement between two methods (Bland & Altman 1986): pairs are [test, reference].
// bias = mean difference; 95% of single readings fall within bias ± 1.96 SD.
function agreement(pairs) {
  if (pairs.length < 3) return { n: pairs.length };
  const d = pairs.map(([a, b]) => a - b), bias = mean(d), s = sd(d);
  return { n: pairs.length, bias, sd: s, lo: bias - 1.96 * s, hi: bias + 1.96 * s, mape: mean(pairs.map(([a, b]) => Math.abs(a - b) / b * 100)) };
}

// ---------- feedback ----------
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

'use strict';
// Building blocks every screen uses, so a stat, a section, a source label or a chart looks and behaves the same everywhere.

function why(key, label = 'Why') { return EVID[key] ? `<a class="why" href="#why-${key}">${label}</a>` : ''; }
function masthead(title, eyebrow = '', opts = {}) {
  return `<header class="top ${opts.center ? '' : 'left'}">${opts.before || ''}<div class="grow">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1 ${opts.h1 || ''}>${title}</h1></div>${opts.after || ''}</header>`;
}
// A section: serif heading, optional evidence link on the right, body below a hairline.
function sec(title, body, o = {}) {
  return `<section class="block ${o.cls || ''}" ${o.id ? `id="${o.id}"` : ''}><div class="mh"><h2>${title}</h2>${o.why ? why(...o.why) : ''}${o.right || ''}</div>${body}</section>`;
}
function stat(v, label, cls = '') { return `<div class="${cls}"><b class="num">${v}</b><span class="sub">${label}</span></div>`; }
function stats(items, cls = '') { return `<div class="stats ${cls} n${items.length}">${items.map(x => stat(...x)).join('')}</div>`; }
function trow(a, b, cls = '') { return `<tr class="${cls}"><td>${a}</td><td>${b}</td></tr>`; }
function table(rows) { return `<table>${rows.join('')}</table>`; }
function para(text, cls = 'sub') { return `<p class="${cls}">${text}</p>`; }
function meter(v, of, cls = '') { return `<div class="bar ${cls}"><i style="width:${clamp(v / of * 100, 0, 100).toFixed(1)}%"></i></div>`; }
// Where a number came from. Typed entries carry no label: they are the default.
function src(kind) { const L = { watch: 'watch', strap: 'H9', est: 'estimate', adj: 'watch, corrected' }; return L[kind] ? `<span class="src s-${kind}">${L[kind]}</span>` : ''; }
function pill(lv) { return `<span class="pill lv${lv}">${LEVEL[lv]}</span>`; }
const DASH = '–';

// One chart for everything: dots, a line, bars, a shaded normal range and a goal line over a run of days.
// Values are { day: number } or { day: { v, hollow } }.
function chart({ days, dots = {}, line = {}, bars = {}, band = null, goal = null, fy = r1, h = 150, zero = false }) {
  const val = x => typeof x === 'object' && x ? x.v : x;
  const vals = [dots, line, bars].flatMap(o => Object.values(o).map(val)).filter(Number.isFinite);
  if (vals.length < 2) return '';
  if (band) vals.push(...band);
  if (goal != null) vals.push(goal);
  let y0 = Math.min(...vals), y1 = Math.max(...vals);
  const pad = (y1 - y0) * 0.12 || Math.abs(y1) * 0.05 || 1;
  y0 = zero ? 0 : y0 - pad; y1 += pad;
  const W = 340, H = h, L = 34, R = 6, T = 8, B = 20, n = days.length, idx = Object.fromEntries(days.map((k, i) => [k, i]));
  const X = i => L + (n > 1 ? i / (n - 1) : 0.5) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const bw = Math.max(2, (W - L - R) / n * 0.62), ticks = niceTicks(y0, y1);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  s += ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="0" y="${(Y(v) + 3.5).toFixed(1)}">${fy(v)}</text>`).join('');
  if (band) s += `<rect class="band" x="${L}" width="${W - L - R}" y="${Y(band[1]).toFixed(1)}" height="${Math.max(1, Y(band[0]) - Y(band[1])).toFixed(1)}"/>`;
  if (goal != null) s += `<line class="goal" x1="${L}" x2="${W - R}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}"/>`;
  for (const [k, x] of Object.entries(bars)) if (idx[k] != null && Number.isFinite(val(x))) s += `<rect class="b ${x.cls || ''}" x="${(X(idx[k]) - bw / 2).toFixed(1)}" y="${Y(val(x)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, Y(y0) - Y(val(x))).toFixed(1)}" rx="1.5"/>`;
  const lp = Object.entries(line).filter(([k, x]) => idx[k] != null && Number.isFinite(val(x))).sort((a, b) => idx[a[0]] - idx[b[0]]);
  if (lp.length > 1) s += `<path class="ln" d="${lp.map(([k, x], i) => `${i ? 'L' : 'M'}${X(idx[k]).toFixed(1)},${Y(val(x)).toFixed(1)}`).join('')}"/>`;
  for (const [k, x] of Object.entries(dots)) if (idx[k] != null && Number.isFinite(val(x))) s += `<circle class="${x.hollow ? 'hollow' : ''}" cx="${X(idx[k]).toFixed(1)}" cy="${Y(val(x)).toFixed(1)}" r="${n > 60 ? 2 : 2.8}"/>`;
  const ix = [0, Math.floor((n - 1) / 2), n - 1];
  s += ix.map((i, j) => `<text class="x" x="${X(i).toFixed(1)}" y="${H - 4}" text-anchor="${['start', 'middle', 'end'][j]}">${dateLabel(days[i])}</text>`).join('');
  return s + '</svg>';
}
// Gridlines on round numbers: steps of 1, 2, 2.5 or 5 times a power of ten, three or four of them.
function niceTicks(a, b) {
  const raw = (b - a) / 3.5, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(m => m * p).find(x => x >= raw);
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
function legend(items) { return `<p class="key">${items.map(([cls, label]) => `<i class="k ${cls}"></i>${label}`).join('')}</p>`; }

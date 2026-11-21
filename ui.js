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
// One part of a screen that fails shows a line instead of taking the whole screen with it.
function part(fn, ...a) { try { return fn(...a); } catch (e) { console.error(e); return `<p class="flag">This part could not be shown (${esc(e.message)}). Your data is untouched.</p>`; } }
// A row of choices, one on. act gets data-v.
function seg(act, items, cur, cls = '') { return `<div class="seg ${cls}">${items.map(([v, label]) => `<button class="${String(v) === String(cur) ? 'on' : ''}" data-act="${act}" data-v="${v}">${label}</button>`).join('')}</div>`; }
// A settings row that opens a page.
function navrow(href, label, value = '', icon = '') { return `<a class="navrow" href="${href}">${icon ? `<span class="ic">${icon}</span>` : ''}<span class="grow"><span class="nm">${label}</span>${value ? `<span class="sub">${value}</span>` : ''}</span><span class="chev">›</span></a>`; }
const ICON = {
  gear: '<svg viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  goal: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/></svg>',
  lift: '<svg viewBox="0 0 24 24"><path d="M3 12h18M6 8v8M18 8v8M3.5 10v4M20.5 10v4"/></svg>',
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M12 3v9M9 5v8M15 5v8M6 9v6a6 6 0 0 0 12 0V9"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 12.5l4.5 4.5L20 5.5"/><path d="M4 20h16" opacity=".45"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/></svg>',
};

// The top of a sheet: the scrim (tap it to close), the grab handle (drag down to close), a small × for anyone who
// wants a button, the eyebrow and the title. The caller closes the aside. Back gesture, Escape and swipe work too.
function sheetTop(eyebrow, title, key, act = 'popclose') {
  return `<div class="scrim" data-act="${act}"></div><aside class="sheet" role="dialog" aria-label="${esc(String(title).replace(/<[^>]+>/g, ''))}" data-key="${esc(key)}"><div class="grab"></div><button class="x shx" data-act="${act}" aria-label="Close">×</button>
    <div class="eyebrow">${eyebrow}</div><h1>${title}</h1>`;
}

// ---------- the muscle map ----------
// vol: sets per muscle (or an exercise's hits when fixed). Level by the evidence: under 4, 4–10, 10 and more.
function lvl(v, fixed) { return fixed ? (v >= 1 ? 4 : v > 0 ? 2 : 0) : v <= 0 ? 0 : v < 2 ? 1 : v < 4 ? 2 : v < 10 ? 3 : 4; }
function bodySvg(side, vol, sel, fixed = false) {
  const g = BODY[side].map(({ muscle, polys }) => {
    const m = OUTLINE[muscle], v = m ? vol[m] || 0 : 0, inert = !m;
    const cls = inert ? 'inert' : `m l${lvl(v, fixed)}${sel === m ? ' sel' : ''}${sel && sel !== m ? ' dim' : ''}`;
    return `<g class="${cls}" ${!inert && !fixed ? `data-act="muscle" data-m="${m}"` : ''}>${polys.map(p => `<polygon points="${p.map(x => x.join(',')).join(' ')}"/>`).join('')}</g>`;
  }).join('');
  return `<svg class="body ${side}" viewBox="-4 -4 108 ${side === 'anterior' ? 212 : 230}" role="img" aria-label="${side === 'anterior' ? 'Front' : 'Back'}">${g}</svg>`;
}
// A tiny front view for exercises without a demo clip.
function musclesGlyph(id) { return bodySvg(['erectors', 'glutes', 'hamstrings', 'lats', 'rearDelts', 'traps', 'upperBack'].includes(primaryOf(id)) ? 'posterior' : 'anterior', hitsOf(id), null, true); }
function meter(v, of, cls = '') { return `<div class="bar ${cls}"><i style="width:${clamp(v / of * 100, 0, 100).toFixed(1)}%"></i></div>`; }
// Where a number came from. Typed entries carry no label: they are the default.
function src(kind) { const L = { watch: 'watch', strap: 'H9', est: 'estimate', adj: 'watch, corrected', typed: 'typed', ok: 'done' }; return L[kind] ? `<span class="src s-${kind}">${L[kind]}</span>` : ''; }
function pill(lv) { return `<span class="pill lv${lv}">${LEVEL[lv]}</span>`; }
const DASH = '–';

// One chart for everything: dots, a line, bars, a shaded normal range and a goal line over a run of days.
// Values are { day: number } or { day: { v, hollow } }.
function chart({ days, dots = {}, line = {}, bars = {}, band = null, goal = null, fy = r1, h = 150, zero = false, ci = null, c = null, now = false }) {
  const val = x => typeof x === 'object' && x ? x.v : x;
  const vals = [dots, line, bars].flatMap(o => Object.values(o).map(val)).filter(Number.isFinite);
  if (vals.length < 2) return '';
  if (band) vals.push(...band);
  if (ci) for (const v of Object.values(ci)) vals.push(...v);
  if (goal != null) vals.push(goal);
  let y0 = Math.min(...vals), y1 = Math.max(...vals);
  const pad = (y1 - y0) * 0.12 || Math.abs(y1) * 0.05 || 1;
  y0 = zero ? 0 : y0 - pad; y1 += pad;
  const W = 340, H = h, L = 34, R = 6, T = 8, B = 20, n = days.length, idx = Object.fromEntries(days.map((k, i) => [k, i]));
  const X = i => L + (n > 1 ? i / (n - 1) : 0.5) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const bw = Math.max(2, (W - L - R) / n * 0.62), ticks = niceTicks(y0, y1);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" ${c ? `style="--c:${c}"` : ''}>`;
  s += ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="0" y="${(Y(v) + 3.5).toFixed(1)}">${fy(v)}</text>`).join('');
  if (band) s += `<rect class="band" x="${L}" width="${W - L - R}" y="${Y(band[1]).toFixed(1)}" height="${Math.max(1, Y(band[0]) - Y(band[1])).toFixed(1)}"/>`;
  if (ci) {
    const cp = Object.entries(ci).filter(([k, v]) => idx[k] != null && v && Number.isFinite(v[0]) && Number.isFinite(v[1])).sort((a, b) => idx[a[0]] - idx[b[0]]);
    if (cp.length > 1) s += `<path class="ciband" d="${cp.map(([k, v], i) => `${i ? 'L' : 'M'}${X(idx[k]).toFixed(1)},${Y(v[1]).toFixed(1)}`).join('')}${cp.slice().reverse().map(([k, v]) => `L${X(idx[k]).toFixed(1)},${Y(v[0]).toFixed(1)}`).join('')}Z"/>`;
  }
  if (goal != null) s += `<line class="goal" x1="${L}" x2="${W - R}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}"/>`;
  for (const [k, x] of Object.entries(bars)) if (idx[k] != null && Number.isFinite(val(x))) s += `<rect class="b ${x.cls || ''}" x="${(X(idx[k]) - bw / 2).toFixed(1)}" y="${Y(val(x)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, Y(y0) - Y(val(x))).toFixed(1)}" rx="1.5"/>`;
  const lp = Object.entries(line).filter(([k, x]) => idx[k] != null && Number.isFinite(val(x))).sort((a, b) => idx[a[0]] - idx[b[0]]);
  if (lp.length > 1) s += `<path class="ln" d="${lp.map(([k, x], i) => `${i ? 'L' : 'M'}${X(idx[k]).toFixed(1)},${Y(val(x)).toFixed(1)}`).join('')}"/>`;
  if (now && lp.length) { const [k, x] = lp[lp.length - 1]; s += `<circle class="now" cx="${X(idx[k]).toFixed(1)}" cy="${Y(val(x)).toFixed(1)}" r="4.5"/>`; }
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

// A collapsible list of dated readings, each removable (with undo). stream names where they live in S.
function historyList(title, rows, stream) {
  if (!rows.length) return '';
  return `<details class="inner hist"><summary>${title} · ${rows.length}</summary><p class="sub small">Swipe a row left to remove it.</p><ul class="list swipelist">${rows.map(([k, text]) =>
    `<li data-swipe="rmread" data-s="${stream}" data-k="${k}"><span class="grow" ${stream === 'hrv' ? `data-act="hrinfo" data-k="${k}"` : ''}><span class="nm">${dateLabel(k, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })}</span><span class="sub">${text}</span></span>${stream === 'hrv' ? '<span class="chev">›</span>' : `<button class="mini" data-act="rmread" data-s="${stream}" data-k="${k}">Remove</button>`}</li>`).join('')}</ul></details>`;
}

// ---------- the new building blocks ----------
// Icons, drawn on a 24-unit grid with round joins, stroked in currentColor.
const IC = {
  food: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 3c-2 2-2 6 0 8v10"/>',
  heart: '<path d="M3 12h4l2-5 3 10 2.5-7 1.5 2H21"/>',
  sleep: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  move: '<circle cx="15" cy="4.5" r="2"/><path d="M8 21l3-6 3 2v5M6 12l3-4 4 1 3 4h3"/>',
  body: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M9 9a3 3 0 0 1 6 0M12 9l1.5-1.5"/>',
  train: '<path d="M3 12h18M6 8v8M18 8v8M3.5 10v4M20.5 10v4"/>',
  spark: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="2.5"/>',
  insight: '<path d="M4 19l5-6 4 3 7-9"/><path d="M15 7h5v5"/>',
  breathe: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" opacity=".55"/><circle cx="12" cy="12" r="10.5" opacity=".25"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  fwd: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M4 12.5l4.5 4.5L20 5.5"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  pulse: '<path d="M12 21s-7-4.5-9-9.5C1.7 8 4 5 7 5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3 0 5.3 3 4 6.5-2 5-9 9.5-9 9.5z"/>',
  sunrise: '<path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 4v5M5.5 9.5l2 2M18.5 9.5l-2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  cup: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3c-.8 1 .8 2 0 3M12 3c-.8 1 .8 2 0 3"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5"/>',
  tape: '<circle cx="9" cy="12" r="6"/><circle cx="9" cy="12" r="1.5"/><path d="M15 12h6v4h-6"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8v8M11 8v8M13.5 8v8M16 8v8"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
};
function ic(name, extra = '') { return `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${IC[name] || ''}</svg>`; }
const MEAL_IC = { breakfast: 'sunrise', lunch: 'sun', snack: 'cup', dinner: 'moon' };
// A ring: the fraction filled in its colour, eased from where it was last time. inner is the HTML in the middle.
const ringLast = {};
function ring(key, frac, { c = 'var(--accent)', size = 100, stroke = 9, inner = '', over = false, glow = false, cls = '' } = {}) {
  const r = 50 - stroke / 2 - 1, f = clamp(frac || 0, 0, 1) * 100, from = ringLast[key] ?? 0;
  ringLast[key] = f;
  const o = over ? clamp(frac - 1, 0, 1) * 100 : 0;
  return `<div class="ring ${cls}" style="--c:${c};width:${size}px;height:${size}px" ${key ? `data-ring="${esc(key)}"` : ''}><svg viewBox="0 0 100 100" aria-hidden="true">
    <circle class="bg" cx="50" cy="50" r="${r}" stroke-width="${stroke}" pathLength="100"/>
    ${f > 0 ? `<circle class="fg ${glow ? 'glow' : ''}" cx="50" cy="50" r="${r}" stroke-width="${stroke}" pathLength="100" stroke-dasharray="${from.toFixed(2)} 100" data-dash="${f.toFixed(2)}"/>` : ''}
    ${o > 0 ? `<circle class="fg fg2" cx="50" cy="50" r="${r}" stroke-width="${stroke}" pathLength="100" stroke-dasharray="0 100" data-dash="${o.toFixed(2)}"/>` : ''}
  </svg><div>${inner}</div></div>`;
}
// A thin meter in a colour, with an optional tick (a target inside a longer scale).
function meter2(frac, c, tick = null, over = false) {
  const f = clamp(frac || 0, 0, 1.6);
  return `<div class="meter2" style="--c:${c}"><i class="${over && f > 1 ? 'over' : ''}" style="width:${(Math.min(1, f) * 100).toFixed(1)}%"></i>${tick != null ? `<span class="tick" style="left:${(clamp(tick, 0, 1) * 100).toFixed(1)}%"></span>` : ''}</div>`;
}
// The header of a tab: what day it is and the title on the left; status and you on the right.
function appbar(title, eyebrow = '', right = '') {
  return `<header class="appbar"><div class="grow">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1>${title}</h1></div>${right}<a class="avatar" href="#me" aria-label="You and your settings">${ic('person')}${backupDue() ? '<i class="bd" title="Backup needs you"></i>' : ''}</a></header>`;
}
// The dot on your face at the top: the backup needs you (no folder on the phone, or no export for two weeks in Chrome).
function backupDue() {
  if (Object.keys(S.food).length + Object.keys(S.weights).length < 14) return false;
  if (NATIVE) return !BACKUP.folder || (!!S.meta.backup && gapDays(S.meta.backup, todayKey()) >= 3);
  return !S.meta.exported || gapDays(S.meta.exported, todayKey()) > 14;
}
// A card's heading with its domain icon in its colour.
function cardHead(title, icon, c, right = '') { return `<div class="mh"><span class="ico" style="--c:${c}">${ic(icon)}</span><h2>${title}</h2>${right}</div>`; }
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('ui.js');

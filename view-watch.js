'use strict';
// The watch's own page (#watch): every daily figure the watch and the scale bring, by category, over a week, a month,
// a year or everything, and one figure in full (#watch-<metric>).
//
// What each figure is read with, and why:
//  - The period's daily mean (and median, range, days with data). A day without a reading is left out, never zero.
//  - Change against the period before it, as the difference of means with its 95% interval (Welch), and its size in
//    the day-to-day spread of the earlier period (Cohen's d: under 0.2 is no real change, Hopkins 2009). An interval
//    that spans zero is said to be within the noise.
//  - Direction within the period: Theil–Sen slope per week with its distribution-free 95% interval (Sen 1968), so one
//    odd day cannot make a trend; said only when the interval clears zero.
//  - By weekday, once every weekday has two readings: habits show here before they show anywhere else.
// The watch's own scores (stress, PAI) and its energy estimates are shown as figures, never judged: none is validated
// well enough to act on (Shcherbina 2017 for wrist energy).

const WV = { range: 'month', cat: 'move' };
const WV_RANGES = [['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['all', 'All']];
const WV_CATS = [['move', 'Activity', 'move', 'var(--move)'], ['heart', 'Heart', 'heart', 'var(--heart)'], ['sleep', 'Sleep', 'sleep', 'var(--sleep)'],
  ['air', 'Oxygen & breathing', 'breathe', 'var(--pro)'], ['body', 'Body', 'body', 'var(--body)'], ['scores', 'Watch scores', 'spark', 'var(--soft)']];
const wxv = f => k => S.wx[k]?.[f] ?? null;
// [key, name, unit, category, value of a day, decimals, which way is better (1 up, −1 down, 0 neither), evidence key, one line on reading it]
const WV_M = [
  ['steps', 'Steps', '', 'move', k => S.steps[k] ?? null, 0, 1, 'steps', 'Deaths fall as daily steps rise, levelling off near 8,000–10,000 under 60 (Paluch 2022, 15 cohorts). Wrist counts run a little low at slow walking.'],
  ['brisk', 'Brisk walking', 'min', 'move', wxv('bm'), 0, 1, 'steps', 'Minutes at 100+ steps a minute: moderate intensity for most adults (Tudor-Locke 2018).'],
  ['dist', 'Distance', 'km', 'move', k => S.wx[k]?.di != null ? S.wx[k].di / 1000 : null, 1, 1, null, 'From steps and your stride: as good as the step count, no better.'],
  ['floors', 'Floors', '', 'move', wxv('fl'), 0, 1, null, 'From the barometer: a building floor is about 3 m climbed.'],
  ['active', 'Active energy', 'kcal', 'move', wxv('ak'), 0, 0, null, 'A wrist energy estimate is off by 27–93% (Shcherbina 2017): shown, never used for your targets.'],
  ['rhr', 'Resting heart rate', 'bpm', 'heart', k => S.rhr[k] ?? null, 0, -1, 'rhrrisk', 'Lower is fitter; a rise that lasts several days with HRV down is what matters, not one morning (Buchheit 2014).'],
  ['hrv', 'Overnight HRV', 'ms', 'heart', wxv('hv'), 0, 1, 'night', 'Read only against your own usual, as a 7-day mean: single nights swing widely (Plews 2013).'],
  ['vo2', 'VO2max estimate', 'ml/kg/min', 'heart', wxv('vo'), 1, 1, 'fitness', 'A watch estimate is within about ±10–15% of a lab test (Molina-Garcia 2022): its direction is worth more than its value.'],
  ['sleep', 'Sleep', 'h', 'sleep', k => S.sleep[k] ?? null, 1, 1, 'sleepdur', '7 to 9 hours for adults (AASM–SRS consensus, Watson 2015). Watches count some quiet waking as sleep.'],
  ['deep', 'Deep sleep', 'min', 'sleep', k => S.sleepx[k]?.d ?? null, 0, 0, 'stages', 'Watch stages agree with a sleep lab for about half of each night (Chinoy 2021): described, never judged.'],
  ['rem', 'REM sleep', 'min', 'sleep', k => S.sleepx[k]?.r ?? null, 0, 0, 'stages', 'As for deep sleep: a description of the night, not a grade.'],
  ['awake', 'Awake in the night', 'min', 'sleep', k => S.sleepx[k]?.w ?? null, 0, 0, 'stages', 'Brief waking is normal; watches miss some of it.'],
  ['shr', 'Heart rate asleep', 'bpm', 'sleep', k => S.sleepx[k]?.hr ?? null, 0, -1, 'rhr', 'Lower than awake resting heart rate; alcohol, a late meal and illness raise it.'],
  ['o2n', 'Blood oxygen in sleep', '%', 'air', wxv('o2n'), 1, 1, 'spo2', 'Not a diagnosis. Repeated nights under 92% are worth mentioning to a doctor.'],
  ['o2', 'Blood oxygen, day', '%', 'air', wxv('o2'), 1, 1, 'spo2', 'Spot readings from the wrist; movement lowers them.'],
  ['br', 'Breathing in sleep', '/min', 'air', wxv('br'), 1, 0, 'night', 'Steady from night to night; a rise of 2 or more against your usual often comes with illness.'],
  ['skin', 'Skin temperature in sleep', '°C', 'air', k => S.wx[k]?.sk ?? S.wx[k]?.skd ?? null, 1, 0, 'ill', 'Only the change from your own usual means anything; 0.5 °C up is worth a look.'],
  ['weight', 'Weight', 'kg', 'body', k => S.weights[k] ?? null, 1, 0, 'trend', 'Water moves it 1–2 kg day to day: read the weekly mean, not a morning.'],
  ['bf', 'Body fat', '%', 'body', wxv('bf'), 1, -1, 'comp', 'A bathroom scale’s body fat is off by several points; its slow direction is what to read.'],
  ['worn', 'Watch worn', 'h', 'body', k => S.wx[k]?.wm != null ? S.wx[k].wm / 60 : null, 1, 1, null, 'A day counts when the watch was on 10 hours or more (Tudor-Locke 2018).'],
  ['stress', 'Stress', '', 'scores', wxv('ss'), 0, 0, null, 'The watch’s own score from heart rate and HRV; its method is unpublished. Shown, never used.'],
  ['pai', 'PAI', '', 'scores', wxv('pai'), 0, 1, null, 'The watch’s 7-day activity score (from the HUNT cohort); shown, never used.'],
];
const WVX = Object.fromEntries(WV_M.map(m => [m[0], m]));

// ---------- the numbers ----------
function wvDays(rk, end = todayKey()) {
  if (rk === 'week') return range(7, end);
  if (rk === 'month') return range(30, end);
  if (rk === 'year') return range(364, end);
  const first = wvFirst();
  return first ? range(Math.min(gapDays(first, end) + 1, 3650), end) : range(30, end);
}
// The oldest day anything the page reads was recorded.
function wvFirst() {
  return cached('wvFirst', () => [S.steps, S.rhr, S.sleep, S.sleepx, S.wx, S.weights].map(o => Object.keys(o).sort()[0]).filter(Boolean).sort()[0] || null);
}
// Bins for the chart: days for a week or a month, weeks for a year, months for everything.
function wvBins(days, get, rangeKey) {
  if (rangeKey === 'week' || rangeKey === 'month') return days.map(k => ({ k, lab: k, v: get(k), n: get(k) == null ? 0 : 1 }));
  const groups = new Map();
  days.forEach((k, i) => {
    const g = rangeKey === 'year' ? days[Math.floor(i / 7) * 7] : k.slice(0, 7);
    if (!groups.has(g)) groups.set(g, []);
    const v = get(k); if (v != null) groups.get(g).push(v);
  });
  return [...groups.entries()].map(([k, vs]) => ({ k, lab: rangeKey === 'year' ? k : k + '-15', v: vs.length ? mean(vs) : null, n: vs.length }));
}
function wvVals(days, get) { const out = []; for (const k of days) { const v = get(k); if (v != null && Number.isFinite(v)) out.push(v); } return out; }
// Difference of two means with its 95% interval (Welch), and its size in the earlier period's spread.
function wvCompare(a, b, z = 1.96) {
  if (a.length < 3 || b.length < 3) return null;
  const ma = mean(a), mb = mean(b), sa = sd(a), sb = sd(b), se = Math.sqrt(sa * sa / a.length + sb * sb / b.length);
  const d = ma - mb, es = sb > 0 ? d / sb : null;
  return { d, lo: d - z * se, hi: d + z * se, es, clear: d - z * se > 0 || d + z * se < 0 };
}
function wvTrend(days, get) {
  const pts = [];
  days.forEach((k, i) => { const v = get(k); if (v != null) pts.push([i / 7, v]); });
  if (pts.length < 8) return null;
  const T = theilSenCI(pts.length > 400 ? pts.filter((_, i) => i % Math.ceil(pts.length / 400) === 0) : pts);
  return T ? { ...T, clear: T.lo > 0 || T.hi < 0 } : null;
}
function wvFmt(m, v) { return v == null ? DASH : m[5] ? (Math.round(v * 10 ** m[5]) / 10 ** m[5]).toFixed(m[5]) : fmt(v); }
function wvSign(m, v, extra = 0) { const d = (m[5] || 0) + extra; return d ? sign(v, d) : (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v)); }
function wvSize(es) { const a = Math.abs(es); return a < 0.2 ? 'no real' : a < 0.6 ? 'a small' : a < 1.2 ? 'a moderate' : 'a large'; }

// ---------- the chart ----------
// Bars for counts (steps, minutes), a line with dots for levels; the period mean as a dashed line. A finger or a
// mouse moving across it reads each bin in the line above, without drawing the page again.
function wvChart(m, bins, c, opt = {}) {
  const vs = bins.map(b => b.v).filter(v => v != null);
  if (vs.length < 2) return `<p class="sub">Not enough readings in this period to draw.</p>`;
  const bars = ['steps', 'brisk', 'dist', 'floors', 'active', 'sleep', 'deep', 'rem', 'awake', 'worn', 'pai'].includes(m[0]);
  let y0 = Math.min(...vs), y1 = Math.max(...vs);
  if (bars) y0 = 0; else { const pad = (y1 - y0) * 0.15 || Math.abs(y1) * 0.04 || 1; y0 -= pad; y1 += pad; }
  if (y1 === y0) y1 = y0 + 1;
  const W = 340, H = opt.h || 170, L = 36, R = 8, T = 10, B = 22, n = bins.length;
  const X = i => L + (n > 1 ? (i + 0.5) / n : 0.5) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const bw = Math.max(1.5, (W - L - R) / n * 0.66), ticks = niceTicks(y0, y1), avg = mean(vs);
  const f = v => wvFmt(m, v);
  let s = `<svg class="wvchart ${bars ? 'bars' : 'lines'}" viewBox="0 0 ${W} ${H}" style="--c:${c}" data-m="${m[0]}" role="img" aria-label="${esc(m[1])}, mean ${f(avg)}">`;
  s += ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="0" y="${(Y(v) + 3.5).toFixed(1)}">${m[5] ? r1(v) : fmt(v)}</text>`).join('');
  if (bars) bins.forEach((b, i) => { if (b.v != null) s += `<rect class="b" style="--d:${Math.min(i, 40) * 12}ms" x="${(X(i) - bw / 2).toFixed(1)}" y="${Y(b.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.8, Y(y0) - Y(b.v)).toFixed(1)}" rx="${Math.min(3, bw / 3).toFixed(1)}"/>`; });
  else {
    const pts = bins.map((b, i) => b.v == null ? null : [X(i), Y(b.v)]);
    let d = '', pen = false;
    for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`; pen = true; }
    s += `<path class="ln" pathLength="1" d="${d}"/>` + pts.map(p => p ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${n > 60 ? 1.6 : 2.6}"/>` : '').join('');
  }
  s += `<line class="avg" x1="${L}" x2="${W - R}" y1="${Y(avg).toFixed(1)}" y2="${Y(avg).toFixed(1)}"/>`;
  const lab = i => { const b = bins[i]; return WV.range === 'all' ? dateLabel(b.lab, { month: 'short', year: '2-digit' }) : dateLabel(b.k); };
  const ix = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1];
  s += ix.map((i, j) => `<text class="x" x="${X(i).toFixed(1)}" y="${H - 5}" text-anchor="${ix.length === 3 ? ['start', 'middle', 'end'][j] : j ? 'end' : 'start'}">${lab(i)}</text>`).join('');
  // What the finger reads: each bin's label and value, in order.
  const read = bins.map((b, i) => [X(i), b.v == null ? '' : `${f(b.v)}${m[2] ? ' ' + m[2] : ''}`, WV.range === 'year' ? `week of ${dateLabel(b.k)}` : WV.range === 'all' ? dateLabel(b.lab, { month: 'long', year: 'numeric' }) : dateLabel(b.k, { weekday: 'short', day: 'numeric', month: 'short' }), b.v == null ? null : Y(b.v)]);
  s += `<line class="cur" x1="0" x2="0" y1="${T}" y2="${H - B}" style="opacity:0"/><circle class="curdot" r="4.5" cx="0" cy="0" style="opacity:0"/>`;
  s += `<rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${H}" data-read='${esc(JSON.stringify(read))}'/></svg>`;
  return s;
}
function wvSpark(bins, c) {
  const pts = bins.map((b, i) => [i, b.v]).filter(p => p[1] != null);
  if (pts.length < 2) return '<span class="wvspark"></span>';
  const vs = pts.map(p => p[1]), lo = Math.min(...vs), hi = Math.max(...vs), n = bins.length - 1 || 1;
  const d = pts.map(([i, v], j) => `${j ? 'L' : 'M'}${(i / n * 100).toFixed(1)},${(26 - (v - lo) / (hi - lo || 1) * 22).toFixed(1)}`).join('');
  return `<svg class="wvspark" viewBox="0 0 100 28" preserveAspectRatio="none" style="--c:${c}" aria-hidden="true"><path pathLength="1" d="${d}"/></svg>`;
}

// ---------- the page ----------
function wvPrev(days) { return range(days.length, shift(days[0], -1)); }
function wvCard(m, c) {
  const days = wvDays(WV.range), vals = wvVals(days, m[4]);
  if (!vals.length) return '';
  const C = wvCompare(vals, wvVals(wvPrev(days), m[4])), bins = wvBins(days, m[4], WV.range === 'week' ? 'week' : WV.range === 'month' ? 'month' : 'year');
  const tone = C?.clear && m[6] ? (Math.sign(C.d) === m[6] ? 'good' : 'bad') : '';
  const chg = C ? (C.clear && Math.abs(C.es ?? 0) >= 0.2 ? `<span class="wvchg ${tone}">${C.d > 0 ? '▲' : '▼'} ${wvFmt(m, Math.abs(C.d))}</span>` : '<span class="wvchg">≈ as before</span>') : '';
  return `<li><a class="wvrow" href="#watch-${m[0]}"><span class="grow"><span class="nm">${m[1]}</span><span class="sub num">${plural(vals.length, 'day')} · ${wvFmt(m, Math.min(...vals))}–${wvFmt(m, Math.max(...vals))}</span></span>
    ${wvSpark(bins, c)}<span class="wvval"><b class="num">${wvFmt(m, mean(vals))}</b><i>${m[2] || 'a day'}</i>${chg}</span><span class="chev">›</span></a></li>`;
}
function wvTop() {
  const F = S.meta.fresh, days = wvDays(WV.range), worn = days.filter(k => (S.wx[k]?.wm ?? 0) >= 600).length, anyWm = days.some(k => S.wx[k]?.wm != null);
  const src = F?.watch ? `${esc(F.watch)} · read ${ago(F.read)}` : S.meta.sync ? `last sync ${ago(S.meta.sync)}` : 'from your imports and the daily sync';
  return `<p class="sub small wvsrc">${src}${anyWm ? ` · worn 10 h+ on ${worn} of ${days.length} days` : ''}. Each figure is the mean of the days that have it; a day without a reading is left out, never counted as zero.</p>`;
}
function vWatch(key) {
  const back = `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>`;
  if (key && WVX[key]) return vWatchMetric(WVX[key], back);
  const cats = WV_CATS.map(([id, n, icn, c]) => {
    const rows = WV_M.filter(m => m[3] === id).map(m => wvCard(m, c)).join('');
    return [id, n, icn, c, rows];
  });
  const have = cats.filter(x => x[4]);
  if (!have.some(x => x[0] === WV.cat)) WV.cat = have[0]?.[0] || 'move';
  const on = cats.find(x => x[0] === WV.cat);
  const chips = cats.map(([id, n, icn, c, rows]) => `<button class="${id === WV.cat ? 'on' : ''} ${rows ? '' : 'none'}" data-act="wvcat" data-v="${id}" style="--c:${c}" ${rows ? '' : 'disabled'}>${ic(icn)}${n}</button>`).join('');
  const body = on?.[4] ? `<section class="card wvlist" style="--c:${on[3]}">${cardHead(on[1], on[2], on[3])}<ul class="list">${on[4]}</ul></section>`
    : `<section class="card">${para('Nothing from the watch yet in this period. Sync from the Android app, or bring in older history under You › Data sources › History files.')}</section>`;
  return `${masthead('Watch', 'Every day the watch and scale recorded', { before: back, after: why('night', 'What it measures') })}
    ${seg('wvrange', WV_RANGES, WV.range, 'wvseg')}${wvTop()}<div class="chips wvcats">${chips}</div><div class="wvbody" data-k="${WV.cat}-${WV.range}">${body}</div>
    <p class="sub small">Tap a figure for its chart, its change with a 95% interval, its direction and its weekday pattern. ▲▼ appear only when a change is clear of the day-to-day noise; green or red only where one direction is plainly better.</p>`;
}
function vWatchMetric(m, back) {
  const c = WV_CATS.find(x => x[0] === m[3])[3], days = wvDays(WV.range), vals = wvVals(days, m[4]);
  const head = masthead(m[1], WV_CATS.find(x => x[0] === m[3])[1], { before: back, after: m[7] ? why(m[7], 'Why') : '' });
  if (!vals.length) return `${head}${seg('wvrange', WV_RANGES, WV.range, 'wvseg')}<section class="card">${para(`No ${m[1].toLowerCase()} in this period. Try a longer one.`)}</section>`;
  const bins = wvBins(days, m[4], WV.range), prevVals = wvVals(wvPrev(days), m[4]), C = wvCompare(vals, prevVals), Tr = WV.range === 'week' ? null : wvTrend(days, m[4]);
  const u = m[2] ? ` ${m[2]}` : '', per = { week: 'week', month: '30 days', year: 'year', all: 'stretch' }[WV.range];
  const cmp = !C ? para(prevVals.length ? 'Too few readings in the period before to compare.' : 'Nothing in the period before to compare with.')
    : para(`<b>${wvSign(m, C.d)}${u}</b> against the ${per} before (95% interval ${wvSign(m, C.lo)} to ${wvSign(m, C.hi)}). ${C.clear ? `That is ${wvSize(C.es ?? 0)} change for you${C.es != null ? `, ${r1(Math.abs(C.es))} of your usual day-to-day spread` : ''}.` : 'Within the noise: the interval includes no change.'}`);
  const tr = !Tr ? '' : para(Tr.clear ? `<b>${Tr.m > 0 ? 'Rising' : 'Falling'}</b> ${wvSign(m, Math.abs(Tr.m), 1).slice(1)}${u} a week through this ${per} (95% interval ${wvSign(m, Tr.lo, 1)} to ${wvSign(m, Tr.hi, 1)}).` : `<b>No clear direction</b> through this ${per}: the weekly slope's 95% interval (${wvSign(m, Tr.lo, 1)} to ${wvSign(m, Tr.hi, 1)}) includes none.`);
  // By weekday, once every day of the week has two readings.
  let wk = '';
  if (WV.range !== 'week') {
    const by = Array.from({ length: 7 }, () => []);
    for (const k of days) { const v = m[4](k); if (v != null) by[new Date(k + 'T12:00').getDay()].push(v); }
    if (by.every(a => a.length >= 2)) {
      const order = [1, 2, 3, 4, 5, 6, 0], ms = order.map(i => mean(by[i])), all = mean(vals), lab = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      // Is any weekday apart from the rest beyond chance? Its mean against the others', at 95% for all seven at once
      // (Bonferroni: z 2.69), so seven looks do not find a pattern in noise.
      // Stepwise: the day furthest from the rest is tested first and, if apart, set aside before the next look, so one
      // low Sunday does not make every other day look high.
      const apart = [], rest = order.slice();
      for (;;) {
        const tests = rest.map(i => [i, wvCompare(by[i], rest.filter(j => j !== i).flatMap(j => by[j]), 2.69)]).filter(t => t[1]);
        const top = tests.sort((x, y) => Math.abs(y[1].d / ((y[1].hi - y[1].lo) || 1)) - Math.abs(x[1].d / ((x[1].hi - x[1].lo) || 1)))[0];
        if (!top || !top[1].clear || Math.abs(top[1].es ?? 0) < 0.3 || rest.length < 3) break;
        apart.push(top[0]); rest.splice(rest.indexOf(top[0]), 1);
      }
      const note = apart.length ? `${apart.map(i => `<b>${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][i]}</b>`).join(', ')} stand apart from your other days beyond chance.` : 'No weekday stands apart beyond chance.';
      if (['steps', 'brisk', 'floors', 'sleep', 'worn', 'dist'].includes(m[0])) {
        const hi = Math.max(...ms);
        wk = `<h3>By weekday</h3><div class="wvwk" style="--c:${c}">${order.map((d, j) => `<div><i style="--h:${(ms[j] / (hi || 1) * 100).toFixed(0)}%"></i><b class="num">${wvFmt(m, ms[j])}</b><span>${lab[d]}</span></div>`).join('')}</div>${para(note, 'sub small')}`;
      } else {
        // A level (heart rate, HRV, weight): each weekday's difference from your mean, so a 2 ms wobble looks like one.
        const dv = ms.map(x => x - all), big = Math.max(...dv.map(Math.abs), sd(vals) || 0) || 1;
        wk = `<h3>By weekday, against your mean of ${wvFmt(m, all)}${u}</h3><div class="wvwk dev" style="--c:${c}">${order.map((d, j) => `<div><i class="${dv[j] < 0 ? 'neg' : 'pos'}" style="--h:${(Math.abs(dv[j]) / big * 100).toFixed(0)}%"></i><b class="num">${wvSign(m, dv[j], m[5] ? 0 : 0)}</b><span>${lab[d]}</span></div>`).join('')}</div>${para(note + ' Bars are scaled to your day-to-day spread.', 'sub small')}`;
      }
    }
  }
  const s = sd(vals);
  return `${head}${seg('wvrange', WV_RANGES, WV.range, 'wvseg')}
    <section class="card wvhero" style="--c:${c}"><div class="wvread" aria-live="polite"><b class="num">${wvFmt(m, mean(vals))}<i>${u}</i></b><span class="sub">mean of ${plural(vals.length, 'day')} · drag across the chart to read any ${WV.range === 'year' ? 'week' : WV.range === 'all' ? 'month' : 'day'}</span></div>
    ${wvChart(m, bins, c)}${stats([[wvFmt(m, median(vals)), 'median'], [`${wvFmt(m, Math.min(...vals))}–${wvFmt(m, Math.max(...vals))}`, 'lowest–highest'], [s != null ? `±${wvFmt(m, s)}` : DASH, 'day to day']], 'three')}</section>
    <section class="card"><h2>What changed</h2>${cmp}${tr}${wk}</section>
    <section class="card flat wvev">${para(`${m[8]} ${m[7] ? why(m[7], 'The evidence') : ''}`)}</section>`;
}

// ---------- reading the chart by finger ----------
function wvScrub(e) {
  const hit = e.target.closest?.('.wvchart .hit');
  if (!hit) return;
  const svg = hit.ownerSVGElement, box = svg.getBoundingClientRect(), x = (e.clientX - box.left) / box.width * 340;
  let read; try { read = JSON.parse(hit.dataset.read); } catch (err) { return; }
  let best = 0;
  for (let i = 1; i < read.length; i++) if (Math.abs(read[i][0] - x) < Math.abs(read[best][0] - x)) best = i;
  const r = read[best], cur = svg.querySelector('.cur'), dot = svg.querySelector('.curdot'), out = svg.closest('.wvhero')?.querySelector('.wvread');
  cur.setAttribute('x1', r[0]); cur.setAttribute('x2', r[0]); cur.style.opacity = 1;
  if (r[3] != null) { dot.setAttribute('cx', r[0]); dot.setAttribute('cy', r[3]); dot.style.opacity = 1; } else dot.style.opacity = 0;
  if (out && out.dataset.at !== String(best)) {
    out.dataset.at = best;
    out.innerHTML = `<b class="num">${r[1] || DASH}</b><span class="sub">${esc(r[2])}${r[1] ? '' : ' · no reading'}</span>`;
    buzz?.('tick');
  }
}
document.addEventListener('pointerdown', wvScrub);
document.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) wvScrub(e); });

function wvAct(a, el) {
  if (a === 'wvrange') { if (WV.range !== el.dataset.v) { WV.range = el.dataset.v; buzz('tick'); renderView(); } return true; }
  if (a === 'wvcat') { if (WV.cat !== el.dataset.v) { WV.cat = el.dataset.v; buzz('tick'); renderView(); } return true; }
  return false;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-watch.js');

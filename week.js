'use strict';
// The week in review: Monday to Sunday against the week before, each figure with the days it rests on, and a change
// called real only when it is clear of the day-to-day spread (Welch's 95% interval on the daily values). Then one
// thing for the next week, the largest gap against an evidence-based target. On Today from Sunday evening through
// Monday until it is read; any week from Insights › Week.
//
// Nothing is filled in: a figure with too few days says how many it has instead of a number, and a day the watch
// was not worn, or a food day not marked complete, is not counted as a zero.

// The Sunday that ends the week to review: today from 17:00 on a Sunday, otherwise the Sunday before.
function weekEnd(now = new Date()) {
  const d = new Date(now), dow = d.getDay();
  if (dow === 0 && d.getHours() >= 17) return dk(d);
  d.setDate(d.getDate() - (dow === 0 ? 7 : dow));
  return dk(d);
}
const WK_NEED = 4;   // days a week needs for a daily average
function weekRows(end) {
  return cached('WK' + end, () => {
    const T = targets(), cur = range(7, end), prev = range(7, shift(end, -7)), kgw = T.wt;
    const vals = (days, f) => days.map(f).filter(v => v != null && Number.isFinite(v));
    const row = (key, label, f, o = {}) => {
      const a = vals(cur, f), b = vals(prev, f), need = o.need ?? WK_NEED;
      const now = a.length >= need ? mean(a) : null, was = b.length >= need ? mean(b) : null;
      const C = now != null && was != null ? wvCompare(a, b) : null;
      return Object.assign({ key, label, now, was, n: a.length, need, C }, o);
    };
    const full = k => S.food[k] && isComplete(k);
    const rows = [
      row('kcal', 'Calories', k => full(k) ? totals(k).k : null, { unit: 'kcal', target: T.kcal, d: 0, better: 'near', why: 'logging' }),
      row('protein', 'Protein', k => full(k) ? totals(k).p : null, { unit: 'g', target: T.protein, d: 0, better: 'up', why: 'protein' }),
      row('fibre', 'Fibre', k => full(k) ? totals(k).fb : null, { unit: 'g', target: T.fibre, d: 0, better: 'up', why: 'fibre' }),
      row('steps', 'Steps', k => S.steps[k] ?? null, { unit: '', target: T.stepGoal, d: 0, better: 'up', why: 'steps' }),
      row('sleep', 'Sleep', sleepOn, { unit: 'h', target: 7, d: 1, better: 'up', why: 'sleepdur' }),
      row('rhr', 'Resting heart rate', k => restingHR(k)?.v ?? null, { unit: 'bpm', d: 0, better: 'down', why: 'rhr' }),
      row('hrv', 'Morning HRV', k => S.hrv[k] ? Math.log(S.hrv[k].rmssd) : null, { unit: 'ms', d: 0, better: 'up', why: 'hrv', need: 3, ln: true }),
    ];
    // Weight: the smoothed trend at each Sunday, not an average of raw weigh-ins.
    const t1 = trendOn(end), t0 = trendOn(shift(end, -7)), wn = cur.filter(k => S.weights[k] != null).length;
    const W = { key: 'weight', label: 'Weight trend', unit: 'kg', n: wn, need: 3, now: wn >= 3 ? t1 : null, was: t0, d: 1, why: 'trend' };
    if (W.now != null && t0 != null) { W.change = t1 - t0; W.pct = W.change / kgw * 100; }
    // Training: sessions done against the plan's days.
    const lifts = cur.filter(k => S.lifts[k]).length, liftsB = prev.filter(k => S.lifts[k]).length, A = activityWeek(end), Ab = activityWeek(shift(end, -7));
    const L = { key: 'train', label: 'Training', lifts, liftsB, per: prog()?.per || null, who: A.who, whoB: Ab.who, why: 'zones' };
    // The HRV row reads the strap's way: the week's mean ln RMSSD against your normal range.
    const V = hrvState(end);
    return { end, rows, W, L, V, foodDays: cur.filter(full).length };
  });
}
// One focus for the next week: the first of these that the data shows, in order of what moves the outcome most.
function weekFocus(R) {
  const g = k => R.rows.find(r => r.key === k), T = targets();
  const p = g('protein'), sl = g('sleep'), st = g('steps'), kc = g('kcal');
  if (R.foodDays < 4) return { t: 'Log four complete days', b: `Only ${plural(R.foodDays, 'day')} were marked complete. Averages from fewer days are not trustworthy, and your burn is learned only from complete days.`, why: 'logging' };
  if (p.now != null && p.now < T.protein * 0.85) return { t: `Protein to ${T.protein} g`, b: `You averaged ${Math.round(p.now)} g. Protein is what keeps muscle while losing fat; about ${T.perMeal} g at each main meal gets there.`, why: 'protein' };
  if (sl.now != null && sl.now < 6.5) return { t: 'Sleep at least 7 hours', b: `You averaged ${r1(sl.now)} h. In a deficit, short sleep shifts the loss from fat towards muscle.`, why: 'sleep' };
  if (kc.now != null && kc.now > T.kcal * 1.1) return { t: `Calories to ${fmt(T.kcal)}`, b: `You averaged ${fmt(kc.now)} kcal on complete days, ${fmt(kc.now - T.kcal)} over.`, why: 'kcal' };
  if (st.now != null && st.now < T.stepGoal * 0.8) return { t: `Steps to ${fmt(T.stepGoal)}`, b: `You averaged ${fmt(st.now)}. The mortality benefit keeps rising up to about 8,000–10,000 a day.`, why: 'steps' };
  if (R.L.per && R.L.lifts < R.L.per) return { t: `All ${R.L.per} sessions`, b: `${R.L.lifts} of ${R.L.per} done. Volume across the week is what builds and keeps muscle.`, why: 'lift' };
  return { t: 'Keep it as it is', b: 'Every target was met or close. Change nothing for a week, and the next trend reading will be cleaner.', why: 'rate' };
}
function weekVal(r, v) {
  if (v == null) return DASH;
  const x = r.ln ? Math.exp(v) : v;
  return `${r.d ? r1(x) : fmt(x)}${r.unit && r.unit !== '' ? ` <i>${r.unit}</i>` : ''}`;
}
// A change in words: real only when its 95% interval excludes zero, otherwise "about the same".
function weekChange(r) {
  if (r.now == null || r.was == null) return '';
  const C = r.C;
  if (!C || !C.clear) return '<span class="wkchg same">about the same</span>';
  const d = r.ln ? Math.exp(r.now) - Math.exp(r.was) : C.d, good = r.better === 'up' ? d > 0 : r.better === 'down' ? d < 0 : r.target ? Math.abs(r.now - r.target) < Math.abs(r.was - r.target) : null;
  return `<span class="wkchg ${good == null ? '' : good ? 'good' : 'bad'}">${sign(d, r.d || 0)} ${r.unit === 'kcal' ? '' : r.unit}</span>`;
}
function wkCard(end = weekEnd(), compact = false) {
  const R = weekRows(end), F = weekFocus(R), start = shift(end, -6);
  const lbl = k => dateLabel(k, { day: 'numeric', month: 'short' });
  const cell = (v, c) => `<td><b class="num">${v}</b>${c || ''}</td>`;
  const tr = r => `<tr class="${r.now == null ? 'muted' : ''}"><td>${why(r.why, r.label)}</td>${r.now == null ? `<td><span class="sub">${r.n} of ${r.need} days</span></td>` : cell(weekVal(r, r.now), weekChange(r))}</tr>`;
  const W = R.W, V = R.V;
  const wline = W.now == null ? `<span class="sub">${W.n} weigh-ins; needs 3</span>` : `${r1(W.now)} <i>kg</i>`;
  const wchg = W.change == null ? '' : `<span class="wkchg ${Math.abs(W.pct) <= 1 && W.change <= 0.05 ? 'good' : W.change > 0.3 ? 'bad' : ''}">${sign(W.change, 1)} kg · ${sign(W.pct, 1)}%</span>`;
  const hrvNote = V.state ? `HRV week ${V.state === 'normal' ? 'inside' : V.state === 'low' ? 'below' : 'above'} your range (${Math.round(V.lo)}–${Math.round(V.hi)} ms).` : '';
  const head = `<div class="eyebrow">Week ${lbl(start)} – ${lbl(end)}</div><h2>${compact ? 'Your week' : 'The week in numbers'}</h2>`;
  const table = `<table class="wk">
    <tr><td>${why(W.why, W.label)}</td>${W.now == null ? `<td>${wline}</td>` : cell(wline, wchg)}</tr>
    ${R.rows.map(tr).join('')}
    <tr><td>${why('lift', 'Lifting sessions')}</td>${cell(`${R.L.lifts}${R.L.per ? ` <i>of ${R.L.per}</i>` : ''}`, `<span class="wkchg same">${R.L.liftsB} the week before</span>`)}</tr>
    <tr><td>${why('zones', 'Active minutes')}</td>${cell(Math.round(R.L.who), `<span class="wkchg ${R.L.who >= 150 ? 'good' : ''}">WHO aims for 150</span>`)}</tr></table>`;
  const foot = `<p class="sub small">Daily averages over days with data. A change is shown only when its 95% interval is clear of zero; otherwise it is within the normal day-to-day spread. ${hrvNote}</p>`;
  const focus = `<div class="wkfocus"><span class="eyebrow">Next week</span><b>${F.t}</b><p class="sub">${F.b} ${why(F.why, 'Why')}</p></div>`;
  return `<section class="block wkrev">${head}${table}${focus}${compact ? `<div class="rowb"><button class="ghost" data-act="wkread" data-v="${end}">Done</button><button class="ghost" data-act="wkshare" data-v="${end}">Share</button></div>` : foot}</section>`;
}
// On Today: from Sunday 17:00 through Monday, until marked read.
function weekDue() {
  const end = weekEnd(), now = new Date();
  if (S.meta.wk === end || gapDays(end, todayKey()) > 1) return '';
  if (Object.keys(S.food).length + Object.keys(S.steps).length < 5) return '';
  return wkCard(end, true);
}
function weekText(end) {
  const R = weekRows(end), F = weekFocus(R), W = R.W;
  const lines = [`Week ${dateLabel(shift(end, -6), { day: 'numeric', month: 'short' })} – ${dateLabel(end, { day: 'numeric', month: 'short' })}`];
  if (W.now != null) lines.push(`Weight trend ${r1(W.now)} kg${W.change != null ? ` (${sign(W.change, 1)} kg)` : ''}`);
  for (const r of R.rows) lines.push(`${r.label}: ${r.now == null ? `not enough days (${r.n})` : `${(r.ln ? Math.exp(r.now) : r.now).toFixed(r.d || 0)} ${r.unit}`.trim()}`);
  lines.push(`Lifting ${R.L.lifts}${R.L.per ? ` of ${R.L.per}` : ''} · active minutes ${Math.round(R.L.who)}`, `Next week: ${F.t}`);
  return lines.join('\n');
}
function weekAct(a, el) {
  if (a === 'wkread') { S.meta.wk = el.dataset.v; save(); buzz('ok'); render(); return true; }
  if (a === 'wkshare') { const t = weekText(el.dataset.v); if (NATIVE) nat('share', 'My week', t); else if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { navigator.clipboard?.writeText(t); toast('Copied'); } return true; }
  if (a === 'wkprev' || a === 'wknext') { WKV.end = shift(WKV.end || weekEnd(), a === 'wkprev' ? -7 : 7); if (WKV.end > weekEnd()) WKV.end = weekEnd(); buzz('tick'); render(); return true; }
  return false;
}
// Insights › Week: any past week, stepped back and forth.
const WKV = { end: null };
function weekPart() {
  const end = WKV.end || weekEnd(), last = end >= weekEnd();
  return `<div class="wknav"><button class="nav" data-act="wkprev" aria-label="Week before">${ic('back')}</button><span>${dateLabel(shift(end, -6), { day: 'numeric', month: 'short' })} – ${dateLabel(end, { day: 'numeric', month: 'short', year: 'numeric' })}</span><button class="nav fwd" data-act="wknext" aria-label="Week after" ${last ? 'disabled' : ''}>${ic('back')}</button></div>${wkCard(end)}`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('week.js');

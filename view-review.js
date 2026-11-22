'use strict';
// Insights: what your data says, one part at a time (energy, body, the long game, the links that are real for you).

const grade = (v, hit, part) => v >= hit ? 2 : v >= part ? 1 : 0;
// Each cell: value shown and 0 (off) / 1 (partial) / 2 (on target); null = no data.
function dayCells(k, T) {
  const t = totals(k), V = S.hrv[k] ? hrvState(k) : null, st = S.steps[k], sl = S.sleep[k], full = S.food[k] && isComplete(k);
  const ss = sessions(k), act = ss.reduce((a, s) => a + (s.z[1] + 2 * (s.z[2] + s.z[3])) / 60, 0);
  return {
    kcal: t.n ? { v: (t.k / 1000).toFixed(1), s: !full ? 1 : t.k > T.kcal * 1.1 ? 0 : t.k >= T.kcal * 0.8 ? 2 : 1, x: full ? t.k : null, part: !full } : null,
    protein: t.n ? { v: Math.round(t.p), s: grade(t.p, T.protein * 0.9, T.protein * 0.7), x: t.p } : null,
    fibre: t.n ? { v: Math.round(t.fb), s: grade(t.fb, T.fibre * 0.9, T.fibre * 0.6), x: t.fb } : null,
    steps: st ? { v: (st / 1000).toFixed(1), s: grade(st, T.stepGoal, T.stepGoal * 0.7), x: st } : null,
    sleep: sl ? { v: r1(sl), s: grade(sl, 7, 6), x: sl } : null,
    train: S.lifts[k] ? { v: S.lifts[k].day, s: 2 } : ss.length ? { v: Math.round(act) || '♥', s: 2 } : null,
    hrv: V && V.lo ? { v: Math.round(V.now.rmssd), s: V.day === 'low' ? 0 : 2, x: V.now.rmssd } : V ? { v: Math.round(S.hrv[k].rmssd), s: 1, x: S.hrv[k].rmssd } : null,
  };
}
// The week as text, for sharing with a coach or a doctor.
function shareWeek(T, cells, E) {
  const avg = key => { const v = cells.map(c => c[key]).filter(c => c && c.x != null); return v.length ? mean(v.map(c => c.x)) : null; };
  const A = activityWeek(), L = sleepStats(7), R = rhrTrend(), wk = T.slope == null ? null : T.slope * 7;
  const lines = [`Week to ${dateLabel(todayKey(), { day: 'numeric', month: 'long' })}`,
    `Weight trend ${r1(T.wt)} kg${wk != null ? ` (${sign(wk, 2)} kg/week)` : ''}`,
    `Calories ${avg('kcal') ? fmt(avg('kcal')) : '–'} of ${fmt(T.kcal)} · protein ${avg('protein') ? Math.round(avg('protein')) : '–'} of ${T.protein} g · fibre ${avg('fibre') ? Math.round(avg('fibre')) : '–'} g`,
    `Steps ${avg('steps') ? fmt(avg('steps')) : '–'} a day · active minutes ${Math.round(A.who)} · strength days ${A.strengthDays}`,
    `Sleep ${L.avg != null ? r1(L.avg) + ' h' : '–'} · resting HR ${R.now ? Math.round(R.now) : '–'} bpm`];
  if (E.implied != null) lines.push(`Burn learned from intake and weight: ${fmt(E.implied)} ± ${fmt(1.96 * E.sd)} kcal/day`);
  return lines.join('\n');
}
// ---------- Insights ----------
// What the data says, one part at a time: your energy (the burn your body has shown, and how you eat), the body, the
// long game, and the links that are real in your own data. The headlines live on Today; nothing here repeats them.
// The burn the model has learned, its interval over time, and what it means this week.
function burnCard() {
  const T = targets(), M = T.model, E = energy();
  if (M.E == null) return sec('Your energy', para('Weigh in on a few mornings and log some complete days: your own burn is learned from both, and the interval narrows week by week.'), { why: ['burn', 'How'] });
  const hist = M.hist.slice(-90), days = hist.map(h => h.k), line = {}, ci = {}, bars = {};
  for (const h of hist) { line[h.k] = h.E; ci[h.k] = [h.E - 1.96 * h.sdE, h.E + 1.96 * h.sdE]; const t = S.food[h.k] && isComplete(h.k) ? totals(h.k).k : null; if (t != null) bars[h.k] = { v: t, cls: 'dim' }; }
  const c = days.length >= 7 ? chart({ days, line, ci, bars, goal: T.kcal, c: 'var(--fuel)', fy: v => fmt(v), h: 170, now: true }) : '';
  const conf = { calibrating: 'Learning', rough: 'Rough', good: 'Good', tight: 'Tight' }[M.conf];
  const wk = M.week, fatWk = wk ? wk.bal * 7 / M.rho : null;
  return `<section class="card" id="in-burn">${cardHead('Your energy', 'bolt', 'var(--fuel)', why('burn', 'how'))}
    <div class="burnkpi"><span class="kpi"><b class="num">${fmt(M.E)}<i>kcal a day</i></b><span class="sub">you burn, ±${fmt(1.96 * M.sd)} (95%)</span></span><span class="confbadge ${M.conf}">${conf}</span></div>
    ${c}${c ? legend([['line c-fuel', 'your burn, learned'], ['band c-fuel', '95% interval'], ['bar c-fuel', 'complete days eaten'], ['goal', 'target']]) : ''}
    ${stats([[fmt(M.formula), 'textbook burn'], [`${sign(M.gap)}<i>%</i>`, 'yours vs textbook'], [fmt(M.rho), 'kcal in 1 kg of change']])}
    ${wk ? para(`Last 7 days: ${fmt(wk.intake)} kcal a day on ${plural(wk.n, 'complete day')}, a ${wk.bal < 0 ? 'deficit' : 'surplus'} of <b>${fmt(Math.abs(wk.bal))}</b> kcal a day: about ${r1(Math.abs(fatWk))} kg a week of body ${wk.bal < 0 ? 'lost' : 'gained'}, ${Math.round(M.fatShare * 100)}% of it fat.`) : ''}
    <details class="inner"><summary>The ledger, 21 days</summary>${table([
      trow(`Eaten, ${plural(E.n, 'complete day')}`, E.intake == null ? DASH : `${fmt(E.intake)} kcal`),
      trow(`Weight trend${M.rate == null ? '' : `, ${sign(M.rate, 2)} kg a week`}`, M.rate == null ? DASH : `${sign(M.rate / 7 * M.rho, 0)} kcal`),
      trow('Burn, learned', `${fmt(M.E)} kcal`),
      trow('Burn by formula', `${fmt(T.formula)} kcal`),
      trow(`Target, ${Math.round(T.trust * 100)}% from your data`, `${fmt(T.kcal)} kcal`, 'strong')])}</details></section>`;
}
// The body: the scale's readings and the filter's trend through them, what has changed, and where the trend leads.
function bodyCard() {
  const T = targets(), M = T.model, p = S.profile, St = strength(), P = projection();
  const waist = P.waistNow, cut = P.cut, dW = (M.W ?? T.wt) - p.w0, dWaist = waist - p.waist0, hasWaist = Object.keys(S.waist).length > 0;
  const read = dW > -0.5 ? 'Too early to read' : !St || !hasWaist ? 'Needs a waist measurement and two sessions per lift to read'
    : St.pct >= -2 && dWaist < 0 ? 'Consistent with fat loss, muscle held' : St.pct < -5 ? 'Weight is falling with strength: muscle at risk' : 'Mixed signals; give it two more weeks';
  const hist = M.hist || [], days = hist.slice(-120).map(h => h.k);
  const wchart = days.length >= 7 ? chart({ days, dots: Object.fromEntries(days.filter(k => S.weights[k] != null).map(k => [k, S.weights[k]])), line: Object.fromEntries(hist.slice(-120).map(h => [h.k, h.W])), c: 'var(--body)', now: true }) : '';
  const bf = bodyFat();
  return `<section class="card" id="in-body">${cardHead('Body', 'body', 'var(--body)', why('comp', 'how to read it'))}
    ${wchart ? wchart + legend([['dot', 'weigh-ins'], ['line c-body', 'trend, scale noise filtered out']]) : para('Weigh in on two mornings and the trend line starts here.')}
    ${stats([[`${r1(M.W ?? T.wt)}<i>kg</i>`, M.rate != null ? `trend, ${sign(M.rate, 2)} kg a week` : 'trend'], [`${r1(bf.pct)}<i>%</i>`, bf.src === 'rfm' ? 'body fat, from waist' : 'body fat, from BMI'], [St ? `${sign(St.pct, 0)}<i>%</i>` : DASH, St ? `strength, ${plural(St.n, 'lift')}` : 'strength']])}
    ${para(`${read}. Since the start: ${sign(dW, 1)} kg, ${sign(dWaist, 1)} cm waist. ${why('waist', `Waist ÷ height ${(waist / p.h).toFixed(2)}${waist > cut ? `, ${r1(waist - cut)} cm above ${cut}` : ''}`)}`, read.includes('risk') ? 'flag' : 'sub')}
    ${P.items.length ? `<table class="ahead">${P.items.map(i => trow(`${i.label} <i>${r1(i.togo)} kg to go</i>`, i.date ? `≈ ${dateLabel(i.date, { month: 'short', year: 'numeric' })}<i class="ci">${i.early && (i.late || i.open) ? `${dateLabel(i.early, { month: 'short', year: '2-digit' })} – ${i.late ? dateLabel(i.late, { month: 'short', year: '2-digit' }) : 'later'}` : ''}</i>` : DASH)).join('')}</table>
      ${para(`${P.rate != null && P.rate < -0.05 ? `At ${r1(-P.rate)} kg a week; the range under each date is the 95% interval of that rate over 21 days.` : 'Dates appear once the trend is falling.'} ${P.perKg ? `Your waist moves ${r1(P.perKg)} cm per kg.` : ''} ${why('project', 'How projected')}`)}` : ''}
    <div class="rowb tight"><button class="ghost" data-act="weigh" data-s="weights">${ic('body', 'width="17" height="17" style="fill:none;stroke:currentColor;stroke-width:1.9"')} Weigh in</button><button class="ghost" data-act="weigh" data-s="waist">${ic('tape', 'width="17" height="17" style="fill:none;stroke:currentColor;stroke-width:1.9"')} Waist</button></div>
    ${historyList('Every weigh-in', Object.keys(S.weights).sort().reverse().slice(0, 120).map(k => [k, `${kg(S.weights[k])} kg${S.manual.weights[k] ? '' : ' · from the watch or scale'}`]), 'weights')}
    ${historyList('Every waist reading', Object.keys(S.waist).sort().reverse().map(k => [k, `${kg(S.waist[k])} cm`]), 'waist')}</section>`;
}
// What moves what: only the links that are real in your own data (the 95% interval clear of zero), each with its
// effect and how to test it. Everything not clear yet is one line that opens.
function linksCard() {
  const L = allLinks(), clear = L.filter(l => l.status === 'clear'), rest = L.filter(l => ['hint', 'none'].includes(l.status)), wait = L.filter(l => l.status === 'need');
  const row = l => {
    const m = Math.max(Math.abs(l.elo), Math.abs(l.ehi), 1e-6) * 1.12, x = v => (50 + v / m * 50).toFixed(1), col = l.status === 'clear' ? 'var(--good)' : 'var(--soft)';
    const lab = l.status === 'clear' ? (l.agrees ? 'Clear' : 'Clear · unexpected') : l.status === 'hint' ? 'Hint' : 'No link yet';
    return `<div class="lrow"><div class="lt"><b>${l.x} → ${l.y}<span class="lst ${l.status === 'clear' && !l.agrees ? 'odd' : l.status}">${lab}</span></b><span class="sub">${l.status === 'none' ? `No clear effect across ${l.n} days` : `<b>${effText(l)}</b> per ${l.xu}, ${l.n} days`}</span></div>
      <div class="forest" style="--c:${col}" aria-hidden="true"><i class="zero"></i><i class="cib" style="left:${x(l.elo)}%;width:${(x(l.ehi) - x(l.elo)).toFixed(1)}%"></i><i class="pt" style="left:${x(l.eff)}%"></i></div>
      ${l.status === 'clear' ? `<span class="ltest">${l.test}</span>` : ''}</div>`;
  };
  const more = rest.length + wait.length;
  return `<section class="card" id="in-links">${cardHead('What moves what', 'insight', 'var(--sleep)', why('links', 'read with care'))}
    ${clear.length ? `<div class="lrows">${clear.map(row).join('')}</div>` : para(L.length ? 'No link is clear in your data yet. The more days you log, the sooner one shows.' : 'Links need 14 days with both halves of a pair.')}
    ${more ? `<details class="inner"><summary>Not clear yet · ${more}</summary>${rest.length ? `<div class="lrows">${rest.map(row).join('')}</div>` : ''}${wait.length ? `<div class="lneed">${wait.map(l => `<span>${l.x} → ${l.y}: ${l.need} more days</span>`).join('')}</div>` : ''}</details>` : ''}</section>`;
}
// How you eat across the week: logging, consistency, the weekday profile, weekends, protein spread.
function patternsCard() {
  const P = intakePatterns(), T = targets();
  if (P.full < 3) return '';
  const top = Math.max(T.kcal * 1.2, ...P.byWd.filter(v => v != null)), wl = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const bars = `<div class="wdbars">${P.byWd.map((v, i) => `<div class="${i >= 5 ? 'we' : ''}"><i style="height:${v != null ? Math.max(3, v / top * 70).toFixed(1) : 0}px;animation-delay:${i * 40}ms"></i><b>${v != null ? (v / 1000).toFixed(1) + 'k' : ''}</b><span>${wl[i]}</span></div>`).join('')}</div>`;
  const W = P.weekend;
  return `<section class="card" id="in-patterns">${cardHead('How you eat', 'food', 'var(--fuel)', why('logging', 'why logging matters'))}
    ${stats([[`${P.logged}<i>/ ${P.days}</i>`, 'days logged, 4 weeks'], [`${P.on}<i>/ ${P.full}</i>`, 'complete days within 10% of target'], [P.sd != null ? `±${fmt(P.sd)}` : DASH, 'kcal day to day']])}
    <h3>By day of the week, 8 weeks</h3>${bars}
    ${W ? para(W.lo > 100 ? `Weekends run <b>${fmt(W.d)}</b> kcal higher than weekdays (95% interval ${fmt(W.lo)} to ${fmt(W.hi)}): about ${fmt(W.d * 2 / 7)} kcal a day of the week's deficit.` : W.hi < -100 ? `Weekends run ${fmt(-W.d)} kcal lower than weekdays.` : `Weekends and weekdays are alike (difference ${sign(W.d, 0)} kcal, interval ${fmt(W.lo)} to ${fmt(W.hi)}).`) : ''}
    ${P.protein ? para(`Protein reached ${T.perMeal} g at <b>${P.protein.hit} of ${P.protein.tot}</b> main meals in two weeks${P.pAvg != null ? `; ${Math.round(P.pAvg)} g a day on average against ${T.protein}` : ''}.`) : ''}</section>`;
}
function vReview() {
  const parts = [['energy', 'Energy'], ['body', 'Body'], ['long', 'Long game'], ['links', 'Links']];
  const nav = subnav('review', parts), on = SUB.review;
  const body = on === 'body' ? part(bodyCard) : on === 'long' ? part(markersCard) : on === 'links' ? part(linksCard) : part(burnCard) + part(patternsCard);
  return `${appbar('Insights', 'What your data says', `<button class="mini" data-act="shareweek" aria-label="Share this week">Share</button>`)}
    ${part(checkBanner)}${nav}${body}`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-review.js');

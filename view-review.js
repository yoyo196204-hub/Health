'use strict';
// Review: every stream on one page, the decisions it triggers, and the numbers that fired them.

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
function matrix(T, days, cells) {
  // Each row's average is written the way its cells are: calories and steps in thousands, like the cells.
  const k1 = v => (v / 1000).toFixed(1);
  const rows = [['kcal', 'Calories', `${k1(T.kcal)}k kcal`, 'kcal', k1], ['protein', 'Protein', `${T.protein} g`, 'protein', v => Math.round(v)], ['fibre', 'Fibre', `${T.fibre} g`, 'fibre', v => Math.round(v)],
    ['steps', 'Steps', `${k1(T.stepGoal)}k`, 'steps', k1], ['sleep', 'Sleep', '7–9 h', 'sleep', v => r1(v)], ['train', 'Training', `${S.profile.days}+ a week`, 'lift', null], ['hrv', 'HRV', 'your range', 'hrv', v => Math.round(v)]];
  return `<div class="mx"><span></span>${days.map(k => `<span class="dh ${k === todayKey() ? 'now' : ''}">${weekday(k)}</span>`).join('')}<span class="dh">avg</span>
    ${rows.map(([key, label, goal, ev, f]) => {
      const vals = cells.map(c => c[key]).filter(c => c && c.x != null);
      const avg = key === 'train' ? `${cells.filter(c => c.train).length}` : vals.length ? f(mean(vals.map(c => c.x))) : DASH;
      return `<a class="rl" href="#why-${ev}">${label}<i>${goal}</i></a>${cells.map(c => c[key] ? `<i class="c s${c[key].s} ${c[key].part ? 'part' : ''}">${c[key].v}</i>` : '<i class="c"></i>').join('')}<b class="av num">${avg}</b>`;
    }).join('')}</div>
    <p class="key"><i class="c s2"></i>on target<i class="c s1"></i>partial<i class="c s0"></i>off<i class="c"></i>no data</p><p class="sub small">Calories and steps in thousands; training shows the openGym day, or cardio minutes. Averages are over the days with data; a calorie day counts once it is fully logged.</p>`;
}
// Rules that turn the week into at most a few actions. Each shows the number that fired it, most important first.
function decisions(T, cells, E, St) {
  const out = [], have = key => cells.map(c => c[key]).filter(c => c && c.x != null), avg = key => { const v = have(key); return v.length ? mean(v.map(c => c.x)) : null; };
  const logged = cells.filter(c => c.kcal && !c.kcal.part).length, rate = T.slope == null ? null : T.slope * 7 / T.wt * 100;
  const p = avg('protein'), st = avg('steps'), A = activityWeek(), R = readiness(), L = sleepStats(7), L14 = sleepStats(14);
  if (logged < 4) out.push([3, `${logged} of 7 days fully logged`, 'Too little to judge intake. Log whole days before changing anything.', 'logging']);
  if (rate != null && rate < -1) out.push([3, `Losing ${(-rate).toFixed(1)}% a week`, 'Faster than 1%: muscle is at risk. Eat 150 kcal more a day.', 'rate']);
  if (rate != null && rate > -0.25 && logged >= 5) out.push([2, `Losing ${Math.max(0, -rate).toFixed(1)}% a week on ${logged} logged days`, T.trust > 0 ? `Your burn is being re-measured from your data (${Math.round(T.trust * 100)}% weight so far); the target follows.` : 'The target starts following your own data after 7 complete days.', 'balance']);
  if (E.gap != null && E.gap < -15) out.push([2, `Your data implies ${Math.round(-E.gap)}% less burn than the formula`, 'The usual cause is unlogged oil, snacks or outside meals. Check portions first.', 'balance']);
  if (p != null && logged >= 4 && p < T.protein * 0.8) out.push([2, `Protein ${Math.round(p)} of ${T.protein} g`, `Add ${Math.ceil((T.protein - p) / 24)} scoop${T.protein - p > 24 ? 's' : ''} of whey, or a katori of usal and dahi at each meal.`, 'protein']);
  if (A.strengthDays < Math.min(2, S.profile.days)) out.push([2, `Lifted on ${A.strengthDays} of ${S.profile.days} days`, 'In a deficit, lifting is what keeps the loss from being muscle.', 'lift']);
  if (St && St.pct < -5) out.push([2, `Strength down ${Math.round(-St.pct)}%`, 'Check protein, sleep and rate of loss before pushing harder.', 'comp']);
  if (R.level === 'easy') out.push([2, R.why[0][1], 'Easy day: walk, or lift lighter. Rule out illness if it persists.', R.why[0][2]]);
  if (L.avg != null && L.n >= 3 && L.avg < 6) out.push([2, `Sleep ${r1(L.avg)} h average`, 'Expect more hunger and less fat per kg lost. Protect sleep before cutting calories.', 'sleep']);
  if (L14.midSd != null && L14.midSd > 60) out.push([1, `Sleep timing varies by ±${Math.round(L14.midSd)} min`, 'Anchor the wake time on off days, even after a late night.', 'regular']);
  if (st != null && st < T.stepGoal * 0.7) out.push([1, `Steps ${fmt(st)} of ${fmt(T.stepGoal)}`, 'A 15-minute walk after lunch and after dinner covers the gap.', 'steps']);
  if (A.who < 75 && A.n < 3) out.push([1, `${Math.round(A.who)} active minutes this week`, 'Two brisk 25-minute walks with the strap would double it.', 'zones']);
  return out.sort((a, b) => b[0] - a[0]);
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
// What the data says, most useful first: the headlines, the burn your body has shown, the body itself, what moves
// what in your own data, how you eat across the week, then the week as a matrix and what it asks you to do.
function headCards() {
  const H = headline();
  if (!H.length) return '';
  const col = { food: 'var(--fuel)', heart: 'var(--heart)', sleep: 'var(--sleep)', body: 'var(--body)', move: 'var(--move)' };
  return `<div class="heads">${H.slice(0, 4).map(h => `<div class="card head"><span class="ico" style="--c:${col[h.dom] || 'var(--accent)'}">${ic('spark')}</span><span><b>${esc(h.t)}</b><span class="sub">${h.s}</span></span></div>`).join('')}</div>`;
}
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
    ${para(burnWords(M) + (E.watch ? ` The watch puts it at ${fmt(E.watch)}; watch calorie estimates are not used (${why('devices', 'why')}).` : ''), 'sub small')}
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
    ${P.items.length ? `<table class="ahead">${P.items.map(i => trow(`${i.label} <i>${r1(i.togo)} kg to go</i>`, i.date ? `≈ ${dateLabel(i.date, { month: 'short', year: 'numeric' })}` : DASH)).join('')}</table>
      ${para(`${P.rate != null && P.rate < -0.05 ? `At ${r1(-P.rate)} kg a week.` : 'Dates appear once the trend is falling.'} ${P.perKg ? `Your waist moves ${r1(P.perKg)} cm per kg.` : ''} ${why('project', 'How projected')}`)}` : ''}
    <div class="rowb tight"><button class="ghost" data-act="weigh" data-s="weights">${ic('body', 'width="17" height="17" style="fill:none;stroke:currentColor;stroke-width:1.9"')} Weigh in</button><button class="ghost" data-act="weigh" data-s="waist">${ic('tape', 'width="17" height="17" style="fill:none;stroke:currentColor;stroke-width:1.9"')} Waist</button></div>
    ${historyList('Every weigh-in', Object.keys(S.weights).sort().reverse().slice(0, 120).map(k => [k, `${kg(S.weights[k])} kg${S.manual.weights[k] ? '' : ' · from the watch or scale'}`]), 'weights')}
    ${historyList('Every waist reading', Object.keys(S.waist).sort().reverse().map(k => [k, `${kg(S.waist[k])} cm`]), 'waist')}</section>`;
}
// What moves what: each pair with its effect, its 95% interval drawn around zero, and how to test it.
function linksCard() {
  const L = allLinks(), shown = L.filter(l => ['clear', 'hint', 'none'].includes(l.status)), wait = L.filter(l => l.status === 'need');
  const col = { clear: 'var(--good)', hint: 'var(--mid)', none: 'var(--soft)' };
  const rows = shown.sort((a, b) => ({ clear: 0, hint: 1, none: 2 }[a.status] - { clear: 0, hint: 1, none: 2 }[b.status])).map(l => {
    const m = Math.max(Math.abs(l.elo), Math.abs(l.ehi), 1e-6) * 1.12, x = v => (50 + v / m * 50).toFixed(1);
    const lab = l.status === 'clear' ? (l.agrees ? 'Clear' : 'Clear · unexpected') : l.status === 'hint' ? 'Hint' : 'No link yet';
    return `<div class="lrow"><div class="lt"><b>${l.x} → ${l.y}<span class="lst ${l.status === 'clear' && !l.agrees ? 'odd' : l.status}">${lab}</span></b><span class="sub">${l.status === 'none' ? `No clear effect across ${l.n} days` : `<b>${effText(l)}</b> per ${l.xu}, ${l.n} days`}</span></div>
      <div class="forest" style="--c:${col[l.status]}" aria-hidden="true"><i class="zero"></i><i class="cib" style="left:${x(l.elo)}%;width:${(x(l.ehi) - x(l.elo)).toFixed(1)}%"></i><i class="pt" style="left:${x(l.eff)}%"></i></div>
      ${l.status !== 'none' ? `<span class="ltest">${l.test}</span>` : ''}</div>`;
  }).join('');
  return `<section class="card" id="in-links">${cardHead('What moves what', 'insight', 'var(--sleep)', why('links', 'read with care'))}
    <p class="sub small" style="margin:4px 0 2px">Your own day-to-day data, trends removed. The bar is the 95% interval: clear of the centre line means the link is real for you.</p>
    ${rows ? `<div class="lrows">${rows}</div>` : para('Nothing to read yet: links need 14 days with both halves of a pair.')}
    ${wait.length ? `<div class="lneed">${wait.map(l => `<span>${l.x} → ${l.y}: ${l.need} more days</span>`).join('')}</div>` : ''}</section>`;
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
  const T = targets(), days = range(7), cells = days.map(k => dayCells(k, T));
  const E = energy(), St = strength(), D = decisions(T, cells, E, St);
  return `${appbar('Insights', 'What your data says', `<button class="mini" data-act="shareweek" aria-label="Share this week">Share</button>`)}
    ${part(headCards)}
    ${part(burnCard)}
    ${part(bodyCard)}
    ${part(linksCard)}
    ${part(patternsCard)}
    ${sec('The week', matrix(T, days, cells), { cls: 'first' })}
    ${part(checkBanner)}
    ${sec('What the data says to do', D.length ? `<ul class="dec">${D.slice(0, 5).map(([w, sig, act, ev]) => `<li class="w${w}"><a href="#why-${ev}"><span class="sig">${sig}</span><span class="act">${act}</span></a></li>`).join('')}</ul>` : para('Nothing triggered. Hold the plan.'))}`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-review.js');

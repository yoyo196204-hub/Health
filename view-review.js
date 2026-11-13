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
  const rows = [['kcal', 'Calories', fmt(T.kcal), 'kcal', v => fmt(v)], ['protein', 'Protein', `${T.protein} g`, 'protein', v => Math.round(v)], ['fibre', 'Fibre', `${T.fibre} g`, 'fibre', v => Math.round(v)],
    ['steps', 'Steps', fmt(T.stepGoal), 'steps', v => fmt(v)], ['sleep', 'Sleep', '7–9 h', 'sleep', v => r1(v)], ['train', 'Training', `${S.profile.days}+ a week`, 'lift', null], ['hrv', 'HRV', 'your range', 'hrv', v => Math.round(v)]];
  return `<div class="mx"><span></span>${days.map(k => `<span class="dh ${k === todayKey() ? 'now' : ''}">${weekday(k)}</span>`).join('')}<span class="dh">avg</span>
    ${rows.map(([key, label, goal, ev, f]) => {
      const vals = cells.map(c => c[key]).filter(c => c && c.x != null);
      const avg = key === 'train' ? `${cells.filter(c => c.train).length}` : vals.length ? f(mean(vals.map(c => c.x))) : DASH;
      return `<a class="rl" href="#why-${ev}">${label}<i>${goal}</i></a>${cells.map(c => c[key] ? `<i class="c s${c[key].s} ${c[key].part ? 'part' : ''}">${c[key].v}</i>` : '<i class="c"></i>').join('')}<b class="av num">${avg}</b>`;
    }).join('')}</div>
    <p class="key"><i class="c s2"></i>on target<i class="c s1"></i>partial<i class="c s0"></i>off<i class="c"></i>no data</p>`;
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
function shareWeek(T, cells, E) {
  const avg = key => { const v = cells.map(c => c[key]).filter(c => c && c.x != null); return v.length ? mean(v.map(c => c.x)) : null; };
  const A = activityWeek(), L = sleepStats(7), R = rhrTrend(), wk = T.slope == null ? null : T.slope * 7;
  const lines = [`Week to ${dateLabel(todayKey(), { day: 'numeric', month: 'long' })}`,
    `Weight trend ${r1(T.wt)} kg${wk != null ? ` (${sign(wk, 2)} kg/week)` : ''}`,
    `Calories ${avg('kcal') ? fmt(avg('kcal')) : '–'} of ${fmt(T.kcal)} · protein ${avg('protein') ? Math.round(avg('protein')) : '–'} of ${T.protein} g · fibre ${avg('fibre') ? Math.round(avg('fibre')) : '–'} g`,
    `Steps ${avg('steps') ? fmt(avg('steps')) : '–'} a day · active minutes ${Math.round(A.who)} · strength days ${A.strengthDays}`,
    `Sleep ${L.avg != null ? r1(L.avg) + ' h' : '–'} · resting HR ${R.now ? Math.round(R.now) : '–'} bpm`];
  if (E.implied != null) lines.push(`Burn implied by intake and weight: ${fmt(E.implied)} kcal/day`);
  return lines.join('\n');
}
function vReview() {
  const T = targets(), p = S.profile, days = range(7), cells = days.map(k => dayCells(k, T));
  const E = energy(), St = strength(), D = decisions(T, cells, E, St), Lk = links(), P = projection();
  const wk = T.slope == null ? null : T.slope * 7, waist = P.waistNow, cut = P.cut;
  const dW = T.wt - p.w0, dWaist = waist - p.waist0, hasWaist = Object.keys(S.waist).length > 0;
  const read = dW > -0.5 ? 'Too early to read' : !St || !hasWaist ? 'Needs a waist measurement and two sessions per lift to read'
    : St.pct >= -2 && dWaist < 0 ? 'Consistent with fat loss, muscle held' : St.pct < -5 ? 'Weight is falling with strength: muscle at risk' : 'Mixed signals; give it two more weeks';
  const ser = series().slice(-120), wdays = ser.length >= 2 ? range(gapDays(ser[0].k, todayKey()) + 1) : [];
  const wchart = ser.length >= 2 ? chart({ days: wdays, dots: Object.fromEntries(ser.map(s => [s.k, s.w])), line: Object.fromEntries(ser.map(s => [s.k, s.t])) }) : '';
  const bf = Object.keys(S.wx).sort().reverse().find(k => S.wx[k].bf);
  return `${masthead('Review', 'Last 7 days · tap any label for its evidence', { after: `<button class="mini" data-act="shareweek" aria-label="Share this week">Share</button>` })}
    <section class="block first">${matrix(T, days, cells)}</section>
    ${sec('What the data says to do', D.length ? `<ul class="dec">${D.slice(0, 5).map(([w, sig, act, ev]) => `<li class="w${w}"><a href="#why-${ev}"><span class="sig">${sig}</span><span class="act">${act}</span></a></li>`).join('')}</ul>` : para('Nothing triggered. Hold the plan.'))}
    ${sec('Energy ledger', table([
      trow(`Eaten, ${plural(E.n, 'complete day')}`, E.intake == null ? DASH : `${fmt(E.intake)} kcal`),
      trow(`Weight trend${wk == null ? '' : `, ${sign(wk, 2)} kg a week`}`, E.delta == null ? DASH : `${sign(E.delta, 0)} kcal`),
      trow('Burn your data implies', E.implied == null ? DASH : `${fmt(E.implied)} kcal`),
      trow('Burn by formula', `${fmt(T.formula)} kcal`),
      trow('Difference', E.gap == null ? DASH : `${sign(E.gap, 0)}%`),
      E.watch ? trow(`Watch's estimate ${why('devices', 'not used')}`, `${fmt(E.watch)} kcal`, 'muted') : '',
      trow(`Target, ${Math.round(T.trust * 100)}% from your data`, `${fmt(T.kcal)} kcal`, 'strong')]) +
      (E.implied == null ? para(`Needs 7 complete days (${E.n} so far) and 6 weigh-ins across 2 weeks.`, 'sub gap') : ''), { why: ['balance', '21 days'] })}
    ${sec('Body', `${wchart || para('Weigh in on two mornings and the trend line starts here.')}
      ${stats([[sign(dW, 1), `kg since ${p.w0}`], [sign(dWaist, 1), `cm waist since ${p.waist0}`], [St ? sign(St.pct, 0) + '%' : DASH, St ? `strength, ${plural(St.n, 'lift')}` : 'strength']])}
      ${para(`${read}. ${why('waist', `Waist ÷ height ${(waist / p.h).toFixed(2)}${waist > cut ? `, ${r1(waist - cut)} cm above ${cut}` : ''}`)}${bf ? ` Scale body fat ${r1(S.wx[bf].bf)}% (${dateLabel(bf)}), ${why('comp', 'read with care')}.` : ''}`, read.includes('risk') ? 'flag' : 'sub')}
      ${P.items.length ? `<table class="ahead">${P.items.map(i => trow(`${i.label} <i>${r1(i.togo)} kg to go</i>`, i.date ? `≈ ${dateLabel(i.date, { month: 'short', year: 'numeric' })}` : DASH)).join('')}</table>
        ${para(`${P.rate != null && P.rate < -0.05 ? `At ${r1(-P.rate)} kg a week.` : 'Dates appear once the trend is falling.'} ${P.perKg ? `Your waist moves ${r1(P.perKg)} cm per kg.` : ''} ${why('project', 'How projected')}`)}` : ''}
      ${historyList('Every weigh-in', Object.keys(S.weights).sort().reverse().slice(0, 120).map(k => [k, `${kg(S.weights[k])} kg${S.manual.weights[k] ? '' : ' · from the watch or scale'}`]), 'weights')}
      ${historyList('Every waist reading', Object.keys(S.waist).sort().reverse().map(k => [k, `${kg(S.waist[k])} cm`]), 'waist')}
      <label class="line">Waist this week, at the navel<span class="f"><input type="number" inputmode="decimal" step="0.5" data-log="waist" value="${S.waist[day] ?? ''}" placeholder="${waist}"><i>cm</i></span></label>`, { why: ['comp', 'How to read it'] })}
    ${sec('Links in your own data', table(Lk.map(l => trow(l.label, l.n < 14 ? `${l.n} of 14 days` : l.r == null ? `no variation · n ${l.n}` : `<span class="${Math.abs(l.r) >= 0.35 && l.n >= 20 ? '' : 'muted'}">r ${sign(l.r, 2)}</span> · n ${l.n}`))), { why: ['links', 'Read with care'] })}`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-review.js');

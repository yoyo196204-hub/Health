'use strict';
// One screen that reads every stream together: a 7-day matrix, the decisions the
// data triggers, the energy ledger, body trend, recovery, and correlations in your own data.

function sd(a) { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); }
function pearson(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1]));
  let a = 0, b = 0, c = 0;
  for (const [x, y] of pairs) { a += (x - mx) * (y - my); b += (x - mx) ** 2; c += (y - my) ** 2; }
  return b && c ? a / Math.sqrt(b * c) : null;
}
const grade = (v, hit, part) => v >= hit ? 2 : v >= part ? 1 : 0;

// Each cell: value shown and 0 (miss) / 1 (partial) / 2 (on target); null = no data.
function dayCells(k, T) {
  const t = totals(k), R = S.hrv[k] ? readiness(k) : null, st = S.steps[k], sl = S.sleep[k];
  return {
    kcal: t.n ? { v: (t.k / 1000).toFixed(1), s: t.k > T.kcal * 1.1 ? 0 : t.k >= T.kcal * 0.8 ? 2 : 1, x: t.k } : null,
    protein: t.n ? { v: Math.round(t.p), s: grade(t.p, T.protein * 0.9, T.protein * 0.7), x: t.p } : null,
    fibre: t.n ? { v: Math.round(t.fb), s: grade(t.fb, T.fibre * 0.9, T.fibre * 0.6), x: t.fb } : null,
    steps: st ? { v: (st / 1000).toFixed(1), s: grade(st, T.stepGoal, T.stepGoal * 0.7), x: st } : null,
    sleep: sl ? { v: r1(sl), s: grade(sl, 7, 6), x: sl } : null,
    train: S.lifts[k] ? { v: S.lifts[k].day, s: 2 } : S.cardio[k] ? { v: '♥', s: 2 } : null,
    hrv: R ? { v: Math.round(R.now.rmssd), s: R.state === 'low' ? 0 : R.state ? 2 : 1, x: R.now.rmssd } : null,
  };
}
function matrix(T, days, cells) {
  const rows = [['kcal', 'Calories', `${T.kcal}`, 'kcal', v => Math.round(v)], ['protein', 'Protein', `${T.protein} g`, 'protein', v => Math.round(v)], ['fibre', 'Fibre', `${T.fibre} g`, 'fibre', v => Math.round(v)],
    ['steps', 'Steps', `${T.stepGoal}`, 'steps', v => Math.round(v)], ['sleep', 'Sleep', '7–9 h', 'sleep', v => r1(v)], ['train', 'Training', `${S.profile.days} a week`, 'lift', null], ['hrv', 'HRV', 'vs baseline', 'hrv', v => Math.round(v)]];
  return `<div class="mx"><span></span>${days.map(k => `<span class="dh">${new Date(k + 'T12:00').toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>`).join('')}<span class="dh">avg</span>
    ${rows.map(([key, label, goal, ev, fmt]) => {
    const vals = cells.map(c => c[key]).filter(Boolean);
    const avg = !vals.length ? '–' : fmt ? fmt(mean(vals.map(c => c.x))) : `${vals.length}`;
    return `<a class="rl" href="#why-${ev}">${label}<i>${goal}</i></a>${cells.map(c => c[key] ? `<i class="c s${c[key].s}">${c[key].v}</i>` : '<i class="c"></i>').join('')}<b class="av num">${avg}</b>`;
  }).join('')}</div>
    <p class="key"><i class="c s2"></i>on target<i class="c s1"></i>partial<i class="c s0"></i>off<i class="c"></i>no data</p>`;
}

function energy(T) {
  const kc = lastDays(21).map(k => totals(k).k).filter(k => k >= 1000), intake = kc.length ? mean(kc) : null;
  const delta = T.slope == null ? null : T.slope * 7700, implied = intake != null && delta != null ? intake - delta : null;
  return { n: kc.length, intake, delta, implied, gap: implied == null ? null : (implied - T.formula) / T.formula * 100 };
}
// Estimated one-rep max (Epley) per lift, latest session against first. Sets above 15 reps are ignored.
function strength() {
  const by = {};
  for (const k of Object.keys(S.lifts).sort()) for (const [name, sets] of Object.entries(S.lifts[k].ex)) {
    let best = 0;
    for (const s of sets) if (s && s[0] > 0 && s[1] > 0 && s[1] <= 15) best = Math.max(best, s[0] * (1 + s[1] / 30));
    if (best) (by[name] ||= []).push(best);
  }
  const ratios = Object.values(by).filter(a => a.length >= 2).map(a => a[a.length - 1] / a[0]);
  return ratios.length ? { pct: (mean(ratios) - 1) * 100, n: ratios.length } : null;
}
function recovery() {
  const d7 = lastDays(7), pick = (o, ks) => ks.map(k => o[k]).filter(v => v != null);
  const rhrOf = k => S.rhr[k] ?? S.hrv[k]?.hr;
  const now = d7.map(rhrOf).filter(v => v != null), base = lastDays(28).slice(7).map(rhrOf).filter(v => v != null);
  const on = d7.map(k => S.sleepx[k]?.on).filter(v => v != null);
  return {
    sleep: mean(pick(S.sleep, d7)), onsetSd: on.length >= 4 ? sd(on) : null,
    rhr: now.length ? mean(now) : null, rhrDelta: now.length >= 3 && base.length >= 7 ? mean(now) - mean(base) : null,
  };
}
function links() {
  const days = lastDays(60), kcal = k => { const t = totals(k).k; return t >= 1000 ? t : null; };
  const pair = (fx, fy) => days.map(k => [fx(k), fy(k)]).filter(p => p[0] != null && p[1] != null);
  return [['Sleep → calories eaten that day', pair(k => S.sleep[k], kcal)],
    ['Sleep → morning HRV', pair(k => S.sleep[k], k => S.hrv[k] ? Math.log(S.hrv[k].rmssd) : null)],
    ['Sleep → resting heart rate', pair(k => S.sleep[k], k => S.rhr[k] ?? null)],
    ['Steps → sleep that night', pair(k => S.steps[k], k => S.sleep[shift(k, 1)] ?? null)]]
    .map(([label, p]) => ({ label, n: p.length, r: p.length >= 14 ? pearson(p) : null }));
}

// Rules that turn the week's data into at most a few actions. Each row shows the number that fired it.
function decisions(T, cells, E, Rc, St) {
  const out = [], have = key => cells.map(c => c[key]).filter(Boolean), avg = key => { const v = have(key); return v.length ? mean(v.map(c => c.x)) : null; };
  const logged = cells.filter(c => c.kcal && c.kcal.x >= 800).length, rate = T.slope == null ? null : T.slope * 7 / T.wt * 100;
  const p = avg('protein'), st = avg('steps'), lifts = cells.filter(c => c.train && c.train.v !== '♥').length, today = cells[cells.length - 1];
  if (logged < 4) out.push([`Food logged ${logged} of 7 days`, 'Too little to judge intake. Log before changing anything.', 'kcal']);
  if (rate != null && rate < -1) out.push([`Losing ${(-rate).toFixed(1)}% a week`, 'Faster than 1%. Eat 150 kcal more.', 'rate']);
  if (rate != null && rate > -0.25 && logged >= 5) out.push([`Losing ${Math.max(0, -rate).toFixed(1)}% a week on ${logged} logged days`, T.measured ? `Burn re-measured at ${Math.round(T.tdee)} kcal. Target is now ${T.kcal}.` : 'Below 0.25%. Target recalculates once 10 days are logged.', 'balance']);
  if (E.gap != null && E.gap < -15) out.push([`Data implies ${Math.round(-E.gap)}% less burn than the formula`, 'Usual cause is unlogged oil, snacks or hotel meals. Check portions first.', 'balance']);
  if (p != null && logged >= 4 && p < T.protein * 0.8) out.push([`Protein ${Math.round(p)} of ${T.protein} g`, `Add ${Math.ceil((T.protein - p) / 24)} scoop${T.protein - p > 24 ? 's' : ''} whey or a katori of usal and dahi at each meal.`, 'protein']);
  if (lifts < Math.min(2, S.profile.days)) out.push([`Lifted ${lifts} of ${S.profile.days} sessions`, 'In a deficit, lifting is what keeps the loss from being muscle.', 'lift']);
  if (St && St.pct < -5) out.push([`Strength down ${Math.round(-St.pct)}%`, 'Check protein, sleep and rate of loss before pushing harder.', 'comp']);
  if (Rc.sleep != null && Rc.sleep < 6) out.push([`Sleep ${r1(Rc.sleep)} h average`, 'Expect more hunger and less fat per kg lost. Fix sleep before cutting calories.', 'sleep']);
  if (st != null && st < T.stepGoal * 0.7) out.push([`Steps ${Math.round(st)} of ${T.stepGoal}`, 'A 15-minute walk after lunch and dinner covers the gap.', 'steps']);
  if (today.hrv?.s === 0 || (Rc.rhrDelta != null && Rc.rhrDelta >= 5)) out.push([today.hrv?.s === 0 ? 'HRV below baseline today' : `Resting heart rate up ${Math.round(Rc.rhrDelta)} bpm`, 'Easy day: walk or lift lighter. Rule out illness if it persists.', 'recovery']);
  return out;
}

function chart(ser) {
  ser = ser.slice(-120);
  if (ser.length < 2) return '<p class="sub">Weigh in on two mornings and the trend line starts here.</p>';
  const W = 340, H = 170, P = 30;
  const xs = ser.map(s => Date.parse(s.k)), ys = ser.flatMap(s => [s.w, s.t]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.floor(Math.min(...ys) - 0.5), y1 = Math.ceil(Math.max(...ys) + 0.5);
  const X = x => P + (x - x0) / (x1 - x0 || 1) * (W - P - 8), Y = y => H - 14 - (y - y0) / (y1 - y0) * (H - 26);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${[y0, (y0 + y1) / 2, y1].map(y => `<line x1="${P}" x2="${W - 8}" y1="${Y(y)}" y2="${Y(y)}"/><text x="0" y="${Y(y) + 4}">${r1(y)}</text>`).join('')}
    ${ser.map((s, i) => `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(s.w).toFixed(1)}" r="2.5"/>`).join('')}
    <path d="${ser.map((s, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(s.t).toFixed(1)}`).join('')}"/></svg>`;
}

function vReview() {
  const T = targets(), p = S.profile, days = lastDays(7).reverse(), cells = days.map(k => dayCells(k, T));
  const E = energy(T), Rc = recovery(), St = strength(), D = decisions(T, cells, E, Rc, St), L = links();
  const wk = T.slope == null ? null : T.slope * 7, waist = latest(S.waist) ?? p.waist0, cut = p.sex === 'm' ? 90 : 80;
  const stat = (v, label) => `<div><b class="num">${v}</b><span class="sub">${label}</span></div>`, sign = (v, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d);
  const dW = T.wt - p.w0, dWaist = waist - p.waist0;
  const read = dW <= -0.5 && (!St || !Object.keys(S.waist).length) ? 'Needs a waist measurement and two logged sessions per lift to read'
    : dW <= -0.5 && St.pct >= -2 && dWaist < 0 ? 'Consistent with fat loss, muscle held'
    : dW <= -0.5 && St.pct < -5 ? 'Weight is falling with strength: muscle at risk'
    : 'Too early to read';
  const row = (a, b, cls = '') => `<tr class="${cls}"><td>${a}</td><td>${b}</td></tr>`;
  return `<header class="top left"><div><div class="eyebrow">Last 7 days · tap any label for its evidence</div><h1>Review</h1></div></header>
    <section class="block first">${matrix(T, days, cells)}</section>
    <section class="block"><div class="mh"><h2>What the data says to do</h2></div>
      ${D.length ? `<ul class="dec">${D.map(([sig, act, ev]) => `<li><a href="#why-${ev}"><span class="sig">${sig}</span><span class="act">${act}</span></a></li>`).join('')}</ul>` : '<p class="sub">Nothing triggered. Hold the plan.</p>'}</section>
    <section class="block"><div class="mh"><h2>Energy ledger</h2>${why('balance', '21 days')}</div><table>
      ${row(`Eaten, average of ${E.n} logged days`, E.intake == null ? '–' : `${Math.round(E.intake)} kcal`)}
      ${row(`Weight trend${wk == null ? '' : `, ${sign(wk, 2)} kg a week`}`, E.delta == null ? '–' : `${sign(E.delta, 0)} kcal`)}
      ${row('Burn your data implies', E.implied == null ? '–' : `${Math.round(E.implied)} kcal`)}
      ${row('Burn by formula', `${Math.round(T.formula)} kcal`)}
      ${row('Difference', E.gap == null ? '–' : `${sign(E.gap, 0)}%`)}
      ${row(`Target, from ${T.measured ? 'your data' : 'the formula'}`, `${T.kcal} kcal`, 'strong')}</table>
      ${E.implied == null ? `<p class="sub" style="margin-top:8px">Needs 10 logged days (${E.n} so far) and 6 weigh-ins across 2 weeks.</p>` : ''}</section>
    <section class="block"><div class="mh"><h2>Body</h2>${why('comp', 'How to read it')}</div>${chart(series())}
      <div class="stats">${stat(sign(dW), `kg since ${p.w0}`)}${stat(sign(dWaist), `cm waist since ${p.waist0}`)}${stat(St ? sign(St.pct, 0) + '%' : '–', St ? `strength, ${St.n} lifts` : 'strength')}</div>
      <p class="${read.includes('risk') ? 'flag' : 'sub'}">${read}. ${why('waist', `Waist ÷ height ${(waist / p.h).toFixed(2)}, ${Math.max(0, r1(waist - cut))} cm above ${cut}`)}</p>
      <label class="line">Waist this week, at the navel<span><input type="number" inputmode="decimal" step="0.5" data-log="waist" value="${S.waist[day] ?? ''}" placeholder="${waist}"><i>cm</i></span></label></section>
    <section class="block"><div class="mh"><h2>Recovery</h2>${why('recovery', 'What matters')}</div>
      <div class="stats four">${stat(Rc.sleep == null ? '–' : r1(Rc.sleep), 'h sleep')}${stat(Rc.onsetSd == null ? '–' : `±${Math.round(Rc.onsetSd)}`, 'min bedtime spread')}
        ${stat(Rc.rhr == null ? '–' : Math.round(Rc.rhr), `resting bpm${Rc.rhrDelta == null || Math.abs(Rc.rhrDelta) < 1 ? '' : ` (${sign(Rc.rhrDelta, 0)})`}`)}${stat(cells[6].hrv ? cells[6].hrv.v : '–', 'HRV today')}</div></section>
    <section class="block"><div class="mh"><h2>Links in your own data</h2>${why('links', 'Read with care')}</div><table>
      ${L.map(l => row(l.label, l.n < 14 ? `${l.n} of 14 days` : l.r == null ? `no variation · n ${l.n}` : `r ${sign(l.r, 2)} · n ${l.n}`)).join('')}</table></section>`;
}

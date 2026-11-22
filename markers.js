'use strict';
// The long game: the handful of things that, across large cohorts, track how long and how well people live, each
// worked out from data the app already has and read against the published dose-response. Nothing here is a
// diagnosis; every number is "people like you, in cohorts, at this level" with the study behind it.
//
// Fitness: VO2peak from the HUNT non-exercise model (Nes 2011, 4,260 adults with measured VO2peak):
//   men   100.27 − 0.296·age + 0.226·PA − 0.369·waist − 0.155·RHR   (SEE 5.70 ml/kg/min)
//   women 74.736 − 0.247·age + 0.198·PA − 0.259·waist − 0.114·RHR   (SEE 5.14)
// PA is HUNT's activity index, frequency × intensity × duration. Here it comes from what you actually did in the
// last four weeks, not a questionnaire. In an independent cohort the model tracked changes in measured fitness with
// a standard error of 3.6 ml/kg/min (Peterman 2020), so a move smaller than that is not read as a change.
// Each 1 MET (3.5 ml/kg/min) higher fitness: 13% lower all-cause mortality (Kodama 2009, 33 cohorts).

const VO2M = { m: [100.27, 0.296, 0.226, 0.369, 0.155, 5.70], f: [74.736, 0.247, 0.198, 0.259, 0.114, 5.14] };
const MET = 3.5, RR_MET = 0.87;
// Paluch 2022: quartile medians of steps a day and the hazard ratio of each against the lowest.
const STEP_Q = [[3553, 1], [5801, 0.60], [7842, 0.55], [10901, 0.47]];

// HUNT's index from the last four weeks: sessions a week, how long, how hard.
function paIndex(end = todayKey()) {
  return cached('PA' + end, () => {
    const H = hrProfile(), all = [];
    for (const k of range(28, end)) {
      const ss = sessions(k).filter(s => s.dur >= 300);
      for (const s of ss) {
        const z = s.z || [0, 0, 0, 0], t = z.reduce((a, b) => a + b, 0) || s.dur;
        // HUNT's intensity: easy (1), out of breath and sweating (5), near exhaustion (10).
        const hard = (z[3] || 0) / t > 0.3 ? 10 : ((z[2] || 0) + (z[3] || 0)) / t > 0.25 || s.strength || (s.avg && s.avg >= H.zones[1]) ? 5 : 1;
        all.push({ min: s.dur / 60, i: hard });
      }
      // A day lifted in Health (or openGym) with no timed workout behind it: work sets at about three minutes each.
      if (S.lifts[k] && !ss.some(s => s.strength)) {
        const sets = Object.values(S.lifts[k].ex || {}).reduce((a, x) => a + (Array.isArray(x) ? x.filter(s => s && s[1] > 0).length : 0), 0);
        if (sets) all.push({ min: sets * 3, i: 5, est: true });
      }
    }
    const perWk = all.length / 4, r = Math.round(perWk);
    const f = r < 1 ? 0 : r === 1 ? 1 : r <= 3 ? 2.5 : 5;
    const md = all.length ? median(all.map(x => x.min)) : 0, d = md < 15 ? 0.1 : md < 30 ? 0.38 : md <= 60 ? 0.75 : 1;
    const i = all.length ? median(all.map(x => x.i)) : 1, ii = i >= 7.5 ? 10 : i >= 3 ? 5 : 1;
    return { pa: f * ii * d, f, i: ii, d, perWk, min: md, n: all.length, est: all.some(x => x.est) };
  });
}
// The latest waist at or before a day, else the starting one.
function waistOn(k) { const w = Object.keys(S.waist).filter(x => x <= k).sort().pop(); return w ? S.waist[w] : S.profile.waist0; }
// Resting heart rate over four weeks, on one consistent scale (strap, or the watch corrected to it).
function rhr28(end = todayKey()) {
  const v = range(28, end).map(k => restingHR(k)?.v).filter(x => Number.isFinite(x));
  return v.length >= 5 ? { v: median(v), n: v.length } : null;
}
function vo2Of(sex, age, pa, waist, rhr) { const c = VO2M[sex] || VO2M.m; return c[0] - c[1] * age + c[2] * pa - c[3] * waist - c[4] * rhr; }
function fitness(end = todayKey()) {
  return cached('FIT' + end, () => {
    const p = S.profile, age = (Date.parse(end + 'T12:00') - Date.parse(p.dob)) / (365.25 * DAY), R = rhr28(end), P = paIndex(end), wc = waistOn(end);
    if (!R || !Number.isFinite(age) || !wc) return { v: null, need: !R ? 'rhr' : 'waist', P };
    const c = VO2M[p.sex] || VO2M.m, v = vo2Of(p.sex, age, P.pa, wc, R.v), mets = v / MET;
    const band = mets < 7.9 ? 0 : mets < 10.9 ? 1 : 2;
    // What each lever is worth, in ml/kg/min and as the cohort risk that goes with it.
    const nextF = P.f < 1 ? 1 : P.f < 2.5 ? 2.5 : P.f < 5 ? 5 : 5, nextD = P.d < 0.75 ? 0.75 : P.d;
    const levers = [
      { k: 'rhr', t: 'Resting heart rate 5 bpm lower', dv: c[4] * 5, how: 'Zone 2 cardio three times a week lowers it over 8–12 weeks.' },
      { k: 'waist', t: 'Waist 5 cm smaller', dv: c[3] * 5, how: projection().perKg ? `About ${r1(5 / projection().perKg)} kg of fat loss at your own rate of waist change.` : 'Roughly 5 kg of fat loss for most people; your own rate shows once there are three waist readings.' },
      { k: 'pa', t: nextF > P.f ? `${nextF === 5 ? '4 or more' : nextF === 2.5 ? '2–3' : '1'} sessions a week` : nextD > P.d ? 'Sessions of 30–60 min' : P.i < 10 ? 'Some near-maximal intervals' : null,
        dv: c[2] * ((nextF > P.f ? nextF * P.i * Math.max(P.d, 0.75) : nextD > P.d ? P.f * P.i * nextD : P.f * 10 * P.d) - P.pa), how: 'Counts lifting and cardio alike: how often, how long and how hard.' },
    ].filter(l => l.t && l.dv > 0.05).map(l => Object.assign(l, { rr: RR_MET ** (l.dv / MET) })).sort((a, b) => b.dv - a.dv);
    // Eight weeks ago, the same way, for the change.
    const k8 = shift(end, -56), R8 = rhr28(k8), was = R8 ? vo2Of(p.sex, age - 56 / 365.25, paIndex(k8).pa, waistOn(k8), R8.v) : null;
    return { v, lo: v - 1.96 * c[5], hi: v + 1.96 * c[5], see: c[5], mets, band, rhr: R.v, nR: R.n, waist: wc, age, P, levers, was, dv: was != null ? v - was : null };
  });
}
// Steps a day: the 4-week median against Paluch's curve. Hazard ratio by straight lines between quartile medians,
// never beyond the ends of the data.
function stepsHR(st) {
  if (st <= STEP_Q[0][0]) return 1;
  for (let i = 1; i < STEP_Q.length; i++) if (st <= STEP_Q[i][0]) { const [x0, y0] = STEP_Q[i - 1], [x1, y1] = STEP_Q[i]; return y0 + (y1 - y0) * (st - x0) / (x1 - x0); }
  return STEP_Q[STEP_Q.length - 1][1];
}
// Social jetlag (Wittmann 2006): mid-sleep on free days (Saturday and Sunday mornings) against workdays.
function socialJetlag(end = todayKey()) {
  return cached('SJL' + end, () => {
    const free = [], work = [];
    for (const k of range(42, end)) {
      const m = midpoint(k);
      if (m == null) continue;
      const wd = new Date(k + 'T12:00').getDay();
      (wd === 0 || wd === 6 ? free : work).push(m);
    }
    if (free.length < 3 || work.length < 6) return { v: null, nf: free.length, nw: work.length };
    const d = (mean(free) - mean(work)) / 60;
    return { v: Math.abs(d), later: d > 0, msf: mean(free), msw: mean(work), nf: free.length, nw: work.length };
  });
}
// Muscle-strengthening minutes a week over four weeks (Momma 2022: most benefit at 30–60).
function strengthMin(end = todayKey()) {
  let min = 0, days = 0, est = false;
  for (const k of range(28, end)) {
    const ss = sessions(k).filter(s => s.strength && s.dur >= 300);
    if (ss.length) { min += ss.reduce((a, s) => a + s.dur / 60, 0); days++; }
    else if (S.lifts[k]) {
      const sets = Object.values(S.lifts[k].ex || {}).reduce((a, x) => a + (Array.isArray(x) ? x.filter(s => s && s[1] > 0).length : 0), 0);
      if (sets) { min += sets * 3; days++; est = true; }
    }
  }
  return { perWk: min / 4, days: days / 4, est };
}

// Every marker: the value, the scale it is read on (stops from worst to best), where you sit, what the cohorts showed.
// st: 0 needs attention, 1 in between, 2 where the evidence puts the most benefit.
function markers(end = todayKey()) {
  return cached('MK' + end, () => {
    const p = S.profile, out = [], age = ageYears();
    const F = fitness(end);
    if (F.v != null) out.push({ id: 'fit', ic: 'pulse', c: 'var(--heart)', t: 'Fitness, estimated', v: r1(F.v), u: 'ml/kg/min', ev: 'fitness',
      st: F.band, scale: [[MET * 5, 'var(--bad)'], [MET * 7.9, 'var(--mid)'], [MET * 10.9, 'var(--good)'], [MET * 15]], at: F.v, ci: [F.lo, F.hi],
      s: `${r1(F.mets)} METs, ${['low', 'middle', 'high'][F.band]} in the cohorts (95% range ${Math.round(F.lo)}–${Math.round(F.hi)}).${F.levers[0] ? ` Biggest lever: ${F.levers[0].t.toLowerCase()}, +${r1(F.levers[0].dv)}.` : ''}` });
    else out.push({ id: 'fit', ic: 'pulse', c: 'var(--heart)', t: 'Fitness, estimated', v: null, ev: 'fitness', st: null,
      s: F.need === 'rhr' ? 'Needs 5 resting heart rates in 4 weeks: morning checks with the strap, or the watch.' : 'Needs a waist measurement.' });
    const stv = range(28, end).map(k => S.steps[k]).filter(v => v != null);
    if (stv.length >= 14) {
      const s = median(stv), hr = stepsHR(s), top = age >= 60 ? 6000 : 8000;
      out.push({ id: 'steps', ic: 'move', c: 'var(--move)', t: 'Steps a day', v: fmt(s), raw: s, u: '4-week median', ev: 'steps',
        st: s >= top ? 2 : s >= 5800 ? 1 : 0, scale: [[2000, 'var(--bad)'], [5800, 'var(--mid)'], [top, 'var(--good)'], [12000]], at: s,
        s: `Cohorts at this level: ${hr < 1 ? `${Math.round((1 - hr) * 100)}% lower mortality than at 3,500` : 'the reference level'}. The curve flattens at ${fmt(top)}–${fmt(top + 2000)}${s < top ? `, ${fmt(top - s)} a day away` : ''}.` });
    }
    const R = rhr28(end);
    if (R) {
      const rr = 1.09 ** ((R.v - 60) / 10);
      out.push({ id: 'rhr', ic: 'heart', c: 'var(--heart)', t: 'Resting heart rate', v: Math.round(R.v), u: 'bpm', ev: 'rhrrisk',
        st: R.v < 60 ? 2 : R.v <= 80 ? 1 : 0, scale: [[95, 'var(--bad)'], [80, 'var(--mid)'], [60, 'var(--good)'], [40]], at: R.v,
        s: `Each 10 bpm higher went with 9% higher mortality in 1.2 million adults. ${R.v >= 60 ? `At yours: ${Math.round((rr - 1) * 100)}% above a resting rate of 60.` : 'Below 60: the lowest band.'}` });
    }
    const wc = waistOn(end), whtr = wc / p.h;
    if (wc && p.h) out.push({ id: 'whtr', ic: 'tape', c: 'var(--body)', t: 'Waist ÷ height', v: whtr.toFixed(2), u: '', ev: 'waist',
      st: whtr < 0.5 ? 2 : whtr < 0.6 ? 1 : 0, scale: [[0.7, 'var(--bad)'], [0.6, 'var(--mid)'], [0.5, 'var(--good)'], [0.4]], at: whtr,
      s: whtr < 0.5 ? 'Under 0.5: "keep your waist to less than half your height".' : `${r1(wc - 0.5 * p.h)} cm of waist above half your height; it predicted heart and metabolic risk better than BMI.` });
    const sl = range(28, end).map(k => S.sleep[k]).filter(v => v != null);
    if (sl.length >= 7) {
      const a = mean(sl);
      out.push({ id: 'sleep', ic: 'sleep', c: 'var(--sleep)', t: 'Sleep a night', v: `${Math.floor(a)}:${String(Math.round((a % 1) * 60)).padStart(2, '0')}`, u: 'h, 4 weeks', ev: 'sleepdur',
        st: a >= 7 && a <= 9 ? 2 : a >= 6 ? 1 : 0, scale: [[5, 'var(--bad)'], [6, 'var(--mid)'], [7, 'var(--good)'], [9, 'var(--mid)'], [10]], at: a,
        s: a < 7 ? `Under 7 hours: 12% higher mortality in pooled cohorts of 1.4 million. ${fmt((7 - a) * 60)} minutes a night short.` : a > 9 ? 'Over 9 hours went with higher mortality, though illness behind long sleep explains much of it.' : 'Within the 7–9 hours adults are advised.' });
    }
    const Q = sri(14, end);
    if (Q.v != null) out.push({ id: 'sri', ic: 'cal', c: 'var(--sleep)', t: 'Sleep regularity', v: Math.round(Q.v), u: 'SRI', ev: 'regular',
      st: Q.v >= 81 ? 2 : Q.v >= 71 ? 1 : 0, scale: [[40, 'var(--bad)'], [71, 'var(--mid)'], [81, 'var(--good)'], [100]], at: Q.v,
      s: Q.v >= 81 ? 'At or above the UK Biobank median of 81.' : `The least regular fifth (under about 71) had higher mortality than the most regular, more than short sleep alone explained.` });
    const J = socialJetlag(end);
    if (J.v != null) out.push({ id: 'sjl', ic: 'moon', c: 'var(--sleep)', t: 'Social jetlag', v: J.v.toFixed(1), u: 'h', ev: 'sjl',
      st: J.v < 1 ? 2 : J.v < 2 ? 1 : 0, scale: [[3, 'var(--bad)'], [2, 'var(--mid)'], [1, 'var(--good)'], [0]], at: J.v,
      s: `Weekend nights centre ${hm(J.msf)}, weekdays ${hm(J.msw)}. ${J.v >= 1 ? 'Each hour of this went with a higher BMI beyond sleep length. Keep weekend wake-up within an hour of weekdays.' : 'Within an hour: your body clock is not being shifted each weekend.'}` });
    const SM = strengthMin(end);
    out.push({ id: 'str', ic: 'train', c: 'var(--move)', t: 'Strength training', v: Math.round(SM.perWk), u: `min a week${SM.est ? ', est.' : ''}`, ev: 'msa',
      st: SM.perWk >= 30 && SM.perWk <= 140 ? 2 : SM.perWk > 0 ? 1 : 0, scale: [[0, 'var(--bad)'], [10, 'var(--mid)'], [30, 'var(--good)'], [60, 'var(--good)'], [140, 'var(--mid)'], [180]], at: SM.perWk,
      s: SM.perWk < 30 ? `Most of the benefit came by 30–60 minutes a week (10–20% lower mortality); ${fmt(30 - SM.perWk)} more minutes reach it.` : SM.perWk <= 60 ? 'In the 30–60 minutes a week where cohorts saw the most benefit.' : 'Above 60 a week the extra mortality benefit fades; the gain is in strength and muscle.' });
    const W = range(28, end).length ? [0, 1, 2, 3].map(i => activityWeek(shift(end, -7 * i)).who) : [], who = W.length ? mean(W) : 0;
    out.push({ id: 'aer', ic: 'bolt', c: 'var(--move)', t: 'Active minutes', v: Math.round(who), u: 'a week, 4-week avg', ev: 'zones',
      st: who >= 150 ? 2 : who >= 75 ? 1 : 0, scale: [[0, 'var(--bad)'], [75, 'var(--mid)'], [150, 'var(--good)'], [300, 'var(--good)'], [400]], at: who,
      s: who >= 150 ? 'Meets the WHO 150–300 (vigorous counting double).' : `${Math.round(150 - who)} short of the WHO 150. Walks with the strap count when they reach your moderate zone.` });
    return out;
  });
}
// The one change that is worth the most, judged by what the cohorts saw, for the headline and the top of the card.
function bestLever(M = markers()) {
  const F = fitness(), cand = [];
  const by = id => M.find(m => m.id === id);
  if (by('steps')?.st === 0) cand.push({ w: 0.40, t: 'More steps is your biggest lever', s: `Going from ${by('steps').v} to 6,000 a day went with about ${Math.round((1 - stepsHR(6000) / stepsHR(by('steps').raw)) * 100)}% lower mortality in cohorts.` });
  if (by('str')?.st === 0) cand.push({ w: 0.15, t: 'Start strength training', s: '30–60 minutes a week went with 10–20% lower mortality, beyond what cardio gave.' });
  if (F.levers?.[0] && F.band < 2) cand.push({ w: 1 - F.levers[0].rr, t: `${F.levers[0].t}: fitness +${r1(F.levers[0].dv)}`, s: `≈ ${Math.round((1 - F.levers[0].rr) * 100)}% lower all-cause risk in cohorts. ${F.levers[0].how}` });
  if (by('sleep')?.st === 0) cand.push({ w: 0.12, t: 'Sleep is short', s: by('sleep').s });
  if (by('sjl')?.st === 0) cand.push({ w: 0.08, t: `Weekends shift your clock ${by('sjl').v} h`, s: by('sjl').s });
  return cand.sort((a, b) => b.w - a.w)[0] || null;
}

// ---------- drawing ----------
// A scale with its evidence bands and your position. stops: [[value, colour of the band that starts there], ..., [end]].
// The long game: one line per measure (its dot is where the cohorts put you), the one change worth the most named
// first. What each measure means, and the study behind it, is one tap away.
function markersCard() {
  const M = markers(), L = bestLever(M), ok = M.filter(m => m.st === 2).length, read = M.filter(m => m.st != null).length;
  const rows = M.map(m => `<a class="mk mk-s${m.st ?? 'x'}" href="#why-${m.ev}"><span class="nm">${m.t}</span><b class="num">${m.v != null ? `${m.v}<i>${m.u ? ' ' + m.u : ''}</i>` : DASH}</b><span class="chev">›</span></a>`).join('');
  return `<section class="card" id="in-long">${cardHead('The long game', 'pulse', 'var(--heart)', why('markers', 'what this is'))}
    ${read ? `<p class="sub small mksum"><b class="ok">${ok} of ${read}</b> where large cohorts found the most benefit.</p>` : ''}
    ${L ? `<div class="lever"><span class="eyebrow">Worth the most now</span><b>${esc(L.t)}</b></div>` : ''}
    <div class="mks">${rows}</div></section>`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('markers.js');

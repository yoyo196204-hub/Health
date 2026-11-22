'use strict';
// Data checks: every dataset read against itself and against the others, by fixed rules, with the numbers that
// decided each result. Nothing here guesses or scores; each check says what it compared, how many records it looked at,
// and lists the records that failed, each one tap from where it can be fixed. Me › Data checks, and a line on Insights.
//
// status: ok (passed), look (worth a look: a likely typo or a measurement that varies), bad (internally impossible),
// na (not enough data to check yet).

const CHECK_DAYS = 90;
function checkRange() { return range(CHECK_DAYS); }
function chk(id, group, title, status, result, items = [], why = '') { return { id, group, title, status, result, items: items.slice(0, 40), more: Math.max(0, items.length - 40), why }; }
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

function runChecks() {
  return cached('checks', () => {
    const out = [], days = checkRange(), inWin = k => k >= days[0];
    // ---------- food ----------
    {
      const bad = [], impossible = [];
      let n = 0;
      for (const k of days) for (const e of S.food[k] || []) {
        n++;
        if (e.k >= 20 && 4 * e.p > e.k * 1.05) impossible.push({ k, t: `${esc(e.n)}: ${r1(e.p)} g protein is ${fmt(4 * e.p)} kcal, more than its ${fmt(e.k)} kcal`, act: 'checkday' });
        const off = atwaterOff(e);
        if (off != null && e.k >= 20 && Math.abs(off) > 0.2) bad.push({ k, t: `${esc(e.n)}: ${fmt(e.k)} kcal against ${fmt(atwater(e))} from its macros`, act: 'checkday' });
      }
      for (const f of S.custom) {
        if (f.k >= 20 && 4 * f.p > f.k * 1.05) impossible.push({ t: `Your food “${esc(f.n)}”: protein alone is more energy than the whole food` });
        const off = atwaterOff(f);
        if (off != null && f.k >= 20 && Math.abs(off) > 0.2) bad.push({ t: `Your food “${esc(f.n)}”: ${fmt(f.k)} kcal against ${fmt(atwater(f))} from its macros` });
      }
      out.push(chk('f-prot', 'Food', 'Protein never exceeds the energy', !n ? 'na' : impossible.length ? 'bad' : 'ok',
        !n ? 'Nothing logged in the last 90 days.' : impossible.length ? `${plural(impossible.length, 'entry', 'entries')} with more energy in protein than in the whole food.` : `${fmt(n)} entries, all possible.`, impossible,
        '4 kcal per gram of protein: a food cannot hold more energy in its protein than in total. When it does, a number was typed in the wrong box.'));
      out.push(chk('f-atw', 'Food', 'Energy agrees with protein, carbs and fat', bad.length ? 'look' : n ? 'ok' : 'na',
        bad.length ? `${plural(bad.length, 'food')} off by more than a fifth.` : n ? 'Every entry with carbs and fat adds up within a fifth.' : 'Nothing to check yet.', bad,
        'Energy is checked against 4 kcal/g protein and carbs, 9 fat, 2 fibre (FAO factors, as on Indian labels). Labels round, and some count fibre or polyols in carbs, so within a fifth passes.'));
      const full = days.filter(k => S.food[k] && isComplete(k)), odd = full.filter(k => totals(k).k < 1000 || totals(k).k > 5000);
      out.push(chk('f-days', 'Food', 'Days counted as complete look complete', !full.length ? 'na' : odd.length ? 'look' : 'ok',
        !full.length ? 'No complete days yet.' : odd.length ? `${plural(odd.length, 'day')} counted as complete at under 1,000 or over 5,000 kcal.` : `${plural(full.length, 'complete day')}, all between 1,000 and 5,000 kcal.`,
        odd.map(k => ({ k, t: `${fmt(totals(k).k)} kcal`, act: 'checkday' })),
        'Complete days teach the app your real burn. One that is half logged, or double logged, pulls that estimate off.'));
      let kAll = 0, kKnown = 0;
      for (const k of range(14)) { const t = totals(k); kAll += t.k; kKnown += t.kn; }
      if (kAll) out.push(chk('f-mac', 'Food', 'Carbs and fat known', pct(kKnown, kAll) >= 90 ? 'ok' : 'look', `For ${pct(kKnown, kAll)}% of the energy logged in the last two weeks.`, [],
        'Entries from before carbs and fat were kept, quick adds and foods whose maker states only energy and protein have no split.'));
    }
    // ---------- weight ----------
    {
      const ks = Object.keys(S.weights).filter(inWin).sort(), jumps = ks.map(k => [k, weighCheck(k, S.weights[k])]).filter(([, d]) => d != null);
      out.push(chk('w-jump', 'Body', 'Weigh-ins close to the trend', ks.length < 5 ? 'na' : jumps.length ? 'look' : 'ok',
        ks.length < 5 ? `${plural(ks.length, 'weigh-in')}; the check starts at five.` : jumps.length ? `${plural(jumps.length, 'weigh-in')} more than 2.5 kg (or 3%) from the trend.` : `${plural(ks.length, 'weigh-in')}, none far from the trend.`,
        jumps.map(([k, d]) => ({ k, t: `${kg(S.weights[k])} kg, ${sign(d, 1)} kg from the trend`, s: 'weights' })),
        'A day’s weight moves 1–2 kg with water and food; more than that from the smoothed trend is usually a typo or a different scale.'));
      const E = energy();
      out.push(chk('w-ledger', 'Body', 'Food log and weight tell the same story', E.gap == null ? 'na' : Math.abs(E.gap) > 15 ? 'look' : 'ok',
        E.gap == null ? `Needs 7 complete food days in the last 3 weeks and a weight trend (${E.n} so far).` : `Intake and the weight trend imply a burn ${sign(E.gap, 0)}% from the formula's (${fmt(E.implied)} against ${fmt(E.implied / (1 + E.gap / 100))} kcal).`, [],
        'Burn implied by the data = logged intake − (trend change × 7,700 kcal/kg). A gap over 15% usually means food that was not logged; check portions first.'));
    }
    // ---------- sleep ----------
    {
      const nights = Object.keys(S.sleepx).filter(inWin), mism = [], bed = [], typed = [];
      for (const k of nights) {
        const x = S.sleepx[k], asleep = x.d + x.l + x.r;
        if (x.bed != null && asleep > x.bed + 5) bed.push({ k, t: `asleep ${dur(asleep)} but in bed ${dur(x.bed)}`, s: 'sleep' });
        const h = S.sleep[k];
        if (h == null) continue;
        if (S.manual.sleep[k]) { if (Math.abs(h * 60 - asleep - (x.nap || 0)) > 60) typed.push({ k, t: `typed ${dur(h * 60)}, watch ${dur(asleep + (x.nap || 0))}`, s: 'sleep' }); }
        else if (Math.abs(h * 60 - asleep - (x.nap || 0)) > 10) mism.push({ k, t: `${dur(h * 60)} stored against ${dur(asleep + (x.nap || 0))} in its stages`, s: 'sleep' });
      }
      out.push(chk('s-stage', 'Sleep', 'Stages add up to the night', !nights.length ? 'na' : mism.length || bed.length ? 'bad' : 'ok',
        !nights.length ? 'No nights with stages yet.' : mism.length || bed.length ? `${plural(mism.length + bed.length, 'night')} where the parts do not add up.` : `${plural(nights.length, 'night')}: deep + light + REM equals the total, and fits inside time in bed.`,
        mism.concat(bed), 'Deep, light and REM must add up to the night’s total and cannot be longer than the time in bed.'));
      out.push(chk('s-typed', 'Sleep', 'Typed sleep and the watch agree', !typed.length ? 'ok' : 'look',
        typed.length ? `${plural(typed.length, 'night')} where what you typed differs from the watch by over an hour. What you typed is used.` : 'No night where your entry and the watch differ by over an hour.', typed));
    }
    // ---------- heart ----------
    {
      const C = calibration();
      out.push(chk('h-rest', 'Heart', 'Watch resting heart rate against the strap', C.rest.n < 5 ? 'na' : Math.abs(C.rest.bias) > 5 ? 'look' : 'ok',
        C.rest.n < 5 ? `${plural(C.rest.n, 'morning')} with both; the comparison starts at five.` : `${C.rest.n} mornings: the watch reads ${sign(C.rest.bias, 1)} bpm, 95% of days within ${sign(C.rest.lo, 0)} to ${sign(C.rest.hi, 0)} (Bland–Altman).`, [],
        'The strap’s morning reading lying still is the reference. A steady offset is corrected for on days without a strap reading; a wide spread means the watch’s resting figure is noisy.'));
      out.push(chk('h-ex', 'Heart', 'Watch workout heart rate against the strap', C.ex.n < 3 ? 'na' : Math.abs(C.ex.bias) > 5 || (C.ex.hi - C.ex.lo) > 20 ? 'look' : 'ok',
        C.ex.n < 3 ? `${plural(C.ex.n, 'shared workout')}; the comparison starts at three.` : `${C.ex.n} workouts: the watch reads ${sign(C.ex.bias, 1)} bpm, 95% within ${sign(C.ex.lo, 0)} to ${sign(C.ex.hi, 0)}.`));
      const L = C.line;
      out.push(chk('h-line', 'Heart', 'Watch workout heart rate corrected by effort', C.lineOn ? (1.96 * L.se > 10 ? 'look' : 'ok') : 'na',
        C.lineOn ? `strap = ${L.m.toFixed(2)} × watch ${L.b < 0 ? '−' : '+'} ${Math.round(Math.abs(L.b))}, from ${L.n} workouts over ${Math.round(L.span)} bpm; 95% of corrected workouts within ±${Math.round(1.96 * L.se)} bpm (against ±${Math.round(1.96 * C.ex.sd)} with a fixed shift).`
          : L.m != null ? `${L.n} workouts over ${Math.round(L.span)} bpm give a slope of ${r1(L.m)}, outside 0.6–1.4: the fixed shift is used until the pairs settle.`
          : `${plural(L.n, 'shared workout')} over ${Math.round(L.span)} bpm; a line needs 6 over at least 30 bpm. Until then the fixed shift is used${C.exOn ? '' : ' (from 3)'}.`, [],
        'A wrist reads blood flow with light, and its error grows with effort and arm movement (Bent 2020), so one offset can fit easy sessions and miss hard ones. With enough workouts across easy to hard, a line from watch to strap (least squares) takes that into account; its residual error is what is left. Heart › Cardio has a three-session protocol that covers the range.'));
      const vals = Object.keys(S.rhr).filter(inWin).sort(), odd = [];
      vals.forEach((k, i) => { const h = vals.slice(Math.max(0, i - 28), i).map(j => S.rhr[j]); if (h.length >= 10) { const m = median(h), s = sd(h) || 1; if (Math.abs(S.rhr[k] - m) > Math.max(3 * s, 8)) odd.push({ k, t: `${S.rhr[k]} bpm against a usual ${Math.round(m)}`, s: 'rhr' }); } });
      out.push(chk('h-jump', 'Heart', 'Resting heart rate without sudden jumps', vals.length < 11 ? 'na' : odd.length ? 'look' : 'ok',
        vals.length < 11 ? 'Needs 11 days.' : odd.length ? `${plural(odd.length, 'day')} more than 3 SD (and 8 bpm) from the 4 weeks before.` : `${plural(vals.length, 'day')}, none far from the weeks before.`, odd,
        'Illness, alcohol or a hard day move resting heart rate a few beats; a jump far beyond your own spread is more often a loose watch or a missing night of readings.'));
      const exs = [];
      let nEx = 0;
      for (const k of days) for (const e of S.ex[k] || []) {
        nEx++;
        const secs = e.h.reduce((a, [, s]) => a + s, 0), len = (e.e - e.s) / 1000;
        if (len >= 600 && secs / len < 0.5) exs.push({ k, t: `${esc(e.k)} ${dur(len / 60)}: heart rate for ${pct(secs, len)}% of it` });
      }
      out.push(chk('h-cov', 'Heart', 'Watch workouts have heart rate throughout', !nEx ? 'na' : exs.length ? 'look' : 'ok',
        !nEx ? 'No watch workouts yet.' : exs.length ? `${plural(exs.length, 'workout')} with heart rate for under half the time: zone minutes from them are undercounted.` : `${plural(nEx, 'workout')}, each with heart rate for at least half its length.`, exs));
    }
    // ---------- morning checks ----------
    {
      const ks = Object.keys(S.hrv).filter(k => gapDays(k, todayKey()) <= 28).sort(), low = [], recalc = [];
      for (const k of ks) {
        const x = S.hrv[k];
        if (x.q != null && x.q < 90) low.push({ k, t: `${x.q}% clean beats`, href: `#beats-h${k.replace(/-/g, '')}` });
        if (x.rr?.length >= 30) { const m = hrvMetrics(x.rr); if (m && Math.abs(m.rmssd - x.rmssd) / x.rmssd > 0.03) recalc.push({ k, t: `saved ${r1(x.rmssd)} ms, its own beats give ${r1(m.rmssd)} ms`, href: `#beats-h${k.replace(/-/g, '')}` }); }
      }
      const pos = [...new Set(ks.map(k => S.hrv[k].pos).filter(Boolean))], durs = ks.map(k => S.hrv[k].dur).filter(Boolean);
      const times = ks.map(k => S.hrv[k].t).filter(Boolean).map(t => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); });
      const tsd = times.length >= 5 ? sd(times) : null;
      out.push(chk('v-q', 'Morning checks', 'Recordings are clean', !ks.length ? 'na' : low.length ? 'look' : 'ok',
        !ks.length ? 'No morning checks in the last 4 weeks.' : low.length ? `${plural(low.length, 'morning')} under 90% clean beats: read them with care.` : `${plural(ks.length, 'morning')}, each at least 90% clean beats.`, low,
        'Under about 10% corrected beats RMSSD stays close to its true value; beyond that the correction itself starts to shape the number. Wet the strap and lie still.'));
      out.push(chk('v-recalc', 'Morning checks', 'Saved RMSSD matches its own beats', !ks.some(k => S.hrv[k].rr) ? 'na' : recalc.length ? 'bad' : 'ok',
        recalc.length ? `${plural(recalc.length, 'reading')} whose saved value differs from its beats by over 3%.` : 'Each saved value worked out again from its kept beats: all within 3%.', recalc,
        'Each morning keeps its beats, so its RMSSD can be worked out again with today’s correction and compared with what was saved.'));
      out.push(chk('v-same', 'Morning checks', 'Same position, length and time each morning', ks.length < 5 ? 'na' : pos.length > 1 || (durs.length && Math.max(...durs) - Math.min(...durs) > 60) || (tsd != null && tsd > 60) ? 'look' : 'ok',
        ks.length < 5 ? 'Needs five mornings.' : [pos.length > 1 ? `positions mixed (${pos.join(', ')})` : `all ${pos[0] || 'in one position'}`,
          durs.length ? `lengths ${dur(Math.min(...durs) / 60)}–${dur(Math.max(...durs) / 60)}` : '', tsd != null ? `times spread ±${Math.round(tsd)} min` : ''].filter(Boolean).join(' · ') + '.', [],
        'Lying versus sitting changes RMSSD by more than a normal day-to-day swing, and so do recording length and time after waking. A baseline is only a baseline when every morning is taken the same way (Plews 2013).'));
    }
    // ---------- movement ----------
    {
      const stride = [], merged = [], kcal = [];
      let both = 0;
      for (const k of days) {
        const st = S.steps[k], x = S.wx[k];
        if (!x) continue;
        if (st >= 2000 && x.di && !S.manual.steps[k]) { both++; const m = x.di / st; if (m < 0.4 || m > 1.2) stride.push({ k, t: `${fmt(st)} steps over ${r1(x.di / 1000)} km: ${r1(m * 100)} cm a step`, s: 'steps' }); }
        if (x.sa && st && Math.abs(x.sa - st) / st > 0.1) merged.push({ k, t: `watch ${fmt(st)}, all apps merged ${fmt(x.sa)}` });
        if (x.ak != null && x.tk != null && x.ak > x.tk) kcal.push({ k, t: `${fmt(x.ak)} active kcal over ${fmt(x.tk)} total` });
      }
      out.push(chk('a-stride', 'Movement', 'Steps and distance fit a human stride', !both ? 'na' : stride.length ? 'look' : 'ok',
        !both ? 'No days with both steps and distance yet.' : stride.length ? `${plural(stride.length, 'day')} with an implied step outside 40–120 cm.` : `${plural(both, 'day')}, every implied step between 40 and 120 cm.`, stride,
        'Distance ÷ steps is the average step. Outside 40–120 cm, one of the two is double counted or missing.'));
      out.push(chk('a-merge', 'Movement', 'The watch’s steps against Health Connect’s merge', merged.length ? 'look' : 'ok',
        merged.length ? `${plural(merged.length, 'day')} where the watch's own count and Health Connect's merged total differ by over 10%. The watch's own count is used, so it matches the watch app.` : 'The watch’s own count and Health Connect’s merge agree, or only the watch counts steps.', merged,
        'Health Connect merges every app that counts steps by its priority list; on recent Android the phone counts too. That merged figure is why another app can show a different total.'));
      // Wear time: a day counts at 10 h on the wrist, a week at 4 such days (Troiano 2008).
      const known = days.filter(k => k < todayKey() && wear(k)), short = known.filter(k => !validDay(k)), unknown = days.filter(k => k < todayKey() && S.steps[k] != null && !wear(k));
      const nk = days.filter(k => S.sleepx[k] && nightWorn(k) != null), off = nk.filter(k => nightWorn(k) === false);
      const weeks = [0, 1, 2, 3].map(i => range(7, shift(todayKey(), -1 - 7 * i))).filter(w => w.some(k => wear(k))), thin = weeks.filter(w => w.filter(k => validDay(k)).length < WEAR_WEEK).length;
      out.push(chk('a-wear', 'Movement', 'Watch worn long enough to count', !known.length ? 'na' : short.length > known.length / 4 || off.length ? 'look' : 'ok',
        !known.length ? 'No heart rate through the day yet to tell when the watch was worn.' : `${plural(known.length - short.length, 'day')} of ${known.length} worn ${WEAR_H} h or more${short.length ? `; ${short.length} left out of step trends, the burn model, the long game and links` : ''}.${nk.length ? ` ${nk.length - off.length} of ${plural(nk.length, 'night')} worn throughout${off.length ? `; ${off.length} left out` : ''}.` : ''}${thin ? ` ${plural(thin, 'week')} of the last 4 under ${WEAR_WEEK} valid days: too thin to report.` : ''}${unknown.length ? ` ${plural(unknown.length, 'day')} with steps but no record of wear time: kept, not counted as valid.` : ''}`,
        short.map(k => ({ k, t: `worn ${dur(wear(k).min)}`, s: 'steps' })).concat(off.map(k => ({ k, t: 'night: off the wrist an hour or more', s: 'sleep' }))),
        'Non-wear is any hour or more with no heart rate (or, from a history file, no step either). A day counts at 10 hours worn and a week at 4 such days, the rule accelerometer studies use (Troiano 2008); a day the watch spent on the table would read as a lazy day, and a night on the bedside table as sleep.'));
      out.push(chk('a-kcal', 'Movement', 'Active energy within total energy', kcal.length ? 'bad' : 'ok', kcal.length ? `${plural(kcal.length, 'day')} with more active than total energy.` : 'Every day’s active energy is part of its total.', kcal));
      const over = [];
      for (const k of days) { const L = S.ex[k] || []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const o = overlapMs(L[i].s, L[i].e, L[j].s, L[j].e); if (o > 0.5 * Math.min(L[i].e - L[i].s, L[j].e - L[j].s)) over.push({ k, t: `${esc(L[i].k)} (${esc(L[i].src || '')}) and ${esc(L[j].k)} (${esc(L[j].src || '')}) overlap` }); } }
      out.push(chk('a-dup', 'Movement', 'No workout recorded twice', over.length ? 'look' : 'ok', over.length ? `${plural(over.length, 'pair')} of workouts over half overlapping: likely one session from two apps.` : 'No overlapping workouts.', over));
    }
    // ---------- lifting ----------
    {
      const ks = Object.keys(S.lifts).sort(), seen = {}, odd = [];
      for (const k of ks) for (const [id, sets] of Object.entries(S.lifts[k].ex)) {
        const top = Math.max(0, ...sets.map(s => s[0] || 0)), prev = seen[id] || [];
        if (top > 0 && prev.length >= 3) { const m = median(prev.slice(-5)); if (m > 0 && (top > m * 1.5 || top < m * 0.5) && inWin(k)) odd.push({ k, t: `${esc(EXD[id]?.n || id.replace(/^x:/, ''))}: ${kg(top)} kg against a usual ${kg(m)} kg` }); }
        for (const s of sets) if (s[1] > 50 && inWin(k)) odd.push({ k, t: `${esc(EXD[id]?.n || id.replace(/^x:/, ''))}: ${s[1]} reps in one set` });
        if (top > 0) (seen[id] ||= []).push(top);
      }
      out.push(chk('l-typo', 'Training', 'Loads and reps in a believable range', !ks.length ? 'na' : odd.length ? 'look' : 'ok',
        !ks.length ? 'No lifting yet.' : odd.length ? `${plural(odd.length, 'set')} at under half or over 1.5× the usual top load, or over 50 reps.` : 'Every top set within half to one and a half times its usual load.', odd,
        'Progression moves a load a few percent at a time; a jump far outside that is usually a slipped decimal or the wrong unit, and it would steer the next targets.'));
    }
    // ---------- the watch connection ----------
    if (NATIVE || S.meta.fresh) {
      const W = watchWrote(), F = S.meta.fresh;
      out.push(chk('sync', 'Sources', 'Watch data is current', !F ? 'na' : watchLagging() ? 'look' : F.err?.length ? 'look' : 'ok',
        !F ? 'Not read from Health Connect yet.' : `${W ? `${esc(W.src)} last passed data to Health Connect ${ago(W.w)}` : 'Nothing from a watch app yet'}; Health read it ${ago(F.read)}.${F.apps?.length ? ` Apps writing: ${F.apps.map(esc).join(', ')}.` : ''}`,
        (F?.err || []).map(e => ({ t: esc(e) })), `${watchApp()} passes the watch’s data to Health Connect only when it syncs with the watch. Health reads Health Connect when it opens, every five minutes while open, and when you pull down.`));
    }
    return out;
  });
}
// One line for Me, and a banner on Insights only when something does not add up or is worth a look.
function checkLine() { const s = checkSummary(); return s.bad + s.look ? `${s.bad ? `${s.bad} do not add up · ` : ''}${s.look} worth a look · ${s.ok} passed` : `All ${s.ok} passed${s.na ? ` · ${s.na} need more data` : ''}`; }
function checkBanner() {
  const s = checkSummary();
  if (!s.bad && !s.look) return '';
  return `<a class="ckbanner ${s.bad ? 'bad' : 'look'}" href="#set-checks"><i class="ckdot"></i><span class="grow"><b>Data checks</b><span class="sub">${checkLine()}</span></span><span class="chev">›</span></a>`;
}
function checkSummary() {
  const C = runChecks(), n = s => C.filter(c => c.status === s).length;
  return { bad: n('bad'), look: n('look'), ok: n('ok'), na: n('na'), all: C.length };
}

// ---------- the page ----------
const CHECKW = { ok: 'Passed', look: 'Worth a look', bad: 'Does not add up', na: 'Not enough data' };
function vChecks() {
  const C = runChecks(), Sm = checkSummary(), groups = [...new Set(C.map(c => c.group))];
  const order = { bad: 0, look: 1, ok: 2, na: 3 };
  const item = x => `<li>${x.k ? `<span class="num ckd">${dateLabel(x.k)}</span>` : ''}<span class="grow">${x.t}</span>${x.href ? `<a class="mini" href="${x.href}">Open</a>` : x.act ? `<button class="mini" data-act="${x.act}" data-k="${x.k}">Open</button>` : x.s ? `<button class="mini" data-act="checkrec" data-s="${x.s}" data-k="${x.k}">Open</button>` : ''}</li>`;
  return `${para(`${Sm.all} checks over the last ${CHECK_DAYS} days, by fixed rules. Each says what it compared and with what numbers; anything that fails lists the records, one tap from where to fix them.`)}
    ${stats([[Sm.bad, 'do not add up'], [Sm.look, 'worth a look'], [Sm.ok, 'passed'], [Sm.na, 'need more data']], 'ckstats')}
    ${groups.map(g => sec(g, `<ul class="checks">${C.filter(c => c.group === g).sort((a, b) => order[a.status] - order[b.status]).map(c => `<li class="ck ${c.status}">
      <details ${c.status === 'bad' ? 'open' : ''}><summary><i class="ckdot" aria-hidden="true"></i><span class="grow"><b>${c.title}</b><span class="sub">${c.result}</span></span><span class="ckw">${CHECKW[c.status]}</span></summary>
      ${c.items.length ? `<ul class="ckitems">${c.items.map(item).join('')}${c.more ? `<li class="sub">and ${c.more} more</li>` : ''}</ul>` : ''}
      ${c.why ? `<p class="sub small">${c.why}</p>` : ''}</details></li>`).join('')}</ul>`)).join('')}`;
}
SETPAGES.checks = ['Data checks', vChecks];
function checkAct(a, el) {
  if (a === 'checkday') { const k = el.dataset.k; if (!DATE.test(k)) return true; day = k; location.hash = 'today'; return true; }
  if (a === 'checkrec') { if (DATE.test(el.dataset.k) && S[el.dataset.s]) openPop({ kind: 'recedit', s: el.dataset.s, k: el.dataset.k }); return true; }
  return false;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-checks.js');

'use strict';
// Train: the lifting session, cardio with the strap, every workout the watch recorded, and the week's totals.

function lastLift(name) {
  for (const k of Object.keys(S.lifts).filter(k => k < day).sort().reverse()) if (S.lifts[k].ex[name]) return S.lifts[k].ex[name];
  return null;
}
function nextDay() {
  const keys = Object.keys(S.lifts).filter(k => k < day).sort();
  return { A: 'B', B: 'C', C: 'A' }[keys.length ? S.lifts[keys[keys.length - 1]].day : 'C'];
}
function trainLetter() { return trainDay || S.lifts[day]?.day || nextDay(); }
// Seven days at a glance: the letter of a lifting day, a heart for cardio, the day you are viewing ringed.
function weekStrip(end) {
  return `<div class="week">${range(7, end).map(k => {
    const ss = sessions(k), L = S.lifts[k]?.day, mark = L || (ss.length ? '♥' : '');
    return `<button class="wd ${k === day ? 'cur' : ''} ${mark ? 'did' : ''}" data-act="goday" data-k="${k}"><span>${weekday(k)}</span><b>${mark || '·'}</b></button>`;
  }).join('')}</div>`;
}
function liftSet(name, s, last, cur) {
  return `<span>${s + 1}</span>
    <input type="number" inputmode="decimal" step="0.5" placeholder="${last?.[s]?.[0] ?? 'kg'}" value="${cur[s]?.[0] ?? ''}" data-lift="${esc(name)}" data-set="${s}" data-f="0" aria-label="Set ${s + 1} kg">
    <input type="number" inputmode="numeric" placeholder="${last?.[s]?.[1] ?? 'reps'}" value="${cur[s]?.[1] ?? ''}" data-lift="${esc(name)}" data-set="${s}" data-f="1" aria-label="Set ${s + 1} reps">`;
}
function vTrain() {
  const home = S.profile.equip === 'home', d = trainLetter(), A = activityWeek(day), hist = liftHistory();
  const ex = PLAN[d].map(e => {
    const name = home ? e[1] : e[0], last = lastLift(name), cur = S.lifts[day]?.ex[name] || [];
    const top = parseInt(e[3].split('–')[1]);
    const up = last && last.length >= e[2] && last.every(s => s && s[1] >= top);
    const h = (hist[name] || []).filter(x => x.k < day), best = h.length ? h[h.length - 1].v : null, change = h.length >= 2 ? (h[h.length - 1].v / h[0].v - 1) * 100 : null;
    let rows = '';
    for (let s = 0; s < e[2]; s++) rows += liftSet(name, s, last, cur);
    const meta = [`${e[2]} × ${e[3]}`, e[5]];
    if (best && e[5] !== 'Core') meta.push(`est. max ${Math.round(best)} kg${change != null && Math.abs(change) >= 1 ? ` (${sign(change)}%)` : ''}`);
    return `<section class="ex"><div class="mh"><h2>${esc(name)}</h2></div><p class="sub">${meta.join(' · ')}</p>
      ${e[4] ? `<p class="sub">${e[4]}</p>` : ''}${up ? '<p class="flag up">Top of the range last time. Add weight.</p>' : ''}
      <div class="sets"><span></span><span>kg</span><span>reps</span>${rows}</div></section>`;
  }).join('');
  const V = volume(day), cardio = range(7, day).flatMap(k => sessions(k).map(s => ({ ...s, k }))).reverse();
  const sess = cardio.length ? `<ul class="list">${cardio.map(s => `<li><div class="grow"><span class="nm">${esc(s.kind)} ${src(s.src === 'strap' ? 'strap' : s.corrected ? 'adj' : 'watch')}</span>
      <span class="sub">${dateLabel(s.k, { weekday: 'short', day: 'numeric', month: 'short' })}${s.t ? ` · ${hm(new Date(s.t).getHours() * 60 + new Date(s.t).getMinutes())}` : ''} · ${dur(s.dur / 60)}${s.avg ? ` · avg ${Math.round(s.avg)}, max ${Math.round(s.max)} bpm` : ''}${s.noHr ? ' · no heart rate, counted as moderate' : ''}</span></div>
      <b class="num side">${Math.round((s.z[1] + 2 * (s.z[2] + s.z[3])) / 60)}<i>min</i></b></li>`).join('')}</ul>` : para('No cardio in the last 7 days. Workouts the watch records arrive here by themselves.');
  return `${masthead('Train', `${S.profile.equip === 'home' ? 'Dumbbells' : 'Gym'} · ${dateLabel(day, { weekday: 'long', day: 'numeric', month: 'short' })}`)}
    ${weekStrip(day >= shift(todayKey(), -6) ? todayKey() : shift(day, 3))}
    ${sec('This week', `<div class="pair">
        <div><span class="sub">Active minutes</span><b class="num">${Math.round(A.who)}<i> / 150</i></b>${meter(A.who, 150)}</div>
        <div><span class="sub">Strength days</span><b class="num">${A.strengthDays}<i> / 2+</i></b>${meter(A.strengthDays, Math.max(2, S.profile.days))}</div></div>
        ${para(`WHO: 150–300 moderate minutes, vigorous counting double, and muscle-strengthening on 2 or more days. ${A.vig >= 1 ? `${Math.round(A.vig)} vigorous minutes so far.` : ''}`)}`, { why: ['zones', 'How it counts'] })}
    <div class="chips">${['A', 'B', 'C'].map(x => `<button class="${x === d ? 'on' : ''}" data-act="tday" data-d="${x}">Day ${x}</button>`).join('')}</div>
    ${S.profile.shoulder ? `<details><summary>Shoulder warm-up, 5 minutes</summary><ol>${PREHAB.map(x => `<li>${x}</li>`).join('')}</ol></details>` : ''}
    ${ex}
    <p class="note">Grey numbers are your last session. Stop each set 1–3 reps short of failure. ${why('lift', 'Why this plan')} ${why('e1rm', 'Est. max')}</p>
    ${sec('Cardio with the H9', strapBlock('workout') + strapMsg(), { why: ['zones', 'Zones'] })}
    ${sec('Cardio, last 7 days', sess, { why: ['devices', 'Watch vs strap'] })}
    ${sec('Sets per muscle, 7 days', `<div class="vol">${MUSCLES.map(m => `<span>${m}</span>${meter(V[m], 10, V[m] >= 10 ? 'ok' : V[m] >= 4 ? '' : 'low')}<b class="num">${V[m]}</b>`).join('')}</div>
      ${para('4 or more a week keeps muscle in a deficit; about 10 builds it. Counted from sets with reps logged.')}`, { why: ['volume', 'Why these numbers'] })}`;
}
// Saved without re-rendering, so the keyboard stays in the next field.
function logLift(el) {
  const name = el.dataset.lift, si = +el.dataset.set, f = +el.dataset.f;
  const entry = S.lifts[day] ||= { day: trainLetter(), ex: {} };
  const sets = entry.ex[name] ||= [];
  while (sets.length <= si) sets.push([null, null]);
  sets[si][f] = num(el.value, 0, f ? 600 : 500);
  if (el.value !== '' && sets[si][f] == null) { el.value = ''; toast('That value is out of range'); }
  // An emptied exercise, or an emptied session, is removed rather than counted.
  if (sets.every(s => s[0] == null && s[1] == null)) delete entry.ex[name];
  if (!Object.keys(entry.ex).length) delete S.lifts[day];
  save();
}

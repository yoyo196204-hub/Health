'use strict';
// Every record, yours to see, change and delete; and a day in detail, the way the watch saw it.
//  - All your data (Me): one list per kind of record, newest first. Tap a row to open or edit it; swipe it left to
//    delete it, with undo. Anything that came from the watch or a scale and is deleted stays deleted: the next sync
//    does not bring it back. A typed value always wins over the watch; clearing it hands the day back.
//  - A day in detail: the watch's heart rate across the 24 hours with sleep and workouts marked, the night stage by
//    stage, and every number of that day read against your own previous four weeks.

const REC = { s: 'weights', n: 60 };
const RECS = {
  weights: { n: 'Weight', u: 'kg', step: 0.1, lim: LIMITS.weights, man: true },
  waist: { n: 'Waist', u: 'cm', step: 0.5, lim: LIMITS.waist, man: false },
  steps: { n: 'Steps', u: 'steps', step: 100, lim: LIMITS.steps, man: true },
  sleep: { n: 'Sleep', u: 'h', step: 0.1, lim: LIMITS.sleep, man: true },
  rhr: { n: 'Resting HR', u: 'bpm', step: 1, lim: LIMITS.rhr, man: false },
  wx: { n: 'Overnight', u: '' },
  hrv: { n: 'Morning checks', u: 'ms' },
  lab: { n: 'Lab', u: '' },
  cardio: { n: 'Cardio', u: '' },
  ex: { n: 'Watch workouts', u: '' },
  lifts: { n: 'Lifting', u: '' },
  food: { n: 'Food days', u: '' },
};
// What the overnight figures are and how they can be edited.
const WXF = [['hv', 'Overnight HRV', 'ms', 1], ['br', 'Breathing in sleep', '/min', 0.1], ['o2', 'Blood oxygen', '%', 0.1], ['vo', 'VO2max', '', 0.1], ['bf', 'Body fat', '%', 0.1], ['tk', 'Total burn (watch)', 'kcal', 10]];

function recRows(s) {
  const t = d => dateLabel(d, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });
  const srcOf = (st, k) => RECS[st].man ? (S.manual[st]?.[k] ? '' : src('watch')) : st === 'rhr' ? src('watch') : '';
  if (['weights', 'waist', 'steps', 'sleep', 'rhr'].includes(s)) return Object.keys(S[s]).sort().reverse().map(k => ({ k, t: t(k), v: `${s === 'steps' ? fmt(S[s][k]) : kg(S[s][k])} ${RECS[s].u}`, b: srcOf(s, k), act: `data-act="recedit" data-s="${s}" data-k="${k}"`, sw: `data-s="${s}" data-k="${k}"` }));
  if (s === 'wx') return Object.keys(S.wx).sort().reverse().map(k => ({ k, t: t(k), v: WXF.filter(f => S.wx[k][f[0]] != null).map(f => `${f[1].split(' ')[0]} ${r1(S.wx[k][f[0]])}${f[2] && f[2] !== '%' ? ' ' + f[2] : f[2]}`).join(' · '), b: src('watch'), act: `data-act="recedit" data-s="wx" data-k="${k}"`, sw: `data-s="wx" data-k="${k}"` }));
  if (s === 'hrv') return Object.keys(S.hrv).sort().reverse().map(k => ({ k, t: t(k), v: `${r1(S.hrv[k].rmssd)} ms · ${Math.round(S.hrv[k].hr)} bpm${S.hrv[k].q != null ? ` · ${S.hrv[k].q}%` : ''}`, b: src('strap'), act: `data-act="hrinfo" data-k="${k}"`, sw: `data-s="hrv" data-k="${k}"` }));
  if (s === 'lab') return Object.keys(S.lab).sort().reverse().flatMap(k => S.lab[k].slice().reverse().map(x => ({ k, t: `${t(k)} · ${LABS[x.kind]?.n || ''}`, v: labSummary(x), b: '', act: `data-act="labinfo" data-k="${k}" data-t="${x.t}"`, sw: `data-s="lab" data-k="${k}" data-t="${x.t}"` })));
  if (s === 'cardio') return Object.keys(S.cardio).sort().reverse().flatMap(k => S.cardio[k].map((c, i) => [c, i]).reverse().map(([c, i]) => ({ k, t: t(k), v: `${(KINDS.find(x => x[0] === c.kind) || KINDS[KINDS.length - 1])[1]} · ${dur(c.dur / 60)}${c.avg ? ` · ${c.avg} bpm` : ''}${c.hrr != null ? ` · recovery ${c.hrr}` : ''}`, b: src(c.m ? 'typed' : 'strap'), act: `data-act="cardioinfo" data-k="${k}" data-t="${c.t || ''}" data-src="${c.m ? 'manual' : 'strap'}"`, sw: `data-s="cardio" data-k="${k}" data-i="${i}"` })));
  if (s === 'ex') return Object.keys(S.ex).sort().reverse().flatMap(k => S.ex[k].slice().reverse().map(e => ({ k, t: `${t(k)} · ${hm(new Date(e.s).getHours() * 60 + new Date(e.s).getMinutes())}`, v: `${esc(e.og ? e.ti || 'openGym workout' : e.k)} · ${dur((e.e - e.s) / 6e4)}${e.src ? ` · ${esc(e.src)}` : ''}`, b: src('watch'), act: `data-act="cardioinfo" data-k="${k}" data-t="${e.s}" data-src="watch"`, sw: `data-s="ex" data-k="${k}" data-t="${e.s}"` })));
  if (s === 'lifts') return Object.keys(S.lifts).sort().reverse().map(k => { const St = dayStats(k); return { k, t: t(k), v: `${esc(dayName(k))} · ${plural(St.sets, 'set')} · ${fmt(St.load)} kg`, b: S.lifts[k].src === 'og' ? '<span class="src s-og">openGym</span>' : '', act: `data-act="sessinfo" data-k="${k}"`, sw: `data-s="lifts" data-k="${k}"` }; });
  if (s === 'food') return Object.keys(S.food).sort().reverse().map(k => { const T = totals(k); return { k, t: t(k), v: `${fmt(T.k)} kcal · ${Math.round(T.p)} g protein · ${plural(T.n, 'item')}`, b: isComplete(k) ? '' : '<span class="src s-typed">partial</span>', act: `data-act="recday" data-k="${k}"`, sw: `data-s="food" data-k="${k}"` }; });
  return [];
}
function vRecords() {
  const rows = recRows(REC.s), more = rows.length > REC.n;
  const counts = s => s === 'lab' || s === 'cardio' || s === 'ex' ? Object.values(S[s]).reduce((a, x) => a + x.length, 0) : Object.keys(S[s]).length;
  return `${para('Everything the app holds, newest first. Tap a row to open or change it; swipe it left to delete it, with undo. Deleted watch and scale data stays deleted when the watch syncs again.')}
    <div class="chips">${Object.entries(RECS).map(([k, R]) => `<button class="${REC.s === k ? 'on' : ''}" data-act="recs" data-v="${k}">${R.n} <i class="cnt">${counts(k)}</i></button>`).join('')}</div>
    ${['weights', 'waist', 'steps', 'sleep', 'rhr'].includes(REC.s) ? `<div class="rowb tight"><button class="ghost" data-act="recadd" data-s="${REC.s}">Add a ${RECS[REC.s].n.toLowerCase()} for another day</button></div>` : ''}
    ${rows.length ? `<ul class="list swipelist recs">${rows.slice(0, REC.n).map(r => `<li data-swipe="recdel" ${r.sw}><button class="rowbtn" ${r.act}><span class="grow"><span class="nm">${r.t} ${r.b}</span><span class="sub">${r.v}</span></span><span class="chev">›</span></button></li>`).join('')}</ul>
      ${more ? `<button class="ghost wide" data-act="recmore">Show ${Math.min(60, rows.length - REC.n)} more of ${rows.length}</button>` : ''}` : para('Nothing of this kind yet.')}
    ${REC.s === 'lifts' ? para('A session that came from openGym returns with openGym’s next backup if it is still there: delete it in openGym too.') : REC.s === 'ex' ? para('The workout stays deleted here even if it is still in Zepp or Health Connect.') : ''}`;
}

// ---------- editing one value ----------
function vRecEdit(p) {
  const s = p.s, R = RECS[s], k = p.k || todayKey();
  if (s === 'wx') {
    const x = S.wx[k] || {};
    return `${sheetTop(dateLabel(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 'Overnight, from the watch', `rec-wx-${k}`)}
      <div class="fgrid">${WXF.map(([f, n, u, st]) => `<label>${n}${u ? `, ${u}` : ''}<input id="wx_${f}" type="number" inputmode="decimal" step="${st}" value="${x[f] ?? ''}"></label>`).join('')}</div>
      ${para('Leave a field empty to remove that figure. Saved values stay as you set them; a deleted day is not brought back by the next sync.')}
      <div class="rowb"><button class="danger" data-hold="recdelh" data-s="wx" data-k="${k}">Hold to delete the day</button><span class="grow"></span><button class="solid" data-act="recsavewx" data-k="${k}">Save</button></div></aside>`;
  }
  const v = S[s][k], man = R.man && S.manual[s]?.[k];
  return `${sheetTop(p.add ? 'Choose the day, then the value' : dateLabel(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), R.n, `rec-${s}-${k}-${p.add ? 'a' : ''}`)}
    ${p.add ? `<label class="line">Day<span class="f"><input id="rec_k" type="date" value="${k}" max="${todayKey()}"></span></label>` : ''}
    <div class="wstep big"><button class="step" data-act="recstep" data-d="-1" data-repeat="rec-">−</button><span class="grow"><input id="rec_v" class="bignum" type="number" inputmode="decimal" step="${R.step}" value="${v ?? ''}" placeholder="${s === 'weights' ? r1(targets().wt) : ''}"> ${R.u}</span><button class="step" data-act="recstep" data-d="1" data-repeat="rec+">+</button></div>
    ${para(R.man ? (v != null && !man ? 'From the watch or scale. Saving makes it yours: the watch will not change it again.' : man ? 'Typed by you. Clearing it hands the day back to the watch.' : 'Typed values always win over the watch.') : s === 'rhr' ? 'Resting heart rate from the watch. A changed value stays as you set it.' : '')}
    <div class="rowb">${v != null ? `<button class="danger" data-hold="recdelh" data-s="${s}" data-k="${k}">Hold to delete</button>` : ''}${man ? '<button class="ghost" data-act="recauto">Hand back to the watch</button>' : ''}<span class="grow"></span><button class="solid" data-act="recsave">Save</button></div></aside>`;
}
function recSave() {
  const s = pop.s, R = RECS[s], k = $('#rec_k')?.value || pop.k, raw = $('#rec_v')?.value;
  if (!DATE.test(k) || k > todayKey()) { buzz('warn'); return toast('Choose a day up to today'); }
  const v = num(raw, ...R.lim);
  if (raw === '' || raw == null) return recRemove(s, k);
  if (v == null) { buzz('warn'); return toast(`Between ${R.lim[0]} and ${R.lim[1]} ${R.u}`); }
  const was = S[s][k], wasMan = S.manual[s]?.[k];
  if (R.man) setManual(s, k, s === 'steps' ? Math.round(v) : r1(v)); else { S[s][k] = s === 'waist' ? r1(v) : Math.round(v); delete S.gone[s]?.[k]; }
  save(); buzz('ok'); closePop();
  toast(`${R.n} saved for ${dateLabel(k)}`, 4000, { label: 'Undo', fn: () => { if (was == null) delete S[s][k]; else S[s][k] = was; if (R.man) { if (wasMan) S.manual[s][k] = 1; else delete S.manual[s][k]; } save(); render(); } });
}
// Deleting anything, with undo; data from the watch or a scale is remembered as deleted so a sync does not refill it.
function recRemove(s, k, extra = {}) {
  let undo = null, label = dateLabel(k);
  if (['weights', 'waist', 'steps', 'sleep', 'rhr', 'wx'].includes(s)) {
    const was = S[s][k], man = S.manual[s]?.[k];
    if (was == null) return;
    const tomb = !man && GONE.includes(s);
    delete S[s][k]; if (S.manual[s]) delete S.manual[s][k];
    if (tomb) S.gone[s][k] = 1;
    if (s === 'sleep' && tomb && S.sleepx[k]) { var sx = S.sleepx[k]; delete S.sleepx[k]; S.gone.sleepx[k] = 1; }
    undo = () => { S[s][k] = was; if (man) S.manual[s][k] = 1; if (tomb) delete S.gone[s][k]; if (sx) { S.sleepx[k] = sx; delete S.gone.sleepx[k]; } };
  } else if (s === 'hrv') { const was = S.hrv[k]; if (!was) return; delete S.hrv[k]; undo = () => { S.hrv[k] = was; }; label = `Morning check of ${label}`; }
  else if (s === 'lab') return labRemove(k, extra.t);
  else if (s === 'cardio') { const i = +extra.i, L = S.cardio[k], was = L?.[i]; if (!was) return; L.splice(i, 1); if (!L.length) delete S.cardio[k]; undo = () => { (S.cardio[k] ||= []).splice(i, 0, was); }; label = 'Cardio session'; }
  else if (s === 'ex') { const L = S.ex[k] || [], i = L.findIndex(e => String(e.s) === String(extra.t)); if (i < 0) return; const was = L[i]; L.splice(i, 1); if (!L.length) delete S.ex[k]; S.gone.ex[String(was.s)] = 1; undo = () => { (S.ex[k] ||= []).splice(i, 0, was); delete S.gone.ex[String(was.s)]; }; label = 'Watch workout'; }
  else if (s === 'lifts') { const was = S.lifts[k]; if (!was) return; delete S.lifts[k]; undo = () => { S.lifts[k] = was; }; label = 'Lifting session'; }
  else if (s === 'food') { const was = S.food[k], f = S.full[k]; if (!was) return; delete S.food[k]; delete S.full[k]; undo = () => { S.food[k] = was; if (f != null) S.full[k] = f; }; label = `Food of ${label}`; }
  if (!undo) return;
  save(); if (pop) closePop(); else render();
  undoable(`${label} deleted`, undo);
}
SWIPE.recdel = el => recRemove(el.dataset.s, el.dataset.k, el.dataset);
ACT_HOLD.recdelh = el => recRemove(el.dataset.s, el.dataset.k, el.dataset);
function recAct(a, el) {
  switch (a) {
    case 'recs': REC.s = el.dataset.v; REC.n = 60; buzz('tick'); render(); return true;
    case 'recmore': REC.n += 60; buzz('tick'); render(); return true;
    case 'recedit': openPop({ kind: 'recedit', s: el.dataset.s, k: el.dataset.k }); return true;
    case 'recadd': openPop({ kind: 'recedit', s: el.dataset.s, k: shift(todayKey(), -1), add: true }); return true;
    case 'recstep': { const i = $('#rec_v'), R = RECS[pop.s]; if (!i) return true; const v = (num(i.value, -1e9, 1e9) ?? num(i.placeholder, -1e9, 1e9) ?? R.lim[0]) + +el.dataset.d * R.step; i.value = s2(clamp(v, ...R.lim), R.step); buzz('tick'); return true; }
    case 'recsave': recSave(); return true;
    case 'recauto': { const s = pop.s, k = pop.k; setManual(s, k, null); save(); buzz('ok'); closePop(); toast('The watch fills this day again on the next sync'); if (NATIVE) syncNow(); return true; }
    case 'recsavewx': {
      const k = el.dataset.k, was = S.wx[k] ? { ...S.wx[k] } : null, x = { ...(S.wx[k] || {}) };
      for (const [f] of WXF) { const raw = $(`#wx_${f}`)?.value; if (raw === '' || raw == null) delete x[f]; else { const v = num(raw, ...WX[f]); if (v == null) { buzz('warn'); return toast(`${WXF.find(w => w[0] === f)[1]}: out of range`), true; } x[f] = v; } }
      const c = cleanWx(x);
      if (c) S.wx[k] = c; else delete S.wx[k];
      save(); buzz('ok'); closePop();
      toast('Saved', 4000, { label: 'Undo', fn: () => { if (was) S.wx[k] = was; else delete S.wx[k]; save(); render(); } });
      return true;
    }
    case 'recday': day = el.dataset.k; location.hash = 'today'; return true;
    case 'dayx': openPop({ kind: 'dayx', k: el.dataset.k }); return true;
  }
  return false;
}
function s2(v, step) { return step >= 1 ? String(Math.round(v)) : String(Math.round(v / step) * step).replace(/(\.\d)\d+$/, '$1'); }

// ---------- a day in detail ----------
// The 24 hours of watch heart rate in 5-minute steps, gaps left as gaps; the sleep that ended that morning and the
// one that began that evening shaded; workouts and lifting marked; the resting value as a line.
function dayCurve(k) {
  const h = S.hrd[k];
  if (!h || h.filter(Boolean).length < 12) return '';
  const W = 300, H = 110, ok = h.filter(Boolean), lo = Math.min(...ok) - 4, hi = Math.max(...ok) + 4;
  const X = m => m / 1440 * W, Y = v => H - 14 - (v - lo) / (hi - lo) * (H - 22);
  let d = '', pen = false;
  h.forEach((v, i) => { if (!v) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i * 5 + 2.5).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
  const shade = [], sx = S.sleepx[k], nx = S.sleepx[shift(k, 1)];
  if (sx && sx.off != null) shade.push([Math.max(0, sx.on ?? 0), sx.off]);
  if (nx && nx.on != null && nx.on < 0) shade.push([1440 + nx.on, 1440]);
  const marks = [...(S.ex[k] || []).map(e => [new Date(e.s), (e.e - e.s) / 6e4, e.og || STRENGTH.test(e.k) ? 'lift' : 'move']), ...(S.cardio[k] || []).filter(c => c.t && !c.m).map(c => [new Date(c.t), c.dur / 60, 'move'])]
    .map(([t, m, c]) => { const a = t.getHours() * 60 + t.getMinutes(); return `<rect class="wk ${c}" x="${X(a).toFixed(1)}" y="${H - 10}" width="${Math.max(2, X(m)).toFixed(1)}" height="6" rx="2"/>`; }).join('');
  const r = restingHR(k)?.v, rl = r && r > lo && r < hi ? `<line class="rest" x1="0" x2="${W}" y1="${Y(r).toFixed(1)}" y2="${Y(r).toFixed(1)}"/>` : '';
  const ticks = [0, 6, 12, 18, 24].map(t => `<text x="${X(t * 60).toFixed(1)}" y="${H + 2}" text-anchor="${t === 0 ? 'start' : t === 24 ? 'end' : 'middle'}">${String(t % 24).padStart(2, '0')}:00</text>`).join('');
  const hiT = h.indexOf(Math.max(...h)), loT = h.indexOf(Math.min(...ok));
  return `<svg class="daycurve" viewBox="0 0 ${W} ${H + 6}" preserveAspectRatio="none" role="img" aria-label="Heart rate through the day">${shade.map(([a, b]) => `<rect class="sl" x="${X(a).toFixed(1)}" y="0" width="${(X(b) - X(a)).toFixed(1)}" height="${H - 12}"/>`).join('')}${rl}<path d="${d}"/>${marks}${ticks}</svg>
    <p class="key"><i class="k tl"></i>heart rate, 5-min steps<i class="k slp"></i>asleep${rl ? '<i class="k zl"></i>resting' : ''}${marks ? '<i class="k wkk"></i>workout' : ''}</p>
    ${para(`Lowest ${Math.min(...ok)} bpm at ${hm(loT * 5)}, highest ${Math.max(...h)} at ${hm(hiT * 5)}. ${ok.length * 5 >= 1200 ? 'Worn all day.' : `Readings across about ${dur(ok.length * 5)}.`}`)}`;
}
// The night, stage by stage: awake on top, then REM, light and deep, the way sleep labs draw it.
const STAGE = { 1: ['Awake', 0], 4: ['REM', 1], 2: ['Light', 2], 3: ['Deep', 3] };
function hypnogram(sx) {
  if (!sx?.seg?.length) return '';
  const end = Math.max(...sx.seg.map(([o, l]) => o + l)), W = 300, H = 96, row = H / 4, X = m => m / end * W;
  const bars = sx.seg.map(([o, l, c]) => `<rect class="st st${c}" x="${X(o).toFixed(2)}" y="${(STAGE[c][1] * row + 3).toFixed(1)}" width="${Math.max(0.6, X(l)).toFixed(2)}" height="${(row - 6).toFixed(1)}" rx="1.5"/>`).join('');
  let d = '';
  sx.seg.forEach(([o, l, c], i) => { const y = (STAGE[c][1] + 0.5) * row; d += `${i ? 'L' : 'M'}${X(o).toFixed(2)},${y.toFixed(1)}L${X(o + l).toFixed(2)},${y.toFixed(1)}`; });
  const on = sx.on != null ? sx.on : null, lab = on != null ? [hm(on), hm(on + end / 2), hm(on + end)] : ['start', '', 'end'];
  const cyc = sx.seg.filter(([, l, c]) => c === 4 && l >= 5).length, firstDeep = sx.seg.find(x => x[2] === 3), firstRem = sx.seg.find(x => x[2] === 4);
  const awak = sx.seg.filter(([o, l, c]) => c === 1 && o > 0 && o + l < end).length;
  return `<div class="hypno"><div class="hl">${Object.values(STAGE).sort((a, b) => a[1] - b[1]).map(([n]) => `<span>${n}</span>`).join('')}</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Sleep stages through the night">${bars}<path d="${d}"/></svg></div>
    <p class="key hx"><span>${lab[0]}</span><span>${lab[1]}</span><span>${lab[2]}</span></p>
    ${para(`${cyc ? `${plural(cyc, 'REM period')}, roughly one per 90-minute cycle. ` : ''}${firstDeep ? `First deep sleep ${firstDeep[0]} min after falling asleep${firstRem ? `, first REM at ${firstRem[0]} min` : ''}. ` : ''}${awak ? `${plural(awak, 'waking')} in the night.` : ''} Deep sleep comes mostly early, REM mostly late. Watch staging agrees with a sleep lab only moderately, so read the shape, not the minutes. ${why('stages', 'Why')}`)}`;
}
// One row: the day's value, your usual (the mean ± one SD of the 28 days before), and the word for where it sits.
function dayRow(label, v, hist, f, unit, good = 0) {
  if (v == null) return '';
  const V = versus(v, hist), cls = !V.word || V.word === 'usual' ? '' : good === 0 ? 'note' : (good > 0) === V.z > 0 ? 'good' : 'bad';
  return `<tr><td>${label}${V.word ? `<i>usual ${f(V.m - V.s)}–${f(V.m + V.s)}${unit}${V.rec ? ` · ${V.rec} in ${V.n} days` : ''}</i>` : `<i>${V.n} days so far: a usual needs 7</i>`}</td><td>${f(v)}${unit}${V.word ? ` <span class="vw ${cls}">${V.word}</span>` : ''}</td></tr>`;
}
function vDayDetail(p) {
  const k = p.k, prev = range(28, shift(k, -1)), sx = S.sleepx[k], x = S.wx[k] || {};
  const hist = f => prev.map(f).filter(v => v != null && Number.isFinite(v));
  const rows = [
    dayRow('Sleep', S.sleep[k], hist(d => S.sleep[d]), v => r1(v), ' h', 1),
    dayRow('Asleep while in bed', sx && (sx.bed || sx.w) ? (sx.d + sx.l + sx.r) / (sx.bed || sx.d + sx.l + sx.r + sx.w) * 100 : null, hist(d => { const y = S.sleepx[d]; return y && (y.bed || y.w) ? (y.d + y.l + y.r) / (y.bed || y.d + y.l + y.r + y.w) * 100 : null; }), v => Math.round(v), '%', 1),
    dayRow('Deep sleep', sx && sx.d + sx.r > 0 ? sx.d : null, hist(d => S.sleepx[d]?.d || null), v => Math.round(v), ' min', 0),
    dayRow('REM sleep', sx && sx.d + sx.r > 0 ? sx.r : null, hist(d => S.sleepx[d]?.r || null), v => Math.round(v), ' min', 0),
    dayRow('Sleeping heart rate', sx?.hr, hist(d => S.sleepx[d]?.hr), v => Math.round(v), ' bpm', -1),
    dayRow('Lowest in sleep', sx?.lo, hist(d => S.sleepx[d]?.lo), v => Math.round(v), ' bpm', -1),
    dayRow('Resting heart rate', restingHR(k)?.v, hist(d => restingHR(d)?.v), v => Math.round(v), ' bpm', -1),
    dayRow('Overnight HRV', x.hv, hist(d => S.wx[d]?.hv), v => Math.round(v), ' ms', 1),
    dayRow('Breathing in sleep', x.br, hist(d => S.wx[d]?.br), v => r1(v), '/min', -1),
    dayRow('Blood oxygen', x.o2, hist(d => S.wx[d]?.o2), v => r1(v), '%', 0),
    dayRow('Morning HRV (strap)', S.hrv[k]?.rmssd, hist(d => S.hrv[d]?.rmssd), v => Math.round(v), ' ms', 1),
    dayRow('Steps', S.steps[k], hist(d => S.steps[d]), v => fmt(v), '', 1),
  ].join('');
  const nav = d => { const to = shift(k, d); return to > todayKey() ? '<span></span>' : `<button class="mini" data-act="dayx" data-k="${to}">${d < 0 ? '‹ ' : ''}${dateLabel(to, { weekday: 'short', day: 'numeric' })}${d > 0 ? ' ›' : ''}</button>`; };
  const curve = dayCurve(k), hyp = hypnogram(sx);
  return `${sheetTop('A day in detail', dateLabel(k, { weekday: 'long', day: 'numeric', month: 'long' }), `dayx-${k}`)}
    <div class="rowb spread">${nav(-1)}${nav(1)}</div>
    ${curve ? `<h3>Heart rate, 24 hours</h3>${curve}` : ''}
    ${hyp ? `<h3>Last night${sx.on != null ? `, ${hm(sx.on)} to ${hm(sx.off ?? sx.on + (sx.bed || sx.d + sx.l + sx.r + sx.w))}` : ''}</h3>${hyp}` : sx ? `<h3>Last night</h3>${stageBar(sx)}` : ''}
    ${rows ? `<h3>Against your previous four weeks</h3><table class="dayt">${rows}</table>${para('Usual is your own average ± one standard deviation over the 28 days before. Beyond it is <i>high</i> or <i>low</i> for you; beyond two is <i>very</i>. Green and red only where the direction has a known meaning.')}` : para('Nothing from the watch for this day.')}
    ${!curve && !hyp && NATIVE ? para('The 24-hour curve and the stage-by-stage night arrive with the next sync from Health Connect.') : ''}</aside>`;
}
// Without the stage-by-stage night: its proportions.
function stageBar(sx) {
  const t = sx.d + sx.l + sx.r + sx.w;
  if (!t) return '';
  return `<div class="zbar">${[['st1', sx.w], ['st2', sx.l], ['st3', sx.d], ['st4', sx.r]].map(([c, v]) => v ? `<i class="${c}" style="flex:${v}"></i>` : '').join('')}</div>
    <p class="key"><i class="k st1"></i>awake ${dur(sx.w)}<i class="k st2"></i>light ${dur(sx.l)}<i class="k st3"></i>deep ${dur(sx.d)}<i class="k st4"></i>REM ${dur(sx.r)}</p>`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-records.js');

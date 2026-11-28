'use strict';
// The strap's own place (#strap): everything the Polar H9 does, in one page.
//  - Live: the strap now (connection, battery, contact, signal, the beat as it arrives), who is wearing it, and every
//    kind of session, started from here and run here or in the Lab;
//  - Sessions: every recording ever made, of every kind and every person, each opening its own page;
//  - People: who else wears the strap, each with readings read only against their own.
// A session's page (#rec-<id>) is the recording in full: the beat explorer (beats.js), every measure for the whole
// and for whatever is on screen, minute by minute, through time, the signal behind it, edits that never change what
// was recorded, and files to share.

const STU = { part: 'live', run: null, fWho: 'all', fKind: 'all', panel: 'measures', markAt: 0, open: {} };
const STU_PARTS = [['live', 'Live'], ['sessions', 'Sessions'], ['trends', 'Trends'], ['cal', 'Calibrate'], ['people', 'People']];
const REST_KINDS = ['morning', 'spot', 'live', 'breathe', 'rf', 'ortho', 'raw'];
// What each session is for, in a line, and where it runs.
const STARTS = [
  ['morning', 'Morning check', 'On waking, lying still: the reading your recovery is built on', 'run', 'heart'],
  ['spot', 'Spot check', 'Every measure at any time, in any position', '#lab-spot', 'pulse'],
  ['live', 'Live', 'Open-ended, marked as you go, every measure moving', '#lab-live', 'insight'],
  ['workout', 'Cardio', 'Zones, α1 every 30 s, your aerobic threshold, recovery after', 'run', 'move'],
  ['breathe', 'Breathe', 'Paced slow breathing with your heart following it', '#lab-breathe', 'breathe'],
  ['ortho', 'Stand-up test', 'Lying, then standing: the rise, the 30:15 ratio', '#lab-ortho', 'stand'],
  ['rf', 'Resonance finder', 'Five breathing rates: the one your heart follows most', '#lab-rf', 'wave'],
];

// ---------- small pieces ----------
function whoChip(who) { return who === 'me' ? '' : `<span class="who">${esc(personName(who))}</span>`; }
function qBadge(q) { return q == null ? '' : `<span class="qb ${q >= 95 ? 'good' : q >= 85 ? 'mid' : 'bad'}">${q}% clean</span>`; }
// A short line of heart rate through a recording, for lists.
function recSpark(r) {
  const R = recRead(r);
  let pts = [];
  if (R?.X) { const X = R.X, step = Math.max(1, Math.floor(X.n / 80)); for (let i = 0; i < X.n; i += step) if (X.inc[i]) pts.push([X.T[i], 60000 / X.rr[i]]); }
  else if (r.tr) pts = r.tr.map((v, i) => [i * 5, v]).filter(p => p[1]);
  if (pts.length < 3) return '';
  const t1 = pts[pts.length - 1][0] || 1, vs = pts.map(p => p[1]), lo = Math.min(...vs), hi = Math.max(...vs);
  const d = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${(t / t1 * 100).toFixed(1)},${(22 - (v - lo) / (hi - lo || 1) * 20).toFixed(1)}`).join('');
  return `<svg class="rspark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
}
function recLine(r) {
  const R = recRead(r), A = R?.A;
  const head = r.kind === 'cardio' || r.kind === 'hrr' ? (A ? `${Math.round(A.hr)} avg · ${Math.round(A.maxHr)} max bpm` : r.x?.avg ? `${r.x.avg} avg · ${r.x.max} max bpm` : '') : A ? `${r1(A.rmssd)} ms · ${Math.round(A.hr)} bpm` : '';
  return [head, clock(R?.dur || 0), r.pos ? REC_POS[r.pos].toLowerCase() : ''].filter(Boolean).join(' · ');
}
function recRow(r, mine) {
  const K = REC_KINDS[r.kind], A = recRead(r)?.A;
  return `<li data-swipe="recdel" data-id="${r.id}"><a class="rowbtn recrow" href="#rec-${r.id}"><span class="ri" style="--c:${r.kind === 'cardio' ? 'var(--move)' : r.kind === 'breathe' || r.kind === 'rf' ? 'var(--pro)' : r.kind === 'ortho' ? 'var(--sleep)' : 'var(--heart)'}">${ic(K[1] === 'run' ? 'move' : K[1] === 'trend' ? 'insight' : K[1] === 'breath' ? 'breathe' : K[1] === 'down' ? 'pulse' : K[1])}</span>
    <span class="grow"><span class="nm">${esc(recTitle(r))} ${mine ? '' : whoChip(r.who)}${r.inc ? '<span class="tagx">incomplete</span>' : ''}${r.rcv ? '<span class="tagx">recovered</span>' : ''}${recEdited(r) ? '<span class="tagx ed">edited</span>' : ''}</span>
    <span class="sub num">${hms(new Date(r.t0)).slice(0, 5)} · ${recLine(r)}</span></span>${recSpark(r)}${A ? qBadge(A.q) : ''}<span class="chev">›</span></a></li>`;
}
function dayGroups(list, max = 400, mine = false) {
  const by = new Map();
  for (const r of list.slice(0, max)) { const k = dk(new Date(r.t0)); (by.get(k) || by.set(k, []).get(k)).push(r); }
  return [...by.entries()].map(([k, rs]) => `<h3 class="dayh">${dateLabel(k, { weekday: 'long', day: 'numeric', month: 'long' })}${k === todayKey() ? ' · today' : ''}</h3><ul class="list swipelist recs">${rs.map(r => recRow(r, mine)).join('')}</ul>`).join('');
}

// ---------- the studio ----------
function stuDevice() {
  const on = HR.conn === 'on', L = on ? liveMetrics() : null, since = HR.last ? (Date.now() - HR.last) / 1000 : null;
  const state = on ? (HR.bpm == null ? 'Connected · waiting for a beat' : 'Connected') : HR.conn === 'connecting' ? 'Connecting…' : !strapSupported() ? 'No Bluetooth here' : S.meta.h9 ? 'Not connected' : 'No strap yet';
  const facts = on ? [HR.battery != null ? `<span class="dv"><i class="batt" style="--b:${HR.battery}%"></i>${HR.battery}%</span>` : '',
    HR.contact === false ? '<span class="dv bad">No skin contact</span>' : HR.contact ? '<span class="dv good">Skin contact</span>' : '',
    L ? `<span class="dv ${L.q >= 95 ? 'good' : L.q >= 85 ? '' : 'bad'}">Signal ${L.q}%</span>` : '',
    `<span class="dv" id="stulag">${since != null && since < 600 ? `last beat ${r1(since)} s ago` : ''}</span>`].join('') : '';
  const btn = on ? '<button class="ghost small" data-act="hrdisconnect">Disconnect</button>' : HR.conn === 'connecting' ? '<button class="ghost small" data-act="hrdisconnect">Cancel</button>'
    : !strapSupported() ? '' : `<button class="solid small" data-act="hrconnect">${S.meta.h9 && NATIVE ? `Connect ${esc(S.meta.h9.name)}` : 'Connect'}</button>`;
  return `<section class="card device st-${on ? 'on' : HR.conn}"><div class="dvtop"><span class="dvdot" aria-hidden="true"></span>
    <span class="grow"><b>${esc(on ? HR.name || 'Strap' : S.meta.h9?.name || 'Polar H9')}</b><span class="sub">${state}</span></span>${btn}</div>
    ${facts ? `<div class="dvfacts">${facts}</div>` : ''}${!on && strapSupported() ? `<p class="sub small">Wet the electrodes and put the strap on: it only wakes on skin. Close Polar Beat or Zepp if either holds it.</p>` : ''}
    ${!strapSupported() && !on ? '<p class="sub small">Use the Android app, or Chrome on Android, to connect. Everything recorded is here to read either way.</p>' : ''}</section>`;
}
// Who is wearing it: you, or someone whose readings stay theirs.
function stuWearer() {
  const busy = !!HR.mode;
  const chips = [['me', 'You'], ...people().map(p => [p.id, p.n])].map(([id, n]) => `<button class="${WEAR.who === id ? 'on' : ''}" data-act="stuwear" data-v="${id}" ${busy ? 'disabled' : ''}>${esc(n)}</button>`).join('');
  return `<div class="wearer"><span class="eyebrow">Wearing it</span><div class="chips tight wrap">${chips}<button class="addp" data-act="stupnew" ${busy ? 'disabled' : ''}>+ Person</button></div>
    ${WEAR.who !== 'me' ? `<p class="callout lite2 wearnote"><span><b>Recording for ${esc(personName(WEAR.who))}.</b> Kept apart from your data: not in your recovery, baselines, calibration or training load. Back to you when the strap disconnects.</span></p>` : ''}</div>`;
}
function stuLive() {
  const run = HR.mode, res = HR.result;
  // Which runner is on: a session running here, or the one you chose, with its result until you are done with it.
  const which = run === 'morning' ? 'morning' : run === 'workout' || run === 'hrr' ? 'workout' : run ? 'lab' : STU.run;
  let body = '';
  const other = run ? '' : '<div class="rowb"><button class="ghost" data-act="sturun" data-v="">Another kind of session</button></div>';
  if (which === 'morning') body = sec('Morning check', strapBlock('morning') + strapMsg() + other, { why: ['hrv', 'Why mornings'] });
  else if (which === 'workout') body = sec('Cardio', strapBlock('workout') + strapMsg() + other, { why: ['dfa', 'α1'] });
  else if (which === 'lab') body = `<section class="card"><div class="strap st-live">${liveHead()}<p class="sub center">${LABS[run]?.n || 'A session'} is running. <a class="link" href="#lab-${run}">Go to it ›</a></p></div></section>`;
  else if (HR.conn === 'on' && HR.bpm != null) body = `<section class="card livemon"><div class="strap st-live">${liveHead(true)}</div><div id="stulive">${stuLiveGrid()}</div></section>`;
  const tiles = STARTS.map(([k, n, d, to, icn]) => {
    const href = to === 'run' ? '' : to, need = k !== 'breathe' && HR.conn !== 'on';
    const attr = to === 'run' ? `data-act="sturun" data-v="${k}"` : `href="${href}"`;
    return `<${to === 'run' ? 'button' : 'a'} class="stile ${need ? 'needs' : ''}" ${attr}><span class="qi">${ic(icn)}</span><span class="grow"><b>${n}</b><span class="sub">${d}</span></span><span class="chev">›</span></${to === 'run' ? 'button' : 'a'}>`;
  }).join('');
  const recent = recList().slice(0, 4);
  return `${body}${run || which ? '' : `<h3 class="sech">Start a session</h3><div class="stiles">${tiles}</div>`}
    ${recent.length ? `<div class="secttl"><h3>Recent</h3><a href="#strap-sessions" data-act="stupart" data-v="sessions">All ${recList().length} ›</a></div><ul class="list recs">${recent.map(recRow).join('')}</ul>` : ''}`;
}
// Every measure over the last minute, refreshed in place once a second while the strap is on.
function stuLiveGrid() {
  const L = HR.live || liveMetrics(), cell = (v, l) => `<div><b class="num">${v ?? DASH}</b><span class="sub">${l}</span></div>`;
  return `<div class="stats four lv">${cell(HR.ibpm ? Math.round(HR.ibpm) : null, 'this beat, bpm')}${cell(L?.rmssd != null ? Math.round(L.rmssd) : null, 'RMSSD, 1 min')}${cell(L?.sd != null ? Math.round(L.sd) : null, 'SDNN, 1 min')}${cell(L?.br != null ? r1(L.br) : null, 'breaths/min')}</div>
    <p class="sub small center">From the last minute of beats, corrected as every recording is. Nothing here is saved until you start a session.</p>`;
}
function stuSessions() {
  const all = recList(), who = STU.fWho, kind = STU.fKind;
  const list = all.filter(r => (who === 'all' || r.who === who) && (kind === 'all' || r.kind === kind));
  const whoChips = [['all', 'Everyone'], ['me', 'You'], ...people().map(p => [p.id, p.n])].map(([v, n]) => `<button class="${who === v ? 'on' : ''}" data-act="stufwho" data-v="${v}">${esc(n)}</button>`).join('');
  const kinds = [...new Set(all.map(r => r.kind))];
  const kindChips = kinds.length > 1 ? [['all', 'All kinds'], ...kinds.map(k => [k, REC_KINDS[k][0]])].map(([v, n]) => `<button class="${kind === v ? 'on' : ''}" data-act="stufkind" data-v="${v}">${n}</button>`).join('') : '';
  const store = RSTORE.mode === 'idb' ? '' : RSTORE.mode === 'ls' ? '<p class="flag small">This browser has no IndexedDB, so recordings are kept in its smaller storage. Export them now and then.</p>' : '<p class="flag">Storage is blocked here: recordings last only until the page closes. Export anything you want to keep.</p>';
  return `${store}<div class="chips tight wrap">${whoChips}</div>${kindChips ? `<div class="chips tight wrap">${kindChips}</div>` : ''}
    ${list.length ? `<p class="sub small">${plural(list.length, 'recording')}${list.length > 400 ? ', the newest 400 shown' : ''}. Swipe one left to delete it.</p>${dayGroups(list)}` : `<p class="sub">${all.length ? 'Nothing matches.' : 'No recordings yet. Every session with the strap is kept here, beat by beat.'}</p>`}
    <div class="rowb"><button class="ghost" data-act="stuimp">Open a strap file</button>${list.length ? `<button class="ghost" data-act="stuexpall">Export ${list.length === all.length ? 'all' : 'these'}</button>` : ''}<input type="file" id="stuimpf" accept="application/json,.json" hidden></div>
    ${RSTORE.ready ? '' : '<p class="sub small">Opening the recordings…</p>'}`;
}
function stuPeople() {
  const rows = [['me', 'You'], ...people().map(p => [p.id, p.n])].map(([id, n]) => {
    const rs = recList({ who: id }), last = rs[0], P = personOf(id), age = personAge(id);
    return `<li><a class="rowbtn" href="#person-${id}"><span class="avatar sm">${esc(n.slice(0, 1).toUpperCase())}</span><span class="grow"><span class="nm">${esc(n)}</span>
      <span class="sub">${[P?.sex === 'f' ? 'female' : P?.sex === 'm' ? 'male' : '', age ? `${age} y` : '', plural(rs.length, 'recording'), last ? `last ${dateLabel(dk(new Date(last.t0)))}` : ''].filter(Boolean).join(' · ')}</span></span><span class="chev">›</span></a></li>`;
  }).join('');
  return `<ul class="list">${rows}</ul><div class="rowb"><button class="solid" data-act="stupnew">Add a person</button></div>
    ${para('Someone else can wear your strap without touching your data: choose them under Wearing it before a session. Their readings are kept here, read only against their own earlier ones, and can be exported as a file for them or their clinician. Age and sex are used only for their maximum heart rate (Tanaka 2001) and are optional.')}`;
}
function vStrap(part) {
  if (part && STU_PARTS.some(p => p[0] === part)) STU.part = part;
  const back = `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>`;
  const body = STU.part === 'sessions' ? part2(stuSessions) : STU.part === 'people' ? part2(stuPeople) : STU.part === 'trends' ? part2(stuTrends) : STU.part === 'cal' ? part2(stuCal) : `${part2(calNudge)}${part2(stuWearer)}${part2(stuLive)}`;
  return `${masthead('Strap', HR.conn === 'on' ? `${esc(HR.name || 'Strap')} · ${HR.bpm ?? DASH} bpm` : 'Polar H9 · every session, beat by beat', { before: back, after: why('metrics', 'The measures') })}
    ${part2(stuDevice)}${seg('stupart', STU_PARTS, STU.part, 'subnav2')}<div class="stu stu-${STU.part}">${body}</div>`;
}
function part2(fn, ...a) { return part(fn, ...a); }

// ---------- a person ----------
function vPerson(id) {
  const back = `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>`;
  if (id !== 'me' && !personOf(id)) return `${masthead('Not found', '', { before: back })}${para('This person was removed.')}`;
  const P = personOf(id), rs = recList({ who: id }), age = personAge(id);
  const rest = rs.filter(r => (r.kind === 'morning' || r.kind === 'spot') && !r.inc).map(r => ({ r, A: recRead(r).A })).filter(x => x.A).reverse();
  let trend = '';
  if (rest.length >= 2) {
    const W = 300, H = 110, t0 = rest[0].r.t0, t1 = rest[rest.length - 1].r.t0 || t0 + 1, vals = rest.map(x => x.A.ln);
    const lo = Math.min(...vals) - 0.15, hi = Math.max(...vals) + 0.15, X = t => 8 + (t - t0) / (t1 - t0 || 1) * (W - 16), Y = v => H - 8 - (v - lo) / (hi - lo) * (H - 16);
    const base = vals.length >= 5 ? ownRef(vals[vals.length - 1], vals.slice(0, -1).slice(-30)) : null;
    trend = `<svg class="ptrend" viewBox="0 0 ${W} ${H}" role="img" aria-label="ln RMSSD of each resting reading">${base?.lo != null ? `<rect class="band" x="0" width="${W}" y="${Y(base.hi).toFixed(1)}" height="${Math.max(1, Y(base.lo) - Y(base.hi)).toFixed(1)}"/>` : ''}
      ${rest.map(x => `<a href="#rec-${x.r.id}"><circle class="${x.r.kind}" cx="${X(x.r.t0).toFixed(1)}" cy="${Y(x.A.ln).toFixed(1)}" r="4"/></a>`).join('')}</svg>
      <p class="key"><span class="kk"><i class="k dot"></i>morning check</span><span class="kk"><i class="k dot hollow"></i>spot check</span>${base?.lo != null ? '<span class="kk"><i class="k band"></i>usual ± smallest worthwhile change</span>' : ''}</p>
      ${para(base?.lo != null ? `Latest RMSSD ${r1(rest[rest.length - 1].A.rmssd)} ms is <b>${base.word}</b> the usual band (${r1(Math.exp(base.lo))}–${r1(Math.exp(base.hi))} ms, from ${base.n} earlier readings). Only changes beyond that band are worth reading as real (Plews 2012).` : `${plural(rest.length, 'resting reading')}; a usual band appears from the sixth.`)}`;
  }
  const name = personName(id);
  return `${masthead(name, [P?.sex === 'f' ? 'Female' : P?.sex === 'm' ? 'Male' : '', age ? `${age} years` : '', hrMaxOf(id) ? `max ${hrMaxOf(id)} bpm${id === 'me' ? '' : ' (from age)'}` : ''].filter(Boolean).join(' · ') || 'Strap readings', { before: back, after: id === 'me' ? '' : `<button class="ghost small" data-act="stupedit" data-v="${id}">Edit</button>` })}
    ${P?.note ? para(esc(P.note)) : ''}
    ${trend ? sec('Resting readings', trend, { why: ['hrv', 'How to read them'] }) : ''}
    ${sec(`Recordings · ${rs.length}`, rs.length ? dayGroups(rs, 400, true) : para(`None yet. Choose ${id === 'me' ? 'You' : esc(name)} under Wearing it on the Strap page before a session.`))}
    <div class="rowb">${rs.length ? `<button class="ghost" data-act="stuexpwho" data-v="${id}">Export ${id === 'me' ? 'your' : 'their'} recordings</button>` : ''}<span class="grow"></span>${id !== 'me' ? `<button class="danger" data-hold="stupdel" data-v="${id}">Hold to remove</button>` : ''}</div>`;
}
function vPersonEdit(p) {
  const P = p.id ? personOf(p.id) : null, y = new Date().getFullYear();
  return `${sheetTop(P ? 'Edit' : 'Someone else on the strap', P ? esc(P.n) : 'Add a person', `pedit-${p.id || 'new'}`)}
    <label class="line"><span class="sub">Name</span><input class="field tf" id="pe_n" maxlength="30" value="${esc(P?.n || '')}" placeholder="Their name" autocomplete="off"></label>
    <div class="opts"><span class="sub">Sex</span>${seg('pesex', [['', 'Not said'], ['f', 'Female'], ['m', 'Male']], PE.sex ?? P?.sex ?? '', 'tight')}</div>
    <label class="line"><span class="sub">Year of birth</span><input class="field tf num" id="pe_by" type="number" inputmode="numeric" min="1900" max="${y}" value="${P?.by || ''}" placeholder="optional"></label>
    <label class="line"><span class="sub">Note</span><input class="field tf" id="pe_note" maxlength="300" value="${esc(P?.note || '')}" placeholder="optional"></label>
    <div class="rowb"><span class="grow"></span><button class="solid" data-act="stupsave" data-v="${p.id || ''}">${P ? 'Save' : 'Add'}</button></div></aside>`;
}
const PE = { sex: null };

// ---------- a session ----------
function recFacts(r, R) {
  const A = R.A, out = [];
  if (A && (r.kind === 'cardio' || r.kind === 'hrr')) { const max = hrMaxOf(r.who), L = max && R.X ? hrLoad(R.X, max) : null; out.push([Math.round(A.hr), 'mean bpm'], [Math.round(A.maxHr), 'highest bpm'], [clock(R.dur), 'long'], [L ? Math.round(L.trimp) : DASH, 'TRIMP'], [`${A.q}%`, 'as recorded']); }
  else if (A) out.push([r1(A.rmssd), 'RMSSD ms'], [r1(A.hr), 'mean bpm'], [r1(A.sdnn), 'SDNN ms'], [clock(A.dur), 'analysed'], [`${A.q}%`, 'as recorded']);
  else if (r.x?.avg) out.push([r.x.avg, 'avg bpm'], [r.x.max, 'max bpm'], [clock(R.dur), 'long']);
  return out.length ? stats(out, 'facts') : '';
}
// The reading against the same person's own earlier ones, in one line and a strip of dots.
function recOwn(r, R) {
  if (!R.A || !['morning', 'spot'].includes(r.kind)) return '';
  const peers = recPeers(r).map(x => recRead(x).A).filter(Boolean), v = R.A.ln, O = ownRef(v, peers.map(a => a.ln));
  const who = r.who === 'me' ? 'your' : `${esc(personName(r.who))}'s`;
  if (O.m == null) return para(`${plural(O.n, 'earlier reading')} of this kind${r.pos ? `, ${REC_POS[r.pos].toLowerCase()}` : ''}. From the sixth, each is read against ${who} own usual.`, 'sub small');
  const all = peers.map(a => a.ln).concat([v]), lo = Math.min(...all, O.lo) - 0.1, hi = Math.max(...all, O.hi) + 0.1, X = x => ((x - lo) / (hi - lo) * 100).toFixed(1);
  return `<div class="ownstrip" role="img" aria-label="This reading among the earlier ones"><i class="band" style="left:${X(O.lo)}%;right:${(100 - X(O.hi))}%"></i>${peers.map(a => `<i class="pd" style="left:${X(a.ln)}%"></i>`).join('')}<i class="me ${O.word}" style="left:${X(v)}%"></i></div>
    <p class="sub small">RMSSD <b>${O.word}</b> ${who} usual band of ${r1(Math.exp(O.lo))}–${r1(Math.exp(O.hi))} ms (mean ± the smallest worthwhile change, half an SD of ln RMSSD, from ${O.n} earlier ${REC_KINDS[r.kind][0].toLowerCase()}s${r.pos ? ` ${REC_POS[r.pos].toLowerCase()}` : ''}). Day-to-day variation of ${r1(O.cv)}% on the log scale. ${why('hrv', 'Why this band')}</p>`;
}
// Each measure, for the whole recording and for what is on screen, with what it means and when it can be trusted.
const MEASURES = [
  ['hr', 'Heart rate', 'bpm', 1, 'mean over the beats analysed'],
  ['rmssd', 'RMSSD', 'ms', 1, 'beat-to-beat (vagal) variability; the measure HRV-guided training uses. Good from 1 minute at rest'],
  ['ln', 'ln RMSSD', '', 2, 'the log scale days and people are compared on'],
  ['sdnn', 'SDNN', 'ms', 1, 'all variability; grows with length, so compare equal lengths only'],
  ['pnn50', 'pNN50', '%', 1, 'successive beats more than 50 ms apart'],
  ['pnn20', 'pNN20', '%', 1, 'the same at 20 ms: more sensitive when variability is low'],
  ['sd1', 'SD1', 'ms', 1, 'Poincaré width: the same information as RMSSD (SD1 = RMSSD/√2)'],
  ['sd2', 'SD2', 'ms', 1, 'Poincaré length: slower swings'],
  ['ratio', 'SD1/SD2', '', 2, 'shape of the cloud; falls with effort'],
  ['cv', 'CV of RR', '%', 1, 'SDNN as a share of the mean interval'],
  ['minHr', 'Lowest beat', 'bpm', 0, ''], ['maxHr', 'Highest beat', 'bpm', 0, ''],
  ['hf', 'HF power', 'ms²', 0, '0.15–0.4 Hz, breathing-linked and vagal; needs 1 minute'],
  ['lf', 'LF power', 'ms²', 0, '0.04–0.15 Hz, mixed origin; needs 2 minutes'],
  ['vlf', 'VLF power', 'ms²', 0, 'under 0.04 Hz; only from 5 minutes, and its physiology is unsettled'],
  ['lfhf', 'LF/HF', '', 2, 'not a sympathovagal balance (Billman 2013); moves with breathing rate'],
  ['lfnu', 'LF, normalised', 'nu', 1, 'LF over LF + HF'],
  ['br', 'Breathing', '/min', 1, 'the strongest rhythm in the beats (Schäfer & Kratky 2008); slow breathing under 9 moves it into LF'],
  ['a1', 'DFA α1', '', 2, 'short-term correlation of the beats; about 1 at rest, falls through 0.75 at the aerobic threshold during exercise (Rogers 2021). From 100 beats'],
  ['a2', 'DFA α2', '', 2, 'longer-range correlation, 16–64 beats; from 300 beats'],
  ['tri', 'Triangular index', '', 1, 'beats over the tallest histogram bin; its standard needs 20 minutes'],
];
function fmtM(v, d) { return v == null || !Number.isFinite(v) ? DASH : d === 0 ? fmt(v) : d === 2 ? v.toFixed(2) : r1(v); }
function recMeasures(r, R) {
  const A = R.A, D = BX.D;
  if (!A || !D) return para('Not enough clean beats to measure.');
  const [a, b] = bxIdx(D.T, BX.v0, BX.v1), whole = BX.v1 - BX.v0 >= D.dur - 0.5, W = whole ? A : analyse(D.X, a, b);
  const peers = recPeers(r).map(x => recRead(x).A).filter(Boolean), rest = REST_KINDS.includes(r.kind) && r.kind !== 'live';
  const rows = MEASURES.map(([k, n, u, d, mean]) => {
    if (A[k] == null && W?.[k] == null) return '';
    const pv = peers.map(p => p[k]).filter(Number.isFinite), usual = pv.length >= 5 ? median(pv) : null;
    const norm = rest && NORMS[k] ? ` · healthy adults ${NORMS[k][0]} ± ${NORMS[k][1]}` : '';
    return `<tr><td>${n}${u ? ` <span class="u">${u}</span>` : ''}<i>${mean}${norm}</i></td><td class="num">${fmtM(A[k], d)}</td>${whole ? '' : `<td class="num">${fmtM(W?.[k], d)}</td>`}<td class="num muted">${fmtM(usual, d)}</td></tr>`;
  }).join('');
  return `<table class="mt wide"><tr><th></th><th>Whole</th>${whole ? '' : '<th>On screen</th>'}<th>Usual</th></tr>${rows}</table>
    <p class="sub small">Whole: the recording as analysed (${clock(A.dur)}, ${fmt(A.n)} beats${A.runs > 1 ? ` in ${A.runs} unbroken stretches` : ''}). ${whole ? 'Zoom the chart to add a column for what is on screen. ' : ''}Usual: the median of ${plural(peers.length, 'earlier recording')} of this kind${r.pos ? `, ${REC_POS[r.pos].toLowerCase()}` : ''}${peers.length < 5 ? ', shown from 5' : ''}.${rest && r.kind !== 'breathe' ? ' Healthy adults: 5-minute lying values pooled across 44 studies (Nunan 2010), a loose reference only.' : ''} ${why('metrics', 'Every measure')}</p>`;
}
function recMinutes(r, R) {
  const X = R.X;
  if (!X) return para('No beats were kept with this recording.');
  const pm = (R.pm ||= perMinute(X));
  const rows = pm.map(m => `<tr data-act="bxwin" data-a="${m.m * 60}" data-b="${Math.min(X.dur, m.m * 60 + 60)}" class="tapr ${m.q != null && m.q < 90 ? 'lowq' : ''}"><td class="num">${hms(new Date(r.t0 + m.m * 60000)).slice(0, 5)}<i>${m.m}:00</i></td><td class="num">${m.hr != null ? r1(m.hr) : DASH}<i>${m.minHr != null ? `${Math.round(m.minHr)}–${Math.round(m.maxHr)}` : ''}</i></td><td class="num">${m.rmssd != null ? r1(m.rmssd) : DASH}</td><td class="num">${m.sdnn != null ? r1(m.sdnn) : DASH}</td><td class="num">${m.pnn50 != null ? Math.round(m.pnn50) : DASH}</td><td class="num">${m.q != null ? `${m.q}%` : DASH}${m.out ? `<i>${m.out} out</i>` : ''}</td></tr>`).join('');
  return `<div class="hscroll"><table class="mt mins"><tr><th>Minute</th><th>bpm</th><th>RMSSD</th><th>SDNN</th><th>pNN50</th><th>Clean</th></tr>${rows}</table></div>
    <p class="sub small">Each minute on its own, from its own beats. Tap a minute to see it on the chart. A minute under 90% clean is shaded: read it loosely.</p>`;
}
// Small multiples through the recording: each measure on its own scale, on the same time axis. Tap to go there.
function recThrough(r, R) {
  const X = R.X;
  if (!X || X.dur < 90) return para('Through time needs a recording of a minute and a half or more.');
  const ex = r.kind === 'cardio' || r.kind === 'live' || r.kind === 'hrr';
  const tl = (R.tl ||= timeline(X, { step: X.dur > 1200 ? 30 : 10, win: 60, br: !ex || X.dur < 1200 }));
  const W = 300, H = 54, T = X.dur, row = (key, label, fx, ref = null, c = 'var(--ink)') => {
    const v = tl.filter(p => p[key] != null);
    if (v.length < 2) return '';
    const vals = v.map(p => p[key]); let lo = Math.min(...vals), hi = Math.max(...vals);
    if (ref != null) { lo = Math.min(lo, ref); hi = Math.max(hi, ref); }
    const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
    const Xp = t => (t / T * W).toFixed(1), Y = x => (H - 3 - (x - lo) / (hi - lo) * (H - 6)).toFixed(1);
    let d = '', pen = false, prev = null;
    for (const p of tl) { if (p[key] == null || (prev != null && p.t - prev > 70)) pen = false; if (p[key] == null) continue; d += `${pen ? 'L' : 'M'}${Xp(p.t)},${Y(p[key])}`; pen = true; prev = p.t; }
    const refl = ref != null ? `<line class="ref" x1="0" x2="${W}" y1="${Y(ref)}" y2="${Y(ref)}"/>` : '';
    const last = v[v.length - 1][key];
    return `<div class="tlrow"><span class="tll">${label}<b class="num">${fx(Math.min(...vals))}–${fx(Math.max(...vals))}</b></span><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="--c:${c}">${refl}<path d="${d}"/></svg></div>`;
  };
  const hits = tl.map((p, i) => { const a = i ? tl[i - 1].t : 0; return `<rect data-act="bxwin" data-a="${Math.max(0, p.t - 60)}" data-b="${p.t}" x="${(a / T * 300).toFixed(1)}" width="${Math.max(1, (p.t - a) / T * 300).toFixed(1)}" y="0" height="1"/>`; }).join('');
  const marks = (r.marks || []).map(([s, l]) => `<span class="tlm" style="left:${(s / T * 100).toFixed(1)}%">${esc(l)}</span>`).join('');
  const th1 = ex ? a1Cross(tl, 0.75) : null, th2 = ex ? a1Cross(tl, 0.5) : null;
  return `<div class="tl">${marks ? `<div class="tlmarks">${marks}</div>` : ''}${row('hr', 'Heart rate', v => Math.round(v), null, 'var(--heart)')}${row('rmssd', 'RMSSD, 1 min', v => Math.round(v), null, 'var(--pro)')}
    ${row('a1', 'DFA α1, 2 min', v => v.toFixed(2), ex ? 0.75 : 1, 'var(--accent)')}${row('br', 'Breathing /min', v => r1(v), null, 'var(--move)')}${tl.some(p => p.q != null && p.q < 99) ? row('q', 'Clean beats %', v => Math.round(v), 95, 'var(--soft)') : ''}
    <svg class="tlhit" viewBox="0 0 300 1" preserveAspectRatio="none">${hits}</svg><div class="tlax"><span>0:00</span><span>${clock(T / 2)}</span><span>${clock(T)}</span></div></div>
    ${ex && (th1 || th2) ? para(`From α1 against heart rate in this session: ${th1 ? `first threshold about <b>${th1.hr} bpm</b> (α1 0.75)` : ''}${th1 && th2 ? '; ' : ''}${th2 ? `second about <b>${th2.hr} bpm</b> (α1 0.5)` : ''}. Agreement with gas-exchange thresholds is good in validation studies when the effort rises gradually and under 5% of beats need correcting (Rogers 2021). ${why('dfa', 'How')}`) : ''}
    <p class="sub small">Every point reads the minute before it (α1 the two minutes before, and only where 95% or more of those beats were clean). Tap anywhere to see that stretch on the chart.</p>`;
}
function recSignal(r, R) {
  const X = R.X, e = r.edits || {};
  if (!X) return para('This session was saved before beats were kept: only its heart rate every 5 seconds remains.');
  const K = X.C.kinds, fixedN = Object.values(K).reduce((a, b) => a + b, 0), nc = r.x?.nc || [];
  const list = [];
  for (let i = 0; i < X.n && list.length < 80; i++) {
    if (!X.fix[i] || (i && X.fix[i - 1] === X.fix[i] && X.src[i - 1] === X.src[i])) continue;
    list.push(`<button class="mini ${X.fix[i] === 6 ? 'kept' : ''}" data-act="bxgo" data-i="${i}">${bxClock(X.T[i] - X.rr[i] / 1000).replace(/\.\d+$/, '')} · ${X.fix[i] === 6 ? 'kept' : FIXK[X.fix[i]] === 'other' ? 'irregular' : FIXK[X.fix[i]]}</button>`);
  }
  const ov = Object.entries(e.beat || {});
  const exs = (e.ex || []).map(([a, b], i) => `<li><button class="rowbtn" data-act="bxwin" data-a="${Math.max(0, a - 5)}" data-b="${b + 5}"><span class="grow num">${bxClock(a).replace(/\.\d+$/, '')}–${bxClock(b).replace(/\.\d+$/, '')} <span class="sub">${r1(b - a)} s left out</span></span></button><button class="mini" data-act="stuexdel" data-i="${i}">Include again</button></li>`).join('');
  return `${para(fixedN ? `${fmt(X.C.n)} beats came from the strap; ${fixedN} needed correcting (${r1(X.C.bad * 100)}%): ${Object.entries(K).filter(([, n]) => n).map(([k, n]) => `${n} ${{ missed: 'missed (split in two)', extra: 'extra (merged)', ectopic: 'ectopic (evened across the pair)', other: 'irregular (set to the local median)', range: 'outside 27–222 bpm' }[k]}`).join(', ')}. Tap one to go to it; on the beat you can drop it or use it as recorded.` : `All ${fmt(X.C.n)} beats were used as the strap sent them.`)}
    ${list.length ? `<div class="bxfix">${list.join('')}</div>` : ''}
    ${X.gaps.length ? para(`${plural(X.gaps.length, 'gap')} where beats never reached the phone (${r1(X.gaps.reduce((s, g) => s + g[1] - g[0], 0))} s in all): shaded violet. No difference between beats is taken across a gap.`) : r.pk ? para('No beats were lost between the strap and the phone.') : ''}
    ${nc.length ? para(`Skin contact was lost ${plural(nc.length, 'time')}: ${nc.slice(0, 6).map(([a, b]) => `${clock(a)}–${clock(b)}`).join(', ')}.`) : ''}
    ${exs ? `<h3>Left out by you</h3><ul class="list">${exs}</ul>` : ''}
    ${e.trim ? `<p class="sub">Analysed from ${clock(e.trim[0])} to ${clock(Math.min(e.trim[1], X.dur))}${['morning', 'spot'].includes(r.kind) ? ', the recorded part after settling' : ''}. <button class="link" data-act="stutrimoff">Analyse all of it</button></p>` : ''}
    ${ov.length ? `<p class="sub">${plural(ov.length, 'beat')} changed by you. <button class="link" data-act="stubeatsoff">Put them all back</button></p>` : ''}
    ${r.pk ? para(`Times: each beat from the strap's own intervals (1/1024 s), anchored to the moment each of ${fmt(r.pk.length)} packets reached the phone.`, 'sub small') : ''}`;
}
// What a particular kind of session measures, beyond the general measures.
function recKind(r, R) {
  const X = R.X, x = r.x || {};
  if (r.kind === 'ortho' && X) {
    const st = (r.marks || []).find(m => /stand/i.test(m[1]))?.[0];
    if (st == null) return '';
    const [a0, a1] = idxAt(X, Math.max(0, st - 90), st - 5), [b0] = idxAt(X, st, st + 30), [c0, c1] = idxAt(X, Math.max(st + 30, X.dur - 60), X.dur);
    const L = statsRuns(X.rr, runsIn(X, a0, a1)), Sd = statsRuns(X.rr, runsIn(X, c0, c1));
    let peak = null; for (let k = b0; k < Math.min(X.n, b0 + 40); k++) if (X.inc[k]) peak = Math.max(peak || 0, 60000 / X.rr[k]);
    const R30 = ratio3015(X, st);
    const word = R30 ? (R30.r >= 1.04 ? 'in the range Ewing called normal' : R30.r > 1.0 ? 'borderline by Ewing\'s cut-offs' : 'at or under 1.00') : '';
    return sec('Standing up', `${stats([[L ? Math.round(L.hr) : DASH, 'bpm lying'], [peak ? Math.round(peak) : DASH, 'peak, 30 s'], [Sd ? Math.round(Sd.hr) : DASH, 'bpm standing'], [R30 ? R30.r.toFixed(2) : DASH, '30:15 ratio']])}
      ${para(`${L && Sd ? `Heart rate rose ${Math.round(Sd.hr - L.hr)} bpm and RMSSD went ${Math.round(L.rmssd)} → ${Math.round(Sd.rmssd)} ms. ` : ''}${R30 ? `30:15 ratio ${R30.r.toFixed(2)} (longest interval near beat 30, ${Math.round(R30.long)} ms, over the shortest near beat 15, ${Math.round(R30.short)} ms): ${word}. It falls with age, and Ewing's cut-offs come from a supervised test, so this is a reading, not a diagnosis. ` : ''}A sustained rise of 30 bpm or more within 10 minutes of standing, with symptoms, is what clinicians look for in postural tachycardia; this test is 2½ minutes, so it cannot say. ${why('ortho', 'Evidence')}`)}`);
  }
  if (r.kind === 'cardio') {
    const max = hrMaxOf(r.who), L = X && max ? hrLoad(X, max) : null;
    const zl = ['50–60%', '60–70%', '70–80%', '80–90%', '90%+'], zc = ['var(--track)', 'var(--good)', 'var(--move)', 'var(--accent)', 'var(--bad)'];
    const tot = L ? L.z.reduce((a, b) => a + b, 0) : 0;
    return sec('Effort', `${stats([[x.avg ?? (R.A ? Math.round(R.A.hr) : DASH), 'avg bpm'], [x.max ?? (R.A ? Math.round(R.A.maxHr) : DASH), 'max bpm'], [L ? Math.round(L.trimp) : DASH, 'TRIMP'], [x.hrr != null ? x.hrr : DASH, 'bpm drop, 1 min after']])}
      ${tot ? `<div class="zbar">${L.z.map((s, i) => s ? `<i style="flex:${s};background:${zc[i]}"></i>` : '').join('')}</div><p class="key">${L.z.map((s, i) => s ? `<span class="kk"><i class="k" style="background:${zc[i]}"></i>${zl[i]} ${clock(s)}</span>` : '').join('')}</p>` : ''}
      ${para(`${max ? `Zones as shares of a maximum of ${max} bpm${r.who === 'me' ? '' : ' from age (Tanaka 2001)'}. ` : 'Add a year of birth for this person to see zones. '}TRIMP: minutes in each zone weighted 1 to 5 (Edwards 1993), comparable between your own sessions only.${x.vt1 ? ` Aerobic threshold saved with the session: ${x.vt1} bpm.` : ''}${X ? '' : ' Saved before beats were kept, so α1 and the explorer are not available for it.'}`)}`);
  }
  if (r.kind === 'rf' && Array.isArray(x.seg)) {
    const mx = Math.max(...x.seg.map(s => s[1] || 0)) || 1;
    return sec('Resonance', `<div class="rfbars">${x.seg.map(([rt, a]) => `<div class="${rt === x.best ? 'best' : ''}"><i style="height:${a ? (a / mx * 100).toFixed(0) : 2}%"></i><b>${a != null ? r1(a) : DASH}</b><span>${rt}</span></div>`).join('')}</div><p class="key center">Heart-rate swing per breath (bpm) at each rate</p>${para(`Best: ${x.best} breaths a minute (Lehrer & Gevirtz 2014). ${why('rf', 'How')}`)}`);
  }
  if (r.kind === 'breathe' && x.rsa != null) return sec('With each breath', `${stats([[r1(x.rsa), 'bpm swing a breath'], [x.share != null ? `${Math.round(x.share)}%` : DASH, 'power at the breath'], [x.rate ?? DASH, 'breaths/min']])}${para(`The swing is respiratory sinus arrhythmia, what slow breathing trains. ${why('breathe', 'Evidence')}`)}`);
  if (r.kind === 'hrr') return sec('Recovery', `${stats([[x.hrr ?? DASH, 'bpm drop in 60 s'], [x.hr0 ?? DASH, 'bpm at stop']])}${x.of && recGet(x.of) ? `<p><a class="link" href="#rec-${x.of}">The session it followed ›</a></p>` : ''}${para(`Read against the same person's own recoveries at a similar effort. ${why('hrr', 'Why')}`)}`);
  if (r.kind === 'live' && X && r.marks?.length > 1) {
    const rows = r.marks.map(([s, l], i) => {
      const e = i + 1 < r.marks.length ? r.marks[i + 1][0] : X.dur, [a, b] = idxAt(X, s, e), A = analyse(X, a, b, false);
      return `<tr data-act="bxwin" data-a="${s}" data-b="${e}" class="tapr"><td>${esc(l)}<i>${clock(e - s)}</i></td><td class="num">${A ? Math.round(A.hr) : DASH}</td><td class="num">${A ? r1(A.rmssd) : DASH}</td><td class="num">${A?.a1 != null ? A.a1.toFixed(2) : DASH}</td></tr>`;
    }).join('');
    return sec('Each stretch', `<table class="mt segt"><tr><th>Mark</th><th>bpm</th><th>RMSSD</th><th>α1</th></tr>${rows}</table><p class="sub small">Each from its own beats, the change-over seconds included. Tap one to see it.</p>`);
  }
  return '';
}
function recEdit(r) {
  const who = [['me', 'You'], ...people().map(p => [p.id, p.n])].map(([id, n]) => `<button class="${r.who === id ? 'on' : ''}" data-act="stumove" data-v="${id}">${esc(n)}</button>`).join('');
  const marks = (r.marks || []).map(([s, l], i) => `<li><button class="rowbtn" data-act="bxwin" data-a="${Math.max(0, s - 10)}" data-b="${s + 50}"><span class="num sub">${clock(s)}</span><span class="grow">${esc(l)}</span></button><button class="mini" data-act="stumarkdel" data-i="${i}" aria-label="Remove mark">×</button></li>`).join('');
  return `<div class="opts"><span class="sub">Whose</span><div class="chips tight wrap">${who}</div></div>
    <div class="opts"><span class="sub">Position</span>${seg('stupos', [['lying', 'Lying'], ['sitting', 'Sitting'], ['standing', 'Stand'], ['moving', 'Moving']], r.pos || '', 'tight')}</div>
    <label class="line"><span class="sub">Name</span><input class="field tf" data-rf="title" maxlength="60" value="${esc(r.title || '')}" placeholder="${esc(REC_KINDS[r.kind][0])}"></label>
    <label class="line"><span class="sub">Notes</span><textarea class="field tf" data-rf="note" rows="3" maxlength="2000" placeholder="Anything that matters for reading it: coffee, a bad night, a cold, what you were doing">${esc(r.note || '')}</textarea></label>
    <h3>Marks</h3>${marks ? `<ul class="list marks">${marks}</ul>` : '<p class="sub small">None.</p>'}
    <div class="rowb"><button class="ghost" data-act="stumarkadd">Mark at the beat you read</button>${recEdited(r) ? '<button class="ghost" data-act="stureset">Undo all your edits</button>' : ''}</div>
    <p class="sub small">Edits sit beside the recording and never change it: the beats as the strap sent them are always kept.${r.who === 'me' && r.ref ? ' Excluding or trimming changes this reading wherever the app uses it, the day\'s verdict included.' : ''}</p>`;
}
function recFiles(r) {
  return `<div class="filegrid"><button class="fileb" data-act="stuxrep"><b>Report</b><span>A page with every chart and number, to read, print or send</span></button>
    <button class="fileb" data-act="stuxjson"><b>Strap file</b><span>Everything, lossless: opens in this app on any phone</span></button>
    <button class="fileb" data-act="stuxcsv"><b>Beats, CSV</b><span>Time, interval as sent and corrected, flags</span></button>
    <button class="fileb" data-act="stuxtxt"><b>RR, Kubios</b><span>One corrected interval a line, for Kubios HRV and similar</span></button></div>
    <div class="rowb"><span class="grow"></span><button class="danger" data-hold="stureddel">Hold to delete the recording</button></div>`;
}
function vRec(id) {
  const back = `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>`, r = recGet(id);
  if (!r) return `${masthead('Recording', '', { before: back })}${para(RSTORE.ready ? 'This recording is not here: it may have been deleted.' : 'Opening the recordings…')}`;
  const R = recRead(r), D = R.X ? bxLoad(r) : (BX.D = null, BX.key = r.id, null);
  const panel = STU.panel, panels = [['measures', 'Measures'], ['minutes', 'Minutes'], ['time', 'Through time'], ['signal', 'Signal']];
  const pbody = panel === 'minutes' ? recMinutes(r, R) : panel === 'time' ? recThrough(r, R) : panel === 'signal' ? recSignal(r, R) : recMeasures(r, R);
  const cardioOld = !R.X && r.tr ? traceChart({ tr: r.tr, a1: r.x?.a1, vt1: r.x?.vt1 }) : '';
  return `${masthead(esc(recTitle(r)), `${r.who !== 'me' ? `${esc(personName(r.who))} · ` : ''}${recWhen(r, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`, { before: back, after: `<button class="nav" data-act="stushare" aria-label="Share">${ic('share')}</button>` })}
    <section class="card rechero">${r.inc ? `<p class="flag small">${r.rcv ? 'Recovered after the app closed while it ran.' : 'Incomplete: the session stopped before it finished.'} Every beat that arrived is here.</p>` : ''}
      <div class="rhtags">${r.pos ? `<span class="tagx">${REC_POS[r.pos]}</span>` : ''}${r.dev ? `<span class="tagx">${esc(r.dev)}</span>` : ''}<span class="tagx">${clock(R.dur)} recorded</span>${R.A ? qBadge(R.A.q) : ''}${recEdited(r) ? '<span class="tagx ed">edited</span>' : ''}</div>
      ${recFacts(r, R)}${recOwn(r, R)}${r.note ? `<p class="recnote">${esc(r.note)}</p>` : ''}</section>
    ${D ? `<section class="block explorer">${bxPanel()}</section>` : cardioOld ? sec('Heart rate', cardioOld) : ''}
    ${part(recKind, r, R)}
    ${R.A ? `<section class="block">${seg('stupanel', panels, panel, 'tight panels')}<div class="panel">${part(() => pbody)}</div></section>` : ''}
    ${sec('Edit', recEdit(r), { id: 'recedit' })}
    ${sec('Files', recFiles(r))}`;
}

// The older beat-by-beat addresses: the recording's page once the store has it.
function vBeatsGone(key) {
  const r = bxRec(key || '');
  if (r) { setTimeout(() => location.replace(`#rec-${r.id}`), 0); return ''; }
  return `${masthead('Beat by beat', '', { before: `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>` })}${para(RSTORE.ready ? 'No beats were kept with this reading.' : 'Opening the recordings…')}`;
}

// ---------- after a session for someone else ----------
function recResultCard(res) {
  const r = res.rid && recGet(res.rid), done = '<button class="solid" data-act="hrresdone">Done</button>';
  if (!r) return `<div class="result ok"><b>Saved</b>${done}</div>`;
  const R = recRead(r), A = R.A;
  return `<div class="result ok"><svg viewBox="0 0 48 48" class="stamp" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 25l7 7 13-15"/></svg>
    <b>${esc(recTitle(r))} saved for ${esc(personName(r.who))}</b>
    ${A ? stats([[r1(A.rmssd), 'RMSSD, ms'], [Math.round(A.hr), 'bpm'], [`${A.q}%`, 'clean beats']]) : ''}${recOwn(r, R)}
    <p class="sub small">Kept with their recordings, apart from yours.</p>
    <div class="rowb"><a class="ghost link" href="#rec-${r.id}">Full analysis ›</a><span class="grow"></span>${done}</div></div>`;
}

// ---------- marks ----------
function vRecMark(p) {
  const r = recGet(p.id);
  if (!r) return '';
  const quick = ['Resting', 'Breathing slowly', 'Standing up', 'Moving', 'Talking', 'Coffee', 'Stressed', 'Calm', 'Cold', 'Effort up', 'Effort down'];
  return `${sheetTop(`Mark at ${clock(p.at)}`, 'What changed here?', `recmark-${p.id}`)}
    <div class="chips wrap">${quick.map(q => `<button data-act="stumarkq" data-v="${esc(q)}">${q}</button>`).join('')}</div>
    <label class="line"><span class="sub">Or in your words</span><input class="field tf" id="mk_l" maxlength="30" placeholder="A few words" autocomplete="off"></label>
    <div class="rowb"><span class="grow"></span><button class="solid" data-act="stumarkok">Add mark</button></div></aside>`;
}

// ---------- files ----------
function fileStamp(r) { const d = new Date(r.t0), p = n => String(n).padStart(2, '0'); return `${dk(d)}-${p(d.getHours())}${p(d.getMinutes())}`; }
function fileName(r, ext) { return `strap-${(r.who === 'me' ? 'me' : personName(r.who)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person'}-${r.kind}-${fileStamp(r)}.${ext}`; }
function strapFile(recs) {
  const who = new Set(recs.map(r => r.who));
  return { format: 'health-strap', v: 1, made: new Date().toISOString(), people: [...who].filter(w => w !== 'me').map(personOf).filter(Boolean), me: who.has('me') ? { n: 'Owner of the app' } : null, recs };
}
function recCsv(r) {
  const R = recRead(r), X = R.X;
  if (!X) return null;
  const head = [`# ${recTitle(r)} · ${personName(r.who, 'owner')} · started ${new Date(r.t0).toISOString()} (${hms(new Date(r.t0), true)} local)`, `# ${r.dev || 'Strap'}; RR as sent in the strap's 1/1024 s, corrected after Lipponen & Tarvainen 2019; times are seconds from the first beat's start`,
    '# flag: 0 as recorded, 1 missed (split), 2 extra (merged), 3 ectopic (evened), 4 irregular (local median), 5 out of range, 6 kept as recorded by you; included 0 = excluded, trimmed, dropped or after a gap',
    ...(r.marks || []).map(([s, l]) => `# mark at ${s} s: ${l}`), ...(X.gaps || []).map(([a, b]) => `# beats lost in transit ${r1(a)}–${r1(b)} s`),
    'beat,time_s,clock,rr_sent_ms,rr_ms,bpm,flag,included'];
  const lines = [];
  for (let k = 0; k < X.n; k++) { const st = X.T[k] - X.rr[k] / 1000; lines.push(`${k + 1},${X.T[k].toFixed(3)},${hms(new Date(r.t0 + st * 1000), true)},${X.raw[X.src[k]].toFixed(1)},${X.rr[k].toFixed(1)},${(60000 / X.rr[k]).toFixed(2)},${X.fix[k]},${X.inc[k]}`); }
  return head.concat(lines).join('\n') + '\n';
}
function recKubios(r) {
  const X = recRead(r).X;
  if (!X) return null;
  const out = [];
  for (const [a, b] of X.runs) for (let k = a; k < b; k++) out.push(Math.round(X.rr[k]));
  return out.join('\n') + '\n';
}
function svgLine(pts, W, H, cls, lo, hi) {
  if (pts.length < 2) return '';
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || 1;
  lo ??= Math.min(...pts.map(p => p[1])); hi ??= Math.max(...pts.map(p => p[1]));
  return `<path class="${cls}" d="${pts.map(([t, v], i) => `${i ? 'L' : 'M'}${((t - t0) / (t1 - t0 || 1) * W).toFixed(1)},${(H - 4 - (v - lo) / (hi - lo || 1) * (H - 8)).toFixed(1)}`).join('')}"/>`;
}
// One self-contained page: what was recorded, every measure, minute by minute, the charts, the corrections and edits,
// and how each number was made. Opens in any browser; prints to PDF.
function recReport(r) {
  const R = recRead(r), X = R.X, A = R.A, pm = X ? (R.pm ||= perMinute(X)) : [];
  const step = X ? Math.max(1, Math.floor(X.n / 1200)) : 1, hr = [];
  if (X) for (let k = 0; k < X.n; k += step) if (X.inc[k]) hr.push([X.T[k], 60000 / X.rr[k]]);
  const poin = [];
  if (X) for (const [a, b] of X.runs) for (let k = a + 1; k < b; k += Math.max(1, Math.floor(X.n / 1500))) poin.push([X.rr[k - 1], X.rr[k]]);
  const plo = poin.length ? Math.min(...poin.flat()) - 20 : 0, phi = poin.length ? Math.max(...poin.flat()) + 20 : 1, P = v => ((v - plo) / (phi - plo) * 240).toFixed(1);
  const S = A?.spec, smx = S ? Math.max(...S.p) : 1;
  const row = ([k, n, u, d, m]) => A?.[k] == null ? '' : `<tr><td>${n}</td><td class="n">${fmtM(A[k], d)} ${u}</td><td class="m">${m}${NORMS[k] && REST_KINDS.includes(r.kind) ? ` Healthy adults (Nunan 2010): ${NORMS[k][0]} ± ${NORMS[k][1]}.` : ''}</td></tr>`;
  const peers = recPeers(r).map(x => recRead(x).A).filter(Boolean), O = A && ['morning', 'spot'].includes(r.kind) ? ownRef(A.ln, peers.map(a => a.ln)) : null;
  const e = r.edits || {}, edits = [e.trim ? `analysed ${r1(e.trim[0])}–${r1(e.trim[1])} s only` : '', ...(e.ex || []).map(([a, b]) => `excluded ${r1(a)}–${r1(b)} s`), Object.keys(e.beat || {}).length ? `${Object.keys(e.beat).length} beats changed by hand` : ''].filter(Boolean);
  const esc2 = esc;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc2(recTitle(r))} · ${esc2(dk(new Date(r.t0)))}</title>
<style>body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#191814;background:#fff;max-width:820px;margin:0 auto;padding:24px 18px}h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;margin:26px 0 8px;border-bottom:1px solid #e6e3dd;padding-bottom:4px}.sub{color:#6b675f}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}td,th{padding:5px 6px;border-bottom:1px solid #efede8;text-align:left;vertical-align:top}td.n{white-space:nowrap;font-weight:600}td.m{color:#6b675f;font-size:12.5px}.kp{display:flex;gap:22px;flex-wrap:wrap;margin:14px 0}.kp div b{display:block;font-size:24px}.kp div span{color:#6b675f;font-size:12px}svg{width:100%;height:auto;display:block}.hr{fill:none;stroke:#e0464d;stroke-width:1.2}.sp{fill:none;stroke:#191814;stroke-width:1.4}.pt{fill:#191814;opacity:.55}.b1{fill:#1d84d4;opacity:.12}.b2{fill:#15994f;opacity:.12}.ln{stroke:#d6d3cb}.ex{fill:#d9413a;opacity:.12}.gp{fill:#6a57dc;opacity:.15}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media print{body{padding:0}}</style></head><body>
<h1>${esc2(recTitle(r))}</h1><p class="sub">${esc2(personName(r.who, 'Owner of the app'))} · ${new Date(r.t0).toLocaleString()} · ${clock(R.dur)} recorded${r.pos ? ` · ${REC_POS[r.pos].toLowerCase()}` : ''} · ${esc2(r.dev || 'Strap')}</p>
${r.note ? `<p>${esc2(r.note)}</p>` : ''}
${A ? `<div class="kp"><div><b>${r1(A.rmssd)}</b><span>RMSSD, ms</span></div><div><b>${r1(A.hr)}</b><span>mean bpm</span></div><div><b>${r1(A.sdnn)}</b><span>SDNN, ms</span></div><div><b>${A.q}%</b><span>beats as recorded</span></div><div><b>${clock(A.dur)}</b><span>analysed</span></div></div>` : ''}
${O?.m != null ? `<p>Against ${O.n} earlier readings of the same kind and position: <b>${O.word}</b> the usual band of ${r1(Math.exp(O.lo))}–${r1(Math.exp(O.hi))} ms (mean ± half an SD of ln RMSSD, the smallest worthwhile change).</p>` : ''}
${hr.length > 2 ? `<h2>Heart rate, beat by beat</h2><svg viewBox="0 0 800 160">${(e.ex || []).map(([a, b]) => `<rect class="ex" x="${(a / R.dur * 800).toFixed(1)}" width="${((b - a) / R.dur * 800).toFixed(1)}" y="0" height="160"/>`).join('')}${(X.gaps || []).map(([a, b]) => `<rect class="gp" x="${(a / R.dur * 800).toFixed(1)}" width="${Math.max(1, (b - a) / R.dur * 800).toFixed(1)}" y="0" height="160"/>`).join('')}${svgLine(hr, 800, 160, 'hr')}</svg><p class="sub">${Math.round(Math.min(...hr.map(p => p[1])))}–${Math.round(Math.max(...hr.map(p => p[1])))} bpm over ${clock(R.dur)}.${(e.ex || []).length ? ' Red: excluded.' : ''}${X.gaps.length ? ' Violet: beats lost in transit.' : ''}${(r.marks || []).length ? ` Marks: ${r.marks.map(([s, l]) => `${clock(s)} ${esc2(l)}`).join('; ')}.` : ''}</p>` : ''}
${A ? `<h2>Every measure</h2><table>${MEASURES.map(row).join('')}</table>` : ''}
${poin.length > 10 || S ? `<div class="two">${poin.length > 10 ? `<div><h2>Poincaré</h2><svg viewBox="0 0 240 240"><line class="ln" x1="0" y1="240" x2="240" y2="0"/>${poin.map(([a, b]) => `<circle class="pt" cx="${P(a)}" cy="${(240 - P(b)).toFixed(1)}" r="1.4"/>`).join('')}</svg><p class="sub">Each interval against the next. SD1 ${r1(A.sd1)} ms, SD2 ${r1(A.sd2)} ms.</p></div>` : ''}
${S ? `<div><h2>Spectrum</h2><svg viewBox="0 0 240 240"><rect class="b1" x="${(0.04 / 0.45 * 240).toFixed(1)}" width="${(0.11 / 0.45 * 240).toFixed(1)}" y="0" height="240"/><rect class="b2" x="${(0.15 / 0.45 * 240).toFixed(1)}" width="${(0.25 / 0.45 * 240).toFixed(1)}" y="0" height="240"/><path class="sp" d="${S.f.map((f, i) => `${i ? 'L' : 'M'}${(f / 0.45 * 240).toFixed(1)},${(236 - S.p[i] / smx * 228).toFixed(1)}`).join('')}"/></svg><p class="sub">Lomb–Scargle, ms²/Hz. Blue LF 0.04–0.15 Hz, green HF 0.15–0.4 Hz.</p></div>` : ''}</div>` : ''}
${pm.length > 1 ? `<h2>Minute by minute</h2><table><tr><th>Minute</th><th>Clock</th><th>bpm</th><th>range</th><th>RMSSD</th><th>SDNN</th><th>pNN50</th><th>clean</th></tr>${pm.map(m => `<tr><td>${m.m + 1}</td><td>${hms(new Date(r.t0 + m.m * 60000))}</td><td>${m.hr != null ? r1(m.hr) : '–'}</td><td>${m.minHr != null ? `${Math.round(m.minHr)}–${Math.round(m.maxHr)}` : '–'}</td><td>${m.rmssd != null ? r1(m.rmssd) : '–'}</td><td>${m.sdnn != null ? r1(m.sdnn) : '–'}</td><td>${m.pnn50 != null ? Math.round(m.pnn50) : '–'}</td><td>${m.q != null ? m.q + '%' : '–'}</td></tr>`).join('')}</table>` : ''}
<h2>The signal</h2><p>${X ? `${X.C.n} beats came from the strap; ${Math.round(X.C.bad * 1000) / 10}% needed correcting (${Object.entries(X.C.kinds).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}). ${X.gaps.length ? `${X.gaps.length} gaps where beats were lost in transit; no difference is taken across one.` : 'No beats were lost in transit.'}` : 'Saved before beats were kept: heart rate every 5 seconds only.'} ${edits.length ? `Edits by the person who recorded it: ${edits.join('; ')}. The original beats are kept unchanged in the strap file.` : 'No edits.'}</p>
<h2>How the numbers were made</h2><p class="sub">RR intervals as sent by the strap (1/1024 s). Artefacts corrected with adaptive thresholds (Lipponen &amp; Tarvainen 2019). Time-domain and Poincaré measures over unbroken runs of included beats; frequency measures by Lomb–Scargle periodogram on the beat times, without resampling (Laguna 1998); bands and minimum lengths per the Task Force of the ESC and NASPE (1996) and Shaffer &amp; Ginsberg (2017). DFA α1 over 4–16 beats and α2 over 16–64 (Peng 1995). Breathing rate from the dominant rhythm in the beats (Schäfer &amp; Kratky 2008). The smallest worthwhile change is half the SD of a person's own ln RMSSD (Plews 2012; Buchheit 2014). Population values: Nunan et al. 2010. Not a medical device and not a diagnosis.</p>
<p class="sub">Made by Health on ${new Date().toLocaleString()}.</p></body></html>`;
}
function recExport(r, how) {
  if (how === 'json') saveText(fileName(r, 'json'), JSON.stringify(strapFile([r])), 'application/json');
  else if (how === 'csv') { const t = recCsv(r); if (!t) return toast('No beats were kept with this recording'); saveText(fileName(r, 'csv'), t, 'text/csv'); }
  else if (how === 'txt') { const t = recKubios(r); if (!t) return toast('No beats were kept with this recording'); saveText(fileName(r, 'txt'), t, 'text/plain'); }
  else saveText(fileName(r, 'html'), recReport(r), 'text/html');
  buzz('ok');
}
// ---------- opening a strap file ----------
// A strap file from this app (one recording or many, from any phone) is previewed, then added to whoever you choose:
// to the person named in it (made if new), to someone you already have, or to you.
function strapFileRead(txt, from) {
  let o;
  try { o = JSON.parse(txt); } catch (e) { return false; }
  if (!obj(o) || o.format !== 'health-strap' || !Array.isArray(o.recs)) return false;
  const recs = o.recs.map(cleanRec).filter(Boolean), ppl = Array.isArray(o.people) ? o.people.map(cleanPerson).filter(Boolean) : [];
  if (!recs.length) { buzz('warn'); toast('That strap file has no recordings in it'); return true; }
  const name = ppl[0]?.n || '';
  const match = name ? people().find(p => p.n.toLowerCase() === name.toLowerCase()) : null;
  pending = { type: 'strap', recs, ppl, from, to: match ? match.id : name ? 'new' : 'me' };
  render();
  return true;
}
function vStrapImport(P) {
  const kinds = [...new Set(P.recs.map(r => REC_KINDS[r.kind][0]))].join(', '), first = P.recs.reduce((a, r) => Math.min(a, r.t0), Infinity), last = P.recs.reduce((a, r) => Math.max(a, r.t0), 0);
  const have = P.recs.filter(r => RSTORE.map.has(r.id)).length, name = P.ppl[0]?.n;
  const opts = [...(name && !people().some(p => p.n.toLowerCase() === name.toLowerCase()) ? [['new', `${name} (new)`]] : []), ...people().map(p => [p.id, p.n]), ['me', 'You']];
  return `${sheetTop(`Strap file · ${esc(P.from || '')}`, plural(P.recs.length, 'recording'), 'strapimp')}
    ${para(`${kinds}, ${dateLabel(dk(new Date(first)))}${last - first > DAY ? ` to ${dateLabel(dk(new Date(last)))}` : ''}${name ? `, of ${esc(name)}` : ''}.${have ? ` ${have} already here: kept unless the file's is newer.` : ''}`)}
    <h3>Add them to</h3><div class="chips wrap">${opts.map(([v, n]) => `<button class="${P.to === v ? 'on' : ''}" data-act="stuimpto" data-v="${v}">${esc(n)}</button>`).join('')}</div>
    ${P.to === 'me' ? para('Added to you, they are kept with your recordings; your morning checks and verdict are not changed by them.', 'sub small') : ''}
    <div class="rowb"><button class="solid" data-act="stuimpok">Add</button><button class="ghost" data-act="importno">Cancel</button></div></aside>`;
}

// ---------- the live pill ----------
// While a session runs and you look elsewhere in the app, a small pill keeps it in sight: what is running, for how
// long, the heart rate now. A tap goes back to it.
function livePill() {
  let el = document.getElementById('livepill');
  const where = HR.mode === 'morning' || HR.mode === 'workout' || HR.mode === 'hrr' ? '#strap-live' : `#lab-${HR.mode}`;
  const shown = HR.mode && !(overlay?.type === 'strap' && STU.part === 'live') && !(overlay?.type === 'lab' && overlay.key === HR.mode) && !(tab === 'recovery' && !overlay && ['morning', 'workout', 'hrr'].includes(HR.mode));
  if (!shown) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('a'); el.id = 'livepill'; document.body.appendChild(el); }
  el.href = where;
  el.innerHTML = `<i class="lpdot"></i><span>${esc({ morning: 'Morning check', workout: 'Cardio', hrr: 'Recovery' }[HR.mode] || LABS[HR.mode]?.n || 'Recording')}${WEAR.who !== 'me' ? ` · ${esc(personName(WEAR.who))}` : ''}</span><b class="num">${clock((Date.now() - HR.t0) / 1000)}</b><b class="num">${HR.bpm ?? DASH}<small> bpm</small></b>`;
}
function stuPaint() {
  livePill();
  const g = document.getElementById('stulive'); if (g) g.innerHTML = stuLiveGrid();
  const l = document.getElementById('stulag'); if (l && HR.last) l.textContent = `last beat ${r1((Date.now() - HR.last) / 1000)} s ago`;
}
function stuKick() { livePill(); }

// ---------- what a tap does ----------
function recEditMeta(fn, msg) {
  const r = recGet(overlay?.key);
  if (!r) return;
  const was = JSON.parse(JSON.stringify(r)), next = Object.assign({}, r);
  fn(next);
  recPut(next); recSyncS(recGet(r.id)); save(); render();
  if (msg) toast(msg, 5000, { label: 'Undo', fn: () => { recPut(was); recSyncS(recGet(was.id)); save(); render(); } });
}
function stuAct(a, el) {
  if (!a.startsWith('stu')) return false;
  const v = el.dataset.v, r = overlay?.type === 'rec' ? recGet(overlay.key) : null;
  switch (a) {
    case 'stupart': STU.part = v; buzz('tick'); if (overlay?.type === 'strap') { history.replaceState(null, '', `#strap-${v}`); overlay.key = v; } renderView(); scrollTo(0, 0); break;
    // The calibration session is a cardio session worn with the watch: the pair is made when the two meet.
    case 'stucal': STU.part = 'live'; STU.run = 'workout'; HR.result = null; if (overlay?.type === 'strap') { history.replaceState(null, '', '#strap-live'); overlay.key = 'live'; } buzz('tick'); render(); scrollTo(0, 0); break;
    case 'stuwear': WEAR.who = v; buzz('tick'); render(); break;
    case 'sturun': STU.run = v || null; if (!v || !HR.result || (v === 'morning') !== (HR.result.type === 'morning')) HR.result = null; buzz('tick'); render(); scrollTo(0, 0); break;
    case 'stufwho': STU.fWho = v; buzz('tick'); renderView(); break;
    case 'stufkind': STU.fKind = v; buzz('tick'); renderView(); break;
    case 'stupnew': PE.sex = null; openPop({ kind: 'person', id: '' }); break;
    case 'stupedit': PE.sex = null; openPop({ kind: 'person', id: v }); break;
    case 'stupsave': {
      const n = $('#pe_n')?.value.trim();
      if (!n) { buzz('warn'); toast('A name, please'); break; }
      const by = num($('#pe_by')?.value, 1900, new Date().getFullYear()), note = $('#pe_note')?.value.trim() || '';
      const cur = v ? personOf(v) : null, sex = PE.sex ?? cur?.sex ?? '';
      const p = cleanPerson(Object.assign({ id: v || newPersonId(), n, note }, sex ? { sex } : {}, by ? { by } : {}));
      if (!p) break;
      S.people = cur ? people().map(x => x.id === v ? p : x) : people().concat([p]);
      if (!cur && overlay?.type === 'strap' && !HR.mode) WEAR.who = p.id;
      save(); closePop(); buzz('done'); toast(cur ? 'Saved' : `${p.n} added${overlay?.type === 'strap' ? ', and wearing the strap now' : ''}`);
      break;
    }
    case 'stuimp': $('#stuimpf')?.click(); break;
    case 'stuexpall': {
      const list = recList().filter(x => (STU.fWho === 'all' || x.who === STU.fWho) && (STU.fKind === 'all' || x.kind === STU.fKind));
      saveText(`strap-recordings-${todayKey()}.json`, JSON.stringify(strapFile(list)), 'application/json'); buzz('ok'); break;
    }
    case 'stuexpwho': saveText(`strap-${v === 'me' ? 'me' : personName(v).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${todayKey()}.json`, JSON.stringify(strapFile(recList({ who: v }))), 'application/json'); buzz('ok'); break;
    case 'stuimpto': pending.to = v; buzz('tick'); render(); break;
    case 'stuimpok': {
      const P = pending;
      let to = P.to;
      if (to === 'new') { const p = cleanPerson(Object.assign({}, P.ppl[0], { id: newPersonId() })); if (p) { S.people = people().concat([p]); to = p.id; } else to = 'me'; }
      // Brought in, a recording never links to your own summaries: those are made by sessions on this phone.
      const got = recMerge(P.recs.map(x => { const y = Object.assign({}, x, { who: to, at: Math.max(x.at || 0, RSTORE.map.get(x.id)?.at || 0) + 1 }); delete y.ref; return y; }));
      pending = null; save(); buzz('done'); render();
      toast(`${plural(got.added, 'recording')} added${got.newer ? `, ${got.newer} updated` : ''}`);
      break;
    }
    case 'stupanel': STU.panel = v; buzz('tick'); renderView(); break;
    case 'stushare': if (r) recExport(r, 'html'); break;
    case 'stuxrep': if (r) recExport(r, 'html'); break;
    case 'stuxjson': if (r) recExport(r, 'json'); break;
    case 'stuxcsv': if (r) recExport(r, 'csv'); break;
    case 'stuxtxt': if (r) recExport(r, 'txt'); break;
    case 'stumove': {
      if (!r || r.who === v) break;
      const undo = recMove(r, v);
      buzz('ok'); render();
      toast(v === 'me' ? 'Moved to you' : `Moved to ${personName(v)}${r.who === 'me' && r.ref ? ', and out of your own data' : ''}`, 6000, { label: 'Undo', fn: () => { undo?.(); save(); render(); } });
      break;
    }
    case 'stupos': recEditMeta(x => { x.pos = v; }); buzz('tick'); break;
    case 'stuexdel': recEditMeta(x => { const e = JSON.parse(JSON.stringify(x.edits || {})); e.ex = (e.ex || []).filter((_, i) => i !== +el.dataset.i); if (!e.ex.length) delete e.ex; x.edits = Object.keys(e).length ? e : undefined; }, 'Included again'); break;
    case 'stutrimoff': recEditMeta(x => { const e = Object.assign({}, x.edits); delete e.trim; x.edits = Object.keys(e).length ? e : undefined; }, 'The whole recording is analysed'); break;
    case 'stubeatsoff': recEditMeta(x => { const e = Object.assign({}, x.edits); delete e.beat; x.edits = Object.keys(e).length ? e : undefined; }, 'Every beat back as corrected'); break;
    case 'stureset': recEditMeta(x => { if (x.x?.trim0) x.edits = { trim: x.x.trim0 }; else delete x.edits; }, 'Your edits undone'); break;
    case 'stumarkdel': recEditMeta(x => { x.marks = (x.marks || []).filter((_, i) => i !== +el.dataset.i); }, 'Mark removed'); break;
    case 'stumarkadd': {
      if (!r) break;
      const D = BX.D, at = D && BX.cur >= 0 ? D.T[BX.cur] - D.rr[BX.cur] / 1000 : (BX.v0 + BX.v1) / 2;
      STU.markAt = r1(at); openPop({ kind: 'recmark', id: r.id, at: STU.markAt }); break;
    }
    case 'stumarkq': case 'stumarkok': {
      const l = a === 'stumarkq' ? v : $('#mk_l')?.value.trim();
      if (!l) { buzz('warn'); break; }
      closePop();
      setTimeout(() => recEditMeta(x => { x.marks = (x.marks || []).concat([[STU.markAt, l.slice(0, 30)]]); }, 'Mark added'), 0);
      break;
    }
    default: return false;
  }
  return true;
}
ACT_HOLD.stureddel = () => {
  const r = recGet(overlay?.key);
  if (!r) return;
  const undoS = r.who === 'me' ? recRefRemove(r.ref) : null;
  recDel(r.id); save(); goBack();
  undoable(`${recTitle(r)} deleted`, () => { recPut(r); undoS?.(); });
};
SWIPE.recdel = el => {
  const r = recGet(el.dataset.id);
  if (!r) return;
  const undoS = r.who === 'me' ? recRefRemove(r.ref) : null;
  recDel(r.id); save(); render();
  undoable(`${recTitle(r)} deleted`, () => { recPut(r); undoS?.(); });
};
ACT_HOLD.stupdel = el => {
  const id = el.dataset.v, P = personOf(id);
  if (!P) return;
  const theirs = recList({ who: id }).concat(recAll().filter(x => x.live && x.who === id));
  for (const x of theirs) recDel(x.id);
  S.people = people().filter(p => p.id !== id);
  if (WEAR.who === id) WEAR.who = 'me';
  save(); goBack();
  undoable(`${P.n} and ${plural(theirs.length, 'recording')} removed`, () => { S.people = people().concat([P]); for (const x of theirs) recPut(x); });
};
// Typed fields on a session's page and the person sheet.
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset?.rf && overlay?.type === 'rec') { const k = el.dataset.rf, val = el.value.trim(); recEditMeta(x => { if (val) x[k] = val; else delete x[k]; }); buzz('ok'); toast('Saved'); }
  else if (el.id === 'stuimpf' && el.files[0]) {
    const f = el.files[0]; el.value = '';
    if (f.size > 60e6) { buzz('warn'); return toast('That file is too large'); }
    f.text().then(t => { if (!strapFileRead(t, f.name)) { buzz('warn'); toast('That is not a strap file from this app'); } });
  }
});
document.addEventListener('click', e => { const b = e.target.closest('[data-act="pesex"]'); if (b) { PE.sex = b.dataset.v; buzz('tick'); $$('.seg button[data-act="pesex"]').forEach(x => x.classList.toggle('on', x === b)); } });
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-strap.js');

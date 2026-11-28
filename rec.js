'use strict';
// Every strap recording, kept whole: the beats exactly as the strap sent them (its own 1/1024 s units), each
// Bluetooth packet's time, heart rate and skin contact, the marks, your notes, and your edits, which sit beside the
// recording and never change it. One store for every kind (morning check, spot check, Live, cardio, the Lab) and for
// every person who wears the strap.
//
// Where it lives: inside the Android app, one file per recording in the app's private storage (the vault, Vault.kt),
// which nothing but uninstalling or "Clear storage" removes; a deleted recording sits in a bin there for 30 days.
// IndexedDB keeps a second copy (no practical size limit, and asked to be kept by the browser), with every recording also
// held in memory once loaded. Without IndexedDB (an old browser, the engine tests) it falls back to localStorage,
// then to memory alone. Writes made before the store has opened are queued, never lost. Backups and exports carry
// every recording; an import merges them by id, keeping the newer edit of each.
//
// Only recordings of you feed the rest of the app: a morning check of yours keeps its summary in S.hrv (the verdict
// reads it), a Lab session in S.lab, a cardio session in S.cardio, linked by rec.ref. A recording of anyone else stays
// here and is read only against that person's own earlier recordings.

const RSTORE = { map: new Map(), ready: false, db: null, mode: 'mem', err: '', queue: [], sum: new Map(), loaded: 0 };
const REC_DB = 'health-strap', REC_LS = 'health.recs';
const REC_KINDS = {
  morning: ['Morning check', 'heart'], spot: ['Spot check', 'heart'], live: ['Live', 'trend'], cardio: ['Cardio', 'run'], hrr: ['Heart-rate recovery', 'down'],
  breathe: ['Breathe', 'breath'], rf: ['Resonance finder', 'wave'], ortho: ['Stand-up test', 'stand'], raw: ['Recording', 'heart'],
};
const REC_POS = { lying: 'Lying', sitting: 'Sitting', standing: 'Standing', moving: 'Moving' };
const PERSON_ID = /^p[a-z0-9]{4,12}$/;

// ---------- what a recording may hold ----------
// Any plain value from a known kind's own fields: numbers, short strings, booleans, and arrays and objects of those,
// to a bounded depth and size. Hostile keys never survive.
function plain(v, depth = 0) {
  if (v == null || typeof v === 'boolean') return v ?? null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v.slice(0, 200);
  if (depth > 3) return null;
  if (Array.isArray(v)) return v.slice(0, 2000).map(x => plain(x, depth + 1));
  if (typeof v === 'object') { const r = {}; for (const k of Object.keys(v).slice(0, 60)) if (!BAD.has(k) && k.length <= 24) r[k] = plain(v[k], depth + 1); return r; }
  return null;
}
function whoOk(w) { return w === 'me' || (typeof w === 'string' && PERSON_ID.test(w)) ? w : 'me'; }
function intArr(a, lo, hi, max) { return Array.isArray(a) ? a.slice(0, max).map(x => num(x, lo, hi)).filter(x => x != null).map(Math.round) : []; }
function cleanRec(v) {
  if (!obj(v)) return null;
  const id = str(v.id, 24), t0 = num(v.t0, 1e12, 1e13);
  if (!/^r\d{13}[a-z0-9]{0,4}$/.test(id) || t0 == null) return null;
  const r = { id, v: 1, kind: REC_KINDS[v.kind] ? v.kind : 'raw', who: whoOk(v.who), t0: Math.round(t0) };
  // Beats: ru in the strap's 1/1024 s (lossless), or rr in ms for recordings made before raw units were kept.
  const ru = intArr(v.ru, 200, 2700, 60000), rr = ru.length ? [] : intArr(v.rr, 195, 2600, 60000);
  if (ru.length) r.ru = ru; else if (rr.length) r.rr = rr;
  // Packets: [index of the last beat in it, ms from t0 at arrival, bpm, contact 0 none / 1 yes / 2 not reported].
  if (Array.isArray(v.pk) && (r.ru || r.rr)) {
    const n = (r.ru || r.rr).length, pk = [];
    for (const p of v.pk.slice(0, 40000)) {
      if (!Array.isArray(p)) continue;
      const i = num(p[0], 0, n - 1), ms = num(p[1], -5000, 864e5);
      if (i == null || ms == null) continue;
      pk.push([Math.round(i), Math.round(ms), Math.round(num(p[2], 0, 255) ?? 0), [0, 1, 2].includes(p[3]) ? p[3] : 2]);
    }
    if (pk.length) r.pk = pk;
  }
  // Heart rate every 5 s (cardio saved before beats were kept), 0 where the strap had no contact.
  if (Array.isArray(v.tr)) { const tr = v.tr.slice(0, 4320).map(x => Math.round(num(x, 30, 230) || 0)); if (tr.some(Boolean)) r.tr = tr; }
  if (!r.ru && !r.rr && !r.tr) return null;
  if (Array.isArray(v.marks)) { const m = v.marks.slice(0, 200).filter(x => Array.isArray(x) && num(x[0], 0, 86400) != null && typeof x[1] === 'string' && x[1].trim()).map(x => [r1(+x[0]), x[1].trim().slice(0, 30)]); if (m.length) r.marks = m.sort((a, b) => a[0] - b[0]); }
  const ed = obj(v.edits);
  if (ed) {
    const e = {};
    if (Array.isArray(ed.trim) && num(ed.trim[0], 0, 864e5) != null && num(ed.trim[1], 0, 864e5) != null && ed.trim[1] > ed.trim[0]) e.trim = [r1(+ed.trim[0]), r1(+ed.trim[1])];
    if (Array.isArray(ed.ex)) { const ex = ed.ex.slice(0, 200).filter(x => Array.isArray(x) && num(x[0], 0, 864e5) != null && num(x[1], 0, 864e5) != null && x[1] > x[0]).map(x => [r1(+x[0]), r1(+x[1])]); if (ex.length) e.ex = ex; }
    if (obj(ed.beat)) { const b = {}; for (const k of Object.keys(ed.beat).slice(0, 5000)) if (/^\d{1,6}$/.test(k) && (ed.beat[k] === 'keep' || ed.beat[k] === 'drop')) b[k] = ed.beat[k]; if (Object.keys(b).length) e.beat = b; }
    if (Object.keys(e).length) r.edits = e;
  }
  if (REC_POS[v.pos]) r.pos = v.pos;
  for (const [k, n] of [['note', 2000], ['title', 60], ['dev', 40]]) { const s = str(v[k], n).trim(); if (s) r[k] = s; }
  if (v.inc === true) r.inc = true;
  if (v.live === true) r.live = true;
  if (v.rcv === true) r.rcv = true;   // recovered after the app closed while it ran
  const ref = obj(v.ref);
  if (ref && ['hrv', 'lab', 'cardio'].includes(ref.s) && DATE.test(ref.k)) r.ref = { s: ref.s, k: ref.k, ...(num(ref.t, 1e12, 1e13) != null ? { t: +ref.t } : {}) };
  if (obj(v.x)) r.x = plain(v.x);
  r.at = num(v.at, 1e12, 1e13) ?? Date.now();
  return r;
}
function cleanPerson(p) {
  if (!obj(p) || !PERSON_ID.test(p.id)) return null;
  const n = str(p.n, 30).trim();
  if (!n) return null;
  const r = { id: p.id, n };
  if (p.sex === 'm' || p.sex === 'f') r.sex = p.sex;
  const by = num(p.by, 1900, 2030); if (by != null) r.by = Math.round(by);
  const note = str(p.note, 300).trim(); if (note) r.note = note;
  return r;
}

// ---------- people ----------
function people() { return S.people || []; }
function personOf(who) { return who === 'me' ? null : people().find(p => p.id === who) || null; }
function personName(who, me = 'You') { return who === 'me' ? me : personOf(who)?.n || 'Someone removed'; }
function personAge(who) {
  if (who === 'me') return Math.floor(ageYears());
  const p = personOf(who); return p?.by ? new Date().getFullYear() - p.by : null;
}
// Maximum heart rate: yours from the app's profile; anyone else's from age (Tanaka 2001: 208 − 0.7 × age).
function hrMaxOf(who) {
  if (who === 'me') return hrProfile().max;
  const a = personAge(who); return a ? Math.round(208 - 0.7 * a) : null;
}
function newPersonId() { return 'p' + Math.random().toString(36).slice(2, 9).padEnd(6, '0'); }

// ---------- the store ----------
function recAll() { return [...RSTORE.map.values()]; }
function recGet(id) { return RSTORE.map.get(id) || null; }
function recList(f = {}) {
  return recAll().filter(r => (!f.who || r.who === f.who) && (!f.kind || r.kind === f.kind) && !r.live).sort((a, b) => b.t0 - a.t0);
}
function lsAll() { try { const a = JSON.parse(localStorage.getItem(REC_LS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function lsWrite() { try { localStorage.setItem(REC_LS, JSON.stringify(recAll())); return true; } catch (e) { return false; } }
function idbReq(rq) { return new Promise((ok, no) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error); }); }
const RVH = typeof VH !== 'undefined' ? VH : null;
function recFile(op, x) { if (!RVH) return; try { op === 'put' ? RVH.recPut(x.id, JSON.stringify(x)) : RVH.recDel(x); } catch (e) { recFail(e); } }
function recDbWrite(ops) {
  for (const [op, x] of ops) recFile(op, x);
  if (RSTORE.mode === 'idb' && RSTORE.db) {
    try {
      const tx = RSTORE.db.transaction('recs', 'readwrite'), st = tx.objectStore('recs');
      for (const [op, x] of ops) op === 'put' ? st.put(x) : st.delete(x);
      tx.onerror = () => recFail(tx.error);
      tx.onabort = () => recFail(tx.error);
    } catch (e) { recFail(e); }
  } else if (RSTORE.mode === 'ls' && !lsWrite()) recFail(new Error('localStorage full'));
}
function recFail(e) {
  if (!RSTORE.err) toast('A strap recording could not be written to storage. Export your recordings from Strap › Sessions.', 6000);
  RSTORE.err = String(e?.message || e || 'write failed');
  logError?.(e instanceof Error ? e : new Error(RSTORE.err));
}
function recPut(v, quiet) {
  const r = cleanRec(Object.assign({}, v, { at: Date.now() }));
  if (!r) return null;
  RSTORE.map.set(r.id, r);
  RSTORE.sum.delete(r.id);
  if (RSTORE.ready) recDbWrite([['put', r]]); else RSTORE.queue.push(['put', r]);
  if (!quiet) memo.clear();
  return r;
}
function recDel(id) {
  const was = RSTORE.map.get(id);
  if (!was) return null;
  RSTORE.map.delete(id); RSTORE.sum.delete(id);
  if (RSTORE.ready) recDbWrite([['del', id]]); else RSTORE.queue.push(['del', id]);
  return was;
}
// Opens the store, loads everything, applies anything written before it opened, brings in recordings the app kept
// before this store existed, and settles drafts left by a session that never finished.
async function recInit() {
  let rows = [];
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('no IndexedDB');
    const rq = indexedDB.open(REC_DB, 1);
    rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('recs')) rq.result.createObjectStore('recs', { keyPath: 'id' }); };
    RSTORE.db = await idbReq(rq);
    RSTORE.db.onversionchange = () => RSTORE.db.close();
    rows = await idbReq(RSTORE.db.transaction('recs').objectStore('recs').getAll());
    RSTORE.mode = 'idb';
    // Recordings kept in localStorage while IndexedDB was not available move across once.
    const ls = lsAll();
    if (ls.length) { rows = rows.concat(ls); try { localStorage.removeItem(REC_LS); } catch (e) { /* keep */ } }
  } catch (e) {
    try { localStorage.getItem('x'); RSTORE.mode = 'ls'; rows = lsAll(); } catch (e2) { RSTORE.mode = 'mem'; }
  }
  // The vault's files are the main copy in the app: anything only one side has is copied to the other.
  let files = [];
  if (RVH) { try { files = JSON.parse(RVH.recAll()) || []; } catch (e) { files = []; logError?.(new Error('Recordings in the app’s files could not be read')); } }
  const inFiles = new Map(files.map(x => [x?.id, x?.at || 0]));
  rows = rows.concat(files);
  for (const x of rows) {
    const r = cleanRec(x);
    if (!r) continue;
    const cur = RSTORE.map.get(r.id);
    if (!cur || cur.at < r.at) RSTORE.map.set(r.id, r);
  }
  RSTORE.loaded = RSTORE.map.size;
  RSTORE.ready = true;
  const q = RSTORE.queue.splice(0);
  if (q.length) recDbWrite(q);
  if (RSTORE.mode === 'ls' && rows.length) lsWrite();
  if (RVH) for (const r of RSTORE.map.values()) if (!inFiles.has(r.id) || inFiles.get(r.id) < r.at) recFile('put', r);
  recSettleDrafts();
  recMigrate();
  memo.clear();
  if (typeof renderSoft === 'function') renderSoft();
  return RSTORE.mode;
}
// A draft is written every 10 seconds while a recording runs. One still marked live when no recording is running
// was cut short (the app closed or crashed): it is kept as a recording, marked recovered, never thrown away.
function recSettleDrafts() {
  const running = typeof HR !== 'undefined' && HR.mode ? 'r' + HR.t0 : null;
  for (const r of recAll()) if (r.live && r.id !== running) recPut(Object.assign({}, r, { live: false, rcv: true, inc: true }), true);
}

// ---------- recordings made before this store ----------
// Morning checks, Lab sessions and cardio sessions already in the app each become a recording once, linked back to
// where they came from. A recording you delete takes its source with it, so nothing comes back.
function recMigrate() {
  const has = new Set(recAll().map(r => r.ref ? `${r.ref.s}|${r.ref.k}|${r.ref.t || ''}` : ''));
  const add = (v, ref) => { if (!has.has(`${ref.s}|${ref.k}|${ref.t || ''}`)) recPut(Object.assign(v, { ref, who: 'me' }), true); };
  for (const [k, x] of Object.entries(S.hrv || {})) {
    if (!x.rr || x.rr.length < 20) continue;
    const end = x.t || Date.parse(k + 'T07:00'), t0 = Math.round(end - x.rr.reduce((a, b) => a + b, 0));
    add({ id: `r${t0}h`, kind: 'morning', t0, rr: x.rr, pos: x.pos, x: { mig: 1 } }, { s: 'hrv', k });
  }
  for (const [k, list] of Object.entries(S.lab || {})) for (const x of list) {
    if (!(x.rr?.length >= 20)) continue;
    const marks = x.kind === 'live' ? (x.seg || []).map(s => [s[1], LIVETAGS[s[0]] || s[0]]) : [];
    const ex = Object.assign({}, x); delete ex.rr; delete ex.t;
    add({ id: `r${x.t}l`, kind: x.kind, t0: x.t, rr: x.rr, pos: x.pos, marks, x: Object.assign(ex, { mig: 1 }) }, { s: 'lab', k, t: x.t });
  }
  for (const [k, list] of Object.entries(S.cardio || {})) for (const c of list) {
    if (c.m || !c.t || !(c.tr?.filter(Boolean).length >= 4)) continue;
    const ex = Object.assign({}, c); delete ex.tr; delete ex.t;
    add({ id: `r${c.t}c`, kind: 'cardio', t0: c.t, tr: c.tr, pos: 'moving', x: Object.assign(ex, { mig: 1 }) }, { s: 'cardio', k, t: c.t });
  }
}

// ---------- reading a recording ----------
// The series and the whole-recording analysis, worked out once per version of the recording.
function recRead(r) {
  if (!r) return null;
  const key = r.id + '|' + r.at, hit = RSTORE.sum.get(r.id);
  if (hit && hit.key === key) return hit;
  const X = r.ru || r.rr ? recSeries(r) : null;
  const A = X ? analyse(X, 0, X.n, X.dur <= 3600) : null;
  const out = { key, X, A, dur: X ? X.dur : (r.tr || []).length * 5 };
  RSTORE.sum.set(r.id, out);
  return out;
}
// Whether you changed anything: the trim a session sets for itself (its settling part) does not count.
function recEdited(r) {
  const e = r.edits;
  return !!(e && (e.ex || e.beat || (e.trim && JSON.stringify(e.trim) !== JSON.stringify(r.x?.trim0))));
}
function recTitle(r) { return r.title || REC_KINDS[r.kind][0]; }
function recWhen(r, o = { weekday: 'short', day: 'numeric', month: 'short' }) { const d = new Date(r.t0); return `${dateLabel(dk(d), o)} · ${hms(d)}`; }
function hms(d, ms) { const p = n => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${ms ? '.' + String(d.getMilliseconds()).padStart(3, '0') : ''}`; }
// The same person's earlier recordings of the same kind and position, for reading this one against them.
function recPeers(r, n = 30) {
  return recList({ who: r.who, kind: r.kind }).filter(x => x.id !== r.id && x.t0 < r.t0 && (x.pos || '') === (r.pos || '') && !x.inc).slice(0, n);
}

// ---------- keeping the rest of the app in step ----------
// A recording of you with a summary elsewhere (the morning check the verdict reads, a spot check) has that summary
// worked out again from the recording as you edited it, so excluding a noisy minute changes the verdict too.
function recSyncS(r) {
  if (!r?.ref || r.who !== 'me') return;
  const R = recRead(r), A = R?.A;
  if (!A || !R.X) return;
  const keep = [];
  for (const [a, b] of R.X.runs) for (let i = a; i < b; i++) keep.push(Math.round(R.X.rr[i]));
  const base = { rmssd: r1(A.rmssd), hr: r1(A.hr), q: A.q, sd: r1(A.sdnn), pnn: r1(A.pnn50), sd1: r1(A.sd1), sd2: r1(A.sd2), dur: Math.round(A.dur) };
  if (A.hf != null) base.hf = Math.round(A.hf);
  if (A.lf != null) base.lf = Math.round(A.lf);
  if (A.br != null) base.br = r1(A.br);
  if (r.ref.s === 'hrv' && S.hrv[r.ref.k]) {
    const x = S.hrv[r.ref.k];
    S.hrv[r.ref.k] = cleanHrv(Object.assign({}, x, base, { pos: r.pos === 'sitting' ? 'sitting' : x.pos, rr: keep }));
  } else if (r.ref.s === 'lab') {
    const x = (S.lab[r.ref.k] || []).find(y => y.t === r.ref.t);
    if (x && (x.kind === 'spot' || x.kind === 'live')) Object.assign(x, base, { rr: keep });
  }
}
// Where a recording's summary lives in the app, if it is yours.
function recRefEntry(ref) {
  if (!ref) return null;
  if (ref.s === 'hrv') return S.hrv[ref.k] || null;
  return (S[ref.s]?.[ref.k] || []).find(y => y.t === ref.t) || null;
}
function recRefRemove(ref) {
  if (!ref) return null;
  if (ref.s === 'hrv') { const was = S.hrv[ref.k]; delete S.hrv[ref.k]; return was ? () => { S.hrv[ref.k] = was; } : null; }
  const list = S[ref.s]?.[ref.k];
  const i = list ? list.findIndex(y => y.t === ref.t) : -1;
  if (i < 0) return null;
  const was = list[i]; list.splice(i, 1); if (!list.length) delete S[ref.s][ref.k];
  return () => { (S[ref.s][ref.k] ||= []).splice(i, 0, was); };
}
// A recording moved to you that has nowhere in the app yet gets its summary there: a morning check becomes the
// day's morning check (only when that morning has none), a spot check joins the Lab.
function recRefCreate(r) {
  const R = recRead(r), A = R?.A, k = dk(new Date(r.t0));
  if (!A) return null;
  const keep = [];
  for (const [a, b] of R.X.runs) for (let i = a; i < b; i++) keep.push(Math.round(R.X.rr[i]));
  const base = { rmssd: r1(A.rmssd), hr: r1(A.hr), q: A.q, sd: r1(A.sdnn), pnn: r1(A.pnn50), sd1: r1(A.sd1), sd2: r1(A.sd2), dur: Math.round(A.dur), rr: keep };
  if (r.kind === 'morning' && !S.hrv[k]) { const c = cleanHrv(Object.assign(base, { t: r.t0 + Math.round(R.dur * 1000), pos: r.pos === 'sitting' ? 'sitting' : 'lying' })); if (c) { S.hrv[k] = c; return { s: 'hrv', k }; } }
  if (r.kind === 'spot' || (r.kind === 'morning' && S.hrv[k])) { const c = cleanLab(Object.assign({ kind: 'spot', t: r.t0, pos: r.pos === 'lying' || r.pos === 'standing' ? r.pos : 'sitting' }, base)); if (c) { (S.lab[k] ||= []).push(c); return { s: 'lab', k, t: r.t0 }; } }
  return null;
}
// Gives a recording to someone else (or back to you). Leaving you takes its summary out of your data; coming to you
// puts one in. Returns an undo.
function recMove(r, who) {
  if (r.who === who) return null;
  const was = Object.assign({}, r), undoS = r.who === 'me' ? recRefRemove(r.ref) : null;
  const next = Object.assign({}, r, { who });
  if (who !== 'me') delete next.ref;
  else { const ref = recRefCreate(next); if (ref) next.ref = ref; }
  const saved = recPut(next);
  save();
  return () => { if (saved?.ref && who === 'me') recRefRemove(saved.ref); undoS?.(); recPut(was); };
}

// ---------- files ----------
// Everything for a backup: the app's data and every recording.
function backupObj() { return Object.assign({}, S, { recs: recList().concat(recAll().filter(r => r.live)) }); }
function backupText() { return JSON.stringify(backupObj()); }
function recMerge(list) {
  let added = 0, newer = 0;
  for (const x of Array.isArray(list) ? list.slice(0, 20000) : []) {
    const r = cleanRec(x);
    if (!r) continue;
    const cur = RSTORE.map.get(r.id);
    if (cur && cur.at >= r.at) continue;
    cur ? newer++ : added++;
    RSTORE.map.set(r.id, r); RSTORE.sum.delete(r.id);
    if (RSTORE.ready) recDbWrite([['put', r]]); else RSTORE.queue.push(['put', r]);
  }
  return { added, newer };
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('rec.js');

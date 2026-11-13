'use strict';
// Amazfit / Zepp data from the CSV files of the Zepp app's own "Export data": the fallback when Health Connect
// is not available. Files are recognised by their column names, reduced to daily figures, previewed, then
// merged exactly like a Health Connect sync.
let watchPreview = null;

function csvRows(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const head = (lines.shift() || '').split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  return { head, lines };
}
function when(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  const d = Number.isFinite(n) ? new Date(n < 1e11 ? n * 1000 : n) : new Date(String(v).trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return isNaN(d) ? null : d;
}
function parseWatch(name, text) {
  const { head, lines } = csvRows(text), col = n => head.indexOf(n), days = {}, out = { name, kind: null, P: { days } };
  const iDate = col('date'), day = k => (days[k] ||= {});
  if (col('steps') >= 0 && iDate >= 0 && col('time') < 0) {
    out.kind = 'steps';
    const iS = col('steps'), iDi = col('distance'), iC = col('calories');
    for (const l of lines) {
      const c = l.split(','), k = c[iDate];
      if (!DATE.test(k)) continue;
      const s = num(c[iS], ...LIMITS.steps); if (s != null) day(k).st = Math.round(s);
      if (iDi >= 0 && num(c[iDi], 0, 200000) != null) day(k).di = +c[iDi];
      if (iC >= 0 && num(c[iC], 0, 10000) != null) day(k).ak = +c[iC];
    }
  } else if (col('deepsleeptime') >= 0 && iDate >= 0) {
    out.kind = 'sleep';
    const iD = col('deepsleeptime'), iL = col('shallowsleeptime'), iR = col('remtime'), iW = col('waketime'), iOn = col('start'), iOff = col('stop');
    for (const l of lines) {
      const c = l.split(','), k = c[iDate];
      const d = num(c[iD], 0, 1440) || 0, li = num(c[iL], 0, 1440) || 0, r = num(c[iR], 0, 1440) || 0;
      if (!DATE.test(k) || d + li + r < 30) continue;
      const on = iOn >= 0 ? when(c[iOn]) : null, off = iOff >= 0 ? when(c[iOff]) : null;
      let m = on ? on.getHours() * 60 + on.getMinutes() : null;
      if (m != null && m > 720) m -= 1440;   // minutes from midnight; the evening before is negative
      const sl = { d, l: li, r, w: num(c[iW], 0, 1440) || 0, on: m };
      if (on && off && off > on) sl.bed = Math.round((off - on) / 6e4);
      day(k).sl = sl;
    }
  } else if (col('heartrate') >= 0 && col('time') >= 0) {
    out.kind = 'heart rate';
    const iH = col('heartrate'), iT = col('time'), byDay = {};
    for (const l of lines) {
      const c = l.split(','), h = num(c[iH], 30, 220);
      if (h == null) continue;
      let k = iDate >= 0 ? c[iDate] : null;
      if (!k) { const d = when(c[iT]); k = d ? dk(d) : null; }
      if (k && DATE.test(k)) (byDay[k] ||= []).push(h);
    }
    // Resting estimate: the 5th percentile of the day's readings, which falls in sleep or quiet rest.
    for (const k in byDay) if (byDay[k].length >= 30) day(k).rp = Math.round(quantile(byDay[k], 0.05));
  }
  out.counts = countDays(days);
  return out;
}
async function watchRead(files) {
  const found = [];
  for (const f of [...files].slice(0, 20)) {
    if (f.size > 150e6) { found.push({ name: f.name, kind: null, note: 'too large' }); continue; }
    try { found.push(parseWatch(f.name, await f.text())); } catch (e) { found.push({ name: f.name, kind: null, note: 'could not be read' }); }
  }
  watchPreview = found;
  render();
}
function watchAct(a) {
  if (a === 'wpick') return $('#wfile').click();
  if (a === 'wcancel') { watchPreview = null; return render(); }
  if (a === 'wsave') {
    const days = {};
    for (const f of watchPreview) if (f.kind) for (const [k, d] of Object.entries(f.P.days)) Object.assign(days[k] ||= {}, d);
    const got = mergeSync({ days });
    watchPreview = null; save();
    toast(`Imported ${plural(got.days, 'day')}`);
    return render();
  }
}
function watchPreviewBlock() {
  const span = d => { const k = Object.keys(d).sort(); return k.length ? `${k.length} days, ${dateLabel(k[0])} to ${dateLabel(k[k.length - 1])}` : 'no usable rows'; };
  return `<ul class="list">${watchPreview.map(f => `<li><span class="nm">${esc(f.name)}</span><span class="sub">${f.kind ? `${f.kind}: ${span(f.P.days)}` : `not recognised${f.note ? ', ' + f.note : ''}`}</span></li>`).join('')}</ul>
    <p class="sub">Days you typed in yourself are kept as they are.</p>
    <div class="rowb">${watchPreview.some(f => f.kind) ? '<button class="solid" data-act="wsave">Import</button>' : ''}<button class="ghost" data-act="wcancel">Cancel</button></div>`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('watch.js');

'use strict';
// Amazfit / Zepp data arrives as the CSV files from the Zepp app's own "Export data".
// Files are recognised by their column names, not their file names, and only daily
// summaries are kept: steps, sleep stages and bedtime, and a resting heart-rate estimate.
let watchPreview = null;

function csvRows(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
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
  const { head, lines } = csvRows(text), col = n => head.indexOf(n), out = { name, kind: null, steps: {}, sleep: {}, sleepx: {}, hr: {} };
  const iDate = col('date');
  if (col('steps') >= 0 && iDate >= 0 && col('time') < 0) {
    out.kind = 'steps';
    const iS = col('steps');
    for (const l of lines) { const c = l.split(','), s = num(c[iS], ...LIMITS.steps); if (DATE.test(c[iDate]) && s != null) out.steps[c[iDate]] = Math.round(s); }
  } else if (col('deepsleeptime') >= 0 && iDate >= 0) {
    out.kind = 'sleep';
    const iD = col('deepsleeptime'), iL = col('shallowsleeptime'), iR = col('remtime'), iW = col('waketime'), iOn = col('start');
    for (const l of lines) {
      const c = l.split(','), k = c[iDate];
      const d = num(c[iD], 0, 1440) || 0, li = num(c[iL], 0, 1440) || 0, r = num(c[iR], 0, 1440) || 0, total = d + li + r;
      if (!DATE.test(k) || total < 30 || total > 1440) continue;
      const on = iOn >= 0 ? when(c[iOn]) : null;
      let m = on ? on.getHours() * 60 + on.getMinutes() : null;
      if (m != null && m > 720) m -= 1440; // minutes from midnight; before midnight is negative
      out.sleep[k] = Math.round(total / 6) / 10;
      out.sleepx[k] = { d, l: li, r, w: num(c[iW], 0, 1440) || 0, on: m };
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
    // Resting estimate: the 5th percentile of the day's readings, which sits in deep sleep or quiet rest.
    for (const k in byDay) if (byDay[k].length >= 30) { const a = byDay[k].sort((x, y) => x - y); out.hr[k] = a[Math.floor(a.length * 0.05)]; }
  }
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
function span(o) { const k = Object.keys(o).sort(); return k.length ? `${k.length} days, ${k[0]} to ${k[k.length - 1]}` : 'no usable rows'; }
function watchAct(a) {
  if (a === 'wpick') return $('#wfile').click();
  if (a === 'wcancel') { watchPreview = null; return render(); }
  if (a === 'wsave') {
    let last = S.meta.watch || '';
    for (const f of watchPreview) {
      if (!f.kind) continue;
      Object.assign(S.steps, f.steps); Object.assign(S.sleep, f.sleep); Object.assign(S.sleepx, f.sleepx); Object.assign(S.rhr, f.hr);
      for (const k of [...Object.keys(f.steps), ...Object.keys(f.sleep), ...Object.keys(f.hr)]) if (k > last && k <= dk(new Date())) last = k;
    }
    S.meta.watch = last || null; watchPreview = null; save(); toast('Watch data imported'); return render();
  }
}
function vWatch() {
  const body = watchPreview ? `<ul class="evid">${watchPreview.map(f => `<li><span class="nm">${esc(f.name)}</span><span class="sub">${f.kind ? `${f.kind}: ${span(f.kind === 'steps' ? f.steps : f.kind === 'sleep' ? f.sleep : f.hr)}` : `not recognised${f.note ? ', ' + f.note : ''}`}</span></li>`).join('')}</ul>
      <div class="rowb" style="margin-top:12px">${watchPreview.some(f => f.kind) ? '<button class="solid" data-act="wsave">Import</button>' : ''}<button class="ghost" data-act="wcancel">Cancel</button></div>`
    : `<p class="sub">${S.meta.watch ? `Watch data in the app up to ${S.meta.watch}.` : 'No watch data yet.'}</p>
      <ol class="sub steps"><li>Zepp app → Profile → Settings → Account → Export data. Pick activity, sleep and heart rate.</li><li>Zepp emails a zip and shows a password. Unzip it in your Files app.</li><li>Tap below and select the CSV files together.</li></ol>
      <button class="solid" data-act="wpick">Choose Zepp files</button><input type="file" id="wfile" accept=".csv,text/csv,text/comma-separated-values" multiple hidden>`;
  return `<section class="block"><h2>Amazfit data</h2>${body}</section>`;
}

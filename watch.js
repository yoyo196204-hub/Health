'use strict';
// Amazfit / Zepp history from the Zepp app's own "Export data": the zip as Zepp emails it (password and all), or the
// CSV files inside it. Health Connect brings the recent weeks by itself; this brings everything from before. Files
// are recognised by their columns, not their names, reduced to daily figures, previewed, then merged exactly like a
// Health Connect sync: what you typed yourself is never overwritten, and anything you deleted stays deleted.
let watchPreview = null;
// A zip being opened: the file, whether it needs a password, progress, and what went wrong.
const WZIP = { file: null, need: false, busy: false, msg: '', err: '' };

// One CSV, read line by line: the first line names the columns, and they decide what the file is.
function watchParser(name) {
  const days = {}, day = k => (days[k] ||= {}), out = { name, kind: null, P: { days } };
  let head = null, col, iDate, fn = null, done = null;
  const kinds = {
    // Daily activity: date, steps, distance, calories.
    steps() {
      const iS = col('steps'), iDi = col('distance'), iC = col('calories');
      return c => {
        const k = c[iDate];
        if (!DATE.test(k)) return;
        const s = num(c[iS], ...LIMITS.steps); if (s != null) day(k).st = Math.round(s);
        if (iDi >= 0 && num(c[iDi], 0, 200000) != null) day(k).di = +c[iDi];
        if (iC >= 0 && num(c[iC], 0, 10000) != null) day(k).ak = +c[iC];
      };
    },
    // Nights: deep, light and REM minutes, awake time, and when it started and stopped.
    sleep() {
      const iD = col('deepsleeptime'), iL = col('shallowsleeptime'), iR = col('remtime'), iW = col('waketime'), iOn = col('start'), iOff = col('stop');
      return c => {
        const k = c[iDate], d = num(c[iD], 0, 1440) || 0, li = num(c[iL], 0, 1440) || 0, r = num(c[iR], 0, 1440) || 0;
        if (!DATE.test(k) || d + li + r < 30) return;
        const on = iOn >= 0 ? when(c[iOn]) : null, off = iOff >= 0 ? when(c[iOff]) : null;
        let m = on ? on.getHours() * 60 + on.getMinutes() : null;
        if (m != null && m > 720) m -= 1440;   // minutes from midnight; the evening before is negative
        const sl = { d, l: li, r, w: num(c[iW], 0, 1440) || 0, on: m };
        if (on && off && off > on) sl.bed = Math.round((off - on) / 6e4);
        day(k).sl = sl;
      };
    },
    // Heart rate through the day, every minute or so. Kept per day as a resting estimate and a 5-minute curve.
    hr() {
      const iH = col('heartrate'), iT = col('time'), byDay = {}, bins = {};
      done = () => {
        // Resting estimate: the 5th percentile of the day's readings, which falls in sleep or quiet rest.
        for (const k in byDay) if (byDay[k].length >= 30) day(k).rp = Math.round(quantile(byDay[k], 0.05));
        // The 24-hour curve only for the last weeks: the app keeps 45 days of them.
        const from = shift(todayKey(), -45);
        for (const k in bins) if (k >= from) { const hd = Array.from({ length: 288 }, (_, i) => bins[k][i] ? Math.round(median(bins[k][i])) : 0); if (hd.filter(Boolean).length >= 12) day(k).hd = hd; }
      };
      const recent = shift(todayKey(), -45);
      return c => {
        const h = +c[iH];
        if (!(h >= 30 && h <= 220)) return;
        let k = iDate >= 0 ? c[iDate] : null, min = null;
        const t = c[iT] || '';
        // The usual layout, date and HH:MM, read as text: years of minute-by-minute readings stay quick.
        if (k && t.length >= 4 && t.length <= 8 && t.charCodeAt(t.length - 3) === 58) min = (t.length === 5 || t.length === 8 ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : +t.slice(0, 1) * 60 + +t.slice(2, 4));
        else {
          const d = when(k && t && !/[-T]/.test(t) ? `${k} ${t}` : t);
          if (!d) return;
          if (!k) k = dk(d);
          if (dk(d) === k) min = d.getHours() * 60 + d.getMinutes();
        }
        if (k.length !== 10 || !DATE.test(k)) return;
        (byDay[k] ||= []).push(h);
        if (min != null && min >= 0 && min < 1440 && k >= recent) ((bins[k] ||= {})[Math.floor(min / 5)] ||= []).push(h);
      };
    },
    // A Zepp scale: weight, and its body-fat reading. The last reading of a day is the day's.
    body() {
      const iW = col('weight'), iT = col('time') >= 0 ? col('time') : iDate, iF = col('fatrate');
      return c => {
        const w = num(c[iW], ...LIMITS.weights), d = when(c[iT]);
        if (w == null || !d) return;
        const k = DATE.test(c[iT]) ? c[iT] : dk(d);
        day(k).wt = w;
        const f = iF >= 0 ? num(c[iF], 3, 70) : null; if (f != null) day(k).bf = f;
      };
    },
  };
  return {
    line(l) {
      if (!head && !l.trim()) return;
      if (head && !fn) return false;
      if (!head) {
        head = l.split(',').map(h => h.trim().replace(/"/g, '').replace(/^\uFEFF/, '').toLowerCase());
        col = n => head.indexOf(n); iDate = col('date');
        const k = col('steps') >= 0 && iDate >= 0 && col('time') < 0 ? 'steps'
          : col('deepsleeptime') >= 0 && iDate >= 0 ? 'sleep'
          : col('heartrate') >= 0 && col('time') >= 0 ? 'hr'
          : col('weight') >= 0 && (col('time') >= 0 || iDate >= 0) && col('nickname') < 0 && col('avatar') < 0 ? 'body' : null;
        if (k) { out.kind = { steps: 'steps', sleep: 'sleep', hr: 'heart rate', body: 'weight' }[k]; fn = kinds[k](); }
        return !!fn;
      }
      fn(l.split(','));
    },
    end() { done?.(); out.counts = countDays(days); return out; },
  };
}
function parseWatch(name, text) { const P = watchParser(name); for (const l of text.replace(/^\uFEFF/, '').split(/\r?\n/)) if (l && P.line(l) === false) break; return P.end(); }
function when(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  const d = Number.isFinite(n) ? new Date(n < 1e11 ? n * 1000 : n) : new Date(String(v).trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return isNaN(d) ? null : d;
}
// Several files of one kind (Zepp splits long histories) become one line in the preview.
function watchGroup(list) {
  const by = {};
  for (const f of list) {
    if (!f.kind) continue;
    const g = by[f.kind] ||= { name: '', files: 0, kind: f.kind, P: { days: {} } };
    g.files++; g.name = g.files > 1 ? `${g.files} files` : f.name;
    for (const [k, d] of Object.entries(f.P.days)) Object.assign(g.P.days[k] ||= {}, d);
  }
  return Object.values(by);
}
async function watchRead(files) {
  const list = [...files].slice(0, 20), zip = list.find(f => /\.zip$/i.test(f.name));
  if (zip) return zipImport(zip);
  const found = [];
  for (const f of list) {
    if (f.size > 150e6) { found.push({ name: f.name, kind: null, note: 'too large' }); continue; }
    // A zip renamed or picked without its extension is still a zip.
    const sig = new Uint8Array(await f.slice(0, 4).arrayBuffer());
    if (sig[0] === 0x50 && sig[1] === 0x4b && sig[2] === 3 && sig[3] === 4) return zipImport(f);
    try { found.push(parseWatch(f.name, await f.text())); } catch (e) { found.push({ name: f.name, kind: null, note: 'could not be read' }); }
  }
  watchPreview = found;
  render();
}
// What a Health Connect backup holds, for the preview: one line per kind, with how many days and from when to when.
const HCB_STEP = { steps_record_table: 'steps', distance_record_table: 'distance', active_calories_burned_record_table: 'active energy', total_calories_burned_record_table: 'total energy',
  sleep_stages_table: 'sleep stages', sleep_session_record_table: 'nights', resting_heart_rate_record_table: 'resting heart rate', heart_rate_variability_rmssd_record_table: 'overnight HRV',
  oxygen_saturation_record_table: 'blood oxygen', respiratory_rate_record_table: 'breathing rate', weight_record_table: 'weight', body_fat_record_table: 'body fat', vo2_max_record_table: 'VO2max',
  exercise_session_record_table: 'workouts', heart_rate_record_table: 'heart rate', heart_rate_record_series_table: 'heart rate' };
function hcPreview(H) {
  const ks = Object.keys(H.days).sort(), span = f => { const k = ks.filter(d => f(H.days[d])); return k.length ? `${k.length} days, ${dateLabel(k[0], { day: 'numeric', month: 'short', year: 'numeric' })} to ${dateLabel(k[k.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}` : null; };
  const lines = [['Steps', span(d => d.st != null)], ['Sleep', span(d => d.sl)], ['Heart rate', span(d => d.rh != null || d.rp != null)], ['Overnight HRV', span(d => d.hv != null)],
    ['Breathing in sleep', span(d => d.br != null)], ['Blood oxygen', span(d => d.o2 != null)], ['Weight', span(d => d.wt != null)], ['Body fat', span(d => d.bf != null)],
    ['Workouts', H.ex.length ? `${H.ex.length}` : null]].filter(x => x[1]);
  return { name: `Health Connect backup${H.watch ? ` · watch: ${H.watch}` : ''}`, kind: 'Health Connect backup', P: { days: H.days }, ex: H.ex, lines, apps: H.apps };
}
// Every CSV in an export, read and recognised: what it found, and what it left aside.
async function zipParse(u8, pw, progress = () => {}) {
  const all = zipEntries(u8).filter(e => !e.dir && /\.csv$/i.test(e.name));
  if (!all.length) throw zipErr('nocsv', 'There are no CSV files in this zip. Is it the Zepp export?');
  const pwb = pw ? new TextEncoder().encode(pw) : null, total = all.reduce((a, e) => a + e.csize, 0) || 1, found = [], other = [];
  let doneB = 0;
  for (const e of all) {
    const short = e.name.split('/').pop();
    progress(short, Math.round(doneB / total * 100)); await zipTick();
    const P = watchParser(short);
    await zipLines(u8, e, pwb, l => P.line(l));
    const r = P.end();
    (r.kind ? found : other).push(r);
    doneB += e.csize;
  }
  return { found, other };
}
function wzipPaint() { const el = $('#wzipmsg'); if (el) el.textContent = WZIP.msg; }
async function zipImport(file, pw = null) {
  Object.assign(WZIP, { file, busy: true, need: false, err: '', msg: 'Opening the export…' });
  watchPreview = null; render();
  try {
    if (file.size > 600e6) throw zipErr('big', 'That file is over 600 MB: export a shorter period from Zepp.');
    let u8 = new Uint8Array(await file.arrayBuffer());
    const dbe = zipEntries(u8).find(e => /(^|\/)health_connect_export\.db$/i.test(e.name));
    if (dbe) {
      if (dbe.encrypted && !pw) { Object.assign(WZIP, { busy: false, need: true }); return render(); }
      WZIP.msg = 'Unpacking the Health Connect backup…'; wzipPaint();
      let bytes = await zipBytes(u8, dbe, pw ? new TextEncoder().encode(pw) : null, f => { WZIP.msg = `Unpacking the Health Connect backup · ${Math.round(f * 100)}%`; wzipPaint(); });
      u8 = null;
      const H = await hcBackup(sqliteOpen(bytes), name => { WZIP.msg = `Reading ${HCB_STEP[name] || 'the backup'}…`; wzipPaint(); });
      bytes = null;
      watchPreview = [hcPreview(H)];
      Object.assign(WZIP, { file: null, busy: false, msg: '' }); buzz('ok');
      return render();
    }
    if (zipEntries(u8).some(e => e.encrypted && /\.csv$/i.test(e.name)) && !pw) { Object.assign(WZIP, { busy: false, need: true }); return render(); }
    const { found, other } = await zipParse(u8, pw, (name, pct) => { WZIP.msg = `Reading ${name} · ${pct}%`; wzipPaint(); });
    watchPreview = watchGroup(found);
    if (other.length) watchPreview.push({ name: plural(other.length, 'other file'), kind: null, note: 'workouts, minute steps and the like' });
    Object.assign(WZIP, { file: null, busy: false, msg: '' });
    buzz('ok');
  } catch (err) {
    console.error(err);
    const wrong = err.code === 'password';
    Object.assign(WZIP, { busy: false, need: wrong, err: wrong ? 'That password did not open it. Zepp shows it in the app (and in its email) when you ask for the export.' : err.message || 'The zip could not be read.' });
    if (!wrong) WZIP.file = null;
    buzz('warn');
  }
  render();
}
function watchAct(a) {
  if (a === 'wpick') return $('#wfile').click();
  if (a === 'wcancel') { watchPreview = null; Object.assign(WZIP, { file: null, need: false, busy: false, err: '' }); return render(); }
  if (a === 'wunlock') {
    const pw = $('#wzippw')?.value || '';
    if (!pw) { buzz('warn'); return toast('Type the password Zepp gave you'); }
    return zipImport(WZIP.file, pw);
  }
  if (a === 'wsave') {
    const days = {};
    for (const f of watchPreview) if (f.kind) for (const [k, d] of Object.entries(f.P.days)) Object.assign(days[k] ||= {}, d);
    // One sync takes at most 400 days, so years of history go in as several, oldest first.
    const keys = Object.keys(days).sort(), got = { days: 0 };
    snapshot(watchPreview.some(f => f.lines) ? 'Before importing a Health Connect backup' : 'Before importing Zepp history');
    for (let i = 0; i < keys.length; i += 400) got.days += mergeSync({ days: Object.fromEntries(keys.slice(i, i + 400).map(k => [k, days[k]])) }).days;
    if (keys.length && (!S.meta.watch || keys[keys.length - 1] > S.meta.watch)) S.meta.watch = keys[keys.length - 1];
    let wk = 0;
    for (const f of watchPreview) if (f.ex?.length) {
      const by = {};
      for (const w of f.ex) { const c = cleanEx(w); if (c && !S.gone.ex?.[String(c.s)]) (by[dk(new Date(c.s))] ||= []).push(c); }
      for (const [k, list] of Object.entries(by)) if (!S.ex[k] && k <= todayKey()) { S.ex[k] = list.slice(0, 20); wk += list.length; }
    }
    watchPreview = null; save(); buzz('done');
    toast(`Imported ${plural(got.days, 'day')}${wk ? ` and ${plural(wk, 'workout')}` : ''}`, 7000, { label: 'Undo', fn: () => { restoreSnapshot(); render(); toast('Import undone'); } });
    return render();
  }
}
function watchPreviewBlock() {
  const span = d => { const k = Object.keys(d).sort(); return k.length ? `${k.length} days, ${dateLabel(k[0], { day: 'numeric', month: 'short', year: 'numeric' })} to ${dateLabel(k[k.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}` : 'no usable rows'; };
  const hc = watchPreview.find(f => f.lines);
  if (hc) return `<p class="sub">${esc(hc.name)}. Written by ${hc.apps.map(esc).join(', ')}.</p><ul class="list">${hc.lines.map(([k, v]) => `<li><span class="grow"><span class="nm">${k}</span><span class="sub">${v}</span></span></li>`).join('')}</ul>
    <p class="sub">Where the watch and another app both wrote the same kind of data, the watch's figures are used, exactly as the daily sync does. Days you typed in yourself are kept as they are, workouts already here are not replaced, and a copy is kept first so the import can be undone.</p>
    <div class="rowb"><button class="solid" data-act="wsave">Import</button><button class="ghost" data-act="wcancel">Cancel</button></div>`;
  return `<ul class="list">${watchPreview.map(f => `<li><span class="grow"><span class="nm">${f.kind ? f.kind.replace(/^./, c => c.toUpperCase()) : esc(f.name)}</span><span class="sub">${f.kind ? `${span(f.P.days)} · ${esc(f.name)}` : `not used${f.note ? ', ' + esc(f.note) : ''}`}</span></span></li>`).join('')}</ul>
    <p class="sub">Days you typed in yourself are kept as they are, and a copy is kept first so the import can be undone.</p>
    <div class="rowb">${watchPreview.some(f => f.kind) ? '<button class="solid" data-act="wsave">Import</button>' : ''}<button class="ghost" data-act="wcancel">Cancel</button></div>`;
}
// The zip on its way in: a password to ask for, progress, or what went wrong.
function watchZipBlock() {
  if (WZIP.busy) return `<p class="sub" id="wzipmsg" aria-live="polite">${esc(WZIP.msg)}</p>`;
  if (WZIP.need) return `<p class="sub">${esc(WZIP.file?.name || 'The export')} is locked with a password. Zepp shows it in the app, and in its email, when you ask for the export.</p>
    <label class="line"><span class="sub">Password</span><span class="f"><input id="wzippw" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"></span></label>
    ${WZIP.err ? `<p class="flag small">${esc(WZIP.err)}</p>` : ''}
    <div class="rowb"><button class="solid" data-act="wunlock">Open</button><button class="ghost" data-act="wcancel">Cancel</button></div>`;
  return WZIP.err ? `<p class="flag">${esc(WZIP.err)}</p>` : '';
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'wzippw') { e.preventDefault(); watchAct('wunlock'); } });
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('watch.js');

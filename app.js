'use strict';

// ---------- state ----------
const KEY = 'health.v1';
const BLANK = { profile: null, weights: {}, waist: {}, food: {}, steps: {}, sleep: {}, lifts: {}, prehab: {}, custom: [], recents: [] };
let S = load();
let tab = S.profile ? 'today' : 'me';
let day = dk(new Date());
let trainDay = null;
let query = '';
let proteinSort = false;

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* start fresh */ }
  return Object.assign(JSON.parse(JSON.stringify(BLANK)), saved);
}
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const view = $('#view');
function dk(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function shift(key, n) { const d = new Date(key + 'T12:00'); d.setDate(d.getDate() + n); return dk(d); }
function lastDays(n) { return Array.from({ length: n }, (_, i) => shift(dk(new Date()), -i)); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function r1(x) { return Math.round(x * 10) / 10; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1400); }
function dayTotals(key) {
  const t = { k: 0, p: 0, c: 0, f: 0, fb: 0 };
  for (const e of S.food[key] || []) for (const m in t) t[m] += e[m] * e.q;
  return t;
}
function allFoods() {
  return FOODS.map(f => ({ id: f[0], n: f[1], u: f[2], k: f[3], p: f[4], c: f[5], f: f[6], fb: f[7] })).concat(S.custom);
}

// ---------- the maths ----------
// Smoothed weight trend: daily scale readings swing 1-2 kg on water alone.
function series() {
  let t = null, prev = null;
  return Object.keys(S.weights).sort().map(k => {
    const w = S.weights[k];
    const gap = prev ? (Date.parse(k) - Date.parse(prev)) / 864e5 : 1;
    t = t == null ? w : t + (1 - Math.pow(0.9, gap)) * (w - t);
    prev = k;
    return { k, w, t };
  });
}
// kg per day over the last 21 days (least squares); null until there is enough data.
function slope() {
  const from = Date.parse(shift(dk(new Date()), -21));
  const pts = Object.keys(S.weights).filter(k => Date.parse(k) >= from).map(k => [Date.parse(k) / 864e5, S.weights[k]]);
  if (pts.length < 6) return null;
  const xs = pts.map(p => p[0]);
  if (Math.max(...xs) - Math.min(...xs) < 13) return null;
  const mx = mean(xs), my = mean(pts.map(p => p[1]));
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return num / den;
}
function targets() {
  const p = S.profile, ser = series();
  if (!p || !ser.length) return null;
  const wt = ser[ser.length - 1].t;
  const age = (Date.now() - Date.parse(p.dob)) / (365.25 * 864e5);
  const bmr = 10 * wt + 6.25 * p.h - 5 * age + (p.sex === 'm' ? 5 : -161); // Mifflin-St Jeor
  const stepVals = lastDays(7).map(k => S.steps[k]).filter(v => v != null);
  const steps = stepVals.length ? mean(stepVals) : 2000;
  const formula = bmr * 1.2 + steps * 0.0004 * wt + p.days * 250 / 7;

  // After ~3 weeks of data, measure expenditure from intake and weight change instead.
  const logged = lastDays(21).map(k => dayTotals(k).k).filter(k => k >= 1000);
  const sl = slope();
  let tdee = formula, measured = false;
  if (logged.length >= 10 && sl != null) {
    tdee = Math.min(formula * 1.25, Math.max(formula * 0.75, mean(logged) - sl * 7700));
    measured = true;
  }
  const deficit = Math.min(0.006 * wt * 7700 / 7, 0.25 * tdee); // about 0.6% of body weight a week
  const floor = p.sex === 'm' ? 1600 : 1400;
  const kcal = Math.max(floor, Math.round((tdee - deficit) / 50) * 50);
  const ref = 25 * (p.h / 100) ** 2;
  const adj = wt > ref ? ref + 0.25 * (wt - ref) : wt;
  const protein = Math.round(1.6 * adj / 5) * 5;
  const fibre = Math.max(30, Math.round(15 * kcal / 1000));
  const stepGoal = Math.min(8000, Math.max(3000, Math.round((steps + 1000) / 500) * 500));
  return { wt, bmr, formula, tdee, measured, loggedDays: logged.length, deficit, kcal, protein, fibre, stepGoal, slope: sl, bmi: wt / (p.h / 100) ** 2 };
}

// ---------- views ----------
function bar(val, goal, unit, label) {
  const pct = Math.min(100, goal ? val / goal * 100 : 0);
  return `<div class="row between"><span>${label}</span><span class="num"><b>${Math.round(val)}</b> / ${goal} ${unit}</span></div>
    <div class="bar"><i class="${label === 'Calories' && val > goal * 1.05 ? 'over' : ''}" style="width:${pct}%"></i></div>`;
}

function vToday() {
  const T = targets(), t = dayTotals(day), isToday = day === dk(new Date());
  const title = isToday ? 'Today' : new Date(day + 'T12:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const items = (S.food[day] || []).map((e, i) => `<div class="row">
      <div class="grow"><div class="name">${esc(e.n)}</div><div class="muted">${e.q} × ${esc(e.u)} · ${Math.round(e.k * e.q)} kcal · ${r1(e.p * e.q)} g protein</div></div>
      <button class="small" data-act="qty" data-i="${i}" data-d="-0.5">−</button>
      <button class="small" data-act="qty" data-i="${i}" data-d="0.5">+</button>
    </div>`).join('');
  return `<div class="row between"><button class="small" data-act="day" data-d="-1">‹</button><h1>${title}</h1>
      <button class="small" data-act="day" data-d="1" ${isToday ? 'disabled' : ''}>›</button></div>
    <div class="card">
      <div class="row between" style="margin-bottom:10px"><div><div class="big num">${Math.max(0, Math.round(T.kcal - t.k))}</div><div class="muted">kcal left</div></div>
        <div style="text-align:right"><div class="big num">${Math.max(0, Math.round(T.protein - t.p))} g</div><div class="muted">protein to go</div></div></div>
      ${bar(t.k, T.kcal, 'kcal', 'Calories')}${bar(t.p, T.protein, 'g', 'Protein')}${bar(t.fb, T.fibre, 'g', 'Fibre')}
    </div>
    <div class="card grid3">
      <div><label>Weight, kg</label><input type="number" inputmode="decimal" step="0.1" data-log="weights" value="${S.weights[day] ?? ''}"></div>
      <div><label>Steps / ${T.stepGoal}</label><input type="number" inputmode="numeric" data-log="steps" value="${S.steps[day] ?? ''}"></div>
      <div><label>Sleep, hours</label><input type="number" inputmode="decimal" step="0.5" data-log="sleep" value="${S.sleep[day] ?? ''}"></div>
    </div>
    ${S.profile.shoulder ? `<label class="card row"><input type="checkbox" data-act="prehab" ${S.prehab[day] ? 'checked' : ''}><span class="grow" style="color:var(--text);font-size:16px">Shoulder routine done</span></label>` : ''}
    <div class="card"><div class="row between"><h2>Eaten</h2><button class="primary" data-tab="food">Add food</button></div>
      <div class="list">${items || '<p class="muted">Nothing logged yet.</p>'}</div></div>`;
}

function vFood() {
  const q = query.trim().toLowerCase();
  let foods = allFoods().filter(f => !q || f.n.toLowerCase().includes(q));
  if (proteinSort) foods.sort((a, b) => b.p / (b.k || 1) - a.p / (a.k || 1));
  else if (!q) foods.sort((a, b) => { const ia = S.recents.indexOf(a.id), ib = S.recents.indexOf(b.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
  const t = dayTotals(day), T = targets();
  return `<h1>Add food</h1>
    <p class="muted num">${Math.round(t.k)} / ${T.kcal} kcal · ${Math.round(t.p)} / ${T.protein} g protein</p>
    <div class="row" style="margin-bottom:10px"><input class="grow" id="q" placeholder="Search: chapati, usal, whey…" value="${esc(query)}">
      <button class="chip ${proteinSort ? 'on' : ''}" data-act="psort">Protein first</button></div>
    <div class="card list" id="foodlist">${foodRows(foods)}</div>
    <details class="card"><summary>Add your own food</summary>
      <div class="grid2" style="margin-top:10px">
        <div style="grid-column:1/3"><label>Name</label><input id="c_n"></div>
        <div><label>Serving (e.g. 1 bar)</label><input id="c_u"></div>
        <div><label>Calories</label><input id="c_k" type="number" inputmode="decimal"></div>
        <div><label>Protein, g</label><input id="c_p" type="number" inputmode="decimal"></div>
        <div><label>Fibre, g</label><input id="c_fb" type="number" inputmode="decimal"></div>
      </div><button class="primary" data-act="custom" style="margin-top:10px">Save and add</button></details>`;
}
function foodRows(foods) {
  return foods.map(f => `<div class="row food" data-act="add" data-id="${esc(f.id)}">
      <div class="grow"><div class="name">${esc(f.n)}</div><div class="muted">${esc(f.u)}</div></div>
      <div class="num" style="text-align:right">${f.k} kcal<div class="muted">${f.p} g protein</div></div></div>`).join('') || '<p class="muted">No match. Add it below.</p>';
}

function lastLift(name) {
  const keys = Object.keys(S.lifts).filter(k => k < day).sort().reverse();
  for (const k of keys) if (S.lifts[k].ex[name]) return S.lifts[k].ex[name];
  return null;
}
function nextDay() {
  const keys = Object.keys(S.lifts).filter(k => k < day).sort();
  const last = keys.length ? S.lifts[keys[keys.length - 1]].day : 'C';
  return { A: 'B', B: 'C', C: 'A' }[last];
}
function vTrain() {
  const home = S.profile.equip === 'home';
  const d = S.lifts[day]?.day || trainDay || nextDay();
  const cards = PLAN[d].map(e => {
    const name = home ? e[1] : e[0], last = lastLift(name), cur = S.lifts[day]?.ex[name] || [];
    const top = parseInt(e[3].split('–')[1]);
    const up = last && last.length >= e[2] && last.every(s => s && s[1] >= top);
    let rows = '';
    for (let s = 0; s < e[2]; s++) rows += `<span>${s + 1}</span>
      <input type="number" inputmode="decimal" step="0.5" placeholder="${last?.[s]?.[0] ?? 'kg'}" value="${cur[s]?.[0] ?? ''}" data-lift="${esc(name)}" data-set="${s}" data-f="0">
      <input type="number" inputmode="numeric" placeholder="${last?.[s]?.[1] ?? 'reps'}" value="${cur[s]?.[1] ?? ''}" data-lift="${esc(name)}" data-set="${s}" data-f="1">`;
    return `<div class="card"><div class="row between"><div class="name">${esc(name)}</div><span class="num muted">${e[2]} × ${e[3]}</span></div>
      ${e[4] ? `<div class="muted">${e[4]}</div>` : ''}${up ? '<span class="tag">Top of the range last time: add weight</span>' : ''}
      <div class="sets"><span></span><span>kg</span><span>reps</span>${rows}</div></div>`;
  }).join('');
  return `<h1>Train</h1>
    <div class="row" style="margin-bottom:12px">${['A', 'B', 'C'].map(x => `<button class="chip ${x === d ? 'on' : ''}" data-act="tday" data-d="${x}">Day ${x}</button>`).join('')}
      <span class="muted grow" style="text-align:right">${home ? 'Dumbbells' : 'Gym'}</span></div>
    ${S.profile.shoulder ? `<details class="card"><summary>Shoulder warm-up, 5 minutes</summary><ol>${PREHAB.map(x => `<li>${x}</li>`).join('')}</ol></details>` : ''}
    ${cards}
    <p class="muted">Stop each set 1–3 reps short of failure. When every set reaches the top of the rep range, add the smallest weight jump next time. Grey numbers are your last session.</p>`;
}

function chart(ser) {
  if (ser.length < 2) return '<p class="muted">Log your weight on two or more days to see the trend.</p>';
  const W = 340, H = 170, P = 28;
  const xs = ser.map(s => Date.parse(s.k)), ys = ser.flatMap(s => [s.w, s.t]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.floor(Math.min(...ys) - 0.5), y1 = Math.ceil(Math.max(...ys) + 0.5);
  const X = x => P + (x - x0) / (x1 - x0 || 1) * (W - P - 8), Y = y => H - 18 - (y - y0) / (y1 - y0) * (H - 30);
  const line = ser.map((s, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(s.t).toFixed(1)}`).join('');
  const dots = ser.map((s, i) => `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(s.w).toFixed(1)}" r="2.5" fill="var(--muted)" opacity=".6"/>`).join('');
  const grid = [y0, (y0 + y1) / 2, y1].map(y => `<line x1="${P}" x2="${W - 8}" y1="${Y(y)}" y2="${Y(y)}" stroke="var(--line)"/><text x="2" y="${Y(y) + 4}" font-size="10" fill="var(--muted)">${r1(y)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}${dots}<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/></svg>
    <p class="muted">Line: smoothed trend. Dots: scale readings.</p>`;
}
function vTrend() {
  const T = targets(), ser = series(), p = S.profile;
  const wk = T.slope == null ? null : T.slope * 7;
  const waistKeys = Object.keys(S.waist).sort(), waist = waistKeys.length ? S.waist[waistKeys[waistKeys.length - 1]] : null;
  const week = lastDays(7);
  const kc = week.map(k => dayTotals(k)).filter(t => t.k >= 1000);
  const avg = (obj) => { const v = week.map(k => obj[k]).filter(x => x != null); return v.length ? mean(v) : null; };
  const st = avg(S.steps), sl = avg(S.sleep);
  const cut = p.sex === 'm' ? 90 : 80;
  return `<h1>Trend</h1>
    <div class="card">${chart(ser)}
      <div class="grid3"><div class="stat"><b class="num">${r1(T.wt)}</b><span class="muted">trend kg</span></div>
        <div class="stat"><b class="num">${wk == null ? '–' : (wk > 0 ? '+' : '') + wk.toFixed(2)}</b><span class="muted">kg / week</span></div>
        <div class="stat"><b class="num">${r1(T.bmi)}</b><span class="muted">BMI</span></div></div>
      ${wk == null ? '<p class="muted" style="margin-top:8px">Weekly rate appears after 6 weigh-ins across 2 weeks. Weigh on waking, after the toilet.</p>'
      : wk < -0.01 * T.wt ? '<p style="margin-top:8px"><span class="tag warn">Losing faster than 1% a week: eat a little more to protect muscle</span></p>' : ''}
    </div>
    <div class="card"><h2>Waist</h2>
      <div class="row"><div class="grow"><label>At navel level, cm (weekly)</label><input type="number" inputmode="decimal" step="0.5" data-log="waist" value="${S.waist[day] ?? ''}" placeholder="${waist ?? ''}"></div>
        <div class="stat"><b class="num">${waist ? (waist / p.h).toFixed(2) : '–'}</b><span class="muted">waist ÷ height</span></div></div>
      <p class="muted" style="margin-top:8px">Aim for under ${cut} cm and a ratio under 0.50.</p></div>
    <div class="card"><h2>Last 7 days, average</h2><div class="grid2">
      <div class="stat"><b class="num">${kc.length ? Math.round(mean(kc.map(t => t.k))) : '–'}</b><span class="muted">kcal (goal ${T.kcal})</span></div>
      <div class="stat"><b class="num">${kc.length ? Math.round(mean(kc.map(t => t.p))) : '–'}</b><span class="muted">g protein (goal ${T.protein})</span></div>
      <div class="stat"><b class="num">${st == null ? '–' : Math.round(st)}</b><span class="muted">steps (goal ${T.stepGoal})</span></div>
      <div class="stat"><b class="num">${sl == null ? '–' : r1(sl)}</b><span class="muted">h sleep (goal 7–9)</span></div>
    </div></div>`;
}

function vMe() {
  const p = S.profile || { sex: '', dob: '', h: '', days: 3, equip: 'gym', shoulder: false }, T = targets();
  const form = `<div class="card"><h2>Profile</h2><div class="grid2">
      <div><label>Sex (for the energy formula)</label><select id="p_sex"><option value="">Choose</option><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Male</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Female</option></select></div>
      <div><label>Date of birth</label><input id="p_dob" type="date" value="${p.dob}"></div>
      <div><label>Height, cm (6 ft = 183)</label><input id="p_h" type="number" inputmode="decimal" value="${p.h}"></div>
      ${Object.keys(S.weights).length ? '' : '<div><label>Weight now, kg</label><input id="p_w" type="number" inputmode="decimal" step="0.1"></div>'}
      <div><label>Training days a week</label><select id="p_days">${[2, 3, 4].map(n => `<option ${p.days == n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label>Equipment</label><select id="p_equip"><option value="gym" ${p.equip === 'gym' ? 'selected' : ''}>Gym</option><option value="home" ${p.equip === 'home' ? 'selected' : ''}>Dumbbells at home</option></select></div>
    </div>
    <label class="row" style="margin-top:12px"><input type="checkbox" id="p_sh" ${p.shoulder ? 'checked' : ''}><span>Include the daily shoulder routine</span></label>
    <button class="primary" data-act="profile" style="margin-top:12px;width:100%">${S.profile ? 'Save' : 'Start'}</button></div>`;
  if (!T) return `<h1>Set up</h1><p class="muted">Everything stays on this device. Nothing is uploaded.</p>${form}`;
  const cls = T.bmi >= 25 ? 'obese range' : T.bmi >= 23 ? 'overweight range' : T.bmi >= 18.5 ? 'normal range' : 'underweight';
  return `<h1>Me</h1>
    <div class="card"><h2>How your targets are calculated</h2><table>
      <tr><td>Resting energy (Mifflin-St Jeor)</td><td>${Math.round(T.bmr)} kcal</td></tr>
      <tr><td>Daily burn, ${T.measured ? 'measured from your logs' : 'formula estimate'}</td><td>${Math.round(T.tdee)} kcal</td></tr>
      <tr><td>Deficit (about 0.6% body weight a week)</td><td>−${Math.round(T.deficit)} kcal</td></tr>
      <tr><td><b>Calorie target</b></td><td><b>${T.kcal} kcal</b></td></tr>
      <tr><td><b>Protein</b> (1.6 g per kg, adjusted weight)</td><td><b>${T.protein} g</b></td></tr>
      <tr><td>Fibre</td><td>${T.fibre} g</td></tr>
      <tr><td>BMI, Asian-Indian cut-offs</td><td>${r1(T.bmi)}, ${cls}</td></tr></table>
      <p class="muted" style="margin-top:8px">${T.measured ? 'Your burn is now worked out from what you ate and how your weight moved over 3 weeks.'
      : `The formula can be off by 10–15%. It is replaced by your measured burn after 10 logged food days and 2 weeks of weigh-ins (${T.loggedDays} of 10 food days so far).`}</p></div>
    ${form}
    <details class="card"><summary>Sources</summary><ol>
      <li>Misra A, et al. Consensus statement for diagnosis of obesity, abdominal obesity and the metabolic syndrome for Asian Indians. J Assoc Physicians India. 2009;57:163–70.</li>
      <li>WHO Expert Consultation. Appropriate body-mass index for Asian populations. Lancet. 2004;363:157–63.</li>
      <li>Ashwell M, Gunn P, Gibson S. Waist-to-height ratio as a screening tool. Obes Rev. 2012;13:275–86.</li>
      <li>Mifflin MD, et al. A new predictive equation for resting energy expenditure. Am J Clin Nutr. 1990;51:241–7.</li>
      <li>Hall KD, et al. Quantification of the effect of energy imbalance on bodyweight. Lancet. 2011;378:826–37.</li>
      <li>Morton RW, et al. Protein supplementation and resistance-training gains: meta-analysis. Br J Sports Med. 2018;52:376–84.</li>
      <li>Longland TM, et al. Higher protein during an energy deficit with intense exercise. Am J Clin Nutr. 2016;103:738–46.</li>
      <li>Garthe I, et al. Effect of two weight-loss rates on body composition and strength. Int J Sport Nutr Exerc Metab. 2011;21:97–104.</li>
      <li>Cava E, Yeat NC, Mittendorfer B. Preserving healthy muscle during weight loss. Adv Nutr. 2017;8:511–9.</li>
      <li>Schoenfeld BJ, Ogborn D, Krieger JW. Weekly resistance-training volume and muscle mass. J Sports Sci. 2017;35:1073–82.</li>
      <li>ICMR-NIN. Dietary Guidelines for Indians, 2024; Nutrient Requirements for Indians, 2020.</li>
      <li>Longvah T, et al. Indian Food Composition Tables. NIN, 2017.</li></ol></details>
    <div class="card"><h2>Backup</h2><p class="muted">Data lives only in this browser on this device. Export now and then.</p>
      <div class="row"><button data-act="export">Export</button><button data-act="import">Import</button><input type="file" id="imp" accept="application/json" hidden></div></div>`;
}

// ---------- render and events ----------
function render() {
  if (!targets()) tab = 'me';
  view.innerHTML = { today: vToday, food: vFood, train: vTrain, trend: vTrend, me: vMe }[tab]();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

document.addEventListener('click', e => {
  const tb = e.target.closest('[data-tab]');
  if (tb) { tab = tb.dataset.tab; query = ''; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const a = el.dataset.act;
  if (a === 'day') { day = shift(day, +el.dataset.d); trainDay = null; }
  else if (a === 'qty') {
    const list = S.food[day], it = list[+el.dataset.i];
    it.q = r1(it.q + +el.dataset.d);
    if (it.q <= 0) list.splice(+el.dataset.i, 1);
  }
  else if (a === 'add') { addFood(allFoods().find(f => f.id === el.dataset.id)); return; }
  else if (a === 'psort') proteinSort = !proteinSort;
  else if (a === 'tday') trainDay = el.dataset.d;
  else if (a === 'custom') {
    const n = $('#c_n').value.trim(), k = parseFloat($('#c_k').value);
    if (!n || !(k >= 0)) return toast('Name and calories are needed');
    const f = { id: 'c' + Date.now(), n, u: $('#c_u').value.trim() || '1 serving', k, p: parseFloat($('#c_p').value) || 0, c: 0, f: 0, fb: parseFloat($('#c_fb').value) || 0 };
    S.custom.push(f); addFood(f);
  }
  else if (a === 'profile') {
    const sex = $('#p_sex').value, dob = $('#p_dob').value, h = parseFloat($('#p_h').value), w = $('#p_w') ? parseFloat($('#p_w').value) : null;
    if (!sex || !dob || !(h > 100) || ($('#p_w') && !(w > 20))) return toast('Fill in every field');
    S.profile = { sex, dob, h, days: +$('#p_days').value, equip: $('#p_equip').value, shoulder: $('#p_sh').checked };
    if (w) S.weights[dk(new Date())] = w;
    tab = 'today'; toast('Saved');
  }
  else if (a === 'export') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `health-${dk(new Date())}.json` }).click();
    return;
  }
  else if (a === 'import') { $('#imp').click(); return; }
  save(); render();
});

function addFood(f) {
  const list = S.food[day] ||= [];
  const same = list.find(e => e.id === f.id);
  if (same) same.q = r1(same.q + 1); else list.push({ ...f, q: 1 });
  S.recents = [f.id, ...S.recents.filter(x => x !== f.id)].slice(0, 12);
  save(); toast(`Added ${f.n}`);
  if (f.id.startsWith('c') && S.custom.includes(f)) render();
  else $('.muted.num').textContent = (() => { const t = dayTotals(day), T = targets(); return `${Math.round(t.k)} / ${T.kcal} kcal · ${Math.round(t.p)} / ${T.protein} g protein`; })();
}

document.addEventListener('input', e => {
  if (e.target.id === 'q') {
    query = e.target.value;
    const q = query.trim().toLowerCase();
    $('#foodlist').innerHTML = foodRows(allFoods().filter(f => !q || f.n.toLowerCase().includes(q)));
  }
});

// Saved without re-rendering so the keyboard and focus stay put while moving between fields.
document.addEventListener('change', e => {
  const el = e.target, v = parseFloat(el.value);
  if (el.dataset.log) {
    if (v > 0) S[el.dataset.log][day] = v; else delete S[el.dataset.log][day];
    save();
  } else if (el.dataset.lift) {
    const d = S.lifts[day]?.day || trainDay || nextDay();
    const entry = S.lifts[day] ||= { day: d, ex: {} };
    const sets = entry.ex[el.dataset.lift] ||= [];
    const s = sets[+el.dataset.set] ||= [null, null];
    s[+el.dataset.f] = isNaN(v) ? null : v;
    save();
  } else if (el.dataset.act === 'prehab') {
    if (el.checked) S.prehab[day] = true; else delete S.prehab[day];
    save();
  } else if (el.id === 'imp' && el.files[0]) {
    el.files[0].text().then(txt => {
      const data = JSON.parse(txt);
      if (!data.profile || !data.weights) throw new Error('bad file');
      if (!confirm('Replace everything on this device with the imported backup?')) return;
      S = Object.assign(JSON.parse(JSON.stringify(BLANK)), data); save(); render(); toast('Imported');
    }).catch(() => toast('That file is not a Health backup'));
  }
});

render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');

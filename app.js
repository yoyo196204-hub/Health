'use strict';

// ---------- state ----------
let S = load();
let tab = 'today', overlay = null;
let day = dk(new Date());
let trainDay = null, cat = 'usual', query = '', installEvt = null;

// ---------- helpers ----------
const $ = s => document.querySelector(s);
function dk(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function shift(key, n) { const d = new Date(key + 'T12:00'); d.setDate(d.getDate() + n); return dk(d); }
function lastDays(n) { return Array.from({ length: n }, (_, i) => shift(dk(new Date()), -i)); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function r1(x) { return Math.round(x * 10) / 10; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function latest(obj) { const k = Object.keys(obj).sort(); return k.length ? obj[k[k.length - 1]] : null; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1600); }
function ageYears() { return (Date.now() - Date.parse(S.profile.dob)) / (365.25 * 864e5); }
function totals(key, meal) {
  const t = { k: 0, p: 0, fb: 0, n: 0 };
  for (const e of S.food[key] || []) if (!meal || e.m === meal) { t.k += e.k * e.q; t.p += e.p * e.q; t.fb += e.fb * e.q; t.n++; }
  return t;
}
function food(id) {
  const f = FOODS.find(x => x[0] === id);
  return f ? { id: f[0], n: f[1], u: f[2], k: f[3], p: f[4], fb: f[7], cat: f[8] } : S.custom.find(x => x.id === id);
}
function allFoods() { return FOODS.map(f => food(f[0])).concat(S.custom); }
function why(key, label) { return `<a class="why" href="#why-${key}">${label}</a>`; }

// ---------- the maths ----------
// Smoothed weight: daily scale readings swing 1–2 kg on water and gut contents alone.
function series() {
  let t = null, prev = null;
  return Object.keys(S.weights).sort().map(k => {
    const w = S.weights[k], gap = prev ? (Date.parse(k) - Date.parse(prev)) / 864e5 : 1;
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
  const wt = ser.length ? ser[ser.length - 1].t : p.w0;
  const bmr = 10 * wt + 6.25 * p.h - 5 * ageYears() + (p.sex === 'm' ? 5 : -161);
  const stepVals = lastDays(7).map(k => S.steps[k]).filter(v => v != null);
  const steps = stepVals.length ? mean(stepVals) : 2000;
  const formula = bmr * 1.2 + steps * 0.0004 * wt + p.days * 250 / 7;
  const logged = lastDays(21).map(k => totals(k).k).filter(k => k >= 1000);
  const sl = slope();
  let tdee = formula, measured = false;
  if (logged.length >= 10 && sl != null) {
    tdee = Math.min(formula * 1.25, Math.max(formula * 0.75, mean(logged) - sl * 7700));
    measured = true;
  }
  const deficit = Math.min(0.006 * wt * 7700 / 7, 0.25 * tdee);
  const kcal = Math.max(p.sex === 'm' ? 1600 : 1400, Math.round((tdee - deficit) / 50) * 50);
  const ref = 25 * (p.h / 100) ** 2;
  const adj = wt > ref ? ref + 0.25 * (wt - ref) : wt;
  return {
    wt, bmr, formula, tdee, measured, loggedDays: logged.length, deficit, kcal, adj, slope: sl,
    protein: Math.round(1.6 * adj / 5) * 5,
    fibre: Math.max(30, Math.round(15 * kcal / 1000)),
    stepGoal: Math.min(8000, Math.max(3000, Math.round((steps + 1000) / 500) * 500)),
    bmi: wt / (p.h / 100) ** 2,
  };
}

// One concrete suggestion, built from what is actually left today.
function coach(T, t) {
  const pLeft = T.protein - t.p, kLeft = T.kcal - t.k;
  if (!t.n) return `Start with protein. A scoop of whey at breakfast and usal or dahi at both meals covers most of ${T.protein} g.`;
  if (kLeft < -100) return `${Math.round(-kLeft)} kcal over. One day does not move the trend; the 7-day average does. Log it and carry on.`;
  if (pLeft <= 8) return t.fb < T.fibre - 8 ? 'Protein done. Fibre is short: a peru, koshimbir or a bhakri instead of poli closes it.' : 'Protein done. Whatever calories remain are yours to spend.';
  const wheyToday = (S.food[day] || []).filter(e => e.id === 'whey').reduce((a, e) => a + e.q, 0);
  const pick = []; let p = 0, k = 0;
  for (const id of GAP) {
    const f = food(id);
    if (pick.length >= 3 || pLeft - p <= 8) break;
    if ((id === 'whey' && wheyToday >= 2) || k + f.k > kLeft) continue;
    pick.push(f); p += f.p; k += f.k;
  }
  if (!pick.length) return `${Math.round(pLeft)} g protein short with ${Math.max(0, Math.round(kLeft))} kcal left. Whey in water is the leanest fix: 24 g for 120 kcal.`;
  return `${Math.round(pLeft)} g protein to go. ${pick.map(f => `${f.u.replace(/ \(.*/, '')} ${f.n.toLowerCase()}`).join(' + ')} gives ${Math.round(p)} g for ${Math.round(k)} kcal.`;
}

// ---------- today ----------
function gauge(T, t) {
  const kp = Math.min(100, t.k / T.kcal * 100), pp = Math.min(100, t.p / T.protein * 100), over = t.k > T.kcal * 1.05;
  const left = Math.round(T.kcal - t.k);
  return `<svg class="gauge" viewBox="0 0 300 168" role="img" aria-label="${Math.round(t.k)} of ${T.kcal} kcal, ${Math.round(t.p)} of ${T.protein} g protein">
    <path d="M26 152A124 124 0 0 1 274 152" pathLength="100" class="track"/>
    <path d="M26 152A124 124 0 0 1 274 152" pathLength="100" class="arc kc ${over ? 'over' : ''}" stroke-dasharray="${kp} 100"/>
    <path d="M50 152A100 100 0 0 1 250 152" pathLength="100" class="track thin"/>
    <path d="M50 152A100 100 0 0 1 250 152" pathLength="100" class="arc pr" stroke-dasharray="${pp} 100"/>
    <text x="150" y="118" class="gnum">${Math.abs(left)}</text>
    <text x="150" y="144" class="gsub">kcal ${left < 0 ? 'over' : 'left'} of ${T.kcal}</text></svg>`;
}
function vToday() {
  const T = targets(), t = totals(day), isToday = day === dk(new Date()), d = new Date(day + 'T12:00');
  const y = shift(day, -1);
  const meals = MEALS.map(([m, label]) => {
    const mt = totals(day, m);
    const items = (S.food[day] || []).filter(e => e.m === m).map(e => `<li><div class="grow"><span class="nm">${esc(e.n)}</span><span class="sub">${e.q} × ${esc(e.u)} · ${Math.round(e.k * e.q)} kcal · ${r1(e.p * e.q)} g</span></div>
        <button class="step" data-act="q" data-m="${m}" data-id="${esc(e.id)}" data-d="-0.5" aria-label="less">−</button><button class="step" data-act="q" data-m="${m}" data-id="${esc(e.id)}" data-d="0.5" aria-label="more">+</button></li>`).join('');
    const canCopy = !mt.n && totals(y, m).n;
    return `<section class="meal"><div class="mh"><h2>${label}</h2><span class="num sub">${mt.n ? `${Math.round(mt.k)} kcal · ${Math.round(mt.p)} g protein` : ''}</span><a class="plus" href="#add-${m}" aria-label="Add to ${label}">+</a></div>
      ${items ? `<ul>${items}</ul>` : canCopy ? `<button class="ghost" data-act="copy" data-m="${m}">Same as yesterday</button>` : ''}</section>`;
  }).join('');
  return `<header class="top"><button class="nav" data-act="day" data-d="-1" aria-label="Previous day">‹</button>
      <div><div class="eyebrow">${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>${isToday ? 'Today' : day === shift(dk(new Date()), -1) ? 'Yesterday' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</h1></div>
      <button class="nav" data-act="day" data-d="1" ${isToday ? 'disabled' : ''} aria-label="Next day">›</button></header>
    <section class="hero">${gauge(T, t)}
      <div class="legend"><div>${why('kcal', 'Calories')}<b class="num">${Math.round(t.k)}<i> / ${T.kcal}</i></b></div>
        <div>${why('protein', 'Protein')}<b class="num pr">${Math.round(t.p)}<i> / ${T.protein} g</i></b></div>
        <div>${why('fibre', 'Fibre')}<b class="num">${Math.round(t.fb)}<i> / ${T.fibre} g</i></b></div></div>
      <p class="coach">${coach(T, t)}</p></section>
    <section class="vitals">
      <label>${why('rate', 'Weight')}<span><input type="number" inputmode="decimal" step="0.1" data-log="weights" value="${S.weights[day] ?? ''}" placeholder="${r1(T.wt)}"><i>kg</i></span></label>
      <label>${why('steps', 'Steps')}<span><input type="number" inputmode="numeric" data-log="steps" value="${S.steps[day] ?? ''}" placeholder="0"><i>/&nbsp;${T.stepGoal}</i></span></label>
      <label>${why('sleep', 'Sleep')}<span><input type="number" inputmode="decimal" step="0.5" data-log="sleep" value="${S.sleep[day] ?? ''}" placeholder="7–9"><i>h</i></span></label>
    </section>
    ${S.profile.shoulder ? `<label class="check"><input type="checkbox" data-act="prehab" ${S.prehab[day] ? 'checked' : ''}><span>Shoulder routine: stretch and band work</span></label>` : ''}
    ${meals}`;
}

// ---------- add food ----------
function addRows(meal) {
  const q = query.trim().toLowerCase(), list = S.food[day] || [];
  const row = f => {
    const e = list.find(x => x.m === meal && x.id === f.id);
    return `<li class="${e ? 'on' : ''}"><div class="grow" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="1"><span class="nm">${esc(f.n)}</span><span class="sub">${esc(f.u)} · ${f.k} kcal · ${f.p} g protein</span></div>
      ${e ? `<button class="step" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="-0.5">−</button><b class="qty num">${e.q}</b><button class="step" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="0.5">+</button>` : `<span class="add" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="1">+</span>`}</li>`;
  };
  if (q) return allFoods().filter(f => f.n.toLowerCase().includes(q)).map(row).join('') || '<li class="sub">Nothing by that name. Add it under Mine.</li>';
  if (cat === 'thali') return THALI.map(([name, parts], i) => {
    const s = parts.reduce((a, [id, n]) => { const f = food(id); a.k += f.k * n; a.p += f.p * n; return a; }, { k: 0, p: 0 });
    return `<li data-act="thali" data-m="${meal}" data-i="${i}"><div class="grow"><span class="nm">${name}</span><span class="sub">${parts.map(([id, n]) => `${n} ${food(id).n.toLowerCase()}`).join(', ')}</span><span class="sub">${Math.round(s.k)} kcal · ${Math.round(s.p)} g protein</span></div><span class="add">+</span></li>`;
  }).join('');
  if (cat === 'mine') return S.custom.map(row).join('') + `<li class="form"><div class="grow"><span class="nm">Add your own</span>
      <div class="fgrid"><input id="c_n" placeholder="Name" style="grid-column:1/3"><input id="c_u" placeholder="Serving, e.g. 1 bar"><input id="c_k" type="number" inputmode="decimal" placeholder="kcal">
      <input id="c_p" type="number" inputmode="decimal" placeholder="Protein g"><input id="c_fb" type="number" inputmode="decimal" placeholder="Fibre g"></div>
      <button class="solid" data-act="custom" data-m="${meal}">Save and add</button></div></li>`;
  if (cat === 'usual') {
    const fr = S.freq[meal] || {}, ids = Object.keys(fr).sort((a, b) => fr[b] - fr[a]);
    return [...new Set([...ids, ...USUAL[meal]])].slice(0, 14).map(food).filter(Boolean).map(row).join('');
  }
  return allFoods().filter(f => f.cat === cat).map(row).join('');
}
function addFoot(meal) { const t = totals(day, meal), T = targets(), all = totals(day); return `<div><b class="num">${Math.round(t.k)} kcal · ${Math.round(t.p)} g protein</b><span class="sub num">Day: ${Math.round(all.k)} / ${T.kcal} · ${Math.round(all.p)} / ${T.protein} g</span></div><button class="solid" data-act="close">Done</button>`; }
function vAdd(meal) {
  return `<header class="top left"><button class="nav" data-act="close" aria-label="Back">‹</button><div><div class="eyebrow">Add to</div><h1>${MEALS.find(m => m[0] === meal)[1]}</h1></div></header>
    <input id="q" type="search" placeholder="Search: poli, usal, pohe, whey" value="${esc(query)}">
    <div class="chips">${CATS.map(([c, l]) => `<button class="${c === cat && !query ? 'on' : ''}" data-act="cat" data-c="${c}">${l}</button>`).join('')}</div>
    <ul class="foods" id="rows">${addRows(meal)}</ul>
    <footer class="addfoot" id="foot">${addFoot(meal)}</footer>`;
}
function bump(meal, f, d) {
  const list = S.food[day] ||= [];
  let e = list.find(x => x.m === meal && x.id === f.id);
  if (!e) { if (d <= 0) return; e = { ...f, m: meal, q: 0 }; list.push(e); }
  e.q = r1(e.q + d);
  if (e.q <= 0) list.splice(list.indexOf(e), 1);
  if (d >= 1) { const fr = S.freq[meal] ||= {}; fr[f.id] = (fr[f.id] || 0) + 1; }
  save();
}

// ---------- train ----------
function lastLift(name) {
  for (const k of Object.keys(S.lifts).filter(k => k < day).sort().reverse()) if (S.lifts[k].ex[name]) return S.lifts[k].ex[name];
  return null;
}
function nextDay() {
  const keys = Object.keys(S.lifts).filter(k => k < day).sort();
  return { A: 'B', B: 'C', C: 'A' }[keys.length ? S.lifts[keys[keys.length - 1]].day : 'C'];
}
function vTrain() {
  const home = S.profile.equip === 'home', d = S.lifts[day]?.day || trainDay || nextDay();
  const week = lastDays(7).filter(k => S.lifts[k]).length;
  const ex = PLAN[d].map(e => {
    const name = home ? e[1] : e[0], last = lastLift(name), cur = S.lifts[day]?.ex[name] || [];
    const up = last && last.length >= e[2] && last.every(s => s && s[1] >= parseInt(e[3].split('–')[1]));
    let rows = '';
    for (let s = 0; s < e[2]; s++) rows += `<span>${s + 1}</span>
      <input type="number" inputmode="decimal" step="0.5" placeholder="${last?.[s]?.[0] ?? 'kg'}" value="${cur[s]?.[0] ?? ''}" data-lift="${esc(name)}" data-set="${s}" data-f="0">
      <input type="number" inputmode="numeric" placeholder="${last?.[s]?.[1] ?? 'reps'}" value="${cur[s]?.[1] ?? ''}" data-lift="${esc(name)}" data-set="${s}" data-f="1">`;
    return `<section class="ex"><div class="mh"><h2>${esc(name)}</h2><span class="num sub">${e[2]} × ${e[3]}</span></div>
      ${e[4] ? `<p class="sub">${e[4]}</p>` : ''}${up ? '<p class="flag">Top of the range last time. Add weight.</p>' : ''}
      <div class="sets"><span></span><span>kg</span><span>reps</span>${rows}</div></section>`;
  }).join('');
  return `<header class="top left"><div><div class="eyebrow">${week} of ${S.profile.days} sessions this week · ${home ? 'dumbbells' : 'gym'}</div><h1>Train</h1></div></header>
    <div class="chips">${['A', 'B', 'C'].map(x => `<button class="${x === d ? 'on' : ''}" data-act="tday" data-d="${x}">Day ${x}</button>`).join('')}</div>
    ${S.profile.shoulder ? `<details><summary>Shoulder warm-up, 5 minutes</summary><ol>${PREHAB.map(x => `<li>${x}</li>`).join('')}</ol></details>` : ''}
    ${ex}
    <p class="note">Grey numbers are your last session. Stop each set 1–3 reps short of failure. ${why('lift', 'Why this plan')}</p>`;
}

// ---------- me ----------
function vMe() {
  const p = S.profile, T = targets();
  const cls = T.bmi >= 25 ? 'obese' : T.bmi >= 23 ? 'overweight' : T.bmi >= 18.5 ? 'normal' : 'underweight';
  const standalone = matchMedia('(display-mode: standalone)').matches;
  return `<header class="top left"><div><div class="eyebrow">${Math.floor(ageYears())} years · ${p.h} cm · ${r1(T.wt)} kg</div><h1>Me</h1></div></header>
    ${standalone ? '' : `<section class="block install"><h2>Install on this device</h2>
      ${installEvt ? '<button class="solid" data-act="install">Install app</button>' : '<p class="sub">Open this page in Chrome itself, not inside another app. Then tap ⋮ at the top right and choose <b>Add to Home screen</b>, then <b>Install</b>.</p>'}</section>`}
    <section class="block"><h2>Your numbers</h2><table>
      <tr><td>${why('kcal', 'Resting energy')}</td><td>${Math.round(T.bmr)} kcal</td></tr>
      <tr><td>${why('kcal', `Daily burn, ${T.measured ? 'measured' : 'estimated'}`)}</td><td>${Math.round(T.tdee)} kcal</td></tr>
      <tr><td>${why('rate', 'Deficit')}</td><td>−${Math.round(T.deficit)} kcal</td></tr>
      <tr class="strong"><td>${why('kcal', 'Calories')}</td><td>${T.kcal} kcal</td></tr>
      <tr class="strong"><td>${why('protein', 'Protein')}</td><td>${T.protein} g</td></tr>
      <tr><td>${why('fibre', 'Fibre')}</td><td>${T.fibre} g</td></tr>
      <tr><td>${why('waist', 'BMI, Indian cut-offs')}</td><td>${r1(T.bmi)}, ${cls}</td></tr></table></section>
    <section class="block"><h2>The evidence</h2><ul class="evid">${Object.entries(EVID).map(([k, e]) => `<li><a href="#why-${k}"><span class="nm">${e.t}</span><span class="sub">${e.g}</span></a></li>`).join('')}</ul></section>
    ${vWatch()}
    <details><summary>Settings</summary><div class="fgrid">
      <label>Sex<select id="p_sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Male</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Female</option></select></label>
      <label>Height, cm<input id="p_h" type="number" inputmode="decimal" value="${p.h}"></label>
      <label>Training days<select id="p_days">${[2, 3, 4].map(n => `<option ${p.days == n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Equipment<select id="p_equip"><option value="gym" ${p.equip === 'gym' ? 'selected' : ''}>Gym</option><option value="home" ${p.equip === 'home' ? 'selected' : ''}>Dumbbells</option></select></label></div>
      <label class="check"><input type="checkbox" id="p_sh" ${p.shoulder ? 'checked' : ''}><span>Daily shoulder routine</span></label>
      <button class="solid" data-act="profile">Save</button></details>
    <details><summary>Backup</summary><p class="sub">Everything lives in this browser on this device, with an automatic copy of the previous day. ${S.meta.exported ? `Last export ${S.meta.exported}.` : 'Never exported.'} Export before changing phones.</p>
      <div class="rowb"><button class="ghost" data-act="export">Export</button><button class="ghost" data-act="import">Import</button><input type="file" id="imp" accept="application/json" hidden></div></details>`;
}

function vWhy(key) {
  const e = EVID[key];
  if (!e) return '';
  return `<div class="scrim" data-act="close"></div><aside class="sheet" role="dialog" aria-label="${e.t}"><div class="grab"></div>
    <div class="eyebrow">${e.g}</div><h1>${e.t}</h1><p>${e.b(targets())}</p>
    <ol class="refs">${e.s.map(s => `<li>${s}</li>`).join('')}</ol><button class="solid" data-act="close">Close</button></aside>`;
}

// ---------- routing and events ----------
const VIEWS = { today: vToday, train: vTrain, heart: () => vHeart(), trend: () => vReview(), me: vMe };
// A failure in one screen must never blank the app or touch stored data.
function render() {
  const adding = overlay?.type === 'add' && MEALS.some(m => m[0] === overlay.key);
  try {
    $('#view').innerHTML = (loadNote ? `<p class="flag banner">${loadNote}</p>` : '') + (adding ? vAdd(overlay.key) : VIEWS[tab]());
    $('#sheet').innerHTML = overlay?.type === 'why' ? vWhy(overlay.key) : '';
  } catch (err) {
    console.error(err);
    $('#sheet').innerHTML = '';
    $('#view').innerHTML = `<header class="top left"><div><div class="eyebrow">Your data is untouched</div><h1>This screen failed</h1></div></header>
      <p class="sub">${esc(err.message)}</p><div class="rowb"><button class="solid" data-act="export">Export backup</button><a class="ghost" href="#today" style="margin:0;text-decoration:none">Go to Today</a></div>`;
  }
  document.body.classList.toggle('adding', adding);
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.hash === '#' + tab));
}
function route() {
  const [a, b] = (location.hash.slice(1) || 'today').split('-');
  const was = overlay;
  if (a === 'add' || a === 'why') overlay = { type: a, key: b };
  else { overlay = null; if (VIEWS[a]) tab = a; }
  if (overlay?.type === 'add' && was?.type !== 'add') { query = ''; cat = 'usual'; }
  render();
  if (!was && !overlay) window.scrollTo(0, 0);
}
function close() { if (history.length > 1) history.back(); else location.hash = tab; }
function refreshAdd() { const m = overlay.key; $('#rows').innerHTML = addRows(m); $('#foot').innerHTML = addFoot(m); }
addEventListener('hashchange', route);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (tab === 'me' && !overlay) render(); });

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const a = el.dataset.act, m = el.dataset.m;
  if (a === 'close') return close();
  if (a === 'q') { bump(m, food(el.dataset.id) || (S.food[day] || []).find(x => x.id === el.dataset.id), +el.dataset.d); return overlay?.type === 'add' ? refreshAdd() : render(); }
  if (a === 'thali') { const [name, parts] = THALI[+el.dataset.i]; for (const [id, n] of parts) bump(m, food(id), n); toast(`${name} added`); return refreshAdd(); }
  if (a === 'cat') { cat = el.dataset.c; query = ''; return render(); }
  if (a === 'custom') {
    const f = cleanFood({ id: 'x' + Date.now(), n: $('#c_n').value, u: $('#c_u').value.trim(), k: $('#c_k').value, p: $('#c_p').value, fb: $('#c_fb').value, cat: 'mine' }, false);
    if (!f) return toast('Name and kcal are needed');
    if (S.custom.length >= 300) return toast('Limit of 300 own foods reached');
    S.custom.push(f); bump(m, f, 1); return render();
  }
  if (a === 'copy') { for (const x of S.food[shift(day, -1)].filter(x => x.m === m)) (S.food[day] ||= []).push({ ...x }); }
  else if (a === 'day') { day = shift(day, +el.dataset.d); trainDay = null; }
  else if (a === 'tday') trainDay = el.dataset.d;
  else if (a === 'profile') { Object.assign(S.profile, { sex: $('#p_sex').value, h: num($('#p_h').value, 120, 230) ?? S.profile.h, days: +$('#p_days').value, equip: $('#p_equip').value, shoulder: $('#p_sh').checked }); toast('Saved'); }
  else if (a === 'install') { installEvt.prompt(); installEvt = null; }
  else if (a === 'export') { S.meta.exported = dk(new Date()); save(); const url = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); Object.assign(document.createElement('a'), { href: url, download: `health-${dk(new Date())}.json` }).click(); return; }
  else if (a === 'import') return $('#imp').click();
  else if (a.startsWith('hr')) return hrAct(a);
  else if (a.startsWith('w')) return watchAct(a);
  save(); render();
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') { query = e.target.value; $('#rows').innerHTML = addRows(overlay.key); document.querySelectorAll('.chips button').forEach(b => b.classList.toggle('on', !query && b.dataset.c === cat)); }
});

// Saved without re-rendering, so the keyboard and focus stay put between fields.
document.addEventListener('change', e => {
  const el = e.target, v = parseFloat(el.value);
  if (el.dataset.log) {
    const ok = num(el.value, ...LIMITS[el.dataset.log]);
    if (ok != null) S[el.dataset.log][day] = ok;
    else { delete S[el.dataset.log][day]; if (el.value !== '') { el.value = ''; toast('That value is out of range'); } }
    save();
  }
  else if (el.dataset.lift) {
    const entry = S.lifts[day] ||= { day: trainDay || nextDay(), ex: {} };
    const s = (entry.ex[el.dataset.lift] ||= [])[+el.dataset.set] ||= [null, null];
    s[+el.dataset.f] = num(el.value, 0, +el.dataset.f ? 600 : 500); save();
  }
  else if (el.dataset.act === 'prehab') { if (el.checked) S.prehab[day] = true; else delete S.prehab[day]; save(); }
  else if (el.id === 'wfile' && el.files.length) watchRead(el.files);
  else if (el.id === 'imp' && el.files[0]) el.files[0].text().then(txt => {
    if (el.files[0].size > 20e6) throw new Error('too large');
    const data = JSON.parse(txt);
    if (!data || typeof data !== 'object' || !data.profile || !data.food) throw new Error('bad file');
    if (!confirm('Replace everything on this device with this backup?')) return;
    S = sanitize(data); save(); render(); toast('Imported');
  }).catch(() => toast('That file is not a Health backup'));
});

// Another tab changed the data: reload it rather than overwrite it.
addEventListener('storage', e => { if (e.key === KEY) { S = load(); render(); } });
addEventListener('error', () => toast('Something went wrong. Your data is safe.'));
addEventListener('unhandledrejection', () => toast('Something went wrong. Your data is safe.'));
dailyBackup();
navigator.storage?.persist?.().catch(() => {});
route();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');

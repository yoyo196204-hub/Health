'use strict';
// Food: the diary, finding and adding food, the amount, and editing what you logged. Food is what this app is used
// for most, so every path here is as short as it can be: one tap adds a usual food straight from the diary, a held
// food opens its amount, a dragged ruler sets it, a swipe removes an entry (with undo), and a swipe across the day
// moves to the day before or after.

// One concrete suggestion, built from what is actually left today.
function coach(T, t, k = day) {
  const pLeft = T.protein - t.p, kLeft = T.kcal - t.k, isToday = k === todayKey(), hour = new Date().getHours();
  if (!t.n) return isToday && hour < 11 ? `Start with protein: about ${T.perMeal} g at breakfast. A scoop of whey, or dahi with chilla, covers most of it.` : `Start with protein. Whey, usal or dahi at each meal covers most of ${T.protein} g.`;
  if (kLeft < -100) return `${fmt(-kLeft)} kcal over. One day does not move the trend; the 7-day average does. Log it and carry on.`;
  if (pLeft <= 8) return t.fb < T.fibre - 8 ? 'Protein done. Fibre is short: a peru, koshimbir, or bhakri instead of poli closes it.' : 'Protein done. Whatever calories remain are yours to spend.';
  const low = isToday ? MEALS.filter(([m]) => m !== 'snack' && totals(k, m).n && totals(k, m).p < T.perMeal * 0.6).map(m => m[1].toLowerCase()) : [];
  const wheyToday = (S.food[k] || []).filter(e => e.id === 'whey').reduce((a, e) => a + e.q, 0);
  const pick = []; let p = 0, kc = 0;
  for (const id of GAP) {
    const f = food(id);
    if (!f || pick.length >= 3 || pLeft - p <= 8) break;
    if ((id === 'whey' && wheyToday >= 2) || kc + f.k > kLeft) continue;
    pick.push(f); p += f.p; kc += f.k;
  }
  const lead = low.length ? `${low.join(' and ').replace(/^./, c => c.toUpperCase())} ${low.length > 1 ? 'were' : 'was'} light on protein. ` : '';
  if (!pick.length) return `${lead}${Math.round(pLeft)} g protein short with ${fmt(Math.max(0, kLeft))} kcal left. Whey in water is the leanest fix: 24 g for 120 kcal.`;
  return `${lead}${Math.round(pLeft)} g protein to go. ${pick.map(f => `${f.u.replace(/ \(.*/, '')} ${f.n.toLowerCase()}`).join(' + ')} gives ${Math.round(p)} g for ${fmt(kc)} kcal.`;
}
function nextMeal() { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner'; }
const mealName = m => MEALS.find(x => x[0] === m)?.[1] || m;
// The colour a day earns: green within 10% of the target, red more than 10% over, saffron under.
function dayColor(k, T = targets()) { const t = totals(k), f = t.k / T.kcal; return !t.n ? 'var(--track)' : f > 1.1 ? 'var(--bad)' : f >= 0.9 ? 'var(--good)' : 'var(--fuel)'; }

// ---------- the diary ----------
// The week the day sits in, Monday first: each day a ring of its calories against the target. Tap one to go to it;
// swipe across the page for the day before or after.
function dayStrip() {
  const T = targets(), ws = weekStart(day), now = todayKey();
  return `<nav class="dstrip" id="dstrip" aria-label="Days of the week">${range(7, shift(ws, 6)).map(k => {
    const t = totals(k), f = clamp(t.k / T.kcal, 0, 1) * 100, fut = k > now;
    return `<button class="ds ${k === day ? 'on' : ''} ${k === now ? 'today' : ''}" data-act="gday" data-k="${k}" ${fut ? 'disabled' : ''} aria-label="${dateLabel(k, { weekday: 'long', day: 'numeric', month: 'long' })}"><span class="dw">${weekday(k)}</span><span class="dr" style="--c:${dayColor(k, T)}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15" pathLength="100"/>${t.n ? `<circle class="fg" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="${f.toFixed(1)} 100"/>` : ''}</svg><span class="dn">${+k.slice(8)}</span></span>${S.food[k] && isComplete(k) ? '<i class="full"></i>' : ''}</button>`;
  }).join('')}</nav>`;
}
// The day at a glance: what is left as a ring, eaten / target / burn beside it, the four macros, and one suggestion.
function foodSummary(T, t) {
  const left = T.kcal - t.k, over = left < 0, M = T.model, lastLeft = foodSummary.last?.[day];
  (foodSummary.last ||= {})[day] = Math.abs(Math.round(left));
  const carbRef = Math.max(50, (T.kcal - 4 * T.protein - 0.3 * T.kcal) / 4), fatRef = 0.3 * T.kcal / 9;
  const mac = (label, c, v, of, unit, tick) => `<div class="mac" style="--c:${c}"><span class="ml">${label}</span><b class="num">${Math.round(v)}<i>${of ? ` / ${of}` : ''} ${unit}</i></b>${meter2(v / (tick || of), c)}</div>`;
  const burn = M.E != null && M.conf !== 'calibrating' ? `${fmt(M.E)}<i>±${fmt(1.96 * M.sd)}</i>` : `${fmt(T.formula)}<i>est.</i>`;
  return `<section class="card fsum" id="fuel">
    <div class="fs-top">${ring('fuel' + day, t.k / T.kcal, { c: over ? 'var(--bad)' : 'var(--fuel)', size: 136, stroke: 10, over: t.k > T.kcal, glow: true,
      inner: `<b class="num" data-from="${lastLeft ?? Math.abs(Math.round(left))}" data-to="${Math.abs(Math.round(left))}" data-fmt="int">${fmt(Math.abs(left))}</b><span>kcal ${over ? 'over' : 'left'}</span>` })}
      <div class="fs-kv"><div><span>Eaten</span><b class="num">${fmt(t.k)}</b></div><div><span>Target ${why('kcal', 'why')}</span><b class="num">${fmt(T.kcal)}</b></div><div><span>You burn ${why('burn', 'how')}</span><b class="num">${burn}</b></div></div></div>
    <div class="macs">${mac('Protein', 'var(--pro)', t.p, T.protein, 'g')}${mac('Carbs', 'var(--carb)', t.c, null, 'g', carbRef)}${mac('Fat', 'var(--fat)', t.ft, null, 'g', fatRef)}${mac('Fibre', 'var(--fibre)', t.fb, T.fibre, 'g')}</div>
    ${t.n && t.kn < t.k * 0.97 ? `<p class="sub small" style="margin:6px 0 0">Carbs and fat known for ${Math.round(t.kn / t.k * 100)}% of the day's energy.</p>` : ''}
    <p class="coach">${coach(T, t)}</p></section>`;
}
// The foods you log most at a meal, for one tap from the diary.
function usualFor(m, n = 3) {
  const fr = S.freq[m] || {}, logged = new Set((S.food[day] || []).filter(e => e.m === m).map(e => e.id));
  return [...new Set([...Object.keys(fr).sort((a, b) => fr[b] - fr[a]), ...USUAL[m]])].map(id => food(id)).filter(f => f && !logged.has(f.id)).slice(0, n);
}
function mealCard(T, m, label, y) {
  const mt = totals(day, m), main = m !== 'snack', list = S.food[day] || [];
  const rows = list.map((e, i) => [e, i]).filter(([e]) => e.m === m).map(([e, i]) => `<li data-flash="${esc(m + e.id)}" data-swipe="fdelrow" data-i="${i}" data-press="fentry"><button class="rowbtn grow" data-act="fedit" data-i="${i}"><span class="nm">${esc(e.n)}</span><span class="sub">${esc(portion(e))} · ${r1(e.p * e.q)} g protein</span></button><span class="kc num">${fmt(e.k * e.q)}<i>kcal</i></span></li>`);
  const pOk = main && mt.p >= T.perMeal * 0.8;
  const pm = main && mt.n ? `<span class="pm" title="Protein against ${T.perMeal} g for a main meal"><span class="${pOk ? 'ok' : ''}">${Math.round(mt.p)} / ${T.perMeal} g</span><span class="pmeter"><i style="width:${clamp(mt.p / T.perMeal * 100, 0, 100).toFixed(0)}%" class="${pOk ? 'ok' : ''}"></i></span></span>` : '';
  const yt = totals(y, m), chips = [];
  if (!mt.n && yt.n) chips.push(`<button class="chip" data-act="copy" data-m="${m}">${ic('copy', 'width="15" height="15" style="fill:none;stroke:currentColor;stroke-width:2"')}Same as yesterday · ${fmt(yt.k)}</button>`);
  for (const f of usualFor(m, mt.n ? 2 : 3)) chips.push(`<button class="chip" data-act="q" data-m="${m}" data-id="${esc(f.id)}" data-d="1">+ ${esc(f.n.replace(/ \(.*| \/.*/, ''))} <span class="muted">${fmt(f.k)}</span></button>`);
  return `<section class="meal card ${mt.n ? '' : 'empty'}" id="meal-${m}">
    <div class="mh"><span class="ico" style="--c:var(--fuel)">${ic(MEAL_IC[m])}</span><h2>${label}<span class="sub num">${mt.n ? `${fmt(mt.k)} kcal` : 'Nothing yet'}</span></h2>${pm}<a class="plus" href="#add-${m}" aria-label="Add to ${label}">${ic('plus')}</a></div>
    ${rows.length ? `<ul class="mlist">${rows.join('')}</ul>` : ''}
    ${chips.length ? `<div class="mempty">${chips.join('')}</div>` : ''}
    ${rows.length >= 2 ? `<button class="link saveplate" data-act="psaveopen" data-m="${m}">Save as a plate</button>` : ''}</section>`;
}
function fullLine() {
  if (!S.food[day]) return '';
  const done = isComplete(day);
  return `<div class="fullline"><button class="chip ${done ? 'on' : ''}" data-act="full" aria-pressed="${done}">${done ? '✓ ' : ''}Complete day</button><span class="grow">${done ? 'Counts toward learning your burn.' : 'Looks incomplete, so it is left out of learning your burn.'} ${why('logging', 'why')}</span></div>`;
}
// Where the day's protein and energy went, meal by meal.
function nutritionCard(T, t) {
  if (!t.n) return '';
  const mains = MEALS.filter(([m]) => totals(day, m).n);
  const kcalSplit = `<div class="mbar" style="height:10px;margin:10px 0 6px">${mains.map(([m], i) => `<i style="flex:${totals(day, m).k};background:color-mix(in srgb, var(--fuel) ${100 - i * 22}%, var(--bg4))"></i>`).join('')}</div>
    <p class="sub small">${mains.map(([m, l]) => `${l} ${Math.round(totals(day, m).k / t.k * 100)}%`).join(' · ')}</p>`;
  const pb = MEALS.filter(([m]) => m !== 'snack').map(([m, l]) => { const p = totals(day, m).p; return `<div class="pbar"><span>${l}</span>${meter2(p / T.perMeal, 'var(--pro)')}<b>${Math.round(p)} g</b></div>`; }).join('');
  return `<section class="card">${cardHead('Where it went', 'bowl', 'var(--pro)', why('spread', 'why'))}
    <h3>Protein at each meal <span class="muted" style="font-weight:500">· ${T.perMeal} g each is about 0.4 g/kg</span></h3><div class="pbars">${pb}</div>
    <h3>Energy by meal</h3>${kcalSplit}
    ${(m => m ? `<h3>Macro split</h3>${m}` : '')(macroLine(t))}</section>`;
}
// The week the day is in: intake bars against the target line, tap a bar to go to the day.
function weekCard(T) {
  const ws = weekStart(day), ks = range(7, shift(ws, 6)), vals = ks.map(k => totals(k).k), top = Math.max(T.kcal * 1.25, ...vals);
  const logged = ks.filter(k => S.food[k] && k <= todayKey()), done = ks.filter(k => S.food[k] && isComplete(k));
  const avg = done.length ? mean(done.map(k => totals(k).k)) : null, on = done.filter(k => Math.abs(totals(k).k - T.kcal) <= T.kcal * 0.1).length;
  return `<section class="card">${cardHead('This week', 'cal', 'var(--fuel)', `<a class="more-link" href="#review-energy">Trends ›</a>`)}
    <div class="wkbars"><span class="tgt" style="bottom:${(T.kcal / top * 96 + 22).toFixed(1)}px" title="Target ${fmt(T.kcal)} kcal"></span>${ks.map((k, i) => `<button class="wb ${!vals[i] ? 'empty' : ''} ${k === day ? 'on' : ''}" data-act="gday" data-k="${k}" ${k > todayKey() ? 'disabled' : ''} style="--c:${dayColor(k, T)}"><i style="height:${Math.max(3, vals[i] / top * 96).toFixed(1)}px;animation-delay:${i * 40}ms"></i><span>${weekday(k)}</span></button>`).join('')}</div>
    ${stats([[avg != null ? fmt(avg) : DASH, 'kcal a day, complete days'], [`${on}<i>/ ${done.length}</i>`, 'within 10% of target'], [`${logged.length}<i>/ 7</i>`, 'days logged']])}</section>`;
}
function vFood() {
  const T = targets(), t = totals(day), isToday = day === todayKey(), y = shift(day, -1);
  const title = isToday ? 'Today' : day === shift(todayKey(), -1) ? 'Yesterday' : dateLabel(day, { weekday: 'long' });
  const right = isToday ? '' : '<button class="mini" data-act="today">Today ›</button>';
  return `${appbar(title, `Food · ${dateLabel(day, { day: 'numeric', month: 'long' })}`, right)}
    ${dayStrip()}
    ${part(foodSummary, T, t)}
    <div class="meals">${MEALS.map(([m, label]) => part(mealCard, T, m, label, y)).join('')}</div>
    ${fullLine()}
    ${part(nutritionCard, T, t)}
    ${part(weekCard, T)}`;
}

// ---------- add food ----------
const CUSTOM = { basis: '100', bc: null };
// The order of the usual foods, fixed for as long as the add page stays on one meal and day.
const ADDORDER = { meal: null, day: null, ids: [] };
// "1 katori · about 150 g" when a unit's weight is known and not already written in it.
function unitText(f) { return f.g && !/\d\s*(g|ml)\b/.test(f.u) ? `${f.u} · about ${Math.round(f.g)} ${/glass|cup|ml/.test(f.u) ? 'ml' : 'g'}` : f.u; }
// Where a packaged or raw food's numbers come from, in a word; home dishes are recipe estimates and say nothing.
function srcTag(f) { const L = { label: 'pack label', brand: 'maker', derived: 'maker', ifct: 'IFCT', usda: 'USDA', on: 'OpenNutrition', indb: 'INDB' }; return L[f.src] ? ` · <i class="srct">${L[f.src]}</i>` : ''; }
// The day's carbs and fat, and how the energy splits, only as far as the logged foods know them.
function macroLine(t) {
  if (!t.n || !t.kn) return '';
  const share = t.kn / t.k, kc = 4 * t.p + 4 * t.c + 9 * t.ft || 1;
  const pc = x => Math.round(x / kc * 100);
  return `<div class="macros"><div class="mbar" role="img" aria-label="Energy from protein, carbs and fat"><i class="mp" style="flex:${4 * t.p}"></i><i class="mc" style="flex:${4 * t.c}"></i><i class="mf" style="flex:${9 * t.ft}"></i></div>
    <p class="sub num"><i class="k mp"></i>Protein ${pc(4 * t.p)}% <i class="k mc"></i>Carbs ${Math.round(t.c)} g · ${pc(4 * t.c)}% <i class="k mf"></i>Fat ${Math.round(t.ft)} g · ${pc(9 * t.ft)}%${share < 0.97 ? ` <span class="small">· split known for ${Math.round(share * 100)}% of the day's kcal</span>` : ''}</p></div>`;
}
// ---------- finding a food ----------
// Every word you type must be found, in the name or under one of its other names (roti finds chapati and bhakri,
// anda finds eggs, chawal finds bhaat). Closer matches come first: the start of the name, then the start of a word,
// then anywhere, then a word one or two letters off (chapti, panner). What you log often rises a little.
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const fnorm = x => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function searchFoods(q) {
  const words = fnorm(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  const catName = Object.fromEntries(CATS), seen = new Set(), out = [];
  const often = id => MEALS.reduce((a, [m]) => a + (S.freq[m]?.[id] || 0), 0);
  for (const f of allFoods().concat(recentFoods())) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    const name = fnorm(f.n), toks = name.split(' '), hay = `${name} ${fnorm(catName[f.cat] || '')} ${fnorm(f.u || '')}`;
    let score = 0;
    for (const w of words) {
      let best = 0;
      [w, ...(FOOD_ALIAS[w] || '').split(' ').filter(Boolean)].forEach((v, i) => {
        const s = name.startsWith(v) ? 4 : toks.some(t => t.startsWith(v)) ? 3 : hay.includes(v) ? 1.6
          : v.length >= 4 && toks.some(t => Math.min(...[-1, 0, 1].map(d => lev(t.slice(0, v.length + d), v))) <= (v.length >= 7 ? 2 : 1)) ? 1 : 0;
        best = Math.max(best, s * (i ? 0.7 : 1));
      });
      if (!best) { score = 0; break; }
      score += best;
    }
    if (score) out.push([score + Math.min(1.5, Math.log1p(often(f.id)) / 3) - name.length / 300, f]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 60).map(x => x[1]);
}
// Every different food logged in the last three weeks, newest first, with its numbers as you last logged it, so an
// edited entry or a quick add comes back exactly as it was.
function recentFoods() {
  return cached('recentFoods', () => {
    const seen = new Map();
    for (const k of Object.keys(S.food).sort().reverse().slice(0, 21)) for (const e of [...S.food[k]].reverse()) if (!seen.has(e.id)) seen.set(e.id, e);
    return [...seen.values()].slice(0, 40);
  });
}
// The food behind a row: the library, your own foods, then what you logged recently.
function pickFood(id) { return food(id) || (S.food[day] || []).find(x => x.id === id) || recentFoods().find(x => x.id === id); }
// Steps that suit the amount: quarters below one portion, halves above it. A typed amount is kept as typed.
function qStep(q, d) { return d > 0 ? r2(q < 1 ? q + 0.25 : q + 0.5) : r2(q <= 1 ? Math.max(0.25, q - 0.25) : q - 0.5); }
function r2(x) { return Math.round(x * 100) / 100; }
const mlOf = f => / ml\b|glass|cup/.test(f.u || '') ? 'ml' : 'g';

function addRows(meal) {
  const q = query.trim(), list = S.food[day] || [];
  const row = (f, mine) => {
    const e = list.find(x => x.m === meal && x.id === f.id);
    return `<li class="${e ? 'on' : ''}" data-flash="${esc(meal + f.id)}" data-press="food" data-id="${esc(f.id)}" data-m="${meal}"><div class="grow" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="1"><span class="nm">${esc(f.n)}</span><span class="sub">${esc(unitText(f))} · ${r1(f.p)} g protein${srcTag(f)}</span></div>
      <div class="fk" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="1"><b>${fmt(f.k)}</b><i>kcal</i></div>
      ${e ? `<button class="step" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="-0.5" aria-label="Less">−</button><b class="qty num">${qtxt(e.q)}</b><button class="step" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="0.5" aria-label="More">+</button>`
        : `${mine ? `<button class="x" data-act="cedit" data-id="${esc(f.id)}" aria-label="Change ${esc(f.n)}">✎</button>` : ''}<span class="add" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="1" aria-hidden="true">+</span>`}</li>`;
  };
  // Packs from Open Food Facts follow the library's own foods, under their own heading.
  // Then everyday whole foods from OpenNutrition, each traced to a national food table;
  // Indian recipes from INDB come before them.
  const packs = q ? offSearch(q).filter(f => !S.custom.some(c => c.bc === f.bc)) : [], whole = q ? wholeSearch(q) : [], indb = q ? indbSearch(q) : [];
  if (q && (packs.length || whole.length || indb.length)) return searchFoods(q).map(f => row(f, S.custom.includes(f))).join('')
    + (indb.length ? `<li class="subhead"><span class="eyebrow">Indian recipes · <a href="https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-" target="_blank" rel="noopener">INDB</a></span></li>${indb.map(f => row(f)).join('')}` : '')
    + (whole.length ? `<li class="subhead"><span class="eyebrow">More foods · <a href="https://www.opennutrition.app" target="_blank" rel="noopener">OpenNutrition</a></span></li>${whole.map(f => row(f)).join('')}` : '')
    + (packs.length ? `<li class="subhead"><span class="eyebrow">Packs · <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a></span></li>${packs.map(f => row(f)).join('')}` : '');
  if (q) return searchFoods(q).map(f => row(f, S.custom.includes(f))).join('')
    || `<li class="empty"><div class="grow"><span class="nm">Nothing called “${esc(q)}”</span><span class="sub">Add it with its numbers, once, and it is yours from then on.</span><div class="rowb"><button class="ghost" data-act="cat" data-c="quick">Quick add</button><button class="ghost" data-act="cat" data-c="mine">Make it a food</button></div></div></li>`;
  if (cat === 'recent') return recentFoods().map(f => row(f)).join('') || '<li class="empty sub">Foods you log show up here, with the amounts you chose.</li>';
  if (cat === 'thali') {
    const own = S.plates.map((pl, i) => {
      const s = pl.items.reduce((a, e) => { a.k += e.k * e.q; a.p += e.p * e.q; return a; }, { k: 0, p: 0 });
      return `<li class="plate" data-act="plate" data-m="${meal}" data-i="${i}"><div class="grow"><span class="nm">${esc(pl.n)} <i class="tag">yours</i></span><span class="sub">${pl.items.map(e => `${qtxt(e.q)} ${esc(e.n.toLowerCase())}`).join(', ')}</span><span class="sub num">${fmt(s.k)} kcal · ${Math.round(s.p)} g protein</span></div><button class="x" data-act="delplate" data-i="${i}" aria-label="Delete ${esc(pl.n)}">×</button><span class="add">+</span></li>`;
    }).join('');
    return (own || '<li class="empty sub">Save any meal on Today as a plate (the link under it) and it lands here, ready for one tap.</li>') + THALI.map(([name, parts], i) => {
      const s = parts.reduce((a, [id, n]) => { const f = food(id); a.k += f.k * n; a.p += f.p * n; return a; }, { k: 0, p: 0 });
      return `<li data-act="thali" data-m="${meal}" data-i="${i}"><div class="grow"><span class="nm">${name}</span><span class="sub">${parts.map(([id, n]) => `${qtxt(n)} ${food(id).n.toLowerCase()}`).join(', ')}</span><span class="sub num">${fmt(s.k)} kcal · ${Math.round(s.p)} g protein</span></div><span class="add">+</span></li>`;
    }).join('');
  }
  if (cat === 'quick') return `<li class="form"><div class="grow"><span class="nm">Quick add</span><span class="sub">A meal out, a label you can read, anything not in the list: the numbers alone. Carbs and fat are optional; give both and they count in the day's split.</span>
      <div class="fgrid"><input id="k_n" placeholder="What, optional" class="span2" value="${esc(query)}"><input id="k_k" type="number" inputmode="numeric" placeholder="kcal"><input id="k_p" type="number" inputmode="decimal" placeholder="Protein g">
      <input id="k_c" type="number" inputmode="decimal" placeholder="Carbs g"><input id="k_ft" type="number" inputmode="decimal" placeholder="Fat g"></div>
      <button class="solid" data-act="quick" data-m="${meal}">Add</button></div></li>` + list.filter(e => e.m === meal && e.cat === 'quick').map(e => row(e)).join('');
  if (cat === 'mine') return S.custom.map(f => row(f, true)).join('') + `<li class="form"><div class="grow"><span class="nm">Add your own</span>
      ${CUSTOM.bc ? `<span class="sub"><b>Barcode ${esc(CUSTOM.bc)}</b>: the scanner will know this pack once it is saved.</span>` : ''}<span class="sub">Copy the pack's panel exactly as printed. Most Indian labels give values per 100 g: choose that and enter the serving size in grams, and the serving is worked out for you.</span>
      ${seg('cbasis', [['serving', 'Per serving'], ['100', 'Per 100 g / ml']], CUSTOM.basis, 'tight')}
      <div class="fgrid"><input id="c_n" placeholder="Name" class="span2"><input id="c_u" placeholder="Serving, e.g. 1 bar"><input id="c_g" type="number" inputmode="decimal" placeholder="Serving g / ml">
      <input id="c_k" type="number" inputmode="decimal" placeholder="kcal"><input id="c_p" type="number" inputmode="decimal" placeholder="Protein g">
      <input id="c_c" type="number" inputmode="decimal" placeholder="Carbs g"><input id="c_ft" type="number" inputmode="decimal" placeholder="Fat g">
      <input id="c_fb" type="number" inputmode="decimal" placeholder="Fibre g" class="span2"></div>
      <p class="sub small" id="c_chk" aria-live="polite"></p>
      <button class="solid" data-act="custom" data-m="${meal}">Save and add</button></div></li>`;
  if (cat === 'usual') {
    if (ADDORDER.meal !== meal || ADDORDER.day !== day) {
      const fr = S.freq[meal] || {}, ids = Object.keys(fr).sort((a, b) => fr[b] - fr[a]);
      Object.assign(ADDORDER, { meal, day, ids: [...new Set([...ids, ...USUAL[meal]])].slice(0, 16) });
    }
    return ADDORDER.ids.map(food).filter(Boolean).map(f => row(f, S.custom.includes(f))).join('');
  }
  if (cat === 'kirana') {
    if (!OFF) return '<li class="empty sub">Opening the pack list…</li>';
    return KIRANA.map(([h, items]) => { const fs = items.map(([c, n, g]) => offPortion(c, n, g)).filter(Boolean); return fs.length ? `<li class="subhead"><span class="eyebrow">${h}</span></li>${fs.map(f => row(f)).join('')}` : ''; }).join('')
      + '<li class="subhead"><span class="eyebrow">Each pack’s own printed panel · <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>. Any other pack: search its name, or type its barcode.</span></li>';
  }
  return allFoods().filter(f => f.cat === cat).map(f => row(f, f.cat === 'mine')).join('');
}
function addFoot(meal) {
  const t = totals(day, meal), T = targets(), all = totals(day), left = T.kcal - all.k;
  const bar = t.n && t.kn ? `<div class="mbar"><i class="mp" style="flex:${4 * t.p}"></i><i class="mc" style="flex:${4 * t.c}"></i><i class="mf" style="flex:${9 * t.ft}"></i></div>` : '<div class="mbar"></div>';
  return `<div><b class="num">${t.n ? `${mealName(meal)} · ${fmt(t.k)} kcal · ${Math.round(t.p)} g protein` : `Nothing in ${mealName(meal).toLowerCase()} yet`}</b>${bar}<span class="sub num">Day ${fmt(all.k)} of ${fmt(T.kcal)} · <span class="${left < 0 ? 'down' : ''}">${fmt(Math.abs(left))} ${left < 0 ? 'over' : 'left'}</span> · protein ${Math.round(all.p)} / ${T.protein} g</span></div><button class="solid" data-act="close">Done</button>`;
}
function vAdd(meal) {
  const counts = { recent: recentFoods().length, thali: S.plates.length + THALI.length, mine: S.custom.length };
  const when = day === todayKey() ? 'today' : dateLabel(day, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${masthead(`Add to ${mealName(meal).toLowerCase()}`, `Food · ${when}`, { before: `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>` })}
    <div class="addhead">${seg('addmeal', MEALS, meal, 'tight')}<div class="searchbar">${ic('search', 'class="mag"')}<input id="q" type="search" placeholder="Search: misal, pizza, roti, anda, chaas" value="${esc(query)}" autocomplete="off" enterkeyhint="search" aria-label="Search foods"><button class="clr" data-act="qclear" aria-label="Clear the search" ${query ? '' : 'hidden'}>×</button><button class="scanbtn" data-act="scango" data-m="${meal}" data-k="${day}" aria-label="Look up a barcode">${ic('scan')}</button></div>
    <div class="chips" id="chips">${CATS.map(([c, l]) => `<button class="${c === cat && !query ? 'on' : ''}" data-act="cat" data-c="${c}">${l}${counts[c] ? `<i class="cnt">${counts[c]}</i>` : ''}</button>`).join('')}</div>
    </div><p class="hint">Tap to add one · hold, or swipe right, for any amount</p>
    <ul class="foods" id="rows">${addRows(meal)}</ul>
    <footer class="addfoot" id="foot">${addFoot(meal)}</footer>`;
}
function bump(meal, f, d) {
  if (!f) return;
  // A run of adds (a plate, a copied meal) is one moment: its milestones are read once, after the last of them.
  if (!bump.was) { bump.was = { day, t: { ...totals(day) } }; setTimeout(milestones, 0); }
  const list = S.food[day] ||= [];
  let e = list.find(x => x.m === meal && x.id === f.id);
  if (!e) {
    if (d <= 0) return;
    e = { id: f.id, n: f.n, u: f.u, k: f.k, p: f.p, fb: f.fb || 0, cat: f.cat, m: meal, q: 0 };
    if (f.c != null && f.ft != null) Object.assign(e, { c: f.c, ft: f.ft });
    if (f.g) e.g = f.g;
    if (f.src) e.src = f.src;
    // When it was eaten, for logs made on the day: what meal timing does to sleep is read from these.
    if (day === todayKey()) e.t = Date.now();
    list.push(e);
  }
  e.q = r2(e.q + d);
  if (e.q <= 0) list.splice(list.indexOf(e), 1);
  if (!list.length) delete S.food[day];
  if (d >= 1 && f.cat !== 'quick') { const fr = S.freq[meal] ||= {}; fr[f.id] = (fr[f.id] || 0) + 1; }
  if (d > 0) flash(meal + f.id);
  buzz('tick');
  save();
}

// The moments worth feeling: protein reaching its target (the one number most worth hitting), and the day's
// calories passing the target (said once, plainly, without alarm).
function milestones() {
  const w = bump.was; bump.was = null;
  if (!w) return;
  const T = targets(), b = w.t, a = totals(w.day);
  if (b.p < T.protein && a.p >= T.protein) { buzz('done'); toast(`Protein target reached: ${Math.round(a.p)} of ${T.protein} g`, 3200); }
  else if (b.k <= T.kcal && a.k > T.kcal) { buzz('warn'); toast(`${fmt(a.k - T.kcal)} kcal past the target. The weekly average is what counts.`, 4200); }
}

// ---------- any amount: the portion sheet ----------
// Held on a food in the list: choose the amount by portion (any number, quarters, halves) or by weight, and the meal,
// and see what it comes to before adding it.
const PORT = { q: 1, m: 'lunch' };
PRESS.food = el => { PORT.q = 1; PORT.m = el.dataset.m; openPop({ kind: 'portion', id: el.dataset.id }); };
function vPortion(p) {
  const f = pickFood(p.id);
  if (!f) return '';
  const u = mlOf(f);
  return `${sheetTop(`${esc(unitText(f))} · ${fmt(f.k)} kcal each`, esc(f.n), `portion-${p.id}`)}
    ${amountBlock('pq', PORT.q, f.u)}
    ${seg('pqset', [0.25, 0.5, 1, 1.5, 2, 3].map(q => [q, qtxt(q)]), PORT.q, 'tight')}
    ${f.g ? `<label class="weigh"><span>Or by weight</span><span class="f"><input type="number" id="pg" inputmode="decimal" step="1" min="1" value="${Math.round(PORT.q * f.g)}"><i>${u}</i></span><span class="sub small">${/^\d/.test(f.u) ? '' : 'one '}${esc(f.u)} is ${/\(\d/.test(f.u) ? '' : 'about '}${Math.round(f.g)} ${u}</span></label>` : ''}
    <div id="psum">${foodSum({ ...f, q: PORT.q })}</div>
    <h3>Meal</h3>${seg('pmeal', MEALS, PORT.m)}
    <div class="rowb"><button class="solid wide" data-act="padd">Add to ${mealName(PORT.m).toLowerCase()}</button></div></aside>`;
}
// The amount: steppers either side of a number you can type into, and a ruler under it you drag (each quarter
// ticks under the finger; a flick keeps it rolling).
function amountBlock(k, q, unit) {
  return `<div class="amount"><button class="step" data-act="${k}" data-d="-1" data-repeat="${k}-" aria-label="Less">−</button><label class="qbox"><input id="${k}in" class="qin num" type="number" inputmode="decimal" step="any" min="0.05" max="50" value="${q}" aria-label="How many"><span>× ${esc(unit)}</span></label><button class="step" data-act="${k}" data-d="1" data-repeat="${k}+" aria-label="More">+</button></div>
    ${scrubber(k, q, { step: 0.25, min: 0.25, max: 12, px: 22, major: 4, label: v => qtxt(v) })}`;
}
// A ruler you drag sideways: one tick per step, a label at every major tick, the needle in the middle is the value.
function scrubber(kind, v, { step, min, max, px = 16, major = 5, label = x => x }) {
  let ticks = '';
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) {
    const t = min + i * step, x = i * px, on = m => Math.abs(t / m - Math.round(t / m)) < 1e-6, big = on(step * major);
    ticks += `<i class="${big ? 'w' : on(step * major / 2) ? 'h' : ''}" style="left:${x}px"></i>${big ? `<span style="left:${x}px">${label(+t.toFixed(4))}</span>` : ''}`;
  }
  const off = -((clamp(v, min, max) - min) / step) * px;
  return `<div class="scrub" data-scrub="${kind}" data-v="${v}" data-step="${step}" data-min="${min}" data-max="${max}" data-px="${px}" role="slider" aria-valuenow="${v}" aria-valuemin="${min}" aria-valuemax="${max}" tabindex="0"><div class="tape" style="transform:translateX(${off.toFixed(1)}px)">${ticks}</div><span class="needle"></span></div>`;
}

// ---------- editing an entry ----------
// Everything about a logged food is yours to change: the amount (typed, stepped or weighed), the meal, the day, and
// its own numbers. Changing the numbers makes the entry your own, so the library food it came from stays as it was.
function vFoodEdit(i) {
  const e = (S.food[day] || [])[i];
  if (!e) return '';
  const src = { label: 'From the pack’s nutrition panel', brand: 'Energy and protein as the maker states them; carbs and fat are not published', derived: 'The maker’s energy, protein and fat; carbs are the energy left over', ifct: 'Indian Food Composition Tables 2017 (ICMR-NIN)', usda: 'USDA FoodData Central', recipe: 'Estimate from typical home recipes: oil and portion move it by about a fifth', mine: 'Your own numbers' }[e.src];
  const ref = FOODIDX.get(e.id)?.ref, unit = mlOf(e), mine = S.custom.some(x => x.id === e.id);
  const fld = (id, label, v, attrs = 'type="number" inputmode="decimal" step="any"') => `<label>${label}<input id="${id}" ${attrs} value="${v == null ? '' : esc(String(v))}"></label>`;
  return `${sheetTop(`${esc(e.u)} · ${fmt(e.k)} kcal each · ${mealName(e.m).toLowerCase()}`, esc(e.n), `fedit-${i}`)}
    ${amountBlock('fq', e.q, e.u)}
    ${seg('fqset', [0.25, 0.5, 1, 1.5, 2, 3].map(q => [q, qtxt(q)]), e.q, 'tight')}
    ${e.g ? `<label class="weigh"><span>Weighed it?</span><span class="f"><input type="number" id="fg" data-act="fg" inputmode="decimal" step="1" min="1" value="${Math.round(e.q * e.g)}"><i>${unit}</i></span><span class="sub small">${/^\d/.test(e.u) ? '' : 'one '}${esc(e.u)} is ${/\(\d/.test(e.u) ? '' : 'about '}${Math.round(e.g)} ${unit}</span></label>` : ''}
    <div id="fsum">${foodSum(e)}</div>
    ${src ? `<p class="sub small">${src}${ref ? ` · ${esc(ref)}` : ''}.</p>` : ''}
    <h3>Meal</h3>${seg('fmeal', MEALS, e.m)}
    <details class="more"><summary>Its numbers, for one ${esc(e.u)}</summary>
      <div class="fgrid">${fld('e_n', 'Name', e.n, 'class="span2" maxlength="80"').replace('<label>', '<label class="span2">')}${fld('e_u', 'Portion', e.u, 'maxlength="40"')}${fld('e_g', `Weighs (${unit})`, e.g)}
        ${fld('e_k', 'kcal', e.k)}${fld('e_p', 'Protein g', e.p)}${fld('e_c', 'Carbs g', e.c)}${fld('e_ft', 'Fat g', e.ft)}${fld('e_fb', 'Fibre g', e.fb)}</div>
      <button class="solid" data-act="fnum">Use these numbers</button></details>
    <details class="more"><summary>Another day</summary>
      <div class="dayrow"><input type="date" id="fday" value="${day}" max="${todayKey()}"><button class="ghost" data-act="fmove">Move</button><button class="ghost" data-act="fcopy">Copy</button></div>
      <div class="rowb tight"><button class="link" data-act="fcopyd" data-d="-1">Copy to the day before</button><button class="link" data-act="fcopyd" data-d="1" ${day >= todayKey() ? 'hidden' : ''}>Copy to the day after</button></div></details>
    <div class="rowb"><button class="danger" data-act="fdel">Remove</button>${mine || e.cat === 'mine' ? '' : '<button class="ghost" data-act="fsave">Save as my food</button>'}<span class="grow"></span><button class="solid" data-act="popclose">Done</button></div></aside>`;
}
// What this portion holds, and the food per 100 g when its weight is known.
function foodSum(e) {
  const q = e.q, has = e.c != null, unit = mlOf(e);
  const cell = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  const per = e.g ? `Per 100 ${unit}: ${Math.round(e.k / e.g * 100)} kcal · ${r1(e.p / e.g * 100)} g protein${has ? ` · ${r1(e.c / e.g * 100)} g carbs · ${r1(e.ft / e.g * 100)} g fat` : ''} · ${r1((e.fb || 0) / e.g * 100)} g fibre` : '';
  const off = atwaterOff(e);
  const chk = off != null && e.k >= 20 && Math.abs(off) > 0.2 ? `<p class="flag small">The energy and the macros of this food disagree by ${Math.round(Math.abs(off) * 100)}%: one of the numbers is probably mistyped.</p>` : '';
  return `<div class="pmacs num">${cell(fmt(e.k * q), 'kcal')}${cell(r1(e.p * q), 'protein')}${cell(has ? r1(e.c * q) : DASH, 'carbs')}${cell(has ? r1(e.ft * q) : DASH, 'fat')}${cell(r1((e.fb || 0) * q), 'fibre')}</div>${per ? `<p class="sub small num center">${per}</p>` : ''}${chk}`;
}
// One food's own numbers from a form: name, portion, weight, kcal and macros. Carbs and fat only as a pair.
function formFood(px, base) {
  const v = id => $(`#${px}_${id}`)?.value ?? '';
  const k = num(v('k'), 0, 5000), c = num(v('c'), 0, 1000), ft = num(v('ft'), 0, 500);
  const f = { ...base, n: v('n').trim().slice(0, 80) || base.n, u: v('u').trim().slice(0, 40) || base.u, k, p: num(v('p'), 0, 500) ?? 0, fb: num(v('fb'), 0, 200) ?? 0 };
  delete f.c; delete f.ft; delete f.g;
  if (c != null && ft != null) Object.assign(f, { c, ft });
  const g = num(v('g'), 1, 5000); if (g != null) f.g = g;
  return k == null ? null : f;
}
// Your own food, changed: future entries use the new numbers; what you already logged keeps the numbers it had.
function vCustomEdit(p) {
  const f = S.custom.find(x => x.id === p.id);
  if (!f) return '';
  const fld = (id, label, v, attrs = 'type="number" inputmode="decimal" step="any"') => `<label>${label}<input id="${id}" ${attrs} value="${v == null ? '' : esc(String(v))}"></label>`;
  return `${sheetTop('Your food · one serving', esc(f.n), `cedit-${f.id}`)}
    <div class="fgrid">${fld('m_n', 'Name', f.n, 'maxlength="80"').replace('<label>', '<label class="span2">')}${fld('m_u', 'Serving', f.u, 'maxlength="40"')}${fld('m_g', 'Weighs (g / ml)', f.g)}
      ${fld('m_k', 'kcal', f.k)}${fld('m_p', 'Protein g', f.p)}${fld('m_c', 'Carbs g', f.c)}${fld('m_ft', 'Fat g', f.ft)}${fld('m_fb', 'Fibre g', f.fb)}</div>
    <p class="sub small">What you have already logged keeps the numbers it was logged with.</p>
    <div class="rowb"><button class="danger" data-act="delcustom" data-id="${esc(f.id)}">Delete</button><span class="grow"></span><button class="solid" data-act="csave" data-id="${esc(f.id)}">Save</button></div></aside>`;
}
// A meal saved as a plate.
function vPlateSave(p) {
  const items = (S.food[day] || []).filter(e => e.m === p.m), t = totals(day, p.m);
  const name = `${MEALS.find(m => m[0] === p.m)[1]}, ${items.slice(0, 2).map(e => e.n.split(/[ ,/(]/)[0].toLowerCase()).join(' and ')}`;
  return `${sheetTop(`${plural(items.length, 'food')} · ${fmt(t.k)} kcal · ${Math.round(t.p)} g protein`, 'Save as a plate', `plate-${p.m}`)}
    <p class="sub">${items.map(e => `${qtxt(e.q)} × ${esc(e.n)}`).join(' · ')}</p>
    <label class="line"><span class="sub">Name it</span><span class="f"><input id="pl_n" maxlength="40" value="${esc(name)}"></span></label>
    <p class="sub small">It appears first under Plates when you add food, for any meal, and goes in with one tap.</p>
    <div class="rowb"><button class="ghost" data-act="popclose">Cancel</button><span class="grow"></span><button class="solid" data-act="psave" data-m="${p.m}">Save plate</button></div></aside>`;
}
// The ruler under an amount: the value it lands on, as if that preset had been tapped.
SCRUB.pq = v => foodAct('pqset', { dataset: { v }, scrub: true });
SCRUB.fq = v => foodAct('fqset', { dataset: { v }, scrub: true });
PRESS.fentry = el => openPop({ kind: 'fedit', i: +el.dataset.i });
SWIPE.fdelrow = el => {
  const k = day, list = S.food[k] || [], i = +el.dataset.i, e = list[i];
  if (!e) return render();
  list.splice(i, 1); if (!list.length) delete S.food[k];
  save(); render();
  undoable(`${e.n} removed`, () => { (S.food[k] ||= []).splice(i, 0, e); });
};
function foodAct(a, el) {
  if (a === 'gday') { const k = el.dataset.k; if (!k || k === day || k > todayKey()) return true; transition(k < day ? 'back' : 'fwd', () => { day = k; buzz('tick'); render(); }); return true; }
  if (a === 'addmeal') { const m = el.dataset.v; if (m && overlay?.type === 'add' && m !== overlay.key) { buzz('tick'); location.replace(`#add-${m}`); } return true; }
  if (a === 'qweigh') { const i = document.querySelector('input[data-log="weights"]'); if (i) { i.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' }); setTimeout(() => i.focus(), motionOK() ? 350 : 0); } return true; }
  if (a === 'fedit') { openPop({ kind: 'fedit', i: +el.dataset.i }); return true; }
  if (a === 'qclear') { query = ''; const q = $('#q'); if (q) { q.value = ''; q.focus(); } el.hidden = true; $('#rows').innerHTML = addRows(overlay.key); $$('#chips button').forEach(b => b.classList.toggle('on', b.dataset.c === cat)); buzz('tick'); return true; }
  if (a === 'cedit') { openPop({ kind: 'cedit', id: el.dataset.id }); return true; }
  if (a === 'psaveopen') { openPop({ kind: 'plate', m: el.dataset.m }); return true; }
  if (a === 'csave') {
    const f = S.custom.find(x => x.id === el.dataset.id), nf = f && formFood('m', f);
    if (!nf) { buzz('warn'); toast('A food needs its kcal'); return true; }
    S.custom[S.custom.indexOf(f)] = cleanFood(nf, false); save(); buzz('ok'); toast(`${nf.n} saved`); closePop(); return true;
  }
  if (a === 'psave') {
    const items = (S.food[day] || []).filter(e => e.m === el.dataset.m).map(e => ({ ...e })), n = ($('#pl_n')?.value || '').trim().slice(0, 40);
    if (!n) { buzz('warn'); toast('Give the plate a name'); return true; }
    if (S.plates.length >= 40) { buzz('warn'); toast('Limit of 40 plates reached: delete one first'); return true; }
    S.plates.unshift({ n, items }); save(); buzz('ok'); toast(`${n} saved under Plates`); closePop(); return true;
  }
  if (a === 'plate') {
    const pl = S.plates[+el.dataset.i]; if (!pl) return true;
    for (const e of pl.items) bump(el.dataset.m, e, e.q);
    buzz('ok'); toast(`${pl.n} added`); refreshAdd(); return true;
  }
  if (a === 'delplate') {
    const i = +el.dataset.i, pl = S.plates[i]; if (!pl) return true;
    S.plates.splice(i, 1); save(); refreshAdd();
    undoable(`${pl.n} deleted`, () => S.plates.splice(i, 0, pl));
    return true;
  }
  if (['pq', 'pqset', 'pmeal', 'padd', 'pg', 'pqin'].includes(a)) {
    const f = pop && pickFood(pop.id);
    if (!f) return true;
    const paint = () => {
      const qi = $('#pqin'); if (qi && document.activeElement !== qi) qi.value = PORT.q;
      const g = $('#pg'); if (g && document.activeElement !== g) g.value = Math.round(PORT.q * f.g);
      const t = $('#psum'); if (t) t.innerHTML = foodSum({ ...f, q: PORT.q });
      $$('.seg button[data-act="pqset"]').forEach(b => b.classList.toggle('on', +b.dataset.v === PORT.q));
      if (!el.scrub) scrubTo('pq', PORT.q);
    };
    if (a === 'pq') { PORT.q = qStep(PORT.q, +el.dataset.d); buzz('tick'); paint(); }
    else if (a === 'pqset') { PORT.q = +el.dataset.v; if (!el.scrub) buzz('tick'); paint(); }
    else if (a === 'pqin') { const v = num(el.value, 0.05, 50); if (v != null) { PORT.q = r2(v); paint(); } }
    else if (a === 'pg') { const g = num(el.value, 1, 5000); if (g != null && f.g) { PORT.q = clamp(r2(g / f.g), 0.01, 50); paint(); } }
    else if (a === 'pmeal') { PORT.m = el.dataset.v; buzz('tick'); $$('.seg button[data-act="pmeal"]').forEach(b => b.classList.toggle('on', b.dataset.v === PORT.m)); const b = $('[data-act="padd"]'); if (b) b.textContent = `Add to ${mealName(PORT.m).toLowerCase()}`; }
    else {
      bump(PORT.m, f, PORT.q); buzz('ok');
      toast(`${qtxt(PORT.q)} × ${f.n} · ${MEALS.find(m => m[0] === PORT.m)[1].toLowerCase()}`);
      closePop();
    }
    return true;
  }
  if (!['fq', 'fqset', 'fmeal', 'fdel', 'fg', 'fqin', 'fnum', 'fmove', 'fcopy', 'fcopyd', 'fsave'].includes(a)) return false;
  const list = S.food[day] || [], i = pop?.i, e = list[i];
  if (!e) return true;
  const paint = () => {
    const q = $('#fqin'); if (q && document.activeElement !== q) q.value = e.q;
    const t = $('#fsum'); if (t) t.innerHTML = foodSum(e);
    const g = $('#fg'); if (g && document.activeElement !== g) g.value = Math.round(e.q * e.g);
    $$('.seg button[data-act="fqset"]').forEach(b => b.classList.toggle('on', +b.dataset.v === e.q));
    if (!el.scrub) scrubTo('fq', e.q);
  };
  if (a === 'fg') { const g = num(el.value, 1, 5000); if (g == null || !e.g) return true; e.q = clamp(r2(g / e.g), 0.01, 50); save(); paint(); return true; }
  if (a === 'fqin') { const v = num(el.value, 0.01, 50); if (v != null) { e.q = r2(v); save(); paint(); } return true; }
  if (a === 'fq') { e.q = qStep(e.q, +el.dataset.d); save(); buzz('tick'); paint(); return true; }
  if (a === 'fqset') { e.q = +el.dataset.v; save(); if (!el.scrub) buzz('tick'); paint(); return true; }
  if (a === 'fmeal') { e.m = el.dataset.v; save(); buzz('tick'); render(); return true; }
  if (a === 'fnum') {
    const nf = formFood('e', e);
    if (!nf) { buzz('warn'); toast('Enter the kcal for one portion'); return true; }
    const was = { ...e };
    for (const k of ['c', 'ft', 'g']) delete e[k];
    Object.assign(e, nf, { src: 'mine' });
    // Its own entry from now on: the library food keeps its numbers, and adding that food again starts a new line.
    if (FOODIDX.has(e.id) && (e.k !== was.k || e.p !== was.p || e.n !== was.n)) e.id = 'e' + Date.now().toString(36);
    save(); buzz('ok'); render();
    toast('Numbers changed', 6000, { label: 'Undo', fn: () => { const L = S.food[day] || [], j = L.indexOf(e); if (j >= 0) L[j] = was; save(); render(); } });
    return true;
  }
  if (a === 'fsave') {
    if (S.custom.length >= 300) { buzz('warn'); toast('Limit of 300 own foods reached'); return true; }
    const f = cleanFood({ ...e, id: 'x' + Date.now().toString(36), cat: 'mine', src: 'mine' }, false);
    S.custom.push(f); save(); buzz('ok'); toast(`${f.n} is now under Mine`); render(); return true;
  }
  if (a === 'fmove' || a === 'fcopy' || a === 'fcopyd') {
    const to = a === 'fcopyd' ? shift(day, +el.dataset.d) : $('#fday')?.value;
    if (!DATE.test(to || '') || to > todayKey()) { buzz('warn'); toast('Choose a day up to today'); return true; }
    if (to === day && a === 'fmove') return true;
    const copy = { ...e };
    (S.food[to] ||= []).push(copy);
    if (a === 'fmove') { list.splice(i, 1); if (!list.length) delete S.food[day]; }
    const k = day;
    save(); buzz('ok'); closePop();
    toast(`${a === 'fmove' ? 'Moved' : 'Copied'} to ${dateLabel(to, { weekday: 'short', day: 'numeric', month: 'short' })}`, 6000, { label: 'Undo', fn: () => {
      const L = S.food[to] || [], j = L.indexOf(copy); if (j >= 0) L.splice(j, 1); if (!L.length) delete S.food[to];
      if (a === 'fmove') (S.food[k] ||= []).splice(i, 0, e);
      save(); render();
    } });
    return true;
  }
  const k = day;
  list.splice(i, 1); if (!list.length) delete S.food[k];
  save(); closePop();
  undoable(`${e.n} removed`, () => { (S.food[k] ||= []).splice(i, 0, e); });
  return true;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-food.js');

'use strict';
// Today: what to eat next, the morning's numbers, and the meals.

// One concrete suggestion, built from what is actually left today.
function coach(T, t) {
  const pLeft = T.protein - t.p, kLeft = T.kcal - t.k, isToday = day === todayKey(), hour = new Date().getHours();
  if (!t.n) return isToday && hour < 11 ? `Start with protein: about ${T.perMeal} g at breakfast. A scoop of whey, or dahi with chilla, covers most of it.` : `Start with protein. Whey, usal or dahi at each meal covers most of ${T.protein} g.`;
  if (kLeft < -100) return `${fmt(-kLeft)} kcal over. One day does not move the trend; the 7-day average does. Log it and carry on.`;
  if (pLeft <= 8) return t.fb < T.fibre - 8 ? 'Protein done. Fibre is short: a peru, koshimbir, or bhakri instead of poli closes it.' : 'Protein done. Whatever calories remain are yours to spend.';
  const low = isToday ? MEALS.filter(([m]) => m !== 'snack' && totals(day, m).n && totals(day, m).p < T.perMeal * 0.6).map(m => m[1].toLowerCase()) : [];
  const wheyToday = (S.food[day] || []).filter(e => e.id === 'whey').reduce((a, e) => a + e.q, 0);
  const pick = []; let p = 0, k = 0;
  for (const id of GAP) {
    const f = food(id);
    if (pick.length >= 3 || pLeft - p <= 8) break;
    if ((id === 'whey' && wheyToday >= 2) || k + f.k > kLeft) continue;
    pick.push(f); p += f.p; k += f.k;
  }
  const lead = low.length ? `${low.join(' and ').replace(/^./, c => c.toUpperCase())} ${low.length > 1 ? 'were' : 'was'} light on protein. ` : '';
  if (!pick.length) return `${lead}${Math.round(pLeft)} g protein short with ${fmt(Math.max(0, kLeft))} kcal left. Whey in water is the leanest fix: 24 g for 120 kcal.`;
  return `${lead}${Math.round(pLeft)} g protein to go. ${pick.map(f => `${f.u.replace(/ \(.*/, '')} ${f.n.toLowerCase()}`).join(' + ')} gives ${Math.round(p)} g for ${fmt(k)} kcal.`;
}
function gauge(T, t) {
  const kp = Math.min(100, t.k / T.kcal * 100), pp = Math.min(100, t.p / T.protein * 100), over = t.k > T.kcal * 1.05, left = Math.round(T.kcal - t.k);
  // Arcs and the number ease from what was on screen last time, so adding food visibly moves them.
  const L = last.g?.day === day ? last.g : { kp: 0, pp: 0, left: T.kcal };
  last.g = { day, kp, pp, left };
  return `<svg class="gauge" viewBox="0 0 300 168" role="img" aria-label="${Math.round(t.k)} of ${T.kcal} kcal, ${Math.round(t.p)} of ${T.protein} g protein">
    <path d="M26 152A124 124 0 0 1 274 152" pathLength="100" class="track"/>
    ${kp > 0 ? `<path d="M26 152A124 124 0 0 1 274 152" pathLength="100" class="arc kc ${over ? 'over' : ''}" stroke-dasharray="${L.kp} 100" data-dash="${kp.toFixed(2)}"/>` : ''}
    <path d="M50 152A100 100 0 0 1 250 152" pathLength="100" class="track thin"/>
    ${pp > 0 ? `<path d="M50 152A100 100 0 0 1 250 152" pathLength="100" class="arc pr" stroke-dasharray="${L.pp} 100" data-dash="${pp.toFixed(2)}"/>` : ''}
    <text x="150" y="118" class="gnum" data-from="${Math.abs(L.left)}" data-to="${Math.abs(left)}" data-fmt="int">${fmt(Math.abs(left))}</text>
    <text x="150" y="144" class="gsub">kcal ${left < 0 ? 'over' : 'left'} of ${fmt(T.kcal)}</text></svg>`;
}
// The app's link to the watch: status, one tap to sync, or the one-time connect step.
function syncLine() {
  if (!NATIVE) return '';
  const st = SYNC.status;
  if (st && st.sdk !== 'ok') return `<p class="syncline flag" id="syncline">${st.sdk === 'update' ? 'Health Connect needs an update from the Play Store.' : 'Health Connect is not available on this phone.'}</p>`;
  if (st && !st.granted?.length) return `<div class="callout" id="syncline"><b>Bring in your watch data</b><span class="sub">Steps, sleep, heart rate, workouts and weight arrive by themselves from Health Connect. Nothing leaves the phone.</span><button class="solid" data-act="hcask">Allow access</button></div>`;
  const stale = S.meta.watch && gapDays(S.meta.watch, todayKey()) >= 1 && new Date().getHours() >= 9;
  const text = SYNC.busy ? 'Syncing with Health Connect…' : SYNC.err ? esc(SYNC.err) : S.meta.sync ? `Watch data synced ${ago(S.meta.sync)}${stale ? ` · latest from ${dateLabel(S.meta.watch)}` : ''}` : 'Not synced yet';
  return `<div class="syncline ${SYNC.err ? 'err' : ''}" id="syncline"><span class="grow">${text}</span>${stale && APP?.zepp ? '<button class="mini" data-act="zepp">Open Zepp</button>' : ''}<button class="mini" data-act="sync" ${SYNC.busy ? 'disabled' : ''} aria-label="Sync now">↻</button></div>`;
}
// A fresh install or a reinstall: offer the backup once. It goes for good when you dismiss it, choose a backup
// folder, import, or once there is anything in the app at all, including watch data.
function welcome() {
  if (!NATIVE || S.meta.welcomed || BACKUP.folder) return '';
  if (['food', 'weights', 'lifts', 'steps', 'sleep', 'hrv', 'cardio'].some(k => Object.keys(S[k]).length)) return '';
  return `<div class="callout"><button class="x" data-act="welcomed" aria-label="Dismiss">×</button><b>New here, or reinstalled?</b><span class="sub">If you have a backup from before, bring it in first. Otherwise choose a folder and the app keeps a copy there every day.</span>
    <div class="rowb"><button class="solid" data-act="import">Import a backup</button><button class="ghost" data-act="bkpick">Choose backup folder</button></div><input type="file" id="imp" accept="application/json,.json" hidden></div>`;
}
function readinessStrip() {
  const R = readiness(), V = R.V, sl = S.sleep[day];
  if (R.level === 'unknown' && !V.now) return '';
  const word = { go: 'Train as planned', care: 'Train, but listen to your body', easy: 'Keep today easy', unknown: 'Recovery' }[R.level];
  const bits = [V.now ? `HRV ${r1(V.now.rmssd)} ms` : null, restingHR(day) ? `resting ${Math.round(restingHR(day).v)} bpm` : null, sl != null ? `${r1(sl)} h sleep` : null].filter(Boolean);
  return `<a class="strip lv-${R.level}" href="#recovery"><span class="dot"></span><span class="grow"><b>${word}</b><span class="sub">${bits.join(' · ') || 'Do a morning check with the H9'}</span></span><span class="chev">›</span></a>`;
}
// What training is next, or how today's session is going.
function trainStrip() {
  const d = trainLetter(), plan = sessionPlan(day, d), St = sessionStats(day, plan);
  if (!plan.lifts.length) return '';
  const text = St.complete ? `${esc(plan.name)} done · ${plural(St.done, 'set')}` : St.done ? `${esc(plan.name)} · ${St.done} of ${St.total} sets` : `${esc(plan.name)} is next`;
  return `<a class="strip lv-${St.complete ? 'go' : 'none'}" href="#train"><span class="ic">${ICON.lift}</span><span class="grow"><b>${text}</b><span class="sub">${esc(plan.focus)}</span></span><span class="chev">›</span></a>`;
}
function vitalInput(stream, label, whyKey, unit, attrs, placeholder) {
  const v = S[stream][day], fromWatch = v != null && !S.manual[stream]?.[day] && stream !== 'waist';
  return `<label>${why(whyKey, label)}<span class="f"><input type="number" ${attrs} data-log="${stream}" value="${v ?? ''}" placeholder="${placeholder}"><i>${unit}</i></span>${fromWatch ? src('watch') : ''}</label>`;
}
function vToday() {
  const T = targets(), t = totals(day), isToday = day === todayKey(), y = shift(day, -1);
  const meals = MEALS.map(([m, label]) => {
    const mt = totals(day, m), main = m !== 'snack';
    const items = (S.food[day] || []).map((e, i) => [e, i]).filter(([e]) => e.m === m).map(([e, i]) => `<li data-flash="${esc(m + e.id)}"><button class="grow rowbtn" data-act="fedit" data-i="${i}"><span class="nm">${esc(e.n)}</span><span class="sub">${e.q} × ${esc(e.u)} · ${fmt(e.k * e.q)} kcal · ${r1(e.p * e.q)} g</span></button>
        <button class="step" data-act="q" data-m="${m}" data-id="${esc(e.id)}" data-d="-0.5" aria-label="Less ${esc(e.n)}">−</button><button class="step" data-act="q" data-m="${m}" data-id="${esc(e.id)}" data-d="0.5" aria-label="More ${esc(e.n)}">+</button></li>`).join('');
    const canCopy = !mt.n && totals(y, m).n;
    const pOk = main && mt.p >= T.perMeal * 0.8;
    return `<section class="meal"><div class="mh"><h2>${label}</h2><span class="num sub">${mt.n ? `${fmt(mt.k)} kcal · <span class="${pOk ? 'ok' : ''}">${Math.round(mt.p)} g protein</span>` : ''}</span><a class="plus" href="#add-${m}" aria-label="Add to ${label}"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></a></div>
      ${items ? `<ul>${items}</ul>` : canCopy ? `<button class="ghost" data-act="copy" data-m="${m}">Same as yesterday</button>` : ''}</section>`;
  }).join('');
  const done = S.food[day] ? isComplete(day) : null;
  const full = done == null ? '' : `<p class="fullline">${done ? 'Counts toward your burn estimate.' : 'Looks incomplete, so it is left out of your burn estimate.'} <button class="link" data-act="full">${done ? 'Mark incomplete' : 'Mark complete'}</button> ${why('logging', 'Why')}</p>`;
  const nav = d => `<button class="nav" data-act="day" data-d="${d}" ${d > 0 && isToday ? 'disabled' : ''} aria-label="${d < 0 ? 'Previous' : 'Next'} day">${d < 0 ? '‹' : '›'}</button>`;
  const title = isToday ? 'Today' : day === shift(todayKey(), -1) ? 'Yesterday' : dateLabel(day);
  return `${masthead(title, dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' }), { center: true, before: nav(-1), after: nav(1), h1: isToday ? '' : 'data-act="today" class="tap"' })}
    ${isToday ? welcome() + syncLine() + part(readinessStrip) + part(trainStrip) : ''}
    <section class="hero">${gauge(T, t)}
      <div class="legend"><div>${why('kcal', 'Calories')}<b class="num">${fmt(t.k)}<i> / ${fmt(T.kcal)}</i></b></div>
        <div>${why('protein', 'Protein')}<b class="num pr">${Math.round(t.p)}<i> / ${T.protein} g</i></b></div>
        <div>${why('fibre', 'Fibre')}<b class="num">${Math.round(t.fb)}<i> / ${T.fibre} g</i></b></div></div>
      <p class="coach">${coach(T, t)}</p></section>
    <section class="vitals">
      ${vitalInput('weights', 'Weight', 'rate', 'kg', 'inputmode="decimal" step="0.1"', r1(T.wt))}
      ${vitalInput('steps', 'Steps', 'steps', `/&nbsp;${fmt(T.stepGoal)}`, 'inputmode="numeric"', '0')}
      ${vitalInput('sleep', 'Sleep', 'sleep', 'h', 'inputmode="decimal" step="0.1"', '7–9')}
    </section>
    ${S.profile.shoulder ? `<label class="check"><input type="checkbox" data-act="prehab" ${S.prehab[day] ? 'checked' : ''}><span>Shoulder routine: stretch and band work</span></label>` : ''}
    ${meals}${full}`;
}

// ---------- add food ----------
function addRows(meal) {
  const q = query.trim().toLowerCase(), list = S.food[day] || [];
  const row = (f, del) => {
    const e = list.find(x => x.m === meal && x.id === f.id);
    return `<li class="${e ? 'on' : ''}" data-flash="${esc(meal + f.id)}"><div class="grow" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="1"><span class="nm">${esc(f.n)}</span><span class="sub">${esc(f.u)} · ${fmt(f.k)} kcal · ${f.p} g protein</span></div>
      ${e ? `<button class="step" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="-0.5" aria-label="Less">−</button><b class="qty num">${e.q}</b><button class="step" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="0.5" aria-label="More">+</button>`
        : `${del ? `<button class="x" data-act="delcustom" data-id="${esc(f.id)}" aria-label="Delete ${esc(f.n)}">×</button>` : ''}<span class="add" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="1">+</span>`}</li>`;
  };
  if (q) {
    const words = q.split(/\s+/);
    return allFoods().filter(f => words.every(w => f.n.toLowerCase().includes(w))).map(f => row(f)).join('') || '<li class="sub">Nothing by that name. Add it under Mine.</li>';
  }
  if (cat === 'thali') return THALI.map(([name, parts], i) => {
    const s = parts.reduce((a, [id, n]) => { const f = food(id); a.k += f.k * n; a.p += f.p * n; return a; }, { k: 0, p: 0 });
    return `<li data-act="thali" data-m="${meal}" data-i="${i}"><div class="grow"><span class="nm">${name}</span><span class="sub">${parts.map(([id, n]) => `${n} ${food(id).n.toLowerCase()}`).join(', ')}</span><span class="sub">${fmt(s.k)} kcal · ${Math.round(s.p)} g protein</span></div><span class="add">+</span></li>`;
  }).join('');
  if (cat === 'quick') return `<li class="form"><div class="grow"><span class="nm">Quick add</span><span class="sub">For a meal out or a label you can read: just the numbers.</span>
      <div class="fgrid"><input id="k_n" placeholder="What, optional" class="span2"><input id="k_k" type="number" inputmode="numeric" placeholder="kcal"><input id="k_p" type="number" inputmode="decimal" placeholder="Protein g"></div>
      <button class="solid" data-act="quick" data-m="${meal}">Add</button></div></li>` + (S.food[day] || []).filter(e => e.m === meal && e.cat === 'quick').map(e => row(e)).join('');
  if (cat === 'mine') return S.custom.map(f => row(f, true)).join('') + `<li class="form"><div class="grow"><span class="nm">Add your own</span>
      <div class="fgrid"><input id="c_n" placeholder="Name" class="span2"><input id="c_u" placeholder="Serving, e.g. 1 bar"><input id="c_k" type="number" inputmode="decimal" placeholder="kcal">
      <input id="c_p" type="number" inputmode="decimal" placeholder="Protein g"><input id="c_fb" type="number" inputmode="decimal" placeholder="Fibre g"></div>
      <button class="solid" data-act="custom" data-m="${meal}">Save and add</button></div></li>`;
  if (cat === 'usual') {
    const fr = S.freq[meal] || {}, ids = Object.keys(fr).sort((a, b) => fr[b] - fr[a]);
    return [...new Set([...ids, ...USUAL[meal]])].slice(0, 14).map(food).filter(Boolean).map(f => row(f)).join('');
  }
  return allFoods().filter(f => f.cat === cat).map(f => row(f)).join('');
}
function addFoot(meal) {
  const t = totals(day, meal), T = targets(), all = totals(day);
  return `<div><b class="num">${fmt(t.k)} kcal · ${Math.round(t.p)} g protein</b><span class="sub num">Day: ${fmt(all.k)} / ${fmt(T.kcal)} · ${Math.round(all.p)} / ${T.protein} g</span></div><button class="solid" data-act="close">Done</button>`;
}
function vAdd(meal) {
  return `${masthead(MEALS.find(m => m[0] === meal)[1], `Add to · ${dateLabel(day, { weekday: 'short', day: 'numeric', month: 'short' })}`, { before: '<button class="nav" data-act="close" aria-label="Back">‹</button>' })}
    <input id="q" type="search" placeholder="Search: poli, usal, pohe, whey" value="${esc(query)}" autocomplete="off">
    <div class="chips">${CATS.map(([c, l]) => `<button class="${c === cat && !query ? 'on' : ''}" data-act="cat" data-c="${c}">${l}</button>`).join('')}</div>
    <ul class="foods" id="rows">${addRows(meal)}</ul>
    <footer class="addfoot" id="foot">${addFoot(meal)}</footer>`;
}
function bump(meal, f, d) {
  if (!f) return;
  const list = S.food[day] ||= [];
  let e = list.find(x => x.m === meal && x.id === f.id);
  if (!e) { if (d <= 0) return; e = { id: f.id, n: f.n, u: f.u, k: f.k, p: f.p, fb: f.fb, cat: f.cat, m: meal, q: 0 }; list.push(e); }
  e.q = r1(e.q + d);
  if (e.q <= 0) list.splice(list.indexOf(e), 1);
  if (!list.length) delete S.food[day];
  if (d >= 1 && f.cat !== 'quick') { const fr = S.freq[meal] ||= {}; fr[f.id] = (fr[f.id] || 0) + 1; }
  if (d > 0) flash(meal + f.id);
  buzz('tick');
  save();
}

// ---------- editing an entry ----------
function vFoodEdit(i) {
  const e = (S.food[day] || [])[i];
  if (!e) return '';
  return `<div class="scrim" data-act="popclose"></div><aside class="sheet" role="dialog" aria-label="${esc(e.n)}" data-key="fedit-${i}"><div class="grab"></div>
    <div class="eyebrow">${esc(e.u)} · ${fmt(e.k)} kcal · ${e.p} g protein each</div><h1>${esc(e.n)}</h1>
    <div class="wstep big"><button class="step" data-act="fq" data-d="-0.5" data-repeat="fq-">−</button><span class="grow"><b class="num" id="fq">${e.q}</b> × ${esc(e.u)}</span><button class="step" data-act="fq" data-d="0.5" data-repeat="fq+">+</button></div>
    ${seg('fqset', [0.5, 1, 1.5, 2, 3].map(q => [q, q === 0.5 ? '½' : q === 1.5 ? '1½' : String(q)]), e.q, 'tight')}
    <p class="num center fsum" id="fsum">${fmt(e.k * e.q)} kcal · ${r1(e.p * e.q)} g protein · ${r1(e.fb * e.q)} g fibre</p>
    <h3>Meal</h3>${seg('fmeal', MEALS, e.m)}
    <div class="rowb"><button class="danger" data-act="fdel">Remove</button><span class="grow"></span><button class="solid" data-act="popclose">Done</button></div></aside>`;
}
function foodAct(a, el) {
  if (a === 'fedit') { openPop({ kind: 'fedit', i: +el.dataset.i }); return true; }
  if (!['fq', 'fqset', 'fmeal', 'fdel'].includes(a)) return false;
  const list = S.food[day] || [], i = pop?.i, e = list[i];
  if (!e) return true;
  const paint = () => { const q = $('#fq'); if (q) q.textContent = e.q; const t = $('#fsum'); if (t) t.textContent = `${fmt(e.k * e.q)} kcal · ${r1(e.p * e.q)} g protein · ${r1(e.fb * e.q)} g fibre`; $$('.seg button[data-act="fqset"]').forEach(b => b.classList.toggle('on', +b.dataset.v === e.q)); };
  if (a === 'fq') { e.q = clamp(r1(e.q + +el.dataset.d), 0.5, 50); save(); buzz('tick'); paint(); return true; }
  if (a === 'fqset') { e.q = +el.dataset.v; save(); buzz('tick'); paint(); return true; }
  if (a === 'fmeal') { e.m = el.dataset.v; save(); buzz('tick'); render(); return true; }
  const k = day;
  list.splice(i, 1); if (!list.length) delete S.food[k];
  save(); closePop();
  undoable(`${e.n} removed`, () => { (S.food[k] ||= []).splice(i, 0, e); });
  return true;
}

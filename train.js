'use strict';
// The training engine: which session is next, what each exercise should be next time and why, and what the week
// added up to. The lifting itself happens in openGym; this is what Health's plan file and analysis are made from.
// Reads S and writes nothing.

function prog() { return PROGRAMS[S.settings.prog]; }
function exName(id) { return EXD[id]?.n || (id.startsWith('og:') ? ogx(id.slice(3))?.n || id : id.startsWith('x:') ? id.slice(2) : id); }
// The muscles an exercise trains: Health's own library, or openGym's for one logged there.
function hitsOf(id) { return EXD[id]?.hits || (String(id).startsWith('og:') ? ogx(id.slice(3))?.hits : null) || {}; }
function isHold(id) { return EXD[id] ? EXD[id].unit === 's' : String(id).startsWith('og:') && ogx(id.slice(3))?.kind === 'h'; }
function isBw(id) { return !!EXD[id]?.bw; }
function equipHas(id, word) { return (EXD[id]?.eq || '').toLowerCase().includes(word); }
function isBarbell(id) { return equipHas(id, 'barbell') || equipHas(id, 'ez bar'); }

// ---------- which session ----------
// The day after the last one you did in this programme. Rotation, not the calendar: a missed day never skips a session.
function nextDay(before = day) {
  const P = prog(), order = Object.keys(P.days);
  const last = Object.keys(S.lifts).filter(k => k < before && S.lifts[k].prog === S.settings.prog).sort().pop();
  if (!last) return order[0];
  return order[(order.indexOf(S.lifts[last].day) + 1) % order.length] || order[0];
}

// ---------- shoulder ----------
// Reports for one exercise, newest first, skipping any from before you brought it back.
function painRun(id, before = day) {
  let run = 0, last = null;
  for (const k of Object.keys(S.lifts).filter(k => k < before).sort().reverse()) {
    if (S.cleared[id] && k <= S.cleared[id]) break;
    const st = S.lifts[k].sx?.[id];
    if (!st) continue;
    if (last == null) last = st;
    if (st === 'pain') run++; else break;
  }
  return { last, run };
}
function shoulderLoads(id) { const h = hitsOf(id); return EXD[id]?.sh === 'caution' || !!(h.chest || h.frontDelts || h.sideDelts || h.rearDelts); }

// ---------- today's plan ----------
// The programme day, then dumbbells-at-home substitutes, then shoulder care, then today's swaps.
// Each lift: { id, sets, lo, hi, note, from (what it replaced), why (in words) }.
function sessionPlan(k = day, dayId = trainLetter()) {
  return cached(`plan${k}${dayId}${S.settings.prog}`, () => {
    const D = prog().days[dayId], home = S.profile.equip === 'home', care = S.profile.shoulder, out = [], used = new Set(), retired = [];
    const take = (l, id, from, why, base) => { used.add(id); out.push({ id, base, sets: l[1], lo: l[2], hi: l[3], note: l[4] || '', from, why }); };
    for (const l of D.lifts) {
      let id = l[0], from = null, why = '';
      if (home && !freeKit(id)) {
        const h = HOME[id] && !used.has(HOME[id]) ? HOME[id] : altPool(id, { free: true, busy: used })[0];
        if (h) { from = id; id = h; why = 'Dumbbells-at-home version.'; }
      }
      if (care && SHOULDER_SUB[id]) {
        const alt = SHOULDER_SUB[id].find(a => !used.has(a) && (!home || freeKit(a)));
        if (!alt) continue;
        from = from || id; id = alt; why = 'Shoulder care: the same muscles without the end-range position.';
      }
      if (care) {
        const R = painRun(id, k);
        if (R.run >= 2) { retired.push(id); continue; }
        if (R.last === 'pain') {
          const alt = altPool(id, { busy: used, safe: true, free: home })[0];
          if (alt) { from = from || id; id = alt; why = 'Pain reported here last session, so it is swapped today.'; }
        }
      }
      const base = id, sw = S.swaps[k]?.[id];
      if (sw && EXD[sw] && !used.has(sw)) { from = from || id; id = sw; why = 'Swapped for today.'; }
      if (used.has(id)) continue;
      take(l, id, from, why, base);
    }
    return { day: dayId, name: D.n, focus: D.focus, lifts: out, retired };
  });
}
function trainLetter() {
  const L = S.lifts[day];
  if (L && L.prog === S.settings.prog && prog().days[L.day]) return L.day;
  return nextDay();
}

// ---------- alternatives ----------
function primaryOf(id) { const h = hitsOf(id); return Object.keys(h).find(m => h[m] === 1) || Object.keys(h)[0]; }
function freeKit(id) { return equipHas(id, 'dumbbell') || equipHas(id, 'bodyweight') || equipHas(id, 'band') || equipHas(id, 'floor'); }
// Other exercises for the same main muscle: direct substitutes first, then always-available kit, then the least technical.
function altPool(id, { free = false, busy = new Set(), safe = S.profile.shoulder } = {}) {
  const prim = primaryOf(id);
  if (!prim) return [];
  const share = k => EXD[k].hits[prim] || 0;
  return Object.keys(EXD).filter(k => k !== id && !busy.has(k) && share(k) && (!free || freeKit(k)) && (!safe || EXD[k].sh === 'safe'))
    .sort((a, b) => share(b) - share(a) || (freeKit(a) ? 0 : 1) - (freeKit(b) ? 0 : 1) || EXD[a].demand - EXD[b].demand);
}

// ---------- history and progression ----------
// Past sessions that included this exercise, newest first; only sets with reps count.
function liftLog(id, before = day, max = 8) {
  const out = [];
  for (const k of Object.keys(S.lifts).filter(k => k < before).sort().reverse()) {
    const sets = (S.lifts[k].ex[id] || []).filter(s => s[1] > 0);
    if (sets.length) out.push({ k, sets });
    if (out.length >= max) break;
  }
  return out;
}
function workKg(sets) { const w = sets.map(s => s[0] || 0); return w.length ? Math.max(...w) : 0; }
function stepFor(id) {
  if (isBw(id)) return 2.5;
  if (equipHas(id, 'dumbbell') && !equipHas(id, 'machine')) return S.settings.dbStep;
  if (isBarbell(id)) return ['rdl', 'hip-thrust'].includes(id) ? 5 : 2.5;
  return 2.5;
}
function roundTo(x, step) { return Math.round(x / step) * step; }
// Double progression on reps you actually did. Returns the load, a rep target per set, and the reason.
function progression(L, before = day, lite = false) {
  const { id, lo, hi, sets } = L, h = liftLog(id, before), inc = stepFor(id), bw = isBw(id), unit = isHold(id) ? 's' : '';
  const say = (kind, kgv, reps, why) => ({ kind, kg: kgv, reps: Array.from({ length: sets }, (_, i) => reps[Math.min(i, reps.length - 1)]), why });
  if (!h.length) return say('first', bw ? 0 : null, [hi], bw ? `First time. Aim for ${lo}–${hi}${unit} with clean form.` : `First time. Pick a load you could lift about ${hi + 2} times, and stop at ${hi}.`);
  const last = h[0], w = workKg(last.sets), reps = last.sets.map(s => s[1]);
  if (S.profile.shoulder && painRun(id, before).last === 'niggle') return say('hold', w, reps.map(r => clamp(r, lo, hi)), 'A niggle last time: same load, and stop each rep short of the position that bothered it.');
  if (lite) return say('lite', w, reps.map(r => clamp(r, lo, hi)), 'Recovery says keep it easy: last time’s load and reps, one set fewer.');
  const all = reps.length >= Math.min(sets, 2) && reps.every(r => r >= hi);
  if (all) {
    if (bw && !w) return say('raise', 0, [hi], `Every set reached ${hi}${unit}. Hold a weight, slow the lowering, or move to a harder version.`);
    return say('raise', roundTo(w + inc, inc), [lo], `Every set reached ${hi}${unit} last time, so the load goes up ${kg(inc)} kg and the reps start again at ${lo}.`);
  }
  if (reps.some(r => r < lo)) {
    let stalls = 0;
    for (const s of h.slice(0, 4)) { if (s.sets.some(x => x[1] < lo)) stalls++; else break; }
    if (stalls >= 3 && w > 0) return say('deload', roundTo(w * 0.9, inc), [hi], `Third session under ${lo}${unit}. Down 10% to build back instead of grinding.`);
    return say('hold', w, reps.map(r => clamp(r + 1, lo, hi)), `Some sets fell under ${lo}${unit}. Same load until every set gets there.`);
  }
  return say('reps', w, reps.map(r => clamp(r + 1, lo, hi)), `In range. One more rep per set at ${bw && !w ? 'bodyweight' : kg(w) + ' kg'}; the load goes up when every set reaches ${hi}${unit}.`);
}
// Epley estimate of the best single rep; sets over 15 reps and holds are left out.
function e1rm(sets) { let b = 0; for (const s of sets || []) if (s && s[0] > 0 && s[1] > 0 && s[1] <= 15) b = Math.max(b, s[0] * (1 + s[1] / 30)); return b; }
function liftHistory() {
  return cached('lifts', () => {
    const by = {};
    for (const k of Object.keys(S.lifts).sort()) for (const [id, sets] of Object.entries(S.lifts[k].ex)) { const b = e1rm(sets); if (b) (by[id] ||= []).push({ k, v: b }); }
    return by;
  });
}
function bestBefore(id, k) { let b = 0; for (const x of liftHistory()[id] || []) if (x.k < k) b = Math.max(b, x.v); return b; }
// Strength across lifts over the last 12 weeks: the first two sessions against the last two, per lift.
function strength() {
  const from = shift(todayKey(), -84);
  const ratios = Object.values(liftHistory()).map(a => a.filter(x => x.k >= from)).filter(a => a.length >= 3).map(a => mean(a.slice(-2).map(x => x.v)) / mean(a.slice(0, 2).map(x => x.v)));
  return ratios.length ? { pct: (mean(ratios) - 1) * 100, n: ratios.length } : null;
}
function restFor(id) {
  if (S.settings.rest) return S.settings.rest;
  if (isHold(id)) return 60;
  const h = EXD[id]?.hits || {}, direct = Object.values(h).filter(v => v === 1).length;
  return direct >= 2 || EXD[id]?.demand >= 2 ? 150 : 90;
}
// ---------- the week ----------
// Fractional sets per muscle over 7 days: 1 for the muscle an exercise is for, 0.5 for one it trains on the way.
function volume(end = todayKey()) {
  return cached('vol' + end, () => {
    const v = Object.fromEntries(Object.keys(MUS).map(m => [m, 0]));
    for (const k of range(7, end)) for (const [id, sets] of Object.entries(S.lifts[k]?.ex || {})) {
      const n = sets.filter(s => s[1] > 0).length, h = hitsOf(id);
      if (n) for (const m in h) if (m in v) v[m] += h[m] * n;
    }
    return v;
  });
}
function groupVolume(end) {
  const v = volume(end), g = Object.fromEntries(GROUPS.map(x => [x, 0])), c = Object.fromEntries(GROUPS.map(x => [x, 0]));
  for (const m in v) { g[MUS[m][2]] += v[m]; c[MUS[m][2]]++; }
  // A group is as trained as its best-covered big muscle, not the sum of every head.
  for (const x of GROUPS) g[x] = Math.max(...Object.keys(MUS).filter(m => MUS[m][2] === x).map(m => v[m]));
  return g;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('train.js');

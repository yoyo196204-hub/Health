'use strict';
// How the app feels: haptics, motion between screens, sheets, toasts with undo, press-and-hold for anything that
// removes data, and numbers that move to their new value instead of jumping. Nothing here touches stored data.

// ---------- haptics ----------
// A small vocabulary, used consistently: press = a finger lands on something that responds; tick = a value or choice
// changed, or a gesture crossed its threshold; swipe = a swipe committed; ok = something was saved; done = a whole
// session or check finished; warn = refused, out of range, or a cue that needs you; heavy = data was removed;
// inhale, exhale, hold = the breathing pacer. Inside the app the phone's own haptic engine plays them, composed from
// its haptic primitives where it has them; in Chrome, short vibrations of the same shape.
// One touch never buzzes twice: a lighter haptic within 90 ms of another is dropped.
const ACT_HOLD = {};   // actions that need a press and hold, filled in by each screen
const SWIPE = {};      // what a committed swipe on [data-swipe] does, filled in by each screen
const HAPTIC = { press: [5], detent: [4], tick: [9], swipe: [8, 30, 12], ok: [18], done: [16, 60, 16, 60, 40], warn: [34, 50, 34], heavy: [40],
  inhale: [8, 40, 12, 40, 16, 40, 22], exhale: [22, 40, 16, 40, 10], hold: [6] };
const HAPTIC_RANK = { press: 0, hold: 0, detent: 1, tick: 1, swipe: 2, inhale: 2, exhale: 2, ok: 3, warn: 4, heavy: 4, done: 5 };
let lastBuzz = { t: 0, r: -1 };
function buzz(kind) {
  const mode = S?.settings?.haptics || 'full';
  const now = performance.now(), r = HAPTIC_RANK[kind] ?? 1;
  if (now - lastBuzz.t < 90 && r <= lastBuzz.r) return;
  // The press already answered this touch: the tick of the choice it makes would be a second buzz for one tap.
  if (kind === 'tick' && lastBuzz.r === 0 && now - lastBuzz.t < 320) return;
  lastBuzz = { t: now, r };
  sfx(kind);
  if (mode === 'off' || (mode === 'subtle' && (kind === 'tick' || kind === 'press' || kind === 'detent'))) return;
  if (NATIVE && nat('haptic', kind) === true) return;
  try { navigator.vibrate?.(HAPTIC[kind] || 8); } catch (e) { /* no vibration here */ }
}
// ---------- sounds ----------
// Short tones made on the spot (no sound files), soft enough to sit under the haptic rather than over it: a two-note
// rise for saved, a three-note chord for a finished session, a falling pair for a refusal, a low thump for a removal.
// The strap has its own: a rising fifth when it connects, the same falling when it drops, a single bell when a
// measurement starts, and on the breathing pacer a low note to breathe in and a lower one to breathe out, so the
// pacer can be followed with the eyes closed.
// Key moments (the default) plays the saves, finishes, refusals and strap cues; Every touch adds a faint tick.
// Inside the app nothing plays unless the phone is on ring: vibrate and silent mean silent.
const SFX = {
  tick: [[1760, 0, .025, .018, 'sine']],
  ok: [[880, 0, .14, .05], [1318.5, .06, .18, .045]],
  done: [[1046.5, 0, .5, .045], [1318.5, .07, .5, .04], [1568, .14, .7, .04]],
  warn: [[466, 0, .16, .05, 'triangle'], [370, .11, .22, .05, 'triangle']],
  heavy: [[180, 0, .22, .07, 'sine', 90]],
  swipe: [[1174.7, 0, .09, .025]],
  connect: [[659.3, 0, .22, .045], [987.8, .09, .35, .045]],
  lost: [[987.8, 0, .2, .045], [659.3, .1, .35, .045]],
  start: [[1568, 0, .9, .035], [3136, 0, .5, .008]],
  inhale: [[392, 0, 1.1, .03, 'sine', 523.3]], exhale: [[392, 0, 1.3, .028, 'sine', 293.7]],
};
const SFX_KEY = new Set(['ok', 'done', 'warn', 'heavy', 'connect', 'lost', 'start', 'inhale', 'exhale']);
let actx = null, ringAt = 0, ringOk = true;
function sfx(kind) {
  const mode = S?.settings?.sound || 'key', notes = SFX[kind];
  if (!notes || mode === 'off' || (mode === 'key' && !SFX_KEY.has(kind))) return;
  if (NATIVE) { const now = Date.now(); if (now - ringAt > 3000) { ringAt = now; ringOk = nat('ringer') !== 'silent' && nat('ringer') !== 'vibrate'; } if (!ringOk) return; }
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime + .005, out = actx.createGain();
    out.gain.value = 1; out.connect(actx.destination);
    for (const [f, at, len, vol, type = 'sine', to] of notes) {
      const o = actx.createOscillator(), g = actx.createGain(), t = t0 + at;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + len * .8);
      // A quick rise and an exponential fall: a struck tone, not a beep.
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + len + .02);
    }
  } catch (e) { /* no audio here */ }
}
// A light press under the finger the moment it lands on anything that navigates or acts, before the click.
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  const el = e.target.closest('a[href], button:not(:disabled), [data-act], .tile, label.toggle, label.check');
  if (el && !el.closest('[data-hold], [data-repeat], input')) buzz('press');
}, { passive: true });
function motionOK() {
  const m = S?.settings?.motion || 'system';
  return m === 'full' || (m === 'system' && !matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// ---------- moving between screens ----------
// A new screen is there on the next frame: no snapshot of the old one first (the View Transitions API captures the
// whole screen before it can draw the new one, which a phone feels as lag). It fades in over a sixth of a second;
// a page pushed on top slides in a little from the side it came from. dir is 'fwd', 'back', 'push' or 'pop'.
function transition(dir, fn) {
  fn();
  if (motionOK() && !document.hidden) fresh(dir);
}
function fresh(dir) {
  const v = $('#view');
  if (!v || !motionOK()) return;
  v.classList.remove('fresh'); void v.offsetWidth;
  v.dataset.dir = dir || ''; v.classList.add('fresh');
  clearTimeout(fresh.t); fresh.t = setTimeout(() => v.classList.remove('fresh'), 400);
}

// ---------- toast ----------
let toastFn = null;
function toast(msg, ms = 2400, action = null) {
  const t = $('#toast');
  if (!t) return;
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  toastFn = action?.fn || null;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.classList.remove('show'); toastFn = null; }, ms);
}
// After anything is removed: one tap puts it back.
function undoable(msg, undo) { buzz('heavy'); toast(msg, 6000, { label: 'Undo', fn: () => { undo(); save(); render(); buzz('tick'); toast('Put back'); } }); }
document.addEventListener('click', e => {
  if (!e.target.closest('#toast button') || !toastFn) return;
  const fn = toastFn; toastFn = null; $('#toast').classList.remove('show'); fn();
});

// ---------- sheets ----------
// A sheet that is not its own address (editing an entry, a confirmation) sits on the history stack, so the
// phone's back gesture closes it like any other screen.
let pop = null, popKey = '';
function openPop(p) { pop = p; history.pushState({ pop: 1 }, ''); buzz('tick'); renderView(); }
function closePop() { if (!pop) return; if (history.state?.pop) history.back(); else { pop = null; render(); } }
addEventListener('popstate', () => { if (pop) { pop = null; render(); } });
// The sheet slides in only when it first appears, not on every re-render while it is open.
function sheetEntered() {
  const sh = $('#sheet .sheet'), key = sh ? (sh.dataset.key || sh.getAttribute('aria-label')) : '';
  if (sh && key !== popKey && motionOK()) sh.classList.add('enter');
  popKey = key;
}
// Dragging a sheet down to dismiss it lives in motion.js, with the rest of the physics.

addEventListener('keydown', e => { if (e.key === 'Escape') { if (pop) closePop(); else if (overlay) goBack(); } });

// ---------- swipes ----------
// Sideways on a tab: the next or previous tab, the screen following the finger. Sideways right on a page (a setting,
// adding food, a Lab session): back. On a row marked data-swipe: drag it left past a third of its width and it goes
// (with undo); a result card goes either way. A toast can be flicked away. Nothing starts at the very edges, which
// belong to the phone's own back gesture, or on anything that scrolls sideways itself.
(() => {
  let st = null;
  const NOGO = 'input, textarea, select, [data-fling], .callout, .banner, .chips, .seg.scroll, .cards, .todo, .wave, .trace, .orb, .rfbars, .bx, .scrub, .sheet, #tabs, #fab';
  const pageOpen = () => overlay && ['add', 'set', 'lab', 'beats'].includes(overlay.type);
  // Android 15's back gesture (OxygenOS included) takes about 24 dp in from either edge, wider at its higher
  // sensitivities: nothing of the app's starts there, rows included, so a back swipe never also deletes a row.
  const EDGE = 28;
  document.addEventListener('touchstart', e => {
    st = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0], x = t.clientX, w = innerWidth;
    if (x < EDGE || x > w - EDGE) return;
    const row = e.target.closest('[data-swipe]'), food = e.target.closest('.foods li[data-press]');
    if (e.target.closest('#toast')) return;   // the toast is flung in motion.js
    if (row && !e.target.closest('input, select, textarea')) { st = { kind: 'row', el: row, x0: x, y0: t.clientY, t0: performance.now() }; return; }
    if (food && !e.target.closest('button')) { st = { kind: 'amount', el: food, x0: x, y0: t.clientY, t0: performance.now() }; return; }
    if (pop || document.body.classList.contains('sheet-open') || e.target.closest(NOGO)) return;
    if (HR.mode && !overlay) return;   // a live recording is never swiped away from
    st = { kind: pageOpen() ? 'back' : overlay ? null : tab === 'food' ? 'day' : TABS.includes(tab) ? 'tab' : tab === 'me' ? 'back' : null, x0: x, y0: t.clientY, t0: performance.now() };
    if (!st.kind) st = null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!st) return;
    const t = e.touches[0], dx = t.clientX - st.x0, dy = t.clientY - st.y0;
    if (!st.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      st.axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'y';
      if (st.axis === 'y') { st = null; return; }
      st.el ||= $('#view');
      st.el.style.transition = 'none';
    }
    st.dx = dx;
    if (st.kind === 'tab') {
      const i = TABS.indexOf(tab), edge = (dx > 0 && i === 0) || (dx < 0 && i === TABS.length - 1);
      st.el.style.transform = `translate3d(${(edge ? dx * 0.12 : dx * 0.45).toFixed(1)}px, 0, 0)`;
      st.el.style.opacity = (1 - Math.min(0.35, Math.abs(dx) / 900)).toFixed(3);
      const now = Math.abs(dx) > 80 && !edge;
      if (now !== !!st.armed) { st.armed = now; buzz('tick'); }
    } else if (st.kind === 'day') {
      const fut = dx < 0 && day >= todayKey();
      st.el.style.transform = `translate3d(${(fut ? dx * 0.1 : dx * 0.5).toFixed(1)}px, 0, 0)`;
      st.el.style.opacity = (1 - Math.min(0.3, Math.abs(dx) / 900)).toFixed(3);
      const now = Math.abs(dx) > 70 && !fut;
      if (now !== !!st.armed) { st.armed = now; buzz('tick'); }
    } else if (st.kind === 'amount') {
      const d = Math.max(0, dx), r = d < 70 ? d : 70 + (d - 70) * 0.25;
      st.el.style.transform = `translate3d(${r.toFixed(1)}px, 0, 0)`;
      const now = d > 64;
      if (now !== !!st.armed) { st.armed = now; st.el.classList.toggle('pressing', now); buzz('tick'); }
    } else if (st.kind === 'back') {
      const d = Math.max(0, dx);
      st.el.style.transform = `translate3d(${(d * 0.6).toFixed(1)}px, 0, 0)`;
      st.el.style.opacity = (1 - Math.min(0.4, d / 700)).toFixed(3);
      const now = d > 90;
      if (now !== !!st.armed) { st.armed = now; buzz('tick'); }
    } else if (st.kind === 'row') {
      const two = st.el.dataset.swipe === 'hrresdone', d = two ? dx : Math.min(0, dx);
      st.el.style.transform = `translate3d(${d.toFixed(1)}px, 0, 0)`;
      st.el.classList.add('swiping');
      const now = Math.abs(d) > st.el.offsetWidth * (two ? 0.28 : 0.33);
      st.el.classList.toggle('armed', now);
      if (now !== !!st.armed) { st.armed = now; buzz('tick'); }
    }
  }, { passive: true });
  const end = () => {
    if (!st || !st.axis) { st = null; return; }
    const { kind, el, dx = 0 } = st, v = Math.abs(dx) / Math.max(1, performance.now() - st.t0), fast = v > 0.6 && Math.abs(dx) > 40;
    st = null;
    el.style.transition = '';
    if (kind === 'tab') {
      const i = TABS.indexOf(tab), to = TABS[i + (dx < 0 ? 1 : -1)];
      if ((Math.abs(dx) > 80 || fast) && to) { el.style.transform = ''; el.style.opacity = ''; buzz('swipe'); location.hash = to; }
      else { el.style.transform = ''; el.style.opacity = ''; }
    } else if (kind === 'day') {
      el.style.transform = ''; el.style.opacity = '';
      const d = dx < 0 ? 1 : -1;
      if ((Math.abs(dx) > 70 || fast) && !(d > 0 && day >= todayKey())) { buzz('swipe'); transition(d > 0 ? 'fwd' : 'back', () => { day = shift(day, d); render(); }); }
    } else if (kind === 'amount') {
      el.style.transform = ''; el.classList.remove('pressing');
      if (dx > 64 && PRESS.food) { buzz('ok'); PRESS.food(el); }
    } else if (kind === 'back') {
      el.style.transform = ''; el.style.opacity = '';
      if (dx > 90 || (fast && dx > 0)) { buzz('swipe'); goBack(); }
    } else if (kind === 'row') {
      const two = el.dataset.swipe === 'hrresdone', go = two ? Math.abs(dx) > el.offsetWidth * 0.28 || fast : dx < -el.offsetWidth * 0.33 || (fast && dx < 0);
      el.classList.remove('armed');
      if (go) {
        el.style.transform = `translateX(${dx < 0 ? '-' : ''}110%)`; el.style.opacity = '0';
        buzz('swipe');
        setTimeout(() => { el.classList.remove('swiping'); const f = SWIPE[el.dataset.swipe]; if (f) f(el); else el.style.transform = el.style.opacity = ''; }, 200);
      } else { el.style.transform = ''; setTimeout(() => el.classList.remove('swiping'), 250); }
    }
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
})();
SWIPE.hrresdone = () => hrAct('hrresdone');

// ---------- the ruler ----------
// [data-scrub] is a tape of ticks under a fixed needle. Dragging moves the tape; each step that passes the needle
// ticks, and the value is handed to SCRUB[kind] as it changes. Let go fast and it keeps rolling, slowing down, and
// settles on a step. Arrow keys move it one step.
const SCRUB = {};
function scrubTo(kind, v) {
  const el = document.querySelector(`[data-scrub="${kind}"]`);
  if (!el || el.dataset.drag) return;
  const { step, min, max, px } = el.dataset, x = -((clamp(v, +min, +max) - +min) / +step) * +px;
  el.dataset.v = v; el.setAttribute('aria-valuenow', v);
  const tape = el.firstElementChild; tape.style.transition = 'transform .45s var(--spring)'; tape.style.transform = `translateX(${x.toFixed(1)}px)`;
}
(() => {
  let g = null;
  const geo = el => ({ step: +el.dataset.step, min: +el.dataset.min, max: +el.dataset.max, px: +el.dataset.px });
  const place = (el, off) => { el.firstElementChild.style.transform = `translateX(${off.toFixed(1)}px)`; };
  const valAt = (G, off) => clamp(Math.round(-off / G.px) * G.step + G.min, G.min, G.max);
  const emit = (el, v) => {
    v = +v.toFixed(4);
    if (v === +el.dataset.v) return;
    el.dataset.v = v; el.setAttribute('aria-valuenow', v); buzz('detent'); SCRUB[el.dataset.scrub]?.(v);
  };
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-scrub]');
    if (!el) return;
    const G = geo(el), off0 = -((+el.dataset.v - G.min) / G.step) * G.px;
    g = { el, G, x0: e.clientX, off0, off: off0, last: [[performance.now(), e.clientX]], id: e.pointerId };
    el.dataset.drag = '1'; el.firstElementChild.style.transition = 'none';
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    cancelAnimationFrame(el._roll);
  });
  document.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    const { G } = g, lo = -((G.max - G.min) / G.step) * G.px;
    let off = g.off0 + (e.clientX - g.x0);
    off = off > 0 ? off * 0.3 : off < lo ? lo + (off - lo) * 0.3 : off;
    g.off = off; place(g.el, off); emit(g.el, valAt(G, off));
    g.last.push([performance.now(), e.clientX]); if (g.last.length > 5) g.last.shift();
  });
  const end = e => {
    if (!g || (e.pointerId != null && e.pointerId !== g.id)) return;
    const { el, G } = g, L = g.last, dt = L.length > 1 ? L[L.length - 1][0] - L[0][0] : 0;
    let v = dt > 0 ? (L[L.length - 1][1] - L[0][1]) / dt : 0, off = g.off;
    const lo = -((G.max - G.min) / G.step) * G.px;
    g = null;
    const settle = () => {
      const target = clamp(Math.round(off / G.px) * G.px, lo, 0);
      el.firstElementChild.style.transition = 'transform .4s var(--spring)'; place(el, target); emit(el, valAt(G, target)); delete el.dataset.drag;
    };
    if (Math.abs(v) < 0.25 || !motionOK()) return settle();
    let t = performance.now();
    const roll = now => {
      const ms = now - t; t = now;
      off = clamp(off + v * ms, lo, 0); v *= Math.pow(0.994, ms);
      place(el, off); emit(el, valAt(G, off));
      if (Math.abs(v) > 0.03 && off > lo && off < 0) el._roll = requestAnimationFrame(roll); else settle();
    };
    el._roll = requestAnimationFrame(roll);
  };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('keydown', e => {
    const el = e.target.closest?.('[data-scrub]');
    if (!el || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const G = geo(el), v = clamp(+el.dataset.v + (e.key === 'ArrowRight' ? G.step : -G.step), G.min, G.max);
    emit(el, v); scrubTo(el.dataset.scrub, v);
  });
})();

// ---------- pull to refresh ----------
// From the top of any tab, pull down: past the line it ticks, and letting go fetches everything at once.
const PTR_AT = 64;
(() => {
  let y0 = null, x0 = 0, armed = false, active = false;
  const el = () => $('#ptr');
  const blocked = t => document.body.classList.contains('sheet-open') || document.body.classList.contains('adding') || document.body.classList.contains('setting')
    || t.closest('input, textarea, select, [data-fling], .callout, .banner, #toast, .chips, .seg, .sheet, .wave, .trace, .cards, .todo, [data-swipe], .orb, .bx, .scrub');
  document.addEventListener('touchstart', e => {
    y0 = null;
    if (scrollY > 2 || e.touches.length > 1 || blocked(e.target) || REFRESH.on) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; armed = false; active = false;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0), p = el();
    if (!active) {
      if (dy > 10 && dy > dx * 1.6 && scrollY <= 2) { active = true; p.classList.add('pull'); }
      else if (dy < -4 || dx > 14) { y0 = null; return; }
      else return;
    }
    const pull = Math.min(120, Math.max(0, dy - 10) * 0.55);
    p.style.transform = `translate(-50%, ${pull.toFixed(1)}px)`;
    p.style.opacity = Math.min(1, pull / 36).toFixed(2);
    p.style.setProperty('--turn', `${(pull / PTR_AT * 300).toFixed(0)}deg`);
    const now = pull >= PTR_AT;
    if (now !== armed) { armed = now; p.classList.toggle('armed', armed); buzz('tick'); }
  }, { passive: true });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    const p = el();
    if (!active) return;
    active = false; p.classList.remove('pull', 'armed');
    if (armed) refreshAll(); else ptrSpin(false);
    armed = false;
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
})();
function ptrSpin(on) {
  const p = $('#ptr');
  if (!p) return;
  p.classList.toggle('spin', on);
  p.style.transform = on ? `translate(-50%, ${PTR_AT - 8}px)` : '';
  p.style.opacity = on ? '1' : '';
}

// ---------- press and hold ----------
// Removing data takes a deliberate 0.9-second hold; the button fills as you hold it.
(() => {
  let timer = null, el = null, fired = false;
  const stop = () => { clearTimeout(timer); timer = null; el?.classList.remove('holding'); el = null; };
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-hold]');
    if (!b || b.disabled) return;
    el = b; fired = false; b.classList.add('holding'); buzz('tick');
    timer = setTimeout(() => { const a = b.dataset.hold; stop(); fired = true; buzz('heavy'); (ACT_HOLD[a] || ACT[a])?.(b); }, 900);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => document.addEventListener(t, e => { if (el && (t !== 'pointerleave' || e.target === el)) stop(); }, true));
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-hold]')) return;
    e.preventDefault();
    if (fired) { fired = false; return; }
    toast('Press and hold to confirm');
  });
})();

// ---------- long press ----------
// Holding anything marked data-press for 0.45 s opens its fuller choice (a food: any amount, any meal; a logged
// entry: everything about it). A plain tap still does the quick thing. The finger must stay put: a scroll or a
// swipe that starts on the row cancels it, and the click that ends a long press is swallowed.
const PRESS = {};      // what a long press on [data-press] does, filled in by each screen
let pressed = false;
(() => {
  let t = null, x0 = 0, y0 = 0, el = null;
  const stop = () => { clearTimeout(t); t = null; el?.classList.remove('pressing'); el = null; };
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-press]');
    if (!b || e.target.closest('button.step, .x, input, select, textarea') || e.button > 0) return;
    stop(); el = b; x0 = e.clientX; y0 = e.clientY; pressed = false;
    b.classList.add('pressing');
    t = setTimeout(() => { const f = PRESS[b.dataset.press]; stop(); if (!f) return; pressed = true; buzz('ok'); f(b); }, 450);
  }, { passive: true });
  document.addEventListener('pointermove', e => { if (el && Math.hypot(e.clientX - x0, e.clientY - y0) > 9) stop(); }, { passive: true });
  ['pointerup', 'pointercancel', 'scroll'].forEach(x => document.addEventListener(x, stop, { capture: true, passive: true }));
  // If no click follows the long press (the finger slid off), the next real tap must not be swallowed.
  document.addEventListener('pointerup', () => { if (pressed) setTimeout(() => { pressed = false; }, 350); }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest('[data-press]')) e.preventDefault(); });
  document.addEventListener('click', e => { if (pressed) { pressed = false; e.stopPropagation(); e.preventDefault(); } }, true);
})();

// ---------- hold to repeat ----------
// Steppers repeat while held: a short pause, then faster. The button is found again on every step, because
// the screen may have been redrawn underneath it. The click that ends the hold is swallowed.
let repeated = '';
(() => {
  let t = null;
  const stop = () => { clearTimeout(t); t = null; };
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-repeat]');
    if (!b) return;
    const key = b.dataset.repeat;
    let n = 0;
    repeated = '';
    const go = () => { const el = document.querySelector(`[data-repeat="${CSS.escape(key)}"]`); if (!el) return stop(); n++; repeated = key; el.click(); t = setTimeout(go, n < 6 ? 150 : 70); };
    t = setTimeout(go, 420);
  });
  ['pointerup', 'pointercancel'].forEach(x => document.addEventListener(x, stop, true));
})();

// ---------- numbers that move ----------
// Elements with data-to count from data-from; arcs with data-dash ease from their old length to the new one.
const last = {};
function settle() {
  if (!motionOK()) return;
  for (const el of $$('[data-to]')) {
    const from = +el.dataset.from, to = +el.dataset.to, fmtf = el.dataset.fmt === 'int' ? fmt : x => r1(x);
    if (!Number.isFinite(from) || from === to) continue;
    const t0 = performance.now(), D = 520;
    el.textContent = fmtf(from);
    const step = t => { const k = Math.min(1, (t - t0) / D), e = 1 - (1 - k) ** 3; el.textContent = fmtf(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  for (const el of $$('[data-dash]')) {
    const to = el.dataset.dash;
    requestAnimationFrame(() => requestAnimationFrame(() => el.setAttribute('stroke-dasharray', `${to} 100`)));
  }
  for (const el of $$('[data-flash]')) if (el.dataset.flash === FLASH) el.classList.add('flash');
  FLASH = '';
}
let FLASH = '';
function flash(id) { FLASH = id; }
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('feel.js');

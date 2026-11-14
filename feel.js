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
const HAPTIC = { press: [5], tick: [9], swipe: [8, 30, 12], ok: [18], done: [16, 60, 16, 60, 40], warn: [34, 50, 34], heavy: [40],
  inhale: [8, 40, 12, 40, 16, 40, 22], exhale: [22, 40, 16, 40, 10], hold: [6] };
const HAPTIC_RANK = { press: 0, hold: 0, tick: 1, swipe: 2, inhale: 2, exhale: 2, ok: 3, warn: 4, heavy: 4, done: 5 };
let lastBuzz = { t: 0, r: -1 };
function buzz(kind) {
  const mode = S?.settings?.haptics || 'full';
  if (mode === 'off' || (mode === 'subtle' && (kind === 'tick' || kind === 'press'))) return;
  const now = performance.now(), r = HAPTIC_RANK[kind] ?? 1;
  if (now - lastBuzz.t < 90 && r <= lastBuzz.r) return;
  // The press already answered this touch: the tick of the choice it makes would be a second buzz for one tap.
  if (kind === 'tick' && lastBuzz.r === 0 && now - lastBuzz.t < 320) return;
  lastBuzz = { t: now, r };
  if (NATIVE && nat('haptic', kind) === true) return;
  try { navigator.vibrate?.(HAPTIC[kind] || 8); } catch (e) { /* no vibration here */ }
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
// The View Transitions API animates from the old screen to the new; dir is 'fwd', 'back', 'push' or 'pop'.
// The incoming screen's parts then settle in one after another (.fresh), once: re-renders while you stay on a screen
// never replay an entrance.
function transition(dir, fn) {
  const go = () => { fn(); fresh(dir); };
  if (!motionOK() || document.hidden) return fn();
  document.documentElement.dataset.dir = dir;
  if (!document.startViewTransition) return go();
  // A transition the browser abandons (the keyboard or the window resizing mid-way) is harmless: the new screen is
  // already in place. Its promises are caught so it never surfaces as an error.
  try { const vt = document.startViewTransition(go); for (const pr of [vt.ready, vt.finished, vt.updateCallbackDone]) pr?.catch?.(() => {}); } catch (e) { go(); }
}
function fresh(dir) {
  const v = $('#view');
  if (!v || !motionOK()) return;
  v.classList.remove('fresh'); void v.offsetWidth;
  v.dataset.dir = dir || ''; v.classList.add('fresh');
  clearTimeout(fresh.t); fresh.t = setTimeout(() => v.classList.remove('fresh'), 900);
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
function openPop(p) { pop = p; history.pushState({ pop: 1 }, ''); buzz('tick'); render(); }
function closePop() { if (!pop) return; if (history.state?.pop) history.back(); else { pop = null; render(); } }
addEventListener('popstate', () => { if (pop) { pop = null; render(); } });
// The sheet slides in only when it first appears, not on every re-render while it is open.
function sheetEntered() {
  const sh = $('#sheet .sheet'), key = sh ? (sh.dataset.key || sh.getAttribute('aria-label')) : '';
  if (sh && key !== popKey && motionOK()) sh.classList.add('enter');
  popKey = key;
}
// Drag the sheet down to dismiss it.
(() => {
  let y0 = null, sh = null, t0 = 0, dy = 0;
  document.addEventListener('pointerdown', e => {
    sh = e.target.closest('.sheet');
    if (!sh || (!e.target.closest('.grab, .sheet > .eyebrow, .sheet > h1') && sh.scrollTop > 0)) { sh = null; return; }
    if (e.target.closest('input, select, textarea, button')) { sh = null; return; }
    y0 = e.clientY; t0 = performance.now(); dy = 0;
  }, { passive: true });
  document.addEventListener('pointermove', e => {
    if (!sh || y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    if (dy > 4) { sh.style.transition = 'none'; sh.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  const end = () => {
    if (!sh || y0 == null) return;
    const v = dy / Math.max(1, performance.now() - t0), s = sh;
    s.style.transition = ''; y0 = null; sh = null;
    if (dy > 110 || (dy > 40 && v > 0.6)) { s.style.transform = 'translateY(100%)'; buzz('tick'); setTimeout(() => (pop ? closePop() : goBack()), 160); }
    else s.style.transform = '';
  };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
})();

addEventListener('keydown', e => { if (e.key === 'Escape') { if (pop) closePop(); else if (overlay) goBack(); } });

// ---------- swipes ----------
// Sideways on a tab: the next or previous tab, the screen following the finger. Sideways right on a page (a setting,
// adding food, a Lab session): back. On a row marked data-swipe: drag it left past a third of its width and it goes
// (with undo); a result card goes either way. A toast can be flicked away. Nothing starts at the very edges, which
// belong to the phone's own back gesture, or on anything that scrolls sideways itself.
(() => {
  let st = null;
  const NOGO = 'input, textarea, select, .chips, .seg.scroll, .cards, .wave, .trace, .orb, .rfbars, .sheet, #tabs';
  const pageOpen = () => overlay && ['add', 'set', 'lab'].includes(overlay.type);
  document.addEventListener('touchstart', e => {
    st = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0], x = t.clientX, w = innerWidth;
    const row = e.target.closest('[data-swipe]'), toastEl = e.target.closest('#toast.show');
    if (toastEl) { st = { kind: 'toast', el: toastEl, x0: x, y0: t.clientY }; return; }
    if (row && !e.target.closest('input, select, textarea')) { st = { kind: 'row', el: row, x0: x, y0: t.clientY, t0: performance.now() }; return; }
    if (x < 22 || x > w - 22 || pop || document.body.classList.contains('sheet-open') || e.target.closest(NOGO)) return;
    if (HR.mode && !overlay) return;   // a live recording is never swiped away from
    st = { kind: pageOpen() ? 'back' : overlay ? null : 'tab', x0: x, y0: t.clientY, t0: performance.now() };
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
      st.el.style.transform = `translateX(${(edge ? dx * 0.12 : dx * 0.45).toFixed(1)}px)`;
      st.el.style.opacity = (1 - Math.min(0.35, Math.abs(dx) / 900)).toFixed(3);
      const now = Math.abs(dx) > 80 && !edge;
      if (now !== !!st.armed) { st.armed = now; buzz('tick'); }
    } else if (st.kind === 'back') {
      const d = Math.max(0, dx);
      st.el.style.transform = `translateX(${(d * 0.6).toFixed(1)}px)`;
      st.el.style.opacity = (1 - Math.min(0.4, d / 700)).toFixed(3);
      const now = d > 90;
      if (now !== !!st.armed) { st.armed = now; buzz('tick'); }
    } else if (st.kind === 'row') {
      const two = st.el.dataset.swipe === 'hrresdone', d = two ? dx : Math.min(0, dx);
      st.el.style.transform = `translateX(${d.toFixed(1)}px)`;
      st.el.classList.add('swiping');
      const now = Math.abs(d) > st.el.offsetWidth * (two ? 0.28 : 0.33);
      st.el.classList.toggle('armed', now);
      if (now !== !!st.armed) { st.armed = now; buzz('tick'); }
    } else if (st.kind === 'toast') st.el.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), 0)`;
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
    } else if (kind === 'toast') {
      if (Math.abs(dx) > 60) { el.classList.remove('show'); toastFn = null; buzz('tick'); }
      setTimeout(() => { el.style.transform = ''; }, 300);
    }
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
})();
SWIPE.hrresdone = () => hrAct('hrresdone');

// ---------- pull to refresh ----------
// From the top of any tab, pull down: past the line it ticks, and letting go fetches everything at once.
const PTR_AT = 64;
(() => {
  let y0 = null, x0 = 0, armed = false, active = false;
  const el = () => $('#ptr');
  const blocked = t => document.body.classList.contains('sheet-open') || document.body.classList.contains('adding') || document.body.classList.contains('setting')
    || t.closest('input, textarea, select, .chips, .seg, .sheet, .wave, .trace, .cards, [data-swipe], .orb');
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

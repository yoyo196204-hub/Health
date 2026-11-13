'use strict';
// How the app feels: haptics, motion between screens, sheets, toasts with undo, press-and-hold for anything that
// removes data, and numbers that move to their new value instead of jumping. Nothing here touches stored data.

// ---------- haptics ----------
// A small vocabulary, used consistently: tick = a value or choice changed, or a gesture crossed its threshold;
// ok = something was saved or completed; done = a whole session or check finished; warn = refused or out of range;
// heavy = data was removed. Inside the app the phone's own haptic engine plays them (crisp primitives where the
// phone has them); in Chrome, short vibrations of the same shape.
const ACT_HOLD = {};   // actions that need a press and hold, filled in by each screen
const HAPTIC = { tick: [6], ok: [14], done: [16, 70, 16, 70, 34], warn: [30, 55, 30], heavy: [26] };
function buzz(kind) {
  const mode = S?.settings?.haptics || 'full';
  if (mode === 'off' || (mode === 'subtle' && kind === 'tick')) return;
  if (NATIVE && nat('haptic', kind) === true) return;
  try { navigator.vibrate?.(HAPTIC[kind] || 8); } catch (e) { /* no vibration here */ }
}
function motionOK() {
  const m = S?.settings?.motion || 'system';
  return m === 'full' || (m === 'system' && !matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// ---------- moving between screens ----------
// The View Transitions API animates from the old screen to the new; dir is 'fwd', 'back', 'push' or 'pop'.
function transition(dir, fn) {
  if (!motionOK() || !document.startViewTransition || document.hidden) return fn();
  document.documentElement.dataset.dir = dir;
  try { document.startViewTransition(fn); } catch (e) { fn(); }
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

// ---------- pull to refresh ----------
// From the top of any tab, pull down: past the line it ticks, and letting go fetches everything at once.
const PTR_AT = 64;
(() => {
  let y0 = null, x0 = 0, armed = false, active = false;
  const el = () => $('#ptr');
  const blocked = t => document.body.classList.contains('sheet-open') || document.body.classList.contains('adding') || document.body.classList.contains('setting')
    || t.closest('input, textarea, select, .chips, .seg, .sheet, .wave, .trace');
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

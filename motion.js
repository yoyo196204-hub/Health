'use strict';
// Physics for everything a finger moves. Each moved thing is a mass on a spring: it follows the finger 1:1, and on
// release it carries the finger's velocity into a spring (toward rest, or toward gone), so a flick travels, a slow
// drag settles back, and nothing just snaps. The same springs, sampled into CSS linear() easings, drive every CSS
// transition in the app, so taps and drags move with one physics.
//
// What it adds:
// - Sheets: drag down from anywhere on the sheet (not only the handle); once its content is scrolled to the top the
//   same finger pulls the sheet. The page behind recedes (smaller, dimmer, rounded) as the sheet rises, and comes
//   forward as you pull it down, so a sheet is a layer above the page, not a box drawn on it.
// - Banners, callouts and anything marked data-fling: fling sideways to dismiss. They tilt with the drag like a card
//   held at the bottom, fly off with the flick's speed, and the space they leave closes up.
// - The insight card on Today is a deck: fling it for the next thing your data says.
// - The toast: fling it sideways or down.

// ---------- springs ----------
// A damped spring integrated in small fixed steps. k stiffness, c damping (mass 1). v in units per second.
function springRun({ from, to, v = 0, k = 420, c = 34, onUpdate, onDone, eps = 0.25 }) {
  let x = from, vel = v, last = performance.now(), id = 0, stopped = false;
  if (!motionOK()) { onUpdate(to); onDone?.(); return { stop() {} }; }
  const step = now => {
    if (stopped) return;
    let dt = Math.min(0.064, (now - last) / 1000); last = now;
    while (dt > 0) { const h = Math.min(dt, 1 / 240); vel += (-k * (x - to) - c * vel) * h; x += vel * h; dt -= h; }
    if (Math.abs(x - to) < eps && Math.abs(vel) < eps * 10) { onUpdate(to); onDone?.(); return; }
    onUpdate(x); id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
  return { stop() { stopped = true; cancelAnimationFrame(id); } };
}
// Where a flick would carry something if nothing stopped it (the iOS projection, deceleration 0.998 per ms).
function project(v, d = 0.998) { return (v / 1000) * d / (1 - d); }
// Past a limit, a drag gives less and less: the resistance of a rubber band.
function rubber(x, dim = 400, k = 0.55) { return (1 - 1 / (x * k / dim + 1)) * dim; }
// Finger velocity in px/s over the last 80 ms.
function tracker() {
  const pts = [];
  return {
    add(x, y) { const t = performance.now(); pts.push([t, x, y]); while (pts.length > 2 && t - pts[0][0] > 80) pts.shift(); },
    v() { if (pts.length < 2) return [0, 0]; const a = pts[0], b = pts[pts.length - 1], dt = Math.max(1, b[0] - a[0]) / 1000; return [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt]; },
  };
}
// A spring sampled into a CSS linear() easing, so CSS transitions move like the JS springs. zeta is the damping
// ratio: under 1 overshoots a little, as a real thing with mass does.
function springEasing(zeta, steps = 48) {
  const w = 2 * Math.PI / 0.62, wd = w * Math.sqrt(Math.max(1e-4, 1 - zeta * zeta)), T = 5.2 / (zeta * w), pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps * T;
    pts.push(zeta < 1 ? 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta * w / wd * Math.sin(wd * t)) : 1 - Math.exp(-w * t) * (1 + w * t));
  }
  pts[pts.length - 1] = 1;
  return `linear(${pts.map(p => +p.toFixed(4)).join(', ')})`;
}
(() => {
  try {
    if (!CSS.supports('transition-timing-function', 'linear(0, 1)')) return;
    const r = document.documentElement.style;
    r.setProperty('--spring', springEasing(0.68));
    r.setProperty('--snap', springEasing(0.5));
    r.setProperty('--glide', springEasing(0.92));
  } catch (e) { /* the cubic-bezier fallbacks in styles.css stay */ }
})();

// ---------- the sheet as a layer ----------
// How far the top sheet is open (0 to 1) is written straight onto the few things that show it: the page behind
// recedes (a little smaller and lower) and the scrim darkens. Only transform and opacity change, on those elements
// alone, so a drag never makes the browser restyle or repaint the page: it stays at the screen's refresh rate.
// While a finger holds the sheet they follow the finger; otherwise CSS eases them.
let liftP = 0;
function liftTo(p, live) {
  const b = document.body, v = document.getElementById('view'), scrim = document.querySelector('#sheet .scrim');
  p = clamp(p, 0, 1); liftP = p;
  b.classList.toggle('lifting', !!live);
  const page = v && !b.classList.contains('adding') && !b.classList.contains('setting');
  if (page) {
    // The page shrinks toward the middle of what is on screen, not toward the middle of the whole long page.
    if (!live || !v.style.transformOrigin) v.style.transformOrigin = `50% ${Math.round(scrollY + innerHeight / 2)}px`;
    v.style.transform = p > 0.001 ? `translate3d(0, ${(p * 10).toFixed(1)}px, 0) scale(${(1 - p * 0.05).toFixed(4)})` : '';
    if (p <= 0.001 && !live) v.style.transformOrigin = '';
  }
  if (scrim) scrim.style.opacity = live ? p.toFixed(3) : '';
}
// The sheet slides in on a spring when it first appears (feel.js sheetEntered adds .enter) and the page recedes.
function sheetLift() {
  const open = document.body.classList.contains('sheet-open');
  if (document.body.classList.contains('lifting')) return;
  if (open || liftP) liftTo(open ? 1 : 0, false);
}

(() => {
  let g = null;
  const NOT = 'input, textarea, select, [data-scrub], .chips, .seg.scroll, .wave, .trace, .bx, .orb, .scrub, canvas';
  const close = (sh, v) => {
    const h = sh.offsetHeight, from = g?.off || 0;
    buzz('tick');
    springRun({ from, to: h + 40, v: Math.max(v, 600), k: 300, c: 34, eps: 2,
      onUpdate: x => { sh.style.transform = `translate3d(0, ${x.toFixed(1)}px, 0)`; liftTo(1 - x / h, true); },
      onDone: () => { document.body.classList.remove('lifting'); liftTo(0, false); pop ? closePop() : overlay?.type === 'why' ? goBack() : closeSheet(); } });
  };
  const back = (sh, v) => springRun({ from: g?.off || 0, to: 0, v, k: 520, c: 30,
    onUpdate: x => { sh.style.transform = x ? `translate3d(0, ${x.toFixed(1)}px, 0)` : ''; liftTo(1 - Math.max(0, x) / sh.offsetHeight, true); },
    onDone: () => { sh.style.transform = ''; document.body.classList.remove('lifting'); liftTo(1, false); } });
  document.addEventListener('touchstart', e => {
    g = null;
    const sh = e.target.closest('#sheet .sheet');
    if (!sh || e.touches.length !== 1 || e.target.closest(NOT)) return;
    const t = e.touches[0];
    sh._anim?.stop();
    g = { sh, x0: t.clientX, y0: t.clientY, base: null, lastY: t.clientY, off: 0, tr: tracker(), h: sh.offsetHeight };
    g.tr.add(t.clientX, t.clientY);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!g) return;
    const t = e.touches[0], down = t.clientY > g.lastY;
    g.tr.add(t.clientX, t.clientY);
    if (g.base == null) {
      // Sideways first: leave it to whatever scrolls sideways inside the sheet.
      if (Math.abs(t.clientX - g.x0) > 12 && Math.abs(t.clientX - g.x0) > Math.abs(t.clientY - g.y0)) { g = null; return; }
      // The content scrolls until it is at its top; from there, the same downward finger takes the sheet.
      if (down && g.sh.scrollTop <= 0 && t.clientY - g.y0 > 4) g.base = t.clientY;
      g.lastY = t.clientY;
      return;
    }
    e.preventDefault();
    const d = t.clientY - g.base;
    // Down follows the finger; up past where it sits stretches a little and resists.
    g.off = d >= 0 ? d : -rubber(-d, 120);
    g.sh.style.transition = 'none';
    g.sh.style.transform = `translate3d(0, ${g.off.toFixed(1)}px, 0)`;
    liftTo(1 - Math.max(0, g.off) / g.h, true);
    const armed = g.off > g.h * 0.35;
    if (armed !== !!g.armed) { g.armed = armed; buzz('tick'); }
    g.lastY = t.clientY;
  }, { passive: false });
  const end = () => {
    if (!g) return;
    const { sh } = g;
    if (g.base == null) { g = null; return; }
    sh.style.transition = '';
    const v = g.tr.v()[1], to = g.off + project(v);
    if (to > g.h * 0.45 || v > 1100) close(sh, v); else back(sh, v);
    g = null;
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  // A mouse can drag the handle.
  let m = null;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    const sh = e.target.closest('#sheet .sheet');
    if (!sh || !e.target.closest('.grab, .sheet > .eyebrow, .sheet > h1')) return;
    m = { sh, y0: e.clientY, tr: tracker(), h: sh.offsetHeight }; m.tr.add(e.clientX, e.clientY);
  });
  document.addEventListener('pointermove', e => {
    if (!m) return;
    m.tr.add(e.clientX, e.clientY); m.off = Math.max(0, e.clientY - m.y0);
    m.sh.style.transition = 'none'; m.sh.style.transform = `translate3d(0, ${m.off}px, 0)`; liftTo(1 - m.off / m.h, true);
  });
  document.addEventListener('pointerup', () => {
    if (!m) return;
    const v = m.tr.v()[1]; g = m; m.sh.style.transition = '';
    (m.off + project(v) > m.h * 0.45 ? close : back)(m.sh, v); m = null; g = null;
  });
})();
// What closes a sheet that is neither a pop nor an address: an import or openGym confirmation.
function closeSheet() { if (pending) { pending = null; render(); } else goBack(); }

// ---------- fling to dismiss ----------
// Anything dismissable: a .callout or .banner with its own close button, or anything marked data-fling (whose value
// is what to do). It moves with the finger sideways, turning a little about a point below it, as a card held at its
// bottom edge does; let go past half its width, or flick it, and it flies off at the flick's speed while the space
// it leaves closes; otherwise it springs back, overshooting a touch.
const FLING = {};      // what a fling on [data-fling] does, filled in by each screen
(() => {
  let g = null;
  const SEL = '[data-fling], .callout:has(> .x), .banner:has([data-dismiss]), #toast.show';
  const NOT = 'input, textarea, select, [data-scrub], .chips, .seg, .wave, .trace, .bx';
  const place = (el, x, y = 0) => {
    const w = el.offsetWidth || 300, rot = x / w * 7, o = 1 - Math.min(0.6, Math.abs(x) / w * 0.6 + Math.max(0, y) / 300);
    el.style.transform = el.id === 'toast' ? `translate(calc(-50% + ${x.toFixed(1)}px), ${y.toFixed(1)}px)` : `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg)`;
    el.style.opacity = o.toFixed(3);
  };
  const done = el => {
    if (el.id === 'toast') { el.classList.remove('show'); toastFn = null; el.style.transform = el.style.opacity = ''; return; }
    // A deck keeps its place: the next card takes it.
    const f = FLING[el.dataset.fling];
    if (f?.stay) { el.style.transform = el.style.opacity = el.style.transition = ''; return f(el); }
    // The space closes: the card's height and margins go to nothing, so what is below slides up into its place.
    const h = el.offsetHeight, cs = getComputedStyle(el);
    el.style.height = `${h}px`; el.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      el.style.transition = 'height .34s var(--glide), margin .34s var(--glide), padding .34s var(--glide)';
      el.style.height = '0px'; el.style.marginTop = el.style.marginBottom = '0px'; el.style.paddingTop = el.style.paddingBottom = '0px';
    });
    setTimeout(() => {
      const act = el.dataset.fling;
      if (act && FLING[act]) return FLING[act](el);
      (el.querySelector(':scope > .x, [data-dismiss]'))?.click();
    }, 330);
    void cs;
  };
  document.addEventListener('touchstart', e => {
    g = null;
    if (e.touches.length !== 1) return;
    const el = e.target.closest(SEL);
    if (!el || e.target.closest(NOT)) return;
    const t = e.touches[0];
    el._anim?.stop();
    g = { el, x0: t.clientX, y0: t.clientY, tr: tracker(), x: 0, y: 0, toast: el.id === 'toast' };
    g.tr.add(t.clientX, t.clientY);
    if (g.toast) clearTimeout(toast.t);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!g) return;
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    g.tr.add(t.clientX, t.clientY);
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : g.toast && dy > 0 ? 'y' : null;
      if (!g.axis) { g = null; return; }
      g.el.style.transition = 'none'; g.el.classList.remove('pressed'); g.el.classList.add('flinging');
    }
    e.preventDefault();
    g.x = g.axis === 'x' ? dx : 0; g.y = g.axis === 'y' ? Math.max(-rubber(-Math.min(0, dy), 60), dy) : 0;
    place(g.el, g.x, g.y);
    const armed = Math.abs(g.x) > g.el.offsetWidth * 0.4 || g.y > 50;
    if (armed !== !!g.armed) { g.armed = armed; buzz('tick'); }
  }, { passive: false });
  const end = () => {
    if (!g) return;
    const s = g; g = null;
    if (!s.axis) { if (s.toast) toast.t = setTimeout(() => s.el.classList.remove('show'), 1800); return; }
    const [vx, vy] = s.tr.v(), w = s.el.offsetWidth, el = s.el;
    const goX = s.axis === 'x' && (Math.abs(s.x + project(vx)) > w * 0.5 || Math.abs(vx) > 900), goY = s.axis === 'y' && (s.y + project(vy) > 70 || vy > 700);
    el.classList.remove('flinging');
    if (goX || goY) {
      buzz('swipe');
      const dir = goX ? Math.sign(s.x + project(vx)) || 1 : 0, toX = dir * (innerWidth + w) * 0.9;
      el._anim = springRun({ from: goX ? s.x : s.y, to: goX ? toX : 200, v: goX ? vx : vy, k: 170, c: 22, eps: 4,
        onUpdate: p => goX ? place(el, p, 0) : place(el, 0, p), onDone: () => done(el) });
    } else {
      const ax = s.axis === 'x';
      el._anim = springRun({ from: ax ? s.x : s.y, to: 0, v: ax ? vx : vy, k: 520, c: 26,
        onUpdate: p => ax ? place(el, p, 0) : place(el, 0, p),
        onDone: () => { el.style.transform = el.style.opacity = el.style.transition = ''; if (s.toast) toast.t = setTimeout(() => el.classList.remove('show'), 2200); } });
    }
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
})();

// ---------- a deck ----------
// The insight card on Today holds several things your data says. Fling it and the next one comes up from behind.
let deckI = null;
FLING.deck = () => { deckI = (deckI ?? 0) + 1; buzz('tick'); renderView(); };
FLING.deck.stay = true;

// ---------- pressing ----------
// A card that does something when tapped sinks a little under the finger and rises back on a spring when let go.
// Once the finger travels it is a drag or a fling, not a press: the card lets go, so it can move with the finger.
(() => {
  let el = null, x0 = 0, y0 = 0;
  const off = () => { if (!el) return; el.classList.remove('pressed'); el = null; };
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !motionOK()) return;
    const c = e.target.closest('.card.tap, .tile, .ds, .duo > .card, .meal.card');
    if (!c || e.target.closest('button, input, [data-swipe], [data-press]')) return;
    el = c; x0 = e.clientX; y0 = e.clientY; c.classList.add('pressed');
  }, { passive: true });
  document.addEventListener('pointermove', e => { if (el && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) off(); }, { passive: true });
  ['pointerup', 'pointercancel', 'scroll'].forEach(t => document.addEventListener(t, off, { capture: true, passive: true }));
})();

// ---------- scrolling ----------
// The big title of a tab folds into a small one in a bar that stays at the top, so the page reads as content
// sliding under a fixed lid. The amount is a CSS variable, so the fold follows the finger exactly.
(() => {
  let ticking = false, last = -1, bar = null;
  const upd = () => {
    ticking = false;
    const p = clamp((scrollY - 8) / 56, 0, 1);
    if (!bar || !bar.isConnected) { bar = document.querySelector('#view > .appbar'); last = -1; }
    if (!bar || p === last) return;
    last = p;
    // Only the title bar uses it: set there, nothing else on the page has to be restyled while scrolling.
    bar.style.setProperty('--fold', p.toFixed(3));
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
  self.foldNow = upd;
  upd();
})();
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('motion.js');

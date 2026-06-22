/* Ellery AI — 3D depth interactions (purely visual).

   Adds mouse-driven parallax tilt to content cards. Self-contained and
   optional: if this script fails, is removed, or the browser opts out, the
   CSS rest / hover / elevation states in css/depth.css still apply and every
   card stays fully functional. No app state, data, or render code is touched.

   Disabled for reduced-motion users and coarse (touch) pointers, where a
   mouse-position tilt has no meaning. */

(function () {
  if (!('matchMedia' in window)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (matchMedia('(pointer: coarse)').matches) return;

  const SELECTOR = '.data-card, .tl-card, .layout-card';
  const MAX_DEG = 9;             // peak tilt, in degrees
  const bound = new WeakSet();   // cards already wired with listeners
  let frame = 0;                 // pending rAF id (0 = none)
  let pending = null;            // latest { el, x, y } awaiting a frame

  // Read layout + write transform vars together inside one animation frame
  // so rapid mousemove never thrashes the layout.
  function apply() {
    frame = 0;
    if (!pending) return;
    const { el, x, y } = pending;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = (x - r.left) / r.width - 0.5;   // -0.5 .. 0.5
    const py = (y - r.top) / r.height - 0.5;
    el.style.setProperty('--tilt-ry', (px * 2 * MAX_DEG).toFixed(2) + 'deg');
    el.style.setProperty('--tilt-rx', (-py * 2 * MAX_DEG).toFixed(2) + 'deg');
  }

  function onMove(e) {
    pending = { el: e.currentTarget, x: e.clientX, y: e.clientY };
    if (!frame) frame = requestAnimationFrame(apply);
  }

  function onLeave(e) {
    const el = e.currentTarget;
    el.classList.remove('is-tilting');
    el.style.setProperty('--tilt-rx', '0deg');
    el.style.setProperty('--tilt-ry', '0deg');
  }

  // Lazy-bind on first hover via the bubbling pointerover event. This covers
  // cards rendered after page load without per-render hooks or observers.
  document.addEventListener('pointerover', function (e) {
    const el = e.target.closest && e.target.closest(SELECTOR);
    if (!el) return;
    if (!bound.has(el)) {
      bound.add(el);
      el.classList.add('tilt-3d');
      el.addEventListener('pointermove', onMove, { passive: true });
      el.addEventListener('pointerleave', onLeave, { passive: true });
    }
    el.classList.add('is-tilting');
  }, { passive: true });
})();

// Live Simulation Mode — Pro exclusive, delivered only to Pro sessions via
// the gated route. Sends quiet white micro-dots gliding along the data lines
// of the Branching Mindmap (SVG paths, SMIL animateMotion with eased
// splines) and a soft sliver of light down the Interactive Timeline spine.
// Monochrome by design: one light, no color swapping.
//
// Contract: start(canvasEl, layout) -> stop()

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_PULSED_PATHS = 48;
const GLOW_ID = 'ellery-sim-glow';
const EASE = '0.45 0.05 0.55 0.95'; // gentle ease-in-out

export function start(canvasEl, layout) {
  if (layout === 'map') return startInsightMap(canvasEl);
  if (layout === 'nodes') return startMindmap(canvasEl);
  if (layout === 'timeline') return startTimeline(canvasEl);
  return () => {};
}

/* ---------- Insight Map: a living marketplace ----------
 * Every frame of motion stands for a change in the data: a bubble shrinking is
 * inventory selling down, a bubble growing back is a restock, a brief glow is a
 * surge in demand. Only a few records move per beat, with eased size
 * transitions, so the field feels alive without becoming noisy. */

function startInsightMap(canvasEl) {
  const circles = [...canvasEl.querySelectorAll('.im-node circle')];
  if (!circles.length) return () => {};

  const nodes = circles.map((c) => {
    const base = parseFloat(c.dataset.baseR || c.getAttribute('r')) || 10;
    return { c, base, level: base };
  });
  circles.forEach((c) => {
    c.style.transition = 'r 0.95s ease, fill-opacity 0.95s ease, stroke-width 0.35s ease';
  });

  const flash = (c) => {
    c.setAttribute('stroke-width', '3');
    setTimeout(() => c.setAttribute('stroke-width', '1.5'), 420);
  };

  const beat = setInterval(() => {
    const k = 1 + Math.floor(Math.random() * 3); // 1–3 records move per beat
    for (let i = 0; i < k; i++) {
      const n = nodes[(Math.random() * nodes.length) | 0];
      const roll = Math.random();
      if (roll < 0.6) {
        // a sale — inventory ticks down
        n.level = Math.max(n.base * 0.42, n.level - n.base * (0.06 + Math.random() * 0.1));
      } else if (roll < 0.9) {
        // a restock — recovers toward baseline
        n.level = Math.min(n.base * 1.12, n.level + n.base * (0.12 + Math.random() * 0.18));
      } else {
        // a demand surge — brief growth + glow
        n.level = Math.min(n.base * 1.28, n.level + n.base * 0.22);
        flash(n.c);
      }
      n.c.setAttribute('r', n.level.toFixed(2));
      // Low stock reads brighter/denser so risk is visible at a glance.
      n.c.setAttribute('fill-opacity', n.level / n.base < 0.55 ? '0.5' : '0.2');
    }
  }, 850);

  return () => {
    clearInterval(beat);
    nodes.forEach((n) => {
      n.c.style.transition = '';
      n.c.setAttribute('r', n.c.dataset.baseR || String(n.base));
      n.c.setAttribute('fill-opacity', '0.18');
      n.c.setAttribute('stroke-width', '1.5');
    });
  };
}

/* ---------- Mindmap: white micro-dots gliding every branch path ---------- */

function startMindmap(canvasEl) {
  const svg = canvasEl.querySelector('svg');
  if (!svg) return () => {};

  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML = `
    <filter id="${GLOW_ID}" x="-250%" y="-250%" width="600%" height="600%">
      <feGaussianBlur stdDeviation="0.9" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>`;
  svg.appendChild(defs);

  const added = [defs];
  const paths = [...svg.querySelectorAll('path')].slice(0, MAX_PULSED_PATHS);

  paths.forEach((path, i) => {
    const d = path.getAttribute('d');
    if (!d) return;
    const isTrunk = parseFloat(path.getAttribute('stroke-width') || '1') > 1.6;
    const dur = `${(isTrunk ? 4.6 : 5.4) + (i % 5) * 0.35}s`;
    const begin = `${-(i * 0.61)}s`;

    const pulse = document.createElementNS(SVG_NS, 'circle');
    pulse.setAttribute('r', isTrunk ? '1.8' : '1.4');
    pulse.setAttribute('fill', '#ffffff');
    pulse.setAttribute('opacity', '0.85');
    pulse.setAttribute('filter', `url(#${GLOW_ID})`);
    pulse.classList.add('sim-pulse');

    const motion = document.createElementNS(SVG_NS, 'animateMotion');
    motion.setAttribute('dur', dur);
    // Negative begin staggers the field without an initial wait; eased
    // splines make each glide settle in and out instead of strobing.
    motion.setAttribute('begin', begin);
    motion.setAttribute('repeatCount', 'indefinite');
    motion.setAttribute('calcMode', 'spline');
    motion.setAttribute('keyTimes', '0;1');
    motion.setAttribute('keySplines', EASE);
    motion.setAttribute('path', d);
    pulse.appendChild(motion);

    // Breathe at the ends of each run rather than popping.
    const fade = document.createElementNS(SVG_NS, 'animate');
    fade.setAttribute('attributeName', 'opacity');
    fade.setAttribute('values', '0;0.85;0.85;0');
    fade.setAttribute('keyTimes', '0;0.12;0.88;1');
    fade.setAttribute('dur', dur);
    fade.setAttribute('begin', begin);
    fade.setAttribute('repeatCount', 'indefinite');
    pulse.appendChild(fade);

    svg.appendChild(pulse);
    added.push(pulse);
  });

  return () => added.forEach((el) => el.remove());
}

/* ---------- Timeline: a soft silver light wave down the spine ---------- */

function startTimeline(canvasEl) {
  const tl = canvasEl.querySelector('.tl');
  if (!tl) return () => {};

  const added = [];
  for (let i = 0; i < 2; i++) {
    const pulse = document.createElement('div');
    pulse.className = 'tl-pulse';
    pulse.style.animationDelay = `${i * 3.5}s`;
    tl.appendChild(pulse);
    added.push(pulse);
  }

  return () => added.forEach((el) => el.remove());
}

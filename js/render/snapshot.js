// Shared scene-capture: turn whatever the active visualization rendered into a
// single high-resolution bitmap. This is the one place that knows how each
// layout is represented (live canvas, SVG, or DOM); both the PNG and MP4
// exporters consume it, so neither re-implements rendering.
//
// Capture paths, chosen by what the layout produced:
//   • Kinetic Rank → the live <canvas> (already a bitmap source).
//   • Insight Map  → DOM path for the WHOLE composite (bubbles + summary panel),
//                    so the export matches what the user sees.
//   • Mind Map / other pure-SVG → serialize the <svg> with computed colors baked.
//   • Timeline / Data Cards / other DOM → wrap the live markup in an SVG
//     <foreignObject> with the app stylesheets embedded, then rasterize.

const INLINE_PROPS = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family'];
const STYLE_SHEETS = ['css/tokens.css', 'css/components.css', 'css/animations.css'];

let cssCache = null;

/**
 * @returns {Promise<{img: CanvasImageSource, width: number, height: number}>}
 * width/height are in CSS pixels (the natural size of the captured scene).
 */
export async function captureScene(canvasEl) {
  const kin = canvasEl.querySelector('canvas.kinetic-canvas');
  if (kin) return { img: kin, width: kin.clientWidth, height: kin.clientHeight };

  // Insight Map pairs an SVG field with a DOM summary panel; capture the whole
  // composite via the DOM path so nothing is dropped.
  const composite = !!canvasEl.querySelector('.insightmap');
  const svg = canvasEl.querySelector('.viz-svg-wrap svg');
  if (svg && !composite) return rasterizeSVG(svg);
  return rasterizeDOM(canvasEl);
}

/* ---------- Path 1: live SVG → standalone SVG → bitmap ---------- */

async function rasterizeSVG(svgEl) {
  const vb = (svgEl.getAttribute('viewBox') || '0 0 960 600').split(/\s+/).map(Number);
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', vb[2]);
  clone.setAttribute('height', vb[3]);

  // CSS variables don't exist outside the document: bake computed values in.
  // Walk live and clone in lockstep BEFORE any pruning so indices stay aligned.
  const liveNodes = [svgEl, ...svgEl.querySelectorAll('*')];
  const cloneNodes = [clone, ...clone.querySelectorAll('*')];
  cloneNodes.forEach((el, i) => {
    const live = liveNodes[i];
    if (!live || el.tagName === 'defs') return;
    const cs = getComputedStyle(live);
    for (const prop of INLINE_PROPS) {
      const v = cs.getPropertyValue(prop);
      if (v && v !== 'none' && v !== 'normal') el.setAttribute(prop, v);
    }
    el.removeAttribute('class');
    el.removeAttribute('style');
  });

  // Simulation pulses are motion-only — meaningless in a still frame.
  clone.querySelectorAll('defs, circle > animateMotion').forEach((el) => {
    const target = el.tagName === 'animateMotion' ? el.parentElement : el;
    target.remove();
  });

  return loadAsImage(new XMLSerializer().serializeToString(clone), vb[2], vb[3]);
}

/* ---------- Path 2: DOM layouts → foreignObject snapshot ---------- */

async function rasterizeDOM(canvasEl) {
  if (cssCache === null) {
    const texts = await Promise.all(
      STYLE_SHEETS.map((href) => fetch(href).then((r) => (r.ok ? r.text() : '')))
    );
    cssCache = texts.join('\n');
  }

  const width = Math.max(canvasEl.clientWidth, 640);
  const clone = canvasEl.cloneNode(true);
  clone.querySelectorAll('.sd-watermark, .viz-hint, .tl-pulse, .empty-state').forEach((el) =>
    el.remove()
  );
  clone.removeAttribute('id');

  // Inline computed paint on any nested SVGs (e.g. Insight Map bubbles use
  // fill="var(--…)", which won't resolve once serialized) so colors survive.
  inlineNestedSvgPaint(canvasEl, clone);

  const NS = 'http://www.w3.org/2000/svg';
  const height = canvasEl.scrollHeight;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  const fo = document.createElementNS(NS, 'foreignObject');
  fo.setAttribute('width', '100%');
  fo.setAttribute('height', '100%');

  const wrap = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  wrap.setAttribute('style', `width:${width}px;background:transparent;`);
  const style = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
  style.textContent = `${cssCache}
    /* freeze entrance motion at its final state for the still frame */
    *,*::before,*::after{animation:none!important;transition:none!important}
    .tl-item,.data-card,.pop-node{opacity:1!important;transform:none!important}
    .draw-path{stroke-dasharray:none!important;stroke-dashoffset:0!important}
    body,.canvas{background:transparent!important}
    .canvas{padding:0;min-height:0}`;
  wrap.appendChild(style);
  wrap.appendChild(clone);
  fo.appendChild(wrap);
  svg.appendChild(fo);

  return loadAsImage(new XMLSerializer().serializeToString(svg), width, height);
}

// Copy computed fill/stroke onto cloned SVG nodes so var()-based paint that only
// resolves inside the live document still renders in the serialized snapshot.
function inlineNestedSvgPaint(liveRoot, cloneRoot) {
  const liveSvgs = liveRoot.querySelectorAll('svg');
  const cloneSvgs = cloneRoot.querySelectorAll('svg');
  for (let i = 0; i < cloneSvgs.length; i++) {
    if (!liveSvgs[i]) break;
    const liveNodes = [liveSvgs[i], ...liveSvgs[i].querySelectorAll('*')];
    const cloneNodes = [cloneSvgs[i], ...cloneSvgs[i].querySelectorAll('*')];
    cloneNodes.forEach((el, j) => {
      const live = liveNodes[j];
      if (!live) return;
      const cs = getComputedStyle(live);
      for (const prop of ['fill', 'stroke']) {
        const v = cs.getPropertyValue(prop);
        if (v && v !== 'none') el.setAttribute(prop, v);
      }
    });
  }
}

// A data: URL (not a blob URL) is required: blob-URL SVGs containing
// <foreignObject> taint the canvas and block toDataURL; data URLs stay clean.
function loadAsImage(xml, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, width, height });
    img.onerror = () => reject(new Error('snapshot failed to load'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

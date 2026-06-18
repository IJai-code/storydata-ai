// "Export PNG for Slides" — client-side canvas snapshot of the rendered
// story, sized 2× for sharpness, with a transparent page background so it
// drops cleanly into PowerPoint / Google Slides. The story itself keeps its
// matte panel behind it (white linework on a fully transparent PNG would
// vanish on a white slide); the corners and margins stay transparent.
//
// Two capture paths:
//   • SVG layouts (mindmap, insight map): serialize the live <svg> with all
//     CSS-variable colors inlined as computed values.
//   • DOM layouts (timeline, cards): wrap the live markup in an SVG
//     <foreignObject> with the app stylesheets embedded, then rasterize.
//
// Free tier gets a low-opacity "Generated with Ellery AI" stamp baked into
// the bottom-right corner; Pro exports are stamp-free. (This stamp is a
// client-side courtesy mark — the server-enforced branding lives in the
// share/export HTML pipeline.)

import { getState } from '../state.js';
import { watermarkRequired } from '../tier/gates.js';

const SCALE = 2;
const PAD = 28;
const RADIUS = 16;
const BACKDROP = '#0e0e10';
const STYLE_SHEETS = ['css/tokens.css', 'css/components.css', 'css/animations.css'];

let cssCache = null;

export async function exportPNG(canvasEl) {
  const state = getState();
  if (!state.dataset || !canvasEl) {
    return { ok: false, error: 'Nothing to export yet.' };
  }

  try {
    const kin = canvasEl.querySelector('canvas.kinetic-canvas');
    const svgEl = canvasEl.querySelector('.viz-svg-wrap svg');
    const image = kin
      ? { img: kin, width: kin.clientWidth, height: kin.clientHeight }
      : svgEl
        ? await rasterizeSVG(svgEl)
        : await rasterizeDOM(canvasEl);
    const dataUrl = compose(image);
    download(dataUrl, `ellery-${state.layout}-slide.png`);
    return { ok: true, dataUrl };
  } catch {
    return { ok: false, error: 'PNG export failed — try re-rendering the story first.' };
  }
}

/* ---------- Path 1: live SVG → standalone SVG → bitmap ---------- */

const INLINE_PROPS = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family'];

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
    // Entrance helpers animate via CSS that won't ship with the clone.
    el.removeAttribute('class');
    el.removeAttribute('style');
  });

  // Simulation pulses are motion-only — meaningless in a still frame.
  // (Their class attribute was just stripped, so prune by structure instead.)
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

/* ---------- Compose: backdrop panel + bitmap + tier stamp ---------- */

function compose({ img, width, height }) {
  const out = document.createElement('canvas');
  out.width = (width + PAD * 2) * SCALE;
  out.height = (height + PAD * 2) * SCALE;
  const ctx = out.getContext('2d');

  // Matte panel with rounded corners; everything outside it stays transparent.
  ctx.beginPath();
  roundedRect(ctx, 0, 0, out.width, out.height, RADIUS * SCALE);
  ctx.fillStyle = BACKDROP;
  ctx.fill();

  ctx.drawImage(img, PAD * SCALE, PAD * SCALE, width * SCALE, height * SCALE);

  if (watermarkRequired()) {
    const fs = 12 * SCALE;
    ctx.font = `500 ${fs}px Inter, -apple-system, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(245, 245, 247, 0.42)';
    const label = '● Generated with Ellery AI';
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, out.width - tw - 16 * SCALE, out.height - 14 * SCALE);
  }

  return out.toDataURL('image/png');
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A data: URL (not a blob URL) is required here: blob-URL SVGs containing
// <foreignObject> taint the canvas and block toDataURL; data URLs stay clean.
function loadAsImage(xml, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, width, height });
    img.onerror = () => reject(new Error('snapshot failed to load'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

function download(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

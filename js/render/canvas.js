// Canvas orchestrator: owns the renderer lifecycle, watermark injection,
// Live Simulation lifecycle, and the export/share document requests.
//
// Free layouts (timeline, cards, mindmap) are bundled; the Insight Map
// renderer and the Live Simulation engine are fetched on demand from
// /gated/, which the server only serves to Pro sessions — a free browser
// never receives the premium code at all.

import { subscribe, getState } from '../state.js';
import { watermarkRequired, LAYOUTS } from '../tier/gates.js';
import { api, API_BASE } from '../api.js';
import { applyWatermark } from './watermark.js';
import * as util from './util.js';
import * as timeline from './layouts/timeline.js';
import * as cards from './layouts/cards.js';
import * as nodes from './layouts/nodes.js';
import * as kinetic from './layouts/kinetic.js';

const LOCAL_RENDERERS = { kinetic, timeline, cards, nodes };
// Gated modules are served by the backend (a different origin from the
// GitHub Pages frontend), so they must be imported with an absolute URL built
// from the single API base — a root-relative path would resolve against the
// Pages origin and 404.
const GATED_URLS = {
  map: `${API_BASE}/gated/map.js`,
  simulation: `${API_BASE}/gated/simulation.js`,
};

// Because the gated modules load cross-origin, their own imports can't resolve
// the frontend's util.js by path. Hand them this realm's util module via the
// window so they share the exact same helpers as the bundled layouts. Assigned
// at module load — before any gated import can run.
window.__elleryUtil = util;
const SIMULATABLE = new Set(['nodes', 'timeline']);
const gatedCache = new Map();

let canvasEl = null;
let cleanup = null;
let simCleanup = null;
let renderToken = 0;
let onGateDenied = () => {};

export function initCanvas(el, { gateDenied } = {}) {
  canvasEl = el;
  if (gateDenied) onGateDenied = gateDenied;
  subscribe((state, changed) => {
    if (changed.some((k) => ['dataset', 'layout', 'tier', 'limits', 'simulation'].includes(k))) {
      render(state);
    }
  });
  render(getState());
}

export function simulationSupported(layout) {
  return SIMULATABLE.has(layout);
}

// The live Kinetic Rank engine instance, if the kinetic layout is mounted.
// Data Story Mode (camera + scenes) lives on this engine.
export function getKineticSystem() {
  return canvasEl?.querySelector('canvas.kinetic-canvas')?.__kinetic || null;
}

async function render(state) {
  const token = ++renderToken;
  stopSimulation();
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  // Onboarding fades out the moment data parses in.
  const onboarding = canvasEl.querySelector('.empty-state');
  if (onboarding && state.dataset) {
    onboarding.classList.add('fading');
    await new Promise((r) => setTimeout(r, 240));
    if (token !== renderToken) return;
  }
  canvasEl.innerHTML = '';

  if (!state.dataset) {
    canvasEl.innerHTML = `
      <div class="empty-state">
        <h1>Welcome to Ellery Studio.</h1>
        <p class="empty-credit">Designed &amp; Engineered by Ishaan Jha.</p>
        <p>Ellery transforms complex data objects into kinetic, physics-driven
           intelligence layouts you can interrogate by hand.</p>
        <div class="empty-steps">
          <h2>How to start</h2>
          <ul>
            <li>Paste or drop your file into the input console on the left.</li>
            <li>Interact: tap a sort button to watch your rows re-order themselves, drag
                one card onto another to compare them, or click a card to make it the
                baseline everything else is measured against.</li>
            <li>Export: click ‘Export Dynamic MP4’ to record a live re-ranking loop —
                a free, ready-to-drop presentation slide asset.</li>
          </ul>
        </div>
        <button class="btn btn-primary" data-action="load-demo">Try it with demo data →</button>
      </div>`;
    return;
  }

  const renderer = await resolveGated(state.layout in LOCAL_RENDERERS ? null : state.layout) ??
    LOCAL_RENDERERS[state.layout];
  if (token !== renderToken) return; // a newer render superseded this one
  if (!renderer) {
    // Server refused the gated module (free session) — bounce to paywall.
    onGateDenied(state.layout);
    return;
  }

  const { dataset, layout } = state;
  const meta = LAYOUTS[layout];

  const head = document.createElement('div');
  head.className = 'story-head';
  head.innerHTML = `
    <h1>${meta.name}</h1>
    <div class="story-meta">${dataset.rows.length}${
      dataset.truncated ? ` of ${dataset.meta.totalRows}` : ''
    } rows · ${dataset.columns.length} columns · source: ${dataset.meta.format}</div>`;
  canvasEl.appendChild(head);

  cleanup = renderer.render(canvasEl, dataset) || null;

  if (state.simulation && SIMULATABLE.has(layout)) {
    const sim = await resolveGated('simulation');
    if (token !== renderToken) return;
    if (sim) {
      simCleanup = sim.start(canvasEl, layout) || null;
    } else {
      onGateDenied('simulation');
    }
  }

  if (watermarkRequired()) applyWatermark(canvasEl);
}

function stopSimulation() {
  if (simCleanup) {
    simCleanup();
    simCleanup = null;
  }
}

async function resolveGated(key) {
  if (!key || !GATED_URLS[key]) return null;
  if (gatedCache.has(key)) return gatedCache.get(key);
  try {
    const mod = await import(GATED_URLS[key]);
    gatedCache.set(key, mod);
    return mod;
  } catch {
    return null; // 403 (not Pro) or network failure
  }
}

/* ---------- Export & share (documents assembled server-side) ---------- */

// Pro: watermark-free, embed-ready standalone HTML. Server enforces tier.
export function exportCleanCode() {
  return requestDocument(api.exportStory, 'export');
}

// Every tier: watermarked share preview. The server injects the watermark
// itself, so what we send here doesn't matter for branding.
export function exportSharePreview() {
  return requestDocument(api.sharePreview, 'share');
}

async function requestDocument(endpoint, kind) {
  const state = getState();
  if (!state.dataset || !canvasEl) {
    return { ok: false, error: 'Nothing to export yet.' };
  }

  const clone = canvasEl.cloneNode(true);
  clone.querySelectorAll('.sd-watermark, .viz-hint').forEach((el) => el.remove());

  const result = await endpoint({
    html: clone.innerHTML,
    layout: state.layout,
  });
  if (!result.ok) return result;

  const blob = new Blob([result.text], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `data-story-${state.layout}${kind === 'share' ? '-share' : ''}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { ok: true };
}

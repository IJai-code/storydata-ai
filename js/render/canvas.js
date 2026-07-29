// Canvas orchestrator: owns the renderer lifecycle, watermark injection,
// and the export/share document requests.
//
// Free layouts (timeline, cards, mindmap) are bundled; the Insight Map
// renderer is fetched on demand from /gated/, which the server only serves
// to Pro sessions — a free browser never receives the premium code at all.

import { subscribe, getState, setState } from '../state.js';
import { watermarkRequired, LAYOUTS, layoutAllowed } from '../tier/gates.js';
import { api, API_BASE } from '../api.js';
import { applyWatermark } from './watermark.js';
import * as util from './util.js';
import * as discovery from '../discovery/index.js';
import { buildReport, resolveFocus, applyFocus } from './pull.js';
import { escapeHTML } from './util.js';
import * as findings from './layouts/findings.js';
import * as timeline from './layouts/timeline.js';
import * as cards from './layouts/cards.js';
import * as nodes from './layouts/nodes.js';
import * as kinetic from './layouts/kinetic.js';

const LOCAL_RENDERERS = { findings, kinetic, timeline, cards, nodes };
// Gated modules are served by the backend (a different origin from the
// GitHub Pages frontend), so they must be imported with an absolute URL built
// from the single API base — a root-relative path would resolve against the
// Pages origin and 404.
const GATED_URLS = {
  map: `${API_BASE}/gated/map.js`,
};

// Because the gated modules load cross-origin, their own imports can't resolve
// the frontend's util.js by path. Hand them this realm's util module via the
// window so they share the exact same helpers as the bundled layouts. Assigned
// at module load — before any gated import can run.
window.__elleryUtil = util;
// The Discovery Engine is the analysis layer gated visualizations read from.
window.__elleryDiscovery = discovery;
const gatedCache = new Map();

// Entrance motion celebrates arrival, once: each lens animates its first
// render of a dataset, and every revisit is immediate. Reset on new data.
let animatedLenses = new Set();
let animatedDataset = null;

let canvasEl = null;
let lensBar = null;
let pullBar = null;
let cleanup = null;
let renderToken = 0;
let onGateDenied = () => {};

export function initCanvas(el, { gateDenied } = {}) {
  canvasEl = el;
  lensBar = document.getElementById('lensBar');
  pullBar = document.getElementById('pullBar');
  if (gateDenied) onGateDenied = gateDenied;

  // All navigation is delegated from the stage so it survives every canvas
  // re-render and covers the tab bar, the trace, and the pull bar. These
  // controls live OUTSIDE #canvas (or are stripped on export), so none of this
  // chrome ever leaks into an exported artifact (which captures #canvas only).
  el.parentElement?.addEventListener('click', (e) => {
    // The Pull: click a finding → resolve the exact rows it points at, descend.
    const pull = e.target.closest('[data-pull]');
    if (pull) {
      const state = getState();
      if (!state.dataset) return;
      const report = buildReport(state.dataset);
      const d = report.discoveries.find((x) => x.id === pull.dataset.pull);
      if (d) setState({ focus: resolveFocus(d, state.dataset, report), layout: 'findings' });
      return;
    }
    if (e.target.closest('[data-pull-clear]')) {
      setState({ focus: null });
      return;
    }
    // Lens navigation — the traced focus persists across the switch.
    const goto = e.target.closest('[data-goto-layout]');
    if (goto) {
      const key = goto.dataset.gotoLayout;
      if (key === getState().layout) return;
      if (!layoutAllowed(key)) {
        onGateDenied(key);
        return;
      }
      setState({ layout: key });
    }
  });

  subscribe((state, changed) => {
    // A new dataset opens a fresh case — drop any trace from the old one.
    if (changed.includes('dataset') && state.focus) {
      setState({ focus: null });
      return;
    }
    if (changed.some((k) => ['dataset', 'layout', 'tier', 'limits', 'focus'].includes(k))) {
      render(state);
    }
  });
  render(getState());
}

// The "Tracing …" bar shown on a lens while a finding is being followed. Lives
// in #pullBar (a sibling of #canvas), so it never appears in an export.
function renderPullBar(state) {
  if (!pullBar) return;
  const show = state.dataset && state.focus && state.layout !== 'findings';
  pullBar.hidden = !show;
  if (!show) {
    pullBar.innerHTML = '';
    return;
  }
  pullBar.innerHTML = `
    <span class="pull-bar-label">Tracing</span>
    <button class="pull-bar-finding" data-goto-layout="findings">${escapeHTML(state.focus.title)}</button>
    <span class="pull-bar-count">${state.focus.rowIndices.length} record${state.focus.rowIndices.length === 1 ? '' : 's'} lit</span>
    <button class="pull-bar-clear" data-pull-clear>Clear</button>`;
}

// The lens tab bar: Findings is home; every visualization is a lens onto the
// same Case File. Rendered into the sibling #lensBar, never into #canvas.
function renderLensBar(state) {
  if (!lensBar) return;
  if (!state.dataset) {
    lensBar.hidden = true;
    lensBar.innerHTML = '';
    return;
  }
  lensBar.hidden = false;
  lensBar.innerHTML = Object.entries(LAYOUTS)
    .map(([key, meta]) => {
      const active = key === state.layout ? ' active' : '';
      const locked = meta.pro && !layoutAllowed(key) ? ' locked' : '';
      return `<button class="lens-tab${active}${locked}" data-goto-layout="${key}">${meta.name}</button>`;
    })
    .join('');
}

// The live Kinetic Rank engine instance, if the kinetic layout is mounted.
// Data Story Mode (camera + scenes) lives on this engine.
export function getKineticSystem() {
  return canvasEl?.querySelector('canvas.kinetic-canvas')?.__kinetic || null;
}

async function render(state) {
  const token = ++renderToken;
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  // Onboarding fades out the moment data parses in.
  const onboarding = canvasEl.querySelector('.empty-state');
  if (onboarding && state.dataset) {
    onboarding.classList.add('fading');
    await new Promise((r) => setTimeout(r, 160));
    if (token !== renderToken) return;
  }
  canvasEl.innerHTML = '';
  renderLensBar(state);
  renderPullBar(state);

  if (!state.dataset) {
    canvasEl.innerHTML = `
      <div class="empty-state">
        <h1>Open a case on your data.</h1>
        <p>Load a CSV, JSON, or text file from the panel. Ellery reads it,
           reasons about it, and opens with the findings — the visualizations
           are lenses onto the same conclusions.</p>
        <span class="empty-cta">
          <button class="btn btn-ghost" data-action="load-demo">Load sample data</button>
        </span>
      </div>`;
    return;
  }

  // A gated lens is fetched cross-origin on first use; on a cold backend that
  // can take a moment, so show a quiet placeholder rather than a blank stage.
  const gatedFirstLoad = !(state.layout in LOCAL_RENDERERS) && !gatedCache.has(state.layout);
  let loadingEl = null;
  if (gatedFirstLoad) {
    loadingEl = document.createElement('div');
    loadingEl.className = 'lens-loading';
    loadingEl.textContent = 'Preparing the lens…';
    canvasEl.appendChild(loadingEl);
  }

  const renderer = await resolveGated(state.layout in LOCAL_RENDERERS ? null : state.layout) ??
    LOCAL_RENDERERS[state.layout];
  if (token !== renderToken) return; // a newer render superseded this one
  if (loadingEl) loadingEl.remove();
  if (!renderer) {
    // Server refused the gated module (free session) — bounce to paywall.
    onGateDenied(state.layout);
    return;
  }

  const { dataset, layout } = state;

  // Findings carries its own header. Every other lens gets the dataset's shape
  // only — the lens bar above already names the view, so repeating it here (and
  // in the export) said the chart's type where the data's identity belongs.
  if (layout !== 'findings') {
    const head = document.createElement('div');
    head.className = 'story-head';
    head.innerHTML = `
      <div class="story-meta">${dataset.rows.length}${
        dataset.truncated ? ` of ${dataset.meta.totalRows}` : ''
      } records · ${dataset.columns.length} fields · source: ${dataset.meta.format}</div>`;
    canvasEl.appendChild(head);
  }

  // First render of this lens for this dataset animates; revisits are instant.
  if (animatedDataset !== dataset) {
    animatedDataset = dataset;
    animatedLenses = new Set();
  }
  canvasEl.classList.toggle('no-anim', animatedLenses.has(layout));
  animatedLenses.add(layout);

  cleanup = renderer.render(canvasEl, dataset) || null;

  // The microscope: if a finding is being traced, spotlight its rows in the
  // lens and dim the rest. Findings carries its own trace; canvas-drawn lenses
  // (Kinetic) expose no row elements, so applyFocus no-ops there gracefully.
  if (state.focus && layout !== 'findings') applyFocus(canvasEl, state.focus);

  if (watermarkRequired()) applyWatermark(canvasEl);
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

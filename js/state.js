// Single source of truth for UI state. The tier and its limits come from the
// server (/api/session) — nothing here is authoritative for gating; the
// server re-checks everything. No localStorage: the session lives in an
// httpOnly cookie the page can't even read.

const state = {
  tier: 'free',
  limits: {
    // Conservative defaults until /api/session answers.
    price: 12.99,
    maxRows: 150,
    layouts: ['kinetic', 'timeline', 'cards', 'nodes'],
    watermark: true,
    export: false,
  },
  dataset: null,            // { columns, rows, meta, truncated }
  layout: 'findings',       // home surface: the Discovery Engine's conclusions
  story: null,              // Data Story Mode: { scenes: [{type, sel, mode}] } or null
  focus: null,              // The Pull: a traced finding { id, rowIndices, columns, ... } or null
  ui: { paywallTrigger: null },
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  const changed = Object.keys(patch);
  Object.assign(state, patch);
  if (changed.includes('tier')) {
    document.body.dataset.tier = state.tier;
  }
  for (const fn of listeners) fn(state, changed);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

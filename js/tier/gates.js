// UI-side mirror of the server's tier policy. This module only caches what
// /api/session said so the interface can paint locks and badges — the server
// re-enforces every limit on every request, so editing these values in the
// console changes pixels, not access.

import { getState, setState } from '../state.js';
import { api } from '../api.js';

export const LAYOUTS = {
  findings: {
    name: 'Findings',
    desc: 'What Ellery concluded',
    pro: false,
  },
  kinetic: {
    name: 'Kinetic Rank',
    desc: 'Rank and compare records',
    pro: false,
  },
  timeline: {
    name: 'Timeline',
    desc: 'Order events over time',
    pro: false,
  },
  cards: {
    name: 'Cards',
    desc: 'One card per record',
    pro: false,
  },
  nodes: {
    name: 'Mindmap',
    desc: 'Hierarchy and grouping',
    pro: false,
  },
  map: {
    name: 'Insight Map',
    desc: 'Grouped field with summary',
    pro: true,
  },
};

// While the Early Access preview is on, the server grants Pro to every session.
// If the session can't be fetched (cold/asleep backend, offline), the client
// must NOT fall back to a locked free tier — that would gate features the
// server would happily allow, which reads as "the Pro buttons are broken".
// This mirrors the server's grant locally. Flip to false when paid tiers return.
export const EARLY_ACCESS_PREVIEW = true;

// The session the UI assumes when Early Access is on and the server is silent.
// Same shape /api/session returns for a Pro session.
export function previewSession() {
  return {
    ok: true,
    tier: 'pro',
    price: 12.99,
    maxRows: null,
    layouts: ['kinetic', 'timeline', 'cards', 'nodes', 'map'],
    watermark: false,
    export: true,
  };
}

// Pull the authoritative session from the server into UI state.
// Accepts an already-fetched session payload (e.g. a checkout response)
// to avoid a second round-trip.
export async function refreshSession(payload = null) {
  const data = payload || (await api.session());
  if (!data.ok) return data;
  setState({
    tier: data.tier === 'pro' ? 'pro' : 'free',
    limits: {
      price: typeof data.price === 'number' ? data.price : 12.99,
      maxRows: data.maxRows ?? null,
      layouts: Array.isArray(data.layouts) ? data.layouts : ['kinetic', 'timeline', 'cards', 'nodes'],
      watermark: data.watermark !== false,
      export: data.export === true,
    },
  });
  return data;
}

export function isPro() {
  return getState().tier === 'pro';
}

export function proPrice() {
  return getState().limits.price;
}

export function maxRows() {
  const { maxRows: cap } = getState().limits;
  return cap === null ? Infinity : cap;
}

export function layoutAllowed(key) {
  // Findings is the home surface — the Discovery Engine runs client-side and is
  // never gated. Everything else defers to the server's per-session layout list.
  if (key === 'findings') return true;
  return getState().limits.layouts.includes(key);
}

export function watermarkRequired() {
  return getState().limits.watermark;
}

export function exportAllowed() {
  return getState().limits.export;
}

// The Pull — traversal from a finding down to the exact rows and cells that
// produced it. Nothing here computes a finding; it only *selects* the rows the
// finding already points at. The Discovery report is memoized by dataset
// identity so a Pull never re-runs analysis — it is pure navigation.

import { runDiscovery } from '../discovery/index.js';
import { runRelationships } from '../relationships/index.js';
import { evaluateAll, verify, pull as pullClaim, procedureFingerprint, resultFingerprint } from '../derive/graph.js';
import { projectWitness, scopeOf, groundOf, derivationString, becauseString } from '../derive/project.js';

// Re-exported so the trace formats evidence numbers with the engine's own
// deterministic formatter (keeping evidence and derivation consistent).
export { formatNumber } from '../discovery/index.js';
// The fingerprinted ground now lives in derive/, shared with the graph.
export { snapshotOf, rowFingerprint } from '../derive/fingerprint.js';

let cache = { dataset: null, report: null };

// The same deterministic report the Case File renders — reused, never recomputed.
export function buildReport(dataset) {
  if (cache.dataset === dataset && cache.report) return cache.report;
  const report = runDiscovery(dataset);
  cache = { dataset, report };
  return report;
}

// Resolve a finding to the exact rows + decisive columns behind it. This is
// selection, not analysis: the finding's witness already names the records that
// support it, so the Pull only projects them onto the current snapshot.
export function resolveFocus(d, dataset) {
  const witness = groundOf(d.justification);
  return {
    id: d.id,
    title: d.title,
    summary: d.summary,
    evidence: d.evidence || {},
    detector: d.metadata?.detector,
    direction: d.metadata?.direction || null,
    tone: d.metadata?.tone || 'neutral',
    rowIndices: projectWitness(witness, dataset),
    columns: witness.fields,
    scope: scopeOf(witness),
  };
}

// One plain sentence naming what Ellery actually looked at — rendered from the
// operation the detector performed, not from a per-detector special case.
export function explain(focus, d, dataset, report) {
  return becauseString(d.justification, dataset, report, evaluateAll(d.justification, dataset, report.profile));
}

// Spotlight the focus rows inside a rendered lens: light the matches, dim the
// rest. Works on any lens whose row elements carry data-idx; returns false when
// a lens exposes no rows (e.g. the canvas-drawn Kinetic board), so callers can
// fall back gracefully.
export function applyFocus(container, focus) {
  const marked = container.querySelectorAll('[data-idx]');
  if (!marked.length) return false;
  // Dataset-wide findings light nothing in particular — leave the lens as-is.
  if (focus.scope === 'dataset') return true;
  const set = new Set(focus.rowIndices);
  container.classList.add('pull-active');
  marked.forEach((el) => {
    const lit = set.has(Number(el.dataset.idx));
    el.classList.toggle('pull-lit', lit);
    el.classList.toggle('pull-dim', !lit);
  });
  return true;
}

/* ---------- Provenance: derivation, policy (π), confidence ----------
   C = f(E, π). The derivation is rendered from the operation graph and π is read
   back from the rule the detector authored — no per-detector special cases. */

export function provenanceOf(d, report, dataset) {
  return {
    derivation: derivationString(d.justification, dataset, report, evaluateAll(d.justification, dataset, report.profile)),
    policy: d.justification.policy,
    confidence: d.justification.confidence,
  };
}

/* ---------- Identity and verification ----------
   Two fingerprints, because they answer different questions. The *procedure*
   names the computation and is snapshot-free: it stays the same when the data
   changes. The *result* binds that procedure to this snapshot. Together they let
   a reader tell "the data moved" apart from "the reasoning changed". */

export function fingerprintsOf(d, snapshot) {
  return {
    procedure: procedureFingerprint(d.justification),
    result: resultFingerprint(d.justification, snapshot),
  };
}

/* ---------- The claim index ----------
   One lookup spanning every tier, so a composed claim resolves its supports
   without anyone hard-coding which engine produced them. Decisions will resolve
   Relationships through exactly this, unchanged. */

let claimCache = { report: null, index: null };

export function claimIndex(report) {
  if (claimCache.report === report) return claimCache.index;
  const index = new Map();
  for (const d of report.discoveries) index.set(d.id, d);
  for (const r of runRelationships(report).relationships) index.set(r.id, r);
  claimCache = { report, index };
  return index;
}

const claimCtx = (dataset, report) => ({
  dataset,
  profile: report.profile,
  claimById: (id) => claimIndex(report).get(id) || null,
});

// Re-run every operation from fingerprinted ground and confirm it reproduces the
// claim. A real recomputation, not a stored flag. Returns the full result so a
// caller can say *which* link broke; `.ok` is the headline.
export const verifyClaim = (claim, dataset, report) => verify(claim, claimCtx(dataset, report));

export const verifyFinding = (claim, dataset, report) => verifyClaim(claim, dataset, report).ok;

// The Pull, across tiers. Yields the claim, then descends each support: a claim
// support recurses, a ground support terminates at the fingerprinted witness.
// Generic — nothing here knows what a "concentration" is.
export const pullClaimChain = (claim, report) => [...pullClaim(claim, (id) => claimIndex(report).get(id) || null)];

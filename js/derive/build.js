// What a detector hands over with each claim: the computation it performed (a
// small op graph), what the claim stands on, the policy it applied, and the
// value it asserts.

import { newGraph } from './graph.js';
import { rowFingerprint } from './fingerprint.js';

/* ---------- Witnesses: what supports the conclusion ----------
   Records are addressed by content fingerprint, never by row index — the index
   is a render-time projection (see project.js). */

export const record = (dataset, index, fields = []) => ({
  support: { of: 'record', id: rowFingerprint(dataset, index) },
  fields,
});

export const records = (dataset, indices, fields = []) => ({
  support: { of: 'records', ids: indices.map((i) => rowFingerprint(dataset, i)) },
  fields,
});

export const group = (column, value, fields = []) => ({
  support: { of: 'group', column, value },
  fields,
});

export const wholeColumn = (column, fields = []) => ({
  support: { of: 'column', column },
  fields,
});

/* ---------- Justification ---------- */

// `asserts` must carry every quantity the claim states, not only whether its
// rule fired. Verify re-derives the graph from ground and compares against this,
// so a claim that says "69%" fails when the real share is 64, even though
// "share >= 35" still holds.
function justification(supports, { build, policy, confidence, asserts }) {
  const g = newGraph();
  const root = build(g);
  return Object.freeze({
    supports: Object.freeze(supports.map(Object.freeze)),
    opGraph: Object.freeze({ root, nodes: Object.freeze(g.nodes) }),
    policy: Object.freeze(policy),
    confidence: Object.freeze(confidence),
    asserts,
  });
}

// Discovery tier: one ground support, an op graph over cells.
export const justify = ({ witness, ...rest }) => justification([{ of: 'ground', witness }], rest);

// Relationship tier: supports are other claims, recorded by id. Verify never
// re-runs the rule that chose them.
export const justifyOver = ({ supports, ...rest }) =>
  justification(supports.map((id) => ({ of: 'claim', id })), rest);

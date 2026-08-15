// The detector-facing API. A detector states three things it already knows:
// the computation it performed (as a small op graph), the support behind its
// conclusion (a semantic witness), and the policy it applied (π). Everything
// downstream — Pull, Verify, Fingerprint, the derivation and "because" lines —
// is derived from that, generically.

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

// Assemble a Discovery-tier justification: one ground support plus the op graph
// that produced the value. Relationship/Decision claims use the same shape with
// `claim` supports and no opGraph.
//
// `asserts` is the value the detector stands behind — what it computed by its
// own route. Verification re-derives the graph from ground and checks it lands
// on exactly this. Without it there is nothing to disagree with, and a
// "re-check" would be theatre.
export function justify({ build, witness, policy, confidence, asserts }) {
  const g = newGraph();
  const root = build(g);
  return Object.freeze({
    supports: Object.freeze([Object.freeze({ of: 'ground', witness })]),
    opGraph: Object.freeze({ root, nodes: Object.freeze(g.nodes) }),
    policy: Object.freeze(policy),
    confidence: Object.freeze(confidence),
    asserts,
  });
}

// Assemble a composed (Relationship-tier) justification: supports are other
// Claims, and the op graph composes *their* values rather than cells. Selection
// is recorded in `supports`, exactly as the Discovery witness records rows —
// verification never re-runs the rule that chose them.
//
// `asserts` must carry every quantity the claim states, not merely the predicate
// outcome: a rule firing on "share >= 35" while saying "69%" has to fail when the
// real share is 64, and a bare boolean could not catch that.
export function justifyOver({ supports, build, policy, confidence, asserts }) {
  const g = newGraph();
  const root = build(g);
  return Object.freeze({
    supports: Object.freeze(supports.map((claimId) => Object.freeze({ of: 'claim', claimId }))),
    opGraph: Object.freeze({ root, nodes: Object.freeze(g.nodes) }),
    policy: Object.freeze(policy),
    confidence: Object.freeze(confidence),
    asserts,
  });
}

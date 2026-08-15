// The derivation graph: node identity, evaluation, verification, and the
// Claim → Support traversal.
//
// Identity is separated from evaluation. A node's id hashes its kind, its
// operand ids, and any policy constant (π) — never a data-derived value. So the
// id names the *computation* and is snapshot-independent; values come only from
// evaluate(). Verification therefore never trusts a stored value: it recomputes
// from ground and compares.
//
// Node kinds: cell | column | param (ground/π leaves) · stat | reduce (operations).

import { hash, rowFingerprint } from './fingerprint.js';

const canon = (v) => (typeof v === 'number' ? (Object.is(v, -0) ? '0' : String(v)) : JSON.stringify(v ?? null));

/* ---------- The operation algebra ----------
   Closed and small on purpose. Presentation and verification both dispatch on
   these keys, never on the detector that happened to use them. An op is added
   only when a new *kind of math* appears — not per detector. */

const nums = (xs) => (Array.isArray(xs) ? xs.filter((v) => typeof v === 'number' && !Number.isNaN(v)) : []);

// Numeric ops mirror profile.js's numericStats exactly — same filtering, same
// ascending sort, same summation order. Float arithmetic is order-sensitive, so
// "equivalent" is not good enough: the values must be bit-identical.
const sorted = (xs) => nums(xs).slice().sort((a, b) => a - b);
const sum = (v) => {
  let s = 0;
  for (let i = 0; i < v.length; i += 1) s += v[i];
  return s;
};
const meanOf = (v) => sum(v) / v.length;
const varianceOf = (v) => {
  const m = meanOf(v);
  let sq = 0;
  for (let i = 0; i < v.length; i += 1) sq += (v[i] - m) ** 2;
  return sq / v.length;
};

// Category grouping mirrors profile.js's categoricalStats and the distribution
// detector: blanks dropped, ties broken by key ascending.
const groupCounts = (xs) => {
  const counts = new Map();
  for (const val of xs) {
    if (val === null || val === undefined || val === '') continue;
    const k = String(val);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
};

export const OPS = Object.freeze({
  max: ([xs]) => Math.max(...nums(xs)),
  min: ([xs]) => Math.min(...nums(xs)),
  mean: ([xs]) => meanOf(sorted(xs)),
  median: ([xs]) => {
    const v = sorted(xs);
    const mid = v.length >> 1;
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  },
  stddev: ([xs]) => Math.sqrt(varianceOf(sorted(xs))),
  distinct: ([xs]) => groupCounts(xs).length,

  // Bundles the three descriptive stats into one conclusion.
  describe: ([mean, median, stddev]) => ({ mean, median, stddev }),

  // The largest category by record count.
  groupLargest: ([xs]) => {
    const top = groupCounts(xs);
    return top.length ? { value: top[0][0], count: top[0][1], groups: top.length } : null;
  },

  // The leading category by summed metric, and its share of the total.
  groupShare: ([keys, metric]) => {
    const totals = new Map();
    keys.forEach((k, i) => {
      const v = metric[i];
      if (typeof v !== 'number') return;
      const key = String(k ?? '—');
      totals.set(key, (totals.get(key) || 0) + v);
    });
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    if (!ranked.length) return null;
    const grand = ranked.reduce((a, [, t]) => a + t, 0);
    return { value: ranked[0][0], total: ranked[0][1], share: grand > 0 ? Math.round((ranked[0][1] / grand) * 100) : 0 };
  },

  // Status classification is domain vocabulary (π), applied through the profile.
  classify: ([xs], _n, ctx) => xs.map((v) => ctx.profile.classifyStatus(v)),
  countEqual: ([xs, target]) => xs.filter((v) => v === target).length,
  countBetween: ([xs, low, high]) => xs.filter((v) => typeof v === 'number' && v > low && v <= high).length,

  // Share of records flagged neither critical nor low.
  healthShare: ([tones]) => {
    let critical = 0;
    let warn = 0;
    let ok = 0;
    for (const t of tones) {
      if (t === 'critical') critical += 1;
      else if (t === 'warn') warn += 1;
      else if (t === 'ok') ok += 1;
    }
    const n = tones.length;
    const healthy = ok || n - critical - warn;
    return { healthy, total: n, pct: Math.round((healthy / n) * 100) };
  },

  zscore: ([value, mean, stddev]) => Math.abs((value - mean) / stddev),
  exceeds: ([value, threshold]) => value > threshold,

  /* Composition tier (Relationships). Deliberately five small ops, not an
     expression engine: four comparisons plus a struct constructor. A claim's
     asserted shape is a `record` over projections of its supports. */
  ratio: ([a, b]) => a / b,
  atLeast: ([x, t]) => x >= t,
  below: ([x, t]) => x < t,
  count: ([xs]) => (Array.isArray(xs) ? xs.length : 0),
});

// `record` names its inputs, so it is evaluated separately from the positional
// ops above. It is what lets one generic combiner produce every Relationship's
// asserted shape instead of one bespoke op per rule.
const evalRecord = (node, values) =>
  Object.fromEntries(Object.entries(node.fields).map(([k, id]) => [k, values[id]]));

/* ---------- Building ---------- */

// A graph builder. Each helper interns a node under its content id and returns
// that id, so structurally identical computations collapse to one node — across
// detectors and across snapshots, since ids exclude data-derived values.
export function newGraph() {
  const nodes = {};

  const intern = (node, idParts) => {
    const id = hash(idParts);
    if (!nodes[id]) nodes[id] = Object.freeze({ ...node, id });
    return id;
  };

  return {
    nodes,
    column: (column) => intern({ kind: 'column', column }, `column::${column}`),
    // Cells are addressed by content, so the record survives reordering.
    cell: (dataset, index, column) => {
      const rowRef = rowFingerprint(dataset, index);
      return intern({ kind: 'cell', rowRef, column }, `cell::${rowRef}:${column}`);
    },
    // π is procedure, so a param's value belongs to its identity.
    param: (name, value) => intern({ kind: 'param', name, value }, `param:${name}::${canon(value)}`),
    stat: (stat, inputs) => intern({ kind: 'stat', stat, inputs }, `stat:${stat}:${inputs.join(',')}:`),
    reduce: (op, inputs) => intern({ kind: 'reduce', op, inputs }, `reduce:${op}:${inputs.join(',')}:`),

    // A leaf that stands for another Claim's value. Evaluating it re-derives
    // that claim from ITS ground — never reads its stored `asserts`, which
    // would make composition trust the very number under test.
    claim: (claimId, path = '') => intern({ kind: 'claim', claimId, path }, `claim:${claimId}:${path}:`),

    // Named struct — the asserted shape of a composed claim.
    record: (fields) =>
      intern(
        { kind: 'record', fields },
        `record::${Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join(',')}`
      ),
  };
}

/* ---------- Identity ----------
   Node ids are already content addresses over structure and π, so the procedure
   fingerprint of a justification is just its root id — snapshot-free. Binding it
   to a snapshot gives the result fingerprint. (Exposed in Phase 2.) */

export const procedureFingerprint = (justification) => justification.opGraph.root;

export const resultFingerprint = (justification, snapshot) =>
  hash(`${justification.opGraph.root}:${snapshot.fingerprint}`);

/* ---------- Evaluation ---------- */

// fingerprint → row index, built once per dataset so cell leaves resolve in O(1).
let refCache = { dataset: null, byRef: null };
function refIndex(dataset) {
  if (refCache.dataset === dataset) return refCache.byRef;
  const byRef = new Map();
  dataset.rows.forEach((_, i) => byRef.set(rowFingerprint(dataset, i), i));
  refCache = { dataset, byRef };
  return byRef;
}

// Bind a graph to a snapshot and produce every reachable node's value. The only
// place values are created; nothing stores them on the nodes themselves. `ctx`
// carries the dataset and its profile — both deterministic from the snapshot,
// the profile supplying the domain vocabulary that classification (π) needs.
export function evaluate(nodes, ctx, root, values = {}) {
  if (root in values) return values;
  const n = nodes[root];
  switch (n.kind) {
    case 'column':
      values[root] = ctx.dataset.rows.map((r) => r[n.column]);
      break;
    case 'cell': {
      const i = refIndex(ctx.dataset).get(n.rowRef);
      values[root] = i == null ? null : ctx.dataset.rows[i][n.column];
      break;
    }
    case 'param':
      values[root] = n.value;
      break;
    case 'claim': {
      // Re-derive the supporting claim from its own ground, then project.
      const supporting = ctx.claimById?.(n.claimId);
      const derived = supporting ? evaluateClaim(supporting, ctx) : undefined;
      values[root] = n.path ? derived?.[n.path] : derived;
      break;
    }
    case 'record':
      for (const id of Object.values(n.fields)) evaluate(nodes, ctx, id, values);
      values[root] = evalRecord(n, values);
      break;
    default: {
      for (const input of n.inputs) evaluate(nodes, ctx, input, values);
      values[root] = OPS[n.op ?? n.stat](n.inputs.map((i) => values[i]), n, ctx);
    }
  }
  return values;
}

// The value a Claim's own procedure produces, whatever tier it belongs to.
function evaluateClaim(claim, ctx) {
  const g = claim.justification?.opGraph;
  if (!g) return undefined;
  return evaluate(g.nodes, ctx, g.root)[g.root];
}

export const evaluateAll = (justification, dataset, profile, claimById) =>
  evaluate(justification.opGraph.nodes, { dataset, profile, claimById }, justification.opGraph.root);

/* ---------- Verification ---------- */

// Recompute each operation from its inputs and compare against the evaluated
// value. Ground leaves are the floor — they are the snapshot, so they verify by
// definition. Knows nothing about detectors.
// Re-running a pure op on values that same pass just produced can only ever
// agree with itself — that would be verification theatre. The real check is
// against what the *detector asserted* when it made the claim: evaluate the
// graph from fingerprinted ground, independently of the detector's own
// arithmetic, and compare the result to the value the finding stands behind.
// Three checks, per the frozen contract (docs/derivation-graph.md §7.5):
//   1. resolvable — every cited support exists in this snapshot
//   2. recursive  — every claim support verifies
//   3. local      — the re-derived value equals what the claim asserts
// Ground supports are the floor: a cell either is in the snapshot or is not.
//
// Step 3 is equality against the FULL asserted struct, not just the predicate
// outcome. A rule that fires on `share >= 35` while stating "69%" must fail if
// the real share is 64 — the predicate would still hold, but the claim lies.
export function verify(claim, ctx) {
  const j = claim.justification;
  const supports = [];
  let ok = true;

  for (const s of j?.supports ?? []) {
    if (s.of !== 'claim') continue;
    const supporting = ctx.claimById?.(s.claimId);
    if (!supporting) {
      supports.push({ claimId: s.claimId, ok: false, mode: 'missing-support' });
      ok = false;
      continue;
    }
    const r = verify(supporting, ctx);
    if (!r.ok) ok = false;
    supports.push({ claimId: s.claimId, ok: r.ok, mode: r.ok ? null : 'support-failed', detail: r });
  }

  const g = j?.opGraph;
  const actual = g ? evaluate(g.nodes, ctx, g.root)[g.root] : undefined;
  const localOk = deepEqual(actual, j?.asserts);
  if (!localOk) ok = false;

  return {
    ok,
    claimId: claim.id,
    local: { ok: localOk, expected: j?.asserts, actual, mode: localOk ? null : 'local-mismatch' },
    supports,
  };
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b);
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
}

/* ---------- The Pull: one traversal, every tier ----------
   Descends a Claim through its supports. A `claim` support recurses into the
   referenced Claim; a `ground` support terminates at the fingerprinted witness.
   Phase 1 only ever produces `ground` supports — the `claim` branch is what lets
   Relationships and Decisions become pullable without a second provenance
   system. */

export function* pull(claim, claimById = () => null) {
  yield { claim };
  for (const s of claim.justification?.supports ?? []) {
    if (s.of === 'claim') {
      const next = claimById(s.claimId);
      if (next) yield* pull(next, claimById);
    } else {
      yield { ground: s.witness };
    }
  }
}

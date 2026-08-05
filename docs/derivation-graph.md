# Design: the derivation graph

Status: proposed. Implementation gated on agreement.
Scope: replaces the flat evidence blob and the three detector-keyed switches in
`js/render/pull.js` with one content-addressed **Claim → Support** graph that
spans all three reasoning tiers already in the repo — Discovery, Relationship,
Decision. No new dependencies, no build step, static ES modules.

> **Revision note (tier frame).** The first draft modeled only the Discovery tier
> — an arithmetic DAG over cells. But `js/relationships/` and `js/decisions/`
> already produce conclusions grounded in *other conclusions* (via `supporting` /
> `supportingDiscoveries` / `supportingRelationships`), and J requires *any* claim
> to be traversable to fingerprinted ground. So the outer model is **Claim ←
> Support\***; the arithmetic DAG is the Discovery tier's specialization of it and
> is otherwise unchanged. See §7 for why this is the right stopping point (and not
> the fully-collapsed "one node kind" model).

---

## 0. Thesis

Today a finding carries a **flat evidence blob** (`evidence: { …arbitrary keys… }`),
and `pull.js` contains **three parallel `switch(detector)` statements** that each
re-interpret that blob:

- `resolveFocus` — *which rows* the finding covers, *which columns* are decisive, the scope.
- `explain` — the plain-English "because" sentence.
- `provenanceOf` — the derivation string, the policy (π), the confidence note.

The switches dispatch on **`metadata.detector`** — an *open* vocabulary that grows
with every feature. Worse, `resolveFocus` doesn't read the blob; it **re-derives
the selection by re-scanning the rows** with predicates that are second copies of
the detector's own (`qty:low`, the two `status:*` cases). Two copies of one truth
that can silently drift: the claim says "3 low" while the Pull lights 4.

The fix: detectors emit a small **derivation DAG** — typed operation nodes over
content-addressed leaves (cells, columns, thresholds). Pull, Verify, and
Fingerprint become **generic traversals** of that DAG. Presentation dispatches on
the **operation kind** — a *closed* algebra of ~8 ops — not on the detector. New
detectors reuse existing ops and add zero presentation code.

One line, restated: **stop dispatching on detectors (open); dispatch on operations (closed), and record the selection instead of re-deriving it.**

---

## 1. The data structure that replaces the flat evidence blob

### 1.0 The outer frame — Claim ← Support\*

Every conclusion Ellery produces is a **Claim**, regardless of tier. A Claim is
justified by a set of **Supports**; a Support is either **Ground** (terminating at
fingerprinted snapshot cells) or another **Claim**. Recursion bottoms out at the
snapshot — that is J, made structural and cross-tier.

```
Claim   = { id, tier:'discovery'|'relationship'|'decision', title, summary, confidence, …, justification }
Justification = {
  supports: Support[],                 // the chain — J
  policy: { rule, params, source },    // π — P
  opGraph?: { root, nodes },           // DISCOVERY ONLY — the arithmetic DAG of §1.1 (unchanged)
}
Support =
  | { of:'ground', witness }           // §1.2 witness (records|column|group) → cells → snapshot
  | { of:'claim',  claimId }           // points at another Claim — Relationship/Decision use this
```

- **Discovery** is the tier whose supports are all `ground` and whose justification
  carries an `opGraph` (the `stat`/`reduce` DAG below). Nothing about §1.1–§1.4
  changes; it simply lives *inside* a Discovery Claim's justification.
- **Relationship / Decision** carry `{of:'claim'}` supports and **no `opGraph`** —
  their procedure is a rule composing supporting claims, not arithmetic over cells.
  Today's `supporting[]` arrays *become* these `claim` supports; they are not a
  second mechanism, they are the same edge.
- **Pull, Verify, Fingerprint recurse over `supports`** (§3), so one traversal
  handles Decision → Relationship → Discovery → cells → snapshot. Phase 1 migrates
  Discovery only; the reasoning tiers stay dormant but are no longer unrepresentable.

### 1.1 Nodes (the Discovery tier's `opGraph`)

A derivation is a DAG of frozen nodes. **Identity is separated from evaluation:**
a node's `id` is a hash of `kind + operand ids + policy constants` — it identifies
the *computation*, never its output. Value is produced by a separate `evaluate`
pass that binds the DAG to a snapshot. So `id` is snapshot-independent; the same
`mean(Revenue)` computation has the same id on any snapshot.

```
Node =                                                    // NO value field — pure computation
  | { kind:'cell',   id, rowRef, column }                 // leaf: a record's cell, addressed by fingerprint
  | { kind:'column', id, column }                         // leaf: a column vector
  | { kind:'param',  id, name, value }                    // leaf: a policy constant (π) — value IS identity
  | { kind:'stat',   id, stat, inputs:[nodeId] }          // mean|median|stddev|sum|distinct|min|max
  | { kind:'reduce', id, op,   inputs:[nodeId] }          // count|countWhere|zscore|share|exceeds|health

evaluate(nodes, snapshot) → { [nodeId]: value }           // the only place values live
```

- **Identity rule.** `id` folds in structural operands and **policy constants (π)** —
  a σ-threshold of 2.0 vs 2.5 is a different computation, so `param` value is
  identity. It excludes every *data-derived* value (cell/column/stat/reduce
  outputs), which come only from `evaluate`. Verify never trusts a stored value; it
  always re-evaluates (§3.3).
- **Two fingerprints fall out.** A *procedure* fingerprint = `rootId` alone
  (snapshot-free); a *result* fingerprint = `hash(rootId + snapshotFingerprint)`.
  Chronicle can then distinguish "the data changed" from "the reasoning changed."
- **Leaves are the fingerprinted ground.** A `cell` node addresses its record by
  `rowFingerprint` (`rowRef`), not by index — the exact floor the Pull already
  terminates at ([pull.js:184](../js/render/pull.js)), now content-addressed.
- **`stat` and `param` nodes are shared.** `mean(Revenue)` requested by both
  `outliers` and `central-tendency` hashes to the **same id** → one node, verified
  once. Because id excludes value, sharing now holds across snapshots too.

### 1.2 The Witness (semantic support — replaces the row re-scan *and* `select`)

The finding carries **what supports the conclusion**, addressed semantically, not a
render-time list of row indices. The Pull *projects* the witness to `rowIndices` at
render time via a `fingerprint → currentIndex` map. This is where J lives.

```
Witness = { support, fields:[column] }
  support =
    | { of:'records', ids:[rowFingerprint] }   // enumerated — the detector already scanned them
    | { of:'column',  column }                 // whole-field support (dataset scope)
    | { of:'group',   column, value }          // a category group
    // extensible: { of:'edges' } | { of:'interval' } | { of:'weighted' } — add a kind + its projector
```

Why a witness and not the DAG's leaf cone: for `availability status:critical` the
root `count(classified='critical')` *reads* the entire Status column, but the
*support* is only the critical rows. Witness ≠ leaf cone — it is a distinct claim
the detector states. `scope` (row/subset/group/dataset) is **derived** from the
witness kind, not stored. The renderer owns the projection to indices.

### 1.3 The justification of a Discovery Claim

A Discovery is a Claim (§1.0) whose justification has a single `ground` support and
an `opGraph`:

```
discovery.justification = {
  supports: [ { of:'ground', witness } ],   // §1.2 — the record(s)/column/group behind it
  opGraph:  { root, nodes },                 // §1.1 — the stat/reduce DAG (no values)
  policy:   { rule, params, source },        // π — authored by the detector — P
  confidence: { value, note },               // C = f(E, π)
}
```

`createDiscovery` ([discovery.js:28](../js/discovery/discovery.js)) gains one
optional field, `justification`, frozen like the rest. **`evidence` stays exactly
as it is today** — see §4 for why that is load-bearing for byte-for-byte. A
Relationship or Decision Claim has the same `justification` shape but with
`{of:'claim'}` supports and no `opGraph`; nothing in Phase 1 touches them.

### 1.4 Worked example — the Revenue=900 outlier

Identity (left) is snapshot-free; values (right) come from `evaluate` only.

```
column('Revenue')                  → c    | eval: [110,130,…,900]
stat('mean',   [c])                → s1   | eval: 208.75     (SHARED with central-tendency)
stat('stddev', [c])                → s2   | eval: 261.519…   (SHARED)
cell(rowRef(3),'Revenue')          → k    | eval: 900        (ground)
param('sigma-threshold', 2.0)      → p    | eval: 2.0        (π — value is identity)
reduce('zscore',  [k,s1,s2])       → z    | eval: 2.6432…
reduce('exceeds', [z,p])           → f    | eval: true       ← root

witness    = { support:{ of:'records', ids:[rowFingerprint(3)] }, fields:['Revenue'] }
policy     = { rule:'Flag the record whose distance from the mean exceeds the σ threshold.',
               params:'threshold = 2.0σ', source:'discovery/detectors/outliers.js' }
confidence = { value:0.8216…, note:'scales with distance past 2σ: min(1, 0.5 + (z − 2) / 2)' }

procedure fingerprint = id(f)                          // snapshot-free
result    fingerprint = hash(id(f) + snapshot.fingerprint)
```

Every consumer is now a read of this one object plus one `evaluate` pass (§3).

---

## 2. Detector migration — fewest changes

A tiny builder module `js/derive/build.js` exposes one helper per op, so a
detector adds **one field** and deletes nothing of its own logic. The op helpers
construct nodes, hash them, and stamp the shared node ids.

### 2.1 `outliers` — a single-value finding

```diff
  createDiscovery({
    type: 'outlier', title: 'Notable outlier',
    summary: `${…} sits ${best.z.toFixed(1)}σ …`,
    importance: IMPORTANCE.MEDIUM,
    confidence: Math.min(1, 0.5 + (best.z - 2) / 2),
    evidence: { column: m.key, value: best.value, z: best.z, rowIndex: best.index, mean: stats.mean, stddev: stats.stddev },
    metadata: { detector: 'outliers', key: `outlier:${m.key}`, columns: [m.key], tone: TONE.WARN },
+   derivation: derive.zscore({
+     column: m.key, rowIndex: best.index, value: best.value,
+     mean: stats.mean, stddev: stats.stddev, threshold: 2,
+     select: { scope: 'row', rowIndices: [best.index], columns: [m.key] },
+     policy: { rule: 'Flag the record whose distance from the mean exceeds the σ threshold.',
+               params: 'threshold = 2.0σ', source: 'discovery/detectors/outliers.js' },
+     confidence: { value: Math.min(1, 0.5 + (best.z - 2) / 2),
+                   note: 'scales with distance past 2σ: min(1, 0.5 + (z − 2) / 2)' },
+   }),
  })
```

The `evidence` blob is untouched. The `derivation` restates, as structured data,
what the detector *already computed*. The prose that `pull.js` used to synthesize
now comes from the `zscore` op template (§3.4), reproduced byte-for-byte.

### 2.2 `availability` `qty:low` — the drift bug, fixed

The detector computes indices once (it was throwing them away) and records them:

```diff
- const low = vals.filter((v) => v > 0 && v <= threshold).length;
+ const lowIdx = [];
+ dataset.rows.forEach((r, i) => { const v = r[qty.key]; if (typeof v === 'number' && v > 0 && v <= threshold) lowIdx.push(i); });
+ const low = lowIdx.length;
  …
+ derivation: derive.countWhere({
+   column: qty.key, count: low, threshold, rowIndices: lowIdx,
+   select: { scope: 'subset', rowIndices: lowIdx, columns: [qty.key] },
+   policy: { rule: 'Count records at or below the low-stock line.',
+             params: `line = max(5, 10% of peak) = ${threshold}`, source: 'discovery/detectors/availability.js' },
+   confidence: { value: 1, note: 'a direct count or ordering over the snapshot — nothing estimated' },
+ }),
```

`pull.js`'s duplicated `qty:low` predicate ([pull.js:54–60](../js/render/pull.js))
is **deleted**. The status and `qty:zero` re-scans go the same way. One predicate,
one source of truth — a J-axiom correctness win, not just tidiness.

### 2.3 Migration order (golden-guarded, one detector per commit)

`extremes → central-tendency → distribution → availability → outliers`. After each,
`npm test` must stay green (§4). A detector that has not migrated yet keeps its old
`pull.js` code path via a fallback (§3.5), so the tree is always shippable.

---

## 3. Pull, Verify, Fingerprint as generic traversals

All three move into `js/derive/` and read the DAG. `pull.js` shrinks to a thin
adapter that preserves its current export signatures (so `findings.js` and
`canvas.js` do not change at all).

### 3.1 Pull — `resolveFocus` becomes a field read

```js
export function resolveFocus(d, dataset, report) {
  const ground = d.justification.supports.find((s) => s.of === 'ground');
  const rowIndices = projectWitness(ground.witness, dataset);  // fingerprint/column/group → ascending indices
  return {
    id: d.id, title: d.title, summary: d.summary,
    evidence: d.evidence,                    // ← unchanged passthrough (chips, §4)
    detector: d.metadata.detector,
    direction: d.metadata.direction ?? null,
    tone: d.metadata.tone ?? 'neutral',
    rowIndices,                              // ← projected from the witness, not re-scanned
    columns: witness.fields,
    scope: scopeOf(witness),                 // derived from witness kind
  };
}
```

No `switch`. The whole [pull.js:41–75](../js/render/pull.js) ladder is gone. The
witness is semantic (J); `projectWitness` is the renderer's concern and yields
ascending indices to match today's re-scan order byte-for-byte (§4).

**One traversal, all tiers.** The Pull is a recursion over `justification.supports`:
a `ground` support projects to rows (above); a `claim` support recurses into the
referenced Claim. So pulling a Decision walks Decision → its Relationship claims →
their Discovery claims → the ground witnesses → cells → snapshot as one chain,
with no tier-specific code. Phase 1 only ever encounters `ground` supports; the
`claim` branch is written but unexercised until the reasoning tiers migrate.

```js
export function* pull(claim, claimById) {          // depth-first descent to ground
  yield claim;
  for (const s of claim.justification.supports) {
    if (s.of === 'claim') yield* pull(claimById(s.claimId), claimById);
    else yield { ground: s.witness };              // terminates at fingerprinted cells
  }
}
```

### 3.2 Fingerprint — identity walk + snapshot binding

```js
// Procedure identity — snapshot-free, values never enter.
export function nodeId(nodes, id, memo = {}) {
  if (memo[id]) return memo[id];
  const n = nodes[id];
  const inputs = (n.inputs ?? []).map((i) => nodeId(nodes, i, memo)).join(',');
  const pi = n.kind === 'param' ? canon(n.value) : '';        // only π folds a value in
  return (memo[id] = hash(`${n.kind}:${n.op ?? n.stat ?? n.column ?? ''}:${inputs}:${pi}`));
}
export const procedureFingerprint = (d) => nodeId(d.derivation.nodes, d.derivation.root);
export const resultFingerprint = (d, snap) => hash(`${procedureFingerprint(d)}:${snap.fingerprint}`);
```

`snapshotOf`/`rowFingerprint` are unchanged and anchor the leaves. Today's snapshot
fingerprint is preserved verbatim; both per-finding fingerprints are *new* (Phase 2).

### 3.3 Verify — evaluate + recompute, no detector knowledge, no trusted values

```js
const OPS = { count, countWhere, zscore, share, exceeds, health, mean, median, stddev, sum, distinct, min, max };
export function verifyNode(nodes, values, id) {
  const n = nodes[id];
  if (n.kind === 'cell' || n.kind === 'column' || n.kind === 'param') return true; // ground
  const recomputed = OPS[n.op ?? n.stat](n.inputs.map((i) => values[i]));
  return canon(recomputed) === canon(values[id]) && n.inputs.every((i) => verifyNode(nodes, values, i));
}
// values = evaluate(nodes, snapshot) — recomputed from ground, never read off the node.
```

Verification is now a real operation on structure — a capability we do not have
today. `OPS` is the same closed algebra the projector uses.

### 3.4 Presentation — dispatch on op kind (closed), not detector (open)

`explain` and the derivation string become projections keyed by `op`/`stat`:

```js
const FORMULA = {
  zscore:  (n, get) => `z = |${num(get(n,0))} − ${num(get(n,1))}| / ${num(get(n,2))} = ${n.value.toFixed(1)}σ  (> 2.0σ)`,
  extreme: (n, get) => `${n.op}(${n.column}) over ${n.count} values = ${num(n.value)}`,
  // …one entry per op. ~8 total, closed.
};
export const derivationString = (d) => FORMULA[d.derivation.nodes[d.derivation.root].op](/* … */);
```

This *looks* like a switch, and it is a lookup — but keyed on the **finite op
algebra**, not the open detector set. Ten new detectors that all rank, count, or
compare add **zero** entries. Only a genuinely new *kind of math* adds one. That
is the structural difference from today's `switch(detector)`.

`policy` and `confidence.note` are **not** projected — the detector authors them
(it owns π), and `provenanceOf` just reads them back.

### 3.5 Adapter + fallback

`pull.js` keeps its exports (`resolveFocus`, `explain`, `provenanceOf`,
`snapshotOf`, `rowFingerprint`, `applyFocus`, `buildReport`) and delegates:
`if (d.derivation) return fromGraph(d); else return legacy(d);`. The legacy branch
is the current code, retired detector-by-detector as §2.3 proceeds, then the whole
fallback is deleted. `findings.js`/`canvas.js` never learn any of this happened.

---

## 4. How today's behavior stays byte-for-byte identical

The golden tests capture, per fixture, the **output** of `resolveFocus`,
`explain`, `provenanceOf`, `snapshotOf`, plus the finding fields. Byte-for-byte =
those captures do not change. Three guarantees make that hold:

1. **`evidence` is passed through untouched.** `findings.js:98` renders the blob
   directly as chips (`Object.entries(focus.evidence)`), so key set and insertion
   order are observable. We do **not** derive chips from the graph in this phase;
   `resolveFocus().evidence` stays `d.evidence`. Zero chip drift by construction.

2. **The selection is asserted equal, not just swapped.** The recorded
   `rowIndices` must equal what the old re-scan produced. The golden already pins
   today's `rowIndices` for every scope (row/subset/group/dataset) across four
   fixtures — including the `qty:zero`/`qty:low` branches. If a detector records a
   different set, the golden goes red immediately. (If it goes red because the
   *old* code had a latent drift bug, that is a real finding, surfaced for review
   — not an auto-update.)

3. **Prose is moved, not rewritten.** The op templates in §3.4 are copied
   character-for-character from `pull.js`'s current strings — same `formatNumber`,
   same `.toFixed(1)`, same `"  (> 2.0σ)"` suffix. `policy`/`confidence` are
   read from detector-authored fields that copy today's literals.

**Staging keeps "byte-for-byte" honest:**

- **Phase 1 (behavior-preserving):** introduce the graph internally; reproduce the
  *exact* current shapes — no new fields in `provenanceOf`'s return, no per-finding
  fingerprint exposed. Golden stays **untouched** through the whole phase. This is
  the proof that the refactor changed nothing.
- **Phase 2 (new capability, separate approval):** expose per-finding fingerprints
  and a Verify affordance in the trace. This *intentionally* adds fields → one
  reviewed `npm run test:update`. Different commit, different diff, its own review.
- **Phase 3 (optional):** retire the flat `evidence` blob, projecting chips from
  the graph. Also an intended, reviewed golden diff.

`#4` is satisfied strictly at Phase 1: the derivation graph ships with the golden
never changing a byte.

---

## 5. Alternatives considered and rejected

### Alt A — Dispatch table keyed by detector (strategy pattern)
Give each detector a registered `{ resolveFocus, explain, provenance }` trio;
`pull.js` calls `handlers[detector].explain(d)`. Removes the literal `switch`.
**Rejected:** it still dispatches on the **open** detector vocabulary — the thing
that grows per feature — so the coupling the bootstrap names is relocated, not
removed. It gives no content-addressed intermediates, no generic Verify, no
Fingerprint of the computation. And unless each handler *also* records indices, the
`resolveFocus` row re-scan (the actual bug surface) survives. It is the cheap
refactor that satisfies neither J ("traversable chain to ground") nor P
("verification/fingerprinting as derived behavior").

### Alt B — General expression engine (S-expressions + universal pretty-printer)
Detectors return arbitrary expression trees; a single universal printer renders
all prose; a generic evaluator verifies.
**Rejected on two counts.** (1) Byte-for-byte is effectively impossible: today's
strings are idiosyncratic (`"count(status classified “unavailable”) = 2 of 8"`),
so a universal printer needs per-shape templates — which *is* the op-keyed
projector of §3.4, reached by a longer road. The generality buys nothing the
closed op-algebra doesn't. (2) It is exactly the "unnecessary infrastructure" the
project forbids: a typechecker/evaluator for an open algebra, when we have **eight**
operations. Over-generalization also invites nondeterminism (float formatting,
key ordering) that threatens P.

### Alt C — Store rendered strings + indices only (no typed op node)
Detector emits `{ because, formula, policy, confidence, select }` as finished
strings plus recorded indices; drop the structured graph.
**Rejected:** this *does* eliminate the switches and *does* fix the re-scan drift —
it is the tempting 80% — but it cannot **verify** or **fingerprint the
computation**, only re-run the whole detector. You would be fingerprinting prose.
That fails P's core promise ("reproducible output of an explicit procedure, that
you can check"). The chosen design keeps the typed `op` node precisely so Verify
and Fingerprint operate on machine-checkable structure, while *also* carrying the
strings for the UI. Alt C is the chosen design with the load-bearing half removed.

---

## 6. What I need agreement on before writing code

1. **The node model (§1.1)** — five node kinds, content-addressed, leaves reuse
   the existing fingerprint hash. Enough, or do you want intermediates modeled
   differently?
2. **The op algebra (§3.4)** — presentation dispatches on ~8 ops, closed. Agreed
   that this is meaningfully different from `switch(detector)` and worth the
   templates?
3. **The staging (§4)** — Phase 1 ships with the golden **byte-identical**; new
   capabilities (fingerprint, Verify) are deliberately deferred to Phase 2 with
   their own reviewed diff. Agreed that "byte-for-byte" means Phase 1 only?
4. **File layout** — new `js/derive/` (`build.js`, `graph.js`, `project.js`);
   `js/render/pull.js` becomes a thin adapter. No change to detectors' public shape
   beyond one added `derivation` field.

On agreement I implement Phase 1, detector by detector, golden green at every step.

---

## 7. Tiers, and why Claim ← Support\* is the stopping point

**Is the Discovery DAG just a specialization of Claim ← Support\*?** Yes. A Discovery
is the case where every support is `ground` and the justification carries an
arithmetic `opGraph`. Relationship and Decision are the same Claim shape with
`claim` supports and a rule for a policy.

**Is there an even cleaner model?** Yes — collapse everything to **one node kind**:
a derivation node = `(procedure, inputs)`. Then `mean`, a Discovery, a Relationship
and a Decision are all nodes; Support = inputs; Verify = re-run the node's
procedure on its inputs (arithmetic `OPS` is just the pure-function subset);
Pull/Fingerprint are one recursion. It genuinely unifies all three tiers.

**Why we stop at Claim ← Support\* and do *not* adopt the collapse now:**

1. **The collapse is a strict refinement, not an alternative.** A Claim is already
   "a node with inputs," so choosing this frame forfeits nothing — we can merge
   op-nodes and claims into one kind later with **no rewrite**, once the reasoning
   tiers are real code instead of imagined requirements.
2. **The future rewrite is already eliminated here.** One traversal, one fingerprint
   scheme, one Verify, and today's `supporting[]` arrays fold into `claim` supports.
   There is no second provenance system. That was the whole risk; it is closed.
3. **The collapse would cost Phase 1 for no present gain.** It forces the witness to
   be restructured into `filter` nodes and dissolves the Discovery-claim boundary —
   more churn and more byte-for-byte risk — to buy elegance invisible until a
   Relationship is pulled. That is the premature over-unification rejected as Alt B
   (§5), reintroduced one level up.

So: **Claim ← Support\* as the frame, the arithmetic op-DAG living inside Discovery,
the collapse documented as a future refinement this frame is forward-compatible
with.** Minimal change today, no rewrite tomorrow, cleaner model still reachable.

### The eventual Decision → snapshot chain (dormant in Phase 1)

```
Decision "Investigate concentration risk"          tier: decision
  └─ support {of:'claim'} → Relationship "Revenue is concentrated"   tier: relationship
       └─ support {of:'claim'} → Discovery "Top category by revenue"  tier: discovery
            └─ support {of:'ground', witness: group(Category='Furniture')}
                 └─ opGraph: share(groupSum(Furniture), grandSum) → cells → snapshot f7d02086
```

One `pull()` recursion (§3.1) walks this whole chain to the same fingerprinted
snapshot every Discovery already terminates at. J holds end to end; P holds at every
hop (re-run the claim's procedure on the same supports ⇒ same claim). No tier is
special-cased. Phase 1 builds only the bottom two lines; the frame already admits
the top two.

**Architecture frozen at this revision.** Next action is code: `js/derive/`, then
`extremes` on the frame above, golden green at every step.

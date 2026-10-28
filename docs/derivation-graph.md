# The derivation graph

Specification of how Ellery represents, traverses and verifies a conclusion.
Implemented in `js/derive/`, consumed by `js/render/pull.js`.

## The frame: Claim ← Support*

Every conclusion is a **Claim**. A Claim is justified by **Supports**; a Support
is either **ground** (terminating at fingerprinted snapshot cells) or another
**Claim**. Recursion bottoms out at the snapshot.

```
Claim         = { id, title, summary, confidence, importance, evidence, metadata, justification }

Justification = { supports: Support[], opGraph: { root, nodes }, policy, confidence, asserts }

Support = { of:'ground', witness }   // Discovery tier
        | { of:'claim',  id }        // Relationship tier
```

Two tiers exist:

- **Discovery** (`js/discovery/`) — supports are all `ground`; the op graph is
  arithmetic over cells.
- **Relationship** (`js/relationships/`) — supports are `claim`; the op graph
  composes the values of supporting claims.

Pull, Verify and Fingerprint recurse over `supports`, so one traversal handles
both tiers. Nothing dispatches on the detector that produced a claim.

## Node identity vs. evaluated value

A node's `id` hashes its kind, its operand ids, and any policy constant. It never
hashes a data-derived value. The id therefore names the *computation* and is
independent of the data; values come only from `evaluate(nodes, ctx, root)`.

Node kinds:

| kind | role |
| --- | --- |
| `cell` | one record's cell, addressed by row fingerprint — ground |
| `column` | a column vector — ground |
| `param` | a policy constant (π); its value **is** part of its identity |
| `stat` | `mean`, `median`, `stddev`, `min`, `max`, `distinct` |
| `reduce` | an operation over inputs (see the algebra below) |
| `claim` | another Claim's value, or a field of it |
| `record` | a named struct — the asserted shape of a claim |

`param` folds its value into identity because a threshold of 2.0 and one of 2.5
are different procedures. Everything else excludes values, so structurally
identical computations intern to the same node — across detectors and across
snapshots.

A `record` may name a `narrator` field, whose node supplies the derivation prose.
That lets a claim assert more without its derivation line degrading to `{…}`.

A `claim` leaf projects from a small, explicit domain: the support's re-derived
value, a named field of it, or `@fields` — the fields its witness cites, which is
recorded structure rather than a measurement.

**A `claim` leaf evaluates to the support's re-derived value, never its stored
`asserts`.** Reading the stored value would make composition trust the number
under test.

## The operation algebra

Closed and small. Presentation and verification both dispatch on these keys.
An op is added only when a new *kind of math* appears, never per detector.

```
arithmetic   max min mean median stddev distinct
shaped       describe groupLargest groupShare healthShare
counting     count countEqual countBetween
domain       classify            (status vocabulary, via the profile)
outlier      zscore exceeds
composition  ratio atLeast below list sharedFields
struct       record
```

## Witness — what a claim stands on

A ground support carries a **witness**: which records support the conclusion,
addressed semantically rather than by row position.

```
Witness = { support, fields:[column] }
  support = { of:'record',  id }            // one record, by fingerprint
          | { of:'records', ids }           // an enumerated set
          | { of:'group',   column, value } // a category group
          | { of:'column',  column }        // the whole field
```

The witness is not the op graph's leaf cone. `availability status:critical`
*reads* the whole Status column but is *supported by* only the critical rows;
the detector states which. Row indices are a render-time projection computed by
`projectWitness`, never stored — so a claim survives the snapshot being
reordered. `scope` is derived from the witness kind.

## Verify

```
verify(claim, ctx) → { ok, claimId,
                       local:    { ok, expected, actual, reason },
                       supports: [{ claimId, ok, reason, detail }] }
```

Three checks:

1. **Resolvable** — every cited support exists in this snapshot.
2. **Recursive** — every claim support verifies. Ground is the floor: a cell
   either is in the snapshot or is not.
3. **Local** — the re-derived root value deep-equals `asserts`.

Failure modes, distinguishable in the result: `missing-support`,
`support-failed`, `local-mismatch`.

Step 3 compares the **full** asserted struct, not just a predicate outcome. A
rule that fires on `share >= 35` while stating "69%" must fail when the real
share is 64 — the predicate still holds, but the claim is wrong. For the same
reason `asserts` must carry every quantity the summary states.

Verification proves that a claim **follows from the supports it cites**. It does
not prove those were the right supports to cite — that would mean re-running rule
code, which is the coupling this design removes. Selection is recorded, never
re-executed.

## Fingerprints

- **Procedure** = the root node id. Snapshot-free: it stays the same when the
  data changes.
- **Result** = `hash(rootId + snapshotFingerprint)`. Binds the procedure to this
  snapshot.

Together they distinguish "the data changed" from "the reasoning changed."
Snapshot, row and cell fingerprints live in `js/derive/fingerprint.js` (FNV-1a,
32-bit, dependency-free).

## Determinism

The truth path is a pure function of the snapshot and the policy. It must not
contain `Date.now()`, `Math.random()`, unpinned locale formatting, network calls,
model calls, or iteration whose order depends on anything but the data.

Float arithmetic is order-sensitive, so ops that mirror `discovery/profile.js`
(sorted input, same summation order) must stay **bit-identical** to it, not
merely equivalent. Map and object iteration in the truth path is sorted
explicitly — ties broken by key ascending.

`tools/test/` enforces this: golden baselines pin the full truth path, invariants
assert every claim is justified and verifiable, and the contract tests cover the
failure modes and compositional propagation.

## Not implemented

A Decision tier was prototyped and removed. It would attach as `{of:'claim'}`
supports over Relationships and would need no new machinery — which is the return
on this design, whether or not that tier ever exists.

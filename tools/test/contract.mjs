// Contract tests for the cross-tier derivation: Claim ← Support*.
//
// The golden runner pins *output*. This pins *behaviour under damage* — the
// things a snapshot diff cannot express: that verification fails when it should,
// with the right reason, and that composition never trusts a stored number.
//
//   node tools/test/contract.mjs
//
// Zero dependencies. Assertions only; no framework.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ingest } from '../../server/ingest/normalize.js';
import { runDiscovery } from '../../js/discovery/index.js';
import { runRelationships } from '../../js/relationships/index.js';
import { verify } from '../../js/derive/graph.js';
import { snapshotOf, pullClaimChain } from '../../js/render/pull.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'retail-inventory.csv');

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok       ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`FAIL     ${name}\n           ${err.message}`);
  }
}

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const eq = (actual, expected, what) =>
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );

/* ---------- The world under test ---------- */

function world() {
  const dataset = ingest(fs.readFileSync(FIXTURE, 'utf8')).dataset;
  const report = runDiscovery(dataset);
  const relationships = runRelationships(report).relationships;
  const index = new Map();
  for (const d of report.discoveries) index.set(d.id, d);
  for (const r of relationships) index.set(r.id, r);
  const ctx = { dataset, profile: report.profile, claimById: (id) => index.get(id) || null };
  const rel = relationships.find((r) => r.metadata.key === 'concentration:category');
  return { dataset, report, relationships, index, ctx, rel };
}

// Rebuild a claim with a patched justification, leaving everything else intact.
const patch = (claim, j) => ({ ...claim, justification: { ...claim.justification, ...j } });

/* ---------- 1. The reference Relationship exists and is well-formed ---------- */

check('concentration carries a composed justification', () => {
  const { rel } = world();
  assert(rel, 'concentration:category relationship was not produced');
  const j = rel.justification;
  assert(j, 'no justification');
  eq(j.supports, [{ of: 'claim', id: 'distribution:top-by-metric:Category:Revenue' }], 'supports');
  assert(j.opGraph && j.opGraph.root, 'no composition graph');
});

check('asserts carries every stated quantity, not just the predicate', () => {
  const { rel } = world();
  const a = rel.justification.asserts;
  eq(Object.keys(a).sort(), ['group', 'meets', 'share'], 'assert keys');
  // The summary states the group and the share; both must be assertions.
  assert(rel.summary.includes(String(a.group)), 'summary states a group that is not asserted');
  assert(rel.summary.includes(String(a.share)), 'summary states a share that is not asserted');
});

/* ---------- 2. Happy path ---------- */

check('happy path: relationship verifies through its support', () => {
  const { rel, ctx } = world();
  const r = verify(rel, ctx);
  assert(r.ok, `expected ok, got ${JSON.stringify(r.local)}`);
  eq(r.claimId, rel.id, 'claimId');
  eq(r.local.ok, true, 'local.ok');
  eq(r.supports.length, 1, 'support count');
  eq(r.supports[0].ok, true, 'support ok');
  eq(r.supports[0].reason, null, 'support reason');
});

/* ---------- 3. The three failure modes ---------- */

check('failure: missing-support', () => {
  const { rel, ctx } = world();
  const r = verify(rel, { ...ctx, claimById: () => null });
  assert(!r.ok, 'expected failure');
  eq(r.supports[0].reason, 'missing-support', 'reason');
});

check('failure: support-failed (upstream broke, cells moved)', () => {
  const { rel, ctx, dataset } = world();
  // Change the data so the supporting Discovery no longer reproduces its claim.
  const tampered = { ...dataset, rows: dataset.rows.map((r) => (r.Category === 'Furniture' ? { ...r, Revenue: 100 } : r)) };
  const r = verify(rel, { ...ctx, dataset: tampered });
  assert(!r.ok, 'expected failure');
  eq(r.supports[0].reason, 'support-failed', 'reason');
});

check('failure: local-mismatch', () => {
  const { rel, ctx } = world();
  const lying = patch(rel, { asserts: { ...rel.justification.asserts, share: 95 } });
  const r = verify(lying, ctx);
  assert(!r.ok, 'expected failure');
  eq(r.local.reason, 'local-mismatch', 'reason');
});

/* ---------- 4. Anti-tautology ----------
   The whole point. The support still verifies and the predicate still holds —
   only the stated number is wrong. A contract that checked "supports verify AND
   predicate true" would pass this, and the claim would be free to lie. */

check('anti-tautology: share 69 → 95 fails even though support + predicate hold', () => {
  const { rel, ctx } = world();
  const lying = patch(rel, { asserts: { ...rel.justification.asserts, share: 95 } });
  const r = verify(lying, ctx);

  assert(r.supports[0].ok, 'support should still verify — that is what makes this test meaningful');
  eq(r.local.actual.meets, true, 'predicate should still evaluate true');
  eq(r.local.expected.share, 95, 'the claim states 95');
  eq(r.local.actual.share, 69, 're-derived share');
  assert(!r.ok, 'verification must still fail');
  eq(r.local.reason, 'local-mismatch', 'reason');
});

/* ---------- 5. Claim leaves re-derive, never read stored asserts ----------
   Corrupt the SUPPORT's stored asserts while leaving the data untouched. If the
   composition read that stored value, the relationship's local result would
   follow it. It must not: the true value is recomputed from cells. */

check('composition uses the re-derived support value, not its stored asserts', () => {
  const { rel, index, ctx } = world();
  const supportId = rel.justification.supports[0].id;
  const corrupted = patch(index.get(supportId), {
    asserts: { value: 'Furniture', total: 1150, share: 3 }, // a lie, in the store only
  });
  const patchedIndex = new Map(index);
  patchedIndex.set(supportId, corrupted);

  const r = verify(rel, { ...ctx, claimById: (id) => patchedIndex.get(id) || null });

  // Local composition still sees the truth from the cells...
  eq(r.local.actual.share, 69, 'local re-derived share (would be 3 if it read stored asserts)');
  eq(r.local.ok, true, 'local composition unaffected by the corrupted store');
  // ...while the support itself is correctly reported as broken.
  eq(r.supports[0].ok, false, 'support must fail — its stored assert no longer matches its own ground');
  eq(r.supports[0].reason, 'support-failed', 'reason');
  assert(!r.ok, 'overall must fail because a cited support does not verify');
});

/* ---------- 6. The actual chain, to fingerprinted ground ---------- */

check('pull crosses Relationship → Discovery → ground → snapshot', () => {
  const { rel, report, dataset } = world();
  const chain = pullClaimChain(rel, report);

  const claims = chain.filter((s) => s.claim).map((s) => s.claim.id);
  eq(claims, [rel.id, 'distribution:top-by-metric:Category:Revenue'], 'claim chain');

  const ground = chain.filter((s) => s.ground);
  eq(ground.length, 1, 'ground steps');
  eq(ground[0].ground.support, { of: 'group', column: 'Category', value: 'Furniture' }, 'ground witness');

  // The supporting claim is exposed AS a claim, at greater depth — not flattened
  // into a relationship-specific evidence blob.
  const support = chain.find((s) => s.claim && s.claim.id !== rel.id);
  assert(support.depth === 1, 'supporting claim should be one level down');
  assert(support.claim.justification.opGraph, 'supporting Discovery keeps its own arithmetic graph');

  // And the floor is the fingerprinted snapshot.
  const snap = snapshotOf(dataset);
  assert(/^[0-9a-f]{8}$/.test(snap.fingerprint), `snapshot fingerprint looks wrong: ${snap.fingerprint}`);
});

check('pull surfaces an unresolvable support instead of silently dropping it', () => {
  const { rel } = world();
  const chain = [...pullClaimChain(rel, { discoveries: [], profile: null })].filter((s) => s.missing);
  eq(chain.length, 1, 'missing steps');
  eq(chain[0].missing, 'distribution:top-by-metric:Category:Revenue', 'missing id');
});

/* ---------- 7. The Discovery tier is untouched by all of this ---------- */

check('every Discovery still verifies (ground tier unaffected)', () => {
  const { report, dataset, ctx } = world();
  for (const d of report.discoveries) {
    const r = verify(d, ctx);
    assert(r.ok, `${d.id} no longer verifies`);
    eq(r.supports, [], `${d.id} should have no claim supports`);
  }
  assert(report.discoveries.length > 0, 'no discoveries produced');
  assert(dataset.rows.length === 8, 'fixture changed shape');
});

/* ---------- 8. Cross-tier regression: failure propagates by composition ----------
   One mechanism, no tier-specific failure handling:
     ground moves → Discovery stops reproducing → Relationship fails. */

const CROSS = path.join(HERE, 'fixtures', 'cross-tier.csv');

function crossWorld(mutate = (rows) => rows) {
  const base = ingest(fs.readFileSync(CROSS, 'utf8')).dataset;
  const dataset = { ...base, rows: mutate(base.rows.map((r) => ({ ...r }))) };
  const report = runDiscovery(dataset);
  const relationships = runRelationships(report).relationships;
  const index = new Map();
  for (const d of report.discoveries) index.set(d.id, d);
  for (const r of relationships) index.set(r.id, r);
  return {
    dataset,
    report,
    relationships,
    ctx: { dataset, profile: report.profile, claimById: (id) => index.get(id) || null },
  };
}

check('cross-tier: every relationship in the fixture verifies end to end', () => {
  const { relationships, ctx } = crossWorld();
  assert(relationships.length >= 4, `expected a rich fixture, got ${relationships.length} relationships`);
  for (const r of relationships) {
    assert(r.justification, `${r.id} has no justification`);
    assert(verify(r, ctx).ok, `${r.id} did not verify`);
  }
});

check('cross-tier: every chain terminates at ground', () => {
  const { relationships, report } = crossWorld();
  for (const r of relationships) {
    const chain = pullClaimChain(r, report);
    assert(chain.some((s) => s.ground), `${r.id} never reaches ground`);
    assert(!chain.some((s) => s.missing), `${r.id} has an unresolved support`);
    // Every claim in the chain below the root is a real claim, not a blob.
    for (const s of chain.filter((x) => x.claim)) assert(s.claim.id, 'claim step without an id');
  }
});

check('cross-tier: a corrupted ground cell fails Discovery AND the Relationship above it', () => {
  // The claims are the ones analysis produced; the DATA has since moved under
  // them. Re-running discovery on the new data would produce new, self-consistent
  // claims — that is not the scenario. This is: stored claims, changed ground.
  const clean = crossWorld();
  const moved = crossWorld((rows) => rows.map((r) => (r.Category === 'Furniture' ? { ...r, Revenue: 10 } : r)));
  const ctx = { ...clean.ctx, dataset: moved.dataset };

  const rel = clean.relationships.find((r) => r.metadata.key === 'concentration:category');
  assert(rel, 'no concentration:category in fixture');

  const r = verify(rel, ctx);
  assert(!r.ok, 'relationship should fail when its ground moved');
  eq(r.supports[0].reason, 'support-failed', 'support reason');
  assert(!r.supports[0].detail.local.ok, 'the Discovery itself must be the failing link');

  // The failure is compositional: the Discovery broke first, and the Relationship
  // broke because of it — one mechanism, not a tier-specific check.
  assert(!r.local.ok, 'the relationship-level assertion should also stop matching');
});

check('cross-tier: corrupting a Relationship\'s stored asserts gives local-mismatch, not trust', () => {
  const { relationships, ctx } = crossWorld();
  for (const rel of relationships) {
    const a = rel.justification.asserts;
    // Perturb one numeric field of the assertion; the ground is untouched.
    const numericKey = Object.keys(a).find((k) => typeof a[k] === 'number');
    if (!numericKey) continue;
    const tampered = { ...rel, justification: { ...rel.justification, asserts: { ...a, [numericKey]: a[numericKey] + 1 } } };
    const r = verify(tampered, ctx);
    assert(!r.ok, `${rel.id}: tampered assertion was accepted`);
    eq(r.local.reason, 'local-mismatch', `${rel.id} reason`);
    assert(
      r.supports.every((s) => s.ok),
      `${rel.id}: supports should still be fine — the lie is local`
    );
  }
});

/* ---------- 9. fragile-outlier thresholds on z, not confidence ---------- */

check('fragile-outlier composes over z, never over a confidence score', () => {
  const dataset = ingest(fs.readFileSync(path.join(HERE, 'fixtures', 'warehouse-stock.csv'), 'utf8')).dataset;
  const report = runDiscovery(dataset);
  const rels = runRelationships(report).relationships;
  const index = new Map();
  for (const d of report.discoveries) index.set(d.id, d);
  for (const r of rels) index.set(r.id, r);
  const ctx = { dataset, profile: report.profile, claimById: (id) => index.get(id) || null };

  const fo = rels.find((r) => r.type === 'needs-investigation');
  assert(fo, 'fragile-outlier did not fire on the warehouse fixture');
  assert(verify(fo, ctx).ok, 'fragile-outlier does not verify');

  // The assertion is factual (z + label), not a presentational score.
  assert(typeof fo.justification.asserts.z === 'number', 'z must be asserted');
  assert(!('confidence' in fo.justification.asserts), 'confidence must not be part of the assertion');

  // And the supporting outlier asserts the z it is thresholded on.
  const support = index.get(fo.justification.supports[0].id);
  assert(typeof support.justification.asserts.z === 'number', 'outlier must assert z');
  eq(fo.justification.asserts.z, support.justification.asserts.z, 'z must come from the support');
});

/* ---------- Result ---------- */

console.log('');
if (failures.length) {
  console.log(`${failures.length} contract test(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`All ${passed} contract tests pass. Cross-tier derivation holds.`);
process.exit(0);

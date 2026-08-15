// Golden-output tests for the truth path — the executable form of axiom P:
// same evidence + same policy → same conclusion. Each fixture is raw input run
// through the real pipeline (ingest → discovery → snapshot → Pull), captured as
// a canonical JSON snapshot, and compared byte-for-byte against a committed
// golden file. The engine is deterministic (no clock, no randomness), so any
// diff here is a real change in what Ellery concludes — never noise.
//
//   node tools/test/run.mjs            check against golden, exit 1 on any drift
//   node tools/test/run.mjs --update   rewrite golden from current output
//
// Zero dependencies, zero build. Adding a fixture = drop a file in ./fixtures.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ingest } from '../../server/ingest/normalize.js';
import { runDiscovery } from '../../js/discovery/index.js';
import { runRelationships } from '../../js/relationships/index.js';
import {
  snapshotOf,
  resolveFocus,
  explain,
  provenanceOf,
  fingerprintsOf,
  verifyClaim,
} from '../../js/render/pull.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const GOLDEN = path.join(HERE, 'golden');
const UPDATE = process.argv.includes('--update');

// Stable JSON: keys sorted recursively, functions and undefined dropped. Two
// runs on the same data produce byte-identical text, so diffs are meaningful.
function canonical(value) {
  return `${JSON.stringify(value, sortedReplacer(), 2)}\n`;
}
function sortedReplacer() {
  return function replace(_key, val) {
    if (typeof val === 'function') return undefined;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce((acc, k) => {
          acc[k] = val[k];
          return acc;
        }, {});
    }
    return val;
  };
}

// The full truth-path capture for one fixture. Everything a Pull can reach from
// a finding is recorded, so a refactor of pull.js is pinned to current output.
function capture(raw) {
  const ing = ingest(raw);
  if (!ing.ok) return { ok: false, warnings: ing.warnings };

  const dataset = ing.dataset;
  const report = runDiscovery(dataset);
  const snapshot = snapshotOf(dataset);

  const discoveries = report.discoveries.map((d) => {
    const focus = resolveFocus(d, dataset, report);
    return {
      id: d.id,
      type: d.type,
      title: d.title,
      summary: d.summary,
      importance: d.importance,
      confidence: d.confidence,
      evidence: d.evidence,
      metadata: d.metadata,
      focus,
      explain: explain(focus, d, dataset, report),
      provenance: provenanceOf(d, report, dataset),
      // Identity and verification: the procedure fingerprint is snapshot-free,
      // the result binds it to this snapshot, and `verified` is a real
      // recomputation from ground — a false here is a broken truth path.
      fingerprints: fingerprintsOf(d, snapshot),
      verified: verifyClaim(d, dataset, report).ok,
    };
  });

  // The Relationship tier. Only migrated rules carry a justification; capturing
  // `supports` and `verified` pins that a composed claim still re-derives from
  // the Discoveries it cites, all the way down to cells.
  const relationships = runRelationships(report).relationships.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    summary: r.summary,
    supporting: r.supporting,
    evidence: r.evidence,
    composed: r.justification
      ? {
          supports: r.justification.supports,
          asserts: r.justification.asserts,
          policy: r.justification.policy,
          verified: verifyClaim(r, dataset, report).ok,
        }
      : null,
  }));

  return {
    ok: true,
    format: ing.dataset.meta.format,
    warnings: ing.warnings,
    domain: report.domain,
    meta: report.meta,
    snapshot,
    discoveries,
    relationships,
  };
}

// First differing line between two texts — a cheap, readable diff.
function firstDiff(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i += 1) {
    if (la[i] !== lb[i]) {
      return `  line ${i + 1}\n    golden:  ${la[i] ?? '<eof>'}\n    current: ${lb[i] ?? '<eof>'}`;
    }
  }
  return '  (lengths differ but no line mismatch found)';
}

const fixtures = fs
  .readdirSync(FIXTURES)
  .filter((f) => /\.(csv|json|txt)$/i.test(f))
  .sort();

/* ---------- Invariants ----------
   Checked on every run, independent of the golden files. These are the rules a
   finding must satisfy to be honest at all; a golden diff would only tell us
   the output changed, not that a claim became uncheckable. */

const INVARIANTS = [
  {
    name: 'every finding carries a justification',
    holds: (d) => !!d.justification,
    why: 'without one, the Pull has nothing to descend through',
  },
  {
    name: 'every justification asserts a value',
    // Omitting `asserts` makes verification compare against undefined, which
    // fails closed — honest, but it renders as a broken finding rather than
    // the authoring mistake it actually is. Catch it here instead.
    holds: (d) => d.justification && 'asserts' in d.justification && d.justification.asserts !== undefined,
    why: 'verification would silently compare against undefined and always fail',
  },
  {
    name: 'every finding verifies against its own evidence',
    holds: (c, ctx) => verifyClaim(c, ctx.dataset, ctx.report).ok,
    why: 'the claim does not reproduce from the ground it cites',
  },
];

function checkInvariants(raw) {
  const ing = ingest(raw);
  if (!ing.ok) return [];
  const dataset = ing.dataset;
  const report = runDiscovery(dataset);
  const rels = runRelationships(report);
  const broken = [];

  // Every Discovery must be complete. Relationships are mid-migration, so only
  // the ones already carrying a justification are held to the contract — but
  // those are held to exactly the same one, which is the point of Claim ← Support*.
  const claims = [
    ...report.discoveries.map((c) => ({ claim: c, required: true })),
    ...rels.relationships.map((c) => ({ claim: c, required: false })),
  ];

  for (const { claim, required } of claims) {
    if (!required && !claim.justification) continue;
    for (const inv of INVARIANTS) {
      let ok;
      try {
        ok = inv.holds(claim, { dataset, report, rels });
      } catch (err) {
        ok = false;
        inv.lastError = err.message;
      }
      if (!ok) broken.push(`${claim.id} — ${inv.name} (${inv.why})`);
    }
  }
  return broken;
}

// Invariants run to completion BEFORE anything is compared or written. A
// --update that wrote some files and then aborted would leave the golden set
// half-blessed by code we already know is broken.
let brokenInvariants = 0;
for (const file of fixtures) {
  const broken = checkInvariants(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));
  if (broken.length) {
    brokenInvariants += broken.length;
    console.log(`INVARIANT  ${file.replace(/\.[^.]+$/, '')}`);
    for (const b of broken) console.log(`    ${b}`);
  }
}
if (brokenInvariants) {
  console.log(`\n${brokenInvariants} invariant violation(s). These are authoring errors, not golden drift — nothing was written, and --update will not clear them.`);
  process.exit(1);
}

let failed = 0;
let updated = 0;

for (const file of fixtures) {
  const name = file.replace(/\.[^.]+$/, '');
  const raw = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
  const current = canonical(capture(raw));
  const goldenPath = path.join(GOLDEN, `${name}.json`);

  if (UPDATE) {
    fs.writeFileSync(goldenPath, current);
    updated += 1;
    console.log(`updated  ${name}`);
    continue;
  }

  if (!fs.existsSync(goldenPath)) {
    failed += 1;
    console.log(`MISSING  ${name} — no golden file (run with --update)`);
    continue;
  }

  const golden = fs.readFileSync(goldenPath, 'utf8');
  if (golden === current) {
    console.log(`ok       ${name}`);
  } else {
    failed += 1;
    console.log(`DRIFT    ${name}`);
    console.log(firstDiff(golden, current));
  }
}

if (UPDATE) {
  console.log(`\n${updated} golden file(s) written.`);
  process.exit(0);
}

if (failed) {
  console.log(`\n${failed} of ${fixtures.length} fixture(s) drifted. Review the diff; if intended, re-run with --update.`);
  process.exit(1);
}
console.log(`\nAll ${fixtures.length} fixture(s) match golden · invariants hold. Truth path is stable.`);
process.exit(0);

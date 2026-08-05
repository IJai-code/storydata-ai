// Content fingerprinting of the snapshot and its records — the fingerprinted
// ground every Pull terminates at. Deterministic: no clock, no randomness, the
// fingerprint IS the promise. Extracted from pull.js so the derivation graph and
// the Pull share one implementation; pull.js re-exports snapshotOf/rowFingerprint
// unchanged, so its consumers (findings.js) import from the same place as before.

import { DISCOVERY_ENGINE_VERSION } from '../discovery/index.js';

const UNIT = '␟'; // canonical field separator, unlikely to occur in values

// Policy version for the current rule set. Marks the ruleset the detector
// constants constitute, so a snapshot can name the policy it was read under.
const POLICY_VERSION = '1.0.0';

// FNV-1a, 32-bit — small, dependency-free, stable across runs and machines.
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// One row serialized in schema order — the addressable content of that record.
function rowCanonical(dataset, row) {
  return dataset.columns.map((c) => `${c.key}=${row[c.key] ?? ''}`).join(UNIT);
}

let snapCache = { dataset: null, snapshot: null };

// The Snapshot: fingerprint + schema hash + shape. Computed once per dataset.
export function snapshotOf(dataset) {
  if (snapCache.dataset === dataset && snapCache.snapshot) return snapCache.snapshot;
  const schema = dataset.columns.map((c) => `${c.key}:${c.type}`).join(UNIT);
  const body = dataset.rows.map((r) => rowCanonical(dataset, r)).join('\n');
  const snapshot = {
    fingerprint: hash(`${schema}\n${body}`),
    schemaHash: hash(schema),
    rowCount: dataset.rows.length,
    columnCount: dataset.columns.length,
    format: dataset.meta?.format || 'unknown',
    truncated: !!dataset.truncated,
    totalRows: dataset.meta?.totalRows ?? dataset.rows.length,
    engineVersion: DISCOVERY_ENGINE_VERSION,
    policyVersion: POLICY_VERSION,
  };
  snapCache = { dataset, snapshot };
  return snapshot;
}

// A single record's content address on the snapshot.
export function rowFingerprint(dataset, index) {
  const row = dataset.rows[index];
  return row ? hash(rowCanonical(dataset, row)) : '—';
}

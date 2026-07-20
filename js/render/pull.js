// The Pull — traversal from a finding down to the exact rows and cells that
// produced it. Nothing here computes a finding; it only *selects* the rows the
// finding already points at. The Discovery report is memoized by dataset
// identity so a Pull never re-runs analysis — it is pure navigation.

import { runDiscovery, formatNumber, DISCOVERY_ENGINE_VERSION } from '../discovery/index.js';

// Re-exported so the trace formats evidence numbers with the engine's own
// deterministic formatter (keeping evidence and derivation consistent).
export { formatNumber } from '../discovery/index.js';

// Policy version for the current rule set. The thresholds themselves still live
// as constants inside the detectors (we do not rewrite the engines); this label
// marks the ruleset those constants constitute, so a finding can name the policy
// it was computed under. When thresholds become data, this moves with them.
const POLICY_VERSION = '1.0.0';

let cache = { dataset: null, report: null };

// The same deterministic report the Case File renders — reused, never recomputed.
export function buildReport(dataset) {
  if (cache.dataset === dataset && cache.report) return cache.report;
  const report = runDiscovery(dataset);
  cache = { dataset, report };
  return report;
}

// Resolve a finding to the exact rows + decisive columns behind it. This is
// selection, not analysis: single-row findings carry their rowIndex; subset and
// group findings name the column/value whose rows they summarize.
export function resolveFocus(d, dataset, report) {
  const ev = d.evidence || {};
  const key = d.metadata?.key || '';
  const detector = d.metadata?.detector;
  const profile = report.profile;
  const rows = dataset.rows;
  const idx = [];
  let columns = [];
  let scope = 'dataset';

  if (Number.isInteger(ev.rowIndex)) {
    idx.push(ev.rowIndex);
    columns = ev.column ? [ev.column] : [];
    scope = 'row';
  } else if (detector === 'availability' && ev.column && /^status:/.test(key) && profile?.classifyStatus) {
    const tone = key.endsWith('critical') ? 'critical' : 'warn';
    rows.forEach((r, i) => { if (profile.classifyStatus(r[ev.column]) === tone) idx.push(i); });
    columns = [ev.column];
    scope = 'subset';
  } else if (detector === 'availability' && ev.column && key === 'qty:zero') {
    rows.forEach((r, i) => { if (r[ev.column] === 0) idx.push(i); });
    columns = [ev.column];
    scope = 'subset';
  } else if (detector === 'availability' && ev.column && key === 'qty:low') {
    rows.forEach((r, i) => {
      const v = r[ev.column];
      if (typeof v === 'number' && v > 0 && v <= ev.threshold) idx.push(i);
    });
    columns = [ev.column];
    scope = 'subset';
  } else if (ev.categoryColumn && ev.value != null) {
    // Top category by metric — the rows in that group.
    rows.forEach((r, i) => { if (String(r[ev.categoryColumn] ?? '—') === String(ev.value)) idx.push(i); });
    columns = [ev.categoryColumn, ev.metricColumn].filter(Boolean);
    scope = 'group';
  } else if (detector === 'distribution' && /^largest:/.test(key) && ev.column && ev.value != null) {
    rows.forEach((r, i) => { if (String(r[ev.column] ?? '—') === String(ev.value)) idx.push(i); });
    columns = [ev.column];
    scope = 'group';
  } else {
    // Dataset-wide findings (averages, spread, health): the whole column.
    rows.forEach((_, i) => idx.push(i));
    columns = ev.column ? [ev.column] : [];
    scope = 'dataset';
  }

  return {
    id: d.id,
    title: d.title,
    summary: d.summary,
    evidence: ev,
    detector,
    direction: d.metadata?.direction || null,
    tone: d.metadata?.tone || 'neutral',
    rowIndices: idx,
    columns,
    scope,
  };
}

// One plain sentence naming what Ellery actually looked at — the reasoning made
// literal, straight from the evidence object (no prose stored in the finding).
export function explain(focus) {
  const ev = focus.evidence || {};
  const n = (v) => formatNumber(v);
  switch (focus.detector) {
    case 'extremes':
      return ev.value != null
        ? `${ev.label} holds ${n(ev.value)} — the ${focus.direction === 'min' ? 'lowest' : 'highest'} value in this column.`
        : '';
    case 'outliers':
      return `${n(ev.value)} sits ${Number(ev.z).toFixed(1)} standard deviations from the mean of ${n(ev.mean)}.`;
    case 'availability':
      if (ev.count != null && ev.total != null) return `${ev.count} of ${ev.total} records match this condition.`;
      if (ev.pct != null) return `${ev.healthy} of ${ev.total} records are in good standing (${ev.pct}%).`;
      if (ev.count != null && ev.threshold != null) return `${ev.count} records fall at or below ${ev.threshold}.`;
      return '';
    case 'distribution':
      if (ev.share != null) return `${ev.value} totals ${n(ev.total)} — ${ev.share}% of the column.`;
      if (ev.count != null) return `${ev.value} contains ${ev.count} of the records.`;
      if (ev.groups != null) return `The records fall into ${ev.groups} groups.`;
      return '';
    case 'central-tendency':
      return `Mean ${n(ev.mean)}, median ${n(ev.median)}, spread ±${n(ev.stddev)}.`;
    default:
      return '';
  }
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

/* ---------- Fingerprinted ground ----------
   The floor of every Pull. A content fingerprint of the exact data the finding
   was computed from, so the chain terminates at reproducible ground rather than
   at highlighted rows: same data + same policy → same finding, verifiably.
   Deterministic (no clock, no randomness) — the fingerprint IS the promise. */

const UNIT = '␟'; // canonical field separator, unlikely to occur in values

// FNV-1a, 32-bit — small, dependency-free, stable across runs and machines.
function hash(str) {
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

// A single record's cell address on the snapshot — cell = (rowFingerprint, column).
export function rowFingerprint(dataset, index) {
  const row = dataset.rows[index];
  return row ? hash(rowCanonical(dataset, row)) : '—';
}

/* ---------- Provenance: derivation, policy (π), confidence ----------
   C = f(E, π). Everything here is read back from the finding's own evidence and
   from the deterministic rule its detector applied — nothing is recomputed. The
   policy strings mirror the constants that live in the detectors (cited by
   source), surfacing π without moving it. */

const num = (v) => (typeof v === 'number' ? formatNumber(v) : String(v ?? '—'));

export function provenanceOf(d, report) {
  const ev = d.evidence || {};
  const key = d.metadata?.key || '';
  const detector = d.metadata?.detector;
  const rowCount = report.meta.rowCount;

  let derivation = '';
  let policy = { rule: '', params: '', source: '' };

  switch (detector) {
    case 'extremes':
      derivation = `${d.metadata.direction === 'min' ? 'min' : 'max'}(${ev.column}) over ${rowCount} values = ${num(ev.value)}`;
      policy = {
        rule: 'Order the metric across all records; surface the highest and lowest.',
        params: 'ordering only — no threshold',
        source: 'discovery/detectors/extremes.js',
      };
      break;
    case 'outliers':
      derivation = `z = |${num(ev.value)} − ${num(ev.mean)}| / ${num(ev.stddev)} = ${Number(ev.z).toFixed(1)}σ  (> 2.0σ)`;
      policy = {
        rule: 'Flag the record whose distance from the mean exceeds the σ threshold.',
        params: 'threshold = 2.0σ',
        source: 'discovery/detectors/outliers.js',
      };
      break;
    case 'availability':
      if (/^status:/.test(key)) {
        derivation = `count(status classified “${key.endsWith('critical') ? 'unavailable' : 'low'}”) = ${ev.count} of ${ev.total}`;
        policy = {
          rule: 'Classify each record’s status through the domain vocabulary, then count.',
          params: `vocabulary: ${report.domain.label}`,
          source: 'discovery/profile.js · domains.js',
        };
      } else if (key === 'qty:zero') {
        derivation = `count(${ev.column} = 0) = ${ev.count} of ${ev.total}`;
        policy = { rule: 'Count records at zero on the quantity column.', params: 'threshold = 0', source: 'discovery/detectors/availability.js' };
      } else if (key === 'qty:low') {
        derivation = `count(0 < ${ev.column} ≤ ${ev.threshold}) = ${ev.count}`;
        policy = { rule: 'Count records at or below the low-stock line.', params: `line = max(5, 10% of peak) = ${ev.threshold}`, source: 'discovery/detectors/availability.js' };
      } else {
        derivation = `${ev.healthy} not flagged / ${ev.total} = ${ev.pct}%`;
        policy = { rule: 'Share of records that are neither critical nor low.', params: 'derived from status classification', source: 'discovery/detectors/availability.js' };
      }
      break;
    case 'distribution':
      if (ev.share != null) {
        // Only the group total and its share are recorded evidence — show those
        // exactly rather than back-deriving (and rounding) the grand total.
        derivation = `${ev.value} = ${num(ev.total)}, ${ev.share}% of the total`;
        policy = { rule: 'Sum the metric per category; report the leading group and its share of the total.', params: 'share = groupTotal ÷ grandTotal', source: 'discovery/detectors/distribution.js' };
      } else if (ev.count != null) {
        derivation = `count(${ev.value}) = ${ev.count}, largest of ${ev.groups} groups`;
        policy = { rule: 'Group by category; report the largest by record count.', params: 'ordering by count', source: 'discovery/detectors/distribution.js' };
      } else {
        derivation = `distinct(${ev.column}) = ${ev.groups} groups`;
        policy = { rule: 'Count distinct category groups.', params: 'no threshold', source: 'discovery/detectors/distribution.js' };
      }
      break;
    case 'central-tendency':
      derivation = `mean = ${num(ev.mean)}, median = ${num(ev.median)}, σ = ${num(ev.stddev)}`;
      policy = { rule: 'Report the mean and median of the numeric column.', params: 'descriptive — no threshold', source: 'discovery/detectors/central-tendency.js' };
      break;
    default:
      policy = { rule: 'Deterministic rule.', params: '', source: 'discovery/detectors' };
  }

  const confidence = {
    value: d.confidence,
    note:
      d.confidence >= 1
        ? 'a direct count or ordering over the snapshot — nothing estimated'
        : detector === 'outliers'
          ? 'scales with distance past 2σ: min(1, 0.5 + (z − 2) / 2)'
          : 'weakest-link across the inputs',
  };

  return { derivation, policy, confidence };
}

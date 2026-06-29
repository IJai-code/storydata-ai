// The profile is what every detector actually reads. We crunch the per-column
// stats once here (so each detector doesnt recompute them) and tag every column
// with a role — metric, category, status, … — from the domain's hints, falling
// back to the column type when there's no hint. That tag is the whole trick:
// detectors say "the metric" instead of hardcoding "the Revenue column", which
// is what keeps them domain-agnostic.

import { resolveDomain } from './domains.js';

const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

function numericStats(values) {
  const v = values.filter(isNum).slice().sort((a, b) => a - b);
  const count = v.length;
  if (!count) return { count: 0, missing: values.length, distinct: 0 };
  const sum = v.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const median = count % 2 ? v[(count - 1) / 2] : (v[count / 2 - 1] + v[count / 2]) / 2;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / count;
  return {
    count,
    missing: values.length - count,
    min: v[0],
    max: v[count - 1],
    sum,
    mean,
    median,
    variance,
    stddev: Math.sqrt(variance),
    distinct: new Set(v).size,
  };
}

function categoricalStats(values) {
  const counts = new Map();
  let missing = 0;
  for (const val of values) {
    if (val === null || val === undefined || val === '') {
      missing += 1;
      continue;
    }
    const k = String(val);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  // Stable order: count desc, then key asc — deterministic across runs.
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return { count: values.length - missing, missing, distinct: counts.size, top };
}

function hintRole(col, domain) {
  for (const role of Object.keys(domain.hints || {})) {
    if (domain.hints[role].some((re) => re.test(col.label) || re.test(col.key))) return role;
  }
  return null;
}

// Returns { domain, rowCount, columnCount, columns, roles, classifyStatus,
// statsByKey } — all derived once, deterministically, from the dataset.
export function profileDataset(dataset) {
  const cols = dataset.columns;
  const rows = dataset.rows;
  const n = rows.length;
  const domain = resolveDomain(cols);

  const columns = cols.map((c) => {
    const values = rows.map((r) => r[c.key]);
    const stats = c.type === 'number' ? numericStats(values) : categoricalStats(values);
    let role = hintRole(c, domain);
    if (!role) {
      if (c.type === 'number') role = 'metric';
      else if (c.type === 'date') role = 'temporal';
      else {
        const distinct = stats.distinct ?? 0;
        if (distinct >= 2 && distinct <= Math.max(3, n / 3)) role = 'category';
        else role = distinct === n ? 'identifier' : 'name';
      }
    }
    return { key: c.key, label: c.label, type: c.type, role, stats };
  });

  const byRole = (role) => columns.filter((c) => c.role === role);

  // Primary metric: domain priority first, then highest-variance numeric.
  let metric = null;
  for (const re of domain.metricPriority || []) {
    metric = columns.find((c) => c.type === 'number' && (re.test(c.label) || re.test(c.key)));
    if (metric) break;
  }
  if (!metric) {
    metric =
      byRole('metric')[0] ||
      columns
        .filter((c) => c.type === 'number')
        .sort((a, b) => (b.stats.variance || 0) - (a.stats.variance || 0))[0] ||
      null;
  }

  // Primary category: an explicitly named category column wins the distinct-count guess.
  const category =
    columns.find((c) => c.role === 'category' && /categor/i.test(`${c.label} ${c.key}`)) ||
    byRole('category')[0] ||
    null;

  // Label: explicit name, else most-distinct string, else first column.
  const label =
    byRole('name')[0] ||
    columns
      .filter((c) => c.type === 'string')
      .sort((a, b) => (b.stats.distinct || 0) - (a.stats.distinct || 0))[0] ||
    columns[0];

  const roles = {
    label,
    category,
    status: byRole('status')[0] || null,
    quantity: byRole('quantity')[0] || null,
    price: byRole('price')[0] || null,
    metric,
    temporal: byRole('temporal')[0] || null,
  };

  return {
    domain: { id: domain.id, label: domain.label },
    rowCount: n,
    columnCount: cols.length,
    columns,
    roles,
    classifyStatus: makeStatusClassifier(domain),
    statsByKey: Object.fromEntries(columns.map((c) => [c.key, c.stats])),
  };
}

function makeStatusClassifier(domain) {
  const vocab = domain.statusVocab;
  return (value) => {
    if (!vocab) return null;
    const s = String(value ?? '');
    if (vocab.critical.some((re) => re.test(s))) return 'critical';
    if (vocab.warn.some((re) => re.test(s))) return 'warn';
    if (vocab.ok.some((re) => re.test(s))) return 'ok';
    return null;
  };
}

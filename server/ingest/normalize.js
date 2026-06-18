// Pipeline entry: raw string → { ok, dataset, warnings }. Never throws.
// dataset = { columns: [{key,label,type}], rows: [{key:value}], meta, truncated }
// The row cap is passed in by the API layer from the session's tier — this
// module has no notion of tiers.

import { detectFormat } from './detect.js';
import { parseCSV, parseJSON, parseText } from './parsers.js';

export function ingest(raw, rowCap = Infinity) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, dataset: null, warnings: ['Nothing to ingest — paste some data first.'] };
  }

  const detected = detectFormat(raw);
  const warnings = [];
  let objectRows = null;

  if (detected.format === 'json') {
    const res = parseJSON(raw);
    warnings.push(...res.warnings);
    objectRows = res.value;
  }

  if (detected.format === 'csv') {
    const res = parseCSV(raw, detected.delimiter);
    warnings.push(...res.warnings);
    objectRows = arraysToObjects(res.value, warnings);
  }

  if (!objectRows || !objectRows.length) {
    const res = parseText(raw);
    if (detected.format !== 'text') warnings.push('Structured parse failed — fell back to text mode.');
    warnings.push(...res.warnings);
    objectRows = res.value;
  }

  if (!objectRows.length) {
    return { ok: false, dataset: null, warnings: ['No usable rows found in that input.'] };
  }

  const columns = inferColumns(objectRows);
  let rows = objectRows.map((r) => coerceRow(r, columns));

  const totalRows = rows.length;
  const truncated = totalRows > rowCap;
  if (truncated) rows = rows.slice(0, rowCap);

  return {
    ok: true,
    warnings,
    dataset: {
      columns,
      rows,
      truncated,
      meta: {
        format: detected.format,
        totalRows,
        ingestedAt: Date.now(),
      },
    },
  };
}

/* ---------- CSV array-of-arrays → array-of-objects ---------- */

function arraysToObjects(arrays, warnings) {
  if (!arrays || !arrays.length) return null;
  const first = arrays[0];
  const hasHeader = looksLikeHeader(arrays);
  let keys;
  let dataRows;

  if (hasHeader) {
    keys = dedupeKeys(first.map((h, i) => (h.trim() ? h.trim() : `col_${i + 1}`)));
    dataRows = arrays.slice(1);
  } else {
    keys = first.map((_, i) => `col_${i + 1}`);
    dataRows = arrays;
    warnings.push('No header row detected — generated column names.');
  }

  return dataRows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

function looksLikeHeader(arrays) {
  if (arrays.length < 2) return false;
  const first = arrays[0];
  if (first.some((c) => valueType(c) !== 'string' || !c.trim())) return false;
  // At least one column whose body is mostly non-string while the header is a string.
  const body = arrays.slice(1, 21);
  return first.some((_, col) => {
    const types = body.map((r) => valueType(r[col] ?? ''));
    const nonString = types.filter((t) => t === 'number' || t === 'date').length;
    return nonString >= types.length * 0.6 && types.length > 0;
  });
}

function dedupeKeys(keys) {
  const seen = new Map();
  return keys.map((k) => {
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    return n === 1 ? k : `${k}_${n}`;
  });
}

/* ---------- Type inference & coercion ---------- */

const NUMERIC_RE = /^[-+]?[$€£]?\s?\d[\d,]*\.?\d*\s?%?$/;
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?$/i,
  /^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}$/i,
];
const BOOL_RE = /^(true|false|yes|no)$/i;

function valueType(v) {
  if (v === null || v === undefined || v === '') return 'empty';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  const s = String(v).trim();
  if (!s) return 'empty';
  if (NUMERIC_RE.test(s)) return 'number';
  if (BOOL_RE.test(s)) return 'boolean';
  if (DATE_PATTERNS.some((re) => re.test(s)) && !Number.isNaN(Date.parse(s))) return 'date';
  return 'string';
}

function inferColumns(rows) {
  const keys = [];
  for (const r of rows.slice(0, 50)) {
    for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  }

  return keys.map((key) => {
    const sample = rows.slice(0, 80).map((r) => valueType(r[key])).filter((t) => t !== 'empty');
    const type = majorityType(sample);
    return { key, label: prettyLabel(key), type };
  });
}

function majorityType(types) {
  if (!types.length) return 'string';
  const freq = {};
  for (const t of types) freq[t] = (freq[t] || 0) + 1;
  const [best, count] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  return count >= types.length * 0.7 ? best : 'string';
}

function prettyLabel(key) {
  return key
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function coerceRow(row, columns) {
  const out = {};
  for (const col of columns) {
    out[col.key] = coerceValue(row[col.key], col.type);
  }
  return out;
}

function coerceValue(v, type) {
  if (v === null || v === undefined) return null;
  if (type === 'number') {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/[$€£,%\s]/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  if (type === 'boolean') {
    if (typeof v === 'boolean') return v;
    return /^(true|yes)$/i.test(String(v).trim());
  }
  if (type === 'date') {
    const t = Date.parse(String(v));
    return Number.isNaN(t) ? String(v) : new Date(t).toISOString().slice(0, 10);
  }
  return String(v);
}

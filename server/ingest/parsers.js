// Tolerant parsers. Every function returns { value, warnings } and repairs
// what it can rather than throwing.

export function parseCSV(raw, delimiter) {
  const warnings = [];
  const text = raw.replace(/^\uFEFF/, ''); // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (inQuotes) warnings.push('An unclosed quote was auto-closed.');
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);

  // Repair ragged rows: pad or trim to the modal column count.
  const width = modalLength(rows);
  let repaired = 0;
  const shaped = rows.map((r) => {
    if (r.length === width) return r;
    repaired++;
    return r.length < width
      ? r.concat(Array(width - r.length).fill(''))
      : r.slice(0, width);
  });
  if (repaired > 0) warnings.push(`${repaired} ragged row${repaired > 1 ? 's' : ''} repaired to ${width} columns.`);

  return { value: shaped.map((r) => r.map((c) => c.trim())), warnings };
}

/* ---------- Intelligent nested JSON ----------
 * Three shapes, handled in order:
 *   1. Column-oriented object of primitive arrays  → rows
 *   2. Array of (possibly deeply nested) objects   → deep-flattened rows
 *      with linked hierarchy keys: profile.firstName, roles[0],
 *      projects[1].stars …
 *   3. A single deep object (e.g. one JSON profile) → a full hierarchy map:
 *      one row per leaf { branch, path, value }, so the mindmap renders the
 *      object's real structure instead of truncating it.
 */

const MAX_DEPTH = 6;
const MAX_FIELDS = 64;

export function parseJSON(raw) {
  const warnings = [];
  let data;
  try {
    data = JSON.parse(raw.trim());
  } catch {
    return { value: null, warnings: ['JSON could not be parsed.'] };
  }

  if (isPlainObject(data)) {
    const keys = Object.keys(data);

    // Column-oriented: every value is an array of primitives.
    if (
      keys.length &&
      keys.every((k) => Array.isArray(data[k]) && data[k].every(isPrimitive))
    ) {
      const len = Math.max(...keys.map((k) => data[k].length));
      warnings.push('Converted column-oriented JSON into rows.');
      return {
        warnings,
        value: Array.from({ length: len }, (_, i) =>
          Object.fromEntries(keys.map((k) => [k, data[k][i] ?? null]))
        ),
      };
    }

    // Envelope wrapping a record array (e.g. { status, count, results: [...] })
    // → use the array, but ONLY when it is the sole nested structure. A rich
    // profile with several nested branches must map as a hierarchy instead of
    // collapsing into the first array found.
    const arrKey = keys.find(
      (k) => Array.isArray(data[k]) && data[k].length > 1 && data[k].some(isPlainObject)
    );
    if (arrKey && keys.every((k) => k === arrKey || isPrimitive(data[k]))) {
      warnings.push(`Used the "${arrKey}" array as the dataset.`);
      data = data[arrKey];
    }
  }

  if (Array.isArray(data)) {
    if (!data.length) return { value: [], warnings };
    const capNote = { depth: false, fields: false };
    const rows = data.map((item) =>
      isPlainObject(item) || Array.isArray(item)
        ? flattenDeep(item, capNote)
        : { value: item }
    );
    if (capNote.depth) warnings.push(`Nesting beyond ${MAX_DEPTH} levels was summarized.`);
    if (capNote.fields) warnings.push(`Rows were capped at ${MAX_FIELDS} flattened fields.`);
    return { value: rows, warnings };
  }

  // A single nested object → linked hierarchy rows.
  if (isPlainObject(data)) {
    const rows = hierarchyRows(data);
    if (rows.length) {
      warnings.push('Nested profile mapped into a linked hierarchy — try the Mindmap layout.');
      return { value: rows, warnings };
    }
  }

  return { value: [{ value: leafString(data) }], warnings };
}

// Deep-flatten one record into dot/bracket hierarchy keys.
function flattenDeep(node, capNote, prefix = '', depth = 0, out = {}) {
  if (Object.keys(out).length >= MAX_FIELDS) {
    capNote.fields = true;
    return out;
  }
  if (depth >= MAX_DEPTH) {
    capNote.depth = true;
    out[prefix || 'value'] = leafString(node);
    return out;
  }

  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      const key = `${prefix}[${i}]`;
      if (isPrimitive(item)) {
        if (Object.keys(out).length < MAX_FIELDS) out[key] = item;
        else capNote.fields = true;
      } else {
        flattenDeep(item, capNote, key, depth + 1, out);
      }
    });
    return out;
  }

  if (isPlainObject(node)) {
    for (const [k, v] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (isPrimitive(v)) {
        if (Object.keys(out).length < MAX_FIELDS) out[key] = v;
        else capNote.fields = true;
      } else {
        flattenDeep(v, capNote, key, depth + 1, out);
      }
    }
    return out;
  }

  out[prefix || 'value'] = leafString(node);
  return out;
}

// Walk a single object into { branch, path, value } leaf rows.
function hierarchyRows(data) {
  const rows = [];
  const walk = (node, path, branch, depth) => {
    if (rows.length >= 400) return;
    if (depth >= MAX_DEPTH || isPrimitive(node)) {
      rows.push({ branch, path, value: isPrimitive(node) ? node : leafString(node) });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, branch, depth + 1));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const next = path ? `${path}.${k}` : k;
      walk(v, next, branch || k, depth + 1);
    }
  };
  for (const [k, v] of Object.entries(data)) {
    walk(v, k, k, 0);
  }
  return rows;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isPrimitive(v) {
  return v === null || typeof v !== 'object';
}

function leafString(v) {
  if (isPrimitive(v)) return v === null ? '' : String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return String(v);
  }
}

// Free text → one row per line/sentence with extracted numbers and dates.
const NUM_RE = /-?\$?€?£?\d[\d,]*\.?\d*%?/;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?)\b/i;

export function parseText(raw) {
  const warnings = ['Unstructured text — each line became a story beat.'];
  let segments = raw.split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) {
    segments = raw.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  }

  const rows = segments.map((text, i) => {
    const numMatch = text.match(NUM_RE);
    const dateMatch = text.match(DATE_RE);
    return {
      beat: i + 1,
      text,
      value: numMatch ? numMatch[0] : '',
      date: dateMatch ? dateMatch[0] : '',
    };
  });

  return { value: rows, warnings };
}

function modalLength(rows) {
  const freq = new Map();
  let best = 1;
  let bestCount = 0;
  for (const r of rows) {
    const n = (freq.get(r.length) || 0) + 1;
    freq.set(r.length, n);
    if (n > bestCount) {
      bestCount = n;
      best = r.length;
    }
  }
  return best;
}

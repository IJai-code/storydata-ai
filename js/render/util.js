// Shared helpers for the layout renderers.

export function pickColumns(dataset) {
  const cols = dataset.columns;
  const byType = (t) => cols.filter((c) => c.type === t);
  const strings = byType('string');
  const numbers = byType('number');
  const dates = byType('date');

  // Label: prefer the string column with the most distinct values.
  let label = strings[0] || cols[0];
  let bestDistinct = -1;
  for (const c of strings) {
    const distinct = new Set(dataset.rows.map((r) => r[c.key])).size;
    if (distinct > bestDistinct) {
      bestDistinct = distinct;
      label = c;
    }
  }

  // Category: a string column with few distinct values (good for grouping).
  let category = null;
  for (const c of strings) {
    if (c === label && strings.length > 1) continue;
    const distinct = new Set(dataset.rows.map((r) => r[c.key])).size;
    if (distinct >= 2 && distinct <= Math.max(3, dataset.rows.length / 3)) {
      category = c;
      break;
    }
  }

  return {
    label,
    value: numbers[0] || null,
    date: dates[0] || null,
    category,
  };
}

export function formatValue(v, type) {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'number' && typeof v === 'number') {
    return Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(v);
  }
  return String(v);
}

export function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/* ---------- Shared tooltip (one per app) ---------- */

let tooltipEl = null;

export function showTooltip(html, x, y) {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'viz-tooltip';
    document.body.appendChild(tooltipEl);
  }
  tooltipEl.innerHTML = html;
  tooltipEl.style.display = 'block';
  const pad = 14;
  const rect = tooltipEl.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

export function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

export function tooltipForRow(row, columns, max = 6) {
  const rows = columns
    .slice(0, max)
    .map(
      (c) =>
        `<div class="tt-row">${escapeHTML(c.label)}: <strong>${escapeHTML(
          formatValue(row[c.key], c.type)
        )}</strong></div>`
    )
    .join('');
  return rows;
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/* ---------- Insight derivation ----------
 * Reads observations straight from the data — never fabricates. Column roles
 * are inferred by name + type, so the same function adapts to a product
 * catalog, a metrics export, or a research table. Returns an ordered list of
 * { tone, label, value } where tone ∈ neutral | good | warn | bad. Feeds the
 * Insight Map summary panel. */

const COLOR_OK = /\b(in[-\s]?stock|available|active|healthy|live|ok|good|new)\b/i;
const COLOR_WARN = /\b(low|limited|backorder|reorder|pending|aging)\b/i;
const COLOR_BAD = /\b(out[-\s]?of[-\s]?stock|out|sold[-\s]?out|unavailable|discontinued|critical)\b/i;

// Classify a status-like string into a tone, or null if it doesn't look like a status.
export function statusTone(value) {
  const s = String(value ?? '');
  if (COLOR_BAD.test(s)) return 'bad';
  if (COLOR_WARN.test(s)) return 'warn';
  if (COLOR_OK.test(s)) return 'good';
  return null;
}

function findCol(cols, res) {
  return cols.find((c) => res.some((re) => re.test(c.label) || re.test(c.key))) || null;
}

// Identify the meaningful column roles for insight + Insight Map encoding.
export function dataRoles(dataset) {
  const cols = dataset.columns;
  const strings = cols.filter((c) => c.type === 'string');
  const numbers = cols.filter((c) => c.type === 'number');
  const picks = pickColumns(dataset);
  // Prefer a human name over an ID-like column (e.g. Product over SKU).
  const nameCol = findCol(strings, [/\b(name|product|title|item|label)\b/i]);
  // Term-priority metric: a value metric beats a count metric, regardless of
  // column order.
  const metric =
    findCol(numbers, [/revenue|sales/i]) ||
    findCol(numbers, [/\bvalue\b|amount|total/i]) ||
    findCol(numbers, [/inventory|stock/i]) ||
    findCol(numbers, [/units?\b|count|qty|quantity/i]) ||
    numbers[0] ||
    null;
  return {
    label: nameCol || picks.label,
    // An explicitly-named category column wins over the distinct-count guess.
    category:
      findCol(strings, [/categor/i]) ||
      picks.category ||
      findCol(strings, [/type|group|segment|class|brand/i]),
    status: findCol(cols, [/status|state|availability/i]),
    metric,
    price: findCol(numbers, [/price|cost|rate|fee/i]),
    stock: findCol(numbers, [/stock|inventory|qty|quantity|units?\b|count|on[-\s]?hand/i]),
  };
}

function avg(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function nums(rows, key) {
  return rows.map((r) => r[key]).filter((v) => typeof v === 'number' && !Number.isNaN(v));
}

export function deriveInsights(dataset) {
  const out = [];
  if (!dataset || !Array.isArray(dataset.rows) || !dataset.rows.length) return out;
  const rows = dataset.rows;
  const n = rows.length;
  const roles = dataRoles(dataset);
  const nameOf = (r) => formatValue(r[roles.label.key], roles.label.type);
  const num = (v) => formatValue(typeof v === 'number' ? v : Number(v), 'number');

  if (roles.metric) {
    const m = roles.metric.key;
    const ml = roles.metric.label.toLowerCase();
    const have = rows.filter((r) => typeof r[m] === 'number');
    if (have.length) {
      const sorted = [...have].sort((a, b) => b[m] - a[m]);
      out.push({ tone: 'good', label: `Highest ${ml}`, value: `${nameOf(sorted[0])} · ${num(sorted[0][m])}` });
      out.push({ tone: 'neutral', label: `Lowest ${ml}`, value: `${nameOf(sorted[sorted.length - 1])} · ${num(sorted[sorted.length - 1][m])}` });
      out.push({ tone: 'neutral', label: `Average ${ml}`, value: num(Math.round(avg(nums(rows, m)))) });
    }
  }

  if (roles.price && roles.price !== roles.metric) {
    const p = nums(rows, roles.price.key);
    if (p.length) out.push({ tone: 'neutral', label: `Average ${roles.price.label.toLowerCase()}`, value: num(Math.round(avg(p) * 100) / 100) });
  }

  // Out-of-stock / availability — prefer an explicit status column.
  if (roles.status) {
    const bad = rows.filter((r) => statusTone(r[roles.status.key]) === 'bad').length;
    const warn = rows.filter((r) => statusTone(r[roles.status.key]) === 'warn').length;
    if (bad) out.push({ tone: 'bad', label: 'Out of stock', value: `${bad} of ${n} ${bad === 1 ? 'item' : 'items'}` });
    if (warn) out.push({ tone: 'warn', label: 'Low / limited', value: `${warn} ${warn === 1 ? 'item' : 'items'} flagged` });
  }

  if (roles.stock) {
    const sk = roles.stock.key;
    const v = nums(rows, sk);
    if (v.length) {
      const zeros = rows.filter((r) => r[sk] === 0).length;
      const thr = Math.max(5, Math.round(Math.max(...v) * 0.1));
      const low = rows.filter((r) => typeof r[sk] === 'number' && r[sk] > 0 && r[sk] <= thr).length;
      if (zeros && !roles.status) out.push({ tone: 'bad', label: `${roles.stock.label} depleted`, value: `${zeros} at zero` });
      if (low) out.push({ tone: 'warn', label: 'Low-stock warnings', value: `${low} below ${thr} ${roles.stock.label.toLowerCase()}` });
    }
  }

  if (roles.category) {
    const ck = roles.category.key;
    const cl = roles.category.label.toLowerCase();
    const counts = {};
    rows.forEach((r) => { const k = String(r[ck] ?? '—'); counts[k] = (counts[k] || 0) + 1; });
    const byCount = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (byCount.length) {
      out.push({ tone: 'neutral', label: `Largest ${cl}`, value: `${byCount[0][0]} · ${byCount[0][1]} ${byCount[0][1] === 1 ? 'item' : 'items'}` });
      if (byCount.length > 1) out.push({ tone: 'neutral', label: `${roles.category.label} spread`, value: `${byCount.length} groups` });
    }
    if (roles.metric) {
      const totals = {};
      rows.forEach((r) => { const v = r[roles.metric.key]; if (typeof v === 'number') { const k = String(r[ck] ?? '—'); totals[k] = (totals[k] || 0) + v; } });
      const byTotal = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      if (byTotal.length) out.push({ tone: 'good', label: `Top ${cl} by ${roles.metric.label.toLowerCase()}`, value: `${byTotal[0][0]} · ${num(Math.round(byTotal[0][1]))}` });
    }
  }

  // Statistical outlier on the metric (|z| > 2).
  if (roles.metric) {
    const v = nums(rows, roles.metric.key);
    if (v.length >= 4) {
      const mean = avg(v);
      const sd = Math.sqrt(avg(v.map((x) => (x - mean) ** 2)));
      if (sd > 0) {
        let best = null, bz = 2;
        rows.forEach((r) => {
          const val = r[roles.metric.key];
          if (typeof val === 'number') { const z = Math.abs((val - mean) / sd); if (z > bz) { bz = z; best = r; } }
        });
        if (best) out.push({ tone: 'warn', label: 'Notable outlier', value: `${nameOf(best)} · ${num(best[roles.metric.key])} (${bz.toFixed(1)}σ)` });
      }
    }
  }

  // Composite health when availability is expressed.
  if (roles.status || roles.stock) {
    let healthy;
    if (roles.status) healthy = rows.filter((r) => statusTone(r[roles.status.key]) !== 'bad' && statusTone(r[roles.status.key]) !== 'warn').length;
    else healthy = rows.filter((r) => typeof r[roles.stock.key] === 'number' && r[roles.stock.key] > 0).length;
    const pct = Math.round((healthy / n) * 100);
    out.push({ tone: pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad', label: 'Inventory health', value: `${pct}% in good standing` });
  }

  return out;
}

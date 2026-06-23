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

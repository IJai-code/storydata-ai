// Free layout: structured data card grid with staggered entrance.

import { pickColumns, formatValue, escapeHTML } from '../util.js';

export function render(container, dataset) {
  const picks = pickColumns(dataset);
  const detailCols = dataset.columns
    .filter((c) => c !== picks.label && c !== picks.value)
    .slice(0, 4);

  const max = picks.value
    ? Math.max(...dataset.rows.map((r) => Math.abs(r[picks.value.key] ?? 0)), 1)
    : 1;

  const grid = document.createElement('div');
  grid.className = 'cardgrid';

  dataset.rows.forEach((row, i) => {
    const card = document.createElement('div');
    card.className = 'data-card';
    card.dataset.idx = String(i); // lets The Pull spotlight this exact record
    card.style.animationDelay = `${Math.min(i * 45, 1200)}ms`;

    const statHTML = picks.value
      ? `<div class="dc-stat">${escapeHTML(formatValue(row[picks.value.key], 'number'))}</div>
         <div class="dc-bar" style="width:${Math.round(
           (Math.abs(row[picks.value.key] ?? 0) / max) * 100
         )}%"></div>`
      : '';

    const fields = detailCols
      .map(
        (c) => `
        <div class="dc-field">
          <span class="k">${escapeHTML(c.label)}</span>
          <span class="v">${escapeHTML(formatValue(row[c.key], c.type))}</span>
        </div>`
      )
      .join('');

    card.innerHTML = `
      <div class="dc-title">${escapeHTML(formatValue(row[picks.label.key], picks.label.type))}</div>
      ${statHTML}
      ${fields}`;
    grid.appendChild(card);
  });

  container.appendChild(grid);
  return () => {};
}

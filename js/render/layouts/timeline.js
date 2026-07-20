// Free layout: scroll-driven interactive timeline. Items reveal as they
// enter the viewport via IntersectionObserver.

import { pickColumns, formatValue, escapeHTML } from '../util.js';

export function render(container, dataset) {
  const picks = pickColumns(dataset);
  // Carry each row's original dataset index so The Pull can spotlight it even
  // after the timeline re-sorts by date.
  let rows = dataset.rows.map((row, index) => ({ row, index }));

  if (picks.date) {
    rows.sort((a, b) => String(a.row[picks.date.key]).localeCompare(String(b.row[picks.date.key])));
  }

  const max = picks.value
    ? Math.max(...rows.map(({ row }) => Math.abs(row[picks.value.key] ?? 0)), 1)
    : 1;

  const tl = document.createElement('div');
  tl.className = 'tl';

  rows.forEach(({ row, index }, i) => {
    const item = document.createElement('div');
    item.className = `tl-item ${i % 2 === 0 ? 'left' : 'right'}`;
    item.dataset.idx = String(index);

    const date = picks.date ? formatValue(row[picks.date.key], 'date') : '';
    const label = formatValue(row[picks.label.key], picks.label.type);
    const valueHTML = picks.value
      ? `<div class="tl-value">${escapeHTML(picks.value.label)}: ${escapeHTML(
          formatValue(row[picks.value.key], 'number')
        )}</div>
         <div class="tl-bar" style="width:${Math.round(
           (Math.abs(row[picks.value.key] ?? 0) / max) * 100
         )}%"></div>`
      : '';

    item.innerHTML = `
      <span class="tl-dot"></span>
      <div class="tl-card">
        ${date ? `<div class="tl-date">${escapeHTML(date)}</div>` : ''}
        <div class="tl-label">${escapeHTML(label)}</div>
        ${valueHTML}
      </div>`;
    tl.appendChild(item);
  });

  container.appendChild(tl);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          observer.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15 }
  );
  tl.querySelectorAll('.tl-item').forEach((el) => observer.observe(el));

  return () => observer.disconnect();
}

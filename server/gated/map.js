// Pro layout: "Insight Map" — a zoomable, pannable packed-bubble field.
// Bubble size encodes the value column; color encodes category.

import {
  pickColumns,
  formatValue,
  escapeHTML,
  clamp,
  svgEl,
  showTooltip,
  hideTooltip,
  tooltipForRow,
} from '/js/render/util.js';

const MAX_BUBBLES = 300;
const VIZ_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)'];

export function render(container, dataset) {
  const picks = pickColumns(dataset);
  const rows = dataset.rows.slice(0, MAX_BUBBLES);

  // Radius scale: sqrt of value, normalized into [10, 58].
  const values = rows.map((r) =>
    picks.value && typeof r[picks.value.key] === 'number' ? Math.abs(r[picks.value.key]) : 1
  );
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values);
  const radii = values.map((v) => {
    if (maxV === minV) return 26;
    const t = Math.sqrt(v / maxV);
    return 10 + t * 48;
  });

  const bubbles = packCircles(rows, radii);
  const bounds = computeBounds(bubbles);
  const vb = {
    x: bounds.x - 30,
    y: bounds.y - 30,
    w: bounds.w + 60,
    h: bounds.h + 60,
  };

  const categories = picks.category
    ? [...new Set(rows.map((r) => String(r[picks.category.key] ?? '—')))]
    : [];

  const wrap = document.createElement('div');
  wrap.className = 'viz-svg-wrap pannable';
  const svg = svgEl('svg', { viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}` });
  svg.style.minHeight = '440px';
  svg.style.aspectRatio = `${vb.w} / ${vb.h}`;
  wrap.appendChild(svg);

  bubbles.forEach((b, i) => {
    const colorIdx = picks.category
      ? Math.max(0, categories.indexOf(String(b.row[picks.category.key] ?? '—')))
      : i;
    const color = VIZ_COLORS[colorIdx % VIZ_COLORS.length];

    const g = svgEl('g');
    const circle = svgEl('circle', {
      cx: b.x,
      cy: b.y,
      r: b.r,
      fill: color,
      'fill-opacity': '0.18',
      stroke: color,
      'stroke-width': '1.5',
    });
    circle.classList.add('pop-node');
    circle.style.animationDelay = `${Math.min(i * 0.02, 1.4)}s`;
    g.appendChild(circle);

    if (b.r > 18) {
      const label = svgEl('text', {
        x: b.x,
        y: b.y + 4,
        'text-anchor': 'middle',
        fill: 'var(--text-1)',
        'font-size': clamp(b.r / 3, 9, 14),
        'font-family': 'var(--font-ui)',
      });
      let text = String(formatValue(b.row[picks.label.key], picks.label.type));
      if (text.length > Math.floor(b.r / 3.2)) text = `${text.slice(0, Math.floor(b.r / 3.2))}…`;
      label.textContent = text;
      label.classList.add('pop-node');
      label.style.animationDelay = circle.style.animationDelay;
      g.appendChild(label);
    }

    g.style.cursor = 'pointer';
    g.addEventListener('mousemove', (e) => {
      circle.setAttribute('fill-opacity', '0.4');
      showTooltip(
        `<div class="tt-title">${escapeHTML(
          formatValue(b.row[picks.label.key], picks.label.type)
        )}</div>${tooltipForRow(b.row, dataset.columns)}`,
        e.clientX,
        e.clientY
      );
    });
    g.addEventListener('mouseleave', () => {
      circle.setAttribute('fill-opacity', '0.18');
      hideTooltip();
    });
    svg.appendChild(g);
  });

  attachPanZoom(wrap, svg, vb);

  const hint = document.createElement('div');
  hint.className = 'viz-hint';
  hint.textContent = `${bubbles.length} bubbles · scroll to zoom · drag to pan · hover for details`;
  wrap.appendChild(hint);
  container.appendChild(wrap);

  return () => hideTooltip();
}

/* ---------- Naive circle packing: spiral search, O(n²) ---------- */

function packCircles(rows, radii) {
  const order = rows
    .map((row, i) => ({ row, r: radii[i] }))
    .sort((a, b) => b.r - a.r);

  const placed = [];
  for (const item of order) {
    if (!placed.length) {
      placed.push({ ...item, x: 0, y: 0 });
      continue;
    }
    let best = null;
    for (let angle = 0, dist = item.r; dist < 4000 && !best; angle += 0.35) {
      dist += 0.55;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist * 0.72; // slightly elliptical field
      if (placed.every((p) => !overlaps(p, x, y, item.r))) best = { x, y };
    }
    placed.push({ ...item, ...(best || { x: 0, y: 0 }) });
  }
  return placed;
}

function overlaps(p, x, y, r) {
  const dx = p.x - x;
  const dy = p.y - y;
  return dx * dx + dy * dy < (p.r + r + 3) * (p.r + r + 3);
}

function computeBounds(bubbles) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of bubbles) {
    minX = Math.min(minX, b.x - b.r);
    minY = Math.min(minY, b.y - b.r);
    maxX = Math.max(maxX, b.x + b.r);
    maxY = Math.max(maxY, b.y + b.r);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ---------- Pan & zoom via viewBox math ---------- */

function attachPanZoom(wrap, svg, initial) {
  const vb = { ...initial };
  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  wrap.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      const newW = clamp(vb.w * factor, initial.w / 10, initial.w * 3);
      const scale = newW / vb.w;

      // Zoom anchored at the cursor position.
      const rect = svg.getBoundingClientRect();
      const px = vb.x + ((e.clientX - rect.left) / rect.width) * vb.w;
      const py = vb.y + ((e.clientY - rect.top) / rect.height) * vb.h;
      vb.x = px - (px - vb.x) * scale;
      vb.y = py - (py - vb.y) * scale;
      vb.w *= scale;
      vb.h *= scale;
      apply();
    },
    { passive: false }
  );

  let panning = null;
  wrap.addEventListener('pointerdown', (e) => {
    panning = { x: e.clientX, y: e.clientY };
    wrap.classList.add('panning');
    wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!panning) return;
    const rect = svg.getBoundingClientRect();
    vb.x -= ((e.clientX - panning.x) / rect.width) * vb.w;
    vb.y -= ((e.clientY - panning.y) / rect.height) * vb.h;
    panning = { x: e.clientX, y: e.clientY };
    apply();
  });
  const endPan = () => {
    panning = null;
    wrap.classList.remove('panning');
  };
  wrap.addEventListener('pointerup', endPan);
  wrap.addEventListener('pointercancel', endPan);
}

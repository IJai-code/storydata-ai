// Pro layout: animated branching data pathways. Root → category branches →
// leaf nodes, drawn as an SVG tree with animated path strokes and hover detail.

import {
  pickColumns,
  formatValue,
  escapeHTML,
  svgEl,
  showTooltip,
  hideTooltip,
  tooltipForRow,
} from '../util.js';

const MAX_LEAVES_PER_BRANCH = 14;
const VIZ_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)'];

export function render(container, dataset) {
  const picks = pickColumns(dataset);
  const branches = groupRows(dataset, picks);

  // Vertical space: each leaf gets a slot; branches are padded apart.
  const leafGap = 30;
  const branchPad = 26;
  const totalLeaves = branches.reduce((n, b) => n + b.leaves.length, 0);
  const height = Math.max(360, totalLeaves * leafGap + branches.length * branchPad + 60);
  const width = 960;
  const rootX = 70;
  const branchX = width * 0.42;
  const leafX = width * 0.78;

  const wrap = document.createElement('div');
  wrap.className = 'viz-svg-wrap';
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}` });
  svg.style.minHeight = '360px';
  wrap.appendChild(svg);

  // Lay out leaves top-to-bottom, branch anchor = mean of its leaves.
  let cursorY = 40;
  for (const branch of branches) {
    branch.leafYs = branch.leaves.map(() => {
      const y = cursorY;
      cursorY += leafGap;
      return y;
    });
    branch.y = branch.leafYs.reduce((a, b) => a + b, 0) / branch.leafYs.length;
    cursorY += branchPad;
  }
  const rootY = branches.reduce((a, b) => a + b.y, 0) / branches.length;

  let delay = 0;
  branches.forEach((branch, bi) => {
    const color = VIZ_COLORS[bi % VIZ_COLORS.length];

    drawPath(svg, rootX, rootY, branchX, branch.y, color, delay, 2.2);
    drawNode(svg, branchX, branch.y, 7, color, delay + 0.25);
    drawLabel(svg, branchX, branch.y - 14, branch.name, color, delay + 0.25, 'middle', '13');

    branch.leaves.forEach((row, li) => {
      const y = branch.leafYs[li];
      const d = delay + 0.3 + li * 0.05;
      drawPath(svg, branchX, branch.y, leafX, y, color, d, 1.2);

      const node = drawNode(svg, leafX, y, 4.5, color, d + 0.2);
      const label = drawLabel(
        svg,
        leafX + 12,
        y + 4,
        leafText(row, picks),
        'var(--text-2)',
        d + 0.2,
        'start',
        '11'
      );
      // Tag real records (not the "+N more" placeholder) so The Pull can
      // spotlight this leaf. indexOf is reference-based and stable per row.
      if (!row.__more) {
        const oi = dataset.rows.indexOf(row);
        if (oi >= 0) {
          node.dataset.idx = String(oi);
          label.dataset.idx = String(oi);
        }
      }

      // Hover hit area larger than the dot itself.
      const hit = svgEl('circle', { cx: leafX, cy: y, r: 12, fill: 'transparent' });
      hit.style.cursor = 'pointer';
      hit.addEventListener('mousemove', (e) => {
        node.setAttribute('r', '7');
        showTooltip(
          `<div class="tt-title">${escapeHTML(
            formatValue(row[picks.label.key], picks.label.type)
          )}</div>${tooltipForRow(row, dataset.columns)}`,
          e.clientX,
          e.clientY
        );
      });
      hit.addEventListener('mouseleave', () => {
        node.setAttribute('r', '4.5');
        hideTooltip();
      });
      svg.appendChild(hit);
    });

    delay += 0.18;
  });

  // Root node last so it sits on top.
  const root = drawNode(svg, rootX, rootY, 11, 'var(--viz-1)', 0);
  root.style.animation = 'node-pop 0.45s forwards, pulse-glow 2.4s 0.5s infinite';
  drawLabel(svg, rootX, rootY - 20, 'DATASET', 'var(--viz-1)', 0.1, 'middle', '12');

  const hint = document.createElement('div');
  hint.className = 'viz-hint';
  hint.textContent = `${branches.length} branches · ${totalLeaves} nodes · hover a node for details`;
  wrap.appendChild(hint);
  container.appendChild(wrap);

  return () => hideTooltip();
}

function groupRows(dataset, picks) {
  const rows = dataset.rows;

  if (picks.category) {
    const groups = new Map();
    for (const row of rows) {
      const key = String(row[picks.category.key] ?? '—');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.entries()].map(([name, leaves]) => ({
      name,
      leaves: capLeaves(leaves),
    }));
  }

  // No categorical column: chunk sequential rows into numbered branches.
  const chunkSize = Math.max(4, Math.ceil(rows.length / Math.min(6, Math.ceil(rows.length / 4))));
  const branches = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    branches.push({
      name: `Rows ${i + 1}–${Math.min(i + chunkSize, rows.length)}`,
      leaves: capLeaves(rows.slice(i, i + chunkSize)),
    });
  }
  return branches;
}

function capLeaves(leaves) {
  if (leaves.length <= MAX_LEAVES_PER_BRANCH) return leaves;
  const kept = leaves.slice(0, MAX_LEAVES_PER_BRANCH - 1);
  kept.push({ __more: leaves.length - kept.length });
  return kept;
}

function leafText(row, picks) {
  if (row.__more) return `+${row.__more} more…`;
  let text = String(formatValue(row[picks.label.key], picks.label.type));
  if (text.length > 28) text = `${text.slice(0, 27)}…`;
  if (picks.value && row[picks.value.key] != null) {
    text += `  ·  ${formatValue(row[picks.value.key], 'number')}`;
  }
  return text;
}

function drawPath(svg, x1, y1, x2, y2, color, delay, width) {
  const mx = (x1 + x2) / 2;
  const path = svgEl('path', {
    d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
    fill: 'none',
    stroke: color,
    'stroke-width': width,
    'stroke-linecap': 'round',
    opacity: '0.65',
  });
  svg.appendChild(path);
  const len = path.getTotalLength ? safeLength(path) : 600;
  path.style.setProperty('--path-len', len);
  path.classList.add('draw-path');
  path.style.animationDelay = `${delay}s`;
  return path;
}

function safeLength(path) {
  try {
    return Math.ceil(path.getTotalLength());
  } catch {
    return 600;
  }
}

function drawNode(svg, cx, cy, r, color, delay) {
  const c = svgEl('circle', { cx, cy, r, fill: color });
  c.classList.add('pop-node');
  c.style.animationDelay = `${delay}s`;
  svg.appendChild(c);
  return c;
}

function drawLabel(svg, x, y, text, fill, delay, anchor, size) {
  const t = svgEl('text', {
    x,
    y,
    fill,
    'text-anchor': anchor,
    'font-size': size,
    'font-family': 'var(--font-mono)',
  });
  t.textContent = text;
  t.classList.add('pop-node');
  t.style.animationDelay = `${delay}s`;
  svg.appendChild(t);
  return t;
}

// Pro layout: "Insight Map" — a grouped, exploreable field of records.
//
// Reads meaning from the data: bubbles are CLUSTERED by category, SIZED by a
// meaningful metric, and COLORED by status (falling back to a monochrome
// category ramp). Hovering reveals the full record; clicking a record lifts
// its whole group and dims the rest, drawing hub links so relationships read
// at a glance. A live Insight Summary panel — generated from the dataset, not
// hardcoded — sits alongside the map.
//
// Delivered cross-origin from the backend's tier-gated route, so frontend
// modules can't be imported by path here. The host app (js/render/canvas.js)
// hands the rendering helpers and the Discovery Engine over on the window
// before this module is imported.
const {
  formatValue,
  escapeHTML,
  clamp,
  svgEl,
  showTooltip,
  hideTooltip,
  tooltipForRow,
} = window.__elleryUtil;

const MAX_BUBBLES = 300;
const CATEGORY_RAMP = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', '#7e7e86', '#46464c'];
// Engine tone (ok|warn|critical) -> visual color + existing CSS class suffix.
const TONE_COLOR = { ok: 'var(--viz-1)', warn: 'var(--warn)', critical: 'var(--danger)' };
const TONE_CLASS = { ok: 'good', warn: 'warn', critical: 'bad', neutral: 'neutral' };

export function render(container, dataset) {
  // The Discovery Engine is the single analysis pass: it supplies both the
  // encoding roles (what to size/color/group by) and the summary discoveries.
  const report = window.__elleryDiscovery.runDiscovery(dataset);
  const roles = report.profile.roles;
  const classifyStatus = report.profile.classifyStatus;
  const rows = dataset.rows.slice(0, MAX_BUBBLES);
  const labelKey = roles.label.key;
  const labelType = roles.label.type;
  const catKey = roles.category ? roles.category.key : null;
  const statusKey = roles.status ? roles.status.key : null;
  const metricKey = roles.metric ? roles.metric.key : null;

  // Radius encodes the metric (sqrt so area ≈ value); flat when none exists.
  const metricVals = rows.map((r) => (metricKey && typeof r[metricKey] === 'number' ? Math.abs(r[metricKey]) : 1));
  const maxV = Math.max(...metricVals, 1);
  const minV = Math.min(...metricVals);
  const radiusOf = (v) => {
    if (!metricKey || maxV === minV) return 24;
    return 12 + Math.sqrt(v / maxV) * 40;
  };

  // Group by category (or a single implicit group).
  const groupNames = catKey
    ? [...new Set(rows.map((r) => String(r[catKey] ?? '—')))]
    : ['All records'];
  const catColor = (name) => CATEGORY_RAMP[groupNames.indexOf(name) % CATEGORY_RAMP.length];

  // Pack each group locally, then lay groups out on a grid.
  const groups = groupNames.map((name) => {
    const items = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => (catKey ? String(row[catKey] ?? '—') === name : true))
      .map(({ row, idx }) => ({ row, idx, r: radiusOf(metricVals[idx]) }));
    const placed = packCircles(items);
    const b = clusterBounds(placed);
    return { name, placed, radius: Math.max(b.radius, 40) };
  });

  const cols = Math.ceil(Math.sqrt(groups.length));
  const cell = Math.max(...groups.map((g) => g.radius)) * 2 + 96;
  const bubbles = [];
  const centroids = {};
  groups.forEach((g, gi) => {
    const cx = (gi % cols) * cell + cell / 2;
    const cy = Math.floor(gi / cols) * cell + cell / 2;
    centroids[g.name] = { x: cx, y: cy, top: cy - g.radius - 16 };
    g.placed.forEach((p) => bubbles.push({ ...p, x: p.x + cx, y: p.y + cy, cat: g.name }));
  });

  const bounds = computeBounds(bubbles);
  const vb = { x: bounds.x - 40, y: bounds.y - 50, w: bounds.w + 80, h: bounds.h + 90 };

  /* ---------- DOM scaffold: map stage + summary panel ---------- */
  const root = document.createElement('div');
  root.className = 'insightmap';

  const stage = document.createElement('div');
  stage.className = 'im-stage';
  const wrap = document.createElement('div');
  wrap.className = 'viz-svg-wrap pannable';
  const svg = svgEl('svg', { viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}` });
  svg.style.minHeight = '460px';
  svg.style.aspectRatio = `${vb.w} / ${vb.h}`;
  wrap.appendChild(svg);
  stage.appendChild(wrap);

  const hint = document.createElement('div');
  hint.className = 'viz-hint';
  hint.textContent = `${bubbles.length} records · ${groupNames.length} ${groupNames.length === 1 ? 'group' : 'groups'}`;
  stage.appendChild(hint);
  root.appendChild(stage);

  root.appendChild(buildSummary(report));
  container.appendChild(root);

  /* ---------- Hub links (shown on selection) ---------- */
  const linksG = svgEl('g', { class: 'im-links' });
  svg.appendChild(linksG);

  // Group label captions.
  groupNames.forEach((name) => {
    const c = centroids[name];
    const cap = svgEl('text', {
      x: c.x, y: c.top, 'text-anchor': 'middle', class: 'im-cap',
      fill: 'var(--text-3)', 'font-size': 13, 'font-family': 'var(--font-mono)',
    });
    cap.textContent = name;
    svg.appendChild(cap);
  });

  /* ---------- Bubbles ---------- */
  const nodes = [];
  bubbles.forEach((b, i) => {
    const tone = statusKey ? classifyStatus(b.row[statusKey]) : null;
    const color = tone ? TONE_COLOR[tone] : catColor(b.cat);

    const g = svgEl('g', { class: 'im-node' });
    g.dataset.cat = b.cat;
    g.dataset.idx = String(b.idx);

    const circle = svgEl('circle', {
      cx: b.x, cy: b.y, r: b.r, fill: color,
      'fill-opacity': '0.18', stroke: color, 'stroke-width': '1.5',
    });
    circle.classList.add('pop-node');
    circle.style.animationDelay = `${Math.min(i * 0.006, 0.25)}s`;
    circle.dataset.baseR = String(b.r);
    g.appendChild(circle);

    if (b.r > 17) {
      const t = svgEl('text', {
        x: b.x, y: b.y + 4, 'text-anchor': 'middle', fill: 'var(--text-1)',
        'font-size': clamp(b.r / 3, 9, 13), 'font-family': 'var(--font-ui)',
        'pointer-events': 'none',
      });
      let text = String(formatValue(b.row[labelKey], labelType));
      const cap = Math.floor(b.r / 3.1);
      if (text.length > cap) text = `${text.slice(0, cap)}…`;
      t.textContent = text;
      t.classList.add('pop-node');
      t.style.animationDelay = circle.style.animationDelay;
      g.appendChild(t);
    }

    g.addEventListener('mousemove', (e) => {
      if (!selectedCat) circle.setAttribute('fill-opacity', '0.42');
      showTooltip(richTooltip(b.row, dataset, roles, tone), e.clientX, e.clientY);
    });
    g.addEventListener('mouseleave', () => {
      if (!selectedCat) circle.setAttribute('fill-opacity', '0.18');
      hideTooltip();
    });
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      select(b.cat, g);
    });

    svg.appendChild(g);
    nodes.push({ g, circle, cat: b.cat, x: b.x, y: b.y });
  });

  /* ---------- Selection: lift a group, dim the rest, draw hub links ---------- */
  let selectedCat = null;

  function select(cat, gEl) {
    if (selectedCat === cat) return clearSelection();
    selectedCat = cat;
    root.classList.add('im-has-selection');
    nodes.forEach((n) => {
      const related = n.cat === cat;
      n.g.classList.toggle('im-related', related);
      n.g.classList.toggle('im-dim', !related);
      n.g.classList.remove('im-selected');
      n.circle.setAttribute('fill-opacity', related ? '0.34' : '0.18');
    });
    if (gEl) gEl.classList.add('im-selected');

    // Hub-and-spoke links from each group member to the group centroid.
    linksG.replaceChildren();
    const c = centroids[cat];
    nodes.filter((n) => n.cat === cat).forEach((n) => {
      linksG.appendChild(svgEl('line', { x1: c.x, y1: c.y, x2: n.x, y2: n.y, class: 'im-link' }));
    });
    linksG.classList.add('im-links-on');
    highlightSummary(cat);
  }

  function clearSelection() {
    selectedCat = null;
    root.classList.remove('im-has-selection');
    nodes.forEach((n) => {
      n.g.classList.remove('im-related', 'im-dim', 'im-selected');
      n.circle.setAttribute('fill-opacity', '0.18');
    });
    linksG.replaceChildren();
    linksG.classList.remove('im-links-on');
    highlightSummary(null);
  }

  function highlightSummary(cat) {
    root.querySelectorAll('.im-chip').forEach((chip) => {
      chip.classList.toggle('active', cat != null && chip.dataset.cat === cat);
    });
  }

  svg.addEventListener('click', clearSelection);
  attachPanZoom(wrap, svg, vb);

  // Clicking a category chip in the summary focuses that group too.
  root.querySelector('.im-chips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.im-chip');
    if (chip) select(chip.dataset.cat, null);
  });

  return () => hideTooltip();
}

/* ---------- Insight Summary panel (auto-generated) ---------- */

function buildSummary(report) {
  const aside = document.createElement('aside');
  aside.className = 'im-summary';
  const roles = report.profile.roles;

  // Render the engine's standardized Discovery objects — title + plain-language
  // summary, tone mapped onto the existing dot styles.
  const list = report.discoveries
    .map((d) => {
      const cls = TONE_CLASS[d.metadata.tone] || 'neutral';
      return `
      <li class="im-insight im-${cls}">
        <span class="im-dot"></span>
        <span class="im-insight-body">
          <span class="im-insight-label">${escapeHTML(d.title)}</span>
          <span class="im-insight-value">${escapeHTML(d.summary)}</span>
        </span>
      </li>`;
    })
    .join('');

  // Category chips double as a legend and a selection control.
  let chips = '';
  if (roles.category && roles.category.stats.top) {
    chips = `<div class="im-chips">${roles.category.stats.top
      .map(([nm]) => `<button class="im-chip" data-cat="${escapeHTML(nm)}">${escapeHTML(nm)}</button>`)
      .join('')}</div>`;
  }

  const sizeLegend = roles.metric ? `Size · ${escapeHTML(roles.metric.label)}` : 'Size · uniform';
  const colorLegend = roles.status
    ? `Color · ${escapeHTML(roles.status.label)}`
    : roles.category
      ? `Color · ${escapeHTML(roles.category.label)}`
      : 'Color · single';

  aside.innerHTML = `
    <div class="im-summary-head">
      <h3>Analysis</h3>
      <p class="im-summary-sub">${report.meta.rowCount} records · ${report.meta.columnCount} fields · ${escapeHTML(report.domain.label)}</p>
    </div>
    <div class="im-legend"><span>${sizeLegend}</span><span>${colorLegend}</span></div>
    ${chips}
    <ul class="im-insights">${list || '<li class="im-insight im-neutral"><span class="im-dot"></span><span class="im-insight-body"><span class="im-insight-label">No signal detected</span><span class="im-insight-value">Add a numeric or status column to unlock insights</span></span></li>'}</ul>`;
  return aside;
}

function richTooltip(row, dataset, roles, tone) {
  const title = escapeHTML(formatValue(row[roles.label.key], roles.label.type));
  const toneTag = tone
    ? `<span class="tt-tone tt-${TONE_CLASS[tone]}">${escapeHTML(String(row[roles.status.key]))}</span>`
    : '';
  return `<div class="tt-title">${title}${toneTag}</div>${tooltipForRow(row, dataset.columns, 8)}`;
}

/* ---------- Naive circle packing: spiral search, O(n²) ---------- */

function packCircles(items) {
  const order = [...items].sort((a, b) => b.r - a.r);
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
      const y = Math.sin(angle) * dist * 0.78;
      if (placed.every((p) => !overlaps(p, x, y, item.r))) best = { x, y };
    }
    placed.push({ ...item, ...(best || { x: 0, y: 0 }) });
  }
  return placed;
}

function overlaps(p, x, y, r) {
  const dx = p.x - x;
  const dy = p.y - y;
  return dx * dx + dy * dy < (p.r + r + 4) * (p.r + r + 4);
}

function clusterBounds(bubbles) {
  let radius = 0;
  for (const b of bubbles) radius = Math.max(radius, Math.hypot(b.x, b.y) + b.r);
  return { radius };
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

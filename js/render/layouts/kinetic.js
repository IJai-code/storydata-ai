// Flagship layout: the Kinetic Rank board — purpose-driven physics.
// Sort pulses physically re-rank the cards; dragging a card over another
// shows a live difference/ratio comparison; clicking a card pins it as the reference
// for delta mode. Rendered by the standalone engine
// (js/render/kinetic-engine.js, loaded as a classic script so the server can
// embed the identical file into the Pro interactive export).

const MODE_LABELS = {
  'value-desc': 'Value ↓',
  'value-asc': 'Value ↑',
  date: 'Date',
  label: 'A → Z',
  category: 'Category',
  shuffle: 'Shuffle',
};

export function render(container, dataset) {
  const wrap = document.createElement('div');
  wrap.className = 'viz-svg-wrap kinetic-wrap';

  const controls = document.createElement('div');
  controls.className = 'kinetic-controls';
  wrap.appendChild(controls);

  // Plain-English guide so the result of every gesture is understood.
  const guide = document.createElement('div');
  guide.className = 'kinetic-guide';
  guide.innerHTML = `
    <div><span>Sort</span>Press a pulse to reorder the cards by that field — the further a card
    travels, the more its position changes between orderings.</div>
    <div><span>Compare</span>Drag one card onto another to see the exact difference between
    them, and how many times larger one is.</div>
    <div><span>Baseline</span>Click a card to make it your baseline — every other card then
    shows how far above (+) or below (−) it sits. Click it again to clear.</div>
    <div><span>Read</span>Hover any card to see its full, untruncated details.</div>`;
  wrap.appendChild(guide);

  const canvas = document.createElement('canvas');
  canvas.className = 'kinetic-canvas';
  wrap.appendChild(canvas);

  const hint = document.createElement('div');
  hint.className = 'viz-hint';
  hint.textContent =
    'sort pulses reorder the cards live · drag a card onto another to compare · click a card to set a baseline · hover to read full details';
  wrap.appendChild(hint);
  container.appendChild(wrap);

  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const system = new globalThis.ElleryKinetic(canvas, dataset, { reducedMotion });

  // Sort-pulse chips — only the modes this dataset actually supports.
  controls.innerHTML = system
    .availableModes()
    .map(
      (m) =>
        `<button class="kinetic-chip${m === system.mode ? ' active' : ''}" data-mode="${m}">${MODE_LABELS[m]}</button>`
    )
    .join('');
  controls.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-mode]');
    if (chip) system.setMode(chip.dataset.mode);
  });
  system.onmode = (mode) => {
    controls.querySelectorAll('[data-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  };

  system.start();
  return () => system.stop();
}

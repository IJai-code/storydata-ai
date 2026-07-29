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

  // The gesture guide lives in the hint line below the board; a second
  // full-width explainer here said the same things twice.
  const canvas = document.createElement('canvas');
  canvas.className = 'kinetic-canvas';
  wrap.appendChild(canvas);
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

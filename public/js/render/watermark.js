// Free-tier attribution anchor — the viral distribution hook. Rendered inside
// the canvas artifact so it travels with screenshots and embeds.

const WATERMARK_URL =
  'https://ellery.example?utm_source=watermark&utm_medium=canvas&utm_campaign=free_tier';

export function applyWatermark(container) {
  const a = document.createElement('a');
  a.className = 'sd-watermark';
  a.href = WATERMARK_URL;
  a.target = '_blank';
  a.rel = 'noopener';
  a.innerHTML = '<span>●</span> Built with Ellery AI — Generate Yours Free';
  container.appendChild(a);
}

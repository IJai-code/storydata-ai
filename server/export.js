// Server-side document assembler for both export flavors:
//   /api/export — Pro, watermark-free, embed-ready
//   /api/share  — every tier, watermark injected HERE so the client can't
//                 produce an unbranded share file.
// Receives the rendered canvas markup, returns a self-contained HTML
// document in the Ellery monochrome editorial style. Live Simulation pulses
// survive export: mindmap pulses are SMIL elements inside the SVG, timeline
// pulses get their keyframes below.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Frontend now lives at the repo root (GitHub Pages), not /public.
const ENGINE_PATH = path.join(__dirname, '..', 'js', 'render', 'kinetic-engine.js');
let engineSourceCache = null;

const WATERMARK_HTML =
  '<a class="sd-watermark" target="_blank" rel="noopener" ' +
  'href="https://ellery.example?utm_source=watermark&utm_medium=share&utm_campaign=free_tier">' +
  '<span>●</span> Built with Ellery AI — Generate Yours Free</a>';

export function buildExportDocument({ html, watermark = false } = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    return { ok: false, error: 'Nothing to export — render a story first.' };
  }
  if (html.length > 2_000_000) {
    return { ok: false, error: 'Story is too large to export.' };
  }

  const doc = `<!-- Generated via Ellery AI Engine - Built by Ishaan Jha -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Data Story — ${watermark ? 'shared via' : 'exported from'} Ellery AI</title>
<style>
${exportCSS(watermark)}
</style>
</head>
<body>
<div class="canvas">
${html}
${watermark ? WATERMARK_HTML : ''}
</div>
</body>
</html>`;

  return { ok: true, doc };
}

// Self-contained stylesheet for exported stories: monochrome tokens + the
// viz classes, with entrance animations resolved to their final state.
// Simulation pulse motion is preserved.
function exportCSS(watermark) {
  const watermarkCSS = watermark
    ? `
.sd-watermark{position:fixed;right:20px;bottom:20px;display:inline-flex;align-items:center;gap:8px;
padding:7px 14px;border-radius:999px;background:rgba(11,11,12,.9);border:1px solid #2a2a2c;
color:#a0a0a6;font-size:.69rem;font-weight:500;text-decoration:none;letter-spacing:.02em;z-index:10}
.sd-watermark span{color:#f5f5f7}
.sd-watermark:hover{color:#f5f5f7;border-color:#6e6e73}`
    : '';

  return `
:root{--bg-0:#0b0b0c;--bg-1:#101012;--bg-2:#141416;--bg-3:#1a1a1c;--line:#2a2a2c;--line-soft:#1f1f21;
--text-1:#f5f5f7;--text-2:#a0a0a6;--text-3:#6e6e73;
--viz-1:#ffffff;--viz-2:#9a9aa0;--viz-3:#5c5c62;
--font-ui:"Inter",-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,"Segoe UI",Roboto,sans-serif;
--font-mono:"SF Mono",ui-monospace,Menlo,Consolas,monospace;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg-0);color:var(--text-1);font-family:var(--font-ui);line-height:1.65;-webkit-font-smoothing:antialiased}
.canvas{padding:64px 40px;max-width:1100px;margin:0 auto}
.story-head{margin-bottom:64px}
.story-head h1{margin:0 0 6px;font-size:1.4rem;font-weight:600;letter-spacing:-.015em;line-height:1.35}
.story-meta{font-family:var(--font-mono);font-size:.69rem;color:var(--text-3)}
.tl{position:relative;max-width:880px;margin:0 auto;padding:40px 0}
.tl::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;transform:translateX(-50%);background:var(--line)}
.tl-item{position:relative;width:50%;padding:24px 40px;opacity:1!important;transform:none!important}
.tl-item.left{left:0;text-align:right}
.tl-item.right{left:50%}
.tl-dot{position:absolute;top:50%;width:9px;height:9px;border-radius:50%;background:var(--bg-0);
border:1.5px solid var(--text-1);transform:translateY(-50%)}
.tl-item.left .tl-dot{right:-5px}.tl-item.right .tl-dot{left:-5px}
.tl-card{display:inline-block;background:var(--bg-1);border:1px solid var(--line-soft);border-radius:10px;
padding:16px 24px;text-align:left;max-width:100%}
.tl-date{font-family:var(--font-mono);font-size:.69rem;color:var(--text-3)}
.tl-label{font-weight:500;margin:3px 0 7px;font-size:.88rem;line-height:1.35}
.tl-value{font-family:var(--font-mono);font-size:.78rem;color:var(--text-2)}
.tl-bar{height:2px;border-radius:1px;background:var(--text-1);opacity:.85;margin-top:10px}
.tl-pulse{position:absolute;left:50%;top:0;width:3px;height:26px;border-radius:2px;
background:linear-gradient(180deg,transparent,rgba(255,255,255,.85),transparent);
transform:translateX(-50%);opacity:0;animation:tl-pulse-flow 7s cubic-bezier(.45,.05,.55,.95) infinite;pointer-events:none}
@keyframes tl-pulse-flow{0%{top:-26px;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}
.cardgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.data-card{background:var(--bg-1);border:1px solid var(--line-soft);border-radius:10px;padding:24px;opacity:1!important;animation:none!important}
.dc-title{font-weight:500;font-size:.88rem;margin-bottom:10px;line-height:1.35}
.dc-stat{font-size:1.35rem;font-weight:600;font-family:var(--font-mono);color:var(--text-1);letter-spacing:-.01em}
.dc-bar{height:2px;border-radius:1px;background:var(--text-2);margin:10px 0 14px}
.dc-field{display:flex;justify-content:space-between;gap:10px;font-size:.69rem;padding:4px 0;border-bottom:1px dashed var(--line-soft)}
.dc-field:last-child{border-bottom:none}
.dc-field .k{color:var(--text-3)}.dc-field .v{color:var(--text-2);font-family:var(--font-mono);text-align:right}
.viz-svg-wrap{background:var(--bg-1);border:1px solid var(--line-soft);border-radius:14px;overflow:hidden}
.viz-svg-wrap svg{display:block;width:100%}
.draw-path{stroke-dasharray:none!important;stroke-dashoffset:0!important;animation:none!important}
.pop-node{opacity:1!important;animation:none!important}
@media(max-width:640px){.canvas{padding:40px 20px}.tl::before{left:10px}
.tl-item,.tl-item.left,.tl-item.right{width:100%;left:0;text-align:left;padding-left:36px;padding-right:0}
.tl-item.left .tl-dot,.tl-item.right .tl-dot{left:6px;right:auto}
.tl-pulse{left:10px}}
${watermarkCSS}
`.trim();
}


/* ---------- Interactive Presentation Link (Pro) ----------
 * Compiles the dataset + the SAME kinetic physics engine that powers the
 * workspace into a single self-contained HTML file: live Verlet particles,
 * draggable nodes, zero watermarks, zero external requests — ready to host
 * or embed anywhere.
 */

const MAX_DATASET_ROWS = 5000;

export async function buildInteractiveDocument(dataset) {
  if (
    !dataset ||
    !Array.isArray(dataset.columns) ||
    !Array.isArray(dataset.rows) ||
    !dataset.rows.length
  ) {
    return { ok: false, error: 'Nothing to export — render a story first.' };
  }
  if (dataset.rows.length > MAX_DATASET_ROWS) {
    return { ok: false, error: 'Dataset is too large for an interactive export.' };
  }

  if (engineSourceCache === null) {
    engineSourceCache = await readFile(ENGINE_PATH, 'utf8');
  }

  const payload = JSON.stringify({
    columns: dataset.columns,
    rows: dataset.rows,
  }).replace(/</g, '\\u003c');

  const doc = `<!-- Generated via Ellery AI Engine - Built by Ishaan Jha -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kinetic Data Story — exported from Ellery AI</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b0b0c;color:#f5f5f7;min-height:100vh;display:flex;flex-direction:column;
font-family:"Inter",-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,"Segoe UI",Roboto,sans-serif}
main{flex:1;display:flex;align-items:center;justify-content:center;padding:24px}
.panel{width:min(1100px,100%);background:#101012;border:1px solid #1f1f21;border-radius:14px;overflow:hidden}
canvas{display:block;width:100%}
.chips{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #1f1f21}
.chips button{background:transparent;border:1px solid #2a2a2c;border-radius:999px;padding:4px 13px;
color:#a0a0a6;font-family:"SF Mono",ui-monospace,Menlo,monospace;font-size:.6rem;letter-spacing:.08em;cursor:pointer}
.chips button:hover{border-color:#6e6e73;color:#f5f5f7}
.chips button.active{border-color:rgba(255,255,255,.6);color:#f5f5f7}
.chips button.play{background:#f5f5f7;border-color:#f5f5f7;color:#0b0b0c;font-weight:600}
.chips button.play:hover{background:#e8e8ea;color:#0b0b0c}
.hint{font-family:"SF Mono",ui-monospace,Menlo,monospace;font-size:.69rem;color:#6e6e73;
padding:10px 16px;border-top:1px solid #1f1f21}
</style>
</head>
<body>
<main><div class="panel">
<div class="chips" id="chips"><button id="playStory" class="play">▶ Play Briefing</button></div>
<canvas id="stage"></canvas>
<div class="hint">kinetic rank board · press Play Briefing for the narrated tour · sort pulses reorder the cards live · drag a card onto another to compare · click a card to set a baseline · exported from Ellery AI</div>
</div></main>
<script>
${engineSourceCache}
</script>
<script>
(function () {
  var DATA = ${payload};
  var LABELS = { 'value-desc': 'Value ↓', 'value-asc': 'Value ↑', date: 'Date', label: 'A → Z', category: 'Category', shuffle: 'Shuffle' };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var k = new ElleryKinetic(document.getElementById('stage'), DATA, { reducedMotion: reduced });
  var chips = document.getElementById('chips');
  k.availableModes().forEach(function (m) {
    var b = document.createElement('button');
    b.setAttribute('data-mode', m);
    if (m === k.mode) b.className = 'active';
    b.textContent = LABELS[m];
    chips.appendChild(b);
  });
  chips.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (b) k.setMode(b.dataset.mode);
  });
  k.onmode = function (mode) {
    Array.prototype.forEach.call(chips.querySelectorAll('[data-mode]'), function (b) {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  };
  var play = document.getElementById('playStory');
  k.onstoryinterrupt = function () { play.textContent = '▶ Play Briefing'; };
  play.addEventListener('click', function () {
    if (k.storyPlaying()) { k.stopStory(); play.textContent = '▶ Play Briefing'; return; }
    k.playStory(k.autoStory());
    play.textContent = '■ Stop';
  });
  k.start();
})();
</script>
</body>
</html>`;

  return { ok: true, doc };
}

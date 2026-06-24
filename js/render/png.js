// "Export PNG for Slides" — a high-resolution still of the current scene,
// sized 2× for sharpness, on a rounded matte panel so it drops cleanly into
// PowerPoint / Google Slides (corners and margins stay transparent).
//
// The scene bitmap comes from the shared snapshot module (which owns the
// per-layout capture paths); this file only composes the matte + tier stamp.
//
// Free tier gets a low-opacity "Generated with Ellery AI" stamp baked into
// the bottom-right corner; Pro exports are stamp-free. (This stamp is a
// client-side courtesy mark — the server-enforced branding lives in the
// share/export HTML pipeline.)

import { getState } from '../state.js';
import { watermarkRequired } from '../tier/gates.js';
import { captureScene } from './snapshot.js';

const SCALE = 2;
const PAD = 28;
const RADIUS = 16;
const BACKDROP = '#0e0e10';

export async function exportPNG(canvasEl) {
  const state = getState();
  if (!state.dataset || !canvasEl) {
    return { ok: false, error: 'Nothing to export yet.' };
  }

  try {
    const image = await captureScene(canvasEl);
    const dataUrl = compose(image);
    download(dataUrl, `ellery-${state.layout}-slide.png`);
    return { ok: true, dataUrl };
  } catch {
    return { ok: false, error: 'PNG export failed — try re-rendering the story first.' };
  }
}

/* ---------- Compose: backdrop panel + bitmap + tier stamp ---------- */

function compose({ img, width, height }) {
  const out = document.createElement('canvas');
  out.width = (width + PAD * 2) * SCALE;
  out.height = (height + PAD * 2) * SCALE;
  const ctx = out.getContext('2d');

  // Matte panel with rounded corners; everything outside it stays transparent.
  ctx.beginPath();
  roundedRect(ctx, 0, 0, out.width, out.height, RADIUS * SCALE);
  ctx.fillStyle = BACKDROP;
  ctx.fill();

  ctx.drawImage(img, PAD * SCALE, PAD * SCALE, width * SCALE, height * SCALE);

  if (watermarkRequired()) {
    const fs = 12 * SCALE;
    ctx.font = `500 ${fs}px Inter, -apple-system, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(245, 245, 247, 0.42)';
    const label = '● Generated with Ellery AI';
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, out.width - tw - 16 * SCALE, out.height - 14 * SCALE);
  }

  return out.toDataURL('image/png');
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function download(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

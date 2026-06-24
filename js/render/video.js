// "Export Dynamic MP4 for Slides" — every visualization can be recorded.
//
// MediaRecorder can only record a MediaStream, and the only stream source in
// the browser is a <canvas>. So there are two recording sources, both feeding
// ONE shared recorder (runRecorder):
//   • Kinetic Rank has a live <canvas>: we composite its real physics frames
//     (and optional Data Story camera journey) — genuine animation, unchanged.
//   • Every other layout (Timeline, Mind Map, Insight Map, Data Cards, …) is
//     SVG/DOM with no recordable stream. We capture the current scene as a
//     high-res bitmap via the shared snapshot module — preserving colors,
//     typography, selections, and state — then play a smooth reveal onto an
//     offscreen canvas and record that. The exported scene is exactly what the
//     user sees.
//
// MP4 (H.264 + silent AAC) where supported; otherwise WebM, flagged via the
// returned format. The free-tier caption is baked into the video itself.

import { getState } from '../state.js';
import { watermarkRequired } from '../tier/gates.js';
import { captureScene } from './snapshot.js';

const DURATION_MS = 3000; // kinetic physics loop
const STILL_DURATION_MS = 2600; // reveal for static layouts
const FPS = 60;
const MAX_DIM = 2160; // cap the longest recorded edge so encoders stay happy
const BACKDROP = '#0e0e10';
const CAPTION = '● Captured with Ellery Studio';
// Prefer H.264 video + AAC audio in an MP4 container — the combination Google
// Drive / Slides ingests without a slow "still being processed" transcode.
const MIME_PREFERENCE = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

let recording = false;

export async function exportMP4(canvasEl, { story = null } = {}) {
  if (recording) return { ok: false, error: 'A recording is already in progress.' };
  if (typeof MediaRecorder !== 'function') return { ok: false, error: 'This browser cannot record video.' };
  const mime = MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return { ok: false, error: 'No supported video format found.' };

  const live = canvasEl.querySelector('canvas.kinetic-canvas');
  recording = true;
  try {
    return live ? await recordKinetic(live, story, mime) : await recordStill(canvasEl, mime);
  } catch {
    recording = false;
    return { ok: false, error: 'Recording failed — try again.' };
  }
}

/* ---------- Source A: live Kinetic physics (genuine animation) ---------- */

function recordKinetic(live, story, mime) {
  const stamp = watermarkRequired();
  const sys = live.__kinetic;

  // What plays during the recording:
  //  • Data Story scenes → a narrated camera journey whose length matches the
  //    sequence, capped so exports stay slide-friendly.
  //  • Otherwise the showcase choreography (shuffle → re-rank) so the loop
  //    always SHOWS motion, never a settled still.
  let durationMs = DURATION_MS;
  let stopChoreo = null;
  if (story && story.length && sys?.playStory) {
    durationMs = Math.min(sys.storyDurationMs(story), 19000);
    stopChoreo = sys.playStory(story);
  } else if (sys?.playShowcase) {
    stopChoreo = sys.playShowcase(DURATION_MS);
  }

  const stage = document.createElement('canvas');
  stage.width = live.width;
  stage.height = live.height;
  const scale = live.width / Math.max(live.clientWidth, 1);

  const drawFrame = (ctx) => {
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, stage.width, stage.height);
    ctx.drawImage(live, 0, 0);
    if (stamp) drawCaption(ctx, stage, scale);
  };

  return runRecorder({
    stage,
    mime,
    durationMs,
    drawFrame,
    onStop: stopChoreo,
    filenameBase: `ellery-${story && story.length ? 'story' : 'kinetic-loop'}`,
    stamp,
  });
}

/* ---------- Source B: any SVG/DOM layout via a captured still ---------- */

async function recordStill(canvasEl, mime) {
  const stamp = watermarkRequired();
  const scene = await captureScene(canvasEl); // { img, width, height } at natural size

  // Record at 2× for crisp text, capped to a sane max edge.
  let w = Math.round(scene.width * 2);
  let h = Math.round(scene.height * 2);
  const longest = Math.max(w, h);
  let scale = 2;
  if (longest > MAX_DIM) {
    const k = MAX_DIM / longest;
    w = Math.round(w * k);
    h = Math.round(h * k);
    scale *= k;
  }
  const stage = document.createElement('canvas');
  stage.width = w;
  stage.height = h;

  // A smooth reveal of the real scene: fade in with a gentle scale settle,
  // then hold. Communicates "presentation asset" without faking motion the
  // static layout never had.
  const REVEAL_MS = 1040;
  const drawFrame = (ctx, elapsed) => {
    const p = Math.min(1, elapsed / REVEAL_MS);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = e;
    const s = 1.05 - 0.05 * e;
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(scene.img, 0, 0, w, h);
    ctx.restore();
    if (stamp) drawCaption(ctx, stage, scale);
  };

  return runRecorder({
    stage,
    mime,
    durationMs: STILL_DURATION_MS,
    drawFrame,
    filenameBase: `ellery-${getState().layout}-slide`,
    stamp,
  });
}

function drawCaption(ctx, stage, scale) {
  const fs = Math.max(11 * scale, 11);
  ctx.font = `500 ${fs}px Inter, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(245, 245, 247, 0.45)';
  const tw = ctx.measureText(CAPTION).width;
  ctx.fillText(CAPTION, stage.width - tw - 14 * scale, stage.height - 12 * scale);
}

/* ---------- Shared recorder: stream → MediaRecorder → download ---------- */

function runRecorder({ stage, mime, durationMs, drawFrame, onStop = null, filenameBase, stamp }) {
  return new Promise((resolve) => {
    const ctx = stage.getContext('2d');
    const start = performance.now();
    const frame = () => drawFrame(ctx, performance.now() - start);
    // Timer-driven (not rAF) so recording keeps producing frames even if the
    // browser throttles animation callbacks.
    const compositor = setInterval(frame, 1000 / FPS);
    frame();

    const stream = stage.captureStream(FPS);

    // Mux in a silent audio track. A video-only MP4 is a common cause of
    // Google Drive/Slides getting stuck "still being processed"; a real
    // (silent) AAC track lets their pipeline finalize immediately.
    let audioCtx = null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        const dest = audioCtx.createMediaStreamDestination();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0; // fully silent
        osc.connect(gain).connect(dest);
        osc.start();
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      }
    } catch {
      audioCtx = null;
    }

    const chunks = [];
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 128_000,
    });

    const finish = (result) => {
      if (onStop) onStop();
      clearInterval(compositor);
      stream.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close().catch(() => {});
      recording = false;
      resolve(result);
    };

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.onerror = () => finish({ ok: false, error: 'Recording failed — try again.' });
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) return finish({ ok: false, error: 'Recording produced no frames.' });
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenameBase}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      finish({ ok: true, format: ext, bytes: blob.size, stamped: stamp });
    };

    // Start without a timeslice so the recorder emits one fully-finalized
    // segment on stop, then flush before building the blob — so the downloaded
    // file is complete and seekable.
    rec.start();
    setTimeout(() => {
      if (rec.state !== 'inactive') {
        if (typeof rec.requestData === 'function') rec.requestData();
        rec.stop();
      }
    }, durationMs);
  });
}

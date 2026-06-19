// "Export Dynamic MP4 for Slides" — records 3 seconds of the live Kinetic
// Canvas physics at 60 FPS via MediaRecorder. Frames are composited onto an
// offscreen canvas so the free-tier caption can be baked into the video
// itself without ever appearing on the live workspace canvas. Pro exports
// composite the same frames with no caption.
//
// MP4 (H.264) is used where the browser supports recording it; otherwise
// the recording falls back to WebM and the toast/filename say so. (The
// caption is a client-side courtesy mark, like the PNG stamp — the
// server-enforced branding lives in the share/export HTML pipeline.)

import { watermarkRequired } from '../tier/gates.js';

const DURATION_MS = 3000;
const FPS = 60;
const CAPTION = '● Captured with Ellery Studio — Built by Ishaan Jha';
const MIME_PREFERENCE = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm',
];

let recording = false;

export function exportMP4(canvasEl, { story = null } = {}) {
  if (recording) return Promise.resolve({ ok: false, error: 'A recording is already in progress.' });

  const live = canvasEl.querySelector('canvas.kinetic-canvas');
  if (!live) {
    return Promise.resolve({
      ok: false,
      error: 'Switch to the Kinetic Canvas layout to record the physics.',
    });
  }
  if (typeof MediaRecorder !== 'function') {
    return Promise.resolve({ ok: false, error: 'This browser cannot record video.' });
  }
  const mime = MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) {
    return Promise.resolve({ ok: false, error: 'No supported video format found.' });
  }

  return new Promise((resolve) => {
    recording = true;
    const stamp = watermarkRequired();

    // What plays during the recording:
    //  • Data Story scenes (if provided) → a narrated camera journey whose
    //    length matches the sequence, capped so exports stay slide-friendly.
    //  • Otherwise the showcase choreography (shuffle → re-rank) so the loop
    //    always SHOWS motion, never a settled still.
    const sys = live.__kinetic;
    let durationMs = DURATION_MS;
    let stopChoreo = null;
    if (story && story.length && sys?.playStory) {
      // Cap high enough that the title card + scenes + Key Findings card all
      // play to completion (default auto-stories run ~17s incl. framing).
      durationMs = Math.min(sys.storyDurationMs(story), 19000);
      stopChoreo = sys.playStory(story);
    } else if (sys?.playShowcase) {
      stopChoreo = sys.playShowcase(DURATION_MS);
    }

    // Compositor: live frames + (free tier) caption.
    const stage = document.createElement('canvas');
    stage.width = live.width;
    stage.height = live.height;
    const ctx = stage.getContext('2d');
    const scale = live.width / Math.max(live.clientWidth, 1);

    const composite = () => {
      ctx.fillStyle = '#0e0e10';
      ctx.fillRect(0, 0, stage.width, stage.height);
      ctx.drawImage(live, 0, 0);
      if (stamp) {
        const fs = Math.max(11 * scale, 11);
        ctx.font = `500 ${fs}px Inter, -apple-system, "Segoe UI", sans-serif`;
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(245, 245, 247, 0.45)';
        const tw = ctx.measureText(CAPTION).width;
        ctx.fillText(CAPTION, stage.width - tw - 14 * scale, stage.height - 12 * scale);
      }
    };
    // Timer-driven (not rAF) so recording keeps producing frames even if the
    // browser throttles animation callbacks.
    const compositor = setInterval(composite, 1000 / FPS);
    composite();

    const stream = stage.captureStream(FPS);
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });

    const finish = (result) => {
      if (stopChoreo) stopChoreo();
      clearInterval(compositor);
      stream.getTracks().forEach((t) => t.stop());
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
      a.download = `ellery-${story && story.length ? 'story' : 'kinetic-loop'}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      finish({ ok: true, format: ext, bytes: blob.size, stamped: stamp });
    };

    rec.start(250);
    setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, durationMs);
  });
}

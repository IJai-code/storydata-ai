// Early Access Preview modal.
//
// During the preview, every Pro feature is unlocked for everyone (granted at
// boot via the existing sandbox endpoint — see js/app.js). There is no payment
// flow, no checkout, and no card UI here: this modal is purely informational,
// explaining what a feature does and that it is currently included for free.
// Paid subscriptions will be reintroduced (with a real provider) post-preview.

import { getState } from '../state.js';
import { maxRows } from './gates.js';

const TRIGGER_COPY = {
  'layout-locked': {
    kicker: 'Pro layout',
    headline: 'The deep, zoomable Insight Map.',
    sub: 'A normally-Pro layout — and it’s yours during the preview.',
  },
  simulation: {
    kicker: 'Live Simulation',
    headline: 'Watch your data flow — in real time.',
    sub: 'Live Simulation Mode sends glowing pulses down every data pathway of your mindmaps and timelines.',
  },
  'row-cap': {
    kicker: 'Unlimited rows',
    headline: 'Render every row of your data.',
    sub: 'No row ceiling during the preview — every record is visualized.',
  },
  interactive: {
    kicker: 'Interactive export',
    headline: 'Ship the physics, not a screenshot.',
    sub: 'Compile your live, draggable kinetic canvas into one self-contained file — ready to host or embed anywhere.',
  },
  export: {
    kicker: 'Export',
    headline: 'Ship clean, embeddable code.',
    sub: 'One click exports a self-contained, watermark-free HTML story.',
  },
  upgrade: {
    kicker: 'Ellery Pro',
    headline: 'The full storytelling engine.',
    sub: 'Everything in Free, with no ceilings and your brand on it.',
  },
  preview: {
    kicker: 'Early Access Preview',
    headline: 'Everything’s unlocked — on us.',
    sub: 'All Pro features are included for everyone while Ellery is in active development.',
  },
};

let modalRoot = null;

export function initPaywall(root) {
  modalRoot = root;
}

// Open the informational modal. Pro sessions don't see feature gates, but they
// can still open the explicit 'preview' view (from the topbar pill).
export function openPaywall(trigger = 'upgrade', detail = {}) {
  if (!modalRoot) return;
  if (getState().tier === 'pro' && trigger !== 'preview') return;

  const cap = maxRows();
  const capLabel = Number.isFinite(cap) ? cap : 150;
  const copy = TRIGGER_COPY[trigger] || TRIGGER_COPY.upgrade;
  const headline =
    trigger === 'row-cap' && detail.totalRows
      ? `Your data has ${detail.totalRows.toLocaleString()} rows — all of them render in the preview.`
      : copy.headline;

  modalRoot.innerHTML = `
    <div class="modal-overlay" id="paywallOverlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="paywallTitle">
        <button class="modal-close" id="paywallClose" aria-label="Close">✕</button>
        <div class="modal-body">
          <div class="pitch">
            <div class="paywall-kicker">${copy.kicker}</div>
            <h2 id="paywallTitle">${headline}</h2>
            <p class="paywall-sub">${copy.sub}</p>
            <ul>
              <li>Unlimited rows — no ${capLabel}-row ceiling</li>
              <li>Deep, zoomable Insight Map layout</li>
              <li>Live Simulation Mode — glowing data pulses in real time</li>
              <li>Zero watermarks anywhere — including clean MP4 captures</li>
              <li>Interactive Presentation Link — live physics in one file</li>
              <li>Export Clean Code — embed-ready standalone HTML</li>
            </ul>
          </div>
          <div class="checkout preview-pane">
            <div class="paywall-kicker">🎉 Early Access Preview</div>
            <h2 class="preview-pane-title">All Pro features, unlocked for everyone.</h2>
            <p class="paywall-sub">No card, no checkout. Everything is currently included while
            Ellery is in active development — paid subscriptions will launch later.</p>
            <div class="plan-row">
              <div class="plan-card">
                <span class="plan-name">Free</span>
                <span class="plan-state">Future plan</span>
              </div>
              <div class="plan-card plan-card-pro">
                <span class="plan-name">Pro</span>
                <span class="plan-state">Included in Preview · Currently Unlocked</span>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-wide" id="paywallAck">
              Got it — keep building
            </button>
          </div>
        </div>
      </div>
    </div>`;

  wireModal();
}

// Explicit Early Access info view, available to every tier (topbar pill).
export function openPreviewInfo() {
  openPaywall('preview');
}

function wireModal() {
  const overlay = document.getElementById('paywallOverlay');

  const close = () => {
    modalRoot.innerHTML = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('paywallClose').addEventListener('click', close);
  document.getElementById('paywallAck').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

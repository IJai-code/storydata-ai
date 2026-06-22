// Ellery AI — entry point. Fetches the authoritative session from the
// server, then wires the store to the panel, canvas, paywall, and auth.

import { refreshSession } from './tier/gates.js';
import { setState } from './state.js';
import { initCanvas } from './render/canvas.js';
import { initPanel, loadDemo } from './ui/panel.js';
import { initPaywall, openPaywall } from './tier/paywall.js';
import { initAuth } from './ui/auth.js';
import { initTutorial } from './ui/tutorial.js';
import { initToasts, toast } from './ui/toast.js';
import { api } from './api.js';

async function boot() {
  initToasts(document.getElementById('toastRoot'));
  initPaywall(document.getElementById('modalRoot'));
  initAuth({ gate: document.getElementById('gate'), area: document.getElementById('authArea') });
  initTutorial(document.getElementById('tutorialRoot'), document.getElementById('embedHelp'));

  // Independent of the network — render/measure the banner before any await so
  // its height is applied even if the backend is slow or unreachable.
  initPreviewBanner();

  const session = await refreshSession();

  // Early Access Preview: every Pro feature is unlocked for everyone while
  // Ellery is in active development. We grant Pro through the EXISTING sandbox
  // endpoint (no real payment, no backend change, no card UI). The server then
  // holds a Pro session cookie, so later boots short-circuit this block.
  if (session.ok && session.tier !== 'pro') {
    const unlock = await api.checkoutSandbox({
      name: 'Ellery Preview',
      number: '4242 4242 4242 4242',
      exp: '12/34',
      cvv: '123',
    });
    if (unlock.ok) await refreshSession(unlock);
  }

  initPanel();
  initCanvas(document.getElementById('canvas'), {
    gateDenied: () => openPaywall('layout-locked'),
  });

  if (!session.ok) {
    toast(session.error || 'Could not reach the server — running with free-tier defaults.', 'error');
  }

  // Delegated actions from dynamically rendered content (e.g. empty state).
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'load-demo') loadDemo();
  });

  // Hidden developer override — intentionally not in the UI. From the
  // browser console, run:  __elleryDevReset()  (drops the session to free
  // for funnel re-testing). Local hosts only, so production ships no backdoor
  // — and the server route is likewise disabled outside dev.
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  if (isLocalHost) {
    Object.defineProperty(window, '__elleryDevReset', {
      value: async () => {
        const result = await api.devReset();
        if (!result.ok) return result.error || 'reset failed';
        await refreshSession(result);
        setState({ simulation: false });
        toast('Back on the free tier — funnel reset.', 'warn');
        return 'ok — session is free tier';
      },
      enumerable: false,
    });
  }
}

// Early Access banner: dismissible, with its height fed to the layout so the
// fixed-height workspace below it never overflows the viewport.
function initPreviewBanner() {
  const banner = document.getElementById('previewBanner');
  if (!banner) return;
  const DISMISS_KEY = 'ellery_preview_banner_dismissed';
  try {
    if (localStorage.getItem(DISMISS_KEY) === '1') banner.hidden = true;
  } catch { /* ignore storage errors */ }

  const measure = () => {
    const h = banner.hidden ? 0 : banner.offsetHeight;
    document.documentElement.style.setProperty('--banner-h', `${h}px`);
  };
  measure();
  window.addEventListener('resize', measure);

  document.getElementById('previewBannerClose')?.addEventListener('click', () => {
    banner.hidden = true;
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    measure();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

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

  const session = await refreshSession();

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

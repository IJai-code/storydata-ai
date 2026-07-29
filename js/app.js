// Ellery AI — entry point. Fetches the authoritative session from the
// server, then wires the store to the panel, canvas, paywall, and auth.

import { refreshSession, EARLY_ACCESS_PREVIEW, previewSession } from './tier/gates.js';
import { setState, subscribe } from './state.js';
import { initCanvas } from './render/canvas.js';
import { initPanel, loadDemo, openSavedCase } from './ui/panel.js';
import { initPaywall, openPaywall } from './tier/paywall.js';
import { initAuth } from './ui/auth.js';
import { initTutorial } from './ui/tutorial.js';
import { initToasts, toast } from './ui/toast.js';
import { api } from './api.js';

async function boot() {
  initToasts(document.getElementById('toastRoot'));
  initPaywall(document.getElementById('modalRoot'));
  initAuth({ area: document.getElementById('authArea') });
  initTutorial(document.getElementById('tutorialRoot'), document.getElementById('embedHelp'));

  // Bring the workspace up FIRST, before touching the network. The panel and
  // canvas read tier/limits from the store and re-sync whenever those change,
  // so a slow or sleeping backend can never leave the UI half-wired with dead
  // buttons — it just starts on defaults and unlocks a moment later.
  initPanel();
  initCanvas(document.getElementById('canvas'), {
    gateDenied: () => openPaywall('layout-locked'),
  });

  // Delegated actions from dynamically rendered content (e.g. empty state).
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'load-demo') loadDemo();
  });

  // Refresh must never lose the investigation. The working session — the same
  // shape a saved case carries, plus the active trace — mirrors to this device
  // on every change and is restored before the network is even consulted.
  restoreWorkingSession();
  subscribe((state, changed) => {
    if (changed.some((k) => ['dataset', 'layout', 'story', 'focus'].includes(k))) {
      persistWorkingSession(state);
    }
  });

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
  } else if (!session.ok && EARLY_ACCESS_PREVIEW) {
    // Backend unreachable/asleep. During Early Access the server grants Pro to
    // everyone, so mirror that rather than locking Pro features behind a wall.
    await refreshSession(previewSession());
  } else if (!session.ok) {
    toast(session.error || 'Could not reach the server — running with free-tier defaults.', 'warn');
  }

  // Opened from the Cases dashboard with ?case=<id>? Restore it now that the
  // tier is known, so a Pro-only saved lens is allowed, then clean the URL.
  const caseId = new URLSearchParams(location.search).get('case');
  if (caseId) {
    openSavedCase(caseId);
    history.replaceState(null, '', location.pathname);
  }

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
        toast('Back on the free tier — funnel reset.', 'warn');
        return 'ok — session is free tier';
      },
      enumerable: false,
    });
  }
}

/* ---------- Working-session persistence ---------- */

const SESSION_KEY = 'ellery_session';

function persistWorkingSession(state) {
  try {
    if (!state.dataset) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        dataset: state.dataset,
        layout: state.layout,
        story: state.story,
        focus: state.focus,
      })
    );
  } catch {
    /* storage full — refresh-safety degrades gracefully, nothing else breaks */
  }
}

function restoreWorkingSession() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return;
  }
  if (!saved?.dataset) return;
  // Two steps: setting the dataset alone first lets the "new dataset" handlers
  // (which clear any stale story/trace) fire harmlessly; the lens, trace, and
  // briefing then land on the next tick, exactly as the user left them.
  setState({ dataset: saved.dataset });
  setTimeout(() => {
    setState({
      layout: saved.layout || 'findings',
      focus: saved.focus || null,
      story: saved.story || null,
    });
  }, 0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

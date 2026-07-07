// First-run Welcome modal — a polished introduction, not a feature.
//
// Shows once per browser (localStorage), auto-appearing the first time the
// workspace is visible (post auth-gate), and re-openable from the topbar
// "About" link. Reuses the existing Product Catalog demo handler (clicks the
// existing [data-demo="catalog"] button) — no duplicated demo logic. Entirely
// non-essential: every step is guarded so a failure never blocks the app.
//
// Motion (overlay fade + modal scale) comes from the shared .modal-overlay /
// .modal classes, which are disabled under prefers-reduced-motion by the
// global rule in animations.css.

const SEEN_KEY = 'ellery_welcome_seen';

let overlay = null;
let lastFocus = null;
let keyHandler = null;

export function initWelcome(trigger) {
  try {
    // Manual re-open ("Show Welcome Again") — always available, ignores the flag.
    trigger?.addEventListener('click', () => open());

    if (safeGet(SEEN_KEY) === '1') return;

    // Auto-show once the workspace is actually visible (the auth gate is down).
    if (document.body.dataset.authed === 'true') {
      autoShow();
    } else {
      const obs = new MutationObserver(() => {
        if (document.body.dataset.authed === 'true') {
          obs.disconnect();
          autoShow();
        }
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['data-authed'] });
    }
  } catch {
    /* Welcome is cosmetic — never let it break the app. */
  }
}

function autoShow() {
  // Settle briefly after the gate dismisses, then show once.
  setTimeout(() => {
    if (safeGet(SEEN_KEY) !== '1') open(true);
  }, 380);
}

function open(markSeen = false) {
  try {
    if (overlay) return; // already open
    if (markSeen) safeSet(SEEN_KEY, '1'); // dismissal persists once it has been shown
    lastFocus = document.activeElement;

    overlay = document.createElement('div');
    overlay.className = 'modal-overlay welcome-overlay';
    overlay.innerHTML = template();
    document.body.appendChild(overlay);

    overlay.querySelector('.welcome-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#welcomeTryCatalog').addEventListener('click', () => {
      safeSet(SEEN_KEY, '1');
      close();
      // Reuse the existing demo handler exactly — click the real button.
      document.querySelector('[data-demo="catalog"]')?.click();
    });

    keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        trapTab(e);
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Focus the primary action so keyboard users land on the main path.
    (overlay.querySelector('#welcomeTryCatalog') || overlay.querySelector('.welcome-close'))?.focus();
  } catch {
    // If anything goes wrong, tear down cleanly and leave the app untouched.
    close();
  }
}

function close() {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  if (lastFocus && typeof lastFocus.focus === 'function') {
    lastFocus.focus();
    lastFocus = null;
  }
}

function trapTab(e) {
  const focusable = [...overlay.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function template() {
  return `
    <div class="modal welcome-modal" role="dialog" aria-modal="true"
         aria-labelledby="welcomeTitle" aria-describedby="welcomeSub">
      <button class="modal-close welcome-close" type="button" aria-label="Close welcome">✕</button>
      <div class="welcome-body">
        <div class="welcome-head">
          <span class="welcome-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ellery-mark-welcome" x1="50%" y1="0%" x2="42%" y2="100%">
                  <stop offset="0" stop-color="#FFC24D"/>
                  <stop offset="0.45" stop-color="#FF7A1E"/>
                  <stop offset="1" stop-color="#F0451A"/>
                </linearGradient>
              </defs>
              <g fill="url(#ellery-mark-welcome)">
                <path d="M33 5 C 31 11 32 16 36 20 C 31 18 26 20 24 25 C 22 18 26 9 33 5 Z"/>
                <path d="M13 27 C 31 21 48 26 57 38 C 44 32 30 33 21 40 C 24 33 18 28 13 27 Z"/>
                <path d="M16 38 C 30 34 43 38 51 49 C 40 43 30 45 23 51 C 26 44 21 39 16 38 Z"/>
                <path d="M22 49 C 31 47 39 50 45 58 C 37 53 30 55 26 59 C 28 54 26 50 22 49 Z"/>
              </g>
            </svg>
          </span>
          <h2 id="welcomeTitle">Ellery</h2>
          <p id="welcomeSub" class="welcome-sub">From raw data to evidence-backed stories.</p>
        </div>

        <p class="welcome-copy">Ellery reads structured data, finds what matters, and turns it into
          interactive, presentation-ready stories. Every finding is deterministic and traceable to
          the rows that produced it.</p>

        <div class="welcome-featured">
          <div class="welcome-featured-text">
            <h3>Product catalog</h3>
            <p>A sample retail inventory — 24 products across six categories. The fastest way
              to see Ellery work.</p>
          </div>
          <button id="welcomeTryCatalog" class="btn btn-primary welcome-cta" type="button">Load sample</button>
        </div>

        <p class="welcome-credit">Designed and engineered by Ishaan Jha.</p>
      </div>
    </div>`;
}

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode / storage full — modal simply shows again next time */
  }
}

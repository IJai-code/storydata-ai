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
                <linearGradient id="ellery-mark-welcome" x1="18%" y1="82%" x2="84%" y2="14%">
                  <stop offset="0" stop-color="#F6491D"/>
                  <stop offset="0.5" stop-color="#FF8A1E"/>
                  <stop offset="1" stop-color="#FFC24D"/>
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="28.5" fill="none" stroke="url(#ellery-mark-welcome)" stroke-width="2.4" opacity="0.4"/>
              <path d="M14 48 C 15 33 26 22 47 21 C 39 24 33 29 31 35 C 37 31 45 31 50 35 C 44 35 39 38 36 43 C 33 39 28 38 24 40 C 27 35 25 30 25 30 C 19 35 16 41 14 48 Z" fill="url(#ellery-mark-welcome)"/>
              <path d="M44 14 l1.3 3.4 3.4 1.3 -3.4 1.3 -1.3 3.4 -1.3 -3.4 -3.4 -1.3 3.4 -1.3 Z" fill="#FFE08A"/>
            </svg>
          </span>
          <span class="welcome-kicker">Welcome</span>
          <h2 id="welcomeTitle">Welcome to Ellery</h2>
          <p id="welcomeSub" class="welcome-sub">Transform complex datasets into evidence-backed stories.</p>
        </div>

        <p class="welcome-copy">Ellery helps you understand complex datasets through deterministic
          discovery, interactive visualizations, and presentation-ready exports.</p>
        <p class="welcome-copy">Unlike traditional AI tools that simply summarize spreadsheets, Ellery
          first analyzes your data, discovers meaningful patterns, and then helps you communicate those
          discoveries visually.</p>

        <div class="welcome-featured">
          <div class="welcome-featured-icon" aria-hidden="true">📦</div>
          <div class="welcome-featured-text">
            <h3>Product Catalog</h3>
            <p>A realistic retail inventory dataset demonstrating automatic profiling, Insight Map,
              Kinetic Rank, Timeline, Mind Map, Data Cards, PNG export, and MP4 export.</p>
          </div>
          <button id="welcomeTryCatalog" class="btn btn-primary welcome-cta" type="button">Try Product Catalog</button>
        </div>

        <ul class="welcome-soon" aria-label="Coming soon datasets">
          <li class="welcome-card">
            <span class="welcome-card-icon" aria-hidden="true">🚀</span>
            <span class="welcome-card-name">NASA Telemetry</span>
            <span class="welcome-card-desc">Explore spacecraft telemetry, mission events, and engineering discoveries.</span>
            <span class="welcome-badge">Coming Soon</span>
          </li>
          <li class="welcome-card">
            <span class="welcome-card-icon" aria-hidden="true">🏥</span>
            <span class="welcome-card-name">Healthcare Operations</span>
            <span class="welcome-card-desc">Operational analytics and patient-flow storytelling.</span>
            <span class="welcome-badge">Coming Soon</span>
          </li>
          <li class="welcome-card">
            <span class="welcome-card-icon" aria-hidden="true">🌍</span>
            <span class="welcome-card-name">Climate &amp; Earth Science</span>
            <span class="welcome-card-desc">Environmental monitoring and scientific exploration.</span>
            <span class="welcome-badge">Coming Soon</span>
          </li>
        </ul>

        <div class="welcome-foot">
          <span class="welcome-foot-label">Current release includes</span>
          <ul class="welcome-check">
            <li>Discovery Engine</li>
            <li>Interactive Insight Map</li>
            <li>Five visualization modes</li>
            <li>Universal PNG export</li>
            <li>Universal MP4 export</li>
          </ul>
        </div>
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

// Auth gate — simulated client auth for the product preview.
//
// The workspace is hidden behind a mandatory landing/auth screen: no user,
// no dashboard. IMPORTANT: nothing here is real authentication or a security
// boundary — credentials are validated for shape, then discarded (the
// password is never transmitted, logged, or stored; only a display
// name/email is kept in localStorage to paint the logged-in state). Server
// tier enforcement is completely independent of this gate. Replace with a
// real identity provider before launch.

import { toast } from './toast.js';

const USER_KEY = 'ellery_user';
const ACCOUNTS_KEY = 'ellery_accounts';

let gateEl = null;
let areaEl = null;

export function initAuth({ gate, area }) {
  gateEl = gate;
  areaEl = area;
  seedAccountFromCurrentUser();
  sync();
}

function currentUser() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    return u && typeof u.email === 'string' && typeof u.name === 'string' ? u : null;
  } catch {
    return null;
  }
}

/* ---------- Simulated local account registry ----------
   So the gate can show truthful "already exists" / "no account" / "wrong
   password" messages, registered emails are remembered in this browser. We
   store only a salted hash of the password — never the password itself, and
   nothing ever leaves the device. */

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveAccounts(accounts) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    /* storage full — accounts simply aren't remembered this session */
  }
}

async function hashPassword(email, password) {
  if (!(window.crypto && crypto.subtle)) return null; // insecure context fallback
  const data = new TextEncoder().encode(`ellery:${email.toLowerCase()}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Existing signed-in users predate the registry; record their email (without a
// hash, since we never stored it) so they aren't locked out on next login.
function seedAccountFromCurrentUser() {
  const user = currentUser();
  if (!user) return;
  const accounts = loadAccounts();
  const key = user.email.toLowerCase();
  if (!accounts[key]) {
    accounts[key] = { name: user.name, hash: null };
    saveAccounts(accounts);
  }
}

function sync() {
  const user = currentUser();
  document.body.dataset.authed = user ? 'true' : 'false';
  renderTopbar(user);
  if (user) {
    gateEl.innerHTML = '';
  } else {
    renderGate('signup');
  }
}

/* ---------- Topbar chip ---------- */

function renderTopbar(user) {
  if (!user) {
    areaEl.innerHTML = '';
    return;
  }
  areaEl.innerHTML = `
    <span class="auth-user" title="${escapeAttr(user.email)}">
      <span class="auth-avatar">${escapeHTML(user.name.charAt(0).toUpperCase())}</span>
      <span class="auth-name">${escapeHTML(user.name)}</span>
    </span>
    <button class="auth-link" id="authSignOut">Sign out</button>`;
  areaEl.querySelector('#authSignOut').addEventListener('click', () => {
    localStorage.removeItem(USER_KEY);
    sync();
    toast('Signed out.');
  });
}

/* ---------- Landing / auth gate ---------- */

function renderGate(mode) {
  const signup = mode === 'signup';
  gateEl.innerHTML = `
    <div class="gate-card">
      <div class="gate-brand">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="ellery-mark-gate" x1="50%" y1="0%" x2="42%" y2="100%">
                <stop offset="0" stop-color="#FFC24D"/>
                <stop offset="0.45" stop-color="#FF7A1E"/>
                <stop offset="1" stop-color="#F0451A"/>
              </linearGradient>
            </defs>
            <g fill="url(#ellery-mark-gate)">
              <path d="M33 5 C 31 11 32 16 36 20 C 31 18 26 20 24 25 C 22 18 26 9 33 5 Z"/>
              <path d="M13 27 C 31 21 48 26 57 38 C 44 32 30 33 21 40 C 24 33 18 28 13 27 Z"/>
              <path d="M16 38 C 30 34 43 38 51 49 C 40 43 30 45 23 51 C 26 44 21 39 16 38 Z"/>
              <path d="M22 49 C 31 47 39 50 45 58 C 37 53 30 55 26 59 C 28 54 26 50 22 49 Z"/>
            </g>
          </svg>
        </span>
        Ellery<em>AI</em>
      </div>
      <h1>One-Click Visual Intelligence</h1>
      <p class="gate-sub">Raw data in. A quiet, interactive data story out.</p>

      <ol class="gate-steps" aria-label="How Ellery works">
        <li><span>01</span>Drop raw CSV, JSON, or meeting notes — Ellery cleans and maps it</li>
        <li><span>02</span>Pick a story layout: timeline, card grid, or branching mindmap</li>
        <li><span>03</span>Share a preview, or export clean HTML &amp; slide-ready files</li>
      </ol>

      <form id="gateForm" novalidate>
        ${signup ? `
        <div class="checkout-field">
          <label for="gateName">Name</label>
          <input id="gateName" autocomplete="off" placeholder="Ada Lovelace">
        </div>` : ''}
        <div class="checkout-field">
          <label for="gateEmail">Email</label>
          <input id="gateEmail" type="email" autocomplete="off" placeholder="you@studio.com">
        </div>
        <div class="checkout-field">
          <label for="gatePassword">Password</label>
          <input id="gatePassword" type="password" autocomplete="new-password"
            placeholder="${signup ? 'At least 8 characters' : '••••••••'}">
        </div>
        <div class="checkout-error" id="gateError"></div>
        <button type="submit" class="btn btn-primary btn-wide" id="gateSubmit">
          ${signup ? 'Create free account' : 'Log in'}
        </button>
        <p class="checkout-note">Preview build — accounts are simulated in this browser only.
        Your details stay on this device and are never sent to a server.</p>
      </form>
      <button class="auth-switch" id="gateSwitch">
        ${signup ? 'Already have an account? Log in' : 'New to Ellery? Create a free account'}
      </button>
      <footer class="panel-credit gate-credit">Ellery Studio — Designed &amp; Engineered by Ishaan Jha</footer>
    </div>`;

  gateEl.querySelector('#gateSwitch').addEventListener('click', () =>
    renderGate(signup ? 'login' : 'signup')
  );

  const emailInput = gateEl.querySelector('#gateEmail');
  emailInput.focus();

  gateEl.querySelector('#gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = gateEl.querySelector('#gateError');
    const nameInput = gateEl.querySelector('#gateName');
    const submit = gateEl.querySelector('#gateSubmit');
    const name = signup ? nameInput.value.trim() : '';
    const email = emailInput.value.trim();
    const password = gateEl.querySelector('#gatePassword').value;

    errorEl.textContent = '';
    emailInput.classList.remove('invalid');

    if (signup && name.length < 2) {
      errorEl.textContent = 'Tell us your name (at least 2 characters).';
      nameInput.classList.add('invalid');
      nameInput.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = 'Enter a valid email address.';
      emailInput.classList.add('invalid');
      emailInput.focus();
      return;
    }
    if (password.length < 8) {
      errorEl.textContent = 'Password must be at least 8 characters.';
      return;
    }

    const accounts = loadAccounts();
    const key = email.toLowerCase();
    const existing = accounts[key];

    // Account-existence checks run before the spinner so errors feel instant.
    if (signup && existing) {
      errorEl.textContent = 'An account with this email already exists. Please log in instead.';
      emailInput.classList.add('invalid');
      emailInput.focus();
      return;
    }
    if (!signup && !existing) {
      errorEl.textContent = 'No account found with this email. Create an account to get started.';
      emailInput.classList.add('invalid');
      emailInput.focus();
      return;
    }

    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>One moment…';

    const hash = await hashPassword(email, password);

    // Login: verify the password against the stored hash. (Legacy accounts
    // seeded without a hash, or contexts without crypto, skip verification.)
    if (!signup && existing && existing.hash && hash && hash !== existing.hash) {
      submit.disabled = false;
      submit.textContent = 'Log in';
      errorEl.textContent = 'Incorrect password. Please try again.';
      gateEl.querySelector('#gatePassword').focus();
      return;
    }

    const displayName = signup
      ? name || email.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'You'
      : existing.name || email.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'You';

    // Persist the account (hash only — never the raw password) and the session.
    if (signup) {
      accounts[key] = { name: displayName, hash };
      saveAccounts(accounts);
    }

    setTimeout(() => {
      try {
        localStorage.setItem(USER_KEY, JSON.stringify({ name: displayName, email }));
      } catch {
        /* storage full — stay on the gate gracefully */
      }
      sync();
      toast(`Welcome${signup ? ' to Ellery' : ' back'}, ${displayName}.`);
    }, 450);
  });
}

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHTML(s).replace(/"/g, '&quot;');
}

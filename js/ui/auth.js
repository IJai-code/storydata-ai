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

let gateEl = null;
let areaEl = null;

export function initAuth({ gate, area }) {
  gateEl = gate;
  areaEl = area;
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
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
               stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
            <path d="M5 6.2h13.2"/>
            <path d="M5 12h9.4"/>
            <path d="M5 17.8h12"/>
            <path d="M18.6 3.4 10.2 20.6"/>
          </svg>
        </span>
        Ellery<em>AI</em>
      </div>
      <h1>One-Click Visual Intelligence</h1>
      <p class="gate-sub">Raw data in. A quiet, interactive data story out.</p>

      <ol class="gate-steps" aria-label="How Ellery works">
        <li><span>01</span>Drop raw CSV, JSON, or meeting notes — Ellery cleans and maps it</li>
        <li><span>02</span>Pick a story layout: timeline, card grid, or branching mindmap</li>
        <li><span>03</span>Share a preview, or go Pro for clean HTML &amp; slide exports</li>
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
        <p class="checkout-note">Preview build — accounts are simulated locally.
        Your password is checked for shape only and never sent or saved.</p>
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

  gateEl.querySelector('#gateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const errorEl = gateEl.querySelector('#gateError');
    const nameInput = gateEl.querySelector('#gateName');
    const name = signup ? nameInput.value.trim() : '';
    const email = emailInput.value.trim();
    const password = gateEl.querySelector('#gatePassword').value;

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

    const submit = gateEl.querySelector('#gateSubmit');
    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>One moment…';

    // Simulated session: keep only the display identity, drop the password.
    setTimeout(() => {
      const displayName =
        name || email.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'You';
      try {
        localStorage.setItem(USER_KEY, JSON.stringify({ name: displayName, email }));
      } catch {
        /* storage full — stay on the gate gracefully */
      }
      sync();
      toast(`Welcome${signup ? ' to Ellery' : ' back'}, ${displayName}.`);
    }, 650);
  });
}

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHTML(s).replace(/"/g, '&quot;');
}

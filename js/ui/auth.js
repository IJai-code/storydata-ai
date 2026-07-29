// In-app auth surface. The gate itself is now a dedicated page (login.html) so
// the product has a real authentication flow; this module only (a) guards the
// workspace by redirecting unauthenticated visitors to that page, and (b) paints
// the signed-in chip in the topbar. Session primitives live in js/auth-core.js.
// Nothing here is a security boundary — server tier enforcement is independent.

import { currentUser, signOut, seedAccountFromCurrentUser } from '../auth-core.js';

const LOGIN_URL = '../login.html';
let areaEl = null;

export function initAuth({ area } = {}) {
  areaEl = area;
  seedAccountFromCurrentUser();
  const user = currentUser();
  document.body.dataset.authed = user ? 'true' : 'false';
  if (!user) {
    window.location.replace(LOGIN_URL);
    return;
  }
  renderTopbar(user);
}

function renderTopbar(user) {
  if (!areaEl) return;
  areaEl.innerHTML = `
    <span class="auth-user" title="${escapeAttr(user.email)}">
      <span class="auth-avatar">${escapeHTML(user.name.charAt(0).toUpperCase())}</span>
      <span class="auth-name">${escapeHTML(user.name)}</span>
    </span>
    <button class="auth-link" id="authSignOut">Sign out</button>`;
  areaEl.querySelector('#authSignOut').addEventListener('click', () => {
    signOut();
    document.body.dataset.authed = 'false';
    window.location.replace(LOGIN_URL);
  });
}

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHTML(s).replace(/"/g, '&quot;');
}

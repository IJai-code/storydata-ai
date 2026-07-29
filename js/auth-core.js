// Workspace identity for the product shell (login page, Cases dashboard, and
// the app's redirect guard). This is not authentication and doesn't pretend to
// be: a name + email pair labels the workspace in this browser, nothing is
// transmitted, and server tier enforcement is completely independent. Replace
// with a real identity provider when accounts become real.

export const USER_KEY = 'ellery_user';
const ACCOUNTS_KEY = 'ellery_accounts';

export function currentUser() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    return u && typeof u.email === 'string' && typeof u.name === 'string' ? u : null;
  } catch {
    return null;
  }
}

export function setSession(name, email) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify({ name, email }));
    return true;
  } catch {
    return false;
  }
}

export function signOut() {
  // The working session goes with the identity — the next person on this
  // device should not inherit an in-progress investigation.
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('ellery_session');
  } catch { /* ignore */ }
}

/* ---------- Known identities on this device ----------
   Remembers the name used with each email so a returning person only has to
   re-enter their email. Nothing more is stored. */

export function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveAccounts(accounts) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)); } catch { /* full */ }
}

// Identities that predate the registry get recorded on sight, so the name
// still autofills next time.
export function seedAccountFromCurrentUser() {
  const user = currentUser();
  if (!user) return;
  const accounts = loadAccounts();
  const key = user.email.toLowerCase();
  if (!accounts[key]) {
    accounts[key] = { name: user.name };
    saveAccounts(accounts);
  }
}

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function displayNameFrom(email, name) {
  return (name && name.trim()) || email.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'You';
}

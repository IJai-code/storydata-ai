// Shared simulated-auth primitives for the product shell (login page, Cases
// dashboard, and the app's redirect guard). This is NOT real authentication —
// it validates credential SHAPE and keeps a local session so the multi-page
// flow behaves like a real product. Nothing leaves the device; the password is
// only ever hashed for a local "wrong password" check, never transmitted or
// stored in the clear. Server tier enforcement is independent of any of this.
// Replace with a real identity provider before launch.

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
  try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
}

/* ---------- Local account registry (truthful gate messages) ---------- */

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

export async function hashPassword(email, password) {
  if (!(window.crypto && crypto.subtle)) return null; // insecure context fallback
  const data = new TextEncoder().encode(`ellery:${email.toLowerCase()}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Existing signed-in users predate the registry; record their email so a later
// login isn't wrongly rejected as "no account".
export function seedAccountFromCurrentUser() {
  const user = currentUser();
  if (!user) return;
  const accounts = loadAccounts();
  const key = user.email.toLowerCase();
  if (!accounts[key]) {
    accounts[key] = { name: user.name, hash: null };
    saveAccounts(accounts);
  }
}

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function displayNameFrom(email, name) {
  return (name && name.trim()) || email.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'You';
}

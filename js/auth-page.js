// Workspace identity. One honest step: name + email + Continue. There is no
// password and no pretend verification — the pair only labels this browser's
// workspace (see auth-core.js), and the page says so. If the email has been
// used here before, its stored name fills in so a returning person can just
// hit Continue.

import {
  currentUser,
  setSession,
  loadAccounts,
  saveAccounts,
  validEmail,
  displayNameFrom,
} from './auth-core.js';

// Where to land after: the workspace, unless this browser already has saved
// cases — the dashboard is for returning users, never a first-run stop.
function destination() {
  try {
    const cases = JSON.parse(localStorage.getItem('ellery_saved_stories') || '[]');
    return Array.isArray(cases) && cases.length ? 'cases.html' : 'app/';
  } catch {
    return 'app/';
  }
}

// Already set up? Skip the form entirely.
if (currentUser()) location.replace(destination());

const els = {
  name: document.getElementById('fName'),
  email: document.getElementById('fEmail'),
  error: document.getElementById('authError'),
  form: document.getElementById('authForm'),
};

// A returning email gets its remembered name back.
els.email.addEventListener('change', () => {
  const known = loadAccounts()[els.email.value.trim().toLowerCase()];
  if (known?.name && !els.name.value.trim()) els.name.value = known.name;
});

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = els.name.value.trim();
  const email = els.email.value.trim();
  els.error.textContent = '';
  els.name.classList.remove('invalid');
  els.email.classList.remove('invalid');

  if (name.length < 2) return fail('Add your name (at least 2 characters).', els.name);
  if (!validEmail(email)) return fail('Enter a valid email address.', els.email);

  const accounts = loadAccounts();
  const displayName = displayNameFrom(email, name);
  accounts[email.toLowerCase()] = { name: displayName };
  saveAccounts(accounts);
  setSession(displayName, email);
  location.replace(destination());
});

function fail(message, el) {
  els.error.textContent = message;
  el.classList.add('invalid');
  el.focus();
}

els.name.focus();

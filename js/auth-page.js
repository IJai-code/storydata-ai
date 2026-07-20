// The login / signup page. Reuses the shared simulated-auth primitives and,
// on success, hands off to the Cases dashboard. Not real authentication (see
// auth-core.js) — but it behaves like a real flow: truthful "already exists" /
// "no account" / "wrong password" messages, hashed local password check.

import {
  currentUser,
  setSession,
  loadAccounts,
  saveAccounts,
  hashPassword,
  validEmail,
  displayNameFrom,
} from './auth-core.js';

const AFTER = 'cases.html';

// Already signed in? Skip straight to the workspace shell.
if (currentUser()) location.replace(AFTER);

const els = {
  title: document.getElementById('authTitle'),
  sub: document.getElementById('authSub'),
  nameField: document.getElementById('nameField'),
  name: document.getElementById('fName'),
  email: document.getElementById('fEmail'),
  pass: document.getElementById('fPass'),
  error: document.getElementById('authError'),
  submit: document.getElementById('authSubmit'),
  switch: document.getElementById('authSwitch'),
  form: document.getElementById('authForm'),
};

let mode = 'signup';

function applyMode() {
  const signup = mode === 'signup';
  els.title.textContent = signup ? 'Create your account' : 'Welcome back';
  els.sub.textContent = signup
    ? 'Save your cases and pick up where you left off.'
    : 'Sign in to pick up your cases.';
  els.nameField.hidden = !signup;
  els.submit.textContent = signup ? 'Create account' : 'Sign in';
  els.pass.placeholder = signup ? 'At least 8 characters' : '••••••••';
  els.switch.textContent = signup
    ? 'Already have an account? Sign in'
    : 'New to Ellery? Create an account';
  els.error.textContent = '';
  (signup ? els.name : els.email).focus();
}

els.switch.addEventListener('click', () => {
  mode = mode === 'signup' ? 'login' : 'signup';
  applyMode();
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const signup = mode === 'signup';
  const name = els.name.value.trim();
  const email = els.email.value.trim();
  const password = els.pass.value;
  els.error.textContent = '';
  els.email.classList.remove('invalid');

  if (signup && name.length < 2) return fail('Tell us your name (at least 2 characters).', els.name);
  if (!validEmail(email)) return fail('Enter a valid email address.', els.email);
  if (password.length < 8) return fail('Password must be at least 8 characters.', els.pass);

  const accounts = loadAccounts();
  const key = email.toLowerCase();
  const existing = accounts[key];

  if (signup && existing) return fail('An account with this email already exists. Sign in instead.', els.email);
  if (!signup && !existing) return fail('No account found with this email. Create one to get started.', els.email);

  els.submit.disabled = true;
  els.submit.textContent = 'One moment…';
  const hash = await hashPassword(email, password);

  if (!signup && existing.hash && hash && hash !== existing.hash) {
    els.submit.disabled = false;
    els.submit.textContent = 'Sign in';
    return fail('Incorrect password. Please try again.', els.pass);
  }

  const displayName = displayNameFrom(email, signup ? name : existing.name);
  if (signup) {
    accounts[key] = { name: displayName, hash };
    saveAccounts(accounts);
  }
  setSession(displayName, email);
  location.replace(AFTER);
});

function fail(message, el) {
  els.error.textContent = message;
  if (el) {
    el.classList.add('invalid');
    el.focus();
  }
}

applyMode();

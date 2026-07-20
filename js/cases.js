// The Cases dashboard. A case = a saved analysis (dataset + layout + optional
// briefing), stored locally by the app under the same key the workspace uses.
// Reopening a case hands its id to /app via ?case=, where the panel restores it.

import { currentUser, signOut } from './auth-core.js';

const SAVED_KEY = 'ellery_saved_stories'; // shared with js/ui/panel.js
const APP = 'app/';

// Guard: the dashboard is behind the same simulated session as the app.
const user = currentUser();
if (!user) location.replace('login.html');

function readSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function writeSaved(list) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* full */ }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderCta() {
  const cta = document.getElementById('dashCta');
  if (!cta || !user) return;
  cta.innerHTML = `
    <span class="auth-name" style="color:var(--text-2);font-size:var(--fs-sm)">${esc(user.name)}</span>
    <button class="btn btn-ghost btn-sm" id="signOut">Sign out</button>`;
  cta.querySelector('#signOut').addEventListener('click', () => {
    signOut();
    location.replace('login.html');
  });
}

function card(entry) {
  const ds = entry.dataset || {};
  const rows = ds.rows?.length ?? 0;
  const cols = ds.columns?.length ?? 0;
  const when = entry.savedAt ? new Date(entry.savedAt).toLocaleDateString() : '';
  const scenes = entry.story?.scenes?.length ? ` · ${entry.story.scenes.length}-scene briefing` : '';
  return `
    <div class="case-card" role="button" tabindex="0" data-open="${entry.id}">
      <button class="case-del" data-del="${entry.id}" aria-label="Delete case" title="Delete">✕</button>
      <div class="case-name">${esc(entry.name || 'Untitled case')}</div>
      <div class="case-meta">${rows} records · ${cols} fields · ${esc(ds.meta?.format || 'data')}</div>
      <div class="case-sub">Saved ${esc(when)}${esc(scenes)}</div>
    </div>`;
}

function render() {
  const grid = document.getElementById('casesGrid');
  const sub = document.getElementById('dashSub');
  if (!grid) return;
  const list = readSaved().sort((a, b) => (b.id || 0) - (a.id || 0));

  sub.textContent = list.length
    ? `${list.length} saved ${list.length === 1 ? 'case' : 'cases'} · reopen and re-argue any of them from the evidence.`
    : 'A case is a saved analysis — the data, the lens, and the findings you can reopen anytime.';

  if (!list.length) {
    grid.classList.add('cases-empty');
    grid.innerHTML = `
      <div class="dash-empty">
        <p>No cases yet.</p>
        <a class="btn btn-primary" href="${APP}">Open your first case</a>
      </div>`;
    return;
  }
  grid.classList.remove('cases-empty');
  grid.innerHTML = list.map(card).join('');

  grid.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      location.href = `${APP}?case=${encodeURIComponent(el.dataset.open)}`;
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') location.href = `${APP}?case=${encodeURIComponent(el.dataset.open)}`;
    });
  });
  grid.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.del);
      writeSaved(readSaved().filter((s) => s.id !== id));
      render();
    });
  });
}

if (user) {
  const greet = document.getElementById('dashGreeting');
  if (greet) greet.textContent = `${user.name.split(' ')[0]}’s cases`;
  renderCta();
  render();
}

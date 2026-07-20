// Shared behavior for the marketing + product-shell pages (everything outside
// /app): the footer, the mobile nav, active-link highlighting, and an
// auth-aware nav CTA. Pages ship their nav/footer statically where it matters
// for first paint; this only enhances.

import { currentUser } from './auth-core.js';

/* ---------- Auth-aware nav ---------- */
function syncNavCta() {
  const cta = document.getElementById('navCta');
  if (!cta) return;
  const user = currentUser();
  cta.innerHTML = user
    ? `<a class="btn btn-ghost btn-sm" href="cases.html">Cases</a>
       <a class="btn btn-primary btn-sm" href="app/">Open app</a>`
    : `<a class="btn btn-ghost btn-sm" href="login.html">Sign in</a>
       <a class="btn btn-primary btn-sm" href="app/">Open Ellery</a>`;
}

/* ---------- Mobile nav ---------- */
function wireNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }
  // Highlight the link for the current page.
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.site-nav-link').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === here) a.classList.add('active');
  });
}

/* ---------- Footer ---------- */
function renderFooter() {
  const mount = document.getElementById('siteFooter');
  if (!mount) return;
  mount.outerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a class="site-brand" href="index.html">
              <svg viewBox="0 0 64 64" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs><linearGradient id="mkf" x1="50%" y1="0%" x2="42%" y2="100%">
                  <stop offset="0" stop-color="#FFC24D"/><stop offset="0.45" stop-color="#FF7A1E"/><stop offset="1" stop-color="#F0451A"/>
                </linearGradient></defs>
                <g fill="url(#mkf)">
                  <path d="M33 5 C 31 11 32 16 36 20 C 31 18 26 20 24 25 C 22 18 26 9 33 5 Z"/>
                  <path d="M13 27 C 31 21 48 26 57 38 C 44 32 30 33 21 40 C 24 33 18 28 13 27 Z"/>
                  <path d="M16 38 C 30 34 43 38 51 49 C 40 43 30 45 23 51 C 26 44 21 39 16 38 Z"/>
                  <path d="M22 49 C 31 47 39 50 45 58 C 37 53 30 55 26 59 C 28 54 26 50 22 49 Z"/>
                </g>
              </svg>Ellery
            </a>
            <p>The reasoning engine for your data. Evidence-backed, deterministic, and
              traceable to the cell.</p>
          </div>
          <div class="footer-col">
            <h4>Product</h4>
            <a href="app/">Open app</a>
            <a href="docs.html">Documentation</a>
            <a href="changelog.html">Changelog</a>
            <a href="pricing.html">Pricing</a>
          </div>
          <div class="footer-col">
            <h4>Company</h4>
            <a href="about.html">About</a>
            <a href="login.html">Sign in</a>
            <a href="cases.html">Your cases</a>
          </div>
          <div class="footer-col">
            <h4>Status</h4>
            <a href="changelog.html">Early access · Preview v1</a>
            <a href="docs.html#determinism">Reproducibility</a>
          </div>
        </div>
        <div class="footer-base">
          <span>© <span id="footYear"></span> Ellery. Built by Ishaan Jha.</span>
          <span>Deterministic analysis · no AI in the truth path.</span>
        </div>
      </div>
    </footer>`;
  const y = document.getElementById('footYear');
  if (y) y.textContent = new Date().getFullYear();
}

syncNavCta();
wireNav();
renderFooter();

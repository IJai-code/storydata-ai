// Upgrade modal + checkout.
//
// IMPORTANT: until Stripe Checkout replaces /api/checkout/sandbox, this
// remains a preview checkout: the server accepts only the standard test card
// and never logs or stores card fields. The discreet .checkout-note in the
// modal is the user-facing disclosure of that fact — do NOT remove it while
// the backend processes no real payments; a realistic-looking checkout with
// no disclosure would invite real card numbers into a dead end.

import { getState } from '../state.js';
import { refreshSession, maxRows, proPrice } from './gates.js';
import { api } from '../api.js';
import { toast } from '../ui/toast.js';

const TRIGGER_COPY = {
  'layout-locked': {
    kicker: 'Pro layout',
    headline: 'That story design is a Pro exclusive.',
    sub: 'The deep, zoomable Insight Map ships with the Pro plan.',
  },
  simulation: {
    kicker: 'Live Simulation',
    headline: 'Watch your data flow — in real time.',
    sub: 'Live Simulation Mode sends glowing pulses down every data pathway of your mindmaps and timelines.',
  },
  'row-cap': {
    kicker: 'Row limit reached',
    headline: 'Your data outgrew the free tier.',
    sub: 'Free renders the first rows only. Pro renders every single one.',
  },
  interactive: {
    kicker: 'Interactive export',
    headline: 'Ship the physics, not a screenshot.',
    sub: 'Pro compiles your live, draggable kinetic canvas into one self-contained file — ready to host or embed anywhere.',
  },
  export: {
    kicker: 'Export',
    headline: 'Ship clean, embeddable code with Pro.',
    sub: 'One click exports a self-contained, watermark-free HTML story.',
  },
  upgrade: {
    kicker: 'Ellery Pro',
    headline: 'Unlock the full storytelling engine.',
    sub: 'Everything in Free, with no ceilings and your brand on it.',
  },
};

let modalRoot = null;

export function initPaywall(root) {
  modalRoot = root;
}

export function openPaywall(trigger = 'upgrade', detail = {}) {
  if (getState().tier === 'pro' || !modalRoot) return;

  const cap = maxRows();
  const capLabel = Number.isFinite(cap) ? cap : 150;
  const price = proPrice();
  const copy = TRIGGER_COPY[trigger] || TRIGGER_COPY.upgrade;
  const headline =
    trigger === 'row-cap' && detail.totalRows
      ? `Your data has ${detail.totalRows.toLocaleString()} rows — Pro renders all of them.`
      : copy.headline;
  const sub =
    trigger === 'row-cap'
      ? `Free renders the first ${capLabel} rows. Pro renders every single one.`
      : copy.sub;

  modalRoot.innerHTML = `
    <div class="modal-overlay" id="paywallOverlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="paywallTitle">
        <button class="modal-close" id="paywallClose" aria-label="Close">✕</button>
        <div class="modal-body">
          <div class="pitch">
            <div class="paywall-kicker">${copy.kicker}</div>
            <h2 id="paywallTitle">${headline}</h2>
            <p class="paywall-sub">${sub}</p>
            <ul>
              <li>Unlimited rows — no ${capLabel}-row ceiling</li>
              <li>Deep, zoomable Insight Map layout</li>
              <li>Live Simulation Mode — glowing data pulses in real time</li>
              <li>Zero watermarks anywhere — including clean MP4 captures</li>
              <li>Interactive Presentation Link — live physics in one file</li>
              <li>Export Clean Code — embed-ready standalone HTML</li>
            </ul>
            <div class="price-card">
              <span class="price">$${price}</span><span class="per">/ month · cancel anytime</span>
            </div>
          </div>
          <div class="checkout">
            <form id="checkoutForm" novalidate>
              <div class="checkout-field">
                <label for="ccName">Name on card</label>
                <input id="ccName" autocomplete="off" placeholder="Ada Lovelace">
              </div>
              <div class="checkout-field">
                <label for="ccNumber">Card number</label>
                <input id="ccNumber" inputmode="numeric" autocomplete="off"
                  placeholder="1234 5678 9012 3456" maxlength="19">
              </div>
              <div class="checkout-split">
                <div class="checkout-field">
                  <label for="ccExp">Expiry</label>
                  <input id="ccExp" inputmode="numeric" autocomplete="off" placeholder="MM/YY" maxlength="5">
                </div>
                <div class="checkout-field">
                  <label for="ccCvv">CVV</label>
                  <input id="ccCvv" inputmode="numeric" autocomplete="off" placeholder="123" maxlength="4">
                </div>
              </div>
              <div class="checkout-error" id="checkoutError"></div>
              <button type="submit" class="btn btn-neon btn-pay" id="payBtn">
                Start Pro — $${price}/mo
              </button>
              <p class="checkout-note">Preview build — payments are disabled; cards are never
              charged or stored. Use the demo card 4242&nbsp;4242&nbsp;4242&nbsp;4242 to explore Pro.</p>
            </form>
          </div>
        </div>
      </div>
    </div>`;

  wireModal();
}

function wireModal() {
  const overlay = document.getElementById('paywallOverlay');
  const form = document.getElementById('checkoutForm');
  const numberInput = document.getElementById('ccNumber');
  const expInput = document.getElementById('ccExp');
  const errorEl = document.getElementById('checkoutError');
  const payBtn = document.getElementById('payBtn');

  const close = () => {
    modalRoot.innerHTML = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('paywallClose').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Input formatting: card number groups of 4, expiry auto-slash.
  numberInput.addEventListener('input', () => {
    const digits = numberInput.value.replace(/\D/g, '').slice(0, 16);
    numberInput.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    numberInput.classList.remove('invalid');
    errorEl.textContent = '';
  });
  expInput.addEventListener('input', () => {
    let d = expInput.value.replace(/\D/g, '').slice(0, 4);
    if (d.length >= 3) d = `${d.slice(0, 2)}/${d.slice(2)}`;
    expInput.value = d;
    expInput.classList.remove('invalid');
  });
  numberInput.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (payBtn.classList.contains('processing')) return;

    errorEl.textContent = '';
    payBtn.classList.add('processing');
    const restoreLabel = payBtn.innerHTML;
    payBtn.innerHTML = '<span class="spinner"></span>Processing…';

    const result = await api.checkoutSandbox({
      name: document.getElementById('ccName').value.trim(),
      number: numberInput.value,
      exp: expInput.value,
      cvv: document.getElementById('ccCvv').value.trim(),
    });

    if (!result.ok) {
      payBtn.classList.remove('processing');
      payBtn.innerHTML = restoreLabel;
      errorEl.textContent = result.error || 'Checkout failed — try again.';
      numberInput.classList.add('invalid');
      return;
    }

    // Server session is now Pro — sync UI state from its response.
    await refreshSession(result);

    const modal = modalRoot.querySelector('.modal');
    modal.innerHTML = `
      <div class="checkout-success">
        <div class="success-ring">✓</div>
        <h2 style="margin:0">Welcome to Pro</h2>
        <p style="color:var(--text-2);margin:0">Your workspace is now Pro —
        unlimited rows, premium layouts, custom branding, clean export.</p>
      </div>`;

    setTimeout(() => {
      close();
      toast('Pro unlocked — watermark removed, all layouts live.', 'info');
    }, 1600);
  });
}

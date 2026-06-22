// Server-side tier policy — the single authoritative copy. The frontend only
// ever sees the result of these functions via /api/session.

export const FREE_ROW_CAP = 150;
export const PRO_PRICE = 12.99; // USD / month

export const LAYOUT_KEYS = ['kinetic', 'timeline', 'cards', 'nodes', 'map'];
const FREE_LAYOUTS = ['kinetic', 'timeline', 'cards', 'nodes'];
const PRO_LAYOUTS = LAYOUT_KEYS;

// EARLY ACCESS PREVIEW — TEMPORARY GRANT.
// While Ellery is in active development and paid plans are not yet live, every
// session legitimately resolves to the Pro tier. This is intentionally placed
// at the single authoritative gate (`tierOf`) that ALL server-side enforcement
// already routes through — row caps, layout access, watermark, export, gated
// modules, and Live Simulation — so every Pro feature behaves exactly as a real
// Pro subscription, with zero duplicated logic and no enforcement removed.
//
// It also sidesteps the cross-origin session-cookie problem: the GitHub Pages
// frontend and the Render backend are different origins, so the per-session Pro
// cookie set by the sandbox checkout is not reliably stored/sent — meaning a
// cookie-based upgrade would not survive across requests. Granting at the gate
// makes Pro hold for every request regardless of cookie persistence.
//
// TO END THE PREVIEW (e.g. when Stripe ships): set EARLY_ACCESS_PREVIEW to
// false (or delete it and the guard line below). Tier resolution then reverts
// to the per-session value with no other changes required.
export const EARLY_ACCESS_PREVIEW = true;

export function tierOf(req) {
  if (EARLY_ACCESS_PREVIEW) return 'pro';
  return req.session?.tier === 'pro' ? 'pro' : 'free';
}

export function limitsFor(tier) {
  const pro = tier === 'pro';
  return {
    tier,
    price: PRO_PRICE,
    maxRows: pro ? null : FREE_ROW_CAP, // null = unlimited
    layouts: pro ? PRO_LAYOUTS : FREE_LAYOUTS,
    watermark: !pro,
    export: pro,
    simulation: pro, // Live Simulation Mode — Pro exclusive
  };
}

export function rowCapFor(tier) {
  return tier === 'pro' ? Infinity : FREE_ROW_CAP;
}

/* ---------- Sandbox checkout validation ----------
 * SANDBOX ONLY: accepts exactly the standard test card. Card data is
 * validated in memory and never logged or persisted. Replace this whole
 * module's checkout path with Stripe before launch.
 */

const TEST_CARD = '4242424242424242';

export function validateSandboxCard({ number, exp, cvv } = {}) {
  const digits = String(number ?? '').replace(/\D/g, '');
  if (digits.length !== 16 || !luhnValid(digits)) {
    return { ok: false, error: 'That card number is not valid.' };
  }
  if (digits !== TEST_CARD) {
    return { ok: false, error: 'Payments are disabled in this preview build — use the demo card 4242 4242 4242 4242.' };
  }
  if (!expiryValid(String(exp ?? ''))) {
    return { ok: false, error: 'Expiry must be MM/YY and in the future.' };
  }
  if (!/^\d{3,4}$/.test(String(cvv ?? '').trim())) {
    return { ok: false, error: 'CVV must be 3–4 digits.' };
  }
  return { ok: true };
}

function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = +digits[i];
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function expiryValid(exp) {
  const m = exp.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = +m[1];
  const year = 2000 + +m[2];
  if (month < 1 || month > 12) return false;
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

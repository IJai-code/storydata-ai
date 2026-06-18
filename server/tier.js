// Server-side tier policy — the single authoritative copy. The frontend only
// ever sees the result of these functions via /api/session.

export const FREE_ROW_CAP = 150;
export const PRO_PRICE = 12.99; // USD / month

export const LAYOUT_KEYS = ['kinetic', 'timeline', 'cards', 'nodes', 'map'];
const FREE_LAYOUTS = ['kinetic', 'timeline', 'cards', 'nodes'];
const PRO_LAYOUTS = LAYOUT_KEYS;

export function tierOf(req) {
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

// Non-blocking toast notices.

let root = null;

export function initToasts(el) {
  root = el;
}

export function toast(message, kind = 'info', ms = 3800) {
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${kind === 'info' ? '' : kind}`.trim();
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, ms);
}

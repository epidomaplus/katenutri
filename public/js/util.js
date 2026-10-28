import { esc } from '/shared/text.js';

export { esc };
export const bus = { handlers: {}, beforeLeave: async () => {}, refresh: async () => {} };
let pendingHandlers = {};
export function setHandlers(h) { pendingHandlers = h || {}; }
export function takeHandlers() { const h = pendingHandlers; pendingHandlers = {}; return h; }

export function icon(name) {
  const p = {
    home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
    users: '<path d="M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1"/><circle cx="10" cy="8" r="3"/><path d="M20 19v-1a3 3 0 0 0-2.2-2.9M16 5.1a3 3 0 0 1 0 5.8"/>',
    plan: '<path d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v4h4M8 12h8M8 16h6"/>',
    food: '<path d="M5 12h14M7 12c0-4 2.2-7 5-7s5 3 5 7M8 12v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6"/>',
    recipe: '<path d="M8 4v3M12 4v3M16 4v3M6 8h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    todo: '<path d="M8 7h10M8 12h10M8 17h6"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
    book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 5.5V21"/>',
    tools: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h3M13 12h3M8 16h3"/>',
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name] || ''}</svg>`;
}

export function toast(message) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function modal(html, { wide = false } = {}) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="box${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  m.addEventListener('click', e => { if (e.target === m) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(m);
  m.querySelector('input, select, textarea, button')?.focus();
  return { el: m, close };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Αντιγράφηκε');
  } catch {
    toast('Δεν ήταν δυνατή η αντιγραφή');
  }
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function emptyState(title, text, button, act) {
  return `<div class="empty"><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${button ? `<p><button class="primary" type="button" data-act="${act}">${esc(button)}</button></p>` : ''}</div>`;
}

export function errorBox(msg) {
  return `<div class="card empty"><h2>Κάτι δεν φορτώθηκε</h2><p>${esc(msg || 'Άγνωστο σφάλμα')}</p><button class="primary" type="button" data-act="retry">Δοκιμή ξανά</button></div>`;
}

export function sexLabel(s) {
  return s === 'female' ? 'Γυναίκα' : s === 'male' ? 'Άνδρας' : s === 'other' ? 'Άλλο' : '—';
}

export function statusLabel(s) {
  return s === 'done' ? 'Ολοκληρωμένο' : s === 'cancelled' ? 'Ακυρωμένο' : 'Προγραμματισμένο';
}

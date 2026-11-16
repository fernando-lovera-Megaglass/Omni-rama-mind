// In-app notifications (the bell in the top bar): a small per-browser store that workflows, sequences and
// other modules push into. Pages re-render the bell on the 'crm:notifications' document event.
const KEY = 'crm:notifications';
const MAX = 60;
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : null; } catch { return null; } };
const write = (list) => { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); if (typeof document !== 'undefined' && document.dispatchEvent) document.dispatchEvent(new (document.defaultView.CustomEvent)('crm:notifications')); };
const seed = () => [
  { id: 'n-seed-1', title: 'Sofía R. te asignó el ticket «Retraso en instalación»', text: '', href: 'tickets/', when: Date.now() - 3600000 * 5, read: false },
  { id: 'n-seed-2', title: 'Nuevo contacto creado desde el formulario web', text: '', href: 'contacts/', when: Date.now() - 3600000 * 26, read: false },
  { id: 'n-seed-3', title: 'Negocio «Fachada de vidrio Obras» pasó a Contrato enviado', text: '', href: 'deals/', when: Date.now() - 3600000 * 50, read: true },
];
export function notifications() {
  const list = read();
  if (list) return list;
  const s = seed();
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}
export function addNotification({ title, text = '', href = '', kind = 'app' } = {}) {
  const n = { id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, title: String(title || ''), text: String(text || ''), href, kind, when: Date.now(), read: false };
  write([n, ...notifications()]);
  return n;
}
export const unreadCount = () => notifications().filter((n) => !n.read).length;
export function markAllRead() { write(notifications().map((n) => ({ ...n, read: true }))); }
export function clearNotifications() { write([]); }

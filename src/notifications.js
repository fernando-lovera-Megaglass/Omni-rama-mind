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
export function addNotification({ title, text = '', href = '', kind = 'app', to = '', key = '' } = {}) {
  const n = { id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, title: String(title || ''), text: String(text || ''), href, kind, to, key, when: Date.now(), read: false };
  write([n, ...notifications()]);
  return n;
}
// The same event never notifies twice (a record saved again with the same owner, for instance).
export function addNotificationOnce(n) {
  if (n.key && notifications().some((x) => x.key === n.key)) return null;
  return addNotification(n);
}

// ---------- the rules of the original: «Se te ha asignado…» and «Te mencionaron…» ----------
// Preferences of Ajustes › Notificaciones (crm:notif): «Registro asignado» (email_assign) and «Menciones»
// (email_mention) are on unless switched off.
export const ACTOR = 'Fernando L.'; // who makes the changes in this browser (the app's user)
const PREF_DEFAULTS = { email_assign: true, email_mention: true, follow_activity: true };
export const notifPrefs = () => { try { return { ...PREF_DEFAULTS, ...(JSON.parse(localStorage.getItem('crm:notif')) || {}) }; } catch { return { ...PREF_DEFAULTS }; } };
const WORD = { contacts: 'el contacto', companies: 'la empresa', deals: 'el negocio', tickets: 'el ticket', tasks: 'la tarea' };
export const recordHref = (type, id) => `${type}/record/?id=${id}`;
// To the new owner when someone else assigned the record: nothing for «Sin asignar», for the person who made
// the change or when the owner did not change; the same assignment is never notified twice.
export function notifyAssigned({ type, id, name, owner, previousOwner = '', actor = ACTOR }) {
  if (!owner || owner === 'Sin asignar' || owner === previousOwner || owner === actor) return null;
  if (notifPrefs().email_assign === false) return null;
  return addNotificationOnce({ kind: 'assign', key: `assign:${type}:${id}:${owner}`, to: owner, title: `Se te ha asignado ${WORD[type] || 'el registro'} «${name || id}»`, text: `${actor} te lo asignó.`, href: recordHref(type, id) });
}
// One notification per user mentioned in a note or comment (never the author), linking to the record.
export function notifyMentions({ names = [], type = '', id = '', recordName = '', excerpt = '', href = '', actor = ACTOR, context = 'una nota' }) {
  if (notifPrefs().email_mention === false) return [];
  const out = [];
  for (const name of new Set(names)) {
    if (!name || name === actor) continue;
    const n = addNotification({ kind: 'mention', to: name, title: `Te mencionaron en ${context} en ${recordName || 'un registro'}`, text: String(excerpt || '').slice(0, 140), href: href || recordHref(type, id) });
    if (n) out.push(n);
  }
  return out;
}
// «Registros que sigues» (Ajustes › Notificaciones › follow_activity): the followers of a record (src/follows.js)
// hear about a real activity logged on it, or its owner / stage changing, by someone else — never the author,
// and the same event never twice (the key carries the event and the follower).
const FOLLOW_VERB = { note: 'registró una nota', call: 'registró una llamada', email: 'registró un correo', meeting: 'registró una reunión', task: 'creó una tarea', sms: 'registró un SMS', whatsapp: 'registró un WhatsApp', comment: 'comentó', owner: 'cambió el propietario', stage: 'cambió la etapa' };
export function notifyFollowers({ type, id, name, followers = [], kind = 'note', detail = '', actor = ACTOR, key = '' }) {
  if (notifPrefs().follow_activity === false) return [];
  const out = [];
  for (const follower of new Set(followers)) {
    if (!follower || follower === actor) continue;
    const n = addNotificationOnce({ kind: 'follow', key: key ? `${key}:${follower}` : '', to: follower, title: `Nueva actividad en ${WORD[type] || 'el registro'} «${name || id}»`, text: `${actor} ${FOLLOW_VERB[kind] || 'registró una actividad'}${detail ? `: ${String(detail).replace(/\s+/g, ' ').trim().slice(0, 140)}` : ''}`, href: recordHref(type, id) });
    if (n) out.push(n);
  }
  return out;
}
export const unreadCount = () => notifications().filter((n) => !n.read).length;
export function markAllRead() { write(notifications().map((n) => ({ ...n, read: true }))); }
export function clearNotifications() { write([]); }

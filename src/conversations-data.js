// Bandeja de entrada: conversations and their messages. With Supabase they live in the conversations /
// conversation_messages tables (supabase/conversations.sql); without them (or in local mode) in
// localStorage, seeded with the same five [Prueba] conversations. Every message also lands on the
// contact's timeline (activity type of the channel).
import { allContacts, addActivity, dbIsLive, OWNERS } from './data.js';
import { supabase } from './supabaseClient.js';

export const ME = 'Fernando L.';
export const CHANNELS = {
  email: { label: 'Correo', color: '#0091ae', activity: 'email' },
  whatsapp: { label: 'WhatsApp', color: '#25d366', activity: 'message' },
  chat: { label: 'Chat', color: '#6a78d1', activity: 'message' },
  form: { label: 'Formulario', color: '#f5a623', activity: 'message' },
};
export const STATUS_LABELS = { open: 'Abierto', closed: 'Cerrado', snoozed: 'Pospuesto' };
export const ASSIGNEES = OWNERS.filter((o) => o !== 'Sin asignar');
const LS_C = 'crm:conversations';
const LS_M = 'crm:conversation_messages';
const H = 3600000;
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const ago = (hours) => new Date(Date.now() - hours * H).toISOString();

// The five test conversations (same as the SQL seed), for local mode and for an empty table.
export function seedConversations() {
  const C = (n, subject, channel, status, assignedTo, contactId, lastH, readH, createdH) => ({ id: `a1000000-0000-4000-8000-00000000000${n}`, subject, channel, status, assignedTo, contactId, lastMessageAt: ago(lastH), readAt: readH === null ? null : ago(readH), createdAt: ago(createdH) });
  const M = (c, n, direction, body, author, h) => ({ id: `b1000000-0000-4000-8000-0000000000${c}${n}`, conversationId: `a1000000-0000-4000-8000-00000000000${c}`, direction, body, author, createdAt: ago(h) });
  return {
    conversations: [
      C(1, '[Prueba] Cotización de ventanas para oficina', 'email', 'open', ME, 1, 2, null, 48),
      C(2, '[Prueba] Medidas para la mampara', 'whatsapp', 'open', '', 2, 5, null, 24),
      C(3, '[Prueba] Consulta desde el chat de la web', 'chat', 'snoozed', 'Sofía R.', 3, 24, 24, 72),
      C(4, '[Prueba] Formulario: presupuesto de fachada', 'form', 'open', '', 4, 26, null, 26),
      C(5, '[Prueba] Garantía de doble acristalamiento', 'email', 'closed', ME, 5, 96, 96, 144),
    ],
    messages: [
      M(1, 1, 'in', 'Hola, necesito una cotización para 12 ventanas de aluminio con doble vidrio para nuestra oficina de Monterrey. ¿Me pueden ayudar?', 'Ana Ruiz', 48),
      M(1, 2, 'out', 'Claro, Ana. ¿Nos compartes las medidas aproximadas y si prefieren corredizas o abatibles?', ME, 44),
      M(1, 3, 'in', 'Son 8 corredizas de 1.5 x 1.2 m y 4 abatibles de 0.9 x 1.2 m. Adjunto el plano en el siguiente correo.', 'Ana Ruiz', 2),
      M(2, 1, 'in', 'Buenas tardes, ¿cuándo pueden venir a tomar medidas de la mampara del baño?', 'Diego Serrano', 24),
      M(2, 2, 'in', 'Estamos disponibles jueves o viernes por la mañana.', 'Diego Serrano', 5),
      M(3, 1, 'in', '¿Hacen instalaciones fuera de la ciudad?', 'Nuria Prieto', 72),
      M(3, 2, 'out', 'Sí, cubrimos todo el estado. ¿En qué localidad sería el proyecto?', 'Sofía R.', 70),
      M(3, 3, 'in', 'En Saltillo. Les escribo la semana que viene con los detalles.', 'Nuria Prieto', 69),
      M(3, 4, 'out', 'Perfecto, quedamos atentos. Dejo la conversación pospuesta hasta entonces.', 'Sofía R.', 24),
      M(4, 1, 'in', 'Nombre: Andrés Garduño · Empresa: Fachadas del Sur · Mensaje: Quiero un presupuesto para una fachada de vidrio de 120 m² en un edificio de 3 plantas.', 'Formulario web', 26),
      M(4, 2, 'in', 'Teléfono de contacto: +52 55 1234 5678. Horario preferido: tardes.', 'Formulario web', 26),
      M(5, 1, 'in', 'Hola, una de las unidades de doble acristalamiento presenta condensación entre vidrios. ¿Entra en garantía?', 'Alicia Ruiz', 144),
      M(5, 2, 'out', 'Hola Alicia, sí: la condensación interna está cubierta. Programamos la visita técnica para el martes.', ME, 120),
      M(5, 3, 'in', 'Perfecto, muchas gracias.', 'Alicia Ruiz', 98),
      M(5, 4, 'out', 'Unidad sustituida. Cerramos la conversación; cualquier cosa nos escribes.', ME, 96),
    ],
  };
}

// ---------- storage ----------
let live = dbIsLive();
let rows = [];
let msgs = [];
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn).catch((e) => console.error('[supabase] conversaciones', e)); return queue; };
const convFromDb = (r) => ({ id: r.id, subject: r.subject || '', channel: r.channel || 'email', status: r.status || 'open', assignedTo: r.assigned_to || '', contactId: r.contact_id ? Number(r.contact_id) : null, lastMessageAt: r.last_message_at, readAt: r.read_at || null, createdAt: r.created_at });
const convToDb = (c) => ({ id: c.id, subject: c.subject, channel: c.channel, status: c.status, assigned_to: c.assignedTo || '', contact_id: c.contactId || null, last_message_at: c.lastMessageAt, read_at: c.readAt || null, created_at: c.createdAt });
const msgFromDb = (m) => ({ id: m.id, conversationId: m.conversation_id, direction: m.direction, body: m.body || '', author: m.author || '', createdAt: m.created_at });
const msgToDb = (m) => ({ id: m.id, conversation_id: m.conversationId, direction: m.direction, body: m.body, author: m.author, created_at: m.createdAt });
const readLocal = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const saveLocal = () => { localStorage.setItem(LS_C, JSON.stringify(rows)); localStorage.setItem(LS_M, JSON.stringify(msgs)); };
function loadLocal() {
  const c = readLocal(LS_C);
  const m = readLocal(LS_M);
  if (Array.isArray(c) && Array.isArray(m)) { rows = c; msgs = m; return; }
  const seed = seedConversations();
  rows = seed.conversations;
  msgs = seed.messages;
  saveLocal();
}
async function loadLive() {
  const { data: c, error } = await supabase.from('conversations').select('*').order('last_message_at', { ascending: false });
  if (error) throw error;
  const { data: m, error: e2 } = await supabase.from('conversation_messages').select('*').order('created_at');
  if (e2) throw e2;
  rows = (c || []).map(convFromDb);
  msgs = (m || []).map(msgFromDb);
  if (!rows.length) {
    // The table exists but is empty: the same test conversations as the SQL seed.
    const seed = seedConversations();
    const { error: e3 } = await supabase.from('conversations').insert(seed.conversations.map(convToDb));
    if (!e3) { const { error: e4 } = await supabase.from('conversation_messages').insert(seed.messages.map(msgToDb)); if (e4) console.error('[supabase] semilla de mensajes', e4); }
    else console.error('[supabase] semilla de conversaciones', e3);
    rows = seed.conversations; msgs = seed.messages;
  }
}
export const ready = (async () => {
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tablas de conversaciones no disponibles; bandeja en localStorage.', e); loadLocal(); }
  } else loadLocal();
})();
export const conversationsLive = () => live;

// ---------- reads ----------
const contactOf = (id) => (id ? allContacts().find((c) => Number(c.id) === Number(id)) || null : null);
const lastOf = (id) => msgs.filter((m) => m.conversationId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
const isUnread = (c, last) => c.status !== 'closed' && Boolean(last) && last.direction === 'in' && (!c.readAt || new Date(c.lastMessageAt) > new Date(c.readAt));
const decorate = (c) => { const last = lastOf(c.id); return { ...c, contact: contactOf(c.contactId), lastMessage: last, unread: isUnread(c, last) }; };
export function conversations() {
  return rows.map(decorate).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
}
export function conversationById(id) {
  const c = rows.find((x) => x.id === id);
  return c ? decorate(c) : null;
}
export function messagesOf(id) {
  return msgs.filter((m) => m.conversationId === id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}
export const unreadCount = () => conversations().filter((c) => c.unread).length;

// ---------- writes ----------
const persistConv = (c) => { if (live) enqueue(async () => { const { error } = await supabase.from('conversations').upsert(convToDb(c), { onConflict: 'id' }); if (error) throw error; }); else saveLocal(); };
const excerpt = (s, n = 90) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// The message on the contact's timeline, typed by channel (e-mail or message).
function logOnContact(c, m) {
  if (!c.contactId) return;
  const ch = CHANNELS[c.channel] || CHANNELS.email;
  const contact = contactOf(c.contactId);
  addActivity({ type: ch.activity, recordType: 'contacts', recordId: Number(c.contactId), text: `${m.direction === 'out' ? 'Mensaje enviado' : 'Mensaje recibido'} por ${ch.label}: ${excerpt(m.body, 140)}`, who: m.direction === 'out' ? m.author || ME : (contact && contact.name) || m.author || 'Contacto', when: new Date(m.createdAt).getTime(), extra: { channel: ch.label, subject: c.subject, conversationId: c.id, direction: m.direction === 'out' ? 'Saliente' : 'Entrante' } });
}
export function sendMessage(id, { body, direction = 'out', author = ME, when } = {}) {
  const c = rows.find((x) => x.id === id);
  const text = String(body || '').trim();
  if (!c || !text) return null;
  const now = when || new Date().toISOString();
  const m = { id: uuid(), conversationId: id, direction, body: text, author: author || (direction === 'out' ? ME : 'Contacto'), createdAt: now };
  msgs.push(m);
  c.lastMessageAt = now;
  if (direction === 'out') { c.readAt = now; if (c.status === 'closed') c.status = 'open'; } // a reply reopens a closed thread
  if (live) enqueue(async () => { const { error } = await supabase.from('conversation_messages').insert(msgToDb(m)); if (error) throw error; });
  persistConv(c);
  logOnContact(c, m);
  return m;
}
export function createConversation({ contactId, channel = 'email', subject, body, direction = 'out', author = ME, assignedTo } = {}) {
  const text = String(body || '').trim();
  if (!subject || !String(subject).trim() || !text) return null;
  const now = new Date().toISOString();
  const c = { id: uuid(), subject: String(subject).trim(), channel: CHANNELS[channel] ? channel : 'email', status: 'open', assignedTo: assignedTo !== undefined ? assignedTo : direction === 'out' ? author : '', contactId: contactId ? Number(contactId) : null, lastMessageAt: now, readAt: direction === 'out' ? now : null, createdAt: now };
  rows.unshift(c);
  persistConv(c);
  sendMessage(c.id, { body: text, direction, author, when: now });
  return conversationById(c.id);
}
export function markRead(id) {
  const c = rows.find((x) => x.id === id);
  if (!c) return;
  if (c.readAt && new Date(c.readAt) >= new Date(c.lastMessageAt)) return;
  c.readAt = new Date().toISOString();
  persistConv(c);
}
export function assignConversation(id, who) {
  const c = rows.find((x) => x.id === id);
  if (!c) return;
  c.assignedTo = who && who !== 'Sin asignar' ? who : '';
  persistConv(c);
}
export function setConversationStatus(id, status) {
  const c = rows.find((x) => x.id === id);
  if (!c || !STATUS_LABELS[status]) return;
  c.status = status;
  persistConv(c);
}

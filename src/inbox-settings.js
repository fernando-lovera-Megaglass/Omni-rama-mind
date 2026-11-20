import { ACT_ICONS } from './action-icons.js';
// Inbox settings (Ajustes › Herramientas › Bandeja de entrada): the channels, the configured inboxes
// (channels, ANS/SLA, team views, access), the users' availability (which drives the automatic assignment of
// incoming conversations) and the spam allow/deny lists. One JSON per key in Supabase `inbox_settings`,
// localStorage otherwise.
import { dbIsLive, OWNERS } from './data.js';
import { supabase } from './supabaseClient.js';
import { reportDbError } from './db-report.js';
import { TEAMS } from './layout-defaults.js';

export const USERS = OWNERS.filter((o) => o !== 'Sin asignar');
export const TEAM_OF = { 'Fernando L.': 'Gerentes', 'Sofía R.': 'Ventas en el Extranjero', 'Diego G.': 'SACA', 'Laura M.': 'Sistemas' };
export const ALL_TEAMS = TEAMS;
export const CHANNEL_DEFS = {
  chat: { label: 'Chat', group: 'web', icon: ACT_ICONS.chat, desc: 'Chat en directo y bots en tu sitio web.' },
  forms: { label: 'Formulario', group: 'web', icon: ACT_ICONS.form, desc: 'Los envíos de formularios llegan como conversaciones.' },
  teamEmail: { label: 'Correo del equipo', group: 'team', icon: ACT_ICONS.email, desc: 'Direcciones compartidas como ventas@ o soporte@.' },
  calls: { label: 'Llamadas', group: 'team', icon: ACT_ICONS.call, desc: 'Llamadas entrantes y salientes desde la bandeja.' },
  whatsapp: { label: 'WhatsApp', group: 'team', icon: ACT_ICONS.whatsapp, desc: 'Mensajes de tu número de WhatsApp Business.' },
  messenger: { label: 'Facebook Messenger', group: 'team', icon: ACT_ICONS.chat, desc: 'Mensajes de tus páginas de Facebook.' },
};
export const SAMPLE_FORMS = [['contacto-web', 'Contacto web'], ['cotizacion', 'Solicitud de cotización'], ['catalogo', 'Descarga de catálogo']];
export const SAMPLE_PAGES = [['megaglass', 'Megaglass'], ['megaglass-mx', 'Megaglass México'], ['acristala', 'Acristala']];
const KEYS = ['channels', 'inboxes', 'availability', 'spam'];
const LS = (k) => `crm:inbox_settings:${k}`;
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `ib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
const clone = (x) => JSON.parse(JSON.stringify(x));
const now = () => new Date().toISOString();
const DEFAULTS = {
  channels: () => ({ chat: { connected: true, name: 'Chat del sitio web', welcome: '¡Hola! ¿En qué podemos ayudarte?', activeChats: 3 }, forms: { forms: [] }, teamEmail: { addresses: ['ventas@megaglass.us'] }, calls: { numbers: [] }, whatsapp: { numbers: [] }, messenger: { pages: [] } }),
  inboxes: () => [{ id: 'inbox-main', name: 'Bandeja de entrada principal', channels: ['chat', 'teamEmail:ventas@megaglass.us'], sla: { basis: 'business', firstReply: { on: false, hours: 1, minutes: 0 }, close: { on: false, hours: 24, minutes: 0 } }, views: [{ id: 'v-unassigned', name: 'Sin asignar', assignedTo: 'Todos', updatedAt: now() }, { id: 'v-mine', name: 'Mis conversaciones', assignedTo: 'Todos', updatedAt: now() }], access: { mode: 'all', users: [], teams: [] } }],
  availability: () => ({ status: { 'Fernando L.': 'available', 'Sofía R.': 'available', 'Diego G.': 'away', 'Laura M.': 'available' }, autoAssign: true }),
  spam: () => ({ allow: ['megaglass.com.mx'], deny: ['ofertas-spam.example'], autoSpam: true }),
};

// ---------- storage ----------
let live = dbIsLive();
const store = {};
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn).catch((e) => reportDbError('ajustes de la bandeja', e)); return queue; };
export const pending = () => queue;
const readLocal = (k) => { try { return JSON.parse(localStorage.getItem(LS(k))); } catch { return null; } };
function persist(k) {
  const value = store[k];
  localStorage.setItem(LS(k), JSON.stringify(value));
  if (live) enqueue(async () => { const { error } = await supabase.from('inbox_settings').upsert({ key: k, value, updated_at: now() }, { onConflict: 'key' }); if (error) throw error; });
}
async function loadLive() {
  const { data, error } = await supabase.from('inbox_settings').select('key, value');
  if (error) throw error;
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  KEYS.forEach((k) => { store[k] = map[k] && typeof map[k] === 'object' ? map[k] : DEFAULTS[k](); });
}
function loadLocal() { KEYS.forEach((k) => { const v = readLocal(k); store[k] = v && typeof v === 'object' ? v : DEFAULTS[k](); }); }
export const ready = (async () => {
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tabla inbox_settings no disponible; configuración en localStorage.', e); loadLocal(); }
  } else loadLocal();
})();
export const inboxSettingsLive = () => live;
const get = (k) => store[k] || (store[k] = DEFAULTS[k]());

// ---------- channels ----------
export const channels = () => clone(get('channels'));
export const connectChat = ({ name, welcome } = {}) => { const c = get('channels'); c.chat = { ...c.chat, connected: true, name: String(name || c.chat.name || 'Chat').trim(), welcome: String(welcome || c.chat.welcome || '') }; persist('channels'); return clone(c.chat); };
export const connectForms = (ids) => { const c = get('channels'); c.forms.forms = [...new Set([...(c.forms.forms || []), ...ids])]; persist('channels'); return clone(c.forms); };
export const addTeamEmail = (address) => { const a = String(address || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a)) return null; const c = get('channels'); if (!c.teamEmail.addresses.includes(a)) c.teamEmail.addresses.push(a); persist('channels'); return a; };
export const addNumber = (key, number) => { const n = String(number || '').replace(/[^\d+]/g, ''); if (n.replace(/\D/g, '').length < 8 || !['calls', 'whatsapp'].includes(key)) return null; const c = get('channels'); if (!c[key].numbers.includes(n)) c[key].numbers.push(n); persist('channels'); return n; };
export const connectPages = (ids) => { const c = get('channels'); c.messenger.pages = [...new Set([...(c.messenger.pages || []), ...ids])]; persist('channels'); return clone(c.messenger); };
export function disconnectChannel(key, item) {
  const c = get('channels');
  if (key === 'chat') c.chat.connected = false;
  else if (key === 'forms') c.forms.forms = item ? c.forms.forms.filter((x) => x !== item) : [];
  else if (key === 'teamEmail') c.teamEmail.addresses = item ? c.teamEmail.addresses.filter((x) => x !== item) : [];
  else if (key === 'calls' || key === 'whatsapp') c[key].numbers = item ? c[key].numbers.filter((x) => x !== item) : [];
  else if (key === 'messenger') c.messenger.pages = item ? c.messenger.pages.filter((x) => x !== item) : [];
  persist('channels');
}
// Every connected channel as an assignable id ("chat", "teamEmail:ventas@…", "calls:+52…") with a label.
export function channelOptions() {
  const c = get('channels');
  const out = [];
  if (c.chat.connected) out.push(['chat', `Chat · ${c.chat.name}`]);
  (c.forms.forms || []).forEach((f) => out.push([`forms:${f}`, `Formulario · ${(SAMPLE_FORMS.find((x) => x[0] === f) || [f, f])[1]}`]));
  (c.teamEmail.addresses || []).forEach((a) => out.push([`teamEmail:${a}`, `Correo del equipo · ${a}`]));
  (c.calls.numbers || []).forEach((n) => out.push([`calls:${n}`, `Llamadas · ${n}`]));
  (c.whatsapp.numbers || []).forEach((n) => out.push([`whatsapp:${n}`, `WhatsApp · ${n}`]));
  (c.messenger.pages || []).forEach((p) => out.push([`messenger:${p}`, `Messenger · ${(SAMPLE_PAGES.find((x) => x[0] === p) || [p, p])[1]}`]));
  return out;
}
export const channelLabel = (id) => (channelOptions().find((o) => o[0] === id) || [id, id])[1];

// ---------- inboxes ----------
export const inboxes = () => clone(get('inboxes'));
export const inboxById = (id) => { const i = get('inboxes').find((x) => x.id === id); return i ? clone(i) : null; };
const withInbox = (id, fn) => { const i = get('inboxes').find((x) => x.id === id); if (!i) return null; fn(i); persist('inboxes'); return clone(i); };
export function createInbox(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const i = { id: uuid(), name: n, channels: [], sla: { basis: 'business', firstReply: { on: false, hours: 1, minutes: 0 }, close: { on: false, hours: 24, minutes: 0 } }, views: [{ id: uuid(), name: 'Sin asignar', assignedTo: 'Todos', updatedAt: now() }], access: { mode: 'all', users: [], teams: [] } };
  get('inboxes').push(i);
  persist('inboxes');
  return clone(i);
}
export const renameInbox = (id, name) => (String(name || '').trim() ? withInbox(id, (i) => { i.name = String(name).trim(); }) : null);
export function deleteInbox(id) { const list = get('inboxes'); if (list.length <= 1) return false; const k = list.findIndex((x) => x.id === id); if (k < 0) return false; list.splice(k, 1); persist('inboxes'); return true; }
export const addInboxChannel = (id, channel) => withInbox(id, (i) => { if (!i.channels.includes(channel)) i.channels.push(channel); });
export const removeInboxChannel = (id, channel) => withInbox(id, (i) => { i.channels = i.channels.filter((c) => c !== channel); });
export const setSla = (id, patch) => withInbox(id, (i) => { i.sla = { ...i.sla, ...patch, firstReply: { ...i.sla.firstReply, ...(patch.firstReply || {}) }, close: { ...i.sla.close, ...(patch.close || {}) } }; });
export const addView = (id, { name, assignedTo = 'Todos' } = {}) => (String(name || '').trim() ? withInbox(id, (i) => { i.views.push({ id: uuid(), name: String(name).trim(), assignedTo, updatedAt: now() }); }) : null);
export const removeView = (id, viewId) => withInbox(id, (i) => { i.views = i.views.filter((v) => v.id !== viewId); });
export const setAccess = (id, access) => withInbox(id, (i) => { i.access = { mode: access.mode === 'selected' ? 'selected' : 'all', users: [...(access.users || [])], teams: [...(access.teams || [])] }; });

// ---------- availability ----------
export const availability = () => clone(get('availability'));
export const userStatus = (user) => get('availability').status[user] || 'available';
export const setAvailability = (user, status) => { const a = get('availability'); a.status[user] = status === 'away' ? 'away' : 'available'; persist('availability'); return a.status[user]; };
export const setAutoAssign = (on) => { get('availability').autoAssign = Boolean(on); persist('availability'); };
export const autoAssign = () => get('availability').autoAssign !== false;
export const availableUsers = () => USERS.filter((u) => userStatus(u) === 'available');
let pointer = 0;
// Round-robin over the available users (used when an incoming conversation arrives); '' when nobody is available.
export function nextAvailableAssignee() {
  if (!autoAssign()) return '';
  const list = availableUsers();
  if (!list.length) return '';
  const who = list[pointer % list.length];
  pointer += 1;
  return who;
}

// ---------- spam ----------
export const spam = () => clone(get('spam'));
export const isValidSpamEntry = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s || '').trim());
export function addSpamEntry(list, entry) {
  const e = String(entry || '').trim().toLowerCase();
  if (!isValidSpamEntry(e) || !['allow', 'deny'].includes(list)) return null;
  const s = get('spam');
  s[list] = s[list].filter((x) => x !== e);
  s[list === 'allow' ? 'deny' : 'allow'] = s[list === 'allow' ? 'deny' : 'allow'].filter((x) => x !== e);
  s[list].push(e);
  persist('spam');
  return e;
}
export const removeSpamEntry = (list, entry) => { const s = get('spam'); if (s[list]) s[list] = s[list].filter((x) => x !== entry); persist('spam'); };
export const setAutoSpam = (on) => { get('spam').autoSpam = Boolean(on); persist('spam'); };
// Whether a sender (e-mail) would be marked as spam: denied wins, allowed never is, the rest follows the switch.
export function isSpamSender(email) {
  const e = String(email || '').toLowerCase();
  const domain = e.split('@')[1] || '';
  const s = get('spam');
  const hit = (list) => list.some((x) => x === e || x === domain);
  if (hit(s.deny)) return true;
  if (hit(s.allow)) return false;
  return false;
}

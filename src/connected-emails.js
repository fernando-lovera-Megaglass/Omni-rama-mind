// Connected e-mail accounts (Ajustes › General › Correo): the connected_emails table with Supabase
// (localStorage otherwise), the provider catalogue, the domain-based provider detection, the simulated
// IMAP/SMTP verification, and the user's e-mail preferences (aliases, custom signatures, unsubscribe link).
// The composer and the sequences send from these accounts.
import { dbIsLive, getSetting, setSetting, settingsLive } from './data.js';
import { supabase } from './supabaseClient.js';
import { reportDbError } from './db-report.js';
import { currentUser } from './auth.js';
import { gmailAccounts, ready as gmailReady } from './gmail.js';

export const DEFAULT_USER = 'fernando-lovera@megaglass.us';
export const PROVIDERS = {
  gmail: { label: 'Google / Gmail', inbox: 'Gmail', short: 'Gmail', hosted: 'Google', oauth: true, logo: 'G' },
  gsuite: { label: 'Google Workspace', inbox: 'G Suite', short: 'Google Workspace', hosted: 'Google', oauth: true, logo: 'G' },
  outlook: { label: 'Microsoft Outlook', inbox: 'Outlook', short: 'Outlook', hosted: 'Microsoft', oauth: true, logo: 'O' },
  exchange: { label: 'Microsoft Exchange', inbox: 'Exchange', short: 'Exchange', hosted: 'Microsoft', oauth: true, logo: 'E' },
  imap: { label: 'Otro proveedor de correo electrónico', inbox: 'IMAP', short: 'IMAP', hosted: '', oauth: false, logo: '✉' },
};
export const STATUS_LABELS = { active: 'Activado', error: 'Error de conexión', disabled: 'Desactivada' };
// Public mailbox domains, plus the "MX records" of the corporate domains we pretend to look up.
const PUBLIC = { 'gmail.com': 'gmail', 'googlemail.com': 'gmail', 'outlook.com': 'outlook', 'outlook.es': 'outlook', 'hotmail.com': 'outlook', 'hotmail.es': 'outlook', 'live.com': 'outlook', 'msn.com': 'outlook' };
const MX = { 'megaglass.us': 'gsuite', 'megaglass.com.mx': 'gsuite', 'hogarsolsl.com': 'outlook', 'cristalesnorte.com': 'exchange', 'vidriosdelsur.es': 'gsuite', 'acristala.mx': 'exchange' };
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
export function detectProvider(email) {
  const domain = String(email || '').trim().toLowerCase().split('@')[1] || '';
  if (!domain) return { provider: null, domain };
  if (PUBLIC[domain]) return { provider: PUBLIC[domain], domain, viaMx: false, hosted: PROVIDERS[PUBLIC[domain]].hosted, recommend: PROVIDERS[PUBLIC[domain]].short };
  if (MX[domain]) return { provider: MX[domain], domain, viaMx: true, hosted: PROVIDERS[MX[domain]].hosted, recommend: PROVIDERS[MX[domain]].short };
  return { provider: null, domain, viaMx: true };
}
export const defaultImap = (email) => { const d = String(email || '').split('@')[1] || 'ejemplo.com'; return { imapHost: `imap.${d}`, imapPort: 993, smtpHost: `smtp.${d}`, smtpPort: 587 }; };
let verifyDelay = 700;
export const setVerifyDelay = (ms) => { verifyDelay = ms; };
// Simulated credential check: a short wait, then success unless the server/credentials look wrong.
export function verifyImap({ email, password, imapHost, imapPort, smtpHost, smtpPort } = {}) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!isEmail(email)) { resolve({ ok: false, error: 'Escribe una dirección de correo válida.' }); return; }
      if (!String(password || '').length) { resolve({ ok: false, error: 'Escribe la contraseña de la cuenta.' }); return; }
      const bad = (h) => /invalid|wrong|fail|error|\s/i.test(String(h || '')) || !String(h || '').includes('.');
      const badPort = (p) => !(Number(p) > 0 && Number(p) < 65536);
      if (bad(imapHost) || bad(smtpHost) || badPort(imapPort) || badPort(smtpPort) || /^(incorrecta|wrong)$/i.test(String(password))) { resolve({ ok: false, error: 'No se pudo conectar al servidor. Revisa el servidor, el puerto y las credenciales.' }); return; }
      resolve({ ok: true });
    }, verifyDelay);
  });
}

// ---------- storage ----------
let live = dbIsLive();
let user = DEFAULT_USER;
let rows = [];
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn).catch((e) => reportDbError('cuentas de correo', e)); return queue; };
export const pending = () => queue;
const LS = () => `crm:connected_emails:${user}`;
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `ce-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const fromDb = (r) => ({ id: r.id, userId: r.user_id, email: r.email, provider: r.provider || 'imap', status: r.status || 'active', inboxAutomation: r.inbox_automation !== false, signatureId: r.signature_id || 'default', alias: r.alias || '', imapHost: r.imap_host || null, imapPort: r.imap_port || null, smtpHost: r.smtp_host || null, smtpPort: r.smtp_port || null, username: r.username || null, createdAt: r.created_at, updatedAt: r.updated_at || r.created_at });
const toDb = (a) => ({ id: a.id, user_id: a.userId, email: a.email, provider: a.provider, status: a.status, inbox_automation: Boolean(a.inboxAutomation), signature_id: a.signatureId || 'default', alias: a.alias || '', imap_host: a.imapHost || null, imap_port: a.imapPort || null, smtp_host: a.smtpHost || null, smtp_port: a.smtpPort || null, username: a.username || null, created_at: a.createdAt, updated_at: a.updatedAt });
const seed = () => [{ id: 'd8000000-0000-4000-8000-000000000001', userId: user, email: user, provider: 'gsuite', status: 'active', inboxAutomation: true, signatureId: 'default', alias: '', imapHost: null, imapPort: null, smtpHost: null, smtpPort: null, username: null, createdAt: new Date(Date.now() - 45 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 45 * 86400000).toISOString() }];
const saveLocal = () => localStorage.setItem(LS(), JSON.stringify(rows));
// The demo account is seeded only once EVER: once the user deletes it, it must not come back.
const SEEDED_KEY = 'email:demo-seeded';
const wasSeeded = () => Boolean(getSetting(SEEDED_KEY)) || (() => { try { return localStorage.getItem('crm:email:demo-seeded') === '1'; } catch { return false; } })();
const markSeeded = () => { setSetting(SEEDED_KEY, true); try { localStorage.setItem('crm:email:demo-seeded', '1'); } catch { /* sin espacio */ } };
function loadLocal() {
  try { const r = JSON.parse(localStorage.getItem(LS())); if (Array.isArray(r)) { rows = r; return; } } catch { /* seed */ }
  if (wasSeeded()) { rows = []; return; }
  rows = seed();
  markSeeded();
  saveLocal();
}
async function loadLive() {
  const { data, error } = await supabase.from('connected_emails').select('*').eq('user_id', user).order('created_at');
  if (error) throw error;
  rows = (data || []).map(fromDb);
  if (!rows.length && user === DEFAULT_USER && !wasSeeded()) {
    rows = seed();
    markSeeded();
    const { error: e2 } = await supabase.from('connected_emails').insert(rows.map(toDb));
    if (e2) console.error('[supabase] semilla de cuentas de correo', e2);
  }
}
export const ready = (async () => {
  try { const u = await currentUser(); if (u && u.email) user = u.email; } catch { /* no session */ }
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tabla connected_emails no disponible; cuentas en localStorage.', e); loadLocal(); }
  } else loadLocal();
  try { await gmailReady; } catch { /* no real Google accounts */ }
})();
export const connectedEmailsLive = () => live;
export const userEmail = () => user;
const persist = (a) => { if (live) enqueue(async () => { const { error } = await supabase.from('connected_emails').upsert(toDb(a), { onConflict: 'id' }); if (error) throw error; }); else saveLocal(); };

// ---------- reads ----------
const out = (a) => ({ ...a });
// The real Google accounts (src/gmail.js, OAuth) sit next to the simulated ones with `real: true`; their inbox
// automation switch and default signature live in the preferences (the tokens never reach the browser).
const realRows = () => gmailAccounts().map((g) => ({ id: g.id, userId: user, email: g.email, provider: 'gmail', status: g.status, real: true, lastError: g.lastError || '', lastCheckedAt: g.lastCheckedAt, lastSyncedAt: g.lastSyncedAt, inboxAutomation: readPref(`gmail:auto:${g.id}`, true) !== false, signatureId: readPref(`gmail:sig:${g.id}`, 'default') || 'default', alias: '', imapHost: null, imapPort: null, smtpHost: null, smtpPort: null, username: null, createdAt: g.createdAt, updatedAt: g.lastCheckedAt || g.createdAt }));
export const isRealAccount = (id) => gmailAccounts().some((g) => g.id === id);
export const accounts = () => [...realRows(), ...rows.map(out)].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
export const accountById = (id) => accounts().find((x) => x.id === id) || null;
export const activeAccounts = () => accounts().filter((a) => a.status === 'active');
export const accountByEmail = (email) => accounts().find((x) => x.email.toLowerCase() === String(email || '').toLowerCase()) || null;

// ---------- writes ----------
export function connect({ email, provider = 'imap', inboxAutomation = true, imapHost = null, imapPort = null, smtpHost = null, smtpPort = null, username = null } = {}) {
  const e = String(email || '').trim().toLowerCase();
  if (!isEmail(e) || !PROVIDERS[provider]) return null;
  const now = new Date().toISOString();
  const oauth = PROVIDERS[provider].oauth;
  let a = rows.find((x) => x.email.toLowerCase() === e);
  if (a) Object.assign(a, { provider, status: 'active', inboxAutomation: Boolean(inboxAutomation), imapHost: oauth ? null : imapHost, imapPort: oauth ? null : imapPort, smtpHost: oauth ? null : smtpHost, smtpPort: oauth ? null : smtpPort, username: oauth ? null : username, updatedAt: now });
  else { a = { id: uuid(), userId: user, email: e, provider, status: 'active', inboxAutomation: Boolean(inboxAutomation), signatureId: 'default', alias: '', imapHost: oauth ? null : imapHost, imapPort: oauth ? null : imapPort, smtpHost: oauth ? null : smtpHost, smtpPort: oauth ? null : smtpPort, username: oauth ? null : username, createdAt: now, updatedAt: now }; rows.push(a); }
  persist(a);
  return out(a);
}
const patch = (id, fields) => { const a = rows.find((x) => x.id === id); if (!a) return null; Object.assign(a, fields, { updatedAt: new Date().toISOString() }); persist(a); return out(a); };
export const disable = (id) => patch(id, { status: 'disabled' });
// A reconnection after a deactivation fails once (simulated "Error de conexión"); the next attempt succeeds.
export function reconnect(id) {
  const a = rows.find((x) => x.id === id);
  if (!a) return null;
  if (a.status === 'disabled') { patch(id, { status: 'error' }); return { ok: false, account: out(a), error: 'No se pudo volver a conectar la cuenta. Inténtalo de nuevo.' }; }
  patch(id, { status: 'active' });
  return { ok: true, account: out(a) };
}
export const setAutomation = (id, on) => { if (isRealAccount(id)) { writePref(`gmail:auto:${id}`, Boolean(on)); return accountById(id); } return patch(id, { inboxAutomation: Boolean(on) }); };
export const setAccountSignature = (id, signatureId) => { if (isRealAccount(id)) { writePref(`gmail:sig:${id}`, signatureId || 'default'); return accountById(id); } return patch(id, { signatureId: signatureId || 'default' }); };
export const setAccountAlias = (id, alias) => patch(id, { alias: String(alias || '').trim() });
export function remove(id) {
  const i = rows.findIndex((x) => x.id === id);
  if (i < 0) return false;
  rows.splice(i, 1);
  if (live) enqueue(async () => { const { error } = await supabase.from('connected_emails').delete().eq('id', id); if (error) throw error; }); else saveLocal();
  return true;
}

// ---------- preferences: aliases, signatures, unsubscribe link (user_settings or localStorage) ----------
const readPref = (key, fb) => { if (settingsLive()) { const v = getSetting(key); if (v !== undefined && v !== null) return v; } try { return JSON.parse(localStorage.getItem(`crm:pref:${key}`)) ?? fb; } catch { return fb; } };
const writePref = (key, value) => { if (!setSetting(key, value)) localStorage.setItem(`crm:pref:${key}`, JSON.stringify(value)); else localStorage.setItem(`crm:pref:${key}`, JSON.stringify(value)); };
export const aliases = () => readPref('email:aliases', []);
export function addAlias(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!isEmail(e)) return null;
  const list = aliases();
  if (!list.includes(e)) { list.push(e); writePref('email:aliases', list); }
  return e;
}
export const removeAlias = (email) => { writePref('email:aliases', aliases().filter((a) => a !== email)); };
export const unsubscribeLink = () => readPref('email:unsubscribe', true);
export const setUnsubscribeLink = (on) => writePref('email:unsubscribe', Boolean(on));
export const DEFAULT_SIGNATURE = { id: 'default', name: 'Valor predeterminado (ficha de remitente)' };
export const signatures = () => readPref('email:signatures', []);
export const signatureOptions = () => [[DEFAULT_SIGNATURE.id, DEFAULT_SIGNATURE.name], ...signatures().map((s) => [s.id, s.name])];
export const signatureById = (id) => signatures().find((s) => s.id === id) || null;
export function saveSignature({ id, name, html } = {}) {
  const n = String(name || '').trim();
  if (!n) return null;
  const list = signatures();
  const s = { id: id || uuid(), name: n, html: String(html || ''), updatedAt: new Date().toISOString() };
  const i = list.findIndex((x) => x.id === s.id);
  if (i >= 0) list[i] = s; else list.push(s);
  writePref('email:signatures', list);
  return s;
}
export function deleteSignature(id) {
  writePref('email:signatures', signatures().filter((s) => s.id !== id));
  rows.forEach((a) => { if (a.signatureId === id) patch(a.id, { signatureId: 'default' }); });
}

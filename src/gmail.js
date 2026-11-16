// Real Gmail (OAuth with Google + Gmail API) through the Supabase Edge Functions in supabase/functions/gmail-*:
// configuration check (VITE_GOOGLE_CLIENT_ID in the browser; the client secret only lives in Supabase),
// the connect flow (auth URL → Google → callback → back to Omni), the connected accounts (table
// connected_accounts, read by the owner), their real status (gmail.users.getProfile), sending and disconnecting.
// The inbox sync and its import into the Bandeja de entrada live in src/gmail-inbox.js.
import { supabase } from './supabaseClient.js';

const ENV = () => import.meta.env || (typeof process !== 'undefined' && process.env) || {};
export const clientId = () => String(ENV().VITE_GOOGLE_CLIENT_ID || '').trim();
export const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email'];
export const DOCS = 'docs/gmail-setup.md';

let client = supabase;
// Tests inject a fake Supabase client (functions.invoke + from) and capture the navigation to Google.
export const setGmailClient = (c) => { client = c; };
let navigate = (url) => { window.location.assign(url); };
export const setGmailNavigator = (fn) => { navigate = fn; };

export function missingConfig() {
  const m = [];
  if (!clientId()) m.push('VITE_GOOGLE_CLIENT_ID');
  if (!client) m.push('VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY');
  return m;
}
export const gmailConfigured = () => missingConfig().length === 0;
export const configNotice = () => `Falta configurar las credenciales de Google para conectar Gmail de verdad: ${missingConfig().join(' y ')} en app/.env, más el secreto GOOGLE_CLIENT_SECRET en Supabase. Los pasos están en ${DOCS}.`;

async function invoke(name, { method = 'POST', body } = {}) {
  if (!client) throw new Error(configNotice());
  const { data, error } = await client.functions.invoke(name, { method, ...(body !== undefined ? { body } : {}) });
  if (error) {
    let message = error.message || String(error);
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') { const j = await ctx.json(); if (j && j.error) message = j.error; }
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  if (data && data.error) throw new Error(data.error);
  return data || {};
}

// ---------- accounts (connected_accounts, owner's rows) ----------
let rows = [];
const fromDb = (r) => ({ id: r.id, email: r.email, provider: 'gmail', status: r.status || 'active', lastError: r.last_error || '', lastCheckedAt: r.last_checked_at || null, lastSyncedAt: r.last_synced_at || null, createdAt: r.created_at, real: true });
const notify = () => { if (typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent('crm:gmail', { detail: { accounts: gmailAccounts() } })); };
export async function reloadAccounts() {
  if (!client || !clientId()) { rows = []; return []; }
  try {
    const { data, error } = await client.from('connected_accounts').select('id, email, provider, status, last_error, last_checked_at, last_synced_at, created_at').eq('provider', 'gmail').order('created_at');
    rows = !error && Array.isArray(data) ? data : [];
  } catch { rows = []; }
  notify();
  return gmailAccounts();
}
export const ready = reloadAccounts();
export const gmailAccounts = () => rows.map(fromDb);
export const gmailAccountById = (id) => { const r = rows.find((x) => x.id === id); return r ? fromDb(r) : null; };
export const hasGmail = () => rows.some((r) => r.status !== 'disabled');

// ---------- connect flow ----------
export async function startConnect({ returnTo = '', email = '' } = {}) {
  if (!gmailConfigured()) throw new Error(configNotice());
  const target = returnTo || (typeof location !== 'undefined' ? location.href : '');
  const data = await invoke('gmail-auth-url', { body: { returnTo: target, email } });
  if (!data.url) throw new Error('La función gmail-auth-url no devolvió la URL de Google.');
  navigate(data.url);
  return data.url;
}
// After Google sends the browser back: ?gmail=connected&email=… or ?gmail=error&reason=… (removed from the URL).
export function consumeCallbackParams(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc) return null;
  const p = new URLSearchParams(loc.search);
  const status = p.get('gmail');
  if (!status) return null;
  const out = { status, email: p.get('email') || '', reason: p.get('reason') || '' };
  ['gmail', 'email', 'reason'].forEach((k) => p.delete(k));
  const qs = p.toString();
  try { history.replaceState(null, '', `${loc.pathname}${qs ? `?${qs}` : ''}${loc.hash || ''}`); } catch { /* ignore */ }
  return out;
}

// ---------- real status, lifecycle ----------
export async function refreshStatus() {
  if (!rows.length) return [];
  const data = await invoke('gmail-account', { method: 'GET' });
  const list = Array.isArray(data.accounts) ? data.accounts : [];
  rows = rows.map((r) => { const s = list.find((x) => x.id === r.id); return s ? { ...r, status: s.status, last_error: s.lastError || null, last_checked_at: s.checkedAt || new Date().toISOString(), last_synced_at: s.lastSyncedAt || r.last_synced_at } : r; });
  notify();
  return gmailAccounts();
}
export async function disconnect(id) {
  await invoke('gmail-account', { body: { action: 'disconnect', accountId: id } });
  rows = rows.filter((r) => r.id !== id);
  notify();
  return true;
}
export async function setStatus(id, action) {
  const data = await invoke('gmail-account', { body: { action: action === 'disable' ? 'disable' : 'enable', accountId: id } });
  rows = rows.map((r) => (r.id === id ? { ...r, status: data.status || (action === 'disable' ? 'disabled' : 'active'), last_error: data.lastError || null } : r));
  notify();
  return gmailAccountById(id);
}

// ---------- send ----------
export async function sendMail({ accountId, to, cc, bcc, subject, html, text, threadId, inReplyTo, references, fromName } = {}) {
  const list = [].concat(to || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!list.length) throw new Error('Falta el destinatario.');
  return invoke('gmail-send', { body: { accountId, to: list, cc: [].concat(cc || []).filter(Boolean), bcc: [].concat(bcc || []).filter(Boolean), subject, html, text, threadId, inReplyTo, references, fromName } });
}
export const callFunction = invoke;

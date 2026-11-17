// Real Twilio (calls from the browser, inbound calls, SMS and WhatsApp) through the Supabase Edge
// Functions in supabase/functions/twilio-*: the connection lives in twilio_connections (one per user),
// the Auth Token in twilio_connection_secrets (service role only — the browser never sees it).
import { supabase } from './supabaseClient.js';

let client = supabase;
// Tests inject a fake Supabase client (functions.invoke + from).
export const setTwilioClient = (c) => { client = c; };

async function invoke(name, { method = 'POST', body } = {}) {
  if (!client) throw new Error('Falta la conexión con Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en app/.env).');
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

// ---------- connection state ----------
let connection = null;
let loaded = false;
const notify = () => { if (typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent('crm:twilio', { detail: { connection: twilioConnection() } })); };

export async function reloadConnection() {
  if (!client) { connection = null; loaded = true; return null; }
  try {
    const data = await invoke('twilio-connect', { method: 'GET' });
    connection = data.connection || null;
  } catch { connection = null; }
  loaded = true;
  notify();
  return connection;
}
export const ready = reloadConnection();
export const twilioConnection = () => connection;
export const twilioLoaded = () => loaded;
export const hasTwilio = () => !!connection && connection.status === 'active';

export async function connectTwilio({ accountSid, authToken, phoneNumber }) {
  const data = await invoke('twilio-connect', { body: { accountSid, authToken, phoneNumber } });
  connection = data.connection || null;
  loaded = true;
  notify();
  return connection;
}
export async function disconnectTwilio() {
  await invoke('twilio-connect', { body: { action: 'disconnect' } });
  connection = null;
  notify();
}

// ---------- messages ----------
export const sendSms = ({ to, body, contactId }) => invoke('twilio-send', { body: { to, body, channel: 'sms', contactId } });
export const sendWhatsApp = ({ to, body, contactId }) => invoke('twilio-send', { body: { to, body, channel: 'whatsapp', contactId } });

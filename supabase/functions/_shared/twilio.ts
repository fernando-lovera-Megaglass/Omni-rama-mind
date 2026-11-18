// Shared helpers of the Twilio Edge Functions: REST API calls with Basic auth (Account SID + Auth Token),
// the caller's connection row and its secrets. Secrets in Supabase: none needed per-project — the user
// supplies their own Account SID / Auth Token, stored in twilio_connection_secrets (RLS with no policies,
// only the service role can read them).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
export { handle, userFromRequest, serviceClient, json, fail, env, requireEnv, ConfigError, AuthError } from './gmail.ts';

export class TwilioError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'twilio', status = 502) { super(message); this.code = code; this.status = status; }
}

const API = 'https://api.twilio.com/2010-04-01';

// One call to the Twilio REST API with the given credentials.
export async function twilio(sid: string, token: string, path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
  });
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = (body.message as string) || `Twilio respondió ${res.status}`;
    if (res.status === 401) throw new TwilioError('El Account SID o el Auth Token no son válidos. Revísalos en la consola de Twilio.', 'auth', 400);
    if (res.status === 404) throw new TwilioError('No encontré eso en tu cuenta de Twilio. Revisa el Account SID.', 'not_found', 400);
    throw new TwilioError(msg, 'api', 502);
  }
  return body;
}

export interface TwilioConnection {
  id: string;
  user_id: string;
  account_sid: string;
  phone_number: string;
  friendly_name: string | null;
  capabilities: { voice?: boolean; sms?: boolean; whatsapp?: boolean };
  status: 'active' | 'error' | 'disabled';
  last_error: string | null;
}

// The caller's Twilio connection (or null), without secrets.
export async function connectionOf(service: SupabaseClient, userId: string): Promise<TwilioConnection | null> {
  const { data, error } = await service.from('twilio_connections').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as TwilioConnection | null) ?? null;
}

// The Auth Token of a connection (service role only — never returned to the browser).
export async function authTokenOf(service: SupabaseClient, connectionId: string): Promise<string> {
  const { data, error } = await service.from('twilio_connection_secrets').select('auth_token').eq('connection_id', connectionId).maybeSingle();
  if (error) throw error;
  if (!data) throw new TwilioError('La conexión no tiene token guardado. Vuelve a conectar Twilio.', 'no_secret', 400);
  return data.auth_token as string;
}

export async function markConnection(service: SupabaseClient, id: string, status: 'active' | 'error' | 'disabled', lastError: string | null = null): Promise<void> {
  await service.from('twilio_connections').update({ status, last_error: lastError, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
}

// Normalize a phone to E.164 (+52…). Accepts digits, spaces, dashes, parentheses.
export function e164(raw: string, defaultCountry = '+52'): string {
  let s = String(raw || '').trim().replace(/[\s()-]/g, '');
  if (!s) return s;
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '');
  s = s.replace(/\D/g, '');
  if (s.startsWith('00')) return '+' + s.slice(2);
  return defaultCountry + s;
}

// Twilio signs every webhook with X-Twilio-Signature: HMAC-SHA1 of (URL + sorted POST params),
// base64, keyed with the account's Auth Token. Forged requests get rejected.
export async function twilioSignatureValid(url: string, params: Record<string, string>, signature: string, token: string): Promise<boolean> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

export const twiml = (inner: string): Response =>
  new Response(`<Response>${inner}</Response>`, { headers: { 'Content-Type': 'text/xml' } });

// Transcribe a recorded call with OpenAI Whisper and saves the text on call_logs.transcript, so it
// shows up in CRM › Llamadas and the AI can read it. Needs the OPENAI_API_KEY secret; without it,
// returns null silently (transcription is optional). Idempotent: skips logs already transcribed.
export async function transcribeCallLog(service: SupabaseClient, log: { id: string; recording_url: string | null; connection_id: string; transcript?: string | null }): Promise<string | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  if (!log.recording_url) return null;
  if (log.transcript) return log.transcript;
  const { data: conn } = await service.from('twilio_connections').select('account_sid').eq('id', log.connection_id).maybeSingle();
  if (!conn) return null;
  const token = await authTokenOf(service, log.connection_id);
  const audio = await fetch(log.recording_url, { headers: { Authorization: `Basic ${btoa(`${conn.account_sid}:${token}`)}` } });
  if (!audio.ok) throw new TwilioError(`No se pudo bajar la grabación (${audio.status})`, 'api', 502);
  const fd = new FormData();
  fd.append('file', new Blob([await audio.arrayBuffer()], { type: 'audio/mpeg' }), 'grabacion.mp3');
  fd.append('model', 'whisper-1');
  fd.append('language', 'es');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new TwilioError(`OpenAI respondió ${res.status}: ${(data.error as Record<string, unknown> | undefined)?.message || res.statusText}`, 'openai', 502);
  const text = String(data.text || '').trim();
  await service.from('call_logs').update({ transcript: text }).eq('id', log.id);
  return text;
}

// Runs work after responding when the runtime allows it (EdgeRuntime.waitUntil), awaited otherwise.
export function background(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(p.catch(() => {}));
  else p.catch(() => {});
}

export const xmlEscape = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

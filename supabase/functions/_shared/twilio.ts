// Shared helpers of the Twilio Edge Functions: REST API calls with Basic auth (Account SID + Auth Token),
// the caller's connection row and its secrets. Secrets in Supabase: none needed per-project — the user
// supplies their own Account SID / Auth Token, stored in twilio_connection_secrets (RLS with no policies,
// only the service role can read them).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
export { handle, userFromRequest, serviceClient, json, fail, env, requireEnv, ConfigError, AuthError, CORS } from './gmail.ts';

export class TwilioError extends Error {
  code: string;
  status: number;
  twilioCode?: string;
  constructor(message: string, code = 'twilio', status = 502, twilioCode?: string) { super(message); this.code = code; this.status = status; this.twilioCode = twilioCode; }
}

const API = 'https://api.twilio.com/2010-04-01';

// Validate stored URLs too: legacy rows must never send account credentials to another origin.
export function twilioRecordingUrlValid(raw: string, accountSid: string): boolean {
  try {
    const url = new URL(raw);
    return /^AC[0-9a-f]{32}$/i.test(accountSid)
      && url.protocol === 'https:' && url.hostname === 'api.twilio.com'
      && !url.port && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.startsWith(`/2010-04-01/Accounts/${accountSid}/`);
  } catch { return false; }
}

// One call to the Twilio REST API with the given credentials.
export async function twilio(sid: string, token: string, path: string, init: { method?: string; form?: Record<string, string>; timeoutMs?: number } = {}): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: init.method || 'GET',
    signal: init.timeoutMs == null ? undefined : AbortSignal.timeout(init.timeoutMs),
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
  });
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch (error) {
    // Do not swallow timeouts while reading a response body.
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw error;
    /* empty or invalid JSON body */
  }
  if (!res.ok) {
    const apiCode = body.code == null ? undefined : String(body.code);
    const msg = (body.message as string) || `Twilio respondió ${res.status}`;
    if (res.status === 401) throw new TwilioError('El Account SID o el Auth Token no son válidos. Revísalos en la consola de Twilio.', 'auth', 400, apiCode);
    if (res.status === 404) throw new TwilioError('No encontré eso en tu cuenta de Twilio. Revisa el Account SID.', 'not_found', 400, apiCode);
    throw new TwilioError(msg, 'api', 502, apiCode);
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

// Shared by automatic callbacks and manual retries. Errors contain only safe, stage-specific
// messages: provider bodies can contain credentials or recording contents and must not be logged.
export async function transcribeCallLog(service: SupabaseClient, log: { id: string; recording_url: string | null; connection_id: string; transcript?: string | null }): Promise<string | null> {
  if (log.transcript) return log.transcript;
  if (!log.recording_url) return null;
  let stage = 'configuration';
  const messages: Record<string, string> = {
    configuration: 'Falta configurar OPENAI_API_KEY.',
    connection: 'No se pudo leer la conexión de Twilio.',
    recording_url: 'URL de grabación inválida',
    credentials: 'No se pudo leer el token de Twilio.',
    download: 'No se pudo descargar la grabación de Twilio.',
    openai: 'OpenAI no pudo transcribir la grabación.',
    save: 'No se pudo guardar la transcripción.',
  };
  let httpStatus: number | undefined;
  // Read fresh metadata before each write, preserving unrelated call metadata.
  const metadata = async () => {
    const { data, error } = await service.from('call_logs').select('extra').eq('id', log.id).maybeSingle();
    if (error || !data) throw new Error('metadata unavailable');
    return { ...(data.extra || {}) };
  };
  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey?.trim()) throw new Error('missing key');
    stage = 'connection';
    const { data: conn, error } = await service.from('twilio_connections').select('account_sid').eq('id', log.connection_id).maybeSingle();
    if (error || !conn) throw new Error('connection unavailable');
    stage = 'recording_url';
    if (!twilioRecordingUrlValid(log.recording_url, conn.account_sid)) throw new Error('invalid URL');
    stage = 'credentials';
    const token = await authTokenOf(service, log.connection_id);
    stage = 'download';
    const audio = await fetch(log.recording_url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: `Basic ${btoa(`${conn.account_sid}:${token}`)}` } });
    if (!audio.ok) { httpStatus = audio.status; throw new Error('download failed'); }
    const fd = new FormData();
    fd.append('file', new Blob([await audio.arrayBuffer()], { type: 'audio/mpeg' }), 'grabacion.mp3');
    fd.append('model', 'whisper-1');
    fd.append('language', 'es');
    stage = 'openai';
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
    });
    if (!res.ok) { httpStatus = res.status; throw new Error('transcription failed'); }
    const data = await res.json() as Record<string, unknown>;
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('empty transcription');
    stage = 'save';
    const extra = await metadata();
    delete extra.transcript_error;
    const { error: saveError } = await service.from('call_logs').update({ transcript: text, extra }).eq('id', log.id);
    if (saveError) throw saveError;
    return text;
  } catch {
    const failure = { timestamp: new Date().toISOString(), code: stage, message: messages[stage], ...(httpStatus ? { http_status: httpStatus } : {}) };
    console.error(JSON.stringify({ event: 'call_transcription_failed', call_log_id: log.id, ...failure }));
    try {
      const extra = await metadata();
      const { error } = await service.from('call_logs').update({ extra: { ...extra, transcript_error: failure } }).eq('id', log.id);
      if (error) throw error;
    } catch {
      console.error(JSON.stringify({ event: 'call_transcription_error_persist_failed', call_log_id: log.id, timestamp: failure.timestamp }));
    }
    throw new TwilioError(failure.message, `transcript_${stage}`, stage === 'configuration' ? 400 : 502);
  }
}

// Keep work alive after the webhook response; always observe rejections, even outside EdgeRuntime.
export function background(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const observed = p.catch(() => {
    console.error(JSON.stringify({ event: 'twilio_background_failed', timestamp: new Date().toISOString() }));
  });
  if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(observed);
}

export const xmlEscape = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

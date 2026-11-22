// Shared helpers of the Gmail Edge Functions: environment, CORS, the caller's identity (Supabase Auth JWT),
// the service-role client, OAuth state signing, token refresh, Gmail API calls and MIME helpers.
// Secrets expected in Supabase (supabase secrets set …): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and, optionally,
// APP_URL (allowed return origins, comma separated). SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// are injected by Supabase itself.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];
export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

export class ConfigError extends Error {}
export class AuthError extends Error {}
export class GmailError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'gmail', status = 502) { super(message); this.code = code; this.status = status; }
}

export const env = (k: string): string => Deno.env.get(k) ?? '';
export function requireEnv(k: string): string {
  const v = env(k);
  if (!v) throw new ConfigError(`Falta el secreto ${k} en Supabase (supabase secrets set ${k}=…)`);
  return v;
}
export const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
export const fail = (message: string, status = 400, extra: Record<string, unknown> = {}): Response => json({ error: message, ...extra }, status);

// Wraps a handler: CORS preflight, JSON errors with the right status, nothing secret in the message.
export function handle(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof AuthError) return fail(e.message, 401, { code: 'auth' });
      if (e instanceof ConfigError) return fail(e.message, 500, { code: 'config' });
      if (e instanceof GmailError) return fail(e.message, e.status, { code: e.code });
      console.error(e);
      return fail((e as Error).message || 'Error inesperado', 500, { code: 'unexpected' });
    }
  };
}

export const serviceClient = (): SupabaseClient => createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

// The signed-in Omni user behind the request (its Supabase Auth JWT).
export async function userFromRequest(req: Request): Promise<{ id: string; email: string }> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) throw new AuthError('Inicia sesión en Omni para usar Gmail.');
  const c = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.getUser(jwt);
  if (error || !data.user) throw new AuthError('La sesión no es válida o caducó.');
  return { id: data.user.id, email: data.user.email ?? '' };
}

export const callbackUrl = (): string => `${requireEnv('SUPABASE_URL')}/functions/v1/gmail-oauth-callback`;

// ---------- base64url ----------
export function b64urlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
export const b64 = (input: string): string => b64urlEncode(input).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64urlEncode(input).length % 4)) % 4);

// ---------- OAuth state (HMAC-SHA256 with the client secret, 10 minutes) ----------
async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(requireEnv('GOOGLE_CLIENT_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(body)));
  return `${body}.${b64urlEncode(sig)}`;
}
export async function verifyState(state: string): Promise<Record<string, unknown> | null> {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(body)));
  if (b64urlEncode(expected) !== sig) return null;
  try {
    const p = JSON.parse(b64urlDecode(body));
    if (!p || typeof p.exp !== 'number' || Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

// ---------- accounts and tokens ----------
export type Account = { id: string; user_id: string; email: string; status: string; last_error: string | null; last_synced_at: string | null; scopes: string[]; last_sync_error?: string | null };

export async function accountsOf(service: SupabaseClient, userId: string): Promise<Account[]> {
  const { data, error } = await service.from('connected_accounts').select('*').eq('user_id', userId).eq('provider', 'gmail').order('created_at');
  if (error) throw error;
  return (data || []) as Account[];
}
// The account to use: the given one, or the first that is not disabled.
export async function accountFor(service: SupabaseClient, userId: string, accountId?: string | null): Promise<Account | null> {
  const list = await accountsOf(service, userId);
  if (accountId) return list.find((a) => a.id === accountId) || null;
  return list.find((a) => a.status !== 'disabled') || null;
}
export async function markStatus(service: SupabaseClient, id: string, status: 'active' | 'error' | 'disabled', lastError: string | null = null): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await service.from('connected_accounts').update({ status, last_error: lastError, last_checked_at: now, updated_at: now }).eq('id', id);
  if (error) throw error;
}
// A valid access token for the account, refreshed with the refresh token when it is about to expire.
export async function accessTokenFor(service: SupabaseClient, account: Account): Promise<string> {
  const { data: t, error } = await service.from('connected_account_tokens').select('*').eq('account_id', account.id).maybeSingle();
  if (error) throw error;
  if (!t) throw new GmailError('La cuenta no tiene tokens guardados: vuelve a conectarla desde Ajustes › Correo.', 'no_tokens', 409);
  if (new Date(t.expires_at).getTime() - Date.now() > 60_000) return t.access_token;
  if (!t.refresh_token) {
    await markStatus(service, account.id, 'error', 'El acceso caducó y Google no devolvió un refresh token.');
    throw new GmailError('El acceso caducó: vuelve a conectar la cuenta de Gmail.', 'no_refresh', 409);
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: requireEnv('GOOGLE_CLIENT_ID'), client_secret: requireEnv('GOOGLE_CLIENT_SECRET'), refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) {
    const reason = body.error_description || body.error || `HTTP ${r.status}`;
    await markStatus(service, account.id, 'error', `No se pudo renovar el acceso: ${reason}`);
    throw new GmailError(`Google rechazó la renovación del acceso (${reason}): vuelve a conectar la cuenta.`, 'refresh_failed', 409);
  }
  const expires_at = new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000).toISOString();
  const { data: saved, error: saveError } = await service.from('connected_account_tokens').update({ access_token: body.access_token, refresh_token: body.refresh_token || t.refresh_token, expires_at, updated_at: new Date().toISOString() }).eq('account_id', account.id).select('account_id').single();
  if (saveError || !saved) throw new GmailError('No se pudo guardar el token renovado. Intenta sincronizar de nuevo.', 'token_save_failed', 500);
  return body.access_token;
}

// ---------- Gmail API ----------
export async function gmail(token: string, path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const message = (body && body.error && (body.error.message || body.error.status)) || `Gmail respondió ${r.status}`;
    throw new GmailError(message, r.status === 401 || r.status === 403 ? 'unauthorized' : 'gmail_api', r.status === 401 || r.status === 403 ? 401 : 502);
  }
  return body;
}
// Runs a Gmail call for an account; an authorisation failure marks the account as "Error de conexión".
export async function withAccount<T>(service: SupabaseClient, account: Account, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await accessTokenFor(service, account);
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof GmailError && e.code === 'unauthorized') await markStatus(service, account.id, 'error', e.message);
    throw e;
  }
}

// ---------- MIME helpers ----------
type Header = { name: string; value: string };
export const headerOf = (headers: Header[], name: string): string => (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || { value: '' }).value;
export function parseAddress(s: string): { name: string; email: string } {
  const m = String(s || '').match(/^\s*(?:"?([^"<]*?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (!m) return { name: String(s || '').trim(), email: '' };
  return { name: (m[1] || '').trim(), email: m[2].toLowerCase() };
}
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
export function extractBodies(payload: Part | undefined): { text: string; html: string } {
  const out = { text: '', html: '' };
  const walk = (p: Part | undefined) => {
    if (!p) return;
    const data = p.body && p.body.data ? b64urlDecode(p.body.data) : '';
    if (p.mimeType === 'text/plain' && data && !out.text) out.text = data;
    else if (p.mimeType === 'text/html' && data && !out.html) out.html = data;
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return out;
}
export const htmlToText = (html: string): string => String(html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();
const encodeHeader = (s: string): string => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s: string): string => s.replace(/(.{76})/g, '$1\r\n');
export function buildMime({ from, to, cc = [], bcc = [], subject, html, text, inReplyTo, references, attachments = [] }:  { from: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; html?: string; text?: string; inReplyTo?: string; references?: string; attachments?: unknown }): string {
  const files = validateAttachments(attachments);
  const mixed = `mixed_${crypto.randomUUID()}`;
  const boundary = `omni_${crypto.randomUUID().replace(/-/g, '')}`;
  const plain = text || htmlToText(html || '');
  const lines = [`From: ${from}`, `To: ${to.join(', ')}`];
  if (cc.length) lines.push(`Cc: ${cc.join(', ')}`);
  if (bcc.length) lines.push(`Bcc: ${bcc.join(', ')}`);
  lines.push(`Subject: ${encodeHeader(subject || '(sin asunto)')}`, 'MIME-Version: 1.0', `Date: ${new Date().toUTCString()}`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references || inReplyTo) lines.push(`References: ${references || inReplyTo}`);
  if (files.length) lines.push(`Content-Type: multipart/mixed; boundary="${mixed}"`, '', `--${mixed}`);
  if (html) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap76(b64(plain)), `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap76(b64(html)), `--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap76(b64(plain)));
  }
  for (const file of files) {
    const filename = encodeURIComponent(file.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
    lines.push(`--${mixed}`, `Content-Type: ${file.type}`, `Content-Disposition: attachment; filename*=UTF-8''${filename}`, 'Content-Transfer-Encoding: base64', '', wrap76(file.content));
  }
  if (files.length) lines.push(`--${mixed}--`);
  return lines.join('\r\n');
}

// Keep raw attachment bytes below 20 MiB, leaving room for MIME/base64 overhead.
// Oversized files are rejected; this route does not upload to Storage.
type Attachment = { name: string; type: string; size: number; content: string };
function validateAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) throw new Error('Lista de adjuntos inválida.');
  let total = 0;
  return value.map((file) => {
    if (!file || typeof file.name !== 'string' || !file.name || /[\r\n\0]/.test(file.name) || typeof file.content !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw new Error('Adjunto inválido.');
    const size = file.content.length / 4 * 3 - (file.content.endsWith('==') ? 2 : file.content.endsWith('=') ? 1 : 0);
    total += size;
    if (size !== file.size || total >= 20 * 1024 * 1024) throw new Error('Los adjuntos deben sumar menos de 20 MB y tener un tamaño válido.');
    const type = typeof file.type === 'string' && /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(file.type) ? file.type : 'application/octet-stream';
    return { name: file.name, type, size, content: file.content };
  });
}

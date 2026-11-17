// twilio-inbound: webhook that Twilio calls when an SMS or WhatsApp message ARRIVES at the user's number.
// Public URL (Twilio cannot send our users' JWT), so it validates the X-Twilio-Signature header with the
// connection's Auth Token (HMAC-SHA1 of the URL + sorted POST params) — anything forged is rejected.
// Configure in the Twilio console (Phone Numbers → tu número → Messaging → "A message comes in"):
//   https://<project>.supabase.co/functions/v1/twilio-inbound
import { handle, serviceClient, json, fail } from '../_shared/twilio.ts';

async function twilioSignatureValid(url: string, params: Record<string, string>, signature: string, token: string): Promise<boolean> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const from = (params.From || '').replace(/^whatsapp:/, '');
  const to = (params.To || '').replace(/^whatsapp:/, '');
  if (!from || !to) return fail('Faltan From/To');

  const service = serviceClient();
  const { data: conn, error } = await service.from('twilio_connections').select('*').eq('phone_number', to).maybeSingle();
  if (error) throw error;
  if (!conn) return fail('Número no registrado en Omni.', 404);

  const signature = req.headers.get('X-Twilio-Signature') || '';
  const { data: secret } = await service.from('twilio_connection_secrets').select('auth_token').eq('connection_id', conn.id).maybeSingle();
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-inbound`;
  if (!secret || !(await twilioSignatureValid(url, params, signature, secret.auth_token))) {
    return fail('Firma inválida.', 403, { code: 'bad_signature' });
  }

  const channel = (params.From || '').startsWith('whatsapp:') ? 'whatsapp' : 'sms';
  const body = params.Body || '';
  const thread = [to, from].sort().join('↔');

  // Match the sender to a contact by phone (the contacts table stores phones in several formats,
  // in `phone` and `mobilephone`; the workspace is shared, so no per-user filter).
  const digits = from.replace(/\D/g, '').slice(-10);
  let contactId: string | null = null;
  if (digits.length >= 7) {
    const { data: hit } = await service.from('contacts').select('id').or(`phone.ilike.%${digits},mobilephone.ilike.%${digits}`).limit(1).maybeSingle();
    contactId = hit ? String(hit.id) : null;
  }

  const { error: e2 } = await service.from('twilio_messages').insert({
    user_id: conn.user_id,
    connection_id: conn.id,
    message_sid: params.MessageSid || null,
    channel,
    direction: 'inbound',
    from_number: from,
    to_number: to,
    body,
    status: 'received',
    contact_id: contactId,
    thread_key: thread,
    sent_at: new Date().toISOString(),
  });
  if (e2) throw e2;

  // Twilio expects TwiML back; an empty response means "no auto-reply".
  return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}));

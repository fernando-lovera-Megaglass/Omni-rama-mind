// twilio-send: send an SMS or WhatsApp message from Omni through the user's Twilio account.
// POST (Authorization: Bearer <Supabase JWT>) { to, body, channel?: 'sms' | 'whatsapp', contactId? }
//   → { ok, sid, status, message } — the message is stored in twilio_messages (thread_key = the
//   sorted phone pair) and matched to the contact by phone number when possible.
import { handle, userFromRequest, serviceClient, json, fail, twilio, connectionOf, authTokenOf, markConnection, e164, requireEnv, TwilioError } from '../_shared/twilio.ts';

import { applyMessageStatus, messageError } from '../_shared/twilio-message.ts';

Deno.serve(handle(async (req) => {
  const user = await userFromRequest(req);
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const b = await req.json().catch(() => ({}));
  const body = String(b.body || '').trim();
  const channel = b.channel === 'whatsapp' ? 'whatsapp' : 'sms';
  if (!body) return fail('Escribe el mensaje.');
  const to = e164(String(b.to || ''), '+');
  if (!/^\+\d{8,15}$/.test(to)) return fail('El número de destino debe ir en formato internacional, por ejemplo +5215512345678.');

  const service = serviceClient();
  const c = await connectionOf(service, user.id);
  if (!c) return fail('Primero conecta tu cuenta de Twilio en Ajustes › Llamadas.', 400, { code: 'no_connection' });
  if (c.status !== 'active') return fail(`Tu conexión de Twilio está «${c.status}». Revísala en Ajustes › Llamadas.`, 400, { code: 'not_active' });
  const token = await authTokenOf(service, c.id);

  const from = channel === 'whatsapp' ? `whatsapp:${c.phone_number}` : c.phone_number;
  const dest = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  // Persist the attempt before calling Twilio. The signed callback URL carries this ID,
  // so an early callback can attach the SID before the REST response reaches us.
  const id = crypto.randomUUID();
  const callback = `${requireEnv('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/twilio-message-status?message_id=${id}`;
  const thread = [c.phone_number, to].sort().join('↔');
  const { error } = await service.from('twilio_messages').insert({
    id,
    user_id: user.id,
    connection_id: c.id,
    message_sid: null,
    channel,
    direction: 'outbound',
    from_number: c.phone_number,
    to_number: to,
    body,
    status: 'queued',
    contact_id: b.contactId || null,
    thread_key: thread,
    sent_at: new Date().toISOString(),
  });
  if (error) throw error;
  let sent: { sid: string; status?: string; error_code?: number; error_message?: string };
  try {
    sent = await twilio(c.account_sid, token, `/Accounts/${c.account_sid}/Messages.json`, {
      method: 'POST', timeoutMs: 20_000, form: { From: from, To: dest, Body: body, StatusCallback: callback },
    }) as typeof sent;
    if (!/^(SM|MM)[0-9a-f]{32}$/i.test(sent.sid || '')) throw new TwilioError('Twilio no devolvió un MessageSid válido.', 'invalid_response');
  } catch (e) {
    const err = e as TwilioError;
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    const code = timedOut ? 'timeout' : err.twilioCode || err.code || 'transport';
    const cause = messageError(code, timedOut ? 'La petición a Twilio superó el límite de 20 segundos; no se confirmó el envío.' : err.message);
    const { error: saveError } = await service.from('twilio_messages').update({ status: 'failed', error: cause })
      .eq('id', id).eq('status', 'queued').is('message_sid', null);
    if (saveError) throw saveError;
    // Invalid destinations and carrier errors must not disable the whole account.
    if (err.code === 'auth') await markConnection(service, c.id, 'error', cause);
    return fail(cause!, timedOut ? 504 : err.status || 502, { code, message_id: id });
  }
  // Keep persistence failures outside the send catch: Twilio may already be delivering.
  await applyMessageStatus(service, id, c.id, sent.sid, sent.status || 'queued', messageError(sent.error_code, sent.error_message));
  const { data: saved, error: readError } = await service.from('twilio_messages').select('status').eq('id', id).single();
  if (readError) throw readError;
  return json({ ok: true, sid: sent.sid, status: saved.status });
}));

// twilio-send: send an SMS or WhatsApp message from Omni through the user's Twilio account.
// POST (Authorization: Bearer <Supabase JWT>) { to, body, channel?: 'sms' | 'whatsapp', contactId? }
//   → { ok, sid, status, message } — the message is stored in twilio_messages (thread_key = the
//   sorted phone pair) and matched to the contact by phone number when possible.
import { handle, userFromRequest, serviceClient, json, fail, twilio, connectionOf, authTokenOf, markConnection, e164 } from '../_shared/twilio.ts';

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
  let sent: { sid?: string; status?: string };
  try {
    sent = await twilio(c.account_sid, token, `/Accounts/${c.account_sid}/Messages.json`, { method: 'POST', form: { From: from, To: dest, Body: body } }) as typeof sent;
    await markConnection(service, c.id, 'active');
  } catch (e) {
    await markConnection(service, c.id, 'error', (e as Error).message);
    throw e;
  }

  const thread = [c.phone_number, to].sort().join('↔');
  const { error } = await service.from('twilio_messages').insert({
    user_id: user.id,
    connection_id: c.id,
    message_sid: sent.sid || null,
    channel,
    direction: 'outbound',
    from_number: c.phone_number,
    to_number: to,
    body,
    status: sent.status || 'queued',
    contact_id: b.contactId || null,
    thread_key: thread,
    sent_at: new Date().toISOString(),
  });
  if (error) throw error;
  return json({ ok: true, sid: sent.sid, status: sent.status || 'queued' });
}));

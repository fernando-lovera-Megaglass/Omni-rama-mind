// twilio-connect: connect, check and disconnect the user's own Twilio account.
// GET  (Authorization: Bearer <Supabase JWT>) → { connection: { id, accountSid, phoneNumber, friendlyName,
//      capabilities, status, lastError, checkedAt } | null } — validated live against the Twilio API.
// POST { accountSid, authToken, phoneNumber } → validates the credentials against Twilio, verifies the
//      phone number belongs to the account (reads its capabilities: voice / sms / mms) and stores the
//      connection. The Auth Token goes to twilio_connection_secrets (service role only).
// POST { action: 'disconnect' } → deletes the connection, its secrets, call logs and messages.
import { handle, userFromRequest, serviceClient, json, fail, twilio, connectionOf, authTokenOf, markConnection, e164, TwilioError } from '../_shared/twilio.ts';

interface TwilioAccount { friendly_name?: string; status?: string }
interface TwilioNumbers { incoming_phone_numbers?: Array<{ phone_number: string; friendly_name?: string; capabilities?: { voice?: boolean; sms?: boolean; mms?: boolean } }> }

const vmFields = (c: { voicemail_text?: string | null; voicemail_url?: string | null }) => ({ voicemailText: c.voicemail_text || '', voicemailUrl: c.voicemail_url || '' });

async function liveState(service: ReturnType<typeof serviceClient>, c: NonNullable<Awaited<ReturnType<typeof connectionOf>>>) {
  if (c.status === 'disabled') return { id: c.id, accountSid: c.account_sid, phoneNumber: c.phone_number, friendlyName: c.friendly_name, capabilities: c.capabilities, status: 'disabled', lastError: null, checkedAt: new Date().toISOString(), ...vmFields(c) };
  try {
    const token = await authTokenOf(service, c.id);
    const acc = await twilio(c.account_sid, token, `/Accounts/${c.account_sid}.json`) as TwilioAccount;
    await markConnection(service, c.id, 'active');
    return { id: c.id, accountSid: c.account_sid, phoneNumber: c.phone_number, friendlyName: acc.friendly_name || c.friendly_name, capabilities: c.capabilities, status: 'active', lastError: null, checkedAt: new Date().toISOString(), ...vmFields(c) };
  } catch (e) {
    const message = (e as Error).message || 'No se pudo comprobar la cuenta';
    if (e instanceof TwilioError && e.code === 'auth') await markConnection(service, c.id, 'error', message);
    return { id: c.id, accountSid: c.account_sid, phoneNumber: c.phone_number, friendlyName: c.friendly_name, capabilities: c.capabilities, status: 'error', lastError: message, checkedAt: new Date().toISOString(), ...vmFields(c) };
  }
}

Deno.serve(handle(async (req) => {
  const user = await userFromRequest(req);
  const service = serviceClient();

  if (req.method === 'GET') {
    const c = await connectionOf(service, user.id);
    return json({ connection: c ? await liveState(service, c) : null });
  }
  if (req.method !== 'POST') return fail('Usa GET o POST', 405);

  const b = await req.json().catch(() => ({}));

  if (b.action === 'disconnect') {
    const c = await connectionOf(service, user.id);
    if (!c) return fail('No hay ninguna cuenta de Twilio conectada.', 404, { code: 'no_connection' });
    const { error } = await service.from('twilio_connections').delete().eq('id', c.id);
    if (error) throw error;
    return json({ ok: true });
  }

  // Guardar el mensaje de buzón de voz (texto para voz automática y/o URL del audio subido).
  if (b.action === 'voicemail') {
    const c = await connectionOf(service, user.id);
    if (!c) return fail('Primero conecta tu cuenta de Twilio.', 404, { code: 'no_connection' });
    const voicemailText = String(b.voicemailText || '').trim().slice(0, 800);
    const voicemailUrl = String(b.voicemailUrl || '').trim().slice(0, 600);
    if (voicemailUrl && !/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/voicemails\//.test(voicemailUrl)) {
      return fail('La URL del audio debe venir del buzón de voz de Omni (súbela desde Ajustes › Llamadas).', 400, { code: 'bad_url' });
    }
    const { error } = await service.from('twilio_connections').update({ voicemail_text: voicemailText || null, voicemail_url: voicemailUrl || null, updated_at: new Date().toISOString() }).eq('id', c.id);
    if (error) throw error;
    return json({ ok: true, voicemailText, voicemailUrl });
  }

  const sid = String(b.accountSid || '').trim();
  const token = String(b.authToken || '').trim();
  const number = e164(String(b.phoneNumber || ''), '+');
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) return fail('El Account SID debe empezar con «AC» seguido de 32 caracteres. Cópialo de la consola de Twilio.', 400, { code: 'bad_sid' });
  if (token.length < 20) return fail('El Auth Token se ve demasiado corto. Cópialo completo de la consola de Twilio.', 400, { code: 'bad_token' });
  if (!/^\+\d{8,15}$/.test(number)) return fail('Escribe el número en formato internacional, por ejemplo +15551234567.', 400, { code: 'bad_number' });

  // 1) Credentials valid?
  const acc = await twilio(sid, token, `/Accounts/${sid}.json`) as TwilioAccount;
  if (acc.status && acc.status !== 'active') return fail(`Tu cuenta de Twilio está «${acc.status}». Actívala en la consola de Twilio.`, 400, { code: 'account_inactive' });

  // 2) The number belongs to the account → real capabilities.
  const nums = await twilio(sid, token, `/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`) as TwilioNumbers;
  const found = (nums.incoming_phone_numbers || [])[0];
  if (!found) return fail(`El número ${number} no está en tu cuenta de Twilio. Cópialo de Phone Numbers → Active Numbers.`, 400, { code: 'number_not_found' });
  const capabilities = { voice: !!found.capabilities?.voice, sms: !!found.capabilities?.sms, whatsapp: false };

  // 3) Store (one connection per user; the secret lives in its own locked table).
  const existing = await connectionOf(service, user.id);
  if (existing) {
    const { error } = await service.from('twilio_connections').update({ account_sid: sid, phone_number: found.phone_number, friendly_name: acc.friendly_name || found.friendly_name || null, capabilities, status: 'active', last_error: null, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) throw error;
    const { error: e2 } = await service.from('twilio_connection_secrets').update({ auth_token: token, updated_at: new Date().toISOString() }).eq('connection_id', existing.id);
    if (e2) throw e2;
    return json({ ok: true, connection: await liveState(service, { ...existing, account_sid: sid, phone_number: found.phone_number, friendly_name: acc.friendly_name || null, capabilities, status: 'active' }) });
  }
  const { data: row, error } = await service.from('twilio_connections').insert({ user_id: user.id, account_sid: sid, phone_number: found.phone_number, friendly_name: acc.friendly_name || found.friendly_name || null, capabilities, status: 'active', last_checked_at: new Date().toISOString() }).select('id').single();
  if (error) throw error;
  const { error: e2 } = await service.from('twilio_connection_secrets').insert({ connection_id: row.id, auth_token: token });
  if (e2) throw e2;
  const c = await connectionOf(service, user.id);
  return json({ ok: true, connection: c ? await liveState(service, c) : null });
}));

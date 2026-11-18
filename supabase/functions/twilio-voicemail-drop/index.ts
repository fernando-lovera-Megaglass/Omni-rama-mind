// twilio-voicemail-drop: the «Buzón de voz» button of the live call panel. When the contact's
// voicemail picks up, the agent hangs up and presses it: we start a NEW Twilio call to the same
// number with async answering-machine detection (DetectMessageEnd). Twilio reports the beep to
// twilio-voicemail-amd, which then plays the user's preloaded message and hangs up.
// POST { to, contactId? } with the user's JWT → { ok, callSid }.
import { handle, userFromRequest, serviceClient, json, fail, connectionOf, authTokenOf, twilio, e164 } from '../_shared/twilio.ts';

const FN = (name: string) => `${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`;

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const user = await userFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const to = e164(String((body as Record<string, unknown>).to || ''), '+');
  const contactId = String((body as Record<string, unknown>).contactId || '') || null;
  if (!/^\+\d{8,15}$/.test(to)) return fail('Falta el número de destino (formato internacional).', 400, { code: 'bad_number' });

  const service = serviceClient();
  const conn = await connectionOf(service, user.id);
  if (!conn) return fail('Primero conecta tu cuenta de Twilio en Ajustes › Llamadas.', 404, { code: 'no_connection' });
  const vmText = String((conn as Record<string, unknown>).voicemail_text || '').trim();
  const vmUrl = String((conn as Record<string, unknown>).voicemail_url || '').trim();
  if (!vmText && !vmUrl) return fail('Aún no tienes mensaje de buzón. Graba o escribe uno en Ajustes › Llamadas.', 400, { code: 'no_voicemail' });

  const token = await authTokenOf(service, conn.id);
  const call = await twilio(conn.account_sid, token, `/Accounts/${conn.account_sid}/Calls.json`, {
    method: 'POST',
    form: {
      From: conn.phone_number,
      To: to,
      Url: FN('twilio-voicemail-amd'),
      Method: 'POST',
      Timeout: '30',
      MachineDetection: 'DetectMessageEnd',
      AsyncAmd: 'true',
      AsyncAmdStatusCallback: FN('twilio-voicemail-amd'),
      AsyncAmdStatusCallbackMethod: 'POST',
      StatusCallback: FN('twilio-call-status'),
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
    },
  }) as Record<string, unknown>;

  const callSid = String(call.sid || '');
  await service.from('call_logs').insert({
    user_id: user.id,
    connection_id: conn.id,
    call_sid: callSid,
    direction: 'outbound',
    from_number: conn.phone_number,
    to_number: to,
    status: 'queued',
    answered_by: 'voicemail-drop',
    contact_id: contactId,
    started_at: new Date().toISOString(),
  });
  return json({ ok: true, callSid });
}));

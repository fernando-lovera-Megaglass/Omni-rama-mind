// twilio-voice: TwiML webhook for calls. Twilio calls it in two situations:
//  1) Outbound from the browser (Voice SDK → TwiML App → here): From=client:omni-<userId>,
//     To=<destination>. We answer <Dial callerId=<número Twilio>>To</Dial> with a status callback.
//  2) Inbound PSTN call to the Twilio number (the number's voice webhook points here too):
//     From=<quien llama>, To=<número Twilio>. We ring the owner's browser with <Dial><Client>.
// Every request must carry a valid X-Twilio-Signature (Auth Token of the connection).
import { handle, serviceClient, fail, twilioSignatureValid, twiml, xmlEscape, e164 } from '../_shared/twilio.ts';

const FN = (name: string) => `${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`;

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const from = params.From || '';
  const to = params.To || '';
  const callSid = params.CallSid || null;
  const service = serviceClient();
  const url = FN('twilio-voice');

  // Which connection does this call belong to? Outbound: the From is client:omni-<userId> —
  // the TwiML App belongs to the account, but we still validate the signature against that
  // account's token. Inbound: the To is the Twilio number.
  let conn = null;
  if (from.startsWith('client:omni-')) {
    const userId = from.slice('client:omni-'.length);
    const { data } = await service.from('twilio_connections').select('*').eq('user_id', userId).maybeSingle();
    conn = data;
  } else {
    const { data } = await service.from('twilio_connections').select('*').eq('phone_number', to).maybeSingle();
    conn = data;
  }
  if (!conn) return twiml('<Say language="es-MX">Número no configurado en Omni.</Say><Hangup/>');

  const { data: secret } = await service.from('twilio_connection_secrets').select('auth_token').eq('connection_id', conn.id).maybeSingle();
  const signature = req.headers.get('X-Twilio-Signature') || '';
  if (!secret || !(await twilioSignatureValid(url, params, signature, secret.auth_token))) {
    return fail('Firma inválida.', 403, { code: 'bad_signature' });
  }

  if (from.startsWith('client:')) {
    // Outbound from the browser: dial the destination with the Twilio number as caller ID.
    const dest = e164(to, '+');
    await service.from('call_logs').insert({
      user_id: conn.user_id,
      connection_id: conn.id,
      call_sid: callSid,
      direction: 'outbound',
      from_number: conn.phone_number,
      to_number: dest,
      status: 'initiated',
      started_at: new Date().toISOString(),
    });
    return twiml(`<Dial callerId="${xmlEscape(conn.phone_number)}" statusCallback="${FN('twilio-call-status')}" statusCallbackEvent="initiated ringing answered completed"><Number>${xmlEscape(dest)}</Number></Dial>`);
  }

  // Inbound PSTN call: ring the owner's browser (identity omni-<userId>) and log it.
  await service.from('call_logs').insert({
    user_id: conn.user_id,
    connection_id: conn.id,
    call_sid: callSid,
    direction: 'inbound',
    from_number: from,
    to_number: to,
    status: 'ringing',
    started_at: new Date().toISOString(),
  });
  return twiml(`<Dial answerOnBridge="true" statusCallback="${FN('twilio-call-status')}" statusCallbackEvent="initiated ringing answered completed"><Client>omni-${conn.user_id}</Client></Dial>`);
}));

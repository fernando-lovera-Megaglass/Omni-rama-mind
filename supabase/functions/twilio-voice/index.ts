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
  // Where every leg reports its progress (initiated / ringing / answered / completed) and the dial its outcome.
  const statusUrl = FN('twilio-call-status');
  const statusAttrs = ` statusCallback="${xmlEscape(statusUrl)}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`;

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
    // Record=1 (the "Grabar llamada" toggle) turns on dual-channel recording; the recording
    // status comes back to twilio-call-status with RecordingSid/RecordingUrl.
    // ContactId/CompanyId vienen del marcador (call.js) y enlazan la llamada con su ficha;
    // si no vienen, intentamos adivinar la ficha por el número de teléfono.
    const dest = e164(to, '+');
    const record = params.Record === '1';
    let contactId = params.ContactId || '';
    let companyId = params.CompanyId || '';
    if (!contactId && !companyId) {
      const match = await contactByPhone(service, conn.user_id, dest);
      if (match) { contactId = String(match.id); if (match.company_id) companyId = String(match.company_id); }
    }
    await service.from('call_logs').insert({
      user_id: conn.user_id,
      connection_id: conn.id,
      call_sid: callSid,
      direction: 'outbound',
      from_number: conn.phone_number,
      to_number: dest,
      status: 'initiated',
      contact_id: contactId || null,
      company_id: companyId || null,
      started_at: new Date().toISOString(),
    });
    const recAttrs = record ? ` record="record-from-answer-dual" recordingStatusCallback="${FN('twilio-call-status')}" recordingStatusCallbackEvent="completed"` : '';
    // In TwiML the status callback belongs to the noun (<Number>), not to <Dial>: an attribute on <Dial> is
    // ignored and nobody reports the leg, which is why call_logs stayed in «initiated». The <Number> callbacks
    // carry the child CallSid with ParentCallSid = this call; the <Dial action> reports DialCallStatus /
    // DialCallDuration with the parent CallSid when the dial ends. Neither the number nor the TwiML App need a
    // status_callback of their own.
    return twiml(`<Dial callerId="${xmlEscape(conn.phone_number)}"${recAttrs} action="${xmlEscape(statusUrl)}" method="POST"><Number${statusAttrs}>${xmlEscape(dest)}</Number></Dial>`);
  }

  // Inbound PSTN call: ring the owner's browser (identity omni-<userId>) and log it.
  const who = await contactByPhone(service, conn.user_id, from);
  await service.from('call_logs').insert({
    user_id: conn.user_id,
    connection_id: conn.id,
    call_sid: callSid,
    direction: 'inbound',
    from_number: from,
    to_number: to,
    status: 'ringing',
    contact_id: who ? String(who.id) : null,
    company_id: who && who.company_id ? String(who.company_id) : null,
    started_at: new Date().toISOString(),
  });
  // Same rule: the callbacks go on <Client>, the outcome of the dial on <Dial action>.
  return twiml(`<Dial answerOnBridge="true" timeout="30" action="${xmlEscape(statusUrl)}" method="POST"><Client${statusAttrs}>omni-${conn.user_id}</Client></Dial>`);
}));

// La ficha del contacto por número (últimos 10 dígitos, contra phone y mobilephone).
async function contactByPhone(service: ReturnType<typeof serviceClient>, userId: string, num: string): Promise<{ id: unknown; company_id: unknown } | null> {
  const digits = String(num || '').replace(/\D/g, '').slice(-10);
  if (!digits) return null;
  const { data } = await service.from('contacts').select('id, phone, mobilephone, company_id').eq('user_id', userId).is('deleted_at', null).limit(5000);
  for (const c of data || []) {
    const hit = [c.phone, c.mobilephone].some((p) => String(p || '').replace(/\D/g, '').slice(-10) === digits);
    if (hit) return c as { id: unknown; company_id: unknown };
  }
  return null;
}

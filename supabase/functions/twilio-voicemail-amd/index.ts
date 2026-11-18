// twilio-voicemail-amd: Twilio webhook of the voicemail-drop call. Two moments:
//  1) Initial TwiML fetch (no AnsweredBy): keep the line open while AMD listens (<Pause>).
//  2) Async AMD callback (AnsweredBy present): on the voicemail beep we redirect the call to
//     <Play> the uploaded audio or <Say> the written message, then <Hangup/>. If a human picks
//     up we hang up instead — the drop is only for mailboxes.
// Every request must carry a valid X-Twilio-Signature of that connection's Auth Token.
import { handle, serviceClient, fail, twilioSignatureValid, twiml, xmlEscape, twilio, authTokenOf } from '../_shared/twilio.ts';

const FN_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-voicemail-amd`;
const BEEP = new Set(['machine_end_beep', 'machine_end_silence', 'machine_end_other']);

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const service = serviceClient();
  const { data: conn } = await service.from('twilio_connections').select('*').eq('phone_number', params.From || '').maybeSingle();
  if (!conn) return fail('Número desconocido.', 404, { code: 'no_connection' });
  const token = await authTokenOf(service, conn.id);
  const signature = req.headers.get('X-Twilio-Signature') || '';
  if (!(await twilioSignatureValid(FN_URL, params, signature, token))) return fail('Firma inválida.', 403, { code: 'bad_signature' });

  // 1) TwiML inicial: esperar mientras la detección escucha el saludo del buzón.
  if (!params.AnsweredBy) return twiml('<Pause length="45"/>');

  const callSid = params.CallSid || '';
  const redirect = async (inner: string) => {
    await twilio(conn.account_sid, token, `/Accounts/${conn.account_sid}/Calls/${callSid}.json`, {
      method: 'POST',
      form: { Twiml: `<Response>${inner}</Response>` },
    });
  };

  if (BEEP.has(params.AnsweredBy)) {
    // El tono del buzón: soltar el mensaje precargado (audio subido o texto leído en voz alta).
    const vmUrl = String(conn.voicemail_url || '').trim();
    const vmText = String(conn.voicemail_text || '').trim();
    const message = vmUrl ? `<Play>${xmlEscape(vmUrl)}</Play>` : `<Say language="es-MX" voice="Polly.Mia">${xmlEscape(vmText)}</Say>`;
    try {
      await redirect(`${message}<Hangup/>`);
      await service.from('call_logs').update({ answered_by: 'machine', status: 'in-progress' }).eq('call_sid', callSid);
    } catch { /* la llamada ya colgó */ }
    return twiml('');
  }

  if (params.AnsweredBy === 'machine_start') return twiml(''); // sigue escuchando hasta el tono

  // Contestó un humano (o no se sabe): el buzón no aplica, colgar.
  try {
    await redirect('<Hangup/>');
    await service.from('call_logs').update({ answered_by: params.AnsweredBy }).eq('call_sid', callSid);
  } catch { /* ya terminó */ }
  return twiml('');
}));

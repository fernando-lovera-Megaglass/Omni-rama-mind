// twilio-recording: streams a call recording to the browser. Twilio serves recordings with Basic
// auth (Account SID + Auth Token, which the browser never sees), so the audio element cannot fetch
// them directly — this function checks the caller owns the call log and pipes the audio through.
// GET /functions/v1/twilio-recording?call=<CallSid>  (con el JWT del usuario, verify_jwt = true)
import { handle, userFromRequest, serviceClient, fail, authTokenOf } from '../_shared/twilio.ts';

Deno.serve(handle(async (req) => {
  if (req.method !== 'GET') return fail('Usa GET', 405);
  const user = await userFromRequest(req);
  const callSid = new URL(req.url).searchParams.get('call') || '';
  if (!callSid) return fail('Falta el parámetro call.', 400, { code: 'no_call' });

  const service = serviceClient();
  const { data: log } = await service.from('call_logs').select('id, user_id, connection_id, recording_url').eq('call_sid', callSid).maybeSingle();
  if (!log || log.user_id !== user.id) return fail('No encontré esa llamada.', 404, { code: 'not_found' });
  if (!log.recording_url) return fail('La llamada no tiene grabación.', 404, { code: 'no_recording' });

  const { data: conn } = await service.from('twilio_connections').select('account_sid').eq('id', log.connection_id).maybeSingle();
  if (!conn) return fail('La conexión de Twilio ya no existe.', 404, { code: 'no_connection' });
  const token = await authTokenOf(service, log.connection_id);

  const res = await fetch(log.recording_url, {
    headers: { Authorization: `Basic ${btoa(`${conn.account_sid}:${token}`)}` },
  });
  if (!res.ok || !res.body) return fail(`Twilio respondió ${res.status} al pedir la grabación.`, 502, { code: 'twilio' });
  return new Response(res.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' },
  });
}));

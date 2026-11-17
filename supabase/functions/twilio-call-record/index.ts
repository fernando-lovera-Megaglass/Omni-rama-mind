// twilio-call-record: starts recording a call that is already in progress (the «Grabar» button of
// the live call panel). POST { callSid } with the user's JWT → POST /Calls/{sid}/Recordings on the
// Twilio API with that connection's credentials, and saves the recording URL on the call log.
import { handle, userFromRequest, serviceClient, fail, authTokenOf, TwilioError } from '../_shared/twilio.ts';

const FN = (name: string) => `${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`;

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const user = await userFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const callSid = String((body as Record<string, unknown>).callSid || '');
  if (!callSid) return fail('Falta callSid.', 400, { code: 'no_call' });

  const service = serviceClient();
  const { data: log } = await service.from('call_logs').select('id, user_id, connection_id, status, recording_url').eq('call_sid', callSid).maybeSingle();
  if (!log || log.user_id !== user.id) return fail('No encontré esa llamada.', 404, { code: 'not_found' });
  if (log.recording_url) return new Response(JSON.stringify({ ok: true, already: true }), { headers: { 'Content-Type': 'application/json' } });
  if (!['in-progress', 'initiated', 'ringing'].includes(String(log.status))) {
    return fail('La llamada ya terminó; no se puede grabar.', 409, { code: 'ended' });
  }

  const { data: conn } = await service.from('twilio_connections').select('account_sid').eq('id', log.connection_id).maybeSingle();
  if (!conn) return fail('La conexión de Twilio ya no existe.', 404, { code: 'no_connection' });
  const token = await authTokenOf(service, log.connection_id);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${conn.account_sid}/Calls/${callSid}/Recordings.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${conn.account_sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ RecordingStatusCallback: FN('twilio-call-status') }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new TwilioError((data as Record<string, unknown>).message as string || `Twilio respondió ${res.status}`);
  const sid = (data as Record<string, unknown>).sid as string;
  if (sid) {
    await service.from('call_logs').update({ recording_url: `https://api.twilio.com/2010-04-01/Accounts/${conn.account_sid}/Recordings/${sid}.mp3` }).eq('id', log.id);
  }
  return new Response(JSON.stringify({ ok: true, recordingSid: sid || null }), { headers: { 'Content-Type': 'application/json' } });
}));

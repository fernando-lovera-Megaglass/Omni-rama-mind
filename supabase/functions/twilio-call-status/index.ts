// twilio-call-status: status callbacks of the <Dial> in twilio-voice. Updates call_logs with the
// final state and duration of each call (initiated / ringing / answered / completed).
import { handle, serviceClient, fail } from '../_shared/twilio.ts';

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const callSid = params.CallSid;
  if (!callSid) return fail('Falta CallSid');
  const service = serviceClient();
  const { data: log } = await service.from('call_logs').select('id, status').eq('call_sid', callSid).maybeSingle();
  if (!log) return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } }); // llamada ajena; OK silencioso

  const status = params.CallStatus || params.DialCallStatus || log.status;
  const update: Record<string, unknown> = { status };
  if (status === 'completed' || status === 'busy' || status === 'no-answer' || status === 'failed' || status === 'canceled') {
    update.ended_at = new Date().toISOString();
    const dur = Number(params.DialCallDuration || params.CallDuration || 0);
    if (dur > 0) update.duration_sec = dur;
  }
  await service.from('call_logs').update(update).eq('id', log.id);
  return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}));

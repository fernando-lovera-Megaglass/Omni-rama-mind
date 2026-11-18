// twilio-call-status: status callbacks of the <Dial> in twilio-voice. Updates call_logs with the
// final state and duration of each call (initiated / ringing / answered / completed).
import { handle, serviceClient, fail, transcribeCallLog, background, twilio, authTokenOf } from '../_shared/twilio.ts';

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const callSid = params.CallSid;
  if (!callSid) return fail('Falta CallSid');
  const service = serviceClient();

  // Twilio no siempre manda el SID que guardamos: en los callbacks del <Dial> y de la grabación
  // puede venir el SID del tramo hijo. Probamos CallSid, DialCallSid y, si nada coincide, le
  // preguntamos a Twilio por el padre de esa llamada.
  let log: { id: string; status: string; connection_id?: string; recording_url?: string | null; transcript?: string | null } | null = null;
  const trySid = async (sid: string | undefined) => {
    if (!sid || log) return;
    const { data } = await service.from('call_logs').select('id, status, connection_id, recording_url, transcript').eq('call_sid', sid).maybeSingle();
    if (data) log = data;
  };
  await trySid(callSid);
  await trySid(params.DialCallSid);
  if (!log) {
    const { data: conn } = await service.from('twilio_connections').select('id, account_sid').limit(1).maybeSingle();
    if (conn) {
      try {
        const token = await authTokenOf(service, conn.id);
        const call = await twilio(conn.account_sid, token, `/Accounts/${conn.account_sid}/Calls/${callSid}.json`) as Record<string, unknown>;
        await trySid(call.parent_call_sid as string);
      } catch { /* llamada ajena a esta cuenta */ }
    }
  }
  if (!log) return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } }); // llamada ajena; OK silencioso

  // Recording status callback (record="record-from-answer-dual" en twilio-voice): guarda la URL de la
  // grabación en el registro de la llamada. Twilio la sirve con Basic auth; el navegador la pide a
  // twilio-recording, que la retransmite.
  if (params.RecordingSid && params.RecordingUrl) {
    const recordingUrl = `${params.RecordingUrl}.mp3`;
    await service.from('call_logs').update({ recording_url: recordingUrl }).eq('id', log.id);
    // Transcripción automática (Whisper) si hay OPENAI_API_KEY: corre en segundo plano.
    if (!log.transcript) background(transcribeCallLog(service, { id: log.id, connection_id: log.connection_id!, recording_url: recordingUrl, transcript: null }));
    return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  }

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

// twilio-call-status: status callbacks of the <Dial> in twilio-voice. Updates call_logs with the
// final state and duration of each call (initiated / ringing / answered / completed).
import { handle, serviceClient, fail, transcribeCallLog, background, twilio, authTokenOf, twilioSignatureValid, twilioRecordingUrlValid } from '../_shared/twilio.ts';

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const signature = req.headers.get('X-Twilio-Signature') || '';
  if (!signature) return fail('Firma inválida', 403);
  const callSid = params.CallSid;
  if (!/^CA[0-9a-f]{32}$/i.test(callSid || '')) return fail('CallSid inválido');
  if (params.DialCallSid && !/^CA[0-9a-f]{32}$/i.test(params.DialCallSid)) return fail('DialCallSid inválido');
  const service = serviceClient();

  // Twilio no siempre manda el SID que guardamos: en los callbacks del <Dial> y de la grabación
  // puede venir el SID del tramo hijo. Probamos CallSid, DialCallSid y, si nada coincide, le
  // preguntamos a Twilio por el padre de esa llamada.
  let log: { id: string; status: string; connection_id?: string; recording_url?: string | null; transcript?: string | null } | null = null;
  const trySid = async (sid: string | undefined) => {
    if (!sid || !/^CA[0-9a-f]{32}$/i.test(sid) || log) return;
    const { data } = await service.from('call_logs').select('id, status, connection_id, recording_url, transcript').eq('call_sid', sid).maybeSingle();
    if (data) log = data;
  };
  await trySid(callSid);
  await trySid(params.DialCallSid);
  // Read only the connection needed to authenticate; never mutate or call Twilio before verification.
  let connectionQuery = service.from('twilio_connections').select('id, account_sid');
  connectionQuery = log
    ? connectionQuery.eq('id', log.connection_id)
    : connectionQuery.eq('account_sid', params.AccountSid || '');
  const { data: conn } = await connectionQuery.maybeSingle();
  if (!conn || conn.account_sid !== params.AccountSid) return fail('Conexión desconocida', 403);
  const token = await authTokenOf(service, conn.id);
  const publicUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-call-status${new URL(req.url).search}`;
  if (!await twilioSignatureValid(publicUrl, params, signature, token)) return fail('Firma inválida', 403);
  if (!log) {
    try {
      const call = await twilio(conn.account_sid, token, `/Accounts/${conn.account_sid}/Calls/${callSid}.json`) as Record<string, unknown>;
      await trySid(call.parent_call_sid as string);
    } catch { /* llamada ajena a esta cuenta */ }
  }
  if (!log) return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  if (log.connection_id !== conn.id) return fail('Llamada no corresponde', 403);

  // Recording status callback (record="record-from-answer-dual" en twilio-voice): guarda la URL de la
  // grabación en el registro de la llamada. Twilio la sirve con Basic auth; el navegador la pide a
  // twilio-recording, que la retransmite.
  if (params.RecordingSid && params.RecordingUrl) {
    if (!twilioRecordingUrlValid(params.RecordingUrl, conn.account_sid)) return fail('URL de grabación inválida', 400);
    const recordingUrl = `${params.RecordingUrl}.mp3`;
    const { error: updateError } = await service.from('call_logs').update({ recording_url: recordingUrl }).eq('id', log.id);
    if (updateError) throw updateError;
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
  const { error: updateError } = await service.from('call_logs').update(update).eq('id', log.id);
  if (updateError) throw updateError;
  return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}));

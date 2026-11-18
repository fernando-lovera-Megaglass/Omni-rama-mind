// twilio-transcribe: the «Transcribir» button of CRM › Llamadas, for recordings that existed
// before automatic transcription (or when it failed). POST { callSid } with the user's JWT →
// downloads the recording from Twilio, sends it to OpenAI Whisper and saves call_logs.transcript.
import { handle, userFromRequest, serviceClient, json, fail, transcribeCallLog } from '../_shared/twilio.ts';

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const user = await userFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const callSid = String((body as Record<string, unknown>).callSid || '');
  if (!callSid) return fail('Falta callSid.', 400, { code: 'no_call' });
  if (!Deno.env.get('OPENAI_API_KEY')) return fail('Falta configurar la clave de OpenAI (OPENAI_API_KEY) en los secretos de Supabase para transcribir.', 400, { code: 'no_openai' });

  const service = serviceClient();
  const { data: log } = await service.from('call_logs').select('id, user_id, connection_id, recording_url, transcript').eq('call_sid', callSid).maybeSingle();
  if (!log || log.user_id !== user.id) return fail('No encontré esa llamada.', 404, { code: 'not_found' });
  if (log.transcript) return json({ ok: true, transcript: log.transcript, already: true });
  if (!log.recording_url) return fail('Esa llamada no tiene grabación.', 404, { code: 'no_recording' });

  const transcript = await transcribeCallLog(service, log);
  return json({ ok: true, transcript });
}));

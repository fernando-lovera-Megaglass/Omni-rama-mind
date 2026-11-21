// Public Twilio callback; authentication is the account's X-Twilio-Signature.
import { handle, serviceClient, fail, requireEnv, authTokenOf, twilioSignatureValid } from '../_shared/twilio.ts';
import { applyMessageStatus, messageError, messageStatusKnown } from '../_shared/twilio-message.ts';

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const signature = req.headers.get('X-Twilio-Signature') || '';
  if (!signature) return fail('Firma inválida', 403);
  const params: Record<string, string> = {};
  (await req.formData()).forEach((v, k) => { params[k] = String(v); });
  const sid = params.MessageSid;
  if (!/^(SM|MM)[0-9a-f]{32}$/i.test(sid || '')) return fail('MessageSid inválido');
  if (!messageStatusKnown(params.MessageStatus)) return fail('Estado inválido');
  const url = new URL(req.url);
  const id = url.searchParams.get('message_id');
  const service = serviceClient();
  let query = service.from('twilio_messages').select('id, connection_id, message_sid').eq('direction', 'outbound');
  query = id ? query.eq('id', id) : query.eq('message_sid', sid);
  const { data: message, error } = await query.maybeSingle();
  if (error) throw error;
  if (!message) return fail('Mensaje desconocido', 404);
  const { data: conn, error: connError } = await service.from('twilio_connections').select('id, account_sid').eq('id', message.connection_id).maybeSingle();
  if (connError) throw connError;
  if (!conn || conn.account_sid !== params.AccountSid) return fail('Cuenta incorrecta', 403);
  const token = await authTokenOf(service, conn.id);
  const publicUrl = `${requireEnv('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/twilio-message-status${url.search}`;
  if (!await twilioSignatureValid(publicUrl, params, signature, token)) return fail('Firma inválida', 403);
  if (message.message_sid && message.message_sid !== sid) return fail('MessageSid no corresponde', 403);
  await applyMessageStatus(service, message.id, conn.id, sid, params.MessageStatus,
    messageError(params.ErrorCode, params.ErrorMessage || params.ChannelStatusMessage));
  return new Response(null, { status: 204 });
}));

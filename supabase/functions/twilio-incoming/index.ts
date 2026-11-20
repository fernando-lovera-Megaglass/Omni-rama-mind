// Voice number webhook and signed callbacks for the forwarded leg. Never creates outbound logs.
import { handle, serviceClient, fail, authTokenOf, twilioSignatureValid, twiml, xmlEscape } from '../_shared/twilio.ts';

const terminal = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];
const active = ['queued', 'initiated', 'ringing', 'in-progress'];

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const params: Record<string, string> = {};
  (await req.formData()).forEach((v, k) => { params[k] = String(v); });
  const url = new URL(req.url);
  const callback = url.searchParams.get('event') === 'status';
  const service = serviceClient();
  let query = service.from('twilio_connections').select('*').eq('account_sid', params.AccountSid || '');
  query = callback ? query.eq('id', url.searchParams.get('connection')) : query.eq('phone_number', params.To || '');
  const { data: conn, error } = await query.maybeSingle();
  if (error) throw error;
  if (!conn) return fail('Conexión desconocida', 403);
  const token = await authTokenOf(service, conn.id);
  const publicUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-incoming${url.search}`;
  if (!await twilioSignatureValid(publicUrl, params, req.headers.get('X-Twilio-Signature') || '', token)) return fail('Firma inválida', 403);
  if (!/^CA[0-9a-f]{32}$/i.test(params.CallSid || '')) return fail('CallSid inválido');

  if (callback) {
    const parent = url.searchParams.get('parent');
    if (!parent || (params.CallSid !== parent && params.ParentCallSid !== parent)) return fail('Llamada no corresponde', 403);
    // DialCallStatus takes precedence over the still-active parent CallStatus in Dial action.
    const status = params.DialCallStatus || params.CallStatus;
    if (![...active, ...terminal].includes(status)) return fail('Estado inválido');
    const final = terminal.includes(status);
    const update: Record<string, unknown> = { status };
    if (final) {
      const duration = Number(params.DialCallDuration ?? params.CallDuration ?? 0);
      if (!Number.isInteger(duration) || duration < 0) return fail('Duración inválida');
      update.duration_sec = duration;
      update.ended_at = new Date().toISOString();
    }
    // Atomic monotonic transitions: late progress and duplicate terminal events cannot overwrite the result.
    const allowed = final ? active : active.slice(0, active.indexOf(status) + 1);
    const { error: updateError } = await service.from('call_logs').update(update)
      .eq('call_sid', parent).eq('connection_id', conn.id).eq('direction', 'inbound').in('status', allowed);
    if (updateError) throw updateError;
    return twiml('<Hangup/>');
  }

  const target = conn.incoming_forward_number || '';
  const canForward = conn.status === 'active' && /^\+[1-9]\d{7,14}$/.test(target) && target !== conn.phone_number;
  let who: { id: unknown; company_id: unknown } | null = null;
  const digits = (params.From || '').replace(/\D/g, '').slice(-10);
  if (digits.length === 10) {
    // Page through contacts: PostgREST's server row cap otherwise silently truncates matching.
    for (let offset = 0; ; offset += 500) {
      const { data, error: contactError } = await service.from('contacts').select('id,phone,mobilephone,company_id')
        .eq('user_id', conn.user_id).is('deleted_at', null).order('id').range(offset, offset + 499);
      if (contactError) throw contactError;
      who = (data || []).find(c => [c.phone, c.mobilephone].some(p => String(p || '').replace(/\D/g, '').slice(-10) === digits)) || null;
      if (who || !data || data.length < 500) break;
    }
  }
  const { error: insertError } = await service.from('call_logs').insert({
    user_id: conn.user_id, connection_id: conn.id, call_sid: params.CallSid,
    direction: 'inbound', from_number: params.From || 'unknown', to_number: conn.phone_number,
    status: canForward ? 'ringing' : 'failed', started_at: new Date().toISOString(),
    ...(!canForward ? { ended_at: new Date().toISOString(), duration_sec: 0 } : {}),
    contact_id: who ? String(who.id) : null, company_id: who?.company_id ? String(who.company_id) : null,
  });
  if (insertError && insertError.code !== '23505') throw insertError;
  if (!canForward) return twiml('<Say language="es-MX">No podemos recibir tu llamada en este momento.</Say><Hangup/>');
  const statusUrl = xmlEscape(`${publicUrl.split('?')[0]}?event=status&connection=${conn.id}&parent=${params.CallSid}`);
  return twiml(`<Dial answerOnBridge="true" timeout="30" callerId="${xmlEscape(conn.phone_number)}" action="${statusUrl}" method="POST"><Number statusCallback="${statusUrl}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${xmlEscape(target)}</Number></Dial>`);
}));

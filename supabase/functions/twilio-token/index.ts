// twilio-token: issues a Twilio Access Token (JWT, HS256) so the browser can make and receive
// calls with the Twilio Voice SDK. The token carries a Voice grant: outbound through our TwiML
// App (whose VoiceUrl is twilio-voice) and inbound to the identity omni-<userId>.
// GET (Authorization: Bearer <Supabase JWT>) → { token, identity, ttlSec }
import { handle, userFromRequest, serviceClient, json, fail, connectionOf, TwilioError } from '../_shared/twilio.ts';

const b64url = (input: string | Uint8Array): string => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function accessToken({ apiKeySid, apiKeySecret, accountSid, identity, twimlAppSid, ttlSec }: { apiKeySid: string; apiKeySecret: string; accountSid: string; identity: string; twimlAppSid: string; ttlSec: number }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { cty: 'twilio-fpa;v=1', typ: 'JWT', alg: 'HS256' };
  const payload = {
    jti: `${apiKeySid}-${now}`,
    iss: apiKeySid,
    sub: accountSid,
    exp: now + ttlSec,
    nbf: now - 10,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: twimlAppSid },
      },
    },
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiKeySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

Deno.serve(handle(async (req) => {
  const user = await userFromRequest(req);
  if (req.method !== 'GET' && req.method !== 'POST') return fail('Usa GET o POST', 405);
  const service = serviceClient();
  const c = await connectionOf(service, user.id);
  if (!c) return fail('Primero conecta tu cuenta de Twilio en Ajustes › Llamadas.', 400, { code: 'no_connection' });
  if (c.status !== 'active') return fail(`Tu conexión de Twilio está «${c.status}». Revísala en Ajustes › Llamadas.`, 400, { code: 'not_active' });

  const { data: sec } = await service.from('twilio_connection_secrets').select('api_key_sid, api_key_secret, twiml_app_sid').eq('connection_id', c.id).maybeSingle();
  if (!sec || !sec.api_key_sid || !sec.api_key_secret || !sec.twiml_app_sid) {
    return fail('La conexión no tiene llaves de voz. Ejecuta scripts/twilio-voice-setup.mjs.', 400, { code: 'no_voice_keys' });
  }
  const identity = `omni-${user.id}`;
  const ttlSec = 3600;
  const token = await accessToken({ apiKeySid: sec.api_key_sid, apiKeySecret: sec.api_key_secret, accountSid: c.account_sid, identity, twimlAppSid: sec.twiml_app_sid, ttlSec });
  return json({ token, identity, ttlSec, phoneNumber: c.phone_number });
}));

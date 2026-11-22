// gmail-auth-url: builds the Google OAuth consent URL for the signed-in user.
// POST { returnTo, email? } (Authorization: Bearer <Supabase JWT>) → { url, redirectUri }
// The state carries the user id and the page to return to, signed with the client secret (10 minutes).
import { handle, userFromRequest, requireEnv, signState, callbackUrl, SCOPES, json, fail, env } from '../_shared/gmail.ts';

Deno.serve(handle(async (req) => {
  const user = await userFromRequest(req);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const returnTo = String(body.returnTo || req.headers.get('Origin') || '');
  if (!/^https?:\/\//.test(returnTo)) return fail('returnTo debe ser la URL completa de la página de Omni a la que volver.');
  const allowed = env('APP_URL').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.some((a) => returnTo.startsWith(a))) return fail('returnTo no está entre los orígenes permitidos (APP_URL).', 403);
  const state = await signState({ uid: user.id, returnTo, nonce: crypto.randomUUID(), exp: Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: callbackUrl(),
    response_type: 'code',
    scope: [...SCOPES, ...(body.app === 'gcal' ? ['https://www.googleapis.com/auth/calendar.events.readonly'] : [])].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (body.email) params.set('login_hint', String(body.email));
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, redirectUri: callbackUrl() });
}));

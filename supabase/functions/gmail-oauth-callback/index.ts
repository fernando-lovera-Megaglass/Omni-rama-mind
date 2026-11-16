// gmail-oauth-callback: where Google sends the browser after the consent screen (verify_jwt = false, the
// request carries no Supabase session). It checks the signed state, exchanges the code for tokens with the
// client secret, reads the account's e-mail, stores the account (connected_accounts) and its tokens
// (connected_account_tokens, service role only) and sends the browser back to Omni with
// ?gmail=connected&email=… or ?gmail=error&reason=….
import { verifyState, requireEnv, callbackUrl, serviceClient, CORS } from '../_shared/gmail.ts';

const page = (title: string, text: string, status = 400) => new Response(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;padding:40px"><h2>${title}</h2><p>${text}</p></body>`, { status, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const u = new URL(req.url);
  let state: Record<string, unknown> | null = null;
  try { state = await verifyState(u.searchParams.get('state') || ''); } catch (e) { return page('Configuración incompleta', (e as Error).message, 500); }
  if (!state || typeof state.returnTo !== 'string' || typeof state.uid !== 'string') return page('Enlace no válido o caducado', 'Vuelve a Omni y pulsa «Conectar cuenta de correo» de nuevo.');
  const back = (q: Record<string, string>) => {
    const t = new URL(state!.returnTo as string);
    Object.entries(q).forEach(([k, v]) => t.searchParams.set(k, v));
    return new Response(null, { status: 302, headers: { ...CORS, Location: t.toString() } });
  };
  if (u.searchParams.get('error')) return back({ gmail: 'error', reason: u.searchParams.get('error') || 'denegado' });
  const code = u.searchParams.get('code');
  if (!code) return back({ gmail: 'error', reason: 'sin_codigo' });

  let clientId = '';
  let clientSecret = '';
  try { clientId = requireEnv('GOOGLE_CLIENT_ID'); clientSecret = requireEnv('GOOGLE_CLIENT_SECRET'); } catch (e) { return back({ gmail: 'error', reason: (e as Error).message }); }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl(), grant_type: 'authorization_code' }),
  });
  const tok = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tok.access_token) return back({ gmail: 'error', reason: tok.error_description || tok.error || 'intercambio_fallido' });

  const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const info = await infoRes.json().catch(() => ({}));
  const email = String(info.email || '').toLowerCase();
  if (!email) return back({ gmail: 'error', reason: 'sin_correo' });

  const service = serviceClient();
  const now = new Date().toISOString();
  const scopes = String(tok.scope || '').split(' ').filter(Boolean);
  const { data: existing } = await service.from('connected_accounts').select('id').eq('user_id', state.uid).eq('provider', 'gmail').ilike('email', email).maybeSingle();
  let id = existing ? existing.id : null;
  if (id) {
    const { error } = await service.from('connected_accounts').update({ status: 'active', last_error: null, scopes, last_checked_at: now, updated_at: now }).eq('id', id);
    if (error) return back({ gmail: 'error', reason: `db:${error.message}` });
  } else {
    const { data: ins, error } = await service.from('connected_accounts').insert({ user_id: state.uid, provider: 'gmail', email, scopes, status: 'active', last_checked_at: now }).select('id').single();
    if (error || !ins) return back({ gmail: 'error', reason: `db:${error ? error.message : 'insert'}` });
    id = ins.id;
  }
  // Google only returns the refresh token on the first consent (or with prompt=consent): keep the old one otherwise.
  const { data: old } = await service.from('connected_account_tokens').select('refresh_token').eq('account_id', id).maybeSingle();
  const { error: e2 } = await service.from('connected_account_tokens').upsert({
    account_id: id,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || (old ? old.refresh_token : null),
    token_type: tok.token_type || 'Bearer',
    expires_at: new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString(),
    updated_at: now,
  }, { onConflict: 'account_id' });
  if (e2) return back({ gmail: 'error', reason: `db:${e2.message}` });
  return back({ gmail: 'connected', email });
});

// gmail-account: the real state of the user's Gmail accounts and their lifecycle.
// GET  (Authorization: Bearer <Supabase JWT>) → { accounts: [{ id, email, status, lastError, messagesTotal, checkedAt, lastSyncedAt }] }
//      Each account is checked against gmail.users.getProfile (refreshing the token when needed); the result
//      is stored in connected_accounts (status / last_error / last_checked_at).
// POST { action: 'disconnect' | 'disable' | 'enable', accountId } → { ok, … }
//      disconnect revokes the Google token (best effort) and deletes the account, its tokens and messages.
import { handle, userFromRequest, serviceClient, accountsOf, accountFor, accessTokenFor, gmail, markStatus, json, fail } from '../_shared/gmail.ts';
import type { Account } from '../_shared/gmail.ts';

async function check(service: ReturnType<typeof serviceClient>, a: Account) {
  if (a.status === 'disabled') return { id: a.id, email: a.email, status: 'disabled', lastError: null, messagesTotal: null, checkedAt: new Date().toISOString(), lastSyncedAt: a.last_synced_at };
  try {
    const token = await accessTokenFor(service, a);
    const p = await gmail(token, 'profile') as { emailAddress?: string; messagesTotal?: number };
    const status = a.last_sync_error ? 'error' : 'active';
    await markStatus(service, a.id, status, a.last_sync_error || null);
    return { id: a.id, email: p.emailAddress || a.email, status, lastError: a.last_sync_error || null, messagesTotal: p.messagesTotal ?? null, checkedAt: new Date().toISOString(), lastSyncedAt: a.last_synced_at };
  } catch (e) {
    const message = (e as Error).message || 'No se pudo comprobar la cuenta';
    await markStatus(service, a.id, 'error', message);
    return { id: a.id, email: a.email, status: 'error', lastError: message, messagesTotal: null, checkedAt: new Date().toISOString(), lastSyncedAt: a.last_synced_at };
  }
}

Deno.serve(handle(async (req) => {
  const user = await userFromRequest(req);
  const service = serviceClient();
  if (req.method === 'GET') {
    const list = await accountsOf(service, user.id);
    const accounts = [];
    for (const a of list) accounts.push(await check(service, a));
    return json({ accounts });
  }
  if (req.method !== 'POST') return fail('Usa GET o POST', 405);
  const b = await req.json().catch(() => ({}));
  const account = await accountFor(service, user.id, b.accountId);
  if (!account) return fail('Cuenta no encontrada.', 404, { code: 'no_account' });
  if (b.action === 'disconnect') {
    const { data: t } = await service.from('connected_account_tokens').select('refresh_token, access_token').eq('account_id', account.id).maybeSingle();
    const token = t && (t.refresh_token || t.access_token);
    if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => null);
    const { error } = await service.from('connected_accounts').delete().eq('id', account.id);
    if (error) throw error;
    return json({ ok: true, id: account.id });
  }
  if (b.action === 'disable') { await markStatus(service, account.id, 'disabled'); return json({ ok: true, id: account.id, status: 'disabled' }); }
  if (b.action === 'enable') { await markStatus(service, account.id, 'active'); return json({ ok: true, ...(await check(service, { ...account, status: 'active' })) }); }
  return fail('Acción desconocida.');
}));

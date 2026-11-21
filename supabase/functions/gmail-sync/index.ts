// gmail-sync: brings the latest INBOX messages of the user's Gmail into inbox_messages (one row per Gmail
// message, only the ones not stored yet), matching the sender with a contact by e-mail.
// POST { accountId?, max? (default 50) } (Authorization: Bearer <Supabase JWT>)
// → { ok, fetched, inserted, matched, account }
// The app then turns the pending rows (imported_at null) into conversations of the Bandeja de entrada and logs
// them on the contact's timeline (src/gmail-inbox.js).
import { handle, userFromRequest, serviceClient, accountFor, withAccount, gmail, headerOf, parseAddress, extractBodies, htmlToText, json, fail, GmailError } from '../_shared/gmail.ts';

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const user = await userFromRequest(req);
  const b = await req.json().catch(() => ({}));
  const max = Math.max(1, Math.min(Number(b.max) || 50, 100));
  const service = serviceClient();
  const account = await accountFor(service, user.id, b.accountId);
  if (!account) return fail('No hay ninguna cuenta de Gmail conectada: conéctala en Ajustes › Correo.', 404, { code: 'no_account' });

  if (account.status === 'disabled') return fail('La cuenta está desactivada.', 409, { code: 'disabled' });

  try {
    const rows = await withAccount(service, account, async (token) => {
      const listing = await gmail(token, `messages?labelIds=INBOX&maxResults=${max}`) as { messages?: { id: string; threadId: string }[] };
      const ids = (listing.messages || []).map((m) => m.id);
      if (!ids.length) return { ids, fresh: [] as Record<string, unknown>[] };
      const { data: known, error } = await service.from('inbox_messages').select('gmail_id').eq('account_id', account.id).in('gmail_id', ids);
      if (error) throw error;
      const seen = new Set((known || []).map((k: { gmail_id: string }) => k.gmail_id));
      const fresh: Record<string, unknown>[] = [];
      for (const id of ids.filter((x) => !seen.has(x))) {
        const m = await gmail(token, `messages/${id}?format=full`) as Record<string, unknown>;
        const payload = m.payload as { headers?: { name: string; value: string }[]; parts?: unknown[] } | undefined;
        const headers = (payload && payload.headers) || [];
        const from = parseAddress(headerOf(headers, 'From'));
        const bodies = extractBodies(payload as never);
        fresh.push({
          account_id: account.id,
          user_id: user.id,
          gmail_id: m.id,
          thread_id: m.threadId || null,
          rfc_message_id: headerOf(headers, 'Message-ID') || null,
          from_email: from.email || null,
          from_name: from.name || null,
          to_email: headerOf(headers, 'To') || null,
          subject: headerOf(headers, 'Subject') || '(sin asunto)',
          snippet: String(m.snippet || ''),
          body_text: bodies.text || htmlToText(bodies.html),
          body_html: bodies.html || '',
          received_at: new Date(Number(m.internalDate) || Date.now()).toISOString(),
          unread: ((m.labelIds as string[]) || []).includes('UNREAD'),
          labels: (m.labelIds as string[]) || [],
          contact_id: null,
        });
      }
      return { ids, fresh };
    });

    // Match the senders with contacts (by e-mail, case-insensitive).
    const emails = [...new Set(rows.fresh.map((r) => String(r.from_email || '')).filter(Boolean))];
    if (emails.length) {
      const or = emails.map((e) => `email.ilike.${e.replace(/[,()]/g, '')}`).join(',');
      const { data: contacts, error: contactsError } = await service.from('contacts').select('id, email').or(or).is('deleted_at', null);
      if (contactsError) throw contactsError;
      const byEmail = new Map((contacts || []).map((c: { id: number; email: string }) => [String(c.email || '').toLowerCase(), c.id]));
      rows.fresh.forEach((r) => { r.contact_id = byEmail.get(String(r.from_email || '').toLowerCase()) || null; });
    }
    if (rows.fresh.length) {
      const { error } = await service.from('inbox_messages').insert(rows.fresh);
      if (error) throw error;
    }
    const now = new Date().toISOString();
    const { error: syncError } = await service.from('connected_accounts').update({ last_sync_error: null, last_sync_attempt_at: now, last_synced_at: now, status: 'active', last_error: null, last_checked_at: now, updated_at: now }).eq('id', account.id);
    if (syncError) throw syncError;
    return json({ ok: true, fetched: rows.ids.length, inserted: rows.fresh.length, matched: rows.fresh.filter((r) => r.contact_id).length, account: account.email });
  } catch (e) {
    const message = e instanceof GmailError ? e.message : 'No se pudo sincronizar Gmail. Intenta de nuevo.';
    const now = new Date().toISOString();
    const { error: recordError } = await service.from('connected_accounts').update({
      status: 'error', last_error: message, last_sync_error: message,
      last_sync_attempt_at: now, updated_at: now,
    }).eq('id', account.id);
    // Log identifiers/codes only; never tokens or message contents.
    console.error('gmail-sync failed', { accountId: account.id, code: e instanceof GmailError ? e.code : 'sync_failed', errorPersisted: !recordError });
    throw e;
  }
}));

import { handle, serviceClient, requireEnv, fail, json, withAccount, gmail, buildMime, b64urlEncode } from '../_shared/gmail.ts';
import { processDue } from './processor.mjs';
import { createStore } from './store.mjs';

Deno.serve(handle(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}`) return fail('Service role required', 401);
  if (req.method === 'GET') return json({ ok: true, service: 'sequence-process', activationVersion: 1 });
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const db = serviceClient();
  const results = await processDue(createStore(db), async (enrollment, step, payload) => {
    if (!enrollment.sender_account_id) throw new Error('Missing sender_account_id; configure enrollment sender');
    const { data: account, error } = await db.from('connected_accounts').select('*').eq('id', enrollment.sender_account_id).eq('provider', 'gmail').eq('status', 'active').single();
    if (error || !account) throw new Error('Sender Gmail account unavailable');
    let threadId: string | undefined;
    let inReplyTo: string | undefined;
    if (step.reply_to_previous) {
      const { data: previous, error: previousError } = await db.from('sequence_step_runs').select('receipt')
        .eq('enrollment_id', enrollment.id).eq('status', 'done').lt('step_number', enrollment.current_step)
        .order('step_number', { ascending: false });
      if (previousError) throw previousError;
      const receipt = previous?.find((r) => r.receipt?.id)?.receipt;
      if (!receipt) throw new Error('Previous email receipt missing for threaded reply');
      const message = await withAccount(db, account, (token) => gmail(token, `messages/${encodeURIComponent(receipt.id)}?format=metadata&metadataHeaders=Message-ID`));
      threadId = receipt.threadId;
      inReplyTo = (message.payload as { headers?: { name: string; value: string }[] })?.headers?.find((h) => h.name.toLowerCase() === 'message-id')?.value;
      if (!threadId || !inReplyTo) throw new Error('Previous email threading metadata missing');
    }
    // Same transport, OAuth refresh and MIME builder as gmail-send. That HTTP endpoint
    // requires a user JWT, so the service worker reuses its helpers, never impersonates a user.
    const raw = buildMime({ from: account.email, to: [payload.to], subject: payload.subject, html: payload.html, inReplyTo });
    return await withAccount(db, account, (token) => gmail(token, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: b64urlEncode(raw), ...(threadId ? { threadId } : {}) }) }));
  });
  return json({ ok: !results.some((r) => r.status === 'error'), results });
}));

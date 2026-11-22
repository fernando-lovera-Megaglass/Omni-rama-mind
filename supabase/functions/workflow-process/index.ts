// workflow-process: resumes the workflow runs that wait for a delay (workflow_runs with estado 'waiting' and
// proxima_ejecucion already past, plus 'active' runs abandoned by a closed tab) and executes their next steps:
// create task / record, internal notifications (timeline), property edits, owner, branches, jumps, the next delay
// (which schedules proxima_ejecucion again) and «Enviar correo» through the first active connected Gmail account.
// POST {} (Authorization: Bearer <service role key>) → { ok, results: [{ id, status: waiting|completed|failed|cancelled|error }] }.
// Invoked on a timer by scripts/local-scheduler.mjs (local Supabase) or scripts/remote-scheduler.mjs --functions workflow-process.
// Requires supabase/workflow_runs.sql and supabase/workflow-process.sql.
import { handle, serviceClient, requireEnv, fail, json, withAccount, gmail, buildMime, b64urlEncode } from '../_shared/gmail.ts';
import { processDue } from './processor.mjs';
import { createStore } from './store.mjs';

const textToHtml = (text: string): string => String(text || '').split(/\n{2,}/).map((p) => `<p>${p.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)).replace(/\n/g, '<br>')}</p>`).join('');

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  if (req.headers.get('Authorization') !== `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}`) return fail('Service role required', 401);
  const db = serviceClient();
  const store = createStore(db);
  // Same transport, OAuth refresh and MIME builder as gmail-send; the sender is the first active connected
  // account (the same «De» the composer offers), never an impersonated user.
  store.sendEmail = async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
    const { data: account, error } = await db.from('connected_accounts').select('*').eq('provider', 'gmail').eq('status', 'active').order('created_at').limit(1).maybeSingle();
    if (error) throw error;
    if (!account) throw new Error('No hay ninguna cuenta de correo conectada (Ajustes › General › Correo)');
    const raw = buildMime({ from: account.email, to: [to], subject, html: textToHtml(body) });
    const res = await withAccount(db, account, (token) => gmail(token, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: b64urlEncode(raw) }) }));
    return { from: account.email, via: 'gmail', id: (res as { id?: string }).id || '', threadId: (res as { threadId?: string }).threadId || '' };
  };
  const results = await processDue(store);
  return json({ ok: !results.some((r) => r.status === 'error'), results });
}));

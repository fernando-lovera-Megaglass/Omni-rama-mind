// marketing-process: the worker that sends the scheduled marketing e-mails (marketing_emails with estado
// 'programado' and programado_para already past) through the sender's connected Gmail account, in batches, and
// marks them 'enviado' with enviado_at and the counters. POST {} (Authorization: Bearer <service role key>)
// → { ok, results: [{ id, status: sent|partial|error|cancelled|deferred|unchanged, processed, total }] }.
// Invoked on a timer by scripts/local-scheduler.mjs (local Supabase) or by pg_cron (see marketing-process.sql).
// Limits (env, optional): MARKETING_SEND_LIMIT per invocation (50), MARKETING_DAILY_LIMIT per UTC day (400,
// under Gmail's 500/day for personal accounts), MARKETING_SEND_PAUSE_MS between messages (250).
import { handle, serviceClient, requireEnv, env, fail, json, withAccount, gmail, buildMime, b64urlEncode } from '../_shared/gmail.ts';
import { processDue } from './processor.mjs';
import { createStore } from './store.mjs';

const num = (key: string, fallback: number): number => { const n = Number(env(key)); return Number.isFinite(n) && n >= 0 && env(key) !== '' ? n : fallback; };

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  if (req.headers.get('Authorization') !== `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}`) return fail('Service role required', 401);
  const db = serviceClient();
  const results = await processDue(createStore(db), async (email, account, person) => {
    // Same transport, OAuth refresh and MIME builder as gmail-send. That HTTP endpoint requires a user JWT,
    // so the worker reuses its helpers with the campaign's own connected account, never impersonates a user.
    const fromName = String(email.de_nombre || '').replace(/["<>]/g, '').trim();
    const raw = buildMime({
      from: fromName ? `${fromName} <${account.email}>` : account.email,
      to: [person.email],
      subject: String(email.asunto || '(sin asunto)'),
      html: email.html_content ? String(email.html_content) : undefined,
      text: email.html_content ? undefined : String(email.asunto || ''),
    });
    const res = await withAccount(db, account, (token) => gmail(token, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: b64urlEncode(raw) }) }));
    return { id: res.id, threadId: res.threadId };
  }, new Date(), { perRun: num('MARKETING_SEND_LIMIT', 50), daily: num('MARKETING_DAILY_LIMIT', 400), pauseMs: num('MARKETING_SEND_PAUSE_MS', 250) });
  return json({ ok: !results.some((r) => r.status === 'error'), results });
}));

// Default: print SQL only. --apply is an explicit remote mutation; never needed for local tests.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function buildSweepSql() {
  return `BEGIN;
-- Stable cutoff and exclusive write window: callbacks cannot race the before/after audit.
LOCK TABLE public.call_logs, public.twilio_messages IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS extra jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.twilio_messages ADD COLUMN IF NOT EXISTS extra jsonb DEFAULT '{}'::jsonb;
CREATE TEMP TABLE sweep_comms_before ON COMMIT DROP AS
SELECT 'call_logs'::text AS source, id::text, status, duration_sec,
       extra, created_at
FROM public.call_logs
WHERE status IN ('ringing', 'initiated') AND created_at < now() - interval '1 hour'
UNION ALL
SELECT 'twilio_messages', id::text, status, NULL::integer, extra, created_at
FROM public.twilio_messages
WHERE status = 'queued' AND channel = 'sms' AND created_at < now() - interval '1 hour';

UPDATE public.call_logs AS c
SET status = CASE WHEN
      nullif(btrim(to_jsonb(c)->>'last_error'), '') IS NOT NULL OR
      nullif(btrim(c.extra->>'last_error'), '') IS NOT NULL
    THEN 'failed' ELSE 'no-answer' END,
    duration_sec = coalesce(c.duration_sec, 0),
    extra = coalesce(c.extra, '{}'::jsonb) || jsonb_build_object(
      'notice', concat_ws(E'\\n', nullif(c.extra->>'notice', ''), 'barrido de residuo 23-nov'),
      'residue_sweep', jsonb_build_object('at', now(), 'previous_status', c.status,
        'classification', 'historical_timeout', 'provider_verified', false))
WHERE c.status IN ('ringing', 'initiated') AND c.created_at < now() - interval '1 hour';

UPDATE public.twilio_messages AS m
SET status = 'failed',
    extra = coalesce(m.extra, '{}'::jsonb) || jsonb_build_object(
      'notice', concat_ws(E'\\n', nullif(m.extra->>'notice', ''), 'barrido de residuo 23-nov'),
      'residue_sweep', jsonb_build_object('at', now(), 'previous_status', m.status,
        'classification', 'historical_timeout', 'provider_verified', false))
WHERE m.status = 'queued' AND m.channel = 'sms' AND m.created_at < now() - interval '1 hour';

-- Counters only: no phone numbers, message bodies or credentials in the report.
SELECT jsonb_build_object(
  'cutoff', now() - interval '1 hour',
  'before', jsonb_build_object(
    'stuck_calls', (SELECT count(*) FROM sweep_comms_before WHERE source = 'call_logs'),
    'queued_sms', (SELECT count(*) FROM sweep_comms_before WHERE source = 'twilio_messages')),
  'after', jsonb_build_object(
    'stuck_calls', (SELECT count(*) FROM public.call_logs WHERE status IN ('ringing', 'initiated') AND created_at < now() - interval '1 hour'),
    'queued_sms', (SELECT count(*) FROM public.twilio_messages WHERE status = 'queued' AND channel = 'sms' AND created_at < now() - interval '1 hour'))
) AS evidence;
COMMIT;`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === '--sql')) {
    console.log(buildSweepSql());
  } else if (args.length === 1 && args[0] === '--apply') {
    try {
      const { runSql } = await import('./mgmt-sql.mjs');
      console.log(JSON.stringify(await runSql(buildSweepSql()), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  } else {
    console.error('Uso: node scripts/sweep-stuck-comms.mjs [--sql | --apply]. Sin argumentos solo imprime SQL; --apply modifica Supabase.');
    process.exitCode = 1;
  }
}

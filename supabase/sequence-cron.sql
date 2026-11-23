-- Apply as postgres. This migration deliberately leaves the job INACTIVE until
-- scripts/sequence-activate.mjs verifies deployment and completes the backfill.
-- Vault secrets required at activation: sequence_project_url, sequence_service_role_key.
-- Reapplying pauses the job; run activation again after reviewing the backlog.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;
select cron.schedule('omni-sequence-process', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sequence_project_url') || '/functions/v1/sequence-process',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sequence_service_role_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
$job$);
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'omni-sequence-process';
commit;
-- Rollback (does not undo sends, tasks, step runs or backfill):
-- select cron.unschedule(jobid) from cron.job where jobname = 'omni-sequence-process';
-- Keep shared extensions and Vault secrets; see docs/sequence-process.md.

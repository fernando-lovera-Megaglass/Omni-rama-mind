// Explicit remote activation only. Imports are inert; all SQL/fetch dependencies are injectable for offline tests.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkUrl, checkKey, ENV_URL, ENV_KEY } from './remote-scheduler.mjs';
import { PROJECT, runSql } from './mgmt-sql.mjs';
import { main as backfill } from './sequence-backfill.mjs';

export const JOB = 'omni-sequence-process';
export const VERIFY = `select count(*) filter (where status = 'active' and next_step_at <= now())::int as overdue,
 count(*) filter (where status = 'active' and next_step_at < now() - interval '1 day')::int as stale,
 count(*) filter (where status = 'active' and next_step_at > now())::int as future
 from public.sequence_enrollments`;
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
export async function main(argv = process.argv.slice(2), env = process.env, {
  sql = runSql, fetchImpl = fetch, backfillImpl = backfill, log = console.log,
} = {}) {
  if (argv.length !== 1 || argv[0] !== '--yes') throw new Error('Activación remota explícita: node scripts/sequence-activate.mjs --yes (requiere las dos variables SEQUENCE_REMOTE_*)');
  const base = checkUrl(env[ENV_URL]);
  checkKey(env[ENV_KEY]);
  if (base.origin !== `https://${PROJECT}.supabase.co`) throw new Error(`El proyecto debe coincidir con mgmt-sql.mjs: ${PROJECT}`);
  const deploy = `npx supabase functions deploy sequence-process --project-ref ${PROJECT}`;
  const response = await fetchImpl(new URL('/functions/v1/sequence-process', base), {
    method: 'GET', headers: { Authorization: `Bearer ${env[ENV_KEY]}`, apikey: env[ENV_KEY] }, signal: AbortSignal.timeout(30000),
  });
  const health = await response.json().catch(() => ({}));
  if (!response.ok || health.service !== 'sequence-process' || health.activationVersion !== 1 || health.ok !== true) {
    throw new Error(`Función ausente, antigua o no autenticada (HTTP ${response.status}). Despliega la versión local: ${deploy}. Usa el JWT service_role que coincide con SUPABASE_SERVICE_ROLE_KEY de la función.`);
  }
  const [extensions] = await sql("select to_regclass('cron.job') is not null as cron, to_regclass('vault.decrypted_secrets') is not null as vault");
  if (!extensions?.cron || !extensions?.vault) throw new Error('Aplica supabase/sequence-cron.sql como postgres; consulta docs/sequence-process.md');
  const jobs = await sql(`select jobid, active, schedule, command from cron.job where jobname = '${JOB}'`);
  if (jobs.length !== 1 || jobs[0].schedule !== '* * * * *' || !jobs[0].command.includes('/functions/v1/sequence-process') || !jobs[0].command.includes('net.http_post')) throw new Error('Cron ausente o inesperado: aplica supabase/sequence-cron.sql');
  // Compare secrets inside SQL; never return decrypted values or server error bodies.
  let configured;
  try {
    [configured] = await sql(`select
      (select decrypted_secret from vault.decrypted_secrets where name = 'sequence_project_url') = ${quote(base.origin)} as url_ok,
      (select decrypted_secret from vault.decrypted_secrets where name = 'sequence_service_role_key') = ${quote(env[ENV_KEY])} as key_ok`);
  } catch { throw new Error('No se pudo verificar Vault; revisa su configuración en el runbook.'); }
  if (!configured?.url_ok || !configured?.key_ok) throw new Error('Configura en Vault sequence_project_url y sequence_service_role_key con los mismos valores del opt-in; consulta el runbook');
  // Pause before rescheduling, also on repeat activation. Failures leave it paused.
  await sql(`select cron.alter_job(jobid, active := false) from cron.job where jobname = '${JOB}'`);
  const result = await backfillImpl(['--from-db', '--apply', '--yes'], { log });
  const [counts] = await sql(VERIFY);
  if (!counts || Number(counts.overdue) !== 0 || Number(counts.stale) !== 0) throw new Error('Backfill incompleto: quedan activas vencidas. Cron permanece pausado.');
  await sql(`select cron.alter_job(jobid, active := true) from cron.job where jobname = '${JOB}'`);
  const active = await sql(`select jobid, active, schedule from cron.job where jobname = '${JOB}'`);
  if (active.length !== 1 || active[0].active !== true || active[0].schedule !== '* * * * *') throw new Error('No se confirmó el cron activo; inspecciona cron.job');
  log(`[activate] ${result.plan.reschedule.length} reprogramadas; ${counts.future} activas futuras; 0 vencidas; cron persistente activo cada minuto.`);
  log('[activate] Procesamiento todavía pendiente de confirmar: espera al primer next_step_at y verifica sequence_step_runs y respuestas HTTP según el runbook.');
  return { counts, rescheduled: result.plan.reschedule.length, job: active[0] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { await main(); } catch (error) { console.error(`[activate] ${error.message}`); process.exitCode = 1; }
}

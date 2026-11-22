// Remote invoker for sequence-process (and, on request, marketing-process) with an EXPLICIT opt-in: it only runs
// when the two variables below are set in the shell that launches it. It never reads .env, app/.supabase-mgmt-token
// or any other credentials file, never hardcodes a project and never prints the key (only the host).
//
//   SEQUENCE_REMOTE_URL=https://<ref>.supabase.co SEQUENCE_REMOTE_SERVICE_ROLE_KEY=<service role key> \
//     node scripts/remote-scheduler.mjs [--dry-run] [--once] [--functions sequence-process] [--every ms]
//
// --dry-run  invokes nothing: it lists, through PostgREST with the same key, the enrolments the function would
//            process now (status active with next_step_at already due), so connectivity, the key and the frozen
//            count can be checked before (and after) deploying the function. Exit code 0.
// --once     one invocation per function and exit (code 1 if any of them failed).
// (default)  one tick per minute, no overlapping requests, until the process is stopped. Same loop as
//            scripts/local-scheduler.mjs, which stays the only entry point for a LOCAL instance.
//
// The key must be a service role key (legacy JWT with role "service_role" or a new sb_secret_… key): the
// function refuses anything else, and so does this script before sending a byte. HTTPS is required; plain HTTP is
// accepted only for loopback hosts (the smoke test's fake server).
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export const ENV_URL = 'SEQUENCE_REMOTE_URL';
export const ENV_KEY = 'SEQUENCE_REMOTE_SERVICE_ROLE_KEY';
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

// The project URL, validated: https anywhere, http only on loopback; the path is ignored.
export function checkUrl(raw) {
  if (!raw) throw new Error(`Set ${ENV_URL} (https://<ref>.supabase.co) and ${ENV_KEY} to opt in; nothing is read from .env or any credentials file`);
  let url;
  try { url = new URL(String(raw)); } catch { throw new Error(`${ENV_URL} is not a valid URL`); }
  const loop = LOOPBACK.includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loop)) throw new Error(`${ENV_URL} must use https (plain http is only accepted for loopback hosts)`);
  url.pathname = '/'; url.search = ''; url.hash = '';
  return url;
}
// What kind of key this is; only service role keys pass.
export function checkKey(raw) {
  const key = String(raw || '').trim();
  if (!key) throw new Error(`Set ${ENV_KEY} to the project's service role key (Project Settings › API); it is never read from .env`);
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) throw new Error(`${ENV_KEY} is a publishable key; the function requires the service role key`);
  const parts = key.split('.');
  if (parts.length === 3) {
    let payload = {};
    try { payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { throw new Error(`${ENV_KEY} is not a readable JWT`); }
    if (payload.role !== 'service_role') throw new Error(`${ENV_KEY} has role "${payload.role || '?'}"; the service role key is required`);
    return 'service_role';
  }
  throw new Error(`${ENV_KEY} does not look like a service role key (sb_secret_… or a service_role JWT)`);
}
const headers = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

// Dry run: the enrolments the processor would pick up now (same predicate as sequence_due, minus the step-run
// reservation that only exists once the migration is applied). Rows waiting for a task have next_step_at null
// and are therefore never listed.
export async function listDue(base, key, now = new Date(), fetchImpl = fetch) {
  const url = new URL('/rest/v1/sequence_enrollments', base);
  url.search = new URLSearchParams({ select: 'id,sequence_id,contact_name,status,current_step,next_step_at', status: 'eq.active', next_step_at: `lte.${now.toISOString()}`, order: 'next_step_at.asc', limit: '200' }).toString();
  const response = await fetchImpl(url, { headers: headers(key), signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`PostgREST ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
// One invocation of an Edge Function; the function itself checks the service role.
export async function invoke(base, key, name, fetchImpl = fetch) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad function name: ${name}`);
  const response = await fetchImpl(new URL(`/functions/v1/${name}`, base), { method: 'POST', headers: headers(key), body: '{}', signal: AbortSignal.timeout(50_000) });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  if (!response.ok || !body.ok) throw new Error(`${name} failed (${response.status}): ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}
export const dueLine = (e) => `${e.id}  paso ${e.current_step}  vencido ${new Date(e.next_step_at).toISOString()}  ${e.contact_name || ''}`.trim();

export async function main(argv = process.argv.slice(2), env = process.env, { fetchImpl = fetch, log = console.log, error = console.error, now = () => new Date() } = {}) {
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? String(argv[i + 1] || '') : ''; };
  const base = checkUrl(env[ENV_URL]);
  const kind = checkKey(env[ENV_KEY]);
  const functions = (flag('--functions') || 'sequence-process').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9-]+$/.test(s));
  if (!functions.length) throw new Error('No function names given (--functions sequence-process)');
  const once = argv.includes('--once');
  const dryRun = argv.includes('--dry-run');
  const every = Math.max(5_000, Number(flag('--every')) || 60_000);
  log(`[remote-scheduler] proyecto ${base.host} · clave ${kind} · ${dryRun ? 'dry-run (no se invoca nada)' : once ? 'una invocación' : `cada ${Math.round(every / 1000)} s`} · ${functions.join(', ')}`);
  if (dryRun) {
    const rows = await listDue(base, env[ENV_KEY], now(), fetchImpl);
    log(`[remote-scheduler] ${rows.length} inscripciones activas vencidas que sequence-process procesaría ahora${rows.length ? ':' : '.'}`);
    rows.forEach((e) => log(`  ${dueLine(e)}`));
    return { dryRun: true, due: rows.length };
  }
  let failed = 0;
  do {
    for (const name of functions) {
      try { const body = await invoke(base, env[ENV_KEY], name, fetchImpl); log(`[${name}] ${JSON.stringify(body).slice(0, 600)}`); } catch (e) { failed += 1; error(`[${name}] ${e.message}`); }
    }
    if (!once) await new Promise((r) => setTimeout(r, every));
  } while (!once);
  return { once: true, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try {
    const result = await main();
    if (result.failed) process.exitCode = 1;
  } catch (e) {
    console.error(`[remote-scheduler] ${e.message}`);
    process.exitCode = 1;
  }
}

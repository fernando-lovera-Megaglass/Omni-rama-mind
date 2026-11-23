// PGlite cannot load pg_cron/pg_net: test migration SQL against explicit API doubles.
// Real extension installation and network dispatch remain operator acceptance checks.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
  await db.exec(`create schema cron; create schema net; create schema vault;
    create table cron.job(jobid serial primary key, jobname text unique, schedule text, command text, active boolean default true);
    create table vault.decrypted_secrets(name text unique, decrypted_secret text);
    insert into vault.decrypted_secrets values ('sequence_project_url', 'https://example.supabase.co'), ('sequence_service_role_key', 'fake');
    create table net.requests(url text, headers jsonb, body jsonb, timeout_ms integer);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values(n,s,c)
      on conflict(jobname) do update set schedule=excluded.schedule, command=excluded.command
      returning jobid::bigint $$;
    create function cron.alter_job(job_id bigint, active boolean) returns void language sql as $$
      update cron.job set active=$2 where jobid=$1 $$;
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint language sql as $$
      insert into net.requests values ($1,$2,$3,$4) returning 1::bigint $$;
    create function cron.unschedule(id bigint) returns boolean language sql as $$
      delete from cron.job where jobid=id returning true $$;`);
  const migration = readFileSync(new URL('../supabase/sequence-cron.sql', import.meta.url), 'utf8');
  assert.equal((migration.match(/create extension if not exists/g) || []).length, 3);
  const sql = migration.replace(/^create extension .*;$/gm, '');
  await db.exec(sql);
  await db.exec("update cron.job set active = true");
  await db.exec(sql);
  const { rows } = await db.query('select * from cron.job');
  assert.equal(rows.length, 1); assert.equal(rows[0].active, false); assert.equal(rows[0].schedule, '* * * * *');
  await db.exec(rows[0].command);
  const { rows: requests } = await db.query('select * from net.requests');
  assert.equal(requests[0].url, 'https://example.supabase.co/functions/v1/sequence-process');
  assert.equal(requests[0].headers.Authorization, 'Bearer fake');
  assert.equal(requests[0].timeout_ms, 50000);
  const rollback = "select cron.unschedule(jobid) from cron.job where jobname = 'omni-sequence-process'";
  await db.exec(rollback); await db.exec(rollback);
  assert.equal((await db.query('select * from cron.job')).rows.length, 0);
  console.log('[sequence-cron] OK: SQL, idempotencia, pausa, POST Vault y rollback con dobles de extensiones');
} finally { await db.close(); }

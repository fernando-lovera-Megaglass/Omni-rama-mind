// Offline PostgreSQL regression: no credentials or network required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
try {
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$ select current_setting('test.uid')::uuid $$;
    create function public.is_team_member() returns boolean language sql as
      $$ select current_setting('test.member')::boolean $$;
    create table public.crm_views (id text primary key, owner_id uuid not null default auth.uid());
    alter table public.crm_views enable row level security;
    grant usage on schema auth to authenticated;
    grant insert on public.crm_views to authenticated;
    create policy crm_views_insert on public.crm_views for insert to authenticated;
  `);
  const migration = readFileSync(new URL('../supabase/crm_views_insert_owner.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Reapplying must be safe.
  const { rows } = await db.query(`select with_check from pg_policies where policyname = 'crm_views_insert'`);
  assert.equal(rows[0].with_check, '(owner_id = auth.uid())');
  await db.exec(`set role authenticated; set "test.uid" = '${owner}'; set "test.member" = 'true';`);
  await db.query('insert into crm_views values ($1, $2)', ['own', owner]);
  await db.query('insert into crm_views (id) values ($1)', ['default-owner']);
  await assert.rejects(db.query('insert into crm_views values ($1, $2)', ['forged', other]), { code: '42501' });
  await db.exec(`set "test.member" = 'false';`);
  await assert.rejects(db.query('insert into crm_views values ($1, $2)', ['non-member', owner]), { code: '42501' });
  await db.exec('reset role');
  const result = await db.query('select id from crm_views order by id');
  assert.deepEqual(result.rows.map(r => r.id), ['default-owner', 'own']);
  console.log('OK: policy, idempotency, own/default owner allowed; forged owner and non-member rejected with 42501');
} finally {
  await db.close();
}

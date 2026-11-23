// Disposable local PostgreSQL (PGlite); no network or Supabase credentials.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
const directory = mkdtempSync(join(tmpdir(), 'omni-domain-index-'));
let db;
try {
  db = new PGlite(directory);
  await db.exec(`CREATE TABLE public.companies (id integer PRIMARY KEY, domain text, deleted_at timestamptz);
    INSERT INTO companies SELECT i, 'company-' || i || '.example', NULL FROM generate_series(1, 10000) i;
    INSERT INTO companies VALUES (10001, 'TARGET.EXAMPLE', NULL), (10002, 'target.example', now()),
      (10003, 'target.example', NULL), (10004, NULL, NULL);`);
  await db.close(); db = null;
  for (let i = 0; i < 2; i++) {
    console.log(execFileSync(process.execPath, ['scripts/apply-migration.mjs',
      'supabase/company-domain-index.sql', '--local', directory], { encoding: 'utf8' }).trim());
  }
  db = new PGlite(directory);
  const indexes = await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='public'
    AND tablename='companies' AND indexname='companies_domain_idx'`);
  assert.equal(indexes.rows.length, 1);
  assert.match(indexes.rows[0].indexdef, /lower\(domain\).*WHERE \(deleted_at IS NULL\)/);
  assert.doesNotMatch(indexes.rows[0].indexdef, /UNIQUE/);
  console.log(JSON.stringify(indexes.rows));
  await db.exec('ANALYZE public.companies');
  const query = "SELECT id FROM public.companies WHERE lower(domain) = lower($1) AND deleted_at IS NULL";
  const plan = await db.query('EXPLAIN ' + query, ['Target.Example']);
  const output = plan.rows.map(row => row['QUERY PLAN']).join('\n');
  assert.match(output, /(?:Index Scan|Bitmap Index Scan).*companies_domain_idx/);
  console.log(output);
  const result = await db.query(query, ['Target.Example']);
  assert.deepEqual(result.rows.map(r => r.id).sort((a,b) => a-b), [10001,10003]);
  console.log('PASS: idempotence, pg_indexes, natural EXPLAIN, case folding, duplicates and trash exclusion');
} finally {
  if (db) await db.close();
  rmSync(directory, { recursive: true, force: true });
}

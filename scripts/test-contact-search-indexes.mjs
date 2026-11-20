// Isolated PostgreSQL in WASM; no credentials or Supabase connection.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;`);
  for (const file of ['schema.sql', 'soft_delete.sql']) {
    await db.exec(await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8'));
  }
  const migration = await readFile(new URL('../supabase/contact-search-indexes.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(`
    INSERT INTO contacts(id, email)
      SELECT n, 'Person' || n || '@example.invalid' FROM generate_series(1, 20000) n;
    INSERT INTO contacts(id, email, deleted_at) VALUES
      (20001, 'PERSON42@example.invalid', now()), (20002, NULL, NULL);
    INSERT INTO deals(id, contact_id, company_id)
      SELECT n, n, n FROM generate_series(1, 20000) n;
    ANALYZE contacts; ANALYZE deals;
  `);
  const lookup = 'SELECT id FROM public.contacts WHERE lower(email) = lower($1) AND deleted_at IS NULL';
  assert.deepEqual((await db.query(lookup, ['PERSON42@EXAMPLE.INVALID'])).rows, [{ id: 42 }]);
  for (const [sql, args, index] of [
    [lookup, ['PERSON42@EXAMPLE.INVALID'], 'contacts_email_idx'],
    ['SELECT id FROM deals WHERE contact_id = $1', [42], 'deals_contact_id_idx'],
    ['SELECT id FROM deals WHERE company_id = $1', [42], 'deals_company_id_idx'],
  ]) {
    const plan = (await db.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, args)).rows;
    assert.ok(JSON.stringify(plan).includes(`"Index Name":"${index}"`), JSON.stringify(plan));
    console.log(`PASS: EXPLAIN uses ${index} (default planner settings)`);
  }
  console.log('PASS: migration applied twice; mixed-case lookup excludes deleted contacts');
} finally {
  await db.close();
}

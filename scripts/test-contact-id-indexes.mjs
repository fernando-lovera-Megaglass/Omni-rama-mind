// Disposable local PostgreSQL; no remote writes or credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`CREATE TABLE public.tickets (id integer PRIMARY KEY, contact_id bigint, deleted_at timestamptz);
    CREATE TABLE public.tasks (id integer PRIMARY KEY, contact_id bigint);
    INSERT INTO tickets SELECT i, i, NULL FROM generate_series(1, 10000) i;
    INSERT INTO tickets VALUES (10001, 42, now()), (10002, 42, NULL), (10003, NULL, NULL);
    INSERT INTO tasks SELECT i, i FROM generate_series(1, 10000) i;
    INSERT INTO tasks VALUES (10001, 42), (10002, NULL);`);
  const sql = readFileSync(new URL('../supabase/contact-id-indexes.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  const indexes = await db.query(`SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND indexname IN ('tickets_contact_id_idx','tasks_contact_id_idx') ORDER BY tablename`);
  assert.equal(indexes.rows.length, 2);
  assert.match(indexes.rows[0].indexdef, /\(contact_id\)$/);
  assert.match(indexes.rows[1].indexdef, /\(contact_id\) WHERE \(deleted_at IS NULL\)/);
  console.log(JSON.stringify(indexes.rows, null, 2));
  await db.exec('ANALYZE public.tickets; ANALYZE public.tasks;');
  for (const table of ['tickets', 'tasks']) {
    const query = `SELECT * FROM public.${table} WHERE contact_id=$1${table === 'tickets' ? ' AND deleted_at IS NULL' : ''}`;
    const plan = await db.query('EXPLAIN ' + query, [42]);
    const output = plan.rows.map(row => row['QUERY PLAN']).join('\n');
    console.log(query, '\n' + output);
    assert.match(output, new RegExp(`Index Scan using ${table}_contact_id_idx`));
    const result = await db.query(query, [42]);
    assert.deepEqual(result.rows.map(row => row.id).sort((a,b) => a-b), table === 'tickets' ? [42, 10002] : [42, 10001]);
  }
  assert.equal((await db.query('SELECT id FROM tickets WHERE contact_id=$1', [42])).rows.length, 3);
  console.log('PASS: idempotence, both index definitions, natural parameterized Index Scan, duplicate associations, trash exclusion and tasks without deleted_at.');
} finally {
  await db.close();
}

import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { cleanupImportSmoke } from './import-smoke-cleanup.mjs';
const db = new PGlite();
await db.exec(`
  create table contacts (id int, name text, email text, extra jsonb);
  create table companies (id int, name text, domain text, extra jsonb, deleted_at text);
  create table deals (id int, name text, extra jsonb);
  create table tickets (id int, name text, extra jsonb);
  create table tasks (id int, name text, extra jsonb);
  create table activities (id int, record_type text, record_id int);
  create table contact_companies (contact_id int, company_id int);
  create table deal_line_items (deal_id int);
  create table custom_properties (name text);
  insert into companies values (47, 'SMOKE historical', 'historical.test', '{}', 'trash');
  insert into activities values (1, 'companies', 47);
`);
const E = { importHistory: () => [{ id: 123, name: 'run abc' }], importDetail: () => ({ createdIds: { companies: [65, 66] } }) };
let drained = false;
const data = { dbIdle: async () => {
  if (drained) return;
  // A delayed queued activity must land before the deletion transaction begins.
  await new Promise(resolve => setTimeout(resolve, 10));
  await db.exec(`insert into companies values (65, 'domain', 'smoke-abc-auto.test', '{}', null);
    insert into activities values (2, 'companies', 65), (3, 'companies', 66);`);
  drained = true;
} };
const sql = async query => {
  assert.ok(drained, 'drain before SQL');
  const results = await db.exec(query);
  return results.at(-1).rows;
};
await cleanupImportSmoke({ sql, data, E, stamp: 'abc', log: console.log });
assert.deepEqual((await db.query('select id from companies')).rows, [{ id: 47 }]);
assert.deepEqual((await db.query('select id from activities')).rows, [{ id: 1 }]);
// Inject a late write after COMMIT: the independent activity verification must fail.
await assert.rejects(cleanupImportSmoke({ sql: async query => {
  const result = await sql(query);
  if (query.startsWith('begin;')) await db.exec("insert into activities values (4, 'companies', 65)");
  return result;
}, data, E, stamp: 'abc', log: console.log }), /Residuos del import:.*"activities":1/);
await db.close();
console.log('[import-cleanup] PASS: delayed activity drained, undo IDs cleaned, trash preserved, post-commit activity rejected');

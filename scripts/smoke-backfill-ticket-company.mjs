import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { backfill, batchSql, auditSql } from './backfill-ticket-company.mjs';
const db = new PGlite();
const execute = async sql => (await db.exec(sql)).flatMap(r => r.rows || []);
try {
  await db.exec(`CREATE TABLE tickets(id bigint PRIMARY KEY, contact_id bigint, deleted_at timestamptz, extra jsonb);
 CREATE TABLE companies(id bigint PRIMARY KEY, name text, deleted_at timestamptz);
 CREATE TABLE contact_companies(contact_id bigint, company_id bigint, is_primary boolean);
 INSERT INTO companies VALUES (10,'Empresa viva',null),(20,'Eliminada',now()),(30,'Otra',null);
 INSERT INTO contact_companies VALUES (1,10,true),(1,30,false),(2,20,true),(3,30,false);
 INSERT INTO tickets VALUES
 (1,1,null,'null'),(2,1,null,'{"keep":42,"assoc_companies":[]}'),
 (3,1,null,'{"assoc_companies":null}'),(4,1,now(),'{}'),
 (5,2,null,'{}'),(6,null,null,'{}'),(7,3,null,'{}'),
 (8,1,null,'{"companyId":30,"assoc_companies":[30]}'),
 (9,1,null,'{"companyId":10}');`);
  const original = await execute('SELECT * FROM tickets ORDER BY id');
  assert.equal((await execute(auditSql))[0].remaining, 4);
  const reports = [];
  const result = await backfill(execute, { batchSize: 2, onReport: r => reports.push(r) });
  assert.equal(result.updated, 4);
  assert.equal(reports.filter(r => r.phase === 'batch').length, 2);
  assert.equal(result.after[0].remaining, 0);
  const after = await execute('SELECT * FROM tickets ORDER BY id');
  for (const id of [1,2,3,9]) {
    const extra = after.find(t => t.id === id).extra;
    assert.equal(extra.companyId,10);
    assert.equal(extra.company,'Empresa viva');
    assert.deepEqual(extra.assoc_companies,[10]);
    assert.deepEqual(extra.assoc_labels_companies,{'10':'Principal'});
  }
  assert.equal(after[1].extra.keep,42);
  for (const id of [4,5,6,7,8]) assert.deepEqual(after[id-1],original[id-1]);
  assert.equal((await backfill(execute)).updated,0);
  assert.deepEqual(await execute('SELECT * FROM tickets ORDER BY id'),after);
  // A conflicting explicit company aborts the whole batch, including valid rows.
  await db.exec(`INSERT INTO tickets VALUES (11,1,null,'{}'),(12,1,null,'{"companyId":30}');`);
  await assert.rejects(execute(batchSql()), /companyId existente/);
  await db.exec('ROLLBACK');
  assert.deepEqual((await execute('SELECT extra FROM tickets WHERE id=11'))[0].extra,{});
  await db.exec(`DELETE FROM tickets WHERE id=12; INSERT INTO contact_companies VALUES (1,30,true);`);
  await assert.rejects(execute(batchSql()), /ambigua/);
  await db.exec('ROLLBACK');
  assert.deepEqual((await execute('SELECT extra FROM tickets WHERE id=11'))[0].extra,{});
  assert.throws(() => batchSql(0));
  assert.throws(() => batchSql('1;DELETE'));
  console.log('PASS: lotes transaccionales, 4 → 0, formato persistido, conservación, exclusiones, idempotencia y rollback por conflicto/ambigüedad. PostgreSQL local PGlite; sin acceso remoto.');
} finally { await db.close(); }

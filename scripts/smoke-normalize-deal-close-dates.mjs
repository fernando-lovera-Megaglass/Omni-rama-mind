import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { auditSql, normalizationSql } from './normalize-deal-close-dates.mjs';
const db = new PGlite();
const execute = async sql => (await db.exec(sql)).flatMap(r => r.rows || []);
try {
 await db.exec(`CREATE TABLE pipelines(id int, objeto text, nombre text);
 CREATE TABLE pipeline_stages(pipeline_id int, clave text, probabilidad numeric);
 CREATE TABLE deals(id int PRIMARY KEY, stage text, pipeline text, close_date timestamptz,
 created timestamptz, updated_at timestamptz, deleted_at timestamptz);
 INSERT INTO pipelines VALUES (1,'deal','A'),(2,'deal','B');
 INSERT INTO pipeline_stages VALUES (1,'lost',0),(1,'open',50),(2,'lost',50);
 INSERT INTO deals SELECT i,'lost','A',now()+interval '90 days',now()-interval '30 days',
 CASE WHEN i=1 THEN now()-interval '5 days' ELSE NULL END,NULL FROM generate_series(1,14) i;
 INSERT INTO deals VALUES (20,'open','A',now()+interval '90 days',now(),NULL,NULL),
 (21,'lost','A',now()+interval '90 days',now(),NULL,now()),
 (22,'lost','A',now()-interval '10 days',now(),NULL,NULL);`);
 const original = await execute('SELECT * FROM deals ORDER BY id');
 assert.equal((await execute(auditSql))[0].remaining,14);
 const report = (await execute(normalizationSql)).find(r => r.evidence).evidence;
 assert.equal(report.updated,14);
 assert.equal(report.remaining,0);
 assert.equal(report.rows.length,14);
 const after = await execute('SELECT * FROM deals ORDER BY id');
 for (const row of after) {
  const before = original.find(r => r.id===row.id);
  assert.deepEqual(row, row.id<=14 ? {...before, close_date: before.updated_at || before.created} : before);
 }
 assert.equal((await execute(normalizationSql)).find(r => r.evidence).evidence.updated,0);
 await db.exec(`INSERT INTO deals VALUES (30,'lost','A',now()+interval '90 days',now(),NULL,NULL),
 (31,'lost','B',now()+interval '90 days',now(),NULL,NULL);`);
 await assert.rejects(execute(normalizationSql), /ambigua/);
 await db.exec('ROLLBACK');
 assert.equal((await execute(auditSql))[0].remaining,2);
 console.log('PASS: PostgreSQL local 14 → 0; reporte antes/después, updated/created, exclusiones, idempotencia y rollback por pipeline ambiguo. Sin acceso remoto.');
} finally { await db.close(); }

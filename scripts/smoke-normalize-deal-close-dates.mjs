import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { auditSql, scopedAuditSql, normalizationSql } from './normalize-deal-close-dates.mjs';
const db = new PGlite();
const rows = async sql => (await db.exec(sql)).flatMap(r => r.rows || []);
try {
 await db.exec(`CREATE TABLE pipelines(id int, objeto text, nombre text);
 CREATE TABLE pipeline_stages(pipeline_id int, clave text, probabilidad numeric);
 CREATE TABLE deals(id int PRIMARY KEY, stage text, pipeline text, close_date timestamptz,
 created timestamptz, updated_at timestamptz, deleted_at timestamptz, extra jsonb DEFAULT '{}');
 CREATE TABLE activities(id int, record_type text, record_id int, type text, text text, occurred_at timestamptz, extra jsonb);
 INSERT INTO pipelines VALUES (1,'deal','A'),(2,'deal','B'),(3,'ticket','Tickets');
 INSERT INTO pipeline_stages VALUES (1,'lost',0),(1,'open',50),(2,'lost',50),(3,'open',0);
 INSERT INTO deals(id,stage,pipeline,close_date,created,updated_at)
 SELECT i,'lost','A',now()+interval '90 days',now()-interval '30 days',now()-interval '5 days' FROM generate_series(1,14) i;
 INSERT INTO deals(id,stage,pipeline,close_date) SELECT i,'open','A',now()+interval '90 days' FROM generate_series(15,20) i;
 INSERT INTO activities VALUES (1,'deals',1,'system','Etapa cambiada a «Perdido».',now()-interval '10 days','{"stage":"lost"}');`);
 assert.equal((await rows(auditSql))[0].remaining,20);
 assert.equal((await rows(scopedAuditSql))[0].remaining,14);
 const report = (await rows(normalizationSql)).find(r=>r.evidence).evidence;
 assert.equal(report.updated,14);
 assert.equal(report.remaining,0);
 assert.equal(report.unscoped_remaining,6);
 assert.equal(report.rows[0].source,'stage_history');
 assert.equal(report.rows[1].source,'updated_at');
 assert.equal((await rows(normalizationSql)).find(r=>r.evidence).evidence.updated,0);
 await db.exec(`INSERT INTO deals(id,stage,pipeline,close_date,created) VALUES (30,'lost','A',now()+interval '90 days',now());`);
 await assert.rejects(rows(normalizationSql), /Falta fecha historica fiable/);
 await db.exec('ROLLBACK');
 assert.equal((await rows(scopedAuditSql))[0].remaining,1);
 await db.exec(readFileSync(new URL('../supabase/deal-close-date-guard.sql',import.meta.url),'utf8'));
 await db.exec(`INSERT INTO deals(id,stage,pipeline,close_date) VALUES
 (31,'lost','A',now()+interval '90 days'),(32,'lost','B',now()+interval '90 days'),
 (33,'open','A',now()+interval '90 days'),(34,'lost','A',now()-interval '10 days'),
 (35,'lost','A',NULL);
 UPDATE deals SET stage='lost' WHERE id=33;
 UPDATE deals SET close_date=now()+interval '90 days' WHERE id=34;
 UPDATE deals SET pipeline='A' WHERE id=32;
 UPDATE deals SET close_date=now()+interval '90 days' WHERE id=31;`);
 assert.equal((await rows("SELECT count(*)::int n FROM deals WHERE id BETWEEN 31 AND 35 AND close_date <= now()"))[0].n,5);
 assert.equal((await rows("SELECT count(*)::int n FROM deals WHERE id=34 AND close_date < now()-interval '9 days'"))[0].n,1);
 await db.exec("UPDATE deals SET stage='open',close_date=now()+interval '90 days' WHERE id=33");
 assert.equal((await rows("SELECT extra->>'stageEnteredKey' stage FROM deals WHERE id=33"))[0].stage,'open');
 console.log('PASS: scoped 14→0, six false positives preserved; history priority, fallback, idempotence, missing history rollback; SQL guard insert/update/date/pipeline/reopen. Local only.');
} finally { await db.close(); }

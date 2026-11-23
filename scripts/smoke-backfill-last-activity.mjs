import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildSql, tables, engagementTypes } from './backfill-last-activity.mjs';
const db = new PGlite();
try {
 await db.exec(`CREATE TABLE activities (id bigint PRIMARY KEY, record_type text, record_id bigint, type text, occurred_at timestamptz, extra jsonb DEFAULT '{}');`);
 for (const t of tables) {
  await db.exec(`CREATE TABLE ${t} (id bigint PRIMARY KEY, last_activity timestamptz, last_activity_type text, deleted_at timestamptz, extra jsonb DEFAULT '{}');
  INSERT INTO ${t} (id,last_activity,deleted_at,extra) VALUES
  (1,'2026-01-01',null,'{"keep":42}'),(2,'2027-01-01',null,'{}'),(3,'2026-01-01',now(),'{}'),(4,null,null,'{}'),(5,'2026-01-01',null,'{}');`);
  for (const id of [1,2,3,4]) {
   const base = tables.indexOf(t)*1000 + id*10;
   await db.exec(`INSERT INTO activities VALUES
    (${base},'${t}',${id},'call','2026-02-01','{}'),
    (${base+1},'${t}',${id},'email','2026-03-01','{"marketingEmailId":"campaign"}'),
    (${base+2},'${t}',${id},'system','2028-01-01','{}'),
    (${base+3},'${t}',${id},'prop','2028-01-01','{}'),
    (${base+4},'${t}',${id},'stage','2028-01-01','{}'),
    (${base+5},'${t}',${id},'note','2026-03-01','{}');`);
  }
 }
 const execute = async apply => (await db.exec(buildSql(apply))).find(r => r.rows?.[0]?.evidence)?.rows[0].evidence;
 const before = await execute(false);
 assert(before.counts.every(c => c.behind === 2 && c.ahead === 1));
 const after = await execute(true);
 assert(after.counts.every(c => c.behind === 0 && c.ahead === 0));
 for (const t of tables) {
  const { rows } = await db.query(`SELECT * FROM ${t} ORDER BY id`);
  assert.equal(rows[0].extra.keep,42);
  assert.equal(t === 'contacts' || t === 'companies' ? rows[0].last_activity_type : rows[0].extra.lastActivityType,'note');
  assert.equal(new Date(rows[2].last_activity).toISOString(),'2026-01-01T00:00:00.000Z');
  assert.equal(new Date(rows[4].last_activity).toISOString(),'2026-01-01T00:00:00.000Z');
 }
 const contact = (await db.query('SELECT extra FROM contacts WHERE id=1')).rows[0];
 assert.equal(new Date(contact.extra.notes_last_contacted).toISOString(),'2026-02-01T00:00:00.000Z');
 const again = await execute(true);
 assert.deepEqual(again.before, again.after);
 // Every current engagement type, empty/false/0 marketing markers, null timestamps.
 for (const [i,type] of engagementTypes.entries()) {
  await db.exec(`INSERT INTO contacts(id) VALUES (${100+i}); INSERT INTO activities VALUES (${10000+i},'contacts',${100+i},'${type}','2026-04-01','{}');`);
 }
 for (const [i,marker] of ['false','0','""','null','[]','{}'].entries()) {
  await db.exec(`INSERT INTO contacts(id) VALUES (${200+i}); INSERT INTO activities VALUES (${20000+i},'contacts',${200+i},'email','2026-04-01','{"marketingEmailId":${marker}}');`);
 }
 const variants = await execute(true);
 assert(variants.counts.every(c => c.behind === 0 && c.ahead === 0));
 for (let i=0;i<6;i++) {
  const {rows} = await db.query(`SELECT extra->>'notes_last_contacted' AS value FROM contacts WHERE id=${200+i}`);
  assert.equal(Boolean(rows[0].value),i<4);
 }
 await db.exec("INSERT INTO activities VALUES (99999,'contacts',1,'email',null,'{}')");
 assert.deepEqual((await execute(true)).before,(await execute(false)).after);
 const { writeFileSync } = await import('node:fs');
 writeFileSync('docs/evidencia/gap-backend-re-ultima-actividad-backfill/local-before-after.json', JSON.stringify({environment:'PGlite local synthetic fixtures',before,after,idempotent:again},null,2));
 console.log('OK: four tables; stale/null/ahead; ties; marketing JS truthiness; extra preserved; deleted/no-engagement untouched; all engagement types; idempotency.');
} finally { await db.close(); }

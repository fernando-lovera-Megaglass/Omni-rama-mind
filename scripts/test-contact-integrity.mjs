// PGLITE_MODULE may point at a temporary installation; never connects to Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const { buildDemoSeedPayload } = await import('../src/data.js');
const db = new PGlite();
const sql = path => readFileSync(new URL(path, import.meta.url), 'utf8');
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await db.exec(sql('../supabase/schema.sql'));
await db.exec(sql('../supabase/soft_delete.sql'));
await db.exec(sql('../supabase/company_hierarchy.sql'));
await db.exec(sql('../supabase/contact_companies.sql'));
await db.exec(`CREATE TABLE activities (id bigint, record_type text, record_id bigint);
CREATE TABLE sequence_enrollments (id bigint, contact_id bigint REFERENCES contacts(id), sequence_id bigint, UNIQUE(contact_id, sequence_id));
CREATE TABLE extra_links (id bigint, person bigint REFERENCES contacts(id));
CREATE TABLE partitioned_links (id bigint, person bigint REFERENCES contacts(id)) PARTITION BY RANGE(id);
CREATE TABLE partitioned_links_first PARTITION OF partitioned_links FOR VALUES FROM (0) TO (100);
CREATE TABLE declared_record_links (record_type text, record_id bigint REFERENCES contacts(id));
CREATE TABLE calls (contact_id text);
CREATE TABLE workflow_enrollments (object_type text, record_id bigint);
INSERT INTO contacts(id,email) VALUES (1,' Ana@Example.com '),(301,'ana@example.com'),(302,'ANA@example.com'),(9,''),(10,''),(11,null);
INSERT INTO companies(id,name) VALUES (1,'Test');
INSERT INTO deals(contact_id) VALUES (301); INSERT INTO tickets(contact_id) VALUES (302);
INSERT INTO tasks(contact_id) VALUES (301); INSERT INTO extra_links VALUES (1,302);
INSERT INTO partitioned_links VALUES (1,302);
INSERT INTO declared_record_links VALUES ('custom',301);
INSERT INTO calls VALUES ('301');
INSERT INTO activities VALUES (1,'contacts',301),(2,'deals',301);
INSERT INTO workflow_enrollments VALUES ('contacts',302),('companies',302);
INSERT INTO contact_companies(contact_id,company_id,is_primary) VALUES (1,1,false),(301,1,true),(302,1,false);`);
// Bootstrap protection installs even while live duplicate emails still exist.
await db.exec(sql('../supabase/bootstrap-demo.sql'));
const repair = sql('./sql/dedupe-contacts.sql');
await db.exec(`BEGIN; ${repair} ROLLBACK;`);
assert.equal((await db.query('SELECT count(*)::int n FROM contacts WHERE deleted_at IS NOT NULL')).rows[0].n, 0);
await db.exec(`BEGIN; ${repair} COMMIT;`);
assert.equal((await db.query('SELECT count(*)::int n FROM contacts WHERE deleted_at IS NOT NULL')).rows[0].n, 2);
for (const t of ['deals','tickets','tasks','calls','contact_companies']) {
  assert.equal(String((await db.query(`SELECT contact_id FROM ${t}`)).rows[0].contact_id), '1');
}
assert.equal(Number((await db.query('SELECT person FROM extra_links')).rows[0].person), 1);
assert.equal(Number((await db.query('SELECT person FROM partitioned_links')).rows[0].person), 1);
assert.equal(Number((await db.query('SELECT record_id FROM declared_record_links')).rows[0].record_id), 1);
assert.deepEqual((await db.query('SELECT record_id::int FROM activities ORDER BY id')).rows.map(r=>r.record_id), [1,301]);
assert.deepEqual((await db.query('SELECT record_id::int FROM workflow_enrollments ORDER BY object_type')).rows.map(r=>r.record_id), [302,1]);
assert.equal((await db.query('SELECT count(*)::int n FROM contact_companies')).rows[0].n, 1);
assert.equal((await db.query('SELECT is_primary FROM contact_companies')).rows[0].is_primary, true);
await db.exec(`BEGIN; ${repair} COMMIT;`);
// Richest persisted row wins; fill blanks and preserve the entire discarded row.
await db.exec(`INSERT INTO contacts(id,email,first,phone,city,extra) VALUES
 (50,'rich@example.com','Ana','555','','{"custom":"retained"}'),
 (350,'rich@example.com','','','Madrid','{"a":"1","b":"2","c":"3"}');
 INSERT INTO deals(contact_id) VALUES (350);
 INSERT INTO tickets(contact_id) VALUES (350);`);
await db.exec(`BEGIN; ${repair} COMMIT;`);
const rich = (await db.query('SELECT * FROM contacts WHERE id=350')).rows[0];
assert.equal(rich.deleted_at, null);
assert.equal(rich.phone, '555');
assert.equal(rich.first, 'Ana');
assert.equal(rich.city, 'Madrid');
assert.equal(rich.extra.a, '1');
assert.equal(rich.extra.custom, 'retained');
assert.ok((await db.query('SELECT deleted_at FROM contacts WHERE id=50')).rows[0].deleted_at);
assert.equal((await db.query('SELECT count(*)::int n FROM deals WHERE contact_id=50')).rows[0].n, 0);
assert.equal((await db.query('SELECT count(*)::int n FROM tickets WHERE contact_id=350')).rows[0].n, 1);
// An existing orphan must fail acceptance and roll back the entire repair.
await db.exec('INSERT INTO deals(contact_id) VALUES (99999)');
await assert.rejects(db.exec(`BEGIN; ${repair} COMMIT;`), /Orphans/);
await db.exec('ROLLBACK; DELETE FROM deals WHERE contact_id=99999');
// Existing references to previously trashed contacts must also fail acceptance.
await db.exec('INSERT INTO tasks(contact_id) VALUES (50)');
await assert.rejects(db.exec(`BEGIN; ${repair} COMMIT;`), /References to trashed contacts/);
await db.exec('ROLLBACK; DELETE FROM tasks WHERE contact_id=50');
// Regression for 77 pairs with all six required relationship types.
await db.exec(`
 INSERT INTO contacts(id,email)
 SELECT n, 'pair' || n || '@example.com' FROM generate_series(1000,1076) n
 UNION ALL SELECT n+300, 'pair' || n || '@example.com' FROM generate_series(1000,1076) n;
 INSERT INTO deals(contact_id) SELECT n FROM generate_series(1300,1376) n;
 INSERT INTO tickets(contact_id) SELECT n FROM generate_series(1300,1376) n;
 INSERT INTO tasks(contact_id) SELECT n FROM generate_series(1300,1376) n;
 INSERT INTO sequence_enrollments(id,contact_id,sequence_id) SELECT n,n,1 FROM generate_series(1300,1376) n;
 INSERT INTO activities(id,record_type,record_id) SELECT n,'contacts',n FROM generate_series(1300,1376) n;
 INSERT INTO contact_companies(contact_id,company_id) SELECT n,1 FROM generate_series(1300,1376) n;
`);
const copiesBefore = (await db.query("SELECT to_jsonb(c) - 'deleted_at' AS payload FROM contacts c WHERE id BETWEEN 1300 AND 1376 ORDER BY id")).rows;
await db.exec(`BEGIN; ${repair} COMMIT;`);
assert.deepEqual((await db.query("SELECT to_jsonb(c) - 'deleted_at' AS payload FROM contacts c WHERE id BETWEEN 1300 AND 1376 ORDER BY id")).rows, copiesBefore);
assert.equal((await db.query('SELECT count(*)::int n FROM contacts WHERE id BETWEEN 1300 AND 1376 AND deleted_at IS NOT NULL')).rows[0].n,77);
assert.equal((await db.query(`SELECT count(*)::int n FROM (
 SELECT lower(btrim(email)) FROM contacts WHERE deleted_at IS NULL AND btrim(email)<>''
 GROUP BY 1 HAVING count(*)>1) d`)).rows[0].n,0);
for (const [table,column,predicate] of [
 ['deals','contact_id','true'], ['tickets','contact_id','true'],
 ['tasks','contact_id','true'], ['sequence_enrollments','contact_id','true'],
 ['activities','record_id',"record_type='contacts'"], ['contact_companies','contact_id','true'],
]) {
 assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE ${predicate} AND ${column} BETWEEN 1300 AND 1376`)).rows[0].n,0);
 assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE ${predicate} AND ${column} BETWEEN 1000 AND 1076`)).rows[0].n,77);
}
// Soft delete preserves the copies byte-for-byte except deleted_at.
assert.equal((await db.query('SELECT count(*)::int n FROM contacts WHERE id BETWEEN 1000 AND 1376')).rows[0].n,154);
await db.exec(sql('../supabase/contact-integrity.sql'));
// Restoration retains the original payload. Resolve the email conflict first;
// restoring with the same live email must never bypass the uniqueness guard.
await assert.rejects(db.exec('UPDATE contacts SET deleted_at=NULL WHERE id=1300'));
await db.exec('BEGIN; UPDATE contacts SET email=NULL, deleted_at=NULL WHERE id=1300;');
assert.equal((await db.query('SELECT deleted_at FROM contacts WHERE id=1300')).rows[0].deleted_at,null);
await db.exec('ROLLBACK');
await db.exec(sql('../supabase/bootstrap-demo.sql'));
await assert.rejects(db.exec("INSERT INTO contacts(email) VALUES ('ana@EXAMPLE.com')"));
await db.exec("INSERT INTO contacts(email,deleted_at) VALUES ('ana@example.com',now())");
const payload = buildDemoSeedPayload();
const emails = payload.contacts.map(c=>c.email).filter(Boolean);
assert.equal(new Set(emails).size, emails.length);
assert.equal((await db.query('SELECT bootstrap_demo_v1($1) seeded',[JSON.stringify(payload)])).rows[0].seeded, false);
await db.exec('TRUNCATE contacts,companies,deals,tickets,tasks,extra_links RESTART IDENTITY CASCADE');
const invalid = structuredClone(payload); invalid.tickets[0].id=invalid.tickets[1].id;
await assert.rejects(db.query('SELECT bootstrap_demo_v1($1)',[JSON.stringify(invalid)]));
assert.equal((await db.query('SELECT count(*)::int n FROM contacts')).rows[0].n, 0);
// PGlite serializes calls; real multi-session locking is tested separately with PostgreSQL.
const results = await Promise.all([1,2].map(()=>db.query('SELECT bootstrap_demo_v1($1) seeded',[JSON.stringify(payload)])));
assert.deepEqual(results.map(r=>r.rows[0].seeded),[true,false]);
for (const [table, rows] of Object.entries(payload)) {
  assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,rows.length);
}
assert.equal(Number((await db.query("INSERT INTO contacts(email) VALUES ('new@example.com') RETURNING id")).rows[0].id),421);
await db.close();
console.log('PASS: rollback, dedupe, references, bridge collision, unique email, atomic bootstrap, repeat calls, identity sequence');

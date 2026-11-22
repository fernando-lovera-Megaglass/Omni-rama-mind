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
CREATE TABLE extra_links (id bigint, person bigint REFERENCES contacts(id));
CREATE TABLE calls (contact_id text);
CREATE TABLE workflow_enrollments (object_type text, record_id bigint);
INSERT INTO contacts(id,email) VALUES (1,' Ana@Example.com '),(301,'ana@example.com'),(302,'ANA@example.com'),(9,''),(10,''),(11,null);
INSERT INTO companies(id,name) VALUES (1,'Test');
INSERT INTO deals(contact_id) VALUES (301); INSERT INTO tickets(contact_id) VALUES (302);
INSERT INTO tasks(contact_id) VALUES (301); INSERT INTO extra_links VALUES (1,302);
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
assert.deepEqual((await db.query('SELECT record_id::int FROM activities ORDER BY id')).rows.map(r=>r.record_id), [1,301]);
assert.deepEqual((await db.query('SELECT record_id::int FROM workflow_enrollments ORDER BY object_type')).rows.map(r=>r.record_id), [302,1]);
assert.equal((await db.query('SELECT count(*)::int n FROM contact_companies')).rows[0].n, 1);
assert.equal((await db.query('SELECT is_primary FROM contact_companies')).rows[0].is_primary, true);
await db.exec(`BEGIN; ${repair} COMMIT;`);
await db.exec(sql('../supabase/contact-integrity.sql'));
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

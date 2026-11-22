// Isolated, disposable PostgreSQL cluster; requires embedded-postgres (test-only).
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
const { default: EmbeddedPostgres } = await import(process.env.EPG_MODULE || 'embedded-postgres');
const { buildDemoSeedPayload } = await import('../src/data.js');
const directory = mkdtempSync(join(tmpdir(), 'omni-seed-test-'));
const server = new EmbeddedPostgres({ databaseDir: join(directory,'db'), user:'postgres', password:'local-test', port:25439, persistent:false, onLog:()=>{}, onError:()=>{} });
const clients=[];
try {
  await server.initialise(); await server.start();
  for (let i=0;i<3;i++) { const c=server.getPgClient(); await c.connect(); clients.push(c); }
  const [admin,a,b]=clients;
  await admin.query('CREATE ROLE anon; CREATE ROLE authenticated');
  for (const file of ['schema.sql','soft_delete.sql','company_hierarchy.sql','contact-integrity.sql','bootstrap-demo.sql']) {
    await admin.query(readFileSync(new URL(`../supabase/${file}`,import.meta.url),'utf8'));
  }
  const payload=JSON.stringify(buildDemoSeedPayload());
  await a.query('BEGIN');
  assert.equal((await a.query('SELECT bootstrap_demo_v1($1) seeded',[payload])).rows[0].seeded,true);
  // Second backend must wait on the first transaction's advisory lock.
  const pending=b.query('SELECT bootstrap_demo_v1($1) seeded',[payload]);
  let waiting=false;
  for (let i=0;i<100 && !waiting;i++) {
    waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT bootstrap_demo_v1%') waiting")).rows[0].waiting;
    if (!waiting) await new Promise(r=>setTimeout(r,10));
  }
  assert.ok(waiting, 'second connection must be blocked until commit');
  await a.query('COMMIT');
  assert.equal((await pending).rows[0].seeded,false);
  for (const [table, rows] of Object.entries(JSON.parse(payload))) {
    assert.equal((await admin.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n,
      rows.length, `one seed only in ${table}`);
  }
  assert.equal((await admin.query(`SELECT count(*)::int n FROM (
    SELECT lower(btrim(email)) FROM contacts
    WHERE deleted_at IS NULL AND btrim(email) <> ''
    GROUP BY 1 HAVING count(*) > 1
  ) duplicates`)).rows[0].n, 0);
  console.log('PASS: two PostgreSQL sessions, observed lock contention, exactly 420 contacts');
} finally {
  await Promise.all(clients.map(c=>c.end()));
  await server.stop(); rmSync(directory,{recursive:true,force:true});
}

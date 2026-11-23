import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createImportJobs } from '../src/import-jobs.js';
const db = new PGlite();
const uid = '00000000-0000-0000-0000-000000000001';
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${uid}'); create function auth.uid() returns uuid language sql as $$ select current_setting('test.uid')::uuid $$; create table team_members(user_id uuid, team text, active boolean); insert into team_members values ('${uid}','alpha',true); grant usage on schema auth to authenticated; grant select on team_members to authenticated; set test.uid='${uid}';`);
await db.exec(readFileSync('supabase/import_jobs.sql','utf8'));
await db.exec(readFileSync('supabase/import_jobs.sql','utf8'));
await db.exec('set role authenticated');
let failWrite = false;
const client = { auth: { getUser: async () => ({data:{user:{id:uid}}}) }, from() { return {
  upsert(payload, options) {
    const run = async () => {
      if (failWrite) return {error: new Error('offline')};
      let result;
      for (const row of Array.isArray(payload) ? payload : [payload]) {
        const keys = Object.keys(row); const values = keys.map(k => typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]);
        const conflict = options.ignoreDuplicates ? 'do nothing' : 'do update set '+keys.filter(k=>k!=='id').map(k=>`${k}=excluded.${k}`).join(',');
        result = await db.query(`insert into import_jobs (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(id) ${conflict} returning *`,values);
      }
      return {data: result.rows[0]};
    };
    return {then: (a,b) => run().then(a,b), select: () => ({single:run})};
  },
  select() { return {order() { return {range: async(a,b)=>({data:(await db.query('select * from import_jobs order by id limit $1 offset $2',[b-a+1,a])).rows})}; }}; }
}; }};
const mem = new Map(); const storage = {getItem:k=>mem.get(k),setItem:(k,v)=>mem.set(k,v)};
const row = {id:123,object:'contacts',name:'Real local run',source:'csv',system:'file',state:'STARTED',newRecords:0,updated:0,associations:0,errors:0,when:new Date().toISOString()};
storage.setItem('crm:imports',JSON.stringify([row]));
storage.setItem('crm:imports:detail:123',JSON.stringify({createdIds:{contacts:[11]}}));
const store = createImportJobs(client,storage); await store.init();
assert.equal(store.rows.size,1);
await store.save({...row,state:'PROCESSING'}, {createdIds:{contacts:[11]}});
await store.save({...row,state:'DONE',newRecords:1,updated:2,associations:1,errors:3}, {createdIds:{contacts:[11]},timeline:[{state:'DONE'}]});
assert.equal((await store.flush()).ok,true);
assert.equal((await db.query('select new_count from import_jobs')).rows[0].new_count,1);
// Stale migration cannot replace the final state, counts, or ledger.
await createImportJobs(client,storage).init();
mem.clear();
const fresh = createImportJobs(client,storage); await fresh.init();
assert.equal(fresh.rows.get(123).state,'DONE');
assert.deepEqual(fresh.details.get(123).createdIds,{contacts:[11]});
assert.equal(fresh.rows.get(123).updated,2);
failWrite=true; await fresh.save({...row,state:'FAILED'},{}); assert.equal((await fresh.flush()).ok,false);
failWrite=false;
const retryBrowser = createImportJobs(client,storage); await retryBrowser.init();
assert.equal(retryBrowser.rows.get(123).state,'FAILED');
assert.equal(retryBrowser.hasPending(123),false);
await fresh.save({...row,state:'CANCELED',undone:true},{createdIds:{contacts:[11]},undone:true}); assert.equal((await fresh.flush()).ok,true);
// A real local engine import: compare SQL counters to the actual created records.
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<body></body>', { url: 'http://localhost/data/import/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, localStorage: storage });
const engine = await import('../src/import-engine.js');
const dataLayer = await import('../src/data.js');
const csv = 'Nombre,Correo electrónico\nPersistido,jobs.persist@example.test';
const table = await engine.parseFile({name:'jobs.csv',size:csv.length,text:async()=>csv,arrayBuffer:async()=>new TextEncoder().encode(csv).buffer});
const plan = engine.planImport(table,engine.autoMap(table.headers,'es','contacts'),{object:'contacts'});
const entry = engine.registerImport({name:'SQL acceptance',table,plan,options:{}});
const result = await engine.runImport(entry.id,plan,{sleep:async()=>{}});
assert.equal(result.state,'DONE');
const completed = engine.importHistory().find(r=>r.id===entry.id);
await fresh.save(completed,engine.importDetail(entry.id));
const saved = (await db.query('select * from import_jobs where id=$1',[entry.id])).rows[0];
assert.equal(saved.new_count,dataLayer.allContacts().filter(r=>r.email==='jobs.persist@example.test').length);
assert.equal(saved.updated_count,result.updated);
assert.equal(saved.associations_count,result.associations);
assert.equal(saved.errors_count,plan.errors.length);
mem.clear();
const browser = createImportJobs(client,storage); await browser.init();
assert.equal(browser.rows.get(entry.id).newRecords,saved.new_count);
assert.deepEqual(browser.details.get(entry.id).createdIds.contacts,result.createdIds);
// Active other-team and inactive members cannot see or mutate the job.
await db.exec(`reset role; insert into auth.users values ('00000000-0000-0000-0000-000000000002'); insert into team_members values ('00000000-0000-0000-0000-000000000002','beta',true); set role authenticated; set test.uid='00000000-0000-0000-0000-000000000002';`);
assert.equal((await db.query('select * from import_jobs')).rows.length,0);
assert.equal((await db.query("update import_jobs set nombre='bad' returning *")).rows.length,0);
await db.exec(`reset role; update team_members set active=false where user_id='${uid}'; set role authenticated; set test.uid='${uid}';`);
assert.equal((await db.query('select * from import_jobs')).rows.length,0);
await db.close();
console.log('PASS import_jobs: SQL migration, counts, fresh session, ledger, idempotence, retries, team RLS');

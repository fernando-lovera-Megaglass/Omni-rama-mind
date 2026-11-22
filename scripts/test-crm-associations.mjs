import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import vm from 'node:vm';
import { associationIds, associationPatch, hasAssociation, isMultiAssociation } from '../src/crm-associations.js';
const db = new PGlite();
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
await db.exec(`INSERT INTO contacts(id) VALUES (1),(2),(3); INSERT INTO companies(id) VALUES(1),(2);
INSERT INTO deals(id,contact_id,company_id,extra) VALUES(1,1,1,'{"assoc_contacts":[1,"2",2],"assoc_companies":[1,2],"custom":"keep","assoc_labels_contacts":{"2":"Comprador"}}');
INSERT INTO tickets(id,contact_id,extra) VALUES(1,1,'{"companyId":1,"assoc_contacts":[1,2],"assoc_companies":[1,2]}');
INSERT INTO deals(id,contact_id) VALUES(2,1);
UPDATE contacts SET extra='{"assoc_deals":[2]}' WHERE id=3;`);
const migration = readFileSync(new URL('../supabase/deal-ticket-associations.sql', import.meta.url), 'utf8');
await db.exec(migration);
const snapshot = (await db.query('SELECT extra FROM deals ORDER BY id')).rows;
await db.exec(migration);
assert.deepEqual((await db.query('SELECT extra FROM deals ORDER BY id')).rows, snapshot);
assert.deepEqual(snapshot[1].extra.assoc_contacts, [1,3]);
assert.equal(snapshot[0].extra.custom, 'keep');
assert.equal(snapshot[0].extra.assoc_labels_contacts[2], 'Comprador');
for (const type of ['deals','tickets']) {
  const load = async () => { const row = (await db.query(`SELECT * FROM ${type} WHERE id=1`)).rows[0]; return { ...row.extra, id: row.id, contactId: row.contact_id, companyId: row.company_id || row.extra.companyId }; };
  let rec = await load();
  assert.deepEqual(associationIds(rec, 'contacts'), [1,2]);
  assert.deepEqual(associationIds(rec, 'companies'), [1,2]);
  assert.ok([1,2].every(id => hasAssociation(rec, 'contacts', id)));
  const patch = associationPatch(rec, 'contacts', {id:3});
  assert.equal(patch.contactId, 1);
  await db.query(`UPDATE ${type} SET extra=extra || $1::jsonb,contact_id=$2 WHERE id=1`, [JSON.stringify(patch), patch.contactId]);
  rec = await load();
  assert.deepEqual(associationIds(rec, 'contacts'), [1,2,3]);
  const removed = associationPatch(rec, 'contacts', {id:1}, '', true);
  assert.deepEqual(removed.assoc_contacts, [2,3]);
  assert.equal(removed.contactId, 2);
  const primary = associationPatch(rec, 'contacts', {id:2}, 'Principal');
  assert.deepEqual(primary.assoc_contacts, [1,2,3]);
  assert.equal(primary.contactId, 2);
}
await db.close();
console.log('PASS: local SQL migration, idempotence, reload, reciprocal membership, append and unlink for deals/tickets');

// Exercise the actual record-page handlers in both directions with a persisted in-memory store.
const source = readFileSync(new URL('../src/record.js', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('function saveMultiAssociation('), source.indexOf('// «Empresa asociada:'));
const unlink = source.slice(source.indexOf('function unlinkAssociation('), source.indexOf('// The rows of «Ver historial'));
for (const ownerType of ['deals', 'tickets']) for (const reverse of [false, true]) {
  const store = { [ownerType]: [{id:10, contactId:1, assoc_contacts:[1]}], contacts:[{id:1},{id:2}], companies:[] };
  const type = reverse ? 'contacts' : ownerType;
  const kind = reverse ? ownerType : 'contacts';
  const id = reverse ? 2 : 10;
  const find = (t,id) => store[t].find(r => Number(r.id) === Number(id));
  const context = vm.createContext({ type, id, rec:find(type,id), ad:{kind}, associationIds, associationPatch, hasAssociation, isMultiAssociation,
    cfg:{assoc:()=>[],title:()=>''}, ALL:Object.fromEntries(Object.keys(store).map(k=>[k,()=>store[k]])),
    findRecord:find, byId:(rows,id)=>rows.find(r=>Number(r.id)===Number(id)), allCompanies:()=>[],
    setField:(t,id,key,value)=>{find(t,id)[key]=JSON.parse(JSON.stringify(value));},
    logAssociation:()=>{}, renderAll:()=>{}, toast:()=>{}, window:{confirm:()=>true},
    KIND_META:{[kind]:{s:'Registro',p:'Registros'}} });
  vm.runInContext(handlers + unlink, context);
  vm.runInContext(`saveAssociations([${reverse ? 10 : 2}], {})`, context);
  assert.deepEqual(find(ownerType,10).assoc_contacts,[1,2]);
  assert.equal(find(ownerType,10).contactId,1);
  vm.runInContext(`unlinkAssociation('${kind}', ${reverse ? 10 : 2})`, context);
  assert.deepEqual(find(ownerType,10).assoc_contacts,[1]);
  assert.equal(find(ownerType,10).contactId,1);
}
console.log('PASS: actual record add/remove handlers, both directions, deals and tickets');

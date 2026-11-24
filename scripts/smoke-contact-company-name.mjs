// No network: actual data.js hooks against a local PostgreSQL engine through a small Supabase adapter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,String(v)), removeItem: k => store.delete(k) };
const db = new PGlite();
const sql = path => readFileSync(new URL(path, import.meta.url), 'utf8');
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await db.exec(sql('../supabase/schema.sql'));
await db.exec(sql('../supabase/soft_delete.sql'));
await db.exec(sql('../supabase/company_hierarchy.sql'));
await db.exec(sql('../supabase/contact_companies.sql'));
const errors = [];
globalThis.__companyTestClient = { from(table) {
  let operation = 'select', payload, columns = '*', filters = [], ordering = '', paging = '', single = false;
  const params = [];
  const bind = v => { params.push(v); return `$${params.length}`; };
  const q = {
    select(c = '*') { columns = c; return q; },
    insert(v) { operation = 'insert'; payload = Array.isArray(v) ? v : [v]; return q; },
    update(v) { operation = 'update'; payload = v; return q; },
    delete() { operation = 'delete'; return q; },
    eq(k,v) { filters.push(`"${k}" = ${bind(v)}`); return q; },
    is(k,v) { assert.equal(v,null); filters.push(`"${k}" IS NULL`); return q; },
    order(k, opts) { ordering = ` ORDER BY "${k}" ${opts?.ascending === false ? 'DESC' : 'ASC'}`; return q; },
    range(a,b) { paging = ` LIMIT ${b-a+1} OFFSET ${a}`; return q; },
    limit(n) { paging = ` LIMIT ${n}`; return q; },
    single() { single = true; return q; },
    async then(ok, bad) {
      try {
        const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
        let statement;
        if (operation === 'insert') {
          const keys = Object.keys(payload[0]);
          statement = `INSERT INTO "${table}" (${keys.map(k=>`"${k}"`).join(',')}) VALUES ` + payload.map(row => `(${keys.map(k=>bind(typeof row[k] === 'object' && row[k] !== null ? JSON.stringify(row[k]) : row[k])).join(',')})`).join(',') + ' RETURNING *';
        } else if (operation === 'update') statement = `UPDATE "${table}" SET ` + Object.entries(payload).map(([k,v])=>`"${k}"=${bind(typeof v === 'object' && v !== null ? JSON.stringify(v) : v)}`).join(',') + where + ' RETURNING *';
        else if (operation === 'delete') statement = `DELETE FROM "${table}"${where}`;
        else statement = `SELECT ${columns} FROM "${table}"${where}${ordering}${paging}`;
        const result = await db.query(statement, params);
        return ok({ data: single ? result.rows[0] : result.rows, error: null });
      } catch (error) { errors.push(error); return ok({ data: null, error }); }
    },
  };
  return q;
} };
let source = sql('../src/data.js').replace("import { supabase, DB_MODE, createAnonProbe } from './supabaseClient.js';", 'const supabase = globalThis.__companyTestClient, DB_MODE = false, createAnonProbe = () => null;');
source = source.replace(/(['"])(\.\/[^'"]+)\1/g, (_, quote, path) => quote + new URL('../src/' + path.slice(2), import.meta.url).href + quote);
source += `\nexport function testLive() { dbLive = true; contactCompanyRows = []; for (const t of Object.keys(BUILDERS)) { dbRows[t] = []; delete baseCache[t]; nextId[t] = 1001; } bump(); }`;
const data = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
// Local mode exercises the same public API without Supabase.
localStorage.setItem(data.COMPANY_AUTO_KEY, JSON.stringify({ autoCreate: false }));
const local = data.addRecord('contacts', { name: 'Local', email: 'local@gmail.com', company: 'Local SA' });
assert.ok(local.companyId);
assert.equal(data.addRecord('contacts', { company: '  LOCAL sa  ' }).companyId, local.companyId);
const editable = data.addRecord('contacts', { name: 'Editable' });
data.setField('contacts', editable.id, 'company', 'Local SA');
assert.equal(data.findRecord('contacts', editable.id).companyId, local.companyId);
data.testLive();
const joined = async id => (await db.query(`SELECT c.company_id, k.name, cc.is_primary FROM contacts c JOIN companies k ON k.id=c.company_id JOIN contact_companies cc ON cc.contact_id=c.id AND cc.company_id=k.id WHERE c.id=$1`,[id])).rows;
const a = await data.addRecord('contacts', { name: 'Juan', email: 'juan@gmail.com', company: '  Vidrios Nueva  ' }, { waitForSave: true });
assert.deepEqual(await joined(a.id), [{ company_id: a.companyId, name: 'Vidrios Nueva', is_primary: true }]);
const b = await data.addRecord('contacts', { company: 'vIDRIOS nUEVA', email: 'b@gmail.com' }, { waitForSave: true });
assert.equal(b.companyId, a.companyId);
assert.equal((await db.query('SELECT count(*)::int n FROM companies')).rows[0].n,1);
// Existing company absent from the client cache and a name with SQL wildcard characters.
await db.exec("INSERT INTO companies(id,name,domain,extra) VALUES (8000,'Literal %_ SA','example.com','{\"hs_additional_domains\":\"alias.com\"}')");
const c = await data.addRecord('contacts', { company: 'literal %_ sa', email: 'c@other.com' }, { waitForSave: true });
assert.equal(c.companyId,8000);
const d = await data.addRecord('contacts', { company: 'Trading name', email: 'd@alias.com' }, { waitForSave: true });
assert.equal(d.companyId,8000);
const typedDomain = await data.addRecord('contacts', { company: 'www.alias.com', email: 'typed@gmail.com' }, { waitForSave: true });
assert.equal(typedDomain.companyId,8000);
const e = await data.addRecord('contacts', { email: 'edit@gmail.com' }, { waitForSave: true });
data.setField('contacts', e.id, 'company', 'Editada SA');
await data.dbIdle();
assert.equal((await joined(e.id))[0].name,'Editada SA');
const keep = await data.addRecord('contacts', { company: 'Never create this', companyId: 8000 }, { waitForSave: true });
assert.equal((await joined(keep.id))[0].company_id,8000);
const same = [data.addRecord('contacts', { company: 'Concurrent SA' }), data.addRecord('contacts', { company: 'CONCURRENT sa' })];
await data.dbIdle();
assert.equal(same[0].companyId,same[1].companyId);
assert.ok(same[0].companyId);
assert.equal((await db.query("SELECT count(*)::int n FROM companies WHERE lower(name)='concurrent sa'")).rows[0].n,1);
const blank = await data.addRecord('contacts', { company: '   ', email: 'blank@gmail.com' }, { waitForSave: true });
assert.equal((await joined(blank.id)).length,0);
// Repair twice, preserving secondary links, and repeat with an existing matching company.
const repair = sql('./sql/repair-contact-421-company.sql');
await db.exec("INSERT INTO contacts(id,name,company) VALUES (421,'Juan Prueba','Vidrios y Cristales Prueba')");
await db.exec(repair);
const repaired = await joined(421);
assert.equal(repaired.length,1);
assert.equal(repaired[0].is_primary,true);
await db.exec(repair);
assert.deepEqual(await joined(421),repaired);
await db.exec('UPDATE contacts SET company_id=NULL WHERE id=421');
await db.exec(repair);
assert.deepEqual(await joined(421),repaired);
assert.equal((await db.query("SELECT count(*)::int n FROM companies WHERE lower(name)='vidrios y cristales prueba'")).rows[0].n,1);
assert.deepEqual(errors,[]);
await db.close();
console.log('PASS: local + SQL-backed create/edit, exact name, domain, explicit id, concurrent saves, blank text; repair 421 idempotent. No network.');

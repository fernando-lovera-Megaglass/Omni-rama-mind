import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$ select current_setting('test.uid')::uuid $$;
create function auth.jwt() returns jsonb language sql as $$ select current_setting('test.jwt')::jsonb $$;
grant usage on schema auth to authenticated;`);
const sql = await readFile(new URL('../supabase/user_settings.sql', import.meta.url), 'utf8');
await db.exec(sql); await db.exec(sql);
await db.exec(`set role authenticated; set test.uid='11111111-1111-1111-1111-111111111111'; set test.jwt='{"app_metadata":{"role":"admin"}}';
insert into user_settings (key,value) values ('toggle','false');
insert into account_settings (key,value) values ('shared','true');`);
await db.exec(`set test.uid='22222222-2222-2222-2222-222222222222'; set test.jwt='{"app_metadata":{"role":"user"}}';`);
assert.equal((await db.query('select * from user_settings')).rows.length, 0);
assert.equal((await db.query('select * from account_settings')).rows.length, 1);
await assert.rejects(db.exec(`insert into account_settings (key,value) values ('forbidden','true')`));
await assert.rejects(db.exec(`insert into user_settings (user_id,key,value) values ('11111111-1111-1111-1111-111111111111','forbidden','true')`));
assert.equal((await db.query(`update account_settings set value='false' returning *`)).rows.length, 0);
// Upgrade the old admin-only policy; exercise real SQL as users without a role.
await db.exec('reset role');
const upgrade = await readFile(new URL('../supabase/account-settings-authenticated.sql', import.meta.url), 'utf8');
await db.exec(upgrade); await db.exec(upgrade);
await db.exec(`set role authenticated; set test.jwt='{"app_metadata":{}}';
insert into account_settings (key,value) values
('crm:contacts:cardprops','{"title":"Acerca de","keys":["email"]}'),
('crm:contacts:layout:Equipo','{"tabs":[],"right":["summary"]}'),
('crm:contacts:recordviews','[{"name":"Equipo"}]'),
('crm:contacts:preview:Equipo','{"props":["email"],"right":["about"]}');`);
await db.exec(`reset role; set role authenticated; set test.uid='11111111-1111-1111-1111-111111111111'; set test.jwt='{"app_metadata":{}}';`);
assert.deepEqual((await db.query(`select value from account_settings where key='crm:contacts:cardprops'`)).rows[0].value.keys, ['email']);
assert.equal((await db.query(`select * from account_settings where key like 'crm:%'`)).rows.length, 4);
await db.exec(`insert into account_settings (key,value) values ('crm:contacts:cardprops','{"keys":["phone"]}') on conflict (key) do update set value=excluded.value;`);
assert.deepEqual((await db.query(`select value from account_settings where key='crm:contacts:cardprops'`)).rows[0].value.keys, ['phone']);
await assert.rejects(db.exec(`insert into account_settings (scope,key,value) values ('user','invalid','true')`));
assert.equal((await db.query(`delete from account_settings where key='crm:contacts:preview:Equipo' returning key`)).rows.length, 1);
await assert.rejects(db.exec(`insert into user_settings (user_id,key,value) values ('22222222-2222-2222-2222-222222222222','forbidden','true')`));
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  for (const suffix of ['defaultcolumns', 'quickfilters', 'boardcard']) {
    const key = `crm:${type}:${suffix}`;
    await db.query(`insert into account_settings (scope,key,value) values ('account',$1,'["name","owner"]') on conflict (key) do update set value=excluded.value`, [key]);
  }
}
await db.exec("set test.uid='22222222-2222-2222-2222-222222222222'");
assert.deepEqual((await db.query("select scope,value from account_settings where key='crm:contacts:defaultcolumns'")).rows, [{ scope: 'account', value: ['name', 'owner'] }]);
await db.exec('reset role; set role anon');
await assert.rejects(db.exec('select * from account_settings'));
await assert.rejects(db.exec(`insert into account_settings (key,value) values ('anonymous','true')`));
await db.close();
console.log('PASS: SQL idempotency, personal RLS, legacy admin restriction, upgraded role-less shared CRUD, cross-user reads, anon rejection');

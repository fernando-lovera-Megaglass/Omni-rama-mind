// PostgreSQL in WASM, no Supabase project, credentials, network, or real email.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { processDue, nextDate, render } from '../supabase/functions/sequence-process/processor.mjs';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create table tasks(id bigint generated always as identity primary key, name text, type text, status text, priority text, owner text, contact_id bigint, contact text, due timestamptz, extra jsonb);`);
await db.exec(await readFile(new URL('../supabase/sequences.sql', import.meta.url), 'utf8'));
const migration = await readFile(new URL('../supabase/sequence-process.sql', import.meta.url), 'utf8');
await db.exec(migration);
await db.exec(migration); // Migration is repeatable.
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const [seq] = await query("insert into sequences(name) values('Local smoke') returning id");
await query(`insert into sequence_steps(sequence_id, position, type, delay_days, subject, body, title) values
($1, 0, 'auto_email', 0, 'Hola {{contacto.nombre}}', '[[PRODUCT]]', ''),
($1, 10, 'call', 1, '', '', 'Llamar a {{contacto.nombre}}')`, [seq.id]);
const add = async (status = 'active', step = 1, due = '2020-01-01T00:00:00Z') => (await query(`insert into sequence_enrollments(sequence_id, contact_id, enrolled_by, status, current_step, next_step_at, placeholders)
values ($1, 1, 'Local Tester', $2, $3, $4, '{"PRODUCT":"Demo"}') returning *`, [seq.id, status, step, due]))[0];
const first = await add();
const last = await add('active', 2);
const terminals = await Promise.all(['replied', 'bounced', 'unsubscribed', 'paused', 'finished', 'unenrolled'].map((s) => add(s)));
const future = await add('active', 1, '2099-01-01T00:00:00Z');
const contact = { email: 'local@example.invalid', first: 'Ana' };
const store = {
  due: (now) => query('select * from sequence_due($1)', [now]),
  claim: async (id) => (await query('select * from sequence_claim($1)', [id]))[0],
  steps: (id) => query('select * from sequence_steps where sequence_id = $1', [id]),
  context: async () => ({ contact, company: {} }),
  active: async (e) => (await query("select id from sequence_enrollments where id=$1 and status='active' and current_step=$2", [e.id, e.current_step])).length > 0,
  record: (e, status, error) => query('update sequence_step_runs set status=$3, last_error=$4 where enrollment_id=$1 and step_number=$2', [e.id, e.current_step, status, error]),
  finish: async (e, step, payload, next, receipt) => (await query('select sequence_finish($1,$2,$3,$4,$5,$6)', [e.id, e.current_step, next, step.type, payload.title, JSON.stringify(receipt)]))[0].sequence_finish,
};
const sends = [];
const send = async (e, step, payload) => { sends.push(e.id); assert.equal(payload.subject, 'Hola Ana'); assert.equal(payload.html, 'Demo'); return { id: `mock-${e.id}` }; };
const now = new Date();
await Promise.all([processDue(store, send, now), processDue(store, send, now)]);
const get = async (id) => (await query('select * from sequence_enrollments where id=$1', [id]))[0];
assert.deepEqual(sends, [first.id]);
assert.equal((await get(first.id)).current_step, 2);
assert.ok(new Date((await get(first.id)).next_step_at) > now);
assert.equal((await get(first.id)).stats.sent, 1);
assert.equal((await get(last.id)).status, 'finished');
assert.equal((await get(last.id)).current_step, 3);
assert.equal((await get(last.id)).next_step_at, null);
assert.equal((await query('select * from tasks')).length, 1);
for (const e of [...terminals, future]) assert.deepEqual(await get(e.id), e);
await processDue(store, send, now);
assert.equal(sends.length, 1);
assert.equal((await query('select * from tasks')).length, 1);
const broken = await add();
await processDue(store, async () => { throw new Error('Ambiguous send timeout'); }, now);
assert.equal((await get(broken.id)).current_step, 1);
await processDue(store, send, now);
assert.equal(sends.length, 1, 'uncertain deliveries must not be retried');
assert.equal((await query('select status from sequence_step_runs where enrollment_id=$1', [broken.id]))[0].status, 'error');
const cancelled = await add();
await processDue({ ...store, active: async (e) => { await query("update sequence_enrollments set status='replied' where id=$1", [e.id]); return false; } }, send, now);
assert.equal((await get(cancelled.id)).status, 'replied');
assert.equal(sends.length, 1);
const inFlight = await add();
await processDue(store, async (e) => { await query("update sequence_enrollments set status='unsubscribed' where id=$1", [e.id]); return { id: 'mock-in-flight' }; }, now);
assert.equal((await get(inFlight.id)).status, 'unsubscribed');
assert.equal((await get(inFlight.id)).current_step, 1);
assert.equal(nextDate('2026-11-20T09:00:00Z', 1), '2026-11-23T09:00:00.000Z');
assert.equal(nextDate('2026-11-20T09:00:00Z', 0), '2026-11-20T09:01:00.000Z');
assert.throws(() => render('[[MISSING]]', first, contact, {}), /Unresolved/);
assert.equal(render('{{contacto.nombre}}', first, { first: '<Ana>' }, {}, true), '&lt;Ana&gt;');
await db.exec('set role anon');
await assert.rejects(() => query('select * from sequence_claim($1)', [first.id]), /permission denied/);
await db.close();
console.log('PASS: real local SQL migration/RPCs; due advance; final/manual task; terminal/future unchanged; concurrent claims; errors; cancellation; business days; permissions. Gmail mocked, no external calls.');

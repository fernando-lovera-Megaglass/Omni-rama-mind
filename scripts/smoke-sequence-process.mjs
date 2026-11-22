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
await db.exec(await readFile(new URL('../supabase/message_templates.sql', import.meta.url), 'utf8'));
const usageMigration = await readFile(new URL('../supabase/message-template-usage.sql', import.meta.url), 'utf8');
await db.exec(usageMigration);
await db.exec(usageMigration);
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const [seq] = await query("insert into sequences(name) values('Local smoke') returning id");
await query(`insert into sequence_steps(sequence_id, position, type, delay_days, subject, body, title) values
($1, 0, 'auto_email', 0, 'Hola {{contacto.nombre}}', '[[PRODUCT]]', ''),
($1, 10, 'call', 1, '', '', 'Llamar a {{contacto.nombre}}')`, [seq.id]);
const add = async (status = 'active', step = 1, due = '2020-01-01T00:00:00Z') => (await query(`insert into sequence_enrollments(sequence_id, contact_id, enrolled_by, status, current_step, next_step_at, placeholders)
values ($1, 1, 'Local Tester', $2, $3, $4, '{"PRODUCT":"Demo"}') returning *`, [seq.id, status, step, due]))[0];
const [usageTemplate] = await query("select id from message_templates limit 1");
await query('update sequence_steps set template_id=$1 where sequence_id=$2', [usageTemplate.id, seq.id]);
const usage = async () => (await query('select uses, last_used_at from message_templates where id=$1', [usageTemplate.id]))[0];
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
assert.equal((await get(last.id)).status, 'active');
assert.equal((await get(last.id)).current_step, 2);
assert.equal((await get(last.id)).next_step_at, null);
assert.equal((await query('select * from tasks')).length, 1);
for (const e of [...terminals, future]) assert.deepEqual(await get(e.id), e);
await processDue(store, send, now);
assert.equal(sends.length, 1);
assert.equal(Number((await usage()).uses), 1);
assert.ok((await usage()).last_used_at);
assert.equal((await query('select * from tasks')).length, 1);
// A final manual step stays pending across ticks, then finishes exactly once.
const [lastTask] = await query('select * from tasks');
assert.deepEqual(lastTask.extra, { sequenceId: seq.id, enrollmentId: last.id, stepPosition: 10 });
assert.equal(String((await get(last.id)).extra.waiting_task), String(lastTask.id));
const complete = async (task, next) => query('select * from sequence_complete_task($1,$2)', [task.id, next]);
assert.equal((await complete(lastTask, null)).length, 0, 'pending tasks cannot resume');
await query("update tasks set status='done' where id=$1", [lastTask.id]);
assert.equal((await complete(lastTask, null))[0].status, 'finished');
assert.equal((await get(last.id)).current_step, 3);
assert.equal((await complete(lastTask, null)).length, 0, 'duplicate completion is harmless');

// Manual -> email: no next step until completion, even with a stale overdue date.
const [manualSeq] = await query("insert into sequences(name) values('Manual pause') returning id");
await query(`insert into sequence_steps(sequence_id, position, type, delay_days) values
($1, 0, 'inmail', 0), ($1, 1, 'auto_email', 1)`, [manualSeq.id]);
const [manual] = await query(`insert into sequence_enrollments(sequence_id, contact_id, next_step_at)
values ($1, 1, '2020-01-01') returning *`, [manualSeq.id]);
await processDue(store, send, now);
const [manualTask] = await query("select * from tasks where extra->>'enrollmentId'=$1", [manual.id]);
assert.equal((await get(manual.id)).current_step, 1);
assert.equal((await get(manual.id)).next_step_at, null);
await query("update sequence_enrollments set next_step_at='2020-01-01' where id=$1", [manual.id]);
assert.equal((await store.due(now.toISOString())).some(e => e.id === manual.id), false);
assert.equal(await store.claim(manual.id), undefined);
await processDue(store, send, new Date('2099-01-01'));
assert.equal(sends.length, 1);
assert.equal((await get(manual.id)).current_step, 1, 'overdue waiting enrollment retains its manual step');
assert.equal((await query("select * from tasks where extra->>'enrollmentId'=$1", [manual.id])).length, 1, 'waiting must not create another task');
await query("update tasks set status='done' where id=$1", [manualTask.id]);
await query("update sequence_enrollments set status='unenrolled' where id=$1", [manual.id]);
assert.equal((await complete(manualTask, now.toISOString())).length, 0, 'completion must preserve cancellation');
await query("update sequence_enrollments set status='active' where id=$1", [manual.id]);
const monday = nextDate('2026-11-20T09:00:00Z', 1);
const resumed = await complete(manualTask, monday);
assert.equal(resumed[0].current_step, 2);
assert.equal(new Date(resumed[0].next_step_at).toISOString(), monday);
assert.equal(resumed[0].extra.waiting_task, undefined);
assert.equal((await complete(manualTask, monday)).length, 0);
// Keep this isolated fixture out of subsequent processing assertions.
await query("update sequence_enrollments set status='paused' where id=$1", [manual.id]);

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
assert.equal(Number((await usage()).uses), 2, 'confirmed in-flight send counts; failures/cancellations/manual tasks do not');
assert.equal(nextDate('2026-11-20T09:00:00Z', 1), '2026-11-23T09:00:00.000Z');
assert.equal(nextDate('2026-11-20T09:00:00Z', 0), '2026-11-20T09:01:00.000Z');
assert.throws(() => render('[[MISSING]]', first, contact, {}), /Unresolved/);
assert.equal(render('{{contacto.nombre}}', first, { first: '<Ana>' }, {}, true), '&lt;Ana&gt;');
// Every manual type must pause, including a zero-day following step. Concurrent
// completion requests may advance only once, even when both see a completed task.
for (const type of ['manual_email', 'call', 'task', 'inmail', 'connection']) {
  const [sequence] = await query('insert into sequences(name) values($1) returning id', [`Pause ${type}`]);
  await query(`insert into sequence_steps(sequence_id, position, type, delay_days) values
    ($1, 0, $2, 0), ($1, 7, 'auto_email', 0)`, [sequence.id, type]);
  const [enrollment] = await query(`insert into sequence_enrollments(sequence_id, contact_id, next_step_at)
    values ($1, 1, '2020-01-01') returning *`, [sequence.id]);
  const noSend = async () => assert.fail(`${type}: email sent while waiting for task`);
  await processDue(store, noSend, now);
  const [task] = await query("select * from tasks where extra->>'enrollmentId'=$1", [enrollment.id]);
  assert.deepEqual(task.extra, { sequenceId: sequence.id, enrollmentId: enrollment.id, stepPosition: 0, ...(type === 'manual_email' ? { email: { subject: '', html: '', title: '' } } : {}) });
  assert.equal(task.type, type === 'call' ? 'Llamada' : type === 'manual_email' ? 'Correo' : 'Tarea');
  assert.equal((await get(enrollment.id)).current_step, 1);
  assert.equal((await get(enrollment.id)).next_step_at, null);
  await processDue(store, noSend, new Date('2099-01-01'));
  assert.equal((await query("select * from tasks where extra->>'enrollmentId'=$1", [enrollment.id])).length, 1);
  await query("update tasks set status='done' where id=$1", [task.id]);
  const completions = await Promise.all([complete(task, now.toISOString()), complete(task, now.toISOString())]);
  assert.equal(completions.flat().length, 1, `${type}: completion advances exactly once`);
  const advanced = await get(enrollment.id);
  assert.equal(advanced.current_step, 2);
  assert.equal(new Date(advanced.next_step_at).toISOString(), now.toISOString());
  assert.equal(advanced.extra.waiting_task, undefined);
  await query("update sequence_enrollments set status='paused' where id=$1", [enrollment.id]);
}
// Persisted overrides follow stable step IDs, preserving template content and other enrollments.
await query("update sequence_enrollments set status='paused' where status='active'");
for (const type of ['auto_email', 'manual_email']) {
  const [sequence] = await query("insert into sequences(name) values('Overrides') returning id");
  const [step] = await query("insert into sequence_steps(sequence_id, position, type, subject, body) values($1, 9, $2, 'Original', '<p>Original</p>') returning *", [sequence.id, type]);
  const extra = { stepOverrides: { [step.id]: { subject: 'Solo {{contacto.nombre}}', body: '<p>[[PRODUCT]]</p>', type: 'call' } } };
  const [enrollment] = await query("insert into sequence_enrollments(sequence_id, contact_id, next_step_at, extra, placeholders) values($1, 1, '2020-01-01', $2, $3) returning *", [sequence.id, JSON.stringify(extra), JSON.stringify({ PRODUCT: 'Especial' })]);
  let sent = 0;
  await processDue(store, async (e, st, payload) => { sent++; assert.equal(st.type, 'auto_email'); assert.equal(payload.subject, 'Solo Ana'); assert.equal(payload.html, '<p>Especial</p>'); return { id: 'override-test' }; }, now);
  assert.equal(sent, type === 'auto_email' ? 1 : 0);
  if (type === 'manual_email') {
    const [task] = await query("select * from tasks where extra->>'enrollmentId'=$1", [enrollment.id]);
    assert.equal(task.extra.email.subject, 'Solo Ana');
    assert.equal(task.extra.email.html, '<p>Especial</p>');
  }
  assert.deepEqual((await get(enrollment.id)).extra.stepOverrides, extra.stepOverrides);
  assert.equal((await query('select subject from sequence_steps where id=$1', [step.id]))[0].subject, 'Original');
}
await db.exec('set role anon');
await assert.rejects(() => query('select * from sequence_claim($1)', [first.id]), /permission denied/);
await db.close();
console.log('PASS: real local SQL migration/RPCs; due advance; final/manual task; terminal/future unchanged; concurrent claims; errors; cancellation; business days; permissions. Gmail mocked, no external calls.');

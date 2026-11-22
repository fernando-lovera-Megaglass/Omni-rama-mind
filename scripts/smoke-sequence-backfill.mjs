// Smoke test for scripts/sequence-backfill.mjs on PGlite (PostgreSQL in WASM; no project, no credentials): a
// database with sequences.sql + sequence-process.sql holds the production picture of 2026-11-21 (26 active
// enrolments frozen with next_step_at overdue since 2026-11-09/11) plus terminal, paused, future and waiting
// ones. The planner picks exactly the 26, staggers them into the future on weekdays, the generated SQL applied to
// the database leaves them due in the future (sequence_due no longer returns them), touches nothing else and is
// harmless when run twice. The CLI (--from-json, --sql, --out) produces the same plan. Run: node scripts/smoke-sequence-backfill.mjs
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { planBackfill, renderSql, renderPlan, shiftWeekend, defaultStart, SELECT_ROWS, TERMINAL } from './sequence-backfill.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[backfill-smoke]', ...a);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create table tasks(id bigint generated always as identity primary key, name text, type text, status text, priority text, owner text, contact_id bigint, contact text, due timestamptz, extra jsonb);`);
await db.exec(await readFile(new URL('../supabase/sequences.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../supabase/sequence-process.sql', import.meta.url), 'utf8'));
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const iso = (d) => new Date(d).toISOString();
const [seq] = await query("insert into sequences(name) values('Prospección') returning id");
await query(`insert into sequence_steps(sequence_id, position, type, delay_days, subject, body) values ($1, 0, 'auto_email', 0, 'Hola', 'Hola'), ($1, 1, 'auto_email', 2, 'Seguimiento', 'Hola')`, [seq.id]);
const add = (status, step, due, extra = '{}') => query(`insert into sequence_enrollments(sequence_id, contact_id, contact_name, enrolled_by, status, current_step, next_step_at, extra) values ($1, 1, $2, 'Fernando L.', $3, $4, $5, $6::jsonb) returning id`, [seq.id, `${status} ${step}`, status, step, due, extra]);
// the production picture: 26 active rows overdue since 2026-11-09 06:00 UTC (the oldest) up to 2026-11-11
const frozenIds = [];
for (let i = 0; i < 26; i++) frozenIds.push((await add('active', (i % 3) + 1, new Date(Date.UTC(2026, 10, 9 + (i % 3), 6, i, 0)).toISOString()))[0].id);
for (const s of [...TERMINAL, 'paused']) await add(s, 2, '2026-11-10T06:00:00Z');
const futureId = (await add('active', 1, '2099-01-01T00:00:00Z'))[0].id;
const waitingId = (await add('active', 2, null, '{"waiting_task": 7}'))[0].id;
const NOW = new Date('2026-11-21T15:00:00Z'); // a Saturday
const snapshot = async () => Object.fromEntries((await query('select id, status, current_step, next_step_at, updated_at from sequence_enrollments order by id')).map((r) => [r.id, { ...r, next_step_at: r.next_step_at === null ? null : iso(r.next_step_at), updated_at: iso(r.updated_at) }]));
const before = await snapshot();
const dueBefore = await query('select id from sequence_due($1)', [NOW.toISOString()]);
assert.equal(dueBefore.length, 26, 'the 26 frozen rows are what sequence_due returns today');

// ---- the plan ----
const rows = await query(SELECT_ROWS);
assert.equal(rows.length, 26 + TERMINAL.length + 3);
const plan = planBackfill(rows, { now: NOW, spacingMinutes: 5 });
assert.equal(plan.reschedule.length, 26);
assert.deepEqual(new Set(plan.reschedule.map((r) => r.id)), new Set(frozenIds));
assert.deepEqual(plan.untouched, { terminal: Object.fromEntries(TERMINAL.map((s) => [s, 1])), paused: 1, activeFuture: 1, activeWaiting: 1, other: {} });
assert.equal(plan.start, '2026-11-23T15:15:00.000Z', 'default start: +15 min on a 5-minute boundary, Saturday → Monday');
assert.equal(plan.reschedule[0].oldAt, '2026-11-09T06:00:00.000Z', 'oldest first');
for (let i = 0; i < plan.reschedule.length; i++) {
  const r = plan.reschedule[i];
  assert.equal(r.newAt, iso(new Date(Date.parse(plan.start) + i * 5 * 60_000)), `row ${i} staggered by 5 minutes`);
  assert.ok(![0, 6].includes(new Date(r.newAt).getUTCDay()), 'weekday');
  assert.ok(Date.parse(r.newAt) > NOW.getTime(), 'future');
  assert.ok(i === 0 || Date.parse(r.newAt) > Date.parse(plan.reschedule[i - 1].newAt), 'ascending');
}
log(`plan: ${plan.reschedule.length} a reprogramar desde ${plan.start} cada ${plan.spacingMinutes} min; sin tocar ${JSON.stringify(plan.untouched)}`);
// explicit start on a Friday evening spills over the weekend to Monday
const friday = planBackfill(rows, { now: NOW, start: '2026-11-20T23:50:00Z', spacingMinutes: 5 });
assert.equal(friday.reschedule[0].newAt, '2026-11-20T23:50:00.000Z');
assert.equal(friday.reschedule[2].newAt, '2026-11-23T00:00:00.000Z', 'Saturday 00:00 → Monday 00:00');
assert.equal(shiftWeekend(new Date('2026-11-22T10:00:00Z')).toISOString(), '2026-11-23T10:00:00.000Z');
assert.equal(defaultStart(new Date('2026-11-24T09:01:00Z')).toISOString(), '2026-11-24T09:20:00.000Z');
assert.ok(/26 activas congeladas a reprogramar/.test(renderPlan(plan)) && /terminales \(replied 1, meeting 1, bounced 1, unsubscribed 1, finished 1, unenrolled 1\)/.test(renderPlan(plan)));

// ---- the SQL applied to the database ----
const sql = renderSql(plan);
assert.equal((sql.match(/^update public\.sequence_enrollments/gm) || []).length, 26);
assert.ok(sql.startsWith('-- Backfill') && /\nbegin;\n/.test(sql) && /\ncommit;\n/.test(sql) && sql.includes(`next_step_at <= '${plan.generatedAt}'`));
await db.exec(sql);
const after = await snapshot();
for (const id of frozenIds) {
  const r = after[id];
  const p = plan.reschedule.find((x) => x.id === id);
  assert.equal(r.next_step_at, p.newAt, 'rescheduled as planned');
  assert.equal(r.status, 'active');
  assert.equal(r.current_step, before[id].current_step, 'the pending step does not change');
  assert.notEqual(r.updated_at, before[id].updated_at);
}
for (const id of Object.keys(before)) if (!frozenIds.includes(id)) assert.deepEqual(after[id], before[id], `untouched ${before[id].status}`);
assert.equal(after[futureId].next_step_at, '2099-01-01T00:00:00.000Z');
assert.equal(after[waitingId].next_step_at, null);
assert.equal((await query('select id from sequence_due($1)', [NOW.toISOString()])).length, 0, 'nothing is due any more');
assert.equal((await query('select count(*)::int as n from sequence_enrollments where status = $1 and next_step_at > $2', ['active', NOW.toISOString()]))[0].n, 27, '26 + the future one');
// running the same SQL again changes nothing (the guards no longer match)
await db.exec(sql);
assert.deepEqual(await snapshot(), after, 'second run is a no-op');
// a plan generated after the backfill has nothing to do
assert.equal(planBackfill(await query(SELECT_ROWS), { now: NOW }).reschedule.length, 0);
log('SQL: 26 updates aplicados → 0 vencidas (sequence_due vacío), terminales/pausada/futura/esperando intactas, segunda ejecución sin cambios');

// ---- the CLI with --from-json / --sql / --out ----
const jsonFile = resolve('/tmp', `cany-backfill-rows-${process.pid}.json`);
const outFile = resolve('/tmp', `cany-backfill-${process.pid}.sql`);
await writeFile(jsonFile, JSON.stringify(rows.map((r) => ({ ...r, next_step_at: r.next_step_at === null ? null : iso(r.next_step_at) }))));
const run = (args, env = {}) => new Promise((done) => {
  const child = spawn(process.execPath, [resolve(here, 'sequence-backfill.mjs'), ...args], { env: { PATH: process.env.PATH, ...env }, cwd: resolve(here, '..') });
  let out = ''; let err = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { err += c; });
  child.on('close', (code) => done({ code, out, err }));
});
// (the rows were already rescheduled in the DB, so this JSON reflects the backfilled state: use the pre-backfill one)
await writeFile(jsonFile, JSON.stringify(Object.values(before).map((r) => ({ id: r.id, sequence_id: seq.id, contact_name: '', status: r.status, current_step: r.current_step, next_step_at: r.next_step_at }))));
let r = await run(['--from-json', jsonFile, '--start', '2026-11-24T09:00:00Z', '--spacing', '10', '--sql', '--out', outFile]);
assert.equal(r.code, 0, r.err);
assert.ok(/26 activas congeladas a reprogramar desde 2026-11-24T09:00:00.000Z cada 10 min/.test(r.out), r.out);
const written = await readFile(outFile, 'utf8');
assert.equal((written.match(/^update public\.sequence_enrollments/gm) || []).length, 26);
assert.ok(written.includes("'2026-11-24T09:00:00.000Z'") && written.includes("'2026-11-24T13:10:00.000Z'"), '26th row at +250 min');
assert.ok(r.out.includes('begin;') && r.out.includes(`SQL escrito en ${outFile}`));
r = await run(['--from-json', jsonFile, '--apply']);
assert.equal(r.code, 1);
assert.ok(/--yes/.test(r.err), 'apply needs --yes');
r = await run(['--from-json', jsonFile, '--apply', '--yes']);
assert.equal(r.code, 1);
assert.ok(/no figura como aplicada/.test(r.err), 'apply refuses while the migration is pending');
r = await run([]);
assert.equal(r.code, 1);
assert.ok(/--from-json|--from-db/.test(r.err));
log('CLI: --from-json/--start/--spacing/--sql/--out generan el mismo plan; --apply exige --yes y la migración aplicada');
console.log('[backfill-smoke] OK');
process.exit(0);

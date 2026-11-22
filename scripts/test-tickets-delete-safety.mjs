// Executes the production deletion and fetch functions with a failing database.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/data.js', import.meta.url), 'utf8');
const section = source.slice(source.indexOf('const SOFT_DELETE ='), source.indexOf('// The deleted records of a type'));
const fetchSource = source.slice(source.indexOf('async function fetchTable('), source.indexOf('// Re-read one table'));
for (const message of ['column deleted_at does not exist', 'permission denied', 'network failure']) {
  const calls = [], pending = [], errors = [];
  const error = new Error(message);
  const query = {
    update(value) { calls.push(['update', value]); return this; },
    delete() { throw new Error('Physical DELETE attempted'); },
    in() { return Promise.resolve({ error }); },
    select() { return this; },
    is(column, value) { calls.push(['filter', column, value]); return this; },
    order() { return this; },
    range() { return Promise.resolve({ error }); },
  };
  const ctx = vm.createContext({ Set, Date, dbLive: true, dbRows: { tickets: [{ id: 123 }] },
    K: () => '', bump() {}, dbWrite: fn => pending.push(fn()),
    supabase: { from(type) { assert.equal(type, 'tickets'); return query; } },
    reportDbError: (_, e) => errors.push(e),
  });
  vm.runInContext(section.replaceAll('export ', '') + fetchSource + '\nthis.api = { deleteRecords, fetchTable, softDeletes };', ctx);
  await assert.rejects(ctx.api.fetchTable('tickets'), e => e === error);
  assert.equal(ctx.api.softDeletes('tickets'), true);
  ctx.api.deleteRecords('tickets', [123]);
  await Promise.all(pending);
  assert.equal(errors.length, 1);
  assert.equal(calls[0][0], 'filter');
  assert.equal(calls[0][1], 'deleted_at');
  assert.equal(calls[0][2], null);
  assert.equal(calls[1][0], 'update');
  assert.ok(calls[1][1].deleted_at);
}
console.log('OK: missing column, permission and network errors never enable physical ticket DELETE; fetchTable keeps its filter.');

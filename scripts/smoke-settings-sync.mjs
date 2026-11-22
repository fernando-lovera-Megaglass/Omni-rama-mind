import assert from 'node:assert/strict';
import { createSettingsStore } from '../src/settings-store.js';
const rows = { user_settings: [], account_settings: [] };
let offline = false;
const storage = () => { const m = new Map(); return { getItem: k => m.get(k), setItem: (k,v) => m.set(k,v) }; };
function session(id, role = 'admin', disk = storage()) {
  const errors = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id, app_metadata: { role } } } } }) },
    from(table) { return {
      select() { const filters = []; const q = { eq(k,v) { filters.push([k,v]); return q; }, then(resolve) { resolve(offline ? { error: new Error('offline') } : { data: rows[table].filter(r => filters.every(([k,v]) => r[k] === v)) }); } }; return q; },
      async upsert(row) { if (offline) return { error: new Error('offline') }; const i = rows[table].findIndex(r => r.key === row.key && r.user_id === row.user_id); if (i < 0) rows[table].push(row); else rows[table][i] = row; return {}; }
    }; }
  };
  return { ...createSettingsStore({ client, storage: disk, onError: e => errors.push(e) }), errors };
}
const disk = storage();
const first = session('alice', null, disk); await first.ready;
first.save('crm:settings:general-correo', { track: false });
assert.equal(first.load('crm:settings:general-correo').track, false, 'optimistic toggle');
first.save('crm:profile', { first: 'Alice' }); first.save('crm:notif', { push_tasks: false });
first.save('crm:account', { name: 'Shared' }); first.save('crm:integrations', { enabled: true });
await first.flush();
const second = session('alice'); await second.ready;
assert.equal(second.load('crm:settings:general-correo').track, false, 'fresh browser receives toggle');
assert.equal(second.load('crm:profile').first, 'Alice');
assert.equal(second.load('crm:notif').push_tasks, false);
const other = session('bob', 'user', disk); await other.ready;
assert.equal(other.load('crm:profile', null), null, 'no cross-user cache leak');
assert.equal(other.load('crm:account').name, 'Shared');
other.save('crm:account', { name: 'Updated by member' }); await other.flush();
assert.equal(other.load('crm:account').name, 'Updated by member'); assert.equal(other.errors.length, 0);
const fresh = session('charlie', null); await fresh.ready;
assert.equal(fresh.load('crm:account').name, 'Updated by member');
offline = true;
first.save('crm:notif', { push_tasks: true }); await first.flush();
const restarted = session('alice', null, disk); await restarted.ready;
assert.equal(restarted.load('crm:notif').push_tasks, true);
offline = false; await restarted.flush();
const third = session('alice'); await third.ready;
assert.equal(third.load('crm:notif').push_tasks, true, 'offline queue survives reload');
console.log('PASS: independent browser stores, personal isolation, shared account, authenticated writes, offline retry');
// Index defaults are account-wide, with legacy local values used only when absent.
for (const type of ['contacts', 'companies', 'deals', 'tickets', 'tasks']) {
  for (const suffix of ['defaultcolumns', 'quickfilters', 'boardcard']) {
    const key = `crm:${type}:${suffix}`;
    const legacy = storage(); legacy.setItem(key, '["legacy"]');
    const writer = session('index-writer', null, legacy); await writer.ready;
    assert.deepEqual(writer.load(key), ['legacy']);
    assert.equal(rows.account_settings.some(r => r.key === key), false, 'no implicit migration');
    writer.save(key, ['name', 'owner']); await writer.flush();
    assert.deepEqual(rows.account_settings.find(r => r.key === key), { key, value: ['name', 'owner'], scope: 'account' });
    const reader = session('index-reader', null); await reader.ready;
    assert.deepEqual(reader.load(key), ['name', 'owner'], 'fresh browser gets account defaults');
    const stale = session('index-reader', null, legacy); await stale.ready;
    assert.deepEqual(stale.load(key), ['name', 'owner'], 'remote wins over legacy');
    writer.save(key, []); await writer.flush();
    const reset = session('index-reader', null, legacy); await reset.ready;
    assert.deepEqual(reset.load(key), [], 'reset does not revive legacy values');
  }
}
console.log('PASS: index account defaults, fresh browsers, local fallback, remote precedence and reset');

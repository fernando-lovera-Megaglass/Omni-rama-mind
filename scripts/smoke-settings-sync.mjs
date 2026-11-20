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
const first = session('alice', 'admin', disk); await first.ready;
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
other.save('crm:account', { name: 'Forbidden' }); await other.flush();
assert.equal(other.load('crm:account').name, 'Shared'); assert.equal(other.errors.length, 1);
offline = true;
first.save('crm:notif', { push_tasks: true }); await first.flush();
const restarted = session('alice', 'admin', disk); await restarted.ready;
assert.equal(restarted.load('crm:notif').push_tasks, true);
offline = false; await restarted.flush();
const third = session('alice'); await third.ready;
assert.equal(third.load('crm:notif').push_tasks, true, 'offline queue survives reload');
console.log('PASS: independent browser stores, personal isolation, shared account, admin guard, offline retry');

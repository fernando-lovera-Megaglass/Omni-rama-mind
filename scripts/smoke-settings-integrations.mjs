import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountIntegrations, connectionLabel } from '../src/settings-integrations.js';
const dom = new JSDOM('<div id="panel"></div>', { url: 'https://example.test/settings/#int-connected', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location });
const root = document.querySelector('#panel');
let rows = { connected_accounts: [{ id: 'g1', email: 'real@example.test', status: 'active' }], twilio_connections: [] };
let fail = false, removed = false;
const events = {};
const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  from(table) { return { select() { return this; }, eq(key, value) { if (key === 'user_id') assert.equal(value, 'owner'); return this; }, then(resolve) { resolve({ data: rows[table], error: fail ? new Error('Database unavailable') : null }); } }; },
  channel() { return { on(type, filter, cb) { events[filter.table] = cb; return this; }, subscribe() { return this; } }; },
  removeChannel() { removed = true; },
};
const tick = () => new Promise((r) => setTimeout(r, 10));
let connected = false, disconnectFails = false;
const stop = mountIntegrations(root, { client, connect: async () => { connected = true; }, gmailDisconnect: async (id) => { assert.equal(id, 'g1'); if (disconnectFails) throw new Error('Disconnect failed'); rows.connected_accounts = []; } });
assert.match(root.textContent, /Consultando/);
await tick();
assert.match(root.querySelector('[data-provider="gmail"]').textContent, /Conectada/);
assert.match(root.querySelector('[data-provider="twilio"]').textContent, /No conectada/);
assert.equal(root.querySelectorAll('svg').length, 2);
disconnectFails = true;
root.querySelector('[data-disconnect="gmail"]').click();
await tick();
assert.match(root.textContent, /Disconnect failed/);
assert.ok(root.querySelector('[data-disconnect="gmail"]'));
disconnectFails = false;
root.querySelector('[data-disconnect="gmail"]').click();
await tick();
assert.equal(root.querySelector('[data-disconnect="gmail"]'), null);
root.querySelector('[data-connect="gmail"]').click();
await tick(); assert.equal(connected, true);
rows.twilio_connections = [{ id: 't1', phone_number: '+15551234567', status: 'error', last_error: 'Invalid credentials' }];
events.twilio_connections(); await tick();
assert.match(root.textContent, /Invalid credentials/);
fail = true; root.querySelector('[data-refresh]').click(); await tick();
assert.match(root.textContent, /No se pudo consultar el estado/);
assert.equal(root.querySelector('[data-connect="gmail"]').disabled, true);
assert.equal(connectionLabel([{ status: 'active' }, { status: 'error' }]), 'Error');
assert.equal(connectionLabel([{ status: 'disabled' }]), 'No conectada');
stop(); assert.equal(removed, true);
console.log('settings integrations: loading, database state, errors, OAuth, disconnect, realtime and cleanup OK');
dom.window.close();

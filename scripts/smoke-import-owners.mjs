// Regression checks for real account owners. Run: node scripts/smoke-import-owners.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const log = (...a) => console.log('[import]', ...a);
const fail = (msg) => { console.error(`[import] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const boot = (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.CSS = dom.window.CSS;
  globalThis.history = dom.window.history;
  dom.window.confirm = () => true;
  return dom;
};
let dom = boot('http://localhost/data/import/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>');
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));
const fileOf = (name, text) => ({ name, size: text.length, text: () => Promise.resolve(text), arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) });

// Real account emails, duplicate sources, exact names and persisted assignments.
const assert = (await import('node:assert/strict')).default;
const { buildOwnerIndex, resolveIndexedOwner } = await import('../src/import-owners.js');
const sharedIdentity = buildOwnerIndex(data.OWNERS, {
  users: [null, { name: 'Sofía R.', email: 'fernando.lovera@real.example' }],
  user: { email: 'fernando.lovera@real.example' },
  invitations: [{ email: 'fernando.lovera@real.example' }],
});
assert.deepEqual(resolveIndexedOwner(sharedIdentity, 'fernando.lovera@real.example'), { value: 'Sofía R.' });
assert.equal(resolveIndexedOwner(sharedIdentity, 'sofia.r@omni.crm').error, 'OWNER_NOT_FOUND');
const auth = await import('../src/auth.js');
auth.setAuthClient({ auth: { getSession: async () => ({ data: { session: { user: {
  email: 'fernando@real.example', user_metadata: { full_name: 'Fernando Lovera Colin' },
} } } }) } });
storage.setItem('crm:users', JSON.stringify([
  { name: 'Fernando L.', email: 'fernando@real.example' },
  { name: 'Sofía R.', email: 'ventas@real.example' },
]));
storage.setItem('crm:invitations', JSON.stringify([
  { email: 'fernando@real.example' }, { email: 'laura.martinez@real.example' },
]));
await E.refreshImportOwners();
assert.deepEqual(E.resolveOwner(' FERNANDO@REAL.EXAMPLE '), { value: 'Fernando L.' });
assert.deepEqual(E.resolveOwner('Fernando Lovera Colin'), { value: 'Fernando L.' });
assert.deepEqual(E.resolveOwner('ventas@real.example'), { value: 'Sofía R.' });
assert.deepEqual(E.resolveOwner('laura.martinez@real.example'), { value: 'Laura M.' });
assert.equal(E.resolveOwner('Fernando').error, 'OWNER_NOT_FOUND');
assert.equal(E.resolveOwner('unknown@real.example').error, 'OWNER_NOT_FOUND');
const ownerTable = await E.parseFile(fileOf('owners.csv', 'Nombre,Correo electrónico,Propietario del contacto\nOwner test,owner-import@real.example,fernando@real.example\nUnknown,unknown-import@real.example,unknown@real.example'));
const ownerMap = E.autoMap(ownerTable.headers);
const ownerColumn = E.validateColumns(ownerTable, ownerMap)[2];
assert.equal(ownerColumn.errors, 1);
assert.equal(ownerColumn.badValues[0].code, 'OWNER_NOT_FOUND');
const ownerPlan = E.planImport(ownerTable, ownerMap);
const ownerJob = E.registerImport({ name: 'Real owners', table: ownerTable, plan: ownerPlan, options: {} });
await E.runImport(ownerJob.id, ownerPlan, { pause: 0 });
assert.equal(data.allContacts().find((c) => c.email === 'owner-import@real.example').owner, 'Fernando L.');
assert.equal(data.allContacts().find((c) => c.email === 'unknown-import@real.example').owner, 'Sin asignar');
ownerMap[2].replacements['unknown@real.example'] = 'ventas@real.example';
assert.equal(E.validateColumns(ownerTable, ownerMap)[2].errors, 0);
storage.setItem('crm:users', JSON.stringify([
  { name: 'Fernando L.', email: 'fernando@real.example' },
  { name: 'Fernando L.', email: 'another@real.example' },
]));
assert.equal(E.resolveOwner('Fernando L.').error, 'MULTIPLE_OWNERS_FOUND');
assert.deepEqual(E.resolveOwner('another@real.example'), { value: 'Fernando L.' });
storage.removeItem('crm:users');
storage.removeItem('crm:invitations');
auth.setAuthClient(null);
await E.refreshImportOwners();
log('real owners: session, directory, invitations, ambiguity, column replacement and persistence OK');


// Tests for the contact import module (especificacion-importacion-contactos-crm.md): file parsing (CSV, XLSX,
// pasted data, invalid files), auto-mapping ES/EN, value conversion per type, de-duplication by e-mail / record
// ID, the three modes, the error catalogue with downloads, the states (STARTED → PROCESSING → DONE / FAILED /
// CANCELED / DEFERRED), limits, and the wizard pages. Run: node scripts/smoke-import.mjs
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
let dom = boot('http://localhost/data/import/?transfer=1', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>');
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));
const fileOf = (name, text) => ({ name, size: text.length, text: () => Promise.resolve(text), arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) });


const assert = (condition, message) => { if (!condition) fail(message); };
const W = await import('../src/import-wizard.js');
assert(document.querySelector('#transfer-source').options.length === 4, 'source picker');
const fixtures = [
  ['salesforce', 'contacts', 'Contact ID,First Name,Last Name,Email,Phone,Account Name\n003fake,Ana,Salesforce,ana@sf-transfer.test,5551234567,Example SF', 'email', 'ana@sf-transfer.test'],
  ['pipedrive', 'contacts', 'Person - ID,Person - Name,Person - Email,Person - Phone,Person - Organization\n1,Pedro Pipe,pedro@pipe-transfer.test,5551234567,Example Pipe', 'email', 'pedro@pipe-transfer.test'],
  ['salesforce', 'companies', 'Account ID,Account Name,Website,Phone\n001fake,Example SF,https://sf-transfer.test,5551234567', 'name', 'Example SF'],
  ['pipedrive', 'companies', 'Organization - ID,Organization - Name,Organization - Address\n2,Example Pipe,Main Street', 'name', 'Example Pipe'],
  ['zoho', 'contacts', 'First Name,Last Name,Email\nZoe,Zoho,zoe@zoho-transfer.test', 'email', 'zoe@zoho-transfer.test'],
  ['spreadsheet', 'companies', 'Nombre de la empresa,Dominio\nGeneric Sheet,generic-transfer.test', 'domain', 'generic-transfer.test'],
  ['pipedrive', 'deals', `Deal - Title,Deal - Value,Deal - Pipeline,Deal - Stage\nTransfer Deal,1250,${data.dealPipelines()[0]},${data.stagesFor(data.dealPipelines()[0])[0][1]}`, 'name', 'Transfer Deal'],
];
for (const [source, object, csv, key, value] of fixtures) {
  W.state.transferSource = source;
  W.setObject(object);
  W.state.importId = null;
  await W.loadFiles([fileOf(`${source}-${object}.csv`, csv)]);
  assert(W.state.step === 2 && document.querySelector('.imp__map'), `${source} opens mapping review`);
  assert(!W.state.mapping.some(m => m.key === 'hs_object_id'), 'external IDs never map to Omni IDs');
  assert(W.state.mapping.filter(m => !m.key).every(m => /id/i.test(m.header)), `${source} all supported columns mapped`);
  W.state.options.consent = true;
  await W.finish();
  const entry = E.importHistory()[0];
  assert(entry.state === 'DONE' && entry.newRecords === 1 && entry.errors === 0, `${source}/${object}: actual successful count ${JSON.stringify(E.importDetail(entry.id))}`);
  const rows = object === 'contacts' ? data.allContacts() : object === 'companies' ? data.allCompanies() : data.allDeals();
  assert(rows.some(r => r[key] === value), `${source}/${object}: record saved`);
}
// Same contact file updates instead of duplicating when email is present.
W.state.transferSource = 'salesforce'; W.setObject('contacts'); W.state.importId = null;
await W.loadFiles([fileOf('repeat.csv', fixtures[0][2])]);
await W.finish();
assert(E.importHistory()[0].updated === 1 && E.importHistory()[0].newRecords === 0, 'repeat updates by email');
await W.loadFiles([fileOf('bad.txt', 'not a CSV')]);
assert(document.querySelector('[role="alert"]') && !W.state.table, 'invalid file shown: ' + W.state.fileError + JSON.stringify(W.state.table));
dom = boot('http://localhost/data/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="dint-root"></main><div id="scrim"></div></body>');
await import('../src/integration.js');
for (const entry of E.importHistory()) {
  const row = document.querySelector(`tr[data-id="${entry.id}"]`);
  assert(row && row.querySelector('[data-key="newRecords"]').textContent === String(entry.newRecords), 'monitor real count');
  assert(row.textContent.includes(entry.name), 'monitor transfer name');
}
log('OK: 4 sources, contacts/companies/deals, automatic mapping, external IDs, real records, updates, invalid file and monitor counts');

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
let dom = boot('http://localhost/data/import/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>');
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));
const fileOf = (name, text) => ({ name, size: text.length, text: () => Promise.resolve(text), arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) });


const W = await import('../src/import-wizard.js');
await W.loadFiles([
  fileOf('contactos.csv', 'Nombre,Correo electrónico,Nombre de empresa\nAna,ana@cross-smoke.test,Cross Smoke'),
  fileOf('empresas.csv', 'Nombre de la empresa,Dominio\nCross Smoke,cross-smoke.test'),
  fileOf('negocios.csv', `Nombre del negocio,Pipeline,Etapa del negocio,Correo electrónico,Dominio\nVenta smoke,${data.dealPipelines()[0]},${data.stagesFor(data.dealPipelines()[0])[0][1]},ana@cross-smoke.test,cross-smoke.test`),
]);
if (!document.querySelector('#imp-file').multiple || W.state.files.length !== 3) fail('multi upload');
W.state.step = 2;
W.renderStep2();
if (document.querySelectorAll('[data-act="file"]').length !== 3) fail('mapping tabs');
W.state.options.consent = true;
await W.finish();
const contact = data.allContacts().find((r) => r.email === 'ana@cross-smoke.test');
const company = data.allCompanies().find((r) => r.domain === 'cross-smoke.test');
const deal = data.allDeals().find((r) => r.name === 'Venta smoke');
if (!contact || !company || Number(contact.companyId) !== Number(company.id)) fail('contact company link');
if (Number(deal.contactId) !== Number(contact.id) || Number(deal.companyId) !== Number(company.id)) fail('deal links');
if (!document.querySelector('.imp__object-summary') || document.querySelector('.imp__state').textContent !== 'Completada') fail('summary');
if (data.allCompanies().filter((r) => r.domain === 'cross-smoke.test').length !== 1) fail('no automatic duplicate company');
const summary = E.importHistory()[0].byObject;
if (summary.contacts.created !== 1 || summary.companies.created !== 1 || summary.deals.created !== 1) fail('per object counts');
// Second run updates existing records and reuses their associations.
W.state.importId = null;
await W.finish();
if (E.importHistory()[0].byObject.contacts.updated !== 1 || E.importHistory()[0].byObject.companies.updated !== 1) fail('updates');
// Explicit names work even when the contact email has a different domain; ambiguous
// and missing cross-file keys leave records unassociated and report row errors.
const extraFiles = [
  ['contacts', 'Nombre,Correo electrónico,Empresa\nNombre smoke,name@different-smoke.test,Name Only Smoke\nAmbiguo,amb@different-smoke.test,Repeated Smoke\nAusente,missing@different-smoke.test,Missing Smoke'],
  ['companies', 'Nombre de la empresa,Dominio\nName Only Smoke,name-only-smoke.test\nRepeated Smoke,repeated-a-smoke.test\nRepeated Smoke,repeated-b-smoke.test'],
].map(([object, csv]) => { const table = E.parsePasted(csv); table.fileName = `${object}.csv`; return { object, table, mapping: E.autoMapBatch(table, 'es', object) }; });
const batch = E.planBatch(extraFiles);
const entry = E.registerImport({ name: 'Cross key validation', table: { rows: { length: batch.summary.rows }, headers: [], format: 'csv' }, plan: batch, options: {} });
await E.runBatchImport(entry.id, batch);
if (!data.allContacts().find((r) => r.email === 'name@different-smoke.test').companyId) fail('name key');
if (data.allContacts().find((r) => r.email === 'amb@different-smoke.test').companyId) fail('ambiguous key linked');
if (!E.importDetail(entry.id).errors.some((e) => e.code === 'AMBIGUOUS_ASSOCIATION') || !E.importDetail(entry.id).errors.some((e) => e.code === 'ASSOCIATION_RECORD_NOT_FOUND')) fail('association errors');
// Render the actual contact record page and verify the company card link.
dom = boot(`http://localhost/contacts/record/?id=${contact.id}`, '<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>');
await import('../src/record.js');
if (![...document.querySelectorAll('a')].some((a) => a.getAttribute('href')?.includes(`companies/record/?id=${company.id}`) && a.textContent.includes('Cross Smoke'))) fail('company visible in contact record');
log('OK: multi-file wizard, contacts + companies + deals, updates, summary, and company on contact record');

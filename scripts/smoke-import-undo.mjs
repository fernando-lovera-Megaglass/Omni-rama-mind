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

const known = data.allContacts().find((r) => r.email);
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
// Undo survives a new engine instance and never deletes an updated contact.
const undoTable = await E.parseFile(fileOf('undo.csv', ['Nombre,Correo electrónico', ...Array.from({ length: 5 }, (_, i) => `Undo ${i},undo.${i}@example.test`), `Conservado,${known.email}`].join('\n')));
const undoPlan = E.planImport(undoTable, E.autoMap(undoTable.headers, 'es', 'contacts'), { object: 'contacts' });
const undoEntry = E.registerImport({ name: 'Undo CSV', table: undoTable, plan: undoPlan, options: {} });
await E.runImport(undoEntry.id, undoPlan, { sleep: () => Promise.resolve() });
const ledger = JSON.parse(localStorage.getItem(E.DETAIL_KEY(undoEntry.id))).createdIds.contacts;
if (ledger.length !== 5) fail('persist five created ids');
const unchanged = JSON.stringify(data.allContacts().find((r) => Number(r.id) === Number(known.id)));
const reloaded = await import(resolve(here, '../src/import-engine.js') + '?undo-reload');
dom = boot(`http://localhost/data/import/?id=${undoEntry.id}`, '<body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/import-wizard.js') + '?undo-review');
let confirmation = '';
window.confirm = (message) => { confirmation = message; return false; };
click(document.querySelector('[data-act="undo-import"]'));
if (!confirmation.includes('5 registros') || !confirmation.includes('papelera') || !reloaded.undoInfo(undoEntry.id)) fail('undo confirmation/cancel');
window.confirm = () => true;
click(document.querySelector('[data-act="undo-import"]'));
if (data.allContacts().some((r) => ledger.includes(r.id))) fail('created contacts remain in index');
if (data.trashedRecords('contacts').filter((r) => ledger.includes(r.id)).length !== 5) fail('five contacts must be in trash');
if (JSON.stringify(data.allContacts().find((r) => Number(r.id) === Number(known.id))) !== unchanged) fail('updated contact changed during undo');
if (document.querySelector('.imp__state').textContent !== 'Anulada' || document.querySelector('[data-act="undo-import"]')) fail('undone review');
if (reloaded.importDetail(undoEntry.id).timeline.at(-1).note !== 'Anulada por el usuario: 5 registros eliminados') fail('undo timeline');
data.restoreRecords('contacts', ledger);
if (reloaded.undoImport(undoEntry.id) !== false || !data.allContacts().some((r) => ledger.includes(r.id))) fail('repeat undo deleted restored records');
const extraEntry = E.registerImport({ name: 'History undo', table: undoTable, plan: undoPlan, options: {} });
await E.runImport(extraEntry.id, { ...undoPlan, records: [], errors: [] });
dom = boot('http://localhost/data/', '<body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="dint-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/integration.js') + '?undo-history');
const undoneRow = document.querySelector(`tr[data-id="${undoEntry.id}"]`);
if (!undoneRow.textContent.includes('Anulada') || undoneRow.querySelector('[data-undo-import]') || !undoneRow.textContent.includes('Ver detalle')) fail('undone history actions');
const nextUndo = document.querySelector('[data-undo-import]');
if (!nextUndo) fail('real history undo action missing');
const nextId = nextUndo.dataset.undoImport;
click(nextUndo);
if (!E.importHistory().find((r) => Number(r.id) === Number(nextId)).undone) fail('history undo action');
log('OK undo: CSV, confirmation, trash, restore, updated record, reload, review and history');

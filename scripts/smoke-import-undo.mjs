// Import undo acceptance: persisted creation ledger, confirmation, soft deletion,
// restoration, updated contacts, review/history actions and reload protection.
// Run: npm run test:import-undo
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
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
// The ledger also holds the company the e-mail-domain rule created during the import (undo removes it too).
const autoCompanies = JSON.parse(localStorage.getItem(E.DETAIL_KEY(undoEntry.id))).createdIds.companies || [];
const undoTotal = ledger.length + autoCompanies.length;
if (!confirmation.includes(`${undoTotal} registros`) || !confirmation.includes('papelera') || !reloaded.undoInfo(undoEntry.id)) fail('undo confirmation/cancel');
window.confirm = () => true;
click(document.querySelector('[data-act="undo-import"]'));
if (data.allContacts().some((r) => ledger.includes(r.id))) fail('created contacts remain in index');
if (data.trashedRecords('contacts').filter((r) => ledger.includes(r.id)).length !== 5) fail('five contacts must be in trash');
if (JSON.stringify(data.allContacts().find((r) => Number(r.id) === Number(known.id))) !== unchanged) fail('updated contact changed during undo');
if (document.querySelector('.imp__state').textContent !== 'Anulada' || document.querySelector('[data-act="undo-import"]')) fail('undone review');
if (reloaded.importDetail(undoEntry.id).timeline.at(-1).note !== `Anulada por el usuario: ${undoTotal} registros eliminados`) fail('undo timeline');
if (autoCompanies.some((id) => data.allCompanies().some((c) => Number(c.id) === Number(id))) || data.trashedRecords('companies').filter((c) => autoCompanies.map(Number).includes(Number(c.id))).length !== autoCompanies.length) fail('the company created by the import must be in the trash too');
data.restoreRecords('contacts', ledger);
const afterUndoReload = await import(resolve(here, '../src/import-engine.js') + '?after-undo-reload');
if (afterUndoReload.undoImport(undoEntry.id) !== false || data.allContacts().filter((r) => ledger.includes(r.id)).length !== 5) fail('repeat undo deleted restored records');
dom = boot(`http://localhost/data/import/?id=${undoEntry.id}`, '<body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/import-wizard.js') + '?after-undo-review');
if (document.querySelector('.imp__state').textContent !== 'Anulada' || document.querySelector('[data-act="undo-import"]')) fail('reload must preserve undone review');
const historyTable = await E.parseFile(fileOf('history.csv', 'Nombre,Correo electrónico\nHistory,hist.undo@example.test'));
const historyPlan = E.planImport(historyTable, E.autoMap(historyTable.headers, 'es', 'contacts'), { object: 'contacts' });
const extraEntry = E.registerImport({ name: 'History undo', table: historyTable, plan: historyPlan, options: {} });
await E.runImport(extraEntry.id, historyPlan);
const historyIds = E.importDetail(extraEntry.id).createdIds.contacts;
dom = boot('http://localhost/data/', '<body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="dint-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/integration.js') + '?undo-history');
const undoneRow = document.querySelector(`tr[data-id="${undoEntry.id}"]`);
if (!undoneRow.textContent.includes('Anulada') || undoneRow.querySelector('[data-undo-import]') || !undoneRow.textContent.includes('Ver detalle')) fail('undone history actions');
const nextUndo = document.querySelector(`tr[data-id="${extraEntry.id}"] [data-undo-import]`);
if (!nextUndo) fail('real history undo action missing');
const nextId = nextUndo.dataset.undoImport;
click(nextUndo);
if (!E.importHistory().find((r) => Number(r.id) === Number(nextId)).undone) fail('history undo action');
if (data.allContacts().some((r) => historyIds.includes(r.id)) || data.trashedRecords('contacts').filter((r) => historyIds.includes(r.id)).length !== 1) fail('history action must move created contact to trash');
const canceledRow = document.querySelector(`tr[data-id="${extraEntry.id}"]`);
if (!canceledRow.textContent.includes('Anulada') || canceledRow.querySelector('[data-undo-import]')) fail('history must refresh after undo');
log('OK undo: CSV, confirmation, trash, restore, updated record, reload, review and history');

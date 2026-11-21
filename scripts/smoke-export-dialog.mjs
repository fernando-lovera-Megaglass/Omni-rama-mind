// Smoke test for the export dialog of the lists (src/export.js + list.js): «Exportar» opens a modal with the file
// name («<Objeto> - <YYYY-MM-DD>»), the format (CSV / XLSX) and the properties (view columns / every property of
// the object with its label as header); cancelling downloads nothing; the view exported to XLSX with every
// property is a real workbook whose headers are the catalogue labels; the selection exported to CSV with a custom
// name downloads that name with the view columns; the toast keeps «N registro(s) exportados».
// Run: node scripts/smoke-export-dialog.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[export-dialog]', ...a);
const fail = (msg) => { console.error(`[export-dialog] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.HTMLElement.prototype.scrollBy = function () {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
// capture downloads: the blob handed to createObjectURL and the anchor's download name
const downloads = [];
let lastBlob = null;
dom.window.URL.createObjectURL = (b) => { lastBlob = b; return 'blob:x'; };
dom.window.URL.revokeObjectURL = () => {};
const origCreate = document.createElement.bind(document);
document.createElement = (tag) => { const el = origCreate(tag); if (tag === 'a') el.click = () => { downloads.push({ name: el.download, blob: lastBlob }); }; return el; };
const blobBytes = async (b) => Buffer.from(await b.arrayBuffer());

const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const stamp = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

const data = await import(resolve(here, '../src/data.js'));
const P = await import(resolve(here, '../src/properties.js'));
const X = await import(resolve(here, '../src/export.js'));
await import(resolve(here, '../src/contacts.js'));
await wait(40);
click(q('button.views__tab[data-view="std:all"]'));
await wait(20);
const total = () => Number($('total-pill').textContent.split(' ')[0]);
const modal = () => $('bulk-modal');
const form = () => $('bulk-form');

// ---- 1) the dialog: name, format, scope; cancel downloads nothing ----
click(q('#actions-menu [data-action="export"]'));
await wait(10);
if (!modal() || !modal().classList.contains('is-open')) fail('Exportar opens the dialog');
if (text(q('#bulk-modal-title')) !== 'Exportar vista' || form().elements.name.value !== `Contactos - ${stamp}`) fail(`dialog title / default name (${form().elements.name.value})`);
const formats = qa('#bulk-form input[name="format"]').map((i) => i.value);
const scopes = qa('#bulk-form input[name="scope"]').map((i) => i.value);
if (formats.join(',') !== 'csv,xlsx' || scopes.join(',') !== 'view,all' || !q('#bulk-form input[name="format"][value="csv"]').checked || !q('#bulk-form input[name="scope"][value="view"]').checked) fail('format CSV/XLSX and scope view/all radios with their defaults');
const viewLabel = text(q('#bulk-form input[name="scope"][value="view"]').closest('label'));
const allLabel = text(q('#bulk-form input[name="scope"][value="all"]').closest('label'));
const allCount = P.propertyList('contacts').filter((p) => !p.sensitive && !p.archived).length;
if (!/vista actual \(\d+\)/.test(viewLabel) || !allLabel.includes(`(${allCount})`)) fail(`scope labels with counts (${viewLabel} | ${allLabel})`);
click(modal().querySelector('.bmodal__foot [data-bm="close"]'));
await wait(10);
if (modal().classList.contains('is-open') || downloads.length) fail('cancel closes without downloading');
log('dialog: name', `«Contactos - ${stamp}»`, '| formats', formats.join('/'), '| scopes', scopes.join('/'), '| cancel → no download');

// ---- 2) the view to XLSX with every property: a real workbook with label headers ----
const n = total();
click(q('#actions-menu [data-action="export"]'));
await wait(10);
q('#bulk-form input[name="format"][value="xlsx"]').checked = true;
q('#bulk-form input[name="scope"][value="all"]').checked = true;
click($('bulk-ok'));
await wait(300);
if (downloads.length !== 1 || downloads[0].name !== `Contactos - ${stamp}.xlsx`) fail(`xlsx download name (${downloads[0] && downloads[0].name})`);
if (!/exportados a XLSX/.test(text($('toast'))) || !text($('toast')).startsWith(`${n} registro`)) fail(`toast keeps the count (${text($('toast'))})`);
const XLSX = await import('xlsx');
const wb = XLSX.read(await blobBytes(downloads[0].blob), { type: 'buffer' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
const labels = P.propertyList('contacts').filter((p) => !p.sensitive && !p.archived).map((p) => p.label);
if (wb.SheetNames[0] !== 'Contactos' || aoa.length !== n + 1 || aoa[0].length !== labels.length || aoa[0].join('|') !== labels.join('|')) fail(`workbook: sheet ${wb.SheetNames[0]}, ${aoa.length - 1} rows, ${aoa[0].length} columns (expected ${n} / ${labels.length})`);
const nameCol = labels.indexOf('Nombre');
if (nameCol < 0 || !aoa[1][nameCol]) fail('values in the workbook');
log('xlsx (todas las propiedades):', `${aoa.length - 1} filas × ${aoa[0].length} columnas, cabeceras = etiquetas, hoja «${wb.SheetNames[0]}»`);

// ---- 3) the selection to CSV with a custom name: view columns, N rows ----
// select three rows one by one (the table re-renders after each tick, so re-query every time)
for (let i = 0; i < 3; i += 1) {
  const cb = qa('#table tbody tr[data-id]')[i].querySelector('input[type="checkbox"]');
  cb.checked = true; cb.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(10);
}
click(q('[data-action="bulk-export"]'));
await wait(10);
if (!modal().classList.contains('is-open') || !/Exportar 3 contactos/.test(text(q('#bulk-modal-title')))) fail(`selection dialog title (${text(q('#bulk-modal-title'))})`);
form().elements.name.value = 'Mis tres contactos';
click($('bulk-ok'));
await wait(100);
const csv = downloads[downloads.length - 1];
if (downloads.length !== 2 || csv.name !== 'Mis tres contactos.csv') fail(`custom csv name (${csv && csv.name})`);
const textCsv = (await blobBytes(csv.blob)).toString('utf8').replace(/^﻿/, '');
const lines = textCsv.split('\n');
const viewCols = Number(viewLabel.match(/\((\d+)\)/)[1]);
if (lines.length !== 4 || lines[0].split(';').length !== viewCols || !lines[0].includes('"Nombre"')) fail(`csv: ${lines.length - 1} rows, ${lines[0].split(';').length} columns (expected 3 / ${viewCols})`);
if (!text($('toast')).startsWith('3 registro(s) exportados a CSV')) fail(`selection toast (${text($('toast'))})`);
log('csv (selección, nombre propio):', csv.name, '|', `${lines.length - 1} filas × ${lines[0].split(';').length} columnas de la vista`);

// ---- 4) helpers ----
if (X.safeFileName('a/b:c*?.txt') !== 'a b c .txt' || X.safeFileName('   ') !== 'Exportación' || X.defaultExportName('Negocios', new Date(2026, 0, 5)) !== 'Negocios - 2026-01-05') fail('safeFileName / defaultExportName');
console.log('[export-dialog] OK');
process.exit(0);

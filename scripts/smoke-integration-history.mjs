// Smoke test for the import history of Gestión de datos › Integración de datos (src/integration.js): an account
// without imports shows the useful empty state («Aún no has importado datos» + «Importar datos»), never the
// sample rows; after one real import (the engine) the monitor lists exactly that run, its name and its error count
// link to the real review page (./import/?id=<id>), the filters, the search and the column editor work on it, and
// no fictitious file name ever appears. Run: node scripts/smoke-integration-history.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[integration-history]', ...a);
const fail = (msg) => { console.error(`[integration-history] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const PAGE = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="dint-root"></main><div id="scrim"></div></body>';
const useDom = () => { const dom = new JSDOM(PAGE, { url: 'http://localhost/data/', pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const rows = () => qa('#dint-pane tbody tr[data-id]');
const FAKE_NAMES = /contactos_agosto_24|Libro_contactos_17_08|Libro_agosto|Libro_julio|julio_13\.xlsx|junio_29|empresas_junio_22|android-crm-contact-import|informe_junio|Exportacion_0|MAYO_25/;

// ---- an account without imports: the empty state with its call to action, no invented rows ----
useDom();
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/integration.js'));
await wait(10);
if (rows().length) fail('no rows without imports');
const empty = q('#dint-pane tbody .estate');
if (!empty || text(empty.querySelector('.estate__title')) !== 'Aún no has importado datos' || !/Importar datos/.test(text(empty)) || empty.querySelector('a.btn')?.getAttribute('href') !== './import/') fail(`empty state with the CTA (${text(empty)})`);
if (FAKE_NAMES.test(document.body.textContent) || mem['crm:imports']) fail('no sample imports are injected');
if (!/0 importaciones/.test(text(q('.dint__count')))) fail('count says 0');
log('sin importaciones: estado vacío «Aún no has importado datos» con «Importar datos» → ./import/, 0 filas, nada inyectado en crm:imports');

// ---- one real import (the engine): exactly that row, links to its review ----
const E = await import(resolve(here, '../src/import-engine.js'));
const table = E.parsePasted(['Nombre\tApellidos\tCorreo electrónico', 'Hist\tUno\thist.uno@ejemplo.com', 'Hist\tDos\tcorreo-invalido', 'Hist\tTres\thist.tres@ejemplo.com'].join('\n'));
const plan = E.planImport(table, E.autoMap(table.headers, 'es', 'contacts'), { mode: 'create' });
const entry = E.registerImport({ name: 'historial_prueba.csv', table, plan, options: {} });
const run = await E.runImport(entry.id, plan, { sleep: () => Promise.resolve() });
const real = E.importHistory().find((r) => r.id === entry.id);
log(`importación real ${entry.id}: creados ${run.created}, errores ${real.errors}, estado ${real.state}`);
useDom();
await import(resolve(here, `../src/integration.js?after=${Date.now()}`));
await wait(10);
if (rows().length !== 1 || Number(rows()[0].dataset.id) !== entry.id) fail(`exactly the real import (${rows().length})`);
const row = rows()[0];
const nameLink = row.querySelector('td[data-key="name"] a');
if (!nameLink || text(nameLink) !== 'historial_prueba.csv' || nameLink.getAttribute('href') !== `./import/?id=${entry.id}`) fail(`name links to the review (${nameLink && nameLink.getAttribute('href')})`);
const errLink = row.querySelector('td[data-key="errors"] a');
if (real.errors) { if (!errLink || errLink.getAttribute('href') !== `./import/?id=${entry.id}` || text(errLink) !== String(real.errors)) fail(`error count links to the review (${errLink && errLink.getAttribute('href')})`); }
else if (!/--/.test(text(row.querySelector('td[data-key="errors"]')))) fail('no errors → --');
if (q('[data-import], [data-errors]') || qa('#dint-pane a').some((a) => a.getAttribute('href') === '#')) fail('no static modals left');
if (!/Ver detalle/.test(text(row)) || row.querySelector('.menu__item[href="./import/?id=' + entry.id + '"]') === null) fail('actions menu → Ver detalle');
if (FAKE_NAMES.test(document.body.textContent)) fail('no fictitious rows mixed in');
if (!/1 importación\b/.test(text(q('.dint__count')))) fail(`count (${text(q('.dint__count'))})`);
log(`tras la importación: 1 fila «${text(nameLink)}» → ${nameLink.getAttribute('href')}; errores ${real.errors} → mismo destino; sin modales estáticos ni nombres ficticios`);

// ---- filters, search and columns keep working on the real rows ----
const byChip = q('[data-chip="by"]');
click(byChip);
const users = qa('[data-filter="by"]').map((b) => b.dataset.value).filter(Boolean);
if (users.join() !== 'Fernando L.') fail(`user filter lists only real importers (${users.join()})`);
click(q('[data-filter="by"][data-value="Fernando L."]'));
if (rows().length !== 1) fail('filter by user keeps the row');
click(q('[data-filter="system"][data-value="mobile"]'));
if (rows().length || !/No hay importaciones que coincidan/.test(text(q('#dint-pane tbody')))) fail('a filter that excludes everything says so (not the empty-account state)');
click(q('[data-filter="system"][data-value=""]'));
$('dint-q').value = 'historial';
$('dint-q').dispatchEvent(new window.Event('input', { bubbles: true }));
if (rows().length !== 1) fail('search finds the real import');
$('dint-q').value = 'agosto';
$('dint-q').dispatchEvent(new window.Event('input', { bubbles: true }));
if (rows().length) fail('search for a fictitious name finds nothing');
$('dint-q').value = '';
$('dint-q').dispatchEvent(new window.Event('input', { bubbles: true }));
click(q('[data-act="columns"]'));
if (!$('dint-modal').classList.contains('is-open')) fail('column editor opens');
q('#dint-modal-body [data-col="object"]').checked = true;
click($('cols-apply'));
if (!qa('#dint-pane thead th').map(text).includes('Objeto') || text(row.parentElement.querySelector('td[data-key="object"]') || q('#dint-pane tbody td[data-key="object"]')) !== 'Contactos') fail('column editor applies to the real rows');
log('filtros (usuario, sistema), búsqueda y editor de columnas funcionan sobre la importación real');
console.log('[integration-history] OK');
process.exit(0);

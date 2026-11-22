// Smoke test for the end of an import with «Crear un segmento»: the review page's «Ver segmento» links to the
// contacts index with ?view=imp<id>; the index honours ?view=<id> by activating that saved view (tab
// «Importación: …», filter hs_import_ids applied, only the run's records listed), keeps it on reload and ignores an
// unknown id; without a segment the button is not shown. Run: node scripts/smoke-import-segment.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[import-segment]', ...a);
const fail = (msg) => { console.error(`[import-segment] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (html, url) => { const dom = new JSDOM(html, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option', 'CSS']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.HTMLElement.prototype.scrollBy = function () {}; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const WIZ = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>';
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const activeTab = () => text(q('#view-tabs button.views__tab.is-active'));
const rowIds = () => qa('#table tbody tr[data-id]').map((tr) => Number(tr.dataset.id));

useDom(LIST, 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));
// an import of three new contacts with a segment, and one without
const table = E.parsePasted(['Nombre\tApellidos\tCorreo electrónico', 'Seg\tUno\tseg.uno@importada.mx', 'Seg\tDos\tseg.dos@importada.mx', 'Seg\tTres\tseg.tres@importada.mx'].join('\n'));
const plan = E.planImport(table, E.autoMap(table.headers, 'es', 'contacts'), { mode: 'create' });
const entry = E.registerImport({ name: 'Prueba segmento', table, plan, options: { createSegment: true } });
const run = await E.runImport(entry.id, { ...plan, createSegment: true, segmentName: 'Importación: Prueba segmento' }, { sleep: () => Promise.resolve() });
if (run.created !== 3) fail(`three contacts imported (${run.created})`);
const viewId = `imp${entry.id}`;
const imported = data.allContacts().filter((c) => /@importada\.mx$/.test(c.email || '')).map((c) => Number(c.id)).sort();
const store = data.getViewStore('contacts');
const view = store.custom.find((v) => v.id === viewId);
if (!view || view.name !== 'Importación: Prueba segmento' || !store.open.includes(viewId) || !view.advanced.some((c) => c.key === 'hs_import_ids' && String(c.value) === String(entry.id))) fail('the import created its saved view');
const table2 = E.parsePasted(['Nombre\tApellidos\tCorreo electrónico', 'Sin\tSegmento\tsin.segmento@importada.mx'].join('\n'));
const plan2 = E.planImport(table2, E.autoMap(table2.headers, 'es', 'contacts'), { mode: 'create' });
const entry2 = E.registerImport({ name: 'Sin segmento', table: table2, plan: plan2, options: { createSegment: false } });
await E.runImport(entry2.id, { ...plan2, createSegment: false }, { sleep: () => Promise.resolve() });
log(`importación ${entry.id}: 3 contactos, vista «${view.name}» (${viewId}) en el store; importación ${entry2.id} sin segmento`);

// ---- the review page: «Ver segmento» → ../../contacts/?view=imp<id>; no segment → no button ----
useDom(WIZ, `http://localhost/data/import/?id=${entry.id}`);
await import(resolve(here, '../src/import-wizard.js'));
await wait(20);
const seg = qa('.imp__row a').find((a) => text(a) === 'Ver segmento');
const all = qa('.imp__row a').find((a) => text(a) === 'Ver contactos');
if (!seg || seg.getAttribute('href') !== `../../contacts/?view=${viewId}` || !all || all.getAttribute('href') !== '../../contacts/') fail(`review links (${seg && seg.getAttribute('href')} / ${all && all.getAttribute('href')})`);
useDom(WIZ, `http://localhost/data/import/?id=${entry2.id}`);
await import(resolve(here, '../src/import-wizard.js?second'));
await wait(20);
if (qa('.imp__row a').some((a) => text(a) === 'Ver segmento') || !qa('.imp__row a').some((a) => text(a) === 'Ver contactos')) fail('without a segment there is no «Ver segmento»');
log('revisión: «Ver segmento» → ../../contacts/?view=' + viewId + '; «Ver contactos» → índice; sin segmento no hay botón');

// ---- the contacts index with ?view=imp<id>: the tab is active and only the run's records are listed ----
useDom(LIST, `http://localhost/contacts/?view=${viewId}`);
await import(resolve(here, '../src/contacts.js'));
await wait(40);
if (activeTab() !== 'Importación: Prueba segmento') fail(`active tab (${activeTab()})`);
let ids = rowIds().sort();
if (ids.length !== 3 || ids.join() !== imported.join()) fail(`only the run's records (${ids.join()} vs ${imported.join()})`);
if (!qa('#table tbody tr[data-id]').every((tr) => /Seg (Uno|Dos|Tres)/.test(text(tr)))) fail('rows are the imported contacts');
if (data.getViewStore('contacts').active !== viewId) fail('the view is remembered as active');
const chip = qa('.filter-bar, .adv-filters, [data-adv-summary], .filters__summary').map(text).join(' ');
log(`índice con ?view=${viewId}: pestaña «${activeTab()}» activa, ${ids.length} filas (${ids.join(', ')})${chip ? ` · filtros: ${chip.slice(0, 80)}` : ''}`);

// ---- reload keeps the view; an unknown view id is ignored ----
useDom(LIST, `http://localhost/contacts/?view=${viewId}`);
await import(resolve(here, '../src/contacts.js?reload=1'));
await wait(40);
if (activeTab() !== 'Importación: Prueba segmento' || rowIds().length !== 3) fail('reload keeps the view');
// (an unknown id is ignored: the index opens on whatever tab it would open anyway — here the standard view)
const s = data.getViewStore('contacts'); s.open = ['std:all', ...(s.open || []).filter((x) => x !== 'std:all')]; s.active = 'std:all'; data.setViewStore('contacts', s);
useDom(LIST, 'http://localhost/contacts/?view=nope');
await import(resolve(here, '../src/contacts.js?reload=2'));
await wait(40);
if (!activeTab() || activeTab() === 'Importación: Prueba segmento' || rowIds().length <= 3 || data.getViewStore('contacts').active !== 'std:all') fail(`unknown view ignored (${activeTab()} / ${rowIds().length})`);
log(`recarga mantiene la vista; ?view=nope → pestaña «${activeTab()}» con ${rowIds().length} filas`);
console.log('[import-segment] OK');
process.exit(0);

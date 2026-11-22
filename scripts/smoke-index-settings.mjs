// DOM smoke test for Configuración › Objetos › Personalización del índice (the four modules): the «Vista
// predeterminada» select lists the object's real standard views and the chosen one opens first when the list is
// entered (until the person activates a view of their own); «Mostrar el número de registros en cada etapa del
// tablero» really hides / shows the stage counters of the board. Run: node scripts/smoke-index-settings.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'index-settings';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SETTINGS = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>';
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (html, url) => {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el) => el.dispatchEvent(new window.Event('change', { bubbles: true }));
let n = 0;
const openIndexSettings = async (type) => {
  useDom(SETTINGS, `http://localhost/settings/#obj-${type}:index`);
  await import(resolve(here, `../src/settings.js?is=${n++}`));
  await wait(30);
  const sel = q(`select[data-objsetting="defaultView"][data-type="${type}"]`);
  if (!sel) fail(`${type}: «Vista predeterminada» select on the index customisation`);
  return sel;
};
const openList = async (type) => { useDom(LIST, `http://localhost/${type}/`); await import(resolve(here, `../src/${type}.js?is=${n++}`)); await wait(80); };
const activeTab = () => text(q('.views__tab.is-active'));
const objSettings = (type) => JSON.parse(mem[`crm:settings:obj-${type}`] || '{}');

await import(resolve(here, '../src/data.js'));
const { STD_VIEWS } = await import(resolve(here, '../src/std-views.js'));

// 1) the select offers each object's real standard views
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  const sel = await openIndexSettings(type);
  const options = [...sel.options].map((o) => `${o.value}=${o.textContent}`);
  const expected = STD_VIEWS[type].map(([k, l]) => `std:${k}=${l}`);
  if (options.join('|') !== expected.join('|')) fail(`${type}: options are the standard views (${options.join('|')})`);
  if (sel.value !== `std:${STD_VIEWS[type][0][0]}`) fail(`${type}: the first standard view is selected by default (${sel.value})`);
}
log('4 módulos: «Vista predeterminada» ofrece las vistas estándar reales del objeto');

// 2) tickets: choose «Mis tickets» → entering Tickets opens that view
await openList('tickets');
const firstBefore = activeTab();
const sel = await openIndexSettings('tickets');
sel.value = 'std:mine';
change(sel);
if (objSettings('tickets').defaultView !== 'std:mine') fail(`setting saved (${JSON.stringify(objSettings('tickets'))})`);
delete mem['crm:tickets:views']; // the person has not customised their tabs yet
await openList('tickets');
if (activeTab() !== 'Mis tickets') fail(`Tickets opens «Mis tickets» (${activeTab()}; before: ${firstBefore})`);
log(`tickets: vista predeterminada «Mis tickets» → al entrar se abre «${activeTab()}» (antes «${firstBefore}»)`);
// a person who already activated their own view keeps it
click(qa('.views__tab').find((t) => text(t) === 'Todos los tickets'));
await wait(20);
await openList('tickets');
if (activeTab() !== 'Todos los tickets') fail(`a personalised active view wins over the account default (${activeTab()})`);
log('quien ya eligió su vista la conserva («Todos los tickets»)');
// a default that is not among the open tabs is opened as a tab
delete mem['crm:tickets:views'];
mem['crm:tickets:views'] = JSON.stringify({ custom: [], open: ['std:all', 'std:open'], active: null });
await openList('tickets');
if (activeTab() !== 'Mis tickets' || !qa('.views__tab').some((t) => text(t) === 'Mis tickets')) fail('the default view is opened as a tab when it was not open');
log('si la vista predeterminada no estaba abierta, se abre como pestaña');

// 3) deals: untick the board counter → no counters on the board; tick again → back
await openList('deals');
click(q('[data-action="mode-board"]'));
await wait(40);
if (!qa('.kcol__count').length) fail('board counters shown by default');
const n0 = qa('.kcol__count').length;
await openIndexSettings('deals');
const box = q('input[data-objsetting="boardCount"][data-type="deals"]');
if (!box || !box.checked) fail('«Mostrar el número de registros en cada etapa del tablero» ticked by default');
box.checked = false; change(box);
if (objSettings('deals').boardCount !== false) fail('boardCount saved as false');
await openList('deals');
click(q('[data-action="mode-board"]'));
await wait(40);
if (qa('.kcol__count').length || qa('.kcol__vcount').length) fail('counters gone from the board');
if (!qa('.kcol').length) fail('the board still renders its columns');
log(`negocios: casilla desmarcada → ${n0} contadores desaparecen del tablero`);
await openIndexSettings('deals');
const box2 = q('input[data-objsetting="boardCount"][data-type="deals"]');
box2.checked = true; change(box2);
await openList('deals');
click(q('[data-action="mode-board"]'));
await wait(40);
if (qa('.kcol__count').length !== n0) fail('counters back when ticked again');
log('casilla marcada de nuevo → contadores de vuelta');
console.log(`[${TAG}] OK`);
process.exit(0);

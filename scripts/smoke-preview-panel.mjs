// DOM smoke test for the lists' preview panel («Vista previa» ▭ on a row, and on a board card): the button always
// opens the panel with that record and the panel stays open — after the activities load, after a re-render, when
// another row's button is pressed (the panel switches record) and when the same button is pressed again — until
// the person closes it with ×, Escape or «Ver registro». Contacts, companies, deals and tickets; table and board.
// Run: node scripts/smoke-preview-panel.mjs
// Live mode (SMOKE_LIVE=1, docs/smoke-live.md): the same on the real contacts list with server-side paging.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke } from './smoke-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'preview-panel';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const useDom = (url) => {
  const dom = new JSDOM(LIST, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const isOpen = () => $('preview').classList.contains('is-open') && $('preview').getAttribute('aria-hidden') === 'false' && q('.lpage').classList.contains('has-preview');
const shown = () => text($('pv-name'));
let n = 0;
const openList = async (type) => { useDom(`http://localhost/${type}/`); await import(resolve(here, `../src/${type}.js?pp=${n++}`)); await wait(80); };
const rowButton = (i) => qa('#table tbody tr[data-id]')[i]?.querySelector('[data-preview]');
const rowName = (i) => text(qa('#table tbody tr[data-id]')[i]?.querySelector('a[href*="record/"], .firstcell__content') || qa('#table tbody tr[data-id]')[i]);
const untilRows = async (ms = 10000) => { const t0 = Date.now(); while (!qa('#table tbody tr[data-id]').length && Date.now() - t0 < ms) await wait(100); return qa('#table tbody tr[data-id]').length; };

// The scenario every list must pass: open, stay, switch, repeat, close (×, Escape), «Ver registro».
async function exercise(type, data, { live = false } = {}) {
  if (isOpen()) fail(`${type}: the panel starts closed`);
  if (!rowButton(0) || !rowButton(1)) fail(`${type}: two rows with a «Vista previa» button`);
  const id1 = rowButton(0).dataset.preview;
  const id2 = rowButton(1).dataset.preview;
  click(rowButton(0));
  await wait(live ? 1500 : 150); // the activities and tasks of the record arrive, the panel repaints
  if (!isOpen()) fail(`${type}: the panel opens and stays open after the activities load`);
  const rec1 = data.findRecord(type, id1);
  if (!rec1 || shown() !== (rec1.name || `#${rec1.id}`)) fail(`${type}: the panel shows the row's record (${shown()} vs ${rec1 && rec1.name})`);
  if (!$('pv-open') || !$('pv-open').getAttribute('href').endsWith(`record/?id=${id1}`)) fail(`${type}: «Ver registro» points at the record (${$('pv-open') && $('pv-open').getAttribute('href')})`);
  // another row: the panel switches record and stays open (the table is rebuilt when the panel opens: re-query)
  click(rowButton(1));
  await wait(live ? 1500 : 150);
  const rec2 = data.findRecord(type, id2);
  if (!isOpen() || shown() !== (rec2.name || `#${rec2.id}`)) fail(`${type}: pressing another row's button switches the record (${shown()} / open ${isOpen()})`);
  // the same button again: still open, same record
  click(rowButton(1));
  await wait(live ? 800 : 100);
  if (!isOpen() || shown() !== (rec2.name || `#${rec2.id}`)) fail(`${type}: pressing the same button again keeps the panel open`);
  // a re-render of the list (refresh) keeps it; a new activity on the record keeps it too
  click(q('[data-action="refresh"]'));
  await wait(50);
  if (!isOpen() || shown() !== (rec2.name || `#${rec2.id}`)) fail(`${type}: a re-render keeps the panel`);
  if (!live) {
    data.addActivity({ type: 'note', recordType: type, recordId: Number(id2), text: 'Nota desde la prueba', who: 'Tú', when: Date.now() });
    click(q('[data-action="refresh"]'));
    await wait(50);
    if (!isOpen() || !/Nota desde la prueba|Actividades recientes/.test(text($('pv-extra')) + ' ' + text($('preview')))) fail(`${type}: activities reload keeps the panel (${isOpen()})`);
  }
  // closes only when the person asks: ×, then Escape
  click(q('[data-pv="close"]'));
  if (isOpen()) fail(`${type}: × closes the panel`);
  click(rowButton(0));
  await wait(live ? 1200 : 100);
  if (!isOpen()) fail(`${type}: reopens after closing`);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  if (isOpen()) fail(`${type}: Escape closes the panel`);
  return { id1, id2 };
}

// ---- modo live (SMOKE_LIVE=1): the real contacts list with server-side paging ----
await liveSmoke(TAG, async ({ data, check, log }) => {
  useDom('http://localhost/contacts/');
  await import(resolve(here, `../src/contacts.js?pp=${n++}`));
  const rows = await untilRows();
  check(rows > 1, `la lista de contactos trae filas del servidor (${rows})`);
  await exercise('contacts', data, { live: true });
  log('contactos (paginación del servidor): abre, permanece, cambia de registro, mismo botón, ×, Escape');
});

// ---- local mode: the four modules, table and board ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
useDom('http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  await openList(type);
  await exercise(type, data);
  log(`${type} (tabla): abre, permanece tras cargar actividades y re-render, cambia de registro, mismo botón, ×, Escape, «Ver registro»`);
  if (q('[data-action="mode-board"]')) {
    click(q('[data-action="mode-board"]'));
    await wait(40);
    const cardButton = (i) => qa('#kanban .kcard [data-preview]')[i]; // the board is rebuilt on every render: re-query
    if (!cardButton(1)) fail(`${type}: board cards with «Vista previa»`);
    const cid1 = cardButton(0).dataset.preview;
    const cid2 = cardButton(1).dataset.preview;
    click(cardButton(0));
    await wait(150);
    const c1 = data.findRecord(type, cid1);
    if (!isOpen() || shown() !== c1.name) fail(`${type} (tablero): the card's button opens the panel (${shown()})`);
    click(cardButton(1));
    await wait(150);
    const c2 = data.findRecord(type, cid2);
    if (!isOpen() || shown() !== c2.name) fail(`${type} (tablero): another card switches the record`);
    click(qa('#kanban .kcard [data-preview]')[1]);
    await wait(100);
    if (!isOpen()) fail(`${type} (tablero): the same card again keeps the panel open`);
    click(q('[data-pv="close"]'));
    if (isOpen()) fail(`${type} (tablero): × closes`);
    log(`${type} (tablero): abre, cambia de tarjeta, permanece, ×`);
  }
}
console.log(`[${TAG}] OK`);
process.exit(0);

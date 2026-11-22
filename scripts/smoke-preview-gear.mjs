// DOM smoke test: the ⚙ of «Acerca de» on the lists' preview panel opens the editor of THAT panel (layout/?type=X&
// preview=1&from=list), not the table's column editor; the column editor stays in the table's own menu. The editor
// saved from there goes back to the list, and the panel reflects the saved properties. Run: node scripts/smoke-preview-gear.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'preview-gear';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const EDITOR = '<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>';
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
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
let n = 0;
const openList = async (type) => { useDom(LIST, `http://localhost/${type}/`); await import(resolve(here, `../src/${type}.js?pg=${n++}`)); await wait(80); };
const openEditor = async (href) => { useDom(EDITOR, new URL(href, 'http://localhost/contacts/').href); await import(resolve(here, `../src/layout.js?pg=${n++}`)); await wait(20); };
const previewKeys = () => qa('#pv-props .props__row[data-key]').map((r) => r.dataset.key);

await import(resolve(here, '../src/data.js'));
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  await openList(type);
  click(q('[data-preview]'));
  await wait(30);
  const gear = q('#preview #pv-customize');
  if (!gear || gear.tagName !== 'A') fail(`${type}: the preview «Acerca de» gear is a link to the panel editor`);
  const href = gear.getAttribute('href');
  if (href !== `../layout/?type=${type}&preview=1&from=list`) fail(`${type}: gear href (${href})`);
  if (q('#preview [data-action="columns"]')) fail(`${type}: the preview panel still triggers the column editor`);
  if (!q('[data-action="columns"]')) fail(`${type}: «Editar columnas» stays in the table's menu`);
  const drawerBefore = $('columns-drawer').outerHTML.slice(0, 120);
  click(gear);
  await wait(10);
  if ($('columns-drawer').outerHTML.slice(0, 120) !== drawerBefore || q('#columns-drawer.is-open, #columns-drawer[aria-hidden="false"]')) fail(`${type}: clicking the gear opened the column editor`);
}
log('4 listas: el ⚙ de «Acerca de» enlaza al editor del panel (…/layout/?type=X&preview=1&from=list) y no abre el editor de columnas; «Editar columnas» sigue en el menú de la tabla');

// contacts: follow the gear, change a property, save → the panel reflects it; «Salir» goes back to the list
await openList('contacts');
click(q('[data-preview]'));
await wait(30);
const before = previewKeys();
const href = q('#pv-customize').getAttribute('href');
await openEditor(href);
if (!q('.pvedit--single') && !document.title.includes('vista previa')) fail(`the preview-panel editor opened (${document.title})`);
if (q('[data-lc="exit"]').getAttribute('href') !== '../contacts/') fail(`«Salir» goes back to the list (${q('[data-lc="exit"]').getAttribute('href')})`);
click(q('[data-lc="edit"][data-card="about"]'));
const boxes = qa('#l-pp input');
if (!boxes.length) fail('the «Datos generales» property picker opens');
const extra = boxes.find((b) => !b.checked && !before.includes(b.value));
if (!extra) fail('a property not yet shown on the panel');
extra.checked = true;
extra.dispatchEvent(new window.Event('change', { bubbles: true })); // the picker records ticks on change, as a person's click does
click($('l-pp-ok'));
click(q('[data-lc="save"]'));
const saved = JSON.parse(mem['crm:contacts:preview:default'] || 'null');
if (!saved || !saved.props.includes(extra.value)) fail(`the default preview is saved with the property (${saved && saved.props.join()})`);
log(`editor del panel: añadida «${extra.value}» a «Datos generales» y guardado; «Salir» → ../contacts/`);

await openList('contacts');
click(q('[data-preview]'));
await wait(30);
const after = previewKeys();
// the panel now shows exactly the saved properties, in their order (before the save it showed the list's own fields)
if (!after.includes(extra.value) || before.includes(extra.value) || after.join() !== saved.props.join()) fail(`the panel reflects the saved properties (${after.join()} vs ${saved.props.join()})`);
log(`panel de vista previa: ${after.length} propiedades, con «${extra.value}»`);
console.log(`[${TAG}] OK`);
process.exit(0);

// DOM smoke test for the pinned «+» add-column header of the record lists (src/list.js + src/app.css):
// the header cell exists with its button, its computed style is position: sticky / right: 0 (the real
// stylesheet is loaded into jsdom), it stacks above the other header cells but below the frozen columns,
// it works with and without frozen columns, the table width still counts the column and the button opens
// the column editor.
// Run: node scripts/smoke-add-column-sticky.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../src/app.css'), 'utf8');
const dom = new JSDOM(
  `<!doctype html><html><head><style>${css}</style></head><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body></html>`,
  { url: 'http://localhost/contacts/', pretendToBeVisual: true },
);
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
dom.window.confirm = () => true;

await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/contacts.js'));
const $ = (id) => document.getElementById(id);
const cs = (el) => dom.window.getComputedStyle(el);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const log = (...a) => console.log('[add-column-sticky]', ...a);
const fail = (msg) => { console.error(`[add-column-sticky] FAIL: ${msg}`); process.exit(1); };
const prefs = () => JSON.parse(mem['crm:contacts:prefs'] || '{}');
const addTh = () => document.querySelector('#table thead th.table__add');
const z = (el) => Number(cs(el).zIndex) || 0;

if (document.styleSheets[0].cssRules.length < 1000) fail('app.css did not load into the test document');
log('stylesheet rules:', document.styleSheets[0].cssRules.length);

// 1) the «+» header exists, is the last header cell and carries the add-column button
const th = addTh();
if (!th) fail('th.table__add missing');
if (th !== th.parentElement.lastElementChild) fail('the «+» cell must be the last header cell');
const btn = th.querySelector('.table__add-btn[data-action="columns"]');
if (!btn || btn.textContent.trim() !== '+' || btn.getAttribute('aria-label') !== 'Añadir columna') fail('add-column button missing');
log('header «+» found | aria-label:', btn.getAttribute('aria-label'));

// 2) computed style: pinned to the right edge with a solid header background
const st = cs(th);
log('computed: position', st.position, '| right', st.right, '| z-index', st.zIndex, '| background', st.backgroundColor || st.background);
if (st.position !== 'sticky') fail(`position must be sticky, got "${st.position}"`);
if (st.right !== '0px' && st.right !== '0') fail(`right must be 0, got "${st.right}"`);
if (!(z(th) >= 1)) fail('the «+» cell needs a z-index above the other header cells');
const bg = st.backgroundColor || st.background || '';
if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') fail(`the «+» cell needs a solid background, got "${bg}"`);
const plain = document.querySelector('#table thead th.th:not(.fz)');
if (plain && cs(plain).position === 'sticky') fail('regular header cells must not become sticky');
if (plain && z(plain) >= z(th)) fail('the «+» cell must stack above regular header cells');

// 3) with and without frozen columns (jsdom has no layout, so the wrap counts as overflowing)
const wrap = $('table-wrap');
log('overflowing:', wrap.classList.contains('is-overflowing'), '| frozen count:', prefs().frozenCount ?? 0);
if (!wrap.classList.contains('is-overflowing')) fail('expected the overflowing state for the sticky checks');
const freezeToggle = () => document.querySelector('#vsettings-menu [data-action="toggle-freeze"]');
if (document.querySelector('th.th.fz')) click(freezeToggle());
if (document.querySelector('th.th.fz')) fail('could not release the frozen columns');
const noFz = cs(addTh());
if (noFz.position !== 'sticky' || (noFz.right !== '0px' && noFz.right !== '0')) fail('without frozen columns the «+» cell must stay sticky right');
log('no frozen columns → still sticky right');
click(freezeToggle());
const fz = document.querySelector('#table thead th.th.fz');
if (!fz) fail('could not freeze the first column');
const check = document.querySelector('#table thead th.table__check');
log('frozen first column: position', cs(fz).position, '| z', cs(fz).zIndex, '| checkbox column z', cs(check).zIndex, '| «+» z', cs(addTh()).zIndex);
if (cs(fz).position !== 'sticky' || cs(check).position !== 'sticky') fail('frozen columns must be sticky left');
if (!(z(fz) > z(addTh())) || !(z(check) > z(addTh()))) fail('the «+» cell must stack below the frozen columns so it never covers them');
if (cs(addTh()).position !== 'sticky') fail('with frozen columns the «+» cell must stay sticky right');
log('frozen columns → «+» stays sticky and below them');

// 4) the table width still counts the 44 px «+» column and the body cells stay in the normal flow
const colWidths = [...$('colgroup').querySelectorAll('col[data-key]')].map((c) => parseFloat(c.style.width) || 0);
const expectedWidth = 48 + 44 + colWidths.reduce((s, w) => s + w, 0);
log('table width:', $('table').style.width, '| expected (48 + 44 + columns):', `${expectedWidth}px`);
if ($('table').style.width !== `${expectedWidth}px`) fail('the table width no longer matches its columns');
const bodyAdd = document.querySelector('#table tbody td.table__add');
if (!bodyAdd || cs(bodyAdd).position === 'sticky') fail('only the header «+» cell should float');

// 5) the shadow helper classes toggle with the scroll position
Object.defineProperty(wrap, 'scrollWidth', { value: 2000, configurable: true });
Object.defineProperty(wrap, 'clientWidth', { value: 1000, configurable: true });
wrap.scrollLeft = 0;
wrap.dispatchEvent(new dom.window.Event('scroll'));
if (wrap.classList.contains('is-scrolled') || wrap.classList.contains('is-scrolled-end')) fail('at scrollLeft 0 no scroll classes are expected');
wrap.scrollLeft = 300;
wrap.dispatchEvent(new dom.window.Event('scroll'));
if (!wrap.classList.contains('is-scrolled') || wrap.classList.contains('is-scrolled-end')) fail('mid-scroll should mark is-scrolled only');
wrap.scrollLeft = 1000;
wrap.dispatchEvent(new dom.window.Event('scroll'));
if (!wrap.classList.contains('is-scrolled-end')) fail('at the far right the wrap should mark is-scrolled-end');
log('scroll classes: mid → is-scrolled | end → is-scrolled-end');

// 6) the button opens the column editor
click(addTh().querySelector('.table__add-btn'));
const drawer = $('columns-drawer');
log('column editor open:', drawer.classList.contains('is-open'), '| aria-hidden:', drawer.getAttribute('aria-hidden'));
if (!drawer.classList.contains('is-open')) fail('the «+» button must open the column editor');
log('OK');

// Smoke test: every object table of the CRM shares one heading style. Static: src/app.css keeps a single
// `.table thead th` rule (sentence case, weight 400, fs-sm) and no `.table--standard` variant; no module renders
// `table--standard`. DOM: the Llamadas table is a plain `.table` whose header cells have the same structure
// (th.th › .th__inner › .th__label, column menu ⋮, fixed «+») as the Contactos list. Run: node scripts/smoke-table-head-style.mjs
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[table-head]', ...a);
const fail = (msg) => { console.error(`[table-head] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- static ----
const css = readFileSync(resolve(here, '../src/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/\.table--standard[^{]*\{/.test(css)) fail('app.css still defines a .table--standard rule');
const rule = css.match(/\.table thead th \{([^}]*)\}/);
if (!rule) fail('app.css: .table thead th rule missing');
for (const decl of ['text-transform: none', 'font-weight: 400', 'font-size: var(--fs-sm)']) if (!rule[1].includes(decl)) fail(`.table thead th must keep «${decl}»`);
if ((css.match(/\.table thead th \{/g) || []).length !== 1) fail('exactly one .table thead th rule');
if (!/\.table th \{[^}]*height: 44px[^}]*background: var\(--c-head\)/s.test(css) && !/\.table th \{[^}]*background: var\(--c-head\)[^}]*height: 44px/s.test(css)) fail('.table th must keep the 44px --c-head heading box');
const srcDir = resolve(here, '../src');
const users = readdirSync(srcDir).filter((f) => f.endsWith('.js') && readFileSync(resolve(srcDir, f), 'utf8').includes('table--standard'));
if (users.length) fail(`modules still using table--standard: ${users.join(', ')}`);
log('app.css: one .table thead th rule (sentence case, 400, fs-sm) and no .table--standard; no module uses it');

// ---- DOM ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  return dom;
}
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const headShape = (th) => [th.classList.contains('th'), Boolean(th.querySelector('.th__inner .th__label')), Boolean(th.querySelector('.th__more'))].join('/');

useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/');
await import(resolve(here, '../src/contacts.js'));
await wait(30);
const contactsTable = document.querySelector('#table');
const contactsHeads = qa('#table thead th.th');
if (!contactsTable || !contactsHeads.length) fail('contacts table');
const contactsShape = headShape(contactsHeads[0]);
const contactsCase = contactsHeads.map((th) => text(th.querySelector('.th__label')));
if (!contactsCase.every((l) => l && l !== l.toUpperCase())) fail(`contacts headings must be sentence case: ${contactsCase.join(' | ')}`);
log('contacts headings:', contactsCase.slice(0, 4).join(' | '), '| shape', contactsShape, '| add column:', Boolean(document.querySelector('#table th.table__add .table__add-btn')));

useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="calls-root"></main><div id="scrim"></div></body>', 'http://localhost/calls/');
const data = await import(resolve(here, '../src/data.js'));
const contact = data.allContacts()[0];
data.addActivity({ type: 'call', when: Date.now(), who: 'Fernando L.', text: 'Llamada de prueba.', recordType: 'contacts', recordId: contact.id, extra: { direction: 'Saliente', outcome: 'Conectado', durationMin: 2 } });
await import(resolve(here, '../src/calls.js'));
await wait(80);
const callsTable = document.querySelector('#calls-root table.table');
if (!callsTable) fail('calls table');
if (callsTable.classList.contains('table--standard') || callsTable.className !== 'table') fail(`calls table classes: «${callsTable.className}» (must be the plain .table)`);
const callsHeads = qa('#calls-root thead th.th');
if (!callsHeads.length) fail('calls header cells');
const callsCase = callsHeads.map((th) => text(th.querySelector('.th__label')));
if (!callsCase.every((l) => l && l !== l.toUpperCase())) fail(`calls headings must be sentence case in the markup: ${callsCase.join(' | ')}`);
if (headShape(callsHeads[0]) !== contactsShape) fail(`calls header shape ${headShape(callsHeads[0])} ≠ contacts ${contactsShape}`);
if (!document.querySelector('#calls-root th.table__add .table__add-btn') || !callsHeads[0].querySelector('.th__more')) fail('calls keeps the column ⋮ menus and the fixed «+»');
log('calls headings:', callsCase.slice(0, 4).join(' | '), '| same th structure as contacts, ⋮ menus and «+» kept');
console.log('[table-head] OK');
process.exit(0);

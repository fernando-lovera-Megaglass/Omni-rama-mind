// DOM smoke test: the names the layout editor suggests for a new team view agree in gender («Nueva página de
// registro …», «Nueva vista previa de registro …»), in the editor's title / rename prompt and, once saved, in the
// views list of Configuración › Objetos. Existing views keep whatever name they have. Run: node scripts/smoke-team-view-names.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'team-view-names';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const EDITOR = '<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (url) => {
  const dom = new JSDOM(EDITOR, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
let n = 0;
const openEditor = async (type, query) => { useDom(`http://localhost/layout/?type=${type}${query}`); await import(resolve(here, `../src/layout.js?tvn=${n++}`)); await wait(20); };

// static: no masculine «Nuevo …» left for these two feminine nouns
const src = readFileSync(resolve(here, '../src/layout.js'), 'utf8');
if (/Nuevo (vista previa|página)/.test(src)) fail('layout.js still suggests «Nuevo vista previa / Nuevo página»');
log('estático: layout.js sin «Nuevo vista previa…» ni «Nuevo página…»');

await import(resolve(here, '../src/data.js'));
const LD = await import(resolve(here, '../src/layout-defaults.js'));
const SINGULAR = { contacts: 'Contacto', companies: 'Empresa', deals: 'Negocio', tickets: 'Ticket' };
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  // record page team view
  await openEditor(type, '&new=1');
  click(q('[data-lc="rename-view"]'));
  const suggested = $('l-prompt').value;
  if (!new RegExp(`^Nueva página de registro ${SINGULAR[type]} - \\(\\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2}\\)$`).test(suggested)) fail(`${type}: suggested record view name (${suggested})`);
  if (/Nuevo /.test(text(q('.ledit__title')) + ' ' + suggested)) fail(`${type}: masculine «Nuevo» in the editor`);
  click($('l-ok'));
  click(q('[data-lc="save"]'));
  await wait(30); // the editor resolves the author's name before writing
  const saved = LD.loadViewsList(type, 'record');
  if (!saved.some((v) => v.name === suggested)) fail(`${type}: the view is saved with the suggested name (${saved.map((v) => v.name).join(' | ')})`);
  // preview panel team view
  await openEditor(type, '&preview=1&new=1');
  click(q('[data-lc="rename-view"]'));
  const suggestedPv = $('l-prompt').value;
  if (!new RegExp(`^Nueva vista previa de registro ${SINGULAR[type]} - \\(`).test(suggestedPv)) fail(`${type}: suggested preview view name (${suggestedPv})`);
  click($('l-ok'));
  click(q('[data-lc="save"]'));
  await wait(30);
  if (!LD.loadViewsList(type, 'preview').some((v) => v.name === suggestedPv)) fail(`${type}: the preview view is saved with the suggested name`);
  log(`${type}: «${suggested}» · «${suggestedPv}»`);
}
// a view created earlier with the broken name keeps it (no migration)
LD.saveViewsList('contacts', 'record', [{ name: 'Nuevo página de registro Contacto - (01/11/2026 10:00)', teams: [], updated: new Date().toISOString(), by: 'x' }]);
await openEditor('contacts', '&view=Nuevo%20p%C3%A1gina%20de%20registro%20Contacto%20-%20(01%2F11%2F2026%2010%3A00)');
click(q('[data-lc="rename-view"]'));
if ($('l-prompt').value !== 'Nuevo página de registro Contacto - (01/11/2026 10:00)') fail('an existing view keeps its name');
log('las vistas ya creadas conservan su nombre');
console.log(`[${TAG}] OK`);
process.exit(0);

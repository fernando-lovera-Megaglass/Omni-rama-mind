// DOM smoke test for the shared personalization-token picker (src/tokens.js, «Insertar» popover): with the real
// stylesheet loaded into jsdom it checks that the search field exists in both modes (properties and snippets),
// fills the popover width with the height, padding and font of the app's standard form fields (same computed
// values as the template editor's own inputs), that the popover is 400 px wide and still positioned next to its
// anchor inside the viewport, and that searching still filters. Run: node scripts/smoke-token-picker.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[token-picker]', ...a);
const fail = (msg) => { console.error(`[token-picker] FAIL: ${msg}`); process.exit(1); };
const css = readFileSync(resolve(here, '../src/app.css'), 'utf8');
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
const dom = new JSDOM(
  `<!doctype html><html><head><style>${css}</style></head><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="tpl-root"></main><div id="scrim"></div></body></html>`,
  { url: 'http://localhost/templates/', pretendToBeVisual: true },
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
dom.window.confirm = () => true;
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const cs = (el) => dom.window.getComputedStyle(el);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
if (document.styleSheets[0].cssRules.length < 1000) fail('app.css did not load into the test document');

await import(resolve(here, '../src/data.js'));
const T = await import(resolve(here, '../src/templates-data.js'));
await T.ready;
await import(resolve(here, '../src/templates.js'));

// Open the template editor and the «Insertar › Token de personalización» popover
click(q('[data-ta="new-scratch"]'));
if (!$('tpl-modal') || !$('tpl-modal').classList.contains('is-open')) fail('template editor did not open');
const reference = $('tpe-name'); // a standard form field of the editor: the search box must look like it
const refStyle = cs(reference);
log('reference field (template name): height', refStyle.height, '| padding', refStyle.paddingLeft, '| font', refStyle.fontSize, '| radius', refStyle.borderRadius);
click(q('#tpl-modal [data-ins="token"]'));
const pick = q('.tokpick');
if (!pick) fail('token picker did not open');
const pickStyle = cs(pick);
log('popover: width', pickStyle.width, '| max-width', pickStyle.maxWidth, '| left', pick.style.left, '| top', pick.style.top);
if (pickStyle.width !== '400px') fail(`the popover should be 400 px wide, got ${pickStyle.width}`);
const left = parseFloat(pick.style.left);
if (!(left >= 8) || left + 400 > (window.innerWidth || 1024)) fail(`popover left ${pick.style.left} leaves the viewport`);
if (!pick.style.top) fail('popover must be positioned next to its anchor');
if (q('.tokpick__search')) fail('the object step has no search box');

// Property step: the search field exists, fills the width and matches the standard inputs
click(q('.tokpick [data-pick-object="contacto"]'));
const search = q('.tokpick .tokpick__search');
if (!search) fail('search field missing in the property step');
if (search.placeholder !== 'Buscar propiedades de contacto' || search.getAttribute('aria-label') !== 'Buscar propiedades') fail(`search placeholder: ${search.placeholder}`);
if (!search.parentElement.classList.contains('tokpick__searchwrap')) fail('search field must sit in its full-width wrapper');
const s = cs(search);
log('search field: display', s.display, '| width', s.width, '| box-sizing', s.boxSizing, '| height', s.height, '| padding', s.paddingLeft, '| font', s.fontSize, '| radius', s.borderRadius, '| margin', s.marginLeft);
if (s.display !== 'block' || s.width !== '100%' || s.boxSizing !== 'border-box') fail('the search field must fill the popover width');
if (s.height !== '40px') fail(`expected a 40 px high field, got ${s.height}`);
if (s.height !== refStyle.height) fail(`height ${s.height} differs from the standard field ${refStyle.height}`);
if (s.paddingLeft !== refStyle.paddingLeft || s.paddingRight !== refStyle.paddingRight) fail('padding differs from the standard field');
if (s.fontSize !== refStyle.fontSize) fail(`font size ${s.fontSize} differs from the standard field ${refStyle.fontSize}`);
if (s.borderRadius !== refStyle.borderRadius) fail('border radius differs from the standard field');
if (s.borderTopWidth !== refStyle.borderTopWidth && s.borderTopWidth !== '1px') fail('border differs from the standard field');
if (s.marginLeft !== '0px' || s.marginRight !== '0px') fail('the field has no side margins (its wrapper carries the padding)');
const wrapStyle = cs(search.parentElement);
if (wrapStyle.paddingLeft !== '12px' || wrapStyle.paddingRight !== '12px') fail(`wrapper padding: ${wrapStyle.paddingLeft} / ${wrapStyle.paddingRight}`);
if (document.activeElement !== search) fail('the search field should get the focus');
log('property step: search field 100% wide, 40 px high, same padding/font/radius as the template fields');

// It still filters
const before = qa('.tokpick [data-pick-prop]').length;
input(search, 'correo');
const after = qa('.tokpick [data-pick-prop]');
if (!after.length || after.length >= before || !after.every((b) => b.textContent.toLowerCase().includes('correo') || b.dataset.pickProp.includes('correo'))) fail('search did not filter the properties');
log(`search filters: ${before} → ${after.length} properties for "correo"`);
click(q('.tokpick [data-pick="close"]'));
if (q('.tokpick')) fail('picker should close');

// Snippet mode uses the same field
click(q('#tpl-modal [data-ins="snippet"]'));
const snipSearch = q('.tokpick .tokpick__search');
if (!snipSearch || snipSearch.placeholder !== 'Buscar fragmentos') fail('snippet search field missing');
const ss = cs(snipSearch);
if (ss.width !== '100%' || ss.height !== '40px' || ss.fontSize !== refStyle.fontSize || !snipSearch.parentElement.classList.contains('tokpick__searchwrap')) fail('snippet search field must use the same style');
if (cs(q('.tokpick')).width !== '400px') fail('snippet popover width');
log('snippet mode: same full-width 40 px search field');
click(q('.tokpick [data-pick="close"]'));
log('OK');

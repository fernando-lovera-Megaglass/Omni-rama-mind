// Regression: default preview structure and associated mini-cards in all four lists.
// Run: node scripts/smoke-preview-structure.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'preview-structure';
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

const { defaultPreview } = await import('../src/layout-defaults.js');
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  await openList(type);
  click(q('[data-preview]'));
  await wait(50);
  const panel = $('preview');
  if (qa('.preview__quick .quick svg').length !== 6) fail(`${type}: six line-icon actions`);
  if (!q('.preview__body #pv-props') || !q('.preview__body #pv-extra')) fail(`${type}: shared scroll body`);
  if (q('.preview__body #pv-open') || !q('.preview__foot #pv-open')) fail(`${type}: footer outside scroll body`);
  const titles = qa('#pv-extra .pvcard__title').map(text);
  if (titles.length !== defaultPreview(type).right.length - 1 || !titles[0].startsWith('Actividades recientes') || !titles[1].startsWith('Próximas actividades')) fail(`${type}: default activity and association sections (${titles})`);
  if (!q('.pvcard__record a[href*="record/?id="]')) fail(`${type}: linked association mini-cards`);
  if (qa('.pvcard__record a').some(a => a.getAttribute('href').endsWith('id='))) fail(`${type}: no empty association links`);
  if (!qa('#pv-props .props__row').every(row => row.querySelector('dt + dd'))) fail(`${type}: property label before value`);
  log(`${type}: actions, sections, association mini-cards and footer OK`);
}
process.exit(0);

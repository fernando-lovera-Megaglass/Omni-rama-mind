// DOM smoke test: the preview-panel editor (Previsualizar personalización) and its effect on the list's side panel.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const log = (...a) => console.log('[preview-editor]', ...a);

// 1) editor for the default preview panel of deals
const dom = new JSDOM('<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>', { url: 'http://localhost/layout/?type=deals&preview=1' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = storage;
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
dom.window.confirm = () => true;
await import(resolve(here, '../src/layout.js'));
const $ = (s) => document.getElementById(s);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
log('title:', document.querySelector('.ledit__title').textContent.replace(/\s+/g, ' ').trim(), '| exit:', document.querySelector('[data-lc="exit"]').getAttribute('href'));
log('cards:', [...document.querySelectorAll('[data-zone="right"] .lcard .lcard__title')].map((t) => t.textContent.replace('ⓘ', '').trim()).join(' | '), '| mock cards:', document.querySelectorAll('.pvmock__card').length, '| mock props:', document.querySelectorAll('.pvmock__card dl > div').length);
// add a card: the mock updates immediately
const addBtn = document.querySelector('[data-lc="add"][data-card="attachments"]');
click(addBtn);
log('after add mock cards:', document.querySelectorAll('.pvmock__card').length, '| last mock:', [...document.querySelectorAll('.pvmock__card h4')].pop().textContent.trim());
// move "activity" up and remove it
click(document.querySelector('[data-lc="up"][data-card="activity"]'));
log('order after up:', [...document.querySelectorAll('[data-zone="right"] .lcard')].map((c) => c.dataset.card).join(','));
click(document.querySelector('[data-lc="remove"][data-card="activity"]'));
log('mock cards after remove:', document.querySelectorAll('.pvmock__card').length);
// choose properties for "Acerca de"
click(document.querySelector('[data-lc="edit"][data-card="about"]'));
const boxes = [...document.querySelectorAll('#l-pp input')];
boxes.forEach((b) => { b.checked = false; });
boxes.slice(0, 3).forEach((b) => { b.checked = true; });
click($('l-pp-ok'));
log('mock props after pick:', document.querySelectorAll('.pvmock__card dl > div').length);
click(document.querySelector('[data-lc="save"]'));
const savedPv = JSON.parse(mem['crm:deals:preview:default']);
log('saved default preview:', savedPv.right.join(','), '| props:', savedPv.props.length);

// 2) the deals list uses it
const dom2 = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/deals/' });
globalThis.window = dom2.window;
globalThis.document = dom2.window.document;
globalThis.location = dom2.window.location;
globalThis.FormData = dom2.window.FormData;
globalThis.HTMLElement = dom2.window.HTMLElement;
dom2.window.HTMLElement.prototype.scrollBy = function () {};
await import(resolve(here, '../src/deals.js') + '?list');
const click2 = (el) => el.dispatchEvent(new dom2.window.MouseEvent('click', { bubbles: true, cancelable: true }));
click2(document.querySelector('.preview-btn'));
log('list preview props:', document.querySelectorAll('#pv-props .props__row').length, '| extra cards:', [...document.querySelectorAll('#pv-extra .pvcard__title')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
log('OK');

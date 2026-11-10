// DOM smoke test: "Administrar vistas" (default tabs for new users) and its effect on the deals list.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mem = {
  'crm:deals:views': JSON.stringify({ custom: [{ id: 'v1', name: 'Cotizaciones Maru Suministro', owner: 'Fernando L.', share: 'all', filters: {} }, { id: 'v2', name: 'Los Negocios mas Importantes', owner: 'Sofía R.', share: 'team', filters: {} }], open: [], active: null }),
};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const log = (...a) => console.log('[manage-views]', ...a);
const boot = async (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.history = dom.window.history;
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  return dom;
};

let dom = await boot('http://localhost/views/?type=deals&tab=defaults', '<!doctype html><body class="app app--editor"><div id="views-root"></div></body>');
await import(resolve(here, '../src/manage-views.js'));
let click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
log('title:', document.querySelector('.ledit__title').textContent, '| nav:', [...document.querySelectorAll('.mv__nav button')].map((b) => b.textContent).join(' | '), '| save disabled:', document.querySelector('[data-save]').disabled);
log('standard:', document.querySelectorAll('.mv__side .mv__list')[0].querySelectorAll('.mvcheck').length, '| custom:', document.querySelectorAll('.mv__side .mv__list')[1].querySelectorAll('.mvcheck').length, '| default tabs:', [...document.querySelectorAll('.mv__tab span')].map((s) => s.textContent).join(' | '));
// pick a custom view and a standard one, remove one, reorder by drag, save
const pick = (id, on) => { const cb = document.querySelector(`[data-pick="${id}"]`); cb.checked = on; cb.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
pick('v1', true);
pick('std:collab', false);
log('after picks:', [...document.querySelectorAll('.mv__tab span')].map((s) => s.textContent).join(' | '), '| save enabled:', !document.querySelector('[data-save]').disabled);
const dt = { effectAllowed: '', setData() {}, getData() { return ''; } };
const ev = (type, target) => { const e = new dom.window.Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = dt; target.dispatchEvent(e); };
ev('dragstart', document.querySelector('.mv__tab[data-tab="v1"]'));
ev('dragover', document.querySelector('.mv__tab[data-tab="std:mine"]'));
ev('drop', document.querySelector('.mv__tab[data-tab="std:mine"]'));
log('after drag:', [...document.querySelectorAll('.mv__tab span')].map((s) => s.textContent).join(' | '));
click(document.querySelector('[data-save]'));
log('saved defaults:', JSON.parse(mem['crm:deals:defaulttabs']).join(','), '| save disabled again:', document.querySelector('[data-save]').disabled);
// all views tab + delete a custom view, then recently deleted + restore
click(document.querySelector('[data-tab-go="all"]'));
log('all views rows:', document.querySelectorAll('.mvtable tbody tr').length, '| default marks:', document.querySelectorAll('.mvtable .tag--done').length);
click(document.querySelector('[data-del="v2"]'));
log('after delete rows:', document.querySelectorAll('.mvtable tbody tr').length, '| deleted stored:', JSON.parse(mem['crm:deals:deletedviews']).map((v) => v.name).join(','));
click(document.querySelector('[data-tab-go="deleted"]'));
click(document.querySelector('[data-restore="v2"]'));
log('restored:', JSON.parse(mem['crm:deals:views']).custom.map((v) => v.name).join(' | '), '| deleted left:', JSON.parse(mem['crm:deals:deletedviews']).length);

// the deals list opens the saved default tabs for a user without own tabs
dom = await boot('http://localhost/deals/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/deals.js') + '?tabs');
log('list tabs:', [...document.querySelectorAll('button.views__tab')].map((t) => t.textContent.trim()).join(' | '), '| metrics shown:', !document.getElementById('kpis').hidden);
log('OK');

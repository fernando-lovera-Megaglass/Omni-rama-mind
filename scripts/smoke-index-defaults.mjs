// DOM smoke test: default columns and quick filters saved in Configuración › Objetos › Personalización del índice apply to the list.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mem = {
  'crm:companies:defaultcolumns': JSON.stringify(['name', 'industry', 'owner', 'revenue']),
  'crm:companies:quickfilters': JSON.stringify(['owner', 'industry', 'country']),
};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/companies/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
dom.window.HTMLElement.prototype.scrollBy = function () {};
await import(resolve(here, '../src/companies.js'));
const log = (...a) => console.log('[index-defaults]', ...a);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

log('columns:', [...document.querySelectorAll('th.th')].map((t) => t.dataset.key).join(','));
log('quick filters:', [...document.querySelectorAll('.qchip[data-filter]')].map((c) => c.dataset.label).join(' | '));
// the generic "País/Región" filter built from the property has real options and filters rows
const opts = [...document.querySelectorAll('[data-filter="country"][data-value]')].filter((b) => b.dataset.value);
log('country options:', opts.length);
const before = document.querySelectorAll('#rows tr').length;
click(opts[0]);
log('rows before/after country filter:', before, '→', document.querySelectorAll('#rows tr').length, '| chip:', document.querySelector('.qchip[data-filter="country"]').textContent.trim());
log('edit-quick goes to settings:', Boolean(document.querySelector('[data-action="edit-quick"]')));
log('OK');

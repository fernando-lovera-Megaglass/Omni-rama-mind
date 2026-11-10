// DOM smoke test: "Crear vista de equipo" on Previsualizar personalización opens the preview-sidebar editor;
// saving the default preview changes the list's side panel.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const log = (...a) => console.log('[preview-editor]', ...a);
const boot = async (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  return dom;
};
const EDITOR = '<!doctype html><body class="app app--editor"><div id="layout-root"></div></body>';
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';

// 1) new team preview view (what "Crear vista de equipo" opens)
let dom = await boot('http://localhost/layout/?type=deals&preview=1&new=1', EDITOR);
await import(resolve(here, '../src/layout.js') + '?new');
let click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
log('title:', document.querySelector('.ledit__title').textContent.replace(/\s+/g, ' ').trim());
log('tabs hidden:', document.querySelectorAll('.ledit__tabs button').length === 0, '| warning:', Boolean(document.querySelector('.ledit__warn')), '| teams btn:', document.querySelector('[data-lc="teams"]').textContent.trim(), '| exit:', document.querySelector('[data-lc="exit"]').getAttribute('href'));
log('identity:', document.querySelector('.lidentity strong').textContent, '| dots:', document.querySelectorAll('.lidentity__dot').length, '| single column:', Boolean(document.querySelector('.pvedit--single')));
log('cards:', [...document.querySelectorAll('[data-zone="right"] .lcard')].map((c) => `${c.querySelector('.lcard__title').textContent.replace('ⓘ', '').trim()} — ${c.querySelector('.lcard__desc').textContent}`).join(' | '));
log('add menu:', [...document.querySelectorAll('.ladd .menu__item')].map((b) => b.textContent.trim()).join(' | '));
// edit "Datos Generales" properties, reorder, rename view, assign team and save
click(document.querySelector('[data-lc="edit"][data-card="about"]'));
const boxes = [...document.querySelectorAll('#l-pp input')];
boxes.forEach((b) => { b.checked = false; });
boxes.slice(0, 4).forEach((b) => { b.checked = true; });
click(document.getElementById('l-pp-ok'));
click(document.querySelector('[data-lc="down"][data-card="about"]'));
click(document.querySelector('[data-lc="rename-view"]'));
document.getElementById('l-prompt').value = 'Vista previa SACA';
click(document.getElementById('l-ok'));
click(document.querySelector('[data-lc="teams"]'));
document.querySelector('[data-team-m]').checked = true;
click(document.getElementById('l-teams-ok'));
click(document.querySelector('[data-lc="save"]'));
const pviews = JSON.parse(mem['crm:deals:previewviews']);
const saved = JSON.parse(mem['crm:deals:preview:Vista previa SACA']);
log('saved team view:', pviews.map((v) => `${v.name} [${v.teams.join(',')}]`).join(' | '), '| order:', saved.right.join(','), '| props:', saved.props.length, '| warning gone:', !document.querySelector('.ledit__warn'));

// 2) default preview: add a custom property card and save → the deals list uses it
dom = await boot('http://localhost/layout/?type=deals&preview=1', EDITOR);
await import(resolve(here, '../src/layout.js') + '?default');
click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
click(document.querySelector('[data-lc="pv-new-props"]'));
document.getElementById('l-pp-name').value = 'Datos de cierre';
[...document.querySelectorAll('#l-pp input')].forEach((b) => { b.checked = false; });
[...document.querySelectorAll('#l-pp input')].filter((b) => ['closeDate', 'owner'].includes(b.value)).forEach((b) => { b.checked = true; });
click(document.getElementById('l-pp-ok'));
click(document.querySelector('[data-lc="remove"][data-card="assoc-tickets"]'));
click(document.querySelector('[data-lc="save"]'));
const def = JSON.parse(mem['crm:deals:preview:default']);
log('default saved:', def.right.join(','), '| custom:', Object.values(def.cards || {}).map((c) => `${c.label}:${c.props.length}`).join(','));

dom = await boot('http://localhost/deals/', LIST);
await import(resolve(here, '../src/deals.js') + '?list');
click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
click(document.querySelector('.preview-btn'));
log('list preview cards:', [...document.querySelectorAll('#pv-extra .pvcard__title')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()).join(' | '), '| about props:', document.querySelectorAll('#pv-props .props__row').length, '| custom rows:', document.querySelectorAll('#pv-extra .pvcard dl .props__row').length);
log('OK');

// DOM smoke test for the "Ver configuración" gear menu at the right of the list toolbar.
// Run: node scripts/smoke-view-settings.mjs contacts
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const page = process.argv[2] || 'contacts';
const dom = new JSDOM(
  '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>',
  { url: `http://localhost/${page}/` },
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

await import(resolve(here, `../src/${page}.js`));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const log = (...a) => console.log(`[${page}]`, ...a);
const fail = (msg) => { console.error(`[${page}] FAIL: ${msg}`); process.exit(1); };
const items = () => [...$('vsettings-menu').querySelectorAll('.menu__item')].map((b) => `${b.textContent.replace(/\s+/g, ' ').trim()}${b.disabled ? ' (off)' : ''}`);
const prefs = () => JSON.parse(mem[`crm:${page}:prefs`] || '{}');

// the gear button sits in the toolbar with its tooltip and opens the menu
const btn = $('vsettings-btn');
if (!btn || !btn.closest('.ltoolbar__right')) fail('gear button missing from the toolbar');
log('tooltip:', btn.querySelector('.tip__text').textContent, '| has gear icon:', Boolean(btn.querySelector('.ico--gear')));
click(btn);
log('menu open:', $('vsettings').classList.contains('is-open'), '| aria-expanded:', btn.getAttribute('aria-expanded'));
log('items:', items().join(' | '));
log('labels:', [...$('vsettings-menu').querySelectorAll('.vsmenu__label')].map((l) => l.textContent.trim()).join(' | '));
if (items().length < 13) fail('menu is missing options');
if (!items().some((t) => t.includes('Vista en zebra'))) fail('"Vista en zebra" missing from the menu');
if (!items().some((t) => t.startsWith('Guardar vista (off)'))) fail('"Guardar vista" should be disabled on a clean standard view');
if (!items().some((t) => t.startsWith('Cambiar nombre (off)'))) fail('"Cambiar nombre" should be disabled on a standard view');
const links = [...$('vsettings-menu').querySelectorAll('a.menu__item')].map((a) => a.getAttribute('href'));
log('links:', links.join(' | '));
if (!links[0].includes(`views/?type=${page}`) || !links[1].includes(`#obj-${page}:index`)) fail('management links point elsewhere');

// fixed first column toggle
click($('vsettings-menu').querySelector('[data-action="toggle-freeze"]'));
log('frozen after toggle:', $('table').classList.contains('table--frozen'), '| stored:', prefs().frozen, '| menu closed:', !$('vsettings').classList.contains('is-open'));
if (!$('table').classList.contains('table--frozen') || prefs().frozen !== true) fail('freeze toggle did not apply');
log('check mark on:', $('vsettings-menu').querySelector('[data-action="toggle-freeze"] .vsmenu__check').classList.contains('is-on'));
// the column editor opens with the same state
click($('vsettings-menu').querySelector('[data-action="columns"]'));
log('columns drawer open:', $('columns-drawer').classList.contains('is-open'), '| freeze box checked:', $('col-freeze').checked);
if (!$('columns-drawer').classList.contains('is-open') || !$('col-freeze').checked) fail('column editor not in sync');
click($('columns-drawer').querySelector('[data-close="columns-drawer"]'));

// compact rows toggle
click($('vsettings-menu').querySelector('[data-action="toggle-density"]'));
log('compact:', $('table').classList.contains('table--compact'), '| stored density:', prefs().density);
if (!$('table').classList.contains('table--compact') || prefs().density !== 'compact') fail('density toggle did not apply');
click($('vsettings-menu').querySelector('[data-action="toggle-density"]'));
log('back to comfortable:', !$('table').classList.contains('table--compact'), '| stored density:', prefs().density);

// "Mostrar métricas": every list has a metrics card; deals show it by default, the others start hidden
const metricsItem = $('vsettings-menu').querySelector('[data-action="toggle-metrics"]');
log('metrics item present:', Boolean(metricsItem), '| tiles on page:', Boolean($('kpis')));
if (!metricsItem || !$('kpis')) fail('"Mostrar métricas" and the metrics card should exist on every list');
const shownByDefault = page === 'deals';
log('tiles visible by default:', !$('kpis').hidden, '| expected:', shownByDefault, '| check on:', metricsItem.querySelector('.vsmenu__check').classList.contains('is-on'));
if ($('kpis').hidden === shownByDefault) fail('default visibility of the metrics card is wrong');
click(metricsItem);
log('after toggle -> tiles visible:', !$('kpis').hidden, '| stored:', prefs().metrics, '| tiles:', [...document.querySelectorAll('#kpis-track .kpi__label')].map((l) => l.textContent).join(' | '));
if ($('kpis').hidden !== shownByDefault || prefs().metrics !== !shownByDefault) fail('metrics toggle did not flip the card');
if (!$('kpis').hidden && document.querySelectorAll('#kpis-track .kpi').length < 4) fail('the metrics card should show several tiles');
click($('vsettings-menu').querySelector('[data-action="toggle-metrics"]'));
log('toggled back -> tiles visible:', !$('kpis').hidden, '| stored:', prefs().metrics);
if ($('kpis').hidden !== !shownByDefault) fail('metrics toggle did not flip back');

// zebra striping toggle
click($('vsettings-menu').querySelector('[data-action="toggle-zebra"]'));
log('zebra:', $('table').classList.contains('table--zebra'), '| stored zebra:', prefs().zebra, '| check on:', $('vsettings-menu').querySelector('[data-action="toggle-zebra"] .vsmenu__check').classList.contains('is-on'));
if (!$('table').classList.contains('table--zebra') || prefs().zebra !== true) fail('zebra toggle did not apply');
click($('vsettings-menu').querySelector('[data-action="toggle-zebra"]'));
log('zebra off:', !$('table').classList.contains('table--zebra'), '| stored zebra:', prefs().zebra);
if ($('table').classList.contains('table--zebra') || prefs().zebra !== false) fail('zebra toggle did not switch off');

// a filter makes the view dirty: "Restablecer vista" turns on; saving as new makes the view actions available
const filterItem = document.querySelector('.menu__item[data-filter][data-value]:not([data-value=""])');
click(filterItem);
log('dirty -> reset enabled:', !$('vsettings-menu').querySelector('[data-action="view-discard"]').disabled, '| save still off (standard):', $('vsettings-menu').querySelector('[data-action="view-save"]').disabled);
click($('vsettings-menu').querySelector('[data-action="view-saveas"]'));
$('view-form').querySelector('[name="name"]').value = 'Vista desde la rueda';
submit($('view-form'));
log('view label:', $('vsettings-menu').querySelector('.vsmenu__view')?.textContent, '| rename enabled:', !$('vsettings-menu').querySelector('[data-action="view-rename"]').disabled, '| delete enabled:', !$('vsettings-menu').querySelector('[data-action="view-delete"]').disabled);
if ($('vsettings-menu').querySelector('[data-action="view-rename"]').disabled) fail('custom view actions should be enabled');
// change something, then reset from the menu
click(document.querySelector('.menu__item[data-filter][data-value=""]'));
log('dirty again:', !$('view-dirty').hidden);
click($('vsettings-menu').querySelector('[data-action="view-discard"]'));
log('after reset dirty:', !$('view-dirty').hidden);
if (!$('view-dirty').hidden) fail('reset did not restore the saved view');
// delete the view from the menu
click($('vsettings-menu').querySelector('[data-action="view-delete"]'));
log('tabs after delete:', [...document.querySelectorAll('button.views__tab')].map((t) => t.textContent.trim()).join(' | '));

// the collapse chevron keeps its tooltip text in step with the state
click($('collapse-btn'));
log('filters hidden:', $('quickbar').hidden, '| chevron tip:', $('collapse-tip').textContent);
click($('collapse-btn'));
log('filters shown:', !$('quickbar').hidden, '| chevron tip:', $('collapse-tip').textContent);
log('OK');

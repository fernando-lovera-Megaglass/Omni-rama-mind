// DOM smoke test for the deals list: pipeline selector, summary tiles, create prefill.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dom = new JSDOM(
  '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>',
  { url: 'http://localhost/deals/' },
);
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
dom.window.HTMLElement.prototype.scrollBy = function () {};

await import(resolve(here, '../src/deals.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const log = (...a) => console.log('[deals]', ...a);
const rows = () => document.querySelectorAll('#rows tr').length;
const total = () => document.querySelector('.total-pill, .footer__total, #total')?.textContent.trim();

log('pill:', $('pipeline-label').textContent, '| rows page:', rows(), '| total:', total());
log('menu items:', [...document.querySelectorAll('.pmenu__item')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
log('stage cell:', document.querySelector('#rows .stage')?.textContent, '| headers:', [...document.querySelectorAll('th.th')].map((t) => t.dataset.key).join(','));
log('kpis:', [...document.querySelectorAll('.kpi')].map((k) => `${k.querySelector('.kpi__label').textContent}=${k.querySelector('.kpi__value').textContent}`).join(' | '));
// pick a pipeline
click(document.querySelectorAll('.pmenu__item')[2]);
const picked = $('pipeline-label').textContent;
log('picked:', picked, '| rows:', rows(), '| all rows in pipeline:', [...document.querySelectorAll('#rows .stage')].every((s) => s.textContent.includes(picked)), '| stored:', JSON.parse(mem['crm:deals:prefs']).pipeline);
// search in menu
$('pipeline-q').value = 'acris';
$('pipeline-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('search acris:', [...document.querySelectorAll('.pmenu__item span:first-child')].map((s) => s.textContent).join(' | '));
// create: pipeline prefilled
click(document.querySelector('[data-action="create"]'));
log('create pipeline prefill:', $('create-form').elements.pipeline.value === picked);
$('create-form').elements.name.value = 'Negocio prueba pipeline';
$('create-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const created = JSON.parse(mem['crm:deals:extra']).find((d) => d.name === 'Negocio prueba pipeline');
log('created pipeline:', created.pipeline === picked, '| stage label:', created.stage);
// board respects the pipeline
click(document.querySelector('[data-action="mode-board"]'));
log('board cards:', document.querySelectorAll('.kcard').length, '| kpis hidden in board:', $('kpis').hidden);
click(document.querySelector('[data-action="mode-table"]'));
// back to all
$('pipeline-q').value = 'fuerza'; $('pipeline-q').dispatchEvent(new dom.window.Event('input', { bubbles: true })); click(document.querySelector('[data-pipeline="FUERZA DE VENTAS"]')); log('after pick query cleared:', $('pipeline-q').value === '', '| items:', document.querySelectorAll('.pmenu__item').length); click(document.querySelector('[data-pipeline=""]'));
log('all again:', $('pipeline-label').textContent, '| kpis hidden:', $('kpis').hidden);
log('OK');

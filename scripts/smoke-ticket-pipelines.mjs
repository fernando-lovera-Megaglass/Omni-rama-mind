// DOM smoke test: the Tickets list has the pipeline selector of the original (search, all pipelines,
// one pipeline, "Administrar pipelines"), a Pipeline column, and settings manage the ticket pipelines.
// Run: node scripts/smoke-ticket-pipelines.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[ticket-pipelines]', ...a);
const fail = (msg) => { console.error(`[ticket-pipelines] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const boot = (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  return dom;
};
let dom = boot('http://localhost/tickets/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>');
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/tickets.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const rows = () => document.querySelectorAll('tbody tr[data-id]').length;
const total = () => Number($('total-pill').textContent.split(' ')[0]);

log('pipelines:', data.ticketPipelines().join(' | '));
const counts = Object.fromEntries(data.ticketPipelines().map((p) => [p, data.allTickets().filter((t) => t.pipeline === p).length]));
log('tickets per pipeline:', JSON.stringify(counts));
if (Object.values(counts).some((n) => n === 0)) fail('every default pipeline should have tickets');

// the pill sits in the toolbar, right of the search/filters, with the menu of the original
const pill = $('pipeline-pill');
log('pill:', pill?.textContent.trim(), '| in toolbar right:', Boolean(pill?.closest('.ltoolbar__right')), '| search box:', Boolean($('pipeline-q')), '| manage link:', document.querySelector('#pipeline-menu .pmenu__foot a')?.getAttribute('href'));
if (!pill || !pill.closest('.ltoolbar__right')) fail('pipeline pill missing from the tickets toolbar');
if (!document.querySelector('#pipeline-menu .pmenu__foot a')?.getAttribute('href').includes('obj-tickets:pipelines')) fail('manage link should go to the ticket pipelines settings');
const items = () => [...document.querySelectorAll('#pipeline-items .pmenu__item')].map((b) => `${b.querySelector('span').textContent} (${b.querySelector('.pmenu__count').textContent})`);
log('menu items:', items().join(' | '));
if (items().length !== data.ticketPipelines().length + 1 || !items()[0].startsWith('Todos los pipelines')) fail('menu should list every pipeline after "Todos los pipelines"');

// choose a pipeline: the label, the rows and the Pipeline column follow
const before = total();
click(document.querySelector('#pipeline-items [data-pipeline="Cotizaciones"]'));
log('after choosing Cotizaciones ->', total(), 'of', before, '| label:', $('pipeline-label').textContent, '| column tags:', [...new Set([...document.querySelectorAll('tbody td[data-key="pipeline"] .tag')].map((t) => t.textContent.trim()))].join(','));
if (total() !== counts.Cotizaciones || $('pipeline-label').textContent !== 'Cotizaciones') fail('choosing a pipeline should filter the list');
if ([...document.querySelectorAll('tbody td[data-key="pipeline"] .tag')].some((t) => t.textContent.trim() !== 'Cotizaciones')) fail('all visible rows should belong to the chosen pipeline');
log('pipeline column shown by default:', Boolean(document.querySelector('th.th[data-key="pipeline"]')));
if (!document.querySelector('th.th[data-key="pipeline"]')) fail('the Pipeline column should be visible by default');

// search inside the menu, then back to all pipelines
$('pipeline-q').value = 'gar';
$('pipeline-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('search "gar" ->', items().join(' | '));
if (items().length !== 1 || !items()[0].startsWith('Garantías')) fail('menu search should narrow the pipelines');
$('pipeline-q').value = '';
$('pipeline-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
click(document.querySelector('#pipeline-items [data-pipeline=""]'));
log('back to all ->', total(), '| label:', $('pipeline-label').textContent);
if (total() !== before) fail('"Todos los pipelines" should show everything again');

// the board groups by status inside the chosen pipeline
click(document.querySelector('#pipeline-items [data-pipeline="Instalaciones"]'));
click(document.querySelector('[data-action="mode-board"]'));
const cards = document.querySelectorAll('#kanban .kcard').length;
log('board cards for Instalaciones:', cards, '| expected:', counts.Instalaciones);
if (cards !== counts.Instalaciones) fail('board should show only the chosen pipeline');
click(document.querySelector('[data-action="mode-table"]'));

// settings: pipelines table, create one, it appears in the list's menu; remove an empty one
dom = boot('http://localhost/settings/#obj-tickets:pipelines', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/settings.js'));
const form = document.querySelector('form[data-save="ticketpipeline"]');
log('settings pipelines rows:', document.querySelectorAll('[data-ticketpipe-rm]').length, '| create form:', Boolean(form));
if (!form) fail('settings should offer to create ticket pipelines');
form.querySelector('[name="name"]').value = 'Cotizaciones Kafer';
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('after create:', data.ticketPipelines().join(' | '));
if (!data.ticketPipelines().includes('Cotizaciones Kafer')) fail('new pipeline not saved');
const rmBtn = [...document.querySelectorAll('[data-ticketpipe-rm]')].find((b) => !b.disabled);
log('removable (empty) pipeline index:', rmBtn?.dataset.ticketpipeRm);
rmBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
log('after remove:', data.ticketPipelines().join(' | '));
if (data.ticketPipelines().includes('Cotizaciones Kafer')) fail('empty pipeline should be removable');
log('OK');

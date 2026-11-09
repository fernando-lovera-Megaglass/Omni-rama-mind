// DOM smoke test for the record page and its "Acciones" menu. Run: node scripts/smoke-record.mjs contacts 3
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const type = process.argv[2] || 'contacts';
const id = process.argv[3] || '3';
const dom = new JSDOM(
  `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`,
  { url: `http://localhost/${type}/record/?id=${id}` },
);
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
document.body.dataset.type = type;
console.log(`[${type}] body attrs parsed:`, document.body.getAttribute('data-type'));
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true;
dom.window.prompt = () => 'Nuevo Nombre';
dom.window.open = (u) => { console.log(`[${type}] window.open ->`, u); };

await import(resolve(here, '../src/record.js'));
const $ = (s) => document.getElementById(s);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const log = (...a) => console.log(`[${type}]`, ...a);

log('name:', $('rec-name').textContent.trim(), '| props rows:', $('rec-props').children.length, '| assoc cards:', document.querySelectorAll('.assoc-card').length);
const items = [...document.querySelectorAll('#actions-menu .menu__item')].map((b) => b.textContent.trim());
log('acciones:', items.join(' | '));
for (const act of ['follow', 'all-props', 'prop-history', 'assoc-history', 'review-assoc', 'summarize', 'google', 'unsubscribe', 'restore-activity', 'access', 'merge', 'export']) {
  const b = document.querySelector(`#actions-menu [data-act="${act}"]`);
  click(b);
  const modalOpen = $('rec-modal').classList.contains('is-open');
  log(`  ${act}: modal=${modalOpen} title="${$('rec-modal-title').textContent}"`);
  if (modalOpen && act === 'unsubscribe') click(document.querySelector('[data-confirm="unsubscribe"]'));
  if (modalOpen) click(document.querySelector('#rec-modal [data-close]'));
}
log('follow label now:', $('follow-item').textContent);
// inline edit
click(document.querySelector('[data-edit-key]'));
const form = document.querySelector('.props__form');
const el = form.querySelector('[data-edit]');
if (el.tagName === 'SELECT') el.selectedIndex = (el.selectedIndex + 1) % el.options.length; else el.value = 'cambiado';
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('history entries:', JSON.parse(mem[`crm:${type}:history:${id}`] || '[]').length);
// tabs
click(document.querySelector('[data-tab="advanced"]'));
log('all-props groups:', document.querySelectorAll('#all-props .propgrp').length, '| pane hidden?', $('pane-advanced').hidden);
click(document.querySelector('[data-tab="activity"]'));
$('note-form').querySelector('textarea').value = 'Nota de prueba';
$('note-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('timeline items:', $('rec-timeline').children.length);
// "Más" menu
const moreBtn = document.querySelector('.quick__more > button');
click(moreBtn);
log('more menu open:', document.querySelector('.quick__more').classList.contains('is-open'), '| items:', document.querySelectorAll('#more-list .more-item').length);
$('more-search').value = 'cotiz';
$('more-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('search "cotiz" visible items:', [...document.querySelectorAll('#more-list .more-item:not([hidden]) .more-item__label')].map((l) => l.textContent).join(' | '));
$('more-search').value = '';
$('more-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
click(document.querySelector('[data-more="linkedin"]:not([data-sub])'));
log('linkedin submenu open:', document.querySelector('.more-item.has-sub').classList.contains('is-open'));
click(document.querySelector('[data-more="quote"]'));
log('quote modal:', $('rec-modal-title').textContent);
click(document.querySelector('[data-confirm="doc"]'));
log('timeline after quote:', $('rec-timeline').firstElementChild.textContent.replace(/\s+/g, ' ').trim().slice(0, 90));
click(moreBtn);
click(document.querySelector('[data-more="deal"]'));
log('deals extra created:', JSON.parse(mem['crm:deals:extra'] || '[]').length);
click(moreBtn);
click(document.querySelector('[data-more="reorder"]'));
click(document.querySelector('#quick-order .col-item:last-child [data-move="-1"]'));
click(document.querySelector('[data-confirm="reorder"]'));
log('quick order now:', [...document.querySelectorAll('#quick-row > .quick')].map((b) => b.textContent.trim()).join(' | '));

// "+ Agregar" association drawer (companies on a contact)
const addBtn = document.querySelector('[data-act="add-assoc"][data-kind="companies"]') || document.querySelector('[data-act="add-assoc"]');
const addKind = addBtn.dataset.kind;
click(addBtn);
log('assoc drawer open:', !$('assoc-drawer').hidden, '| title:', $('ad-title').textContent, '| rows:', document.querySelectorAll('.ad-row').length, '| count:', document.querySelector('.ad-bar strong').textContent);
$('ad-search').value = 'a';
$('ad-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('after search rows:', document.querySelectorAll('.ad-row').length, '| next disabled:', document.querySelector('[data-ad="next"]').disabled);
const pick = document.querySelector('[data-adpick]');
pick.checked = true;
pick.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('next enabled after pick:', !document.querySelector('[data-ad="next"]').disabled);
click(document.querySelector('[data-ad="next"]'));
log('step 2 title:', $('ad-title').textContent, '| label selects:', document.querySelectorAll('[data-adlabel]').length);
const sel = document.querySelector('[data-adlabel]');
sel.value = 'Principal';
sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
const cardsBefore = document.querySelectorAll('.assoc-card').length;
click(document.querySelector('[data-ad="save"]'));
log('drawer closed:', $('assoc-drawer').hidden, '| assoc cards before/after:', cardsBefore, '/', document.querySelectorAll('.assoc-card').length, '| stored:', JSON.stringify(JSON.parse(mem[`crm:${type}:overrides`])[id][`assoc_${addKind}`]));
click(document.querySelector('[data-act="add-assoc"]'));
click(document.querySelector('[data-adtab="new"]'));
log('create tab title:', $('ad-title').textContent, '| fields:', document.querySelectorAll('#ad-new-form input').length);
click(document.querySelector('[data-ad="close"]'));

// gear: customise the "Acerca de" card
const propsBefore = $('rec-props').children.length;
click(document.querySelector('.card__head--about [data-act="customize-props"]'));
log('card editor:', $('rec-modal-title').textContent, '| groups:', document.querySelectorAll('.cardprops__groups .colgrp').length, '| selected:', document.querySelectorAll('#card-selected .colsel').length);
$('card-search').value = 'ciudad';
$('card-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('search "ciudad" -> options:', [...document.querySelectorAll('.cardprops__groups .colopt span')].map((s) => s.textContent).join(' | '));
const addCb = [...document.querySelectorAll('[data-cardkey]')].find((c) => !c.checked);
if (addCb) { addCb.checked = true; addCb.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
$('card-title').value = 'Información clave';
click(document.querySelector('#card-selected .colsel:last-child [data-cardmove="-1"]'));
click(document.querySelector('[data-confirm="card-save"]'));
log('card title now:', $('about-title').textContent, '| props before/after:', propsBefore, '/', $('rec-props').children.length, '| stored:', mem[`crm:${type}:cardprops`] ? 'yes' : 'no');
click(document.querySelector('.card__head--about [data-act="customize-props"]'));
click(document.querySelector('[data-confirm="card-reset"]'));
log('after reset title:', $('about-title').textContent, '| props:', $('rec-props').children.length);

// association card tools + "Editar tarjeta predeterminada"
const firstAssoc = document.querySelector('.card--assoc');
const akind = firstAssoc.dataset.kind;
log('assoc card tools:', Boolean(firstAssoc.querySelector('[data-acard="search"]')), '| label chips:', firstAssoc.querySelectorAll('.assoc-card__label').length);
click(document.querySelector(`[data-act="acard-edit"][data-kind="${akind}"]`));
log('card drawer open:', !$('card-drawer').hidden, '| title:', $('cd-title').textContent, '| props rows:', document.querySelectorAll('.cd-prop').length, '| add btn:', document.querySelector('.cd-addbtn').textContent.trim());
const addOne = [...document.querySelectorAll('[data-cdadd]')].find((c) => !c.checked && !c.disabled);
addOne.checked = true;
addOne.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('after add rows:', document.querySelectorAll('.cd-prop').length, '| preview lines on first card:', document.querySelectorAll('.cd-previewcard .assoc-card:first-of-type .assoc-card__row').length);
$('cd-name').value = 'Mis negocios';
$('cd-name').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('preview title live:', document.querySelector('.cd-previewcard .card__toggle').textContent);
click(document.querySelector('[data-cddir="1"]'));
click(document.querySelector('[data-cd="save"]'));
log('saved:', mem[`crm:${type}:assoccard:${akind}`], '| card title now:', document.querySelector(`.card--assoc[data-kind="${akind}"] .card__toggle`).textContent.trim());
click(document.querySelector(`[data-acard="search"][data-kind="${akind}"]`));
log('inline search shown:', Boolean(document.querySelector(`[data-acard="q"][data-kind="${akind}"]`)));

// collapse the right column
click($('side-toggle'));
log('side collapsed:', document.querySelector('.record').classList.contains('is-side-collapsed'), '| tip:', $('side-toggle-tip').textContent, '| stored:', mem['crm:record:side']);
click($('side-toggle'));
log('side expanded again:', !document.querySelector('.record').classList.contains('is-side-collapsed'), '| tip:', $('side-toggle-tip').textContent);

// collapse
click(document.querySelector('[data-toggle="about"]'));
log('about collapsed?', document.querySelector('[data-toggle="about"]').closest('.card').classList.contains('is-collapsed'));
log('OK');

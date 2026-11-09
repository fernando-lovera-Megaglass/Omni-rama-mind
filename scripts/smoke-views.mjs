// DOM smoke test for the saved-views flow. Run: node scripts/smoke-views.mjs contacts
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dom = new JSDOM(
  '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>',
  { url: 'http://localhost/contacts/' },
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
dom.window.prompt = () => 'Sofía R.';

const page = process.argv[2] || 'contacts';
await import(resolve(here, `../src/${page}.js`));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const tabs = () => [...document.querySelectorAll('button.views__tab')].map((t) => t.textContent.trim()).join(' | ');
const log = (...a) => console.log(`[${page}]`, ...a);

log('tabs:', tabs());
log('rows:', $('rows').querySelectorAll('tr[data-id]').length, 'total:', $('total-pill').textContent);
log('owner avatars in table:', document.querySelectorAll('td[data-key="owner"] .owner .avatar').length, '| unassigned placeholders:', document.querySelectorAll('td[data-key="owner"] .avatar--empty').length);

const item = document.querySelector('.menu__item[data-filter="owner"][data-value]:not([data-value=""])');
click(item);
log('after filter rows:', $('rows').querySelectorAll('tr[data-id]').length, '| dirty shown:', !$('view-dirty').hidden, '| save hidden (standard):', $('view-save-btn').hidden);

click(document.querySelector('[data-action="view-saveas"]'));
$('view-form').querySelector('[name="name"]').value = 'Mis leads VIP';
$('view-form').querySelector('[name="share"][value="team"]').checked = true;
submit($('view-form'));
log('tabs now:', tabs());
log('dirty after save:', !$('view-dirty').hidden, '| stored custom:', JSON.parse(mem[`crm:${page}:views`]).custom.length);

click(document.querySelector('[data-action="columns"]'));
const cb = [...document.querySelectorAll('#col-groups input[data-key]')].find((c) => !c.checked);
cb.checked = true;
cb.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
click($('columns-apply'));
log('columns applied | dirty:', !$('view-dirty').hidden, '| header cells:', $('head-row').children.length);
click(document.querySelector('[data-action="view-save"]'));
log('saved | dirty:', !$('view-dirty').hidden);

click(document.querySelector('[data-action="view-rename"]'));
$('view-form').querySelector('[name="name"]').value = 'Leads VIP';
submit($('view-form'));
log('renamed tabs:', tabs());

click(document.querySelector('[data-action="allviews"]'));
log('all views rows:', $('allviews-rows').children.length);
click(document.querySelector('#allviews-rows [data-av="clone"]'));
submit($('view-form'));
log('after clone tabs:', document.querySelectorAll('button.views__tab').length);

click(document.querySelector('[data-close-tab]'));
click(document.querySelector('[data-action="view-delete"]'));
log('after close+delete tabs:', tabs());

click(document.querySelectorAll('button.views__tab')[1]);
log('active:', document.querySelector('.views__tab.is-active').textContent.trim(), '| rows:', $('rows').querySelectorAll('tr[data-id]').length);

// row selection and the bulk bar
const firstCheck = document.querySelector('.row-check');
firstCheck.checked = true;
firstCheck.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('one selected -> bulk shown:', !$('bulk').hidden, '|', $('bulk-count').textContent, '| header indeterminate:', $('check-all').indeterminate);
$('check-all').checked = true;
$('check-all').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('select all ->', $('bulk-count').textContent, '| checked rows:', document.querySelectorAll('.row-check:checked').length);
$('check-all').checked = false;
$('check-all').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('deselect all -> bulk hidden:', $('bulk').hidden, '| check cells text:', JSON.stringify(document.querySelector('td.table__check').textContent.trim()));

// preview panel
const pvBtn = document.querySelector('[data-preview]');
click(pvBtn);
log('preview open:', $('preview').classList.contains('is-open'), '| name:', $('pv-name').textContent, '| props:', $('pv-props').children.length, '| link:', $('pv-open').getAttribute('href'));
log('no expand chevrons:', document.querySelectorAll('[data-exp], .table__exp').length === 0);
click(document.querySelector('#preview [data-pv="close"]'));
log('preview closed:', !$('preview').classList.contains('is-open'));
click(document.querySelector('[data-action="toggle-filters"]'));
log('quickbar hidden after toggle:', $('quickbar').hidden, '| filter pill:', $('filter-pill').textContent.trim());
click(document.querySelector('#sort-menu [data-sort]'));
log('sort pill:', $('sort-pill').textContent.trim());
click(document.querySelector('.pager__sizemenu [data-size="50"]'));
log('page size btn:', $('page-size-btn').textContent.trim(), '| rows:', $('rows').querySelectorAll('tr[data-id]').length);

// inline cell editing
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 300, right: 500, top: 200, bottom: 240, width: 200, height: 40 });
const cells = () => [...document.querySelectorAll('td.cell--editable')];
log('editable cells on page:', cells().length);
const phoneTd = cells().find((td) => td.dataset.key === 'phone' || td.dataset.key === 'mobilephone');
const anyTd = phoneTd || cells().find((td) => ['name', 'jobTitle', 'city', 'domain', 'description'].includes(td.dataset.key)) || cells()[1];
click(anyTd);
log('popover open:', !$('cellpop').hidden, '| title:', $('cellpop-title').textContent, '| save disabled:', $('cellpop-save').disabled);
if (phoneTd) {
  $('cp-phone').value = '12';
  $('cp-phone').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  log('invalid phone -> error shown:', !$('cp-err').hidden, '| save disabled:', $('cellpop-save').disabled);
  $('cp-phone').value = '611222333';
  $('cp-ext').value = '4';
  $('cp-phone').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  log('valid phone -> error hidden:', $('cp-err').hidden, '| save enabled:', !$('cellpop-save').disabled);
  click($('cellpop-save'));
  const saved = document.querySelector(`td[data-key="${phoneTd.dataset.key}"][data-id="${phoneTd.dataset.id}"]`);
  log('saved cell text:', saved && saved.textContent.trim());
} else {
  const inp = $('cp-value');
  if (inp.tagName === 'SELECT') inp.selectedIndex = inp.options.length - 1; else inp.value = 'Editado';
  inp.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  inp.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  click($('cellpop-save'));
  const afterGen = document.querySelector(`td[data-key="${anyTd.dataset.key}"][data-id="${anyTd.dataset.id}"]`);
  log('saved generic cell:', afterGen ? afterGen.textContent.trim() : '(row moved by view filter)');
}
const selTd = cells().find((td) => ['status', 'stage', 'priority', 'owner'].includes(td.dataset.key));
if (selTd) {
  click(selTd);
  const sel = $('cp-value');
  log('select editor options:', sel && sel.options.length, '| title:', $('cellpop-title').textContent);
  sel.selectedIndex = 1;
  sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  click($('cellpop-save'));
  const after = document.querySelector(`td[data-key="${selTd.dataset.key}"][data-id="${selTd.dataset.id}"]`);
  log('select saved:', after ? after.textContent.trim() : '(row moved by view filter)', '| popover closed:', $('cellpop').hidden);
}

// column resize by dragging the edge, reorder via header menu, undo
const pointer = (type, target, x, y = 0) => target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
const resizeHandle = document.querySelector('th.th [data-resize]');
const resizeKey = resizeHandle.dataset.resize;
const colBefore = parseInt(document.querySelector(`col[data-key="${resizeKey}"]`).style.width, 10);
pointer('pointerdown', resizeHandle, 100);
pointer('pointermove', document, 160);
pointer('pointerup', document, 160);
const colAfter = parseInt(document.querySelector(`col[data-key="${resizeKey}"]`).style.width, 10);
log('resize', resizeKey, colBefore, '->', colAfter, '| stored:', JSON.parse(mem[`crm:${page}:prefs`]).widths[resizeKey]);
const orderBefore = [...document.querySelectorAll('th.th')].map((t) => t.dataset.key).join(',');
click(document.querySelector('th.th [data-col="right"]:not([disabled])'));
const orderAfter = [...document.querySelectorAll('th.th')].map((t) => t.dataset.key).join(',');
log('move right changed order:', orderBefore !== orderAfter, '| undo enabled:', !$('undo-btn').disabled);
// drag header to move it: pointerdown on 3rd header, move far right, up
const ths = [...document.querySelectorAll('th.th')];
const dragKey = ths[2].dataset.key;
pointer('pointerdown', ths[2].querySelector('.th-sort'), 300, 10);
pointer('pointermove', document, 320, 10);
pointer('pointermove', document, 900, 10);
log('ghost visible during drag:', !$('col-ghost').hidden, '| ghost text:', $('col-ghost').textContent);
pointer('pointerup', document, 900, 10);
const orderDragged = [...document.querySelectorAll('th.th')].map((t) => t.dataset.key);
log('dragged', dragKey, 'now at index', orderDragged.indexOf(dragKey), 'of', orderDragged.length - 1);
click(document.querySelector('th.th [data-col="hide"]:not([disabled])'));
log('after hide columns:', document.querySelectorAll('th.th').length);
click($('undo-btn'));
click($('undo-btn'));
log('after 2 undos columns:', document.querySelectorAll('th.th').length, '| order:', [...document.querySelectorAll('th.th')].map((t) => t.dataset.key).join(','));

// kanban board
click(document.querySelector('[data-action="mode-board"]'));
const cols = [...document.querySelectorAll('.kcol')];
log('board columns:', cols.map((c) => c.querySelector('h2').textContent.trim()).join(' | '));
log('cards:', document.querySelectorAll('.kcard').length, '| table hidden:', $('table-wrap').hidden, '| save btn shown:', !$('board-save-btn').hidden);
const firstCard = document.querySelector('.kcard');
if (firstCard) {
  log('card lines:', firstCard.querySelector('.kcard__lines').textContent.replace(/\s+/g, ' ').trim().slice(0, 100), '| pill:', firstCard.querySelector('.kcard__pill').textContent.replace(/\s+/g, ' ').trim());
  const fromCol = firstCard.closest('.kcol').dataset.group;
  const targetCol = cols.find((c) => c.dataset.group !== fromCol);
  const dt = { effectAllowed: '', setData() {}, getData() { return ''; } };
  const ev = (type, target) => { const e = new dom.window.Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = dt; target.dispatchEvent(e); };
  ev('dragstart', firstCard);
  ev('dragover', targetCol);
  ev('drop', targetCol);
  const moved = document.querySelector(`.kcard[data-id="${firstCard.dataset.id}"]`);
  log('dragged card now in:', moved ? moved.closest('.kcol').dataset.group : '(filtered out)', '| expected:', targetCol.dataset.group);
}
// stage tools: collapse, expand, move, "+ add" prefill
const order0 = [...document.querySelectorAll('.kcol')].map((c) => c.dataset.group);
click(document.querySelector('.kcol__tools [data-kcol-collapse]'));
log('collapsed strips:', document.querySelectorAll('.kcol--collapsed').length, '| vlabel:', document.querySelector('.kcol__vlabel').textContent, '| stored:', JSON.parse(mem['crm:contacts:prefs']).boardCollapsed.join(','));
click(document.querySelector('[data-kcol-expand]'));
log('after expand collapsed:', document.querySelectorAll('.kcol--collapsed').length);
click(document.querySelector('[data-kcol-move="1"]'));
const order1 = [...document.querySelectorAll('.kcol')].map((c) => c.dataset.group);
log('moved right:', order0.slice(0, 2).join(','), '→', order1.slice(0, 2).join(','), '| persisted:', JSON.parse(mem['crm:contacts:prefs']).boardOrder.slice(0, 2).join(','));
click(document.querySelector('[data-kcol-reset]'));
log('reset order:', [...document.querySelectorAll('.kcol')].map((c) => c.dataset.group).join(',') === order0.join(','));
click(document.querySelector('[data-kcol-collapse-others]'));
log('collapse others:', document.querySelectorAll('.kcol--collapsed').length, 'of', document.querySelectorAll('.kcol').length);
click(document.querySelector('[data-kcol-expand-all]'));
log('expand all:', document.querySelectorAll('.kcol--collapsed').length);
const addBtn = document.querySelectorAll('[data-kcol-add]')[2];
click(addBtn);
log('add button label:', addBtn.textContent.trim(), '| drawer open:', $('create-drawer').classList.contains('is-open') || $('create-drawer').getAttribute('aria-hidden') === 'false');
$('create-form').querySelector('[name="first"], [name="name"]').value = 'Prueba Etapa';
const emailIn = $('create-form').querySelector('[name="email"]'); if (emailIn) emailIn.value = 'prueba.etapa@megaglass.us';
$('create-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const created = JSON.parse(mem['crm:contacts:extra'] || '[]').find((r) => String(r.name).includes('Prueba Etapa'));
log('created in stage:', created ? created.lifecycle : '(none)', '| expected:', addBtn.dataset.kcolAdd);
click(document.querySelector('[data-action="mode-table"]'));
log('back to table:', !$('table-wrap').hidden, '| board hidden:', $('kanban').hidden);
// side navigation collapse/expand button
const navBtn = $('nav-collapse');
log('nav button:', navBtn.getAttribute('aria-label'), '| wide:', document.body.classList.contains('app--navwide'));
click(navBtn);
log('after click:', navBtn.getAttribute('aria-label'), '| wide:', document.body.classList.contains('app--navwide'), '| stored:', mem['crm:nav:expanded'], '| tip:', navBtn.querySelector('.tip__text').textContent);
click(navBtn);
log('after second click wide:', document.body.classList.contains('app--navwide'));

// picker: open a closed standard view again
const pick = document.querySelector('.picker__item[data-open-view]');
if (pick) {
  click(pick);
  log('picker opened:', tabs());
}
log('OK');

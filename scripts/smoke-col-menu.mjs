// DOM smoke test for the column header menu (⋮): sort, filter by column, column info,
// conditional highlighting, freeze up to a column, add column, remove column.
// Run: node scripts/smoke-col-menu.mjs
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

const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/contacts.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const log = (...a) => console.log('[col-menu]', ...a);
const fail = (msg) => { console.error(`[col-menu] FAIL: ${msg}`); process.exit(1); };
const th = (key) => document.querySelector(`th.th[data-key="${key}"]`);
const item = (key, act) => th(key).querySelector(`[data-col="${act}"]`);
const prefs = () => JSON.parse(mem['crm:contacts:prefs'] || '{}');
const headers = () => [...document.querySelectorAll('th.th')].map((h) => h.dataset.key);

log('columns:', headers().join(', '));
// the menu of a column lists the original's items in order
const items = [...th('phone').querySelectorAll('.thmenu .menu__item')].map((b) => `${b.textContent.trim()}${b.disabled ? ' (off)' : ''}`);
log('menu:', items.join(' | '));
const expected = ['Orden ascendente', 'Orden descendente', 'Filtrar por esta columna', 'Configura una propiedad inteligente (off)', 'Ver información de la columna', 'Editar resaltado condicional', 'Inmovilizar columna', 'Agregar columna', 'Eliminar columna'];
if (items.join('|') !== expected.join('|')) fail('menu items differ from the original');
log('icons:', th('phone').querySelectorAll('.thmenu .menu__item .ico').length);
click(th('phone').querySelector('.th__more'));
log('menu opens:', th('phone').querySelector('.th__menu').classList.contains('is-open'));

// sorting
click(item('phone', 'asc'));
log('sorted:', document.querySelector('th.is-sorted')?.dataset.key, th('phone').querySelector('.th__sorticon').textContent);
click(item('phone', 'desc'));
log('desc icon:', th('phone').querySelector('.th__sorticon').textContent);

// filter by this column: the advanced filters open with the property preset
click(item('owner', 'filter'));
const preset = document.querySelector('#adv-groups .advc [data-k="key"]');
log('adv drawer open:', $('adv-drawer').classList.contains('is-open'), '| preset property:', preset.value, '| operator:', document.querySelector('#adv-groups .advc [data-k="op"]').value, '| value is a select:', document.querySelector('#adv-groups .advc [data-k="value"]').tagName);
if (!$('adv-drawer').classList.contains('is-open') || preset.value !== 'owner') fail('filter by column did not preset the property');
click($('adv-clear'));
click($('adv-drawer').querySelector('[data-close="adv-drawer"]'));

// column information
click(item('email', 'info'));
const info = $('colinfo-body').textContent.replace(/\s+/g, ' ');
log('info open:', $('colinfo-dialog').classList.contains('is-open'), '| title:', $('colinfo-title').textContent, '|', info.slice(0, 160));
if (!/Nombre interno\s*email/.test(info) || !/Registros con valor/.test(info) || !/Tipo de campo/.test(info)) fail('column info incomplete');
click($('colinfo-dialog').querySelector('[data-close="colinfo-dialog"]'));

// conditional highlighting: phone has a value -> purple cells
click(item('phone', 'highlight'));
log('highlight dialog open:', $('hl-dialog').classList.contains('is-open'), '| column:', $('hl-column').textContent, '| swatches:', document.querySelectorAll('.hl-swatch').length, '| remove hidden:', $('hl-remove').hidden);
$('hl-op').value = 'filled';
$('hl-op').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('value disabled for "tiene valor":', $('hl-value').disabled);
$('hl-form').querySelector('[name="color"][value="purple"]').checked = true;
submit($('hl-form'));
const shown = [...document.querySelectorAll('tbody tr[data-id]')];
const withPhone = shown.filter((tr) => { const id = Number(tr.dataset.id); const r = data.allContacts().find((c) => Number(c.id) === id); return Boolean(r.phone); }).length;
const highlighted = document.querySelectorAll('tbody td.cell--hl[data-key="phone"]').length;
log('highlighted cells:', highlighted, '| rows with phone on the page:', withPhone, '| header coloured:', th('phone').classList.contains('th--hl'), '| stored:', JSON.stringify(prefs().highlights));
if (highlighted !== withPhone || highlighted === 0) fail('highlight did not match the rule');
if (!th('phone').getAttribute('style').includes('#e5e0ff')) fail('header should carry the highlight colour');
// a value rule: owner equals Fernando L. in green
click(item('owner', 'highlight'));
$('hl-op').value = 'is';
$('hl-op').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
$('hl-value').value = 'Fernando L.';
$('hl-form').querySelector('[name="color"][value="green"]').checked = true;
submit($('hl-form'));
const ownerHl = document.querySelectorAll('tbody td.cell--hl[data-key="owner"]').length;
const ownerExpected = shown.filter((tr) => { const id = Number(tr.dataset.id); return data.allContacts().find((c) => Number(c.id) === id).owner === 'Fernando L.'; }).length;
log('owner = Fernando L. highlighted:', ownerHl, '| expected:', ownerExpected);
if (ownerHl !== ownerExpected) fail('value rule mismatch');
// remove the phone rule
click(item('phone', 'highlight'));
log('remove button shown now:', !$('hl-remove').hidden);
click($('hl-remove'));
log('phone highlights after removal:', document.querySelectorAll('tbody td.cell--hl[data-key="phone"]').length, '| rules left:', Object.keys(prefs().highlights).join(','));
if (document.querySelectorAll('tbody td.cell--hl[data-key="phone"]').length) fail('highlight not removed');

// freeze up to the third column, then release it
const third = headers()[2];
click(item(third, 'freeze'));
log('frozen count:', prefs().frozenCount, '| frozen headers:', document.querySelectorAll('th.th.fz').length, '| last marked:', document.querySelector('th.fz--last')?.dataset.key, '| table class:', $('table').classList.contains('table--frozen'));
if (prefs().frozenCount !== 3 || document.querySelectorAll('th.th.fz').length !== 3) fail('freeze up to column failed');
log('offsets:', [...document.querySelectorAll('th.th.fz')].map((h) => h.getAttribute('style')).join(' '));
log('menu label on frozen column:', item(third, 'freeze').textContent.trim(), '| on the next one:', item(headers()[3], 'freeze').textContent.trim());
if (item(third, 'freeze').textContent.trim() !== 'Liberar columna') fail('frozen column should offer to release');
click(item(third, 'freeze'));
log('after release frozen count:', prefs().frozenCount, '| gear toggle shows check:', document.querySelector('#vsettings-menu [data-action="toggle-freeze"] .vsmenu__check').classList.contains('is-on'));
if (prefs().frozenCount !== 2) fail('release should keep the columns to the left frozen');
// the gear toggle switches everything off and the column editor box follows
click(document.querySelector('#vsettings-menu [data-action="toggle-freeze"]'));
log('gear toggle -> frozen count:', prefs().frozenCount, '| frozen headers:', document.querySelectorAll('th.th.fz').length);
if (prefs().frozenCount !== 0) fail('gear toggle should release all');

// add column opens the editor; remove column hides it
click(item('email', 'add'));
log('columns editor open:', $('columns-drawer').classList.contains('is-open'));
if (!$('columns-drawer').classList.contains('is-open')) fail('add column should open the editor');
click($('columns-drawer').querySelector('[data-close="columns-drawer"]'));
const before = headers().length;
click(item('email', 'hide'));
log('after remove:', headers().length, '(was', before, ') | email gone:', !headers().includes('email'));
if (headers().includes('email')) fail('remove column failed');
log('OK');

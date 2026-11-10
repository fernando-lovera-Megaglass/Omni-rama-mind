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

// conditional highlighting: a colour scale over the "Fecha de creación" column (dates count as numbers)
click(item('created', 'highlight'));
log('popover open:', !$('hl-pop').hidden, '| title:', $('hl-title').textContent, '| note:', $('hl-note').textContent);
if ($('hl-pop').hidden) fail('popover should stay open after the menu click');
if (!/todos los datos/.test($('hl-note').textContent)) fail('a date column should be treated as a numeric scale');
log('scale steps:', $('hl-scale').children.length, '| styles:', document.querySelectorAll('.hlstyle').length, '| selected:', document.querySelector('.hlstyle.is-selected')?.dataset.hlStyle, '| ends:', $('hl-pop').querySelector('.hlpop__ends').textContent.trim(), '| remove hidden:', $('hl-remove').hidden);
if ($('hl-scale').children.length !== 5 || document.querySelectorAll('.hlstyle').length !== 9) fail('popover should show a 5-step scale and 9 styles');
const scaleBefore = [...$('hl-scale').children].map((s) => s.style.background).join('|');
click(document.querySelector('.hlstyle[data-hl-style="green"]'));
const scaleAfter = [...$('hl-scale').children].map((s) => s.style.background).join('|');
log('style click updates preview:', scaleBefore !== scaleAfter, '| selected now:', document.querySelector('.hlstyle.is-selected')?.dataset.hlStyle);
if (scaleBefore === scaleAfter) fail('choosing a style should repaint the preview');
click($('hl-pop').querySelector('[data-hl-apply]'));
log('popover closed:', $('hl-pop').hidden, '| stored:', JSON.stringify(prefs().highlights));
if (!prefs().highlights.created || prefs().highlights.created.style !== 'green') fail('highlight style not stored');
const shownRows = [...document.querySelectorAll('tbody tr[data-id]')];
const hlCells = shownRows.map((tr) => tr.querySelector('td[data-key="created"]'));
const colours = [...new Set(hlCells.map((td) => td.style.background))];
log('created cells highlighted:', hlCells.filter((td) => td.classList.contains('cell--hl')).length, 'of', hlCells.length, '| distinct shades on this page:', colours.length, '| header tinted:', th('created').classList.contains('th--hl'));
if (hlCells.some((td) => !td.classList.contains('cell--hl'))) fail('every dated cell should be on the scale');
if (colours.length < 2) fail('the scale should produce more than one shade');
// the newest record (sorted desc by creation) is darkest, the oldest on the page lighter
const shadeIndex = (bg) => [...$('hl-scale').children].findIndex((s) => s.style.background === bg);
click(item('created', 'highlight'));
const first = shadeIndex(hlCells[0].style.background);
const last = shadeIndex(hlCells[hlCells.length - 1].style.background);
log('shade of newest row:', first, '| shade of oldest row on the page:', last, '(0 = darkest)');
if (first > last) fail('higher values should be darker');
// a text column gets a flat highlight on filled cells
click($('hl-pop').querySelector('[data-hl-close]'));
click(item('phone', 'highlight'));
log('text column note:', $('hl-note').textContent);
click($('hl-pop').querySelector('[data-hl-apply]'));
const withPhone = shownRows.filter((tr) => Boolean(data.allContacts().find((c) => Number(c.id) === Number(tr.dataset.id)).phone)).length;
const phoneHl = document.querySelectorAll('tbody td.cell--hl[data-key="phone"]').length;
log('phone highlighted:', phoneHl, '| rows with phone:', withPhone);
if (phoneHl !== withPhone || phoneHl === 0) fail('text column should highlight its filled cells');
// remove the phone highlight
click(item('phone', 'highlight'));
log('remove button shown now:', !$('hl-remove').hidden);
click($('hl-remove'));
log('phone highlights after removal:', document.querySelectorAll('tbody td.cell--hl[data-key="phone"]').length, '| rules left:', Object.keys(prefs().highlights).join(','));
if (document.querySelectorAll('tbody td.cell--hl[data-key="phone"]').length) fail('highlight not removed');
// an old-style rule saved by a previous version is converted to a scale
mem['crm:contacts:prefs'] = JSON.stringify({ ...prefs(), highlights: { owner: { op: 'is', value: 'x', color: 'green' } } });

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

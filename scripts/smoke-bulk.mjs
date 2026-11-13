// DOM smoke test for the bulk selection bar of the lists (the original's): row and page checkboxes, the
// bar with the count and the clear button, highlighted rows, "select the whole view", and the actions
// Asignar, Editar, Eliminar, Crear tareas and Agregar a segmento on contacts, plus Asignar / Editar / Eliminar
// on companies and deals. Run: node scripts/smoke-bulk.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[bulk]', ...a);
const fail = (msg) => { console.error(`[bulk] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; } };
let dom;
const boot = (url) => {
  dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.FormData = dom.window.FormData;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.location = dom.window.location;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  return dom;
};
const $ = (id) => document.getElementById(id);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const check = (cb, on = true) => { cb.checked = on; cb.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
// every tick re-renders the table, so rows are looked up again before each click
const checkRows = (idxs) => idxs.forEach((i) => check(rows()[i].querySelector('.row-check')));
const submitBulk = () => $('bulk-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const total = () => Number($('total-pill').textContent.split(' ')[0]);
const rows = () => [...document.querySelectorAll('#rows tr[data-id]')];
const modalOpen = () => $('bulk-modal')?.classList.contains('is-open');

boot('http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/segments-data.js'));
const C = await import(resolve(here, '../src/contacts.js'));
const list = C.list;

// ---------- selection, bar, highlight ----------
if (!$('bulk').hidden) fail('bar hidden with nothing selected');
checkRows([0, 1]);
log('after 2 rows: bar hidden?', $('bulk').hidden, '| count:', $('bulk-count').textContent, '| highlighted rows:', document.querySelectorAll('#rows tr.is-selected').length, '| actions:', [...document.querySelectorAll('.bulk__btn')].map((b) => b.textContent.trim()).join(' | '));
if ($('bulk').hidden || $('bulk-count').textContent !== '2 contactos seleccionados' || document.querySelectorAll('#rows tr.is-selected').length !== 2) fail('bar and highlight');
if ([...document.querySelectorAll('.bulk__btn')].map((b) => b.textContent.trim()).join('|') !== '→ Asignar|✎ Editar|🗑 Eliminar|+ Crear tareas|≡ Agregar a segmento|↧ Exportar') fail('contact actions');
click(document.querySelector('[data-action="bulk-clear"]'));
if (!$('bulk').hidden || list.state.selected.size) fail('clear');
// page checkbox → offer the whole view
check($('check-all'));
const pageN = rows().length;
log('check-all: selected', list.state.selected.size, 'of page', pageN, '| offer:', $('bulk-all').textContent.trim());
if (list.state.selected.size !== pageN || !/Seleccionar los \d+ contactos de la vista completa/.test($('bulk-all').textContent)) fail('select-all-of-page offer');
click(document.querySelector('[data-action="bulk-select-view"]'));
log('whole view: selected', list.state.selected.size, '| total:', total(), '| bar:', $('bulk-count').textContent, '|', $('bulk-all').textContent.trim());
if (list.state.selected.size !== total() || !/están seleccionados/.test($('bulk-all').textContent)) fail('select whole view');
click(document.querySelector('#bulk-all [data-action="bulk-clear"]'));
if (list.state.selected.size) fail('clear from the offer');

// ---------- Asignar ----------
const ids = rows().slice(0, 3).map((r) => Number(r.dataset.id));
checkRows([0, 1, 2]);
click(document.querySelector('[data-action="bulk-assign"]'));
log('assign dialog:', modalOpen(), '|', $('bulk-modal-title').textContent, '| owners:', $('bulk-form').elements.owner.options.length);
if (!modalOpen() || $('bulk-modal-title').textContent !== 'Asignar 3 contactos') fail('assign dialog');
$('bulk-form').elements.owner.value = 'Laura M.';
submitBulk();
log('after assign: owners', ids.map((id) => data.findRecord('contacts', id).owner).join(','), '| toast:', $('toast').textContent, '| bar hidden:', $('bulk').hidden, '| modal closed:', !modalOpen());
if (ids.some((id) => data.findRecord('contacts', id).owner !== 'Laura M.') || !$('bulk').hidden || modalOpen()) fail('assign');

// ---------- Editar (property + value) ----------
checkRows([0, 1]);
const ids2 = rows().slice(0, 2).map((r) => Number(r.dataset.id));
click(document.querySelector('[data-action="bulk-edit"]'));
const keys = [...$('bulk-form').elements.key.options].map((o) => o.value);
log('edit dialog:', $('bulk-modal-title').textContent, '| properties:', keys.length, '| has city/lifecycle/owner:', ['city', 'lifecycle', 'owner'].every((k) => keys.includes(k)), '| excludes email/name:', !keys.includes('email') && !keys.includes('name'));
if (!keys.includes('city') || !keys.includes('lifecycle') || keys.includes('email')) fail('editable properties');
$('bulk-form').elements.key.value = 'lifecycle';
$('bulk-form').elements.key.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('value field for lifecycle:', $('bulk-form').elements.value.tagName, [...$('bulk-form').elements.value.options || []].length, 'options');
if ($('bulk-form').elements.value.tagName !== 'SELECT') fail('enum property should offer a select');
$('bulk-form').elements.value.value = 'Cliente';
submitBulk();
if (ids2.some((id) => data.findRecord('contacts', id).lifecycle !== 'Cliente')) fail('bulk edit enum');
checkRows([0, 1]);
click(document.querySelector('[data-action="bulk-edit"]'));
$('bulk-form').elements.key.value = 'city';
$('bulk-form').elements.key.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
if ($('bulk-form').elements.value.tagName !== 'INPUT') fail('text property should offer an input');
$('bulk-form').elements.value.value = 'Toledo';
submitBulk();
log('after edit: lifecycle/city', ids2.map((id) => `${data.findRecord('contacts', id).lifecycle}/${data.findRecord('contacts', id).city}`).join(', '));
if (ids2.some((id) => data.findRecord('contacts', id).city !== 'Toledo')) fail('bulk edit text');

// ---------- Crear tareas ----------
const tasksBefore = data.allTasks().length;
checkRows([0, 1]);
click(document.querySelector('[data-action="bulk-tasks"]'));
log('tasks dialog:', $('bulk-modal-title').textContent, '| fields:', [...$('bulk-form').elements].filter((e) => e.name).map((e) => e.name).join(','));
$('bulk-form').elements.title.value = 'Llamar';
$('bulk-form').elements.type.value = 'Llamada';
submitBulk();
const made = data.allTasks().slice(0, 2);
log('tasks created:', data.allTasks().length - tasksBefore, '|', made.map((t) => `${t.name} → contacto ${t.contactId} (${t.type}, ${t.status})`).join(' | '));
if (data.allTasks().length !== tasksBefore + 2 || !made.every((t) => ids2.includes(Number(t.contactId)) && t.type === 'Llamada' && /^Llamar: /.test(t.name))) fail('create tasks');

// ---------- Agregar a segmento (new static segment, then an existing one) ----------
checkRows([0, 1]);
click(document.querySelector('[data-action="bulk-segment"]'));
log('segment dialog:', $('bulk-modal-title').textContent, '| static options:', $('bulk-form').elements.segment.options.length);
$('bulk-form').elements.segment.value = '__new';
$('bulk-form').elements.segment.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
if ($('bulk-seg-name').hidden) fail('name field should show for a new segment');
submitBulk();
if (!modalOpen()) fail('empty name must keep the dialog open');
$('bulk-form').elements.name.value = 'Lista masiva de prueba';
submitBulk();
const seg = S.segments().find((s) => s.name === 'Lista masiva de prueba');
log('new segment:', seg && `${seg.type} · ${seg.object} · miembros ${seg.memberIds.join(',')}`, '| toast:', $('toast').textContent);
if (!seg || seg.type !== 'static' || seg.memberIds.length !== 2 || !ids2.every((id) => seg.memberIds.includes(id))) fail('new static segment');
checkRows([2, 3]);
const ids3 = rows().slice(2, 4).map((r) => Number(r.dataset.id));
click(document.querySelector('[data-action="bulk-segment"]'));
$('bulk-form').elements.segment.value = String(seg.id);
submitBulk();
const seg2 = S.segmentById(seg.id);
log('after adding to existing:', seg2.memberIds.length, 'members');
if (seg2.memberIds.length !== 4 || !ids3.every((id) => seg2.memberIds.includes(id))) fail('add to existing segment');

// ---------- Eliminar (confirmation dialog) ----------
const before = total();
checkRows([0, 1]);
const doomed = rows().slice(0, 2).map((r) => Number(r.dataset.id));
click(document.querySelector('.bulk__actions [data-action="delete"]'));
log('delete dialog:', $('bulk-modal-title').textContent, '| ok:', $('bulk-ok').textContent, '| danger:', $('bulk-ok').classList.contains('btn--danger'));
if ($('bulk-modal-title').textContent !== 'Eliminar 2 contactos' || $('bulk-ok').textContent !== 'Eliminar 2 contactos') fail('delete dialog');
submitBulk();
log('after delete: total', before, '→', total(), '| still present:', doomed.filter((id) => data.findRecord('contacts', id)).length);
if (total() !== before - 2 || doomed.some((id) => data.findRecord('contacts', id))) fail('delete');
// Escape closes a dialog without applying
checkRows([0]);
click(document.querySelector('.bulk__actions [data-action="delete"]'));
document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
if (modalOpen() || total() !== before - 2) fail('Escape should close without deleting');
log('[contacts] OK');

// ---------- companies and deals: assign / edit / delete ----------
for (const [page, noun] of [['companies', 'empresas'], ['deals', 'negocios']]) {
  boot(`http://localhost/${page}/`);
  const P = await import(resolve(here, `../src/${page}.js`));
  const first = rows()[0];
  check(first.querySelector('.row-check'));
  const actions = [...document.querySelectorAll('.bulk__btn')].map((b) => b.textContent.trim());
  log(`${page}: count "${$('bulk-count').textContent}" | actions: ${actions.join(' | ')}`);
  if (!$('bulk-count').textContent.includes(noun.slice(0, -1)) || !actions.some((a) => /Asignar/.test(a)) || !actions.some((a) => /Editar/.test(a)) || !actions.some((a) => /Eliminar/.test(a))) fail(`${page} bar`);
  const id = Number(first.dataset.id);
  click(document.querySelector('[data-action="bulk-assign"]'));
  $('bulk-form').elements.owner.value = 'Sofía R.';
  submitBulk();
  if (data.findRecord(page, id).owner !== 'Sofía R.') fail(`${page} assign`);
  check(rows()[0].querySelector('.row-check'));
  const n0 = total();
  click(document.querySelector('.bulk__actions [data-action="delete"]'));
  submitBulk();
  log(`${page}: assigned ok | delete ${n0} → ${total()}`);
  if (total() !== n0 - 1) fail(`${page} delete`);
  void P;
}
console.log('[bulk] OK');

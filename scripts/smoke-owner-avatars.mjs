// DOM smoke test: owners / user-type properties always render as avatar + name (src/owner.js ownerHtml):
// the owner column of the lists (Contactos, Tareas) including «Sin asignar», the preview panel, the active
// quick-filter chip, the trash dialog, the board card lines, the record page («Acerca de» panel and the access
// dialog), the inbox thread header and the templates list. Run: node scripts/smoke-owner-avatars.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[owner-avatars]', ...a);
const fail = (msg) => { console.error(`[owner-avatars] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  dom.window.prompt = (q, d) => d;
  return dom;
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// An owner element: .owner with its avatar (initials, or the grey placeholder for «Sin asignar») and the name.
const checkOwner = (el, where, expectName) => {
  if (!el || !el.classList.contains('owner')) fail(`${where}: no .owner element`);
  const av = el.querySelector('.avatar');
  if (!av) fail(`${where}: .owner without .avatar`);
  const name = el.querySelector('.owner__name');
  if (!name) fail(`${where}: .owner without its name`);
  if (el.firstElementChild !== av) fail(`${where}: the avatar must come first (left of the name)`);
  const unassigned = !expectName || expectName === 'Sin asignar';
  if (unassigned) {
    if (!el.classList.contains('owner--none') || !av.classList.contains('avatar--empty') || text(name) !== 'Sin asignar') fail(`${where}: unassigned owner must show the placeholder avatar and «Sin asignar»`);
  } else {
    if (text(name) !== expectName) fail(`${where}: expected ${expectName}, got ${text(name)}`);
    const ini = expectName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    if (text(av) !== ini || !/background:\s*#/.test(av.getAttribute('style') || '')) fail(`${where}: avatar must carry the initials ${ini} with a colour`);
  }
};
const sizeOf = (el) => [...el.querySelector('.avatar').classList].find((c) => c.startsWith('avatar--') && c !== 'avatar--empty');

// ===== 1) Contactos list: owner column (xs), unassigned included, preview panel, chip, trash, board =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/contacts.js'));
const cells = qa('#table tbody td[data-key="owner"]');
if (!cells.length) fail('no owner cells in the contacts list');
cells.forEach((td) => { const id = td.dataset.id; const rec = data.findRecord('contacts', id); checkOwner(td.querySelector('.owner'), `contacts row ${id}`, rec.owner); if (sizeOf(td.querySelector('.owner')) !== 'avatar--xs') fail('table cells use the xs avatar'); });
const unassignedCells = cells.filter((td) => td.querySelector('.owner--none'));
log(`contacts list: ${cells.length} owner cells with avatar (${unassignedCells.length} «Sin asignar» with the placeholder)`);
if (!unassignedCells.length) {
  const first = data.findRecord('contacts', cells[0].dataset.id);
  data.setField('contacts', first.id, 'owner', 'Sin asignar');
}
// quick filter chip keeps the avatar
click(q('.qchip[data-filter="owner"]'));
click(q('[data-filter="owner"][data-value="Sofía R."]'));
const chip = q('.qchip[data-filter="owner"]');
if (!chip.classList.contains('is-set')) fail('owner quick filter not applied');
checkOwner(chip.querySelector('.owner'), 'quick-filter chip', 'Sofía R.');
if (!text(chip).startsWith('Propietario del contacto:')) fail(`chip label: ${text(chip)}`);
log('quick-filter chip: «Propietario del contacto:» + avatar + Sofía R.');
qa('#table tbody td[data-key="owner"]').forEach((td) => checkOwner(td.querySelector('.owner'), 'filtered row', 'Sofía R.'));
click(q('.qchip__x[data-filter-clear="owner"]'));
// trash dialog: delete a contact, then «Restaurar registros eliminados»
const victim = data.findRecord('contacts', qa('#table tbody tr[data-id]')[1].dataset.id);
data.deleteRecords('contacts', [victim.id]);
click(q('[data-action="trash"]'));
await wait(10);
const trashRow = qa('.trash__table tbody tr').find((r) => Number(r.dataset.id) === Number(victim.id));
if (!trashRow) fail('deleted contact missing from the trash dialog');
checkOwner(trashRow.querySelector('.owner'), 'trash dialog', victim.owner);
log('trash dialog: owner column with avatar');
data.restoreRecords('contacts', [victim.id]);
click(q('[data-close="actions-drawer"]'));
// board cards: the owner line carries the avatar too
click(q('[data-action="mode-board"]'));
await wait(10);
const cardLine = qa('.kcard__lines > div').find((d) => text(d).startsWith('Propietario del contacto'));
if (!cardLine) fail('board card has no owner line');
checkOwner(cardLine.querySelector('.owner'), 'board card line', cardLine.closest('.kcard') && data.findRecord('contacts', cardLine.closest('.kcard').dataset.id).owner);
log('board card: «Propietario del contacto:» + avatar + name');

// ===== 2) Tareas list: «Asignada a» column =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/tasks/');
await import(resolve(here, '../src/tasks.js'));
const taskCells = qa('#table tbody td[data-key="owner"]');
if (!taskCells.length) fail('no owner cells in the tasks list');
taskCells.forEach((td) => checkOwner(td.querySelector('.owner'), `tasks row ${td.dataset.id}`, data.findRecord('tasks', td.dataset.id).owner));
log(`tasks list: ${taskCells.length} «Asignada a» cells with avatar`);
// preview panel («Acerca de» props use the sm avatar; the contacts preview follows the person's own field list, which has no owner)
click(q('.preview-btn'));
const pvRow = qa('#pv-props .props__row').find((r) => text(r.querySelector('dt')).startsWith('Asignada a'));
if (!pvRow) fail('tasks preview panel has no owner row');
const pvId = q('#table tbody tr[data-id]').dataset.id;
checkOwner(pvRow.querySelector('dd .owner'), 'preview panel', data.findRecord('tasks', pvId).owner);
if (sizeOf(pvRow.querySelector('dd .owner')) !== 'avatar--sm') fail('preview panel uses the sm avatar');
log('preview panel: «Asignada a» row with the sm avatar');

// ===== 3) Record page: «Acerca de» panel (sm) and the access dialog =====
// Access lists the actual record owner and persisted active administrators.
data.setField('contacts', 3, 'owner', 'Fernando L.');
localStorage.setItem('crm:users', JSON.stringify([
  { name: 'Fernando L.', role: 'Usuario', status: 'Activo' },
  { name: 'Sofía R.', role: 'Administrador', status: 'Activo' },
]));
useDom('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/record/?id=3');
document.body.dataset.type = 'contacts';
await import(resolve(here, '../src/record.js'));
const recRow = qa('#rec-props .props__row').find((r) => text(r.querySelector('dt')).startsWith('Propietario'));
if (!recRow) fail('record «Acerca de» panel has no owner row');
checkOwner(recRow.querySelector('dd .owner'), 'record panel', data.findRecord('contacts', 3).owner);
if (sizeOf(recRow.querySelector('dd .owner')) !== 'avatar--sm') fail('record panel uses the sm avatar');
click(q('#actions-menu [data-act="access"]'));
const accessOwners = qa('#rec-modal .mini-table .owner');
if (accessOwners.length < 2) fail('access dialog users must render as owners');
checkOwner(accessOwners[0], 'access dialog', 'Fernando L.');
checkOwner(accessOwners[1], 'access dialog administrator', 'Sofía R.');
click(q('#rec-modal [data-close]'));
log('record page: «Acerca de» owner row (sm) and access dialog users with avatar');

// ===== 4) Inbox: the thread header shows the assignee as an owner =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="inbox-root"></main><div id="scrim"></div></body>', 'http://localhost/inbox/');
const Conv = await import(resolve(here, '../src/conversations-data.js'));
await Conv.ready;
await import(resolve(here, '../src/inbox.js'));
await wait(10);
click(q('.inbox__item .inbox__itembtn'));
const conv = Conv.conversationById(q('.inbox__item.is-active').dataset.id);
const sub = q('.inbox__threadsub');
checkOwner(sub.querySelector('.owner'), 'inbox thread header', conv.assignedTo || 'Sin asignar');
if (conv.assignedTo && !/asignada a/.test(text(sub))) fail('thread header should read «asignada a» + owner');
log(`inbox thread header: ${conv.assignedTo ? `asignada a ${conv.assignedTo}` : 'Sin asignar'} with avatar`);

// ===== 5) Plantillas list: owner column =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="tpl-root"></main><div id="scrim"></div></body>', 'http://localhost/templates/');
const T = await import(resolve(here, '../src/templates-data.js'));
await T.ready;
await import(resolve(here, '../src/templates.js'));
const tplRows = qa('#tpl-rows tr[data-id]');
if (!tplRows.length) fail('no template rows');
tplRows.forEach((r) => { const t = T.templates().find((x) => x.id === r.dataset.id); checkOwner(r.querySelector('td .owner'), `template ${t && t.name}`, t.ownerId); });
log(`templates list: ${tplRows.length} owner cells with avatar`);
log('OK');

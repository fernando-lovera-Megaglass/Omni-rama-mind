// Smoke test: tickets go to the trash («Restaurar registros eliminados») like contacts, companies and deals.
// Static: tickets are soft-deleted (data.js SOFT_DELETE, deleted_at mapping, migration soft_delete_tickets.sql,
// server-list exclusion). DOM: the Tickets list has the «Acciones» menu (no duplicates / format fixes);
// deleting from the list and from the record keeps the ticket in trashedRecords() with its date, removes it from
// the list and the board, the trash drawer lists it with the date, and «Restaurar» brings it back with the same
// pipeline and status. Tasks stay hard-deleted. Run: node scripts/smoke-tickets-trash.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[tickets-trash]', ...a);
const fail = (msg) => { console.error(`[tickets-trash] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- static ----
const dataSrc = readFileSync(resolve(here, '../src/data.js'), 'utf8');
if (!/const SOFT_DELETE = new Set\(\[[^\]]*'tickets'/.test(dataSrc)) fail('data.js: tickets missing from SOFT_DELETE');
if (/const SOFT_DELETE = new Set\(\[[^\]]*'tasks'/.test(dataSrc)) fail('data.js: tasks must not be recycled');
if (!/tickets: \{[^}]*deletedAt: 'deleted_at'/.test(dataSrc) || !/tickets: \[[^\]]*'deleted_at'\]/.test(dataSrc)) fail('data.js: tickets need the deletedAt ↔ deleted_at mapping and column');
const sql = readFileSync(resolve(here, '../supabase/soft_delete_tickets.sql'), 'utf8');
if (!/alter table public\.tickets add column if not exists deleted_at timestamptz/.test(sql)) fail('supabase/soft_delete_tickets.sql must add deleted_at to tickets');
const register = JSON.parse(readFileSync(resolve(here, 'applied-migrations.json'), 'utf8'));
if (!register['soft_delete_tickets.sql'] || register['soft_delete_tickets.sql'].status !== 'aplicada') fail('register: soft_delete_tickets.sql must be recorded as aplicada');
if (!/softDeletes\(type\)\) q = spec\.trash \? q\.not\('deleted_at', 'is', null\) : q\.is\('deleted_at', null\)/.test(readFileSync(resolve(here, '../src/server-list.js'), 'utf8'))) fail('server-list.js: soft-deleted rows must stay excluded by softDeletes(type)');
log('static: tickets soft-deleted (mapping, column, migration aplicada, server exclusion); tasks not recycled');

// ---- DOM ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom(main, url, type = '') {
  const dom = new JSDOM(`<!doctype html><body class="app"${type ? ` data-type="${type}"` : ''}><aside id="sidenav"></aside><header id="topbar"></header>${main}<div id="scrim"></div></body>`, { url, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
}
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const rowIds = () => qa('#table tbody tr[data-id]').map((tr) => Number(tr.dataset.id));

useDom('<main id="list-root"></main>', 'http://localhost/tickets/');
const data = await import(resolve(here, '../src/data.js'));
if (!data.softDeletes('tickets') || data.softDeletes('tasks')) fail('softDeletes(): tickets yes, tasks no');
await import(resolve(here, '../src/tickets.js'));
await wait(40);
// 1) Acciones menu with the trash, without duplicates / format fixes
const items = qa('#actions-menu .menu__item').map(text);
if (!items.includes('Restaurar registros eliminados') || !items.includes('Exportar') || items.includes('Gestionar duplicados') || items.includes('Corregir problemas de formato')) fail(`actions menu: ${items.join(' | ')}`);
log('Acciones menu:', items.join(' | '));
// 2) delete from the list (row action)
const target = data.allTickets().find((t) => rowIds().includes(Number(t.id)));
if (!target) fail('a ticket of the first page');
const before = { status: target.status, pipeline: target.pipeline, name: target.name };
// the list deletes from the row's preview panel («Vista previa» › ⋮ › Eliminar), confirm() accepted above
click(q(`#table tbody tr[data-id="${target.id}"] [data-preview="${target.id}"]`));
await wait(30);
const pvDelete = q('#preview [data-pv="delete"]');
if (!pvDelete) fail('preview panel: Eliminar action');
click(pvDelete);
await wait(30);
if (rowIds().includes(Number(target.id))) fail('deleted ticket still listed');
if (data.allTickets().some((t) => Number(t.id) === Number(target.id))) fail('deleted ticket still in allTickets()');
const trashed = data.trashedRecords('tickets').find((t) => Number(t.id) === Number(target.id));
if (!trashed || !trashed.deletedAt) fail('deleted ticket must sit in trashedRecords() with deletedAt');
log(`list delete: «${before.name}» out of the list, in the trash since ${trashed.deletedAt.slice(0, 10)}`);
// 3) not on the board either
click(q('[data-action="mode-board"]'));
await wait(30);
if (q(`.kcard[data-id="${target.id}"]`)) fail('deleted ticket still on the board');
if (!q('.kcard')) fail('board renders');
click(q('[data-action="mode-list"], [data-action="mode-table"]') || q('[data-action="mode-board"]'));
await wait(30);
log('board: deleted ticket not shown');
// 4) trash drawer with the date, restore → same pipeline & status
click(q('#actions-menu [data-action="trash"]'));
await wait(60);
const drawerRow = q(`#actions-drawer tr[data-id="${target.id}"]`);
if (!drawerRow || !text(drawerRow).includes(before.name) || !drawerRow.querySelector('[data-trash-restore]')) fail('trash drawer lists the ticket with Restaurar');
if (!/\d{1,2} [a-z]{3} \d{4}/.test(text(drawerRow))) fail(`trash row must show the deletion date: «${text(drawerRow)}»`);
click(drawerRow.querySelector('[data-trash-restore]'));
await wait(40);
const restored = data.allTickets().find((t) => Number(t.id) === Number(target.id));
if (!restored || restored.status !== before.status || restored.pipeline !== before.pipeline) fail(`restore must keep status/pipeline (${restored && restored.status}/${restored && restored.pipeline} vs ${before.status}/${before.pipeline})`);
if (data.trashedRecords('tickets').some((t) => Number(t.id) === Number(target.id))) fail('restored ticket still in the trash');
log('trash: listed with its date; restored to', `${restored.pipeline} / ${restored.status}`);

// 5) delete from the record page
useDom('<main id="record-root"></main>', `http://localhost/tickets/record/?id=${target.id}`, 'tickets');
await import(resolve(here, '../src/record.js'));
await wait(80);
const trigger = qa('button, a').find((b) => Object.values(b.dataset).includes('delete') && /eliminar/i.test(b.textContent));
if (!trigger) fail('record: «Eliminar» action');
click(trigger);
await wait(30);
const confirm = q('[data-confirm="delete"]');
if (!confirm) fail('record: delete confirmation modal');
click(confirm);
await wait(30);
const again = data.trashedRecords('tickets').find((t) => Number(t.id) === Number(target.id));
if (!again || !again.deletedAt || data.allTickets().some((t) => Number(t.id) === Number(target.id))) fail('record delete must send the ticket to the trash');
if (data.restoreRecords('tickets', [target.id]) !== 1) fail('restore after record delete');
log('record delete: ticket in the trash, restored again');
console.log('[tickets-trash] OK');
process.exit(0);

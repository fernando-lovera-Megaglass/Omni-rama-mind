// DOM smoke test for bulk «+ Crear tareas» on the companies, deals and tickets lists (src/list.js bulk-tasks +
// src/task-associations.js): the bar offers the action on the three lists, each selected record gets one task
// «<título>: <nombre>» tied to it through its own key (companyId / dealId / ticketId + assoc_<kind>) — never as
// a contact —, the record's timeline logs «Tarea creada», the toast counts the tasks and the selection clears;
// the tasks appear in /tasks/ (association columns) and in the «Tareas» card of each record. Contacts keep
// working the same way (scripts/smoke-bulk.mjs). Run: node scripts/smoke-bulk-tasks.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[bulk-tasks]', ...a);
const fail = (msg) => { console.error(`[bulk-tasks] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
let dom;
const boot = (url, main, type = '') => {
  dom = new JSDOM(`<!doctype html><body class="app"${type ? ` data-type="${type}"` : ''}><aside id="sidenav"></aside><header id="topbar"></header><main id="${main}"></main><div id="scrim"></div></body>`, { url, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const check = (cb) => { if (!cb) fail('missing checkbox'); cb.checked = true; cb.dispatchEvent(new window.Event('change', { bubbles: true })); };
const rows = () => qa('#rows tr[data-id]');
const submitBulk = async () => { $('bulk-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await wait(10); };

boot('http://localhost/companies/', 'list-root');
const data = await import(resolve(here, '../src/data.js'));
const TA = await import(resolve(here, '../src/task-associations.js'));
const tasksBefore = data.allTasks().length;
const newTasks = () => data.allTasks().filter((t) => /^Llamar: /.test(t.name));

// Creates «Llamar» tasks for the first `count` rows of the list of `type`; returns the records and their tasks.
async function bulkCreate(type, count) {
  const picked = rows().slice(0, count).map((tr) => Number(tr.dataset.id));
  picked.forEach((id) => check(q(`#rows tr[data-id="${id}"] .row-check`)));
  const actions = qa('.bulk__btn').map((b) => text(b));
  if (!actions.includes('+ Crear tareas')) fail(`${type}: «Crear tareas» in the bulk bar (${actions.join(' | ')})`);
  click(q('[data-action="bulk-tasks"]'));
  if (text($('bulk-modal-title')) !== `Crear ${count} ${count === 1 ? 'tarea' : 'tareas'}`) fail(`${type}: dialog title (${text($('bulk-modal-title'))})`);
  $('bulk-form').elements.title.value = 'Llamar';
  $('bulk-form').elements.type.value = 'Llamada';
  const before = data.allTasks().length;
  await submitBulk();
  if (data.allTasks().length !== before + count) fail(`${type}: ${count} task(s) created (${data.allTasks().length - before})`);
  if (!new RegExp(`^${count} ${count === 1 ? 'tarea creada' : 'tareas creadas'}`).test(text($('toast')))) fail(`${type}: toast (${text($('toast'))})`);
  if (!$('bulk').hidden || $('bulk-modal').classList.contains('is-open')) fail(`${type}: selection cleared and dialog closed`);
  return picked.map((id) => { const r = data.findRecord(type, id); const t = data.allTasks().find((x) => x.name === `Llamar: ${r.name}`); if (!t) fail(`${type}: task «Llamar: ${r.name}»`); return { r, t }; });
}
const KEY = { companies: 'companyId', deals: 'dealId', tickets: 'ticketId' };
function checkLinks(type, { r, t }) {
  if (Number(t[KEY[type]]) !== Number(r.id) || !(t[`assoc_${type}`] || []).map(Number).includes(Number(r.id))) fail(`${type}: task tied through ${KEY[type]} / assoc_${type} (${JSON.stringify({ [KEY[type]]: t[KEY[type]], assoc: t[`assoc_${type}`] })})`);
  if (t.contactId) fail(`${type}: a ${type.slice(0, -1)} must not be linked as a contact (contactId ${t.contactId})`);
  if (t.type !== 'Llamada' || t.status !== 'todo') fail(`${type}: type and status`);
  if (!TA.taskLinksTo(t, type, r.id) || !TA.taskAssociatedRecords(t, type).some((x) => Number(x.id) === Number(r.id))) fail(`${type}: association helpers see the record`);
  const acts = data.activitiesFor(type, r.id);
  if (!acts.some((a) => a.type === 'task' && a.text === `Tarea creada: ${t.name}`)) fail(`${type}: timeline entry (${acts[0] && acts[0].text})`);
}

// ---- companies: 2 rows ----
await import(resolve(here, '../src/companies.js'));
await wait(60);
const companies = await bulkCreate('companies', 2);
companies.forEach((x) => checkLinks('companies', x));
log(`empresas: ${companies.map(({ r, t }) => `«${t.name}» → companyId ${t.companyId}`).join(' | ')}; toast y selección OK; cronología «Tarea creada»`);

// ---- deals: 1 row ----
boot('http://localhost/deals/', 'list-root');
await import(resolve(here, '../src/deals.js'));
await wait(60);
const [deal] = await bulkCreate('deals', 1);
checkLinks('deals', deal);
log(`negocio: «${deal.t.name}» → dealId ${deal.t.dealId}`);

// ---- tickets: 1 row (the bar now defines the action) ----
boot('http://localhost/tickets/', 'list-root');
await import(resolve(here, '../src/tickets.js'));
await wait(60);
const [ticket] = await bulkCreate('tickets', 1);
checkLinks('tickets', ticket);
log(`ticket: «${ticket.t.name}» → ticketId ${ticket.t.ticketId}`);
if (newTasks().length !== 4 || data.allTasks().length !== tasksBefore + 4) fail(`4 tasks in total (${newTasks().length})`);

// ---- /tasks/: every task with its association (columns «Empresa / Negocio / Ticket asociado») ----
localStorage.setItem('crm:tasks:prefs', JSON.stringify({ columns: ['name', 'contact', 'company', 'deal', 'ticket', 'due', 'owner'] }));
boot('http://localhost/tasks/', 'list-root');
await import(resolve(here, '../src/tasks.js'));
await wait(60);
const search = $('row-search');
if (search) { search.value = 'Llamar:'; search.dispatchEvent(new window.Event('input', { bubbles: true })); await wait(40); }
const ths = qa('#table thead th');
const colOf = (key) => ths.findIndex((th) => th.dataset.key === key);
const label = (key) => text(ths[colOf(key)]?.querySelector('.th__label, button, span') || ths[colOf(key)]).split(' ⋮')[0].replace(/\s*[⇅↑↓]\s*$/, '').trim();
if (colOf('company') < 0 || colOf('deal') < 0 || colOf('ticket') < 0) fail(`association columns (${ths.map((th) => th.dataset.key).join(' | ')})`);
if (!/^Empresa asociada/.test(label('company')) || !/^Negocio asociado/.test(label('deal')) || !/^Ticket asociado/.test(label('ticket'))) fail(`column labels (${label('company')} / ${label('deal')} / ${label('ticket')})`);
const cellText = (t, key) => { const tr = q(`#rows tr[data-id="${t.id}"]`); if (!tr) fail(`/tasks/ row for «${t.name}»`); return text(tr.querySelectorAll('td')[colOf(key)]); };
for (const { r, t } of companies) if (cellText(t, 'company') !== r.name || cellText(t, 'contact') !== '—') fail(`/tasks/: «${t.name}» shows its company only (${cellText(t, 'company')} / ${cellText(t, 'contact')})`);
if (cellText(deal.t, 'deal') !== deal.r.name || cellText(ticket.t, 'ticket') !== ticket.r.name) fail('/tasks/: deal and ticket associations');
const link = q(`#rows tr[data-id="${deal.t.id}"] td:nth-child(${colOf('deal') + 1}) a`);
if (!link || link.getAttribute('href') !== `../deals/record/?id=${deal.r.id}`) fail(`/tasks/: association links to the deal (${link && link.getAttribute('href')})`);
log('/tasks/: columnas Empresa / Negocio / Ticket asociado con cada registro y su enlace; contacto vacío');

// ---- the «Tareas» card of each record lists its new task ----
let n = 0;
for (const [type, { r, t }] of [['companies', companies[0]], ['companies', companies[1]], ['deals', deal], ['tickets', ticket]]) {
  boot(`http://localhost/${type}/record/?id=${r.id}`, 'record-root', type);
  await import(resolve(here, `../src/record.js?bulk-tasks=${n++}`));
  await wait(80);
  const card = q('.card--assoc[data-kind="tasks"]');
  if (!card) fail(`${type} #${r.id}: «Tareas» association card`);
  if (!/^Tareas \(\d+\)/.test(text(card.querySelector('.card__toggle')).replace(/^⌄\s*/, ''))) fail(`${type}: card title with the count (${text(card.querySelector('.card__toggle'))})`);
  if (!text(card).includes(t.name) || !card.querySelector(`[data-task-done="${t.id}"]`)) fail(`${type} #${r.id}: the card lists «${t.name}»`);
}
log('fichas de empresa, negocio y ticket: tarjeta «Tareas (n)» con la tarea nueva y su casilla');
console.log('[bulk-tasks] OK');
process.exit(0);

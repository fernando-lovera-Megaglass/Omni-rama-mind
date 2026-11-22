// DOM smoke test for the «Tarea» quick action of the record page (src/record.js openTaskForm / saveTaskForm) on
// contacts, companies, deals and tickets: the button opens the task form (title prefilled «Seguimiento con
// <nombre>», notes, type, priority, due date and time, reminder, queue, owner, the record pre-associated) and
// creates nothing until «Crear tarea»; Cancelar creates nothing; saving creates the task with the chosen values
// (due with time, reminder relative to it, queue, association keys of the record), lists it in the record's
// «Tareas» card and in /tasks/, logs the timeline entry and shows the toast with «Ver registro».
// Run: node scripts/smoke-record-task-form.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[record-task-form]', ...a);
const fail = (msg) => { console.error(`[record-task-form] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (main, url, type = '') => { const dom = new JSDOM(`<!doctype html><body class="app"${type ? ` data-type="${type}"` : ''}><aside id="sidenav"></aside><header id="topbar"></header>${main}<div id="scrim"></div></body>`, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.HTMLElement.prototype.scrollBy = function () {}; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const set = (id, v) => { const el = $(id); if (!el) fail(`missing field ${id}`); el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };

const data = await import(resolve(here, '../src/data.js'));
const Q = await import(resolve(here, '../src/task-queues.js'));
const queue = await Q.saveTaskQueue('Cola de prueba');
const IDS = { contacts: 3, companies: 1, deals: 1, tickets: 1 };
const KEY = { contacts: 'contactId', companies: 'companyId', deals: 'dealId', tickets: 'ticketId' };
const tomorrow = new Date(data.TODAY.getTime() + 86400000);
const pad = (n) => String(n).padStart(2, '0');
const dateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
let n = 0;
const made = {};

for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  const id = IDS[type];
  useDom('<main id="record-root"></main>', `http://localhost/${type}/record/?id=${id}`, type);
  await import(resolve(here, `../src/record.js?tf=${n++}`));
  await wait(60);
  const rec = data.findRecord(type, id);
  const before = data.allTasks().length;
  // ---- the button opens the form; nothing is created ----
  click(q('#quick-row [data-action="task"]'));
  await wait(30);
  if (!$('rec-modal').classList.contains('is-open') || text($('rec-modal-title')) !== 'Crear tarea' || !$('task-form')) fail(`${type}: «Tarea» opens the form`);
  if ($('tf-name').value !== `Seguimiento con ${rec.name}` || !$('tf-notes') || !$('tf-date') || !$('tf-time') || !$('tf-reminder') || !$('tf-priority') || !$('tf-type') || !$('tf-queue') || !$('tf-owner')) fail(`${type}: fields with the prefilled title (${$('tf-name') && $('tf-name').value})`);
  if (!text(q('#task-form fieldset')).includes(rec.name) || !q('#task-form fieldset input[checked][disabled]')) fail(`${type}: the record is pre-associated`);
  if (![...$('tf-queue').options].some((o) => o.value === queue.id && o.textContent === 'Cola de prueba')) fail(`${type}: queues offered`);
  if (data.allTasks().length !== before) fail(`${type}: opening the form creates nothing`);
  // ---- Cancelar creates nothing ----
  click(q('#rec-modal [data-close]'));
  if ($('rec-modal').classList.contains('is-open') || data.allTasks().length !== before) fail(`${type}: Cancelar creates nothing`);
  // ---- fill and save ----
  click(q('#quick-row [data-action="task"]'));
  await wait(30);
  set('tf-name', `Llamar para cotización (${type})`);
  set('tf-notes', 'Revisar precios antes de llamar');
  set('tf-type', 'Llamada');
  set('tf-priority', 'high');
  set('tf-date', dateStr);
  set('tf-time', '15:30');
  set('tf-reminder', '1 hora antes');
  set('tf-queue', queue.id);
  if (!$('tf-reminder-custom').hidden) fail(`${type}: custom reminder field hidden for a preset`);
  click(q('[data-confirm="task-save"]'));
  await wait(30);
  if ($('rec-modal').classList.contains('is-open') || data.allTasks().length !== before + 1) fail(`${type}: saving creates exactly one task`);
  const task = data.allTasks().find((t) => t.name === `Llamar para cotización (${type})`);
  if (!task) fail(`${type}: task by name`);
  made[type] = task;
  const due = new Date(task.due);
  if (due.getFullYear() !== tomorrow.getFullYear() || due.getMonth() !== tomorrow.getMonth() || due.getDate() !== tomorrow.getDate() || due.getHours() !== 15 || due.getMinutes() !== 30) fail(`${type}: due date and time (${task.due})`);
  if (new Date(task.reminderAt).getTime() !== due.getTime() - 3600000) fail(`${type}: reminder one hour before (${task.reminderAt})`);
  if (task.notes !== 'Revisar precios antes de llamar' || task.type !== 'Llamada' || task.priority !== 'high' || task.status !== 'todo' || task.queueId !== queue.id) fail(`${type}: chosen values (${JSON.stringify({ notes: task.notes, type: task.type, priority: task.priority, queueId: task.queueId })})`);
  if (Number(task[KEY[type]]) !== Number(id) || !(task[`assoc_${type}`] || []).map(Number).includes(Number(id))) fail(`${type}: associated through ${KEY[type]} / assoc_${type}`);
  if (type !== 'contacts' && rec.contactId && Number(task.contactId) !== Number(rec.contactId)) fail(`${type}: the record's contact is kept too`);
  const card = q('.card--assoc[data-kind="tasks"]');
  if (!card || !text(card).includes(task.name)) fail(`${type}: «Tareas» card lists the task`);
  if (!/Tarea creada/.test(text($('toast'))) || !$('toast').querySelector('a')?.getAttribute('href').endsWith(`tasks/record/?id=${task.id}`)) fail(`${type}: toast with «Ver registro» (${text($('toast'))})`);
  if (!qa('#rec-timeline .timeline__item').some((li) => text(li).includes(`Tarea creada: ${task.name}`))) fail(`${type}: timeline entry`);
  log(`${type} «${rec.name}»: formulario abierto sin crear nada, Cancelar no crea; guardar → «${task.name}» (${task.type}, alta, vence ${dateStr} 15:30, recordatorio 1 h antes, cola, ${KEY[type]} ${task[KEY[type]]}), tarjeta Tareas, cronología y toast`);
  // ---- empty title is refused ----
  click(q('#quick-row [data-action="task"]'));
  await wait(30);
  set('tf-name', '   ');
  click(q('[data-confirm="task-save"]'));
  if (!$('rec-modal').classList.contains('is-open') || $('tf-err').hidden || data.allTasks().length !== before + 1) fail(`${type}: empty title refused`);
  click(q('#rec-modal [data-close]'));
}

// ---- /tasks/ lists the four tasks ----
localStorage.setItem('crm:tasks:prefs', JSON.stringify({ columns: ['name', 'contact', 'company', 'deal', 'ticket', 'due', 'queueId'], size: 100 }));
useDom('<main id="list-root"></main>', 'http://localhost/tasks/');
await import(resolve(here, '../src/tasks.js'));
await wait(60);
const search = $('row-search');
if (search) { search.value = 'Llamar para cotización'; search.dispatchEvent(new window.Event('input', { bubbles: true })); await wait(40); }
for (const type of Object.keys(made)) {
  const tr = q(`#rows tr[data-id="${made[type].id}"]`);
  if (!tr || !text(tr).includes('Cola de prueba')) fail(`/tasks/: row for the ${type} task with its queue (${tr && text(tr).slice(0, 120)})`);
}
log('/tasks/: las cuatro tareas aparecen con su cola');
console.log('[record-task-form] OK');
process.exit(0);

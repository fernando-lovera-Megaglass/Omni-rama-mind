// DOM smoke test for task reminders (src/task-reminders.js): the default from Ajustes › General › Tareas, the
// reminder date-time saved on tasks created from the list (preset relative to the due date or a custom
// date-time) and on tasks created anywhere else (default applied), a task with a reminder in 1 minute that
// fires it when the minute passes — browser notification (fake Notification API, permission asked), bubble
// inside the app with the chime (fake AudioContext) and the link to the task, bell entry, marked as fired so
// it never repeats —, the 30-second checker, editing the reminder on the task's record, and the permission
// button in Ajustes. Run: node scripts/smoke-task-reminders.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[task-reminders]', ...a);
const fail = (msg) => { console.error(`[task-reminders] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60000;
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
// Fake browser APIs: Notification (permission flow + constructed notifications) and AudioContext (the chime).
const notifs = [];
let permission = 'default';
let permissionAsked = 0;
class FakeNotification {
  static get permission() { return permission; }
  static async requestPermission() { permissionAsked += 1; permission = 'granted'; return permission; }
  constructor(title, options) { this.title = title; this.options = options || {}; notifs.push(this); }
}
const audio = { started: 0, contexts: 0 };
class FakeAudioContext {
  constructor() { audio.contexts += 1; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start: () => { audio.started += 1; }, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
}
function useDom(html, url, bodyType = '') {
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
  dom.window.Notification = FakeNotification;
  dom.window.AudioContext = FakeAudioContext;
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.confirm = () => true;
  dom.window.prompt = (q, d) => d;
  if (bodyType) document.body.dataset.type = bodyType;
  return dom;
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const submit = (form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const local = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString();

// ===== 1) The tasks list: default from Ajustes, reminder saved from the create drawer =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/tasks/');
localStorage.setItem('crm:settings:general-tareas', JSON.stringify({ reminder: '1 hora antes', view: 'Para hoy' }));
const data = await import(resolve(here, '../src/data.js'));
const TR = await import(resolve(here, '../src/task-reminders.js'));
const N = await import(resolve(here, '../src/notifications.js'));
if (TR.defaultReminderOption() !== '1 hora antes') fail('default reminder must come from Ajustes › Tareas');
if (TR.reminderFromDue(local(2026, 11, 25, 15, 30), '1 hora antes') !== local(2026, 11, 25, 14, 30)) fail('1 hora antes of a timed due');
if (TR.reminderFromDue(new Date('2026-11-25').toISOString(), 'El día de vencimiento a las 9:00') !== local(2026, 11, 25, 9, 0)) fail('9:00 of a date-only due (UTC midnight)');
if (TR.reminderFromDue(local(2026, 11, 25), '1 día antes') !== local(2026, 11, 24, 9, 0)) fail('1 día antes of a date-only due (local midnight → 9:00)');
if (TR.reminderFromDue(local(2026, 11, 25), 'Sin recordatorio') !== '' || TR.reminderFromDue('', '1 hora antes') !== '') fail('no reminder cases');
const auto = data.addRecord('tasks', { name: 'Tarea sin recordatorio explícito', type: 'Tarea', status: 'todo', priority: 'medium', owner: 'Fernando L.', contactId: '', contact: '', due: local(2026, 11, 30, 11, 0), lastActivity: data.TODAY.toISOString() });
if (auto.reminderAt !== local(2026, 11, 30, 10, 0)) fail(`a task created anywhere gets the default reminder: ${auto.reminderAt}`);
await import(resolve(here, '../src/tasks.js'));
await wait(20);
click(q('[data-action="create"]'));
const form = $('create-form');
const remSel = form.querySelector('select[name="reminder"]');
const remAt = form.querySelector('input[name="reminderAt"]');
if (!remSel || !remAt || remAt.type !== 'datetime-local') fail('create drawer must offer Recordatorio + custom date-time');
if (remSel.options[0].value !== '1 hora antes' || !text(remSel.options[0]).includes('(predeterminado)') || [...remSel.options].map((o) => o.value).join('|') !== '1 hora antes|Sin recordatorio|El día de vencimiento a las 9:00|1 día antes|custom') fail(`reminder options: ${[...remSel.options].map((o) => o.value).join('|')}`);
form.elements.name.value = 'Visita técnica Cristales Norte';
form.elements.due.value = '2026-11-25';
change(remSel, '1 día antes');
submit(form);
await wait(40);
const t1 = data.allTasks().find((t) => t.name === 'Visita técnica Cristales Norte');
if (!t1 || t1.reminderAt !== local(2026, 11, 24, 9, 0) || t1.reminderFiredAt) fail(`preset reminder saved on the task: ${t1 && t1.reminderAt}`);
click(q('[data-action="create"]'));
form.elements.name.value = 'Llamar al arquitecto';
form.elements.due.value = '2026-11-26';
change(form.querySelector('select[name="reminder"]'), 'custom');
form.querySelector('input[name="reminderAt"]').value = '2026-11-26T15:30';
submit(form);
await wait(40);
const t2 = data.allTasks().find((t) => t.name === 'Llamar al arquitecto');
if (!t2 || t2.reminderAt !== local(2026, 11, 26, 15, 30)) fail(`custom reminder saved: ${t2 && t2.reminderAt}`);
click(q('[data-action="create"]'));
form.elements.name.value = 'Sin aviso';
form.elements.due.value = '2026-11-27';
change(form.querySelector('select[name="reminder"]'), 'Sin recordatorio');
submit(form);
await wait(40);
const t3 = data.allTasks().find((t) => t.name === 'Sin aviso');
if (!t3 || t3.reminderAt !== '') fail('«Sin recordatorio» stores no reminder');
log('list: default «1 hora antes» from Ajustes, drawer with Recordatorio (default first) + custom date-time; saved as 24 nov 09:00 (1 día antes), 26 nov 15:30 (custom), none');

// ===== 2) A reminder in 1 minute fires when the minute passes: browser notification, bubble, chime, bell =====
const now = Date.now();
const soon = data.addRecord('tasks', { name: 'Enviar cotización a Ana Ruiz', type: 'Correo', status: 'todo', priority: 'high', owner: 'Fernando L.', contactId: 1, contact: 'Ana Ruiz', due: new Date(now + 60 * MIN).toISOString(), reminderAt: new Date(now + MIN).toISOString(), lastActivity: data.TODAY.toISOString() });
if (TR.dueReminders(now).length !== 0 || !TR.upcomingReminders(now).some((t) => t.id === soon.id)) fail(`not due yet: due=${JSON.stringify(TR.dueReminders(now).map((t) => [t.name, t.reminderAt]))} upcoming=${JSON.stringify(TR.upcomingReminders(now).map((t) => [t.name, t.reminderAt]))} soon=${JSON.stringify([soon.id, soon.reminderAt, soon.status])}`);
let events = 0;
document.addEventListener('crm:reminder', () => { events += 1; });
const bellBefore = N.notifications().length;
if (TR.processDueReminders(now + 30000).fired !== 0) fail('30 s later: still not due');
const r = TR.processDueReminders(now + MIN);
await wait(10);
if (r.fired !== 1 || r.tasks[0].id !== soon.id) fail(`fired at the minute: ${JSON.stringify(r)}`);
const firedTask = data.allTasks().find((t) => t.id === soon.id);
if (!firedTask.reminderFiredAt || Math.abs(new Date(firedTask.reminderFiredAt).getTime() - (now + MIN)) > 1000) fail('reminderFiredAt must be stored on the task');
if (permissionAsked !== 1 || notifs.length !== 1 || notifs[0].title !== 'Recordatorio: Enviar cotización a Ana Ruiz' || !notifs[0].options.body.includes('Correo · vence') || !notifs[0].options.body.includes('Ana Ruiz') || notifs[0].options.tag !== `omni-task-${soon.id}`) fail(`browser notification: asked ${permissionAsked}, ${JSON.stringify(notifs.map((n) => [n.title, n.options]))}`);
const bubble = q('#rbubbles .rbub');
if (!bubble || bubble.dataset.task !== String(soon.id) || text(bubble.querySelector('.rbub__title')) !== 'Recordatorio de tarea' || text(bubble.querySelector('.rbub__link')) !== 'Enviar cotización a Ana Ruiz' || !bubble.querySelector('.rbub__link').getAttribute('href').endsWith(`tasks/record/?id=${soon.id}`) || !text(bubble.querySelector('.rbub__meta')).includes('Ana Ruiz')) fail(`bubble: ${bubble && bubble.outerHTML.slice(0, 300)}`);
if (audio.contexts !== 1 || audio.started !== 2) fail(`chime: ${JSON.stringify(audio)}`);
if (N.notifications().length !== bellBefore + 1 || N.notifications()[0].title !== 'Recordatorio: Enviar cotización a Ana Ruiz' || N.notifications()[0].href !== `tasks/record/?id=${soon.id}` || N.notifications()[0].read) fail('bell entry');
if (events !== 1) fail('crm:reminder event');
if (TR.processDueReminders(now + 2 * MIN).fired !== 0 || TR.processDueReminders(now + 60 * MIN).fired !== 0 || notifs.length !== 1 || qa('#rbubbles .rbub').length !== 1) fail('a fired reminder must never repeat');
click(bubble.querySelector('[data-rb-close]'));
if (qa('#rbubbles .rbub').length !== 0) fail('bubble closes');
// a completed task never reminds
const doneTask = data.addRecord('tasks', { name: 'Ya hecha', type: 'Tarea', status: 'done', priority: 'low', owner: 'Fernando L.', contactId: '', contact: '', due: new Date(now).toISOString(), reminderAt: new Date(now - MIN).toISOString(), lastActivity: data.TODAY.toISOString() });
if (TR.processDueReminders(now).fired !== 0 || data.allTasks().find((t) => t.id === doneTask.id).reminderFiredAt) fail('completed tasks do not remind');
log('1 minute: not due at 30 s, fired at 60 s → permission asked once, browser notification with body/tag, bubble with link + chime (2 notes), bell entry, marked fired, no repeat at 2 min / 1 h; completed tasks skipped');

// ===== 3) The checker (every 30 s in the app; 20 ms here) =====
TR.stopReminderChecker();
TR.startReminderChecker({ intervalMs: 20 });
if (!TR.checkerRunning() || !TR.lastCheckAt()) fail('checker running');
const late = data.addRecord('tasks', { name: 'Recordatorio atrasado', type: 'Llamada', status: 'todo', priority: 'medium', owner: 'Sofía R.', contactId: '', contact: '', due: new Date(now).toISOString(), reminderAt: new Date(now - 5 * MIN).toISOString(), lastActivity: data.TODAY.toISOString() });
await wait(90);
if (!data.allTasks().find((t) => t.id === late.id).reminderFiredAt || !notifs.some((n) => n.title === 'Recordatorio: Recordatorio atrasado') || !qa('#rbubbles .rbub').some((b) => b.dataset.task === String(late.id))) fail('the checker must fire a due reminder on its own');
TR.stopReminderChecker();
if (TR.checkerRunning()) fail('checker stops');
log('checker: a due reminder fired by the interval without any call');

// ===== 4) The task's record: Recordatorio shown and editable (datetime), editing re-arms a fired one =====
useDom('<!doctype html><body class="app" data-type="tasks"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', `http://localhost/tasks/record/?id=${soon.id}`, 'tasks');
await import(resolve(here, '../src/record.js'));
await wait(20);
const row = qa('#rec-props .props__row').find((el) => text(el).startsWith('Recordatorio'));
if (!row || !text(row).includes(TR.reminderText(soon.reminderAt))) fail(`record shows the reminder: ${row && text(row)}`);
if (!text($('record-root')).includes('avisado')) fail('the record says the reminder was already shown');
click(row.querySelector('[data-edit-key="reminderAt"]'));
const editForm = q('.props__form[data-key="reminderAt"]');
const input = editForm && editForm.querySelector('[data-edit="reminderAt"]');
if (!input || input.type !== 'datetime-local' || input.value !== TR.datetimeInput(soon.reminderAt)) fail(`datetime editor: ${input && input.type} ${input && input.value}`);
input.value = '2026-12-01T08:15';
submit(editForm);
await wait(40);
const edited = data.allTasks().find((t) => t.id === soon.id);
if (edited.reminderAt !== local(2026, 12, 1, 8, 15) || edited.reminderFiredAt) fail(`edited reminder: ${JSON.stringify([edited.reminderAt, edited.reminderFiredAt])}`);
if (!text($('record-root')).includes('1 dic 2026 a las 08:15')) fail('record shows the new reminder');
log('record: Recordatorio «… · avisado» → datetime-local editor → saved 1 dic 2026 08:15 and re-armed (fired flag cleared)');

// ===== 5) Ajustes › General › Tareas: the browser permission button =====
permission = 'default';
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', 'http://localhost/settings/#prefs-general');
await import(resolve(here, '../src/settings.js'));
click(q('[data-general-tab="tareas"]'));
const permRow = $('notif-perm-row');
if (!permRow || !text(permRow).includes('Todavía no has dado permiso') || text(permRow.querySelector('[data-action="notif-permission"]')) !== 'Permitir' || !text($('settings-root')).includes('cada 30 segundos')) fail(`settings row: ${permRow && text(permRow)}`);
click(permRow.querySelector('[data-action="notif-permission"]'));
await wait(20);
if (permission !== 'granted' || !text($('notif-perm-row')).includes('Permitidas por el navegador') || !$('notif-perm-row').querySelector('[data-action="notif-permission"]').disabled) fail(`after permission: ${text($('notif-perm-row'))}`);
log('settings: «Permitir» asks the browser and shows «Permitidas por el navegador»');

console.log('[task-reminders] OK');
process.exit(0);

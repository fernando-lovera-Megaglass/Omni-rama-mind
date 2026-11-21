// Smoke test for recurring tasks («Repetir»): the recurrence is stored on the task as recur = { freq }; completing
// a recurring task anywhere (queue completeTask, list checkbox, record task card, task record) spawns the next
// occurrence with the same title/type/priority/owner/contact, the due date shifted by the frequency, the default
// reminder re-armed (no reminderFiredAt) and a timeline note on the contact; a task without recurrence spawns
// nothing; the create drawer offers «Repetir»; the list has the optional «Repetir» column; the task record shows
// and edits it. Run: node scripts/smoke-task-recurrence.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[task-recurrence]', ...a);
const fail = (msg) => { console.error(`[task-recurrence] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
const change = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const submit = (form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const DAY = 86400000;
const dayOf = (iso) => iso.slice(0, 10);

useDom('<main id="list-root"></main>', 'http://localhost/tasks/');
const data = await import(resolve(here, '../src/data.js'));
const Q = await import(resolve(here, '../src/task-queue.js'));
const contact = data.allContacts().find((c) => c.name);
const today = new Date(); today.setUTCHours(9, 0, 0, 0);

// ---- 1) helpers: frequencies, clamping, normalisation ----
if (dayOf(data.nextRecurrence('2026-01-31T09:00:00.000Z', 'monthly')) !== '2026-02-28' || dayOf(data.nextRecurrence('2028-02-29T09:00:00.000Z', 'yearly')) !== '2029-02-28' || dayOf(data.nextRecurrence('2026-11-21T00:00:00.000Z', 'weekly')) !== '2026-11-28' || dayOf(data.nextRecurrence('2026-12-31T00:00:00.000Z', 'daily')) !== '2027-01-01') fail('nextRecurrence shifts by calendar days / months / years with clamping');
if (JSON.stringify(data.normalizeRecur('weekly')) !== '{"freq":"weekly"}' || data.normalizeRecur('') !== null || data.normalizeRecur('x') !== null || JSON.stringify(data.normalizeRecur({ freq: 'daily' })) !== '{"freq":"daily"}') fail('normalizeRecur');
if (data.RECUR_OPTIONS.map(([, l]) => l).join('|') !== 'Sin repetición|Diaria|Semanal|Mensual|Anual') fail('RECUR_OPTIONS labels');
log('helpers: daily/weekly/monthly/yearly with clamping; normalisation');

// ---- 2) completeTask on a weekly task due today → next occurrence +7 days, reminder re-armed, timeline note ----
const weekly = data.addRecord('tasks', { name: 'Revisar inventario de vidrio', type: 'Tarea', priority: 'high', status: 'todo', owner: 'Fernando L.', contactId: contact.id, contact: contact.name, due: today.toISOString(), recur: { freq: 'weekly' }, lastActivity: today.toISOString() });
if (!weekly.reminderAt) fail('the recurring task gets the default reminder');
const beforeCount = data.allTasks().length;
Q.completeTask(weekly.id, true);
const after = data.allTasks();
if (after.length !== beforeCount + 1) fail(`completing a weekly task creates exactly one task (${after.length - beforeCount})`);
const next = after.find((t) => t.name === weekly.name && Number(t.id) !== Number(weekly.id));
if (!next || next.status !== 'todo' || next.type !== 'Tarea' || next.priority !== 'high' || next.owner !== 'Fernando L.' || Number(next.contactId) !== Number(contact.id) || next.contact !== contact.name) fail('next occurrence copies title/type/priority/owner/contact');
if (Math.round((new Date(next.due) - new Date(weekly.due)) / DAY) !== 7) fail(`next due +7 days (${weekly.due} → ${next.due})`);
if (!next.recur || next.recur.freq !== 'weekly') fail('next occurrence keeps the recurrence');
if (next.reminderAt !== data.reminderFromDue(next.due) || next.reminderFiredAt || !next.reminderAt) fail(`reminder re-armed from the new due (${next.reminderAt})`);
if (data.findRecord('tasks', weekly.id).status !== 'done' || !data.findRecord('tasks', weekly.id).completedAt) fail('original is done');
const when = data.formatDate(next.due);
const noteOnContact = data.activitiesFor('contacts', contact.id).find((a) => a.text === `Tarea recurrente «${weekly.name}» completada: se creó la siguiente para el ${when}.`);
if (!noteOnContact) fail('timeline note on the contact');
if (!data.activitiesFor('tasks', weekly.id).some((a) => a.text === `Tarea recurrente completada: se creó la siguiente para el ${when}.`)) fail('timeline note on the task');
Q.completeTask(weekly.id, true); // marking done again does not spawn another
if (data.allTasks().length !== beforeCount + 1) fail('completing an already completed task spawns nothing');
log(`weekly: done → next for ${when}, reminder ${next.reminderAt.slice(0, 16)}, note on ${contact.name}`);

// ---- 3) a task without recurrence spawns nothing; a monthly one shifts a month ----
const plain = data.addRecord('tasks', { name: 'Llamar al proveedor', type: 'Llamada', priority: 'medium', status: 'todo', owner: 'Sofía R.', contactId: '', contact: '', due: today.toISOString() });
const n0 = data.allTasks().length;
Q.completeTask(plain.id, true);
if (data.allTasks().length !== n0) fail('a task without recurrence spawns nothing');
const monthly = data.addRecord('tasks', { name: 'Factura mensual', type: 'Correo', priority: 'low', status: 'todo', owner: 'Sofía R.', contactId: contact.id, contact: contact.name, due: '2026-01-31T00:00:00.000Z', recur: { freq: 'monthly' } });
Q.completeTask(monthly.id, true);
const nextMonthly = data.allTasks().find((t) => t.name === 'Factura mensual' && t.status === 'todo');
if (!nextMonthly || dayOf(nextMonthly.due) !== '2026-02-28') fail(`monthly next due clamped to 28 feb (${nextMonthly && nextMonthly.due})`);
log('no recurrence → nothing; monthly 31 ene → 28 feb');

// ---- 4) list: «Repetir» in the create drawer, optional column, checkbox completes and refreshes ----
await import(resolve(here, '../src/tasks.js'));
await wait(40);
click(q('[data-action="create"]'));
const form = $('create-form');
const recurSel = form && form.querySelector('select[name="recur"]');
if (!recurSel || [...recurSel.options].map((o) => text(o)).join('|') !== 'Sin repetición|Diaria|Semanal|Mensual|Anual') fail('create drawer offers Repetir with the five options');
form.elements.name.value = 'Reporte semanal de obra';
form.elements.due.value = '2026-11-21';
change(recurSel, 'weekly');
submit(form);
await wait(40);
const made = data.allTasks().find((t) => t.name === 'Reporte semanal de obra');
if (!made || !made.recur || made.recur.freq !== 'weekly') fail('task created from the drawer stores recur = { freq }');
// the optional column shows the frequency
click(q('[data-action="columns"]'));
await wait(20);
const colBox = qa('#columns-drawer input[type="checkbox"], [data-col-key="recur"], input[data-col="recur"]').find((i) => (i.dataset.col || i.dataset.colKey || i.value) === 'recur') || qa('input[type="checkbox"]').find((i) => /recur/.test(i.value + (i.dataset.col || '') + (i.dataset.key || '')));
if (!colBox) fail('«Repetir» offered in the columns picker');
if (!colBox.checked) click(colBox);
await wait(20);
qa('button').filter((b) => /Aplicar|Guardar/.test(text(b)) && b.closest('#columns-drawer, .drawer, .slideover')).slice(0, 1).forEach(click);
await wait(30);
const head = qa('#table thead th').find((th) => text(th).startsWith('Repetir'));
if (!head) fail('«Repetir» column shown');
const rowOf = (id) => q(`#table tbody tr[data-id="${id}"]`);
const search = $('row-search'); search.value = 'Reporte semanal'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(30);
if (!rowOf(made.id) || !text(rowOf(made.id)).includes('Semanal')) fail('row shows «Semanal» in the Repetir column');
const cb = rowOf(made.id).querySelector('.task-done');
cb.checked = true; cb.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(40);
const spawned = data.allTasks().filter((t) => t.name === 'Reporte semanal de obra');
if (spawned.length !== 2 || !spawned.some((t) => t.status === 'todo' && dayOf(t.due) === '2026-11-28')) fail('list checkbox completes and spawns next (+7)');
if (qa('#table tbody tr[data-id]').length < 2) fail('list refreshed with the new occurrence');
log('list: drawer «Repetir», column «Repetir» = Semanal, checkbox → next occurrence listed');

// ---- 5) task record: «Repetir» shown and editable in Acerca de; record card checkbox on the contact ----
const rec = spawned.find((t) => t.status === 'todo');
useDom('<main id="record-root"></main>', `http://localhost/tasks/record/?id=${rec.id}`, 'tasks');
await import(resolve(here, '../src/record.js'));
await wait(80);
const row = q('.props__row[data-key="recur"]');
if (!row || !text(row).includes('Semanal')) fail(`record shows Repetir = Semanal (${row && text(row)})`);
click(row.querySelector('[data-edit-key]'));
await wait(20);
const sel = row.querySelector('select');
if (!sel || sel.value !== 'weekly') fail(`record editor preselects the frequency (${sel && sel.value})`);
change(sel, 'monthly');
submit(row.querySelector('form'));
await wait(40);
if (!data.findRecord('tasks', rec.id).recur || data.findRecord('tasks', rec.id).recur.freq !== 'monthly') fail('record edit stores recur = { freq: monthly }');
log('record: Repetir shown and edited to Mensual');
// the Tareas card of the contact record (a fresh record.js instance for the second page: ES modules run once)
const carded = data.addRecord('tasks', { name: 'Visita de obra', type: 'Tarea', priority: 'medium', status: 'todo', owner: 'Fernando L.', contactId: contact.id, contact: contact.name, due: '2026-11-21T00:00:00.000Z', recur: { freq: 'monthly' } });
useDom('<main id="record-root"></main>', `http://localhost/contacts/record/?id=${contact.id}`, 'contacts');
await import(`${resolve(here, '../src/record.js')}?page=contact`);
await wait(300);
const cardCb = q(`[data-task-done="${carded.id}"]`);
if (!cardCb) fail(`contact record lists the task with its checkbox (cards: ${qa('.card--assoc').map((c) => c.dataset.kind).join(',')} | checkboxes: ${qa('[data-task-done]').length})`);
cardCb.checked = true; cardCb.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(40);
const fromCard = data.allTasks().filter((t) => t.name === 'Visita de obra' && t.status === 'todo');
if (fromCard.length !== 1 || dayOf(fromCard[0].due) !== '2026-12-21' || Number(fromCard[0].contactId) !== Number(contact.id)) fail(`record card checkbox spawns the monthly next (${fromCard.map((t) => t.due).join(',')})`);
log('contact record card: checkbox → next occurrence (monthly, 21 dic)');
console.log('[task-recurrence] OK');
process.exit(0);

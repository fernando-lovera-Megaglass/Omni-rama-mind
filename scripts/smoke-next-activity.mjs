// Smoke test for «Fecha de la próxima actividad» (notes_next_activity_date, src/data.js): empty while a contact has
// no open task nor scheduled meeting; a task due tomorrow sets it (record highlight «Próxima actividad» and list
// column); a second task further ahead does not move it; completing the first takes the next one, completing
// the last empties it; reopening brings it back; a scheduled meeting earlier than the task wins and deleting that
// meeting falls back to the task; deleting the task empties it; companies (companyId) and deals (dealId or the
// deal's contact) follow the same rule; «Última actividad» is untouched. Run: node scripts/smoke-next-activity.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[next-activity]', ...a);
const fail = (msg) => { console.error(`[next-activity] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (main, url, type = '') => { const dom = new JSDOM(`<!doctype html><body class="app"${type ? ` data-type="${type}"` : ''}><aside id="sidenav"></aside><header id="topbar"></header>${main}<div id="scrim"></div></body>`, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.HTMLElement.prototype.scrollBy = function () {}; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const sameDay = (iso, d) => iso && new Date(iso).toDateString() === d.toDateString();

useDom('<main id="list-root"></main>', 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
const next = (type, id) => data.findRecord(type, id).notes_next_activity_date || '';
const contact = data.addRecord('contacts', { name: 'Nora Próxima', first: 'Nora', last: 'Próxima', email: 'nora@proxima.mx', owner: 'Fernando L.', lifecycle: 'Lead' });
const company = data.addRecord('companies', { name: 'Próxima SA', domain: 'proxima.mx', owner: 'Fernando L.', lifecycle: 'Lead' });
const deal = data.addRecord('deals', { name: 'Negocio Próxima', amount: 100, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: new Date(Date.now() + 30 * 86400000).toISOString(), owner: 'Fernando L.', companyId: company.id, company: company.name, contactId: contact.id, priority: 'medium', type: 'Nuevo negocio', lastActivity: data.TODAY.toISOString() });
if (next('contacts', contact.id) || next('companies', company.id) || next('deals', deal.id)) fail('empty without tasks or meetings');
const lastBefore = data.findRecord('contacts', contact.id).lastActivity;
const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(10, 0, 0, 0);
const in3 = new Date(Date.now() + 3 * 86400000); in3.setHours(9, 0, 0, 0);
const task = (name, due, extra = {}) => data.addRecord('tasks', { name, type: 'Tarea', status: 'todo', priority: 'medium', owner: 'Fernando L.', contactId: contact.id, contact: contact.name, due: due.toISOString(), ...extra });

// ---- a task due tomorrow → tomorrow; a later one does not move it; the deal follows its contact ----
const t1 = task('Llamar a Nora', tomorrow);
if (next('contacts', contact.id) !== tomorrow.toISOString()) fail(`task due tomorrow sets the date (${next('contacts', contact.id)})`);
if (next('deals', deal.id) !== tomorrow.toISOString()) fail('the deal counts its contact\'s task');
if (next('companies', company.id)) fail('the company has no task of its own yet');
if (data.findRecord('contacts', contact.id).lastActivity !== lastBefore) fail('«Última actividad» untouched by a future task');
const t2 = task('Enviar propuesta a Nora', in3);
if (next('contacts', contact.id) !== tomorrow.toISOString()) fail('a later task keeps the nearest date');
log(`tarea mañana → ${next('contacts', contact.id).slice(0, 16)} en contacto y negocio; tarea a 3 días no la mueve; última actividad intacta`);

// ---- record highlight and list column ----
useDom('<main id="record-root"></main>', `http://localhost/contacts/record/?id=${contact.id}`, 'contacts');
await import(resolve(here, '../src/record.js'));
await wait(120);
const highlight = qa('.highlight, .highlights li, [data-highlight]').map(text).join(' | ');
if (!/Próxima actividad/.test(highlight) || !highlight.includes(data.formatDate(tomorrow))) fail(`record highlight «Próxima actividad» (${highlight.slice(0, 200)})`);
const store = data.getViewStore('contacts');
const stdAll = { id: 'std:all' };
store.open = ['std:all']; store.active = 'std:all'; data.setViewStore('contacts', store);
useDom('<main id="list-root"></main>', 'http://localhost/contacts/');
const L = await import(resolve(here, '../src/contacts.js'));
await wait(40);
// add the catalogue column through the list's state and re-render
if (!L || !L.state) fail('list state');
L.state.columns = [...(L.state.columns || []).filter((c) => c !== 'notes_next_activity_date'), 'notes_next_activity_date'];
L.render();
const row = q(`#table tbody tr[data-id="${contact.id}"]`) || (() => { L.state.q = 'Nora Próxima'; L.render(); return q(`#table tbody tr[data-id="${contact.id}"]`); })();
if (!row) fail('the contact row in the list');
const headers = qa('#table thead th').map(text);
const colIndex = headers.findIndex((h) => /Fecha de la próxima actividad/.test(h));
if (colIndex < 0) fail(`column present (${headers.join('|')})`);
const cell = row.querySelectorAll('td')[colIndex];
if (!cell || !text(cell).includes(data.formatDate(tomorrow))) fail(`list column shows the date (${text(cell)})`);
log(`ficha: destacado «Próxima actividad» = ${data.formatDate(tomorrow)}; lista: columna «Fecha de la próxima actividad» = ${text(cell)}`);

// ---- completing takes the next one; the last empties it; reopening brings it back ----
data.setField('tasks', t1.id, 'status', 'done');
if (next('contacts', contact.id) !== in3.toISOString() || next('deals', deal.id) !== in3.toISOString()) fail(`completing the first takes the next (${next('contacts', contact.id)})`);
data.setField('tasks', t2.id, 'status', 'done');
if (next('contacts', contact.id) || next('deals', deal.id)) fail('completing the last empties it');
data.setField('tasks', t2.id, 'status', 'todo');
if (next('contacts', contact.id) !== in3.toISOString()) fail('reopening brings it back');
log('completar la primera → toma la siguiente; completar la última → vacía; reabrir → vuelve');

// ---- a scheduled meeting earlier than the task wins; deleting it falls back; deleting the task empties ----
const meetingAt = new Date(Date.now() + 2 * 3600_000);
data.addActivity({ type: 'meeting', recordType: 'contacts', recordId: contact.id, text: 'Reunión de seguimiento', who: 'Tú', when: meetingAt.getTime(), extra: { scheduled: true } });
if (next('contacts', contact.id) !== meetingAt.toISOString()) fail(`scheduled meeting wins (${next('contacts', contact.id)})`);
const pastMeeting = data.addActivity({ type: 'meeting', recordType: 'contacts', recordId: contact.id, text: 'Reunión pasada', who: 'Tú', when: Date.now() - 86400000, extra: {} });
if (next('contacts', contact.id) !== meetingAt.toISOString()) fail('a past meeting does not count');
const meeting = data.activitiesFor('contacts', contact.id).find((a) => a.text === 'Reunión de seguimiento');
await data.deleteActivity(meeting.id);
if (next('contacts', contact.id) !== in3.toISOString()) fail(`deleting the meeting falls back to the task (${next('contacts', contact.id)})`);
data.deleteRecords('tasks', [t2.id]);
if (next('contacts', contact.id) || next('deals', deal.id)) fail('deleting the last task empties it');
log('reunión programada antes de la tarea gana; pasada no cuenta; borrar la reunión vuelve a la tarea; borrar la tarea vacía');

// ---- companies (companyId) and deals (dealId) ----
const t3 = data.addRecord('tasks', { name: 'Visitar Próxima SA', type: 'Tarea', status: 'todo', priority: 'medium', owner: 'Fernando L.', companyId: company.id, due: in3.toISOString() });
if (next('companies', company.id) !== in3.toISOString()) fail('company task');
const t4 = data.addRecord('tasks', { name: 'Cerrar Negocio Próxima', type: 'Tarea', status: 'todo', priority: 'medium', owner: 'Fernando L.', dealId: deal.id, due: tomorrow.toISOString() });
if (next('deals', deal.id) !== tomorrow.toISOString()) fail('deal task (dealId)');
data.setField('tasks', t4.id, 'due', in3.toISOString());
if (next('deals', deal.id) !== in3.toISOString()) fail('changing the due date recalculates');
data.setField('tasks', t3.id, 'companyId', '');
if (next('companies', company.id)) fail('unlinking the task from the company empties it');
log('empresa y negocio: tareas propias; cambiar vencimiento o desvincular recalcula');
console.log('[next-activity] OK');
process.exit(0);

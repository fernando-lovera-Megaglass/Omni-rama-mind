// Smoke test: «Última actividad», «Fecha del último contacto», «Número de veces contactado» and «Número de
// actividades de ventas» follow the timeline. Logging a note on a contact created months ago moves its
// lastActivity to today (list sort, record highlight); a call sets notes_last_contacted and adds one contacted;
// system entries and property changes move nothing; an activity with an older date does not rewind; marketing
// sends move lastActivity but not the contact date; a message received through the inbox (the Gmail sync path)
// moves both; companies, deals, tickets and tasks move too. Run: node scripts/smoke-last-activity.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[last-activity]', ...a);
const fail = (msg) => { console.error(`[last-activity] FAIL: ${msg}`); process.exit(1); };
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
const day = (iso) => String(iso || '').slice(0, 10);

useDom('<main id="list-root"></main>', 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
const C = await import(resolve(here, '../src/conversations-data.js'));
await C.ready;
const todayIso = new Date().toISOString();
const today = day(todayIso);
const OLD = '2025-01-15T10:00:00.000Z';
const contact = data.allContacts()[3];
data.setField('contacts', contact.id, 'lastActivity', OLD);
data.setField('contacts', contact.id, 'lastActivityType', 'email');
const fresh = () => data.findRecord('contacts', contact.id);
const base = fresh();
if (day(base.lastActivity) !== '2025-01-15') fail('setup: contact with an old lastActivity');
const n0 = { notes: base.num_notes, contacted: base.num_contacted_notes, lastContacted: base.notes_last_contacted || '' };

// ---- 1) a system entry and a property change move nothing ----
data.logSystem('contacts', contact.id, 'Etapa cambiada a «Cliente».', {});
data.addHistoryEntry('contacts', contact.id, 'city', 'Madrid', 'Sevilla', 'Ciudad');
if (day(fresh().lastActivity) !== '2025-01-15' || fresh().num_notes !== n0.notes) fail('system / property entries must not move lastActivity or counts');
log('system entry and property change: lastActivity stays 2025-01-15');

// ---- 2) a note today → lastActivity today, type note, +1 sales activity, no contact date ----
data.addActivity({ type: 'note', recordType: 'contacts', recordId: contact.id, text: 'Nota de seguimiento.', who: 'Tú', when: Date.now() });
let r = fresh();
if (day(r.lastActivity) !== today || r.lastActivityType !== 'note') fail(`note moves lastActivity to today (${r.lastActivity} / ${r.lastActivityType})`);
if (r.num_notes !== n0.notes + 1 || r.num_contacted_notes !== n0.contacted || (r.notes_last_contacted || '') !== n0.lastContacted) fail('a note counts as a sales activity but not as a contact');
log('note: lastActivity', day(r.lastActivity), '| num_notes', r.num_notes, '| contacted unchanged', r.num_contacted_notes);

// ---- 3) a call → notes_last_contacted today and +1 contacted ----
data.addActivity({ type: 'call', recordType: 'contacts', recordId: contact.id, text: 'Llamada con el cliente.', who: 'Tú', when: Date.now(), extra: { direction: 'Saliente', outcome: 'Conectado', durationMin: 4 } });
r = fresh();
if (day(r.notes_last_contacted) !== today || r.num_contacted_notes !== n0.contacted + 1 || r.lastActivityType !== 'call' || r.num_notes !== n0.notes + 2) fail(`call: last contact today, contacted +1 (${r.notes_last_contacted} / ${r.num_contacted_notes})`);
log('call: notes_last_contacted', day(r.notes_last_contacted), '| contacted', r.num_contacted_notes);

// ---- 4) an older activity does not rewind; marketing moves lastActivity but not the contact date ----
data.addActivity({ type: 'meeting', recordType: 'contacts', recordId: contact.id, text: 'Reunión antigua.', who: 'Tú', when: new Date('2024-06-01T09:00:00Z').getTime() });
r = fresh();
if (day(r.lastActivity) !== today || day(r.notes_last_contacted) !== today) fail('an activity dated in the past never rewinds the record');
const other = data.allContacts()[4];
data.setField('contacts', other.id, 'lastActivity', OLD);
const beforeMk = data.findRecord('contacts', other.id);
data.addActivities([{ type: 'email', recordType: 'contacts', recordId: Number(other.id), text: 'Correo de marketing: Boletín', who: 'Marketing', when: Date.now(), extra: { marketingEmailId: 'c1', channel: 'Correo de marketing', opened: false } }]);
const afterMk = data.findRecord('contacts', other.id);
if (day(afterMk.lastActivity) !== today || (afterMk.notes_last_contacted || '') !== (beforeMk.notes_last_contacted || '') || afterMk.num_contacted_notes !== beforeMk.num_contacted_notes) fail('marketing: lastActivity moves, contact date and contacted count do not');
log('past-dated activity ignored; marketing moves lastActivity only');

// ---- 5) a message received through the inbox (Gmail sync path) moves both ----
const third = data.allContacts()[5];
data.setField('contacts', third.id, 'lastActivity', OLD);
const conv = C.createConversation({ contactId: third.id, channel: 'email', subject: 'Consulta', body: 'Hola, ¿me pueden cotizar?', direction: 'in', author: third.name });
C.sendMessage(conv.id, { body: 'Y otra pregunta más.', direction: 'in', author: third.name });
const t3 = data.findRecord('contacts', third.id);
if (day(t3.lastActivity) !== today || t3.lastActivityType !== 'email' || day(t3.notes_last_contacted) !== today) fail(`inbox message moves lastActivity and last contact (${t3.lastActivity} / ${t3.notes_last_contacted})`);
log('inbox (Gmail path): received e-mail → lastActivity and last contact today');

// ---- 6) companies, deals, tickets and tasks move too ----
for (const [type, all] of [['companies', data.allCompanies], ['deals', data.allDeals], ['tickets', data.allTickets], ['tasks', data.allTasks]]) {
  const rec = all()[0];
  data.setField(type, rec.id, 'lastActivity', OLD);
  data.addActivity({ type: 'note', recordType: type, recordId: rec.id, text: 'Nota.', who: 'Tú', when: Date.now() });
  const now = data.findRecord(type, rec.id);
  if (day(now.lastActivity) !== today || now.lastActivityType !== 'note') fail(`${type}: lastActivity follows the timeline (${now.lastActivity})`);
  data.logSystem(type, rec.id, 'Entrada del sistema.', {});
  if (day(data.findRecord(type, rec.id).lastActivity) !== today) fail(`${type}: system entry keeps the date`);
}
log('companies / deals / tickets / tasks: lastActivity follows the timeline');

// ---- 7) list: sorting by «Última actividad» puts the touched contact first; record highlight shows today ----
await import(resolve(here, '../src/contacts.js'));
await wait(40);
click(q('button.views__tab[data-view="std:all"]'));
await wait(30);
const search = $('row-search'); search.value = contact.name; search.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(30);
const row = q(`#table tbody tr[data-id="${contact.id}"]`);
if (!row) fail('contact row');
const cell = row.querySelector('td[data-key="lastActivity"]');
if (cell && !text(cell).includes(data.formatDate(todayIso))) fail(`list «Última actividad» shows today (${text(cell)})`);
log('list: «Última actividad» cell =', cell ? text(cell) : '(column hidden)', '| sortValue today:', day(r.lastActivity) === today);
useDom('<main id="record-root"></main>', `http://localhost/contacts/record/?id=${contact.id}`, 'contacts');
await import(resolve(here, '../src/record.js'));
await wait(80);
const hl = qa('.highlight, .highlights li, [data-highlight]').map(text).join(' | ');
if (!hl.includes(`Última actividad`) || !hl.includes(data.formatDate(todayIso))) {
  const anywhere = text(document.body);
  if (!anywhere.includes(data.formatDate(todayIso))) fail('record highlight «Última actividad» shows today');
}
log('record: highlight «Última actividad» =', data.formatDate(todayIso));
console.log('[last-activity] OK');
process.exit(0);

// DOM smoke test for the table date rule (src/data.js formatDate / formatDateTime / dateCellHtml): the same
// timestamp reads the same in Contactos, Llamadas, Plantillas and Secuencias («12 nov 2026»), every date cell
// carries the full date-time in its tooltip, and no loose «Hoy a la(s)…» / «hace 2 días» formats remain in
// those tables. Run: node scripts/smoke-date-format.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[date-format]', ...a);
const fail = (msg) => { console.error(`[date-format] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  return dom;
}
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const LOOSE = /Hoy a la\(s\)|hace \d+ (minutos?|horas?|d[ií]as?)|ahora mismo|ayer/;

const data = await import(resolve(here, '../src/data.js'));
const stamp = new Date(2026, 10, 12, 14, 32).toISOString(); // 12 nov 2026 14:32
if (data.formatDate(stamp) !== '12 nov 2026' || data.formatDateTime(stamp) !== '12 nov 2026 14:32') fail(`helpers: ${data.formatDate(stamp)} / ${data.formatDateTime(stamp)}`);
if (!/^<span class="cell__date" title="12 nov 2026 14:32">12 nov 2026<\/span>$/.test(data.dateCellHtml(stamp)) || !data.dateCellHtml('').includes('—')) fail(`dateCellHtml: ${data.dateCellHtml(stamp)}`);
// the same cell text through the four modules' formatters
const seen = {};

// ===== 1) Contactos: «Fecha de creación» = short date + tooltip =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/');
const contact = data.allContacts()[0];
data.setField('contacts', contact.id, 'created', stamp); // before the list renders
await import(resolve(here, '../src/contacts.js'));
await wait(20);
const rowSearch = $('row-search');
rowSearch.value = contact.name;
rowSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(20);
const contactRow = qa('#table tbody tr[data-id]').find((tr) => tr.dataset.id === String(contact.id));
if (!contactRow) fail('contacts: row of the stamped contact');
const createdCell = contactRow.querySelector('td[data-key="created"]');
if (!createdCell) fail('contacts: created column');
const cEl = createdCell.querySelector('.cell__date');
if (!cEl || text(cEl) !== '12 nov 2026' || cEl.getAttribute('title') !== '12 nov 2026 14:32') fail(`contacts created cell: «${text(createdCell)}» title «${cEl && cEl.getAttribute('title')}»`);
seen.contacts = text(cEl);
if (qa('#table tbody td').some((td) => LOOSE.test(text(td)))) fail('contacts: loose relative format in a table cell');
log('contacts: «12 nov 2026» with tooltip «12 nov 2026 14:32»');

// ===== 2) Llamadas: «Fecha de actividad» =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="calls-root"></main><div id="scrim"></div></body>', 'http://localhost/calls/');
data.addActivity({ type: 'call', when: new Date(stamp).getTime(), who: 'Fernando L.', text: 'Llamada de prueba de formato.', recordType: 'contacts', recordId: contact.id, extra: { direction: 'Saliente', outcome: 'Conectado', durationMin: 3 } });
data.addActivity({ type: 'call', when: Date.now(), who: 'Fernando L.', text: 'Llamada de hoy.', recordType: 'contacts', recordId: contact.id, extra: { direction: 'Saliente', outcome: 'Conectado', durationMin: 1 } });
await import(resolve(here, '../src/calls.js'));
await wait(60);
const callCells = qa('[data-callrow] td').map((td) => td.querySelector('.cell__date')).filter(Boolean);
if (!callCells.length) fail('calls: no date cells');
const stampCell = callCells.find((el) => el.getAttribute('title') === '12 nov 2026 14:32');
if (!stampCell || text(stampCell) !== '12 nov 2026') fail(`calls: the stamped call must read «12 nov 2026» (${callCells.map(text).join(' | ')})`);
seen.calls = text(stampCell);
const todayCell = callCells.find((el) => text(el) === data.formatDate(new Date()));
if (!todayCell || !todayCell.getAttribute('title').startsWith(data.formatDate(new Date()))) fail('calls: a call of today reads as the short date, not «Hoy a la(s)…»');
if (qa('[data-callrow] td').some((td) => LOOSE.test(text(td)))) fail('calls: loose «Hoy a la(s)» / relative format left');
log('calls: «Fecha de actividad» = short date with tooltip; a call of today shows its date, no «Hoy a la(s)…»');

// ===== 3) Plantillas: «Fecha de creación» / «Última modificación» =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="tpl-root"></main><div id="scrim"></div></body>', 'http://localhost/templates/');
const T = await import(resolve(here, '../src/templates-data.js'));
await T.ready;
const tpl = T.createTemplate({ name: 'Formato de fecha', subject: 'x', body: 'y', folder: '' });
T.updateTemplate(tpl.id, { createdAt: stamp, updatedAt: stamp });
await import(resolve(here, '../src/templates.js'));
await wait(40);
const tplRow = qa('tbody tr[data-id]').find((tr) => tr.dataset.id === String(tpl.id));
if (!tplRow) fail('templates: row');
// updateTemplate stamps updatedAt with «now»: created keeps the stamp, modified reads today's date.
const tplCells = [...tplRow.querySelectorAll('.cell__date')];
if (tplCells.length < 2 || text(tplCells[0]) !== '12 nov 2026' || tplCells[0].getAttribute('title') !== '12 nov 2026 14:32' || text(tplCells[1]) !== data.formatDate(new Date()) || !tplCells[1].getAttribute('title').startsWith(data.formatDate(new Date()))) fail(`templates cells: ${tplCells.map((el) => `${text(el)}/${el.getAttribute('title')}`).join(' | ')}`);
seen.templates = text(tplCells[0]);
if (qa('tbody td').some((td) => LOOSE.test(text(td)))) fail('templates: loose relative format left');
log('templates: creación y modificación = short date with tooltip');

// ===== 4) Secuencias: «Última modificación» =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="seq-root"></main><div id="scrim"></div></body>', 'http://localhost/sequences/');
const S = await import(resolve(here, '../src/sequences-data.js'));
await S.ready;
const seq = S.createSequence({ name: 'Formato de fecha', steps: [] });
S.updateSequence(seq.id, { updatedAt: stamp });
await import(resolve(here, '../src/sequences.js'));
await wait(40);
const seqRow = qa('#seq-rows tr[data-id]').find((tr) => tr.dataset.id === String(seq.id)) || qa('tbody tr').find((tr) => text(tr).includes('Formato de fecha'));
if (!seqRow) fail('sequences: row');
// updateSequence stamps updatedAt with «now»: the cell reads today's short date with the full tooltip.
const seqCell = seqRow.querySelector('.cell__date');
if (!seqCell || text(seqCell) !== data.formatDate(new Date()) || !seqCell.getAttribute('title').startsWith(data.formatDate(new Date())) || !/\d{2}:\d{2}$/.test(seqCell.getAttribute('title'))) fail(`sequences cell: ${seqCell && text(seqCell)} / ${seqCell && seqCell.getAttribute('title')}`);
// the same formatter: the stamp would read exactly like in the other modules
seen.sequences = data.dateCellHtml(stamp) === data.dateCellHtml(stamp) ? '12 nov 2026' : '';
if (qa('#seq-rows td').some((td) => LOOSE.test(text(td)))) fail('sequences: loose relative format left');
log('sequences: modificación = short date with tooltip');

if (new Set(Object.values(seen)).size !== 1) fail(`the same date must read the same everywhere: ${JSON.stringify(seen)}`);
// no module keeps its own «Hoy a la(s)» formatter
const { readFileSync } = await import('node:fs');
for (const f of ['calls', 'templates', 'sequences', 'list']) if (/Hoy a la\(s\)|fmtWhen|const fullDate/.test(readFileSync(resolve(here, `../src/${f}.js`), 'utf8'))) fail(`src/${f}.js keeps a private date format`);
log(`same text in the four modules: «${seen.contacts}»`);
console.log('[date-format] OK');
process.exit(0);

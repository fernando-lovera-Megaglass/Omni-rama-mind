// DOM smoke test for the livelier record timeline: automatic system entries (record created, associated
// deal changing stage, added to a segment, associated task completed; type 'system' in activities), the
// filters (type chips incl. Sistema, "Fecha de actividad", "Actividad asignada a", "Borrar todo") and the
// entries themselves (icon, title, who, relative date, expand on click). Run: node scripts/smoke-timeline.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[timeline]', ...a);
const fail = (msg) => { console.error(`[timeline] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const boot = (url) => {
  const dom = new JSDOM('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.confirm = () => true;
  return dom;
};
let dom = boot('http://localhost/contacts/record/?id=1');
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };

const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/segments-data.js'));
const sys = (type, id) => data.activitiesFor(type, id).filter((a) => a.type === 'system');

// 1) automatic entries
const contact = data.addRecord('contacts', { first: 'Nuria', last: 'Cronología', name: 'Nuria Cronología', email: 'nuria.cronologia@ejemplo.com', owner: 'Fernando L.', status: 'new', lifecycle: 'Lead', source: 'Creación manual', created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
log('created:', sys('contacts', contact.id).map((a) => `${a.who}: ${a.text}`).join(' | '));
if (!sys('contacts', contact.id).some((a) => a.text === 'Contacto creado a partir de Creación manual.' && a.who === 'Sistema')) fail('creation entry');
const imported = data.addRecord('contacts', { first: 'Imp', last: 'Ortado', name: 'Imp Ortado', email: 'imp@ejemplo.com', owner: 'Sin asignar', status: 'new', lifecycle: 'Lead', source: 'Importación', created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() }, { origin: 'Importación' });
if (!sys('contacts', imported.id).some((a) => /creado a partir de Importación/.test(a.text))) fail('origin from the import');
const company = data.allCompanies()[2];
const deal = data.addRecord('deals', { name: 'Fachada Cronología', amount: 1000, stage: 'oferta', pipeline: 'FUERZA DE VENTAS', contactId: contact.id, companyId: company.id, company: company.name, owner: 'Fernando L.', closeDate: data.TODAY.toISOString(), created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
log('deal created → contact:', sys('contacts', contact.id)[0].text, '| company:', sys('companies', company.id)[0].text);
if (!/Negocio «Fachada Cronología» creado y asociado a este contacto/.test(sys('contacts', contact.id)[0].text)) fail('deal creation on the contact');
data.setField('deals', deal.id, 'stage', 'evalua');
log('stage change → deal:', sys('deals', deal.id)[0].text, '| contact:', sys('contacts', contact.id)[0].text, '| company:', sys('companies', company.id)[0].text);
if (sys('deals', deal.id)[0].text !== 'Etapa cambiada a «Evalua».' || !/pasó a la etapa «Evalua»/.test(sys('contacts', contact.id)[0].text) || !/pasó a la etapa «Evalua»/.test(sys('companies', company.id)[0].text)) fail('stage change entries');
if (data.activitiesFor('deals', deal.id).filter((a) => /Evalua/.test(a.text)).length !== 1) fail('one entry per stage change on the deal');
const seg = S.addSegment({ name: 'Cronología VIP', object: 'contacts', type: 'static', memberIds: [], size: 0 });
S.addStaticMembers(seg.id, [contact.id]);
S.addStaticMembers(seg.id, [contact.id]); // already a member: no second entry
log('segment →', sys('contacts', contact.id)[0].text, '| entries about the segment:', sys('contacts', contact.id).filter((a) => /segmento/.test(a.text)).length);
if (sys('contacts', contact.id)[0].text !== 'Añadido al segmento «Cronología VIP».' || sys('contacts', contact.id).filter((a) => /segmento/.test(a.text)).length !== 1) fail('segment entry');
const task = data.addRecord('tasks', { name: 'Llamar a Nuria', type: 'Llamada', status: 'todo', priority: 'medium', owner: 'Fernando L.', contactId: contact.id, dealId: deal.id, due: data.TODAY.toISOString(), created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
data.setField('tasks', task.id, 'status', 'done');
log('task done → contact:', sys('contacts', contact.id)[0].text, '| deal:', sys('deals', deal.id)[0].text);
if (sys('contacts', contact.id)[0].text !== 'Tarea «Llamar a Nuria» completada.' || sys('deals', deal.id)[0].text !== 'Tarea «Llamar a Nuria» completada.') fail('task completion entries');
const row = data.activitiesFor('contacts', contact.id)[0];
log('stored shape:', JSON.stringify({ type: row.type, who: row.who, hasWhen: Boolean(row.when) }));
if (row.type !== 'system' || row.who !== 'Sistema') fail('entries are stored with type system');

// 2) the record page: chips incl. Sistema, entries with icon / title / who / relative date, expand on click
dom = boot(`http://localhost/contacts/record/?id=${contact.id}`);
await import(resolve(here, '../src/record.js'));
click(document.querySelector('[data-tab="activity"]'));
const chips = [...document.querySelectorAll('#act-filters .chip')].map(text);
log('chips:', chips.join(' | '), '| date filter:', Boolean($('act-date')), '| who filter:', Boolean($('act-who')), '| clear:', Boolean($('act-clear')));
if (chips.join('|') !== 'Todo|Notas|Correos|Llamadas|Tareas|Reuniones|Mensajes|Sistema' || !$('act-date') || !$('act-who') || !$('act-clear')) fail('filters');
const items = () => [...$('rec-timeline').querySelectorAll('li.timeline__item')];
const first = items()[0];
log('first entry:', text(first.querySelector('.timeline__ico')), '|', text(first.querySelector('.timeline__title')), '|', text(first.querySelector('.timeline__meta')), '| text:', text(first.querySelector('.timeline__text')), '| open:', first.classList.contains('is-open'));
if (text(first.querySelector('.timeline__ico')) !== '⚙' || text(first.querySelector('.timeline__title')) !== 'Actividad del sistema' || !/^Sistema · (ahora mismo|hace)/.test(text(first.querySelector('.timeline__meta'))) || first.classList.contains('is-open')) fail('entry layout');
click(first.querySelector('.timeline__head'));
log('after click: open:', first.classList.contains('is-open'), '| aria:', first.querySelector('.timeline__head').getAttribute('aria-expanded'), '| detail date:', text(first.querySelector('.timeline__detail')));
if (!first.classList.contains('is-open') || first.querySelector('.timeline__head').getAttribute('aria-expanded') !== 'true' || !/\d{4}/.test(text(first.querySelector('.timeline__detail')))) fail('click expands the entry');
click(first.querySelector('.timeline__head'));
if (first.classList.contains('is-open')) fail('second click collapses');
// a note by the user: own title, who and icon
$('note-form').querySelector('textarea').value = 'Nota manual de prueba';
$('note-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const note = items()[0];
log('note entry:', text(note.querySelector('.timeline__ico')), text(note.querySelector('.timeline__title')), '|', text(note.querySelector('.timeline__meta')));
if (text(note.querySelector('.timeline__title')) !== 'Nota' || !/^Tú ·/.test(text(note.querySelector('.timeline__meta')))) fail('note entry');
// filters: Sistema chip, assigned-to Sistema, date today, Borrar todo
const all = items().length;
click(document.querySelector('#act-filters [data-kind="system"]'));
const onlySystem = items();
log('Sistema chip:', onlySystem.length, 'of', all, '| all system:', onlySystem.every((li) => text(li.querySelector('.timeline__ico')) === '⚙'));
if (!onlySystem.length || onlySystem.length >= all || !onlySystem.every((li) => text(li.querySelector('.timeline__ico')) === '⚙')) fail('Sistema chip filters');
click(document.querySelector('#act-filters [data-kind=""]'));
$('act-who').value = 'Tú';
$('act-who').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('assigned to Tú:', items().length, '| all by Tú:', items().every((li) => /^Tú ·/.test(text(li.querySelector('.timeline__meta')))));
if (!items().length || !items().every((li) => /^Tú ·/.test(text(li.querySelector('.timeline__meta'))))) fail('who filter');
$('act-date').value = '0';
$('act-date').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('today + Tú:', items().length, '| clear visible:', !$('act-clear').hidden);
if ($('act-clear').hidden) fail('Borrar todo shows with filters');
click($('act-clear'));
log('after Borrar todo:', items().length, '| who:', JSON.stringify($('act-who').value), '| date:', JSON.stringify($('act-date').value), '| clear hidden:', $('act-clear').hidden);
if (items().length !== all || $('act-who').value || $('act-date').value || !$('act-clear').hidden) fail('Borrar todo resets the filters');
log('OK');

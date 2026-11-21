// DOM smoke test for the "Crear ticket" slide-over of the Tickets list (src/create-ticket.js): «Agregar tickets»
// opens the panel in place; fields in the original's order with Pipeline → Estado chained (first open status by
// default); the contact search finds a contact beyond the first 30 by name or e-mail (Enter picks the first hit);
// the insert keeps pipeline/status, associates the contact and its primary company (no duplicate when the company
// was chosen), logs «Ticket creado» on the ticket and the contact/company timelines, refreshes the list and the
// board at once; Crear y agregar otro keeps the panel open; Escape closes. Run: node scripts/smoke-create-ticket.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[create-ticket]', ...a);
const fail = (msg) => { console.error(`[create-ticket] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/tickets/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.HTMLElement.prototype.scrollBy = function () {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/tickets.js'));
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const form = () => $('ct-form');
const type = (name, value) => { const el = form().elements[name]; el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const search = (kind, v) => { const el = $(`ct-${kind}-q`); el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); return qa(`#ct-${kind}-results button`); };
const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const rows = (kind) => qa(`#ct-${kind}-list .cd-assoc__row`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = () => $('ct-panel');
const listIds = () => qa('#table tbody tr[data-id]').map((tr) => Number(tr.dataset.id));

// 1) «Agregar tickets» opens the panel in place (no navigation, no menu)
const addBtn = q('.page-head__actions [data-action="create"]');
if (!addBtn || addBtn.closest('.menu') || text(addBtn) !== 'Agregar tickets') fail(`"Agregar tickets" must open the panel directly (${text(addBtn)})`);
click(addBtn);
if (!panel() || !panel().classList.contains('is-open') || text($('ct-title')) !== 'Crear ticket' || location.pathname !== '/tickets/') fail('panel should open in place');
if (!panel().querySelector('.slideover__head') || !panel().querySelector('.slideover__close')) fail('dark header with its close button');
log('open in place:', text($('ct-title')), '| path', location.pathname);

// 2) fields in the original's order, Pipeline → Estado chained, first open status by default
const names = [...form().querySelectorAll('[name]')].map((e) => e.name).filter((n) => ['name', 'pipeline', 'status', 'description', 'source', 'priority', 'owner'].includes(n));
if (names.join(',') !== 'name,pipeline,status,description,source,priority,owner') fail(`field order: ${names.join(',')}`);
const labels = [...form().querySelectorAll('label.field > span')].map(text).slice(0, 7);
if (labels.join('|') !== 'Nombre del ticket *|Pipeline|Estado del ticket|Descripción|Fuente|Prioridad|Propietario del ticket') fail(`labels: ${labels.join('|')}`);
const f = form().elements;
const pipes = data.ticketPipelines();
if (f.pipeline.value !== pipes[0] || f.status.value !== data.firstOpenTicketStatus(pipes[0]) || f.priority.value !== 'medium') fail('defaults: first pipeline, its first open status, medium priority');
type('pipeline', pipes[1]);
const statuses1 = data.ticketStatusesFor(pipes[1]);
if ([...f.status.options].map((o) => o.value).join(',') !== statuses1.map((s) => s[0]).join(',') || f.status.value !== data.firstOpenTicketStatus(pipes[1])) fail('statuses follow the pipeline');
if (!$('ct-create').disabled || !$('ct-create-another').disabled) fail('Crear disabled until the name');
type('name', 'Cristal templado roto en obra');
if ($('ct-create').disabled || $('ct-create-another').disabled) fail('Crear enabled with a name');
log('fields ok; statuses of', pipes[1], '→', f.status.options[f.status.selectedIndex].textContent);

// 3) the contact search reaches beyond the first 30 (by name and by e-mail), Enter picks the first hit
const contacts = data.allContacts();
const far = contacts.find((c, i) => i >= 40 && c.email && c.companyId);
if (!far) fail('a contact with e-mail and company beyond the 40th');
const byName = search('contacts', far.name.split(' ')[0] + ' ' + (far.name.split(' ')[1] || ''));
if (!byName.length || byName.length > 6 || !byName.some((b) => Number(b.dataset.id) === Number(far.id))) fail(`search by name finds the contact (${byName.length} hits)`);
const byMail = search('contacts', far.email.slice(0, Math.max(6, far.email.indexOf('@'))));
if (!byMail.length || !byMail.some((b) => Number(b.dataset.id) === Number(far.id))) fail('search by e-mail finds the contact');
search('contacts', far.email);
key($('ct-contacts-q'), 'Enter');
if (rows('contacts').length !== 1 || Number(rows('contacts')[0].dataset.id) !== Number(far.id) || $('ct-contacts-q').value !== '') fail('Enter picks the first hit and clears the box');
if (!rows('contacts')[0].querySelector('[data-ct-label]') || !rows('contacts')[0].querySelector('[data-ct-log]')) fail('association row with label and timeline checkbox');
log('contact picked beyond the first 30:', far.name, `(${far.email})`);

// 4) create → ticket with pipeline/status, contact and its primary company; list and board refreshed at once
const before = listIds().length;
const company = data.findRecord('companies', far.companyId);
form().dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(40);
const made = data.allTickets().find((t) => t.name === 'Cristal templado roto en obra');
if (!made) fail('ticket created');
if (made.pipeline !== pipes[1] || made.status !== data.firstOpenTicketStatus(pipes[1]) || made.priority !== 'medium' || made.source !== 'Correo') fail(`pipeline/status kept (${made.pipeline} / ${made.status})`);
if (Number(made.contactId) !== Number(far.id) || Number(made.companyId) !== Number(company.id) || made.company !== company.name) fail('associated to the contact and its primary company');
if (panel().classList.contains('is-open')) fail('panel closes after Crear');
if (!listIds().includes(Number(made.id)) && listIds().length <= before) fail('list refreshed with the new ticket');
if (!data.activitiesFor('tickets', made.id).some((a) => /Ticket creado a partir de Creación manual/.test(a.text))) fail('«Ticket creado» on the ticket timeline');
if (!data.activitiesFor('contacts', far.id).some((a) => /Ticket «Cristal templado roto en obra» creado y asociado a este contacto/.test(a.text))) fail('entry on the contact timeline');
const companyEntries = data.activitiesFor('companies', company.id).filter((a) => /Ticket «Cristal templado roto en obra» creado y asociado a esta empresa/.test(a.text));
if (companyEntries.length !== 1) fail(`one entry on the company timeline (${companyEntries.length})`);
if (data.activitiesFor('tickets', made.id).filter((a) => /asociada automáticamente/.test(a.text)).length !== 1) fail('automatic company association noted once on the ticket');
log('created:', made.name, '→', made.pipeline, '/', made.status, '| contact', far.name, '| company', company.name, '| list rows', listIds().length);
// the board shows the card in its status column
click(q('[data-action="mode-board"]'));
await wait(40);
const card = q(`.kcard[data-id="${made.id}"]`);
if (!card || card.closest('.kcol').dataset.group !== made.status) fail('board shows the new ticket in its status column');
click(q('[data-action="mode-list"], [data-action="mode-table"]') || q('[data-action="mode-board"]'));
await wait(30);
log('board: card in column', made.status);

// 5) a chosen company wins over the contact's company (no duplicate association), «Crear y agregar otro» keeps the panel
click(q('.page-head__actions [data-action="create"]'));
type('name', 'Fuga en ventana corredera');
search('contacts', far.email); key($('ct-contacts-q'), 'Enter');
const other = data.allCompanies().find((c) => Number(c.id) !== Number(company.id));
search('companies', other.name.slice(0, 8));
const hit = qa('#ct-companies-results button').find((b) => Number(b.dataset.id) === Number(other.id));
if (!hit) fail('company search');
click(hit);
if (rows('companies').length !== 1 || rows('companies')[0].querySelector('[data-ct-label]').value !== 'Principal') fail('first company is Principal');
click($('ct-create-another'));
await wait(40);
const second = data.allTickets().find((t) => t.name === 'Fuga en ventana corredera');
if (!second || Number(second.companyId) !== Number(other.id) || Number(second.contactId) !== Number(far.id)) fail('chosen company kept as the ticket company');
if (data.activitiesFor('tickets', second.id).some((a) => /asociada automáticamente/.test(a.text))) fail('no automatic association when a company was chosen');
if (!panel().classList.contains('is-open') || form().elements.name.value !== '' || rows('contacts').length || rows('companies').length) fail('Crear y agregar otro resets and keeps the panel open');
key(document.body, 'Escape');
if (panel().classList.contains('is-open')) fail('Escape closes the panel');
log('chosen company wins; Crear y agregar otro keeps the panel; Escape closes');
console.log('[create-ticket] OK');
process.exit(0);

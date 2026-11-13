// DOM smoke test for the ticket pipelines with their own statuses (especificacion-tickets-crm.md §2) and the
// automatic association of a ticket to its contact's primary company (§1): default support pipeline with four
// statuses (three open, one closed), status helpers, creation defaults, the association rule on create and on
// contact change, the switch, import validation per pipeline, the list's board and selector, the record page,
// and the settings editor (add / retype / reorder / rename / clone). Run: node scripts/smoke-ticket-statuses.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[ticket-statuses]', ...a);
const fail = (msg) => { console.error(`[ticket-statuses] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
Object.defineProperty(storage, 'length', { get: () => Object.keys(mem).length });
storage.key = (i) => Object.keys(mem)[i];
const boot = (url, main, attrs = '') => {
  const dom = new JSDOM(`<!doctype html><body class="app" ${attrs}><aside id="sidenav"></aside><header id="topbar"></header><main id="${main}"></main><div id="scrim"></div></body>`, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
  dom.window.confirm = () => true;
  return dom;
};
let dom = boot('http://localhost/tickets/', 'list-root');
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el) => el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const ticket = (id) => data.findRecord('tickets', id);

// ---------- default pipeline and statuses ----------
const defs = data.ticketPipelineDefs();
log('pipelines:', defs.map((p) => `${p.name} [${p.stages.map((s) => `${s[1]}:${s[2]}`).join(', ')}]`).join(' | '));
const support = defs[0];
if (support.name !== 'Pipeline de soporte' || support.stages.length !== 4) fail('default support pipeline with four statuses');
if (support.stages.map((s) => s[1]).join('|') !== 'Nuevo|En espera de contacto|En espera de nosotros|Cerrado' || support.stages.map((s) => s[2]).join('|') !== 'open|open|open|closed') fail('default statuses and types');
log('first open:', data.firstOpenTicketStatus('Pipeline de soporte'), '| label waiting:', data.ticketStatusLabel('Pipeline de soporte', 'waiting'), '| closed?', data.ticketStatusIsClosed('Pipeline de soporte', 'closed'), data.ticketStatusIsClosed('Pipeline de soporte', 'new'));
if (data.firstOpenTicketStatus('Pipeline de soporte') !== 'new' || !data.ticketStatusIsClosed('Pipeline de soporte', 'closed') || data.ticketStatusIsClosed('Pipeline de soporte', 'new')) fail('status helpers');
const counts = data.ticketPipelineCounts();
log('open/closed per pipeline:', JSON.stringify(counts));
if (!Object.values(counts).some((c) => c.closed > 0) || !Object.values(counts).some((c) => c.open > 0)) fail('sample data should have open and closed tickets');

// ---------- auto-association to the contact's primary company ----------
const contact = data.allContacts().find((c) => c.companyId);
const company = data.findRecord('companies', contact.companyId);
const t1 = data.addRecord('tickets', { name: 'Ticket de prueba', pipeline: 'Pipeline de soporte', status: 'new', priority: 'medium', contactId: contact.id, owner: 'Sofía R.' });
log('ticket with contact →', t1.companyId, t1.company, '(expected', company.name + ')', '| note:', data.activitiesFor('tickets', t1.id)[0]?.text);
if (Number(t1.companyId) !== Number(company.id) || Number(ticket(t1.id).companyId) !== Number(company.id) || !/empresa principal/.test(data.activitiesFor('tickets', t1.id)[0]?.text || '')) fail('auto company on create');
const other = data.allCompanies().find((c) => Number(c.id) !== Number(company.id));
const t2 = data.addRecord('tickets', { name: 'Ticket con empresa', pipeline: 'Pipeline de soporte', status: 'new', contactId: contact.id, companyId: other.id, company: other.name });
if (Number(t2.companyId) !== Number(other.id)) fail('an explicit company is kept');
const t3 = data.addRecord('tickets', { name: 'Ticket sin contacto', pipeline: 'Garantías', status: 'new' });
log('without contact →', t3.companyId ?? 'none');
if (t3.companyId) fail('no contact, no company');
data.setField('tickets', t3.id, 'contactId', contact.id);
log('after associating a contact →', ticket(t3.id).companyId, ticket(t3.id).company);
if (Number(ticket(t3.id).companyId) !== Number(company.id)) fail('auto company when the contact is set later');
localStorage.setItem(data.TICKET_SETTINGS_KEY, JSON.stringify({ autoCompany: false }));
const t4 = data.addRecord('tickets', { name: 'Ticket apagado', pipeline: 'Pipeline de soporte', status: 'new', contactId: contact.id });
log('switch off →', t4.companyId ?? 'none', data.autoAssociateTicketCompany(t4).reason);
if (t4.companyId) fail('switch off');
localStorage.setItem(data.TICKET_SETTINGS_KEY, JSON.stringify({ autoCompany: true }));
const free = data.allContacts().find((c) => !c.companyId);
const t5 = data.addRecord('tickets', { name: 'Ticket contacto sin empresa', pipeline: 'Pipeline de soporte', status: 'new', contactId: free.id });
if (t5.companyId || data.autoAssociateTicketCompany(t5).reason !== 'contact_without_company') fail('contact without company');

// ---------- import: the status must belong to the row's pipeline ----------
const table = E.parsePasted(['Nombre del ticket\tPipeline\tEstado del ticket\tPrioridad', 'Imp uno\tPipeline de soporte\tEn espera de contacto\tAlta', 'Imp dos\tGarantías\tcerrado\tBaja', 'Imp tres\tPipeline de soporte\tEstado inventado\tMedia', 'Imp cuatro\tNo existe\tNuevo\tMedia'].join('\n'));
const plan = E.planImport(table, E.autoMap(table.headers, 'es', 'tickets'), { object: 'tickets', mode: 'create' });
log('import plan:', plan.records.map((r) => `${r.rowNumber}:${r.action}${r.code ? `(${r.code})` : ''}${r.data.status ? `=${r.data.status}` : ''}`).join(' '));
if (plan.records[0].data.status !== 'waiting' || plan.records[1].data.status !== 'closed' || plan.records[2].code !== 'INVALID_DEAL_STAGE' || plan.records[3].code !== 'INVALID_PIPELINE') fail('import status validation');

// ---------- list: selector indicator, board columns per pipeline, create defaults ----------
await import(resolve(here, '../src/tickets.js'));
const $ = (id) => document.getElementById(id);
log('selector items:', [...document.querySelectorAll('#pipeline-items .pmenu__item')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()).slice(0, 3).join(' | '));
if (!document.querySelector('#pipeline-items .pmenu__detail') || !/abiertos? · \d+ cerrados?/.test(document.querySelector('#pipeline-items [data-pipeline="Pipeline de soporte"] .pmenu__detail').textContent)) fail('open/closed indicator in the pipeline selector');
click(document.querySelector('#pipeline-items [data-pipeline="Pipeline de soporte"]'));
click(document.querySelector('[data-action="mode-board"]'));
const cols = [...document.querySelectorAll('#kanban .kcol')].map((c) => c.dataset.group);
log('board columns (soporte):', cols.join(' | '));
if (cols.join('|') !== 'new|waiting|progress|closed') fail('board columns should be the pipeline statuses');
click(document.querySelector('[data-action="mode-table"]'));
click(document.querySelector('[data-action="create"]'));
const form = document.querySelector('#create-form, form[data-create], .drawer form');
if (!form) fail('create form missing');
form.querySelector('[name="name"]').value = 'Ticket desde la lista';
form.querySelector('[name="pipeline"]').value = 'Garantías';
form.querySelector('[name="status"]').value = 'closed';
form.querySelector('[name="contactId"]').value = String(contact.id);
submit(form);
const made = data.allTickets().find((t) => t.name === 'Ticket desde la lista');
log('created from the list:', made && `${made.pipeline} · ${made.status} · empresa ${made.company}`);
if (!made || made.pipeline !== 'Garantías' || made.status !== 'closed' || Number(made.companyId) !== Number(company.id)) fail('create from the list with the contact\'s company');
form.querySelector('[name="name"]')?.remove();

// ---------- record page: statuses of the ticket's pipeline, Empresas card ----------
dom = boot(`http://localhost/tickets/record/?id=${t1.id}`, 'record-root', 'data-type="tickets"');
await import(resolve(here, '../src/record.js'));
const steps = [...document.querySelectorAll('#rec-stages .stages__step')].map((b) => b.textContent.trim());
log('record stages:', steps.join(' | '), '| note:', document.querySelector('#rec-stages .stages__note')?.textContent.trim());
if (steps.join('|') !== 'Nuevo|En espera de contacto|En espera de nosotros|Cerrado') fail('record statuses from the pipeline');
const cards = [...document.querySelectorAll('.card--assoc')].map((c) => c.dataset.kind);
log('assoc cards:', cards.join(', '), '| company shown:', document.querySelector('.card--assoc[data-kind="companies"] .assoc-card strong')?.textContent);
if (!cards.includes('companies') || document.querySelector('.card--assoc[data-kind="companies"] .assoc-card strong')?.textContent !== company.name) fail('Empresas card on the ticket');
click(document.querySelector('#rec-stages [data-status="closed"]'));
log('after closing: status', ticket(t1.id).status, '| subtitle:', document.getElementById('rec-sub').textContent.trim());
if (ticket(t1.id).status !== 'closed' || !/Cerrado/.test(document.getElementById('rec-sub').textContent)) fail('closing from the record');

// ---------- settings: editor per pipeline ----------
dom = boot('http://localhost/settings/#obj-tickets:pipelines', 'settings-root');
await import(resolve(here, '../src/settings.js'));
log('settings rows:', document.querySelectorAll('[data-tpipe-edit]').length, '| status chips of the first row:', document.querySelector('.stable tbody tr')?.querySelectorAll('.tstage').length, '| autoCompany checkbox:', Boolean(document.querySelector('[data-objsetting="autoCompany"]')));
if (document.querySelectorAll('[data-tpipe-edit]').length !== data.ticketPipelineDefs().length) fail('settings should list every pipeline');
click(document.querySelector('[data-tpipe-edit="0"]'));
log('editor rows:', document.querySelectorAll('[data-tstage-label]').length, '| types:', [...document.querySelectorAll('[data-tstage-type]')].map((s) => s.value).join(','));
if (document.querySelectorAll('[data-tstage-label]').length !== 4) fail('editor should show the four statuses');
// retype "En espera de nosotros" as closed and rename "Nuevo"
document.querySelector('[data-tstage-type="progress"]').value = 'closed';
document.querySelector('[data-tstage-label="new"]').value = 'Nuevo ticket';
submit(document.querySelector('form[data-save="ticketpipe-stages"]'));
let p0 = data.ticketPipelineDefs()[0];
log('after save:', p0.stages.map((s) => `${s[1]}:${s[2]}`).join(', '));
if (p0.stages[0][1] !== 'Nuevo ticket' || p0.stages[2][2] !== 'closed') fail('save edits');
if (data.ticketPipelineCounts()['Pipeline de soporte'].closed <= counts['Pipeline de soporte'].closed) fail('retyping a status as closed should move its tickets to the closed count');
// add an open status: it lands before the closed ones
click(document.querySelector('[data-act="tstage-add"]'));
const pm = document.getElementById('pm-form');
pm.elements.label.value = 'Escalado a ingeniería';
pm.elements.type.value = 'Abierto';
submit(pm);
p0 = data.ticketPipelineDefs()[0];
log('after add:', p0.stages.map((s) => `${s[0]}:${s[2]}`).join(', '));
if (p0.stages.length !== 5 || p0.stages[2][0] !== 'escalado_a_ingenieria' || p0.stages[2][2] !== 'open') fail('added status key and position');
// move it up, then remove it
click(document.querySelector('[data-tstage-move="-1"][data-i="2"]'));
p0 = data.ticketPipelineDefs()[0];
if (p0.stages[1][0] !== 'escalado_a_ingenieria') fail('move up');
click(document.querySelector('[data-tstage-rm="escalado_a_ingenieria"]'));
p0 = data.ticketPipelineDefs()[0];
log('after remove:', p0.stages.map((s) => s[0]).join(','));
if (p0.stages.length !== 4) fail('remove status');
if (!document.querySelector('[data-tstage-rm="new"]').disabled) fail('a status with tickets cannot be removed');
// clone and rename
click(document.querySelector('.pmanage [data-tpipe-clone]'));
log('after clone:', data.ticketPipelines().join(' | '));
if (!data.ticketPipelines().includes('Pipeline de soporte (copia)')) fail('clone');
click(document.querySelector('[data-act="tpipe-rename"]'));
document.getElementById('pm-form').elements.name.value = 'Soporte Kafer';
submit(document.getElementById('pm-form'));
log('after rename:', data.ticketPipelines().join(' | '));
if (!data.ticketPipelines().includes('Soporte Kafer') || data.ticketPipelines().includes('Pipeline de soporte (copia)')) fail('rename');
// a new pipeline from the form starts with the four default statuses
click(document.querySelector('[data-act="tpipe-back"]'));
const nf = document.querySelector('form[data-save="ticketpipeline"]');
nf.querySelector('[name="name"]').value = 'Garantías Kafer';
submit(nf);
const created = data.ticketPipelineDefs().find((p) => p.name === 'Garantías Kafer');
log('new pipeline statuses:', created && created.stages.map((s) => s[1]).join(', '));
if (!created || created.stages.length !== 4 || created.stages[3][2] !== 'closed') fail('new pipeline defaults');
// the association switch lives in the object's configuration tab
click(document.querySelector('[data-objects-tab="config"]'));
const sw = document.querySelector('[data-objsetting="autoCompany"][data-type="tickets"]');
log('autoCompany switch on the config tab:', Boolean(sw), '| checked:', sw?.checked);
if (!sw || !sw.checked) fail('autoCompany switch should be on by default');
sw.checked = false;
change(sw);
log('after turning it off:', data.ticketAutoCompanyEnabled());
if (data.ticketAutoCompanyEnabled()) fail('switch should turn the rule off');
console.log('[ticket-statuses] OK');

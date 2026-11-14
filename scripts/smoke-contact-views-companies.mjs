// DOM smoke test for two behaviours of the Contactos list: the account's real saved views opened as tabs
// (Contactos trabajados, 50 TOP Glaziers, Glaziers Florida, Glaziers Arizona) plus "+" to save the current
// filters as a new view, and contacts with several companies (primary + "N registros" in the list, every
// company with the primary marked on the record page). Run: node scripts/smoke-contact-views-companies.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[views-companies]', ...a);
const fail = (msg) => { console.error(`[views-companies] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const boot = (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  return dom;
};
// A storage with key enumeration, so the timeline scan (allActivities) works in local mode.
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
let dom = boot('http://localhost/contacts/', LIST);
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const tabs = () => [...document.querySelectorAll('button.views__tab')].map((t) => t.textContent.trim());
const total = () => Number($('total-pill').textContent.split(' ')[0]);
const tab = (id) => document.querySelector(`button.views__tab[data-view="${id}"]`);

const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/segments-data.js'));
const C = await import(resolve(here, '../src/contacts.js'));

// 1) the real saved views are tabs, stored as saved views with conditions
log('tabs:', tabs().join(' | '));
for (const name of ['Contactos trabajados', '50 TOP Glaziers', 'Glaziers Florida', 'Glaziers Arizona']) if (!tabs().includes(name)) fail(`missing tab ${name}`);
const store = JSON.parse(mem['crm:contacts:views']);
log('seeded ids:', store.seeded.join(','), '| custom views:', store.custom.map((v) => `${v.name} → ${JSON.stringify(v.advanced.map((c) => [c.assoc || c.key, c.op, c.value]))}`).join(' ; '));
if (store.seeded.length !== 4 || store.custom.length !== 4) fail('the four views should be seeded once');
// Florida / Arizona filter by state
click(tab('seed:florida'));
const florida = data.allContacts().filter((c) => c.state === 'Florida').length;
log('Glaziers Florida:', total(), '| expected:', florida, '| states on page:', [...new Set([...document.querySelectorAll('#rows tr[data-id]')].map((tr) => data.allContacts().find((c) => Number(c.id) === Number(tr.dataset.id)).state))].join(','));
if (!florida || total() !== florida) fail('Glaziers Florida should list the Florida contacts');
click(tab('seed:arizona'));
const arizona = data.allContacts().filter((c) => c.state === 'Arizona').length;
log('Glaziers Arizona:', total(), '| expected:', arizona);
if (!arizona || total() !== arizona) fail('Glaziers Arizona should list the Arizona contacts');
// Contactos trabajados: at least one activity on the timeline
click(tab('seed:worked'));
log('Contactos trabajados before any activity:', total());
if (total() !== 0) fail('no contact has activities yet');
data.addActivity({ type: 'call', recordType: 'contacts', recordId: 5, text: 'Llamada de seguimiento', who: 'Tú', when: Date.now() });
data.addActivity({ type: 'note', recordType: 'contacts', recordId: 9, text: 'Nota', who: 'Tú', when: Date.now() });
data.addActivity({ type: 'prop', recordType: 'contacts', recordId: 12, text: 'Propiedad cambiada', who: 'Tú', when: Date.now(), extra: {} });
click(tab('std:all')); // leave and come back: the view re-reads the data
click(tab('seed:worked'));
const workedIds = [...document.querySelectorAll('#rows tr[data-id]')].map((tr) => Number(tr.dataset.id)).sort((a, b) => a - b);
log('Contactos trabajados after two activities:', total(), '| ids:', workedIds.join(','), '| num_notes of 5:', data.allContacts().find((c) => c.id === 5).num_notes);
if (total() !== 2 || workedIds.join() !== '5,9') fail('contacts with at least one activity (property changes do not count)');
// 50 TOP Glaziers: an empty static segment, ready to be filled; the view follows its membership
const seg = S.segments().find((s) => s.name === '50 TOP Glaziers');
log('segment:', seg && `${seg.type} · ${seg.object} · members ${seg.memberIds.length}`);
if (!seg || seg.type !== 'static' || seg.object !== 'contacts' || seg.memberIds.length) fail('50 TOP Glaziers should be an empty static contact segment');
click(tab('seed:top50'));
if (total() !== 0) fail('the empty segment lists nobody');
S.addStaticMembers(seg.id, [7, 8]);
click(tab('std:all'));
click(tab('seed:top50'));
log('50 TOP Glaziers after adding two members:', total());
if (total() !== 2) fail('the view should follow the segment membership');
// "+" → create a new view from the current filters
click(tab('seed:florida'));
click(document.querySelector('.menu__item[data-filter="owner"][data-value]:not([data-value=""])'));
const filteredTotal = total();
click(document.querySelector('[data-action="view-create"]'));
log('create dialog:', text($('view-dialog-title')), '| rows with the owner filter:', filteredTotal);
$('view-form').querySelector('[name="name"]').value = 'Glaziers Florida de un asesor';
submit($('view-form'));
const made = JSON.parse(mem['crm:contacts:views']).custom.find((v) => v.name === 'Glaziers Florida de un asesor');
log('new view:', Boolean(made), '| tab active:', text(document.querySelector('button.views__tab.is-active')), '| keeps state condition:', made && made.advanced.some((c) => c.key === 'state'), '| keeps owner filter:', made && Boolean(made.filters.owner), '| total:', total());
if (!made || !made.advanced.some((c) => c.key === 'state' && c.value === 'Florida') || !made.filters.owner || text(document.querySelector('button.views__tab.is-active')) !== 'Glaziers Florida de un asesor' || total() !== filteredTotal) fail('"+" should save the current filters as a named view');
// nothing is seeded twice on the next visit
dom = boot('http://localhost/contacts/', LIST);
const C2 = await import(resolve(here, '../src/contacts.js') + '?again'); // a fresh list on the new document
log('tabs on the next visit:', tabs().length, '| custom views:', JSON.parse(mem['crm:contacts:views']).custom.length);
if (JSON.parse(mem['crm:contacts:views']).custom.length !== 5) fail('seeding must run once');

// 2) a contact with several companies: the list shows the primary and "N registros"
const multi = data.allContacts().find((c) => Array.isArray(c.assoc_companies) && c.assoc_companies.length > 1);
log('multi-company contact:', multi.id, multi.name, '| companies:', data.contactCompanyLinks(multi).map((l) => `${l.companyId}:${l.label}`).join(', '));
if (!multi) fail('the sample should have a contact with two companies');
click(document.querySelector('button.views__tab[data-view="std:all"]'));
C2.list.state.size = 500;
C2.list.render();
const cell = document.querySelector(`#rows tr[data-id="${multi.id}"] td[data-key="assoc_company"]`);
const more = cell && cell.querySelector('.assoc-more');
log('cell:', text(cell), '| button:', text(more));
if (!cell || !cell.querySelector('a') || text(cell.querySelector('a')) !== multi.company || text(more) !== '2 registros') fail('the column should show the primary company and "2 registros"');
click(more);
const pop = document.querySelector('.assoc-pop');
log('popover:', text(pop), '| items:', pop && pop.querySelectorAll('li').length, '| primary tag:', pop && text(pop.querySelector('.tag--done')));
if (!pop || pop.querySelectorAll('li').length !== 2 || text(pop.querySelector('.tag--done')) !== 'Principal' || !pop.querySelector('a[href*="companies/record"]')) fail('clicking shows every company with the primary marked');
document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
if (document.querySelector('.assoc-pop')) fail('Escape closes the popover');
const single = data.allContacts().find((c) => c.companyId && !(c.assoc_companies || []).length);
if (document.querySelector(`#rows tr[data-id="${single.id}"] td[data-key="assoc_company"] .assoc-more`)) fail('a single company shows no counter');
// the pure helper behind the table rows: the primary wins, a second "Principal" label is demoted
const links = data.contactCompanyLinks({ companyId: 3, assoc_companies: [3, 7], assoc_labels_companies: { 7: 'Principal' } });
log('links:', JSON.stringify(links));
if (links.length !== 2 || !links[0].isPrimary || links[0].companyId !== 3 || links[1].label !== 'Sin etiqueta') fail('contactCompanyLinks');

// 3) the record page: companies card with every company, the primary marked; the secondary company lists the contact
dom = boot(`http://localhost/contacts/record/?id=${multi.id}`, '<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/record.js'));
const card = document.querySelector('.card--assoc[data-kind="companies"]');
const rows = card ? [...card.querySelectorAll('.assoc-card')] : [];
log('companies card:', text(card && card.querySelector('.card__toggle')), '| rows:', rows.length, '| labels:', rows.map((r) => text(r.querySelector('.assoc-card__label'))).join(' / '));
if (rows.length !== 2 || !rows.some((r) => /principal/i.test(text(r.querySelector('.assoc-card__label'))))) fail('the record should list both companies with the primary marked');
const secondaryId = data.contactCompanyLinks(multi).find((l) => !l.isPrimary).companyId;
dom = boot(`http://localhost/companies/record/?id=${secondaryId}`, '<!doctype html><body class="app" data-type="companies"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/record.js') + '?company');
const ccard = document.querySelector('.card--assoc[data-kind="contacts"]');
log('secondary company contacts card:', text(ccard && ccard.querySelector('.card__toggle')), '| lists the contact:', Boolean(ccard && ccard.querySelector(`a[href*="id=${multi.id}"]`)));
if (!ccard || !ccard.querySelector(`a[href*="id=${multi.id}"]`)) fail('the secondary company should list the contact too');
log('OK');

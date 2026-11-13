// DOM smoke test for the company record of the original and the "Crear empresa" panel: header with domain
// and phone copy buttons and the quick actions, the "Información clave" card (fields in order, calculated
// "Negocios asociados", Personalizar), the association cards (counts, + Agregar, search, deal stage dropdown
// saved inline, "Ver todos" filtered), the centre tabs and the activity sub-tabs with date/assignee filters;
// then the Empresas list: slide-over panel with its fields, duplicate detection by domain or name, Crear /
// Crear y agregar otro / Cancelar; and the list filtered by ?company=. Run: node scripts/smoke-company-record.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[company-record]', ...a);
const fail = (msg) => { console.error(`[company-record] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; } };
let dom;
const copied = [];
const boot = (url, main, attrs = '') => {
  dom = new JSDOM(`<!doctype html><body class="app" ${attrs}><aside id="sidenav"></aside><header id="topbar"></header><main id="${main}"></main><div id="scrim"></div></body>`, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve(); } } }, configurable: true });
  dom.window.confirm = () => true;
  return dom;
};
const $ = (id) => document.getElementById(id);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el) => el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
const type = (el, value) => { el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

// ---------- the record ----------
boot('http://localhost/companies/record/?id=1', 'record-root', 'data-type="companies"');
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/record.js'));
const company = data.findRecord('companies', 1);
const deals = data.allDeals().filter((d) => Number(d.companyId) === 1);
log('header:', txt($('rec-name')), '|', txt($('rec-mail')), '|', txt($('rec-phone')), '| copy buttons:', document.querySelectorAll('.record__who .copy').length, '| quick actions:', [...document.querySelectorAll('#quick-row .quick__btn, #quick-row button')].map((b) => txt(b)).filter(Boolean).slice(0, 6).join(', '));
if (!txt($('rec-mail')).includes(company.domain) || !txt($('rec-phone')).includes(company.phone) || document.querySelectorAll('.record__who .copy').length !== 2) fail('header domain/phone with copy buttons');
click(document.querySelector('#rec-phone .copy'));
log('copied:', copied.join(' | '));
if (copied[0] !== company.phone) fail('copy phone');
const quick = [...document.querySelectorAll('#quick-row [data-action]')].map((b) => b.dataset.action);
if (!['note', 'email', 'call', 'task', 'meeting'].every((a) => quick.includes(a))) fail(`quick actions: ${quick.join(',')}`);
// Información clave
const labels = [...document.querySelectorAll('#rec-props dt')].map((d) => txt(d));
log('card title:', txt($('about-title')), '| fields:', labels.join(' · '));
if (txt($('about-title')) !== 'Información clave') fail('card title');
const expected = ['Nombre', 'Dirección', 'Ciudad', 'Propietario', 'Etapa del ciclo de vida', 'Estado del lead', 'Sector', 'Tipo de Cliente', 'Último contacto', 'Cuenta objetivo', 'Productos de interés', 'Negocios asociados'];
if (labels.slice(0, 12).join('|') !== expected.join('|')) fail('key info fields order');
const dealsRow = document.querySelector('#rec-props .props__row[data-key="assoc_deals_count"]');
log('Negocios asociados:', txt(dealsRow.querySelector('dd')), '(count', deals.length + ') | editable?', Boolean(dealsRow.querySelector('[data-edit-key]')), '| Personalizar:', Boolean(document.querySelector('.props__custom [data-act="customize-props"]')));
if (txt(dealsRow.querySelector('dd')) !== String(deals.length) || dealsRow.querySelector('[data-edit-key]') || !document.querySelector('.props__custom [data-act="customize-props"]')) fail('calculated deals count');
// centre tabs and activity filters
const tabs = [...document.querySelectorAll('.rtabs__tab')].map((t) => txt(t));
log('tabs:', tabs.join(' | '));
if (!tabs.includes('Información') || !tabs.includes('Actividades') || !tabs.includes('Información avanzada')) fail('centre tabs');
click(document.querySelector('[data-tab="activity"]'));
const subtabs = [...document.querySelectorAll('#act-filters .chip')].map((c) => txt(c));
log('activity sub-tabs:', subtabs.join(' | '), '| date filter:', Boolean($('act-date')), '| who filter:', Boolean($('act-who')));
if (!['Notas', 'Correos', 'Llamadas', 'Tareas', 'Reuniones'].every((s) => subtabs.includes(s)) || !$('act-date') || !$('act-who')) fail('activity sub-tabs and filters');
const entries = () => $('rec-timeline').querySelectorAll('li:not(.muted)').length; // the empty state is a muted li
$('note-form').querySelector('textarea').value = 'Nota de prueba en la empresa';
$('note-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const n1 = entries();
$('act-who').value = 'Sistema';
change($('act-who'));
const n2 = entries();
log('timeline:', n1, '→ assigned to Sistema:', n2, '| clear visible:', !$('act-clear').hidden);
if (!(n2 < n1) || $('act-clear').hidden) fail('assignee filter');
click($('act-clear'));
if (entries() !== n1 || !$('act-clear').hidden) fail('Borrar todo in activities');
$('act-date').value = '0';
change($('act-date'));
log('today only:', entries(), 'entries');
if (entries() !== 1 || !txt($('rec-timeline')).includes('Nota de prueba')) fail('date filter (today)');
click($('act-clear'));
// association cards
const cards = [...document.querySelectorAll('.card--assoc')].map((c) => `${c.dataset.kind}:${txt(c.querySelector('.card__toggle')).replace(/^⌄\s*/, '')}`);
log('assoc cards:', cards.join(' | '));
if (!cards.some((c) => c.startsWith('contacts:Contactos (')) || !cards.some((c) => c.startsWith(`deals:Negocios (${deals.length})`)) || !cards.some((c) => c.startsWith('tickets:Tickets ('))) fail('association cards with counts');
const dealsCard = document.querySelector('.card--assoc[data-kind="deals"]');
log('deals card: + Agregar', Boolean(dealsCard.querySelector('[data-act="add-assoc"]')), '| search', Boolean(dealsCard.querySelector('[data-acard="search"]')), '| stage selects:', dealsCard.querySelectorAll('[data-deal-stage]').length, '| Ver todos →', dealsCard.querySelector('.assoc-more')?.getAttribute('href'));
if (!dealsCard.querySelector('[data-act="add-assoc"]') || !dealsCard.querySelector('[data-deal-stage]') || dealsCard.querySelector('.assoc-more')?.getAttribute('href') !== '../../deals/?company=1') fail('deals card tools');
const sel = dealsCard.querySelector('[data-deal-stage]');
const dealId = Number(sel.dataset.dealStage);
const other = [...sel.options].find((o) => o.value !== sel.value).value;
sel.value = other;
change(sel);
log('stage changed inline →', data.findRecord('deals', dealId).stage, '| toast:', $('toast')?.textContent, '| still selected:', document.querySelector(`[data-deal-stage="${dealId}"]`).value);
if (data.findRecord('deals', dealId).stage !== other || document.querySelector(`[data-deal-stage="${dealId}"]`).value !== other) fail('inline stage update');
click(document.querySelector('.card--assoc[data-kind="deals"] [data-act="add-assoc"]')); // the cards were re-rendered after the stage change
log('add drawer:', !$('assoc-drawer').hidden, '| search box:', Boolean($('ad-search')), '| candidates:', document.querySelectorAll('#assoc-drawer .ad-list li').length);
if ($('assoc-drawer').hidden || !$('ad-search')) fail('+ Agregar drawer');
click(document.querySelector('#assoc-drawer [data-ad="close"]'));
// the contacts card marks the primary company relation
const contactsCard = document.querySelector('.card--assoc[data-kind="contacts"]');
log('contact card label:', txt(contactsCard.querySelector('.assoc-card__label')));
if (!/empresa principal/i.test(txt(contactsCard.querySelector('.assoc-card__label')))) fail('primary company label');
log('[record] OK');

// ---------- the list: "Crear empresa" panel ----------
boot('http://localhost/companies/', 'list-root');
const Co = await import(resolve(here, '../src/companies.js'));
const addBtn = document.querySelector('.page-head__actions [data-action="create"]');
log('add button:', txt(addBtn), '| menu?', Boolean(addBtn.closest('.menu')));
click(addBtn);
const panel = $('cco-panel');
const names = [...$('cco-form').querySelectorAll('[name]')].map((e) => e.name);
log('panel open:', panel.classList.contains('is-open'), '| fields:', names.join(', '), '| owner default:', $('cco-form').elements.owner.value, '| hint:', txt($('cco-dups')));
if (!panel.classList.contains('is-open') || names.join(',') !== 'domain,name,owner,state,country,phone,industry' || txt($('cco-dups')) !== 'Comienza por escribir un nombre de dominio, un nombre de cuenta o ambos.') fail('panel fields');
if (!$('cco-create').disabled) fail('Crear disabled until the name is filled');
type($('cco-form').elements.domain, 'cristales');
await wait(350);
log('duplicates by domain:', document.querySelectorAll('#cco-dups li').length, '|', txt(document.querySelector('#cco-dups li')));
if (!document.querySelectorAll('#cco-dups li').length) fail('duplicate hints by domain');
type($('cco-form').elements.name, 'Empresa de Prueba');
if ($('cco-create').disabled || $('cco-create-another').disabled) fail('buttons enable with a name');
type($('cco-form').elements.domain, company.domain.toUpperCase());
$('cco-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(20);
log('existing domain →', txt($('cco-dups')).slice(0, 80), '| link:', $('cco-dups').querySelector('a')?.getAttribute('href'));
if (!/Ya existe una empresa con ese dominio/.test(txt($('cco-dups'))) || $('cco-dups').querySelector('a')?.getAttribute('href') !== './record/?id=1') fail('domain duplicate warning');
click(document.querySelector('[data-cco="fix-domain"]'));
type($('cco-form').elements.domain, 'empresa-de-prueba.com');
type($('cco-form').elements.industry, 'Reformas');
const before = data.allCompanies().length;
click($('cco-create-another'));
await wait(20);
const made = data.allCompanies().find((c) => c.domain === 'empresa-de-prueba.com');
log('Crear y agregar otro →', made && `${made.name} · ${made.industry} · ${made.owner}`, '| panel open:', panel.classList.contains('is-open'), '| cleared:', $('cco-form').elements.name.value === '', '| toast:', $('toast')?.textContent);
if (!made || made.industry !== 'Reformas' || !panel.classList.contains('is-open') || $('cco-form').elements.name.value !== '' || data.allCompanies().length !== before + 1) fail('create and add another');
click(document.querySelector('#cco-panel .slideover__foot [data-cco="cancel"]'));
if (panel.classList.contains('is-open')) fail('Cancelar closes');
void Co;
log('[list] OK');

// ---------- "Ver todos" lands on the list filtered by the company ----------
boot('http://localhost/contacts/?company=1', 'list-root');
await import(resolve(here, '../src/contacts.js'));
const linked = data.allContacts().filter((c) => Number(c.companyId) === 1).length;
log('contacts list with ?company=1:', $('total-pill').textContent, '(expected', linked + ') | badge:', $('adv-count').textContent);
if (Number($('total-pill').textContent.split(' ')[0]) !== linked) fail('?company= filter');
console.log('[company-record] OK');

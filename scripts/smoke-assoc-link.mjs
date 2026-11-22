// DOM smoke test: «Ver todos los elementos asociados del tipo X» at the foot of every association card links to the
// list of the associated object filtered by the record of origin (?assoc=<type>:<id>) from the four modules; the
// list applies it in both directions (keys and arrays of either side), shows a removable chip «Asociados a …» and,
// once the chip is removed, lists everything again. Run: node scripts/smoke-assoc-link.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'assoc-link';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RECORD = (type) => `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`;
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (html, url) => {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
let n = 0;
const openRecord = async (type, id) => { useDom(RECORD(type), `http://localhost/${type}/record/?id=${id}`); await import(resolve(here, `../src/record.js?al=${n++}`)); await wait(60); };
const openList = async (type, query = '') => { useDom(LIST, `http://localhost/${type}/${query}`); await import(resolve(here, `../src/${type}.js?al=${n++}`)); await wait(80); };
const rowIds = () => qa('#table tbody tr[data-id]').map((tr) => Number(tr.dataset.id)).sort((a, b) => a - b);
const moreHref = (kind) => q(`.card--assoc[data-kind="${kind}"] .assoc-more`)?.getAttribute('href');
const chip = () => q('[data-assoc-chip]');

await import(resolve(here, '../src/data.js'));
const data = await import(resolve(here, '../src/data.js'));
const sorted = (arr) => arr.map(Number).sort((a, b) => a - b);

// a deal with exactly two associated contacts (primary + one more), a ticket with two companies
const [c1, c2, c3] = data.allContacts();
const [co1, co2] = data.allCompanies();
const deal = data.addRecord('deals', { name: 'Negocio con dos contactos', amount: 10, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: '2026-12-31T12:00:00.000Z', owner: 'Fernando L.', contactId: c1.id, companyId: '', company: '', assoc_contacts: [c1.id, c2.id], assoc_labels_contacts: { [c1.id]: 'Principal' } });
const pipe = data.ticketPipelines()[0];
const ticket = data.addRecord('tickets', { name: 'Ticket con dos empresas', pipeline: pipe, status: data.firstOpenTicketStatus(pipe), priority: 'medium', owner: 'Fernando L.', source: 'Correo', contactId: '', companyId: co1.id, company: co1.name, assoc_companies: [co1.id, co2.id] });
data.setField('contacts', c3.id, 'assoc_deals', [Number(deal.id)]); // the contact side of the link (create-deal mirror)

// 1) from a deal: the link carries the origin; the contacts list shows exactly its two contacts, with the chip
await openRecord('deals', deal.id);
if (moreHref('contacts') !== `../contacts/?assoc=deals:${deal.id}`) fail(`deal → contacts link (${moreHref('contacts')})`);
if (moreHref('companies') !== `../companies/?assoc=deals:${deal.id}` || moreHref('tickets') !== `../tickets/?assoc=deals:${deal.id}`) fail('every card of the deal links with the origin');
await openList('contacts', `?assoc=deals:${deal.id}`);
const expectedContacts = sorted([c1.id, c2.id, c3.id]); // c3 is linked from its own side (assoc_deals)
if (rowIds().join() !== expectedContacts.join()) fail(`contacts list shows exactly the deal's contacts (${rowIds().join()} vs ${expectedContacts.join()})`);
if (!chip() || !/Asociados a Negocio: Negocio con dos contactos/.test(text(q('#assoc-chip')))) fail(`a visible chip names the origin (${text(q('#assoc-chip'))})`);
if (!/Filtro \(1\)/.test(text(q('#filter-pill')))) fail(`the filter pill counts it (${text(q('#filter-pill'))})`);
if (q('#filters-clear-all').hidden) fail('«Borrar todo» is offered');
const full = data.allContacts().length;
click(q('[data-action="assoc-clear"]'));
await wait(20);
if (chip() || rowIds().length === expectedContacts.length || !/Filtro$/.test(text(q('#filter-pill')).trim())) fail(`removing the chip shows the whole list (${rowIds().length} rows)`);
if (/assoc=/.test(location.search)) fail(`the URL loses the parameter (${location.search})`);
if (text(q('#total-pill')).replace(/\D/g, '') !== String(full)) fail(`total back to every contact (${text(q('#total-pill'))} vs ${full})`);
log(`negocio → contactos: ${expectedContacts.length} filas con chip «Asociados a Negocio: …»; quitar el chip → ${full} contactos`);

// 2) from a ticket: companies (primary + extra); from a contact: deals; from a company: tickets
await openRecord('tickets', ticket.id);
if (moreHref('companies') !== `../companies/?assoc=tickets:${ticket.id}`) fail(`ticket → companies link (${moreHref('companies')})`);
await openList('companies', `?assoc=tickets:${ticket.id}`);
if (rowIds().join() !== sorted([co1.id, co2.id]).join() || !chip()) fail(`companies list shows the ticket's two companies (${rowIds().join()})`);
await openRecord('contacts', c1.id);
if (moreHref('deals') !== `../deals/?assoc=contacts:${c1.id}`) fail(`contact → deals link (${moreHref('deals')})`);
await openList('deals', `?assoc=contacts:${c1.id}`);
const dealsOfC1 = sorted(data.allDeals().filter((d) => Number(d.contactId) === Number(c1.id) || (d.assoc_contacts || []).map(Number).includes(Number(c1.id))).map((d) => d.id));
if (rowIds().join() !== dealsOfC1.join() || !rowIds().includes(Number(deal.id))) fail(`deals list shows the contact's deals (${rowIds().join()} vs ${dealsOfC1.join()})`);
await openRecord('companies', co1.id);
if (moreHref('tickets') !== `../tickets/?assoc=companies:${co1.id}`) fail(`company → tickets link (${moreHref('tickets')})`);
await openList('tickets', `?assoc=companies:${co1.id}`);
if (!rowIds().includes(Number(ticket.id)) || !chip() || !/Asociados a Empresa/.test(text(q('#assoc-chip')))) fail(`tickets list shows the company's tickets (${rowIds().join()})`);
// the old links keep working
await openList('contacts', `?company=${co1.id}`);
const ofCompany = sorted(data.allContacts().filter((c) => Number(c.companyId) === Number(co1.id) || (c.assoc_companies || []).map(Number).includes(Number(co1.id))).map((c) => c.id));
if (rowIds().join() !== ofCompany.join() || !chip()) fail(`?company= still filters (${rowIds().join()} vs ${ofCompany.join()})`);
log('ticket → empresas, contacto → negocios, empresa → tickets: cada lista llega filtrada por el registro de origen con su chip; los enlaces antiguos ?company= siguen funcionando');
console.log(`[${TAG}] OK`);
process.exit(0);

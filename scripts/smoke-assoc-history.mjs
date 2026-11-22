// DOM smoke test for «Ver historial de asociaciones» on the record page (src/record.js): the modal lists real
// association events (date and author of each association / dissociation) instead of inventing rows from the
// current associations with the record's creation date; an honest empty state when nothing was logged yet;
// associating a company from the «+ Agregar» drawer and dissociating it from the card («Desasociar») leave two
// rows («Asociada» / «Desasociada») with today's date and the user, on a contact created a year ago; the
// company's own history mirrors nothing it did not do; the same works on a company record with a contact.
// Run: node scripts/smoke-assoc-history.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[assoc-history]', ...a);
const fail = (msg) => { console.error(`[assoc-history] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (url, type) => { const dom = new JSDOM(`<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.HTMLElement.prototype.scrollBy = function () {}; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el) => el.dispatchEvent(new window.Event('change', { bubbles: true }));
const today = new Date();
const dayOf = (iso) => new Date(iso).toDateString();

const data = await import(resolve(here, '../src/data.js'));
const contact = data.addRecord('contacts', { name: 'Historial Asociaciones', first: 'Historial', last: 'Asociaciones', email: 'historial@ejemplo.com', owner: 'Fernando L.', lifecycle: 'Lead' });
// a contact created a year ago: the old modal would have dated every association with this
data.setField('contacts', contact.id, 'created', new Date(today.getTime() - 365 * 86400000).toISOString());
const company = data.allCompanies().find((c) => !data.allContacts().some((x) => Number(x.companyId) === Number(c.id)));
if (!company) fail('a company without contacts');
let n = 0;
const openRecord = async (type, id) => { useDom(`http://localhost/${type}/record/?id=${id}`, type); await import(resolve(here, `../src/record.js?ah=${n++}`)); await wait(60); };
const openHistory = () => { click(q('[data-act="assoc-history"]')); return $('rec-modal'); };
const rows = () => qa('#rec-modal tr[data-assoc-op]').map((tr) => ({ op: tr.dataset.assocOp, cells: [...tr.querySelectorAll('td')].map(text) }));

// ---- empty state: nothing invented ----
await openRecord('contacts', contact.id);
openHistory();
if (!$('rec-modal').classList.contains('is-open') || rows().length || !/Todavía no hay historial de asociaciones/.test(text($('rec-modal-body')))) fail(`honest empty state (${text($('rec-modal-body')).slice(0, 160)})`);
click(q('#rec-modal [data-close]'));
log('sin eventos: «Todavía no hay historial de asociaciones», ninguna fila inventada');

// ---- associate the company through the «+ Agregar» drawer ----
click(q('.card--assoc[data-kind="companies"] [data-act="add-assoc"]'));
await wait(10);
if ($('assoc-drawer').hidden) fail('association drawer opens');
const pick = q(`[data-adpick="${company.id}"]`) || (() => { const s = $('ad-search'); s.value = company.name; s.dispatchEvent(new window.Event('input', { bubbles: true })); return q(`[data-adpick="${company.id}"]`); })();
if (!pick) fail('the company appears in the drawer');
pick.checked = true; change(pick); // the drawer records the pick on change
await wait(10);
click(q('[data-ad="next"]'));
await wait(10);
click(q('[data-ad="save"]'));
await wait(20);
const added = data.activitiesFor('contacts', contact.id).find((a) => a.type === 'assoc');
if (!added || added.extra.op !== 'add' || Number(added.extra.targetId) !== Number(company.id) || added.extra.kind !== 'companies' || !/^Empresa asociada: /.test(added.text)) fail(`association event logged (${JSON.stringify(added && { t: added.text, x: added.extra })})`);
if (!text(q('.card--assoc[data-kind="companies"]')).includes(company.name)) fail('the card lists the company');
openHistory();
let r = rows();
if (r.length !== 1 || r[0].op !== 'add' || r[0].cells[0] !== 'Empresa' || r[0].cells[1] !== company.name || r[0].cells[2] !== 'Asociada' || r[0].cells[4] !== 'Fernando L.') fail(`one «Asociada» row with the user (${JSON.stringify(r)})`);
if (!r[0].cells[3].includes(String(today.getFullYear())) || dayOf(added.when) !== today.toDateString() || /hace un año|${today.getFullYear() - 1}/.test(r[0].cells[3])) fail(`real date (today), not the record's creation date (${r[0].cells[3]})`);
if (!q('#rec-modal tr[data-assoc-op] a')?.getAttribute('href').endsWith(`companies/record/?id=${company.id}`)) fail('the row links to the company');
click(q('#rec-modal [data-close]'));
log(`asociar «${company.name}» → fila «Asociada» · ${r[0].cells[3]} · ${r[0].cells[4]} (el contacto fue creado hace un año)`);

// ---- dissociate from the card ----
click(q(`.card--assoc[data-kind="companies"] [data-assoc-rm="${company.id}"]`));
await wait(20);
if (text(q('.card--assoc[data-kind="companies"]')).includes(company.name)) fail('the company leaves the card');
const after = data.findRecord('contacts', contact.id);
if ((after.assoc_companies || []).map(Number).includes(Number(company.id)) || Number(after.companyId) === Number(company.id)) fail('association removed from the record');
openHistory();
r = rows();
if (r.length !== 2 || r[0].op !== 'remove' || r[0].cells[2] !== 'Desasociada' || r[0].cells[1] !== company.name || r[1].op !== 'add' || r[1].cells[2] !== 'Asociada') fail(`two rows, newest first (${JSON.stringify(r)})`);
if (!/2 eventos/.test(text($('rec-modal-body')))) fail('event count');
click(q('#rec-modal [data-close]'));
if (!qa('#rec-timeline .timeline__item').some((li) => /Asociación/.test(text(li)) && /desasociada/.test(text(li)))) fail('timeline shows the dissociation entry');
log('desasociar desde la tarjeta → fila «Desasociada» encima de «Asociada»; cronología con la entrada');

// ---- a company record: the same with a contact; and the company's history only has its own events ----
await openRecord('companies', company.id);
openHistory();
if (rows().length) fail('the company did nothing itself: no rows');
click(q('#rec-modal [data-close]'));
click(q('.card--assoc[data-kind="contacts"] [data-act="add-assoc"]'));
await wait(10);
const pick2 = q(`[data-adpick="${contact.id}"]`) || (() => { const s = $('ad-search'); s.value = contact.name; s.dispatchEvent(new window.Event('input', { bubbles: true })); return q(`[data-adpick="${contact.id}"]`); })();
if (!pick2) fail('the contact appears in the company drawer');
pick2.checked = true; change(pick2);
await wait(10);
click(q('[data-ad="next"]'));
await wait(10);
click(q('[data-ad="save"]'));
await wait(20);
openHistory();
r = rows();
if (r.length !== 1 || r[0].cells[0] !== 'Contacto' || r[0].cells[1] !== contact.name || r[0].cells[2] !== 'Asociado') fail(`company: «Asociado» row for the contact (${JSON.stringify(r)})`);
log(`empresa: asociar «${contact.name}» → fila «Asociado» con fecha y usuario`);
console.log('[assoc-history] OK');
process.exit(0);

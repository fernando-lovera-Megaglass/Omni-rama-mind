// DOM smoke test for the advanced filters: AND groups, OR between groups, association filters and labels.
// Run: node scripts/smoke-adv-filters.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dom = new JSDOM(
  '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>',
  { url: 'http://localhost/contacts/' },
);
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
dom.window.confirm = () => true;

const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/contacts.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const submit = (form) => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
// condition j (1-based) of group g, and one of its fields
const condEl = (g, j) => document.querySelectorAll(`.advg[data-g="${g}"] .advc`)[j - 1];
const field = (g, j, k) => { const c = condEl(g, j); const el = c && c.querySelector(`[data-k="${k}"]`); if (!el) throw new Error(`missing field ${k} in group ${g} condition ${j}`); return el; };
const setIn = (g, j, k, value) => { const el = field(g, j, k); el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const log = (...a) => console.log('[adv-filters]', ...a);
const fail = (msg) => { console.error(`[adv-filters] FAIL: ${msg}`); process.exit(1); };
const total = () => Number($('total-pill').textContent.split(' ')[0]);

const all = data.allContacts();
const companies = data.allCompanies();
const companyOf = (c) => companies.find((x) => Number(x.id) === Number(c.companyId));
log('contacts:', all.length, '| shown:', total());

// open the panel from the "+" in the quick-filter row
click(document.querySelector('.quickbar [data-action="advanced"]'));
log('drawer open:', $('adv-drawer').classList.contains('is-open'), '| groups:', document.querySelectorAll('.advg').length, '| summary:', $('adv-summary').textContent);
log('objects offered:', [...field(0, 1, 'assoc').options].map((o) => o.textContent).join(' | '));
if (!document.querySelector('.adv-help')) fail('help block missing');

// group 1: owner = Fernando L. (own property)
setIn(0, 1, 'key', 'owner');
setIn(0, 1, 'op', 'is');
log('owner value field is a select:', field(0, 1, 'value').tagName);
setIn(0, 1, 'value', 'Fernando L.');
click($('adv-apply'));
const expectOwner = all.filter((c) => c.owner === 'Fernando L.').length;
log('owner = Fernando L. ->', total(), '| expected:', expectOwner, '| pill:', $('adv-count').textContent);
if (total() !== expectOwner) fail('own-property condition mismatch');

// AND: + associated company in Florida
click(document.querySelector('.quickbar [data-action="advanced"]'));
click(document.querySelector('.advg[data-g="0"] [data-add-cond]'));
log('Y separators in group 1:', document.querySelectorAll('.advg[data-g="0"] .advc__and').length);
setIn(0, 2, 'assoc', 'companies');
log('assoc row has label select:', Boolean(condEl(0, 2).querySelector('[data-k="label"]')), '| property groups:', field(0, 2, 'key').querySelectorAll('optgroup').length, '| highlighted:', condEl(0, 2).classList.contains('advc--assoc'));
setIn(0, 2, 'key', 'state');
setIn(0, 2, 'op', 'is');
log('state value field is a select:', field(0, 2, 'value').tagName, '| has Florida:', [...field(0, 2, 'value').options].some((o) => o.value === 'Florida'));
setIn(0, 2, 'value', 'Florida');
log('summary:', $('adv-summary').textContent);
click($('adv-apply'));
const expectAnd = all.filter((c) => c.owner === 'Fernando L.' && companyOf(c) && companyOf(c).state === 'Florida').length;
log('owner AND company in Florida ->', total(), '| expected:', expectAnd, '| pill:', $('adv-count').textContent);
if (total() !== expectAnd) fail('association AND condition mismatch');
if (expectAnd === 0) fail('sample data has no contact matching the example; filter untestable');

// OR: second group, phone has a value
click(document.querySelector('.quickbar [data-action="advanced"]'));
click($('adv-add-group'));
log('groups now:', document.querySelectorAll('.advg').length, '| O separators:', document.querySelectorAll('.advg__or').length);
setIn(1, 1, 'key', 'phone');
setIn(1, 1, 'op', 'filled');
log('value disabled for "tiene valor":', field(1, 1, 'value').disabled);
click($('adv-apply'));
const expectOr = all.filter((c) => (c.owner === 'Fernando L.' && companyOf(c) && companyOf(c).state === 'Florida') || Boolean(c.phone)).length;
log('(group 1) OR phone filled ->', total(), '| expected:', expectOr, '| pill:', $('adv-count').textContent);
if (total() !== expectOr) fail('OR between groups mismatch');

// association label: only the primary company
click(document.querySelector('.quickbar [data-action="advanced"]'));
setIn(0, 2, 'label', 'Principal');
click($('adv-apply'));
log('with label Principal ->', total(), '| expected:', expectOr);
if (total() !== expectOr) fail('label Principal should match the primary company');
click(document.querySelector('.quickbar [data-action="advanced"]'));
setIn(0, 2, 'label', 'Facturación');
click($('adv-apply'));
const expectBilling = all.filter((c) => Boolean(c.phone)).length;
log('with label Facturación ->', total(), '| expected (only group 2):', expectBilling);
if (total() !== expectBilling) fail('an unused label should match nothing in group 1');

// the view stores groups and associations
click(document.querySelector('[data-action="view-saveas"]'));
$('view-form').querySelector('[name="name"]').value = 'Florida y teléfono';
submit($('view-form'));
const saved = JSON.parse(mem['crm:contacts:views']).custom[0].advanced;
log('saved conditions:', saved.map((c) => `${c.assoc || 'own'}:${c.key}:${c.op}:${c.value}@g${c.group}${c.label ? `[${c.label}]` : ''}`).join(' | '));
if (!saved.some((c) => c.assoc === 'companies' && c.group === 0 && c.label === 'Facturación') || !saved.some((c) => c.group === 1)) fail('saved view lost groups or associations');
log('dirty after save:', !$('view-dirty').hidden);
if (!$('view-dirty').hidden) fail('saved view should be clean');

// remove a whole group, then clear
click(document.querySelector('.quickbar [data-action="advanced"]'));
click(document.querySelector('.advg[data-g="1"] [data-remove-group]'));
log('after removing group 2:', document.querySelectorAll('.advg').length, 'group(s) |', $('adv-summary').textContent);
click($('adv-clear'));
log('after clear ->', total(), '| pill hidden:', $('adv-pill').hidden);
if (total() !== all.length) fail('clear did not restore the full list');

// a deals list offers its own associations
const dom2 = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/deals/' });
globalThis.window = dom2.window;
globalThis.document = dom2.window.document;
globalThis.location = dom2.window.location;
await import(resolve(here, '../src/deals.js'));
document.querySelector('.quickbar [data-action="advanced"]').dispatchEvent(new dom2.window.MouseEvent('click', { bubbles: true, cancelable: true }));
log('deals objects offered:', [...document.querySelector('.advc [data-k="assoc"]').options].map((o) => o.textContent).join(' | '));
log('OK');

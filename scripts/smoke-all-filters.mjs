// DOM smoke test for the "Todos los filtros" panel of the lists: the Asociación section (any associated
// record, or those whose name contains a text) joined with Y to the advanced block, the "+ Agregar filtro"
// popover (search, categories, type icons) that stacks conditions with Y, operators per type, the quick
// chips with their own ×, "Borrar todo", the count, and the translation of the conditions into a Supabase
// query. Run: node scripts/smoke-all-filters.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[all-filters]', ...a);
const fail = (msg) => { console.error(`[all-filters] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/' });
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
const FQ = await import(resolve(here, '../src/filter-query.js'));
const C = await import(resolve(here, '../src/contacts.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, value) => { el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const total = () => Number($('total-pill').textContent.split(' ')[0]);
const all = data.allContacts();
const companies = data.allCompanies();
const companyName = (id) => (companies.find((c) => Number(c.id) === Number(id)) || {}).name || '';

// ---------- the panel ----------
click(document.querySelector('[data-action="advanced"]'));
const drawer = $('adv-drawer');
log('panel open:', drawer.classList.contains('is-open'), '| title:', $('adv-title').textContent, '| sections:', [...drawer.querySelectorAll('.allf__section h3')].map((h) => h.textContent).join(' + '), '| connector:', drawer.querySelector('.allf__and span')?.textContent);
if (!drawer.classList.contains('is-open') || $('adv-title').textContent !== 'Todos los filtros' || drawer.querySelector('.allf__and span')?.textContent !== 'Y') fail('panel structure');
// association: any company
click(drawer.querySelector('[data-allf="add-assoc"]'));
const arow = drawer.querySelector('.allf__assoc');
log('assoc row objects:', [...arow.querySelector('[data-ak="assoc"]').options].map((o) => o.textContent).join(', '), '| modes:', [...arow.querySelector('[data-ak="mode"]').options].map((o) => o.value).join(','), '| value hidden:', arow.querySelector('[data-ak="value"]').hidden);
input(arow.querySelector('[data-ak="assoc"]'), 'companies');
click($('adv-apply'));
const withCompany = all.filter((c) => c.companyId).length;
log('any company →', total(), '(expected', withCompany + ')', '| pill:', $('adv-count').textContent, '| clear-all visible:', !$('filters-clear-all').hidden);
if (total() !== withCompany || $('adv-count').textContent !== '1' || $('filters-clear-all').hidden) fail('association: any');
// association: company whose name contains "cristales"
click(document.querySelector('[data-action="advanced"]'));
const arow2 = drawer.querySelector('.allf__assoc');
input(arow2.querySelector('[data-ak="mode"]'), 'name');
const arow3 = drawer.querySelector('.allf__assoc');
if (arow3.querySelector('[data-ak="value"]').hidden) fail('name mode should show the value');
input(arow3.querySelector('[data-ak="value"]'), 'cristales');
click($('adv-apply'));
const byName = all.filter((c) => /cristales/i.test(companyName(c.companyId))).length;
log('company name contains "cristales" →', total(), '(expected', byName + ')');
if (total() !== byName) fail('association: name filter');

// ---------- "+ Agregar filtro" popover ----------
click(document.querySelector('[data-action="advanced"]'));
click($('allf-add'));
log('popover open:', !$('allf-pop').hidden, '| categories:', drawer.querySelectorAll('.allf__cat').length, '| properties:', drawer.querySelectorAll('.allf__prop').length, '| icon kinds:', [...new Set([...drawer.querySelectorAll('.allf__ico')].map((i) => i.className.split('--')[1]))].join(','));
if ($('allf-pop').hidden || drawer.querySelectorAll('.allf__cat').length < 2 || !['text', 'date', 'number', 'enum'].every((k) => drawer.querySelector(`.allf__ico--${k}`))) fail('popover with categories and type icons');
input($('allf-q'), 'ciudad');
const found = [...drawer.querySelectorAll('.allf__prop')].map((b) => b.dataset.allfProp);
log('search "ciudad" →', found.join(','));
if (!found.includes('city') || found.length > 3) fail('popover search');
click(drawer.querySelector('[data-allf-prop="city"]'));
const rowsNow = [...$('adv-groups').querySelectorAll('.advc')];
const cityRow = rowsNow.find((r) => r.querySelector('[data-k="key"]')?.value === 'city');
log('after choosing city: popover hidden', $('allf-pop').hidden, '| rows:', rowsNow.length, '| ops:', cityRow && [...cityRow.querySelector('[data-k="op"]').options].map((o) => o.value).join(','));
if (!$('allf-pop').hidden || !cityRow || !/in,nin,contains,ncontains,starts,ends,filled,empty/.test([...cityRow.querySelector('[data-k="op"]').options].map((o) => o.value).join(','))) fail('text operators');
input(cityRow.querySelector('[data-k="op"]'), 'contains');
const cityRow2 = [...$('adv-groups').querySelectorAll('.advc')].find((r) => r.querySelector('[data-k="key"]')?.value === 'city');
input(cityRow2.querySelector('[data-k="value"]'), 'Madrid');
click($('adv-apply'));
const both = all.filter((c) => /cristales/i.test(companyName(c.companyId)) && /madrid/i.test(c.city || '')).length;
log('assoc Y city contains Madrid →', total(), '(expected', both + ')', '| summary:', $('adv-summary').textContent);
if (total() !== both) fail('association Y advanced condition');
// a second advanced filter (date) stacks with Y; operators per type
click(document.querySelector('[data-action="advanced"]'));
click($('allf-add'));
click(drawer.querySelector('[data-allf-prop="created"]'));
const dateRow = [...$('adv-groups').querySelectorAll('.advc')].find((r) => r.querySelector('[data-k="key"]')?.value === 'created');
const dateOps = [...dateRow.querySelector('[data-k="op"]').options].map((o) => o.value);
log('date operators:', dateOps.join(','));
if (!['before', 'after', 'between', 'lastdays'].every((o) => dateOps.includes(o))) fail('date operators');
input(dateRow.querySelector('[data-k="op"]'), 'lastdays');
const dateRow2 = [...$('adv-groups').querySelectorAll('.advc')].find((r) => r.querySelector('[data-k="key"]')?.value === 'created');
input(dateRow2.querySelector('[data-k="value"]'), '400');
click($('adv-apply'));
const stacked = all.filter((c) => /cristales/i.test(companyName(c.companyId)) && /madrid/i.test(c.city || '') && (data.TODAY - new Date(c.created)) / 86400000 <= 400).length; // "últimos 400 días" includes the boundary day
log('three filters with Y →', total(), '(expected', stacked + ')', '| badge:', $('adv-count').textContent);
if (total() !== stacked || $('adv-count').textContent !== '3') fail('stacked filters');
// number operators on a company list property (revenue) through the popover of companies is covered by the translator test below

// ---------- quick chips with × and "Borrar todo" ----------
click(document.querySelector('.menu__item[data-filter="owner"][data-value="Laura M."]'));
const ownerChip = document.querySelector('.qchip[data-filter="owner"]');
log('owner chip:', ownerChip.textContent.trim(), '| set:', ownerChip.classList.contains('is-set'), '| × present:', Boolean(document.querySelector('[data-filter-clear="owner"]')), '| rows:', total());
if (!ownerChip.classList.contains('is-set') || !document.querySelector('[data-filter-clear="owner"]')) fail('active chip with ×');
const before = total();
click(document.querySelector('[data-filter-clear="owner"]'));
log('after chip ×:', total(), '| × gone:', !document.querySelector('[data-filter-clear="owner"]'));
if (document.querySelector('[data-filter-clear="owner"]') || total() === before) fail('chip × should remove only that filter');
click(document.querySelector('.menu__item[data-filter="status"][data-value="new"]'));
click($('filters-clear-all'));
log('after Borrar todo:', total(), '(all', all.length + ')', '| advanced:', C.list.state.advanced.length, '| chips set:', document.querySelectorAll('.qchip.is-set').length, '| clear-all hidden:', $('filters-clear-all').hidden);
if (total() !== all.length || C.list.state.advanced.length || document.querySelectorAll('.qchip.is-set').length || !$('filters-clear-all').hidden) fail('Borrar todo');
// the panel's own "Borrar todo"
click(document.querySelector('[data-action="advanced"]'));
click(drawer.querySelector('[data-allf="add-assoc"]'));
click($('adv-clear'));
if (drawer.querySelectorAll('.allf__assoc').length || C.list.state.advanced.some((c) => c.key)) fail('panel Borrar todo');

// ---------- Supabase translation of the conditions ----------
const calls = [];
const q = () => { const b = {}; ['in', 'not', 'ilike', 'or', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte'].forEach((m) => { b[m] = (...a) => { calls.push([m, ...a]); return b; }; }); return b; };
const run = (conds) => { calls.length = 0; return FQ.applyConditions(q(), 'contacts', conds); };
let r = run([{ key: 'city', op: 'contains', value: 'Madrid', group: 0 }, { key: 'lifecycle', op: 'anyof', value: ['Cliente', 'Lead'], group: 0 }, { key: 'phone', op: 'filled', value: '', group: 0 }, { key: 'created', op: 'lastdays', value: '30', group: 0 }]);
log('translated:', r.exact, r.applied, '|', calls.map((c) => c.join(' ')).join(' | '));
if (!r.exact || r.applied !== 4 || calls[0].join(' ') !== 'ilike city %Madrid%' || calls[1][0] !== 'in' || calls[1][1] !== 'lifecycle' || !calls.some((c) => c[0] === 'gte' && c[1] === 'created')) fail('text/enum/filled/date translation');
r = run([{ key: 'jobTitle', op: 'empty', value: '', group: 0 }]);
log('empty on a mapped column:', calls[0].join(' '));
if (calls[0][0] !== 'or' || !/job_title\.is\.null,job_title\.eq\./.test(calls[0][1])) fail('column mapping (job_title) and empty');
r = run([{ key: 'customer_type', op: 'noneof', value: ['Particular'], group: 0 }, { key: 'hs_buying_role', op: 'contains', value: 'Usuario', group: 0 }]);
log('extra jsonb property:', calls.map((c) => c.join(' ')).join(' | '));
if (!calls.some((c) => c[0] === 'ilike' && c[1] === 'extra->>hs_buying_role')) fail('extra->>key for non-column properties');
r = run([{ key: 'name', op: 'contains', value: 'a', group: 0 }, { key: 'name', op: 'contains', value: 'b', group: 1 }]);
if (r.exact) fail('two OR groups cannot be exact');
r = run([{ assoc: 'companies', key: 'name', op: 'filled', value: '', group: 0, section: 'assoc' }]);
if (r.exact) fail('association filters are not translated');
const cr = FQ.applyConditions(q(), 'companies', [{ key: 'revenue', op: 'between', value: '1000', value2: '5000', group: 0 }, { key: 'employees', op: 'gt', value: '10', group: 0 }]);
log('number operators (companies):', cr.exact, calls.map((c) => c.join(' ')).join(' | '));
if (!cr.exact || !calls.some((c) => c[0] === 'gte' && c[1] === 'revenue' && c[2] === 1000) || !calls.some((c) => c[0] === 'gt' && c[1] === 'employees')) fail('number translation');
const stubClient = { from: () => ({ select: () => { const b = q(); b.then = (res) => res({ count: 7, error: null }); return b; } }) };
const n = await FQ.countWithConditions(stubClient, 'contacts', [{ key: 'city', op: 'contains', value: 'x', group: 0 }]);
log('count through a client stub:', n);
if (n !== 7) fail('countWithConditions');
console.log('[all-filters] OK');

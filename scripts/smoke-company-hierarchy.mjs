// DOM smoke test for companies: the real Megaglass company properties in the catalog, and the parent /
// subsidiary hierarchy (parent_company_id): "Empresa matriz" card with a search box to assign, change or
// remove the parent (never itself or a subsidiary), "Empresas secundarias" card listing the children, and
// the list option that nests subsidiaries under their parent. Run: node scripts/smoke-company-hierarchy.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[company-hierarchy]', ...a);
const fail = (msg) => { console.error(`[company-hierarchy] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const RECORD = '<!doctype html><body class="app" data-type="companies"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>';
const boot = (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.confirm = () => true;
  return dom;
};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
let dom = boot('http://localhost/companies/', LIST);
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };

const data = await import(resolve(here, '../src/data.js'));
const P = await import(resolve(here, '../src/properties.js'));

// 1) the real company properties join the catalog (local seed; the table has the same rows)
const grp = P.propertyGroups('companies').find((g) => g.title === 'Información de Megaglass');
const keys = grp ? grp.items.map((i) => i[0]) : [];
log('company custom group:', grp && grp.items.length, '| keys:', keys.join(','));
if (!grp || grp.items.length !== 16 || !keys.includes('rfc') || !keys.includes('rol')) fail('the 16 real company properties should be in the catalog');
const tipo = grp.items.find((i) => i[0] === 'tipo_de_cliente');
const lat = grp.items.find((i) => i[0] === 'latitud');
log('tipo_de_cliente:', tipo[2], JSON.stringify(tipo[3]), '| latitud:', lat[2], '| seeds by type:', Object.keys(P.SEED_BY_TYPE).join(','));
if (tipo[2] !== 'enum' || tipo[3].join('|') !== 'Instalador|50 Top Glazier|Desarrollador|Arquitecto' || lat[2] !== 'number') fail('kinds of the company properties');
const row = P.customPropToDb('companies', P.SEED_BY_TYPE.companies[1]);
if (row.objeto !== 'company' || row.type !== 'enum' || row.options.length !== 4) fail('row shape for the table');

// 2) the hierarchy helpers and the sample data
const kid = data.allCompanies().find((c) => c.parentCompanyId);
const parent = data.parentCompanyOf(kid);
log('sample child:', kid.id, kid.name, '→ parent:', parent.id, parent.name, '| children of parent:', data.childCompaniesOf(parent.id).map((c) => c.id).join(','));
if (!parent || !data.childCompaniesOf(parent.id).some((c) => Number(c.id) === Number(kid.id))) fail('sample hierarchy');
log('descendant checks:', data.isCompanyDescendant(parent.id, kid.id), data.isCompanyDescendant(kid.id, parent.id), data.isCompanyDescendant(kid.id, kid.id));
if (!data.isCompanyDescendant(parent.id, kid.id) || data.isCompanyDescendant(kid.id, parent.id) || !data.isCompanyDescendant(kid.id, kid.id)) fail('isCompanyDescendant');

// 3) the list: flat by default; the gear menu nests subsidiaries under their parent
const C = await import(resolve(here, '../src/companies.js'));
C.list.state.size = 100;
C.list.render();
const order = () => [...document.querySelectorAll('#rows tr[data-id]')].map((tr) => Number(tr.dataset.id));
const flat = order();
log('flat rows:', flat.length, '| child rows marked:', document.querySelectorAll('#rows tr.row--child').length);
if (document.querySelectorAll('#rows tr.row--child').length) fail('flat list has no nested rows');
const toggle = document.querySelector('[data-action="toggle-nested"]');
log('gear menu option:', text(toggle));
if (!toggle || !/secundarias bajo su matriz/.test(text(toggle))) fail('the gear menu should offer the nesting option');
click(toggle);
const nested = order();
const childRows = [...document.querySelectorAll('#rows tr.row--child')];
log('nested rows:', nested.length, '| children:', childRows.length, '| first child depth:', childRows[0] && childRows[0].dataset.depth, '| marker:', Boolean(childRows[0] && childRows[0].querySelector('.hier__mark')), '| pref:', JSON.parse(mem['crm:companies:prefs']).nested);
if (nested.length !== flat.length || !childRows.length || !childRows[0].querySelector('.hier__mark') || JSON.parse(mem['crm:companies:prefs']).nested !== true) fail('nesting should keep every row and mark the children');
// every child sits right after its parent (or after a sibling / grandchild of the same parent)
const byId = new Map(data.allCompanies().map((c) => [Number(c.id), c]));
let ok = true;
nested.forEach((id, i) => {
  const c = byId.get(id);
  const p = Number(c.parentCompanyId);
  if (!p || !byId.has(p)) return;
  const pi = nested.indexOf(p);
  if (pi < 0 || pi > i) { ok = false; return; }
  for (let j = pi + 1; j < i; j += 1) if (!data.isCompanyDescendant(p, nested[j])) ok = false;
});
log('children follow their parent:', ok);
if (!ok) fail('children should follow their parent');
// the optional columns
click(document.querySelector('[data-action="columns"]'));
const colKeys = [...document.querySelectorAll('#col-groups input[data-key]')].map((e) => e.dataset.key);
log('hierarchy columns offered:', colKeys.includes('parentCompanyId'), colKeys.includes('subsidiaries'));
if (!colKeys.includes('parentCompanyId')) fail('"Empresa matriz" column');
click(document.querySelector('[data-action="toggle-nested"]') || document.body);

// 4) the record page: "Empresa matriz" and "Empresas secundarias" cards
dom = boot(`http://localhost/companies/record/?id=${kid.id}`, RECORD);
await import(resolve(here, '../src/record.js'));
const pcard = () => document.querySelector('[data-card="parent"]');
const scard = () => document.querySelector('[data-card="subsidiaries"]');
log('parent card:', text(pcard().querySelector('.card__toggle')), '|', text(pcard().querySelector('.hier__item a')), '| link:', pcard().querySelector('.hier__item a')?.getAttribute('href'), '| subsidiaries card:', text(scard().querySelector('.card__toggle')));
if (!pcard() || text(pcard().querySelector('.hier__item a')) !== parent.name || pcard().querySelector('.hier__item a').getAttribute('href') !== `./record/?id=${parent.id}` || !scard()) fail('the child record should show its parent');
// change the parent through the search box
const other = data.allCompanies().find((c) => Number(c.id) !== Number(kid.id) && Number(c.id) !== Number(parent.id) && !data.isCompanyDescendant(kid.id, c.id));
input($('parent-q'), other.name.slice(0, 6));
const hits = [...document.querySelectorAll('#parent-results [data-parent-pick]')];
log('search hits:', hits.map(text).join(' | '));
if (!hits.some((h) => Number(h.dataset.parentPick) === Number(other.id))) fail('search should list the other company');
click(hits.find((h) => Number(h.dataset.parentPick) === Number(other.id)));
log('after picking:', text(pcard().querySelector('.hier__item a')), '| stored:', data.allCompanies().find((c) => c.id === kid.id).parentCompanyId, '| timeline:', data.activitiesFor('companies', kid.id)[0]?.text);
if (text(pcard().querySelector('.hier__item a')) !== other.name || Number(data.allCompanies().find((c) => c.id === kid.id).parentCompanyId) !== Number(other.id)) fail('picking should assign the parent');
// itself never appears; a subsidiary is offered disabled
dom = boot(`http://localhost/companies/record/?id=${other.id}`, RECORD);
await import(resolve(here, '../src/record.js') + '?parent');
log('parent record subsidiaries:', text(scard().querySelector('.card__toggle')), '| lists the child:', Boolean(scard().querySelector(`a[href="./record/?id=${kid.id}"]`)));
if (!scard().querySelector(`a[href="./record/?id=${kid.id}"]`)) fail('the parent should list its subsidiary');
input($('parent-q'), kid.name.slice(0, 6));
const self = [...document.querySelectorAll('#parent-results [data-parent-pick]')].find((h) => Number(h.dataset.parentPick) === Number(other.id));
const blocked = [...document.querySelectorAll('#parent-results [data-parent-pick]')].find((h) => Number(h.dataset.parentPick) === Number(kid.id));
log('self offered:', Boolean(self), '| subsidiary disabled:', blocked && blocked.disabled);
if (self || !blocked || !blocked.disabled) fail('a company cannot hang from itself or from its subsidiary');
click(blocked);
if (data.allCompanies().find((c) => c.id === other.id).parentCompanyId) fail('a disabled hit must not assign');
// remove the parent from the child record
dom = boot(`http://localhost/companies/record/?id=${kid.id}`, RECORD);
await import(resolve(here, '../src/record.js') + '?child');
click(document.querySelector('[data-parent-clear]'));
log('after Quitar:', text(pcard().querySelector('[data-pane="parent"] p')), '| stored:', JSON.stringify(data.allCompanies().find((c) => c.id === kid.id).parentCompanyId));
if (data.allCompanies().find((c) => c.id === kid.id).parentCompanyId || !/no cuelga/.test(text(pcard().querySelector('[data-pane="parent"] p')))) fail('Quitar should clear the parent');
log('OK');

// DOM smoke test: URL, e-mail and phone properties open from the tables and cards of every object.
// Run: node scripts/smoke-links.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[links]', ...a);
const fail = (msg) => { console.error(`[links] FAIL: ${msg}`); process.exit(1); };
const mem = {
  'crm:contacts:prefs': JSON.stringify({ columns: ['name', 'email', 'phone', 'website', 'hs_analytics_first_url', 'mobilephone'] }),
  'crm:companies:prefs': JSON.stringify({ columns: ['name', 'domain', 'website', 'phone', 'linkedin_company_page'] }),
  'crm:tickets:prefs': JSON.stringify({ columns: ['name', 'status', 'hs_conversations_visitor_email'] }),
  'crm:companies:cardprops': JSON.stringify({ title: 'Acerca de esta empresa', keys: ['domain', 'website', 'phone', 'linkedin_company_page'] }),
};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const boot = (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
  return dom;
};
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const link = (key) => document.querySelector(`tbody tr[data-id] td[data-key="${key}"] a.cell-link`);
const describe = (a) => (a ? `${a.getAttribute('href')} | target=${a.getAttribute('target')} | icon=${Boolean(a.querySelector('.ico--ext'))} | tip=${a.dataset.full}` : 'missing');

// contacts: e-mail, phone and web addresses
boot('http://localhost/contacts/', LIST);
await import(resolve(here, '../src/contacts.js'));
log('tooltip element:', Boolean(document.querySelector('.linktip')));
for (const [key, prefix, icon] of [['email', 'mailto:', true], ['phone', 'tel:', false], ['mobilephone', 'tel:', false], ['website', 'https://', true], ['hs_analytics_first_url', 'https://', true]]) {
  const a = link(key);
  log(`contacts ${key}:`, describe(a));
  if (!a || !a.getAttribute('href').startsWith(prefix)) fail(`contacts.${key} should link with ${prefix}`);
  if (Boolean(a.querySelector('.ico--ext')) !== icon) fail(`contacts.${key} icon state wrong`);
  if (icon && a.getAttribute('target') !== '_blank') fail(`contacts.${key} should open in a new tab`);
}
const tel = link('phone');
log('phone href digits only:', /^tel:\+?\d+$/.test(tel.getAttribute('href')));
if (!/^tel:\+?\d+$/.test(tel.getAttribute('href'))) fail('phone link should strip spaces');
// the cell stays editable, the link text is the stored value
const emailTd = link('email').closest('td');
log('email cell editable:', emailTd.classList.contains('cell--editable'), '| shown text:', link('email').textContent.trim());

// companies: domain without scheme becomes https://, website keeps its own scheme
boot('http://localhost/companies/', LIST);
await import(resolve(here, '../src/companies.js'));
for (const key of ['domain', 'website', 'phone', 'linkedin_company_page']) log(`companies ${key}:`, describe(link(key)));
const dom = link('domain');
if (!dom || !dom.getAttribute('href').startsWith('https://') || dom.textContent.trim().startsWith('https://')) fail('domain should open https:// but show the bare domain');
if (!link('linkedin_company_page')) fail('linkedin page should be a link');

// tickets and tasks have no link-type properties out of the box; a custom URL/e-mail property gets the same treatment
const { propertyList } = await import(resolve(here, '../src/properties.js'));
for (const t of ['tickets', 'tasks', 'deals']) log(`${t} link-type properties in the catalog:`, propertyList(t).filter((p) => ['url', 'email', 'phone'].includes(p.kind)).map((p) => p.key).join(', ') || 'none');
mem['crm:customprops:tickets'] = JSON.stringify([{ key: 'portal_url', label: 'URL del portal', kind: 'url', group: 'Información del ticket' }, { key: 'reporter_email', label: 'Correo de quien reporta', kind: 'email', group: 'Información del ticket' }]);
// custom properties only show real values (no sample decoration), so the tickets get theirs by hand
mem['crm:tickets:overrides'] = JSON.stringify(Object.fromEntries(Array.from({ length: 84 }, (_, i) => [i + 1, { portal_url: `https://portal.ejemplo.es/tickets/${i + 1}`, reporter_email: `reporta${i + 1}@ejemplo.com` }])));
mem['crm:tickets:prefs'] = JSON.stringify({ columns: ['name', 'status', 'portal_url', 'reporter_email'] });
// custom properties carry real values only (no sample decoration), so give the tickets some
mem['crm:tickets:overrides'] = JSON.stringify(Object.fromEntries(Array.from({ length: 84 }, (_, i) => [i + 1, { portal_url: `https://portal.ejemplo.com/tickets/${i + 1}`, reporter_email: `reporte${i + 1}@ejemplo.com` }])));
boot('http://localhost/tickets/', LIST);
await import(resolve(here, '../src/tickets.js'));
log('tickets custom URL:', describe(link('portal_url')), '| custom e-mail:', describe(link('reporter_email')));
if (!link('portal_url') || !link('portal_url').getAttribute('href').startsWith('http')) fail('a custom URL property on tickets should be a link');
if (!link('reporter_email') || !link('reporter_email').getAttribute('href').startsWith('mailto:')) fail('a custom e-mail property on tickets should be a mailto link');

// the record card of a company shows the same links
boot('http://localhost/companies/record/?id=2', '<!doctype html><body class="app" data-type="companies"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/record.js'));
const row = (key) => document.querySelector(`#rec-props .props__row[data-key="${key}"] a.cell-link`);
for (const key of ['domain', 'website', 'phone', 'linkedin_company_page']) log(`card ${key}:`, describe(row(key)));
if (!row('domain') || !row('website') || !row('phone')) fail('record card should show the links');
if (!document.querySelector('#rec-props .props__row[data-key="domain"] .props__edit')) fail('linked fields should still be editable on the card');
log('OK');

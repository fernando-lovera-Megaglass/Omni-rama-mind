// DOM smoke test: system-filled properties are read-only in the list and on the record card.
// Run: node scripts/smoke-readonly.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[readonly]', ...a);
const fail = (msg) => { console.error(`[readonly] FAIL: ${msg}`); process.exit(1); };

// a first DOM just to load the catalog (it needs localStorage for custom properties)
const mem = {
  'crm:contacts:prefs': JSON.stringify({ columns: ['name', 'phone', 'num_notes', 'num_contacted_notes', 'hubspotscore', 'source', 'created'] }),
  'crm:contacts:cardprops': JSON.stringify({ title: 'Acerca de este contacto', keys: ['email', 'phone', 'num_notes', 'source', 'hs_analytics_num_visits', 'created'] }),
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
  return dom;
};
let dom = boot('http://localhost/contacts/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>');
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

const { isSystemProperty, propertyList } = await import(resolve(here, '../src/properties.js'));
const expectSystem = { contacts: ['num_notes', 'num_contacted_notes', 'created', 'lastmodifieddate', 'hs_object_id', 'source', 'hubspotscore', 'hs_analytics_num_visits', 'hs_email_open', 'first_conversion_date', 'hs_lifecyclestage_lead_date', 'hs_time_in_lead', 'notes_last_contacted', 'hs_sequences_is_enrolled', 'num_associated_deals', 'hs_created_by_user_id', 'currentlyinworkflow', 'ip_city'], deals: ['hs_deal_stage_probability', 'days_to_close', 'hs_is_closed', 'hs_projected_amount', 'hs_time_in_current_stage', 'num_associated_contacts', 'hs_analytics_source'], companies: ['num_associated_contacts', 'hs_num_open_deals', 'total_revenue', 'hs_analytics_num_visits', 'first_contact_createdate', 'twitterfollowers'], tickets: ['time_to_close', 'hs_num_times_contacted', 'closed_date', 'hs_sla_status'], tasks: ['created', 'hs_object_id'] };
const expectEditable = { contacts: ['first', 'last', 'email', 'phone', 'owner', 'status', 'lifecycle', 'jobTitle', 'city', 'state', 'customer_type', 'hs_buying_role', 'website', 'twitterhandle'], deals: ['name', 'amount', 'stage', 'closeDate', 'owner', 'type', 'priority', 'hs_next_step', 'hs_manual_forecast_category'], companies: ['name', 'domain', 'employees', 'revenue', 'industry', 'hs_is_target_account', 'hs_ideal_customer_profile'], tickets: ['name', 'status', 'priority', 'source', 'hs_ticket_category'], tasks: ['name', 'type', 'status', 'due', 'owner'] };
for (const [type, keys] of Object.entries(expectSystem)) keys.forEach((k) => { if (!isSystemProperty(type, k)) fail(`${type}.${k} should be system-filled`); });
for (const [type, keys] of Object.entries(expectEditable)) keys.forEach((k) => { if (isSystemProperty(type, k)) fail(`${type}.${k} should stay editable`); });
for (const type of Object.keys(expectSystem)) {
  const all = propertyList(type);
  const sys = all.filter((p) => p.system);
  log(`${type}: ${sys.length} of ${all.length} properties are system-filled`, type === 'contacts' ? `| e.g. ${sys.slice(0, 5).map((p) => p.label).join(' · ')}` : '');
}
if (!propertyList('contacts').find((p) => p.key === 'num_notes').system) fail('catalog entries should carry the system flag');

// the list: system columns are locked, the others editable
await import(resolve(here, '../src/contacts.js'));
const $ = (id) => document.getElementById(id);
const td = (key) => document.querySelector(`tbody tr[data-id] td[data-key="${key}"]`);
log('columns:', [...document.querySelectorAll('th.th')].map((h) => h.dataset.key).join(', '));
for (const k of ['num_notes', 'num_contacted_notes', 'hubspotscore', 'source', 'created']) {
  const cell = td(k);
  log(k, '-> locked:', cell.classList.contains('cell--locked'), '| editable:', cell.classList.contains('cell--editable'), '| lock icon:', Boolean(cell.querySelector('.cell__lock')), '| title:', cell.getAttribute('title'));
  if (!cell.classList.contains('cell--locked') || cell.classList.contains('cell--editable') || !cell.querySelector('.cell__lock')) fail(`${k} should be locked in the table`);
}
log('phone -> editable:', td('phone').classList.contains('cell--editable'), '| locked:', td('phone').classList.contains('cell--locked'));
if (!td('phone').classList.contains('cell--editable') || td('phone').classList.contains('cell--locked')) fail('phone should stay editable');
click(td('num_notes'));
log('click on a locked cell opens the editor:', !$('cellpop').hidden);
if (!$('cellpop').hidden) fail('locked cells must not open the editor');
click(td('phone'));
log('click on phone opens the editor:', !$('cellpop').hidden);
if ($('cellpop').hidden) fail('editable cells should still open the editor');
click($('cellpop').querySelector('[data-cp="close"]'));
// the column info says who fills it
click(document.querySelector('th.th[data-key="num_notes"] [data-col="info"]'));
const info = $('colinfo-body').textContent.replace(/\s+/g, ' ');
log('info:', (info.match(/Quién la rellena\s*([^·]*·[^R]*)/) || ['', ''])[1].trim());
if (!/El sistema, automáticamente/.test(info)) fail('column info should say the system fills it');
click($('colinfo-dialog').querySelector('[data-close="colinfo-dialog"]'));
click(document.querySelector('th.th[data-key="phone"] [data-col="info"]'));
if (!/El usuario/.test($('colinfo-body').textContent)) fail('column info should say the user fills phone');

// the record card: no pencil on system properties
dom = boot('http://localhost/contacts/record/?id=3', '<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>');
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
await import(resolve(here, '../src/record.js'));
const row = (key) => document.querySelector(`#rec-props .props__row[data-key="${key}"]`);
for (const k of ['num_notes', 'source', 'hs_analytics_num_visits', 'created']) {
  log(`card ${k}:`, row(k) ? `shown | edit button: ${Boolean(row(k).querySelector('.props__edit'))}` : 'missing');
  if (!row(k) || row(k).querySelector('.props__edit')) fail(`${k} should be read-only on the card`);
}
log('card phone edit button:', Boolean(row('phone').querySelector('.props__edit')), '| card email edit button:', Boolean(row('email').querySelector('.props__edit')));
if (!row('phone').querySelector('.props__edit') || !row('email').querySelector('.props__edit')) fail('phone/email should stay editable on the card');
log('OK');

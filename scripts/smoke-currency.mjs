// DOM smoke test: a deal's currency is shown on its record and in the deals list, and changing it in the
// record changes the list; totals convert to the company currency with the exchange rates in settings.
// Run: node scripts/smoke-currency.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[currency]', ...a);
const fail = (msg) => { console.error(`[currency] FAIL: ${msg}`); process.exit(1); };
const mem = {};
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
const RECORD = (id) => `<!doctype html><body class="app" data-type="deals"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`;

let dom = boot('http://localhost/deals/', LIST);
const data = await import(resolve(here, '../src/data.js'));
log('company currency:', data.homeCurrency(), '| rates:', JSON.stringify(data.currencyRates()));
log('format:', data.formatMoney(1234.5, 'EUR'), '|', data.formatMoney(1234.5, 'USD'), '|', data.formatMoney(1234.5, 'MXN'), '| default:', data.formatMoney(99));
if (data.formatMoney(1234.5, 'USD') !== '$1235' || data.formatMoney(1234.5, 'EUR') !== '1235 €') fail('currency symbols wrong');
const deals = data.allDeals();
const usd = deals.find((d) => d.deal_currency_code === 'USD' && d.amount > 0);
const eur = deals.find((d) => d.deal_currency_code === 'EUR' && d.amount > 0);
log('deal in USD:', usd.id, usd.name, usd.amount, '| home amount:', usd.amount_in_home_currency, '| rate:', usd.hs_exchange_rate);
if (Math.round(usd.amount * data.currencyRates().USD) !== usd.amount_in_home_currency) fail('amount in home currency not derived from the rate');
if (eur.amount_in_home_currency !== eur.amount || eur.hs_exchange_rate !== 1) fail('home-currency deals should convert 1:1');

// the deals list shows each amount in its own currency
await import(resolve(here, '../src/deals.js'));
const $ = (id) => document.getElementById(id);
const cellOf = (id) => document.querySelector(`tbody tr[data-id="${id}"] td[data-key="amount"]`);
// open the "Todos negocios" view (the default tab is "Mis negocios") and search the deal by name
const allTab = () => [...document.querySelectorAll('button.views__tab')].find((t) => t.textContent.includes('Todos negocios'));
allTab().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
$('row-search').value = usd.name;
$('row-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('USD deal cell:', cellOf(usd.id)?.textContent.trim());
if (!cellOf(usd.id) || !cellOf(usd.id).textContent.includes('$')) fail('USD deal should show a dollar amount in the list');
const tiles = [...document.querySelectorAll('#kpis-track .kpi, #kpis-track [class*="kpi"]')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()).slice(0, 2);
log('summary tiles:', tiles.join(' | '));
if (!$('kpis-track').textContent.includes('€')) fail('totals should be in the company currency (EUR)');

// changing the currency on the record changes the list
dom = boot(`http://localhost/deals/record/?id=${usd.id}`, RECORD(usd.id));
await import(resolve(here, '../src/record.js'));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
log('record subtitle:', $('rec-sub').textContent, '| currency row:', document.querySelector('#rec-props .props__row[data-key="deal_currency_code"]')?.textContent.replace(/\s+/g, ' ').trim());
if (!$('rec-sub').textContent.includes('$')) fail('record subtitle should show the deal currency');
click(document.querySelector('#rec-props .props__row[data-key="deal_currency_code"] [data-edit-key]'));
const sel = document.querySelector('#rec-props [data-edit="deal_currency_code"]');
log('currency choices:', [...sel.options].map((o) => o.value).join('/'));
sel.value = 'MXN';
sel.closest('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('after change subtitle:', $('rec-sub').textContent, '| amount row:', document.querySelector('#rec-props .props__row[data-key="amount"] dd').textContent.replace(/\s+/g, ' ').trim());
if (!$('rec-sub').textContent.includes('MX$')) fail('record should show the new currency right away');
const stored = data.allDeals().find((d) => Number(d.id) === Number(usd.id));
log('stored currency:', stored.deal_currency_code, '| home amount now:', stored.amount_in_home_currency, '(rate', stored.hs_exchange_rate + ')');
if (stored.deal_currency_code !== 'MXN' || stored.amount_in_home_currency !== Math.round(usd.amount * data.currencyRates().MXN)) fail('stored deal not updated');

dom = boot('http://localhost/deals/', LIST);
await import(resolve(here, '../src/deals.js') + '?again');
allTab().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
$('row-search').value = usd.name;
$('row-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('list cell after the change:', cellOf(usd.id)?.textContent.trim());
if (!cellOf(usd.id) || !cellOf(usd.id).textContent.includes('MX$')) fail('the list should show the currency chosen on the record');

// exchange rates from settings change the totals
data.saveCurrencyRates({ ...data.currencyRates(), MXN: 0.1 });
const after = data.allDeals().find((d) => Number(d.id) === Number(usd.id));
log('with 1 MXN = 0,1 EUR -> home amount:', after.amount_in_home_currency, '| expected:', Math.round(usd.amount * 0.1));
if (after.amount_in_home_currency !== Math.round(usd.amount * 0.1)) fail('rates from settings not applied');

// settings pane lists the currencies and saves rates
dom = boot('http://localhost/settings/#account-defaults', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/settings.js'));
const rateForm = document.querySelector('form[data-save="currencies"]');
log('rates form:', Boolean(rateForm), '| inputs:', rateForm ? [...rateForm.querySelectorAll('input[name]')].map((i) => `${i.name}=${i.value}`).join(' ') : '');
if (!rateForm) fail('settings should show the exchange rates');
rateForm.querySelector('input[name="USD"]').value = '0.95';
rateForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('saved rates:', JSON.stringify(data.currencyRates()));
if (data.currencyRates().USD !== 0.95) fail('rate not saved from settings');
log('OK');

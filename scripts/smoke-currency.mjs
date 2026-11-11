// DOM smoke test: the company currency is the Mexican peso by default; a deal's own currency shows on its
// record and in the deals list (symbol for the company currency, code for the others); the metrics card
// abbreviates totals in the company currency; changing the currency on the record changes the list;
// exchange rates from settings drive the conversion.
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
const RECORD = '<!doctype html><body class="app" data-type="deals"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>';

let dom = boot('http://localhost/deals/', LIST);
const data = await import(resolve(here, '../src/data.js'));
log('company currency:', data.homeCurrency(), '| rates:', JSON.stringify(data.currencyRates()));
if (data.homeCurrency() !== 'MXN') fail('the default company currency should be MXN, as in the original');
log('format:', data.formatMoney(1234.5, 'MXN'), '|', data.formatMoney(1234.5, 'USD'), '|', data.formatMoney(1234, 'EUR'), '| default:', data.formatMoney(99), '| big:', data.formatMoney(71937108.59));
if (data.formatMoney(1234.5, 'MXN') !== '$1,234.50' || data.formatMoney(1234.5, 'USD') !== 'USD 1,234.50' || data.formatMoney(1234, 'EUR') !== 'EUR 1,234' || data.formatMoney(71937108.59) !== '$71,937,108.59') fail('amount formatting differs from the original');
log('short:', data.formatMoneyShort(35620000000), '|', data.formatMoneyShort(683460000), '|', data.formatMoneyShort(523407), '|', data.formatMoneyShort(950), '|', data.formatMoneyShort(2546320000, 'USD'));
if (data.formatMoneyShort(35620000000) !== '$35.62 mil M' || data.formatMoneyShort(683460000) !== '$683.46 M' || data.formatMoneyShort(523407) !== '$523.41 mil' || data.formatMoneyShort(950) !== '$950') fail('abbreviated amounts differ from the original');
const deals = data.allDeals();
const usd = deals.find((d) => d.deal_currency_code === 'USD' && d.amount > 0);
const homeDeal = deals.find((d) => d.deal_currency_code === 'MXN' && d.amount > 0);
log('deal in USD:', usd.id, usd.name, usd.amount, '| home amount:', usd.amount_in_home_currency, '| rate:', usd.hs_exchange_rate);
if (Math.round(usd.amount * data.currencyRates().USD) !== usd.amount_in_home_currency) fail('amount in home currency not derived from the rate');
if (homeDeal.amount_in_home_currency !== homeDeal.amount || homeDeal.hs_exchange_rate !== 1) fail('company-currency deals should convert 1:1');

// the deals list shows each amount in its own currency; the metrics card abbreviates in the company currency
await import(resolve(here, '../src/deals.js'));
const $ = (id) => document.getElementById(id);
const cellOf = (id) => document.querySelector(`tbody tr[data-id="${id}"] td[data-key="amount"]`);
const allTab = () => [...document.querySelectorAll('button.views__tab')].find((t) => t.textContent.includes('Todos negocios'));
allTab().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const tiles = [...document.querySelectorAll('#kpis-track .kpi')].map((t) => `${t.querySelector('.kpi__label').textContent} = ${t.querySelector('.kpi__value').textContent}`);
log('metrics:', tiles.join(' | '));
if (!/^\$[\d.]+ (mil M|M|mil)$|^\$[\d,]+$/.test(tiles[0].split(' = ')[1])) fail('metrics should show the company currency with the $ symbol, abbreviated');
if (tiles.some((t) => /USD|EUR/.test(t))) fail('metrics should be in the company currency only');
if (!tiles.some((t) => t.startsWith('Valor de los nuevos negocios'))) fail('metrics should include the value of new deals');
$('row-search').value = usd.name;
$('row-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('USD deal cell:', cellOf(usd.id)?.textContent.trim());
if (!cellOf(usd.id) || !cellOf(usd.id).textContent.includes('USD ')) fail('a USD deal should show "USD" before the amount in the list');
$('row-search').value = homeDeal.name;
$('row-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('MXN deal cell:', cellOf(homeDeal.id)?.textContent.trim());
if (!cellOf(homeDeal.id) || !cellOf(homeDeal.id).textContent.trim().startsWith('$')) fail('a company-currency deal should show the $ symbol');

// changing the currency on the record changes the list
dom = boot(`http://localhost/deals/record/?id=${usd.id}`, RECORD);
await import(resolve(here, '../src/record.js'));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
log('record subtitle:', $('rec-sub').textContent, '| currency row:', document.querySelector('#rec-props .props__row[data-key="deal_currency_code"]')?.textContent.replace(/\s+/g, ' ').trim());
if (!$('rec-sub').textContent.includes('USD ')) fail('record subtitle should show the deal currency');
click(document.querySelector('#rec-props .props__row[data-key="deal_currency_code"] [data-edit-key]'));
const sel = document.querySelector('#rec-props [data-edit="deal_currency_code"]');
log('currency choices:', [...sel.options].map((o) => o.value).join('/'));
sel.value = 'MXN';
sel.closest('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('after change subtitle:', $('rec-sub').textContent, '| amount row:', document.querySelector('#rec-props .props__row[data-key="amount"] dd').textContent.replace(/\s+/g, ' ').trim());
if (!$('rec-sub').textContent.trim().startsWith('$')) fail('record should show the new currency right away');
const stored = data.allDeals().find((d) => Number(d.id) === Number(usd.id));
log('stored currency:', stored.deal_currency_code, '| home amount now:', stored.amount_in_home_currency, '(rate', stored.hs_exchange_rate + ')');
if (stored.deal_currency_code !== 'MXN' || stored.amount_in_home_currency !== Math.round(usd.amount)) fail('stored deal not updated');

dom = boot('http://localhost/deals/', LIST);
await import(resolve(here, '../src/deals.js') + '?again');
allTab().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
$('row-search').value = usd.name;
$('row-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('list cell after the change:', cellOf(usd.id)?.textContent.trim());
if (!cellOf(usd.id) || !cellOf(usd.id).textContent.trim().startsWith('$') || cellOf(usd.id).textContent.includes('USD')) fail('the list should show the currency chosen on the record');

// exchange rates from settings change the conversion of the other currencies
const usd2 = data.allDeals().find((d) => d.deal_currency_code === 'USD' && d.amount > 0);
data.saveCurrencyRates({ ...data.currencyRates(), USD: 20 });
const after = data.allDeals().find((d) => Number(d.id) === Number(usd2.id));
log('with 1 USD = 20 MXN -> home amount:', after.amount_in_home_currency, '| expected:', Math.round(usd2.amount * 20));
if (after.amount_in_home_currency !== Math.round(usd2.amount * 20)) fail('rates from settings not applied');

// settings pane lists the currencies and saves rates
dom = boot('http://localhost/settings/#account-defaults', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/settings.js'));
const rateForm = document.querySelector('form[data-save="currencies"]');
log('rates form:', Boolean(rateForm), '| inputs:', rateForm ? [...rateForm.querySelectorAll('input[name]')].map((i) => `${i.name}=${i.value}`).join(' ') : '', '| home marked:', rateForm?.textContent.includes('Moneda de la empresa'));
if (!rateForm || rateForm.querySelector('input[name="MXN"]')) fail('settings should show rates for every currency except the company one');
rateForm.querySelector('input[name="USD"]').value = '19.5';
rateForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('saved rates:', JSON.stringify(data.currencyRates()));
if (data.currencyRates().USD !== 19.5) fail('rate not saved from settings');
log('OK');

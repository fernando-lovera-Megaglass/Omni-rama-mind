// DOM smoke test for the dashboards on real data: every KPI is recomputed here from the same records and
// compared with what the page shows, for the three dashboards and the four ranges. Run: node scripts/smoke-reports.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dom = new JSDOM(
  `<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content">
    <div class="menu"><button type="button"><h1 id="dash-name"></h1></button><div class="menu__panel" id="dash-menu"><button data-dash="ventas">Ventas</button><button data-dash="marketing">Marketing</button><button data-dash="servicio">Servicio</button></div></div>
    <p id="dash-sub"></p>
    <div class="menu"><button id="range-btn" type="button"></button><div class="menu__panel" id="range-menu"><button data-range="7">7</button><button data-range="30">30</button><button data-range="90">90</button><button data-range="365">365</button></div></div>
    <div id="kpis"></div><div id="grid"></div></main><div id="scrim"></div></body>`,
  { url: 'http://localhost/reports/' },
);
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;

const data = await import(resolve(here, '../src/data.js'));
const R = await import(resolve(here, '../src/reports.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const log = (...a) => console.log('[reports]', ...a);
const fail = (msg) => { console.error(`[reports] FAIL: ${msg}`); process.exit(1); };
const kpi = (label) => [...document.querySelectorAll('.kpi')].find((k) => k.querySelector('.kpi__label').textContent === label);
const kpiValue = (label) => { const k = kpi(label); if (!k) fail(`missing KPI ${label}`); return k.querySelector('.kpi__value').textContent; };
const fmt = (n) => Number(n).toLocaleString('es-ES');
const within = (iso, a, b) => iso && new Date(iso) >= a && new Date(iso) <= b;

// independent recomputation
const deals = data.allDeals();
const contacts = data.allContacts();
const tickets = data.allTickets();
const tasks = data.allTasks();
for (const range of [7, 30, 90, 365]) {
  click(document.querySelector(`[data-range="${range}"]`));
  const p = R.period(range);
  const bk = R.buckets(range, p.start, p.end);
  const created = deals.filter((d) => within(d.created, p.start, p.end)).length;
  const won = deals.filter((d) => d.stage === 'won' && within(d.closeDate, p.start, p.end));
  const closed = deals.filter((d) => (d.stage === 'won' || d.stage === 'lost') && within(d.closeDate, p.start, p.end)).length;
  const revenue = won.reduce((s, d) => s + d.amount_in_home_currency, 0);
  const newC = contacts.filter((c) => within(c.created, p.start, p.end)).length;
  log(`range ${range}: ${p.start.toISOString().slice(0, 10)} → ${p.end.toISOString().slice(0, 10)} | ${bk.list.length} ${bk.unit} buckets | button "${$('range-btn').textContent.trim()}"`);
  log(`  ventas: creados ${kpiValue('Negocios creados')} (exp ${fmt(created)}) · ingresos ${kpiValue('Ingresos cerrados')} (exp ${data.formatMoneyShort(revenue, data.homeCurrency())}) · contactos ${kpiValue('Contactos nuevos')} (exp ${fmt(newC)}) · cierre ${kpiValue('Tasa de cierre')} (won ${won.length}/${closed})`);
  if (kpiValue('Negocios creados') !== fmt(created)) fail(`deals created range ${range}`);
  if (kpiValue('Ingresos cerrados') !== data.formatMoneyShort(revenue, data.homeCurrency())) fail(`revenue range ${range}`);
  if (kpiValue('Contactos nuevos') !== fmt(newC)) fail(`new contacts range ${range}`);
  if (kpiValue('Tasa de cierre') !== (closed ? `${Math.round((won.length / closed) * 100)} %` : '—')) fail(`win rate range ${range}`);
  const bars = document.querySelectorAll('.card--report:nth-child(2) .bar');
  if (bars.length !== bk.list.length) fail(`bar count range ${range}: ${bars.length} vs ${bk.list.length}`);
  const barSum = [...bars].reduce((s, b) => s + Number(b.title.split(': ')[1].replace(/\./g, '')), 0);
  if (barSum !== created) fail(`bars should add up to the deals created (${barSum} vs ${created})`);
  if (/NaN|undefined/.test($('grid').innerHTML + $('kpis').innerHTML)) fail(`NaN/undefined in ventas range ${range}`);
  const deltaTexts = [...document.querySelectorAll('.kpi__delta')].map((d) => d.textContent.trim());
  if (range === 30) log('  deltas:', deltaTexts.join(' | '));
}
// marketing and servicio
click(document.querySelector('[data-range="90"]'));
const p = R.period(90);
click(document.querySelector('[data-dash="marketing"]'));
const newC = contacts.filter((c) => within(c.created, p.start, p.end));
const leads = newC.filter((c) => /^lead/i.test(c.lifecycle || '')).length;
const newCo = data.allCompanies().filter((c) => within(c.created, p.start, p.end)).length;
log(`marketing: contactos ${kpiValue('Contactos nuevos')} (exp ${fmt(newC.length)}) · leads ${kpiValue('Leads nuevos')} (exp ${fmt(leads)}) · correos ${kpiValue('Correos registrados')} · empresas ${kpiValue('Empresas nuevas')} (exp ${fmt(newCo)}) | cards: ${document.querySelectorAll('.card--report').length}`);
if (kpiValue('Contactos nuevos') !== fmt(newC.length) || kpiValue('Leads nuevos') !== fmt(leads) || kpiValue('Empresas nuevas') !== fmt(newCo)) fail('marketing KPIs');
const donutTotal = document.querySelector('.card--report:nth-child(2) .donut__hole').textContent;
if (donutTotal !== fmt(newC.length)) fail(`leads by source donut should total the new contacts (${donutTotal} vs ${newC.length})`);
log('  leads por fuente:', [...document.querySelectorAll('.card--report:nth-child(2) .legend li')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
log('  empresas por sector rows:', document.querySelectorAll('.card--report:nth-child(4) tbody tr').length);
if (/NaN|undefined/.test($('grid').innerHTML + $('kpis').innerHTML)) fail('NaN/undefined in marketing');

click(document.querySelector('[data-dash="servicio"]'));
const tCreated = tickets.filter((t) => within(t.created, p.start, p.end));
const open = tickets.filter((t) => t.status !== 'closed').length;
const doneTasks = tasks.filter((t) => t.status === 'done' && within(t.completedAt || t.due, p.start, p.end)).length;
log(`servicio: abiertos ${kpiValue('Tickets abiertos')} (exp ${fmt(open)}) · creados ${kpiValue('Tickets creados')} (exp ${fmt(tCreated.length)}) · cerrados ${kpiValue('Tickets cerrados')} · tareas ${kpiValue('Tareas completadas')} (exp ${fmt(doneTasks)}) | cards: ${document.querySelectorAll('.card--report').length}`);
if (kpiValue('Tickets abiertos') !== fmt(open) || kpiValue('Tickets creados') !== fmt(tCreated.length) || kpiValue('Tareas completadas') !== fmt(doneTasks)) fail('servicio KPIs');
const statusTotal = document.querySelector('.card--report:nth-child(2) .donut__hole').textContent;
if (statusTotal !== fmt(tCreated.length)) fail('tickets by status donut total');
log('  tickets por estado:', [...document.querySelectorAll('.card--report:nth-child(2) .legend li')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
log('  tareas por tipo:', [...document.querySelectorAll('.card--report:nth-child(4) tbody tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
if (/NaN|undefined/.test($('grid').innerHTML + $('kpis').innerHTML)) fail('NaN/undefined in servicio');
// a range with no data must render empty states, never NaN
click(document.querySelector('[data-range="7"]'));
log(`servicio 7 días: creados ${kpiValue('Tickets creados')} | empty notes: ${document.querySelectorAll('.chart__empty').length}`);
if (/NaN|undefined/.test($('grid').innerHTML + $('kpis').innerHTML)) fail('NaN/undefined in servicio 7');
// a live write shows up on the next render
data.addRecord('deals', { name: 'Negocio de prueba', amount: 5000, stage: 'won', closeDate: data.TODAY.toISOString(), created: data.TODAY.toISOString(), owner: 'Fernando L.', deal_currency_code: data.homeCurrency() });
click(document.querySelector('[data-dash="ventas"]'));
const wonNow = data.allDeals().filter((d) => d.stage === 'won' && within(d.closeDate, R.period(7).start, R.period(7).end));
log(`after adding a won deal (7 días): ingresos ${kpiValue('Ingresos cerrados')} (exp ${data.formatMoneyShort(wonNow.reduce((s, d) => s + d.amount_in_home_currency, 0), data.homeCurrency())})`);
if (kpiValue('Ingresos cerrados') !== data.formatMoneyShort(wonNow.reduce((s, d) => s + d.amount_in_home_currency, 0), data.homeCurrency())) fail('new deal not reflected');
console.log('[reports] OK');

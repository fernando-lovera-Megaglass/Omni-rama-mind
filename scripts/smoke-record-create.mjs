import assert from 'node:assert/strict';
// DOM smoke test for the record page and its "Acciones" menu. Run: node scripts/smoke-record.mjs contacts 3
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const type = process.argv[2] || 'contacts';
const id = process.argv[3] || '3';
const dom = new JSDOM(
  `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`,
  { url: `http://localhost/${type}/record/?id=${id}` },
);
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
document.body.dataset.type = type;
console.log(`[${type}] body attrs parsed:`, document.body.getAttribute('data-type'));
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true;
dom.window.prompt = () => 'Nuevo Nombre';
dom.window.open = (u) => { console.log(`[${type}] window.open ->`, u); };

await import(resolve(here, '../src/record.js'));
const $ = (s) => document.getElementById(s);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const log = (...a) => console.log(`[${type}]`, ...a);


const data = await import('../src/data.js');
const current = data.findRecord(type, id);
const companyId = type === 'companies' ? current.id : current.companyId;
for (const [kind, prefix, pool] of [['deal', 'cd', data.allDeals], ['ticket', 'ct', data.allTickets]]) {
  const before = pool().length;
  click(document.querySelector(`[data-more="${kind}"]`));
  assert.equal(pool().length, before, 'opening must not create');
  assert.ok($(`${prefix}-panel`).classList.contains('is-open'));
  if (type === 'contacts') assert.ok($(`${prefix}-contacts-list`).textContent.includes(current.name));
  if (companyId) assert.ok($(`${prefix}-companies-list`).textContent.includes(data.findRecord('companies', companyId).name));
  click(document.querySelector(`[data-${prefix}="cancel"]`));
  assert.equal(pool().length, before, 'cancel must not create');
  click(document.querySelector(`[data-more="${kind}"]`));
  const form = $(`${prefix}-form`);
  form.elements.name.value = `Smoke ficha ${type} ${kind}`;
  form.elements.pipeline.value = kind === 'deal' ? 'SACA SUMINISTRO' : data.ticketPipelines()[1];
  form.elements.pipeline.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  if (kind === 'deal') assert.equal(form.elements.stage.value, 'oferta_aw');
  else assert.equal(form.elements.status.value, data.firstOpenTicketStatus(form.elements.pipeline.value));
  form.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 50));
  const made = pool().find(r => r.name === `Smoke ficha ${type} ${kind}`);
  assert.ok(made, $(`${prefix}-panel`).textContent);
  assert.equal(pool().length, before + 1);
  if (type === 'contacts') assert.equal(Number(made.contactId), Number(id));
  if (companyId) assert.equal(Number(made.companyId), Number(companyId));
  assert.ok(document.querySelector('#record-root').textContent.includes(made.name), 'association card refreshed');
  assert.ok(!['Pipeline de ventas', 'Pipeline de soporte'].includes(made.pipeline));
  if (kind === 'deal') { assert.equal(made.pipeline, 'SACA SUMINISTRO'); assert.equal(made.stage, 'oferta_aw'); }
}
for (const kind of ['deals', 'tickets']) {
  click(document.querySelector(`[data-act="add-assoc"][data-kind="${kind}"]`));
  click(document.querySelector('[data-adtab="new"]'));
  const form = $('ad-new-form');
  form.elements.name.value = `Smoke drawer ${kind}`;
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  const made = data.ALL[kind]().find(r => r.name === `Smoke drawer ${kind}`);
  assert.ok(made);
  assert.equal(made.pipeline, kind === 'deals' ? data.dealPipelines()[0] : data.ticketPipelines()[0]);
  if (kind === 'deals') assert.equal(made.stage, data.stagesFor(made.pipeline).find(s => !data.dealStageIsClosed(made.pipeline, s[0]))[0]);
  else assert.equal(made.status, data.firstOpenTicketStatus(made.pipeline));
}
const madeDeal = data.allDeals().find(r => r.name === `Smoke ficha ${type} deal`);
$('cd-panel').remove();
$('ct-panel').remove();
const listRoot = document.createElement('main');
listRoot.id = 'list-root';
document.body.appendChild(listRoot);
dom.window.HTMLElement.prototype.scrollBy = function () {};
await import('../src/deals.js');
click(document.querySelector('[data-pipeline="SACA SUMINISTRO"]'));
click(document.querySelector('[data-action="mode-board"]'));
const card = document.querySelector(`.kcard[data-id="${madeDeal.id}"]`);
assert.ok(card, 'created deal visible on selected pipeline board');
assert.equal(card.closest('.kcol').dataset.group, 'oferta_aw');
console.log('PASS record forms, cancellation, associations, drawer defaults and SACA SUMINISTRO board:', type);
process.exit(0);

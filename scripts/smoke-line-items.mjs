// DOM smoke test for the editable «Elementos de pedido» card of a deal record (src/record.js + line item helpers
// of src/data.js): on an existing deal without lines, «+ Agregar elemento de pedido» opens an editable row; saving
// 2 × $500 shows the line, the total and moves the deal's amount to the lines' total (keeping the previous amount
// aside) with a timeline entry; inline edit (3 × $500) recalculates; removing the last line puts the amount back;
// everything survives a reload of the record. Run: node scripts/smoke-line-items.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[line-items]', ...a);
const fail = (msg) => { console.error(`[line-items] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (url) => { const dom = new JSDOM('<!doctype html><body class="app" data-type="deals"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.confirm = () => true; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };

useDom('http://localhost/deals/');
const data = await import(resolve(here, '../src/data.js'));
const deal = data.allDeals().find((d) => !data.lineItemsFor(d.id).length && Number(d.amount) > 0);
if (!deal) fail('a deal without lines');
const before = Number(deal.amount);
const code = deal.deal_currency_code;
const money = (n) => data.formatMoney(n, code);
const card = () => q('[data-card="lineitems"]');
const rows = () => qa('[data-card="lineitems"] tbody tr:not(.lineitems__editrow)');
const amountNow = () => Number(data.findRecord('deals', deal.id).amount);
const lineLogs = () => data.activitiesFor('deals', deal.id).filter((a) => a.type === 'system' && /^Elementos de pedido actualizados/.test(a.text)).map((a) => a.text);

useDom(`http://localhost/deals/record/?id=${deal.id}`);
await import(resolve(here, '../src/record.js'));
await wait(60);
if (!card() || !/\(0\)/.test(text(card().querySelector('.card__toggle'))) || !q('[data-li="add"]') || !/Agrega el primero/.test(text(card()))) fail('empty card offers «+ Agregar elemento de pedido»');

// ---- add 2 × 500 ----
click(q('[data-li="add"]'));
const newRow = q('[data-li-row="new"]');
if (!newRow || !newRow.querySelector('[data-li-field="name"]') || q('[data-li="add"]')) fail('editable new row, add button hidden meanwhile');
typeIn(newRow.querySelector('[data-li-field="name"]'), 'Vidrio templado 10 mm');
typeIn(newRow.querySelector('[data-li-field="quantity"]'), '2');
typeIn(newRow.querySelector('[data-li-field="price"]'), '500');
if (text(newRow.querySelector('[data-li-amount]')) !== money(1000)) fail(`live amount (${text(newRow.querySelector('[data-li-amount]'))})`);
click(newRow.querySelector('[data-li="save"]'));
await wait(10);
const lines = data.lineItemsFor(deal.id);
if (lines.length !== 1 || lines[0].name !== 'Vidrio templado 10 mm' || lines[0].quantity !== 2 || lines[0].price !== 500 || lines[0].currency !== code) fail(`line persisted (${JSON.stringify(lines)})`);
if (rows().length !== 1 || !text(rows()[0]).includes('Vidrio templado 10 mm') || !text(rows()[0]).includes(money(1000)) || text(q('[data-li-total]')) !== money(1000) || !/\(1\)/.test(text(card().querySelector('.card__toggle')))) fail(`table shows the line and the total (${text(card())})`);
if (amountNow() !== 1000 || Number(data.findRecord('deals', deal.id).amountBeforeLines) !== before) fail(`deal amount follows the total (${amountNow()}, before ${before})`);
if (!document.body.textContent.includes(money(1000))) fail('the page shows the new amount');
if (!/^Elementos de pedido actualizados: total .* \(1 línea\) · importe del negocio /.test(lineLogs()[0] || '')) fail(`timeline entry (${lineLogs()[0]})`);
if (!/Elemento de pedido agregado · importe del negocio/.test(text($('toast')))) fail(`toast (${text($('toast'))})`);
log(`añadida 2 × ${money(500)} → tabla y total ${money(1000)}, importe ${before} → 1000 (guardado el anterior), cronología «${lineLogs()[0].slice(0, 70)}…»`);

// ---- reload: everything is still there ----
useDom(`http://localhost/deals/record/?id=${deal.id}`);
await import(resolve(here, `../src/record.js?reload=${Date.now()}`));
await wait(60);
if (rows().length !== 1 || text(q('[data-li-total]')) !== money(1000) || amountNow() !== 1000 || !document.body.textContent.includes(money(1000))) fail('after reload the line, the total and the amount persist');
log('recarga: línea, total e importe persisten');

// ---- inline edit: 3 × 500 ----
click(rows()[0].querySelector('[data-li="edit"]'));
const editRow = q(`[data-li-row="${lines[0].id}"].lineitems__editrow`);
if (!editRow || editRow.querySelector('[data-li-field="name"]').value !== 'Vidrio templado 10 mm') fail('inline editor prefilled');
typeIn(editRow.querySelector('[data-li-field="quantity"]'), '3');
click(editRow.querySelector('[data-li="save"]'));
await wait(10);
if (data.lineItemsFor(deal.id)[0].quantity !== 3 || text(q('[data-li-total]')) !== money(1500) || amountNow() !== 1500 || !/\(1 línea\) · importe del negocio/.test(lineLogs()[0])) fail('edit recalculates the total and the amount');
// a second line, then cancel an edit without saving
click(q('[data-li="add"]'));
const r2 = q('[data-li-row="new"]');
typeIn(r2.querySelector('[data-li-field="name"]'), 'Herraje');
typeIn(r2.querySelector('[data-li-field="quantity"]'), '4');
typeIn(r2.querySelector('[data-li-field="price"]'), '25.5');
click(r2.querySelector('[data-li="save"]'));
await wait(10);
if (data.lineItemsFor(deal.id).length !== 2 || amountNow() !== 1602 || text(q('[data-li-total]')) !== money(1602)) fail(`second line (${amountNow()})`);
click(rows()[1].querySelector('[data-li="edit"]'));
click(q('.lineitems__editrow [data-li="cancel"]'));
if (q('.lineitems__editrow') || data.lineItemsFor(deal.id)[1].quantity !== 4) fail('cancel leaves the line untouched');
// an invalid row is refused
click(q('[data-li="add"]'));
click(q('[data-li-row="new"] [data-li="save"]'));
if (!/nombre del producto/.test(text($('toast'))) || data.lineItemsFor(deal.id).length !== 2) fail('a line without name is refused');
click(q('[data-li-row="new"] [data-li="cancel"]'));
log(`edición en línea 3 × ${money(500)} → ${money(1500)}; segunda línea → ${money(1602)}; cancelar y validación`);

// ---- remove both: the amount goes back to what it was ----
click(rows()[1].querySelector('[data-li="remove"]'));
await wait(10);
if (data.lineItemsFor(deal.id).length !== 1 || amountNow() !== 1500) fail('removing one line recalculates');
click(rows()[0].querySelector('[data-li="remove"]'));
await wait(10);
if (data.lineItemsFor(deal.id).length || rows().length || q('[data-li-total]') || amountNow() !== before || data.findRecord('deals', deal.id).amountBeforeLines != null) fail(`removing the last line restores the amount (${amountNow()} vs ${before})`);
if (!/\(0\)/.test(text(card().querySelector('.card__toggle'))) || !/Agrega el primero/.test(text(card())) || !/^Elementos de pedido actualizados: total .* \(0 líneas\) · importe del negocio /.test(lineLogs()[0])) fail('empty card again with its entry');
if (!document.body.textContent.includes(money(before))) fail('the page shows the restored amount');
log(`quitadas: importe de vuelta a ${money(before)}, tarjeta vacía, cronología con cada cambio (${lineLogs().length} entradas)`);
console.log('[line-items] OK');
process.exit(0);

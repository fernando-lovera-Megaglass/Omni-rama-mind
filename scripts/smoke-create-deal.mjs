// DOM smoke test for the "Crear negocio" slide-over of the Negocios list: fields in the original's order with
// their defaults (pipeline FUERZA DE VENTAS, first stage, MXN with the MX$ prefix, current user, today),
// stage list following the pipeline, Crear / Crear y agregar otro disabled until the name, association
// sections for contacts (label + timeline checkbox) and companies ("Principal" on the first), line items,
// the insert with its associations and lines, the toast and the board refresh, and the board's "+ Negocio".
// Run: node scripts/smoke-create-deal.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[create-deal]', ...a);
const fail = (msg) => { console.error(`[create-deal] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/deals/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
dom.window.HTMLElement.prototype.scrollBy = function () {};

const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/deals.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const form = () => $('cd-form');
const type = (name, value) => { const el = form().elements[name]; el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
const search = (kind, q) => { const el = $(`cd-${kind}-q`); el.value = q; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); return [...document.querySelectorAll(`#cd-${kind}-results button`)]; };
const rows = (kind) => [...document.querySelectorAll(`#cd-${kind}-list .cd-assoc__row`)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = () => $('cd-panel');
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const total = () => Number($('total-pill').textContent.split(' ')[0]);

// 1) the header button opens the panel in place
const addBtn = document.querySelector('.page-head__actions [data-action="create"]');
log('add button:', addBtn?.textContent.trim(), '| menu?', Boolean(addBtn?.closest('.menu')));
if (!addBtn || addBtn.closest('.menu')) fail('"Agregar negocios" must open the panel directly');
click(document.querySelector('button.views__tab[data-view="std:all"]'));
const before = total();
click(addBtn);
log('open?', panel().classList.contains('is-open'), '| title:', text($('cd-title')), '| path:', location.pathname);
if (!panel().classList.contains('is-open') || text($('cd-title')) !== 'Crear negocio' || location.pathname !== '/deals/') fail('panel should open in place');

// 2) fields in order with their defaults
const names = [...form().querySelectorAll('[name]')].map((e) => e.name);
log('fields:', names.join(', '));
if (names.join(',') !== 'name,pipeline,stage,amount,deal_currency_code,closeDate,owner,description,created') fail('field order');
const f = form().elements;
log('defaults: pipeline', f.pipeline.value, '| stage', f.stage.value, `(${f.stage.options[f.stage.selectedIndex].textContent})`, '| currency', f.deal_currency_code.value, 'prefix', text($('cd-prefix')), '| owner', f.owner.value, '| created', f.created.value, '| close', JSON.stringify(f.closeDate.value), '| date inputs:', f.closeDate.type, f.created.type, '| textarea:', f.description.tagName);
if (f.pipeline.value !== 'FUERZA DE VENTAS' || f.stage.value !== 'oferta' || f.stage.options[0].textContent !== 'OFERTA A+W') fail('pipeline / first stage defaults');
if (f.deal_currency_code.value !== 'MXN' || text($('cd-prefix')) !== 'MX$' || f.owner.value !== 'Fernando L.' || f.created.value !== '2026-11-07' || f.closeDate.value !== '') fail('currency / owner / created defaults');
if (f.closeDate.type !== 'date' || f.created.type !== 'date' || f.description.tagName !== 'TEXTAREA') fail('date pickers and textarea');
const label = (n) => text(f[n].closest('label, .field').querySelector('span'));
log('labels:', ['name', 'description', 'created'].map(label).join(' | '));
if (label('name') !== 'Nombre del negocio *' || label('description') !== 'Descripción de la oferta' || label('created') !== 'Fecha de creación') fail('labels');
// the stage list follows the pipeline
type('pipeline', 'SACA SUMINISTRO');
log('SACA stages:', [...f.stage.options].map((o) => o.textContent).slice(0, 3).join(' | '), '… | selected:', f.stage.value);
if (f.stage.value !== 'oferta_aw' || f.stage.options.length !== 9) fail('stage list should follow the pipeline');
type('pipeline', 'FUERZA DE VENTAS');
if (f.stage.value !== 'oferta' || f.stage.options.length !== 7) fail('back to the real stages');
type('deal_currency_code', 'USD');
log('USD prefix:', text($('cd-prefix')));
if (text($('cd-prefix')) !== 'US$') fail('currency prefix');
type('deal_currency_code', 'MXN');

// 3) buttons disabled until the name
log('disabled at start:', $('cd-create').disabled, $('cd-create-another').disabled);
if (!$('cd-create').disabled || !$('cd-create-another').disabled) fail('buttons should start disabled');
type('name', 'Fachada de vidrio Torre Prueba');
if ($('cd-create').disabled || $('cd-create-another').disabled) fail('buttons should enable with the name');

// 4) contacts: search, pick, label and timeline checkbox; "Agregar más"
const hits = search('contacts', 'ana');
log('contact hits for "ana":', hits.length, '|', hits.slice(0, 2).map(text).join(' | '));
if (!hits.length || hits.length > 6) fail('contact search');
click(hits[0]);
const c1 = data.allContacts().find((c) => Number(c.id) === Number(rows('contacts')[0].dataset.id));
log('picked:', c1.name, '| rows:', rows('contacts').length, '| label:', rows('contacts')[0].querySelector('select').value, '| labels:', [...rows('contacts')[0].querySelectorAll('select option')].map((o) => o.value).join(', '), '| checkbox:', rows('contacts')[0].querySelector('input[type=checkbox]').checked, '| text:', text(rows('contacts')[0].querySelector('.cd-check')), '| search cleared:', $('cd-contacts-q').value === '', '| results hidden:', $('cd-contacts-results').hidden);
if (rows('contacts').length !== 1 || rows('contacts')[0].querySelector('select').value !== 'Sin etiqueta' || !rows('contacts')[0].querySelector('input[type=checkbox]').checked || !$('cd-contacts-results').hidden) fail('contact row');
if ([...rows('contacts')[0].querySelectorAll('select option')].some((o) => o.value === 'Principal') || !/Agregar actividad de la cronología de este objeto \(Contacto\)/.test(text(rows('contacts')[0].querySelector('.cd-check')))) fail('contact labels / checkbox text');
click(document.querySelector('[data-cd="more"][data-kind="contacts"]'));
if (document.activeElement !== $('cd-contacts-q')) fail('"Agregar más" should focus the search');
const hits2 = search('contacts', 'luis');
click(hits2[0]);
const c2 = data.allContacts().find((c) => Number(c.id) === Number(rows('contacts')[1].dataset.id));
// second contact: label "Responsable de la decisión", no timeline entry
const sel2 = rows('contacts')[1].querySelector('select');
sel2.value = 'Responsable de la decisión';
sel2.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
const chk2 = rows('contacts')[1].querySelector('input[type=checkbox]');
chk2.checked = false;
chk2.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('second contact:', c2.name, '| label:', rows('contacts')[1].querySelector('select').value, '| log:', rows('contacts')[1].querySelector('input[type=checkbox]').checked);
if (rows('contacts').length !== 2 || rows('contacts')[1].querySelector('select').value !== 'Responsable de la decisión') fail('second contact');
// a picked contact disappears from the results
if (search('contacts', c1.name.split(' ')[0]).some((b) => Number(b.dataset.id) === Number(c1.id))) fail('chosen contacts should leave the results');
search('contacts', '');

// 5) companies: first one is "Principal"; only one primary
const ch = search('companies', 'cristal');
log('company hits for "cristal":', ch.length, '|', ch.slice(0, 2).map(text).join(' | '));
if (!ch.length) fail('company search');
click(ch[0]);
const co1 = data.allCompanies().find((c) => Number(c.id) === Number(rows('companies')[0].dataset.id));
click(search('companies', 'vidrio')[0]);
const co2 = data.allCompanies().find((c) => Number(c.id) === Number(rows('companies')[1].dataset.id));
log('companies:', co1.name, '→', rows('companies')[0].querySelector('select').value, '|', co2.name, '→', rows('companies')[1].querySelector('select').value, '| checkbox text:', text(rows('companies')[0].querySelector('.cd-check')));
if (rows('companies')[0].querySelector('select').value !== 'Principal' || rows('companies')[1].querySelector('select').value !== 'Sin etiqueta' || !/\(Empresa\)/.test(text(rows('companies')[0].querySelector('.cd-check')))) fail('company labels');
const selCo2 = rows('companies')[1].querySelector('select');
selCo2.value = 'Principal';
selCo2.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('after making the second primary:', rows('companies').map((r) => r.querySelector('select').value).join(' | '));
if (rows('companies')[0].querySelector('select').value !== 'Sin etiqueta' || rows('companies')[1].querySelector('select').value !== 'Principal') fail('only one primary company');
// removing a row
click(rows('contacts')[0].querySelector('[data-cd="remove"]'));
if (rows('contacts').length !== 1 || Number(rows('contacts')[0].dataset.id) !== Number(c2.id)) fail('remove contact');
click(search('contacts', c1.name.split(' ')[0]).find((b) => Number(b.dataset.id) === Number(c1.id)));
if (rows('contacts').length !== 2) fail('re-add contact');

// 6) line items: name + quantity + price, amounts and total
click(document.querySelector('[data-cd="add-item"]'));
click(document.querySelector('[data-cd="add-item"]'));
const item = (i, k, v) => { const el = document.querySelector(`[data-item="${k}"][data-i="${i}"]`); el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
item(0, 'name', 'Vidrio templado 10 mm');
item(0, 'quantity', '12');
item(0, 'price', '1500');
item(1, 'name', 'Herraje de acero');
item(1, 'quantity', '3');
item(1, 'price', '250.5');
log('items:', document.querySelectorAll('#cd-items tbody tr').length, '| amounts:', [...document.querySelectorAll('[data-item-amount]')].map(text).join(' | '), '| total:', text($('cd-items-total')), '| focus on the new row name:', document.activeElement.dataset.item === 'name');
if (document.querySelectorAll('#cd-items tbody tr').length !== 2 || text($('cd-items-total')) !== '$18,751.50') fail('line items total');
type('amount', '18751.5');
type('closeDate', '2026-12-15');
type('description', 'Oferta de fachada con vidrio templado.');
type('created', '2026-11-05');

// 7) "Crear y agregar otro": insert, associations, line items, timeline, toast, refresh, panel kept open
click($('cd-create-another'));
await wait(30);
const made = data.allDeals().find((d) => d.name === 'Fachada de vidrio Torre Prueba');
log('record:', made && `${made.pipeline} · ${made.stage} · ${made.amount} ${made.deal_currency_code} · ${made.owner} · close ${made.closeDate.slice(0, 10)} · created ${made.created.slice(0, 10)} · "${made.description}"`);
if (!made || made.pipeline !== 'FUERZA DE VENTAS' || made.stage !== 'oferta' || made.amount !== 18751.5 || made.deal_currency_code !== 'MXN' || made.owner !== 'Fernando L.' || !made.closeDate.startsWith('2026-12-15') || !made.created.startsWith('2026-11-05') || made.description !== 'Oferta de fachada con vidrio templado.') fail('record fields');
log('associations: contactId', made.contactId, '| contacts', JSON.stringify(made.assoc_contacts), JSON.stringify(made.assoc_labels_contacts), '| companyId', made.companyId, made.company, '| companies', JSON.stringify(made.assoc_companies), JSON.stringify(made.assoc_labels_companies), '| stageEnteredAt:', made.stageEnteredAt);
if (Number(made.contactId) !== Number(c2.id) || made.assoc_contacts.join() !== `${c2.id},${c1.id}` || made.assoc_labels_contacts[c2.id] !== 'Responsable de la decisión' || made.assoc_labels_contacts[c1.id] !== 'Sin etiqueta') fail('contact associations');
if (Number(made.companyId) !== Number(co2.id) || made.company !== co2.name || made.assoc_labels_companies[co2.id] !== 'Principal' || made.assoc_labels_companies[co1.id] !== 'Sin etiqueta') fail('company associations (primary)');
const lines = data.lineItemsFor(made.id);
log('line items:', lines.map((l) => `${l.name} × ${l.quantity} @ ${l.price} ${l.currency}`).join(' | '), '| total:', data.lineItemsTotal(lines));
if (lines.length !== 2 || data.lineItemsTotal(lines) !== 18751.5 || lines[0].currency !== 'MXN') fail('line items saved');
const actC1 = data.activitiesFor('contacts', c1.id)[0];
const actC2 = data.activitiesFor('contacts', c2.id)[0];
const actCo = data.activitiesFor('companies', co2.id)[0];
const actDeal = data.activitiesFor('deals', made.id)[0];
log('timeline: contact 1 →', actC1 && actC1.text, '| contact 2 →', actC2 && actC2.text, '| company →', actCo && actCo.text, '| deal →', actDeal && actDeal.text);
if (!actC1 || !/Fachada de vidrio Torre Prueba/.test(actC1.text) || (actC2 && /Fachada de vidrio Torre Prueba/.test(actC2.text)) || !actCo || !/\(Principal\)/.test(actCo.text) || !actDeal || !/2 elementos de pedido/.test(actDeal.text)) fail('timeline entries follow the checkboxes');
// the other side: contact 1 (not the deal's contactId) and company 1 (not primary) list the deal
const c1Now = data.allContacts().find((c) => Number(c.id) === Number(c1.id));
const co1Now = data.allCompanies().find((c) => Number(c.id) === Number(co1.id));
log('mirrored:', JSON.stringify(c1Now.assoc_deals), JSON.stringify(co1Now.assoc_deals));
if (!(c1Now.assoc_deals || []).includes(Number(made.id)) || !(co1Now.assoc_deals || []).includes(Number(made.id))) fail('the other records should list the deal');
log('toast:', $('toast')?.textContent, '| total:', total(), '(was', before + ')', '| panel open:', panel().classList.contains('is-open'), '| cleared:', f.name.value === '' && rows('contacts').length === 0 && rows('companies').length === 0 && !document.querySelector('#cd-items tbody') && f.pipeline.value === 'FUERZA DE VENTAS' && f.created.value === '2026-11-07');
if ($('toast')?.textContent !== 'Negocio creado' || total() !== before + 1 || !panel().classList.contains('is-open') || f.name.value !== '' || rows('contacts').length || rows('companies').length || document.querySelector('#cd-items tbody') || !$('cd-create').disabled) fail('create and add another');

// 8) "Crear" closes; the board shows the new card in its column
type('name', 'Segundo negocio del panel');
form().dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(30);
const second = data.allDeals().find((d) => d.name === 'Segundo negocio del panel');
log('Crear: closed?', !panel().classList.contains('is-open'), '| total:', total(), '| defaults applied:', second && `${second.stage} · close ${second.closeDate.slice(0, 10)} · ${second.amount}`);
if (panel().classList.contains('is-open') || total() !== before + 2 || !second || second.stage !== 'oferta' || !second.closeDate.startsWith('2026-12-07')) fail('Crear should save with defaults and close');
click(document.querySelector('[data-action="mode-board"]'));
const card = document.querySelector(`.kcard[data-id="${made.id}"]`);
log('board card column:', card && card.closest('.kcol').dataset.group, '| count oferta:', text(document.querySelector('.kcol[data-group="oferta"] .kcol__count')));
if (!card || card.closest('.kcol').dataset.group !== 'oferta') fail('the board should show the new deal in its stage');
// 9) the board's "+ Negocio" opens the panel with the stage prefilled
click(document.querySelector('[data-kcol-add="cotizacion"]'));
log('from the column: open?', panel().classList.contains('is-open'), '| pipeline', f.pipeline.value, '| stage', f.stage.value);
if (!panel().classList.contains('is-open') || f.pipeline.value !== 'FUERZA DE VENTAS' || f.stage.value !== 'cotizacion') fail('column "+ Negocio" prefill');
document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
if (panel().classList.contains('is-open')) fail('Escape should close');
click(addBtn);
type('name', 'Nadie');
click(document.querySelector('#cd-panel .slideover__foot [data-cd="cancel"]'));
log('Cancelar closes and clears:', !panel().classList.contains('is-open') && f.name.value === '', '| total unchanged:', total() === before + 2);
if (panel().classList.contains('is-open') || f.name.value || total() !== before + 2) fail('Cancelar');
// 10) the deal record shows the line items card with the saved lines and their total
const dom2 = new JSDOM('<!doctype html><body class="app" data-type="deals"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url: `http://localhost/deals/record/?id=${made.id}` });
globalThis.window = dom2.window; globalThis.document = dom2.window.document; globalThis.location = dom2.window.location; globalThis.HTMLElement = dom2.window.HTMLElement;
dom2.window.HTMLElement.prototype.scrollIntoView = function () {};
await import(resolve(here, '../src/record.js'));
await wait(20);
const liCard = document.querySelector('[data-card="lineitems"]');
const liRows = liCard ? [...liCard.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map(text).join(' | ')) : [];
log('record card:', text(liCard && liCard.querySelector('.card__toggle')), '| rows:', liRows.join(' // '), '| total:', text(liCard && liCard.querySelector('tfoot td:last-child')));
if (!liCard || liRows.length !== 2 || !/Vidrio templado 10 mm \| 12 \| \$1,500 \| \$18,000/.test(liRows[0]) || text(liCard.querySelector('tfoot td:last-child')) !== '$18,751.50') fail('the deal record should list the line items with the total');
log('OK');

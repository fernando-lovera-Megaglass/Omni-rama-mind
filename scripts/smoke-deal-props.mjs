// DOM smoke test for the real Megaglass deal properties: the 22 of them join the catalog (text except
// «Fecha ganado», a date), show on the deal record ("Ver todas las propiedades", editable inline with a text
// input or a date picker), in the list's column editor and in the advanced-filter popover, and never get
// sample values. Run: node scripts/smoke-deal-props.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[deal-props]', ...a);
const fail = (msg) => { console.error(`[deal-props] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
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
let dom = boot('http://localhost/deals/', LIST);
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GROUP = 'Información de Megaglass';
const KEYS = ['cotizador', 'ciudad', 'estado', 'colonia', 'acabados', 'avance_de_obra', 'cimentacion', 'clase_de_proyecto', 'clave_id', 'cliente', 'contactado', 'descripcion', 'detalles', 'duplicado', 'estatus_de_obra', 'estatus_llamada', 'fecha_ganado', 'folio_aw_management', 'folio_easy_glass', 'formato_cotizacion', 'fuente_origen', 'informacion_del_proyecto'];

const data = await import(resolve(here, '../src/data.js'));
const P = await import(resolve(here, '../src/properties.js'));

// 1) the catalog
const grp = P.propertyGroups('deals').find((g) => g.title === GROUP);
log('deal custom group:', grp && grp.items.length, '| keys in order:', grp && grp.items.map((i) => i[0]).join(',') === KEYS.join(','));
if (!grp || grp.items.map((i) => i[0]).join(',') !== KEYS.join(',')) fail('the 22 real deal properties should be in the catalog, in order');
const kinds = [...new Set(grp.items.map((i) => i[2]))];
log('kinds:', kinds.join(','), '| fecha_ganado:', grp.items.find((i) => i[0] === 'fecha_ganado')[2]);
if (grp.items.find((i) => i[0] === 'fecha_ganado')[2] !== 'date' || grp.items.filter((i) => i[2] === 'text').length !== 21) fail('text except fecha_ganado (date)');
const row = P.customPropToDb('deals', P.SEED_BY_TYPE.deals.find((p) => p.key === 'fecha_ganado'));
if (row.objeto !== 'deal' || row.type !== 'date' || row.group_name !== GROUP) fail('row shape for the table');
// no sample decoration on the deals
const d1 = data.allDeals()[0];
log('sample decoration skipped:', d1.cotizador === undefined && d1.fecha_ganado === undefined, '| standard prop decorated:', d1.hs_next_step !== undefined);
if (d1.cotizador !== undefined || d1.fecha_ganado !== undefined) fail('custom deal properties must not get sample values');

// 2) the list: column editor and advanced-filter popover
const D = await import(resolve(here, '../src/deals.js'));
click(document.querySelector('button.views__tab[data-view="std:all"]'));
click(document.querySelector('[data-action="columns"]'));
const colKeys = [...document.querySelectorAll('#col-groups input[data-key]')].map((e) => e.dataset.key);
const colGroups = [...document.querySelectorAll('#col-groups .colgrp__head')].map((h) => h.dataset.group);
log('column editor offers:', KEYS.every((k) => colKeys.includes(k)), '| group:', colGroups.includes(GROUP));
if (!KEYS.every((k) => colKeys.includes(k)) || !colGroups.includes(GROUP)) fail('the column editor should offer the deal properties under their group');
data.setField('deals', d1.id, 'cotizador', 'Sofía R.');
const cb = document.querySelector('#col-groups input[data-key="cotizador"]');
cb.checked = true;
cb.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
click($('columns-apply'));
D.list.state.size = 500;
D.list.render();
const cell = document.querySelector(`#rows tr[data-id="${d1.id}"] td[data-key="cotizador"]`);
log('cotizador column cell:', cell ? text(cell).replace(/\s*✎$/, '') : 'missing');
if (!cell || text(cell).replace(/\s*✎$/, '') !== 'Sofía R.') fail('the custom column should show the real value');
click(document.querySelector('[data-action="advanced"]'));
click($('allf-add'));
const popText = text($('allf-pop'));
log('filter popover lists:', /Cotizador/.test(popText), /Fecha ganado/.test(popText), /Folio AW Management/.test(popText), '| group header:', popText.includes(GROUP));
if (!/Cotizador/.test(popText) || !/Fecha ganado/.test(popText) || !popText.includes(GROUP)) fail('the filter popover should list the deal properties');
click(document.querySelector('[data-allf-prop="fecha_ganado"]'));
const fRow = [...document.querySelectorAll('#adv-drawer [data-k="op"], .allf [data-k="op"]')].pop();
log('fecha_ganado operators:', fRow && [...fRow.options].map((o) => o.value).slice(0, 6).join(','));
if (!fRow || ![...fRow.options].some((o) => o.value === 'before' || o.value === 'lastdays' || o.value === 'between')) fail('a date property gets date operators');
await wait(20); // let the popover's deferred focus run before the page changes

// 3) the deal record: "Ver todas las propiedades" lists the group; text and date editors save inline
dom = boot(`http://localhost/deals/record/?id=${d1.id}`, '<!doctype html><body class="app" data-type="deals"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/record.js'));
click(document.querySelector('.props__custom [data-act="all-props-panel"]'));
const panel = $('allprops-panel');
const section = panel.querySelector(`[data-group="${GROUP}"]`);
log('panel group:', Boolean(section), '| rows:', section && section.querySelectorAll('.props__row').length, '| counter:', text(section && section.querySelector('.allprops__n')));
if (!section || section.querySelectorAll('.props__row').length !== 22 || !/^1 de 22 con valor$/.test(text(section.querySelector('.allprops__n')))) fail('the panel should show the 22 properties with the counter');
const prow = (k) => panel.querySelector(`.props__row[data-key="${k}"]`);
click(prow('folio_easy_glass').querySelector('.props__edit'));
const tin = prow('folio_easy_glass').querySelector('[data-edit]');
log('text editor:', tin && tin.tagName, tin && tin.type);
if (!tin || tin.type !== 'text') fail('text property editor');
tin.value = 'EG-2026-0042';
tin.blur();
await wait(10);
click(prow('fecha_ganado').querySelector('.props__edit'));
const din = prow('fecha_ganado').querySelector('[data-edit]');
log('date editor:', din && din.type);
if (!din || din.type !== 'date') fail('fecha_ganado should use a date picker');
din.value = '2026-11-20';
din.blur();
await wait(10);
const saved = data.allDeals().find((d) => d.id === d1.id);
log('saved:', saved.folio_easy_glass, '|', saved.fecha_ganado && saved.fecha_ganado.slice(0, 10), '| shown:', text(prow('fecha_ganado').querySelector('dd')).replace(/\s*✎$/, ''), '| counter:', text(section.querySelector('.allprops__n')));
if (saved.folio_easy_glass !== 'EG-2026-0042' || !String(saved.fecha_ganado).startsWith('2026-11-20') || !/^3 de 22 con valor$/.test(text(panel.querySelector(`[data-group="${GROUP}"] .allprops__n`)))) fail('inline edits in the panel should save text and date values');
// the card's "Personalizar" can bring one of them to the "Acerca de" card
click(document.querySelector('.slideover__close'));
click(document.querySelector('.props__custom [data-act="customize-props"]'));
const box = document.querySelector('[data-cardkey="cotizador"]');
if (!box) fail('Personalizar should list the deal properties');
box.checked = true;
box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
click(document.querySelector('[data-confirm="card-save"]'));
const crow = document.querySelector('#rec-props .props__row[data-key="cotizador"]');
log('on the card:', crow && text(crow.querySelector('dd')).replace(/\s*✎$/, ''), '| pencil:', Boolean(crow && crow.querySelector('.props__edit')));
if (!crow || text(crow.querySelector('dd')).replace(/\s*✎$/, '') !== 'Sofía R.' || !crow.querySelector('.props__edit')) fail('a custom deal property can be shown and edited on the card');
log('OK');

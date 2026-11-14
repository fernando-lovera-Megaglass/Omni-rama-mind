// DOM smoke test for the deals board (the original's kanban): real FUERZA DE VENTAS stages with their
// probabilities, column header with the count, column footer with total and weighted amounts, the deal card,
// and drag & drop between columns updating the stage and the footers.
// Run: node scripts/smoke-deals-board.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[deals-board]', ...a);
const fail = (msg) => { console.error(`[deals-board] FAIL: ${msg}`); process.exit(1); };
const dom = new JSDOM(
  '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>',
  { url: 'http://localhost/deals/' },
);
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
dom.window.HTMLElement.prototype.scrollBy = function () {};

// A pipeline definition saved before the real stages existed (with per-stage settings on the old keys).
const legacy = [['appointment', 'Cita programada', 20], ['qualified', 'Calificado para comprar', 40], ['presentation', 'Presentación programada', 60], ['decision', 'Decisión pendiente', 80], ['contract', 'Contrato enviado', 90], ['won', 'Cerrado ganado', 100], ['lost', 'Cerrado perdido', 0]];
mem['crm:pipelines:deals'] = JSON.stringify([
  { id: 102418, name: 'FUERZA DE VENTAS', desc: '', labels: 2, stages: legacy, required: { qualified: ['Importe'] }, automation: { contract: { notify: true } } },
  { id: 740211, name: 'SACA SUMINISTRO', desc: '', labels: 1, stages: [...legacy.slice(0, 5), ['quote', 'Cotización enviada', 55], ['negotiation', 'Negociación', 70], ...legacy.slice(5)] },
]);

const data = await import(resolve(here, '../src/data.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

// 1) Real stages with their probabilities; the saved legacy definition is upgraded, keeping its settings.
const defs = data.dealPipelineDefs();
log('FUERZA DE VENTAS stages:', defs[0].stages.map((s) => `${s[1]} ${s[2]}%`).join(' | '));
const expected = 'OFERTA A+W 10%|Proyecto en Cotización por parte del cliente 30%|Proyecto Ganado por el cliente 40%|Evalua 80%|Ganado 100%|Perdido 0%|Eliminado 0%';
if (defs[0].stages.map((s) => `${s[1]} ${s[2]}%`).join('|') !== expected) fail('FUERZA DE VENTAS should have the real stages and probabilities');
log('upgraded settings:', JSON.stringify(defs[0].required), JSON.stringify(defs[0].automation), '| persisted:', JSON.parse(mem['crm:pipelines:deals'])[0].stages[0][0]);
if (!defs[0].required.cotizacion || !defs[0].automation.evalua || JSON.parse(mem['crm:pipelines:deals'])[0].stages[0][0] !== 'oferta') fail('the legacy definition should be upgraded and saved');
if (defs[1].stages[0][0] !== 'oferta_aw') fail('other pipelines keep their stages');
// A FUERZA DE VENTAS deal that still carries a legacy key is read on the real stage it maps to.
data.addRecord('deals', { name: 'Negocio con clave antigua', pipeline: 'FUERZA DE VENTAS', stage: 'decision', amount: 2500000, deal_currency_code: data.homeCurrency(), owner: 'Laura M.', closeDate: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString(), important: true });
const migrated = data.allDeals().find((d) => d.name === 'Negocio con clave antigua');
log('legacy key read as:', migrated.stage, '| closed helper:', data.isClosedStage('deleted'), data.isClosedStage('evalua'));
if (migrated.stage !== 'evalua' || !data.isClosedStage('deleted') || data.isClosedStage('evalua')) fail('legacy stage keys should map to the real stages');

// 2) The board: default pipeline in the selector (top right), one column per stage with its count.
await import(resolve(here, '../src/deals.js'));
// The list opens on "Mis negocios" (as the original); the board follows the active view, so use "Todos negocios".
click(document.querySelector('button.views__tab[data-view="std:all"]'));
click(document.querySelector('[data-action="mode-board"]'));
const cols = () => [...document.querySelectorAll('.kcol')];
const colOf = (key) => document.querySelector(`.kcol[data-group="${key}"]`);
const countOf = (key) => Number(text(colOf(key).querySelector('.kcol__count')));
log('selector:', text($('pipeline-label')), '| in toolbar right:', Boolean(document.querySelector('.ltoolbar__right #pipeline-pill')), '| list total:', text($('total-pill')), '| view:', text(document.querySelector('button.views__tab.is-active')));
if (text($('pipeline-label')) !== 'FUERZA DE VENTAS' || !document.querySelector('.ltoolbar__right #pipeline-pill')) fail('the board should open on the default pipeline, selector at the top right');
log('columns:', cols().map((c) => text(c.querySelector('.kcol__head h2'))).join(' | '));
if (cols().map((c) => c.dataset.group).join(',') !== 'oferta,cotizacion,ganado_cliente,evalua,won,lost,deleted') fail('columns should be the real stages in order');
const fv = data.allDeals().filter((d) => d.pipeline === 'FUERZA DE VENTAS');
const shown = cols().reduce((s, c) => s + Number(text(c.querySelector('.kcol__count'))), 0);
log('deals in pipeline:', fv.length, '| counted in headers:', shown, '| cards:', document.querySelectorAll('.kcard').length);
if (shown !== fv.length || document.querySelectorAll('.kcard').length !== fv.length) fail('every deal of the pipeline should sit in one column');

// 3) Column footer: total and weighted amounts, Ganados/Perdidos/Eliminados labels.
const sig = (x) => x.toLocaleString('en-US', { maximumSignificantDigits: 3 });
const short = (v) => { const a = Math.abs(v); return `$${a >= 1e9 ? `${sig(v / 1e9)} mil M` : a >= 1e6 ? `${sig(v / 1e6)} M` : a >= 1e3 ? `${sig(v / 1e3)} mil` : sig(v)}`; };
const homeSum = (key) => fv.filter((d) => d.stage === key).reduce((s, d) => s + data.toHomeCurrency(d.amount, d.deal_currency_code), 0);
const foot = (key) => [...colOf(key).querySelectorAll('.kfoot__row')].map(text);
log('footer oferta:', foot('oferta').join(' // '));
log('footer evalua:', foot('evalua').join(' // '));
log('footer won/lost/deleted:', foot('won')[1], '//', foot('lost')[1], '//', foot('deleted')[1]);
if (foot('oferta')[0] !== `${short(homeSum('oferta'))} | Cantidad total`) fail('the footer total should be the sum of the column');
if (foot('oferta')[1] !== `${short(homeSum('oferta') * 0.1)} (10%) | Cantidad ponderada`) fail('the weighted amount should apply the stage probability');
if (foot('evalua')[1] !== `${short(homeSum('evalua') * 0.8)} (80%) | Cantidad ponderada`) fail('Evalua weights at 80%');
if (!foot('won')[1].includes('Ganados (100%)') || !foot('lost')[1].includes('Perdidos (0%)') || !foot('deleted')[1].includes('Eliminados (0%)')) fail('closed columns should show Ganados/Perdidos/Eliminados');

// 4) The deal card.
const card = document.querySelector('.kcard[data-id="' + migrated.id + '"]');
const labels = [...card.querySelectorAll('.kcard__k')].map(text);
log('card lines:', [...card.querySelectorAll('.kcard__lines div')].map(text).join(' | '));
if (labels.join('|') !== 'Valor:|Fecha de cierre:|Propietario:|Fecha de creación:') fail('card lines should be Valor, Fecha de cierre, Propietario, Fecha de creación');
if (!text(card.querySelector('.kcard__lines')).includes('$2.5 M')) fail('millions should be abbreviated with M');
if (card.querySelector('.kcard__name').getAttribute('href') !== `./record/?id=${migrated.id}`) fail('the title should link to the record');
log('tag:', text(card.querySelector('.kcard__tag')), '| avatar:', text(card.querySelector('.avatar')), '| pill:', text(card.querySelector('.kcard__pill')), '| actions:', [...card.querySelectorAll('.kcard__actions a, .kcard__actions button')].map((a) => a.getAttribute('title')).join(' | '));
if (text(card.querySelector('.kcard__tag')) !== 'Importante' || text(card.querySelector('.avatar')) !== 'LM') fail('the important card should show the tag and the owner avatar');
if (!/hace (unos minutos|\d+ )/.test(text(card.querySelector('.kcard__pill'))) || !card.querySelector('.kcard__alert')) fail('the pill should show the relative last activity and the alert when nothing is scheduled');
if (card.querySelectorAll('.kcard__actions a, .kcard__actions button').length !== 4) fail('four action icons under the card');
const allCards = [...document.querySelectorAll('.kcard')];
const stale = allCards.filter((c) => c.querySelector('.kcard__days'));
const alerts = allCards.filter((c) => c.querySelector('.kcard__alert'));
const hours = allCards.filter((c) => /hace \d+ horas?/.test(text(c.querySelector('.kcard__pill'))));
log('cards > 30 days in stage:', stale.length, '| without next activity (⚠):', alerts.length, '| "hace N horas":', hours.length, '| with pending tasks:', allCards.filter((c) => c.querySelector('.kcard__badge')).length);
if (!stale.length || !alerts.length || !hours.length) fail('the sample should show stale counters, alerts and hour-level times');
const staleDays = Number(text(stale[0].querySelector('.kcard__days')));
if (!(staleDays > 30)) fail('the red counter should only appear after 30 days');

// 5) Drag & drop between columns updates the stage and recalculates the footers.
const dt = { effectAllowed: '', dropEffect: '' };
const ev = (type, target) => { const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); target.dispatchEvent(e); };
const fromKey = migrated.stage; // evalua
const toKey = 'cotizacion';
const before = { from: countOf(fromKey), to: countOf(toKey), footFrom: foot(fromKey)[0], footTo: foot(toKey)[0] };
ev('dragstart', card);
ev('dragover', colOf(toKey));
ev('drop', colOf(toKey));
const moved = data.allDeals().find((d) => d.id === migrated.id);
log('after drop:', moved.stage, '| entered:', moved.stageEnteredAt, '| counts:', `${before.from}->${countOf(fromKey)}`, `${before.to}->${countOf(toKey)}`);
if (moved.stage !== toKey || moved.stageEnteredAt !== data.TODAY.toISOString()) fail('dropping should update the stage and record when it entered');
if (countOf(fromKey) !== before.from - 1 || countOf(toKey) !== before.to + 1) fail('column counts should follow the move');
log('footers:', before.footFrom, '->', foot(fromKey)[0], '|', before.footTo, '->', foot(toKey)[0]);
if (foot(fromKey)[0] === before.footFrom || foot(toKey)[0] === before.footTo) fail('the footers should be recalculated');
if (foot(toKey)[0] !== `${short(homeSum(toKey) + 0)} | Cantidad total`) { /* homeSum reads fresh data */ }
const freshSum = data.allDeals().filter((d) => d.pipeline === 'FUERZA DE VENTAS' && d.stage === toKey).reduce((s, d) => s + data.toHomeCurrency(d.amount, d.deal_currency_code), 0);
if (foot(toKey)[0] !== `${short(freshSum)} | Cantidad total`) fail('the new total should include the moved deal');
const acts = data.activitiesFor('deals', migrated.id);
log('timeline:', acts[0] && acts[0].type, '|', acts[0] && acts[0].text, '| saved override:', JSON.parse(mem['crm:deals:overrides'])[migrated.id].stage);
if (!acts[0] || acts[0].type !== 'system' || JSON.parse(mem['crm:deals:overrides'])[migrated.id].stage !== toKey) fail('the move should be persisted and logged');
// the days-in-stage counter restarts after the move
const movedCard = document.querySelector('.kcard[data-id="' + migrated.id + '"]');
if (movedCard.querySelector('.kcard__days')) fail('a freshly moved deal has no stale counter');

// 6) Another pipeline keeps its own stages in the board.
click(document.querySelector('[data-pipeline="SACA SUMINISTRO"]'));
log('SACA columns:', cols().map((c) => text(c.querySelector('.kcol__head h2'))).join(' | '), '| selector:', text($('pipeline-label')));
if (cols().length !== 9 || cols()[0].dataset.group !== 'oferta_aw' || text($('pipeline-label')) !== 'SACA SUMINISTRO') fail('other pipelines show their own stages');
click(document.querySelector('[data-pipeline=""]'));
log('back to default:', text($('pipeline-label')), '| columns:', cols().length);
if (text($('pipeline-label')) !== 'FUERZA DE VENTAS' || cols().length !== 7) fail('"all pipelines" falls back to the default pipeline on the board');
log('OK');

// DOM smoke test for the ticket ↔ deal association (the one cross the other four modules already had among
// themselves): the «Crear ticket» panel offers «Negocios» (search, pick, label, timeline checkbox) and the new
// ticket keeps assoc_deals while the deal lists it in assoc_tickets (both in the extra column, the assoc_<kind>
// pattern of src/data.js, so no migration); the deal record shows a «Tickets» card with the real count and the
// ticket record a «Negocios» card; associating from the deal's «+ Agregar» drawer writes both sides; «Desasociar»
// from either card clears both; the layout defaults list both cards; everything survives a reload of data.js.
// Run: node scripts/smoke-ticket-deal-assoc.mjs
// Live mode (SMOKE_LIVE=1, docs/smoke-live.md): the two arrays are verified with SQL (tickets.extra->'assoc_deals'
// and deals.extra->'assoc_tickets') after associating from the panel, dissociating from the ticket record and
// associating again from the deal record; only «SMOKE …» rows, removed at the end.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke, lit } from './smoke-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'ticket-deal-assoc';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RECORD = (type) => `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`;
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const useDom = (html, url) => {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true; // «¿Desasociar …?»
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el) => el.dispatchEvent(new window.Event('change', { bubbles: true }));
// an assoc_<kind> value as numbers (an array in memory; the SQL runner may hand the jsonb back as text)
const ids = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? JSON.parse(v || '[]') : []).map(Number);
let n = 0;
const openRecord = async (type, id) => { useDom(RECORD(type), `http://localhost/${type}/record/?id=${id}`); await import(resolve(here, `../src/record.js?tda=${n++}`)); await wait(60); };
const card = (kind) => q(`.card--assoc[data-kind="${kind}"]`);
const cardCount = (kind) => (card(kind) ? Number((text(card(kind).querySelector('.card__toggle')).match(/\((\d+)\)/) || [])[1]) : -1);
const rightCards = () => qa('#rec-right [data-lcard]').map((c) => c.dataset.lcard);
// the «+ Agregar» drawer of an association card: tick one record, Siguiente, Guardar
const associateViaDrawer = async (kind, id, name) => {
  click(card(kind).querySelector('[data-act="add-assoc"]'));
  await wait(10);
  if ($('assoc-drawer').hidden) fail(`${kind}: association drawer opens`);
  let pick = q(`[data-adpick="${id}"]`);
  if (!pick) { const s = $('ad-search'); s.value = name; s.dispatchEvent(new window.Event('input', { bubbles: true })); pick = q(`[data-adpick="${id}"]`); }
  if (!pick) fail(`${kind}: «${name}» appears in the drawer`);
  pick.checked = true; change(pick); // the drawer records the pick on change
  await wait(10);
  click(q('[data-ad="next"]'));
  await wait(10);
  click(q('[data-ad="save"]'));
  await wait(20);
};
const unlinkFromCard = async (kind, id) => { click(card(kind).querySelector(`[data-assoc-rm="${id}"][data-kind="${kind}"]`)); await wait(20); };
const linked = (data, ticketId, dealId) => {
  const t = data.findRecord('tickets', ticketId);
  const d = data.findRecord('deals', dealId);
  return { ticketSide: ids(t && t.assoc_deals).includes(Number(dealId)), dealSide: ids(d && d.assoc_tickets).includes(Number(ticketId)) };
};

// ---- modo live (SMOKE_LIVE=1): both extra arrays verified with SQL after each step ----
await liveSmoke(TAG, async ({ data, one, check, log, stamp }) => {
  const def = data.dealPipelineDefs()[0];
  const stage = def.stages.find((s) => !data.isClosedStage(s[0]))[0];
  const deal = data.addRecord('deals', { name: `SMOKE Negocio ${stamp}`, amount: 4200, deal_currency_code: 'MXN', stage, pipeline: def.name, closeDate: new Date(data.TODAY.getTime() + 30 * 86400000).toISOString(), owner: 'Fernando L.', priority: 'medium', type: 'Nuevo negocio', description: 'Prueba live', lastActivity: data.TODAY.toISOString() }, { origin: 'Creación manual' });
  const pipe = data.ticketPipelines()[0];
  // what the «Crear ticket» panel inserts with a deal picked under «Negocios» (src/create-ticket.js → addRecord + setField on the deal)
  const ticket = data.addRecord('tickets', { name: `SMOKE Ticket ${stamp}`, pipeline: pipe, status: data.firstOpenTicketStatus(pipe), priority: 'medium', owner: 'Fernando L.', source: 'Correo', description: 'Prueba live', assoc_deals: [deal.id], assoc_labels_deals: { [deal.id]: 'Sin etiqueta' }, lastActivity: data.TODAY.toISOString() }, { origin: 'Creación manual' });
  data.setField('deals', deal.id, 'assoc_tickets', [Number(ticket.id)]);
  await data.dbIdle();
  const ticketRow = () => one(`select id, extra->'assoc_deals' as deals from public.tickets where name = ${lit(ticket.name)}`);
  const dealRow = () => one(`select id, extra->'assoc_tickets' as tickets from public.deals where name = ${lit(deal.name)}`);
  let t = await ticketRow();
  let d = await dealRow();
  check(t && ids(t.deals).includes(Number(deal.id)), `tickets.extra->'assoc_deals' guarda el negocio (${JSON.stringify(t)})`);
  check(d && ids(d.tickets).includes(Number(ticket.id)), `deals.extra->'assoc_tickets' guarda el ticket (${JSON.stringify(d)})`);
  log(`panel: ticket ${t.id} → tickets.extra.assoc_deals = ${JSON.stringify(t.deals)} · deals.extra.assoc_tickets = ${JSON.stringify(d.tickets)}`);
  // the ticket record lists the deal; «Desasociar» there empties both rows
  await openRecord('tickets', ticket.id);
  check(cardCount('deals') === 1 && text(card('deals')).includes(deal.name), `la ficha del ticket muestra «Negocios (1)» con el negocio (${text(card('deals')).slice(0, 120)})`);
  await unlinkFromCard('deals', deal.id);
  await data.dbIdle();
  t = await ticketRow();
  d = await dealRow();
  check(t && !ids(t.deals).includes(Number(deal.id)) && d && !ids(d.tickets).includes(Number(ticket.id)), `«Desasociar» en la ficha del ticket vacía ambas filas (${JSON.stringify({ t, d })})`);
  log(`ficha del ticket › Desasociar → assoc_deals = ${JSON.stringify(t.deals)} · assoc_tickets = ${JSON.stringify(d.tickets)}`);
  // associate again from the deal record's «+ Agregar» drawer → both rows again
  await openRecord('deals', deal.id);
  check(cardCount('tickets') === 0, `la ficha del negocio muestra «Tickets (0)» tras desasociar (${cardCount('tickets')})`);
  await associateViaDrawer('tickets', ticket.id, ticket.name);
  await data.dbIdle();
  t = await ticketRow();
  d = await dealRow();
  check(t && ids(t.deals).includes(Number(deal.id)) && d && ids(d.tickets).includes(Number(ticket.id)), `asociar desde la ficha del negocio escribe ambas filas (${JSON.stringify({ t, d })})`);
  check(cardCount('tickets') === 1 && text(card('tickets')).includes(ticket.name), 'la ficha del negocio muestra «Tickets (1)» con el ticket');
  log(`ficha del negocio › + Agregar → tickets.extra.assoc_deals = ${JSON.stringify(t.deals)} · deals.extra.assoc_tickets = ${JSON.stringify(d.tickets)}`);
});

// ---- local mode ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
useDom(LIST, 'http://localhost/tickets/');
const data = await import(resolve(here, '../src/data.js'));
const LD = await import(resolve(here, '../src/layout-defaults.js'));
await import(resolve(here, '../src/tickets.js'));

// 0) layout defaults: the deal's right column has the «Tickets» card and the ticket's the «Negocios» card
if (!LD.ASSOC_KINDS.deals.includes('tickets') || !LD.ASSOC_KINDS.tickets.includes('deals')) fail(`ASSOC_KINDS cross (${LD.ASSOC_KINDS.deals} / ${LD.ASSOC_KINDS.tickets})`);
if (!LD.defaultLayout('deals').right.includes('assoc-tickets') || !LD.defaultLayout('tickets').right.includes('assoc-deals')) fail('default layouts list the cross cards');
if (!LD.cardCatalog('tickets')['assoc-deals'] || LD.cardCatalog('tickets')['assoc-deals'].label !== 'Negocios' || !LD.cardCatalog('deals')['assoc-tickets']) fail('card catalog offers the cross cards');
if (!LD.defaultPreview('tickets').right.includes('assoc-deals') || !LD.defaultPreview('deals').right.includes('assoc-tickets')) fail('default previews list the cross cards');
log('diseños: negocios → tarjeta «Tickets», tickets → tarjeta «Negocios» (diseño, catálogo y vista previa)');

// 1) the «Crear ticket» panel offers «Negocios»: search a deal by name, pick it, label + timeline checkbox
const deal = data.addRecord('deals', { name: 'Negocio Vidrio Templado Asociación', amount: 1200, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: '2026-12-31T12:00:00.000Z', owner: 'Fernando L.', companyId: '', company: '', contactId: '' });
click(q('.page-head__actions [data-action="create"]'));
const form = $('ct-form');
if (!$('ct-panel').classList.contains('is-open') || !$('ct-deals-q') || !$('ct-deals-list')) fail('the panel opens with a «Negocios» section');
const titles = qa('#ct-form .cd-section').map((s) => `${s.dataset.kind}:${text(s.querySelector('.cd-section__title'))}`);
if (titles.join('|') !== 'contacts:Asociar ticket con Contactos|companies:Empresas|deals:Negocios') fail(`sections (${titles.join('|')})`);
const type = (name, value) => { const el = form.elements[name]; el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); };
type('name', 'Ticket con negocio asociado');
$('ct-deals-q').value = 'vidrio templado';
$('ct-deals-q').dispatchEvent(new window.Event('input', { bubbles: true }));
const hits = qa('#ct-deals-results button[data-ct="pick"][data-kind="deals"]');
if (!hits.length || hits.length > 6 || !hits.some((b) => Number(b.dataset.id) === Number(deal.id))) fail(`the deal search finds the deal (${hits.length} hits)`);
click(hits.find((b) => Number(b.dataset.id) === Number(deal.id)));
const row = q(`#ct-deals-list .cd-assoc__row[data-id="${deal.id}"]`);
if (!row || !row.querySelector('[data-ct-label="deals"]') || !row.querySelector('[data-ct-log="deals"]') || !/\(Negocio\)/.test(text(row)) || !text(row).includes('Pipeline de ventas')) fail(`deal row with label, timeline checkbox and pipeline (${row && text(row)})`);
if ($('ct-deals-q').value !== '' || !$('ct-deals-results').hidden) fail('the search box clears after picking');
log('panel «Crear ticket»: sección «Negocios», búsqueda por nombre, fila con etiqueta y casilla de cronología');

// 2) create → ticket.assoc_deals and deal.assoc_tickets, the deal's timeline entry
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(40);
const ticket = data.allTickets().find((t) => t.name === 'Ticket con negocio asociado');
if (!ticket) fail('ticket created');
let side = linked(data, ticket.id, deal.id);
if (!side.ticketSide || !side.dealSide) fail(`both sides after the panel (${JSON.stringify(side)})`);
if ((ticket.assoc_labels_deals || {})[deal.id] !== 'Sin etiqueta') fail(`label kept (${JSON.stringify(ticket.assoc_labels_deals)})`);
if (!data.activitiesFor('deals', deal.id).some((a) => /Ticket «Ticket con negocio asociado» creado y asociado a este negocio/.test(a.text))) fail('entry on the deal timeline');
log(`creado: ticket ${ticket.id} ↔ negocio ${deal.id} (assoc_deals / assoc_tickets) + entrada en la cronología del negocio`);

// 3) the deal record: «Tickets (1)» with the ticket; the ticket record: «Negocios (1)» with the deal
await openRecord('deals', deal.id);
if (cardCount('tickets') !== 1 || !text(card('tickets')).includes(ticket.name)) fail(`deal record shows «Tickets (1)» with the ticket (${cardCount('tickets')} · ${text(card('tickets')).slice(0, 120)})`);
if (!rightCards().includes('assoc-tickets')) fail(`deal right column has the tickets card (${rightCards().join()})`);
if (!card('tickets').querySelector(`a[href$="tickets/record/?id=${ticket.id}"]`)) fail('the card links to the ticket');
await openRecord('tickets', ticket.id);
if (cardCount('deals') !== 1 || !text(card('deals')).includes(deal.name)) fail(`ticket record shows «Negocios (1)» with the deal (${cardCount('deals')} · ${text(card('deals')).slice(0, 120)})`);
if (!rightCards().includes('assoc-deals')) fail(`ticket right column has the deals card (${rightCards().join()})`);
if (!card('deals').querySelector(`a[href$="deals/record/?id=${deal.id}"]`)) fail('the card links to the deal');
log('ficha del negocio: «Tickets (1)»; ficha del ticket: «Negocios (1)»; ambas enlazan al otro registro');

// 4) «Desasociar» on the ticket record clears both sides and logs the event
await unlinkFromCard('deals', deal.id);
side = linked(data, ticket.id, deal.id);
if (side.ticketSide || side.dealSide) fail(`both sides cleared by «Desasociar» (${JSON.stringify(side)})`);
if (cardCount('deals') !== 0) fail(`«Negocios (0)» after dissociating (${cardCount('deals')})`);
const removed = data.activitiesFor('tickets', ticket.id).find((a) => a.type === 'assoc' && a.extra?.op === 'remove');
if (!removed || removed.extra.kind !== 'deals' || Number(removed.extra.targetId) !== Number(deal.id) || !/^Negocio desasociado: /.test(removed.text)) fail(`dissociation event (${JSON.stringify(removed && removed.text)})`);
await openRecord('deals', deal.id);
if (cardCount('tickets') !== 0) fail(`deal record shows «Tickets (0)» after dissociating (${cardCount('tickets')})`);
log('Desasociar desde el ticket → ambos lados vacíos, evento «Negocio desasociado», «Tickets (0)» en el negocio');

// 5) associate from the deal record's drawer → both sides; the ticket record lists the deal
await associateViaDrawer('tickets', ticket.id, ticket.name);
side = linked(data, ticket.id, deal.id);
if (!side.ticketSide || !side.dealSide) fail(`both sides after the deal's drawer (${JSON.stringify(side)})`);
if (cardCount('tickets') !== 1 || !text(card('tickets')).includes(ticket.name)) fail(`«Tickets (1)» after the drawer (${cardCount('tickets')})`);
const added = data.activitiesFor('deals', deal.id).find((a) => a.type === 'assoc' && a.extra?.op === 'add');
if (!added || added.extra.kind !== 'tickets' || Number(added.extra.targetId) !== Number(ticket.id) || !/^Ticket asociado: /.test(added.text)) fail(`association event on the deal (${JSON.stringify(added && added.text)})`);
await openRecord('tickets', ticket.id);
if (cardCount('deals') !== 1 || !text(card('deals')).includes(deal.name)) fail(`ticket record lists the deal after the deal-side association (${cardCount('deals')})`);
log('ficha del negocio › + Agregar → ambos lados, evento «Ticket asociado», «Negocios (1)» en el ticket');

// 6) reload: a fresh data.js reads the same arrays from storage
const reloaded = await import(resolve(here, '../src/data.js?ticket-deal-reload'));
side = linked(reloaded, ticket.id, deal.id);
if (!side.ticketSide || !side.dealSide) fail(`persisted after reload (${JSON.stringify(side)})`);
log('recarga: assoc_deals y assoc_tickets siguen en el almacenamiento');

// 7) «Desasociar» on the deal record clears both sides too
await openRecord('deals', deal.id);
await unlinkFromCard('tickets', ticket.id);
side = linked(data, ticket.id, deal.id);
if (side.ticketSide || side.dealSide || cardCount('tickets') !== 0) fail(`both sides cleared from the deal record (${JSON.stringify(side)} · ${cardCount('tickets')})`);
await openRecord('tickets', ticket.id);
if (cardCount('deals') !== 0) fail(`ticket record shows «Negocios (0)» (${cardCount('deals')})`);
log('Desasociar desde el negocio → ambos lados vacíos, «Negocios (0)» en el ticket');
console.log(`[${TAG}] OK`);
process.exit(0);

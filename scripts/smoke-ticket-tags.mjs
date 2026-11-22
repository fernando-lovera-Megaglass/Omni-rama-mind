// DOM smoke test for «Etiquetas de Ticket» (src/ticket-tags.js + src/ticket-tags-ui.js on the shared engine of
// src/object-tags.js): the «Etiquetas de Ticket» tab under Ajustes › Objetos › Tickets › Pipelines (and in the
// pipeline editor), the three-step side panel from the «Prioridad alta» preset renamed «VIP» (emoji, colour,
// preloaded filter «Prioridad es cualquiera de Alta», review, save), the engine (high-priority tickets earn
// the chip, the others do not), the chips on the tickets board cards and in the «Etiquetas de ticket» column,
// live re-evaluation when a ticket changes, instant recolour when the tag is edited and removal from every
// card when it is deleted. Run: node scripts/smoke-ticket-tags.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[ticket-tags]', ...a);
const fail = (msg) => { console.error(`[ticket-tags] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.prompt = (q, d) => d;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
}
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SETTINGS = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--settings" id="settings-root"></main><div id="scrim"></div></body>';
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';

// ===== 1) Ajustes › Objetos › Tickets › Pipelines › Etiquetas de Ticket =====
useDom(SETTINGS, 'http://localhost/settings/#obj-tickets:pipelines');
const data = await import(resolve(here, '../src/data.js'));
const T = await import(resolve(here, '../src/ticket-tags.js'));
await T.ready;
if (T.ticketTagsLive()) fail('the test must run in local mode');
if (T.ticketTags().length) fail('tickets start without tags');
if (T.MAX_TAGS !== 50 || T.PALETTE.length !== 8) fail('same limit and palette as the deal tags');
await import(resolve(here, '../src/settings.js'));
await wait(10);
if (!q('[data-tpipe-tab="overview"]') || !q('[data-tpipe-tab="labels"]') || text(q('[data-tpipe-tab="labels"]')) !== 'Etiquetas de Ticket') fail('tickets pipelines sub-tabs');
click(q('[data-tpipe-tab="labels"]'));
if (!$('ttags') || text(q('.dtags__title')) !== 'Etiquetas de Ticket' || $('dtags')) fail('labels tab (tickets pane, not the deals one)');
if (qa('#ttags-pipeline option').length !== data.ticketPipelineDefs().length + 1 || text(q('.dtags__count')) !== 'Etiquetas usadas: 0 de 50' || !q('[data-dt="usage"]')) fail(`toolbar: ${text(q('.dtags__bar'))}`);
const presets = qa('.dtags__preset');
if (presets.map((b) => text(b.querySelector('strong'))).join('|') !== 'Prioridad alta|Sin propietario|Antiguo') fail(`presets: ${presets.map(text).join('|')}`);
const rows = () => qa('#ttags-rows tr[data-tag]');
if (rows().length || !text(q('#ttags-rows')).includes('Todavía no hay etiquetas de ticket')) fail('empty state');
// the pipeline editor also has the tab
click(q('[data-tpipe-tab="overview"]'));
click(q('[data-tpipe-edit="0"]'));
if (!q('[data-tpipe-sub="labels"]') || text(q('[data-tpipe-sub="labels"]')) !== 'Etiquetas de Ticket') fail('editor sub-tab');
click(q('[data-tpipe-sub="labels"]'));
if (!q('#ttags.dtags--pipe') || !q('#ttags [data-dt="new"]')) fail('pipeline editor labels pane');
click(q('[data-act="tpipe-back"]') || q('[data-tpipe-tab="labels"]'));
await wait(5);
if (!$('ttags')) { click(q('[data-tpipe-tab="labels"]')); }
log('Ajustes › Tickets › Pipelines: pestaña «Etiquetas de Ticket» (filtro, 0 de 50, presets Prioridad alta / Sin propietario / Antiguo) y la misma pestaña en el editor del pipeline');

// ===== 2) «Crear etiqueta › Prioridad alta» renamed «VIP»: 3 steps, preloaded filter, preview, save =====
click(qa('.dtags__preset').find((b) => b.dataset.preset === 'high'));
await wait(5);
const drawer = $('ttag-drawer');
if (!drawer || !drawer.classList.contains('is-open') || text(q('#ttag-title')) !== 'Agregar etiqueta de ticket' || $('dtag-drawer')) fail('side panel (tickets prefix)');
if ($('tt-name').value !== 'Prioridad alta' || !q('[name="tt-pipe"][value="all"]').checked || !$('tt-pipelist').hidden) fail('step 1 prefilled from the preset');
input($('tt-name'), 'VIP');
click(q('.dtag__emojibtn'));
click(q('[data-dt-emoji="💎"]'));
click(q('[data-dt-color="#D8E8FB"]'));
if ($('tt-name').value !== 'VIP' || text(q('.dtag__emojibtn')) !== '💎' || !q('.dtag__colorbtn').getAttribute('style').includes('#D8E8FB')) fail('name / emoji / colour pickers');
click(q('[data-dt-go="next"]'));
const conds = qa('.dtag__cond').map(text);
if (conds.length !== 1 || conds[0] !== 'Prioridad es cualquiera de Alta') fail(`preset filter: ${conds.join(' | ')}`);
click(q('[data-dt-go="edit-filters"]'));
if (!$('tt-filters-editor') || qa('#tt-filters-editor .advc').length !== 1) fail('the filter editor opens on the ticket properties');
click(q('[data-dt-go="done-filters"]'));
click(q('[data-dt-go="next"]'));
const chip = q('.dtag__card .dtag');
if (!chip || text(chip) !== '💎VIP' || !chip.getAttribute('style').includes('#D8E8FB') || text(q('.dtag__cardname')) !== 'Nombre de ticket') fail(`preview card: ${chip && text(chip)}`);
click(q('[data-dt-go="save"]'));
await wait(5);
if (drawer.classList.contains('is-open') || !text($('toast')).includes('«VIP» creada')) fail('save should close the panel');
const vip = T.ticketTags().find((t) => t.name === 'VIP');
if (!vip || vip.emoji !== '💎' || vip.color !== '#D8E8FB' || vip.filters.length !== 1 || vip.filters[0].key !== 'priority' || vip.filters[0].op !== 'anyof' || String(vip.filters[0].value) !== 'high' || vip.pipelineIds.length) fail(`saved tag: ${JSON.stringify(vip)}`);
if (rows().length !== 1 || text(q('.dtags__count')) !== 'Etiquetas usadas: 1 de 50' || !JSON.parse(mem['crm:ticket_tags']).some((t) => t.name === 'VIP')) fail('table / counter / storage after save');
log('preset «Prioridad alta» → «VIP» 💎 azul con filtro «Prioridad es cualquiera de Alta», guardada en crm:ticket_tags');

// ===== 3) The engine: high-priority tickets earn «VIP», the others do not =====
const tickets = data.allTickets();
const [hi1, hi2, lo] = tickets;
data.setField('tickets', hi1.id, 'priority', 'high');
data.setField('tickets', hi2.id, 'priority', 'high');
data.setField('tickets', lo.id, 'priority', 'low');
const has = (id) => T.tagsForTicket(data.findRecord('tickets', id)).some((t) => t.name === 'VIP');
if (!has(hi1.id) || !has(hi2.id) || has(lo.id)) fail('engine: VIP only on high priority');
if (T.usage().find((u) => u.tag.name === 'VIP').count !== data.allTickets().filter((t) => t.priority === 'high').length) fail('usage count');
log(`motor: VIP en ${T.usage().find((u) => u.tag.name === 'VIP').count} tickets de prioridad alta; no en los demás`);

// ===== 4) Tickets page: chips on the board cards and in the list column; live re-evaluation; recolour; delete =====
mem['crm:tickets:prefs'] = JSON.stringify({ columns: ['name', 'pipeline', 'status', 'priority', 'ticket_tags'], size: 100 });
useDom(LIST, 'http://localhost/tickets/');
await import(resolve(here, '../src/tickets.js'));
await wait(20);
const cell = (id) => q(`#table tbody tr[data-id="${id}"] td[data-key="ticket_tags"]`);
if (!cell(hi1.id) || !cell(hi1.id).querySelector('.dtag') || !text(cell(hi1.id)).includes('VIP')) fail(`list column: ${cell(hi1.id) && text(cell(hi1.id))}`);
if (cell(lo.id) && cell(lo.id).querySelector('.dtag')) fail('a low-priority ticket must not show VIP in the list');
click(q('[data-action="mode-board"]'));
await wait(10);
const card = (id) => q(`.kcard[data-id="${id}"]`);
const chipOf = (id) => card(id) && card(id).querySelector('.kcard__tags .dtag');
if (!card(hi1.id) || !chipOf(hi1.id) || text(chipOf(hi1.id)) !== '💎VIP' || !chipOf(hi1.id).getAttribute('style').includes('#D8E8FB')) fail(`board chip: ${card(hi1.id) && text(card(hi1.id))}`);
if (!chipOf(hi2.id) || (card(lo.id) && chipOf(lo.id))) fail('chips only on the high-priority cards');
log('tablero y tabla de tickets: chip «💎VIP» azul en las tarjetas y la columna de los tickets de prioridad alta, no en los demás');
// a ticket that becomes high priority earns the chip as soon as the board repaints
data.setField('tickets', lo.id, 'priority', 'high');
document.dispatchEvent(new window.CustomEvent('crm:ticket-tags'));
await wait(5);
if (!chipOf(lo.id)) fail('live evaluation after the ticket changed');
// editing the tag recolours every chip at once
T.updateTag(vip.id, { color: '#D6F2E4', emoji: '⭐' });
await wait(5);
if (!chipOf(hi1.id) || !chipOf(hi1.id).getAttribute('style').includes('#D6F2E4') || text(chipOf(hi1.id)) !== '⭐VIP' || !chipOf(lo.id).getAttribute('style').includes('#D6F2E4')) fail(`recolour: ${chipOf(hi1.id) && chipOf(hi1.id).getAttribute('style')}`);
// deleting the tag removes it from every card
T.deleteTag(vip.id);
await wait(5);
if (qa('.kcard .dtag').length || T.ticketTags().length) fail('deleting the tag must clear every card');
log('cambio en vivo: un ticket que pasa a alta gana el chip; editar la etiqueta recolorea al instante; eliminarla la quita de todas las tarjetas');

// ===== 5) Back in Ajustes: delete through the UI and the deals pane keeps its own tags =====
T.createTag({ name: 'VIP', emoji: '💎', color: '#D8E8FB', description: '', pipelineIds: [], filters: T.presetByKey('high').filters });
useDom(SETTINGS, 'http://localhost/settings/#obj-tickets:pipelines');
await import(resolve(here, `../src/settings.js?ticket-tags=${Date.now()}`));
await wait(10);
click(q('[data-tpipe-tab="labels"]'));
if (rows().length !== 1 || !text(rows()[0]).includes('VIP')) fail('tag listed after reload');
click(rows()[0].querySelector('[data-dt="remove"]'));
click(q('#ttag-modal [data-dtm="confirm-remove"]'));
if (T.ticketTags().length || rows().length || text(q('.dtags__count')) !== 'Etiquetas usadas: 0 de 50') fail('delete from the settings table');
const D = await import(resolve(here, '../src/deal-tags.js'));
await D.ready;
if (D.dealTags().length !== 3 || !$('ttags')) fail('the deal tags keep their own store and pane');
log('eliminar desde Ajustes: tabla y contador a 0; las etiquetas de negocio (3 semillas) siguen aparte');
console.log('[ticket-tags] OK');
process.exit(0);

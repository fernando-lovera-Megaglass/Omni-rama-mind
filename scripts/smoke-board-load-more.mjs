// DOM smoke test for the board («Vista de panel») of deals and tickets: no «Guardar» button in the list footer
// (nothing is pending: card moves and stage order persist at once), and a stage with more than 60 records lets the
// person reach every card from the column itself («Cargar N más» button, or scrolling the column to its bottom)
// instead of cutting at 60 and asking for filters. Run: node scripts/smoke-board-load-more.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'board-load-more';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (url) => {
  const dom = new JSDOM(LIST, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const colOf = (key) => qa('.kcol').find((c) => c.dataset.group === String(key));
const cardsIn = (key) => colOf(key).querySelectorAll('.kcard').length;
const headCount = (key) => Number(text(colOf(key).querySelector('.kcol__count')));
const moreBtn = (key) => colOf(key).querySelector('[data-kcol-more]');
let n = 0;

useDom('http://localhost/deals/');
const data = await import(resolve(here, '../src/data.js'));

// ---- deals: 130 in the first stage, 70 in the second, of the first pipeline ----
const def = data.dealPipelineDefs()[0];
const open = def.stages.filter((s) => !data.isClosedStage(s[0]));
const [stageA, stageB] = [open[0][0], open[1][0]];
const mk = (i, stage) => data.addRecord('deals', { name: `Negocio tablero ${stage} ${i}`, amount: 100 + i, stage, pipeline: def.name, closeDate: '2026-12-31T12:00:00.000Z', owner: 'Fernando L.', companyId: '', company: '', contactId: '' });
for (let i = 0; i < 130; i += 1) mk(i, stageA);
for (let i = 0; i < 70; i += 1) mk(i, stageB);
const totalA = data.allDeals().filter((d) => d.pipeline === def.name && d.stage === stageA).length;
const totalB = data.allDeals().filter((d) => d.pipeline === def.name && d.stage === stageB).length;
await import(resolve(here, `../src/deals.js?blm=${n++}`));
await wait(40);
click(q('[data-action="mode-board"]'));
await wait(40);
if (q('#kanban').hidden || !qa('.kcol').length) fail('board mode on');

// 1) no «Guardar» anywhere on the board
if (q('#board-save-btn') || q('[data-action="board-save"]') || qa('.listfoot .pill').some((p) => text(p) === 'Guardar')) fail('the board shows a «Guardar» button');
log('tablero sin botón «Guardar»');

// 2) a stage with more than 60: first page + «Cargar 60 más», every card reachable from the column
if (!colOf(stageA)) fail(`column of ${stageA}`);
if (headCount(stageA) !== totalA || totalA < 130) fail(`header count is the real total (${headCount(stageA)} vs ${totalA})`);
if (cardsIn(stageA) !== 60) fail(`first page of 60 cards (${cardsIn(stageA)})`);
let btn = moreBtn(stageA);
if (!btn || !/^Cargar 60 más \(60 de \d+\)$/.test(text(btn))) fail(`«Cargar 60 más» button (${btn && text(btn)})`);
if (/Usa los filtros/.test(text(colOf(stageA)))) fail('the column still asks for filters');
click(btn);
if (cardsIn(stageA) !== 120 || !moreBtn(stageA) || !text(moreBtn(stageA)).startsWith(`Cargar ${Math.min(60, totalA - 120)} más`)) fail(`second page (${cardsIn(stageA)} cards, ${text(moreBtn(stageA))})`);
while (moreBtn(stageA)) click(moreBtn(stageA));
if (cardsIn(stageA) !== totalA) fail(`every card reachable from the column (${cardsIn(stageA)} vs ${totalA})`);
const ids = new Set(qa(`.kcol[data-group="${stageA}"] .kcard`).map((c) => c.dataset.id));
if (ids.size !== totalA) fail('no card repeated or missing');
log(`etapa con ${totalA} negocios: 60 → 120 → ${totalA} tarjetas desde la propia columna, sin filtros`);

// 3) scrolling the column to its bottom loads the next page too
if (cardsIn(stageB) !== 60 || !moreBtn(stageB)) fail(`second stage starts with its first page (${cardsIn(stageB)})`);
colOf(stageB).querySelector('.kcol__cards').dispatchEvent(new window.Event('scroll'));
if (cardsIn(stageB) !== totalB || moreBtn(stageB)) fail(`scroll loads the rest (${cardsIn(stageB)} vs ${totalB})`);
log(`etapa con ${totalB}: el scroll de la columna carga el resto y el botón desaparece`);

// 4) a stage within the page has no button; a re-render keeps what was loaded
const small = open.slice(2).map((s) => s[0]).find((s) => colOf(s) && headCount(s) <= 60);
if (small && moreBtn(small)) fail('a stage within the first page shows no button');
click(q('[data-action="refresh"]'));
await wait(20);
if (cardsIn(stageA) !== totalA || cardsIn(stageB) !== totalB) fail(`re-render keeps the loaded cards (${cardsIn(stageA)} / ${cardsIn(stageB)})`);
// drag & drop keeps working with loaded cards: the last card of A moves to B
const last = qa(`.kcol[data-group="${stageA}"] .kcard`).pop();
const dt = { data: {}, setData(k, v) { this.data[k] = v; }, getData(k) { return this.data[k]; }, effectAllowed: '', dropEffect: '' };
const ev = (type, target) => { const e = new window.Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = dt; target.dispatchEvent(e); };
ev('dragstart', last);
ev('dragover', colOf(stageB));
ev('drop', colOf(stageB));
await wait(60);
const moved = data.findRecord('deals', last.dataset.id);
if (moved.stage !== stageB) fail(`drag & drop still updates the stage (${moved.stage})`);
log('sin botón en etapas cortas; recargar mantiene lo cargado; arrastrar una tarjeta cargada sigue cambiando la etapa');

// ---- tickets: same board code, same behaviour ----
useDom('http://localhost/tickets/');
const pipe = data.ticketPipelines()[0];
const status = data.firstOpenTicketStatus(pipe);
for (let i = 0; i < 65; i += 1) data.addRecord('tickets', { name: `Ticket tablero ${i}`, pipeline: pipe, status, priority: 'medium', owner: 'Fernando L.', source: 'Correo', description: '' });
const totalT = data.allTickets().filter((t) => t.pipeline === pipe && t.status === status).length;
await import(resolve(here, `../src/tickets.js?blm=${n++}`));
await wait(40);
click(q('[data-action="mode-board"]'));
await wait(40);
if (q('#board-save-btn') || q('[data-action="board-save"]')) fail('tickets board shows «Guardar»');
if (!colOf(status) || cardsIn(status) !== 60 || !moreBtn(status)) fail(`tickets: first page and button (${colOf(status) && cardsIn(status)})`);
click(moreBtn(status));
if (cardsIn(status) !== totalT || moreBtn(status)) fail(`tickets: every card reachable (${cardsIn(status)} vs ${totalT})`);
log(`tickets: estado con ${totalT} → todas las tarjetas desde la columna; sin «Guardar»`);
console.log(`[${TAG}] OK`);
process.exit(0);

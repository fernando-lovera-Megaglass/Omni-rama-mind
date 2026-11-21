// DOM smoke test for the «Etapa del negocio» column of the deals list: every cell shows only the stage name
// (no «(pipeline)» suffix — the pipeline has its own column), the default width is narrower, sorting by
// stage and the inline stage editor still work, and the colour modes (none / dot / badge, won / lost) keep
// working. Run: node scripts/smoke-deal-stage-column.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[deal-stage-column]', ...a);
const fail = (msg) => { console.error(`[deal-stage-column] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/deals/' });
const mem = {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
dom.window.HTMLElement.prototype.scrollBy = function () {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };

const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/deals.js'));
const rows = () => qa('#table tbody tr[data-id]');
const stageCellOf = (tr) => tr.querySelector('td[data-key="stage"]');
// The stage element's own text (the editable cell also carries the pencil button).
const stageText = (tr) => text(stageCellOf(tr).querySelector('.stage, .tag') || stageCellOf(tr));
const labelFor = (d) => data.labelOf(data.stagesFor(d.pipeline), d.stage) || data.labelOf(data.allDealStages(), d.stage);
if (!rows().length) fail('no rows');

// ===== 1) Stage only; pipeline in its own column; width =====
rows().forEach((tr) => {
  const d = data.findRecord('deals', tr.dataset.id);
  const cell = stageCellOf(tr);
  const t = stageText(tr);
  if (!cell || !t) fail(`empty stage cell for ${tr.dataset.id}`);
  // Some real stage names carry their own parentheses («Cotización trabajada (Enviada)»): what must never
  // appear is the pipeline name appended to the stage.
  if (t.includes(`(${d.pipeline})`) || / \([A-ZÁÉÍÓÚ ]{4,}\)$/.test(t)) fail(`stage cell repeats the pipeline: «${t}»`);
  if (t !== labelFor(d)) fail(`stage cell «${t}» should be the stage label «${labelFor(d)}»`);
  if (cell.querySelector('.stage') && cell.querySelector('.stage').getAttribute('title') !== labelFor(d)) fail('the title holds the stage alone');
  const pipelineText = text(tr.querySelector('td[data-key="pipeline"]')).replace(/\s*✎$/, ''); // the editable cell carries the pencil
  if (pipelineText !== d.pipeline) fail(`pipeline column for ${tr.dataset.id}: «${pipelineText}» vs «${d.pipeline}»`);
});
const col = q('#table col[data-key="stage"]');
if (!col || !/width:\s*190px/.test(col.getAttribute('style'))) fail(`default stage width: ${col && col.getAttribute('style')}`);
if (!/width:\s*220px/.test(q('#table col[data-key="pipeline"]').getAttribute('style'))) fail('pipeline width unchanged');
log(`${rows().length} rows: stage cells show only the stage (e.g. «${stageText((rows()[0]))}»), pipeline column «${text(rows()[0].querySelector('td[data-key="pipeline"]')).replace(/\s*✎$/, '')}», stage column 190 px`);

// ===== 2) Won / lost colours and the display modes =====
const wonRow = rows().find((tr) => data.findRecord('deals', tr.dataset.id).stage === 'won');
if (!wonRow || !stageCellOf(wonRow).querySelector('.stage.is-won')) fail('won stage keeps its green class');
const lostRow = rows().find((tr) => data.findRecord('deals', tr.dataset.id).stage === 'lost');
if (lostRow && !stageCellOf(lostRow).querySelector('.stage.is-lost')) fail('lost stage keeps its red class');
if (qa('#table tbody .stage--dot').length) fail('default mode has no dots');
// «Definir los colores de visualización»: dot and badge modes re-render through the sort
localStorage.setItem('crm:settings:obj-deals', JSON.stringify({ stageColor: 'dot' }));
click(q('[data-sort="stage"]'));
const repeatsPipeline = (tr) => stageText(tr).includes(`(${data.findRecord('deals', tr.dataset.id).pipeline})`);
if (!rows().every((tr) => stageCellOf(tr).querySelector('.stage.stage--dot')) || rows().some(repeatsPipeline)) fail('dot mode');
localStorage.setItem('crm:settings:obj-deals', JSON.stringify({ stageColor: 'badge' }));
click(q('[data-sort="stage"]'));
if (!rows().every((tr) => stageCellOf(tr).querySelector('.tag')) || rows().some(repeatsPipeline)) fail('badge mode');
const wonBadge = rows().find((tr) => data.findRecord('deals', tr.dataset.id).stage === 'won');
if (wonBadge && !stageCellOf(wonBadge).querySelector('.tag--done')) fail('won badge');
localStorage.setItem('crm:settings:obj-deals', JSON.stringify({ stageColor: 'none' }));
log('colours: won → is-won / tag--done, lost → is-lost; dot and badge modes without the pipeline');

// ===== 3) Sorting by stage =====
click(q('[data-sort="stage"]'));
const asc = rows().map((tr) => stageText((tr)));
const sortedAsc = [...asc].sort((a, b) => a.localeCompare(b, 'es'));
const desc = (() => { click(q('[data-sort="stage"]')); return rows().map((tr) => stageText((tr))); })();
if (asc.join('|') !== sortedAsc.join('|') && desc.join('|') !== sortedAsc.join('|')) fail(`sorting by stage: ${asc.slice(0, 5).join(' | ')}`);
log(`sort by stage: ${asc[0]} … ${asc[asc.length - 1]}`);

// ===== 4) Inline edit of the stage =====
const tr = rows().find((x) => data.findRecord('deals', x.dataset.id).pipeline === 'FUERZA DE VENTAS' && stageCellOf(x).classList.contains('cell--editable'));
if (!tr) fail('no editable stage cell');
const id = tr.dataset.id;
const before = data.findRecord('deals', id).stage;
click(stageCellOf(tr));
const sel = q('#cellpop select#cp-value');
if (!sel) fail('stage cell editor');
const next = [...sel.options].map((o) => o.value).find((v) => v && v !== before && data.stagesFor('FUERZA DE VENTAS').some((s) => s[0] === v));
if (!next) fail('no alternative stage');
sel.value = next;
sel.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
if ($('cellpop-save').disabled) fail('save must enable after picking a stage');
click($('cellpop-save'));
await wait(40);
const after = data.findRecord('deals', id);
const rowNow = qa('#table tbody tr[data-id]').find((x) => x.dataset.id === String(id));
if (after.stage !== next || !rowNow || stageText(rowNow) !== labelFor(after) || repeatsPipeline(rowNow)) fail(`inline edit: stage ${after.stage}, cell «${rowNow && stageText(rowNow)}»`);
log(`inline edit: ${before} → ${next}, cell «${stageText(rowNow)}»`);

console.log('[deal-stage-column] OK');
process.exit(0);

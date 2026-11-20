// DOM smoke test: the 4 real ticket pipelines of the account with their 27 statuses (scripts/hubspot-pipelines.
// snapshot.json, from GET /crm/v3/pipelines/tickets) are the built-in ones; the list's pipeline selector offers
// them; opening a ticket of each pipeline shows that pipeline's real statuses in order (closed ones flagged);
// changing the ticket's pipeline from the record switches its status options and stages; the migration SQL
// defines them. Run: node scripts/smoke-ticket-real-pipelines.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[ticket-real-pipelines]', ...a);
const fail = (msg) => { console.error(`[ticket-real-pipelines] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  dom.window.prompt = (q, d) => d;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  return dom;
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== 1) The built-in definitions match the API snapshot (names, order, 27 statuses, open/closed) =====
const snapshot = JSON.parse(readFileSync(resolve(here, 'hubspot-pipelines.snapshot.json'), 'utf8')).tickets;
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/tickets/');
const data = await import(resolve(here, '../src/data.js'));
const defs = data.ticketPipelineDefs();
if (defs.length !== 4 || defs.map((p) => p.name).join('|') !== snapshot.map((p) => p.label.trim()).join('|')) fail(`pipelines: ${defs.map((p) => p.name).join('|')}`);
let total = 0;
snapshot.forEach((p, i) => {
  const d = defs[i];
  if (String(d.id) !== String(p.id)) fail(`${p.label}: id ${d.id} vs ${p.id}`);
  if (d.stages.length !== p.stages.length) fail(`${p.label}: ${d.stages.length} statuses vs ${p.stages.length}`);
  p.stages.forEach((s, j) => {
    if (d.stages[j][1] !== s.label.trim()) fail(`${p.label} #${j + 1}: «${d.stages[j][1]}» vs «${s.label.trim()}»`);
    if ((d.stages[j][2] === 'closed') !== (s.ticketState === 'CLOSED')) fail(`${p.label} #${j + 1}: open/closed differs`);
  });
  total += p.stages.length;
});
if (total !== 27) fail(`expected 27 statuses, got ${total}`);
log(`definitions: ${defs.map((p) => `${p.name} (${p.stages.length})`).join(' · ')} = 27 statuses, same order and open/closed as the API`);
// every pipeline has sample tickets, open and closed
const counts = data.ticketPipelineCounts();
defs.forEach((p) => { if (!counts[p.name] || !counts[p.name].open) fail(`${p.name} needs open sample tickets`); });
if (!defs.some((p) => counts[p.name].closed > 0)) fail('some pipeline needs closed sample tickets');
if (data.allTickets().some((t) => !defs.some((p) => p.name === t.pipeline && p.stages.some((s) => s[0] === t.status)))) fail('every ticket must sit in a real status of its pipeline');
log('sample tickets per pipeline:', JSON.stringify(counts));

// ===== 2) The list: selector with the 4 pipelines, board columns = the pipeline's statuses =====
await import(resolve(here, '../src/tickets.js'));
const items = qa('#pipeline-items .pmenu__item[data-pipeline]').map((b) => b.dataset.pipeline).filter(Boolean);
if (items.join('|') !== defs.map((p) => p.name).join('|')) fail(`selector: ${items.join('|')}`);
click(q('#pipeline-items [data-pipeline="Cotizaciones SACA"]'));
click(q('[data-action="mode-board"]'));
const cols = qa('#kanban .kcol').map((c) => text(c.querySelector('.kcol__head h2')).replace(/\s*✓?\s*\d+$/, '').replace(/ ✓$/, ''));
const sacaLabels = defs[1].stages.map((s) => s[1]);
if (cols.length !== 8 || !sacaLabels.every((l, i) => cols[i].startsWith(l))) fail(`board columns: ${cols.join(' | ')}`);
log('list: selector with the 4 real pipelines; board of Cotizaciones SACA shows its 8 statuses');

// ===== 3) The record of a ticket of each pipeline shows that pipeline's real statuses =====
for (const p of defs) {
  const t = data.allTickets().find((x) => x.pipeline === p.name);
  useDom(`<!doctype html><body class="app" data-type="tickets"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`, `http://localhost/tickets/record/?id=${t.id}`);
  document.body.dataset.type = 'tickets';
  await import(resolve(here, `../src/record.js?p=${p.id}`));
  await wait(5);
  const steps = qa('#rec-stages .stages__step');
  if (steps.map(text).join('|') !== p.stages.map((s) => s[1]).join('|')) fail(`${p.name}: record stages ${steps.map(text).join('|')}`);
  const closedSteps = steps.filter((b) => b.classList.contains('stages__step--closed') || b.dataset.status && p.stages.find((s) => s[0] === b.dataset.status)[2] === 'closed');
  if (closedSteps.length !== p.stages.filter((s) => s[2] === 'closed').length) fail(`${p.name}: closed steps`);
  if (!text(q('#rec-stages .stages__note')).includes(`Pipeline «${p.name}»`)) fail(`${p.name}: note ${text(q('#rec-stages .stages__note'))}`);
  if (!q(`#rec-stages .stages__step.is-current[data-status="${t.status}"]`)) fail(`${p.name}: current status not marked`);
  log(`record ${t.id} (${p.name}): ${p.stages.length} real stages, current «${data.ticketStatusLabel(p.name, t.status)}»`);
}

// ===== 4) Changing the pipeline from the record: new status options, stages re-drawn, status remapped =====
const t0 = data.allTickets().find((x) => x.pipeline === 'Cotizaciones Proyectos' && x.status !== 'cerrado');
useDom('<!doctype html><body class="app" data-type="tickets"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', `http://localhost/tickets/record/?id=${t0.id}`);
document.body.dataset.type = 'tickets';
await import(resolve(here, '../src/record.js?p=change'));
await wait(5);
const row = () => q('#rec-props .props__row[data-key="pipeline"]');
if (!row() || !row().querySelector('.props__edit')) fail('the record must let the pipeline be edited');
click(row().querySelector('.props__edit'));
const sel = row().querySelector('select[data-edit="pipeline"]');
if (!sel || [...sel.options].map((o) => o.value).join('|') !== defs.map((p) => p.name).join('|')) fail('pipeline editor must list the 4 real pipelines');
sel.value = 'Cotizaciones Kafer';
sel.dispatchEvent(new window.Event('change', { bubbles: true }));
row().querySelector('.props__form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(10);
const moved = data.findRecord('tickets', t0.id);
if (moved.pipeline !== 'Cotizaciones Kafer' || moved.status !== 'solicitud_cotizacion') fail(`moved ticket: ${moved.pipeline} / ${moved.status}`);
const kaferSteps = qa('#rec-stages .stages__step').map(text);
if (kaferSteps.join('|') !== defs[3].stages.map((s) => s[1]).join('|')) fail(`stages after the move: ${kaferSteps.join('|')}`);
click(q('#rec-props .props__row[data-key="status"] .props__edit'));
const stSel = q('#rec-props select[data-edit="status"]');
if (!stSel || [...stSel.options].map((o) => o.value).join('|') !== defs[3].stages.map((s) => s[0]).join('|')) fail(`status options after the move: ${stSel && [...stSel.options].map((o) => o.value).join('|')}`);
log('record: pipeline changed to Cotizaciones Kafer → status Solicitud de Cotizacion, 4 real stages, status options follow');

// ===== 5) The migration defines the 4 pipelines and 27 statuses =====
const sql = readFileSync(resolve(here, '../supabase/pipeline_stages_real.sql'), 'utf8');
defs.forEach((p) => { if (!sql.includes(`('ticket', '${p.name}'`)) fail(`migration lacks ${p.name}`); p.stages.forEach((s) => { if (!sql.includes(`'${p.name}', ${p.stages.indexOf(s)}, '${s[0]}', '${s[1].replace(/'/g, "''")}', '${s[2]}'`)) fail(`migration lacks ${p.name} / ${s[1]}`); }); });
if (!sql.includes("where pipeline = 'Pipeline de soporte'")) fail('migration must remap the sample pipelines');
log('migration supabase/pipeline_stages_real.sql: 4 ticket pipelines, 27 statuses, legacy remap');
log('OK');

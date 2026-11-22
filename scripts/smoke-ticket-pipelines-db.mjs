// Smoke test for the ticket pipelines in the pipelines / pipeline_stages tables (src/data.js): the rows the app
// writes for a ticket pipeline (statuses as open / closed in `descripcion`, 0 / 100 in `probabilidad`; rules,
// required properties, automations and publicId in pipelines.extra) read back as the same definition; the
// one-time merge keeps what this browser configured (renamed statuses, rules) over the seeded rows while
// keeping the rows' ids; and the settings page flow — rename a status of «Cotizaciones SACA», mark a required
// property, reload — persists and produces rows carrying the change. Run: node scripts/smoke-ticket-pipelines-db.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[ticket-pipelines-db]', ...a);
const fail = (msg) => { console.error(`[ticket-pipelines-db] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const useDom = (main, url) => { const dom = new JSDOM(`<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header>${main}<div id="scrim"></div></body>`, { url, pretendToBeVisual: true }); for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k]; dom.window.confirm = () => true; dom.window.HTMLElement.prototype.scrollIntoView = function () {}; dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); return dom; };
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };

useDom('<main id="settings-root"></main>', 'http://localhost/settings/#obj-tickets:pipelines');
const data = await import(resolve(here, '../src/data.js'));

// ---- rows ↔ definition round trip for tickets ----
const defs = data.ticketPipelineDefs();
const saca = defs.find((p) => p.name === 'Cotizaciones SACA');
if (!saca || data.ticketPipelinesLive()) fail('local mode with the real ticket pipelines');
saca.stages[0][1] = 'Sin contactar (renombrado)';
saca.rules = { noBack: true, lockClosed: true };
saca.required = { [saca.stages[1][0]]: ['Propietario del ticket', 'Prioridad'] };
saca.automation = { [saca.stages[2][0]]: { task: true, notify: false } };
saca.desc = 'Cotizaciones de SACA';
const rows = data.pipelineRowsFromDefs(defs, 'ticket');
const row = rows[defs.indexOf(saca)];
if (row.pipeline.objeto !== 'ticket' || row.pipeline.nombre !== 'Cotizaciones SACA' || row.pipeline.descripcion !== 'Cotizaciones de SACA' || row.pipeline.extra.publicId !== saca.id) fail(`pipeline row (${JSON.stringify(row.pipeline)})`);
if (!row.pipeline.extra.rules || row.pipeline.extra.rules.noBack !== true || row.pipeline.extra.required[saca.stages[1][0]].join() !== 'Propietario del ticket,Prioridad' || row.pipeline.extra.automation[saca.stages[2][0]].task !== true) fail('rules / required / automation in pipelines.extra');
if ('stages' in row.pipeline.extra || 'id' in row.pipeline.extra || 'dbId' in row.pipeline.extra) fail('extra carries only the definition settings');
const closedRow = row.stages.find((s) => s.descripcion === 'closed');
const openRow = row.stages.find((s) => s.descripcion === 'open');
if (!closedRow || closedRow.probabilidad !== 100 || !openRow || openRow.probabilidad !== 0 || row.stages[0].nombre !== 'Sin contactar (renombrado)' || row.stages.map((s) => s.orden).join() !== row.stages.map((_, i) => i).join()) fail(`stage rows (${JSON.stringify(row.stages.slice(0, 2))})`);
// simulate the tables: ids assigned by the database, then read back
let nextId = 100; let stageId = 1000;
const pipes = rows.map((r) => ({ id: nextId++, ...r.pipeline, created_at: new Date().toISOString() }));
const stageRows = rows.flatMap((r, i) => r.stages.map((s) => ({ id: stageId++, pipeline_id: pipes[i].id, ...s, probabilidad: String(s.probabilidad) })));
const back = data.pipelineDefsFromRows([...pipes].reverse(), [...stageRows].reverse(), 'ticket');
if (back.length !== defs.length || back.map((p) => p.name).join('|') !== defs.map((p) => p.name).join('|')) fail('order from `orden`');
const sacaBack = back.find((p) => p.name === 'Cotizaciones SACA');
if (sacaBack.id !== saca.id || sacaBack.dbId !== pipes[defs.indexOf(saca)].id || sacaBack.desc !== 'Cotizaciones de SACA') fail('ids and description read back');
if (JSON.stringify(sacaBack.stages) !== JSON.stringify(saca.stages) || JSON.stringify(sacaBack.rules) !== JSON.stringify(saca.rules) || JSON.stringify(sacaBack.required) !== JSON.stringify(saca.required) || JSON.stringify(sacaBack.automation) !== JSON.stringify(saca.automation)) fail(`definition read back (${JSON.stringify(sacaBack.stages[0])} / ${JSON.stringify(sacaBack.rules)})`);
if (back.some((p) => p.stages.some((s) => s[2] !== 'open' && s[2] !== 'closed'))) fail('ticket statuses keep the open / closed flag');
// deal rows are untouched by the ticket branch
const dealRows = data.pipelineRowsFromDefs(data.dealPipelineDefs(), 'deal');
if (!dealRows.length || dealRows[0].stages.some((s) => s.descripcion === 'open' || s.descripcion === 'closed') || !('forecastCategories' in dealRows[0].pipeline.extra)) fail('deal rows keep their own format');
log(`filas de tickets: estados con descripcion open/closed y probabilidad 0/100, extra = { rules, required, automation, publicId }; ${back.length} pipelines leídos de vuelta iguales (SACA: ${sacaBack.stages[0][1]}, ${Object.keys(sacaBack.required).length} estado con obligatorias)`);

// ---- one-time merge of the localStorage configuration into the seeded rows ----
const seeded = data.pipelineDefsFromRows(pipes, stageRows, 'ticket').map((p) => ({ ...p, rules: {}, required: {}, automation: {}, stages: p.stages.map((s) => [...s]) }));
seeded.find((p) => p.name === 'Cotizaciones SACA').stages[0][1] = 'Sin Contactar';
const local = [{ ...saca, id: 999, dbId: undefined }, { id: 555, name: 'Pipeline solo local', desc: '', stages: data.DEFAULT_TICKET_STATUSES.map((s) => [...s]), rules: { noBack: true }, required: {}, automation: {} }];
const merged = data.mergeTicketPipelineDefs(seeded, local);
const m = merged.find((p) => p.name === 'Cotizaciones SACA');
if (m.stages[0][1] !== 'Sin contactar (renombrado)' || m.rules.noBack !== true || m.id !== saca.id || m.dbId !== pipes[defs.indexOf(saca)].id) fail(`merge keeps the local configuration and the row ids (${JSON.stringify([m.stages[0], m.id, m.dbId])})`);
if (merged.length !== seeded.length + 1 || merged[merged.length - 1].name !== 'Pipeline solo local' || merged.find((p) => p.name === 'Cotizaciones Kafer').rules.noBack) fail('local-only pipelines are added; untouched ones stay');
log('migración única: lo configurado en este navegador manda sobre la semilla (ids de la fila conservados); el pipeline solo local se añade');

// ---- settings page: rename a status of «Cotizaciones SACA», mark a required property, reload → persists ----
delete mem['crm:pipelines:tickets'];
await import(resolve(here, '../src/settings.js'));
await wait(60);
const idx = data.ticketPipelineDefs().findIndex((p) => p.name === 'Cotizaciones SACA');
click(q(`[data-tpipe-edit="${idx}"]`));
await wait(30);
const firstKey = data.ticketPipelineDefs()[idx].stages[0][0];
const input = q(`form[data-save="ticketpipe-stages"] [data-tstage-label="${firstKey}"]`);
if (!input) fail('status name input');
input.value = 'Sin contactar aún';
q('form[data-save="ticketpipe-stages"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(30);
if (data.ticketPipelineDefs()[idx].stages[0][1] !== 'Sin contactar aún') fail('renamed status saved');
click(q(`[data-tpipe-edit="${idx}"]`) || q('[data-tpipe-sub="rules"]'));
await wait(20);
click(q('[data-tpipe-sub="rules"]'));
await wait(30);
const secondKey = data.ticketPipelineDefs()[idx].stages[1][0];
click(q(`[data-act="tpipe-required"][data-stage="${secondKey}"]`));
await wait(20);
const box = qa('#rq-form input').find((i) => i.value === 'Propietario del ticket');
if (!box) fail('required-properties modal');
box.checked = true;
click($('rq-save'));
await wait(30);
if ((data.ticketPipelineDefs()[idx].required[secondKey] || []).join() !== 'Propietario del ticket') fail('required property saved');
// reload the settings page: both changes are still there (and would be in the tables with a session)
useDom('<main id="settings-root"></main>', 'http://localhost/settings/#obj-tickets:pipelines');
await import(resolve(here, `../src/settings.js?reload=${Date.now()}`));
await wait(60);
const after = data.ticketPipelineDefs()[idx];
if (after.stages[0][1] !== 'Sin contactar aún' || (after.required[secondKey] || []).join() !== 'Propietario del ticket') fail('changes survive a reload');
const persisted = data.pipelineRowsFromDefs(data.ticketPipelineDefs(), 'ticket')[idx];
if (persisted.stages[0].nombre !== 'Sin contactar aún' || persisted.pipeline.extra.required[secondKey].join() !== 'Propietario del ticket') fail('the rows the app writes carry the rename and the required property');
click(q(`[data-tpipe-edit="${idx}"]`));
await wait(30);
if (q(`form[data-save="ticketpipe-stages"] [data-tstage-label="${firstKey}"]`).value !== 'Sin contactar aún') fail('editor shows the renamed status after the reload');
log(`Ajustes: «${after.stages[0][1]}» y obligatoria «Propietario del ticket» en «${after.stages[1][1]}» persisten tras recargar; la fila de pipelines lleva nombre y extra.required`);
console.log('[ticket-pipelines-db] OK');
process.exit(0);

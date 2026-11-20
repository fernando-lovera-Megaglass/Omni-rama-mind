// Smoke test: every deal stage of the 8 real pipelines carries the probability (and label) of the account's
// HubSpot (scripts/hubspot-pipelines.snapshot.json, GET /crm/v3/pipelines/deals), the closed stages are the ones
// HubSpot closes, the kanban's weighted amount uses those probabilities and the migration SQL carries them.
// Run: node scripts/smoke-deal-probabilities.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[deal-probabilities]', ...a);
const fail = (msg) => { console.error(`[deal-probabilities] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/deals/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.FormData = dom.window.FormData;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
dom.window.confirm = () => true;
dom.window.HTMLElement.prototype.scrollBy = function () {};
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };

// ===== 1) Probabilities, labels and closed stages = the API =====
const api = JSON.parse(readFileSync(resolve(here, 'hubspot-pipelines.snapshot.json'), 'utf8')).deals;
const data = await import(resolve(here, '../src/data.js'));
const defs = data.dealPipelineDefs();
if (defs.map((p) => p.name).join('|') !== api.map((p) => p.label.trim()).join('|')) fail(`pipelines: ${defs.map((p) => p.name).join('|')}`);
let checked = 0;
const diffs = [];
api.forEach((p) => {
  const d = defs.find((x) => x.name === p.label.trim());
  if (d.stages.length !== p.stages.length) fail(`${p.label}: ${d.stages.length} stages vs ${p.stages.length}`);
  p.stages.forEach((s, i) => {
    const mine = d.stages[i];
    const want = Math.round(Number(s.probability) * 100);
    if (mine[1] !== s.label.trim()) diffs.push(`${p.label.trim()} #${i + 1}: label «${mine[1]}» vs «${s.label.trim()}»`);
    if (Number(mine[2]) !== want) diffs.push(`${p.label.trim()} / ${s.label.trim()}: ${mine[2]} % vs ${want} %`);
    if (data.isClosedStage(mine[0]) !== Boolean(s.isClosed)) diffs.push(`${p.label.trim()} / ${s.label.trim()}: closed ${data.isClosedStage(mine[0])} vs ${s.isClosed}`);
    if (data.stagesFor(d.name).find((x) => x[0] === mine[0])[2] !== mine[2]) diffs.push(`${d.name}: stagesFor differs`);
    checked += 1;
  });
});
if (diffs.length) fail(`differences with the API:\n${diffs.join('\n')}`);
const saca = data.stagesFor('SACA SUMINISTRO').map((s) => s[2]).join('/');
const inst = data.stagesFor('SACA Instalaciones').filter((s) => !data.isClosedStage(s[0])).map((s) => s[2]);
if (saca !== '10/20/60/70/90/90/100/0/0' || inst.some((p) => Number(p) !== 10) || data.stagesFor('JFC Cargo Destino')[1][2] !== 40 || data.stagesFor('Acristala obras').slice(0, 5).map((s) => s[2]).join('/') !== '10/25/40/80/90') fail('the audited pipelines must carry the real values');
if (!data.stagesFor('Acristala obras').some((s) => s[1] === 'Contacto concretado (llamada, coreo, visita)')) fail('the real (untruncated) label of Acristala obras');
log(`${checked} stages of 8 pipelines: probability, label and open/closed identical to the API (SACA SUMINISTRO ${saca}; SACA Instalaciones ${inst.join('/')}; JFC Envío 40 %; Acristala obras 10/25/40/80/90)`);

// ===== 2) The kanban's weighted amount uses the real probability =====
await import(resolve(here, '../src/deals.js'));
click(q('button.views__tab[data-view="std:all"]'));
click(q('[data-action="mode-board"]'));
click(q('.pmenu__item[data-pipeline="SACA SUMINISTRO"]'));
const col = qa('#kanban .kcol').find((c) => c.dataset.group === 'presupuesto');
if (!col) fail('column «Entrega de presupuesto» missing');
const prob = text(col.querySelector('.kfoot__prob'));
if (prob !== '(20%)') fail(`weighted footer must show the real 20 %, got ${prob}`);
// "$1.48 M" → 1480000 · "$295 mil" → 295000 · "$12,500" → 12500
const num = (s) => { const t = String(s).replace(/\(.*\)/, '').trim(); const m = t.match(/([\d.,]+)\s*(mil|M)?/); if (!m) return NaN; const n = Number(m[1].replace(/,/g, '')); return m[2] === 'M' ? n * 1e6 : m[2] === 'mil' ? n * 1e3 : n; };
const totalTxt = text(col.querySelector('[data-total]'));
const weightedTxt = text(col.querySelector('[data-weighted]')).replace(/\(.*\)/, '');
log(`kanban SACA SUMINISTRO › Entrega de presupuesto: total ${totalTxt}, weighted ${weightedTxt.trim()} ${prob}`);
if (!/mil|M|\d/.test(totalTxt)) fail('footer amounts missing');
const amounts = data.allDeals().filter((d) => d.pipeline === 'SACA SUMINISTRO' && d.stage === 'presupuesto');
if (amounts.length) {
  const total = amounts.reduce((s, d) => s + (Number(d.amount_in_home_currency ?? d.amount) || 0), 0);
  if (total > 0 && Math.abs(num(weightedTxt) / num(totalTxt) - 0.2) > 0.03) fail(`weighted/total ratio should be ~0.2: ${num(weightedTxt)} / ${num(totalTxt)}`);
}
const instCol = qa('#kanban .kcol');
click(q('.pmenu__item[data-pipeline="SACA Instalaciones"]'));
const probs = qa('#kanban .kcol').filter((c) => !data.isClosedStage(c.dataset.group)).map((c) => text(c.querySelector('.kfoot__prob')));
if (probs.some((p) => p !== '(10%)')) fail(`SACA Instalaciones columns must all weigh 10 %: ${probs.join(' ')}`);
log('kanban: SACA Instalaciones open columns weigh (10%) each');

// ===== 3) The migration carries the real values =====
const sql = readFileSync(resolve(here, '../supabase/pipeline_stages_real.sql'), 'utf8');
if (!sql.includes("('SACA SUMINISTRO', 1, 'presupuesto', 'Entrega de presupuesto', 20)") || !sql.includes("('JFC Cargo Destino', 1, 'envio_cotizacion', 'Envio de Cotizacion', 40)") || !sql.includes("'Contacto concretado (llamada, coreo, visita)', 25)") || !sql.includes('update public.pipeline_stages')) fail('migration SQL lacks the real values');
log('migration supabase/pipeline_stages_real.sql updates the stored stages');
log('OK');

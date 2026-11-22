// DOM smoke test for «Embudo de ventas» on the sales dashboard (src/funnel.js + src/reports.js): one bar per
// open stage of the chosen pipeline with the open deals, their amount (company currency) and the conversion to
// the next stage (deals in N+1 or later ÷ deals in N or later, closed ones counted as past every stage), all
// recomputed here from the same rows the deals board scopes; the selector switches pipelines and is kept with
// the dashboard; the card ignores the date range; «Quitar del panel» hides it and «Añadir informe» restores it;
// a pipeline without deals shows the empty state; the report builder gains the «Embudo» visualization.
// Run: node scripts/smoke-sales-funnel.mjs
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[sales-funnel]', ...a);
const fail = (msg) => { console.error(`[sales-funnel] FAIL: ${msg}`); process.exit(1); };
const dom = new JSDOM(readFileSync(resolve(here, '../reports/index.html'), 'utf8'), { url: 'http://localhost/reports/?dash=ventas', pretendToBeVisual: true });
const mem = {};
for (const k of ['window', 'document', 'HTMLElement', 'location', 'Event', 'MouseEvent']) globalThis[k] = dom.window[k];
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const tick = () => new Promise((r) => setTimeout(r, 20));

const data = await import(resolve(here, '../src/data.js'));
const F = await import(resolve(here, '../src/funnel.js'));
const { createDashboardStore } = await import(resolve(here, '../src/dashboards.js'));
const C = await import(resolve(here, '../src/custom-reports.js'));
const R = await import(resolve(here, '../src/reports.js'));
await tick();

const defs = data.dealPipelineDefs();
const first = defs[0].name;
if (first !== 'FUERZA DE VENTAS' || !defs.some((p) => p.name === 'SACA SUMINISTRO')) fail(`pipelines (${defs.map((p) => p.name).join(', ')})`);

// independent recomputation, scoped like the deals board (a deal without pipeline belongs to the first one)
function expected(pipeline) {
  const rows = data.allDeals().filter((d) => (d.pipeline || first) === pipeline);
  const stages = data.stagesFor(pipeline);
  const closed = (k) => data.dealStageIsClosed(pipeline, k);
  const open = stages.map((s, i) => ({ key: s[0], label: s[1], i })).filter((s) => !closed(s.key));
  const pos = rows.map((d) => (closed(d.stage) ? Infinity : stages.findIndex((s) => s[0] === d.stage))).filter((i) => i >= 0);
  const reached = (i) => pos.filter((p) => p >= i).length;
  const steps = open.map((s, n) => {
    const here = rows.filter((d) => d.stage === s.key);
    const next = open[n + 1];
    return { key: s.key, label: s.label, count: here.length, amount: Math.round(here.reduce((t, d) => t + (data.toHomeCurrency(d.amount, d.deal_currency_code) || 0), 0)), conversion: next && reached(s.i) ? reached(next.i) / reached(s.i) : null };
  });
  return { rows, open: rows.filter((d) => !closed(d.stage)).length, steps, overall: reached(open[0].i) ? reached(open[open.length - 1].i) / reached(open[0].i) : null };
}
const pctOf = (r) => (r === null ? '—' : `${Math.round(r * 100)} %`);
function checkCard(pipeline) {
  const card = q('#grid [data-card-key="ventas:5"]');
  if (!card || !/Embudo de ventas/.test(text(card.querySelector('.card__title')))) fail('«Embudo de ventas» card on the sales dashboard');
  if (!card.classList.contains('card--wide') || !card.querySelector('.card__head [data-funnel-pipeline]') || !card.querySelector('[data-action="remove"]')) fail('wide card with the pipeline selector in its head and the «⋯» menu');
  const sel = card.querySelector('[data-funnel-pipeline]');
  if (sel.value !== pipeline || [...sel.options].map((o) => o.value).join('|') !== defs.map((p) => p.name).join('|')) fail(`selector shows ${pipeline} and every pipeline (${sel.value})`);
  if (card.querySelector('[data-funnel]')?.dataset.funnel !== pipeline) fail('funnel of the selected pipeline');
  const e = expected(pipeline);
  if (!e.rows.length) fail(`${pipeline} has sample deals`);
  const rows = qa('#grid [data-card-key="ventas:5"] .funnel__row');
  if (rows.map((r) => r.dataset.stage).join('|') !== e.steps.map((s) => s.key).join('|')) fail(`open stages in order (${rows.map((r) => r.dataset.stage).join('|')})`);
  const max = Math.max(...e.steps.map((s) => s.count), 1);
  e.steps.forEach((s, i) => {
    const row = rows[i];
    const shown = { count: row.querySelector('.funnel__count')?.dataset.count, amount: row.querySelector('.funnel__amount')?.dataset.amount };
    if (Number(shown.count) !== s.count || Number(shown.amount) !== s.amount) fail(`${s.label}: ${shown.count} / ${shown.amount} vs ${s.count} / ${s.amount}`);
    if (!text(row).includes(s.label) || !text(row).includes(data.formatMoneyShort(s.amount, data.homeCurrency())) || !text(row).includes(`${s.count.toLocaleString('es-ES')} negocio`)) fail(`${s.label}: label, count and short amount (${text(row)})`);
    const width = Number((row.querySelector('.funnel__bar').style.width || '0').replace('%', ''));
    if (Math.abs(width - (s.count / max) * 100) > 0.01) fail(`${s.label}: bar proportional to the busiest stage (${width} %)`);
    const conv = card.querySelector(`[data-conv="${s.key}"]`);
    if (i < e.steps.length - 1) {
      if (!conv || !text(conv).includes(pctOf(s.conversion)) || !text(conv).includes(e.steps[i + 1].label)) fail(`${s.label} → next: ${pctOf(s.conversion)} (${conv && text(conv)})`);
      if ((s.conversion === null ? '' : String(s.conversion)) !== conv.dataset.ratio) fail(`${s.label}: ratio ${conv.dataset.ratio} vs ${s.conversion}`);
    } else if (conv) fail('no conversion after the last stage');
  });
  const meta = text(card.querySelector('.funnel__meta'));
  if (!meta.includes(`${e.open.toLocaleString('es-ES')} negocio`) || !meta.includes(pctOf(e.overall)) || !meta.includes(data.homeCurrency())) fail(`meta: open deals, overall conversion and currency (${meta})`);
  if (!/no depende del rango de fechas/.test(text(card))) fail('snapshot note');
  return e;
}

// ---- default pipeline: counts, amounts, conversions ----
const e1 = checkCard(first);
log(`${first}: ${e1.steps.map((s) => `${s.label.slice(0, 18)} ${s.count} (${data.formatMoneyShort(s.amount, data.homeCurrency())})${s.conversion === null ? '' : ` ▼${pctOf(s.conversion)}`}`).join(' | ')} · global ${pctOf(e1.overall)}`);

// ---- the date range does not change it ----
const before = q('#grid [data-card-key="ventas:5"] .funnel__rows').innerHTML;
click(q('[data-range="7"]'));
if (q('#grid [data-card-key="ventas:5"] .funnel__rows').innerHTML !== before) fail('the funnel ignores the date range');
log('rango 7 días → el embudo no cambia (foto actual)');

// ---- selector → other pipeline, kept with the dashboard ----
const sel = q('#grid [data-card-key="ventas:5"] [data-funnel-pipeline]');
sel.value = 'SACA SUMINISTRO';
sel.dispatchEvent(new window.Event('change', { bubbles: true }));
const e2 = checkCard('SACA SUMINISTRO');
if (createDashboardStore().get('ventas').funnelPipeline !== 'SACA SUMINISTRO') fail('pipeline choice saved with the dashboard');
R.render();
if (q('#grid [data-card-key="ventas:5"] [data-funnel]')?.dataset.funnel !== 'SACA SUMINISTRO') fail('the choice survives a re-render');
log(`SACA SUMINISTRO: ${e2.steps.length} etapas abiertas, ${e2.open} negocios abiertos · global ${pctOf(e2.overall)}; elección guardada en el panel`);

// ---- «Quitar del panel» hides it (persisted); «Añadir informe» restores it ----
click(q('#grid [data-card-key="ventas:5"] [data-action="remove"]'));
if (q('#grid [data-card-key="ventas:5"]') || !createDashboardStore().get('ventas').hidden.includes('ventas:5')) fail('removed and persisted');
R.render();
if (q('#grid [data-card-key="ventas:5"]')) fail('still hidden after re-render');
click(q('[data-action="add-report"]'));
await tick();
const restore = qa('#restore-reports button').find((b) => /Embudo de ventas/.test(text(b)));
if (!restore) fail('restore button for the funnel');
click(restore);
if (!q('#grid [data-card-key="ventas:5"]') || createDashboardStore().get('ventas').hidden.includes('ventas:5')) fail('restored');
if (q('#grid [data-card-key="ventas:5"]') !== q('#grid').lastElementChild) fail('the funnel is the last card by default');
log('«Quitar del panel» → oculta y persiste; «Añadir informe» → vuelve');

// ---- empty state and unknown pipeline ----
const empty = F.funnelHtml(F.funnelFigures(first, []));
if (!/funnel--empty/.test(empty) || !/no tiene negocios/.test(empty) || /funnel__row/.test(empty)) fail('empty state');
if (F.funnelFigures('Pipeline inexistente').pipeline !== first) fail('unknown pipeline falls back to the first one');
// a closed deal counts as past every stage; an open one only up to its stage
const [s1, s2] = data.stagesFor(first).map((s) => s[0]);
const toy = F.funnelFigures(first, [{ pipeline: first, stage: s1, amount: 100 }, { pipeline: first, stage: s2, amount: 50 }, { pipeline: first, stage: 'won', amount: 1 }]);
if (toy.steps[0].count !== 1 || toy.steps[0].amount !== 100 || toy.steps[0].conversion !== 2 / 3 || toy.steps[1].count !== 1) fail(`toy funnel (${JSON.stringify(toy.steps.map((s) => [s.count, s.conversion]))})`);
log('estado vacío sin negocios; pipeline desconocido → el primero; cerrados cuentan en todas las etapas (2/3)');

// ---- dashboards saved before the funnel: an empty sales dashboard stays empty, a normal one shows it ----
const legacy = {};
legacy['crm:dashboards'] = JSON.stringify([
  { id: 'ventas', name: 'Panel de ventas', template: 'ventas', hidden: [], pins: [], order: ['ventas:0', 'ventas:1', 'ventas:2', 'ventas:3', 'ventas:4'] },
  { id: 'vacio', name: 'Vacío', template: 'ventas', hidden: ['ventas:0', 'ventas:1', 'ventas:2', 'ventas:3', 'ventas:4'], pins: [], order: ['ventas:0', 'ventas:1', 'ventas:2', 'ventas:3', 'ventas:4'] },
]);
const legacyStore = createDashboardStore({ getItem: (k) => legacy[k] ?? null, setItem: (k, v) => { legacy[k] = v; } });
if (legacyStore.get('ventas').hidden.length || !legacyStore.get('vacio').hidden.includes('ventas:5') || legacyStore.get('vacio').hidden.length !== 6) fail('legacy migration');
if (createDashboardStore().create('Nuevo', false).hidden.length !== 6) fail('a new dashboard starts with every sales card hidden');
log('paneles antiguos: el vacío sigue vacío, el normal muestra el embudo; panel nuevo → 6 tarjetas ocultas');

// ---- report builder: «Embudo» visualization with its pipeline ----
const html = C.reportChart({ source: 'deals', measure: 'count', dimension: 'stage', visualization: 'funnel', pipeline: 'SACA SUMINISTRO' });
if (!html.includes('data-funnel="SACA SUMINISTRO"') || !/funnel__row/.test(html) || !/sin rango de fechas/.test(html)) fail('custom funnel report');
let threw = false;
try { C.validateConfig({ source: 'contacts', measure: 'count', dimension: 'stage', visualization: 'funnel' }); } catch { threw = true; }
if (!threw || C.VIEWS.funnel !== 'Embudo') fail('funnel only for deals, listed as «Embudo»');
R.customReports.open();
click(q('[data-create]'));
const form = q('form[data-builder]');
if (!form || !form.elements.pipeline || !form.elements.pipeline.disabled) fail('pipeline select present and disabled for other charts');
form.elements.visualization.value = 'funnel';
form.dispatchEvent(new window.Event('change', { bubbles: true }));
if (form.elements.pipeline.disabled || !q('[data-preview] .funnel')) fail('choosing «Embudo» enables the pipeline and previews the funnel');
form.elements.pipeline.value = 'SACA SUMINISTRO';
form.dispatchEvent(new window.Event('change', { bubbles: true }));
if (q('[data-preview] [data-funnel]')?.dataset.funnel !== 'SACA SUMINISTRO') fail('the preview follows the pipeline');
log('constructor: visualización «Embudo» con selector de pipeline y vista previa');
console.log('[sales-funnel] OK');
process.exit(0);

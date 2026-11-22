// «Embudo de ventas»: a snapshot of one deal pipeline — the open deals in each stage, their amount in the
// company currency and the conversion from each stage to the next — shared by the sales dashboard
// (src/reports.js) and the report builder's «Embudo» visualization (src/custom-reports.js).
// It never depends on a date range: it describes the pipeline as it is right now.
import { allDeals, dealPipelineDefs, stagesFor, dealStageIsClosed, toHomeCurrency, formatMoneyShort, homeCurrency } from './data.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-ES');
export const pct = (ratio) => (ratio === null || ratio === undefined || Number.isNaN(ratio) ? '—' : `${Math.round(ratio * 100)} %`);

export const funnelPipelines = () => dealPipelineDefs().map((p) => p.name);

// Figures of one pipeline (the first one when the name is unknown), over the same rows the deals board
// shows for it: a deal without pipeline belongs to the default one. Conversion from stage N to N+1 =
// deals in stage N+1 or later ÷ deals in stage N or later, where the closed deals (won, lost or any closed
// stage) count as having gone past every open stage.
export function funnelFigures(pipelineName, deals = allDeals()) {
  const defs = dealPipelineDefs();
  const first = defs[0] ? defs[0].name : '';
  const pipeline = defs.some((p) => p.name === pipelineName) ? pipelineName : first;
  const rows = deals.filter((d) => (d.pipeline || first) === pipeline);
  const stages = stagesFor(pipeline);
  const closed = (key) => dealStageIsClosed(pipeline, key);
  const open = stages.map((s, i) => ({ key: s[0], label: s[1], index: i })).filter((s) => !closed(s.key));
  // Where each deal stands in the stage order; closed deals are beyond the last open stage; deals in a
  // stage the pipeline no longer has are left out.
  const positions = rows
    .map((d) => (closed(d.stage) ? Infinity : stages.findIndex((s) => s[0] === d.stage)))
    .filter((i) => i >= 0);
  const reached = (index) => positions.filter((p) => p >= index).length;
  const steps = open.map((s, n) => {
    const here = rows.filter((d) => d.stage === s.key);
    const next = open[n + 1];
    const base = reached(s.index);
    return {
      key: s.key,
      label: s.label,
      count: here.length,
      amount: Math.round(here.reduce((t, d) => t + (toHomeCurrency(d.amount, d.deal_currency_code) || 0), 0)),
      reached: base,
      next: next ? next.label : '',
      conversion: next && base ? reached(next.index) / base : null,
    };
  });
  const firstReached = open.length ? reached(open[0].index) : 0;
  const overall = open.length > 1 && firstReached ? reached(open[open.length - 1].index) / firstReached : null;
  const openDeals = rows.filter((d) => !closed(d.stage)).length;
  return { pipeline, pipelines: defs.map((p) => p.name), steps, total: rows.length, open: openDeals, closed: rows.length - openDeals, overall, currency: homeCurrency() };
}

// The pipeline selector of the card (top right).
export function funnelSelectHtml(f, attr = 'data-funnel-pipeline') {
  return `<select class="funnel__select" ${attr} aria-label="Pipeline del embudo">${f.pipelines.map((n) => `<option value="${esc(n)}"${n === f.pipeline ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
}

// Horizontal bars per open stage (proportional to the busiest stage), count and amount, and the conversion
// between consecutive stages; the pipeline without deals shows an empty state instead.
export function funnelHtml(f) {
  const amount = (n) => formatMoneyShort(n, f.currency);
  if (!f.total) {
    return `<div class="funnel funnel--empty" data-funnel="${esc(f.pipeline)}"><p class="chart__empty muted">El pipeline «${esc(f.pipeline)}» no tiene negocios todavía.</p><p class="muted">Crea uno desde <a href="../deals/">Negocios</a> o cambia de pipeline arriba a la derecha.</p></div>`;
  }
  const max = Math.max(...f.steps.map((s) => s.count), 1);
  const rows = f.steps
    .map((s, i) => {
      const bar = `<li class="funnel__row" data-stage="${esc(s.key)}" title="${esc(s.label)}: ${fmt(s.count)} ${s.count === 1 ? 'negocio abierto' : 'negocios abiertos'} · ${esc(amount(s.amount))}">
        <span class="funnel__label">${esc(s.label)}</span>
        <span class="funnel__track"><span class="funnel__bar" style="width:${(s.count / max) * 100}%${s.count ? ';min-width:2px' : ''}"></span></span>
        <span class="funnel__count" data-count="${s.count}">${fmt(s.count)} ${s.count === 1 ? 'negocio' : 'negocios'}</span>
        <span class="funnel__amount" data-amount="${s.amount}">${esc(amount(s.amount))}</span>
      </li>`;
      const conv = i < f.steps.length - 1
        ? `<li class="funnel__conv" data-conv="${esc(s.key)}" data-ratio="${s.conversion === null ? '' : s.conversion}"><span class="funnel__arrow" aria-hidden="true">▼</span> ${pct(s.conversion)} pasan a «${esc(s.next)}»</li>`
        : '';
      return bar + conv;
    })
    .join('');
  const overall = f.steps.length > 1 ? `Conversión global (${esc(f.steps[0].label)} → ${esc(f.steps[f.steps.length - 1].label)}): <strong data-overall="${f.overall === null ? '' : f.overall}">${pct(f.overall)}</strong> · ` : '';
  return `<div class="funnel" data-funnel="${esc(f.pipeline)}">
    <p class="funnel__meta muted">${overall}${fmt(f.open)} ${f.open === 1 ? 'negocio abierto' : 'negocios abiertos'} y ${fmt(f.closed)} ${f.closed === 1 ? 'cerrado' : 'cerrados'} · importes en ${esc(f.currency)}</p>
    <ol class="funnel__rows">${rows}</ol>
    <p class="funnel__note muted">Foto actual del pipeline: no depende del rango de fechas del panel. Los negocios cerrados cuentan como pasados por todas las etapas.</p>
  </div>`;
}

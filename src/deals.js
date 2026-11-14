import { boot } from './page.js';
import { mountList, tag, link, ownerHtml } from './list.js';
import { allDeals, allCompanies, allTasks, DEAL_STAGES, PRIORITIES, OWNERS, formatDate, formatMoney, formatMoneyShort, labelOf, classOf, initials, TODAY, dealPipelines, dealPipelineDefs, stagesFor, allDealStages, isClosedStage, addRecord, setField, addActivity, activitiesFor, CURRENCY_DEFS, CURRENCY_CODES, homeCurrency, toHomeCurrency } from './data.js';
import { toast } from './shell.js';
import { mountCreateDeal } from './create-deal.js';

boot({ root: '../', active: 'crm', sub: 'Negocios', title: 'Negocios' });

const DAY = 86400000;
const days = (iso) => (TODAY - new Date(iso)) / DAY;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
// Stages of the deal's own pipeline (each pipeline defines its stages and probabilities in Configuración › Objetos).
const defs = dealPipelineDefs();
const defOf = (pipeline) => defs.find((p) => p.name === pipeline) || defs[0];
const stagesOf = (pipeline) => (defs.find((p) => p.name === pipeline) || { stages: DEAL_STAGES }).stages;
const stageLabel = (r) => `${labelOf(stagesOf(r.pipeline), r.stage) || labelOf(allDealStages(), r.stage)} (${r.pipeline || defs[0].name})`;
const colorMode = () => { try { return (JSON.parse(localStorage.getItem('crm:settings:obj-deals')) || {}).stageColor || 'none'; } catch { return 'none'; } };
const stageCell = (r) => {
  const label = stageLabel(r);
  const cls = r.stage === 'won' ? 'is-won' : isClosedStage(r.stage) ? 'is-lost' : '';
  const mode = colorMode();
  if (mode === 'badge') return tag(label, r.stage === 'won' ? 'tag--done' : isClosedStage(r.stage) ? 'tag--high' : 'tag--open');
  return `<span class="stage ${cls}${mode === 'dot' ? ' stage--dot' : ''}" title="${label}">${label}</span>`;
};
const probOfStage = (pipeline, key) => Number((stagesOf(pipeline).find((s) => s[0] === key) || allDealStages().find((s) => s[0] === key) || [0, 0, 0])[2]) || 0;
const probOf = (r) => probOfStage(r.pipeline, r.stage);
const isOpen = (r) => !isClosedStage(r.stage);
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const months = (d) => `${(d / 30).toLocaleString('es-ES', { maximumFractionDigits: 1 })} meses`;
// Each deal shows its amount in its own currency; totals add everything up in the company currency.
const money = (r) => formatMoney(r.amount, r.deal_currency_code);
const home = (r) => toHomeCurrency(r.amount, r.deal_currency_code);
const HOME = homeCurrency();
const currencyOptions = CURRENCY_CODES.map((c) => [c, `${c} · ${CURRENCY_DEFS[c].name}`]);
// "$279 M", "$83.7 M", "$523 mil": three significant digits, as the original's column footers.
const sig = (x) => x.toLocaleString('en-US', { maximumSignificantDigits: 3 });
const shortMoney = (n, code = HOME) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const body = abs >= 1e9 ? `${sig(v / 1e9)} mil M` : abs >= 1e6 ? `${sig(v / 1e6)} M` : abs >= 1e3 ? `${sig(v / 1e3)} mil` : sig(v);
  const def = CURRENCY_DEFS[code] || CURRENCY_DEFS[HOME] || { symbol: '$', after: false };
  return def.after ? `${body} ${def.symbol}` : `${def.symbol}${body}`;
};
// Card value: full amount, abbreviated with "M" from a million up.
const cardMoney = (r) => (Math.abs(Number(r.amount) || 0) >= 1e6 ? shortMoney(r.amount, r.deal_currency_code) : money(r));
// "hace 3 horas", "hace 2 días"… measured from the app's today, like the rest of the CRM.
const agoText = (iso) => {
  if (!iso) return 'sin actividad';
  const ms = Math.max(0, TODAY.getTime() - new Date(iso).getTime());
  const h = Math.round(ms / 3600000);
  if (h < 1) return 'hace unos minutos';
  if (h < 24) return `hace ${h} hora${h === 1 ? '' : 's'}`;
  const d = Math.round(ms / DAY);
  if (d < 30) return `hace ${d} día${d === 1 ? '' : 's'}`;
  const m = Math.round(d / 30);
  if (m < 12) return `hace ${m} mes${m === 1 ? '' : 'es'}`;
  const y = Math.round(d / 365);
  return `hace ${y} año${y === 1 ? '' : 's'}`;
};
// Days in the current stage: since the move recorded by the board; without one, since the last activity.
const daysInStage = (r) => Math.max(0, Math.floor((TODAY - new Date(r.stageEnteredAt || r.lastActivity || r.created)) / DAY));
const isImportant = (r) => r.important === true || ['true', 'sí', 'si', '1'].includes(String(r.important ?? '').trim().toLowerCase());
// Open tasks of the deal (associated to it or to its contact): the card's "próxima actividad".
const pendingTasks = (r) => allTasks().filter((t) => t.status !== 'done' && (Number(t.dealId) === Number(r.id) || (r.contactId && Number(t.contactId) === Number(r.contactId))));
const ACT_ICON = { email: '✉', call: '☏', task: '☑', meeting: '▦', note: '✎', message: '💬' };
const OWNER_COLORS = ['#006162', '#0091ae', '#6a78d1', '#f2547d', '#00a4bd', '#ff7a59', '#425b76'];
const ownerAvatar = (name) => {
  if (!name || name === 'Sin asignar') return '<span class="avatar avatar--xs avatar--empty" title="Sin asignar" aria-label="Propietario sin asignar">👤</span>';
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `<span class="avatar avatar--xs" style="background:${OWNER_COLORS[h % OWNER_COLORS.length]}" title="${esc(name)}" aria-label="Propietario: ${esc(name)}">${esc(initials(name))}</span>`;
};
// The board shows one pipeline at a time: the selected one or the default pipeline.
const boardPipeline = (st) => st.pipeline || defs[0].name;

// Deal card of the board: title, value, dates, owner, "Importante" tag with the days in stage, last activity.
function dealCard(r, ctx) {
  const lines = ctx.customised ? ctx.lines(r) : [['Valor', cardMoney(r)], ['Fecha de cierre', formatDate(r.closeDate)], ['Propietario', r.owner || 'Sin asignar'], ['Fecha de creación', formatDate(r.created)]];
  const inStage = daysInStage(r);
  const pending = pendingTasks(r);
  const when = r.lastActivity || r.created;
  const last = activitiesFor('deals', r.id).find((a) => a.type !== 'prop' && a.type !== 'stage');
  const icon = ACT_ICON[(last && last.type) || r.lastActivityType] || '✉';
  const tags = `${isImportant(r) ? '<span class="kcard__tag">Importante</span>' : ''}${inStage > 30 ? `<span class="kcard__days" title="${inStage} días en esta etapa" aria-label="${inStage} días en esta etapa">${inStage}</span>` : ''}`;
  const taskTitle = pending.length ? `${pending.length} tarea${pending.length === 1 ? '' : 's'} pendiente${pending.length === 1 ? '' : 's'}` : 'Sin tareas pendientes';
  return `
              <article class="kcard kcard--deal" draggable="true" data-id="${r.id}">
                <a class="kcard__name" href="./record/?id=${r.id}">${esc(r.name)}</a>
                <div class="kcard__lines">${lines.map(([k, v]) => `<div><span class="kcard__k">${esc(k)}:</span> ${esc(v)}</div>`).join('')}</div>
                ${tags ? `<div class="kcard__tags">${tags}</div>` : ''}
                <div class="kcard__meta">
                  ${ownerAvatar(r.owner)}
                  <span class="kcard__pill" title="Última actividad: ${esc(formatDate(when))}"><span class="kcard__pill-ico" aria-hidden="true">${icon}</span> ${esc(agoText(when))}${pending.length ? '' : ' <span class="kcard__pill-sep">|</span> <span class="kcard__alert" title="Sin actividad programada" aria-label="Sin actividad programada">⚠</span>'}</span>
                </div>
                <div class="kcard__actions">
                  <a href="./record/?id=${r.id}#tasks" class="${pending.length ? 'is-pending' : ''}" title="${taskTitle}" aria-label="${taskTitle}">☑${pending.length ? `<span class="kcard__badge">${pending.length}</span>` : ''}</a>
                  <button type="button" data-kai="${r.id}" title="Resumen" aria-label="Resumen"><span class="ai-spark">✦</span></button>
                  <a href="./record/?id=${r.id}#email" title="Correo" aria-label="Correo">✉</a>
                  <a href="./record/?id=${r.id}#note" title="Nota" aria-label="Nota">✎</a>
                </div>
              </article>`;
}

// Column footer: "$X M | Cantidad total" and "$Y M (p%) | Cantidad ponderada" (total × stage probability).
function columnFooter(rows, value, label, st) {
  const prob = probOfStage(boardPipeline(st), value);
  const total = sum(rows, home);
  const weighted = (total * prob) / 100;
  const probText = value === 'won' ? 'Ganados (100%)' : value === 'lost' ? 'Perdidos (0%)' : value === 'deleted' ? 'Eliminados (0%)' : `(${prob}%)`;
  return `<div class="kfoot__row"><strong class="kfoot__amount" data-total>${esc(shortMoney(total))}</strong> <span class="kfoot__sep">|</span> <span class="kfoot__label">Cantidad total</span></div>
          <div class="kfoot__row"><strong class="kfoot__amount" data-weighted>${esc(shortMoney(weighted))} <span class="kfoot__prob">${esc(probText)}</span></strong> <span class="kfoot__sep">|</span> <span class="kfoot__label">Cantidad ponderada</span></div>`;
}

let createPanel = null; // the original's "Crear negocio" slide-over (mounted after the list)
const list = mountList({
  type: 'deals',
  title: 'Negocios',
  singular: 'Negocio',
  plural: 'negocios',
  addLabel: 'Agregar negocios',
  createLabel: 'Crear negocio',
  addDirect: true,
  // The panel opens on the pipeline being looked at (the board's "+ Negocio" also passes its stage).
  openCreate: (prefill) => createPanel && createPanel.open({ pipeline: boardPipeline(list.state), ...(prefill || {}) }),
  searchPlaceholder: 'Buscar nombre del negocio, empresa...',
  searchKeys: ['name', 'company', 'owner', 'pipeline'],
  rows: allDeals,
  defaultSort: { key: 'closeDate', dir: 1 },
  // Pipeline selector in the toolbar (top right): filters the list; the board always shows one pipeline.
  pipeline: { key: 'pipeline', label: 'Pipeline', options: dealPipelines, manageHref: '../settings/#obj-deals:pipelines', boardDefault: () => defs[0].name },
  // Summary tiles above the table, computed over the filtered deals.
  summary: (rows) => {
    const open = rows.filter(isOpen);
    const won = rows.filter((r) => r.stage === 'won');
    return [
      ['Valor total de los negocios', formatMoneyShort(sum(rows, home)), `Suma del importe de todos los negocios de la vista, en ${HOME} (moneda de la empresa).`],
      ['Valor ponderado de los negocios', formatMoneyShort(sum(rows, (r) => (home(r) * probOf(r)) / 100)), `Importe en ${HOME} multiplicado por la probabilidad de cierre de cada etapa.`],
      ['Valor de pipeline abierto', formatMoneyShort(sum(open, home)), `Importe en ${HOME} de los negocios que no están cerrados.`],
      ['Ingresos de cierre ganados', formatMoneyShort(sum(won, home)), `Importe en ${HOME} de los negocios cerrados ganados.`],
      ['Valor de los nuevos negocios', formatMoneyShort(sum(rows.filter((r) => days(r.created) <= 30), home)), `Importe en ${HOME} de los negocios creados en los últimos 30 días.`],
      ['Antigüedad media de los negocios', open.length ? months(sum(open, (r) => days(r.created)) / open.length) : '--', 'Tiempo medio desde la creación de los negocios abiertos.'],
      ['Negocios abiertos', String(open.length), 'Número de negocios que siguen en curso.'],
    ];
  },
  // Pipeline board: one column per stage of the pipeline, with the count in the header and the amounts in the footer.
  board: {
    key: 'stage',
    groups: (st) => stagesOf(boardPipeline(st)).map(([k, l]) => [k, l]),
    scope: (rows, st) => { const p = boardPipeline(st); return rows.filter((r) => (r.pipeline || defs[0].name) === p); },
    // Rules defined in Configuración › Objetos › Negocios › Pipelines › Reglas del pipeline.
    canMove: (r, from, to) => {
      const d = defOf(r.pipeline);
      const rules = d.rules || {};
      const keys = d.stages.map((s) => s[0]);
      const i = keys.indexOf(from);
      const j = keys.indexOf(to);
      if (rules.lockClosed && isClosedStage(from)) return `"${d.name}" no permite mover negocios cerrados`;
      if (rules.noBack && j >= 0 && j < i) return `"${d.name}" no permite retroceder de etapa`;
      if (rules.noSkip && j > i + 1 && !isClosedStage(to)) return `"${d.name}" solo permite avanzar a la etapa siguiente`;
      if (rules.requireAmount && to === 'won' && !(Number(r.amount) > 0)) return 'Añade un importe antes de marcar el negocio como ganado';
      const req = (d.required || {})[to] || [];
      const missing = req.filter((p) => (p === 'Importe' ? !(Number(r.amount) > 0) : p === 'Empresa asociada' ? !r.company : p === 'Fecha de cierre' ? !r.closeDate : p === 'Siguiente paso' ? !r.hs_next_step : false));
      if (missing.length) return `Para entrar en esta etapa hace falta: ${missing.join(', ')}`;
      return null;
    },
    // After a drop: the entry date of the stage (days-in-stage counter), the timeline entry, then the
    // automations defined in the pipeline's "Automatizar" tab. The stage itself is already saved.
    onMove: (r, to, label) => {
      setField('deals', r.id, 'stageEnteredAt', TODAY.toISOString());
      addActivity({ type: 'stage', recordType: 'deals', recordId: r.id, text: `Negocio movido a la etapa ${label}.`, who: 'Tú', when: Date.now(), extra: { key: 'stage', from: r.stage, to } });
      const d = defOf(r.pipeline);
      const a = (d.automation || {})[to];
      if (!a) return;
      if (a.task) {
        addRecord('tasks', { name: `Seguimiento: ${r.name} (${label})`, type: 'Llamada', priority: 'medium', status: 'todo', owner: r.owner, due: new Date(TODAY.getTime() + 2 * 86400000).toISOString(), contact: '', contactId: r.contactId || '', dealId: r.id, lastActivity: TODAY.toISOString() });
        toast(`Tarea de seguimiento creada para ${r.owner}`);
      }
      if (a.notify) toast(`Notificación enviada a ${r.owner}: "${r.name}" ahora está en "${label}"`);
      if (a.closeDate) setField('deals', r.id, 'closeDate', TODAY.toISOString());
    },
    footer: columnFooter,
    card: dealCard,
    lines: (r) => [
      ['Valor', cardMoney(r)],
      ['Fecha de cierre', formatDate(r.closeDate)],
      ['Propietario', r.owner],
      ['Fecha de creación', formatDate(r.created)],
    ],
  },
  editors: {
    stage: allDealStages().map(([k, l]) => [k, l]),
    priority: PRIORITIES.map(([k, l]) => [k, l]),
    owner: OWNERS.map((o) => [o, o]),
    pipeline: dealPipelines().map((p) => [p, p]),
    type: [['Nuevo negocio', 'Nuevo negocio'], ['Negocio existente', 'Negocio existente']],
  },
  bulk: { actions: ['assign', 'edit', 'delete', 'segment', 'export'] },
  readOnly: ['probability'],
  previewFields: ['amount', 'stage', 'pipeline', 'closeDate', 'owner', 'company', 'priority', 'type', 'hs_next_step', 'created'],
  // Standard views (labels shared with Configuración › Administrar vistas through std-views.js).
  views: [
    { key: 'all', label: 'Todos negocios' },
    { key: 'mine', label: 'Mis negocios', filter: (r) => r.owner === 'Fernando L.' },
    { key: 'won-month', label: 'Mis negocios ganados este mes', filter: (r) => r.owner === 'Fernando L.' && r.stage === 'won' && Math.abs(days(r.closeDate)) <= 30 },
    { key: 'assigned', label: 'Mis negocios recientemente asignados', filter: (r) => r.owner === 'Fernando L.' && days(r.created) <= 14 },
    { key: 'collab', label: 'Negocios en los que estoy colaborando', filter: (r) => r.owner !== 'Fernando L.' && r.priority === 'high' && isOpen(r) },
    { key: 'new-month', label: 'Nuevos negocios este mes', filter: (r) => days(r.created) <= 30 },
    { key: 'forecast', label: 'Previsión', filter: (r) => isOpen(r) && -days(r.closeDate) >= 0 && -days(r.closeDate) <= 90 },
    { key: 'followups', label: 'Seguimientos sugeridos', filter: (r) => isOpen(r) && days(r.lastActivity) > 14 },
    { key: 'open', label: 'Negocios abiertos', filter: isOpen },
    { key: 'won', label: 'Ganados', filter: (r) => r.stage === 'won' },
    { key: 'month', label: 'Cierre este mes', filter: (r) => Math.abs(days(r.closeDate)) <= 30 },
  ],
  filters: [
    { key: 'owner', label: 'Propietario del negocio', options: OWNERS.map((o) => [o, o]), test: (r, v) => r.owner === v },
    { key: 'created', label: 'Fecha de creación', options: [['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['365', 'Este año']], test: (r, v) => days(r.created) <= Number(v) },
    { key: 'activity', label: 'Última actividad', options: [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días']], test: (r, v) => days(r.lastActivity) <= Number(v) },
    { key: 'close', label: 'Fecha de cierre', options: [['30', 'Próximos 30 días'], ['90', 'Próximos 90 días']], test: (r, v) => -days(r.closeDate) <= Number(v) && -days(r.closeDate) >= 0 },
    { key: 'stage', label: 'Etapa del negocio', options: allDealStages().map(([k, l]) => [k, l]), test: (r, v) => r.stage === v },
    { key: 'priority', label: 'Prioridad', options: PRIORITIES.map(([k, l]) => [k, l]), test: (r, v) => r.priority === v },
  ],
  defaultWidths: { name: 300, stage: 250, pipeline: 220, amount: 170, closeDate: 220, owner: 220, company: 220 },
  columns: [
    { key: 'name', label: 'Nombre del negocio', render: (r) => link(`./record/?id=${r.id}`, r.name) },
    { key: 'stage', label: 'Etapa del negocio', text: stageLabel, render: stageCell },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'amount', label: 'Valor', text: money, sortValue: home },
    { key: 'deal_currency_code', label: 'Moneda', default: false, text: (r) => r.deal_currency_code || HOME },
    { key: 'amount_in_home_currency', label: `Importe en moneda de la empresa (${HOME})`, default: false, editable: false, text: (r) => formatMoney(home(r)), sortValue: home },
    { key: 'closeDate', label: 'Fecha de cierre', text: (r) => formatDate(r.closeDate), sortValue: (r) => new Date(r.closeDate).getTime() },
    { key: 'lastActivity', label: 'Último contacto', text: (r) => formatDate(r.lastActivity), sortValue: (r) => new Date(r.lastActivity).getTime() },
    { key: 'owner', label: 'Propietario del negocio', render: (r) => ownerHtml(r.owner) },
    { key: 'company', label: 'Empresa asociada', default: false, render: (r) => (r.company ? link(`../companies/record/?id=${r.companyId || ''}`, r.company) : '<span class="muted">—</span>') },
    { key: 'priority', label: 'Prioridad', default: false, text: (r) => labelOf(PRIORITIES, r.priority), render: (r) => tag(labelOf(PRIORITIES, r.priority), classOf(PRIORITIES, r.priority)) },
    { key: 'type', label: 'Tipo de negocio', default: false },
    { key: 'probability', label: 'Probabilidad', default: false, text: (r) => `${probOf(r)} %`, sortValue: probOf },
    { key: 'created', label: 'Fecha de creación', default: false, text: (r) => formatDate(r.created), sortValue: (r) => new Date(r.created).getTime() },
  ],
  createFields: [
    { name: 'name', label: 'Nombre del negocio', required: true },
    { name: 'pipeline', label: 'Pipeline', type: 'select', options: dealPipelines().map((p) => [p, p]) },
    { name: 'stage', label: 'Etapa del negocio', type: 'select', options: allDealStages().map(([k, l]) => [k, l]) },
    { name: 'amount', label: 'Importe', type: 'number' },
    { name: 'deal_currency_code', label: 'Moneda', type: 'select', options: currencyOptions.map(([c, l]) => [c, c === HOME ? `${l} (moneda de la empresa)` : l]) },
    { name: 'closeDate', label: 'Fecha de cierre', type: 'date' },
    { name: 'company', label: 'Empresa asociada', type: 'select', options: [['', 'Ninguna'], ...allCompanies().map((c) => [c.name, c.name])] },
    { name: 'owner', label: 'Propietario del negocio', type: 'select', options: OWNERS.map((o) => [o, o]) },
    { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES.map(([k, l]) => [k, l]) },
    { name: 'type', label: 'Tipo de negocio', type: 'select', options: [['Nuevo negocio', 'Nuevo negocio'], ['Negocio existente', 'Negocio existente']] },
  ],
  normalize: (d) => {
    const pipeline = d.pipeline || dealPipelines()[0];
    const stages = stagesFor(pipeline);
    return {
      ...d,
      amount: Number(d.amount) || 0,
      deal_currency_code: CURRENCY_DEFS[d.deal_currency_code] ? d.deal_currency_code : HOME,
      // A stage that does not belong to the chosen pipeline falls back to its first stage.
      stage: stages.some((s) => s[0] === d.stage) ? d.stage : stages[0][0],
      stageEnteredAt: TODAY.toISOString(),
      closeDate: d.closeDate ? new Date(d.closeDate).toISOString() : new Date(TODAY.getTime() + 30 * 86400000).toISOString(),
      companyId: (allCompanies().find((c) => c.name === d.company) || {}).id || '',
      pipeline,
      lastActivity: TODAY.toISOString(),
    };
  },
});
createPanel = mountCreateDeal({ list });

export { list, createPanel };

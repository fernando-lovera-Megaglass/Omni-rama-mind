import { boot } from './page.js';
import { mountList, tag, link, ownerHtml } from './list.js';
import { allDeals, allCompanies, DEAL_STAGES, PRIORITIES, OWNERS, formatDate, formatMoney, formatMoneyShort, labelOf, classOf, TODAY, dealPipelines, dealPipelineDefs, addRecord, setField, CURRENCY_DEFS, CURRENCY_CODES, homeCurrency, toHomeCurrency } from './data.js';
import { toast } from './shell.js';

boot({ root: '../', active: 'crm', sub: 'Negocios', title: 'Negocios' });

const days = (iso) => (TODAY - new Date(iso)) / 86400000;
// Stages of the deal's own pipeline (each pipeline defines its stages in Configuración › Objetos).
const defs = dealPipelineDefs();
const defOf = (pipeline) => defs.find((p) => p.name === pipeline) || defs[0];
const stagesOf = (pipeline) => (defs.find((p) => p.name === pipeline) || { stages: DEAL_STAGES }).stages;
const stageLabel = (r) => `${labelOf(stagesOf(r.pipeline), r.stage) || labelOf(DEAL_STAGES, r.stage)} (${r.pipeline || defs[0].name})`;
const colorMode = () => { try { return (JSON.parse(localStorage.getItem('crm:settings:obj-deals')) || {}).stageColor || 'none'; } catch { return 'none'; } };
const stageCell = (r) => {
  const label = stageLabel(r);
  const cls = r.stage === 'won' ? 'is-won' : r.stage === 'lost' ? 'is-lost' : '';
  const mode = colorMode();
  if (mode === 'badge') return tag(label, r.stage === 'won' ? 'tag--done' : r.stage === 'lost' ? 'tag--high' : 'tag--open');
  return `<span class="stage ${cls}${mode === 'dot' ? ' stage--dot' : ''}" title="${label}">${label}</span>`;
};
const probOf = (r) => (stagesOf(r.pipeline).find((s) => s[0] === r.stage) || DEAL_STAGES.find((s) => s[0] === r.stage) || [0, 0, 0])[2];
const isOpen = (r) => r.stage !== 'won' && r.stage !== 'lost';
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const months = (d) => `${(d / 30).toLocaleString('es-ES', { maximumFractionDigits: 1 })} meses`;
// Each deal shows its amount in its own currency; totals add everything up in the company currency.
const money = (r) => formatMoney(r.amount, r.deal_currency_code);
const home = (r) => toHomeCurrency(r.amount, r.deal_currency_code);
const HOME = homeCurrency();
const currencyOptions = CURRENCY_CODES.map((c) => [c, `${c} · ${CURRENCY_DEFS[c].name}`]);

mountList({
  type: 'deals',
  title: 'Negocios',
  singular: 'Negocio',
  plural: 'negocios',
  addLabel: 'Agregar negocios',
  createLabel: 'Crear negocio',
  searchPlaceholder: 'Buscar nombre del negocio, empresa...',
  searchKeys: ['name', 'company', 'owner', 'pipeline'],
  rows: allDeals,
  defaultSort: { key: 'closeDate', dir: 1 },
  // Pipeline selector in the toolbar: filters the list and the board to one pipeline.
  pipeline: { key: 'pipeline', label: 'Pipeline', options: dealPipelines, manageHref: '../settings/#obj-deals:pipelines' },
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
  // Pipeline board: one column per stage, with the count and the total amount.
  board: {
    key: 'stage',
    groups: (st) => (st.pipeline ? stagesOf(st.pipeline) : DEAL_STAGES).map(([k, l]) => [k, l]),
    // Rules defined in Configuración › Objetos › Negocios › Pipelines › Reglas del pipeline.
    canMove: (r, from, to) => {
      const d = defOf(r.pipeline);
      const rules = d.rules || {};
      const keys = d.stages.map((s) => s[0]);
      const i = keys.indexOf(from);
      const j = keys.indexOf(to);
      if (rules.lockClosed && (from === 'won' || from === 'lost')) return `"${d.name}" no permite mover negocios cerrados`;
      if (rules.noBack && j >= 0 && j < i) return `"${d.name}" no permite retroceder de etapa`;
      if (rules.noSkip && j > i + 1 && to !== 'lost' && to !== 'won') return `"${d.name}" solo permite avanzar a la etapa siguiente`;
      if (rules.requireAmount && to === 'won' && !(Number(r.amount) > 0)) return 'Añade un importe antes de marcar el negocio como ganado';
      const req = (d.required || {})[to] || [];
      const missing = req.filter((p) => (p === 'Importe' ? !(Number(r.amount) > 0) : p === 'Empresa asociada' ? !r.company : p === 'Fecha de cierre' ? !r.closeDate : p === 'Siguiente paso' ? !r.hs_next_step : false));
      if (missing.length) return `Para entrar en esta etapa hace falta: ${missing.join(', ')}`;
      return null;
    },
    // Automations defined in the pipeline's "Automatizar" tab.
    onMove: (r, to, label) => {
      const d = defOf(r.pipeline);
      const a = (d.automation || {})[to];
      if (!a) return;
      if (a.task) {
        addRecord('tasks', { name: `Seguimiento: ${r.name} (${label})`, type: 'Llamada', priority: 'medium', status: 'todo', owner: r.owner, due: new Date(TODAY.getTime() + 2 * 86400000).toISOString(), contact: '', contactId: '', lastActivity: TODAY.toISOString() });
        toast(`Tarea de seguimiento creada para ${r.owner}`);
      }
      if (a.notify) toast(`Notificación enviada a ${r.owner}: "${r.name}" ahora está en "${label}"`);
      if (a.closeDate) setField('deals', r.id, 'closeDate', TODAY.toISOString());
    },
    sum: (rows) => formatMoney(rows.reduce((s, d) => s + home(d), 0)),
    // Weighted (net) amount of the column: stage total × close probability.
    weighted: (rows) => `pond. ${formatMoneyShort(rows.reduce((s, d) => s + (home(d) * probOf(d)) / 100, 0))}`,
    lines: (r) => [
      ['Importe', money(r)],
      ['Fecha de cierre', formatDate(r.closeDate)],
      ['Propietario del negocio', r.owner],
    ],
    sub: (r) => (r.company ? { name: r.company, href: `../companies/record/?id=${r.companyId || ''}` } : null),
  },
  editors: {
    stage: DEAL_STAGES.map(([k, l]) => [k, l]),
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
    { key: 'stage', label: 'Etapa del negocio', options: DEAL_STAGES.map(([k, l]) => [k, l]), test: (r, v) => r.stage === v },
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
    { name: 'stage', label: 'Etapa del negocio', type: 'select', options: DEAL_STAGES.map(([k, l]) => [k, l]) },
    { name: 'amount', label: 'Importe', type: 'number' },
    { name: 'deal_currency_code', label: 'Moneda', type: 'select', options: currencyOptions.map(([c, l]) => [c, c === HOME ? `${l} (moneda de la empresa)` : l]) },
    { name: 'closeDate', label: 'Fecha de cierre', type: 'date' },
    { name: 'company', label: 'Empresa asociada', type: 'select', options: [['', 'Ninguna'], ...allCompanies().map((c) => [c.name, c.name])] },
    { name: 'owner', label: 'Propietario del negocio', type: 'select', options: OWNERS.map((o) => [o, o]) },
    { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES.map(([k, l]) => [k, l]) },
    { name: 'type', label: 'Tipo de negocio', type: 'select', options: [['Nuevo negocio', 'Nuevo negocio'], ['Negocio existente', 'Negocio existente']] },
  ],
  normalize: (d) => ({
    ...d,
    amount: Number(d.amount) || 0,
    deal_currency_code: CURRENCY_DEFS[d.deal_currency_code] ? d.deal_currency_code : HOME,
    stage: d.stage || 'appointment',
    closeDate: d.closeDate ? new Date(d.closeDate).toISOString() : new Date(TODAY.getTime() + 30 * 86400000).toISOString(),
    companyId: (allCompanies().find((c) => c.name === d.company) || {}).id || '',
    pipeline: d.pipeline || dealPipelines()[0],
    lastActivity: TODAY.toISOString(),
  }),
});

import { boot } from './page.js';
import { mountList, tag, link, ownerHtml } from './list.js';
import { allTickets, allContacts, PRIORITIES, OWNERS, formatDate, labelOf, classOf, TODAY, ticketPipelines, ticketStatusesFor, allTicketStatuses, ticketStatusLabel, ticketStatusClass, isTicketOpen, firstOpenTicketStatus, ticketPipelineCounts } from './data.js';

boot({ root: '../', active: 'crm', sub: 'Tickets', title: 'Tickets' });

const days = (iso) => (TODAY - new Date(iso)) / 86400000;
const contactName = (id) => (allContacts().find((c) => Number(c.id) === Number(id)) || {}).name || '';
// Statuses belong to each pipeline (the original's "estados", open or closed); lists that show every
// pipeline use the union of them.
const statusOptions = () => allTicketStatuses().map(([k, l]) => [k, l]);
const openClosed = (name) => {
  const counts = ticketPipelineCounts();
  const c = name ? counts[name] : Object.values(counts).reduce((s, x) => ({ open: s.open + x.open, closed: s.closed + x.closed }), { open: 0, closed: 0 });
  return c ? `${c.open} abierto${c.open === 1 ? '' : 's'} · ${c.closed} cerrado${c.closed === 1 ? '' : 's'}` : '';
};

mountList({
  type: 'tickets',
  title: 'Tickets',
  singular: 'Ticket',
  plural: 'tickets',
  addLabel: 'Agregar tickets',
  createLabel: 'Crear ticket',
  // Pipeline selector in the toolbar (as in the original): filters the list and the board to one pipeline,
  // with the open / closed indicator of each pipeline.
  pipeline: { key: 'pipeline', label: 'Pipeline', options: ticketPipelines, manageHref: '../settings/#obj-tickets:pipelines', detail: (name) => openClosed(name) },
  // Metrics card above the table ("Mostrar métricas" in the gear menu); hidden until the person turns it on.
  metricsDefault: false,
  summary: (rows) => {
    const open = rows.filter(isTicketOpen);
    const replies = rows.map((r) => Number(r.time_to_first_agent_reply)).filter((v) => !Number.isNaN(v));
    const avg = replies.length ? Math.round(replies.reduce((s, v) => s + v, 0) / replies.length) : null;
    const n = (f) => String(rows.filter(f).length);
    return [
      ['Tickets abiertos', String(open.length), 'Tickets en un estado abierto de su pipeline.'],
      ['Tickets cerrados', String(rows.length - open.length), 'Tickets en un estado cerrado de su pipeline.'],
      ['Nuevos esta semana', n((r) => days(r.created) <= 7), 'Tickets creados en los últimos 7 días.'],
      ['Alta prioridad abiertos', String(open.filter((r) => r.priority === 'high').length), 'Tickets abiertos con prioridad alta.'],
      ['Esperando nuestra respuesta', n((r) => r.status === 'progress'), 'Tickets en "En espera de nosotros".'],
      ['Tiempo medio de primera respuesta', avg === null ? '--' : `${avg} h`, 'Media de horas hasta la primera respuesta de un agente.'],
      ['Sin propietario', n((r) => r.owner === 'Sin asignar'), 'Tickets que todavía no tienen propietario.'],
    ];
  },
  board: {
    key: 'status',
    // Columns = the statuses of the chosen pipeline (all of them when every pipeline is shown).
    groups: (state) => (state.pipeline ? ticketStatusesFor(state.pipeline) : allTicketStatuses()).map(([k, l, t]) => [k, t === 'closed' ? `${l} ✓` : l]),
    lines: (r) => [
      ['Prioridad', labelOf(PRIORITIES, r.priority)],
      ['Propietario del ticket', r.owner],
      ['Fuente', r.source],
      ['Creado', formatDate(r.created)],
    ],
    sub: (r) => (r.contact ? { name: r.contact, href: `../contacts/record/?id=${r.contactId}` } : null),
  },
  editors: {
    status: statusOptions(),
    priority: PRIORITIES.map(([k, l]) => [k, l]),
    owner: OWNERS.map((o) => [o, o]),
    source: ['Correo', 'Formulario', 'Chat', 'Teléfono'].map((x) => [x, x]),
    pipeline: ticketPipelines().map((p) => [p, p]),
  },
  readOnly: ['contact', 'company'],
  previewFields: ['status', 'priority', 'contact', 'company', 'owner', 'source', 'hs_ticket_category', 'description', 'pipeline', 'created'],
  searchPlaceholder: 'Buscar nombre del ticket, contacto...',
  searchKeys: ['name', 'owner', 'source', 'description', 'company'],
  rows: () => allTickets().map((t) => ({ ...t, contact: t.contact || contactName(t.contactId) })),
  views: [
    { key: 'all', label: 'Todos los tickets' },
    { key: 'open', label: 'Tickets abiertos', filter: (r) => isTicketOpen(r) },
    { key: 'closed', label: 'Tickets cerrados', filter: (r) => !isTicketOpen(r) },
    { key: 'mine', label: 'Mis tickets', filter: (r) => r.owner === 'Fernando L.' },
    { key: 'high', label: 'Prioridad alta', filter: (r) => r.priority === 'high' },
  ],
  filters: [
    { key: 'owner', label: 'Propietario del ticket', options: OWNERS.map((o) => [o, o]), test: (r, v) => r.owner === v },
    { key: 'status', label: 'Estado del ticket', options: statusOptions(), test: (r, v) => r.status === v },
    { key: 'priority', label: 'Prioridad', options: PRIORITIES.map(([k, l]) => [k, l]), test: (r, v) => r.priority === v },
    { key: 'created', label: 'Fecha de creación', options: [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días']], test: (r, v) => days(r.created) <= Number(v) },
    { key: 'source', label: 'Fuente', options: ['Correo', 'Formulario', 'Chat', 'Teléfono'].map((x) => [x, x]), test: (r, v) => r.source === v },
  ],
  columns: [
    { key: 'name', label: 'Nombre del ticket', render: (r) => link(`./record/?id=${r.id}`, r.name) },
    { key: 'pipeline', label: 'Pipeline', render: (r) => (r.pipeline ? tag(r.pipeline, 'tag--none') : '<span class="muted">—</span>') },
    { key: 'status', label: 'Estado del ticket', text: (r) => ticketStatusLabel(r.pipeline, r.status), render: (r) => tag(ticketStatusLabel(r.pipeline, r.status), ticketStatusClass(r.pipeline, r.status)) },
    { key: 'priority', label: 'Prioridad', text: (r) => labelOf(PRIORITIES, r.priority), render: (r) => tag(labelOf(PRIORITIES, r.priority), classOf(PRIORITIES, r.priority)) },
    { key: 'contact', label: 'Contacto asociado', render: (r) => (r.contact ? link(`../contacts/record/?id=${r.contactId}`, r.contact) : '<span class="muted">—</span>') },
    { key: 'company', label: 'Empresa asociada', default: false, render: (r) => (r.companyId ? link(`../companies/record/?id=${r.companyId}`, r.company || 'Empresa') : '<span class="muted">—</span>') },
    { key: 'owner', label: 'Propietario del ticket', render: (r) => ownerHtml(r.owner) },
    { key: 'source', label: 'Fuente' },
    { key: 'lastActivity', label: 'Última actividad', default: false, text: (r) => formatDate(r.lastActivity), sortValue: (r) => new Date(r.lastActivity).getTime() },
    { key: 'created', label: 'Fecha de creación', text: (r) => formatDate(r.created), sortValue: (r) => new Date(r.created).getTime() },
  ],
  createFields: [
    { name: 'name', label: 'Nombre del ticket', required: true },
    { name: 'description', label: 'Descripción' },
    { name: 'pipeline', label: 'Pipeline', type: 'select', options: ticketPipelines().map((p) => [p, p]) },
    { name: 'status', label: 'Estado del ticket', type: 'select', options: statusOptions() },
    { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES.map(([k, l]) => [k, l]) },
    { name: 'source', label: 'Fuente', type: 'select', options: ['Correo', 'Formulario', 'Chat', 'Teléfono'].map((x) => [x, x]) },
    { name: 'contactId', label: 'Contacto asociado', type: 'select', options: [['', 'Ninguno'], ...allContacts().slice(0, 30).map((c) => [c.id, c.name])] },
    { name: 'owner', label: 'Propietario del ticket', type: 'select', options: OWNERS.map((o) => [o, o]) },
  ],
  // Sensible defaults (specification §7): first pipeline and its first open status; a status that does not
  // belong to the chosen pipeline falls back to that first open status.
  normalize: (d) => {
    const pipeline = ticketPipelines().includes(d.pipeline) ? d.pipeline : ticketPipelines()[0];
    const valid = ticketStatusesFor(pipeline).some((s) => s[0] === d.status);
    return { ...d, pipeline, status: valid ? d.status : firstOpenTicketStatus(pipeline), priority: d.priority || 'medium', lastActivity: TODAY.toISOString() };
  },
});

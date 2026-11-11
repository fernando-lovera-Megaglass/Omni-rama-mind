import { boot } from './page.js';
import { mountList, tag, link, ownerHtml } from './list.js';
import { allTickets, allContacts, TICKET_STATUSES, PRIORITIES, OWNERS, formatDate, labelOf, classOf, TODAY, ticketPipelines } from './data.js';

boot({ root: '../', active: 'crm', sub: 'Tickets', title: 'Tickets' });

const days = (iso) => (TODAY - new Date(iso)) / 86400000;
const contactName = (id) => (allContacts().find((c) => Number(c.id) === Number(id)) || {}).name || '';

mountList({
  type: 'tickets',
  title: 'Tickets',
  singular: 'Ticket',
  plural: 'tickets',
  addLabel: 'Agregar tickets',
  createLabel: 'Crear ticket',
  // Pipeline selector in the toolbar (as in the original): filters the list and the board to one pipeline.
  pipeline: { key: 'pipeline', label: 'Pipeline', options: ticketPipelines, manageHref: '../settings/#obj-tickets:pipelines' },
  // Metrics card above the table ("Mostrar métricas" in the gear menu); hidden until the person turns it on.
  metricsDefault: false,
  summary: (rows) => {
    const open = rows.filter((r) => r.status !== 'closed');
    const replies = rows.map((r) => Number(r.time_to_first_agent_reply)).filter((v) => !Number.isNaN(v));
    const avg = replies.length ? Math.round(replies.reduce((s, v) => s + v, 0) / replies.length) : null;
    const n = (f) => String(rows.filter(f).length);
    return [
      ['Tickets abiertos', String(open.length), 'Tickets que no están cerrados.'],
      ['Nuevos esta semana', n((r) => days(r.created) <= 7), 'Tickets creados en los últimos 7 días.'],
      ['Alta prioridad abiertos', String(open.filter((r) => r.priority === 'high').length), 'Tickets abiertos con prioridad alta.'],
      ['Esperando nuestra respuesta', n((r) => r.status === 'progress'), 'Tickets en "En espera de nosotros".'],
      ['Tiempo medio de primera respuesta', avg === null ? '--' : `${avg} h`, 'Media de horas hasta la primera respuesta de un agente.'],
      ['Sin propietario', n((r) => r.owner === 'Sin asignar'), 'Tickets que todavía no tienen propietario.'],
    ];
  },
  board: {
    key: 'status',
    groups: TICKET_STATUSES.map(([k, l]) => [k, l]),
    lines: (r) => [
      ['Prioridad', labelOf(PRIORITIES, r.priority)],
      ['Propietario del ticket', r.owner],
      ['Fuente', r.source],
      ['Creado', formatDate(r.created)],
    ],
    sub: (r) => (r.contact ? { name: r.contact, href: `../contacts/record/?id=${r.contactId}` } : null),
  },
  editors: {
    status: TICKET_STATUSES.map(([k, l]) => [k, l]),
    priority: PRIORITIES.map(([k, l]) => [k, l]),
    owner: OWNERS.map((o) => [o, o]),
    source: ['Correo', 'Formulario', 'Chat', 'Teléfono'].map((x) => [x, x]),
    pipeline: ticketPipelines().map((p) => [p, p]),
  },
  readOnly: ['contact'],
  previewFields: ['status', 'priority', 'contact', 'owner', 'source', 'hs_ticket_category', 'description', 'pipeline', 'created'],
  searchPlaceholder: 'Buscar nombre del ticket, contacto...',
  searchKeys: ['name', 'owner', 'source', 'description'],
  rows: () => allTickets().map((t) => ({ ...t, contact: t.contact || contactName(t.contactId) })),
  views: [
    { key: 'all', label: 'Todos los tickets' },
    { key: 'open', label: 'Tickets abiertos', filter: (r) => r.status !== 'closed' },
    { key: 'mine', label: 'Mis tickets', filter: (r) => r.owner === 'Fernando L.' },
    { key: 'high', label: 'Prioridad alta', filter: (r) => r.priority === 'high' },
  ],
  filters: [
    { key: 'owner', label: 'Propietario del ticket', options: OWNERS.map((o) => [o, o]), test: (r, v) => r.owner === v },
    { key: 'status', label: 'Estado del ticket', options: TICKET_STATUSES.map(([k, l]) => [k, l]), test: (r, v) => r.status === v },
    { key: 'priority', label: 'Prioridad', options: PRIORITIES.map(([k, l]) => [k, l]), test: (r, v) => r.priority === v },
    { key: 'created', label: 'Fecha de creación', options: [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días']], test: (r, v) => days(r.created) <= Number(v) },
    { key: 'source', label: 'Fuente', options: ['Correo', 'Formulario', 'Chat', 'Teléfono'].map((x) => [x, x]), test: (r, v) => r.source === v },
  ],
  columns: [
    { key: 'name', label: 'Nombre del ticket', render: (r) => link(`./record/?id=${r.id}`, r.name) },
    { key: 'pipeline', label: 'Pipeline', render: (r) => (r.pipeline ? tag(r.pipeline, 'tag--none') : '<span class="muted">—</span>') },
    { key: 'status', label: 'Estado del ticket', text: (r) => labelOf(TICKET_STATUSES, r.status), render: (r) => tag(labelOf(TICKET_STATUSES, r.status), classOf(TICKET_STATUSES, r.status)) },
    { key: 'priority', label: 'Prioridad', text: (r) => labelOf(PRIORITIES, r.priority), render: (r) => tag(labelOf(PRIORITIES, r.priority), classOf(PRIORITIES, r.priority)) },
    { key: 'contact', label: 'Contacto asociado', render: (r) => (r.contact ? link(`../contacts/record/?id=${r.contactId}`, r.contact) : '<span class="muted">—</span>') },
    { key: 'owner', label: 'Propietario del ticket', render: (r) => ownerHtml(r.owner) },
    { key: 'source', label: 'Fuente' },
    { key: 'lastActivity', label: 'Última actividad', default: false, text: (r) => formatDate(r.lastActivity), sortValue: (r) => new Date(r.lastActivity).getTime() },
    { key: 'created', label: 'Fecha de creación', text: (r) => formatDate(r.created), sortValue: (r) => new Date(r.created).getTime() },
  ],
  createFields: [
    { name: 'name', label: 'Nombre del ticket', required: true },
    { name: 'description', label: 'Descripción' },
    { name: 'pipeline', label: 'Pipeline', type: 'select', options: ticketPipelines().map((p) => [p, p]) },
    { name: 'status', label: 'Estado del ticket', type: 'select', options: TICKET_STATUSES.map(([k, l]) => [k, l]) },
    { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES.map(([k, l]) => [k, l]) },
    { name: 'source', label: 'Fuente', type: 'select', options: ['Correo', 'Formulario', 'Chat', 'Teléfono'].map((x) => [x, x]) },
    { name: 'contactId', label: 'Contacto asociado', type: 'select', options: [['', 'Ninguno'], ...allContacts().slice(0, 30).map((c) => [c.id, c.name])] },
    { name: 'owner', label: 'Propietario del ticket', type: 'select', options: OWNERS.map((o) => [o, o]) },
  ],
  normalize: (d) => ({ ...d, status: d.status || 'new', priority: d.priority || 'medium', pipeline: ticketPipelines().includes(d.pipeline) ? d.pipeline : ticketPipelines()[0], lastActivity: TODAY.toISOString() }),
});

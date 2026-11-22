import { boot } from './page.js';
import { mountList, tag, link, ownerHtml } from './list.js';
import { toast } from './shell.js';
import { ticketMoveRefusal, runTicketAutomation } from './ticket-rules.js';
import { mountCreateTicket } from './create-ticket.js';
import { ticketTagChips, tagsForTicket, ready as ticketTagsReady } from './ticket-tags.js';
import { allTickets, allContacts, PRIORITIES, OWNERS, formatDate, labelOf, classOf, TODAY, ticketPipelines, ticketStatusesFor, allTicketStatuses, ticketStatusLabel, ticketStatusClass, isTicketOpen, firstOpenTicketStatus, ticketPipelineCounts } from './data.js';

boot({ root: '../', active: 'crm', sub: 'Tickets', title: 'Tickets' });

const days = (iso) => (TODAY - new Date(iso)) / 86400000;
const contactName = (id) => (allContacts().find((c) => Number(c.id) === Number(id)) || {}).name || '';
// Status keys of every pipeline that are open (or closed), for the server-side views.
const statusKeys = (kind) => allTicketStatuses().filter((s) => s[2] === kind).map((s) => s[0]);
// Statuses belong to each pipeline (the original's "estados", open or closed); lists that show every
// pipeline use the union of them.
const statusOptions = () => allTicketStatuses().map(([k, l]) => [k, l]);
const openClosed = (name) => {
  const counts = ticketPipelineCounts();
  const c = name ? counts[name] : Object.values(counts).reduce((s, x) => ({ open: s.open + x.open, closed: s.closed + x.closed }), { open: 0, closed: 0 });
  return c ? `${c.open} abierto${c.open === 1 ? '' : 's'} · ${c.closed} cerrado${c.closed === 1 ? '' : 's'}` : '';
};

// "Crear ticket" is the slide-over panel of src/create-ticket.js (mounted after the list, below).
let createPanel = null;
const list = mountList({
  type: 'tickets',
  title: 'Tickets',
  singular: 'Ticket',
  plural: 'tickets',
  addLabel: 'Agregar tickets',
  createLabel: 'Crear ticket',
  addDirect: true,
  // Bulk bar as the original's: «Crear tareas» makes one task per ticket, associated to it.
  bulk: { actions: ['assign', 'edit', 'delete', 'tasks', 'export'] },
  // The panel opens on the pipeline being looked at (the board's "+ Ticket" also passes its status).
  openCreate: (prefill) => createPanel && createPanel.open({ pipeline: list.state.pipeline || undefined, ...(prefill || {}) }),
  // "Acciones" next to "Agregar" (export, trash, bulk edit); tickets have no duplicate management nor format fixes.
  actionsMenu: { dupes: false, fixFormat: false },
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
      ['Propietario del ticket', r.owner, 'user'],
      ['Fuente', r.source],
      ['Creado', formatDate(r.created)],
    ],
    sub: (r) => (r.contact ? { name: r.contact, href: `../contacts/record/?id=${r.contactId}` } : null),
    // The ticket tags (Ajustes › Objetos › Tickets › Pipelines › Etiquetas de Ticket) the ticket earns right now.
    badges: (r) => ticketTagChips(r),
    // Pipeline rules (Ajustes › Objetos › Tickets › Pipelines › Reglas): no going back, no moving closed tickets,
    // required properties before entering a status; the refusal message is shown by list.js.
    canMove: (r, from, to) => ticketMoveRefusal(r, from, to),
    // Automation of the status just entered (Automatizar): follow-up task for the owner and/or notification.
    onMove: (r, to, label) => {
      const clean = String(label || '').replace(/\s*✓$/, ''); // the board marks closed columns with «✓»
      const done = runTicketAutomation(r, to, clean);
      if (done.task) toast(`Tarea de seguimiento creada para ${r.owner}`);
      if (done.notified) toast(`Notificación enviada a ${r.owner}: "${r.name}" ahora está en "${clean}"`);
    },
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
  // `where` = the same view/filter as a Supabase (PostgREST) clause, for the server-side pages (src/server-list.js).
  views: [
    { key: 'all', label: 'Todos los tickets' },
    { key: 'open', label: 'Tickets abiertos', filter: (r) => isTicketOpen(r), where: (q, h) => q.in(h.col('status'), statusKeys('open')) },
    { key: 'closed', label: 'Tickets cerrados', filter: (r) => !isTicketOpen(r), where: (q, h) => q.in(h.col('status'), statusKeys('closed')) },
    { key: 'mine', label: 'Mis tickets', filter: (r) => r.owner === 'Fernando L.', where: (q, h) => q.eq(h.col('owner'), 'Fernando L.') },
    { key: 'high', label: 'Prioridad alta', filter: (r) => r.priority === 'high', where: (q, h) => q.eq(h.col('priority'), 'high') },
  ],
  filters: [
    { key: 'owner', label: 'Propietario del ticket', options: OWNERS.map((o) => [o, o]), test: (r, v) => r.owner === v, where: (q, v, h) => q.eq(h.col('owner'), v) },
    { key: 'status', label: 'Estado del ticket', options: statusOptions(), test: (r, v) => r.status === v, where: (q, v, h) => q.eq(h.col('status'), v) },
    { key: 'priority', label: 'Prioridad', options: PRIORITIES.map(([k, l]) => [k, l]), test: (r, v) => r.priority === v, where: (q, v, h) => q.eq(h.col('priority'), v) },
    { key: 'created', label: 'Fecha de creación', options: [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días']], test: (r, v) => days(r.created) <= Number(v), where: (q, v, h) => q.gte(h.col('created'), h.daysAgo(v)) },
    { key: 'source', label: 'Fuente', options: ['Correo', 'Formulario', 'Chat', 'Teléfono'].map((x) => [x, x]), test: (r, v) => r.source === v, where: (q, v, h) => q.eq(h.col('source'), v) },
  ],
  columns: [
    { key: 'name', label: 'Nombre del ticket', render: (r) => link(`./record/?id=${r.id}`, r.name) },
    { key: 'pipeline', label: 'Pipeline', render: (r) => (r.pipeline ? tag(r.pipeline, 'tag--none') : '<span class="muted">—</span>') },
    { key: 'status', label: 'Estado del ticket', text: (r) => ticketStatusLabel(r.pipeline, r.status), render: (r) => tag(ticketStatusLabel(r.pipeline, r.status), ticketStatusClass(r.pipeline, r.status)) },
    { key: 'priority', label: 'Prioridad', text: (r) => labelOf(PRIORITIES, r.priority), render: (r) => tag(labelOf(PRIORITIES, r.priority), classOf(PRIORITIES, r.priority)) },
    { key: 'contact', label: 'Contacto asociado', serverSort: false, render: (r) => (r.contact ? link(`../contacts/record/?id=${r.contactId}`, r.contact) : '<span class="muted">—</span>') },
    { key: 'company', label: 'Empresa asociada', default: false, render: (r) => (r.companyId ? link(`../companies/record/?id=${r.companyId}`, r.company || 'Empresa') : '<span class="muted">—</span>') },
    { key: 'owner', label: 'Propietario del ticket', render: (r) => ownerHtml(r.owner) },
    { key: 'source', label: 'Fuente' },
    { key: 'lastActivity', label: 'Última actividad', default: false, text: (r) => formatDate(r.lastActivity), sortValue: (r) => new Date(r.lastActivity).getTime() },
    { key: 'created', label: 'Fecha de creación', text: (r) => formatDate(r.created), sortValue: (r) => new Date(r.created).getTime() },
    // The ticket tags (colour + emoji chips), evaluated live from their filters; optional column.
    { key: 'ticket_tags', label: 'Etiquetas de ticket', default: false, editable: false, serverSort: false, text: (r) => tagsForTicket(r).map((t) => t.name).join(', '), render: (r) => ticketTagChips(r) || '<span class="muted">—</span>' },
  ],
  // The generic drawer markup still needs the field list (list.js renders it for every object); the person
  // always gets the slide-over above, which also owns the associations (no more "first 30 contacts" select).
  createFields: [
    { name: 'name', label: 'Nombre del ticket', required: true },
    { name: 'pipeline', label: 'Pipeline', type: 'select', options: ticketPipelines().map((p) => [p, p]) },
    { name: 'status', label: 'Estado del ticket', type: 'select', options: statusOptions() },
    { name: 'description', label: 'Descripción' },
    { name: 'source', label: 'Fuente', type: 'select', options: ['Correo', 'Formulario', 'Chat', 'Teléfono'].map((x) => [x, x]) },
    { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES.map(([k, l]) => [k, l]) },
    { name: 'owner', label: 'Propietario del ticket', type: 'select', options: OWNERS.map((o) => [o, o]) },
  ],
  // Sensible defaults (specification §7), shared with the panel: first pipeline and its first open status; a
  // status that does not belong to the chosen pipeline falls back to that first open status.
  normalize: (d) => {
    const pipeline = ticketPipelines().includes(d.pipeline) ? d.pipeline : ticketPipelines()[0];
    const valid = ticketStatusesFor(pipeline).some((s) => s[0] === d.status);
    return { ...d, pipeline, status: valid ? d.status : firstOpenTicketStatus(pipeline), priority: d.priority || 'medium', lastActivity: TODAY.toISOString() };
  },
});
createPanel = mountCreateTicket({ list });
// The ticket tags load after the page (Supabase): repaint the chips when they arrive and whenever they change.
ticketTagsReady.then(() => list.render());
document.addEventListener('crm:ticket-tags', () => list.render());

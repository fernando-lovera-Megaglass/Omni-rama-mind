import { boot } from './page.js';
import { mountList, tag, link, ownerHtml } from './list.js';
import { toast } from './shell.js';
import { allTasks, allContacts, TASK_STATUSES, TASK_TYPES, PRIORITIES, OWNERS, formatDate, labelOf, classOf, TODAY } from './data.js';
import { startQueue, activeQueue, endQueue, queueTask, queueFinished, queueSummary, targetFor, goTo, dueMatches, dueText, dueClass, DUE_OPTIONS, dayDiff, completeTask } from './task-queue.js';

boot({ root: '../', active: 'crm', sub: 'Tareas', title: 'Tareas' });

const $ = (id) => document.getElementById(id);
const pending = (r) => r.status !== 'done';
let queueable = []; // pending tasks of the current view, in its order: what "Iniciar N tareas" works through

const list = mountList({
  type: 'tasks',
  title: 'Tareas',
  singular: 'Tarea',
  plural: 'tareas',
  addLabel: 'Agregar tareas',
  createLabel: 'Crear tarea',
  // "Iniciar N tareas": works the pending tasks of this view one by one (the queue bar on each record).
  extraActions: `<button class="btn btn--primary btn--sm tq-start" type="button" data-action="start-queue" id="start-queue" title="Trabaja las tareas pendientes de esta vista una por una">Iniciar tareas</button>`,
  // Metrics card above the table ("Mostrar métricas" in the gear menu); hidden until the person turns it on.
  metricsDefault: false,
  summary: (rows) => {
    const todo = rows.filter(pending);
    const n = (f) => String(rows.filter(f).length);
    return [
      ['Tareas pendientes', String(todo.length), 'Tareas que todavía no se han completado.'],
      ['Vencidas', String(todo.filter((r) => dueMatches(r, 'overdue')).length), 'Tareas pendientes cuya fecha de vencimiento ya pasó.'],
      ['Para hoy', String(todo.filter((r) => dueMatches(r, 'today')).length), 'Tareas pendientes que vencen hoy.'],
      ['Llamadas pendientes', String(todo.filter((r) => r.type === 'Llamada').length), 'Tareas de tipo llamada sin completar.'],
      ['Completadas', n((r) => r.status === 'done'), 'Tareas marcadas como completadas en la vista.'],
      ['Sin asignar', n((r) => r.owner === 'Sin asignar'), 'Tareas que todavía no tienen responsable.'],
    ];
  },
  board: {
    key: 'status',
    groups: TASK_STATUSES.map(([k, l]) => [k, l]),
    lines: (r) => [
      ['Vence', formatDate(r.due)],
      ['Tipo', r.type],
      ['Prioridad', labelOf(PRIORITIES, r.priority)],
      ['Asignada a', r.owner],
    ],
    sub: (r) => (r.contact ? { name: r.contact, href: `../contacts/record/?id=${r.contactId}` } : null),
  },
  editors: {
    status: TASK_STATUSES.map(([k, l]) => [k, l]),
    priority: PRIORITIES.map(([k, l]) => [k, l]),
    owner: OWNERS.map((o) => [o, o]),
    type: TASK_TYPES.map((t) => [t, t]),
  },
  readOnly: ['done', 'contact'],
  previewFields: ['status', 'type', 'due', 'priority', 'contact', 'owner', 'hs_queue_membership_ids', 'created'],
  searchPlaceholder: 'Buscar tarea, contacto...',
  searchKeys: ['name', 'contact', 'owner', 'type'],
  rows: allTasks,
  defaultSort: { key: 'due', dir: 1 },
  views: [
    { key: 'all', label: 'Todas las tareas' },
    { key: 'today', label: 'Vencen hoy', filter: (r) => pending(r) && dayDiff(r.due) === 0 },
    { key: 'overdue', label: 'Atrasadas', filter: (r) => pending(r) && dayDiff(r.due) < 0 },
    { key: 'upcoming', label: 'Próximas', filter: (r) => pending(r) && dayDiff(r.due) > 0 },
    { key: 'done', label: 'Completadas', filter: (r) => r.status === 'done' },
  ],
  filters: [
    { key: 'due', label: 'Fecha de vencimiento', options: DUE_OPTIONS, test: (r, v) => dueMatches(r, v) },
    { key: 'owner', label: 'Asignada a', options: OWNERS.map((o) => [o, o]), test: (r, v) => r.owner === v },
    { key: 'type', label: 'Tipo de tarea', options: TASK_TYPES.map((t) => [t, t]), test: (r, v) => r.type === v },
    { key: 'priority', label: 'Prioridad', options: PRIORITIES.map(([k, l]) => [k, l]), test: (r, v) => r.priority === v },
    { key: 'status', label: 'Estado', options: TASK_STATUSES.map(([k, l]) => [k, l]), test: (r, v) => r.status === v },
  ],
  columns: [
    { key: 'done', label: 'Hecha', text: (r) => (r.status === 'done' ? 'Sí' : 'No'), render: (r) => `<input type="checkbox" class="task-done" data-id="${r.id}" ${r.status === 'done' ? 'checked' : ''} aria-label="Marcar como completada" />` },
    { key: 'name', label: 'Título', render: (r) => `<a href="./record/?id=${r.id}" class="${r.status === 'done' ? 'is-done' : ''}">${r.name}</a>` },
    { key: 'contact', label: 'Contacto asociado', render: (r) => (r.contact ? link(`../contacts/record/?id=${r.contactId}`, r.contact) : '<span class="muted">—</span>') },
    { key: 'due', label: 'Fecha de vencimiento', text: (r) => formatDate(r.due), sortValue: (r) => new Date(r.due).getTime(), render: (r) => `<span class="${pending(r) ? dueClass(r) : ''}" title="${pending(r) ? dueText(r) : 'Completada'}">${formatDate(r.due)}</span>` },
    { key: 'type', label: 'Tipo de tarea' },
    { key: 'priority', label: 'Prioridad', text: (r) => labelOf(PRIORITIES, r.priority), render: (r) => tag(labelOf(PRIORITIES, r.priority), classOf(PRIORITIES, r.priority)) },
    { key: 'status', label: 'Estado', text: (r) => labelOf(TASK_STATUSES, r.status), render: (r) => tag(labelOf(TASK_STATUSES, r.status), classOf(TASK_STATUSES, r.status)) },
    { key: 'owner', label: 'Asignada a', render: (r) => ownerHtml(r.owner) },
    { key: 'created', label: 'Fecha de creación', default: false, text: (r) => formatDate(r.created), sortValue: (r) => new Date(r.created).getTime() },
  ],
  createFields: [
    { name: 'name', label: 'Título', required: true },
    { name: 'type', label: 'Tipo de tarea', type: 'select', options: TASK_TYPES.map((t) => [t, t]) },
    { name: 'due', label: 'Fecha de vencimiento', type: 'date' },
    { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES.map(([k, l]) => [k, l]) },
    { name: 'contactId', label: 'Contacto asociado', type: 'select', options: [['', 'Ninguno'], ...allContacts().slice(0, 30).map((c) => [c.id, c.name])] },
    { name: 'owner', label: 'Asignada a', type: 'select', options: OWNERS.map((o) => [o, o]) },
  ],
  normalize: (d) => ({
    ...d,
    status: 'todo',
    contact: (allContacts().find((c) => String(c.id) === String(d.contactId)) || {}).name || '',
    due: d.due ? new Date(d.due).toISOString() : TODAY.toISOString(),
    lastActivity: TODAY.toISOString(),
  }),
  onRender: (rows) => {
    queueable = rows.filter(pending);
    const b = $('start-queue');
    if (b) {
      b.textContent = queueable.length ? `Iniciar ${queueable.length} ${queueable.length === 1 ? 'tarea' : 'tareas'}` : 'Iniciar tareas';
      b.disabled = queueable.length === 0;
    }
    renderQueueBanner();
  },
  onAction: (a) => {
    if (a === 'start-queue') {
      if (!queueable.length) { toast('No hay tareas pendientes en esta vista'); return; }
      const tab = document.querySelector('.views__tab.is-active');
      const q = startQueue(queueable.map((r) => r.id), tab ? tab.textContent.trim() : 'Tareas');
      renderQueueBanner();
      goTo(targetFor(queueTask(q), '../'));
    } else if (a === 'queue-continue') {
      const q = activeQueue();
      if (q && !queueFinished(q)) goTo(targetFor(queueTask(q), '../'));
    } else if (a === 'queue-exit') {
      endQueue();
      renderQueueBanner();
      toast('Saliste de la cola de tareas');
    }
  },
});

// A queue already in progress is offered again here (as the original keeps it until you leave it).
$('views-bar').insertAdjacentHTML('afterend', '<div class="tq-banner" id="tq-banner" hidden></div>');
function renderQueueBanner() {
  const el = $('tq-banner');
  if (!el) return; // first render happens before the banner exists
  const q = activeQueue();
  if (!q) { el.hidden = true; el.innerHTML = ''; return; }
  const t = queueTask(q);
  el.hidden = false;
  el.innerHTML = queueFinished(q)
    ? `<span class="tq-banner__text"><strong>Cola terminada</strong> · ${queueSummary(q)} (${q.label}).</span><button class="link-btn" type="button" data-action="queue-exit">Cerrar</button>`
    : `<span class="tq-banner__text"><strong>Cola en curso:</strong> tarea ${queueSummary(q)} (${q.label}). Siguiente: ${t ? `<a href="../tasks/record/?id=${t.id}">${t.name}</a> · <span class="${dueClass(t)}">${dueText(t)}</span>` : '—'}</span>
       <button class="btn btn--primary btn--sm" type="button" data-action="queue-continue">Continuar la cola</button>
       <button class="link-btn" type="button" data-action="queue-exit">Salir de la cola</button>`;
}
renderQueueBanner();

document.getElementById('rows').addEventListener('change', (e) => {
  const cb = e.target.closest('.task-done');
  if (!cb) return;
  completeTask(cb.dataset.id, cb.checked);
  toast(cb.checked ? 'Tarea completada' : 'Tarea reabierta');
  list.render();
});

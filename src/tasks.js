import { boot } from './page.js';
import { mountList, tag, link, ownerHtml } from './list.js';
import { toast } from './shell.js';
import { allTasks, allContacts, TASK_STATUSES, TASK_TYPES, PRIORITIES, OWNERS, formatDate, labelOf, classOf, setField, TODAY } from './data.js';

boot({ root: '../', active: 'crm', sub: 'Tareas', title: 'Tareas' });

const days = (iso) => (TODAY - new Date(iso)) / 86400000;

const list = mountList({
  type: 'tasks',
  title: 'Tareas',
  singular: 'Tarea',
  plural: 'tareas',
  addLabel: 'Agregar tareas',
  createLabel: 'Crear tarea',
  // Metrics card above the table ("Mostrar métricas" in the gear menu); hidden until the person turns it on.
  metricsDefault: false,
  summary: (rows) => {
    const todo = rows.filter((r) => r.status !== 'done');
    const sameDay = (iso) => iso && new Date(iso).toDateString() === TODAY.toDateString();
    const n = (f) => String(rows.filter(f).length);
    return [
      ['Tareas pendientes', String(todo.length), 'Tareas que todavía no se han completado.'],
      ['Vencidas', String(todo.filter((r) => r.due && new Date(r.due) < TODAY && !sameDay(r.due)).length), 'Tareas pendientes cuya fecha de vencimiento ya pasó.'],
      ['Para hoy', String(todo.filter((r) => sameDay(r.due)).length), 'Tareas pendientes que vencen hoy.'],
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
    { key: 'today', label: 'Para hoy', filter: (r) => r.status !== 'done' && Math.floor(days(r.due)) === 0 },
    { key: 'overdue', label: 'Atrasadas', filter: (r) => r.status !== 'done' && days(r.due) > 0 },
    { key: 'upcoming', label: 'Próximas', filter: (r) => r.status !== 'done' && days(r.due) < 0 },
    { key: 'done', label: 'Completadas', filter: (r) => r.status === 'done' },
  ],
  filters: [
    { key: 'owner', label: 'Asignada a', options: OWNERS.map((o) => [o, o]), test: (r, v) => r.owner === v },
    { key: 'type', label: 'Tipo de tarea', options: TASK_TYPES.map((t) => [t, t]), test: (r, v) => r.type === v },
    { key: 'priority', label: 'Prioridad', options: PRIORITIES.map(([k, l]) => [k, l]), test: (r, v) => r.priority === v },
    { key: 'status', label: 'Estado', options: TASK_STATUSES.map(([k, l]) => [k, l]), test: (r, v) => r.status === v },
  ],
  columns: [
    { key: 'done', label: 'Hecha', text: (r) => (r.status === 'done' ? 'Sí' : 'No'), render: (r) => `<input type="checkbox" class="task-done" data-id="${r.id}" ${r.status === 'done' ? 'checked' : ''} aria-label="Marcar como completada" />` },
    { key: 'name', label: 'Título', render: (r) => `<a href="./record/?id=${r.id}" class="${r.status === 'done' ? 'is-done' : ''}">${r.name}</a>` },
    { key: 'contact', label: 'Contacto asociado', render: (r) => (r.contact ? link(`../contacts/record/?id=${r.contactId}`, r.contact) : '<span class="muted">—</span>') },
    { key: 'due', label: 'Fecha de vencimiento', text: (r) => formatDate(r.due), sortValue: (r) => new Date(r.due).getTime(), render: (r) => `<span class="${r.status !== 'done' && days(r.due) > 0 ? 'is-overdue' : ''}">${formatDate(r.due)}</span>` },
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
});

document.getElementById('rows').addEventListener('change', (e) => {
  const cb = e.target.closest('.task-done');
  if (!cb) return;
  setField('tasks', cb.dataset.id, 'status', cb.checked ? 'done' : 'todo');
  toast(cb.checked ? 'Tarea completada' : 'Tarea reabierta');
  list.render();
});

import { mountTaskAssociations, logTaskAssociations } from './task-associations.js';
import './filter-chip.js';
import { taskQueues, loadTaskQueues, saveTaskQueue, deleteTaskQueue } from './task-queues.js';
import { assignTaskQueue } from './data.js';
import { boot } from './page.js';
import { mountList, tag, link, ownerHtml } from './list.js';
import { toast } from './shell.js';
import { allTasks, TASK_STATUSES, TASK_TYPES, PRIORITIES, OWNERS, formatDate, labelOf, classOf, TODAY, RECUR_OPTIONS, recurLabel, normalizeRecur } from './data.js';
import { startQueue, activeQueue, endQueue, queueTask, queueFinished, queueSummary, targetFor, goTo, dueMatches, dueText, dueClass, DUE_OPTIONS, dayDiff, completeTask } from './task-queue.js';
import { REMINDER_OPTIONS, defaultReminderOption, reminderFromDue, reminderText } from './task-reminders.js';
// «Recordatorio» of the create drawer: the default from Ajustes first, the other presets, or a custom date-time.
const reminderChoices = () => { const def = defaultReminderOption(); return [[def, `${def} (predeterminado)`], ...REMINDER_OPTIONS.filter((o) => o !== def).map((o) => [o, o]), ['custom', 'Fecha y hora personalizadas']]; };

boot({ root: '../', active: 'crm', sub: 'Tareas', title: 'Tareas' });

const $ = (id) => document.getElementById(id);
const pending = (r) => r.status !== 'done';
let selectedQueue = '';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let queuesError = '';
try { await loadTaskQueues(); } catch (e) { queuesError = 'No se pudieron cargar las colas. Comprueba la migración task_queues y tus permisos.'; }
let queueable = []; // pending tasks of the current view, in its order: what "Iniciar N tareas" works through

let associationPicker;
const list = mountList({
  waitForCreateSave: true,
  afterCreate: logTaskAssociations,
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
      ['Asignada a', r.owner, 'user'],
    ],
    sub: (r) => (r.contact ? { name: r.contact, href: `../contacts/record/?id=${r.contactId}` } : null),
  },
  editors: {
    status: TASK_STATUSES.map(([k, l]) => [k, l]),
    priority: PRIORITIES.map(([k, l]) => [k, l]),
    owner: OWNERS.map((o) => [o, o]),
    type: TASK_TYPES.map((t) => [t, t]),
  },
  readOnly: ['done', 'contact', 'queueId', 'hs_queue_membership_ids', 'reminderAt', 'recur'],
  previewFields: ['status', 'type', 'due', 'priority', 'contact', 'owner', 'queueId', 'created'],
  searchPlaceholder: 'Buscar tarea, contacto...',
  searchKeys: ['name', 'contact', 'owner', 'type'],
  rows: () => allTasks().filter(r => !selectedQueue || (selectedQueue === 'none' ? !r.queueId : r.queueId === selectedQueue)),
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
    { key: 'name', label: 'Título', render: (r) => `<a href="./record/?id=${r.id}" class="${r.status === 'done' ? 'is-done' : ''}">${esc(r.name)}</a>` },
    { key: 'done', label: 'Hecha', text: (r) => (r.status === 'done' ? 'Sí' : 'No'), render: (r) => `<input type="checkbox" class="task-done" data-id="${r.id}" ${r.status === 'done' ? 'checked' : ''} aria-label="Marcar como completada" />` },
    { key: 'contact', label: 'Contacto asociado', render: (r) => (r.contact ? link(`../contacts/record/?id=${r.contactId}`, r.contact) : '<span class="muted">—</span>') },
    { key: 'due', label: 'Fecha de vencimiento', text: (r) => formatDate(r.due), sortValue: (r) => new Date(r.due).getTime(), render: (r) => `<span class="${pending(r) ? dueClass(r) : ''}" title="${pending(r) ? dueText(r) : 'Completada'}">${formatDate(r.due)}</span>` },
    { key: 'type', label: 'Tipo de tarea' },
    { key: 'priority', label: 'Prioridad', text: (r) => labelOf(PRIORITIES, r.priority), render: (r) => tag(labelOf(PRIORITIES, r.priority), classOf(PRIORITIES, r.priority)) },
    { key: 'status', label: 'Estado', text: (r) => labelOf(TASK_STATUSES, r.status), render: (r) => tag(labelOf(TASK_STATUSES, r.status), classOf(TASK_STATUSES, r.status)) },
    { key: 'owner', label: 'Asignada a', render: (r) => ownerHtml(r.owner) },
    { key: 'queueId', label: 'Cola', text: r => taskQueues().find(q => q.id === r.queueId)?.name || 'Sin cola', render: r => esc(taskQueues().find(q => q.id === r.queueId)?.name || 'Sin cola') },
    { key: 'reminderAt', label: 'Recordatorio', default: false, text: (r) => (r.reminderAt ? `${reminderText(r.reminderAt)}${r.reminderFiredAt ? ' · avisado' : ''}` : '—'), sortValue: (r) => (r.reminderAt ? new Date(r.reminderAt).getTime() : 0) },
    { key: 'created', label: 'Fecha de creación', default: false, text: (r) => formatDate(r.created), sortValue: (r) => new Date(r.created).getTime() },
    // «Repetir»: the recurrence (daily / weekly / monthly / yearly) that spawns the next task when this one is done.
    { key: 'recur', label: 'Repetir', default: false, text: (r) => recurLabel(r), sortValue: (r) => RECUR_OPTIONS.findIndex(([k]) => k === ((r.recur && r.recur.freq) || '')) },
  ],
  createFields: [
    { name: 'name', label: 'Título', required: true },
    { name: 'type', label: 'Tipo de tarea', type: 'select', options: TASK_TYPES.map((t) => [t, t]) },
    { name: 'due', label: 'Fecha de vencimiento', type: 'date' },
    { name: 'recur', label: 'Repetir', type: 'select', options: RECUR_OPTIONS },
    { name: 'reminder', label: 'Recordatorio', type: 'select', options: reminderChoices() },
    { name: 'reminderAt', label: 'Recordatorio personalizado (fecha y hora)', type: 'datetime-local' },
    { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES.map(([k, l]) => [k, l]) },
    { name: 'owner', label: 'Asignada a', type: 'select', options: OWNERS.map((o) => [o, o]) },
  ],
  normalize: ({ reminder, reminderAt, ...d }) => {
    const due = d.due ? new Date(d.due).toISOString() : TODAY.toISOString();
    return {
      ...d,
      recur: normalizeRecur(d.recur),
      status: 'todo',
      ...associationPicker.build(),
      due,
      // The reminder's date-time is stored on the task: a preset relative to the due date, or the custom pick.
      reminderAt: reminder === 'custom' ? (reminderAt ? new Date(reminderAt).toISOString() : '') : reminderFromDue(due, reminder || defaultReminderOption()),
      lastActivity: TODAY.toISOString(),
    };
  },
  onRender: (rows) => {
    queueable = rows.filter(pending);
    const b = $('start-queue');
    if (b) {
      b.textContent = queueable.length ? `Iniciar ${queueable.length} ${queueable.length === 1 ? 'tarea' : 'tareas'}` : 'Iniciar tareas';
      b.disabled = queueable.length === 0;
    }
    renderQueueBanner();
    updateQueueAssignment();
  },
  onAction: (a) => {
    if (a === 'start-queue') {
      if (!queueable.length) { toast('No hay tareas pendientes en esta vista'); return; }
      const tab = document.querySelector('.views__tab.is-active');
      const q = startQueue(queueable.map((r) => r.id), taskQueues().find(q => q.id === selectedQueue)?.name || (tab ? tab.textContent.trim() : 'Tareas'));
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

associationPicker = mountTaskAssociations($('create-form'));

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
    ? `<span class="tq-banner__text"><strong>Cola terminada</strong> · ${queueSummary(q)} (${esc(q.label)}).</span><button class="link-btn" type="button" data-action="queue-exit">Cerrar</button>`
    : `<span class="tq-banner__text"><strong>Cola en curso:</strong> tarea ${queueSummary(q)} (${esc(q.label)}). Siguiente: ${t ? `<a href="../tasks/record/?id=${t.id}">${t.name}</a> · <span class="${dueClass(t)}">${dueText(t)}</span>` : '—'}</span>
       <button class="btn btn--primary btn--sm" type="button" data-action="queue-continue">Continuar la cola</button>
       <button class="link-btn" type="button" data-action="queue-exit">Salir de la cola</button>`;
}
renderQueueBanner();

document.getElementById('rows').addEventListener('change', (e) => {
  const cb = e.target.closest('.task-done');
  if (!cb) return;
  // The shared task status writer resumes linked sequences after the save succeeds.
  completeTask(cb.dataset.id, cb.checked);
  toast(cb.checked ? 'Tarea completada' : 'Tarea reabierta');
  list.render();
});

// Keep queue controls local so renamed options refresh without rebuilding the list.
const controls = document.createElement('div');
controls.className = 'task-queue-controls';
controls.setAttribute('aria-label', 'Colas de tareas');
$('filter-bar').prepend(controls);
document.querySelector('#bulk .bulk__actions').insertAdjacentHTML('beforeend', '<button type="button" class="bulk__btn" id="assign-named-queue">Asignar seleccionadas a esta cola</button>');
let queueBusy = false;
function updateQueueAssignment() {
  const button = $('assign-named-queue');
  if (!button) return;
  button.disabled = queueBusy || !selectedQueue || !!queuesError;
  button.textContent = selectedQueue === 'none' ? 'Quitar cola de seleccionadas' : 'Asignar seleccionadas a esta cola';
}
function renderQueueControls() {
  const current = taskQueues().find(q => q.id === selectedQueue);
  controls.innerHTML = queuesError ? `<span role="alert">${esc(queuesError)}</span>` : `
    <filter-chip id="named-queue-filter" aria-label="Cola"><template><option value="">Todas las colas</option><option value="none" ${selectedQueue === 'none' ? 'selected' : ''}>Sin cola</option>${taskQueues().map(q => `<option value="${esc(q.id)}" ${selectedQueue === q.id ? 'selected' : ''}>${esc(q.name)}</option>`).join('')}</template></filter-chip>
    <details class="task-queue-menu">
      <summary class="qchip">Administrar colas <span class="caret" aria-hidden="true"></span></summary>
      <div class="task-queue-menu__panel">
        <form id="queue-name-form">
          <label for="queue-name">Nombre de cola</label>
          <input id="queue-name" name="queueName" maxlength="100" required value="${esc(current?.name || '')}">
          <button class="btn btn--sm" type="submit">Crear cola</button>
          <button class="btn btn--sm" type="button" id="rename-queue" ${!current ? 'disabled' : ''}>Renombrar</button>
        </form>
        <button class="btn btn--sm" type="button" id="delete-named-queue" ${!current ? 'disabled' : ''}>Eliminar cola</button>
      </div>
    </details>`;
  updateQueueAssignment();
}
async function queueAction(action) {
  if (queueBusy) return;
  queueBusy = true;
  controls.querySelectorAll('button, input').forEach(b => { b.disabled = true; });
  updateQueueAssignment();
  try { await action(); list.state.page = 1; list.render(); }
  catch (e) { toast(e.message || 'No se pudo guardar la cola'); }
  finally { queueBusy = false; renderQueueControls(); }
}
controls.addEventListener('change', e => {
  if (e.target.id !== 'named-queue-filter') return;
  selectedQueue = e.target.value;
  // Preserve selection so tasks can be assigned to an empty or newly created queue.
  list.state.page = 1;
  list.render();
  renderQueueControls();
  $('named-queue-filter')?.querySelector('.qchip')?.focus();
});
controls.addEventListener('submit', e => {
  e.preventDefault();
  const name = controls.querySelector('input').value;
  queueAction(async () => { await saveTaskQueue(name); toast('Cola creada'); });
});
controls.addEventListener('click', e => {
  const id = e.target.id;
  const queueId = selectedQueue;
  if (id === 'rename-queue') {
    if (!$('queue-name-form').reportValidity()) return;
    const name = controls.querySelector('input').value;
    queueAction(async () => { await saveTaskQueue(name, queueId); toast('Cola renombrada'); });
  } else if (id === 'delete-named-queue') {
    if (!window.confirm('¿Eliminar esta cola? Sus tareas se conservarán sin cola.')) return;
    queueAction(async () => { await deleteTaskQueue(queueId); selectedQueue = ''; toast('Cola eliminada'); });
  }
});
$('assign-named-queue').addEventListener('click', () => {
  const ids = [...list.state.selected];
  if (!ids.length || !selectedQueue) return;
  const queueId = selectedQueue === 'none' ? null : selectedQueue;
  queueAction(async () => { await assignTaskQueue(ids, queueId); list.state.selected.clear(); toast('Cola asignada'); });
});
document.addEventListener('click', e => {
  if (!controls.contains(e.target)) controls.querySelector('details')?.removeAttribute('open');
});
controls.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    controls.querySelector('details')?.removeAttribute('open');
    controls.querySelector('summary')?.focus();
  }
});
renderQueueControls();

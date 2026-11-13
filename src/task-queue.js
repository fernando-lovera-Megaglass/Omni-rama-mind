// Task queue (the original's "Comenzar N tareas"): the person works the tasks of a view one by one.
// The queue lives in localStorage (crm:taskqueue) so it survives moving between record pages. Each task
// opens the record it is associated with (or its own page when it has none) with a bar on top: position in
// the queue, the task's details, Omitir, Completar y siguiente and Salir de la cola. The due-date buckets
// here are shared by the list's quick filter and by the bar.
import { findRecord, setField, formatDate, labelOf, PRIORITIES, TODAY } from './data.js';
import { toast } from './shell.js';

const KEY = 'crm:taskqueue';
const DAY = 86400000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const write = (q) => { if (q) localStorage.setItem(KEY, JSON.stringify(q)); else localStorage.removeItem(KEY); };
// Page changes go through here so tests can watch them instead of navigating.
let navigate = (href) => { location.href = href; };
export const setNavigator = (fn) => { navigate = fn; };
export const goTo = (href) => navigate(href);

// ---------- due dates ----------
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
// Whole days between the task's due date and today (negative = overdue, 0 = today, null = no date).
export const dayDiff = (iso) => (iso ? Math.round((startOfDay(iso) - startOfDay(TODAY)) / DAY) : null);
export const DUE_OPTIONS = [['overdue', 'Vencidas'], ['today', 'Hoy'], ['tomorrow', 'Mañana'], ['week', 'Esta semana'], ['next7', 'Próximos 7 días'], ['later', 'Más adelante'], ['none', 'Sin fecha']];
export function dueMatches(task, bucket) {
  const d = dayDiff(task.due);
  if (bucket === 'none') return d === null;
  if (d === null) return false;
  if (bucket === 'overdue') return d < 0;
  if (bucket === 'today') return d === 0;
  if (bucket === 'tomorrow') return d === 1;
  if (bucket === 'week') { const dow = (new Date(TODAY).getDay() + 6) % 7; return d >= -dow && d <= 6 - dow; } // Monday to Sunday
  if (bucket === 'next7') return d >= 1 && d <= 7;
  if (bucket === 'later') return d > 7;
  return true;
}
export function dueText(task) {
  const d = dayDiff(task.due);
  if (d === null) return 'Sin fecha de vencimiento';
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  if (d === -1) return 'Venció ayer';
  if (d < 0) return `Venció hace ${-d} días`;
  if (d <= 7) return `Vence en ${d} días`;
  return `Vence el ${formatDate(task.due)}`;
}
export const dueClass = (task) => { const d = dayDiff(task.due); return d === null ? '' : d < 0 ? 'is-overdue' : d === 0 ? 'is-today' : ''; };
export const TYPE_ICONS = { Llamada: '📞', Correo: '✉', Tarea: '☑' };

// ---------- queue state ----------
export function activeQueue() {
  const q = read();
  return q && Array.isArray(q.ids) && q.ids.length ? q : null;
}
export function startQueue(ids, label = 'Tareas') {
  const q = { ids: ids.map(Number), index: 0, label, done: [], skipped: [], startedAt: new Date().toISOString() };
  write(q);
  return q;
}
export function endQueue() {
  write(null);
}
export function saveQueue(q) {
  write(q);
}
export const queueFinished = (q) => !q || q.index >= q.ids.length;
export function queueTask(q = activeQueue()) {
  if (queueFinished(q)) return null;
  return findRecord('tasks', q.ids[q.index]) || null;
}
// Where a task is worked: the record it is associated with, or its own page.
export function targetFor(task, root = '../') {
  if (!task) return `${root}tasks/`;
  return task.contactId ? `${root}contacts/record/?id=${task.contactId}&task=${task.id}` : `${root}tasks/record/?id=${task.id}`;
}
export function completeTask(id, done = true) {
  setField('tasks', id, 'status', done ? 'done' : 'todo');
  setField('tasks', id, 'completedAt', done ? new Date().toISOString() : '');
}
function step(q, outcome) {
  const id = q.ids[q.index];
  q.done = (q.done || []).filter((x) => x !== id);
  q.skipped = (q.skipped || []).filter((x) => x !== id);
  if (outcome) q[outcome].push(id);
  q.index += 1;
  write(q);
}
export function completeCurrent(q = activeQueue()) {
  if (queueFinished(q)) return q;
  completeTask(q.ids[q.index], true);
  step(q, 'done');
  return q;
}
export function skipCurrent(q = activeQueue()) {
  if (queueFinished(q)) return q;
  step(q, 'skipped');
  return q;
}
export function moveTo(q, index) {
  q.index = Math.max(0, Math.min(q.ids.length, index));
  write(q);
  return q;
}
// A new queue with the tasks that were skipped (from the "Cola terminada" bar).
export function requeueSkipped(q = activeQueue()) {
  const ids = (q?.skipped || []).filter((id) => { const t = findRecord('tasks', id); return t && t.status !== 'done'; });
  if (!ids.length) { endQueue(); return null; }
  return startQueue(ids, `${q.label} · omitidas`);
}
export const queueSummary = (q) => (q ? `${q.index >= q.ids.length ? q.ids.length : q.index + 1} de ${q.ids.length} · ${(q.done || []).length} completada${(q.done || []).length === 1 ? '' : 's'}` : '');

// Does this page already show the task's target (its contact, or the task itself)?
function samePage(task) {
  const here = new URL(location.href);
  const id = here.searchParams.get('id');
  const page = (kind) => new RegExp(`/${kind}/record/(index\\.html)?$`).test(here.pathname);
  if (page('tasks') && String(id) === String(task.id)) return true;
  return Boolean(task.contactId) && page('contacts') && String(id) === String(task.contactId);
}

// ---------- the bar on record pages ----------
export function mountQueueBar({ container, root = '../../', onChange } = {}) {
  if (!container) return { refresh() {} };
  function refresh() {
    const q = activeQueue();
    if (!q) { container.innerHTML = ''; container.hidden = true; return; }
    container.hidden = false;
    const n = q.ids.length;
    const done = (q.done || []).length;
    const skipped = (q.skipped || []).length;
    const pct = Math.round((Math.min(q.index, n) / n) * 100);
    if (queueFinished(q)) {
      container.className = 'tq tq--finished';
      container.innerHTML = `
        <div class="tq__pos"><strong>Cola terminada</strong><div class="tq__bar"><span style="width:100%"></span></div></div>
        <div class="tq__task"><span class="tq__title">✓ Completaste ${done} de ${n} ${n === 1 ? 'tarea' : 'tareas'}${skipped ? ` · ${skipped} omitida${skipped === 1 ? '' : 's'}` : ''}</span><span class="tq__meta"><span>Cola: ${esc(q.label)}</span></span></div>
        <div class="tq__actions">
          ${skipped ? `<button class="btn btn--outline btn--sm" type="button" data-tq="requeue">Trabajar las omitidas (${skipped})</button>` : ''}
          <a class="btn btn--primary btn--sm" href="${root}tasks/" data-tq="back">Volver a tareas</a>
          <button class="link-btn" type="button" data-tq="exit">Salir de la cola</button>
        </div>`;
      return;
    }
    const t = queueTask(q);
    if (!t) { step(q, null); refresh(); return; } // the task was deleted: move on
    const here = samePage(t);
    const isDone = t.status === 'done';
    const last = q.index === n - 1;
    container.className = `tq${isDone ? ' tq--done' : ''}`;
    container.innerHTML = `
      <div class="tq__pos"><strong>Tarea ${q.index + 1} de ${n}</strong><div class="tq__bar"><span style="width:${pct}%"></span></div><span class="muted">${done} completada${done === 1 ? '' : 's'}${skipped ? ` · ${skipped} omitida${skipped === 1 ? '' : 's'}` : ''}</span></div>
      <div class="tq__task">
        <span class="tq__title"><span class="tq__ico" aria-hidden="true">${TYPE_ICONS[t.type] || '☑'}</span><a href="${root}tasks/record/?id=${t.id}" class="${isDone ? 'is-done' : ''}">${esc(t.name)}</a>${isDone ? '<span class="tag tag--done">Completada</span>' : ''}</span>
        <span class="tq__meta"><span class="${dueClass(t)}">${esc(dueText(t))}</span><span>${esc(t.type)}</span><span>Prioridad ${esc(labelOf(PRIORITIES, t.priority)).toLowerCase()}</span><span>Asignada a ${esc(t.owner || 'Sin asignar')}</span>${t.contact ? `<span>Contacto: ${here ? esc(t.contact) : `<a href="${root}contacts/record/?id=${t.contactId}">${esc(t.contact)}</a>`}</span>` : ''}<span class="muted">Cola: ${esc(q.label)}</span></span>
      </div>
      <div class="tq__actions">
        ${here ? '' : `<a class="btn btn--outline btn--sm" href="${targetFor(t, root)}">Ir a la tarea</a>`}
        <button class="tq__nav" type="button" data-tq="prev" aria-label="Tarea anterior" ${q.index === 0 ? 'disabled' : ''}>‹</button>
        <button class="btn btn--ghost btn--sm" type="button" data-tq="skip">Omitir</button>
        <button class="btn btn--primary btn--sm" type="button" data-tq="complete">${isDone ? (last ? 'Terminar' : 'Siguiente') : last ? 'Completar y terminar' : 'Completar y siguiente'}</button>
        <button class="tq__nav" type="button" data-tq="next" aria-label="Tarea siguiente">›</button>
        <button class="link-btn" type="button" data-tq="exit">Salir de la cola</button>
      </div>`;
  }
  function go(q) {
    const t = queueTask(q);
    if (t && !samePage(t)) navigate(targetFor(t, root));
    refresh();
    if (onChange) onChange();
  }
  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tq]');
    if (!b) return;
    const act = b.dataset.tq;
    if (act === 'back') { endQueue(); return; } // the link itself navigates
    e.preventDefault();
    const q = activeQueue();
    if (!q) { refresh(); return; }
    if (act === 'exit') { endQueue(); refresh(); toast('Saliste de la cola de tareas'); if (onChange) onChange(); return; }
    if (act === 'complete') { const wasDone = queueTask(q)?.status === 'done'; completeCurrent(q); if (!wasDone) toast('Tarea completada'); go(q); return; }
    if (act === 'skip') { skipCurrent(q); go(q); return; }
    if (act === 'prev') { moveTo(q, q.index - 1); go(q); return; }
    if (act === 'next') { moveTo(q, q.index + 1); go(q); return; }
    if (act === 'requeue') { const nq = requeueSkipped(q); if (nq) go(nq); else refresh(); }
  });
  refresh();
  return { refresh };
}

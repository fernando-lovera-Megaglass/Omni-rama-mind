import { toast, recordToastAction } from './shell.js';
import { addRecord, findRecord, subtasksOf } from './data.js';
import { completeTaskWithLog } from './task-queue.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function mountSubtasks(container, parentId, onChange = () => {}) {
  const parent = findRecord('tasks', parentId);
  if (!parent || parent.parentId) { container.hidden = true; return; }
  container.hidden = false;
  container.className = 'subtasks';
  function render() {
    const children = subtasksOf(parentId);
    const done = children.filter((t) => t.status === 'done').length;
    const total = children.length;
    const current = findRecord('tasks', parentId);
    container.innerHTML = `<h3>Subtareas <span class="subtasks__count">${done}/${total}</span></h3>
      <progress value="${done}" max="${total || 1}" aria-label="Progreso de subtareas" aria-valuetext="${done} de ${total} completadas"></progress>
      <ul>${children.map((t) => `<li><label><input type="checkbox" data-subtask="${t.id}" ${t.status === 'done' ? 'checked' : ''}><span class="${t.status === 'done' ? 'is-done' : ''}">${esc(t.name)}</span></label></li>`).join('')}</ul>
      <form class="subtasks__add"><input name="subtask" aria-label="Nombre de la subtarea" placeholder="Agregar subtarea" required maxlength="500" autocomplete="off"><button class="btn btn--outline btn--sm" type="submit">Agregar</button></form>
      ${total > 0 && done === total && current.status !== 'done' ? '<div class="subtasks__suggestion"><p>Todas las subtareas están completas.</p><button type="button" class="btn btn--primary btn--sm" data-complete-parent>Completar tarea madre</button></div>' : ''}`;
  }
  container.onsubmit = (event) => {
    if (!event.target.matches('.subtasks__add')) return;
    event.preventDefault();
    const input = event.target.elements.subtask;
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const current = findRecord('tasks', parentId);
    const made = addRecord('tasks', { name, parentId: current.id, status: 'todo', type: 'Tarea', priority: current.priority, owner: current.owner, due: current.due, contactId: current.contactId, contact: current.contact });
    toast('Tarea creada', recordToastAction('tasks', made.id));
    render();
    container.querySelector('[name="subtask"]').focus();
  };
  container.onchange = (event) => {
    const checkbox = event.target.closest('[data-subtask]');
    if (!checkbox) return;
    completeTaskWithLog(checkbox.dataset.subtask, checkbox.checked);
    const id = checkbox.dataset.subtask;
    render();
    container.querySelector(`[data-subtask="${id}"]`)?.focus();
  };
  container.onclick = async (event) => {
    if (!event.target.closest('[data-complete-parent]')) return;
    const button = event.target.closest('[data-complete-parent]');
    if (button.disabled) return;
    button.disabled = true;
    const result = completeTaskWithLog(parentId);
    const saved = result instanceof Promise ? await result : result;
    button.disabled = false;
    if (!saved) return;
    render();
    onChange();
  };
  render();
}

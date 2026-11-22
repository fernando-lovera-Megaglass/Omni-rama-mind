import { findRecord, addActivity, addRecord } from './data.js';
import { openLogModal, readLogActivity, selectedActivityAssociations } from './log-modal.js';
import { saveAssociatedActivity } from './activity-associations.js';
import { toast } from './shell.js';

// The same registration form as the record page, scoped to the task's contact.
export function logTaskActivity(task) {
  const contact = task.contactId && findRecord('contacts', task.contactId);
  const type = contact ? 'contacts' : 'tasks';
  const rec = contact || task;
  const kind = task.type === 'Llamada' ? 'call' : 'email';
  const previousFocus = document.activeElement;
  const modal = document.createElement('div');
  modal.className = 'drawer drawer--modal is-open';
  modal.id = 'task-log-modal';
  modal.innerHTML = `<div class="drawer__panel drawer__panel--modal drawer__panel--md" role="dialog" aria-modal="true" aria-labelledby="task-log-title">
    <div class="drawer__head drawer__head--light"><h2 id="task-log-title"></h2><button class="drawer__close" type="button" data-close aria-label="Cerrar">×</button></div>
    <div class="drawer__body"></div><div class="drawer__foot"></div></div>`;
  document.body.append(modal);
  const $ = id => modal.querySelector(`[id="${id}"]`);
  return new Promise(resolve => {
    const close = saved => {
      document.removeEventListener('keydown', onKey);
      modal.remove();
      previousFocus?.focus();
      resolve(saved);
    };
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(false); }
      if (event.key === 'Tab') {
        const inputs = [...modal.querySelectorAll('button, input, select, textarea')].filter(el => !el.disabled && !el.closest('[hidden]'));
        const first = inputs[0], last = inputs.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    openLogModal(kind, { type, rec, $, openModal(title, body, foot) {
      $('task-log-title').textContent = title;
      modal.querySelector('.drawer__body').innerHTML = body;
      modal.querySelector('.drawer__foot').innerHTML = foot;
    } });
    modal.addEventListener('change', event => {
      if (event.target.id === 'log-followup') $('log-followup-row').hidden = !event.target.checked;
    });
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-close]')) { close(false); return; }
      const button = event.target.closest('[data-confirm="logact"]');
      if (!button || button.disabled) return;
      button.disabled = true;
      try {
        const activity = readLogActivity($, kind, rec.name);
        saveAssociatedActivity(activity, { type, id: rec.id, name: rec.name }, selectedActivityAssociations(modal), addActivity);
        if ($('log-followup').checked && $('log-followup-date').value) {
          addRecord('tasks', { name: `Seguimiento de la ${kind === 'call' ? 'llamada' : 'correo'} con ${rec.name}`, type: task.type,
            status: 'todo', priority: 'medium', owner: task.owner, contactId: contact?.id || '', contact: contact?.name || '',
            due: new Date(`${$('log-followup-date').value}T09:00`).toISOString() });
        }
        close(true);
      } catch (error) { button.disabled = false; toast(`No se pudo registrar la actividad: ${error.message}`); }
    });
    $('log-date').focus();
  });
}

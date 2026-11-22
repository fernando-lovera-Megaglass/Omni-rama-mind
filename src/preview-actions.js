// Forms keep their originating record even if another preview is opened meanwhile.
import { openLogModal, readLogActivity, selectedActivityAssociations, attendeeTargets } from './log-modal.js';
import { openCompose } from './compose.js';
import { openCallMenu } from './call.js';
import { createTaskForm } from './task-form.js';
import { saveAssociatedActivity } from './activity-associations.js';
import { addActivity, addRecord, allContacts, ensureAll, setField } from './data.js';
import { taskAssociationFields, logTaskAssociations } from './task-associations.js';
import { toast } from './shell.js';

export function createPreviewActions({ type, singular, refresh }) {
  let modal;
  const open = async (action, rec, anchor) => {
    try {
      await Promise.all(['contacts', 'companies', 'deals', 'tickets'].map(ensureAll));
      const origin = { type, id: rec.id, name: rec.name };
      const addEvent = ev => { addActivity({ ...ev, recordType: type, recordId: rec.id }); refresh(); };
      const contact = type === 'contacts' ? rec : allContacts().find(c => Number(c.id) === Number(rec.contactId));
      if (action === 'email') {
        openCompose({ to: contact?.name || rec.name, email: contact?.email || rec.email || '', company: type === 'companies' ? rec.name : rec.company || '', contactId: contact?.id || '', recordType: type, recordId: rec.id, assoc: [{ label: rec.name, kind: singular, on: true }], onSent: addEvent });
        return;
      }
      if (action === 'call') {
        openCallMenu({ anchor, rec, recordType: type, onCalled: refresh, onAddPhone: value => { setField(type, rec.id, rec.phone ? 'mobilephone' : 'phone', value); refresh(); }, onManualLog: () => open('log-call', rec, anchor) });
        return;
      }
      modal?.remove();
      modal = document.createElement('div');
      modal.className = 'drawer drawer--modal is-open';
      modal.innerHTML = `<div class="drawer__panel drawer__panel--modal drawer__panel--md" role="dialog" aria-modal="true" aria-labelledby="pv-action-title"><div class="drawer__head drawer__head--light"><h2 id="pv-action-title"></h2><button class="drawer__close" type="button" data-close aria-label="Cerrar">×</button></div><div class="drawer__body"></div><div class="drawer__foot"></div></div>`;
      document.body.append(modal);
      const host = modal;
      const $ = id => host.querySelector(`#${id}`);
      const closeModal = () => { host.remove(); anchor?.focus({ preventScroll: true }); };
      const openModal = (title, body, foot = '') => { $('pv-action-title').textContent = title; host.querySelector('.drawer__body').innerHTML = body; host.querySelector('.drawer__foot').innerHTML = foot; };
      const log = (kind, schedule = false, channel = '') => openLogModal(kind, { type, rec, $, openModal, schedule, channel });
      const task = createTaskForm({ type, rec, cfg: { singular, title: r => r.name }, $, openModal, closeModal, addEvent, renderAssoc: refresh });
      host.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeModal(); } });
      host.addEventListener('change', e => { if (e.target.id === 'log-followup') $('log-followup-row').hidden = !e.target.checked; });
      host.addEventListener('click', e => {
        if (e.target === host || e.target.closest('[data-close]')) { closeModal(); return; }
        const more = e.target.closest('[data-log-kind]');
        if (more) { log(more.dataset.logKind, more.dataset.schedule === '1', more.dataset.channel || ''); return; }
        const button = e.target.closest('[data-confirm]');
        if (!button || button.disabled) return;
        if (button.dataset.confirm === 'task-save') { task.saveTaskForm(); return; }
        if (button.dataset.confirm !== 'logact') return;
        const ev = readLogActivity($, button.dataset.kind, rec.name, button.dataset.schedule === '1', button.dataset.channel);
        if (!Number.isFinite(ev.when)) { toast('Selecciona una fecha válida.'); return; }
        if (ev.type === 'note' && !ev.text.trim()) { $('log-notes').focus(); return; }
        button.disabled = true;
        saveAssociatedActivity(ev, origin, [...selectedActivityAssociations(host), ...attendeeTargets(ev.extra)], addActivity);
        if ($('log-followup')?.checked && $('log-followup-date').value) {
          const follow = addRecord('tasks', { name: `Seguimiento con ${rec.name}`, type: ev.type === 'call' ? 'Llamada' : 'Correo', status: 'todo', priority: 'medium', owner: rec.owner, due: new Date(`${$('log-followup-date').value}T09:00`).toISOString(), ...taskAssociationFields(type, rec) });
          logTaskAssociations(follow);
        }
        closeModal(); refresh(); toast('Actividad registrada');
      });
      if (action === 'task') await task.openTaskForm();
      else if (action === 'more') {
        openModal('Registrar actividad', [['call', 'Llamada'], ['email', 'Correo'], ['meeting', 'Reunión'], ['message', 'Mensaje de LinkedIn', 'LinkedIn'], ['message', 'Mensaje de WhatsApp', 'WhatsApp'], ['message', 'SMS', 'SMS']].map(([kind, label, channel = '']) => `<button class="menu__item" type="button" data-log-kind="${kind}" data-channel="${channel}">${label}</button>`).join('') + '<button class="menu__item" type="button" data-log-kind="meeting" data-schedule="1">Programar una reunión</button>');
      } else log(action === 'log-call' ? 'call' : action, action === 'meeting');
      host.querySelector('textarea, input, button')?.focus({ preventScroll: true });
    } catch (error) { toast(`No se pudo abrir la acción: ${error.message}`); }
  };
  return { open };
}

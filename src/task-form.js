import { TODAY, allContacts, TASK_TYPES, PRIORITIES, OWNERS, addRecord, formatDate } from './data.js';
import { taskAssociationFields } from './task-associations.js';
import { REMINDER_OPTIONS, defaultReminderOption, reminderFromDue } from './task-reminders.js';
import { taskQueues, loadTaskQueues } from './task-queues.js';
import { toast, recordToastAction } from './shell.js';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const byId = (rows, id) => rows.find(r => Number(r.id) === Number(id));
export function createTaskForm({ type, rec, cfg, $, openModal, closeModal, addEvent, renderAssoc }) {
const pad2 = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// What ties the new task to this record (its own key + assoc_<kind>, like the bulk action) plus the contact /
// company the record implies, as the quick action always did.
function taskLinksForRecord() {
  const links = { ...taskAssociationFields(type, rec) };
  if (type !== 'contacts' && rec.contactId) { const c = byId(allContacts(), rec.contactId); links.contactId = rec.contactId; links.contact = (c && c.name) || rec.contact || ''; }
  if (type === 'contacts' && rec.companyId) { links.companyId = rec.companyId; links.company = rec.company || ''; }
  return links;
}
async function openTaskForm() {
  try { await loadTaskQueues(); } catch { /* the queues already loaded (or none) are offered */ }
  const name = cfg.title(rec);
  const due = new Date(TODAY.getTime() + 3 * 86400000);
  const def = defaultReminderOption();
  const reminders = [[def, `${def} (predeterminado)`], ...REMINDER_OPTIONS.filter((o) => o !== def).map((o) => [o, o]), ['custom', 'Fecha y hora personalizadas']];
  const queues = taskQueues() || [];
  const links = taskLinksForRecord();
  const extraAssoc = [
    type !== 'contacts' && links.contactId ? `<label class="log-follow"><input type="checkbox" checked disabled /> contacto: ${esc(links.contact || links.contactId)}</label>` : '',
    type === 'contacts' && links.companyId ? `<label class="log-follow"><input type="checkbox" checked disabled /> empresa: ${esc(links.company || links.companyId)}</label>` : '',
  ].join('');
  openModal('Crear tarea', `<form id="task-form" novalidate>
      <label class="field"><span>Título <abbr class="snp__req" title="Obligatorio">*</abbr></span><input id="tf-name" type="text" value="Seguimiento con ${esc(name)}" maxlength="120" required /></label>
      <label class="field"><span>Notas</span><textarea id="tf-notes" rows="3" placeholder="¿De qué trata la tarea?"></textarea></label>
      <div class="adv-row adv-row--two"><label class="field"><span>Tipo de tarea</span><select id="tf-type">${TASK_TYPES.map((t) => `<option value="${esc(t)}" ${t === 'Tarea' ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><label class="field"><span>Prioridad</span><select id="tf-priority">${PRIORITIES.map(([k, l]) => `<option value="${esc(k)}" ${k === 'medium' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
      <div class="adv-row adv-row--two"><label class="field"><span>Fecha de vencimiento</span><input id="tf-date" type="date" value="${localDate(due)}" /></label><label class="field"><span>Hora</span><input id="tf-time" type="time" value="09:00" /></label></div>
      <div class="adv-row adv-row--two"><label class="field"><span>Recordatorio por correo</span><select id="tf-reminder">${reminders.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label><label class="field" id="tf-reminder-custom" hidden><span>Fecha y hora del recordatorio</span><input id="tf-reminder-at" type="datetime-local" /></label></div>
      <div class="adv-row adv-row--two"><label class="field"><span>Cola</span><select id="tf-queue"><option value="">Sin cola</option>${queues.map((q) => `<option value="${esc(q.id)}">${esc(q.name)}</option>`).join('')}</select></label><label class="field"><span>Asignada a</span><select id="tf-owner">${OWNERS.map((o) => `<option value="${esc(o)}" ${o === (rec.owner && rec.owner !== 'Sin asignar' ? rec.owner : 'Fernando L.') ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label></div>
      <fieldset><legend>Asociado a</legend><label class="log-follow"><input type="checkbox" checked disabled /> ${esc(cfg.singular)}: ${esc(name)} (registro actual)</label>${extraAssoc}</fieldset>
      <div class="snp__error" id="tf-err" hidden></div>
    </form>`, '<button class="btn btn--primary" type="button" data-confirm="task-save">Crear tarea</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>');
  $('tf-reminder').addEventListener('change', () => { $('tf-reminder-custom').hidden = $('tf-reminder').value !== 'custom'; });
  $('task-form').addEventListener('submit', (e) => { e.preventDefault(); const b = $('task-form').closest('[role="dialog"]').querySelector('[data-confirm="task-save"]'); if (b) b.click(); });
  setTimeout(() => { const i = $('tf-name'); if (i) { i.focus(); i.select(); } }, 30);
}
// Reads the form and creates the task (only now): timeline entry and the toast with «Ver registro», as before.
function saveTaskForm() {
  const name = ($('tf-name').value || '').trim();
  if (!name) { const err = $('tf-err'); err.textContent = 'Escribe el título de la tarea.'; err.hidden = false; $('tf-name').focus(); return null; }
  const picked = new Date(`${$('tf-date').value || localDate(new Date(TODAY.getTime() + 3 * 86400000))}T${$('tf-time').value || '09:00'}`);
  const dueIso = Number.isNaN(picked.getTime()) ? new Date(TODAY.getTime() + 3 * 86400000).toISOString() : picked.toISOString();
  const reminder = $('tf-reminder').value;
  const reminderAt = reminder === 'custom' ? ($('tf-reminder-at').value ? new Date($('tf-reminder-at').value).toISOString() : '') : reminderFromDue(dueIso, reminder || defaultReminderOption());
  const task = addRecord('tasks', { name, notes: ($('tf-notes').value || '').trim(), type: $('tf-type').value, status: 'todo', priority: $('tf-priority').value, owner: $('tf-owner').value, due: dueIso, reminderAt, queueId: $('tf-queue').value || '', lastActivity: TODAY.toISOString(), ...taskLinksForRecord() }, { origin: 'Creación manual' });
  closeModal();
  addEvent({ type: 'task', when: Date.now(), who: 'Tú', text: `Tarea creada: ${name}, vence el ${formatDate(dueIso)}.` });
  renderAssoc();
  toast('Tarea creada', recordToastAction('tasks', task.id));
  return task;
}

return { openTaskForm, saveTaskForm };
}

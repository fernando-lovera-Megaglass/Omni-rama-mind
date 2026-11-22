import { callOutcomes } from './activity-outcomes.js';
// Shared activity form, usable without booting a record page.
import { TODAY, getSetting, dbIsLive, allContacts, allCompanies, allDeals, allTickets, ticketStatusIsClosed } from './data.js';
import { ACTIVITY_COMPANY_SETTING, ACTIVITY_RULES_SETTING, activityAssociations } from './activity-associations.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CONFIG = Object.fromEntries(Object.entries({ contacts: 'contacto', companies: 'empresa', deals: 'negocio', tickets: 'ticket', tasks: 'tarea' }).map(([type, singular]) => [type, { singular, title: r => r.name }]));
const MEETING_LOCS = ['Llamada telefónica', 'Videoconferencia', 'Dirección'];
const LOG_DURATIONS = [5, 10, 15, 30, 45, 60];
const LOG_KINDS = { note: 'nota', call: 'llamada', meeting: 'reunión', email: 'correo', message: 'mensaje' };
const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localTimeStr = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function plusBusinessDays(n) {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added += 1;
  }
  return d;
}
export function logAssociationsHtml(type, rec, kind = 'note', destinationContactId) {
  const cfg = CONFIG[type];
  if (!rec) return '';
  let enabled = getSetting(ACTIVITY_COMPANY_SETTING);
  if (enabled == null && !dbIsLive()) {
    try { enabled = JSON.parse(localStorage.getItem(ACTIVITY_COMPANY_SETTING)); } catch { /* Default enabled. */ }
  }
  let rules = getSetting(ACTIVITY_RULES_SETTING);
  if (rules == null && !dbIsLive()) {
    try { rules = JSON.parse(localStorage.getItem(ACTIVITY_RULES_SETTING)); } catch { /* Legacy defaults. */ }
  }
  const options = activityAssociations(type, rec, {
    contacts: allContacts(), companies: allCompanies(), deals: allDeals(), tickets: allTickets(),
  }, (ticket) => ticketStatusIsClosed(ticket.pipeline, ticket.status), { associateCompany: enabled !== false, rules, kind, destinationContactId });
  return `<fieldset><legend>Asociado a</legend>
    <label class="log-follow"><input type="checkbox" checked disabled /> ${esc(cfg.singular)}: ${esc(cfg.title(rec))} (registro actual)</label>
    ${options.map((r) => `<label class="log-follow"><input type="checkbox" data-log-association="${esc(r.type)}" data-association-id="${esc(r.id)}" ${r.checked ? 'checked' : ''} ${r.required ? 'disabled' : ''} /> ${esc(CONFIG[r.type].singular)}: ${esc(r.name)}</label>`).join('')}</fieldset>`;
}
export function selectedActivityAssociations(container) {
  return [...container.querySelectorAll('[data-log-association]:checked')]
    .map((input) => ({ type: input.dataset.logAssociation, id: input.dataset.associationId }));
}
export function openLogModal(kind, { type, rec, openModal, $, schedule = false, channel = '', activity = null, destinationContactId } = {}) {
  const cfg = CONFIG[type];
  const name = cfg.title(rec);
  const base = activity ? new Date(activity.when) : schedule ? new Date(TODAY.getTime() + 2 * 86400000) : new Date();
  const whenRow = `<div class="adv-row adv-row--two"><label class="field"><span>Fecha</span><input id="log-date" type="date" value="${localDateStr(base)}" /></label><label class="field"><span>Hora</span><input id="log-time" type="time" value="${schedule ? '10:00' : localTimeStr(base)}" /></label></div>`;
  const outcomeRow = `<label class="field"><span>Resultado</span><select id="log-outcome">${callOutcomes().map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>`;
  const dirRow = `<label class="field"><span>Dirección</span><select id="log-direction"><option>Saliente</option><option>Entrante</option></select></label>`;
  const durSelect = (def) => `<select id="log-duration">${LOG_DURATIONS.map((m) => `<option value="${m}" ${m === def ? 'selected' : ''}>${m} minutos</option>`).join('')}</select>`;
  const followRow = `<label class="log-follow"><input type="checkbox" id="log-followup" /> Crear una tarea de seguimiento</label>
    <div class="log-follow__date" id="log-followup-row" hidden><label class="field"><span>Fecha de la tarea</span><input id="log-followup-date" type="date" value="${localDateStr(plusBusinessDays(2))}" /></label></div>`;
  let body = '';
  if (kind === 'note') {
    body = `${whenRow}<label class="field"><span>Nota</span><textarea id="log-notes" rows="5"></textarea></label>`;
  } else if (kind === 'call') {
    body = `${whenRow}
      <div class="adv-row adv-row--two">${dirRow}${outcomeRow}</div>
      <label class="field"><span>Duración</span>${durSelect(15)}</label>
      <label class="field"><span>Notas de la llamada</span><textarea id="log-notes" rows="3" placeholder="¿Qué se habló?"></textarea></label>
      ${followRow}`;
  } else if (kind === 'meeting') {
    body = `<label class="field"><span>Título</span><input id="log-title" type="text" value="Reunión con ${esc(name)}" /></label>
      ${whenRow}
      <div class="adv-row adv-row--two"><label class="field"><span>Duración</span>${durSelect(30)}</label><label class="field"><span>Ubicación</span><select id="log-location">${MEETING_LOCS.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label></div>
      ${schedule ? '' : outcomeRow}
      <label class="field"><span>Descripción</span><textarea id="log-notes" rows="3" placeholder="Orden del día, acuerdos..."></textarea></label>`;
  } else if (kind === 'email') {
    body = `<label class="field"><span>Asunto</span><input id="log-title" type="text" value="Correo a ${esc(name)}" /></label>
      ${whenRow}
      ${dirRow}
      <label class="field"><span>Cuerpo</span><textarea id="log-notes" rows="3" placeholder="Resumen del correo enviado o recibido"></textarea></label>
      ${followRow}`;
  } else {
    body = `${whenRow}
      ${dirRow}
      <label class="field"><span>Texto del mensaje</span><textarea id="log-notes" rows="3" placeholder="Mensaje enviado por ${esc(channel)}"></textarea></label>`;
  }
  if (!activity) body += logAssociationsHtml(type, rec, kind, destinationContactId);
  const verb = activity ? 'Guardar' : schedule ? 'Programar' : 'Registrar';
  const what = kind === 'message' ? 'mensaje' : LOG_KINDS[kind];
  openModal(
    `${verb} ${kind === 'message' ? `mensaje de ${channel}` : what}`,
    body,
    `<button class="btn btn--primary" type="button" data-confirm="logact" data-kind="${kind}" data-schedule="${schedule ? '1' : ''}" data-channel="${esc(channel)}">${verb} ${what}</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`,
  );
  if (activity) {
    const x = activity.extra || {};
    let title = x.title ?? x.subject ?? '';
    let notes = x.notes ?? activity.text;
    if (x.notes == null && ['email', 'meeting'].includes(kind)) {
      const original = activity.text.replace(/^Reunión programada: /, '');
      if (!title) title = original.split(' — ')[0];
      notes = original === title ? '' : original.startsWith(`${title} — `) ? original.slice(title.length + 3) : original;
    }
    const values = { 'log-notes': notes, 'log-title': title, 'log-outcome': x.outcome, 'log-direction': x.direction, 'log-duration': x.durationMin ?? (x.durationSec != null ? Number(x.durationSec) / 60 : undefined), 'log-location': x.locationType };
    for (const [key, value] of Object.entries(values)) {
      const input = $(key);
      if (!input || value == null) continue;
      if (input.tagName === 'SELECT' && ![...input.options].some((o) => o.value === String(value))) input.add(new Option(String(value), String(value)));
      input.value = value;
    }
  }
}

export function readLogActivity($, kind, name, schedule = false, channel = '') {
    const dstr = $('log-date').value;
    const when = dstr ? new Date(`${dstr}T${$('log-time').value || '09:00'}`).getTime() : Date.now();
    const notes = ($('log-notes')?.value || '').trim();
    const extra = { notes };
    let text = '';
    if (kind === 'note') { text = notes;
    } else if (kind === 'call') {
      extra.outcome = $('log-outcome').value;
      extra.direction = $('log-direction').value;
      extra.durationMin = Number($('log-duration').value);
      text = notes || `Llamada ${extra.direction.toLowerCase()} con ${name}.`;
    } else if (kind === 'meeting') {
      const title = $('log-title').value.trim() || `Reunión con ${name}`;
      extra.title = title;
      extra.durationMin = Number($('log-duration').value);
      extra.locationType = $('log-location').value;
      if (!schedule) extra.outcome = $('log-outcome').value;
      text = schedule ? `Reunión programada: ${title}${notes ? `. ${notes}` : ''}` : `${title}${notes ? ` — ${notes}` : ''}`;
    } else if (kind === 'email') {
      extra.direction = $('log-direction').value;
      extra.subject = $('log-title').value.trim() || `Correo a ${name}`;
      text = notes ? `${extra.subject} — ${notes}` : extra.subject;
    } else {
      extra.direction = $('log-direction').value;
      extra.channel = channel;
      text = notes || `Mensaje de ${channel} ${extra.direction.toLowerCase()}.`;
    }
  return { type: kind, when, who: 'Tú', text, extra };
}

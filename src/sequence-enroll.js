// "Inscribir en una secuencia" — from a contact record (Más), from the e-mail composer's Secuencias tab, or for
// a selection of contacts from the list's bulk bar: choose the sequence (or arrive with one preselected) and who
// enrols, pick the start date/time, fill the placeholders its e-mails need once (shared values), see every step
// with the tokens resolved for a contact (a selector switches the previewed contact when there are several), and
// confirm — one enrolment per contact (first step scheduled or its task created, timeline entry; sequences-data
// .enroll). A single contact already active in that sequence gets a warning and the option to re-enrol; with
// several contacts the ones already active are skipped and counted. Contacts without e-mail are enrolled too but
// the summary says their e-mail steps will be skipped (the processor does not send to them).
import { sanitizeHtml } from './rich-text.js';
import { toast } from './shell.js';
import { ready, sequences, sequenceById, STEP_TYPES, stepDay, isAuto, isEmail, placeholdersOf, fillPlaceholders, enroll, unenroll, activeEnrollment, ME } from './sequences-data.js';
import { OWNERS, formatDate } from './data.js';
import { renderTokens, contextFromRecord, plainText } from './tokens.js';
import { activeAccounts } from './connected-emails.js';
import { enhanceOwnerSelects } from './owner-select.js';

// The selected connected account is persisted on each enrollment.
const senderAccount = () => activeAccounts().find(a => a.id === dlg?.senderId);
const senderEmail = () => senderAccount()?.email || '';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hasEmail = (c) => /\S+@\S+\.\S+/.test(String((c && c.email) || ''));
const nameOf = (c) => (c && (c.name || c.first)) || 'el contacto';
let dlg = null;
const previewContact = () => dlg.contacts[Math.min(dlg.previewIndex, dlg.contacts.length - 1)];
const isMulti = () => dlg.contacts.length > 1;

export async function openEnrollDialog({ contact, contacts, onEnrolled, sequenceId = '' } = {}) {
  await ready;
  const people = (Array.isArray(contacts) ? contacts : contact ? [contact] : []).filter((c) => c && c.id !== undefined && c.id !== null && c.id !== '');
  if (!people.length) { toast('Abre la ficha de un contacto o selecciona contactos para inscribirlos en una secuencia.'); return null; }
  const list = sequences().filter((s) => s.steps.length);
  const now = new Date();
  dlg = { contacts: people, previewIndex: 0, onEnrolled, sequenceId: list.some((s) => s.id === sequenceId) ? sequenceId : '', by: ME, placeholders: {}, overrides: {}, senderId: activeAccounts().find(a => a.real)?.id || activeAccounts()[0]?.id || '', startMode: 'now', date: localDate(now), time: localTime(now), reenroll: false };
  let m = $('enr-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal bmodal--top';
    m.id = 'enr-modal';
    document.body.appendChild(m);
    m.addEventListener('click', onClick);
    m.addEventListener('input', onInput);
    m.addEventListener('change', onInput);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) close(); });
  }
  const multi = isMulti();
  const n = people.length;
  const title = multi ? `Inscribir ${n} contactos en una secuencia` : `Inscribir a ${esc(nameOf(people[0]))} en una secuencia`;
  const activeCount = (s) => people.filter((c) => activeEnrollment(c.id, s.id)).length;
  const optionNote = (s) => { const k = activeCount(s); return !k ? '' : multi ? ` · ${k} ya inscrito${k === 1 ? '' : 's'}` : ' · ya inscrito'; };
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel bmodal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="enr-title"><div class="bmodal__head"><h3 id="enr-title">${title}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body enr">
    ${multi ? `<details class="enr__contacts" id="enr-contacts"><summary><strong>${n} contactos seleccionados</strong> <span class="muted">· ${people.filter(hasEmail).length} con correo</span></summary><ul>${people.map((c) => `<li>${esc(nameOf(c))}${hasEmail(c) ? ` <span class="muted">${esc(c.email)}</span>` : ' <span class="tag tag--open">sin correo</span>'}</li>`).join('')}</ul></details>` : ''}
    <div class="enr__layout"><section class="enr__timeline"><div id="enr-warn"></div><div id="enr-ph"></div><div id="enr-preview" class="enr__preview"><p class="muted enr__hint">${hintText()}</p></div></section><aside class="enr__options"><h4>Opciones de inscripción</h4><div class="enr__row">
      <label class="field"><span>Secuencia</span><select id="enr-seq"><option value="">Seleccionar una secuencia</option>${list.map((s) => `<option value="${esc(s.id)}" ${s.id === dlg.sequenceId ? 'selected' : ''}>${esc(s.name)} (${s.steps.length} pasos)${optionNote(s)}</option>`).join('')}</select></label>
      <label class="field"><span>Inscribir como</span><select id="enr-by" data-owner-select>${OWNERS.filter((o) => o !== 'Sin asignar').map((o) => `<option value="${esc(o)}" ${o === ME ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Remitente</span><select id="enr-sender">${activeAccounts().map(a => `<option value="${esc(a.id)}" ${a.id === dlg.senderId ? 'selected' : ''}>${esc(a.email)}</option>`).join('') || '<option value="">Sin cuenta conectada</option>'}</select></label>
    <label class="field"><span>Inicio</span><select id="enr-start"><option value="now">Iniciar ahora</option><option value="schedule">Programar fecha y hora</option></select></label>
    <div class="enr__row enr__row--start" id="enr-schedule" hidden>
      <label class="field"><span>Fecha de inicio</span><input type="date" id="enr-date" value="${dlg.date}" /></label>
      <label class="field"><span>Hora de inicio</span><input type="time" id="enr-time" value="${dlg.time}" /></label>
      <p class="muted enr__starthint">El primer paso se ejecuta en esa fecha; los siguientes cuentan días laborables desde ahí.</p>
    </div>
    </aside></div>
  </div><div class="bmodal__foot"><button class="btn btn--primary" type="button" id="enr-confirm" data-enr="confirm" disabled>Iniciar secuencia</button><button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button></div></div>`;
  enhanceOwnerSelects(m);
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  if (dlg.sequenceId) renderPreview();
  if (list.length) $('enr-seq').focus();
  return m;
}
export function closeEnrollDialog() { close(); }
export const enrollDialogOpen = () => { const m = $('enr-modal'); return Boolean(m && m.classList.contains('is-open')); };
function close() { const m = $('enr-modal'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } dlg = null; }
const hintText = () => (isMulti() ? `Elige una secuencia para ver sus pasos con los datos de los contactos seleccionados.` : `Elige una secuencia para ver sus pasos con los datos de ${esc(previewContact().first || previewContact().name || 'este contacto')}.`);
// Who, of the selection, is already running in the sequence; who lacks an e-mail (if the sequence sends any).
const skipped = (seq) => dlg.contacts.filter((c) => activeEnrollment(c.id, seq.id));
const noEmail = (seq) => (seq.steps.some((s) => s.type === 'auto_email') ? dlg.contacts.filter((c) => !hasEmail(c)) : []);
function renderWarning(seq) {
  const box = $('enr-warn');
  if (!seq) { box.innerHTML = ''; return; }
  if (isMulti()) {
    const k = skipped(seq).length;
    const m = noEmail(seq).length;
    box.innerHTML = [
      k ? `<div class="enr__warn" role="alert"><strong>${k} contacto${k === 1 ? '' : 's'} ya ${k === 1 ? 'está inscrito' : 'están inscritos'} en esta secuencia</strong> y se omitirá${k === 1 ? '' : 'n'}${k === dlg.contacts.length ? ': no queda nadie por inscribir' : ''}.</div>` : '',
      m ? `<div class="enr__warn enr__warn--soft" role="alert"><strong>${m} contacto${m === 1 ? '' : 's'} sin correo</strong>: se inscribe${m === 1 ? '' : 'n'} pero sus pasos de correo se omitirán.</div>` : '',
    ].join('');
    return;
  }
  const c = previewContact();
  const active = activeEnrollment(c.id, seq.id);
  if (!active) { box.innerHTML = noEmail(seq).length ? '<div class="enr__warn" role="alert">Contacto sin correo: sus pasos de correo automático se omitirán.</div>' : ''; return; }
  box.innerHTML = `<div class="enr__warn" role="alert"><strong>${esc(c.first || c.name || 'Este contacto')} ya tiene una inscripción ${active.status === 'paused' ? 'en pausa' : 'activa'} en esta secuencia</strong> (desde el ${esc(formatDate(new Date(active.enrolledAt)))}, paso ${active.currentStep} de ${seq.steps.length}).<label class="snp__check"><input type="checkbox" id="enr-reenroll" ${dlg.reenroll ? 'checked' : ''} /> Reinscribir: cancelar la inscripción actual y empezar de nuevo</label></div>`;
}
function renderPreview() {
  const box = $('enr-preview');
  const seq = dlg.sequenceId ? sequenceById(dlg.sequenceId) : null;
  const phBox = $('enr-ph');
  renderWarning(seq);
  if (!seq) { box.innerHTML = `<p class="muted enr__hint">${hintText()}</p>`; phBox.innerHTML = ''; phBox.dataset.seq = ''; syncConfirm(); return; }
  const effective = effectiveSequence(seq);
  refreshPlaceholders(effective);
  const c = previewContact();
  const ctx = contextFromRecord('contacts', c, { owner: dlg.by });
  const resolve = (text) => renderTokens(fillPlaceholders(text, dlg.placeholders), ctx);
  const picker = isMulti() ? `<label class="field enr__previewfor"><span>Vista previa para</span><select id="enr-preview-contact">${dlg.contacts.map((x, i) => `<option value="${i}" ${i === dlg.previewIndex ? 'selected' : ''}>${esc(nameOf(x))}</option>`).join('')}</select></label>` : '';
  box.innerHTML = `<h4 class="enr__h">${esc(seq.name)} <span class="muted">· ${seq.steps.length} pasos · ${stepDay(seq.steps, seq.steps.length - 1)} días</span></h4>
    ${picker}
    <p class="muted enr__from" id="enr-from">${senderEmail() ? `Los correos se enviarán desde <strong>${esc(senderEmail())}</strong>.` : 'No hay ninguna cuenta de correo conectada: conéctala en Ajustes › General › Correo para que se envíen los correos.'}</p>
    <ol class="enr__steps">${effective.steps.map((st, i) => { const t = STEP_TYPES[st.type]; return `<li class="enr__step"><div class="enr__stephead"><span class="seqstep__ico" aria-hidden="true">${t.icon}</span><strong>${i + 1}. ${esc(t.label)}</strong><span class="muted">Día ${stepDay(seq.steps, i)}</span>${isAuto(st) ? '<span class="tag tag--open">Automático</span>' : '<span class="seqstep__pause seqstep__pause--sm">Pausa la secuencia</span>'}</div>${isEmail(st) ? `<details class="enr__mail" ${i === 0 ? 'open' : ''}><summary>Editar correo · ${esc(resolve(st.subject) || '(sin asunto)')}</summary><p class="muted">Cambios solo para esta inscripción${isMulti() ? ' de los contactos seleccionados' : ''}. Puedes usar {{contacto.nombre}} y [[marcadores]].</p><label class="field"><span>Asunto</span><input data-step="${esc(st.id)}" data-edit="subject" value="${esc(st.subject)}" /></label><label class="field"><span>Cuerpo</span><div class="enr__editor" contenteditable="true" role="textbox" aria-label="Cuerpo del paso ${i + 1}" aria-multiline="true" data-step="${esc(st.id)}" data-edit="body">${sanitizeHtml(st.body)}</div></label><div class="enr__resolved"><strong>Vista previa</strong><div data-preview-subject="${esc(st.id)}">${esc(resolve(st.subject))}</div><div class="enr__body" data-preview-body="${esc(st.id)}">${sanitizeHtml(resolve(st.body))}</div></div></details>` : `<div class="enr__task">${esc(resolve(st.title) || t.label)}${st.body ? `<div class="muted">${esc(plainText(resolve(st.body)))}</div>` : ''}</div>`}</li>`; }).join('')}</ol>`;
  syncConfirm();
}
function refreshPlaceholders(seq) {
  const names = placeholdersOf(seq);
  if ($('enr-ph').dataset.seq !== seq.id + JSON.stringify(names)) {
    $('enr-ph').dataset.seq = seq.id + JSON.stringify(names);
    $('enr-ph').innerHTML = names.length ? `<fieldset class="enr__ph"><legend>Marcadores de posición</legend><p class="muted">${isMulti() ? 'Un mismo texto para todos los contactos seleccionados.' : 'Completa el contenido que piden los correos de esta secuencia.'}</p>${names.map((n) => `<label class="field"><span>${esc(n)}</span><input data-ph="${esc(n)}" value="${esc(dlg.placeholders[n] || '')}" placeholder="Texto para «${esc(n)}»" /></label>`).join('')}</fieldset>` : '';
  }
}
function effectiveSequence(seq) {
  return { ...seq, steps: seq.steps.map(st => ({ ...st, ...dlg.overrides[seq.id]?.[st.id] })) };
}
function startDate() {
  if (dlg.startMode === 'now') return new Date();
  const d = new Date(`${dlg.date || localDate(new Date())}T${dlg.time || '09:00'}:00`);
  return d;
}
function syncConfirm() {
  const b = $('enr-confirm');
  if (!b || !dlg) return;
  const seq = dlg.sequenceId ? sequenceById(dlg.sequenceId) : null;
  const missing = seq ? placeholdersOf(effectiveSequence(seq)).filter((n) => !String(dlg.placeholders[n] || '').trim()) : [];
  const blocked = seq && (isMulti() ? skipped(seq).length === dlg.contacts.length : activeEnrollment(previewContact().id, seq.id) && !dlg.reenroll);
  const invalidDate = dlg.startMode === 'schedule' && (!dlg.date || !dlg.time || !Number.isFinite(startDate().getTime()) || startDate() <= new Date());
  b.disabled = !seq || missing.length > 0 || Boolean(blocked) || invalidDate;
  b.title = invalidDate ? 'Elige una fecha y hora futuras' : blocked ? (isMulti() ? 'Todos los contactos seleccionados ya están inscritos' : 'Marca «Reinscribir» para volver a inscribir al contacto') : missing.length ? `Completa: ${missing.join(', ')}` : '';
  if (seq && isMulti()) { const n = dlg.contacts.length - skipped(seq).length; b.textContent = n > 0 && n < dlg.contacts.length ? `Iniciar secuencia · ${n} de ${dlg.contacts.length}` : `Iniciar secuencia · ${dlg.contacts.length}`; }
}
function onInput(e) {
  if (!dlg) return;
  const t = e.target;
  if (t.dataset.edit) {
    const changes = dlg.overrides[dlg.sequenceId] ||= {};
    const value = t.dataset.edit === 'body' ? sanitizeHtml(t.innerHTML) : t.value;
    (changes[t.dataset.step] ||= {})[t.dataset.edit] = value;
    const resolved = renderTokens(fillPlaceholders(value, dlg.placeholders), contextFromRecord('contacts', previewContact(), { owner: dlg.by }));
    const preview = [...$('enr-preview').querySelectorAll(`[data-preview-${t.dataset.edit}]`)].find(el => el.dataset[t.dataset.edit === 'body' ? 'previewBody' : 'previewSubject'] === t.dataset.step);
    if (t.dataset.edit === 'body') preview.innerHTML = sanitizeHtml(resolved); else preview.textContent = resolved;
    syncConfirm();
    refreshPlaceholders(effectiveSequence(sequenceById(dlg.sequenceId)));
  } else if (t.id === 'enr-start') { dlg.startMode = t.value; $('enr-schedule').hidden = t.value !== 'schedule'; syncConfirm(); }
  else if (t.id === 'enr-sender') { dlg.senderId = t.value; renderPreview(); }
  else if (t.id === 'enr-seq') { dlg.sequenceId = t.value; dlg.reenroll = false; renderPreview(); } else if (t.id === 'enr-by') { dlg.by = t.value; renderPreview(); } else if (t.id === 'enr-date') { dlg.date = t.value; syncConfirm(); }
  else if (t.id === 'enr-time') { dlg.time = t.value; syncConfirm(); }
  else if (t.id === 'enr-preview-contact') { dlg.previewIndex = Number(t.value) || 0; renderPreview(); }
  else if (t.id === 'enr-reenroll') { dlg.reenroll = t.checked; syncConfirm(); } else if (t.dataset.ph) { dlg.placeholders[t.dataset.ph] = t.value; if (e.type === 'change') renderPreview(); else syncConfirm(); }
}
function onClick(e) {
  if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); close(); return; }
  if (!e.target.closest('[data-enr="confirm"]') || !dlg) return;
  syncConfirm();
  if ($('enr-confirm').disabled) return;
  const seq = sequenceById(dlg.sequenceId);
  if (!seq) return;
  const common = { sequenceId: dlg.sequenceId, placeholders: dlg.placeholders, enrolledBy: dlg.by, now: startDate(), from: senderEmail(), senderAccountId: senderAccount()?.id || null, stepOverrides: dlg.overrides[dlg.sequenceId] || {} };
  if (!isMulti()) {
    const c = previewContact();
    const active = activeEnrollment(c.id, dlg.sequenceId);
    if (active && !dlg.reenroll) { syncConfirm(); return; }
    if (active) unenroll(active.id);
    const result = enroll({ ...common, contact: c });
    if (!result) { toast('No se pudo inscribir al contacto.'); return; }
    const cb = dlg.onEnrolled;
    close();
    toast(`${result.enrollment.contactName} inscrito en «${result.sequence.name}»${result.task ? ' · tarea creada' : ''}`);
    // Record pages re-render their timeline on this (the composer path has no callback of its own).
    document.dispatchEvent(new (document.defaultView.CustomEvent)('crm:enrolled', { detail: result }));
    if (cb) cb(result);
    return;
  }
  // Several contacts: one enrolment each; the ones already active in the sequence are skipped and counted.
  const results = [];
  let skippedN = 0;
  let failed = 0;
  for (const c of dlg.contacts) {
    if (activeEnrollment(c.id, dlg.sequenceId)) { skippedN += 1; continue; }
    const r = enroll({ ...common, contact: c });
    if (r) results.push(r); else failed += 1;
  }
  const withoutEmail = noEmail(seq).filter((c) => results.some((r) => String(r.enrollment.contactId) === String(c.id))).length;
  const tasks = results.filter((r) => r.task).length;
  const cb = dlg.onEnrolled;
  const total = dlg.contacts.length;
  close();
  const bits = [`Inscritos ${results.length} de ${total} en «${seq.name}»`];
  if (skippedN) bits.push(`${skippedN} ${skippedN === 1 ? 'contacto ya estaba inscrito y se omitió' : 'contactos ya estaban inscritos y se omitieron'}`);
  if (withoutEmail) bits.push(`${withoutEmail} sin correo: sus pasos de correo se omitirán`);
  if (tasks) bits.push(`${tasks} ${tasks === 1 ? 'tarea creada' : 'tareas creadas'}`);
  if (failed) bits.push(`${failed} no se pudieron inscribir`);
  toast(bits.join(' · '));
  const summary = { sequence: seq, results, enrolled: results.length, skipped: skippedN, withoutEmail, tasks, failed, total };
  document.dispatchEvent(new (document.defaultView.CustomEvent)('crm:enrolled', { detail: summary }));
  if (cb) cb(summary);
}

// "Inscribir en una secuencia" — from a contact record (Más) or from the e-mail composer's Secuencias tab:
// choose the sequence (or arrive with one preselected) and who enrols, pick the start date/time, fill the
// placeholders its e-mails need, see every step with the tokens resolved for this contact, and confirm —
// the enrolment is created, the first step scheduled and the timeline gets its entry (sequences-data.enroll).
// A contact already active in that sequence gets a warning and the option to re-enrol (cancels the current one).
import { toast } from './shell.js';
import { ready, sequences, sequenceById, STEP_TYPES, stepDay, isAuto, isEmail, placeholdersOf, fillPlaceholders, enroll, unenroll, activeEnrollment, ME } from './sequences-data.js';
import { OWNERS, formatDate } from './data.js';
import { renderTokens, contextFromRecord, plainText } from './tokens.js';
import { activeAccounts } from './connected-emails.js';
import { sendMail } from './gmail.js';
import { enhanceOwnerSelects } from './owner-select.js';

// The sequence's e-mails go out from the user's first connected account (Ajustes › General › Correo).
const senderEmail = () => (activeAccounts()[0] || {}).email || '';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
let dlg = null;

export async function openEnrollDialog({ contact, onEnrolled, sequenceId = '' } = {}) {
  await ready;
  if (!contact || contact.id === undefined || contact.id === null || contact.id === '') { toast('Abre la ficha de un contacto para inscribirlo en una secuencia.'); return null; }
  const list = sequences().filter((s) => s.steps.length);
  const now = new Date();
  dlg = { contact, onEnrolled, sequenceId: list.some((s) => s.id === sequenceId) ? sequenceId : '', by: ME, placeholders: {}, date: localDate(now), time: localTime(now), reenroll: false };
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
  const who = contact.name || contact.first || 'el contacto';
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel bmodal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="enr-title"><div class="bmodal__head"><h3 id="enr-title">Inscribir a ${esc(who)} en una secuencia</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body enr">
    <div class="enr__row">
      <label class="field"><span>Secuencia</span><select id="enr-seq"><option value="">Seleccionar una secuencia</option>${list.map((s) => `<option value="${esc(s.id)}" ${s.id === dlg.sequenceId ? 'selected' : ''}>${esc(s.name)} (${s.steps.length} pasos)${activeEnrollment(contact.id, s.id) ? ' · ya inscrito' : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Inscribir como</span><select id="enr-by" data-owner-select>${OWNERS.filter((o) => o !== 'Sin asignar').map((o) => `<option value="${esc(o)}" ${o === ME ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
    </div>
    <div class="enr__row enr__row--start">
      <label class="field"><span>Fecha de inicio</span><input type="date" id="enr-date" value="${dlg.date}" /></label>
      <label class="field"><span>Hora de inicio</span><input type="time" id="enr-time" value="${dlg.time}" /></label>
      <p class="muted enr__starthint">El primer paso se ejecuta en esa fecha; los siguientes cuentan días laborables desde ahí.</p>
    </div>
    <div id="enr-warn"></div>
    <div id="enr-ph"></div>
    <div id="enr-preview" class="enr__preview"><p class="muted enr__hint">Elige una secuencia para ver sus pasos con los datos de ${esc(contact.first || contact.name || 'este contacto')}.</p></div>
  </div><div class="bmodal__foot"><button class="btn btn--primary" type="button" id="enr-confirm" data-enr="confirm" disabled>Inscribir</button><button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button></div></div>`;
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
function renderWarning(seq) {
  const box = $('enr-warn');
  const active = seq ? activeEnrollment(dlg.contact.id, seq.id) : null;
  if (!active) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="enr__warn" role="alert"><strong>${esc(dlg.contact.first || dlg.contact.name || 'Este contacto')} ya tiene una inscripción ${active.status === 'paused' ? 'en pausa' : 'activa'} en esta secuencia</strong> (desde el ${esc(formatDate(new Date(active.enrolledAt)))}, paso ${active.currentStep} de ${seq.steps.length}).<label class="snp__check"><input type="checkbox" id="enr-reenroll" ${dlg.reenroll ? 'checked' : ''} /> Reinscribir: cancelar la inscripción actual y empezar de nuevo</label></div>`;
}
function renderPreview() {
  const box = $('enr-preview');
  const seq = dlg.sequenceId ? sequenceById(dlg.sequenceId) : null;
  const phBox = $('enr-ph');
  renderWarning(seq);
  if (!seq) { box.innerHTML = `<p class="muted enr__hint">Elige una secuencia para ver sus pasos con los datos de ${esc(dlg.contact.first || dlg.contact.name || 'este contacto')}.</p>`; phBox.innerHTML = ''; phBox.dataset.seq = ''; syncConfirm(); return; }
  const names = placeholdersOf(seq);
  if (phBox.dataset.seq !== seq.id) {
    phBox.dataset.seq = seq.id;
    phBox.innerHTML = names.length ? `<fieldset class="enr__ph"><legend>Marcadores de posición</legend><p class="muted">Completa el contenido que piden los correos de esta secuencia.</p>${names.map((n) => `<label class="field"><span>${esc(n)}</span><input data-ph="${esc(n)}" value="${esc(dlg.placeholders[n] || '')}" placeholder="Texto para «${esc(n)}»" /></label>`).join('')}</fieldset>` : '';
  }
  const ctx = contextFromRecord('contacts', dlg.contact, { owner: dlg.by });
  const resolve = (text) => renderTokens(fillPlaceholders(text, dlg.placeholders), ctx);
  box.innerHTML = `<h4 class="enr__h">${esc(seq.name)} <span class="muted">· ${seq.steps.length} pasos · ${stepDay(seq.steps, seq.steps.length - 1)} días</span></h4>
    <p class="muted enr__from" id="enr-from">${senderEmail() ? `Los correos se enviarán desde <strong>${esc(senderEmail())}</strong>.` : 'No hay ninguna cuenta de correo conectada: conéctala en Ajustes › General › Correo para que se envíen los correos.'}</p>
    <ol class="enr__steps">${seq.steps.map((st, i) => { const t = STEP_TYPES[st.type]; return `<li class="enr__step"><div class="enr__stephead"><span class="seqstep__ico" aria-hidden="true">${t.icon}</span><strong>${i + 1}. ${esc(t.label)}</strong><span class="muted">Día ${stepDay(seq.steps, i)}</span>${isAuto(st) ? '<span class="tag tag--open">Automático</span>' : '<span class="seqstep__pause seqstep__pause--sm">Pausa la secuencia</span>'}</div>${isEmail(st) ? `<div class="enr__mail"><div><span class="muted">Asunto:</span> ${esc(resolve(st.subject) || '(sin asunto)')}</div><div class="enr__body">${resolve(st.body)}</div></div>` : `<div class="enr__task">${esc(resolve(st.title) || t.label)}${st.body ? `<div class="muted">${esc(plainText(resolve(st.body)))}</div>` : ''}</div>`}</li>`; }).join('')}</ol>`;
  syncConfirm();
}
function startDate() {
  const d = new Date(`${dlg.date || localDate(new Date())}T${dlg.time || '09:00'}:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
function syncConfirm() {
  const b = $('enr-confirm');
  if (!b || !dlg) return;
  const seq = dlg.sequenceId ? sequenceById(dlg.sequenceId) : null;
  const missing = seq ? placeholdersOf(seq).filter((n) => !String(dlg.placeholders[n] || '').trim()) : [];
  const blocked = seq && activeEnrollment(dlg.contact.id, seq.id) && !dlg.reenroll;
  b.disabled = !seq || missing.length > 0 || Boolean(blocked);
  b.title = blocked ? 'Marca «Reinscribir» para volver a inscribir al contacto' : missing.length ? `Completa: ${missing.join(', ')}` : '';
}
function onInput(e) {
  if (!dlg) return;
  const t = e.target;
  if (t.id === 'enr-seq') { dlg.sequenceId = t.value; dlg.reenroll = false; renderPreview(); } else if (t.id === 'enr-by') { dlg.by = t.value; renderPreview(); } else if (t.id === 'enr-date') dlg.date = t.value;
  else if (t.id === 'enr-time') dlg.time = t.value;
  else if (t.id === 'enr-reenroll') { dlg.reenroll = t.checked; syncConfirm(); } else if (t.dataset.ph) { dlg.placeholders[t.dataset.ph] = t.value; if (e.type === 'change') renderPreview(); else syncConfirm(); }
}
function onClick(e) {
  if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); close(); return; }
  if (!e.target.closest('[data-enr="confirm"]') || !dlg) return;
  const active = activeEnrollment(dlg.contact.id, dlg.sequenceId);
  if (active && !dlg.reenroll) { syncConfirm(); return; }
  if (active) unenroll(active.id);
  const result = enroll({ sequenceId: dlg.sequenceId, contact: dlg.contact, placeholders: dlg.placeholders, enrolledBy: dlg.by, now: startDate(), from: senderEmail() });
  if (!result) { toast('No se pudo inscribir al contacto.'); return; }
  // With a real Google account as sender, the first automated e-mail (when it runs right away) goes out through Gmail.
  const sender = activeAccounts()[0];
  if (sender && sender.real && result.firstStep && isAuto(result.firstStep) && !result.scheduled && dlg.contact.email) {
    const tctx = contextFromRecord('contacts', dlg.contact, { owner: dlg.by });
    sendMail({ accountId: sender.id, to: dlg.contact.email, subject: renderTokens(fillPlaceholders(result.firstStep.subject || '', dlg.placeholders), tctx), html: renderTokens(fillPlaceholders(result.firstStep.body || '', dlg.placeholders), tctx) })
      .then(() => toast(`Paso 1 enviado por Gmail a ${dlg.contact.email}`))
      .catch((e2) => toast(`No se pudo enviar el paso 1 por Gmail: ${e2.message}`));
  }
  const cb = dlg.onEnrolled;
  close();
  toast(`${result.enrollment.contactName} inscrito en «${result.sequence.name}»${result.task ? ' · tarea creada' : ''}`);
  // Record pages re-render their timeline on this (the composer path has no callback of its own).
  document.dispatchEvent(new (document.defaultView.CustomEvent)('crm:enrolled', { detail: result }));
  if (cb) cb(result);
}

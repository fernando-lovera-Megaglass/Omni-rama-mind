// "Inscribir en una secuencia" from a contact record: choose the sequence (and who enrols), fill the
// placeholders its e-mails need, see every step with the tokens resolved for this contact, and confirm —
// the enrolment is created, the first step scheduled and the timeline gets its entry (sequences-data.enroll).
import { toast } from './shell.js';
import { ready, sequences, sequenceById, STEP_TYPES, stepDay, isAuto, isEmail, placeholdersOf, fillPlaceholders, enroll, enrollmentsOfContact, ME } from './sequences-data.js';
import { OWNERS } from './data.js';
import { renderTokens, contextFromRecord, plainText } from './tokens.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
let dlg = null;

export async function openEnrollDialog({ contact, onEnrolled } = {}) {
  await ready;
  if (!contact) return null;
  const list = sequences().filter((s) => s.steps.length);
  const active = new Set(enrollmentsOfContact(contact.id).filter((e) => e.status === 'active' || e.status === 'paused').map((e) => e.sequenceId));
  dlg = { contact, onEnrolled, sequenceId: '', by: ME, placeholders: {} };
  let m = $('enr-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal';
    m.id = 'enr-modal';
    document.body.appendChild(m);
    m.addEventListener('click', onClick);
    m.addEventListener('input', onInput);
    m.addEventListener('change', onInput);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) close(); });
  }
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel bmodal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="enr-title"><div class="bmodal__head"><h3 id="enr-title">Inscribir a ${esc(contact.name || contact.first || 'el contacto')} en una secuencia</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body enr">
    <div class="enr__row">
      <label class="field"><span>Secuencia</span><select id="enr-seq"><option value="">Seleccionar una secuencia</option>${list.map((s) => `<option value="${esc(s.id)}" ${active.has(s.id) ? 'disabled' : ''}>${esc(s.name)} (${s.steps.length} pasos)${active.has(s.id) ? ' · ya inscrito' : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Inscribir como</span><select id="enr-by">${OWNERS.filter((o) => o !== 'Sin asignar').map((o) => `<option value="${esc(o)}" ${o === ME ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
    </div>
    <div id="enr-ph"></div>
    <div id="enr-preview" class="enr__preview"><p class="muted enr__hint">Elige una secuencia para ver sus pasos con los datos de ${esc(contact.first || contact.name || 'este contacto')}.</p></div>
  </div><div class="bmodal__foot"><button class="btn btn--primary" type="button" id="enr-confirm" data-enr="confirm" disabled>Inscribir</button><button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button></div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  if (list.length) $('enr-seq').focus();
  return m;
}
export function closeEnrollDialog() { close(); }
function close() { const m = $('enr-modal'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } dlg = null; }
function renderPreview() {
  const box = $('enr-preview');
  const seq = dlg.sequenceId ? sequenceById(dlg.sequenceId) : null;
  const phBox = $('enr-ph');
  if (!seq) { box.innerHTML = `<p class="muted enr__hint">Elige una secuencia para ver sus pasos con los datos de ${esc(dlg.contact.first || dlg.contact.name || 'este contacto')}.</p>`; phBox.innerHTML = ''; syncConfirm(); return; }
  const names = placeholdersOf(seq);
  if (phBox.dataset.seq !== seq.id) {
    phBox.dataset.seq = seq.id;
    phBox.innerHTML = names.length ? `<fieldset class="enr__ph"><legend>Marcadores de posición</legend><p class="muted">Completa el contenido que piden los correos de esta secuencia.</p>${names.map((n) => `<label class="field"><span>${esc(n)}</span><input data-ph="${esc(n)}" value="${esc(dlg.placeholders[n] || '')}" placeholder="Texto para «${esc(n)}»" /></label>`).join('')}</fieldset>` : '';
  }
  const ctx = contextFromRecord('contacts', dlg.contact, { owner: dlg.by });
  const resolve = (text) => renderTokens(fillPlaceholders(text, dlg.placeholders), ctx);
  box.innerHTML = `<h4 class="enr__h">${esc(seq.name)} <span class="muted">· ${seq.steps.length} pasos · ${stepDay(seq.steps, seq.steps.length - 1)} días</span></h4>
    <ol class="enr__steps">${seq.steps.map((st, i) => { const t = STEP_TYPES[st.type]; return `<li class="enr__step"><div class="enr__stephead"><span class="seqstep__ico" aria-hidden="true">${t.icon}</span><strong>${i + 1}. ${esc(t.label)}</strong><span class="muted">Día ${stepDay(seq.steps, i)}</span>${isAuto(st) ? '<span class="tag tag--open">Automático</span>' : '<span class="seqstep__pause seqstep__pause--sm">Pausa la secuencia</span>'}</div>${isEmail(st) ? `<div class="enr__mail"><div><span class="muted">Asunto:</span> ${esc(resolve(st.subject) || '(sin asunto)')}</div><div class="enr__body">${resolve(st.body)}</div></div>` : `<div class="enr__task">${esc(resolve(st.title) || t.label)}${st.body ? `<div class="muted">${esc(plainText(resolve(st.body)))}</div>` : ''}</div>`}</li>`; }).join('')}</ol>`;
  syncConfirm();
}
function syncConfirm() {
  const b = $('enr-confirm');
  if (!b || !dlg) return;
  const seq = dlg.sequenceId ? sequenceById(dlg.sequenceId) : null;
  const missing = seq ? placeholdersOf(seq).filter((n) => !String(dlg.placeholders[n] || '').trim()) : [];
  b.disabled = !seq || missing.length > 0;
  b.title = missing.length ? `Completa: ${missing.join(', ')}` : '';
}
function onInput(e) {
  if (!dlg) return;
  const t = e.target;
  if (t.id === 'enr-seq') { dlg.sequenceId = t.value; renderPreview(); } else if (t.id === 'enr-by') { dlg.by = t.value; renderPreview(); } else if (t.dataset.ph) { dlg.placeholders[t.dataset.ph] = t.value; const seqBox = $('enr-preview'); if (seqBox && e.type === 'change') renderPreview(); else syncConfirm(); }
}
function onClick(e) {
  if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); close(); return; }
  if (!e.target.closest('[data-enr="confirm"]') || !dlg) return;
  const result = enroll({ sequenceId: dlg.sequenceId, contact: dlg.contact, placeholders: dlg.placeholders, enrolledBy: dlg.by });
  if (!result) { toast('No se pudo inscribir al contacto.'); return; }
  const cb = dlg.onEnrolled;
  close();
  toast(`${result.enrollment.contactName} inscrito en «${result.sequence.name}»${result.task ? ' · tarea creada' : ''}`);
  if (cb) cb(result);
}

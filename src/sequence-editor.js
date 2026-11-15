// Crear / editar secuencia (sequences/create/): the dark top bar, the left panel (start from scratch, dynamic
// sequence, the six pre-built sequences — or the settings when editing) and the "Vista previa" with its live
// metrics and the vertical flow of expandable step cards, connectors with "+" and editable delays, and the
// "Completado" node. Saved to sequences / sequence_steps.
import { toast, wireMenus, closeMenus } from './shell.js';
import { ready, PREBUILT, DYNAMIC, prebuiltByKey, STEP_TYPES, EXCLUSION_CRITERIA, stats, stepDay, isAuto, isEmail, replyIndex, createSequence, updateSequence, sequenceById, folders, createFolder } from './sequences-data.js';
import { openTokenPicker, chipHtml, markersToChips, chipsToMarkers } from './tokens.js';

await ready;
const root = document.getElementById('seqed-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const state = { id: null, name: 'Nueva secuencia', description: '', folder: '', exclusion: [], steps: [], templateKey: '', dynamic: false, open: new Set(), expanded: new Set(), adding: null, editingDelay: null, dirty: false };
const BLANK_TITLE = 'Nueva secuencia';
const PH_RE = /\[\[([^\]]+)\]\]/g;
const DAYS = (n) => (n ? `${n} ${n === 1 ? 'día laborable' : 'días laborables'}` : 'Ninguna');

// ---------- body ⇄ editor ----------
const phChip = (name) => `<span class="ph" contenteditable="false" data-ph="${esc(name)}" title="El remitente completa este contenido al inscribir">Marcador de posición: ${esc(name)}</span>`;
const toEditor = (text) => markersToChips(String(text || '').replace(PH_RE, (m, n) => phChip(n.trim())), { short: true });
function fromEditor(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  div.querySelectorAll('.ph[data-ph]').forEach((s) => s.replaceWith(document.createTextNode(`[[${s.dataset.ph}]]`)));
  return chipsToMarkers(div.innerHTML);
}
const loadTemplate = (key) => {
  const p = prebuiltByKey(key);
  if (!p) return;
  state.templateKey = key; state.name = p.name; state.description = p.description; state.exclusion = [...p.exclusion]; state.steps = p.steps(); state.dynamic = key === 'dynamic'; state.open = new Set(); state.expanded = new Set(); state.adding = null; state.dirty = true;
};
const newStep = (type) => ({ id: uuid(), type, delayDays: state.steps.length ? 2 : 0, title: '', subject: '', body: '', templateName: isEmail({ type }) ? `${state.name === BLANK_TITLE ? 'Secuencia' : state.name} (Correo No. ${state.steps.filter(isEmail).length + 1})` : '', version: 'A', replyToPrevious: false });

// ---------- render ----------
function render() {
  const editing = Boolean(state.id);
  document.title = `${state.name} | Omni`;
  const s = stats(state.steps, state.exclusion);
  root.innerHTML = `
    <div class="seqed">
      <header class="seqed__bar">
        <a class="seqed__back" href="../">‹ Volver a Secuencias</a>
        <div class="seqed__title"><h1 id="seqed-title">${esc(state.name)}</h1>${state.description ? `<p class="seqed__desc" id="seqed-desc">${esc(state.description)}</p>` : '<p class="seqed__desc" id="seqed-desc" hidden></p>'}</div>
        <button class="btn btn--primary" type="button" id="seqed-create" data-se="${editing ? 'save' : 'create'}">${editing ? 'Guardar' : 'Crear secuencia'}</button>
      </header>
      <div class="seqed__panes">
        <aside class="seqed__left" id="seqed-left">${editing ? settingsHtml() : startHtml()}</aside>
        <section class="seqed__right">
          <h2 class="seqed__h">Vista previa</h2>
          <div class="seqed__metrics" id="seqed-metrics">
            <div class="seqed__metric"><span>Total de pasos</span><strong data-metric="steps">${s.totalSteps}</strong></div>
            <div class="seqed__metric"><span>Días para completar</span><strong data-metric="days">${s.days}</strong></div>
            <div class="seqed__metric"><span>Pasos automatizados</span><strong data-metric="auto">${s.automatedPct} %</strong></div>
            <div class="seqed__metric"><span>Criterios de exclusión</span><strong data-metric="exclusion">${s.exclusion}</strong></div>
          </div>
          <div class="seqflow" id="seqed-flow">${flowHtml()}</div>
        </section>
      </div>
    </div>`;
  wireMenus(root);
}
function startHtml() {
  return `
    <button class="seqed__start${state.templateKey === '' && state.steps.length === 0 ? ' is-active' : ''}" type="button" data-se="blank"><span class="seqed__startico" aria-hidden="true">＋</span><div><strong>Empezar de cero</strong><p class="muted">Crea una secuencia en blanco y añade los pasos uno a uno.</p></div></button>
    <button class="seqed__start${state.templateKey === 'dynamic' ? ' is-active' : ''}" type="button" data-se="dynamic"><span class="seqed__startico" aria-hidden="true">⚡</span><div><strong>Crear una secuencia dinámica</strong><p class="muted">Correos automatizados al principio y, cuando los contactos interactúan, tareas manuales para que tomes el relevo.</p></div></button>
    <h3 class="seqed__listh">Comienza con una secuencia preelaborada</h3>
    <div class="seqed__prebuilt">${PREBUILT.map((p) => `<button class="seqed__tpl${state.templateKey === p.key ? ' is-active' : ''}" type="button" data-prebuilt="${p.key}"><strong>${esc(p.name)}</strong><p class="muted">${esc(p.description)}</p><span class="seqed__tplmeta muted">${p.steps().length} pasos · ${stats(p.steps(), p.exclusion).days} días</span></button>`).join('')}</div>`;
}
function settingsHtml() {
  return `
    <h3 class="seqed__listh">Configuración</h3>
    <label class="tpe__field"><span>Nombre de la secuencia</span><input id="seqed-name" value="${esc(state.name)}" /></label>
    <label class="tpe__field"><span>Carpeta</span><select id="seqed-folder"><option value="">Sin carpeta</option>${folders().map((f) => `<option value="${esc(f)}" ${f === state.folder ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    <label class="tpe__field"><span>Descripción</span><textarea id="seqed-description" rows="3">${esc(state.description)}</textarea></label>
    <fieldset class="seqed__excl"><legend>Criterios de exclusión</legend>${EXCLUSION_CRITERIA.map(([k, l]) => `<label class="snp__check"><input type="checkbox" data-excl="${k}" ${state.exclusion.includes(k) ? 'checked' : ''} /> ${esc(l)}</label>`).join('')}</fieldset>
    <p class="muted seqed__hint">Las secuencias preelaboradas siguen disponibles al crear una nueva secuencia.</p>`;
}
const chooserHtml = (at, first) => `
  <div class="seqstep seqstep--chooser" data-chooser="${at}">
    <div class="seqstep__head seqstep__head--static"><span class="seqstep__num">Paso ${at + 1}</span><span>${first ? 'Elige la primera acción que realizará la secuencia' : 'Elige la acción de este paso'}</span>${first ? '' : '<button class="link-btn" type="button" data-se="cancel-add">Cancelar</button>'}</div>
    <div class="seqstep__types">${Object.entries(STEP_TYPES).map(([k, t]) => `<button class="seqstep__type" type="button" data-add-type="${k}" data-at="${at}"><span class="seqstep__ico" aria-hidden="true">${t.icon}</span><span><strong>${esc(t.label)}</strong><small class="muted">${esc(t.hint)}</small></span>${t.auto ? '' : '<span class="seqstep__pause seqstep__pause--sm">Pausa</span>'}</button>`).join('')}</div>
  </div>`;
function stepHtml(st, i) {
  const t = STEP_TYPES[st.type];
  const open = state.open.has(st.id);
  const manual = !isAuto(st);
  const emailStep = isEmail(st);
  const reply = i > 0 && emailStep ? replyIndex(state.steps, i) : 0;
  const longBody = (st.body || '').length > 220;
  const expanded = state.expanded.has(st.id);
  return `
    <article class="seqstep${open ? ' is-open' : ''}" data-step="${esc(st.id)}" data-index="${i}">
      <button class="seqstep__head" type="button" data-toggle="${esc(st.id)}" aria-expanded="${open}">
        <span class="seqstep__ico" aria-hidden="true">${t.icon}</span>
        <span class="seqstep__name">${i + 1}. ${esc(t.label)} - Día ${stepDay(state.steps, i)}</span>
        ${manual ? '<span class="seqstep__pause">PAUSA LA SECUENCIA</span>' : ''}
        <span class="seqstep__chev" aria-hidden="true">${open ? '⌄' : '›'}</span>
      </button>
      ${open ? `<div class="seqstep__body">
        ${emailStep ? `
          <div class="seqstep__meta"><span class="seqstep__version">Versión A</span><span class="muted seqstep__tpl">${esc(st.templateName || 'Correo sin plantilla')}</span>${i > 0 ? `<label class="seqstep__reply"><input type="checkbox" data-reply="${esc(st.id)}" ${st.replyToPrevious ? 'checked' : ''} /> RESPUESTA (${st.replyToPrevious ? reply : reply + 1})<small class="muted">envía este correo como respuesta en el hilo del correo anterior</small></label>` : ''}</div>
          ${manual ? `<label class="tpe__field"><span>Título de la tarea</span><input data-title="${esc(st.id)}" value="${esc(st.title)}" placeholder="P. ej. Enviar correo de seguimiento" /></label>` : ''}
          <label class="tpe__field"><span>Asunto</span><input data-subject="${esc(st.id)}" value="${esc(st.subject)}" placeholder="Asunto del correo" /></label>
          <div class="tpe__field"><span>Cuerpo</span>
            <div class="tpe__toolbar"><button type="button" data-ins-token="${esc(st.id)}">Insertar token</button><button type="button" data-ins-ph="${esc(st.id)}">Marcador de posición</button></div>
            <div class="tpe__body seqstep__text${longBody && !expanded ? ' is-collapsed' : ''}" data-body="${esc(st.id)}" contenteditable="true" data-placeholder="Escribe el correo…">${toEditor(st.body)}</div>
            ${longBody ? `<button class="link-btn seqstep__more" type="button" data-more="${esc(st.id)}">${expanded ? 'Ver menos' : 'Ver más'}</button>` : ''}
          </div>` : `
          <label class="tpe__field"><span>Título de la tarea</span><input data-title="${esc(st.id)}" value="${esc(st.title)}" placeholder="P. ej. Llamar al contacto" /></label>
          <label class="tpe__field"><span>Notas</span><textarea data-notes="${esc(st.id)}" rows="2" placeholder="Instrucciones para quien realice la tarea">${esc(st.body)}</textarea></label>`}
        <div class="seqstep__foot"><span class="muted">${manual ? 'La secuencia se pausa hasta completar esta tarea.' : 'Se envía automáticamente en el día indicado.'}</span><button class="link-btn seqstep__del" type="button" data-del="${esc(st.id)}">Eliminar paso</button></div>
      </div>` : ''}
    </article>`;
}
const connectorHtml = (i) => {
  const next = state.steps[i + 1];
  const editing = next && state.editingDelay === next.id;
  return `<div class="seqflow__conn">${state.adding === i + 1 ? '' : `<button class="seqflow__add" type="button" data-add-at="${i + 1}" aria-label="Agregar paso" title="Agregar paso">+</button>`}${next ? (editing ? `<span class="seqflow__delayedit"><label>Retraso <input type="number" min="0" max="60" value="${Number(next.delayDays) || 0}" data-delay-input="${esc(next.id)}" aria-label="Días laborables" /> días laborables</label><button class="btn btn--primary btn--sm" type="button" data-delay-ok="${esc(next.id)}">Aceptar</button></span>` : `<button class="seqflow__delay" type="button" data-delay="${esc(next.id)}" title="Cambiar el retraso">Retraso: ${DAYS(Number(next.delayDays) || 0)}</button>`) : ''}</div>`;
};
function flowHtml() {
  if (!state.steps.length) return chooserHtml(0, true);
  return `${state.steps.map((st, i) => `${state.adding === i ? chooserHtml(i, false) : ''}${stepHtml(st, i)}${connectorHtml(i)}`).join('')}${state.adding === state.steps.length ? chooserHtml(state.steps.length, false) : ''}<div class="seqflow__done"><span class="seqflow__doneico" aria-hidden="true">✓</span> Completado</div>`;
}
function refreshMetrics() {
  const s = stats(state.steps, state.exclusion);
  const m = $('seqed-metrics');
  if (!m) return;
  m.querySelector('[data-metric="steps"]').textContent = s.totalSteps;
  m.querySelector('[data-metric="days"]').textContent = s.days;
  m.querySelector('[data-metric="auto"]').textContent = `${s.automatedPct} %`;
  m.querySelector('[data-metric="exclusion"]').textContent = s.exclusion;
}
function renderFlow() { $('seqed-flow').innerHTML = flowHtml(); refreshMetrics(); wireMenus(root); }
function renderBar() { $('seqed-title').textContent = state.name; const d = $('seqed-desc'); d.textContent = state.description; d.hidden = !state.description; }
const stepOf = (id) => state.steps.find((x) => x.id === id);
const syncBody = (el) => { const st = stepOf(el.dataset.body); if (st) { st.body = fromEditor(el.innerHTML); state.dirty = true; } };

// ---------- create / save ----------
function openCreateModal() {
  if (!state.steps.length) { toast('Agrega al menos un paso antes de crear la secuencia.'); return; }
  let m = $('seqed-modal');
  if (!m) { m = document.createElement('div'); m.className = 'bmodal'; m.id = 'seqed-modal'; root.appendChild(m); m.addEventListener('click', onModalClick); }
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel" role="dialog" aria-modal="true" aria-labelledby="seqed-modal-title"><div class="bmodal__head"><h3 id="seqed-modal-title">Crear secuencia</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body">
    <label class="field"><span>Nombre de la secuencia</span><input id="seqed-modal-name" value="${esc(state.name === BLANK_TITLE ? '' : state.name)}" placeholder="P. ej. Prospección instaladores" /></label>
    <label class="field"><span>Carpeta</span><select id="seqed-modal-folder"><option value="">Sin carpeta</option>${folders().map((f) => `<option value="${esc(f)}" ${f === state.folder ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    <fieldset class="seqed__excl"><legend>Criterios de exclusión</legend>${EXCLUSION_CRITERIA.map(([k, l]) => `<label class="snp__check"><input type="checkbox" data-mexcl="${k}" ${state.exclusion.includes(k) ? 'checked' : ''} /> ${esc(l)}</label>`).join('')}</fieldset>
  </div><div class="bmodal__foot"><button class="btn btn--primary" type="button" data-se="confirm-create">Crear secuencia</button><button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button></div></div>`;
  m.classList.add('is-open');
  $('seqed-modal-name').focus();
}
const closeModal = () => { const m = $('seqed-modal'); if (m) m.classList.remove('is-open'); };
function onModalClick(e) {
  if (e.target.closest('[data-bm="close"]')) { closeModal(); return; }
  if (!e.target.closest('[data-se="confirm-create"]')) return;
  const name = $('seqed-modal-name').value.trim();
  if (!name) { toast('Escribe el nombre de la secuencia.'); $('seqed-modal-name').focus(); return; }
  const exclusion = [...$('seqed-modal').querySelectorAll('[data-mexcl]:checked')].map((c) => c.dataset.mexcl);
  const s = createSequence({ name, description: state.description, folder: $('seqed-modal-folder').value, exclusion, steps: state.steps, templateKey: state.templateKey, dynamic: state.dynamic });
  if (!s) { toast('No se pudo crear la secuencia.'); return; }
  closeModal();
  Object.assign(state, { id: s.id, name: s.name, folder: s.folder, exclusion: s.exclusion, steps: s.steps, dirty: false });
  params.set('id', s.id); params.delete('template');
  history.replaceState(null, '', `?${params}`);
  render();
  toast(`Secuencia «${s.name}» creada`);
}
function save() {
  const s = updateSequence(state.id, { name: state.name, description: state.description, folder: state.folder, exclusion: state.exclusion, steps: state.steps });
  if (!s) { toast('Escribe el nombre de la secuencia.'); return; }
  state.dirty = false;
  renderBar();
  toast('Secuencia guardada');
}

// ---------- events ----------
root.addEventListener('click', (e) => {
  const pre = e.target.closest('[data-prebuilt]');
  if (pre) { loadTemplate(pre.dataset.prebuilt); render(); return; }
  const se = e.target.closest('[data-se]');
  if (se) {
    const a = se.dataset.se;
    if (a === 'blank') { Object.assign(state, { templateKey: '', name: BLANK_TITLE, description: '', exclusion: [], steps: [], dynamic: false, open: new Set(), adding: null }); render(); } else if (a === 'dynamic') { loadTemplate('dynamic'); render(); } else if (a === 'create') openCreateModal();
    else if (a === 'save') save();
    else if (a === 'cancel-add') { state.adding = null; renderFlow(); }
    return;
  }
  const addType = e.target.closest('[data-add-type]');
  if (addType) {
    const at = Number(addType.dataset.at);
    const st = newStep(addType.dataset.addType);
    if (at === 0) st.delayDays = 0;
    state.steps.splice(at, 0, st);
    if (at === 0 && state.steps[1]) state.steps[1].delayDays = state.steps[1].delayDays || 2;
    state.adding = null; state.open.add(st.id); state.dirty = true;
    if (state.name === BLANK_TITLE && !state.templateKey) state.description = '';
    renderFlow();
    return;
  }
  const addAt = e.target.closest('[data-add-at]');
  if (addAt) { state.adding = Number(addAt.dataset.addAt); renderFlow(); return; }
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) { const id = toggle.dataset.toggle; if (state.open.has(id)) state.open.delete(id); else state.open.add(id); renderFlow(); return; }
  const more = e.target.closest('[data-more]');
  if (more) { const id = more.dataset.more; if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id); renderFlow(); return; }
  const del = e.target.closest('[data-del]');
  if (del) { const i = state.steps.findIndex((x) => x.id === del.dataset.del); if (i >= 0) { state.steps.splice(i, 1); if (state.steps[0]) state.steps[0].delayDays = 0; state.dirty = true; renderFlow(); } return; }
  const delay = e.target.closest('[data-delay]');
  if (delay) { state.editingDelay = delay.dataset.delay; renderFlow(); const inp = root.querySelector('[data-delay-input]'); if (inp) inp.focus(); return; }
  const ok = e.target.closest('[data-delay-ok]');
  if (ok) { const inp = root.querySelector(`[data-delay-input="${ok.dataset.delayOk}"]`); const st = stepOf(ok.dataset.delayOk); if (st && inp) { st.delayDays = Math.max(0, Math.min(60, Number(inp.value) || 0)); state.dirty = true; } state.editingDelay = null; renderFlow(); return; }
  const tok = e.target.closest('[data-ins-token]');
  if (tok) { const body = root.querySelector(`[data-body="${tok.dataset.insToken}"]`); openTokenPicker({ anchor: tok, onPick: ({ token, defaultValue }) => { body.focus(); body.insertAdjacentHTML('beforeend', `${chipHtml(token, defaultValue, { short: true })} `); syncBody(body); } }); return; }
  const ph = e.target.closest('[data-ins-ph]');
  if (ph) { const name = (window.prompt('Nombre del marcador de posición (el remitente lo completa al inscribir)', 'X CONTENT') || '').trim().toUpperCase(); if (name) { const body = root.querySelector(`[data-body="${ph.dataset.insPh}"]`); body.insertAdjacentHTML('beforeend', `${phChip(name)} `); syncBody(body); } }
});
root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.subject) { const st = stepOf(t.dataset.subject); if (st) { st.subject = t.value; state.dirty = true; } } else if (t.dataset.title) { const st = stepOf(t.dataset.title); if (st) { st.title = t.value; state.dirty = true; } } else if (t.dataset.notes) { const st = stepOf(t.dataset.notes); if (st) { st.body = t.value; state.dirty = true; } } else if (t.dataset.body) syncBody(t);
  else if (t.id === 'seqed-name') { state.name = t.value; $('seqed-title').textContent = state.name || BLANK_TITLE; state.dirty = true; } else if (t.id === 'seqed-description') { state.description = t.value; state.dirty = true; }
});
root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.reply) { const st = stepOf(t.dataset.reply); if (st) { st.replyToPrevious = t.checked; state.dirty = true; renderFlow(); } } else if (t.dataset.excl) { state.exclusion = [...root.querySelectorAll('[data-excl]:checked')].map((c) => c.dataset.excl); refreshMetrics(); state.dirty = true; } else if (t.id === 'seqed-folder') { state.folder = t.value; state.dirty = true; } else if (t.dataset.delayInput) { const st = stepOf(t.dataset.delayInput); if (st) { st.delayDays = Math.max(0, Math.min(60, Number(t.value) || 0)); state.dirty = true; refreshMetrics(); } }
});
root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.delayInput) { e.preventDefault(); const ok = root.querySelector(`[data-delay-ok="${e.target.dataset.delayInput}"]`); if (ok) ok.click(); } });

// ---------- boot ----------
if (params.get('id')) {
  const s = sequenceById(params.get('id'));
  if (s) Object.assign(state, { id: s.id, name: s.name, description: s.description, folder: s.folder, exclusion: s.exclusion, steps: s.steps, templateKey: s.templateKey, dynamic: s.dynamic });
  else toast('Esa secuencia ya no existe.');
} else if (params.get('template')) loadTemplate(params.get('template'));
render();

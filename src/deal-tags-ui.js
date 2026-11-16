// Ajustes › Objetos › Negocios › Pipelines › «Etiquetas de Negocio»: the list (filter by pipeline, «Etiquetas
// usadas: X de 50», «Ver uso de etiquetas», «Crear etiqueta» with the presets) and the three-step side panel
// (Configuración de la etiqueta → Filtros → Revisión) that creates or edits a tag. The tags themselves and the
// evaluation engine live in src/deal-tags.js.
import { toast, wireMenus, closeMenus } from './shell.js';
import { dealPipelineDefs } from './data.js';
import { createFilterEditor } from './filter-editor.js';
import { ready, dealTags, tagById, createTag, updateTag, deleteTag, moveTag, tagsForPipeline, pipelineAssignment, pipelineNamesOf, usage, tagChipHtml, describeCondition, filterGroups, PRESETS, presetByKey, PALETTE, EMOJIS, MAX_TAGS } from './deal-tags.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (id) => document.getElementById(id);
const ui = { pipeline: '', page: 1, size: 10 };
const STEPS = [['setup', 'Configuración de la etiqueta'], ['filters', 'Filtros'], ['review', 'Revisión']];

// ---------- list pane ----------
const swatch = (t) => `<span class="dtags__swatch" style="--dtag:${esc(t.color)}" aria-hidden="true">${esc(t.emoji || '')}</span>`;
export function dealTagsPaneHtml() {
  const defs = dealPipelineDefs();
  const all = ui.pipeline ? tagsForPipeline(ui.pipeline) : dealTags();
  const pages = Math.max(1, Math.ceil(all.length / ui.size));
  if (ui.page > pages) ui.page = pages;
  const list = all.slice((ui.page - 1) * ui.size, ui.page * ui.size);
  return `<div id="dtags" class="dtags"><h3 class="dtags__title">Etiquetas de Negocio</h3>
    <div class="dtags__bar">
      <label class="dtags__filter">Filtrar por: <select id="dtags-pipeline" aria-label="Filtrar por pipeline"><option value="">Todos los pipelines</option>${defs.map((p) => `<option value="${esc(p.id)}" ${String(ui.pipeline) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <div class="dtags__right"><span class="dtags__count">Etiquetas usadas: <strong>${dealTags().length} de ${MAX_TAGS}</strong></span><button class="link-btn" type="button" data-dt="usage">Ver uso de etiquetas</button>
        <div class="menu"><button class="btn btn--primary" type="button" aria-haspopup="true" aria-expanded="false" ${dealTags().length >= MAX_TAGS ? 'disabled' : ''}>Crear etiqueta <span class="caret"></span></button><div class="menu__panel menu__panel--right dtags__presets"><div class="menu__note dtags__presets-title">Ajuste preestablecido</div>${PRESETS.map((p) => `<button class="menu__item dtags__preset" type="button" data-dt="preset" data-preset="${p.key}"><strong>${esc(p.name)}</strong><small class="muted">${esc(p.hint)}</small></button>`).join('')}<div class="menu__sep"></div><button class="menu__item dtags__scratch" type="button" data-dt="new">Crear desde cero</button></div></div></div>
    </div>
    <table class="mini-table stable dtags__table"><thead><tr><th></th><th>Nombre</th><th>Asignación de pipelines</th><th class="num">Acciones</th></tr></thead><tbody id="dtags-rows">
      ${list.length ? list.map((t, i) => `<tr data-tag="${esc(t.id)}"><td class="dtags__handle"><span class="pmoves"><button type="button" class="icon-btn icon-btn--sm" data-dt="move" data-dir="-1" data-id="${esc(t.id)}" ${i === 0 && ui.page === 1 ? 'disabled' : ''} aria-label="Subir">↑</button><button type="button" class="icon-btn icon-btn--sm" data-dt="move" data-dir="1" data-id="${esc(t.id)}" ${i === list.length - 1 && ui.page === pages ? 'disabled' : ''} aria-label="Bajar">↓</button></span></td><td><div class="dtags__name">${swatch(t)}<div><strong>${esc(t.name)}</strong>${t.description ? `<div class="muted">${esc(t.description)}</div>` : ''}</div></div></td><td>${esc(pipelineAssignment(t))}</td><td class="num"><button class="link-btn" type="button" data-dt="edit" data-id="${esc(t.id)}">Editar</button> <button class="link-btn dtags__danger" type="button" data-dt="remove" data-id="${esc(t.id)}">Eliminar</button></td></tr>`).join('') : `<tr><td colspan="4"><div class="tpls__empty">${ui.pipeline ? 'Ninguna etiqueta se aplica a este pipeline.' : 'Todavía no hay etiquetas de negocio. Crea la primera con «Crear etiqueta».'}</div></td></tr>`}
    </tbody></table>
    <div class="dtags__pager"><button class="link-btn" type="button" data-dt="page" data-page="${ui.page - 1}" ${ui.page <= 1 ? 'disabled' : ''}>‹ Anterior</button><span class="dtags__pagenum">${ui.page}</span><button class="link-btn" type="button" data-dt="page" data-page="${ui.page + 1}" ${ui.page >= pages ? 'disabled' : ''}>Siguiente ›</button><select id="dtags-size" aria-label="Por página">${[10, 25, 50].map((n) => `<option value="${n}" ${ui.size === n ? 'selected' : ''}>${n} por página</option>`).join('')}</select></div>
  </div>`;
}
// Inside a pipeline's editor: the tags that apply to it.
export function pipelineTagsHtml(pipeline) {
  const list = tagsForPipeline(pipeline.id);
  return `<div id="dtags" class="dtags dtags--pipe"><h3>Etiquetas de Negocio</h3><p class="muted">Etiquetas que se aplican a los negocios de «${esc(pipeline.name)}» (las de todos los pipelines y las asignadas a este). Se evalúan automáticamente con sus filtros.</p>
    <ul class="dtags__list">${list.length ? list.map((t) => `<li>${tagChipHtml(t)} <span class="muted">${esc(t.description || '')}</span> <button class="link-btn" type="button" data-dt="edit" data-id="${esc(t.id)}">Editar</button></li>`).join('') : '<li class="muted">Ninguna etiqueta se aplica a este pipeline todavía.</li>'}</ul>
    <p><button class="btn btn--secondary btn--sm" type="button" data-dt="new" data-pipeline="${esc(pipeline.id)}">Crear etiqueta</button></p></div>`;
}

// ---------- mount ----------
let rerenderPane = null;
export function mountDealTags(container, { rerender } = {}) {
  if (!container) return;
  rerenderPane = rerender || (() => { const tmp = document.createElement('div'); tmp.innerHTML = container.classList.contains('dtags--pipe') ? container.innerHTML : dealTagsPaneHtml(); if (!container.classList.contains('dtags--pipe')) container.innerHTML = tmp.firstElementChild.innerHTML; wireMenus(container); });
  if (!container.dataset.dtWired) {
    container.dataset.dtWired = '1';
    container.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dt]');
      if (!b) return;
      const a = b.dataset.dt;
      closeMenus();
      if (a === 'preset') openDealTagWizard({ preset: b.dataset.preset });
      else if (a === 'new') openDealTagWizard({ pipelineId: b.dataset.pipeline || '' });
      else if (a === 'edit') openDealTagWizard({ tagId: b.dataset.id });
      else if (a === 'remove') { const t = tagById(b.dataset.id); if (!t) return; openModal('Eliminar etiqueta', `<p>¿Seguro que quieres eliminar la etiqueta <strong>${esc(t.name)}</strong>? Dejará de mostrarse en los negocios que la cumplen.</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-dtm="confirm-remove" data-id="${esc(t.id)}">Eliminar</button><button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button>`, { onAction: (act) => { if (act === 'confirm-remove') { deleteTag(t.id); closeModal(); rerenderPane(); toast(`Etiqueta «${t.name}» eliminada`); } } }); } else if (a === 'move') { moveTag(b.dataset.id, Number(b.dataset.dir)); rerenderPane(); } else if (a === 'page') { ui.page = Math.max(1, Number(b.dataset.page) || 1); rerenderPane(); } else if (a === 'usage') openUsage();
    });
    container.addEventListener('change', (e) => {
      if (e.target.id === 'dtags-pipeline') { ui.pipeline = e.target.value; ui.page = 1; rerenderPane(); } else if (e.target.id === 'dtags-size') { ui.size = Number(e.target.value) || 10; ui.page = 1; rerenderPane(); }
    });
    document.addEventListener('crm:deal-tags', () => { if (container.isConnected) rerenderPane(); });
  }
  wireMenus(container);
}

// ---------- generic modal (usage, delete) ----------
let modalAction = null;
function openModal(title, body, foot, { onAction = null, size = '' } = {}) {
  let m = $('dtag-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal bmodal--top';
    m.id = 'dtag-modal';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); closeModal(); return; } const b = e.target.closest('[data-dtm]'); if (b && modalAction) modalAction(b.dataset.dtm, b); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeModal(); });
  }
  modalAction = onAction;
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel${size ? ` bmodal__panel--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="dtag-modal-title"><div class="bmodal__head"><h3 id="dtag-modal-title">${esc(title)}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body" id="dtag-modal-body">${body}</div><div class="bmodal__foot" id="dtag-modal-foot">${foot}</div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  return m;
}
function closeModal() { const m = $('dtag-modal'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } modalAction = null; }
function openUsage() {
  const rows = usage();
  openModal('Uso de etiquetas', `<p class="muted">Negocios que cumplen ahora mismo los filtros de cada etiqueta.</p><table class="mini-table stable dtags__usage"><thead><tr><th>Etiqueta</th><th>Pipelines</th><th class="num">Negocios</th></tr></thead><tbody>${rows.length ? rows.map(({ tag, count }) => `<tr data-usage="${esc(tag.id)}"><td>${tagChipHtml(tag)}</td><td>${esc(pipelineAssignment(tag))}</td><td class="num"><strong>${count}</strong></td></tr>`).join('') : '<tr><td colspan="3" class="muted">Sin etiquetas.</td></tr>'}</tbody></table>`, '<button class="btn btn--secondary" type="button" data-bm="close">Cerrar</button>', { size: 'wide' });
}

// ---------- the side panel (3 steps) ----------
let wiz = null;
let filterEditor = null;
export const wizardState = () => (wiz ? { ...wiz } : null);
export async function openDealTagWizard({ preset = '', tagId = '', pipelineId = '' } = {}) {
  await ready;
  const existing = tagId ? tagById(tagId) : null;
  const p = preset ? presetByKey(preset) : null;
  if (!existing && dealTags().length >= MAX_TAGS) { toast(`Has alcanzado el límite de ${MAX_TAGS} etiquetas.`); return null; }
  wiz = existing
    ? { id: existing.id, step: 0, name: existing.name, emoji: existing.emoji, color: existing.color, description: existing.description, pipelineMode: existing.pipelineIds.length ? 'specific' : 'all', pipelineIds: existing.pipelineIds.slice(), filters: JSON.parse(JSON.stringify(existing.filters)), editing: false, error: '' }
    : { id: null, step: 0, name: p ? p.name : '', emoji: p ? p.emoji : '', color: p ? p.color : PALETTE[2][0], description: p ? p.hint : '', pipelineMode: pipelineId ? 'specific' : 'all', pipelineIds: pipelineId ? [pipelineId] : [], filters: p ? JSON.parse(JSON.stringify(p.filters)) : [], editing: false, error: '', preset: p ? p.key : '' };
  let d = $('dtag-drawer');
  if (!d) {
    d = document.createElement('div');
    d.className = 'drawer dtag';
    d.id = 'dtag-drawer';
    d.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d);
    d.addEventListener('click', onWizardClick);
    d.addEventListener('input', onWizardInput);
    d.addEventListener('change', onWizardInput);
    d.addEventListener('submit', (e) => { e.preventDefault(); next(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.classList.contains('is-open')) closeDealTagWizard(); });
  }
  d.classList.add('is-open');
  d.setAttribute('aria-hidden', 'false');
  renderWizard();
  return d;
}
export function closeDealTagWizard() { const d = $('dtag-drawer'); if (d) { d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true'); } wiz = null; filterEditor = null; }
const progressHtml = () => `<ol class="dtag__steps" aria-label="Pasos">${STEPS.map(([k, l], i) => `<li class="dtag__step${i < wiz.step ? ' is-done' : i === wiz.step ? ' is-active' : ''}" data-step="${k}"><span class="dtag__dot" aria-hidden="true">${i < wiz.step ? '✓' : ''}</span><span class="dtag__steplbl">${l}</span></li>`).join('')}</ol>`;
const groupsHtml = (filters) => {
  const groups = filterGroups(filters);
  if (!groups.length) return '';
  return groups.map((g, gi) => `<section class="dtag__group" data-group="${gi}"><strong class="dtag__grouptitle">Grupo ${gi + 1}</strong>${g.map((c, ci) => { const dsc = describeCondition(c); return `${ci > 0 ? '<div class="dtag__and">y</div>' : ''}<div class="dtag__cond"><strong>${esc(dsc.label)}</strong> ${esc(dsc.op)}${dsc.value ? ` <strong>${esc(dsc.value)}</strong>` : ''}</div>`; }).join('')}</section>`).join('<div class="dtag__or">o</div>');
};
const previewHtml = () => `<div class="dtag__preview"><div class="dtag__card"><span class="dtag__cardname">Nombre de negocio</span><span class="dtag__cardprop">Propiedad:</span><span class="dtag__cardprop">Propiedad:</span><hr />${tagChipHtml({ name: wiz.name || 'Etiqueta', emoji: wiz.emoji, color: wiz.color, description: wiz.description })}</div></div>`;
function renderWizard() {
  const d = $('dtag-drawer');
  if (!d || !wiz) return;
  const defs = dealPipelineDefs();
  const title = wiz.id ? 'Editar etiqueta de negocio' : 'Agregar etiqueta de negocio';
  let body = '';
  let foot = '';
  if (wiz.step === 0) {
    body = `<form id="dtag-form" novalidate><h3>Configuración de la etiqueta</h3>
      <label class="field dtag__namefield"><span>Nombre <abbr class="snp__req" title="Obligatorio">*</abbr></span><div class="dtag__namerow"><input id="dt-name" value="${esc(wiz.name)}" maxlength="60" placeholder="P. ej. Negocios importantes" required />
        <div class="menu dtag__emojimenu"><button class="dtag__emojibtn" type="button" aria-haspopup="true" aria-expanded="false" title="Seleccionar emoji" aria-label="Seleccionar emoji">${wiz.emoji ? esc(wiz.emoji) : '☺'}</button><div class="menu__panel menu__panel--right dtag__emojis"><button class="dtag__emoji" type="button" data-dt-emoji="">Sin emoji</button>${EMOJIS.map((e) => `<button class="dtag__emoji${wiz.emoji === e ? ' is-active' : ''}" type="button" data-dt-emoji="${esc(e)}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}</div></div>
        <div class="menu dtag__colormenu"><button class="dtag__colorbtn" type="button" style="--dtag:${esc(wiz.color)}" aria-haspopup="true" aria-expanded="false" title="Selector de colores" aria-label="Selector de colores"></button><div class="menu__panel menu__panel--right dtag__colors">${PALETTE.map(([c, l]) => `<button class="dtag__color${wiz.color === c ? ' is-active' : ''}" type="button" data-dt-color="${c}" style="--dtag:${c}" title="${esc(l)}" aria-label="${esc(l)}"></button>`).join('')}</div></div>
      </div></label>
      <label class="field"><span>Descripción</span><textarea id="dt-desc" rows="3" maxlength="200" placeholder="¿Qué significa esta etiqueta?">${esc(wiz.description)}</textarea></label>
      <fieldset class="dtag__pipes"><legend>Pipeline <abbr class="snp__req" title="Obligatorio">*</abbr></legend>
        <label class="dtag__radio"><input type="radio" name="dt-pipe" value="all" ${wiz.pipelineMode === 'all' ? 'checked' : ''} /> Todos los pipelines</label>
        <label class="dtag__radio"><input type="radio" name="dt-pipe" value="specific" ${wiz.pipelineMode === 'specific' ? 'checked' : ''} /> Pipelines específicos</label>
        <div class="dtag__pipelist" id="dt-pipelist" ${wiz.pipelineMode === 'specific' ? '' : 'hidden'}>${defs.map((p) => `<label class="snp__check"><input type="checkbox" data-dt-pipe="${esc(p.id)}" ${wiz.pipelineIds.some((id) => String(id) === String(p.id)) ? 'checked' : ''} /> ${esc(p.name)}</label>`).join('')}</div>
      </fieldset>
      <div class="snp__error" id="dt-err" ${wiz.error ? 'role="alert"' : 'hidden'}>${esc(wiz.error)}</div></form>`;
    foot = '<span class="dtag__spacer"></span><button class="btn btn--primary" type="button" data-dt-go="next">Siguiente: Agregar filtros ›</button>';
  } else if (wiz.step === 1) {
    const has = wiz.filters.some((c) => c.key);
    body = `<div class="dtag__filtershead"><h3>Filtros</h3>${wiz.editing ? '<button class="btn btn--secondary btn--sm" type="button" data-dt-go="done-filters">Listo</button>' : `<button class="btn btn--secondary btn--sm" type="button" data-dt-go="edit-filters">Editar filtros</button>`}</div>
      ${wiz.editing ? '<p class="muted" id="dt-filters-summary"></p><div class="adv__groups dtag__editor" id="dt-filters-editor"></div><p><button class="link-btn" type="button" data-dt-go="add-group">+ Agregar grupo (O)</button></p>' : has ? `<div class="dtag__groups">${groupsHtml(wiz.filters)}</div>` : '<div class="dtag__empty"><p>Esta etiqueta no tiene ningún filtro</p><button class="btn btn--primary" type="button" data-dt-go="edit-filters">+ Agregar filtro</button></div>'}
      <div class="snp__error" id="dt-err" ${wiz.error ? 'role="alert"' : 'hidden'}>${esc(wiz.error)}</div>`;
    foot = '<button class="btn btn--secondary" type="button" data-dt-go="back">‹ Atrás: Configuración de la etiqueta</button><span class="dtag__spacer"></span><button class="btn btn--primary" type="button" data-dt-go="next">Siguiente: Revisar etiqueta ›</button>';
  } else {
    body = `<h3>Vista previa de la etiqueta de negocio</h3>${previewHtml()}
      <h3>Configuración de la etiqueta</h3>
      <dl class="dtag__summary">
        <div><dt>Nombre</dt><dd>${esc(wiz.name)}</dd></div>
        <div><dt>Descripción</dt><dd>${wiz.description ? esc(wiz.description) : '<span class="muted">--</span>'}</dd></div>
        <div><dt>Pipeline</dt><dd>${wiz.pipelineMode === 'specific' && wiz.pipelineIds.length ? `Pipelines específicos: ${pipelineNamesOf({ pipelineIds: wiz.pipelineIds }).map((n) => `<span class="chip chip--sm">${esc(n)}</span>`).join(' ')}` : 'Todos los pipelines'}</dd></div>
      </dl>
      <h3>Filtros</h3>${wiz.filters.some((c) => c.key) ? `<div class="dtag__groups">${groupsHtml(wiz.filters)}</div>` : '<p class="muted">Sin filtros: la etiqueta no se aplicará a ningún negocio hasta que los definas.</p>'}`;
    foot = `<button class="btn btn--secondary" type="button" data-dt-go="back">‹ Atrás: Agregar filtros</button><span class="dtag__spacer"></span><button class="btn btn--primary" type="button" data-dt-go="save">Guardar</button>`;
  }
  d.innerHTML = `<div class="drawer__panel dtag__panel" role="dialog" aria-modal="true" aria-labelledby="dtag-title"><div class="drawer__head drawer__head--light"><h2 id="dtag-title">${title}</h2><button class="drawer__close" type="button" data-dt-go="close" aria-label="Cerrar">×</button></div><div class="drawer__body dtag__body">${progressHtml()}${body}</div><div class="drawer__foot dtag__foot">${foot}</div></div>`;
  wireMenus(d);
  if (wiz.step === 1 && wiz.editing) {
    filterEditor = createFilterEditor({ type: 'deals', container: $('dt-filters-editor'), summary: $('dt-filters-summary'), get: () => wiz.filters, set: (c) => { wiz.filters = c; }, singular: 'Negocio' });
    filterEditor.render();
  } else filterEditor = null;
  if (wiz.step === 0) { const n = $('dt-name'); if (n) n.focus(); }
}
function readStep0() {
  const name = ($('dt-name') || { value: wiz.name }).value;
  wiz.name = String(name || '').trim();
  wiz.description = ($('dt-desc') || { value: wiz.description }).value.trim();
  const mode = document.querySelector('#dtag-drawer [name="dt-pipe"]:checked');
  if (mode) wiz.pipelineMode = mode.value;
  wiz.pipelineIds = [...document.querySelectorAll('#dtag-drawer [data-dt-pipe]:checked')].map((i) => i.dataset.dtPipe);
}
function next() {
  if (!wiz) return;
  if (wiz.step === 0) {
    readStep0();
    if (!wiz.name) { wiz.error = 'Escribe el nombre de la etiqueta.'; renderWizard(); return; }
    if (wiz.pipelineMode === 'specific' && !wiz.pipelineIds.length) { wiz.error = 'Elige al menos un pipeline o selecciona «Todos los pipelines».'; renderWizard(); return; }
    wiz.error = ''; wiz.step = 1; renderWizard();
  } else if (wiz.step === 1) {
    wiz.filters = wiz.filters.filter((c) => c.key);
    wiz.editing = false; wiz.error = ''; wiz.step = 2; renderWizard();
  }
}
function save() {
  const data = { name: wiz.name, emoji: wiz.emoji, color: wiz.color, description: wiz.description, pipelineIds: wiz.pipelineMode === 'specific' ? wiz.pipelineIds : [], filters: wiz.filters.filter((c) => c.key) };
  const t = wiz.id ? updateTag(wiz.id, data) : createTag(data);
  if (!t) { toast('No se pudo guardar la etiqueta.'); return; }
  const editing = Boolean(wiz.id);
  closeDealTagWizard();
  if (rerenderPane) rerenderPane();
  toast(editing ? `Etiqueta «${t.name}» actualizada` : `Etiqueta «${t.name}» creada`);
}
function onWizardClick(e) {
  if (!wiz) return;
  const em = e.target.closest('[data-dt-emoji]');
  if (em) { wiz.emoji = em.dataset.dtEmoji; closeMenus(); readStep0(); renderWizard(); return; }
  const col = e.target.closest('[data-dt-color]');
  if (col) { wiz.color = col.dataset.dtColor; closeMenus(); readStep0(); renderWizard(); return; }
  const go = e.target.closest('[data-dt-go]');
  if (!go) return;
  const a = go.dataset.dtGo;
  if (a === 'close') closeDealTagWizard();
  else if (a === 'next') next();
  else if (a === 'back') { if (wiz.step === 1) { wiz.filters = wiz.filters.filter((c) => c.key); wiz.editing = false; } wiz.step = Math.max(0, wiz.step - 1); wiz.error = ''; renderWizard(); } else if (a === 'edit-filters') { wiz.editing = true; renderWizard(); } else if (a === 'done-filters') { wiz.filters = wiz.filters.filter((c) => c.key); wiz.editing = false; renderWizard(); } else if (a === 'add-group') { if (filterEditor) filterEditor.addGroup(); } else if (a === 'save') save();
}
function onWizardInput(e) {
  if (!wiz) return;
  const t = e.target;
  if (t.name === 'dt-pipe') { wiz.pipelineMode = t.value; const l = $('dt-pipelist'); if (l) l.hidden = t.value !== 'specific'; } else if (t.id === 'dt-name') wiz.name = t.value;
  else if (t.id === 'dt-desc') wiz.description = t.value;
}

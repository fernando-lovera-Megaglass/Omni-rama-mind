import { pagination, bindPagination } from './pagination.js';
import './filter-chip.js';
// Automatización › Workflows: the tabs (Vista general / Workflows / Análisis / Estado), the Workflows list
// with its views as chips, folders, filters, multi-select table (25 per page) and per-row actions, the
// "Revisar problemas de automatización" review and the "Crear workflow" menu (desde cero / plantilla / IA /
// nuevo creador) that opens the editor.
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { relativeTimeFine, formatDate } from './data.js';
import { ready, workflows, deletedWorkflows, workflowById, creators, folders, createFolder, views, saveView, deleteView, issues, needsReview, problemsOf, createWorkflow, cloneWorkflow, deleteWorkflows, restoreWorkflows, moveWorkflows, unpublish, matchingRecords, analytics, health, performance, enrollmentsOf, TEMPLATES, draftFromPrompt, OBJECT_TYPES, OBJECT_LABEL, STATUS_LABELS, ACTION_DEFS, ACTION_CATALOG, ENROLL_CAP } from './workflows-data.js';
import { ready as engineReady, publishWorkflow, ESTADO_LABELS } from './workflow-engine.js';

boot({ root: '../', active: 'automation', sub: 'Workflows', title: 'Workflows' });
await ready;
await engineReady;
const enrollmentTag = (e) => { const key = e.estado || (e.status === 'failed' ? 'failed' : e.status === 'in_progress' ? 'active' : e.status === 'cancelled' ? 'cancelled' : 'completed'); return `<span class="tag ${key === 'failed' || key === 'cancelled' ? 'tag--none' : key === 'completed' ? 'tag--done' : 'tag--new'}">${esc(ESTADO_LABELS[key] || key)}</span>`; };

const root = document.getElementById('wf-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TABS = [['overview', 'Vista general'], ['workflows', 'Workflows'], ['analyze', 'Análisis'], ['health', 'Estado']];
const EMPTY_FILTERS = { status: '', object: '', creator: '', folder: '', created: '', action: '' };
const state = { tab: TABS.some((t) => t[0] === params.get('tab')) ? params.get('tab') : 'workflows', view: 'all', filters: { ...EMPTY_FILTERS }, q: '', page: 1, size: 25, selected: new Set(), foldersOpen: false };
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const pct = (x) => `${Math.round(x * 100)} %`;
const statusHtml = (w) => `<span class="wfl__status wfl__status--${esc(w.status)}"><span class="cem__dot" aria-hidden="true"></span>${esc(STATUS_LABELS[w.status] || w.status)}</span>`;

root.innerHTML = `
  <div class="tpls wfl">
    <header class="tpls__head"><h1 class="page-title">Automatización</h1></header>
    <nav class="seqs__tabs" role="tablist" aria-label="Secciones">${TABS.map(([k, l]) => `<button class="seqs__tab${state.tab === k ? ' is-active' : ''}" type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`).join('')}</nav>
    <div id="wf-tab"></div>
  </div>`;
const page = root.querySelector('.wfl');

// ---------- Workflows tab ----------
function baseList() {
  if (state.view === 'deleted') return deletedWorkflows();
  if (state.view === 'review') return workflows().filter(needsReview);
  return workflows();
}
function effectiveFilters() {
  const v = views().find((x) => x.id === state.view);
  return v ? { ...EMPTY_FILTERS, ...v.filters, ...Object.fromEntries(Object.entries(state.filters).filter(([, val]) => val)) } : state.filters;
}
function visible() {
  const f = effectiveFilters();
  const q = state.q.trim().toLowerCase();
  const since = f.created ? Date.now() - Number(f.created) * 86400000 : null;
  return baseList().filter((w) => (!f.status || w.status === f.status) && (!f.object || w.objectType === f.object) && (!f.creator || w.createdBy === f.creator) && (!f.folder || (w.folder || '') === f.folder) && (since === null || new Date(w.createdAt).getTime() >= since) && (!f.action || w.actions.some((a) => a.type === f.action)) && (!q || `${w.name} ${w.description}`.toLowerCase().includes(q)));
}
function renderWorkflows() {
  const all = workflows();
  const list = visible();
  const pages = Math.max(1, Math.ceil(list.length / state.size));
  if (state.page > pages) state.page = pages;
  const rows = list.slice((state.page - 1) * state.size, state.page * state.size);
  const f = state.filters;
  const n = state.selected.size;
  const issueCount = issues().length;
  const chip = (id, label, extra = '') => `<button class="chip wfl__view${state.view === id ? ' is-active' : ''}" type="button" data-view="${esc(id)}">${label}${extra}</button>`;
  const folderCount = (name) => all.filter((w) => (w.folder || '') === name).length;
  $('wf-tab').innerHTML = `
    <div class="wfl__bar">
      <div class="wfl__views" id="wf-views">
        ${chip('all', `Todos los workflows (${all.length})`)}${chip('deleted', `Eliminado${deletedWorkflows().length ? ` (${deletedWorkflows().length})` : ''}`)}${chip('review', `Revisión necesaria (${workflows().filter(needsReview).length})`)}
        ${views().map((v) => chip(v.id, esc(v.name), ` <span class="wfl__viewdel" data-view-del="${esc(v.id)}" title="Quitar vista">×</span>`)).join('')}
        <button class="link-btn wfl__addview" type="button" data-wa="add-view">+ Agregar vista</button>
        <div class="menu"><button class="link-btn" type="button" aria-haspopup="true">Todas las vistas <span class="caret"></span></button><div class="menu__panel">${[['all', 'Todos los workflows'], ['deleted', 'Eliminado'], ['review', 'Revisión necesaria'], ...views().map((v) => [v.id, v.name])].map(([id, l]) => `<button class="menu__item" type="button" data-view="${esc(id)}">${esc(l)}</button>`).join('')}</div></div>
        <button class="btn btn--secondary btn--sm${state.foldersOpen ? ' is-on' : ''}" type="button" data-wa="folders" aria-expanded="${state.foldersOpen}">Carpetas</button>
      </div>
      <div class="wfl__actions">
        <button class="btn btn--secondary" type="button" data-wa="issues">Revisar problemas de automatización <span class="wfl__badge${issueCount ? '' : ' is-zero'}">${issueCount}</span></button>
        <div class="menu"><button class="btn btn--primary" type="button" aria-haspopup="true">Crear workflow <span class="caret"></span></button><div class="menu__panel menu__panel--right">
          <button class="menu__item" type="button" data-wa="new-blank">Desde cero</button>
          <button class="menu__item" type="button" data-wa="new-template">Desde plantilla</button>
          <button class="menu__item" type="button" data-wa="new-ai">Con IA</button>
          <button class="menu__item" type="button" data-wa="new-builder">Con el nuevo creador</button>
        </div></div>
      </div>
    </div>
    ${state.foldersOpen ? `<div class="wfl__folders" id="wf-folders"><strong>Carpetas</strong>${[['', 'Sin carpeta'], ...folders().map((x) => [x, x])].map(([val, l]) => `<button class="tpls__folder${f.folder === val && (val || state.filters.folder === '') && state.filters.folder === val && (val !== '' || state.foldersPicked === '') ? ' is-active' : ''}" type="button" data-folder="${esc(val)}"><span>${esc(l)}</span><span class="muted">${folderCount(val)}</span></button>`).join('')}<button class="link-btn" type="button" data-wa="new-folder">+ Nueva carpeta</button></div>` : ''}
    <div class="wfl__filters">
      <filter-chip id="wf-status" aria-label="Activado o Desactivado"><template><option value="">Cualquiera</option><option value="published" ${f.status === 'published' ? 'selected' : ''}>Activado</option><option value="off" ${f.status === 'off' ? 'selected' : ''}>Desactivado</option><option value="draft" ${f.status === 'draft' ? 'selected' : ''}>Borrador</option></template></filter-chip>
      <filter-chip id="wf-object" aria-label="Tipo de objeto"><template><option value="">Cualquiera</option>${OBJECT_TYPES.map(([k, l]) => `<option value="${k}" ${f.object === k ? 'selected' : ''}>${l}</option>`).join('')}</template></filter-chip>
      <filter-chip id="wf-creator" aria-label="Creado por" owner><template><option value="">Cualquiera</option>${creators().map((c) => `<option value="${esc(c)}" ${f.creator === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</template></filter-chip>
      <filter-chip id="wf-folder" aria-label="Carpeta"><template><option value="">Cualquiera</option>${folders().map((x) => `<option value="${esc(x)}" ${f.folder === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</template></filter-chip>
      <filter-chip id="wf-created" aria-label="Creado en"><template><option value="">Cualquiera</option>${[['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['365', 'Último año']].map(([k, l]) => `<option value="${k}" ${f.created === k ? 'selected' : ''}>${l}</option>`).join('')}</template></filter-chip>
      <filter-chip id="wf-action" aria-label="Tipo de acción"><template><option value="">Cualquiera</option>${ACTION_CATALOG.map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([t, l]) => `<option value="${t}" ${f.action === t ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</template></filter-chip>
      <button class="link-btn" type="button" data-wa="advanced">Filtros avanzados</button>
      <div class="search search--sm wfl__search"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="wf-q" placeholder="Buscar workflows" aria-label="Buscar workflows" value="${esc(state.q)}" /></div>
      <div class="tpls__bulk">${n ? `<span>${plural(n, 'seleccionado', 'seleccionados')}</span><button class="btn btn--secondary btn--sm" type="button" data-wa="bulk-move">Mover a carpeta</button><button class="btn btn--secondary btn--sm" type="button" data-wa="bulk-delete">Eliminar</button>` : ''}</div>
    </div>
    <section class="tpls__main">
      <div class="table-wrap"><table class="table tpls__table wfl__table">
        <thead><tr><th class="table__check"><input type="checkbox" id="wf-check-all" aria-label="Seleccionar todo" ${rows.length && rows.every((w) => state.selected.has(w.id)) ? 'checked' : ''} /></th><th>Nombre</th><th>Estado del workflow publicado</th><th>Carpeta</th><th>Descripción</th><th>Tipo de objeto</th></tr></thead>
        <tbody id="wf-rows">${rows.length ? rows.map((w) => `
          <tr data-id="${esc(w.id)}">
            <td class="table__check"><input type="checkbox" data-sel="${esc(w.id)}" aria-label="Seleccionar ${esc(w.name)}" ${state.selected.has(w.id) ? 'checked' : ''} /></td>
            <td><div class="name"><a class="tpls__name" href="editor/?id=${esc(w.id)}">${esc(w.name)}</a>${needsReview(w) ? '<span class="tag tag--new">Revisar</span>' : ''}
              <div class="menu tpls__rowmenu"><button class="link-btn" type="button" aria-haspopup="true">Acciones <span class="caret"></span></button><div class="menu__panel">${state.view === 'deleted' ? `<button class="menu__item" type="button" data-act="restore" data-id="${esc(w.id)}">Restaurar</button>` : `
                <a class="menu__item" href="editor/?id=${esc(w.id)}">Editar</a>
                <button class="menu__item" type="button" data-act="clone" data-id="${esc(w.id)}">Clonar</button>
                <button class="menu__item" type="button" data-act="move" data-id="${esc(w.id)}">Mover a carpeta</button>
                <button class="menu__item" type="button" data-act="${w.status === 'published' ? 'unpublish' : 'publish'}" data-id="${esc(w.id)}">${w.status === 'published' ? 'Desactivar' : 'Activar'}</button>
                <div class="menu__sep"></div>
                <button class="menu__item menu__item--danger" type="button" data-act="delete" data-id="${esc(w.id)}">Eliminar</button>`}</div></div></div></td>
            <td>${statusHtml(w)}</td><td>${esc(w.folder || '--')}</td><td class="wfl__desc" title="${esc(w.description)}">${esc(w.description || '--')}</td><td>${esc(OBJECT_LABEL[w.objectType] || w.objectType)}</td>
          </tr>`).join('') : `<tr><td colspan="6"><div class="tpls__empty">${state.view === 'deleted' ? 'No hay workflows eliminados.' : all.length ? 'Ningún workflow coincide con los filtros.' : 'Todavía no hay workflows. Crea el primero con «Crear workflow».'}</div></td></tr>`}</tbody>
      </table></div>
      ${pagination({ page: state.page, pages, size: state.size })}
    </section>`;
  bindPagination(page, ({ page: next, size }) => { state.page = next; if (size) state.size = size; closeMenus(); renderWorkflows(); });
  wireMenus(page);
}

// ---------- other tabs ----------
const card = (label, value, sub = '') => `<div class="seqan__card"><div class="seqan__label">${label}</div><div class="seqan__value">${value}</div>${sub ? `<div class="seqan__sub muted">${sub}</div>` : ''}</div>`;
function renderOverview() {
  const a = analytics();
  const recent = workflows().flatMap((w) => enrollmentsOf(w.id).map((e) => ({ ...e, workflow: w.name }))).sort((x, y) => new Date(y.enrolledAt) - new Date(x.enrolledAt)).slice(0, 8);
  $('wf-tab').innerHTML = `
    <section class="seqan">
      <div class="seqan__cards">${card('WORKFLOWS', a.workflows, `${a.published} publicados`)}${card('INSCRIPCIONES (30 DÍAS)', a.enrollments30)}${card('ACCIONES EJECUTADAS', a.actionsRun)}${card('INSCRIPCIONES FALLIDAS', a.failed)}${card('PROBLEMAS', issues().length, issues().length ? 'revisión necesaria' : 'todo en orden')}</div>
      <h2 class="seqan__h">Últimas inscripciones</h2>
      <div class="tpls__main"><div class="table-wrap"><table class="table tpls__table wfl__table"><thead><tr><th>Registro</th><th>Workflow</th><th>Estado</th><th>Acciones</th><th>Inscrito</th></tr></thead><tbody>${recent.length ? recent.map((e) => `<tr><td><a class="tpls__name" href="../${esc(e.objectType)}/record/?id=${esc(e.recordId)}">${esc(e.recordName)}</a></td><td>${esc(e.workflow)}</td><td>${enrollmentTag(e)}</td><td>${e.actionsRun}</td><td>${esc(relativeTimeFine(e.enrolledAt))}</td></tr>`).join('') : '<tr><td colspan="5"><div class="tpls__empty">Sin inscripciones todavía.</div></td></tr>'}</tbody></table></div></div>
    </section>`;
}
function renderAnalyze() {
  const a = analytics();
  $('wf-tab').innerHTML = `
    <section class="seqan">
      <div class="seqan__cards seqan__cards--4">${card('WORKFLOWS PUBLICADOS', a.published, `de ${a.workflows}`)}${card('INSCRIPCIONES (30 DÍAS)', a.enrollments30)}${card('ACCIONES EJECUTADAS', a.actionsRun)}${card('TASA DE ÉXITO', pct(a.perWorkflow.length ? a.perWorkflow.reduce((s, w) => s + w.successRate, 0) / a.perWorkflow.length : 0))}</div>
      <h2 class="seqan__h">Por workflow</h2>
      <div class="tpls__main"><div class="table-wrap"><table class="table tpls__table wfl__table"><thead><tr><th>Nombre</th><th>Tipo de objeto</th><th>Inscripciones</th><th>Acciones ejecutadas</th><th>Tasa de éxito</th><th>Estado</th></tr></thead><tbody>${a.perWorkflow.map((w) => `<tr><td><a class="tpls__name" href="editor/?id=${esc(w.id)}">${esc(w.name)}</a></td><td>${esc(OBJECT_LABEL[w.objectType])}</td><td>${w.enrollments}</td><td>${w.actionsRun}</td><td>${pct(w.successRate)}</td><td>${statusHtml(w)}</td></tr>`).join('')}</tbody></table></div></div>
      <h2 class="seqan__h">Por tipo de objeto</h2>
      <div class="seqan__cards seqan__cards--4">${a.byObject.map((o) => card(o.label.toUpperCase(), o.workflows, `${plural(o.enrollments, 'inscripción', 'inscripciones')}`)).join('')}</div>
    </section>`;
}
function renderHealth() {
  const list = health();
  $('wf-tab').innerHTML = `
    <section class="tpls__main"><div class="table-wrap"><table class="table tpls__table wfl__table"><thead><tr><th>Nombre</th><th>Estado</th><th>Última ejecución</th><th>Inscripciones</th><th>Problemas</th></tr></thead><tbody>${list.map((w) => `<tr><td><a class="tpls__name" href="editor/?id=${esc(w.id)}">${esc(w.name)}</a></td><td><span class="tag ${w.state === 'ok' ? 'tag--done' : w.state === 'review' ? 'tag--new' : 'tag--none'}">${w.state === 'ok' ? 'Funciona' : w.state === 'review' ? 'Revisar' : 'Sin publicar'}</span></td><td>${w.lastRun ? esc(relativeTimeFine(w.lastRun)) : '--'}</td><td>${w.enrollments}</td><td class="wfl__desc">${w.problems.length ? esc(w.problems.join(' · ')) : '<span class="muted">Ninguno</span>'}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function render() {
  page.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === state.tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
  if (state.tab === 'overview') renderOverview(); else if (state.tab === 'analyze') renderAnalyze(); else if (state.tab === 'health') renderHealth(); else renderWorkflows();
}

// ---------- modal ----------
function modal(title, body, foot, { size = '' } = {}) {
  let m = $('wf-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal';
    m.id = 'wf-modal';
    root.appendChild(m);
    m.addEventListener('click', onModalClick);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeModal(); });
  }
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel${size ? ` bmodal__panel--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="wf-modal-title"><div class="bmodal__head"><h3 id="wf-modal-title">${esc(title)}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body" id="wf-modal-body">${body}</div><div class="bmodal__foot" id="wf-modal-foot">${foot}</div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  const first = m.querySelector('input, select, textarea');
  if (first) first.focus();
  return m;
}
function closeModal() { const m = $('wf-modal'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } }
const cancelBtn = '<button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button>';
const objectSelect = (id, value = 'contacts') => `<select id="${id}">${OBJECT_TYPES.map(([k, l]) => `<option value="${k}" ${value === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const folderOptions = (value) => `<option value="">Sin carpeta</option>${folders().map((x) => `<option value="${esc(x)}" ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join('')}`;
const goEditor = (w) => { location.href = `editor/?id=${w.id}`; };
function openPublishDialog(id) {
  const w = workflowById(id);
  if (!w) return;
  const m = matchingRecords(w).length;
  const problems = problemsOf(w);
  modal('Publicar workflow', `<p>Al publicar «<strong>${esc(w.name)}</strong>» se inscribirán los ${esc(OBJECT_LABEL[w.objectType].toLowerCase())}s que cumplan el desencadenante y sus acciones se ejecutarán de verdad.</p><p><strong>${m}</strong> ${m === 1 ? 'registro cumple' : 'registros cumplen'} las condiciones ahora${m > ENROLL_CAP ? ` (se inscribirán ${ENROLL_CAP} por publicación)` : ''}.</p>${problems.length ? `<div class="enr__warn"><strong>Revisa antes de publicar:</strong><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}`, `<button class="btn btn--primary" type="button" data-wm="confirm-publish" data-id="${esc(id)}">Publicar</button>${cancelBtn}`);
}
function onModalClick(e) {
  if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); closeModal(); return; }
  const b = e.target.closest('[data-wm]');
  if (!b) return;
  const a = b.dataset.wm;
  if (a === 'create-blank') { const name = $('wfm-name').value.trim(); if (!name) { toast('Escribe el nombre del workflow.'); return; } const w = createWorkflow({ name, objectType: $('wfm-object').value, folder: $('wfm-folder').value }); closeModal(); render(); toast(`Workflow «${w.name}» creado`); goEditor(w); } else if (a === 'use-template') { const t = TEMPLATES.find((x) => x.key === b.dataset.key); if (!t) return; const w = createWorkflow({ name: t.name, objectType: t.objectType, description: t.description, trigger: t.trigger, actions: t.actions() }); closeModal(); render(); toast(`Workflow «${w.name}» creado desde la plantilla`); goEditor(w); } else if (a === 'create-ai') { const prompt = $('wfm-prompt').value.trim(); if (!prompt) { toast('Describe el workflow que quieres crear.'); return; } const d = draftFromPrompt(prompt); const w = createWorkflow(d); closeModal(); render(); toast(`Borrador «${w.name}» generado con IA`); goEditor(w); } else if (a === 'save-view') { const name = $('wfm-view').value.trim(); if (!name) { toast('Escribe el nombre de la vista.'); return; } const v = saveView(name, state.filters); state.view = v.id; closeModal(); render(); toast(`Vista «${v.name}» guardada`); } else if (a === 'create-folder') { const f = createFolder($('wfm-folder-name').value); if (!f) { toast('Escribe el nombre de la carpeta.'); return; } closeModal(); render(); toast(`Carpeta «${f}» creada`); } else if (a === 'confirm-move') { const ids = b.dataset.ids.split(',').filter(Boolean); const n = moveWorkflows(ids, $('wfm-move').value); state.selected.clear(); closeModal(); render(); toast(`${plural(n, 'workflow movido', 'workflows movidos')}`); } else if (a === 'confirm-delete') { const ids = b.dataset.ids.split(',').filter(Boolean); const n = deleteWorkflows(ids); ids.forEach((id) => state.selected.delete(id)); closeModal(); render(); toast(`${plural(n, 'workflow eliminado', 'workflows eliminados')}`); } else if (a === 'confirm-publish') { b.disabled = true; b.textContent = 'Publicando…'; publishWorkflow(b.dataset.id).then((r) => { closeModal(); render(); toast(r ? `Workflow publicado · ${plural(r.enrolled, 'registro inscrito', 'registros inscritos')}${r.capped ? ` de ${r.matched}` : ''}` : 'No se pudo publicar'); }).catch((err) => { b.disabled = false; b.textContent = 'Publicar'; toast(`No se pudo publicar: ${err.message}`); }); }
}

// ---------- events ----------
page.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; params.set('tab', state.tab); history.replaceState(null, '', `?${params}`); render(); return; }
  const vd = e.target.closest('[data-view-del]');
  if (vd) { e.stopPropagation(); deleteView(vd.dataset.viewDel); if (state.view === vd.dataset.viewDel) state.view = 'all'; renderWorkflows(); return; }
  const view = e.target.closest('[data-view]');
  if (view) { closeMenus(); state.view = view.dataset.view; state.page = 1; state.selected.clear(); renderWorkflows(); return; }
  const folder = e.target.closest('[data-folder]');
  if (folder) { state.filters.folder = folder.dataset.folder; state.page = 1; renderWorkflows(); return; }

  const act = e.target.closest('[data-act]');
  if (act) {
    const id = act.dataset.id;
    closeMenus();
    const w = workflowById(id);
    if (act.dataset.act === 'clone') { const c = cloneWorkflow(id); if (c) { render(); toast(`Workflow clonado como «${c.name}»`); } } else if (act.dataset.act === 'move') modal('Mover a carpeta', `<p class="muted">Mover «${esc(w.name)}» a:</p><label class="field"><span>Carpeta</span><select id="wfm-move">${folderOptions(w.folder)}</select></label>`, `<button class="btn btn--primary" type="button" data-wm="confirm-move" data-ids="${esc(id)}">Mover</button>${cancelBtn}`);
    else if (act.dataset.act === 'delete') modal('Eliminar workflow', `<p>¿Seguro que quieres eliminar «${esc(w.name)}»? Dejará de inscribir registros; podrás restaurarlo desde la vista «Eliminado».</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-wm="confirm-delete" data-ids="${esc(id)}">Eliminar</button>${cancelBtn}`);
    else if (act.dataset.act === 'restore') { restoreWorkflows([id]); render(); toast('Workflow restaurado'); } else if (act.dataset.act === 'unpublish') { unpublish(id); render(); toast(`Workflow «${w.name}» desactivado`); } else if (act.dataset.act === 'publish') openPublishDialog(id);
    return;
  }
  const wa = e.target.closest('[data-wa]');
  if (!wa) return;
  closeMenus();
  const a = wa.dataset.wa;
  if (a === 'folders') { state.foldersOpen = !state.foldersOpen; renderWorkflows(); } else if (a === 'new-folder') modal('Nueva carpeta', '<label class="field"><span>Nombre de la carpeta</span><input id="wfm-folder-name" placeholder="P. ej. Ventas" /></label>', `<button class="btn btn--primary" type="button" data-wm="create-folder">Crear</button>${cancelBtn}`);
  else if (a === 'issues') { const list = issues(); modal('Revisar problemas de automatización', list.length ? `<p class="muted">${plural(list.length, 'workflow necesita', 'workflows necesitan')} revisión.</p><div class="tpls__lib">${list.map((x) => `<div class="tpls__libitem"><div><strong>${esc(x.workflow.name)}</strong><p>${esc(x.problems.join(' · '))}</p></div><a class="btn btn--secondary btn--sm" href="editor/?id=${esc(x.workflow.id)}">Revisar</a></div>`).join('')}</div>` : '<p class="muted">No hay problemas de automatización. Todos los workflows publicados están en orden.</p>', '<button class="btn btn--secondary" type="button" data-bm="close">Cerrar</button>', { size: 'wide' }); } else if (a === 'new-blank' || a === 'new-builder') modal(a === 'new-builder' ? 'Crear workflow con el nuevo creador' : 'Crear workflow desde cero', `${a === 'new-builder' ? '<p class="muted">El nuevo creador muestra el flujo en un lienzo con minimapa y paneles laterales; es el editor que abrirás a continuación.</p>' : ''}<label class="field"><span>Nombre del workflow</span><input id="wfm-name" placeholder="P. ej. Negocios sin contacto" /></label><label class="field"><span>Tipo de objeto</span>${objectSelect('wfm-object', 'contacts')}</label><label class="field"><span>Carpeta</span><select id="wfm-folder">${folderOptions('')}</select></label>`, `<button class="btn btn--primary" type="button" data-wm="create-blank">Crear workflow</button>${cancelBtn}`);
  else if (a === 'new-template') modal('Crear workflow desde plantilla', `<div class="tpls__lib">${TEMPLATES.map((t) => `<div class="tpls__libitem"><div><strong>${esc(t.name)}</strong><p>${esc(OBJECT_LABEL[t.objectType])} · ${esc(t.description)}</p></div><button class="btn btn--secondary btn--sm" type="button" data-wm="use-template" data-key="${t.key}">Usar</button></div>`).join('')}</div>`, cancelBtn, { size: 'wide' });
  else if (a === 'new-ai') modal('Crear workflow con IA', '<p class="muted">Describe qué quieres automatizar y generaremos un borrador con el objeto, el desencadenante y las acciones.</p><label class="field"><span>Descripción</span><textarea id="wfm-prompt" rows="4" placeholder="P. ej. Cuando un ticket sea urgente, crear una tarea y avisar por correo a soporte"></textarea></label>', `<button class="btn btn--primary" type="button" data-wm="create-ai">Generar borrador</button>${cancelBtn}`);
  else if (a === 'add-view') modal('Agregar vista', '<p class="muted">La vista guarda los filtros actuales para volver a ellos con un clic.</p><label class="field"><span>Nombre de la vista</span><input id="wfm-view" placeholder="P. ej. Mis workflows de ventas" /></label>', `<button class="btn btn--primary" type="button" data-wm="save-view">Guardar vista</button>${cancelBtn}`);
  else if (a === 'advanced') toast('Los filtros avanzados por propiedades del workflow estarán disponibles en la próxima versión.');
  else if (a === 'bulk-move') modal('Mover a carpeta', `<p class="muted">Mover ${plural(state.selected.size, 'workflow', 'workflows')} a:</p><label class="field"><span>Carpeta</span><select id="wfm-move">${folderOptions('')}</select></label>`, `<button class="btn btn--primary" type="button" data-wm="confirm-move" data-ids="${esc([...state.selected].join(','))}">Mover</button>${cancelBtn}`);
  else if (a === 'bulk-delete') modal('Eliminar workflows', `<p>¿Seguro que quieres eliminar ${plural(state.selected.size, 'workflow', 'workflows')}? Podrás restaurarlos desde la vista «Eliminado».</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-wm="confirm-delete" data-ids="${esc([...state.selected].join(','))}">Eliminar</button>${cancelBtn}`);
});
page.addEventListener('input', (e) => { if (e.target.id === 'wf-q') { state.q = e.target.value; state.page = 1; renderWorkflows(); const q = $('wf-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } } });
page.addEventListener('change', (e) => {
  const t = e.target;
  const map = { 'wf-status': 'status', 'wf-object': 'object', 'wf-creator': 'creator', 'wf-folder': 'folder', 'wf-created': 'created', 'wf-action': 'action' };
  if (map[t.id]) { state.filters[map[t.id]] = t.value; state.page = 1; renderWorkflows(); } else if (t.id === 'wf-check-all') { visible().slice((state.page - 1) * state.size, state.page * state.size).forEach((w) => (t.checked ? state.selected.add(w.id) : state.selected.delete(w.id))); renderWorkflows(); } else if (t.dataset.sel) { if (t.checked) state.selected.add(t.dataset.sel); else state.selected.delete(t.dataset.sel); renderWorkflows(); }
});

render();

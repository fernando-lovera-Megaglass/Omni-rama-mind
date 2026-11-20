// Workflow editor (automation/editor/?id=): dark top bar (name, ACTIVADA/BORRADOR badge, Comenzar/Guardar,
// Publicar/Desactivar switch), the Archivo/Editar/Configuración/Visualización/Ayuda menus, Prueba and
// Historial del rendimiento, the canvas controls (undo/redo, zoom, minimap), the trigger card with its OR
// groups of AND conditions, connectors with "+" that open the action catalogue, action cards (numbered,
// token chips, recipient in green, footer tools), if/then branches, the Fin node and the right-hand config panel.
import { toast, wireMenus, closeMenus } from './shell.js';
import { OWNERS, relativeTimeFine, formatDate } from './data.js';
import { ready, workflowById, saveWorkflow, cloneWorkflow, deleteWorkflows, unpublish, performance, simulate, matchingRecords, recordsOf, recordName, conditionProperties, propertyDef, conditionText, OPERATORS, OBJECT_TYPES, OBJECT_LABEL, OBJECT_PLURAL, ACTION_CATALOG, ACTION_DEFS, childrenOf, newAction, insertAction, removeAction, moveAction, describeAction, problemsOf, ENROLL_CAP, ME } from './workflows-data.js';
import { ready as engineReady, publishWorkflow, activeRunsOf, runsOf, actionHistory, cancelRun, processDueRuns, startWorkflowChecker, stepLabel, whenText, ESTADO_LABELS } from './workflow-engine.js';
import { markersToChips, openTokenPicker, OBJECTS as TOKEN_OBJECTS } from './tokens.js';
import { enhanceOwnerSelects } from './owner-select.js';

await ready;
await engineReady;
// The editor has no shell: start the checker here so due runs (ended delays) advance while it is open.
startWorkflowChecker();
const root = document.getElementById('wfe-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const state = { wf: null, selected: null, panel: null, adding: null, catalogQ: '', zoom: 100, minimap: false, editingName: false, undo: [], redo: [] };
const GROUP_CLASS = { 'Comunicación': 'com', CRM: 'crm', Flujo: 'flow', Tareas: 'task' };
const BADGE = { published: 'ACTIVADA', off: 'RETIRADA', draft: 'BORRADOR' };
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const snapshot = () => JSON.stringify(state.wf);

// ---------- persistence / history ----------
let saveTimer = null;
function commit({ history = true } = {}) {
  if (history) { state.undo.push(state.lastSnapshot || snapshot()); if (state.undo.length > 50) state.undo.shift(); state.redo = []; }
  state.lastSnapshot = snapshot();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveWorkflow(state.wf.id, state.wf); }, 300);
}
function flush() { clearTimeout(saveTimer); saveWorkflow(state.wf.id, state.wf); }
function undo() { if (!state.undo.length) return; state.redo.push(snapshot()); state.wf = JSON.parse(state.undo.pop()); state.lastSnapshot = snapshot(); state.selected = null; state.panel = null; flush(); render(); }
function redo() { if (!state.redo.length) return; state.undo.push(snapshot()); state.wf = JSON.parse(state.redo.pop()); state.lastSnapshot = snapshot(); flush(); render(); }

// ---------- rendering ----------
function numbering() {
  const map = {};
  let n = 0;
  const walk = (parentId, branch) => childrenOf(state.wf.actions, parentId, branch).forEach((a) => { n += 1; map[a.id] = n; if (a.type === 'branch') { walk(a.id, 'yes'); walk(a.id, 'no'); } });
  walk(null, '');
  return { map, total: n };
}
const connector = (parentId, branch, index) => `<div class="wfc"><span class="wfc__line" aria-hidden="true"></span><button class="wfc__add" type="button" data-add-parent="${esc(parentId || '')}" data-add-branch="${esc(branch || '')}" data-add-index="${index}" aria-label="Agregar acción" title="Agregar acción">+</button><span class="wfc__line" aria-hidden="true"></span></div>`;
function cardHtml(a, numbers) {
  const def = ACTION_DEFS[a.type] || { label: a.type, icon: '•', group: 'CRM' };
  const d = describeAction(state.wf, a);
  const selected = state.selected && state.selected.kind === 'action' && state.selected.id === a.id;
  return `
    <article class="wfn wfn--action wfn--${GROUP_CLASS[def.group] || 'crm'}${selected ? ' is-selected' : ''}" data-node="${esc(a.id)}">
      <div class="wfn__head"><span class="wfn__ico" aria-hidden="true">${def.icon}</span><div class="wfn__text"><strong>${numbers.map[a.id]}. ${esc(def.label)}</strong><div class="wfn__desc">${markersToChips(esc(d.text), { short: true })}${d.to ? ` <span class="wfn__to">${esc(d.to)}</span>` : ''}</div></div></div>
      <div class="wfn__foot">
        <button type="button" data-act-dup="${esc(a.id)}" title="Duplicar" aria-label="Duplicar">⧉</button><button type="button" data-act-up="${esc(a.id)}" title="Mover arriba" aria-label="Mover arriba">↑</button><button type="button" data-act-down="${esc(a.id)}" title="Mover abajo" aria-label="Mover abajo">↓</button><button type="button" data-act-copy="${esc(a.id)}" title="Copiar" aria-label="Copiar">⎘</button><button type="button" data-act-del="${esc(a.id)}" title="Eliminar" aria-label="Eliminar">🗑</button>
        <button class="link-btn wfn__details" type="button" data-select-action="${esc(a.id)}">Detalles</button>
      </div>
    </article>
    ${a.type === 'branch' ? `<div class="wfb"><div class="wfb__col"><div class="wfb__lbl wfb__lbl--yes">Sí</div>${flowHtml(a.id, 'yes', numbers)}<div class="wfb__join muted">continúa</div></div><div class="wfb__col"><div class="wfb__lbl wfb__lbl--no">No</div>${flowHtml(a.id, 'no', numbers)}<div class="wfb__join muted">continúa</div></div></div>` : ''}`;
}
function flowHtml(parentId, branch, numbers) {
  const list = childrenOf(state.wf.actions, parentId, branch);
  return `${connector(parentId, branch, 0)}${list.map((a, i) => `${cardHtml(a, numbers)}${connector(parentId, branch, i + 1)}`).join('')}`;
}
function triggerHtml() {
  const w = state.wf;
  const groups = (w.trigger && w.trigger.groups) || [];
  const selected = state.selected && state.selected.kind === 'trigger';
  return `
    <article class="wfn wfn--trigger${selected ? ' is-selected' : ''}" data-node="trigger">
      <div class="wfn__head"><span class="wfn__ico" aria-hidden="true">⚡</span><div class="wfn__text"><strong>Activar la inscripción para ${esc(OBJECT_PLURAL[w.objectType])}</strong><small class="muted">Solo inscribir ${esc(OBJECT_PLURAL[w.objectType])} que cumplan estas condiciones</small></div></div>
      <div class="wfn__body">${groups.length ? groups.map((g, i) => `${i ? '<div class="wfn__or">o</div>' : ''}<div class="wfn__group"><div class="wfn__grouph">Grupo ${i + 1}</div>${(g.conditions || []).length ? (g.conditions || []).map((c, j) => `${j ? '<div class="wfn__and">y</div>' : ''}<div class="wfn__cond">${esc(conditionText(w.objectType, c))}</div>`).join('') : '<div class="muted">Sin condiciones</div>'}</div>`).join('') : '<div class="muted">Añade condiciones para decidir qué registros se inscriben.</div>'}</div>
      <div class="wfn__foot"><button type="button" data-we="trigger-clear" title="Vaciar condiciones" aria-label="Vaciar condiciones">🗑</button><button class="wfn__reenroll" type="button" data-we="reenroll" title="Reinscribir cuando vuelva a cumplir las condiciones">${w.trigger && w.trigger.reenroll ? 'Reinscripción activada' : 'Reinscripción desactivada'}</button><button class="link-btn wfn__details" type="button" data-we="select-trigger">Detalles</button></div>
    </article>`;
}
function render() {
  const w = state.wf;
  const numbers = numbering();
  const published = w.status === 'published';
  const started = w.actions.length > 0 || ((w.trigger.groups || []).some((g) => (g.conditions || []).length));
  document.title = `${w.name} | Omni`;
  root.innerHTML = `
    <div class="wfe">
      <header class="wfe__bar">
        <a class="seqed__back" href="../">‹ Volver</a>
        <div class="wfe__name">${state.editingName ? `<input id="wfe-name" class="wfe__nameinput" value="${esc(w.name)}" aria-label="Nombre del workflow" />` : `<h1 id="wfe-title">${esc(w.name)}</h1><button class="wfe__pencil" type="button" data-we="rename" aria-label="Cambiar nombre" title="Cambiar nombre">✎</button>`}<span class="wfe__badge wfe__badge--${esc(w.status)}">${BADGE[w.status] || w.status}</span></div>
        <div class="wfe__barright"><button class="btn btn--secondary btn--sm" type="button" data-we="save">${started ? 'Guardar' : 'Comenzar'}</button><label class="wfe__publish switchwrap"><span>${published ? 'Desactivar' : 'Publicar'}</span><input type="checkbox" class="switch" id="wfe-publish" ${published ? 'checked' : ''} /></label></div>
      </header>
      <nav class="wfe__menus">
        <div class="menu"><button type="button" aria-haspopup="true">Archivo</button><div class="menu__panel"><button class="menu__item" type="button" data-we="save">Guardar</button><button class="menu__item" type="button" data-we="clone">Clonar</button><div class="menu__sep"></div><button class="menu__item menu__item--danger" type="button" data-we="delete">Eliminar</button></div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Editar</button><div class="menu__panel"><button class="menu__item" type="button" data-we="undo" ${state.undo.length ? '' : 'disabled'}>Deshacer</button><button class="menu__item" type="button" data-we="redo" ${state.redo.length ? '' : 'disabled'}>Rehacer</button><div class="menu__sep"></div><button class="menu__item" type="button" data-we="delete-selected" ${state.selected && state.selected.kind === 'action' ? '' : 'disabled'}>Eliminar acción seleccionada</button></div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Configuración</button><div class="menu__panel"><button class="menu__item" type="button" data-we="details">Detalles del workflow</button><button class="menu__item" type="button" data-we="reenroll">${w.trigger.reenroll ? 'Desactivar la reinscripción' : 'Activar la reinscripción'}</button><button class="menu__item" type="button" data-we="select-trigger">Tipo de objeto y desencadenante</button></div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Visualización</button><div class="menu__panel"><button class="menu__item" type="button" data-we="zoom-in">Acercar</button><button class="menu__item" type="button" data-we="zoom-out">Alejar</button><button class="menu__item" type="button" data-we="zoom-reset">Tamaño real</button><button class="menu__item" type="button" data-we="minimap">${state.minimap ? 'Ocultar panel de minimapa' : 'Mostrar panel de minimapa'}</button></div></div>
        <div class="menu"><button type="button" aria-haspopup="true">Ayuda</button><div class="menu__panel"><button class="menu__item" type="button" data-we="help">Cómo funcionan los workflows</button><button class="menu__item" type="button" data-we="shortcuts">Atajos de teclado</button></div></div>
        <span class="wfe__spacer"></span>
        <button class="btn btn--secondary btn--sm" type="button" data-we="test">Prueba</button>
        <button class="btn btn--secondary btn--sm" type="button" data-we="runs">Inscritos activos${activeRunsOf(w.id).length ? ` (${activeRunsOf(w.id).length})` : ''}</button>
        <button class="btn btn--secondary btn--sm" type="button" data-we="history">Historial del rendimiento</button>
      </nav>
      <div class="wfe__work">
        <div class="wfe__controls"><button type="button" data-we="undo" ${state.undo.length ? '' : 'disabled'} aria-label="Deshacer" title="Deshacer">↶</button><button type="button" data-we="redo" ${state.redo.length ? '' : 'disabled'} aria-label="Rehacer" title="Rehacer">↷</button><span class="wfe__sep"></span><button type="button" data-we="zoom-out" aria-label="Alejar">−</button><span class="wfe__zoom" id="wfe-zoom">${state.zoom} %</span><button type="button" data-we="zoom-in" aria-label="Acercar">+</button><span class="wfe__sep"></span><button type="button" data-we="minimap" aria-pressed="${state.minimap}">Mostrar panel de minimapa</button></div>
        <div class="wfe__canvaswrap"><div class="wfe__canvas" id="wfe-canvas" style="transform: scale(${state.zoom / 100})">${triggerHtml()}${flowHtml(null, '', numbers)}<div class="wfn wfn--end" id="wfe-end">${numbers.total + 1}. Fin</div></div>${state.minimap ? `<div class="wfe__minimap" id="wfe-minimap"><strong>Minimapa</strong>${['⚡ Desencadenante', ...state.wf.actions.map((a) => `${numbers.map[a.id]}. ${ACTION_DEFS[a.type] ? ACTION_DEFS[a.type].label : a.type}`), `${numbers.total + 1}. Fin`].map((t) => `<div class="wfe__minirow">${esc(t)}</div>`).join('')}</div>` : ''}</div>
        <aside class="wfe__panel" id="wfe-panel" ${state.panel ? '' : 'hidden'}>${panelHtml()}</aside>
      </div>
    </div>`;
  wireMenus(root);
  if (state.editingName) { const i = $('wfe-name'); if (i) { i.focus(); i.select(); } }
}
function renderCanvas() { const numbers = numbering(); $('wfe-canvas').innerHTML = `${triggerHtml()}${flowHtml(null, '', numbers)}<div class="wfn wfn--end" id="wfe-end">${numbers.total + 1}. Fin</div>`; const mm = $('wfe-minimap'); if (mm) mm.outerHTML = `<div class="wfe__minimap" id="wfe-minimap"><strong>Minimapa</strong>${['⚡ Desencadenante', ...state.wf.actions.map((a) => `${numbers.map[a.id]}. ${ACTION_DEFS[a.type] ? ACTION_DEFS[a.type].label : a.type}`), `${numbers.total + 1}. Fin`].map((t) => `<div class="wfe__minirow">${esc(t)}</div>`).join('')}</div>`; }
function renderPanel() { const p = $('wfe-panel'); p.hidden = !state.panel; p.innerHTML = panelHtml(); wireMenus(p); enhanceOwnerSelects(p); }

// ---------- panel ----------
const propOptions = (type, value) => `<option value="">Elige una propiedad</option>${conditionProperties(type).map((p) => `<option value="${esc(p.key)}" ${p.key === value ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}`;
function valueInput(type, c) {
  if (c.operator === 'known' || c.operator === 'unknown') return '';
  const p = propertyDef(type, c.property);
  const vals = Array.isArray(c.value) ? c.value.map(String) : [String(c.value ?? '')];
  if (p && p.options) {
    if (c.operator === 'is_any_of') return `<select class="wfcond__val" data-cond-val="${esc(c.id)}" multiple size="4" aria-label="Valores">${p.options.map(([k, l]) => `<option value="${esc(k)}" ${vals.includes(String(k)) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `<select class="wfcond__val" data-cond-val="${esc(c.id)}" aria-label="Valor"><option value="">Elige un valor</option>${p.options.map(([k, l]) => `<option value="${esc(k)}" ${vals[0] === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }
  const num = p && ['number', 'currency', 'percent'].includes(p.kind) || ['lt', 'gt'].includes(c.operator);
  return `<input class="wfcond__val" data-cond-val="${esc(c.id)}" type="${num ? 'number' : 'text'}" value="${esc(vals.join('|'))}" placeholder="${c.operator === 'is_any_of' ? 'Valores separados por |' : 'Valor'}" aria-label="Valor" />`;
}
function groupsEditorHtml(type, groups, scope) {
  return `<div class="wfg-editor" data-scope="${esc(scope)}">${(groups || []).map((g, i) => `
    <div class="wfg" data-group="${esc(g.id)}">
      <div class="wfg__h"><strong>Grupo ${i + 1}</strong>${i ? '<span class="muted">· o</span>' : ''}<button type="button" data-grp-del="${esc(g.id)}" aria-label="Quitar grupo" title="Quitar grupo">🗑</button></div>
      ${(g.conditions || []).map((c, j) => `${j ? '<div class="wfg__and">y</div>' : ''}<div class="wfcond" data-cond="${esc(c.id)}"><select data-cond-prop="${esc(c.id)}" aria-label="Propiedad">${propOptions(type, c.property)}</select><select data-cond-op="${esc(c.id)}" aria-label="Operador">${OPERATORS.map(([k, l]) => `<option value="${k}" ${c.operator === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${valueInput(type, c)}<button type="button" data-cond-del="${esc(c.id)}" aria-label="Quitar condición" title="Quitar condición">×</button></div>`).join('')}
      <button class="link-btn" type="button" data-cond-add="${esc(g.id)}">+ Agregar condición (y)</button>
    </div>`).join('')}<button class="link-btn wfg__addgroup" type="button" data-grp-add="1">+ Agregar grupo (o)</button></div>`;
}
const ownerOptions = (v) => OWNERS.filter((o) => o !== 'Sin asignar').map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('');
function actionFormHtml(a) {
  const w = state.wf; const c = a.config || {}; const t = w.objectType;
  const text = (key, label, ph = '') => `<label class="field"><span>${label}</span><input data-cfg="${key}" value="${esc(c[key] ?? '')}" placeholder="${esc(ph)}" /></label>`;
  const area = (key, label) => `<label class="field"><span>${label} <button class="link-btn wfe__token" type="button" data-token-for="${key}">Insertar ficha</button></span><textarea data-cfg="${key}" rows="3">${esc(c[key] ?? '')}</textarea></label>`;
  switch (a.type) {
    case 'notify_email': return `<label class="field"><span>Destinatario</span><select data-cfg="to" data-owner-select>${ownerOptions(c.to)}</select></label>${text('subject', 'Asunto')}${area('body', 'Cuerpo')}`;
    case 'notify_app': return `<label class="field"><span>Destinatario</span><select data-cfg="to" data-owner-select>${ownerOptions(c.to)}</select></label>${text('title', 'Título')}${area('text', 'Texto')}`;
    case 'marketing_email': return `<label class="field"><span>Correo de marketing</span><select data-cfg="email">${['Boletín mensual', 'Promoción de temporada', 'Bienvenida a nuevos clientes', 'Encuesta de satisfacción'].map((e) => `<option ${c.email === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>`;
    case 'create_record': return `<label class="field"><span>Tipo de registro</span><select data-cfg="objectType">${[['tasks', 'Tarea'], ['tickets', 'Ticket'], ['deals', 'Negocio']].map(([k, l]) => `<option value="${k}" ${c.objectType === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${text('name', 'Nombre', 'Puedes usar fichas como {{contacto.nombre}}')}`;
    case 'edit_record': { const p = propertyDef(t, c.property); return `<label class="field"><span>Propiedad</span><select data-cfg="property">${propOptions(t, c.property)}</select></label><label class="field"><span>Valor</span>${p && p.options ? `<select data-cfg="value"><option value="">Elige un valor</option>${p.options.map(([k, l]) => `<option value="${esc(k)}" ${String(c.value) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : `<input data-cfg="value" value="${esc(c.value ?? '')}" />`}</label>`; }
    case 'assign_owner': return `<label class="field"><span>Propietario</span><select data-cfg="owner" data-owner-select>${ownerOptions(c.owner)}</select></label>`;
    case 'copy_property': return `<label class="field"><span>Propiedad de origen (${esc(OBJECT_LABEL[t])})</span><select data-cfg="from">${propOptions(t, c.from)}</select></label><label class="field"><span>Objeto asociado</span><select data-cfg="toObject">${OBJECT_TYPES.filter(([k]) => k !== t).map(([k, l]) => `<option value="${k}" ${c.toObject === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Propiedad de destino</span><select data-cfg="to" data-owner-select>${propOptions(c.toObject || 'contacts', c.to)}</select></label>`;
    case 'delay': return `<div class="enr__row"><label class="field"><span>Cantidad</span><input data-cfg="amount" type="number" min="0" value="${esc(c.amount ?? 1)}" /></label><label class="field"><span>Unidad</span><select data-cfg="unit"><option value="days" ${c.unit !== 'hours' ? 'selected' : ''}>Días</option><option value="hours" ${c.unit === 'hours' ? 'selected' : ''}>Horas</option></select></label></div>`;
    case 'branch': return `<p class="muted">Los registros que cumplan las condiciones siguen por la rama <strong>Sí</strong>; el resto, por la rama <strong>No</strong>.</p>${groupsEditorHtml(t, c.groups || [], `action:${a.id}`)}`;
    case 'goto': return `<label class="field"><span>Ir a la acción</span><select data-cfg="target"><option value="">Elige una acción</option>${w.actions.filter((x) => x.id !== a.id).map((x) => `<option value="${esc(x.id)}" ${c.target === x.id ? 'selected' : ''}>${numbering().map[x.id]}. ${esc(ACTION_DEFS[x.type].label)}</option>`).join('')}</select></label>`;
    case 'create_task': return `${text('title', 'Título de la tarea')}<div class="enr__row"><label class="field"><span>Vence en (días)</span><input data-cfg="dueDays" type="number" min="0" value="${esc(c.dueDays ?? 0)}" /></label><label class="field"><span>Tipo</span><select data-cfg="taskType">${['Tarea', 'Llamada', 'Correo'].map((x) => `<option ${c.taskType === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div><label class="field"><span>Asignada a</span><select data-cfg="assignee" data-owner-select>${ownerOptions(c.assignee)}</select></label>`;
    default: return '';
  }
}
function panelHtml() {
  const w = state.wf;
  if (state.panel === 'catalog') {
    const q = state.catalogQ.trim().toLowerCase();
    return `<div class="wfe__panelhead"><strong>Elige una acción</strong><button class="bmodal__close" type="button" data-we="panel-close" aria-label="Cerrar">×</button></div><input class="wfe__search" id="wfe-catq" type="search" placeholder="Buscar acciones" aria-label="Buscar acciones" value="${esc(state.catalogQ)}" /><div class="wfe__cat">${ACTION_CATALOG.map(([g, items]) => { const list = items.filter(([, l]) => !q || l.toLowerCase().includes(q)); return list.length ? `<h4>${esc(g)}</h4>${list.map(([t, l, i]) => `<button class="wfe__catitem wfn--${GROUP_CLASS[g]}" type="button" data-cat-type="${t}"><span class="wfn__ico" aria-hidden="true">${i}</span>${esc(l)}</button>`).join('')}` : ''; }).join('') || '<p class="muted">Ninguna acción coincide.</p>'}</div>`;
  }
  if (state.panel === 'config' && state.selected) {
    if (state.selected.kind === 'trigger') {
      return `<div class="wfe__panelhead"><strong>Desencadenante de inscripción</strong><button class="bmodal__close" type="button" data-we="panel-close" aria-label="Cerrar">×</button></div>
        <label class="field"><span>Tipo de objeto</span><select id="wfe-object">${OBJECT_TYPES.map(([k, l]) => `<option value="${k}" ${w.objectType === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <p class="muted">Solo se inscribirán los ${esc(OBJECT_PLURAL[w.objectType])} que cumplan todas las condiciones de al menos un grupo.</p>
        ${groupsEditorHtml(w.objectType, w.trigger.groups, 'trigger')}
        <label class="snp__check"><input type="checkbox" id="wfe-reenroll" ${w.trigger.reenroll ? 'checked' : ''} /> Reinscribir cuando vuelva a cumplir las condiciones</label>
        <p class="muted">${matchingRecords(w).length} ${esc(OBJECT_PLURAL[w.objectType])} cumplen las condiciones ahora.</p>`;
    }
    const a = w.actions.find((x) => x.id === state.selected.id);
    if (!a) return '';
    const def = ACTION_DEFS[a.type];
    return `<div class="wfe__panelhead"><strong>${numbering().map[a.id]}. ${esc(def.label)}</strong><button class="bmodal__close" type="button" data-we="panel-close" aria-label="Cerrar">×</button></div><div class="wfe__form" data-action-form="${esc(a.id)}">${actionFormHtml(a)}</div>`;
  }
  return '';
}

// ---------- modals ----------
function modal(title, body, foot, { size = 'wide' } = {}) {
  let m = $('wfe-modal');
  if (!m) { m = document.createElement('div'); m.className = 'bmodal'; m.id = 'wfe-modal'; root.appendChild(m); m.addEventListener('click', onModalClick); document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeModal(); }); }
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel${size ? ` bmodal__panel--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="wfe-modal-title"><div class="bmodal__head"><h3 id="wfe-modal-title">${esc(title)}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body" id="wfe-modal-body">${body}</div><div class="bmodal__foot" id="wfe-modal-foot">${foot}</div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  return m;
}
const closeModal = () => { const m = $('wfe-modal'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } };
const cancelBtn = '<button class="btn btn--secondary" type="button" data-bm="close">Cerrar</button>';
function openTest() {
  const w = state.wf;
  const list = recordsOf(w.objectType).slice(0, 200);
  modal('Prueba del workflow', `<p class="muted">Elige un ${esc(OBJECT_LABEL[w.objectType].toLowerCase())} real: verás qué condiciones cumple y qué acciones se ejecutarían. La prueba no cambia nada.</p><div class="enr__row"><label class="field"><span>Registro</span><select id="wfe-test-rec">${list.map((r) => `<option value="${esc(r.id)}">${esc(recordName(w.objectType, r))}</option>`).join('')}</select></label><label class="field"><span>&nbsp;</span><button class="btn btn--primary" type="button" data-wm="run-test">Probar</button></label></div><div id="wfe-test-out" class="wfe__testout"></div>`, cancelBtn);
}
function renderTest() {
  const w = state.wf;
  const r = recordsOf(w.objectType).find((x) => String(x.id) === $('wfe-test-rec').value);
  if (!r) return;
  const sim = simulate(w, r, { apply: false });
  $('wfe-test-out').innerHTML = `
    <div class="wfe__testhead"><strong>${esc(recordName(w.objectType, r))}</strong> <span class="tag ${sim.enrolled ? 'tag--done' : 'tag--none'}">${sim.enrolled ? 'Se inscribiría' : 'No se inscribiría'}</span></div>
    <h4>Desencadenante</h4>
    ${sim.trigger.groups.length ? sim.trigger.groups.map((g, i) => `<div class="wfe__testgroup"><strong>Grupo ${i + 1}</strong> <span class="${g.ok ? 'wfe__ok' : 'wfe__ko'}">${g.ok ? '✓ cumple' : '✗ no cumple'}</span><ul>${g.conditions.map((c) => `<li><span class="${c.ok ? 'wfe__ok' : 'wfe__ko'}">${c.ok ? '✓' : '✗'}</span> ${esc(c.text)}</li>`).join('')}</ul></div>`).join('') : '<p class="muted">El desencadenante no tiene condiciones.</p>'}
    <h4>Acciones</h4>
    ${sim.enrolled ? (sim.steps.length ? `<ol class="wfe__steps">${sim.steps.map((s) => `<li><span class="${s.ok ? 'wfe__ok' : 'wfe__ko'}">${s.ok ? '✓' : '✗'}</span> <strong>${esc(s.title)}</strong> — ${esc(s.result)}</li>`).join('')}</ol>` : '<p class="muted">No hay acciones.</p>') : '<p class="muted">Como no cumple el desencadenante, no se ejecutaría ninguna acción.</p>'}`;
}
function openHistory() {
  const p = performance(state.wf.id);
  const card = (l, v) => `<div class="seqan__card"><div class="seqan__label">${l}</div><div class="seqan__value">${v}</div></div>`;
  modal('Historial del rendimiento', `<div class="seqan__cards seqan__cards--4">${card('INSCRIPCIONES TOTALES', p.enrollments)}${card('ACCIONES EJECUTADAS', p.actionsRun)}${card('TASA DE ÉXITO', `${Math.round(p.successRate * 100)} %`)}${card('EN CURSO', p.inProgress)}</div><div class="table-wrap"><table class="table tpls__table wfl__table" id="wfe-hist"><thead><tr><th>Registro</th><th>Estado</th><th>Acciones</th><th>Inscrito</th></tr></thead><tbody>${p.rows.length ? p.rows.slice(0, 50).map((e) => `<tr><td><a class="tpls__name" href="../../${esc(e.objectType)}/record/?id=${esc(e.recordId)}">${esc(e.recordName)}</a><div class="muted wfe__log">${(e.log || []).map((x) => `${x.ok ? '✓' : '✗'} ${esc(x.result)}`).join(' · ')}</div></td><td><span class="tag ${e.status === 'failed' ? 'tag--none' : e.status === 'in_progress' ? 'tag--new' : 'tag--done'}">${e.status === 'failed' ? 'Con errores' : e.status === 'in_progress' ? 'En curso' : 'Completada'}</span></td><td>${e.actionsRun}</td><td title="${esc(formatDate(new Date(e.enrolledAt)))}">${esc(relativeTimeFine(e.enrolledAt))}</td></tr>`).join('') : '<tr><td colspan="4"><div class="tpls__empty">Todavía no se ha inscrito ningún registro. Publica el workflow para empezar.</div></td></tr>'}</tbody></table></div>`, cancelBtn);
}
function openPublish() {
  const w = state.wf;
  const m = matchingRecords(w).length;
  const problems = problemsOf(w);
  modal('Publicar workflow', `<p>Al publicar se inscribirán los ${esc(OBJECT_PLURAL[w.objectType])} que cumplan el desencadenante y las acciones se ejecutarán de verdad sobre esos registros.</p><p><strong>${m}</strong> ${m === 1 ? 'registro cumple' : 'registros cumplen'} las condiciones ahora${m > ENROLL_CAP ? ` (se inscribirán ${ENROLL_CAP} en esta publicación)` : ''}.</p>${problems.length ? `<div class="enr__warn"><strong>Revisa antes de publicar:</strong><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}`, `<button class="btn btn--primary" type="button" data-wm="confirm-publish">Publicar</button>${cancelBtn}`, { size: '' });
}
function openDetails() {
  const w = state.wf;
  modal('Detalles del workflow', `<label class="field"><span>Nombre</span><input id="wfe-d-name" value="${esc(w.name)}" /></label><label class="field"><span>Descripción</span><textarea id="wfe-d-desc" rows="3">${esc(w.description)}</textarea></label><label class="field"><span>Carpeta</span><input id="wfe-d-folder" value="${esc(w.folder)}" placeholder="P. ej. Ventas" /></label>`, `<button class="btn btn--primary" type="button" data-wm="save-details">Guardar</button>${cancelBtn}`, { size: '' });
}
function onModalClick(e) {
  if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); closeModal(); return; }
  const b = e.target.closest('[data-wm]');
  if (!b) return;
  const a = b.dataset.wm;
  if (a === 'run-test') renderTest();
  else if (a === 'confirm-publish') { flush(); const r = publish(state.wf.id); state.wf = workflowById(state.wf.id); state.lastSnapshot = snapshot(); closeModal(); render(); toast(r ? `Workflow publicado · ${plural(r.enrolled, 'registro inscrito', 'registros inscritos')}${r.capped ? ` de ${r.matched}` : ''}` : 'No se pudo publicar'); } else if (a === 'save-details') { state.wf.name = $('wfe-d-name').value.trim() || state.wf.name; state.wf.description = $('wfe-d-desc').value; state.wf.folder = $('wfe-d-folder').value.trim(); commit(); closeModal(); render(); toast('Detalles guardados'); } else if (a === 'confirm-delete') { deleteWorkflows([state.wf.id]); closeModal(); toast('Workflow eliminado'); location.href = '../'; }
}

// ---------- mutations ----------
const findGroups = (scope) => { if (scope === 'trigger') return state.wf.trigger.groups; const id = scope.replace('action:', ''); const a = state.wf.actions.find((x) => x.id === id); if (!a) return null; a.config.groups = a.config.groups || []; return a.config.groups; };
const findCond = (scope, cid) => { const groups = findGroups(scope) || []; for (const g of groups) { const c = (g.conditions || []).find((x) => x.id === cid); if (c) return { g, c }; } return null; };
function openCatalog(parentId, branch, index) { state.adding = { parentId: parentId || null, branch: branch || '', index: Number(index) || 0 }; state.panel = 'catalog'; state.catalogQ = ''; state.selected = null; render(); const q = $('wfe-catq'); if (q) q.focus(); }
function addFromCatalog(type) {
  const at = state.adding || { parentId: null, branch: '', index: childrenOf(state.wf.actions, null, '').length };
  const a = newAction(type, state.wf.objectType, { parentId: at.parentId, branch: at.branch });
  state.wf.actions = insertAction(state.wf.actions, a, at.index, at.parentId, at.branch);
  state.adding = null; state.selected = { kind: 'action', id: a.id }; state.panel = 'config';
  commit(); render();
  toast(`Acción «${ACTION_DEFS[type].label}» agregada`);
}

// ---------- events ----------
root.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add-index]');
  if (add) { openCatalog(add.dataset.addParent, add.dataset.addBranch, add.dataset.addIndex); return; }
  const cat = e.target.closest('[data-cat-type]');
  if (cat) { addFromCatalog(cat.dataset.catType); return; }
  const sel = e.target.closest('[data-select-action]');
  if (sel) { state.selected = { kind: 'action', id: sel.dataset.selectAction }; state.panel = 'config'; state.adding = null; render(); return; }
  const dup = e.target.closest('[data-act-dup]');
  if (dup) { const src = state.wf.actions.find((x) => x.id === dup.dataset.actDup); if (src) { const copy = { ...JSON.parse(JSON.stringify(src)), id: uuid() }; const sibs = childrenOf(state.wf.actions, src.parentId, src.branch); state.wf.actions = insertAction(state.wf.actions, copy, sibs.indexOf(src) + 1, src.parentId, src.branch); commit(); render(); toast('Acción duplicada'); } return; }
  const up = e.target.closest('[data-act-up]');
  if (up) { moveAction(state.wf.actions, up.dataset.actUp, -1); commit(); render(); return; }
  const down = e.target.closest('[data-act-down]');
  if (down) { moveAction(state.wf.actions, down.dataset.actDown, 1); commit(); render(); return; }
  const copy = e.target.closest('[data-act-copy]');
  if (copy) { const a = state.wf.actions.find((x) => x.id === copy.dataset.actCopy); if (a && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(JSON.stringify(a.config)); toast('Configuración de la acción copiada'); return; }
  const del = e.target.closest('[data-act-del]');
  if (del) { state.wf.actions = removeAction(state.wf.actions, del.dataset.actDel); if (state.selected && state.selected.id === del.dataset.actDel) { state.selected = null; state.panel = null; } commit(); render(); toast('Acción eliminada'); return; }
  const grpAdd = e.target.closest('[data-grp-add]');
  if (grpAdd) { const scope = grpAdd.closest('[data-scope]').dataset.scope; const groups = findGroups(scope); groups.push({ id: uuid(), conditions: [{ id: uuid(), property: '', operator: 'eq', value: '' }] }); commit(); renderPanel(); renderCanvas(); return; }
  const grpDel = e.target.closest('[data-grp-del]');
  if (grpDel) { const scope = grpDel.closest('[data-scope]').dataset.scope; const groups = findGroups(scope); const i = groups.findIndex((g) => g.id === grpDel.dataset.grpDel); if (i >= 0) groups.splice(i, 1); commit(); renderPanel(); renderCanvas(); return; }
  const condAdd = e.target.closest('[data-cond-add]');
  if (condAdd) { const scope = condAdd.closest('[data-scope]').dataset.scope; const g = (findGroups(scope) || []).find((x) => x.id === condAdd.dataset.condAdd); if (g) { g.conditions = g.conditions || []; g.conditions.push({ id: uuid(), property: '', operator: 'eq', value: '' }); commit(); renderPanel(); renderCanvas(); } return; }
  const condDel = e.target.closest('[data-cond-del]');
  if (condDel) { const scope = condDel.closest('[data-scope]').dataset.scope; const hit = findCond(scope, condDel.dataset.condDel); if (hit) { hit.g.conditions = hit.g.conditions.filter((c) => c.id !== hit.c.id); commit(); renderPanel(); renderCanvas(); } return; }
  const tokenFor = e.target.closest('[data-token-for]');
  if (tokenFor) { const key = tokenFor.dataset.tokenFor; openTokenPicker({ anchor: tokenFor, objects: TOKEN_OBJECTS, onPick: ({ marker }) => { const ta = root.querySelector(`[data-cfg="${key}"]`); if (ta) { ta.value = `${ta.value}${ta.value && !ta.value.endsWith(' ') ? ' ' : ''}${marker}`; ta.dispatchEvent(new (root.ownerDocument.defaultView.Event)('input', { bubbles: true })); } } }); return; }
  const node = e.target.closest('[data-node]');
  const we = e.target.closest('[data-we]');
  if (!we) { if (node && !e.target.closest('button, input, select, textarea, a')) { state.selected = node.dataset.node === 'trigger' ? { kind: 'trigger' } : { kind: 'action', id: node.dataset.node }; state.panel = 'config'; state.adding = null; render(); } return; }
  const a = we.dataset.we;
  closeMenus();
  if (a === 'rename') { state.editingName = true; render(); } else if (a === 'save') { flush(); toast('Workflow guardado'); render(); } else if (a === 'select-trigger') { state.selected = { kind: 'trigger' }; state.panel = 'config'; state.adding = null; render(); } else if (a === 'panel-close') { state.panel = null; state.adding = null; state.selected = null; render(); } else if (a === 'trigger-clear') { state.wf.trigger.groups = []; commit(); render(); } else if (a === 'reenroll') { state.wf.trigger.reenroll = !state.wf.trigger.reenroll; commit(); render(); } else if (a === 'undo') undo();
  else if (a === 'redo') redo();
  else if (a === 'delete-selected') { if (state.selected && state.selected.kind === 'action') { state.wf.actions = removeAction(state.wf.actions, state.selected.id); state.selected = null; state.panel = null; commit(); render(); } } else if (a === 'zoom-in') { state.zoom = Math.min(150, state.zoom + 10); render(); } else if (a === 'zoom-out') { state.zoom = Math.max(50, state.zoom - 10); render(); } else if (a === 'zoom-reset') { state.zoom = 100; render(); } else if (a === 'minimap') { state.minimap = !state.minimap; render(); } else if (a === 'test') openTest();
  else if (a === 'history') openHistory();
  else if (a === 'details') openDetails();
  else if (a === 'clone') { flush(); const c = cloneWorkflow(state.wf.id); if (c) { toast(`Workflow clonado como «${c.name}»`); location.href = `?id=${c.id}`; } } else if (a === 'delete') modal('Eliminar workflow', `<p>¿Seguro que quieres eliminar «${esc(state.wf.name)}»? Podrás restaurarlo desde la vista «Eliminado».</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-wm="confirm-delete">Eliminar</button>${cancelBtn}`, { size: '' });
  else if (a === 'help') toast('Un workflow inscribe los registros que cumplen el desencadenante y ejecuta sus acciones en orden; las ramas if/then separan el recorrido según condiciones.');
  else if (a === 'shortcuts') toast('Ctrl/Cmd+Z deshacer · Ctrl/Cmd+Shift+Z rehacer · Supr elimina la acción seleccionada');
});
root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'wfe-catq') { state.catalogQ = t.value; const panel = $('wfe-panel'); const q = t.value; panel.querySelector('.wfe__cat').outerHTML = panelHtml().replace(/^[\s\S]*?(<div class="wfe__cat">)/, '$1'); const inp = $('wfe-catq'); if (inp) { inp.value = q; inp.focus(); inp.setSelectionRange(q.length, q.length); } return; }
  if (t.id === 'wfe-name') { state.wf.name = t.value; return; }
  if (t.dataset.cfg) { const form = t.closest('[data-action-form]'); const a = state.wf.actions.find((x) => x.id === form.dataset.actionForm); if (a) { a.config[t.dataset.cfg] = t.type === 'number' ? Number(t.value) : t.value; commit(); renderCanvas(); } return; }
  const cv = t.dataset.condVal;
  if (cv) { const scope = t.closest('[data-scope]').dataset.scope; const hit = findCond(scope, cv); if (hit) { hit.c.value = t.multiple ? [...t.selectedOptions].map((o) => o.value) : t.value; commit(); renderCanvas(); } }
});
root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'wfe-publish') { if (t.checked) { t.checked = false; openPublish(); } else { unpublish(state.wf.id); state.wf.status = 'off'; state.lastSnapshot = snapshot(); render(); toast('Workflow desactivado'); } return; }
  if (t.id === 'wfe-object') { state.wf.objectType = t.value; state.wf.trigger.groups = []; commit(); render(); return; }
  if (t.id === 'wfe-reenroll') { state.wf.trigger.reenroll = t.checked; commit(); renderCanvas(); return; }
  if (t.dataset.cfg) { const form = t.closest('[data-action-form]'); const a = state.wf.actions.find((x) => x.id === form.dataset.actionForm); if (a) { a.config[t.dataset.cfg] = t.type === 'number' ? Number(t.value) : t.value; if (['property', 'toObject', 'from'].includes(t.dataset.cfg)) { if (t.dataset.cfg === 'property') a.config.value = ''; renderPanel(); } commit(); renderCanvas(); } return; }
  const scopeEl = t.closest('[data-scope]');
  if (!scopeEl) return;
  const scope = scopeEl.dataset.scope;
  if (t.dataset.condProp) { const hit = findCond(scope, t.dataset.condProp); if (hit) { hit.c.property = t.value; hit.c.value = ''; commit(); renderPanel(); renderCanvas(); } } else if (t.dataset.condOp) { const hit = findCond(scope, t.dataset.condOp); if (hit) { hit.c.operator = t.value; if (['known', 'unknown'].includes(t.value)) hit.c.value = ''; commit(); renderPanel(); renderCanvas(); } } else if (t.dataset.condVal) { const hit = findCond(scope, t.dataset.condVal); if (hit) { hit.c.value = t.multiple ? [...t.selectedOptions].map((o) => o.value) : t.value; commit(); renderCanvas(); } }
});
root.addEventListener('keydown', (e) => {
  if (e.target.id === 'wfe-name' && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); if (e.key === 'Enter') { state.wf.name = e.target.value.trim() || state.wf.name; commit(); } state.editingName = false; render(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
});
root.addEventListener('focusout', (e) => { if (e.target.id === 'wfe-name' && state.editingName) { state.wf.name = e.target.value.trim() || state.wf.name; state.editingName = false; commit(); render(); } });

// ---------- boot ----------
const initial = workflowById(params.get('id'));
if (!initial) {
  root.innerHTML = '<div class="wfe"><header class="wfe__bar"><a class="seqed__back" href="../">‹ Volver</a><div class="wfe__name"><h1>Workflow no encontrado</h1></div></header><p class="tpls__empty">Ese workflow ya no existe. Vuelve a la lista para crear uno nuevo.</p></div>';
} else {
  state.wf = initial;
  state.lastSnapshot = snapshot();
  render();
}

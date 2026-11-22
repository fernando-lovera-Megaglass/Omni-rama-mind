// «Crear workflow» (automation/create/?mode=blank|template|ai), the page the list's «Crear workflow» menu opens,
// laid out as the original's: a dark bar («‹ Volver a workflows», the title, the primary button on the right),
// three tabs — Desde cero (choose the object the workflow is based on, name and folder), Plantillas (a gallery
// of template cards filtered by object, with a live preview of the chosen one) and Con IA (describe the
// automation, generate a draft, preview it) — and a right column that previews the flow (trigger, numbered
// steps, Fin) before anything is created. Creating goes straight to the editor.
import { toast } from './shell.js';
import { ACT_ICONS } from './action-icons.js';
import { ready, createWorkflow, folders, TEMPLATES, draftFromPrompt, OBJECT_TYPES, OBJECT_LABEL, OBJECT_PLURAL, ACTION_DEFS, describeAction, conditionText } from './workflows-data.js';

await ready;
const root = document.getElementById('wfc-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const MODES = [['blank', 'Desde cero'], ['template', 'Plantillas'], ['ai', 'Con IA']];
const OBJECT_DESC = {
  contacts: 'Inscribe contactos según sus propiedades, sus actividades o los segmentos a los que pertenecen.',
  companies: 'Inscribe empresas según sus propiedades o los contactos y negocios asociados.',
  deals: 'Inscribe negocios según su pipeline, su etapa, su importe o sus actividades.',
  tickets: 'Inscribe tickets según su pipeline, su estado, su prioridad o su fuente.',
};
const EXAMPLES = ['Cuando un ticket sea urgente, crear una tarea y avisar por correo a soporte', 'Cuando un negocio pase a Ganado, avisar al equipo en la app', 'Asignar propietario a las empresas nuevas sin propietario'];
const GROUP_CLASS = { 'Comunicación': 'com', CRM: 'crm', Flujo: 'flow', Tareas: 'task' };
const state = {
  mode: MODES.some((m) => m[0] === params.get('mode')) ? params.get('mode') : 'blank',
  objectType: OBJECT_LABEL[params.get('object')] ? params.get('object') : 'contacts',
  name: '', folder: '', templateKey: '', templateFilter: '', prompt: '', draft: null,
};
const defaultName = () => `Workflow sin título ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
const template = () => TEMPLATES.find((t) => t.key === state.templateKey) || null;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

// What the page is about to create, as a workflow-like object for the preview column.
function pending() {
  if (state.mode === 'template') { const t = template(); return t ? { name: t.name, objectType: t.objectType, description: t.description, trigger: t.trigger, actions: t.actions() } : null; }
  if (state.mode === 'ai') return state.draft;
  return { name: state.name.trim() || defaultName(), objectType: state.objectType, description: '', trigger: { groups: [], reenroll: false }, actions: [] };
}
function previewHtml() {
  const w = pending();
  if (!w) return `<div class="wfc__previewempty">${ACT_ICONS.workflow}<p>${state.mode === 'template' ? 'Elige una plantilla para ver su flujo.' : 'Describe el workflow y genera el borrador para ver su flujo.'}</p></div>`;
  const groups = (w.trigger && w.trigger.groups) || [];
  const steps = (w.actions || []).filter((a) => !a.parentId);
  return `
    <div class="wfc__flow">
      <article class="wfn wfn--trigger wfc__node"><div class="wfn__head"><span class="wfn__ico" aria-hidden="true">${ACT_ICONS.lightning}</span><div class="wfn__text"><strong>Activar la inscripción para ${esc(OBJECT_PLURAL[w.objectType])}</strong><div class="wfn__desc">${groups.length ? groups.map((g, i) => `${i ? '<span class="wfc__or">o</span> ' : ''}${(g.conditions || []).map((c) => esc(conditionText(w.objectType, c))).join(' <span class="wfc__and">y</span> ')}`).join(' ') : 'Las condiciones se definen en el editor.'}</div></div></div></article>
      ${steps.map((a, i) => { const def = ACTION_DEFS[a.type] || { label: a.type, icon: '', group: 'CRM' }; const d = describeAction(w, a); return `<span class="wfc__line" aria-hidden="true"></span><article class="wfn wfn--action wfn--${GROUP_CLASS[def.group] || 'crm'} wfc__node"><div class="wfn__head"><span class="wfn__ico" aria-hidden="true">${def.icon}</span><div class="wfn__text"><strong>${i + 1}. ${esc(def.label)}</strong><div class="wfn__desc">${esc(d.text)}${d.to ? ` <span class="wfn__to">${esc(d.to)}</span>` : ''}</div></div></div></article>`; }).join('')}
      <span class="wfc__line" aria-hidden="true"></span><div class="wfn wfn--end">${steps.length + 1}. Fin</div>
    </div>`;
}
function leftHtml() {
  const folderSelect = `<label class="field"><span>Carpeta</span><select id="wfc-folder"><option value="">Sin carpeta</option>${folders().map((x) => `<option value="${esc(x)}" ${state.folder === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`;
  if (state.mode === 'template') {
    const list = TEMPLATES.filter((t) => !state.templateFilter || t.objectType === state.templateFilter);
    return `
      <h2>Empieza con una plantilla</h2>
      <p class="muted">Cada plantilla trae el desencadenante y las acciones ya configurados; podrás cambiarlos en el editor.</p>
      <div class="wfc__chips">${[['', 'Todas'], ...OBJECT_TYPES.map(([k, l]) => [k, `${l}s`])].map(([k, l]) => `<button class="chip${state.templateFilter === k ? ' is-active' : ''}" type="button" data-tfilter="${k}">${esc(l)}</button>`).join('')}</div>
      <div class="wfc__gallery">${list.map((t) => { const n = t.actions().length; return `<button class="wfc__card${state.templateKey === t.key ? ' is-on' : ''}" type="button" data-template="${esc(t.key)}" aria-pressed="${state.templateKey === t.key}"><span class="wfc__cardicon">${ACT_ICONS[t.objectType] || ACT_ICONS.workflow}</span><strong>${esc(t.name)}</strong><p>${esc(t.description)}</p><span class="wfc__cardmeta"><span class="tag tag--none">${esc(OBJECT_LABEL[t.objectType])}</span><span class="muted">${plural(n, 'acción', 'acciones')}</span></span></button>`; }).join('') || '<p class="muted">No hay plantillas para ese objeto.</p>'}</div>
      ${folderSelect}`;
  }
  if (state.mode === 'ai') {
    return `
      <h2>Describe el workflow</h2>
      <p class="muted">Cuenta qué quieres automatizar: el objeto, cuándo debe inscribirse y qué debe pasar. Generaremos un borrador que podrás ajustar en el editor.</p>
      <label class="field"><span>Descripción</span><textarea id="wfc-prompt" rows="4" placeholder="P. ej. Cuando un ticket sea urgente, crear una tarea y avisar por correo a soporte">${esc(state.prompt)}</textarea></label>
      <div class="wfc__chips">${EXAMPLES.map((x) => `<button class="chip" type="button" data-example="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="wfc__row"><button class="btn btn--secondary" type="button" data-wc="generate">${state.draft ? 'Volver a generar' : 'Generar borrador'}</button>${state.draft ? `<span class="muted">Borrador «${esc(state.draft.name)}» · ${esc(OBJECT_LABEL[state.draft.objectType])} · ${plural(state.draft.actions.length, 'acción', 'acciones')}</span>` : ''}</div>
      ${folderSelect}`;
  }
  return `
    <h2>Elige el tipo de workflow</h2>
    <p class="muted">El tipo de objeto decide qué registros se inscriben y qué propiedades y acciones estarán disponibles.</p>
    <div class="wfc__opts">${OBJECT_TYPES.map(([k, l]) => `<label class="wfc__opt${state.objectType === k ? ' is-on' : ''}"><input type="radio" name="object" value="${k}" ${state.objectType === k ? 'checked' : ''} /><span class="wfc__opticon">${ACT_ICONS[k] || ''}</span><span class="wfc__opttext"><strong>Basado en ${esc(OBJECT_PLURAL[k])}</strong><small>${esc(OBJECT_DESC[k])}</small></span></label>`).join('')}</div>
    <label class="field"><span>Nombre del workflow</span><input id="wfc-name" value="${esc(state.name)}" placeholder="${esc(defaultName())}" maxlength="120" /><small class="muted">Si lo dejas vacío, se llamará «${esc(defaultName())}»; puedes cambiarlo en el editor.</small></label>
    ${folderSelect}`;
}
function render() {
  const w = pending();
  const ready = Boolean(w);
  const label = state.mode === 'template' ? 'Usar plantilla' : state.mode === 'ai' ? 'Crear workflow' : 'Siguiente';
  document.title = 'Crear workflow | Omni';
  root.innerHTML = `
    <div class="wfe wfc">
      <header class="wfe__bar"><a class="wfe__back" href="../"><span aria-hidden="true">‹</span> Volver a workflows</a><div class="wfe__name"><h1>Crear workflow</h1></div><div class="wfe__barright"><button class="btn btn--primary" type="button" data-wc="create" ${ready ? '' : 'disabled'}>${label}</button></div></header>
      <nav class="seqs__tabs wfc__tabs" role="tablist" aria-label="Formas de crear">${MODES.map(([k, l]) => `<button class="seqs__tab wfc__tab${state.mode === k ? ' is-active' : ''}" type="button" role="tab" data-mode="${k}" aria-selected="${state.mode === k}">${l}</button>`).join('')}</nav>
      <div class="wfc__body">
        <section class="wfc__left">${leftHtml()}</section>
        <aside class="wfc__preview" id="wfc-preview" aria-label="Vista previa del flujo"><div class="wfc__previewhead"><strong>Vista previa</strong>${w ? `<span class="muted">${esc(w.name)}</span>` : ''}</div>${previewHtml()}</aside>
      </div>
    </div>`;
}
function create() {
  let w = null;
  if (state.mode === 'blank') w = createWorkflow({ name: state.name.trim() || defaultName(), objectType: state.objectType, folder: state.folder });
  else if (state.mode === 'template') { const t = template(); if (!t) { toast('Elige una plantilla.'); return null; } w = createWorkflow({ name: t.name, objectType: t.objectType, description: t.description, folder: state.folder, trigger: JSON.parse(JSON.stringify(t.trigger)), actions: t.actions() }); }
  else { if (!state.draft) { toast('Genera primero el borrador.'); return null; } w = createWorkflow({ ...state.draft, folder: state.folder }); }
  if (!w) { toast('No se pudo crear el workflow.'); return null; }
  toast(state.mode === 'template' ? `Workflow «${w.name}» creado desde la plantilla` : state.mode === 'ai' ? `Borrador «${w.name}» generado con IA` : `Workflow «${w.name}» creado`);
  location.href = `../editor/?id=${w.id}`;
  return w;
}

root.addEventListener('click', (e) => {
  const mode = e.target.closest('[data-mode]');
  if (mode) { state.mode = mode.dataset.mode; params.set('mode', state.mode); history.replaceState(null, '', `?${params}`); render(); return; }
  const tf = e.target.closest('[data-tfilter]');
  if (tf) { state.templateFilter = tf.dataset.tfilter; render(); return; }
  const card = e.target.closest('[data-template]');
  if (card) { state.templateKey = card.dataset.template; render(); return; }
  const ex = e.target.closest('[data-example]');
  if (ex) { state.prompt = ex.dataset.example; state.draft = null; render(); return; }
  const wc = e.target.closest('[data-wc]');
  if (!wc) return;
  if (wc.dataset.wc === 'generate') { if (!state.prompt.trim()) { toast('Describe el workflow que quieres crear.'); return; } state.draft = draftFromPrompt(state.prompt); render(); return; }
  if (wc.dataset.wc === 'create') create();
});
root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'object') { state.objectType = t.value; render(); return; }
  if (t.id === 'wfc-folder') state.folder = t.value;
});
root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'wfc-name') { state.name = t.value; const head = root.querySelector('.wfc__previewhead .muted'); if (head) head.textContent = state.name.trim() || defaultName(); return; }
  if (t.id === 'wfc-prompt') { state.prompt = t.value; state.draft = null; const b = root.querySelector('[data-wc="create"]'); if (b) b.disabled = true; }
});

render();
export { state, render, create };

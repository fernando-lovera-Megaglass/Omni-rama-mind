// Segment editor (specification PARTE A §2-§4): object chooser, editable name, "Añadir a carpeta", the
// filter panel (shared editor: properties of the record and of associated records, Afiliaciones, Y/O groups,
// clone/remove groups, 250/60 limits, optional natural-language suggestions), live preview, and the save
// dialog (Activo/Estático, description, campaign, Acceso) that processes the segment. Static segments
// keep a fixed membership edited by hand; "Usar segmento" lists the uses of §4.
import { boot } from './page.js';
import { wireMenus, closeMenus, toast } from './shell.js';
import { ALL, formatDate } from './data.js';
import { createFilterEditor, suggestConditions, newCondition } from './filter-editor.js';
import { segments, segmentById, folders, saveFolders, addSegment, updateSegment, processSegment, segmentMembers, segmentSize, addStaticMembers, removeStaticMembers, describeSegment, filterCounts, objectLabel, objectPlural, SEGMENT_OBJECTS, TYPE_LABELS, CAMPAIGNS, LIMITS, ME } from './segments-data.js';

const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const root = document.getElementById('sedit-root');
const $ = (id) => document.getElementById(id);
const num = (n) => Number(n || 0).toLocaleString('en-US');

const existing = params.get('id') ? segmentById(params.get('id')) : null;
const state = {
  id: existing ? existing.id : null,
  object: existing ? existing.object : (SEGMENT_OBJECTS.some(([k]) => k === params.get('object')) ? params.get('object') : ''),
  name: existing ? existing.name : '',
  type: existing ? existing.type : (params.get('type') === 'static' ? 'static' : 'active'),
  folder: existing ? existing.folder || '' : '',
  description: existing ? existing.description || '' : '',
  campaign: existing ? existing.campaign || '' : '',
  access: existing ? { view: 'all', edit: 'all', ...(existing.access || {}) } : { view: 'all', edit: 'all', teams: [] },
  filters: existing ? JSON.parse(JSON.stringify(existing.filters || [])) : [],
  memberIds: existing ? (existing.memberIds || []).slice() : [],
  editingName: !existing,
  dirty: false,
  saving: false,
  processed: Boolean(existing && existing.processedAt),
  accessTab: 'details',
  memberQuery: '',
};
boot({ root: '../../', active: 'crm', sub: 'Segmentos', title: state.id ? `${state.name} | Segmentos` : 'Crear segmento' });
let editor = null;
const sub = (r) => r.email || r.domain || r.company || r.pipeline || '';
// Records the segment holds right now: the fixed members of a saved static segment, otherwise the records
// that satisfy the filters (all of them when there are no filters).
const previewRows = () => {
  if (state.type === 'static' && state.id) return segmentMembers({ ...state });
  if (!state.filters.some((c) => c.key)) return ALL[state.object] ? ALL[state.object]() : [];
  return segmentMembers({ ...state, type: 'active', id: state.id || 0 });
};

// ---------- object chooser (step 1 of §2) ----------
function renderChooser() {
  root.innerHTML = `
    <div class="sedit__bar"><a class="imp__back" href="../">‹ Segmentos</a><h1>Crear segmento</h1></div>
    <div class="sedit__chooser">
      <section class="imp__card">
        <h2>Elige el objeto a segmentar</h2>
        <p class="muted">Un segmento agrupa registros de un objeto según criterios. Activo: se actualiza solo. Estático: foto fija que se edita a mano.</p>
        <div class="sedit__objects">${SEGMENT_OBJECTS.map(([k, l]) => `<button class="sedit__object" type="button" data-object="${k}"><strong>${l}s</strong><span class="muted">${num(ALL[k] ? ALL[k]().length : 0)} registros</span></button>`).join('')}</div>
      </section>
    </div>`;
}

// ---------- editor ----------
function render() {
  if (!state.object) { renderChooser(); return; }
  const counts = filterCounts(state.filters);
  const rows = previewRows();
  const q = state.memberQuery.trim().toLowerCase();
  const candidates = state.type === 'static' && q ? (ALL[state.object] ? ALL[state.object]() : []).filter((r) => `${r.name} ${sub(r)}`.toLowerCase().includes(q) && !state.memberIds.includes(Number(r.id))).slice(0, 8) : [];
  root.innerHTML = `
    <div class="sedit__bar">
      <a class="imp__back" href="../">‹ Segmentos</a>
      <div class="sedit__title">
        ${state.editingName ? `<input type="text" id="sedit-name" class="sedit__nameinput" value="${esc(state.name)}" placeholder="Nombre del segmento" maxlength="80" aria-label="Nombre del segmento" /><button class="btn btn--ghost btn--sm" type="button" data-act="name-ok">Listo</button>` : `<h1>${esc(state.name)}</h1><button class="icon-btn" type="button" data-act="name-edit" aria-label="Cambiar nombre" title="Cambiar nombre">✎</button>`}
        <span class="seg__type sedit__typetag"><span class="seg__dot seg__dot--${state.type}"></span>${TYPE_LABELS[state.type]} · ${objectLabel(state.object)}s</span>
        ${state.id ? `<span class="muted sedit__meta">${state.processed ? `Procesado · ${num(segmentSize({ ...state }))} registros` : 'Sin procesar'}${state.dirty ? ' · cambios sin guardar' : ''}</span>` : ''}
      </div>
      <div class="sedit__actions">
        <div class="menu"><button class="btn btn--ghost btn--pillx" type="button" aria-haspopup="true" aria-expanded="false">Añadir a carpeta <span class="caret"></span></button><div class="menu__panel menu__panel--right"><button class="menu__item${!state.folder ? ' is-current' : ''}" type="button" data-folder="">Sin carpeta</button>${folders().map((f) => `<button class="menu__item${state.folder === f ? ' is-current' : ''}" type="button" data-folder="${esc(f)}">${esc(f)}</button>`).join('')}<button class="menu__item menu__item--strong" type="button" data-act="new-folder">＋ Nueva carpeta</button></div></div>
        ${state.id ? `<div class="menu"><button class="btn btn--ghost btn--pillx" type="button" aria-haspopup="true" aria-expanded="false">Usar segmento <span class="caret"></span></button><div class="menu__panel menu__panel--right">
          <button class="menu__item" type="button" data-use="email" ${state.object === 'contacts' ? '' : 'disabled title="Solo segmentos de contactos"'}>Enviar correo de marketing</button>
          <button class="menu__item" type="button" data-use="workflow">Inscribir en un workflow</button>
          <button class="menu__item" type="button" data-use="ads" ${state.object === 'contacts' || state.object === 'companies' ? '' : 'disabled title="Solo contactos y empresas"'}>Crear audiencia de anuncios</button>
          <button class="menu__item" type="button" data-use="survey" ${state.object === 'contacts' && state.type === 'static' ? '' : 'disabled title="Solo segmentos estáticos de contactos"'}>Encuesta de satisfacción</button>
          <button class="menu__item" type="button" data-use="clone">Clonar</button>
        </div></div>` : ''}
        <button class="btn btn--primary btn--pillx" type="button" data-act="save">${state.id ? 'Guardar y procesar segmento' : 'Guardar'}</button>
      </div>
    </div>
    <div class="sedit__body">
      <aside class="sedit__filters">
        <div class="sedit__filters-head"><h2>Filtros</h2><span class="muted">${counts.total}/${LIMITS.conditions}${counts.associated ? ` · ${counts.associated}/${LIMITS.associated} asociados` : ''}</span></div>
        ${state.type === 'static' && state.id ? `<p class="muted">Este segmento es estático: los filtros solo se usaron para la foto inicial. Añade o quita registros a mano en la vista previa.</p>` : ''}
        <details class="adv-help sedit__ai"><summary>✦ Generar filtros con IA</summary><p class="muted">Describe el segmento y se proponen filtros que puedes editar después.</p><div class="sedit__ai-row"><input type="text" id="sedit-ai" placeholder="Por ejemplo: contactos distribuidores en Monterrey con correo" /><button class="btn btn--ghost btn--sm" type="button" data-act="ai">Proponer</button></div></details>
        <p class="muted adv-summary" id="sedit-summary"></p>
        <div id="sedit-groups"></div>
        <button class="link-btn" type="button" id="sedit-add-group">+ Añadir grupo de filtros (O)</button>
      </aside>
      <section class="sedit__preview">
        <div class="sedit__preview-head"><h2>Vista previa</h2><strong>${num(rows.length)} ${objectPlural(state.object)}</strong>${state.type === 'static' && state.id ? '<span class="muted">miembros fijos</span>' : '<span class="muted">cumplen los filtros ahora</span>'}</div>
        ${state.type === 'static' && state.id ? `<div class="sedit__addmember"><input type="search" id="sedit-member-q" value="${esc(state.memberQuery)}" placeholder="Añadir registros: busca por nombre, correo o dominio" aria-label="Buscar registros para añadir" />${candidates.length ? `<ul class="sedit__candidates">${candidates.map((r) => `<li><span>${esc(r.name)}${sub(r) ? ` <span class="muted">· ${esc(sub(r))}</span>` : ''}</span><button class="btn btn--ghost btn--sm" type="button" data-add-member="${r.id}">Añadir</button></li>`).join('')}</ul>` : ''}</div>` : ''}
        <div class="table-wrap"><table class="table sedit__table"><thead><tr><th>Nombre</th><th>Detalle</th><th>Propietario</th><th>Creado</th>${state.type === 'static' && state.id ? '<th></th>' : ''}</tr></thead>
          <tbody>${rows.length ? rows.slice(0, 25).map((r) => `<tr data-id="${r.id}"><td><a class="seg__name" href="../../${state.object}/record/?id=${r.id}">${esc(r.name)}</a></td><td>${esc(sub(r)) || '<span class="muted">—</span>'}</td><td>${esc(r.owner || '')}</td><td>${r.created ? formatDate(r.created) : ''}</td>${state.type === 'static' && state.id ? `<td class="num"><button class="link-btn" type="button" data-remove-member="${r.id}">Quitar</button></td>` : ''}</tr>`).join('') : `<tr><td colspan="5" class="muted seg__empty">Ningún ${esc(objectLabel(state.object).toLowerCase())} cumple los filtros.</td></tr>`}</tbody></table></div>
        ${rows.length > 25 ? `<p class="muted">Se muestran 25 de ${num(rows.length)}.</p>` : ''}
      </section>
    </div>
    <div class="drawer drawer--modal" id="sedit-modal" aria-hidden="true"><div class="drawer__panel drawer__panel--dialog" role="dialog" aria-labelledby="sedit-modal-title"><div class="drawer__head drawer__head--light"><h2 id="sedit-modal-title"></h2><button class="drawer__close" type="button" data-close aria-label="Cerrar">×</button></div><div class="drawer__body" id="sedit-modal-body"></div><div class="drawer__foot" id="sedit-modal-foot"></div></div></div>`;
  wireMenus(root);
  editor = createFilterEditor({
    type: state.object,
    container: $('sedit-groups'),
    summary: $('sedit-summary'),
    get: () => state.filters,
    set: (c) => { state.filters = c; },
    singular: objectLabel(state.object),
    showCategories: true,
    segmentOptions: () => segments().filter((s) => s.object === state.object && Number(s.id) !== Number(state.id)).map((s) => [String(s.id), s.name]),
    onChange: () => { state.dirty = true; refreshPreview(); },
  });
  editor.render();
  $('sedit-add-group').addEventListener('click', () => editor.addGroup());
  const nameInput = $('sedit-name');
  if (nameInput) { nameInput.focus(); nameInput.addEventListener('input', () => { state.name = nameInput.value; state.dirty = true; }); nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.editingName = false; render(); } }); }
  const mq = $('sedit-member-q');
  if (mq) mq.addEventListener('input', () => { state.memberQuery = mq.value; const pos = mq.selectionStart; render(); const n = $('sedit-member-q'); n.focus(); n.setSelectionRange(pos, pos); });
}
// Re-render only the preview and the counters (keeps the filter editor's focus).
function refreshPreview() {
  const rows = previewRows();
  const head = root.querySelector('.sedit__preview-head strong');
  if (head) head.textContent = `${num(rows.length)} ${objectPlural(state.object)}`;
  const body = root.querySelector('.sedit__table tbody');
  if (body) body.innerHTML = rows.length ? rows.slice(0, 25).map((r) => `<tr data-id="${r.id}"><td><a class="seg__name" href="../../${state.object}/record/?id=${r.id}">${esc(r.name)}</a></td><td>${esc(sub(r)) || '<span class="muted">—</span>'}</td><td>${esc(r.owner || '')}</td><td>${r.created ? formatDate(r.created) : ''}</td></tr>`).join('') : `<tr><td colspan="5" class="muted seg__empty">Ningún ${esc(objectLabel(state.object).toLowerCase())} cumple los filtros.</td></tr>`;
  const counts = filterCounts(state.filters);
  const c = root.querySelector('.sedit__filters-head .muted');
  if (c) c.textContent = `${counts.total}/${LIMITS.conditions}${counts.associated ? ` · ${counts.associated}/${LIMITS.associated} asociados` : ''}`;
  const meta = root.querySelector('.sedit__meta');
  if (meta && state.id) meta.textContent = `${state.processed ? `Procesado · ${num(segmentSize({ ...state }))} registros` : 'Sin procesar'} · cambios sin guardar`;
}

// ---------- save dialog (§2.5) ----------
function openModal(title, body, foot = '') {
  $('sedit-modal-title').textContent = title;
  $('sedit-modal-body').innerHTML = body;
  $('sedit-modal-foot').innerHTML = foot;
  $('sedit-modal').classList.add('is-open');
  $('sedit-modal').setAttribute('aria-hidden', 'false');
}
function closeModal() { $('sedit-modal').classList.remove('is-open'); $('sedit-modal').setAttribute('aria-hidden', 'true'); }
function openSave() {
  if (!state.name.trim()) { toast('Escribe el nombre del segmento'); state.editingName = true; render(); return; }
  const preview = previewRows().length;
  openModal(state.id ? 'Guardar y procesar segmento' : 'Guardar segmento', `
    <div class="sedit__savetabs"><button class="seg__tab${state.accessTab === 'details' ? ' is-active' : ''}" type="button" data-savetab="details">Detalles</button><button class="seg__tab${state.accessTab === 'access' ? ' is-active' : ''}" type="button" data-savetab="access">Acceso</button></div>
    ${state.accessTab === 'details' ? `
    <fieldset class="field"><span>Tipo de segmento</span>
      <label class="radio${state.type === 'active' ? ' is-on' : ''}"><input type="radio" name="segtype" value="active" ${state.type === 'active' ? 'checked' : ''} ${state.id && existing && existing.type === 'static' ? 'disabled' : ''} /> <span><strong>Activo</strong><small>Se actualiza solo: los registros entran al cumplir los criterios y salen al dejar de cumplirlos. Para envíos recurrentes y propiedades que cambian.</small></span></label>
      <label class="radio${state.type === 'static' ? ' is-on' : ''}"><input type="radio" name="segtype" value="static" ${state.type === 'static' ? 'checked' : ''} /> <span><strong>Estático</strong><small>Foto fija de los ${num(preview)} registros que cumplen los criterios ahora; después se añaden o quitan a mano. Para envíos únicos, asistentes a un evento o borrado en bloque.</small></span></label>
    </fieldset>
    <label class="field"><span>Descripción <button class="link-btn" type="button" data-act="describe">✦ Generar con IA</button></span><textarea id="sedit-desc" rows="3" placeholder="Para qué sirve este segmento">${esc(state.description)}</textarea></label>
    <label class="field"><span>Asociar a una campaña (opcional)</span><select id="sedit-campaign"><option value="">Sin campaña</option>${CAMPAIGNS.map((c) => `<option ${state.campaign === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>` : `
    <p class="muted">Quién puede ver y editar este segmento.</p>
    <label class="field"><span>Ver</span><select id="sedit-view"><option value="all" ${state.access.view === 'all' ? 'selected' : ''}>Todos los usuarios</option><option value="me" ${state.access.view === 'me' ? 'selected' : ''}>Solo yo</option><option value="teams" ${state.access.view === 'teams' ? 'selected' : ''}>Equipos concretos</option></select></label>
    <label class="field"><span>Editar</span><select id="sedit-edit"><option value="all" ${state.access.edit === 'all' ? 'selected' : ''}>Todos los usuarios</option><option value="me" ${state.access.edit === 'me' ? 'selected' : ''}>Solo yo</option><option value="teams" ${state.access.edit === 'teams' ? 'selected' : ''}>Equipos concretos</option></select></label>
    <div class="sedit__teams">${['Ventas Norte', 'Ventas Sur', 'Soporte'].map((t) => `<label class="imp__check"><input type="checkbox" data-team="${t}" ${(state.access.teams || []).includes(t) ? 'checked' : ''} /> ${t}</label>`).join('')}</div>`}`,
    `<button class="btn btn--primary" type="button" data-act="save-confirm">${state.id ? 'Guardar y procesar segmento' : 'Guardar y procesar segmento'}</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
}
function readSaveForm() {
  const d = $('sedit-desc');
  if (d) state.description = d.value.trim();
  const c = $('sedit-campaign');
  if (c) state.campaign = c.value;
  const v = $('sedit-view');
  if (v) state.access.view = v.value;
  const e = $('sedit-edit');
  if (e) state.access.edit = e.value;
  const teams = [...document.querySelectorAll('[data-team]:checked')].map((b) => b.dataset.team);
  if (document.querySelector('[data-team]')) state.access.teams = teams;
}
async function saveAndProcess() {
  readSaveForm();
  closeModal();
  state.saving = true;
  const filters = state.filters.filter((c) => c.key);
  let seg;
  if (state.id) seg = updateSegment(state.id, { name: state.name.trim(), type: state.type, folder: state.folder, description: state.description, campaign: state.campaign, access: state.access, filters, memberIds: state.type === 'static' ? state.memberIds : [] });
  else { seg = addSegment({ name: state.name.trim(), object: state.object, type: state.type, folder: state.folder, description: state.description, campaign: state.campaign, access: state.access, filters, memberIds: [] }); state.id = seg.id; history.replaceState(null, '', `?id=${seg.id}`); }
  toast('Procesando segmento…');
  await new Promise((r) => setTimeout(r, 300));
  const done = processSegment(seg.id);
  state.memberIds = (done && done.memberIds) || [];
  state.processed = true;
  state.dirty = false;
  state.saving = false;
  state.editingName = false;
  render();
  toast(`Segmento "${done ? done.name : state.name}" procesado: ${num(done ? done.size : 0)} registros`);
}

// ---------- events ----------
root.addEventListener('click', (e) => {
  const obj = e.target.closest('[data-object]');
  if (obj) { state.object = obj.dataset.object; state.filters = [newCondition(0)]; render(); return; }
  const fold = e.target.closest('[data-folder]');
  if (fold) { state.folder = fold.dataset.folder; state.dirty = true; closeMenus(); render(); toast(fold.dataset.folder ? `Carpeta: ${fold.dataset.folder}` : 'Sin carpeta'); return; }
  const use = e.target.closest('[data-use]');
  if (use) {
    closeMenus();
    const u = use.dataset.use;
    if (u === 'clone') { const copy = addSegment({ ...segmentById(state.id), name: `${state.name} (copia)`, filters: JSON.parse(JSON.stringify(state.filters)), memberIds: state.memberIds.slice(), size: previewRows().length, creator: ME, importId: null }); location.href = `./?id=${copy.id}`; return; }
    toast({ email: 'Correo de marketing: el segmento quedará disponible como destinatarios en la herramienta de correo.', workflow: 'Inscripción en workflow: elige este segmento como desencadenante en Automatizaciones › Workflows.', ads: 'Audiencia de anuncios creada a partir del segmento (sincronización con la red publicitaria).', survey: 'Encuesta de satisfacción: el segmento estático se usará como lista de envío.' }[u]);
    return;
  }
  const addM = e.target.closest('[data-add-member]');
  if (addM) { addStaticMembers(state.id, [Number(addM.dataset.addMember)]); state.memberIds = segmentById(state.id).memberIds; state.memberQuery = ''; render(); toast('Registro añadido al segmento'); return; }
  const rmM = e.target.closest('[data-remove-member]');
  if (rmM) { removeStaticMembers(state.id, [Number(rmM.dataset.removeMember)]); state.memberIds = segmentById(state.id).memberIds; render(); toast('Registro quitado del segmento'); return; }
  const st = e.target.closest('[data-savetab]');
  if (st) { readSaveForm(); state.accessTab = st.dataset.savetab; openSave(); return; }
  if (e.target.closest('[data-close]') || e.target === $('sedit-modal')) { closeModal(); return; }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  e.preventDefault();
  const a = act.dataset.act;
  if (a === 'name-edit') { state.editingName = true; render(); }
  else if (a === 'name-ok') { const i = $('sedit-name'); state.name = i.value.trim(); if (!state.name) { toast('Escribe el nombre del segmento'); return; } state.editingName = false; render(); }
  else if (a === 'new-folder') { closeMenus(); const name = window.prompt('Nombre de la nueva carpeta:'); if (name && name.trim()) { const list = folders(); if (!list.includes(name.trim())) { list.push(name.trim()); saveFolders(list); } state.folder = name.trim(); state.dirty = true; render(); toast(`Carpeta "${name.trim()}" creada`); } }
  else if (a === 'ai') { const text = $('sedit-ai').value; const conds = suggestConditions(state.object, text); if (!conds.length) { toast('No se reconocieron propiedades en la descripción; añade los filtros a mano.'); return; } state.filters = conds; state.dirty = true; editor.render(); refreshPreview(); toast(`${conds.length} filtro(s) propuestos; revísalos y ajústalos.`); }
  else if (a === 'save') openSave();
  else if (a === 'describe') { readSaveForm(); state.description = describeSegment({ ...state, filters: state.filters.filter((c) => c.key) }); $('sedit-desc').value = state.description; toast('Descripción generada'); }
  else if (a === 'save-confirm') saveAndProcess();
});
root.addEventListener('change', (e) => {
  if (e.target.name === 'segtype') { state.type = e.target.value; readSaveForm(); openSave(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

render();
export { state, render, saveAndProcess, openSave };

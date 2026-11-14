// Plantillas de mensaje: the original's templates list (folders on the left, search and owner filter, sortable
// table with multi-select, row actions and pagination) and its editor — a large modal with the compose pane
// (name, subject and rich-text body with personalisation tokens and snippets) next to the sample-e-mail
// preview rendered with a real contact's data.
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { allContacts, relativeTimeFine, formatDate } from './data.js';
import { ready, templates, templateById, folders, owners, createTemplate, updateTemplate, cloneTemplate, deleteTemplates, moveTemplates, setShared, createFolder, stats, resolveTokens, bodyText, templatesCsv, TOKEN_GROUPS, SNIPPETS, LIBRARY, ME } from './templates-data.js';
import { getSignature, editSignature, signatureHtmlOf } from './compose.js';

boot({ root: '../', active: 'crm', sub: 'Plantillas de mensaje', title: 'Plantillas de mensaje' });
await ready;

const root = document.getElementById('tpl-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = { q: '', owner: '', folder: null, sort: { key: 'updatedAt', dir: -1 }, page: 1, pageSize: 25, selected: new Set() };
let editor = null;
const COLS = [['name', 'Nombre'], ['ownerId', 'Propietario'], ['createdAt', 'Fecha de creación'], ['updatedAt', 'Fecha de modificación']];
const fullDate = (iso) => { const d = new Date(iso); return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const sender = () => { const s = getSignature(); return { name: s.name, email: s.email }; };

root.innerHTML = '<div id="tpl-page"></div>';
const page = $('tpl-page');

// ---------- list ----------
function visible() {
  const q = state.q.trim().toLowerCase();
  const list = templates().filter((t) => (state.folder === null || (t.folder || '') === state.folder) && (!state.owner || t.ownerId === state.owner) && (!q || `${t.name} ${t.subject}`.toLowerCase().includes(q)));
  const k = state.sort.key;
  const val = (t) => (k === 'createdAt' || k === 'updatedAt' ? new Date(t[k] || 0).getTime() : String(t[k] || ''));
  return list.sort((a, b) => { const av = val(a); const bv = val(b); return (typeof av === 'number' ? av - bv : av.localeCompare(bv, 'es')) * state.sort.dir; });
}
function renderPage() {
  page.innerHTML = `
    <div class="tpls">
      <header class="tpls__head">
        <h1>Plantillas de mensaje <span class="tpls__count" id="tpl-count"></span></h1>
        <div class="tpls__actions">
          <button class="btn btn--secondary" type="button" data-ta="new-folder">Nueva carpeta</button>
          <button class="btn btn--secondary" type="button" data-ta="analyze">Analizar</button>
          <button class="btn btn--secondary" type="button" data-ta="export">Exportar</button>
          <div class="menu"><button class="btn btn--primary" type="button" aria-haspopup="true">Nueva plantilla <span class="caret"></span></button><div class="menu__panel"><button class="menu__item" type="button" data-ta="new-scratch">Desde cero</button><button class="menu__item" type="button" data-ta="new-library">Desde biblioteca de plantillas</button></div></div>
        </div>
      </header>
      <div class="tpls__body">
        <aside class="tpls__folders" id="tpl-folders" aria-label="Carpetas"></aside>
        <section class="tpls__main">
          <div class="tpls__filters">
            <div class="search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="tpl-q" placeholder="Buscar en plantillas" aria-label="Buscar en plantillas" /></div>
            <select id="tpl-owner" aria-label="Propietario"></select>
            <div class="tpls__bulk" id="tpl-bulk"></div>
          </div>
          <div class="table-wrap" id="tpl-table"></div>
          <div id="tpl-pager"></div>
        </section>
      </div>
    </div>`;
  wireMenus(page);
  renderOwners();
  renderTable();
}
function renderOwners() {
  const sel = $('tpl-owner');
  const list = owners();
  sel.innerHTML = `<option value="">Propietario: Cualquiera</option><option value="${esc(ME)}">Propietario: Yo</option>${list.filter((o) => o !== ME).map((o) => `<option value="${esc(o)}">Propietario: ${esc(o)}</option>`).join('')}`;
  sel.value = state.owner;
}
function renderFolders() {
  const all = templates();
  const count = (f) => all.filter((t) => (t.folder || '') === f).length;
  const item = (label, value, n) => `<button class="tpls__folder${state.folder === value ? ' is-active' : ''}" type="button" data-folder="${value === null ? '*' : esc(value)}"><span>${esc(label)}</span><span class="muted">${n}</span></button>`;
  $('tpl-folders').innerHTML = `<h2>Carpetas</h2>${item('Todas las plantillas', null, all.length)}${folders().map((f) => item(f, f, count(f))).join('')}${item('Sin carpeta', '', count(''))}`;
}
function renderTable() {
  const all = templates();
  const list = visible();
  const pages = Math.max(1, Math.ceil(list.length / state.pageSize));
  if (state.page > pages) state.page = pages;
  const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  $('tpl-count').textContent = plural(all.length, 'creado', 'creados');
  renderFolders();
  const th = ([k, label]) => `<th aria-sort="${state.sort.key === k ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${label} <span aria-hidden="true">${state.sort.key === k ? (state.sort.dir > 0 ? '↑' : '↓') : ''}</span></button></th>`;
  const allChecked = rows.length > 0 && rows.every((t) => state.selected.has(t.id));
  $('tpl-table').innerHTML = `
    <table class="table tpls__table">
      <thead><tr><th class="table__check"><input type="checkbox" id="tpl-check-all" aria-label="Seleccionar todo" ${allChecked ? 'checked' : ''} /></th>${COLS.map(th).join('')}</tr></thead>
      <tbody id="tpl-rows">${rows.length ? rows.map((t) => `
        <tr data-id="${esc(t.id)}">
          <td class="table__check"><input type="checkbox" data-sel="${esc(t.id)}" aria-label="Seleccionar ${esc(t.name)}" ${state.selected.has(t.id) ? 'checked' : ''} /></td>
          <td><div class="name"><a href="?id=${esc(t.id)}" class="tpls__name" data-open="${esc(t.id)}">${esc(t.name)}</a>${t.shared ? '' : '<span class="tag tag--none">Privado</span>'}${t.folder ? `<span class="muted tpls__folderchip">${esc(t.folder)}</span>` : ''}
            <div class="menu tpls__rowmenu"><button class="link-btn" type="button" aria-haspopup="true">Acciones <span class="caret"></span></button><div class="menu__panel">
              <button class="menu__item" type="button" data-act="clone" data-id="${esc(t.id)}">Clonar</button>
              <button class="menu__item" type="button" data-act="move" data-id="${esc(t.id)}">Mover</button>
              <button class="menu__item" type="button" data-act="share" data-id="${esc(t.id)}">Administrar lo que se comparte</button>
              <div class="menu__sep"></div>
              <button class="menu__item menu__item--danger" type="button" data-act="delete" data-id="${esc(t.id)}">Eliminar</button>
            </div></div></div></td>
          <td>${esc(t.ownerId || '--')}</td>
          <td title="${esc(fullDate(t.createdAt))}">${esc(relativeTimeFine(t.createdAt))}</td>
          <td title="${esc(fullDate(t.updatedAt))}">${esc(relativeTimeFine(t.updatedAt))}</td>
        </tr>`).join('') : `<tr><td colspan="5"><div class="tpls__empty">${all.length ? 'Ninguna plantilla coincide con los filtros.' : 'Todavía no hay plantillas. Crea la primera con «Nueva plantilla».'}</div></td></tr>`}</tbody>
    </table>`;
  const n = state.selected.size;
  $('tpl-bulk').innerHTML = n ? `<span>${plural(n, 'seleccionado', 'seleccionados')}</span><button class="btn btn--secondary btn--sm" type="button" data-ta="bulk-move">Mover</button><button class="btn btn--secondary btn--sm" type="button" data-ta="bulk-delete">Eliminar</button>` : '';
  const num = (p) => `<button class="pager__num${p === state.page ? ' is-active' : ''}" type="button" data-page="${p}" aria-current="${p === state.page ? 'page' : 'false'}">${p}</button>`;
  const first = Math.max(1, Math.min(state.page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i);
  $('tpl-pager').innerHTML = `<nav class="pager" aria-label="Paginación">
    <button class="pager__btn" type="button" data-page="first" ${state.page === 1 ? 'disabled' : ''}>Primero</button>
    <button class="pager__btn" type="button" data-page="prev" ${state.page === 1 ? 'disabled' : ''}>‹ Anterior</button>
    ${nums.map(num).join('')}
    <button class="pager__btn" type="button" data-page="next" ${state.page === pages ? 'disabled' : ''}>Siguiente ›</button>
    <button class="pager__btn" type="button" data-page="last" ${state.page === pages ? 'disabled' : ''}>Última</button>
    <label class="pager__size">Por página <select id="tpl-size" aria-label="Plantillas por página">${[10, 25, 50].map((s) => `<option value="${s}" ${s === state.pageSize ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
  </nav>`;
  wireMenus(page);
}

// ---------- shared modal ----------
function modal(title, body, foot, { size = '' } = {}) {
  let m = $('tpl-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal';
    m.id = 'tpl-modal';
    m.setAttribute('aria-hidden', 'true');
    root.appendChild(m);
    m.addEventListener('click', onModalClick);
    m.addEventListener('input', onModalInput);
    m.addEventListener('change', onModalInput);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeModal(); });
  }
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel${size ? ` bmodal__panel--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="tpl-modal-title"><div class="bmodal__head"><h3 id="tpl-modal-title">${esc(title)}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body" id="tpl-modal-body">${body}</div><div class="bmodal__foot" id="tpl-modal-foot">${foot}</div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  wireMenus(m);
  return m;
}
function closeModal() {
  const m = $('tpl-modal');
  if (!m) return;
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
  if (editor) { editor = null; if (params.has('id') || params.has('new')) { params.delete('id'); params.delete('new'); history.replaceState(null, '', location.pathname); } }
}
const cancelBtn = '<button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button>';
const folderOptions = (value) => `<option value="">Sin carpeta</option>${folders().map((f) => `<option value="${esc(f)}" ${f === value ? 'selected' : ''}>${esc(f)}</option>`).join('')}`;

// ---------- editor ----------
const insertMenu = (target) => `<div class="menu tpe__insert"><button class="btn btn--secondary btn--sm" type="button" aria-haspopup="true">Insertar <span class="caret"></span></button><div class="menu__panel menu__panel--picker">${TOKEN_GROUPS.map(([g, toks]) => `<div class="menu__note">Token de personalización · ${esc(g)}</div>${toks.map(([k, l]) => `<button class="menu__item" type="button" data-ins-token="${k}" data-target="${target}">${esc(l)}</button>`).join('')}`).join('')}<div class="menu__sep"></div><div class="menu__note">Fragmento</div>${SNIPPETS.map(([n], i) => `<button class="menu__item" type="button" data-ins-snippet="${i}" data-target="${target}">${esc(n)}</button>`).join('')}</div></div>`;
function openEditor(id, preset = {}) {
  const t = id ? templateById(id) : null;
  if (id && !t) { toast('Esa plantilla ya no existe.'); return; }
  editor = { id: t ? t.id : null, name: t ? t.name : preset.name || '', subject: t ? t.subject : preset.subject || '', body: t ? t.body : preset.body || '', folder: t ? t.folder : preset.folder || '', shared: t ? t.shared : true, ownerId: t ? t.ownerId : ME, preview: true, contactId: '' };
  if (t) { params.set('id', t.id); history.replaceState(null, '', `?${params}`); }
  const contacts = allContacts().slice(0, 300);
  modal(t ? 'Editar plantilla' : 'Nueva plantilla', `
    <div class="tpe">
      <div class="tpe__bar">
        <select id="tpe-shared" aria-label="Compartir"><option value="1" ${editor.shared ? 'selected' : ''}>Compartido con todos</option><option value="0" ${editor.shared ? '' : 'selected'}>Privado</option></select>
        <select id="tpe-folder" aria-label="Carpeta"><option value="">Seleccionar una carpeta</option>${folders().map((f) => `<option value="${esc(f)}" ${f === editor.folder ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
        <span class="tpe__owner">Propietario: <strong>${esc(editor.ownerId)}</strong></span>
      </div>
      <div class="tpe__panes${editor.preview ? '' : ' is-solo'}" id="tpe-panes">
        <section class="tpe__pane" aria-label="Redactar plantilla">
          <h4>Redactar plantilla de correo electrónico <button class="link-btn tpe__show" type="button" data-te="toggle-preview" ${editor.preview ? 'hidden' : ''}>Mostrar vista previa</button></h4>
          <label class="tpe__field"><span>Nombre de la plantilla</span><input id="tpe-name" value="${esc(editor.name)}" placeholder="P. ej. Seguimiento de propuesta" /></label>
          <div class="tpe__field"><span>Asunto</span><div class="tpe__subject"><input id="tpe-subject" value="${esc(editor.subject)}" placeholder="Asunto del correo" />${insertMenu('subject')}</div></div>
          <div class="tpe__toolbar" role="toolbar" aria-label="Formato">
            <button type="button" data-fmt="bold" title="Negrita"><b>N</b></button>
            <button type="button" data-fmt="italic" title="Cursiva"><i>C</i></button>
            <button type="button" data-fmt="underline" title="Subrayado"><u>S</u></button>
            <button type="button" data-fmt="strikeThrough" title="Tachado"><s>T</s></button>
            <div class="menu"><button type="button" aria-haspopup="true">Más <span class="caret"></span></button><div class="menu__panel">
              <button class="menu__item" type="button" data-fmt="insertUnorderedList">Lista con viñetas</button>
              <button class="menu__item" type="button" data-fmt="insertOrderedList">Lista numerada</button>
              <button class="menu__item" type="button" data-fmt="formatBlock" data-arg="blockquote">Cita</button>
              <button class="menu__item" type="button" data-fmt="formatBlock" data-arg="h1">Encabezado 1</button>
              <button class="menu__item" type="button" data-fmt="formatBlock" data-arg="h2">Encabezado 2</button>
              <button class="menu__item" type="button" data-fmt="formatBlock" data-arg="p">Párrafo</button>
              <button class="menu__item" type="button" data-fmt="removeFormat">Quitar formato</button>
            </div></div>
            <button type="button" data-te="link" title="Insertar enlace">🔗</button>
            <button type="button" data-te="image" title="Insertar imagen">🖼</button>
            ${insertMenu('body')}
            <button class="tpe__ai" type="button" data-te="ai">✦ Generar con IA</button>
          </div>
          <div class="tpe__body" id="tpe-body" contenteditable="true" data-placeholder="Escribe el cuerpo del correo…">${editor.body}</div>
          <p class="tpe__sig muted">Se incluirá la firma predeterminada. <button class="link-btn" type="button" data-te="edit-sig">Editar</button></p>
        </section>
        <aside class="tpe__pane tpe__preview" id="tpe-preview" ${editor.preview ? '' : 'hidden'} aria-label="Vista previa">
          <h4>Vista previa del correo electrónico de ejemplo <button class="link-btn" type="button" data-te="toggle-preview">Ocultar vista previa</button></h4>
          <div class="tpe__prevctl">
            <select id="tpe-contact" aria-label="Seleccionar contacto"><option value="">Seleccionar contacto</option>${contacts.map((c) => `<option value="${c.id}">${esc(c.name)}${c.company ? ` · ${esc(c.company)}` : ''}</option>`).join('')}</select>
            <button class="btn btn--secondary btn--sm" type="button" data-te="generate">Generar</button>
          </div>
          <div id="tpe-mail"></div>
        </aside>
      </div>
    </div>`, `<button class="btn btn--primary" type="button" id="tpe-save" data-te="save" disabled>Guardar plantilla</button>${cancelBtn}`, { size: 'xl' });
  renderPreview();
  syncSave();
  const name = $('tpe-name');
  if (name) name.focus();
}
function syncSave() {
  const b = $('tpe-save');
  if (b && editor) b.disabled = !(editor.name.trim() && bodyText(editor.body));
}
function renderPreview() {
  const box = $('tpe-mail');
  if (!box || !editor) return;
  const c = editor.contactId ? allContacts().find((x) => String(x.id) === String(editor.contactId)) : null;
  if (!c) { box.innerHTML = '<p class="tpe__hint">Selecciona un contacto y pulsa «Generar» para ver el correo con sus datos.</p>'; return; }
  const s = sender();
  box.innerHTML = `<div class="tpe__mail"><div class="tpe__mailhead"><div><span class="muted">Para:</span> ${esc(c.name)}${c.email ? ` &lt;${esc(c.email)}&gt;` : ''}</div><div><span class="muted">De:</span> ${esc(s.name)} &lt;${esc(s.email)}&gt;</div><div><span class="muted">Asunto:</span> <strong>${esc(resolveTokens(editor.subject, c, s) || '(sin asunto)')}</strong></div></div><div class="tpe__mailbody">${resolveTokens(editor.body, c, s)}${signatureHtmlOf()}</div></div>`;
}
const exec = (cmd, arg) => { if (typeof document.execCommand !== 'function') return false; try { return document.execCommand(cmd, false, arg); } catch { return false; } };
function insertIntoBody(html) {
  const body = $('tpe-body');
  if (!body) return;
  body.focus();
  let done = false;
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && body.contains(sel.anchorNode)) {
      const r = sel.getRangeAt(0);
      r.deleteContents();
      const frag = r.createContextualFragment(html);
      const last = frag.lastChild;
      r.insertNode(frag);
      if (last) { r.setStartAfter(last); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
      done = true;
    }
  } catch { done = false; }
  if (!done) body.insertAdjacentHTML('beforeend', html);
  editor.body = body.innerHTML;
  syncSave();
}
function insertIntoSubject(text) {
  const inp = $('tpe-subject');
  if (!inp) return;
  const s = inp.selectionStart ?? inp.value.length;
  const e = inp.selectionEnd ?? s;
  inp.value = `${inp.value.slice(0, s)}${text}${inp.value.slice(e)}`;
  editor.subject = inp.value;
  inp.focus();
  try { inp.setSelectionRange(s + text.length, s + text.length); } catch { /* jsdom */ }
}
function saveEditor() {
  if (!editor) return;
  const patch = { name: editor.name, subject: editor.subject, body: editor.body, folder: editor.folder, shared: editor.shared };
  const out = editor.id ? updateTemplate(editor.id, patch) : createTemplate({ ...patch, ownerId: editor.ownerId });
  if (!out) { toast('Escribe un nombre y el cuerpo de la plantilla.'); return; }
  const created = !editor.id;
  closeModal();
  renderTable();
  toast(created ? `Plantilla «${out.name}» creada` : `Plantilla «${out.name}» guardada`);
}

// ---------- small dialogs ----------
function openFolderDialog() {
  modal('Nueva carpeta', '<label class="field"><span>Nombre de la carpeta</span><input id="tpf-name" placeholder="P. ej. Prospección" /></label>', `<button class="btn btn--primary" type="button" data-te="create-folder">Crear</button>${cancelBtn}`);
  $('tpf-name').focus();
}
function openMoveDialog(ids) {
  const one = ids.length === 1 ? templateById(ids[0]) : null;
  modal('Mover a carpeta', `<p class="muted">${one ? `Mover «${esc(one.name)}» a:` : `Mover ${plural(ids.length, 'plantilla', 'plantillas')} a:`}</p><label class="field"><span>Carpeta</span><select id="tpm-folder">${folderOptions(one ? one.folder : '')}</select></label>`, `<button class="btn btn--primary" type="button" data-te="confirm-move" data-ids="${esc(ids.join(','))}">Mover</button>${cancelBtn}`);
}
function openShareDialog(id) {
  const t = templateById(id);
  if (!t) return;
  modal('Administrar lo que se comparte', `<p class="muted">«${esc(t.name)}»</p><label class="tpls__radio"><input type="radio" name="tps" value="1" ${t.shared ? 'checked' : ''} /> <span><strong>Compartido con todos</strong><br><small class="muted">Todo el equipo puede ver y usar esta plantilla.</small></span></label><label class="tpls__radio"><input type="radio" name="tps" value="0" ${t.shared ? '' : 'checked'} /> <span><strong>Privado</strong><br><small class="muted">Solo tú puedes verla y usarla.</small></span></label>`, `<button class="btn btn--primary" type="button" data-te="confirm-share" data-id="${esc(id)}">Guardar</button>${cancelBtn}`);
}
function openDeleteDialog(ids) {
  const one = ids.length === 1 ? templateById(ids[0]) : null;
  modal(ids.length === 1 ? 'Eliminar plantilla' : 'Eliminar plantillas', `<p>${one ? `¿Seguro que quieres eliminar «${esc(one.name)}»?` : `¿Seguro que quieres eliminar ${plural(ids.length, 'plantilla', 'plantillas')}?`} Esta acción no se puede deshacer.</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-te="confirm-delete" data-ids="${esc(ids.join(','))}">Eliminar</button>${cancelBtn}`);
}
function openAnalyze() {
  const s = stats();
  const table = (title, obj) => `<h4>${title}</h4><table class="table tpls__stattable"><thead><tr><th>${title === 'Por propietario' ? 'Propietario' : 'Carpeta'}</th><th>Plantillas</th></tr></thead><tbody>${Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Sin datos</td></tr>'}</tbody></table>`;
  modal('Analizar plantillas', `<div class="tpls__stats"><div class="tpls__stat"><strong>${s.total}</strong><span class="muted">Plantillas</span></div><div class="tpls__stat"><strong>${s.shared}</strong><span class="muted">Compartidas con todos</span></div><div class="tpls__stat"><strong>${s.privateCount}</strong><span class="muted">Privadas</span></div></div>${table('Por propietario', s.byOwner)}${table('Por carpeta', s.byFolder)}<p class="muted">Las tasas de apertura y respuesta se calcularán a partir de los correos enviados con cada plantilla.</p>`, '<button class="btn btn--secondary" type="button" data-bm="close">Cerrar</button>', { size: 'wide' });
}
function openLibrary() {
  modal('Biblioteca de plantillas', `<div class="tpls__lib">${LIBRARY.map((l) => `<div class="tpls__libitem"><div><strong>${esc(l.name)}</strong><p>${esc(bodyText(l.body).slice(0, 120))}…</p></div><button class="btn btn--secondary btn--sm" type="button" data-te="use-lib" data-id="${l.id}">Usar</button></div>`).join('')}</div>`, cancelBtn, { size: 'wide' });
}
function exportCsv() {
  const csv = templatesCsv(visible());
  if (typeof URL.createObjectURL !== 'function') { toast('Exportación lista (CSV).'); return csv; }
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `plantillas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 1000);
  toast(`Exportadas ${plural(visible().length, 'plantilla', 'plantillas')} a CSV.`);
  return csv;
}

// ---------- events ----------
function onModalClick(e) {
  const close = e.target.closest('[data-bm="close"]');
  if (close) { e.preventDefault(); closeModal(); return; }
  const tok = e.target.closest('[data-ins-token]');
  if (tok) { const text = `{{${tok.dataset.insToken}}}`; if (tok.dataset.target === 'subject') insertIntoSubject(text); else insertIntoBody(text); closeMenus(); return; }
  const snip = e.target.closest('[data-ins-snippet]');
  if (snip) { const [, text] = SNIPPETS[Number(snip.dataset.insSnippet)]; if (snip.dataset.target === 'subject') insertIntoSubject(text); else insertIntoBody(`<p>${esc(text)}</p>`); closeMenus(); return; }
  const fmt = e.target.closest('[data-fmt]');
  if (fmt) {
    e.preventDefault();
    const body = $('tpe-body');
    if (body) body.focus();
    exec(fmt.dataset.fmt, fmt.dataset.arg ? `<${fmt.dataset.arg}>` : undefined);
    if (body && editor) { editor.body = body.innerHTML; syncSave(); }
    closeMenus();
    return;
  }
  const te = e.target.closest('[data-te]');
  if (!te) return;
  const a = te.dataset.te;
  if (a === 'save') saveEditor();
  else if (a === 'toggle-preview') {
    editor.preview = !editor.preview;
    $('tpe-preview').hidden = !editor.preview;
    $('tpe-panes').classList.toggle('is-solo', !editor.preview);
    const show = page.ownerDocument.querySelector('.tpe__show');
    if (show) show.hidden = editor.preview;
  } else if (a === 'generate') { editor.contactId = $('tpe-contact').value; renderPreview(); if (!editor.contactId) toast('Selecciona un contacto para generar la vista previa.'); }
  else if (a === 'link') { const url = window.prompt('URL del enlace', 'https://'); if (url) insertIntoBody(`<a href="${esc(url)}">${esc(url)}</a>`); }
  else if (a === 'image') { const url = window.prompt('URL de la imagen', 'https://'); if (url) insertIntoBody(`<img src="${esc(url)}" alt="" style="max-width:100%">`); }
  else if (a === 'ai') { insertIntoBody('<p>Hola {{contacto.nombre}},</p><p>Te escribo desde Megaglass porque creemos que {{contacto.empresa}} puede beneficiarse de nuestras soluciones de vidrio templado y laminado: entregas en plazo, instalación propia y 10 años de garantía.</p><p>¿Tienes 15 minutos esta semana para una llamada?</p><p>Un saludo,<br>{{propietario.nombre}}</p>'); toast('Borrador generado con IA (simulado). Revísalo antes de guardar.'); }
  else if (a === 'edit-sig') { editSignature(); renderPreview(); }
  else if (a === 'create-folder') { const f = createFolder($('tpf-name').value); if (!f) { toast('Escribe el nombre de la carpeta.'); return; } closeModal(); renderTable(); toast(`Carpeta «${f.name}» creada`); }
  else if (a === 'confirm-move') { const ids = te.dataset.ids.split(',').filter(Boolean); const n = moveTemplates(ids, $('tpm-folder').value); closeModal(); state.selected.clear(); renderTable(); toast(`${plural(n, 'plantilla movida', 'plantillas movidas')}`); }
  else if (a === 'confirm-share') { const v = page.ownerDocument.querySelector('input[name="tps"]:checked'); setShared(te.dataset.id, v ? v.value === '1' : true); closeModal(); renderTable(); toast('Uso compartido actualizado'); }
  else if (a === 'confirm-delete') { const ids = te.dataset.ids.split(',').filter(Boolean); const n = deleteTemplates(ids); ids.forEach((id) => state.selected.delete(id)); closeModal(); renderTable(); toast(`${plural(n, 'plantilla eliminada', 'plantillas eliminadas')}`); }
  else if (a === 'use-lib') { const l = LIBRARY.find((x) => x.id === te.dataset.id); if (l) openEditor(null, { name: l.name, subject: l.subject, body: l.body }); }
}
function onModalInput(e) {
  if (!editor) return;
  const t = e.target;
  if (t.id === 'tpe-name') { editor.name = t.value; syncSave(); } else if (t.id === 'tpe-subject') editor.subject = t.value;
  else if (t.id === 'tpe-body') { editor.body = t.innerHTML; syncSave(); } else if (t.id === 'tpe-folder') editor.folder = t.value;
  else if (t.id === 'tpe-shared') editor.shared = t.value === '1';
  else if (t.id === 'tpe-contact' && e.type === 'change') editor.contactId = t.value;
}
page.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) { e.preventDefault(); openEditor(open.dataset.open); return; }
  const sort = e.target.closest('[data-sort]');
  if (sort) { const k = sort.dataset.sort; if (state.sort.key === k) state.sort.dir *= -1; else state.sort = { key: k, dir: k === 'name' || k === 'ownerId' ? 1 : -1 }; renderTable(); return; }
  const pg = e.target.closest('[data-page]');
  if (pg && !pg.disabled) {
    const pages = Math.max(1, Math.ceil(visible().length / state.pageSize));
    const v = pg.dataset.page;
    state.page = v === 'first' ? 1 : v === 'prev' ? Math.max(1, state.page - 1) : v === 'next' ? Math.min(pages, state.page + 1) : v === 'last' ? pages : Number(v);
    renderTable();
    return;
  }
  const folder = e.target.closest('[data-folder]');
  if (folder) { state.folder = folder.dataset.folder === '*' ? null : folder.dataset.folder; state.page = 1; state.selected.clear(); renderTable(); return; }
  const act = e.target.closest('[data-act]');
  if (act) {
    const id = act.dataset.id;
    closeMenus();
    if (act.dataset.act === 'clone') { const c = cloneTemplate(id); if (c) { renderTable(); toast(`Plantilla clonada como «${c.name}»`); } } else if (act.dataset.act === 'move') openMoveDialog([id]);
    else if (act.dataset.act === 'share') openShareDialog(id);
    else if (act.dataset.act === 'delete') openDeleteDialog([id]);
    return;
  }
  const ta = e.target.closest('[data-ta]');
  if (!ta) return;
  closeMenus();
  const a = ta.dataset.ta;
  if (a === 'new-scratch') { params.set('new', '1'); history.replaceState(null, '', `?${params}`); openEditor(null); } else if (a === 'new-library') openLibrary();
  else if (a === 'new-folder') openFolderDialog();
  else if (a === 'analyze') openAnalyze();
  else if (a === 'export') exportCsv();
  else if (a === 'bulk-move') openMoveDialog([...state.selected]);
  else if (a === 'bulk-delete') openDeleteDialog([...state.selected]);
});
page.addEventListener('input', (e) => { if (e.target.id === 'tpl-q') { state.q = e.target.value; state.page = 1; renderTable(); } });
page.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'tpl-owner') { state.owner = t.value; state.page = 1; renderTable(); } else if (t.id === 'tpl-size') { state.pageSize = Number(t.value); state.page = 1; renderTable(); } else if (t.id === 'tpl-check-all') {
    const ids = [...page.querySelectorAll('#tpl-rows tr[data-id]')].map((r) => r.dataset.id);
    ids.forEach((id) => (t.checked ? state.selected.add(id) : state.selected.delete(id)));
    renderTable();
  } else if (t.dataset.sel) { if (t.checked) state.selected.add(t.dataset.sel); else state.selected.delete(t.dataset.sel); renderTable(); }
});

renderPage();
if (params.get('id')) openEditor(params.get('id'));
else if (params.get('new')) openEditor(null);

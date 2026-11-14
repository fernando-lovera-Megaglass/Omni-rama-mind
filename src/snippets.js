// Fragmentos: the original's snippets list (folders, search, owner filter, sortable table with multi-select,
// row actions, pagination) and the "Fragmento nuevo" editor — internal name, folder, rich text with
// "Personalizar" tokens, and the "#atajo" shortcut (one word, unique) that inserts it in any text editor.
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { relativeTimeFine, formatDate } from './data.js';
import { ready, snippets, snippetById, folders, owners, createSnippet, updateSnippet, cloneSnippet, deleteSnippets, moveSnippets, createFolder, validateShortcut, bodyText, ME } from './snippets-data.js';
import { openTokenPicker, chipHtml, markersToChips, chipsToMarkers, insertAtCaret } from './tokens.js';

boot({ root: '../', active: 'crm', sub: 'Fragmentos', title: 'Fragmentos' });
await ready;

const root = document.getElementById('snp-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = { q: '', owner: '', folder: null, sort: { key: 'updatedAt', dir: -1 }, page: 1, pageSize: 25, selected: new Set() };
let editor = null;
const COLS = [['name', 'Nombre'], ['ownerId', 'Creado por'], ['createdAt', 'Fecha de creación'], ['updatedAt', 'Fecha de modificación']];
const fullDate = (iso) => { const d = new Date(iso); return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

root.innerHTML = '<div id="snp-page"></div>';
const page = $('snp-page');

// ---------- list ----------
function visible() {
  const q = state.q.trim().toLowerCase();
  const list = snippets().filter((s) => (state.folder === null || (s.folder || '') === state.folder) && (!state.owner || s.ownerId === state.owner) && (!q || `${s.name} #${s.shortcut} ${bodyText(s.body)}`.toLowerCase().includes(q)));
  const k = state.sort.key;
  const val = (s) => (k === 'createdAt' || k === 'updatedAt' ? new Date(s[k] || 0).getTime() : String(s[k] || ''));
  return list.sort((a, b) => { const av = val(a); const bv = val(b); return (typeof av === 'number' ? av - bv : av.localeCompare(bv, 'es')) * state.sort.dir; });
}
function renderPage() {
  page.innerHTML = `
    <div class="tpls snps">
      <header class="tpls__head">
        <h1>Fragmentos <span class="tpls__count" id="snp-count"></span></h1>
        <div class="tpls__actions">
          <button class="btn btn--secondary" type="button" data-ta="new-folder">Nueva carpeta</button>
          <button class="btn btn--primary btn--green" type="button" data-ta="new">Crear fragmento</button>
        </div>
      </header>
      <div class="tpls__body">
        <aside class="tpls__folders" id="snp-folders" aria-label="Carpetas"></aside>
        <section class="tpls__main">
          <div class="tpls__filters">
            <div class="search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="snp-q" placeholder="Buscar" aria-label="Buscar fragmentos" /></div>
            <select id="snp-owner" aria-label="Propietario"></select>
            <div class="tpls__bulk" id="snp-bulk"></div>
          </div>
          <div class="table-wrap" id="snp-table"></div>
          <div id="snp-pager"></div>
        </section>
      </div>
    </div>`;
  wireMenus(page);
  renderOwners();
  renderTable();
}
function renderOwners() {
  const sel = $('snp-owner');
  sel.innerHTML = `<option value="">Propietario: Cualquiera</option><option value="${esc(ME)}">Propietario: Yo</option>${owners().filter((o) => o !== ME).map((o) => `<option value="${esc(o)}">Propietario: ${esc(o)}</option>`).join('')}`;
  sel.value = state.owner;
}
function renderFolders() {
  const all = snippets();
  const count = (f) => all.filter((s) => (s.folder || '') === f).length;
  const item = (label, value, n) => `<button class="tpls__folder${state.folder === value ? ' is-active' : ''}" type="button" data-folder="${value === null ? '*' : esc(value)}"><span>${esc(label)}</span><span class="muted">${n}</span></button>`;
  $('snp-folders').innerHTML = `<h2>Carpetas</h2>${item('Todos los fragmentos', null, all.length)}${folders().map((f) => item(f, f, count(f))).join('')}${item('Sin carpeta', '', count(''))}`;
}
function renderTable() {
  const all = snippets();
  const list = visible();
  const pages = Math.max(1, Math.ceil(list.length / state.pageSize));
  if (state.page > pages) state.page = pages;
  const rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  $('snp-count').textContent = plural(all.length, 'creado', 'creados');
  renderFolders();
  const th = ([k, label]) => `<th aria-sort="${state.sort.key === k ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${label} <span aria-hidden="true">${state.sort.key === k ? (state.sort.dir > 0 ? '↑' : '↓') : ''}</span></button></th>`;
  const allChecked = rows.length > 0 && rows.every((s) => state.selected.has(s.id));
  $('snp-table').innerHTML = `
    <table class="table tpls__table">
      <thead><tr><th class="table__check"><input type="checkbox" id="snp-check-all" aria-label="Seleccionar todo" ${allChecked ? 'checked' : ''} /></th>${COLS.map(th).join('')}</tr></thead>
      <tbody id="snp-rows">${rows.length ? rows.map((s) => `
        <tr data-id="${esc(s.id)}">
          <td class="table__check"><input type="checkbox" data-sel="${esc(s.id)}" aria-label="Seleccionar ${esc(s.name)}" ${state.selected.has(s.id) ? 'checked' : ''} /></td>
          <td><div class="name"><a href="?id=${esc(s.id)}" class="tpls__name" data-open="${esc(s.id)}">${esc(s.name)}</a><span class="snps__shortcut">#${esc(s.shortcut)}</span>${s.folder ? `<span class="muted tpls__folderchip">${esc(s.folder)}</span>` : ''}
            <div class="menu tpls__rowmenu"><button class="link-btn" type="button" aria-haspopup="true">Acciones <span class="caret"></span></button><div class="menu__panel">
              <button class="menu__item" type="button" data-act="clone" data-id="${esc(s.id)}">Clonar</button>
              <button class="menu__item" type="button" data-act="move" data-id="${esc(s.id)}">Mover</button>
              <div class="menu__sep"></div>
              <button class="menu__item menu__item--danger" type="button" data-act="delete" data-id="${esc(s.id)}">Eliminar</button>
            </div></div></div></td>
          <td>${esc(s.ownerId || '--')}</td>
          <td title="${esc(fullDate(s.createdAt))}">${esc(relativeTimeFine(s.createdAt))}</td>
          <td title="${esc(fullDate(s.updatedAt))}">${esc(relativeTimeFine(s.updatedAt))}</td>
        </tr>`).join('') : `<tr><td colspan="5"><div class="tpls__empty">${all.length ? 'Ningún fragmento coincide con los filtros.' : 'Todavía no hay fragmentos. Crea el primero con «Crear fragmento».'}</div></td></tr>`}</tbody>
    </table>`;
  const n = state.selected.size;
  $('snp-bulk').innerHTML = n ? `<span>${plural(n, 'seleccionado', 'seleccionados')}</span><button class="btn btn--secondary btn--sm" type="button" data-ta="bulk-move">Mover</button><button class="btn btn--secondary btn--sm" type="button" data-ta="bulk-delete">Eliminar</button>` : '';
  const num = (p) => `<button class="pager__num${p === state.page ? ' is-active' : ''}" type="button" data-page="${p}" aria-current="${p === state.page ? 'page' : 'false'}">${p}</button>`;
  const first = Math.max(1, Math.min(state.page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i);
  $('snp-pager').innerHTML = `<nav class="pager" aria-label="Paginación">
    <button class="pager__btn" type="button" data-page="prev" ${state.page === 1 ? 'disabled' : ''}>‹ Anterior</button>
    ${nums.map(num).join('')}
    <button class="pager__btn" type="button" data-page="next" ${state.page === pages ? 'disabled' : ''}>Siguiente ›</button>
    <label class="pager__size">Por página <select id="snp-size" aria-label="Fragmentos por página">${[10, 25, 50].map((s) => `<option value="${s}" ${s === state.pageSize ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
  </nav>`;
  wireMenus(page);
}

// ---------- shared modal ----------
function modal(title, body, foot, { size = '' } = {}) {
  let m = $('snp-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal';
    m.id = 'snp-modal';
    m.setAttribute('aria-hidden', 'true');
    root.appendChild(m);
    m.addEventListener('click', onModalClick);
    m.addEventListener('input', onModalInput);
    m.addEventListener('change', onModalInput);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeModal(); });
  }
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel${size ? ` bmodal__panel--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="snp-modal-title"><div class="bmodal__head"><h3 id="snp-modal-title">${esc(title)}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body" id="snp-modal-body">${body}</div><div class="bmodal__foot" id="snp-modal-foot">${foot}</div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  wireMenus(m);
  return m;
}
function closeModal() {
  const m = $('snp-modal');
  if (!m) return;
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
  if (editor) { editor = null; if (params.has('id') || params.has('new')) { params.delete('id'); params.delete('new'); history.replaceState(null, '', location.pathname); } }
}
const cancelBtn = '<button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button>';
const folderOptions = (value) => `<option value="">Sin carpeta</option>${folders().map((f) => `<option value="${esc(f)}" ${f === value ? 'selected' : ''}>${esc(f)}</option>`).join('')}`;

// ---------- editor ----------
function openEditor(id, preset = {}) {
  const s = id ? snippetById(id) : null;
  if (id && !s) { toast('Ese fragmento ya no existe.'); return; }
  editor = { id: s ? s.id : null, name: s ? s.name : preset.name || '', body: s ? s.body : preset.body || '', shortcut: s ? s.shortcut : preset.shortcut || '', folder: s ? s.folder : preset.folder || '', useFolder: Boolean(s ? s.folder : preset.folder), error: null };
  if (s) { params.set('id', s.id); history.replaceState(null, '', `?${params}`); }
  modal(s ? 'Editar fragmento' : 'Fragmento nuevo', `
    <div class="snp">
      <p class="snp__intro">Los fragmentos te permiten crear bloques de texto reutilizables a los que puedes acceder rápidamente a través de los atajos de teclado. Úsalos en correos, notas y plantillas sin volver a escribir lo mismo. <a href="#" data-se="info">Más información</a></p>
      <label class="tpe__field"><span>Nombre interno <abbr class="snp__req" title="Obligatorio">*</abbr></span><input id="snp-name" value="${esc(editor.name)}" placeholder="Dale un nombre a tu fragmento" /></label>
      <label class="snp__check"><input type="checkbox" id="snp-folder-check" ${editor.useFolder ? 'checked' : ''} /> Seleccionar una carpeta</label>
      <div class="tpe__field" id="snp-folder-wrap" ${editor.useFolder ? '' : 'hidden'}><span>Carpeta</span><select id="snp-folder">${folderOptions(editor.folder)}</select></div>
      <div class="tpe__field">
        <span>Texto del fragmento <abbr class="snp__req" title="Obligatorio">*</abbr></span>
        <div class="tpe__toolbar" role="toolbar" aria-label="Formato">
          <button type="button" data-fmt="bold" title="Negrita"><b>N</b></button>
          <button type="button" data-fmt="italic" title="Cursiva"><i>C</i></button>
          <button type="button" data-fmt="underline" title="Subrayado"><u>S</u></button>
          <button type="button" data-fmt="strikeThrough" title="Tachado"><s>T</s></button>
          <div class="menu"><button type="button" aria-haspopup="true">Más <span class="caret"></span></button><div class="menu__panel">
            <button class="menu__item" type="button" data-fmt="insertUnorderedList">Lista con viñetas</button>
            <button class="menu__item" type="button" data-fmt="insertOrderedList">Lista numerada</button>
            <button class="menu__item" type="button" data-fmt="formatBlock" data-arg="blockquote">Cita</button>
            <button class="menu__item" type="button" data-fmt="formatBlock" data-arg="p">Párrafo</button>
            <button class="menu__item" type="button" data-fmt="removeFormat">Quitar formato</button>
          </div></div>
          <button type="button" data-se="link" title="Insertar enlace">🔗</button>
          <button class="snp__personalize" type="button" data-se="personalize">Personalizar <span class="caret"></span></button>
        </div>
        <div class="tpe__body snp__body" id="snp-body" contenteditable="true" data-placeholder="Agrega el contenido de tu fragmento">${markersToChips(editor.body)}</div>
      </div>
      <div class="tpe__field">
        <span>Atajo <abbr class="snp__req" title="Obligatorio">*</abbr></span>
        <div class="snp__shortcut"><span class="snp__hash" aria-hidden="true">#</span><input id="snp-shortcut" value="${esc(editor.shortcut)}" placeholder="Escribe una palabra para usarla como atajo" autocomplete="off" spellcheck="false" /></div>
        <small class="muted">Para usar un fragmento, escribe el símbolo de numeral (#) seguido del atajo que introdujiste arriba. El fragmento aparecerá en el editor de texto.</small>
        <div class="snp__error" id="snp-error" role="alert" hidden></div>
      </div>
    </div>`, `<button class="btn btn--primary" type="button" id="snp-save" data-se="save" disabled>Guardar fragmento</button>${cancelBtn}`, { size: 'wide' });
  syncSave();
  const name = $('snp-name');
  if (name) name.focus();
}
function syncSave() {
  if (!editor) return;
  const err = $('snp-error');
  const sc = editor.shortcut.trim();
  editor.error = sc ? validateShortcut(sc, editor.id) : null;
  if (err) { err.textContent = editor.error || ''; err.hidden = !editor.error; }
  const b = $('snp-save');
  if (b) b.disabled = !(editor.name.trim() && bodyText(editor.body) && sc && !editor.error);
}
const exec = (cmd, arg) => { if (typeof document.execCommand !== 'function') return false; try { return document.execCommand(cmd, false, arg); } catch { return false; } };
function insertIntoBody(html) {
  const body = $('snp-body');
  if (!body) return;
  insertAtCaret(body, html);
  editor.body = body.innerHTML;
  syncSave();
}
function saveEditor() {
  if (!editor) return;
  const patch = { name: editor.name, body: chipsToMarkers(editor.body), shortcut: editor.shortcut.trim(), folder: editor.useFolder ? editor.folder : '' };
  const out = editor.id ? updateSnippet(editor.id, patch) : createSnippet(patch);
  if (!out) { syncSave(); toast(editor.error || 'Completa el nombre, el texto y el atajo.'); return; }
  const created = !editor.id;
  closeModal();
  renderTable();
  toast(created ? `Fragmento «${out.name}» creado. Escribe #${out.shortcut} para usarlo.` : `Fragmento «${out.name}» guardado`);
}

// ---------- small dialogs ----------
function openFolderDialog() {
  modal('Nueva carpeta', '<label class="field"><span>Nombre de la carpeta</span><input id="snf-name" placeholder="P. ej. Prospección" /></label>', `<button class="btn btn--primary" type="button" data-se="create-folder">Crear</button>${cancelBtn}`);
  $('snf-name').focus();
}
function openMoveDialog(ids) {
  const one = ids.length === 1 ? snippetById(ids[0]) : null;
  modal('Mover a carpeta', `<p class="muted">${one ? `Mover «${esc(one.name)}» a:` : `Mover ${plural(ids.length, 'fragmento', 'fragmentos')} a:`}</p><label class="field"><span>Carpeta</span><select id="snm-folder">${folderOptions(one ? one.folder : '')}</select></label>`, `<button class="btn btn--primary" type="button" data-se="confirm-move" data-ids="${esc(ids.join(','))}">Mover</button>${cancelBtn}`);
}
function openDeleteDialog(ids) {
  const one = ids.length === 1 ? snippetById(ids[0]) : null;
  modal(ids.length === 1 ? 'Eliminar fragmento' : 'Eliminar fragmentos', `<p>${one ? `¿Seguro que quieres eliminar «${esc(one.name)}» (#${esc(one.shortcut)})?` : `¿Seguro que quieres eliminar ${plural(ids.length, 'fragmento', 'fragmentos')}?`} Esta acción no se puede deshacer.</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-se="confirm-delete" data-ids="${esc(ids.join(','))}">Eliminar</button>${cancelBtn}`);
}

// ---------- events ----------
function onModalClick(e) {
  const close = e.target.closest('[data-bm="close"]');
  if (close) { e.preventDefault(); closeModal(); return; }
  const fmt = e.target.closest('[data-fmt]');
  if (fmt) {
    e.preventDefault();
    const body = $('snp-body');
    if (body) body.focus();
    exec(fmt.dataset.fmt, fmt.dataset.arg ? `<${fmt.dataset.arg}>` : undefined);
    if (body && editor) { editor.body = body.innerHTML; syncSave(); }
    closeMenus();
    return;
  }
  const se = e.target.closest('[data-se]');
  if (!se) return;
  const a = se.dataset.se;
  if (a === 'save') saveEditor();
  else if (a === 'info') { e.preventDefault(); toast('Escribe # y el atajo en el compositor de correo, en una nota o en una plantilla para insertar el fragmento.'); } else if (a === 'personalize') openTokenPicker({ anchor: se, onPick: ({ token, defaultValue }) => insertIntoBody(`${chipHtml(token, defaultValue)} `) });
  else if (a === 'link') { const url = window.prompt('URL del enlace', 'https://'); if (url) insertIntoBody(`<a href="${esc(url)}">${esc(url)}</a>`); } else if (a === 'create-folder') { const f = createFolder($('snf-name').value); if (!f) { toast('Escribe el nombre de la carpeta.'); return; } closeModal(); renderTable(); toast(`Carpeta «${f.name}» creada`); } else if (a === 'confirm-move') { const ids = se.dataset.ids.split(',').filter(Boolean); const n = moveSnippets(ids, $('snm-folder').value); closeModal(); state.selected.clear(); renderTable(); toast(`${plural(n, 'fragmento movido', 'fragmentos movidos')}`); } else if (a === 'confirm-delete') { const ids = se.dataset.ids.split(',').filter(Boolean); const n = deleteSnippets(ids); ids.forEach((id) => state.selected.delete(id)); closeModal(); renderTable(); toast(`${plural(n, 'fragmento eliminado', 'fragmentos eliminados')}`); }
}
function onModalInput(e) {
  if (!editor) return;
  const t = e.target;
  if (t.id === 'snp-name') { editor.name = t.value; syncSave(); } else if (t.id === 'snp-body') { editor.body = t.innerHTML; syncSave(); } else if (t.id === 'snp-shortcut') { editor.shortcut = t.value; syncSave(); } else if (t.id === 'snp-folder') editor.folder = t.value;
  else if (t.id === 'snp-folder-check' && e.type === 'change') { editor.useFolder = t.checked; $('snp-folder-wrap').hidden = !t.checked; if (t.checked) editor.folder = $('snp-folder').value; }
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
    state.page = v === 'prev' ? Math.max(1, state.page - 1) : v === 'next' ? Math.min(pages, state.page + 1) : Number(v);
    renderTable();
    return;
  }
  const folder = e.target.closest('[data-folder]');
  if (folder) { state.folder = folder.dataset.folder === '*' ? null : folder.dataset.folder; state.page = 1; state.selected.clear(); renderTable(); return; }
  const act = e.target.closest('[data-act]');
  if (act) {
    const id = act.dataset.id;
    closeMenus();
    if (act.dataset.act === 'clone') { const c = cloneSnippet(id); if (c) { renderTable(); toast(`Fragmento clonado como «${c.name}» (#${c.shortcut})`); } } else if (act.dataset.act === 'move') openMoveDialog([id]);
    else if (act.dataset.act === 'delete') openDeleteDialog([id]);
    return;
  }
  const ta = e.target.closest('[data-ta]');
  if (!ta) return;
  closeMenus();
  const a = ta.dataset.ta;
  if (a === 'new') { params.set('new', '1'); history.replaceState(null, '', `?${params}`); openEditor(null); } else if (a === 'new-folder') openFolderDialog();
  else if (a === 'bulk-move') openMoveDialog([...state.selected]);
  else if (a === 'bulk-delete') openDeleteDialog([...state.selected]);
});
page.addEventListener('input', (e) => { if (e.target.id === 'snp-q') { state.q = e.target.value; state.page = 1; renderTable(); } });
page.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'snp-owner') { state.owner = t.value; state.page = 1; renderTable(); } else if (t.id === 'snp-size') { state.pageSize = Number(t.value); state.page = 1; renderTable(); } else if (t.id === 'snp-check-all') {
    const ids = [...page.querySelectorAll('#snp-rows tr[data-id]')].map((r) => r.dataset.id);
    ids.forEach((id) => (t.checked ? state.selected.add(id) : state.selected.delete(id)));
    renderTable();
  } else if (t.dataset.sel) { if (t.checked) state.selected.add(t.dataset.sel); else state.selected.delete(t.dataset.sel); renderTable(); }
});

renderPage();
if (params.get('id')) openEditor(params.get('id'));
else if (params.get('new')) openEditor(null);

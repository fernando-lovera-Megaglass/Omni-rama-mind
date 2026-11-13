// Segmentos: the list of segments as in the original (header actions, Gestionar / Análisis tabs, view tabs with
// Carpetas, filter chips, search, Acciones, the table and the pager). Creating or opening a segment goes to the
// segment editor (segments/editor/); cloning, folders, conversion to static and deletion happen here.
import { boot } from './page.js';
import { wireMenus, closeMenus, toast } from './shell.js';
import { formatDate } from './data.js';
import { segments, folders, saveFolders, updateSegment, removeSegments, segmentSize, cloneSegment, convertToStatic, matchesSearch, objectLabel, SEGMENT_OBJECTS, TYPE_LABELS } from './segments-data.js';

boot({ root: '../', active: 'crm', sub: 'Segmentos', title: 'Segmentos' });

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const root = document.getElementById('seg-root');
const $ = (id) => document.getElementById(id);
const fmtWhen = (iso) => { const d = new Date(iso); return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const num = (n) => Number(n || 0).toLocaleString('en-US');

const state = { tab: 'manage', q: '', creator: '', type: '', object: '', used: '', page: 1, size: 25, selected: new Set(), sort: { key: 'updated', dir: -1 } };
const sizeCache = new Map();
const sizeOf = (s) => { const k = `${s.id}:${s.updated}`; if (!sizeCache.has(k)) sizeCache.set(k, segmentSize(s)); return sizeCache.get(k); };

function filtered() {
  return segments()
    .filter((s) => matchesSearch(s, state.q) && (!state.creator || s.creator === state.creator) && (!state.type || s.type === state.type) && (!state.object || s.object === state.object) && (!state.used || (state.used === 'used' ? s.usedIn > 0 : !s.usedIn)))
    .sort((a, b) => {
      const k = state.sort.key;
      const av = k === 'size' ? sizeOf(a) : k === 'updated' ? new Date(a.updated).getTime() : String(a[k] || '');
      const bv = k === 'size' ? sizeOf(b) : k === 'updated' ? new Date(b.updated).getTime() : String(b[k] || '');
      return (typeof av === 'number' ? av - bv : av.localeCompare(bv, 'es')) * state.sort.dir;
    });
}

const chip = (key, label, current, options) => `
  <div class="menu">
    <button class="qchip" type="button" aria-haspopup="true" aria-expanded="false" data-chip="${key}">${esc(current ? (options.find((o) => o[0] === current) || [current, current])[1] : label)} <span class="caret"></span></button>
    <div class="menu__panel">${options.map(([v, l]) => `<button class="menu__item${current === v ? ' is-current' : ''}" type="button" data-filter="${key}" data-value="${esc(v)}">${esc(l)}</button>`).join('')}</div>
  </div>`;
const info = (tip) => `<span class="seg__info" title="${esc(tip)}" aria-label="${esc(tip)}">ⓘ</span>`;
const sortTh = (key, label, tip) => `<th><button class="th-sort${state.sort.key === key ? ' is-sorted' : ''}" type="button" data-sort="${key}">${label}${tip ? ` ${info(tip)}` : ''}</button></th>`;

function render() {
  const all = segments();
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / state.size));
  if (state.page > pages) state.page = pages;
  const slice = rows.slice((state.page - 1) * state.size, state.page * state.size);
  const creators = [...new Set(all.map((s) => s.creator))];
  const pageIds = slice.map((s) => Number(s.id));
  const allChecked = pageIds.length > 0 && pageIds.every((id) => state.selected.has(id));
  root.innerHTML = `
    <div class="seg__head">
      <div><h1>Segmentos</h1><p class="seg__count">${num(all.length)} segmento${all.length === 1 ? '' : 's'}</p></div>
      <div class="seg__actions">
        <div class="menu"><button class="btn btn--ghost btn--pillx" type="button" aria-haspopup="true" aria-expanded="false">Configuración de administración <span class="caret"></span></button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-act="folders">Carpetas</button><button class="menu__item" type="button" data-act="limits">Límites de segmentos</button><button class="menu__item" type="button" data-act="permissions">Permisos de segmentos</button></div></div>
        <a class="btn btn--ghost btn--pillx" href="../data/?from=contacts">Importación</a>
        <div class="menu"><button class="btn btn--ghost btn--pillx" type="button" aria-haspopup="true" aria-expanded="false">Creación rápida <span class="caret"></span></button><div class="menu__panel menu__panel--right">${SEGMENT_OBJECTS.map(([k, l]) => `<a class="menu__item" href="./editor/?object=${k}" data-quick="${k}">Segmento activo de ${l.toLowerCase()}s</a>`).join('')}</div></div>
        <div class="menu"><button class="btn btn--primary btn--pillx" type="button" aria-haspopup="true" aria-expanded="false">Crear segmento <span class="caret"></span></button><div class="menu__panel menu__panel--right"><a class="menu__item" href="./editor/" data-create="active">Segmento activo</a><a class="menu__item" href="./editor/?type=static" data-create="static">Segmento estático</a></div></div>
      </div>
    </div>
    <div class="seg__tabs" role="tablist"><button class="seg__tab${state.tab === 'manage' ? ' is-active' : ''}" type="button" role="tab" data-tab="manage">Gestionar</button><button class="seg__tab${state.tab === 'analysis' ? ' is-active' : ''}" type="button" role="tab" data-tab="analysis">Análisis</button></div>
    ${state.tab === 'manage' ? `
    <div class="seg__views">
      <div class="seg__viewtabs"><button class="seg__viewtab is-active" type="button">Todos los segmentos</button><button class="seg__viewadd" type="button" data-act="add-view">＋ Agregar vista (1/50)</button><button class="seg__viewall" type="button" data-act="all-views">Todas las vistas</button></div>
      <button class="btn btn--ghost btn--pillx seg__folders" type="button" data-act="folders"><span class="seg__folderico" aria-hidden="true"></span> Carpetas</button>
    </div>
    <div class="panel seg__panel">
      <div class="seg__filters">
        <div class="seg__chips">
          ${chip('creator', 'Todos los creadores', state.creator, [['', 'Todos los creadores'], ...creators.map((c) => [c, c])])}
          ${chip('type', 'Todos los tipos', state.type, [['', 'Todos los tipos'], ['active', 'Activo'], ['static', 'Estática']])}
          ${chip('object', 'Todos los objetos', state.object, [['', 'Todos los objetos'], ...SEGMENT_OBJECTS])}
          ${chip('used', 'Se usa en', state.used, [['', 'Se usa en: todos'], ['used', 'En uso'], ['unused', 'Sin usar']])}
          <button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-act="add-filter" aria-label="Añadir filtro" title="Añadir filtro">+</button>
          <button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-act="edit-filters" aria-label="Editar filtros rápidos" title="Editar filtros rápidos">✎</button>
          <button class="pill pill--adv seg__adv" type="button" data-act="advanced"><span class="ico ico--filter"></span> Filtros avanzados</button>
        </div>
        <div class="seg__tools"><button class="icon-btn icon-btn--round tip" type="button" data-act="undo" aria-label="Deshacer"><span>↶</span><span class="tip__text">Deshacer</span></button><button class="icon-btn icon-btn--round tip" type="button" data-act="clone-view" aria-label="Clonar vista"><span>⧉</span><span class="tip__text">Clonar vista</span></button><button class="icon-btn icon-btn--round tip" type="button" data-act="save-view" aria-label="Guardar vista"><span>▭</span><span class="tip__text">Guardar vista</span></button></div>
      </div>
      <div class="seg__searchrow">
        <div class="search search--sm seg__search"><input type="search" id="seg-q" value="${esc(state.q)}" placeholder="Buscar segmentos" aria-label="Buscar segmentos" /><span class="ico ico--search" aria-hidden="true"></span></div>
        <div class="menu"><button class="btn btn--ghost btn--pillx" type="button" aria-haspopup="true" aria-expanded="false" id="seg-actions">Acciones <span class="caret"></span></button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-bulk="folder" ${state.selected.size ? '' : 'disabled'}>Mover a carpeta</button><button class="menu__item" type="button" data-bulk="clone" ${state.selected.size ? '' : 'disabled'}>Clonar</button><button class="menu__item" type="button" data-bulk="static" ${state.selected.size ? '' : 'disabled'}>Convertir en estático</button><button class="menu__item menu__item--danger" type="button" data-bulk="delete" ${state.selected.size ? '' : 'disabled'}>Eliminar</button></div></div>
      </div>
      <div class="table-wrap"><table class="table seg__table">
        <thead><tr>
          <th class="table__check"><input type="checkbox" id="seg-check-all" ${allChecked ? 'checked' : ''} aria-label="Seleccionar todo" /></th>
          ${sortTh('name', 'Nombre', 'Nombre del segmento')}${sortTh('size', 'Tamaño de la lista', 'Número de registros del segmento')}${sortTh('type', 'Tipo', 'Activo: se actualiza solo con sus criterios. Estática: los miembros no cambian.')}${sortTh('object', 'Objeto', 'Objeto de los registros')}${sortTh('updated', 'Última actualización (CST)', 'Último cambio y quién lo hizo')}${sortTh('creator', 'Creador', 'Quién creó el segmento')}${sortTh('folder', 'Carpeta', 'Carpeta donde está guardado')}<th>Se usa en (total) ${info('Herramientas que usan este segmento')}</th>
        </tr></thead>
        <tbody>${slice.length ? slice.map((s) => `
          <tr data-id="${s.id}">
            <td class="table__check"><input type="checkbox" class="seg-check" data-id="${s.id}" ${state.selected.has(Number(s.id)) ? 'checked' : ''} aria-label="Seleccionar ${esc(s.name)}" /></td>
            <td><a class="seg__name" href="./editor/?id=${s.id}">${esc(s.name)}</a></td>
            <td><a class="seg__size" href="./editor/?id=${s.id}">${num(sizeOf(s))}</a></td>
            <td><span class="seg__type"><span class="seg__dot seg__dot--${s.type}"></span>${TYPE_LABELS[s.type] || s.type}</span></td>
            <td>${esc(objectLabel(s.object))}</td>
            <td><div>${esc(fmtWhen(s.updated))}</div><div class="muted">por ${esc(s.updatedBy || s.creator)}</div></td>
            <td>${esc(s.creator)}</td>
            <td>${s.folder ? `<a class="seg__folder" href="#" data-folder-filter="${esc(s.folder)}">${esc(s.folder)}</a>` : '<span class="muted">-</span>'}</td>
            <td class="num">${s.usedIn ? `<a href="./editor/?id=${s.id}">${s.usedIn}</a>` : '0'}</td>
          </tr>`).join('') : '<tr><td colspan="9" class="muted seg__empty">No hay segmentos que coincidan.</td></tr>'}</tbody>
      </table></div>
      <div class="pager pager--center">
        <button class="pager__btn" type="button" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>‹ Anterior</button>
        <span class="pager__nums">${Array.from({ length: pages }, (_, i) => i + 1).filter((n) => pages <= 11 || Math.abs(n - state.page) <= 4 || n === 1 || n === pages).map((n) => `<button class="pager__num${n === state.page ? ' is-active' : ''}" type="button" data-page="${n}">${n}</button>`).join('')}</span>
        <button class="pager__btn" type="button" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>Siguiente ›</button>
        <div class="menu pager__sizemenu"><button class="pager__btn" type="button" aria-haspopup="true" aria-expanded="false">${state.size} por página <span class="caret"></span></button><div class="menu__panel menu__panel--up">${[10, 25, 50, 100].map((n) => `<button class="menu__item${state.size === n ? ' is-current' : ''}" type="button" data-size="${n}">${n} por página</button>`).join('')}</div></div>
      </div>
    </div>` : renderAnalysis(all)}
    <div class="drawer drawer--modal" id="seg-modal" aria-hidden="true"><div class="drawer__panel drawer__panel--dialog" role="dialog" aria-labelledby="seg-modal-title"><div class="drawer__head drawer__head--light"><h2 id="seg-modal-title"></h2><button class="drawer__close" type="button" data-close aria-label="Cerrar">×</button></div><div class="drawer__body" id="seg-modal-body"></div><div class="drawer__foot" id="seg-modal-foot"></div></div></div>`;
  wireMenus(root);
  const q = $('seg-q');
  if (q) q.addEventListener('input', () => { state.q = q.value.trim(); state.page = 1; const pos = q.selectionStart; render(); const nq = $('seg-q'); nq.focus(); nq.setSelectionRange(pos, pos); });
}

function renderAnalysis(all) {
  const byType = (t) => all.filter((s) => s.type === t).length;
  const byObject = SEGMENT_OBJECTS.map(([k, l]) => [l, all.filter((s) => s.object === k)]);
  const used = all.filter((s) => s.usedIn > 0).length;
  const stale = all.filter((s) => (Date.now() - new Date(s.updated).getTime()) / 86400000 > 180).length;
  return `
    <div class="panel seg__panel seg__analysis">
      <div class="seg__stats">
        <div class="seg__stat"><span>Segmentos</span><strong>${num(all.length)}</strong></div>
        <div class="seg__stat"><span>Activos</span><strong>${num(byType('active'))}</strong></div>
        <div class="seg__stat"><span>Estáticos</span><strong>${num(byType('static'))}</strong></div>
        <div class="seg__stat"><span>En uso</span><strong>${num(used)}</strong></div>
        <div class="seg__stat"><span>Sin actualizar en 6 meses</span><strong>${num(stale)}</strong></div>
      </div>
      <h3>Segmentos por objeto</h3>
      <table class="mini-table seg__mini"><thead><tr><th>Objeto</th><th class="num">Segmentos</th><th class="num">Registros</th></tr></thead><tbody>${byObject.map(([l, list]) => `<tr><td>${l}</td><td class="num">${num(list.length)}</td><td class="num">${num(list.reduce((t, s) => t + sizeOf(s), 0))}</td></tr>`).join('')}</tbody></table>
      <h3>Segmentos sin usar</h3>
      <p class="muted">${num(all.length - used)} segmentos no se usan en ningún workflow, correo ni informe. Puedes eliminarlos desde Gestionar › Acciones.</p>
    </div>`;
}

// ---------- modals (folders, move) ----------
function openModal(title, body, foot = '') {
  $('seg-modal-title').textContent = title;
  $('seg-modal-body').innerHTML = body;
  $('seg-modal-foot').innerHTML = foot;
  $('seg-modal').classList.add('is-open');
  $('seg-modal').setAttribute('aria-hidden', 'false');
}
function closeModal() {
  $('seg-modal').classList.remove('is-open');
  $('seg-modal').setAttribute('aria-hidden', 'true');
}
function openFolders() {
  const list = folders();
  const counts = Object.fromEntries(list.map((f) => [f, segments().filter((s) => s.folder === f).length]));
  openModal('Carpetas', `
    <p class="muted">Agrupa los segmentos en carpetas. Mueve segmentos desde Acciones › Mover a carpeta o desde "Añadir a carpeta" en el editor.</p>
    <table class="mini-table"><thead><tr><th>Carpeta</th><th class="num">Segmentos</th><th></th></tr></thead><tbody>${list.length ? list.map((f, i) => `<tr><td><strong>${esc(f)}</strong></td><td class="num">${counts[f] || 0}</td><td class="num"><button class="link-btn" type="button" data-folder-rm="${i}" ${counts[f] ? 'disabled title="Tiene segmentos"' : ''}>Eliminar</button></td></tr>`).join('') : '<tr><td colspan="3" class="muted">Todavía no hay carpetas.</td></tr>'}</tbody></table>
    <label class="field"><span>Nueva carpeta</span><input type="text" id="folder-name" maxlength="60" placeholder="Por ejemplo: Campañas 2026" /></label>`,
    '<button class="btn btn--primary" type="button" data-act="folder-create">Crear carpeta</button><button class="btn btn--ghost" type="button" data-close>Cerrar</button>');
}
function openMoveToFolder() {
  openModal('Mover a carpeta', `<p class="muted">${state.selected.size} segmento(s) seleccionado(s).</p><label class="field"><span>Carpeta</span><select id="move-folder"><option value="">Sin carpeta</option>${folders().map((f) => `<option>${esc(f)}</option>`).join('')}</select></label>`, '<button class="btn btn--primary" type="button" data-act="move-confirm">Mover</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>');
}

// ---------- events ----------
root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'seg-check-all') { filtered().slice((state.page - 1) * state.size, state.page * state.size).forEach((s) => { if (t.checked) state.selected.add(Number(s.id)); else state.selected.delete(Number(s.id)); }); render(); return; }
  if (t.classList.contains('seg-check')) { if (t.checked) state.selected.add(Number(t.dataset.id)); else state.selected.delete(Number(t.dataset.id)); render(); }
});
root.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; render(); return; }
  const f = e.target.closest('[data-filter]');
  if (f) { state[f.dataset.filter] = f.dataset.value; state.page = 1; closeMenus(); render(); return; }
  const ff = e.target.closest('[data-folder-filter]');
  if (ff) { e.preventDefault(); state.q = ff.dataset.folderFilter; state.page = 1; render(); toast(`Segmentos de la carpeta "${ff.dataset.folderFilter}"`); return; }
  const sort = e.target.closest('[data-sort]');
  if (sort) { const k = sort.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === 'updated' || k === 'size' ? -1 : 1 }; render(); return; }
  const pg = e.target.closest('[data-page]');
  if (pg) { state.page = Number(pg.dataset.page); render(); return; }
  const sz = e.target.closest('[data-size]');
  if (sz) { state.size = Number(sz.dataset.size); state.page = 1; closeMenus(); render(); return; }
  const bulk = e.target.closest('[data-bulk]');
  if (bulk) {
    closeMenus();
    const ids = [...state.selected];
    if (!ids.length) return;
    if (bulk.dataset.bulk === 'delete') { if (window.confirm(`¿Eliminar ${ids.length} segmento(s)?`)) { removeSegments(ids); state.selected.clear(); render(); toast('Segmentos eliminados'); } return; }
    if (bulk.dataset.bulk === 'clone') { ids.forEach((id) => cloneSegment(id)); state.selected.clear(); state.page = 1; render(); toast(`${ids.length} segmento(s) clonado(s)`); return; }
    if (bulk.dataset.bulk === 'static') { ids.forEach((id) => convertToStatic(id)); render(); toast('Convertidos en segmentos estáticos'); return; }
    if (bulk.dataset.bulk === 'folder') { openMoveToFolder(); return; }
  }
  const frm = e.target.closest('[data-folder-rm]');
  if (frm) { const list = folders(); list.splice(Number(frm.dataset.folderRm), 1); saveFolders(list); openFolders(); toast('Carpeta eliminada'); return; }
  if (e.target.closest('[data-close]') || e.target === $('seg-modal')) { closeModal(); return; }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  e.preventDefault();
  const a = act.dataset.act;
  if (a === 'folders') openFolders();
  else if (a === 'folder-create') { const name = $('folder-name').value.trim(); if (!name) { toast('Escribe el nombre de la carpeta'); return; } const list = folders(); if (!list.includes(name)) { list.push(name); saveFolders(list); } openFolders(); toast(`Carpeta "${name}" creada`); }
  else if (a === 'move-confirm') { const folder = $('move-folder').value; [...state.selected].forEach((id) => updateSegment(id, { folder })); state.selected.clear(); closeModal(); render(); toast(folder ? `Movidos a "${folder}"` : 'Sacados de su carpeta'); }
  else if (a === 'limits') toast('Límites: hasta 250 filtros por segmento (60 de objetos asociados); 1.500 segmentos activos y 1.500 estáticos por cuenta.');
  else if (a === 'permissions') toast('Permisos: cada segmento define en Acceso quién lo ve y quién lo edita.');
  else if (a === 'add-view') toast('Vistas guardadas de segmentos: hasta 50 por usuario.');
  else if (a === 'all-views') toast('Solo existe la vista "Todos los segmentos".');
  else if (a === 'add-filter' || a === 'edit-filters' || a === 'advanced') toast('Usa los filtros de creador, tipo, objeto y uso, o busca por nombre.');
  else if (a === 'undo') toast('No hay cambios que deshacer');
  else if (a === 'clone-view' || a === 'save-view') toast('La vista "Todos los segmentos" no se puede modificar.');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

render();
export { state, render };

// "Administrar vistas" (Configuración › Objetos › Personalización del índice):
// all saved views of an object, the default tabs new users get, and recently deleted views.
import { toast, wireMenus, closeMenus } from './shell.js';
import { getViewStore, setViewStore, formatDate } from './data.js';
import { STD_VIEWS, TYPE_LABELS, defaultTabs, saveDefaultTabs, deletedViews, saveDeletedViews } from './std-views.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const params = new URLSearchParams(location.search);
let type = STD_VIEWS[params.get('type')] ? params.get('type') : 'deals';
const TABS = [['all', 'Todas las vistas'], ['defaults', 'Vistas predeterminadas'], ['deleted', 'Eliminado recientemente']];
let tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'defaults';
const root = document.getElementById('views-root');
document.title = 'Administrar vistas | Omni';

let selected = defaultTabs(type);
let savedSel = JSON.stringify(selected);
let q = '';
let qAll = '';
let openStd = true;
let openCustom = true;
let dragId = null;

const store = () => getViewStore(type);
const standardViews = () => STD_VIEWS[type].map(([k, l]) => ({ id: `std:${k}`, name: l, standard: true, owner: 'Omni', share: 'all' }));
const allViews = () => [...standardViews(), ...store().custom];
const viewById = (id) => allViews().find((v) => v.id === id);
const dirty = () => JSON.stringify(selected) !== savedSel;
const SHARE = { private: 'Solo yo', team: 'Mi equipo', all: 'Todos' };
const backHref = `../settings/#obj-${type}:index`;

function reload() {
  selected = defaultTabs(type).filter((id) => viewById(id));
  savedSel = JSON.stringify(selected);
}
reload();

function defaultsHtml() {
  const custom = store().custom.filter((v) => !q || v.name.toLowerCase().includes(q));
  const check = (v) => `<label class="mvcheck"><input type="checkbox" data-pick="${esc(v.id)}" ${selected.includes(v.id) ? 'checked' : ''} /><span>${esc(v.name)}</span></label>`;
  return `
    <div class="mv">
      <aside class="mv__side">
        <button class="mv__group" type="button" data-toggle="std" aria-expanded="${openStd}"><span class="chev">${openStd ? '⌄' : '›'}</span> Vistas estándar</button>
        ${openStd ? `<div class="mv__list">${standardViews().map(check).join('')}</div>` : ''}
        <hr class="mv__sep" />
        <button class="mv__group" type="button" data-toggle="custom" aria-expanded="${openCustom}"><span class="chev">${openCustom ? '⌄' : '›'}</span> Vistas personalizadas</button>
        ${openCustom ? `<div class="search search--sm mv__search"><input type="search" id="mv-q" placeholder="Buscar" aria-label="Buscar vistas personalizadas" value="${esc(q)}" /><span class="ico ico--search" aria-hidden="true"></span></div>
        <div class="mv__list">${custom.length ? custom.map(check).join('') : `<p class="muted mv__empty">${q ? 'Ninguna vista coincide.' : 'Todavía no hay vistas personalizadas. Se crean desde la lista con "+".'}</p>`}</div>` : ''}
      </aside>
      <section class="mv__main">
        <div class="mv__banner"><span class="mv__banner-ico" aria-hidden="true">📣</span><span>Esta configuración ahora se aplica a usuarios nuevos y actuales con diferentes aplicaciones.</span> <a href="#" onclick="return false">Haz clic para obtener más información ↗</a> <a href="#" onclick="return false">Enviar feedback</a></div>
        <div class="mv__card">
          <div class="menu mv__object"><button class="mv__title" type="button" aria-haspopup="true" aria-expanded="false">${esc(TYPE_LABELS[type])} <span class="caret"></span></button><div class="menu__panel">${Object.entries(TYPE_LABELS).map(([k, l]) => `<button class="menu__item${k === type ? ' is-current' : ''}" type="button" data-type="${k}">${l}</button>`).join('')}</div></div>
          <div class="mv__tabs" id="mv-tabs">
            ${selected.map((id, i) => { const v = viewById(id); return v ? `<div class="mv__tab${i === 0 ? ' is-active' : ''}" draggable="true" data-tab="${esc(id)}" title="Arrastra para cambiar el orden"><span>${esc(v.name)}</span><button type="button" class="mv__x" data-untab="${esc(id)}" aria-label="Quitar ${esc(v.name)} de las pestañas predeterminadas" ${selected.length <= 1 ? 'disabled' : ''}>×</button></div>` : ''; }).join('') || '<p class="muted mv__empty">Marca al menos una vista a la izquierda.</p>'}
          </div>
          <p class="muted mv__hint">Así verán las pestañas de ${TYPE_LABELS[type].toLowerCase()} los usuarios que aún no hayan personalizado las suyas. Arrastra para ordenar; la primera es la que se abre.</p>
        </div>
        <div class="mv__note"><strong>Nota</strong><span>Estas vistas predeterminadas solo se aplican a los usuarios que aún no han personalizado las suyas. Las personas que ya hayan añadido o reordenado vistas desde la página del objeto no se verán afectadas por las selecciones que hagas aquí.</span></div>
      </section>
    </div>`;
}

function allHtml() {
  const rows = allViews().filter((v) => !qAll || v.name.toLowerCase().includes(qAll));
  return `
    <div class="mv mv--single">
      <section class="mv__main">
        <div class="mv__toolbar"><div class="search search--sm mv__search"><input type="search" id="mv-qall" placeholder="Buscar vistas" aria-label="Buscar vistas" value="${esc(qAll)}" /><span class="ico ico--search" aria-hidden="true"></span></div><span class="muted">${rows.length} vistas · ${standardViews().length} estándar, ${store().custom.length} personalizadas</span><a class="btn btn--primary" href="../${type}/">Crear vista en la lista ↗</a></div>
        <table class="mini-table stable mvtable"><thead><tr><th>Nombre</th><th>Tipo</th><th>Propietario</th><th>Compartida con</th><th>Pestaña predeterminada</th><th>Última modificación</th><th></th></tr></thead><tbody>
          ${rows.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td><td>${v.standard ? 'Estándar' : 'Personalizada'}</td><td>${esc(v.owner || 'Omni')}</td><td>${SHARE[v.share] || 'Todos'}</td><td>${selected.includes(v.id) ? '<span class="tag tag--done">Sí</span>' : '<span class="muted">No</span>'}</td><td class="muted">${v.updated ? esc(formatDate(v.updated)) : '--'}</td><td class="num"><div class="menu"><button class="icon-btn icon-btn--round" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Acciones">⋯</button><div class="menu__panel menu__panel--right"><a class="menu__item" href="../${type}/">Abrir en la lista ↗</a>${selected.includes(v.id) ? `<button class="menu__item" type="button" data-untab="${esc(v.id)}" data-goto="defaults">Quitar de las pestañas predeterminadas</button>` : `<button class="menu__item" type="button" data-addtab="${esc(v.id)}">Añadir a las pestañas predeterminadas</button>`}${v.standard ? '' : `<button class="menu__item menu__item--danger" type="button" data-del="${esc(v.id)}">Eliminar</button>`}</div></div></td></tr>`).join('')}
        </tbody></table>
      </section>
    </div>`;
}

function deletedHtml() {
  const list = deletedViews(type);
  return `
    <div class="mv mv--single">
      <section class="mv__main">
        <p class="muted">Las vistas eliminadas se conservan aquí 90 días. Puedes restaurarlas o eliminarlas definitivamente.</p>
        ${list.length ? `<table class="mini-table stable mvtable"><thead><tr><th>Nombre</th><th>Propietario</th><th>Eliminada</th><th></th></tr></thead><tbody>${list.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td><td>${esc(v.owner || 'Omni')}</td><td class="muted">${esc(formatDate(v.deletedAt))}</td><td class="num"><button class="link-btn" type="button" data-restore="${esc(v.id)}">Restaurar</button> <button class="link-btn" type="button" data-purge="${esc(v.id)}">Eliminar definitivamente</button></td></tr>`).join('')}</tbody></table>` : '<p class="pempty">No hay vistas eliminadas recientemente.</p>'}
      </section>
    </div>`;
}

function render() {
  root.innerHTML = `
    <header class="ledit__bar mv__bar">
      <div class="ledit__left"><a class="mv__back" href="${backHref}" data-exit>‹ Volver</a></div>
      <div class="ledit__title">Administrar vistas</div>
      <div class="ledit__right"><button class="pill pill--light" type="button" data-save ${dirty() ? '' : 'disabled'}>Guardar</button></div>
    </header>
    <nav class="mv__nav" aria-label="Secciones">${TABS.map(([k, l]) => `<button type="button" class="${tab === k ? 'is-active' : ''}" data-tab-go="${k}">${l}</button>`).join('')}</nav>
    ${tab === 'defaults' ? defaultsHtml() : tab === 'all' ? allHtml() : deletedHtml()}`;
  wireMenus(root);
  const qi = document.getElementById(tab === 'defaults' ? 'mv-q' : 'mv-qall');
  const cur = tab === 'defaults' ? q : qAll;
  if (qi && cur) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
}

root.addEventListener('click', (e) => {
  const t = e.target;
  const exit = t.closest('[data-exit]');
  if (exit) { if (dirty() && !window.confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) e.preventDefault(); return; }
  if (t.closest('[data-save]')) { saveDefaultTabs(type, selected); savedSel = JSON.stringify(selected); render(); toast('Pestañas predeterminadas guardadas'); return; }
  const go = t.closest('[data-tab-go]');
  if (go) { tab = go.dataset.tabGo; history.replaceState(null, '', `?type=${type}&tab=${tab}`); render(); return; }
  const tg = t.closest('[data-toggle]');
  if (tg) { if (tg.dataset.toggle === 'std') openStd = !openStd; else openCustom = !openCustom; render(); return; }
  const ty = t.closest('[data-type]');
  if (ty) { closeMenus(); if (dirty() && !window.confirm('Tienes cambios sin guardar en este objeto. ¿Cambiar de objeto?')) return; type = ty.dataset.type; history.replaceState(null, '', `?type=${type}&tab=${tab}`); reload(); render(); return; }
  const un = t.closest('[data-untab]');
  if (un) { closeMenus(); if (selected.length > 1) selected = selected.filter((id) => id !== un.dataset.untab); if (un.dataset.goto) tab = un.dataset.goto; render(); return; }
  const add = t.closest('[data-addtab]');
  if (add) { closeMenus(); if (!selected.includes(add.dataset.addtab)) selected.push(add.dataset.addtab); render(); return; }
  const del = t.closest('[data-del]');
  if (del) {
    closeMenus();
    const s = store(); const v = s.custom.find((x) => x.id === del.dataset.del);
    if (!v || !window.confirm(`¿Eliminar la vista "${v.name}"?`)) return;
    saveDeletedViews(type, [{ ...v, deletedAt: new Date().toISOString() }, ...deletedViews(type).filter((x) => x.id !== v.id)].slice(0, 50));
    s.custom = s.custom.filter((x) => x.id !== v.id); s.open = (s.open || []).filter((x) => x !== v.id); if (s.active === v.id) s.active = null; setViewStore(type, s);
    selected = selected.filter((id) => id !== v.id);
    render(); toast(`Vista "${v.name}" eliminada`); return;
  }
  const rs = t.closest('[data-restore]');
  if (rs) {
    const list = deletedViews(type); const v = list.find((x) => x.id === rs.dataset.restore); if (!v) return;
    const s = store(); const { deletedAt, ...view } = v; if (!s.custom.some((x) => x.id === view.id)) s.custom.push(view); setViewStore(type, s);
    saveDeletedViews(type, list.filter((x) => x.id !== v.id)); render(); toast(`Vista "${v.name}" restaurada`); return;
  }
  const pg = t.closest('[data-purge]');
  if (pg) { saveDeletedViews(type, deletedViews(type).filter((x) => x.id !== pg.dataset.purge)); render(); toast('Vista eliminada definitivamente'); }
});
root.addEventListener('change', (e) => {
  const pick = e.target.closest('[data-pick]');
  if (!pick) return;
  const id = pick.dataset.pick;
  if (pick.checked) { if (!selected.includes(id)) selected.push(id); } else if (selected.length > 1) selected = selected.filter((x) => x !== id); else { pick.checked = true; toast('Debe quedar al menos una pestaña predeterminada'); return; }
  render();
});
root.addEventListener('input', (e) => {
  if (e.target.id === 'mv-q') { q = e.target.value.trim().toLowerCase(); render(); }
  if (e.target.id === 'mv-qall') { qAll = e.target.value.trim().toLowerCase(); render(); }
});
// Drag the preview tabs to reorder the default tabs.
root.addEventListener('dragstart', (e) => { const tb = e.target.closest('.mv__tab'); if (!tb) return; dragId = tb.dataset.tab; tb.classList.add('is-dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch { /* ignore */ } } });
root.addEventListener('dragover', (e) => { const tb = e.target.closest('.mv__tab'); if (!tb || !dragId || tb.dataset.tab === dragId) return; e.preventDefault(); root.querySelectorAll('.mv__tab.is-over').forEach((x) => x.classList.remove('is-over')); tb.classList.add('is-over'); });
root.addEventListener('drop', (e) => { const tb = e.target.closest('.mv__tab'); if (!tb || !dragId) return; e.preventDefault(); const from = selected.indexOf(dragId); const to = selected.indexOf(tb.dataset.tab); if (from >= 0 && to >= 0) { selected.splice(from, 1); selected.splice(to, 0, dragId); } dragId = null; render(); });
root.addEventListener('dragend', () => { dragId = null; root.querySelectorAll('.is-dragging, .is-over').forEach((x) => x.classList.remove('is-dragging', 'is-over')); });
window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

render();

// Marketing › Correo: the e-mails list ("Administrar") with its status tabs, filters and row actions, the
// "Analizar" tab, the sending-method dialog, the template picker, the drag-and-drop editor and the
// "Revisar y enviar" flow. Sending is simulated by marketing-data.js.
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { formatDate, relativeTimeFine, download } from './data.js';
import { ready, emails, emailById, countsByEstado, folders, createEmail, updateEmail, cloneEmail, archiveEmail, deleteEmail, recipientOptions, recipientsOf, destinatariosFromValue, destinatariosValue, checklist, sendEmail, sendTest, analytics, ESTADOS, TIPOS, ME } from './marketing-data.js';
import { MODULE_DEFS, MODULE_GROUPS, SECTIONS, TEMPLATES, TEMPLATE_CATEGORIES, newModule, cloneModules, renderEmailHtml, moduleHtml, BRAND } from './marketing-templates.js';

boot({ root: '../../', active: 'marketing', sub: 'Correo', title: 'Correo de marketing' });
await ready;

const root = document.getElementById('mkt-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = {
  view: ['manage', 'analyze', 'templates', 'editor', 'review'].includes(params.get('view')) ? params.get('view') : 'manage',
  id: params.get('id') || null,
  estado: params.get('estado') || 'all',
  folder: '', tipo: '', by: '', q: '',
  sort: { key: 'updatedAt', dir: -1 },
  pendingTipo: 'normal', tplCat: '', tplQ: '',
  addTab: 'modules', editing: null, saveTimer: null, saveStatus: '',
};
const pct = (n) => `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
const syncUrl = () => { const u = new URLSearchParams(); u.set('view', state.view); if (state.id && ['editor', 'review'].includes(state.view)) u.set('id', state.id); if (state.view === 'manage' && state.estado !== 'all') u.set('estado', state.estado); history.replaceState(null, '', `?${u}`); };

// ---------- shared modal ----------
function modal(title, body, foot, { wide = false } = {}) {
  let m = $('mk-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal';
    m.id = 'mk-modal';
    m.setAttribute('aria-hidden', 'true');
    root.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); closeModal(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeModal(); });
  }
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel${wide ? ' bmodal__panel--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mk-modal-title"><div class="bmodal__head"><h3 id="mk-modal-title">${esc(title)}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body" id="mk-modal-body">${body}</div><div class="bmodal__foot" id="mk-modal-foot">${foot}</div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  return m;
}
function closeModal() { const m = $('mk-modal'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } }

// ---------- Administrar ----------
const ESTADO_TABS = [['all', 'Todos'], ['borrador', 'Borradores'], ['programado', 'Programado'], ['enviado', 'Enviados'], ['archivado', 'Archivados']];
const COLS = [['nombre', 'Nombre del correo'], ['entregados', 'Entregado'], ['tasaApertura', 'Tasa de apertura'], ['tasaClics', 'Tasa de clics'], ['updatedAt', 'Última actualización'], ['updatedBy', 'Última actualización por'], ['fechaPublicacion', 'Fecha de publicación/envío']];
function visibleEmails() {
  const q = state.q.trim().toLowerCase();
  const list = emails().filter((e) => (state.estado === 'all' || e.estado === state.estado) && (!state.folder || e.carpeta === state.folder) && (!state.tipo || e.tipo === state.tipo) && (!state.by || e.updatedBy === state.by) && (!q || `${e.nombre} ${e.asunto}`.toLowerCase().includes(q)));
  const k = state.sort.key;
  const val = (e) => (['updatedAt', 'fechaPublicacion'].includes(k) ? new Date(e[k] || 0).getTime() : e[k]);
  return list.sort((a, b) => { const av = val(a); const bv = val(b); if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * state.sort.dir; return String(av ?? '').localeCompare(String(bv ?? ''), 'es') * state.sort.dir; });
}
function renderManage() {
  const counts = countsByEstado();
  const list = visibleEmails();
  const people = [...new Set(emails().map((e) => e.updatedBy).filter(Boolean))].sort();
  root.innerHTML = `
    <div class="page-head"><h1>Correo de marketing</h1><div class="page-head__actions"><button class="btn btn--primary btn--pillx" type="button" data-mk="create">Crear correo</button></div></div>
    <div class="mk-tabs" role="tablist"><button class="mk-tab${state.view === 'manage' ? ' is-active' : ''}" type="button" data-view="manage">Administrar</button><button class="mk-tab${state.view === 'analyze' ? ' is-active' : ''}" type="button" data-view="analyze">Analizar</button></div>
    ${state.view === 'analyze' ? renderAnalyze() : `
    <div class="mk-estados" role="tablist">${ESTADO_TABS.map(([k, l]) => `<button class="mk-estado${state.estado === k ? ' is-active' : ''}" type="button" data-estado="${k}">${l} <span class="mk-estado__n">${counts[k] || 0}</span></button>`).join('')}</div>
    <div class="mk-toolbar">
      <div class="search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="mk-q" value="${esc(state.q)}" placeholder="Buscar correos" aria-label="Buscar correos" /></div>
      <select id="mk-folder" aria-label="Carpeta"><option value="">Todas las carpetas</option>${folders().map((f) => `<option value="${esc(f)}" ${state.folder === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <select id="mk-tipo" aria-label="Tipo de correo"><option value="">Todos los tipos</option>${Object.entries(TIPOS).map(([k, l]) => `<option value="${k}" ${state.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="mk-by" aria-label="Última actualización por"><option value="">Actualizado por: cualquiera</option>${people.map((p) => `<option value="${esc(p)}" ${state.by === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      ${state.folder || state.tipo || state.by || state.q ? '<button class="link-btn" type="button" data-mk="clear-filters">Borrar filtros</button>' : ''}
    </div>
    <div class="table-wrap"><table class="table mk-table"><thead><tr>${COLS.map(([k, l]) => `<th><button class="psort${state.sort.key === k ? ' is-active' : ''}" type="button" data-sort="${k}">${l} <span aria-hidden="true">${state.sort.key === k ? (state.sort.dir > 0 ? '↑' : '↓') : '⇅'}</span></button></th>`).join('')}<th></th></tr></thead>
      <tbody id="mk-rows">${list.length ? list.map((e) => `<tr data-id="${esc(e.id)}">
        <td><a href="#" data-mk="open" class="mk-name">${esc(e.nombre)}</a><div class="muted mk-sub"><span class="tag ${e.estado === 'enviado' ? 'tag--done' : e.estado === 'programado' ? 'tag--open' : 'tag--none'}">${ESTADOS[e.estado]}</span> ${TIPOS[e.tipo] || e.tipo}${e.carpeta ? ` · ${esc(e.carpeta)}` : ''}${e.asunto ? ` · ${esc(e.asunto)}` : ''}</div></td>
        <td>${e.enviados ? e.entregados.toLocaleString('es-ES') : '<span class="muted">--</span>'}</td>
        <td>${e.enviados ? pct(e.tasaApertura) : '<span class="muted">--</span>'}</td>
        <td>${e.enviados ? pct(e.tasaClics) : '<span class="muted">--</span>'}</td>
        <td title="${esc(formatDate(e.updatedAt))}">${esc(relativeTimeFine(e.updatedAt))}</td>
        <td>${esc(e.updatedBy || e.createdBy || '--')}</td>
        <td>${e.fechaPublicacion ? `${esc(formatDate(e.fechaPublicacion))}${e.estado === 'programado' ? ' <span class="muted">(programado)</span>' : ''}` : '<span class="muted">--</span>'}</td>
        <td class="mk-rowactions"><button class="btn btn--ghost btn--sm" type="button" data-mk="edit">Editar</button><button class="btn btn--ghost btn--sm" type="button" data-mk="clone">Clonar</button>
          <div class="menu"><button class="btn btn--ghost btn--sm" type="button" aria-haspopup="true" aria-expanded="false">Acciones <span class="caret"></span></button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-mk="archive">${e.estado === 'archivado' ? 'Desarchivar' : 'Archivar'}</button><button class="menu__item" type="button" data-mk="export">Exportar</button><button class="menu__item menu__item--danger" type="button" data-mk="delete">Eliminar</button></div></div></td>
      </tr>`).join('') : `<tr><td colspan="8" class="muted">No hay correos ${state.estado === 'all' ? '' : `en «${ESTADO_TABS.find(([k]) => k === state.estado)[1]}»`} con estos filtros.</td></tr>`}</tbody></table></div>
    <p class="muted mk-foot">${list.length} ${list.length === 1 ? 'correo' : 'correos'}</p>`}`;
  wireMenus(root);
}
function renderAnalyze() {
  const a = analytics();
  const card = (label, value, hint) => `<div class="kpi"><div class="kpi__head"><span class="kpi__label">${label}</span></div><div class="kpi__value">${value}</div><div class="muted">${hint}</div></div>`;
  const max = Math.max(1, ...a.sent.map((e) => e.aperturas));
  return `<div class="mk-analyze">
    <div class="kpis kpis--static"><div class="kpis__track">
      ${card('Correos enviados', a.enviados.toLocaleString('es-ES'), `${a.sent.length} ${a.sent.length === 1 ? 'envío' : 'envíos'}`)}
      ${card('Tasa de entrega', pct(a.tasaEntrega), `${a.entregados.toLocaleString('es-ES')} entregados`)}
      ${card('Tasa de apertura', pct(a.tasaApertura), `${a.aperturas.toLocaleString('es-ES')} aperturas`)}
      ${card('Tasa de clics', pct(a.tasaClics), `${a.clics.toLocaleString('es-ES')} clics`)}
    </div></div>
    <div class="card mk-chart"><h3 class="card__title">Aperturas por correo</h3>${a.sent.length ? `<ul class="mk-bars" id="mk-bars">${a.sent.map((e) => `<li><span class="mk-bars__label" title="${esc(e.nombre)}">${esc(e.nombre)}</span><span class="mk-bars__track"><span class="mk-bars__bar" style="width:${Math.round((e.aperturas / max) * 100)}%"></span></span><span class="mk-bars__n">${e.aperturas.toLocaleString('es-ES')} <span class="muted">(${pct(e.tasaApertura)})</span></span></li>`).join('')}</ul>` : '<p class="muted">Todavía no hay correos enviados.</p>'}</div>
  </div>`;
}

// ---------- Crear correo: sending method ----------
function openCreate() {
  const opt = (k, title, desc) => `<label class="mk-method${state.pendingTipo === k ? ' is-active' : ''}"><input type="radio" name="tipo" value="${k}" ${state.pendingTipo === k ? 'checked' : ''} /><span><strong>${title}</strong><small>${desc}</small></span></label>`;
  modal('Método de envío', `<p class="muted">¿Cómo quieres enviar este correo?</p><div class="mk-methods">
    ${opt('normal', 'Normal', 'Envía el correo a una lista de contactos, ahora o programado.')}
    ${opt('automatizado', 'Automatizado', 'Para usarlo en workflows: se envía cuando lo dispara una automatización.')}
    ${opt('blog', 'Blog', 'Se envía automáticamente cuando se publica una nueva entrada del blog.')}
  </div>`, '<button class="btn btn--primary" type="button" data-mk="method-continue">Continuar</button><button class="btn btn--ghost" type="button" data-bm="close">Cancelar</button>');
}

// ---------- Seleccionar plantilla ----------
function savedTemplates() {
  return emails().filter((e) => (e.contenido || []).length).map((e) => ({ id: `saved:${e.id}`, nombre: e.nombre, categoria: 'Guardadas', descripcion: `Contenido de «${e.nombre}» (${e.contenido.length} módulos)`, header: e.plantilla !== 'plain', modules: () => cloneModules(e.contenido), plantilla: e.plantilla }));
}
const allTemplates = () => [...TEMPLATES, ...savedTemplates()];
function renderTemplates() {
  const q = state.tplQ.trim().toLowerCase();
  const list = allTemplates().filter((t) => (!state.tplCat || t.categoria === state.tplCat) && (!q || `${t.nombre} ${t.descripcion}`.toLowerCase().includes(q)));
  const thumb = (t) => `<div class="mk-tpl__thumb">${t.header ? `<div class="mk-tpl__thumbbar" style="background:${BRAND.primary}">MEGAGLASS</div>` : ''}${(t.modules ? t.modules() : []).slice(0, 4).map((m) => `<div class="mk-tpl__line mk-tpl__line--${m.type}"></div>`).join('')}</div>`;
  root.innerHTML = `
    <div class="page-head"><div><button class="link-btn" type="button" data-mk="back">← Volver a Correo</button><h1>Seleccionar plantilla</h1></div><div class="page-head__actions"><button class="btn btn--ghost" type="button" data-mk="blank">Empezar de cero</button></div></div>
    <div class="mk-tpl">
      <aside class="mk-tpl__cats"><button class="mk-tpl__cat${!state.tplCat ? ' is-active' : ''}" type="button" data-cat="">Todas las plantillas</button>${TEMPLATE_CATEGORIES.map((c) => `<button class="mk-tpl__cat${state.tplCat === c ? ' is-active' : ''}" type="button" data-cat="${esc(c)}">${esc(c)} <span class="muted">${allTemplates().filter((t) => t.categoria === c).length}</span></button>`).join('')}</aside>
      <section class="mk-tpl__main">
        <div class="search search--sm mk-tpl__search"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="tpl-q" value="${esc(state.tplQ)}" placeholder="Buscar plantillas" aria-label="Buscar plantillas" /></div>
        <div class="mk-tpl__grid">${list.length ? list.map((t) => `<article class="mk-tpl__card" data-tpl="${esc(t.id)}">${thumb(t)}<h3>${esc(t.nombre)}</h3><p class="muted">${esc(t.categoria)} · ${esc(t.descripcion)}</p><div class="mk-tpl__btns"><button class="btn btn--ghost btn--sm" type="button" data-mk="tpl-preview">Vista previa</button><button class="btn btn--primary btn--sm" type="button" data-mk="tpl-use">Usar plantilla</button></div></article>`).join('') : '<p class="muted">Ninguna plantilla coincide.</p>'}</div>
      </section>
    </div>`;
}
function previewHtml(html, title) {
  modal(title, `<iframe class="mk-preview" title="Vista previa del correo" srcdoc="${esc(html)}"></iframe>`, '<button class="btn btn--ghost" type="button" data-bm="close">Cerrar</button>', { wide: true });
}
function useTemplate(tplId) {
  const t = allTemplates().find((x) => x.id === tplId);
  const base = tplId.startsWith('saved:') ? emailById(tplId.slice(6)) : null;
  const e = createEmail({ nombre: t ? (base ? `${base.nombre} (copia)` : t.nombre) : 'Correo sin título', tipo: state.pendingTipo, plantilla: t && !base ? t.id : 'blank', asunto: base ? base.asunto : '', deNombre: base ? base.deNombre : 'Megaglass', deEmail: base ? base.deEmail : 'hola@megaglass.us', carpeta: base ? base.carpeta : '', destinatarios: base ? { ...base.destinatarios } : { kind: 'all' } });
  if (t && (base || t.modules)) updateEmail(e.id, { contenido: t.modules(), plantilla: base ? base.plantilla : t.id });
  state.id = e.id;
  state.editing = null;
  go('editor');
  toast('Correo creado');
}

// ---------- Editor ----------
const current = () => (state.id ? emailById(state.id) : null);
function scheduleSave() {
  state.saveStatus = 'Guardando…';
  const s = $('mk-savestatus'); if (s) s.textContent = state.saveStatus;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNow, 800);
}
function saveNow() {
  clearTimeout(state.saveTimer);
  const e = current();
  if (!e || !$('mk-name')) return;
  updateEmail(e.id, { nombre: $('mk-name').value.trim() || 'Correo sin título', asunto: $('mk-subject').value, deNombre: $('mk-from-name').value, deEmail: $('mk-from-email').value, destinatarios: destinatariosFromValue($('mk-to').value) });
  const d = new Date();
  state.saveStatus = `Guardado ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const s = $('mk-savestatus'); if (s) s.textContent = state.saveStatus;
}
function moduleForm(m) {
  const p = m.props;
  const f = (prop, label, kind = 'text', extra = '') => `<label class="field"><span>${esc(label)}</span>${kind === 'textarea' ? `<textarea data-prop="${prop}" rows="4">${esc(p[prop] || '')}</textarea>` : `<input data-prop="${prop}" type="${kind}" value="${esc(p[prop] ?? '')}" ${extra} />`}</label>`;
  let fields = '';
  if (m.type === 'text') fields = f('html', 'Texto (admite HTML sencillo: <p>, <h1>, <strong>, <a>)', 'textarea');
  else if (m.type === 'button') fields = f('label', 'Texto del botón') + f('url', 'Enlace', 'url') + `<label class="field"><span>Alineación</span><select data-prop="align">${['left', 'center', 'right'].map((a) => `<option value="${a}" ${p.align === a ? 'selected' : ''}>${{ left: 'Izquierda', center: 'Centro', right: 'Derecha' }[a]}</option>`).join('')}</select></label>`;
  else if (m.type === 'social') fields = f('facebook', 'Facebook', 'url') + f('instagram', 'Instagram', 'url') + f('linkedin', 'LinkedIn', 'url');
  else if (m.type === 'html') fields = f('code', 'Código HTML', 'textarea');
  else if (m.type === 'image') fields = f('src', 'URL de la imagen', 'url') + f('alt', 'Texto alternativo') + f('width', 'Ancho (%)', 'number', 'min="10" max="100"');
  else if (m.type === 'video') fields = f('url', 'URL del video', 'url') + f('caption', 'Texto del enlace');
  else fields = '<p class="muted">Este módulo no tiene opciones.</p>';
  return `<div class="mk-module__form" data-form="${esc(m.id)}">${fields}<div class="mk-module__formfoot"><button class="btn btn--primary btn--sm" type="button" data-mk="done">Listo</button></div></div>`;
}
function renderEditor() {
  const e = current();
  if (!e) { state.view = 'manage'; renderManage(); return; }
  const palette = state.addTab === 'modules'
    ? MODULE_GROUPS.map((g) => `<div class="mk-add__group"><h4>${g}</h4>${Object.entries(MODULE_DEFS).filter(([, d]) => d.group === g).map(([k, d]) => `<button class="mk-mod" type="button" draggable="true" data-mod="${k}" title="Arrastra al lienzo o haz clic para añadir al final"><span class="mk-mod__ico" aria-hidden="true">${d.icon}</span>${d.label}</button>`).join('')}</div>`).join('')
    : `<div class="mk-add__group"><h4>Secciones</h4>${SECTIONS.map((s) => `<button class="mk-mod" type="button" draggable="true" data-section="${s.id}"><span class="mk-mod__ico" aria-hidden="true">☰</span>${s.label}</button>`).join('')}</div>`;
  const zone = (i) => `<div class="mz" data-index="${i}">Soltar contenido aquí</div>`;
  root.innerHTML = `
    <div class="mk-editor">
      <header class="mk-editor__bar">
        <button class="link-btn" type="button" data-mk="back">← Volver</button>
        <input class="mk-editor__name" id="mk-name" value="${esc(e.nombre)}" aria-label="Nombre del correo" />
        <span class="muted mk-editor__status" id="mk-savestatus">${esc(state.saveStatus || 'Guardado')}</span>
        <span class="tag ${e.estado === 'enviado' ? 'tag--done' : 'tag--none'}">${ESTADOS[e.estado]}</span>
        <div class="mk-editor__btns"><button class="btn btn--ghost btn--sm" type="button" data-mk="save">Guardar</button><button class="btn btn--ghost btn--sm" type="button" data-mk="preview">Vista previa y prueba</button><button class="btn btn--primary btn--sm" type="button" data-mk="review">Revisar y enviar</button></div>
      </header>
      <div class="mk-editor__body">
        <aside class="mk-add">
          <h3>Agregar</h3>
          <div class="mk-add__tabs"><button class="mk-add__tab${state.addTab === 'modules' ? ' is-active' : ''}" type="button" data-addtab="modules">Módulos</button><button class="mk-add__tab${state.addTab === 'sections' ? ' is-active' : ''}" type="button" data-addtab="sections">Secciones</button></div>
          <div id="mk-add-list">${palette}</div>
        </aside>
        <section class="mk-canvas-wrap">
          <div class="card mk-head">
            <label class="field"><span>Enviar a</span><select id="mk-to">${recipientOptions().map((o) => `<option value="${esc(o.value)}" ${destinatariosValue(e.destinatarios) === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
            <div class="mk-head__row"><label class="field"><span>De (nombre)</span><input id="mk-from-name" value="${esc(e.deNombre)}" /></label><label class="field"><span>De (correo)</span><input id="mk-from-email" type="email" value="${esc(e.deEmail)}" /></label></div>
            <label class="field"><span>Asunto</span><input id="mk-subject" value="${esc(e.asunto)}" placeholder="Asunto del correo" /></label>
          </div>
          <div class="mk-canvas" id="mk-canvas">
            ${e.plantilla !== 'plain' ? `<div class="mk-canvas__brand" style="background:${BRAND.primary}">MEGAGLASS</div>` : ''}
            ${zone(0)}
            ${(e.contenido || []).map((m, i) => `<div class="mk-module${state.editing === m.id ? ' is-editing' : ''}" data-mid="${esc(m.id)}" draggable="true">
              <div class="mk-module__tools"><span class="mk-module__type">${MODULE_DEFS[m.type] ? MODULE_DEFS[m.type].label : m.type}</span><span><button type="button" data-mv="-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-mv="1" aria-label="Bajar" ${i === e.contenido.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-del aria-label="Quitar módulo">×</button></span></div>
              <div class="mk-module__view">${moduleHtml(m)}</div>
              ${state.editing === m.id ? moduleForm(m) : ''}
            </div>${zone(i + 1)}`).join('')}
            <div class="mk-canvas__footer">${esc(BRAND.address)}<br /><span>Darme de baja</span> · <span>Gestionar preferencias</span></div>
          </div>
        </section>
      </div>
    </div>`;
}
function insertModules(mods, index) {
  const e = current();
  if (!e) return;
  const list = (e.contenido || []).slice();
  const i = Math.max(0, Math.min(Number(index) || 0, list.length));
  list.splice(i, 0, ...mods);
  updateEmail(e.id, { contenido: list });
  state.editing = mods.length === 1 ? mods[0].id : null;
  renderEditor();
}
function moveModule(id, to) {
  const e = current();
  const list = (e.contenido || []).slice();
  const from = list.findIndex((m) => m.id === id);
  if (from < 0) return;
  const [m] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(to > from ? to - 1 : to, list.length)), 0, m);
  updateEmail(e.id, { contenido: list });
  renderEditor();
}
function openPreview() {
  saveNow();
  const e = current();
  modal('Vista previa y prueba', `<iframe class="mk-preview" title="Vista previa del correo" srcdoc="${esc(renderEmailHtml(e))}"></iframe>
    <form class="mk-test" id="mk-test"><label class="field"><span>Enviar un correo de prueba a</span><input name="to" type="email" placeholder="tu@correo.com" required /></label><button class="btn btn--ghost btn--sm" type="submit">Enviar prueba</button></form>
    <p class="muted">La prueba se simula: no sale ningún correo real de esta versión.</p>`, '<button class="btn btn--ghost" type="button" data-bm="close">Cerrar</button>', { wide: true });
}

// ---------- Revisar y enviar ----------
function renderReview() {
  const e = current();
  if (!e) { state.view = 'manage'; renderManage(); return; }
  const items = checklist(e);
  const ok = items.every((c) => c.ok);
  const n = recipientsOf(e).length;
  root.innerHTML = `
    <div class="mk-review">
      <button class="link-btn" type="button" data-mk="back-editor">← Volver al editor</button>
      <h1>Revisar y enviar</h1>
      <p class="muted">${esc(e.nombre)}</p>
      <ul class="mk-check">${items.map((c) => `<li class="mk-check__item${c.ok ? ' is-ok' : ' is-bad'}"><span class="mk-check__ico" aria-hidden="true">${c.ok ? '✓' : '!'}</span><div><strong>${esc(c.label)}</strong><div class="muted">${esc(c.detail)}</div></div></li>`).join('')}</ul>
      <div class="card mk-send">
        <h3 class="card__title">Envío</h3>
        <label class="mk-send__opt"><input type="radio" name="when" value="now" checked /> Enviar ahora</label>
        <label class="mk-send__opt"><input type="radio" name="when" value="later" /> Programar</label>
        <input type="datetime-local" id="mk-when" aria-label="Fecha y hora de envío" disabled />
        <p class="muted">Esta versión no envía correos reales: el correo pasa a «Enviado» con ${n} ${n === 1 ? 'destinatario' : 'destinatarios'}, se registran sus métricas y cada contacto recibe la actividad «Correo de marketing» en su cronología.</p>
        <button class="btn btn--primary" type="button" data-mk="send" ${ok ? '' : 'disabled'}>Enviar ahora</button>
      </div>
    </div>`;
}

// ---------- navigation ----------
function go(view) {
  state.view = view;
  syncUrl();
  render();
}
function render() {
  closeModal();
  if (state.view === 'templates') renderTemplates();
  else if (state.view === 'editor') renderEditor();
  else if (state.view === 'review') renderReview();
  else renderManage();
}

// ---------- events ----------
root.addEventListener('click', (e) => {
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) { const k = sortBtn.dataset.sort; state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'nombre' || k === 'updatedBy' ? 1 : -1) }; renderManage(); return; }
  const viewTab = e.target.closest('[data-view]');
  if (viewTab) { state.view = viewTab.dataset.view; syncUrl(); renderManage(); return; }
  const estado = e.target.closest('[data-estado]');
  if (estado) { state.estado = estado.dataset.estado; syncUrl(); renderManage(); return; }
  const cat = e.target.closest('[data-cat]');
  if (cat) { state.tplCat = cat.dataset.cat; renderTemplates(); return; }
  const addTab = e.target.closest('[data-addtab]');
  if (addTab) { state.addTab = addTab.dataset.addtab; renderEditor(); return; }
  const mod = e.target.closest('.mk-mod');
  if (mod) { const n = (current().contenido || []).length; insertModules(mod.dataset.mod ? [newModule(mod.dataset.mod)] : SECTIONS.find((s) => s.id === mod.dataset.section).build(), n); return; }
  const mv = e.target.closest('[data-mv]');
  if (mv) { const mid = mv.closest('.mk-module').dataset.mid; const list = current().contenido; const i = list.findIndex((m) => m.id === mid); moveModule(mid, i + Number(mv.dataset.mv) + (Number(mv.dataset.mv) > 0 ? 1 : 0)); return; }
  const del = e.target.closest('[data-del]');
  if (del) { const mid = del.closest('.mk-module').dataset.mid; const ce = current(); updateEmail(ce.id, { contenido: ce.contenido.filter((m) => m.id !== mid) }); if (state.editing === mid) state.editing = null; renderEditor(); return; }
  const modEl = e.target.closest('.mk-module');
  if (modEl && !e.target.closest('.mk-module__form') && !e.target.closest('[data-mk]')) { state.editing = state.editing === modEl.dataset.mid ? null : modEl.dataset.mid; renderEditor(); return; }
  const act = e.target.closest('[data-mk]');
  if (!act) return;
  const a = act.dataset.mk;
  const row = act.closest('tr[data-id]');
  const rowId = row ? row.dataset.id : null;
  if (a === 'create') openCreate();
  else if (a === 'method-continue') { const picked = document.querySelector('#mk-modal input[name="tipo"]:checked'); state.pendingTipo = picked ? picked.value : 'normal'; closeModal(); state.tplCat = ''; state.tplQ = ''; go('templates'); }
  else if (a === 'blank') useTemplate('blank');
  else if (a === 'tpl-use') useTemplate(act.closest('[data-tpl]').dataset.tpl);
  else if (a === 'tpl-preview') { const t = allTemplates().find((x) => x.id === act.closest('[data-tpl]').dataset.tpl); previewHtml(renderEmailHtml({ nombre: t.nombre, asunto: t.nombre, plantilla: t.header ? t.id : 'plain', contenido: t.modules() }), t.nombre); }
  else if (a === 'back') { if (state.view === 'editor') saveNow(); state.id = null; go('manage'); }
  else if (a === 'back-editor') go('editor');
  else if (a === 'open' || a === 'edit') { e.preventDefault(); state.id = rowId; state.editing = null; state.saveStatus = ''; go('editor'); }
  else if (a === 'clone') { const c = cloneEmail(rowId); toast(`Correo clonado: ${c.nombre}`); renderManage(); }
  else if (a === 'archive') { const was = emailById(rowId).estado; closeMenus(); archiveEmail(rowId, was !== 'archivado'); toast(was !== 'archivado' ? 'Correo archivado' : 'Correo desarchivado'); renderManage(); }
  else if (a === 'delete') { closeMenus(); const em = emailById(rowId); if (window.confirm(`¿Eliminar «${em.nombre}»? Esta acción no se puede deshacer.`)) { deleteEmail(rowId); toast('Correo eliminado'); renderManage(); } }
  else if (a === 'export') { closeMenus(); const em = emailById(rowId); const cols = ['nombre', 'asunto', 'estado', 'tipo', 'enviados', 'entregados', 'aperturas', 'clics', 'tasaEntrega', 'tasaApertura', 'tasaClics', 'enviadoAt', 'updatedAt', 'updatedBy']; download(`correo-${em.id}.csv`, `${cols.join(';')}\n${cols.map((k) => `"${String(em[k] ?? '').replace(/"/g, '""')}"`).join(';')}`); toast('Exportado a CSV'); }
  else if (a === 'clear-filters') { state.folder = ''; state.tipo = ''; state.by = ''; state.q = ''; renderManage(); }
  else if (a === 'save') { saveNow(); toast('Correo guardado'); }
  else if (a === 'preview') openPreview();
  else if (a === 'review') { saveNow(); go('review'); }
  else if (a === 'done') { state.editing = null; renderEditor(); }
  else if (a === 'send') {
    const later = document.querySelector('input[name="when"][value="later"]').checked;
    const when = later ? $('mk-when').value : '';
    if (later && !when) { toast('Elige la fecha y hora del envío'); return; }
    const sent = sendEmail(state.id, { at: later ? new Date(when).toISOString() : undefined });
    if (!sent) { toast('Revisa la lista: falta algo para enviar'); renderReview(); return; }
    toast(sent.estado === 'programado' ? `Correo programado para ${formatDate(sent.programadoPara)}` : `Correo enviado a ${sent.enviados} ${sent.enviados === 1 ? 'contacto' : 'contactos'}`);
    state.id = null;
    state.estado = sent.estado;
    go('manage');
  }
});
root.addEventListener('change', (e) => {
  if (e.target.id === 'mk-folder') { state.folder = e.target.value; renderManage(); }
  else if (e.target.id === 'mk-tipo') { state.tipo = e.target.value; renderManage(); }
  else if (e.target.id === 'mk-by') { state.by = e.target.value; renderManage(); }
  else if (['mk-to', 'mk-from-name', 'mk-from-email', 'mk-subject', 'mk-name'].includes(e.target.id)) saveNow();
  else if (e.target.name === 'when') { const w = $('mk-when'); w.disabled = e.target.value !== 'later'; const btn = document.querySelector('[data-mk="send"]'); if (btn) btn.textContent = e.target.value === 'later' ? 'Programar' : 'Enviar ahora'; if (!w.disabled && !w.value) { const d = new Date(Date.now() + 3600000); w.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`; } }
  else if (e.target.dataset.prop !== undefined) applyProp(e.target);
});
function applyProp(input) {
  const form = input.closest('[data-form]');
  const ce = current();
  const m = ce && ce.contenido.find((x) => x.id === form.dataset.form);
  if (!m) return;
  m.props[input.dataset.prop] = input.type === 'number' ? Number(input.value) : input.value;
  updateEmail(ce.id, { contenido: ce.contenido });
  const view = form.closest('.mk-module').querySelector('.mk-module__view');
  view.innerHTML = moduleHtml(m);
  state.saveStatus = 'Guardado';
  const s = $('mk-savestatus'); if (s) s.textContent = state.saveStatus;
}
root.addEventListener('input', (e) => {
  if (e.target.id === 'mk-q') { state.q = e.target.value; renderManage(); const q = $('mk-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  else if (e.target.id === 'tpl-q') { state.tplQ = e.target.value; renderTemplates(); const q = $('tpl-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  else if (['mk-to', 'mk-from-name', 'mk-from-email', 'mk-subject', 'mk-name'].includes(e.target.id)) scheduleSave();
  else if (e.target.dataset.prop !== undefined) applyProp(e.target);
});
root.addEventListener('submit', (e) => {
  if (e.target.id === 'mk-test') {
    e.preventDefault();
    const to = e.target.elements.to.value.trim();
    if (sendTest(state.id, to)) toast(`Correo de prueba enviado a ${to} (simulado)`); else toast('Escribe un correo válido');
  }
});
// Drag and drop: palette items and sections into a drop zone; existing modules can be dragged to reorder.
root.addEventListener('dragstart', (e) => {
  const mod = e.target.closest('.mk-mod');
  const modEl = e.target.closest('.mk-module');
  const data = mod ? (mod.dataset.mod ? `mod:${mod.dataset.mod}` : `section:${mod.dataset.section}`) : modEl ? `move:${modEl.dataset.mid}` : '';
  if (!data) return;
  e.dataTransfer.setData('text/plain', data);
  e.dataTransfer.effectAllowed = 'move';
  state.dragging = data;
});
root.addEventListener('dragover', (e) => { const z = e.target.closest('.mz'); if (!z) return; e.preventDefault(); root.querySelectorAll('.mz.is-over').forEach((x) => x.classList.remove('is-over')); z.classList.add('is-over'); });
root.addEventListener('dragleave', (e) => { const z = e.target.closest('.mz'); if (z) z.classList.remove('is-over'); });
root.addEventListener('drop', (e) => {
  const z = e.target.closest('.mz');
  if (!z) return;
  e.preventDefault();
  const data = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || state.dragging || '';
  state.dragging = null;
  const index = Number(z.dataset.index);
  if (data.startsWith('mod:')) insertModules([newModule(data.slice(4))], index);
  else if (data.startsWith('section:')) insertModules(SECTIONS.find((s) => s.id === data.slice(8)).build(), index);
  else if (data.startsWith('move:')) moveModule(data.slice(5), index);
});
render();

export { state, render };

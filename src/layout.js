// Record page layout editor ("Personalizar"): arrange cards in the three columns,
// rename sections and tabs, add cards/sections/tabs, undo/redo, assign teams, save.
import { toast, wireMenus, closeMenus } from './shell.js';
import { cardCatalog, defaultLayout, loadLayout, saveLayout, teamViewLayout, loadViewLayout, saveViewLayout, VIEW_KEY, previewCatalog, defaultPreview, loadPreview, savePreview, PREVIEW_KEY, TEAMS, TYPE_META } from './layout-defaults.js';
import { propertyList } from './properties.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const params = new URLSearchParams(location.search);
const type = TYPE_META[params.get('type')] ? params.get('type') : 'contacts';
const recordId = params.get('id') || '';
const meta = TYPE_META[type];
// preview=1 edits the "Vista previa" side panel of the lists instead of the record page.
const previewMode = params.get('preview') === '1';
const CATALOG = previewMode ? previewCatalog(type) : cardCatalog(type);
// Team views ("Crear vista de equipo" / "Editar vista" in Configuración › Objetos) are edited here too.
const isNewView = params.get('new') === '1';
const viewParam = params.get('view');
const teamView = isNewView || Boolean(viewParam);
let viewName = viewParam || null;
const backHref = previewMode ? `../settings/#obj-${type}:preview` : teamView ? `../settings/#obj-${type}:record` : recordId ? `../${type}/record/?id=${recordId}` : `../${type}/`;
const stampNow = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

let layout = previewMode
  ? (isNewView ? defaultPreview(type, `Nuevo vista previa de registro ${meta.s} - (${stampNow()})`) : loadPreview(type, viewParam || undefined))
  : isNewView ? teamViewLayout(type, `Nuevo página de registro ${meta.s} - (${stampNow()})`) : viewParam ? loadViewLayout(type, viewParam) : loadLayout(type);
let saved = isNewView ? '' : JSON.stringify(layout);
const undoStack = [];
const redoStack = [];
let activeTab = 'overview';
let page = 'design'; // design | config
const root = document.getElementById('layout-root');
document.title = previewMode ? `${meta.s} barra lateral de vista previa` : `${meta.s} página de registro`;

const clone = (o) => JSON.parse(JSON.stringify(o));
function commit(mutator) {
  undoStack.push(clone(layout));
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
  mutator(layout);
  render();
}
const placed = () => new Set([...layout.left, ...layout.right, ...layout.tabs.flatMap((t) => (t.sections || []).flatMap((s) => s.cards))]);
const available = (zone) => Object.entries(CATALOG).filter(([id, c]) => c.zone === zone && !placed().has(id));
const dirty = () => JSON.stringify(layout) !== saved;

// Cards defined inside the view itself (custom property cards of the preview panel) live in layout.cards.
const catalogOf = (id) => CATALOG[id] || (layout.cards && layout.cards[id]) || { label: id, desc: '' };
function cardHtml(id, zone, extra = '') {
  const c = catalogOf(id);
  const isAssoc = Boolean(c.assoc);
  return `
    <div class="lcard" draggable="true" data-card="${id}" data-zone="${zone}" ${extra}>
      <span class="lcard__grip" aria-hidden="true">⋮⋮</span>
      <div class="lcard__text">
        <div class="lcard__title">${esc(c.label)} <span class="info" title="${esc(c.desc)}">ⓘ</span></div>
        <div class="lcard__desc">${esc(c.desc)}</div>
      </div>
      <span class="lcard__tools">
        ${isAssoc || id === 'about' || id === 'insights' || c.props ? `<button class="icon-btn" type="button" data-lc="edit" data-card="${id}" aria-label="Editar">✎</button>` : ''}
        <div class="menu"><button class="icon-btn" type="button" aria-haspopup="true" aria-label="Más">⋯</button>
          <div class="menu__panel menu__panel--right">
            ${zone === 'middle' ? `<button class="menu__item" type="button" data-lc="move-section" data-card="${id}">Mover a otra sección</button>` : ''}
            <button class="menu__item" type="button" data-lc="up" data-card="${id}">Mover arriba</button>
            <button class="menu__item" type="button" data-lc="down" data-card="${id}">Mover abajo</button>
            <div class="menu__sep"></div>
            <button class="menu__item menu__item--danger" type="button" data-lc="remove" data-card="${id}">Eliminar</button>
          </div></div>
      </span>
    </div>`;
}

function addMenu(zone, extraAttr = '') {
  const items = available(zone);
  return `
    <div class="menu ladd">
      <button class="ladd__btn" type="button" aria-haspopup="true" aria-label="Agregar tarjeta">+</button>
      <div class="menu__panel">
        <div class="menu__title">Agregar tarjeta</div>
        ${previewMode ? '<button class="menu__item" type="button" data-lc="pv-new-props">＋ Nueva tarjeta de propiedades…</button><div class="menu__sep"></div>' : ''}
        ${items.length ? items.map(([id, c]) => `<button class="menu__item" type="button" data-lc="add" data-card="${id}" data-zone="${zone}" ${extraAttr}>${esc(c.label)}</button>`).join('') : '<div class="menu__note">Todas las tarjetas de esta columna ya están colocadas.</div>'}
      </div>
    </div>`;
}

function render() {
  const tab = layout.tabs.find((t) => t.id === activeTab) || layout.tabs[0];
  root.innerHTML = `
    <header class="ledit__bar">
      <div class="ledit__left">
        <a class="pill pill--dark" href="${backHref}" data-lc="exit">Salir</a>
        <button class="ledit__hist" type="button" data-lc="undo" ${undoStack.length ? '' : 'disabled'} aria-label="Deshacer">↶</button>
        <button class="ledit__hist" type="button" data-lc="redo" ${redoStack.length ? '' : 'disabled'} aria-label="Rehacer">↷</button>
      </div>
      <div class="ledit__title">${esc(meta.s)} ${previewMode ? 'barra lateral de vista previa' : 'página de registro'} <span class="ledit__sep">|</span> <span id="view-name">${esc(layout.name)}</span> <button class="ledit__pencil" type="button" data-lc="rename-view" aria-label="Cambiar nombre de la vista">✎</button></div>
      <div class="ledit__right">
        <button class="pill pill--dark" type="button" data-lc="save" ${dirty() ? '' : 'disabled'}>Guardar</button>
        <button class="pill pill--light" type="button" data-lc="save-exit">Guardar y salir</button>
      </div>
    </header>
    <div class="ledit__sub">
      <nav class="ledit__tabs">
        ${previewMode ? '' : `<button type="button" class="${page === 'design' ? 'is-active' : ''}" data-lc="page" data-page="design">Editar diseño</button>
        <button type="button" class="${page === 'config' ? 'is-active' : ''}" data-lc="page" data-page="config">Configuración</button>`}
      </nav>
      <div class="ledit__subright">
        <span class="ledit__status ${dirty() ? 'is-dirty' : ''}" title="${dirty() ? 'Cambios sin guardar' : 'Todo guardado'}">${dirty() ? '●' : '✓'}</span>
        ${teamView && !layout.teams.length ? '<span class="ledit__warn tip" tabindex="0"><span aria-hidden="true">⚠</span><span class="tip__text">Esta vista aún no está asignada a ningún equipo: nadie la verá hasta que la asignes.</span></span>' : ''}
        <button class="pill" type="button" data-lc="teams">▣ Asignar equipos${layout.teams.length ? ` (${layout.teams.length})` : ''}</button>
      </div>
    </div>
    ${page === 'config' ? renderConfig() : previewMode ? renderPreviewEditor() : renderDesign(tab)}
    <div class="drawer drawer--modal" id="l-modal" aria-hidden="true">
      <div class="drawer__panel drawer__panel--dialog" role="dialog" aria-labelledby="l-modal-title">
        <div class="drawer__head drawer__head--light"><h2 id="l-modal-title">—</h2><button class="drawer__close" type="button" data-close aria-label="Cerrar">×</button></div>
        <div class="drawer__body" id="l-modal-body"></div>
        <div class="drawer__foot" id="l-modal-foot"></div>
      </div>
    </div>`;
  wireMenus(root);
}

function renderDesign(tab) {
  const fixed = Boolean(tab.fixed);
  return `
    <div class="ledit__cols">
      <section class="ledit__col ledit__col--left">
        <div class="lidentity">
          <div class="lidentity__row"><span class="lidentity__avatar">▣</span><strong>Nombre de ${esc(meta.s)}</strong></div>
          <div class="lidentity__actions">${Array.from({ length: 6 }, () => '<span class="lidentity__dot"></span>').join('')}</div>
        </div>
        <div class="ladd-row">${addMenu('left')}</div>
        <div class="llist" data-zone="left">${layout.left.map((id) => cardHtml(id, 'left')).join('') || '<p class="muted llist__empty">Arrastra aquí una tarjeta.</p>'}</div>
      </section>

      <section class="ledit__col ledit__col--middle">
        <div class="ltabs">
          ${layout.tabs.map((t) => `<div class="menu ltab${t.id === activeTab ? ' is-active' : ''}">
              <button type="button" aria-haspopup="true" data-lc="tab" data-tab="${t.id}">${esc(t.label)} ${t.id === activeTab ? '<span class="caret"></span>' : ''}</button>
              <div class="menu__panel">
                <button class="menu__item" type="button" data-lc="rename-tab" data-tab="${t.id}">Cambiar nombre</button>
                ${t.fixed ? '' : `<button class="menu__item menu__item--danger" type="button" data-lc="remove-tab" data-tab="${t.id}">Eliminar pestaña</button>`}
              </div>
            </div>`).join('')}
          <button class="ltabs__btn" type="button" data-lc="add-tab" aria-label="Agregar pestaña">+</button>
          <button class="ltabs__btn" type="button" data-lc="reorder-tabs" aria-label="Reordenar pestañas">⇄</button>
        </div>
        ${fixed
          ? `<div class="lfixed"><p class="muted">La pestaña <strong>${esc(tab.label)}</strong> tiene contenido fijo (${tab.id === 'description' ? 'la descripción del registro' : tab.id === 'activity' ? 'la cronología de actividades' : 'todas las propiedades'}). Solo puedes cambiarle el nombre.</p></div>`
          : `
        <div class="lfloat">
          <div class="menu"><button type="button" aria-haspopup="true" aria-label="Agregar tarjeta">+</button>
            <div class="menu__panel">
              <div class="menu__title">Agregar tarjeta a "${esc((tab.sections[0] || { title: 'nueva sección' }).title)}"</div>
              ${available('middle').map(([id, c]) => `<button class="menu__item" type="button" data-lc="add" data-card="${id}" data-zone="middle" data-section="0">${esc(c.label)}</button>`).join('') || '<div class="menu__note">No quedan tarjetas disponibles.</div>'}
            </div></div>
          <span class="lfloat__sep"></span>
          <button type="button" data-lc="add-section" aria-label="Agregar sección" title="Agregar sección">⊞</button>
        </div>
        ${(tab.sections || [])
          .map(
            (s, si) => `
          <section class="lsection" data-section="${si}">
            <header class="lsection__head">
              <span class="lcard__grip" aria-hidden="true">⋮⋮</span>
              <h2>${esc(s.title)}</h2>
              <button class="ledit__pencil ledit__pencil--dark" type="button" data-lc="rename-section" data-section="${si}" aria-label="Cambiar nombre">✎</button>
              <button class="lsection__x" type="button" data-lc="remove-section" data-section="${si}" aria-label="Eliminar sección">×</button>
            </header>
            <div class="llist llist--section" data-zone="middle" data-section="${si}">
              ${s.cards.map((id) => cardHtml(id, 'middle', `data-section="${si}"`)).join('') || '<p class="muted llist__empty">Sección vacía: arrastra una tarjeta o usa el botón +.</p>'}
            </div>
          </section>`,
          )
          .join('') || '<p class="muted lfixed">Esta pestaña no tiene secciones. Usa ⊞ para añadir una.</p>'}`}
      </section>

      <section class="ledit__col ledit__col--right">
        <div class="ladd-row ladd-row--top">${addMenu('right')}</div>
        <div class="llist" data-zone="right">${layout.right.map((id) => cardHtml(id, 'right')).join('') || '<p class="muted llist__empty">Arrastra aquí una tarjeta.</p>'}</div>
      </section>
    </div>`;
}

// Preview-panel editor: the card list on the left, a live mock of the side panel on the right.
// Preview-sidebar editor, as in the original: one centred column with the record identity and the cards in order.
function renderPreviewEditor() {
  return `
    <div class="pvedit pvedit--single">
      <section class="ledit__col pvedit__col">
        <div class="lidentity">
          <div class="lidentity__row"><span class="lidentity__avatar">▣</span><strong>Nombre de ${esc(meta.s)}</strong></div>
          <div class="lidentity__actions">${Array.from({ length: 6 }, () => '<span class="lidentity__dot"></span>').join('')}</div>
        </div>
        <div class="ladd-row">${addMenu('right')}</div>
        <div class="llist" data-zone="right">${layout.right.map((id) => cardHtml(id, 'right')).join('') || '<p class="muted llist__empty">Arrastra aquí una tarjeta o añade una con +.</p>'}</div>
      </section>
    </div>`;
}
// Property picker for "Acerca de" (layout.props) or a custom property card (layout.cards[id].props); id === null creates a new card.
function openPropsPicker(id) {
  const all = propertyList(type);
  const isNew = id === null;
  const card = !isNew && id !== 'about' ? layout.cards[id] : null;
  const chosen = isNew ? [] : id === 'about' ? layout.props : (card && card.props) || [];
  const nameField = isNew || card ? `<label class="field"><span>Nombre de la tarjeta</span><input id="l-pp-name" type="text" maxlength="60" value="${esc(card ? card.label : 'Propiedades clave')}" /></label>` : '';
  openModal(isNew ? 'Nueva tarjeta de propiedades' : `Propiedades de "${(catalogOf(id) || {}).label || id}"`, `${nameField}<p class="muted">Marca las propiedades que aparecen en la tarjeta; se muestran en este orden.</p><input class="ginput" type="search" id="l-pp-q" placeholder="Buscar propiedad" /><div class="ocardgrid ocardgrid--modal" id="l-pp">${[...chosen.map((k) => all.find((p) => p.key === k) || { key: k, label: k }), ...all.filter((p) => !chosen.includes(p.key))].slice(0, 400).map((p) => `<label class="ocheck ocheck--sm" data-name="${esc(p.label.toLowerCase())}"><input type="checkbox" value="${esc(p.key)}" ${chosen.includes(p.key) ? 'checked' : ''} /><span>${esc(p.label)}</span></label>`).join('')}</div>`, `<button class="btn btn--primary" type="button" id="l-pp-ok">${isNew ? 'Crear tarjeta' : 'Aplicar'}</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  document.getElementById('l-pp-q').oninput = (ev) => { const q = ev.target.value.trim().toLowerCase(); document.querySelectorAll('#l-pp label').forEach((l) => { l.hidden = Boolean(q) && !l.dataset.name.includes(q); }); };
  document.getElementById('l-pp-ok').onclick = () => {
    const keys = [...document.querySelectorAll('#l-pp input:checked')].map((i) => i.value);
    const nameEl = document.getElementById('l-pp-name');
    const label = nameEl ? nameEl.value.trim() || 'Propiedades' : '';
    commit((l) => {
      if (id === 'about') l.props = keys;
      else if (isNew) { const nid = `pcard-${Date.now().toString(36)}`; l.cards = { ...(l.cards || {}), [nid]: { label, desc: 'Tarjeta de propiedades', zone: 'right', props: keys } }; l.right.push(nid); }
      else { l.cards[id] = { ...l.cards[id], label, props: keys }; }
    });
    closeModal();
    toast(isNew ? `Tarjeta "${label}" añadida al panel` : `${keys.length} propiedades en la tarjeta`);
  };
}

function renderConfig() {
  return `
    <div class="lconfig">
      <h2>Configuración de la vista</h2>
      <label class="field"><span>Nombre de la vista</span><input id="cfg-name" type="text" value="${esc(layout.name)}" maxlength="60" /></label>
      <label class="field"><span>Descripción</span><input id="cfg-desc" type="text" value="${esc(layout.description || '')}" placeholder="Para qué equipo o proceso es esta vista" /></label>
      <fieldset class="field share-field">
        <span>Equipos asignados</span>
        ${TEAMS.map((t) => `<label class="radio"><input type="checkbox" data-team="${esc(t)}" ${layout.teams.includes(t) ? 'checked' : ''} /> <span><strong>${esc(t)}</strong></span></label>`).join('')}
      </fieldset>
      <label class="radio"><input type="checkbox" id="cfg-default" ${layout.isDefault ? 'checked' : ''} /> <span><strong>Vista predeterminada</strong><small>Se muestra a los usuarios sin un equipo asignado.</small></span></label>
      <div class="lconfig__btns"><button class="pill pill--primary" type="button" data-lc="apply-config">Aplicar</button><button class="pill" type="button" data-lc="reset-layout">Restablecer diseño predeterminado</button></div>
    </div>`;
}

// ---------- modal helpers ----------
function openModal(title, body, foot) {
  document.getElementById('l-modal-title').textContent = title;
  document.getElementById('l-modal-body').innerHTML = body;
  document.getElementById('l-modal-foot').innerHTML = foot;
  const m = document.getElementById('l-modal');
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  const first = m.querySelector('input, select');
  if (first) first.focus();
}
function closeModal() {
  const m = document.getElementById('l-modal');
  if (!m) return;
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
}
function promptModal(title, label, value, onOk) {
  openModal(title, `<label class="field"><span>${label}</span><input id="l-prompt" type="text" value="${esc(value)}" maxlength="60" /></label>`, `<button class="btn btn--primary" type="button" id="l-ok">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  const ok = () => { const v = document.getElementById('l-prompt').value.trim(); if (v) onOk(v); closeModal(); };
  document.getElementById('l-ok').onclick = ok;
  document.getElementById('l-prompt').onkeydown = (e) => { if (e.key === 'Enter') ok(); };
}

// ---------- actions ----------
function removeCard(id) {
  layout.left = layout.left.filter((x) => x !== id);
  layout.right = layout.right.filter((x) => x !== id);
  if (layout.cards && layout.cards[id]) delete layout.cards[id];
  layout.tabs.forEach((t) => (t.sections || []).forEach((s) => { s.cards = s.cards.filter((x) => x !== id); }));
}
function listFor(zone, si) {
  if (zone === 'left') return layout.left;
  if (zone === 'right') return layout.right;
  const tab = layout.tabs.find((t) => t.id === activeTab);
  return tab && tab.sections && tab.sections[si] ? tab.sections[si].cards : null;
}
function doSave(exit) {
  if (previewMode) {
    // Preview panel: the default layout feeds the lists' side panel; team views are listed in Configuración.
    if (teamView) {
      const key = `crm:${type}:previewviews`;
      let list = [];
      try { list = JSON.parse(localStorage.getItem(key)) || []; } catch { list = []; }
      if (viewName && viewName !== layout.name) { localStorage.removeItem(PREVIEW_KEY(type, viewName)); list = list.filter((v) => v.name !== viewName); }
      list = list.filter((v) => v.name !== layout.name);
      list.push({ name: layout.name, teams: [...layout.teams], updated: new Date().toISOString(), by: 'Fernando Lovera Colin' });
      localStorage.setItem(key, JSON.stringify(list));
      savePreview(type, layout.name, layout);
      viewName = layout.name;
    } else {
      savePreview(type, null, layout);
      localStorage.setItem(`crm:${type}:preview-updated`, JSON.stringify(new Date().toISOString()));
    }
    saved = JSON.stringify(layout);
    toast(teamView ? 'Vista previa de equipo guardada' : 'Panel de vista previa guardado: ya se usa en la lista');
    if (exit) location.href = backHref;
    else render();
    return;
  }
  if (teamView) {
    // Team view: its own layout plus an entry in the views table of Configuración › Objetos.
    const key = `crm:${type}:recordviews`;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(key)) || []; } catch { list = []; }
    if (viewName && viewName !== layout.name) { localStorage.removeItem(VIEW_KEY(type, viewName)); list = list.filter((v) => v.name !== viewName); }
    list = list.filter((v) => v.name !== layout.name);
    list.push({ name: layout.name, teams: [...layout.teams], updated: new Date().toISOString(), by: 'Fernando Lovera Colin' });
    localStorage.setItem(key, JSON.stringify(list));
    saveViewLayout(type, layout.name, layout);
    viewName = layout.name;
  } else {
    saveLayout(type, layout);
  }
  saved = JSON.stringify(layout);
  toast(teamView ? 'Vista de equipo guardada' : 'Diseño guardado');
  if (exit) location.href = backHref;
  else render();
}

root.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target === document.getElementById('l-modal')) { closeModal(); return; }
  const b = e.target.closest('[data-lc]');
  if (!b) return;
  const a = b.dataset.lc;
  if (a === 'exit') {
    if (dirty() && !window.confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) e.preventDefault();
    return;
  }
  e.preventDefault();
  closeMenus();
  const id = b.dataset.card;
  switch (a) {
    case 'undo': if (undoStack.length) { redoStack.push(clone(layout)); layout = undoStack.pop(); render(); } break;
    case 'redo': if (redoStack.length) { undoStack.push(clone(layout)); layout = redoStack.pop(); render(); } break;
    case 'save': doSave(false); break;
    case 'save-exit': doSave(true); break;
    case 'page': page = b.dataset.page; render(); break;
    case 'tab': activeTab = b.dataset.tab; if (!b.closest('.ltab.is-active')) { closeMenus(); render(); } break;
    case 'rename-view': promptModal('Cambiar nombre de la vista', 'Nombre', layout.name, (v) => commit((l) => { l.name = v; })); break;
    case 'rename-tab': { const t = layout.tabs.find((x) => x.id === b.dataset.tab); promptModal('Cambiar nombre de la pestaña', 'Nombre', t.label, (v) => commit((l) => { l.tabs.find((x) => x.id === t.id).label = v; })); break; }
    case 'remove-tab': commit((l) => { l.tabs = l.tabs.filter((x) => x.id !== b.dataset.tab); }); activeTab = 'overview'; render(); break;
    case 'add-tab': promptModal('Agregar pestaña', 'Nombre de la pestaña', 'Nueva pestaña', (v) => { const nid = `tab${Date.now()}`; commit((l) => { l.tabs.push({ id: nid, label: v, sections: [{ title: 'Nueva sección', cards: [] }] }); }); activeTab = nid; render(); }); break;
    case 'reorder-tabs':
      openModal('Reordenar pestañas', `<ul class="col-list" id="l-tabs">${layout.tabs.map((t) => `<li class="col-item" data-tab="${t.id}"><label>${esc(t.label)}</label><span class="col-item__moves"><button type="button" data-move="-1" aria-label="Subir">▲</button><button type="button" data-move="1" aria-label="Bajar">▼</button></span></li>`).join('')}</ul>`, `<button class="btn btn--primary" type="button" id="l-tabs-ok">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
      document.getElementById('l-tabs').onclick = (ev) => { const mv = ev.target.closest('[data-move]'); if (!mv) return; const li = mv.closest('.col-item'); const sib = Number(mv.dataset.move) < 0 ? li.previousElementSibling : li.nextElementSibling; if (!sib) return; if (Number(mv.dataset.move) < 0) sib.before(li); else sib.after(li); };
      document.getElementById('l-tabs-ok').onclick = () => { const order = [...document.querySelectorAll('#l-tabs .col-item')].map((li) => li.dataset.tab); commit((l) => { l.tabs.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id)); }); closeModal(); };
      break;
    case 'rename-section': { const si = Number(b.dataset.section); const tab = layout.tabs.find((t) => t.id === activeTab); promptModal('Cambiar nombre de la sección', 'Nombre', tab.sections[si].title, (v) => commit((l) => { l.tabs.find((t) => t.id === activeTab).sections[si].title = v; })); break; }
    case 'remove-section': { const si = Number(b.dataset.section); const tab = layout.tabs.find((t) => t.id === activeTab); if (tab.sections[si].cards.length && !window.confirm('La sección tiene tarjetas; se quitarán del diseño. ¿Eliminar?')) return; commit((l) => { l.tabs.find((t) => t.id === activeTab).sections.splice(si, 1); }); break; }
    case 'add-section': promptModal('Agregar sección', 'Nombre de la sección', 'Nueva sección', (v) => commit((l) => { l.tabs.find((t) => t.id === activeTab).sections.push({ title: v, cards: [] }); })); break;
    case 'add': {
      const zone = b.dataset.zone;
      commit((l) => {
        if (zone === 'left') l.left.push(id);
        else if (zone === 'right') l.right.push(id);
        else { const tab = l.tabs.find((t) => t.id === activeTab); if (!tab.sections.length) tab.sections.push({ title: 'Nueva sección', cards: [] }); tab.sections[Number(b.dataset.section) || 0].cards.push(id); }
      });
      break;
    }
    case 'remove': commit(() => removeCard(id)); break;
    case 'up':
    case 'down': {
      const card = b.closest('.lcard');
      const zone = card.dataset.zone;
      const si = Number(card.dataset.section);
      commit((l) => {
        const list = zone === 'left' ? l.left : zone === 'right' ? l.right : l.tabs.find((t) => t.id === activeTab).sections[si].cards;
        const i = list.indexOf(id);
        const j = a === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
      });
      break;
    }
    case 'move-section': {
      const tab = layout.tabs.find((t) => t.id === activeTab);
      openModal('Mover a otra sección', `<label class="field"><span>Sección</span><select id="l-sec">${tab.sections.map((s, i) => `<option value="${i}">${esc(s.title)}</option>`).join('')}</select></label>`, `<button class="btn btn--primary" type="button" id="l-sec-ok">Mover</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
      document.getElementById('l-sec-ok').onclick = () => { const to = Number(document.getElementById('l-sec').value); commit((l) => { removeCard.call(null, id); l.tabs.find((t) => t.id === activeTab).sections[to].cards.push(id); }); closeModal(); };
      break;
    }
    case 'pv-new-props': openPropsPicker(null); break;
    case 'edit': {
      const c = catalogOf(id);
      if (previewMode && c && c.props) { openPropsPicker(id); break; }
      if (c && c.assoc) toast(`Las propiedades de la tarjeta "${c.label}" se editan desde su engranaje en la ficha.`);
      else toast(`Las propiedades de "${c ? c.label : id}" se editan desde su engranaje en la ficha.`);
      break;
    }
    case 'teams':
      openModal('Asignar equipos', `<p class="muted">Los equipos seleccionados verán esta vista en las fichas de ${esc(meta.p.toLowerCase())}.</p><div class="share-field">${TEAMS.map((t) => `<label class="radio"><input type="checkbox" data-team-m="${esc(t)}" ${layout.teams.includes(t) ? 'checked' : ''} /> <span><strong>${esc(t)}</strong></span></label>`).join('')}</div>`, `<button class="btn btn--primary" type="button" id="l-teams-ok">Asignar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
      document.getElementById('l-teams-ok').onclick = () => { const teams = [...document.querySelectorAll('[data-team-m]:checked')].map((x) => x.dataset.teamM); commit((l) => { l.teams = teams; }); closeModal(); toast(`${teams.length} equipo(s) asignado(s)`); };
      break;
    case 'apply-config':
      commit((l) => {
        l.name = document.getElementById('cfg-name').value.trim() || l.name;
        l.description = document.getElementById('cfg-desc').value.trim();
        l.teams = [...document.querySelectorAll('[data-team]:checked')].map((x) => x.dataset.team);
        l.isDefault = document.getElementById('cfg-default').checked;
      });
      toast('Configuración aplicada. Recuerda guardar.');
      break;
    case 'reset-layout':
      if (window.confirm('¿Restablecer el diseño predeterminado? Se perderán los cambios de esta vista.')) commit(() => { layout = previewMode ? defaultPreview(type, layout.name) : defaultLayout(type); });
      break;
    default: break;
  }
});

// ---------- drag & drop between lists ----------
let drag = null;
root.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.lcard');
  if (!card) return;
  drag = { id: card.dataset.card, zone: card.dataset.zone };
  card.classList.add('is-dragging');
  e.dataTransfer.effectAllowed = 'move';
});
root.addEventListener('dragend', () => {
  root.querySelectorAll('.is-dragging, .is-over').forEach((el) => el.classList.remove('is-dragging', 'is-over'));
  drag = null;
});
root.addEventListener('dragover', (e) => {
  const list = e.target.closest('.llist');
  if (!list || !drag) return;
  const zone = list.dataset.zone;
  const cardZone = (CATALOG[drag.id] || {}).zone;
  if (cardZone && cardZone !== zone) return; // cards stay in their own column type
  e.preventDefault();
  root.querySelectorAll('.is-over').forEach((el) => el.classList.remove('is-over'));
  list.classList.add('is-over');
});
root.addEventListener('drop', (e) => {
  const list = e.target.closest('.llist');
  if (!list || !drag) return;
  e.preventDefault();
  const zone = list.dataset.zone;
  const si = Number(list.dataset.section);
  const target = e.target.closest('.lcard');
  const id = drag.id;
  commit((l) => {
    // remove from wherever it was
    l.left = l.left.filter((x) => x !== id);
    l.right = l.right.filter((x) => x !== id);
    l.tabs.forEach((t) => (t.sections || []).forEach((s) => { s.cards = s.cards.filter((x) => x !== id); }));
    const dest = zone === 'left' ? l.left : zone === 'right' ? l.right : l.tabs.find((t) => t.id === activeTab).sections[si].cards;
    const idx = target ? dest.indexOf(target.dataset.card) : -1;
    if (idx >= 0) dest.splice(idx, 0, id);
    else dest.push(id);
  });
  drag = null;
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    const btn = root.querySelector(e.shiftKey ? '[data-lc="redo"]' : '[data-lc="undo"]');
    if (btn && !btn.disabled) btn.click();
  }
  if (e.key === 'Escape') closeModal();
});
window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

render();

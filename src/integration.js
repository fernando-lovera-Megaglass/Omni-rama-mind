// Gestión de datos › Integración de datos: the four ways to bring data in (file import, app sync, transfer,
// Data Hub) and the monitor of imports and synchronisations (file imports, app syncs, Data Studio syncs).
import { undoInfo, confirmUndoImport } from './import-engine.js';
import { boot } from './page.js';
import { wireMenus, closeMenus, toast } from './shell.js';
import { OWNERS, TODAY, formatDate, initials, colorFor, strip } from './data.js';
import { emptyStateHtml } from './empty-state.js';

boot({ root: '../', active: 'data', sub: 'Integración de datos', title: 'Integración de datos' });

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const root = document.getElementById('dint-root');
const ME = 'Fernando L.';
const OBJECTS = [['contacts', 'Contactos'], ['companies', 'Empresas'], ['deals', 'Negocios'], ['tickets', 'Tickets'], ['tasks', 'Tareas']];
const objectLabel = (t) => (OBJECTS.find((o) => o[0] === t) || [t, t])[1];
const daysAgo = (n, h = 10) => { const d = new Date(TODAY.getTime() - n * 86400000); d.setHours(h, (n * 7) % 60, 0, 0); return d.toISOString(); };
const fmtWhen = (iso) => { const d = new Date(iso); return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} CST`; };

// ---------- stored imports, connected apps and chosen columns ----------
const IMPORTS_KEY = 'crm:imports';
const APPS_KEY = 'crm:apps';
const COLS_KEY = 'crm:imports:columns';
// Only the account's real imports (the wizard's history, src/import-engine.js): no sample rows, ever.
const imports = () => { const list = load(IMPORTS_KEY, null); return Array.isArray(list) ? list.filter((r) => r && !r.sample) : []; };
const saveImports = (list) => save(IMPORTS_KEY, list);
const SAMPLE_APPS = [
  { id: 'gmail', name: 'Gmail', kind: 'Correo', object: 'contacts', connected: true, synced: 1284, lastSync: daysAgo(0, 8) },
  { id: 'gcal', name: 'Google Calendar', kind: 'Calendario', object: 'tasks', connected: true, synced: 212, lastSync: daysAgo(0, 7) },
  { id: 'whatsapp', name: 'WhatsApp Business', kind: 'Mensajería', object: 'contacts', connected: true, synced: 640, lastSync: daysAgo(1, 18) },
  { id: 'outlook', name: 'Outlook', kind: 'Correo', object: 'contacts', connected: false, synced: 0, lastSync: '' },
  { id: 'mailchimp', name: 'Mailchimp', kind: 'Marketing', object: 'contacts', connected: false, synced: 0, lastSync: '' },
  { id: 'zapier', name: 'Zapier', kind: 'Automatización', object: 'deals', connected: false, synced: 0, lastSync: '' },
  { id: 'quickbooks', name: 'QuickBooks', kind: 'Facturación', object: 'companies', connected: false, synced: 0, lastSync: '' },
];
const apps = () => { const saved = load(APPS_KEY, null); return saved ? SAMPLE_APPS.map((a) => ({ ...a, ...(saved.find((s) => s.id === a.id) || {}) })) : SAMPLE_APPS.map((a) => ({ ...a })); };
const saveApps = (list) => save(APPS_KEY, list.map(({ id, connected, synced, lastSync }) => ({ id, connected, synced, lastSync })));

const COLUMNS = [
  ['name', 'Nombre de la importación', true], ['state', 'Import State', true], ['newRecords', 'New Records', true], ['updated', 'Registros actualizados', true],
  ['associations', 'New Associations', true], ['errors', 'Errors', true], ['by', 'Creado por ID de usuario', true], ['when', 'Fecha y hora de creación del objeto', true],
  ['object', 'Objeto', false], ['source', 'Fuente de la importación', false], ['system', 'Sistema de la importación', false],
];
const columns = () => load(COLS_KEY, null) || COLUMNS.filter((c) => c[2]).map((c) => c[0]);

const SYSTEMS = [['', 'Todos'], ['file', 'Importación de archivo'], ['paste', 'Datos pegados'], ['api', 'API'], ['mobile', 'Aplicación móvil']];
const SOURCES = [['', 'Todas'], ['xlsx', 'Archivo .xlsx'], ['xls', 'Archivo .xls'], ['csv', 'Archivo .csv'], ['paste', 'Datos pegados'], ['api', 'API']];
// Import states (specification §9): STARTED, PROCESSING, DONE, FAILED, CANCELED, DEFERRED.
const STATE_LABELS = { STARTED: 'Iniciada', PROCESSING: 'Procesando', DONE: 'Listo', FAILED: 'Fallida', CANCELED: 'Cancelada', DEFERRED: 'En cola', done: 'Listo', error: 'Con errores' };
const stateClass = (s) => ({ FAILED: 'dint__dot--error', error: 'dint__dot--error', PROCESSING: 'dint__dot--busy', STARTED: 'dint__dot--busy', DEFERRED: 'dint__dot--wait', CANCELED: 'dint__dot--wait' }[s] || '');
const DATES = [['', 'Cualquier fecha'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['365', 'Este año']];
const systemLabel = (v) => (SYSTEMS.find((s) => s[0] === v) || ['', v])[1];
const sourceLabel = (v) => (SOURCES.find((s) => s[0] === v) || ['', v])[1];

const state = { tab: 'files', q: '', system: '', source: '', by: '', date: '' };
// Coming from "Importar" in a list (as the original does), point at the import card.
const FROM = new URLSearchParams(location.search).get('from');
const FROM_LABELS = { contacts: 'contactos', companies: 'empresas', deals: 'negocios', tickets: 'tickets', tasks: 'tareas' };

const colorOf = (name) => colorFor([...String(name)].reduce((h, c) => h + c.charCodeAt(0), 0));
const avatar = (name) => (name && name !== 'Sin asignar' ? `<span class="dint__who"><span class="avatar avatar--xs" style="background:${colorOf(name)}">${initials(name)}</span>${esc(name)}</span>` : '<span class="muted">—</span>');

// ---------- page ----------
root.innerHTML = `
  <div class="dint__head"><h1>Integración de datos</h1></div>
  <div class="dint__body">
    ${FROM && FROM_LABELS[FROM] ? `<div class="dint__notice" id="dint-notice" role="status"><strong>Importar ${FROM_LABELS[FROM]}:</strong> las importaciones se hacen desde aquí. Elige <em>Importar datos</em> para subir un archivo o pegar datos; abajo verás el historial y el estado de cada importación. <a class="link-btn" href="../${esc(FROM)}/">Volver a ${FROM_LABELS[FROM]}</a></div>` : ''}
    <div class="dint__cards">
      <section class="dint__card${FROM ? ' is-highlight' : ''}">
        <div class="dint__art dint__art--import" aria-hidden="true"><span></span><span></span><span></span></div>
        <h2>Importar un archivo</h2>
        <p>Importación puntual de un archivo directamente al CRM.</p>
        <a class="btn btn--ghost btn--pillx" href="./import/${FROM && FROM_LABELS[FROM] ? `?object=${FROM}` : ''}" data-import-link>Importar datos</a>
      </section>
      <section class="dint__card">
        <div class="dint__art dint__art--sync" aria-hidden="true"><span></span><span></span><span></span></div>
        <h2>Sincronizar desde aplicaciones</h2>
        <p>Mantén los datos sincronizados entre el CRM y aplicaciones externas.</p>
        <button class="btn btn--ghost btn--pillx" type="button" data-act="apps">Conectar una aplicación</button>
      </section>
      <section class="dint__card">
        <div class="dint__art dint__art--transfer" aria-hidden="true"><span></span><span></span><span></span></div>
        <h2>Transfiere tus datos</h2>
        <p>Transfiere tus datos sin problemas con la herramienta de transferencia inteligente. <a href="#" data-act="transfer-info">Más información <span class="ext">↗</span></a></p>
        <button class="btn btn--ghost btn--pillx" type="button" data-act="transfer">Transferir datos</button>
      </section>
      <section class="dint__card">
        <span class="tag tag--beta dint__card-tag">Beta</span>
        <div class="dint__art dint__art--hub" aria-hidden="true"><span></span><span></span><span></span></div>
        <h2>Potencia las campañas</h2>
        <p>Unifica los datos de todas las fuentes y actívalos en cualquier lugar de Omni.</p>
        <button class="btn btn--ghost btn--pillx" type="button" data-act="datahub">Aumentar de nivel a Data Hub <span class="dint__lock" aria-hidden="true">🔒</span></button>
      </section>
    </div>

    <section class="dint__monitor">
      <div class="dint__monitor-head">
        <h2>Monitoriza las importaciones y sincronizaciones</h2>
        <button class="btn btn--ghost btn--pillx" type="button" data-act="apps">Aplicaciones conectadas</button>
      </div>
      <div class="dint__tabs" role="tablist">
        <button class="dint__tab is-active" type="button" role="tab" data-tab="files">Importaciones de archivos</button>
        <button class="dint__tab" type="button" role="tab" data-tab="apps">Sincronizaciones de aplicaciones</button>
        <button class="dint__tab" type="button" role="tab" data-tab="studio">Sincronizaciones de Data Studio</button>
      </div>
      <div id="dint-pane"></div>
    </section>
  </div>
  <div class="drawer drawer--modal" id="dint-modal" aria-hidden="true">
    <div class="drawer__panel drawer__panel--dialog" role="dialog" aria-labelledby="dint-modal-title">
      <div class="drawer__head drawer__head--light"><h2 id="dint-modal-title"></h2><button class="drawer__close" type="button" data-close aria-label="Cerrar">×</button></div>
      <div class="drawer__body" id="dint-modal-body"></div>
      <div class="drawer__foot" id="dint-modal-foot"></div>
    </div>
  </div>`;

const $ = (id) => document.getElementById(id);

function filteredImports() {
  const q = strip(state.q);
  const list = imports();
  return list.filter((r) => {
    if (q && !strip(r.name).includes(q)) return false;
    if (state.system && r.system !== state.system) return false;
    if (state.source && r.source !== state.source) return false;
    if (state.by && r.by !== state.by) return false;
    if (state.date && (TODAY - new Date(r.when)) / 86400000 > Number(state.date)) return false;
    return true;
  }).sort((a, b) => new Date(b.when) - new Date(a.when));
}

const chip = (key, label, current, options) => `
  <div class="menu">
    <button class="qchip" type="button" aria-haspopup="true" aria-expanded="false" data-chip="${key}">${esc(current ? `${label}: ${(options.find((o) => o[0] === current) || [current, current])[1]}` : label)} <span class="caret"></span></button>
    <div class="menu__panel">${options.map(([v, l]) => `<button class="menu__item${current === v ? ' is-current' : ''}" type="button" data-filter="${key}" data-value="${esc(v)}">${esc(l)}</button>`).join('')}</div>
  </div>`;

function cellHtml(key, r) {
  switch (key) {
    case 'name': return `<a class="dint__name" href="./import/?id=${r.id}">${esc(r.name)}</a>`;
    case 'state': return `<span class="dint__state"><span class="dint__dot ${stateClass(r.state)}"></span>${r.undone ? 'Anulada' : STATE_LABELS[r.state] || 'Listo'}</span>`;
    case 'newRecords': return String(r.newRecords);
    case 'updated': return r.updated ? String(r.updated) : '<span class="muted">--</span>';
    case 'associations': return r.associations ? String(r.associations) : '<span class="muted">--</span>';
    case 'errors': return r.errors ? `<a href="./import/?id=${r.id}" title="Ver los errores de esta importación">${r.errors}</a>` : '<span class="muted">--</span>';
    case 'by': return avatar(r.by);
    case 'when': return esc(fmtWhen(r.when));
    case 'object': return esc(objectLabel(r.object));
    case 'source': return esc(sourceLabel(r.source));
    case 'system': return esc(systemLabel(r.system));
    default: return esc(r[key] ?? '');
  }
}

function renderPane() {
  const pane = $('dint-pane');
  document.querySelectorAll('.dint__tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === state.tab));
  if (state.tab === 'files') {
    const cols = columns();
    const rows = filteredImports();
    const people = [...new Set(imports().map((r) => r.by))];
    pane.innerHTML = `
      <div class="dint__filters">
        <div class="dint__chips">
          ${chip('system', 'Sistema de la importación', state.system, SYSTEMS)}
          ${chip('source', 'Fuente de la importación', state.source, SOURCES)}
          ${chip('by', 'Creado por ID de usuario', state.by, [['', 'Todos los usuarios'], ...people.map((p) => [p, p])])}
          ${chip('date', 'Fecha y hora de creación del objeto', state.date, DATES)}
        </div>
        <button class="btn btn--ghost btn--pillx" type="button" data-act="columns">Editar columnas</button>
      </div>
      <div class="search search--sm dint__search"><input type="search" id="dint-q" value="${esc(state.q)}" placeholder="Buscar" aria-label="Buscar importaciones" /><span class="ico ico--search" aria-hidden="true"></span></div>
      <div class="table-wrap dint__tablewrap">
        <table class="table dint__table">
          <thead><tr>${cols.map((k) => `<th>${esc((COLUMNS.find((c) => c[0] === k) || [k, k])[1])}</th>`).join('')}<th>Acciones</th></tr></thead>
          <tbody>${rows.length ? rows.map((r) => `<tr data-id="${r.id}">${cols.map((k) => `<td data-key="${k}">${cellHtml(k, r)}</td>`).join('')}<td><div class="menu"><button class="btn btn--ghost btn--sm" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Acciones de ${esc(r.name)}">Acciones <span class="caret"></span></button><div class="menu__panel"><a class="menu__item" href="./import/?id=${r.id}">Ver detalle</a>${undoInfo(r.id) ? `<button class="menu__item" type="button" data-undo-import="${r.id}">Deshacer importación…</button>` : ''}</div></div></td></tr>`).join('') : `<tr><td colspan="${cols.length + 1}" class="dint__empty">${imports().length
            ? '<span class="muted">No hay importaciones que coincidan con estos filtros.</span>'
            : emptyStateHtml({ art: 'records', compact: true, title: 'Aún no has importado datos', text: 'Las importaciones que hagas aparecerán aquí con su estado, sus recuentos y sus errores. Empieza con Importar datos.', action: { label: 'Importar datos', href: './import/' } })}</td></tr>`}</tbody>
        </table>
      </div>
      <p class="muted dint__count">${rows.length} importación${rows.length === 1 ? '' : 'es'}</p>`;
    wireMenus(pane);
    const q = $('dint-q');
    q.addEventListener('input', () => { state.q = q.value.trim(); const pos = q.selectionStart; renderPane(); const nq = $('dint-q'); nq.focus(); nq.setSelectionRange(pos, pos); });
  } else if (state.tab === 'apps') {
    const list = apps().filter((a) => a.connected);
    pane.innerHTML = list.length
      ? `<div class="table-wrap dint__tablewrap"><table class="table dint__table"><thead><tr><th>Aplicación</th><th>Tipo</th><th>Objeto sincronizado</th><th>Estado</th><th>Registros sincronizados</th><th>Última sincronización</th><th></th></tr></thead>
          <tbody>${list.map((a) => `<tr data-app="${a.id}"><td><strong>${esc(a.name)}</strong></td><td>${esc(a.kind)}</td><td>${esc(objectLabel(a.object))}</td><td><span class="dint__state"><span class="dint__dot"></span>Sincronizando</span></td><td>${a.synced.toLocaleString('en-US')}</td><td>${a.lastSync ? esc(fmtWhen(a.lastSync)) : '<span class="muted">--</span>'}</td><td class="num"><button class="link-btn" type="button" data-sync="${a.id}">Sincronizar ahora</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted dint__empty">Todavía no hay aplicaciones conectadas. Usa "Conectar una aplicación" para empezar.</p>';
  } else {
    pane.innerHTML = `<div class="dint__studio"><span class="tag tag--beta">Beta</span><h3>Sincronizaciones de Data Studio</h3><p class="muted">Data Studio conecta almacenes de datos externos con el CRM. Todavía no hay sincronizaciones configuradas.</p><button class="btn btn--ghost btn--pillx" type="button" data-act="datahub">Aumentar de nivel a Data Hub 🔒</button></div>`;
  }
}

// ---------- modal ----------
function openModal(title, body, foot = '') {
  $('dint-modal-title').textContent = title;
  $('dint-modal-body').innerHTML = body;
  $('dint-modal-foot').innerHTML = foot;
  $('dint-modal').classList.add('is-open');
  $('dint-modal').setAttribute('aria-hidden', 'false');
}
function closeModal() {
  $('dint-modal').classList.remove('is-open');
  $('dint-modal').setAttribute('aria-hidden', 'true');
}

// ---------- connected apps ----------
function openApps() {
  const list = apps();
  openModal(
    'Aplicaciones conectadas',
    `<p class="muted">Conecta aplicaciones para mantener sus datos sincronizados con el CRM.</p>
     <table class="mini-table dint__apps"><thead><tr><th>Aplicación</th><th>Tipo</th><th>Objeto</th><th></th></tr></thead><tbody>
     ${list.map((a) => `<tr><td><strong>${esc(a.name)}</strong>${a.connected ? ' <span class="tag tag--done">Conectada</span>' : ''}</td><td>${esc(a.kind)}</td><td>${esc(objectLabel(a.object))}</td><td class="num"><button class="btn btn--ghost btn--sm" type="button" data-app-toggle="${a.id}">${a.connected ? 'Desconectar' : 'Conectar'}</button></td></tr>`).join('')}
     </tbody></table>`,
    '<button class="btn btn--primary" type="button" data-close>Cerrar</button>',
  );
}
function toggleApp(id) {
  const list = apps();
  const a = list.find((x) => x.id === id);
  if (!a) return;
  a.connected = !a.connected;
  if (a.connected) { a.synced = a.synced || 0; a.lastSync = new Date().toISOString(); }
  saveApps(list);
  toast(a.connected ? `${a.name} conectada: la sincronización ha empezado` : `${a.name} desconectada`);
  openApps();
  renderPane();
}

// ---------- columns ----------
function openColumns() {
  const current = columns();
  openModal(
    'Editar columnas',
    `<div class="dint__cols">${COLUMNS.map(([k, l]) => `<label class="dint__col"><input type="checkbox" data-col="${k}" ${current.includes(k) ? 'checked' : ''} ${k === 'name' ? 'disabled' : ''} /> ${esc(l)}</label>`).join('')}</div>`,
    '<button class="btn btn--primary" type="button" id="cols-apply">Aplicar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>',
  );
  $('cols-apply').addEventListener('click', () => {
    const picked = COLUMNS.map((c) => c[0]).filter((k) => k === 'name' || $('dint-modal-body').querySelector(`[data-col="${k}"]`).checked);
    save(COLS_KEY, picked);
    closeModal();
    renderPane();
    toast(`${picked.length} columnas aplicadas`);
  });
}

// ---------- events ----------
root.addEventListener('click', (e) => {
  const undo = e.target.closest('[data-undo-import]');
  if (undo) { closeMenus(); if (confirmUndoImport(undo.dataset.undoImport)) renderPane(); return; }
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; renderPane(); return; }
  const f = e.target.closest('[data-filter]');
  if (f) { state[f.dataset.filter] = f.dataset.value; closeMenus(); renderPane(); return; }
  // (a row's name and its error count link to the real review page ./import/?id=<id>: no static modals)
  const sync = e.target.closest('[data-sync]');
  if (sync) {
    const list = apps();
    const a = list.find((x) => x.id === sync.dataset.sync);
    a.lastSync = new Date().toISOString();
    a.synced += 3;
    saveApps(list);
    renderPane();
    toast(`${a.name} sincronizada`);
    return;
  }
  const tog = e.target.closest('[data-app-toggle]');
  if (tog) { toggleApp(tog.dataset.appToggle); return; }
  if (e.target.closest('[data-close]') || e.target === $('dint-modal')) { closeModal(); return; }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  e.preventDefault();
  const a = act.dataset.act;
  if (a === 'import') { location.href = `./import/${FROM && FROM_LABELS[FROM] ? `?object=${FROM}` : ''}`; }
  else if (a === 'apps') openApps();
  else if (a === 'columns') openColumns();
  else if (a === 'transfer') toast('La herramienta de transferencia inteligente copia tus datos desde otro CRM. Elige el origen y Omni mapea los campos por ti.');
  else if (a === 'transfer-info') toast('La transferencia inteligente admite archivos de Salesforce, Zoho, Pipedrive y hojas de cálculo.');
  else if (a === 'datahub') toast('Data Hub no está incluido en tu plan. Permite unificar datos de todas las fuentes y activarlos en campañas.');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

wireMenus(root);
renderPane();

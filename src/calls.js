import { openCallDetail } from './call-detail.js';
import { pagination, bindPagination } from './pagination.js';
import { ACT_ICONS } from './action-icons.js';
// CRM › Llamadas: la página de índice de llamadas, copia de la del original — pestaña de vista,
// buscador, filtros rápidos (dirección, asignada a, fecha, duración), tabla con el título, la fecha,
// la duración y el responsable, paginación y exportar. Junta las llamadas reales de Twilio
// (call_logs) con las registradas a mano en las fichas (actividades de tipo "call").
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { allContacts, allActivities, activitiesFor, ensureAllActivities, toCsv, download, dbIsLive, dateCellHtml, getViewStore, setViewStore } from './data.js';
import { supabase } from './supabaseClient.js';
import { displayPhone } from './phone.js';
import { ownerHtml } from './owner.js';
import { emptyStateHtml } from './empty-state.js';
import { openDialer } from './call.js';

boot({ root: '../', active: 'crm', sub: 'Llamadas', title: 'Llamadas' });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STATUS_LABEL = {
  completed: 'Conectado', 'in-progress': 'En curso', ringing: 'Sonando', queued: 'En cola',
  busy: 'Ocupado', 'no-answer': 'Sin respuesta', failed: 'Fallida', canceled: 'Cancelada', initiated: 'Iniciada',
};
const DIRECTION_LABEL = { outbound: 'Saliente', inbound: 'Entrante' };

const COLUMNS = [
  ['title', 'Título de la llamada'], ['owner', 'Actividad asignada a'],
  ['durationSec', 'Duración de la llamada'], ['when', 'Fecha de actividad'],
  ['status', 'Resultado de la llamada'], ['direction', 'Dirección de la llamada'],
  ['number', 'Número'], ['notes', 'Notas'],
];

const DEFAULT_COLUMNS = COLUMNS.slice(0, 6).map(([key]) => key);
const state = {
  columns: [...DEFAULT_COLUMNS],
  sort: { key: 'when', dir: -1 },
  rows: null, // null = todavía cargando
  q: '',
  view: 'all',
  direction: '',
  owner: '',
  dateRange: '',
  duration: '',
  status: '',
  page: 1,
  size: 25,
};

// ---------- saved views (crm:calls:views) ----------
// As on the object indexes: tabs backed by a store in localStorage — the two system views («Todas las
// llamadas», «Llamadas grabadas», never deleted) plus the views the person saves with a name (search, filters,
// sort and columns). The active tab survives navigation; switching tabs applies the view's state at once.
const SYSTEM_VIEWS = [['sys:all', 'Todas las llamadas', 'all'], ['sys:recorded', 'Llamadas grabadas', 'recorded']];
const VIEW_FIELDS = ['base', 'q', 'direction', 'owner', 'dateRange', 'duration', 'status', 'sort', 'columns'];
const blankView = (base) => ({ base, q: '', direction: '', owner: '', dateRange: '', duration: '', status: '', sort: { key: 'when', dir: -1 }, columns: [...DEFAULT_COLUMNS] });
const viewFields = (v) => Object.fromEntries(VIEW_FIELDS.map((k) => [k, v[k]]));
let store = null;
export function viewsStore() {
  if (store) return store;
  const saved = getViewStore('calls');
  const custom = Array.isArray(saved.custom) ? saved.custom : [];
  const system = SYSTEM_VIEWS.map(([id, name, base]) => ({ ...blankView(base), id, name, base, system: true }));
  store = { custom: [...system, ...custom.filter((v) => v && v.id && v.name && !String(v.id).startsWith('sys:')).map((v) => ({ ...blankView('all'), ...v, system: false }))], active: saved.active || 'sys:all' };
  if (!store.custom.some((v) => v.id === store.active)) store.active = 'sys:all';
  return store;
}
const persistViews = () => setViewStore('calls', { custom: viewsStore().custom, active: viewsStore().active });
export const viewById = (id) => viewsStore().custom.find((v) => v.id === id) || null;
export const activeView = () => viewById(viewsStore().active) || viewsStore().custom[0];
const snapshot = () => ({ base: state.view, q: state.q, direction: state.direction, owner: state.owner, dateRange: state.dateRange, duration: state.duration, status: state.status, sort: { ...state.sort }, columns: [...state.columns] });
const isDirty = () => JSON.stringify(viewFields(snapshot())) !== JSON.stringify(viewFields(activeView()));
function applyView(v) {
  state.view = v.base || 'all'; state.q = v.q || ''; state.direction = v.direction || ''; state.owner = v.owner || ''; state.dateRange = v.dateRange || ''; state.duration = v.duration || ''; state.status = v.status || '';
  state.sort = { ...(v.sort && v.sort.key ? v.sort : { key: 'when', dir: -1 }) };
  state.columns = [...(Array.isArray(v.columns) && v.columns.length ? v.columns : DEFAULT_COLUMNS)];
  state.page = 1;
}
export function selectView(id) { const v = viewById(id); if (!v) return false; viewsStore().active = id; applyView(v); persistViews(); return true; }
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
// A new view from the current state (or from another view's saved state when duplicating) becomes the active tab.
export function createView(name, from = snapshot()) {
  const n = String(name || '').trim();
  if (!n) return null;
  const v = { id: uuid(), name: n, system: false, createdAt: new Date().toISOString(), ...viewFields({ ...blankView('all'), ...from }) };
  viewsStore().custom.push(v);
  viewsStore().active = v.id;
  applyView(v);
  persistViews();
  return v;
}
export function renameView(id, name) { const v = viewById(id); const n = String(name || '').trim(); if (!v || v.system || !n) return false; v.name = n; persistViews(); return true; }
export function saveViewChanges(id) { const v = viewById(id); if (!v || v.system) return false; Object.assign(v, viewFields(snapshot())); persistViews(); return true; }
export function deleteView(id) {
  const v = viewById(id);
  if (!v || v.system) return false;
  const s = viewsStore();
  s.custom = s.custom.filter((x) => x.id !== id);
  if (s.active === id) { s.active = 'sys:all'; applyView(viewById('sys:all')); }
  persistViews();
  return true;
}
function viewTabsHtml() {
  const s = viewsStore();
  const dirty = isDirty();
  return `<div class="views calls__viewsbar" id="calls-views"><div class="views__tabs" role="tablist">${s.custom.map((v) => {
    const on = v.id === s.active;
    return `<div class="views__tabwrap${on ? ' is-active' : ''}" data-view="${esc(v.id)}">
      <button class="views__tab${on ? ' is-active' : ''}" role="tab" type="button" aria-selected="${on}" data-view="${esc(v.id)}" title="${esc(v.name)}">${esc(v.name)}${on && dirty ? '<span class="views__dot" title="Cambios sin guardar"></span>' : ''}</button>
      ${on ? `<div class="menu views__menu"><button class="views__caret" type="button" aria-label="Opciones de la vista" aria-haspopup="true" aria-expanded="false"><span class="caret"></span></button><div class="menu__panel">
        <button class="menu__item" type="button" data-calls-view="save" ${v.system || !dirty ? 'disabled' : ''}>Guardar cambios</button>
        <button class="menu__item" type="button" data-calls-view="rename" ${v.system ? 'disabled' : ''}>Cambiar nombre</button>
        <button class="menu__item" type="button" data-calls-view="clone">Duplicar</button>
        <button class="menu__item menu__item--danger" type="button" data-calls-view="delete" ${v.system ? 'disabled' : ''}>Eliminar</button>
      </div></div>` : ''}
    </div>`;
  }).join('')}<button class="views__add views__add--icon" type="button" data-calls-view="add" aria-label="Añadir vista" title="Añadir vista">+</button></div></div>`;
}
// The name dialog (create / duplicate / rename), outside the page root so re-rendering keeps it.
let dialogMode = null;
function ensureViewDialog() {
  if ($('calls-view-dialog')) return;
  const d = document.createElement('div');
  d.className = 'drawer drawer--modal';
  d.id = 'calls-view-dialog';
  d.setAttribute('aria-hidden', 'true');
  d.innerHTML = `<div class="drawer__panel drawer__panel--modal drawer__panel--wide" role="dialog" aria-modal="true" aria-labelledby="calls-view-title">
      <div class="drawer__head drawer__head--light"><h2 id="calls-view-title">Crear vista</h2><button class="drawer__close" type="button" data-close aria-label="Cerrar">×</button></div>
      <form class="drawer__body" id="calls-view-form"><label class="field"><span>Nombre de la vista</span><input name="name" type="text" required maxlength="80" autocomplete="off" /></label><p class="muted" id="calls-view-hint"></p></form>
      <div class="drawer__foot"><button class="btn btn--primary" type="submit" form="calls-view-form" id="calls-view-ok">Crear</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button></div>
    </div>`;
  document.body.appendChild(d);
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) closeViewDialog(); });
  d.querySelector('#calls-view-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    if (!name || !dialogMode) return;
    const { kind, view } = dialogMode;
    if (kind === 'create') { createView(name); toast(`Vista «${name}» creada`); }
    else if (kind === 'clone') { createView(name, viewFields(view)); toast(`Vista «${name}» creada`); }
    else if (kind === 'rename') { renameView(view.id, name); toast('Nombre guardado'); }
    closeViewDialog();
    render();
  });
}
function openViewDialog(kind, view = null) {
  ensureViewDialog();
  dialogMode = { kind, view };
  const d = $('calls-view-dialog');
  d.querySelector('#calls-view-title').textContent = { create: 'Crear vista', clone: 'Duplicar vista', rename: 'Cambiar nombre' }[kind];
  d.querySelector('#calls-view-ok').textContent = kind === 'rename' ? 'Guardar' : 'Crear';
  d.querySelector('#calls-view-hint').textContent = kind === 'create' ? 'Se guardarán la búsqueda, los filtros, el orden y las columnas actuales.' : kind === 'clone' ? `Copia de «${view.name}» con sus mismos filtros, orden y columnas.` : '';
  const input = d.querySelector('[name="name"]');
  input.value = kind === 'clone' ? `Copia de ${view.name}` : kind === 'rename' ? view.name : '';
  d.classList.add('is-open');
  d.setAttribute('aria-hidden', 'false');
  setTimeout(() => { input.focus(); if (input.select) input.select(); }, 30);
}
function closeViewDialog() { const d = $('calls-view-dialog'); if (!d) return; d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true'); dialogMode = null; }

const callFiltersOn = () => Boolean(state.q || state.direction || state.owner || state.dateRange || state.duration || state.status || (state.view && state.view !== 'all'));
function fmtDuration(sec) {
  const s = Number(sec) || 0;
  if (!s) return '—';
  if (s < 60) return `${s} ${s === 1 ? 'segundo' : 'segundos'}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}
const contactName = (id) => {
  const c = allContacts().find((x) => String(x.id) === String(id));
  return c ? c.name : '';
};

// Una fila por llamada, venga de Twilio o del registro manual.
function normalize() {
  const rows = [];
  const records = new Map(allActivities().map((a) => [`${a.recordType}:${a.recordId}`, a]));
  const activities = [...records.values()].flatMap((a) => activitiesFor(a.recordType, a.recordId));
  for (const a of activities.filter((x) => x.type === 'call')) {
    const dirRaw = String((a.extra && a.extra.direction) || '').toLowerCase();
    const direction = (dirRaw.startsWith('sal') || dirRaw === 'outbound') ? 'outbound' : (dirRaw.startsWith('ent') || dirRaw === 'inbound') ? 'inbound' : '';
    const name = contactName(a.recordType === 'contacts' ? a.recordId : '') || ((a.text || '').match(/con (.+?)(?:\s*\(|\.|$)/) || [])[1] || '';
    rows.push({
      id: `log-${a.id}`,
      activity: a,
      title: name ? `Llamada con ${name}` : (a.text || 'Llamada'),
      when: a.when,
      durationSec: Number(a.extra?.durationSec) || (Number(a.extra?.durationMin) || 0) * 60,
      owner: a.who || '',
      direction,
      status: (a.extra && a.extra.outcome) || 'Registrada',
      number: '',
      contactId: a.recordType === 'contacts' ? a.recordId : '',
      source: 'log',
      notes: a.extra?.notes ?? a.text ?? '',
    });
  }
  return rows;
}

async function loadTwilio() {
  if (!dbIsLive() || !supabase) return [];
  try {
    const { data, error } = await supabase.from('call_logs').select('id,call_sid,direction,from_number,to_number,status,duration_sec,started_at,contact_id,recording_url,transcript,extra').order('started_at', { ascending: false }).limit(500);
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => {
      const isOut = r.direction === 'outbound';
      const num = isOut ? r.to_number : r.from_number;
      const name = contactName(r.contact_id);
      return {
        id: `tw-${r.id}`,
        callSid: r.call_sid || '',
        recording: Boolean(r.recording_url),
        transcript: r.transcript || '',
        transcriptError: r.extra?.transcript_error || null,
        title: `Llamada con ${name || displayPhone(num)}`,
        when: r.started_at ? new Date(r.started_at).getTime() : Date.now(),
        durationSec: Number(r.duration_sec) || 0,
        owner: 'Tú',
        direction: r.direction || '',
        status: STATUS_LABEL[r.status] || r.status || '',
        number: displayPhone(num),
        contactId: r.contact_id || '',
        source: 'twilio',
        notes: '',
      };
    });
  } catch { return []; }
}

async function load() {
  state.rows = null;
  render();
  await ensureAllActivities();
  const tw = await loadTwilio();
  state.rows = [...tw, ...normalize()].sort((a, b) => b.when - a.when);
  render();
}

function filtered() {
  const rows = state.rows || [];
  const t = state.q.trim().toLowerCase();
  const now = new Date();
  return rows.filter((r) => {
    if (state.view === 'recorded' && !r.recording) return false;
    if (t && !`${r.title} ${r.number}`.toLowerCase().includes(t)) return false;
    if (state.direction && r.direction !== state.direction) return false;
    if (state.owner && r.owner !== state.owner) return false;
    if (state.status && r.status !== state.status) return false;
    if (state.dateRange) {
      const d = new Date(r.when);
      if (state.dateRange === 'today' && d.toDateString() !== now.toDateString()) return false;
      if (state.dateRange === 'week' && now - d > 7 * 86400000) return false;
      if (state.dateRange === 'month' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
    }
    if (state.duration) {
      const s = r.durationSec;
      if (state.duration === 'lt1' && !(s > 0 && s < 60)) return false;
      if (state.duration === '1-5' && !(s >= 60 && s <= 300)) return false;
      if (state.duration === 'gt5' && !(s > 300)) return false;
    }
    return true;
  }).sort((a, b) => {
    const key = state.sort.key;
    const value = (r) => key === 'direction' ? DIRECTION_LABEL[r[key]] || r[key] : r[key];
    const av = value(a), bv = value(b);
    return state.sort.dir * (typeof av === 'number' && typeof bv === 'number'
      ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), 'es', { numeric: true, sensitivity: 'base' }));
  });
}

function cellHtml(r, key) {
  switch (key) {
    case 'title': return `<span class="calls__call-title">${esc(r.title)}</span>${r.recording ? ' <span class="muted"> · Grabación</span>' : ''}`;
    case 'owner': return `${ownerHtml(r.owner)}`;
    case 'durationSec': return `${esc(fmtDuration(r.durationSec))}`;
    case 'when': return dateCellHtml(r.when); // the table rule: «12 nov 2026», full date-time in the tooltip
    case 'status': return `<span class="tag">${esc(r.status || '—')}</span>`;
    case 'direction': return `${r.direction ? `<span class="calls__direction">${r.direction === 'outbound' ? ACT_ICONS.outbound : ACT_ICONS.inbound} ${DIRECTION_LABEL[r.direction] || esc(r.direction)}</span>` : '—'}`;
    default: return esc(r[key] || '—');
  }
}

function filterChip(id, key, label, options) {
  const value = state[key];
  const activeLabel = options.find(([v]) => v === value)?.[1] || value;
  return `<div class="menu">
    <button id="calls-f-${id}" class="qchip${value ? ' is-set' : ''}" type="button" aria-haspopup="true" aria-expanded="false">${esc(label)}${value ? `: <strong>${esc(activeLabel)}</strong>` : ''} <span class="caret"></span></button>
    <div class="menu__panel" role="menu" aria-labelledby="calls-f-${id}">
      ${[['', 'Todos'], ...options].map(([v, text]) => `<button class="menu__item" type="button" role="menuitemradio" aria-checked="${value === v}" data-call-filter="${key}" data-value="${esc(v)}">${value === v ? '✓ ' : ''}${esc(text)}</button>`).join('')}
    </div>
  </div>`;
}

function render() {
  closeMenus();
  const root = $('calls-root');
  const rows = state.rows;
  const list = rows ? filtered() : [];
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / state.size));
  if (state.page > pages) state.page = pages;
  const slice = list.slice((state.page - 1) * state.size, state.page * state.size);
  const owners = [...new Set((rows || []).map((r) => r.owner).filter(Boolean))].sort();
  const statuses = [...new Set((rows || []).map((r) => r.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  root.innerHTML = `
    <div class="calls">
      <div class="calls__head">
        <h1 class="page-title">Llamadas</h1>
        <div class="calls__head-actions">
          <button class="btn btn--ghost" type="button" id="calls-export" ${total ? '' : 'disabled'}>Exportar</button>
        </div>
      </div>
      ${viewTabsHtml()}
      <div class="calls__toolbar">
        <div class="search search--pill"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="calls-q" placeholder="Buscar ( / )" value="${esc(state.q)}" aria-label="Buscar llamadas" /></div>
        ${filterChip('direction', 'direction', 'Dirección', Object.entries(DIRECTION_LABEL))}
        ${filterChip('owner', 'owner', 'Actividad asignada a', owners.map((o) => [o, o]))}
        ${filterChip('date', 'dateRange', 'Fecha de actividad', [['today', 'Hoy'], ['week', 'Últimos 7 días'], ['month', 'Este mes']])}
        ${filterChip('duration', 'duration', 'Duración de la llamada', [['lt1', 'Menos de 1 minuto'], ['1-5', '1 a 5 minutos'], ['gt5', 'Más de 5 minutos']])}
        ${filterChip('status', 'status', 'Resultado de la llamada', statuses.map((s) => [s, s]))}
      </div>
      ${rows === null
        ? '<p class="muted calls__empty">Cargando llamadas…</p>'
        : slice.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr>
                ${state.columns.map((key) => `<th class="th" aria-sort="${state.sort.key === key ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none'}">
                  <div class="th__inner"><span class="th__label">${COLUMNS.find(([k]) => k === key)[1]}</span>
                    <div class="menu th__menu">
                      <button class="th__more" type="button" aria-label="Opciones de columna: ${COLUMNS.find(([k]) => k === key)[1]}" aria-haspopup="true" aria-expanded="false">⋮</button>
                      <div class="menu__panel thmenu" role="menu">
                        <button class="menu__item" type="button" role="menuitem" data-sort="${key}" data-dir="1">↑ Orden ascendente</button>
                        <button class="menu__item" type="button" role="menuitem" data-sort="${key}" data-dir="-1">↓ Orden descendente</button>
                      </div>
                    </div>
                  </div>
                </th>`).join('')}
                <th class="table__add"><div class="menu">
                  <button class="table__add-btn" type="button" title="Añadir columna" aria-label="Añadir columna" aria-haspopup="true" aria-expanded="false">+</button>
                  <div class="menu__panel menu__panel--right" role="menu">
                    ${COLUMNS.map(([key, label]) => `<button class="menu__item" type="button" role="menuitemcheckbox" aria-checked="${state.columns.includes(key)}" data-column="${key}" ${key === 'title' ? 'disabled' : ''}>${state.columns.includes(key) ? '✓ ' : '+ '}${label}</button>`).join('')}
                  </div>
                </div></th>
              </tr></thead>
              <tbody>
                ${slice.map((r) => `<tr data-callrow="${esc(r.id)}" tabindex="0" aria-label="Abrir ${esc(r.title)}">
                  ${state.columns.map((key) => `<td>${cellHtml(r, key)}</td>`).join('')}<td class="table__add"></td>
                </tr>` ).join('')}
              </tbody>
            </table></div>
            ${pagination({ page: state.page, pages, size: state.size })}
            <p class="muted calls__count">${total.toLocaleString('es-MX')} ${total === 1 ? 'llamada' : 'llamadas'}</p>`
          : `<div class="calls__empty">${emptyStateHtml({ art: 'calls', title: callFiltersOn() ? 'No hay llamadas con estos filtros' : 'Todavía no hay llamadas', text: 'Las llamadas que hagas con el marcador o registres en las fichas aparecen aquí.', action: { label: 'Abrir el marcador', attrs: 'data-calls="dial"' }, secondary: callFiltersOn() ? { label: 'Borrar filtros', attrs: 'data-calls="clear"' } : null })}</div>`}
    </div>`;
  wireMenus(root);
  root.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
    state.sort = { key: button.dataset.sort, dir: Number(button.dataset.dir) };
    state.page = 1;
    render();
  }));
  root.querySelectorAll('[data-column]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.column;
    state.columns = state.columns.includes(key) ? state.columns.filter((k) => k !== key) : [...state.columns, key];
    render();
  }));
  // Keep dropdowns outside the horizontal scroller's clipping area.
  root.querySelectorAll('.table .menu > button').forEach((button) => button.addEventListener('click', () => {
    const panel = button.nextElementSibling;
    if (!button.parentElement.classList.contains('is-open')) return;
    const rect = button.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = `${rect.bottom}px`;
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.right = 'auto';
    panel.style.maxHeight = `${Math.max(120, window.innerHeight - rect.bottom - 8)}px`;
    panel.style.overflowY = 'auto';
  }));
  const wrap = root.querySelector('.table-wrap');
  render._resize?.disconnect();
  if (wrap) {
    const sync = () => {
      wrap.classList.toggle('is-overflowing', wrap.scrollWidth > wrap.clientWidth);
      wrap.classList.toggle('is-scrolled-end', wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 1);
    };
    wrap.addEventListener('scroll', () => { sync(); closeMenus(); });
    if (typeof ResizeObserver !== 'undefined') {
      render._resize = new ResizeObserver(sync);
      render._resize.observe(wrap);
    }
    sync();
  }
  $('calls-q').addEventListener('input', (e) => { state.q = e.target.value; state.page = 1; render(); $('calls-q').focus(); });
  // view tabs: switching applies the view's search, filters, sort and columns at once; the menu of the active tab
  root.querySelectorAll('button.views__tab[data-view]').forEach((b) => b.addEventListener('click', () => { if (selectView(b.dataset.view)) render(); }));
  root.querySelectorAll('[data-calls-view]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.callsView;
    const v = activeView();
    if (a === 'add') openViewDialog('create');
    else if (a === 'rename') { if (!v.system) openViewDialog('rename', v); }
    else if (a === 'clone') openViewDialog('clone', v);
    else if (a === 'save') { if (saveViewChanges(v.id)) { toast('Vista guardada'); render(); } }
    else if (a === 'delete') { if (v.system) { toast('Las vistas del sistema no se pueden eliminar'); return; } if (window.confirm(`¿Eliminar la vista «${v.name}»?`)) { deleteView(v.id); toast('Vista eliminada'); render(); } }
  }));
  root.querySelectorAll('[data-call-filter]').forEach((button) => button.addEventListener('click', () => {
    state[button.dataset.callFilter] = button.dataset.value;
    state.page = 1;
    render();
  }));
  // Empty state actions: open the dialer, or clear the search and the filters.
  root.querySelectorAll('[data-calls]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.calls === 'dial') { openDialer(); return; }
    if (button.dataset.calls === 'clear') { state.q = ''; state.direction = ''; state.owner = ''; state.dateRange = ''; state.duration = ''; state.status = ''; state.view = 'all'; state.page = 1; render(); }
  }));
  bindPagination(root, ({ page, size }) => { state.page = page; if (size) state.size = size; render(); });
  const exp = $('calls-export');
  if (exp) exp.addEventListener('click', () => {
    const rowsOut = filtered().map((r) => ({
      'Título de la llamada': r.title,
      'Dirección': DIRECTION_LABEL[r.direction] || '',
      'Fecha de actividad': new Date(r.when).toISOString(),
      'Duración (segundos)': r.durationSec,
      'Actividad asignada a': r.owner,
      'Resultado de la llamada': r.status,
      'Número': r.number,
    }));
    if (!rowsOut.length) { toast('No hay llamadas que exportar.'); return; }
    download('llamadas.csv', toCsv(rowsOut));
    toast(`${rowsOut.length} ${rowsOut.length === 1 ? 'llamada exportada' : 'llamadas exportadas'}`);
  });
  root.querySelectorAll('[data-callrow]').forEach((tr) => {
    const open = () => {
      const row = state.rows.find((r) => r.id === tr.dataset.callrow);
      openCallDetail(row, { contactName: contactName(row.contactId), duration: fmtDuration(row.durationSec), onSaved: () => {
        state.rows = [...state.rows.filter((r) => r.source !== 'log'), ...normalize()];
        render();
      } });
    };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
  });
  // "/" enfoca el buscador, como en el original.
  if (!render._keys) {
    render._keys = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !document.getElementById('call-detail') && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('calls-q').focus(); }
    });
  }
}

applyView(activeView()); // the tab left open last time, with its filters, sort and columns
load();

export { state, render };

import { openCallDetail } from './call-detail.js';
import { pagination, bindPagination } from './pagination.js';
import { ACT_ICONS } from './action-icons.js';
// CRM › Llamadas: la página de índice de llamadas, copia de la del original — pestaña de vista,
// buscador, filtros rápidos (dirección, asignada a, fecha, duración), tabla con el título, la fecha,
// la duración y el responsable, paginación y exportar. Junta las llamadas reales de Twilio
// (call_logs) con las registradas a mano en las fichas (actividades de tipo "call").
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { allContacts, allActivities, activitiesFor, ensureAllActivities, toCsv, download, dbIsLive, dateCellHtml } from './data.js';
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
const VIEWS = [['all', 'Todas las llamadas'], ['recorded', 'Llamadas grabadas']];

const COLUMNS = [
  ['title', 'Título de la llamada'], ['owner', 'Actividad asignada a'],
  ['durationSec', 'Duración de la llamada'], ['when', 'Fecha de actividad'],
  ['status', 'Resultado de la llamada'], ['direction', 'Dirección de la llamada'],
  ['number', 'Número'], ['notes', 'Notas'],
];

const state = {
  columns: COLUMNS.slice(0, 6).map(([key]) => key),
  sort: { key: 'when', dir: -1 },
  rows: null, // null = todavía cargando
  q: '',
  view: 'all',
  direction: '',
  owner: '',
  dateRange: '',
  duration: '',
  page: 1,
  size: 25,
};

const callFiltersOn = () => Boolean(state.q || state.direction || state.owner || state.dateRange || state.duration || (state.view && state.view !== 'all'));
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
  root.innerHTML = `
    <div class="calls">
      <div class="calls__head">
        <h1 class="page-title">Llamadas</h1>
        <div class="calls__head-actions">
          <button class="btn btn--ghost" type="button" id="calls-export" ${total ? '' : 'disabled'}>Exportar</button>
        </div>
      </div>
      <div class="calls__views">
        ${VIEWS.map(([k, label]) => `<button class="calls__view ${state.view === k ? 'is-active' : ''}" type="button" data-view="${k}">${label}</button>`).join('')}
      </div>
      <div class="calls__toolbar">
        <div class="search search--pill"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="calls-q" placeholder="Buscar ( / )" value="${esc(state.q)}" aria-label="Buscar llamadas" /></div>
        ${filterChip('direction', 'direction', 'Dirección', Object.entries(DIRECTION_LABEL))}
        ${filterChip('owner', 'owner', 'Actividad asignada a', owners.map((o) => [o, o]))}
        ${filterChip('date', 'dateRange', 'Fecha de actividad', [['today', 'Hoy'], ['week', 'Últimos 7 días'], ['month', 'Este mes']])}
        ${filterChip('duration', 'duration', 'Duración de la llamada', [['lt1', 'Menos de 1 minuto'], ['1-5', '1 a 5 minutos'], ['gt5', 'Más de 5 minutos']])}
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
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; state.page = 1; render(); }));
  root.querySelectorAll('[data-call-filter]').forEach((button) => button.addEventListener('click', () => {
    state[button.dataset.callFilter] = button.dataset.value;
    state.page = 1;
    render();
  }));
  // Empty state actions: open the dialer, or clear the search and the filters.
  root.querySelectorAll('[data-calls]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.calls === 'dial') { openDialer(); return; }
    if (button.dataset.calls === 'clear') { state.q = ''; state.direction = ''; state.owner = ''; state.dateRange = ''; state.duration = ''; state.view = 'all'; state.page = 1; render(); }
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
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('calls-q').focus(); }
    });
  }
}

load();

// CRM › Llamadas: la página de índice de llamadas, copia de la del original — pestaña de vista,
// buscador, filtros rápidos (dirección, asignada a, fecha, duración), tabla con el título, la fecha,
// la duración y el responsable, paginación y exportar. Junta las llamadas reales de Twilio
// (call_logs) con las registradas a mano en las fichas (actividades de tipo "call").
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { allContacts, allActivities, OWNERS, toCsv, download, dbIsLive } from './data.js';
import { supabase } from './supabaseClient.js';
import { displayPhone } from './phone.js';
import { ownerHtml } from './owner.js';

boot({ root: '../', active: 'crm', sub: 'Llamadas', title: 'Llamadas' });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STATUS_LABEL = {
  completed: 'Conectado', 'in-progress': 'En curso', ringing: 'Sonando', queued: 'En cola',
  busy: 'Ocupado', 'no-answer': 'Sin respuesta', failed: 'Fallida', canceled: 'Cancelada', initiated: 'Iniciada',
};
const DIRECTION_LABEL = { outbound: 'Saliente', inbound: 'Entrante' };
const PAGE_SIZES = [25, 50, 100];
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
  openTranscripts: new Set(), // filas con la transcripción desplegada
};

function fmtDuration(sec) {
  const s = Number(sec) || 0;
  if (!s) return '—';
  if (s < 60) return `${s} ${s === 1 ? 'segundo' : 'segundos'}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}
function fmtWhen(ts) {
  const d = new Date(ts);
  const today = new Date();
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Hoy a la(s) ${time}`;
  return `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })} ${time}`;
}
const contactName = (id) => {
  const c = allContacts().find((x) => String(x.id) === String(id));
  return c ? c.name : '';
};

// Una fila por llamada, venga de Twilio o del registro manual.
function normalize() {
  const rows = [];
  for (const a of allActivities().filter((x) => x.type === 'call')) {
    const dirRaw = String((a.extra && a.extra.direction) || '').toLowerCase();
    const direction = dirRaw.startsWith('sal') ? 'outbound' : dirRaw.startsWith('ent') ? 'inbound' : '';
    const name = contactName(a.recordType === 'contacts' ? a.recordId : '') || (a.text.match(/con (.+?)(?:\s*\(|\.|$)/) || [])[1] || '';
    rows.push({
      id: `log-${a.recordType}-${a.recordId}-${a.when}`,
      title: name ? `Llamada con ${name}` : (a.text || 'Llamada'),
      when: a.when,
      durationSec: (Number(a.extra && a.extra.durationMin) || 0) * 60,
      owner: a.who || '',
      direction,
      status: (a.extra && a.extra.outcome) || 'Registrada',
      number: '',
      contactId: a.recordType === 'contacts' ? a.recordId : '',
      source: 'log',
      notes: a.text || '',
    });
  }
  return rows;
}

async function loadTwilio() {
  if (!dbIsLive() || !supabase) return [];
  try {
    const { data, error } = await supabase.from('call_logs').select('id,call_sid,direction,from_number,to_number,status,duration_sec,started_at,contact_id,recording_url,transcript').order('started_at', { ascending: false }).limit(500);
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
    case 'title': return `<span class="calls__call-title">${esc(r.title)}</span>${r.recording ? ` <button class="calls-play" type="button" data-play="${esc(r.callSid)}" title="Escuchar la grabación">▶ Grabación</button>` : ''}${r.transcript ? ` <button class="calls-play" type="button" data-transcript="${esc(r.id)}" title="Ver la transcripción">${state.openTranscripts.has(r.id) ? '▾' : '▸'} Transcripción</button>` : r.recording ? ` <button class="calls-play" type="button" data-transcribe="${esc(r.callSid)}" title="Transcribir con IA">Transcribir</button>` : ''}`;
    case 'owner': return `${ownerHtml(r.owner)}`;
    case 'durationSec': return `${esc(fmtDuration(r.durationSec))}`;
    case 'when': return `${esc(fmtWhen(r.when))}`;
    case 'status': return `<span class="tag">${esc(r.status || '—')}</span>`;
    case 'direction': return `${r.direction ? `<span class="calls__direction">${r.direction === 'outbound' ? '↗' : '↙'} ${DIRECTION_LABEL[r.direction] || esc(r.direction)}</span>` : '—'}`;
    default: return esc(r[key] || '—');
  }
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
        <select id="calls-f-direction" class="calls__filter" aria-label="Dirección">
          <option value="">Dirección</option>
          <option value="outbound" ${state.direction === 'outbound' ? 'selected' : ''}>Saliente</option>
          <option value="inbound" ${state.direction === 'inbound' ? 'selected' : ''}>Entrante</option>
        </select>
        <select id="calls-f-owner" class="calls__filter" aria-label="Actividad asignada a">
          <option value="">Actividad asignada a</option>
          ${owners.map((o) => `<option value="${esc(o)}" ${state.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select>
        <select id="calls-f-date" class="calls__filter" aria-label="Fecha de actividad">
          <option value="">Fecha de actividad</option>
          <option value="today" ${state.dateRange === 'today' ? 'selected' : ''}>Hoy</option>
          <option value="week" ${state.dateRange === 'week' ? 'selected' : ''}>Últimos 7 días</option>
          <option value="month" ${state.dateRange === 'month' ? 'selected' : ''}>Este mes</option>
        </select>
        <select id="calls-f-duration" class="calls__filter" aria-label="Duración de la llamada">
          <option value="">Duración de la llamada</option>
          <option value="lt1" ${state.duration === 'lt1' ? 'selected' : ''}>Menos de 1 minuto</option>
          <option value="1-5" ${state.duration === '1-5' ? 'selected' : ''}>1 a 5 minutos</option>
          <option value="gt5" ${state.duration === 'gt5' ? 'selected' : ''}>Más de 5 minutos</option>
        </select>
      </div>
      ${rows === null
        ? '<p class="muted calls__empty">Cargando llamadas…</p>'
        : slice.length
          ? `<div class="table-wrap"><table class="table table--standard">
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
                ${slice.map((r) => `<tr data-callrow="${esc(r.id)}"${r.contactId ? ` data-contact="${esc(r.contactId)}"` : ''}>
                  ${state.columns.map((key) => `<td>${cellHtml(r, key)}</td>`).join('')}<td class="table__add"></td>
                </tr>${r.transcript && state.openTranscripts.has(r.id) ? `<tr class="calls-transcript-row"><td colspan="${state.columns.length + 1}"><div class="calls-transcript"><strong>Transcripción</strong><p>${esc(r.transcript)}</p></div></td></tr>` : ''}`).join('')}
              </tbody>
            </table></div>
            <div class="calls__pager">
              <button class="btn btn--ghost btn--sm" type="button" id="calls-prev" ${state.page <= 1 ? 'disabled' : ''}>‹ Anterior</button>
              <span class="muted">Página ${state.page} de ${pages}</span>
              <button class="btn btn--ghost btn--sm" type="button" id="calls-next" ${state.page >= pages ? 'disabled' : ''}>Siguiente ›</button>
              <select id="calls-size" class="calls__filter" aria-label="Por página">
                ${PAGE_SIZES.map((n) => `<option value="${n}" ${state.size === n ? 'selected' : ''}>${n} por página</option>`).join('')}
              </select>
            </div>
            <p class="muted calls__count">${total.toLocaleString('es-MX')} ${total === 1 ? 'llamada' : 'llamadas'}</p>`
          : '<p class="muted calls__empty">No hay llamadas con estos filtros. Las llamadas que hagas con el marcador o registres en las fichas aparecen aquí.</p>'}
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
  $('calls-f-direction').addEventListener('change', (e) => { state.direction = e.target.value; state.page = 1; render(); });
  $('calls-f-owner').addEventListener('change', (e) => { state.owner = e.target.value; state.page = 1; render(); });
  $('calls-f-date').addEventListener('change', (e) => { state.dateRange = e.target.value; state.page = 1; render(); });
  $('calls-f-duration').addEventListener('change', (e) => { state.duration = e.target.value; state.page = 1; render(); });
  const prev = $('calls-prev'); if (prev) prev.addEventListener('click', () => { state.page -= 1; render(); });
  const next = $('calls-next'); if (next) next.addEventListener('click', () => { state.page += 1; render(); });
  const size = $('calls-size'); if (size) size.addEventListener('change', (e) => { state.size = Number(e.target.value); state.page = 1; render(); });
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
  root.querySelectorAll('[data-contact]').forEach((tr) => tr.addEventListener('click', () => {
    location.href = `../contacts/record/?id=${encodeURIComponent(tr.dataset.contact)}`;
  }));
  root.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    import('./call.js').then((m) => m.playRecording(b, b.dataset.play)).catch(() => {});
  }));
  // Transcripciones: desplegar la que ya existe o pedirla a la IA si hay grabación sin texto.
  root.querySelectorAll('[data-transcript]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.transcript;
    if (state.openTranscripts.has(id)) state.openTranscripts.delete(id); else state.openTranscripts.add(id);
    render();
  }));
  root.querySelectorAll('[data-transcribe]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    b.disabled = true;
    b.textContent = 'Transcribiendo…';
    try {
      const { data, error } = await supabase.functions.invoke('twilio-transcribe', { body: { callSid: b.dataset.transcribe } });
      if (error || (data && data.error)) throw new Error((data && data.error) || (error && error.message) || 'error');
      toast('Transcripción lista');
      const row = (state.rows || []).find((r) => r.callSid === b.dataset.transcribe);
      if (row) { row.transcript = data.transcript || ''; state.openTranscripts.add(row.id); }
      render();
    } catch (err) {
      b.disabled = false;
      b.textContent = 'Transcribir';
      toast(`No se pudo transcribir: ${(err && err.message) || err}`);
    }
  }));
  // "/" enfoca el buscador, como en el original.
  if (!render._keys) {
    render._keys = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('calls-q').focus(); }
    });
  }
}

load();

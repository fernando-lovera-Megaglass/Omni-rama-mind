// Generic object list: views, filter menus, search, sort, paging, selection,
// column editor (full property catalog), advanced filters, CSV export/import, create drawer.
import { wireMenus, closeMenus, toast, linkHtml, wireLinkTooltips } from './shell.js';
import { addRecord, deleteRecords, restoreAll, getPrefs, setPrefs, getViewStore, setViewStore, matches, strip, toCsv, download, formatDate, formatMoney, formatShortDate, relativeTime, setField, TODAY, ALL, OWNERS, TASK_TYPES } from './data.js';
import { segments as allSegments, addSegment, addStaticMembers } from './segments-data.js';
import { defaultTabs, deletedViews, saveDeletedViews } from './std-views.js';
import { propertyGroups, propertyMap } from './properties.js';
import { associationsFor, associationLabelOptions, assocPropertyGroups, assocValueOptions, assocConditionMatches, assocKindGroup, SINGULAR } from './assoc-filters.js';
import { opsFor, kindGroup, evalCondition, conditionValues } from './filter-ops.js';
import { createFilterEditor, newCondition } from './filter-editor.js';
import { countWithConditions } from './filter-query.js';
import { supabase as dbClient } from './supabaseClient.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// Conditional highlighting ("Resaltado condicional" in the column menu): a five-step colour scale from the
// column's highest value (darkest) to its lowest (lightest). Nine colour styles, each derived from a base tone.
export const HL_STYLES = [
  ['purple', '#7f6fe6', 'Morado'], ['green', '#3cb878', 'Verde'], ['yellow', '#e3c340', 'Amarillo'], ['orange', '#f29a5c', 'Naranja'], ['lavender', '#8f8ab5', 'Lavanda'],
  ['peach', '#ef9f72', 'Melocotón'], ['teal', '#3aa99a', 'Turquesa'], ['pink', '#e97fae', 'Rosa'], ['lime', '#8cc152', 'Lima'],
];
const HL_STEPS = [0.62, 0.47, 0.33, 0.2, 0.09]; // share of the base tone: max → min
const mixWhite = (hex, t) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(255 + (c - 255) * t);
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};
export const hlShades = (style) => {
  const base = (HL_STYLES.find((s) => s[0] === style) || HL_STYLES[0])[1];
  return HL_STEPS.map((t) => mixWhite(base, t));
};
const hlStyleName = (style) => (HL_STYLES.find((s) => s[0] === style) || HL_STYLES[0])[2];
// Older rules ({ op, value, color }) become a scale of the nearest style.
function normalizeHighlights(h) {
  const out = {};
  Object.entries(h || {}).forEach(([k, v]) => {
    if (!v) return;
    const style = HL_STYLES.some((s) => s[0] === v.style) ? v.style : HL_STYLES.some((s) => s[0] === v.color) ? v.color : 'purple';
    out[k] = { style };
  });
  return out;
}

export function mountList(cfg) {
  const root = document.getElementById('list-root');
  const prefs = getPrefs(cfg.type);
  const groups = propertyGroups(cfg.type);
  const props = propertyMap(cfg.type);
  // Account-wide defaults set in Configuración › Objetos › Personalización del índice (columns and quick filters).
  const adminJson = (what) => { try { const s = JSON.parse(localStorage.getItem(`crm:${cfg.type}:${what}`)); return Array.isArray(s) && s.length ? s : null; } catch { return null; } };
  const adminColumns = (adminJson('defaultcolumns') || []).filter((k) => cfg.columns.some((c) => c.key === k) || props[k]);
  const defaultColumns = adminColumns.length ? adminColumns : cfg.columns.filter((c) => c.default !== false).map((c) => c.key);
  const adminFilters = adminJson('quickfilters');
  if (adminFilters) {
    const rows = cfg.rows();
    const made = adminFilters
      .map((k) => cfg.filters.find((f) => f.key === k) || (props[k] ? { key: k, label: props[k].label, options: [...new Set(rows.map((r) => r[k]).filter((v) => v !== undefined && v !== null && v !== ''))].slice(0, 10).map((v) => [String(v), String(v)]), test: (r, v) => String(r[k]) === v } : null))
      .filter(Boolean);
    if (made.length) cfg.filters = made;
  }

  const SHARE_LABEL = { private: 'Privada', team: 'Mi equipo', all: 'Todos' };
  const ME = 'Fernando L.';
  let store = getViewStore(cfg.type);

  const state = {
    viewId: null,
    base: cfg.views[0].key,
    q: '',
    filters: {},
    advanced: [],
    sort: cfg.defaultSort || { key: 'created', dir: -1 },
    page: 1,
    size: prefs.size || 25,
    selected: new Set(),
    expanded: new Set(),
    previewId: null,
    mode: cfg.board ? prefs.mode || 'table' : 'table',
    showFilters: prefs.showFilters !== false,
    columns: prefs.columns || defaultColumns,
    widths: prefs.widths || {},
    frozen: (prefs.frozenCount ?? (prefs.frozen ? 1 : 0)) > 0,
    // Columns kept on the left while scrolling sideways (0 = none); "Inmovilizar columna" freezes up to that column.
    frozenCount: prefs.frozenCount ?? (prefs.frozen ? 1 : 0),
    // Conditional highlighting per column from the header menu: { style } (a colour scale, see HL_STYLES).
    highlights: normalizeHighlights(prefs.highlights),
    // Row density from the gear menu ("Ver configuración"): 'comfortable' (48 px rows) or 'compact' (36 px rows).
    density: prefs.density === 'compact' ? 'compact' : 'comfortable',
    // Zebra striping (alternate rows tinted), also from the gear menu.
    zebra: prefs.zebra === true,
    // "Mostrar métricas" in the gear menu: the summary tiles above the table (null = follow the account setting).
    metrics: typeof prefs.metrics === 'boolean' ? prefs.metrics : null,
    boardCollapsed: new Set(prefs.boardCollapsed || []),
    boardOrder: prefs.boardOrder || null,
    pipeline: cfg.pipeline ? prefs.pipeline || '' : '',
  };
  let pipelineQuery = '';
  const layoutHistory = [];
  function setFrozenCount(n) {
    state.frozenCount = Math.max(0, Math.min(Number(n) || 0, state.columns.length));
    state.frozen = state.frozenCount > 0;
    setPrefs(cfg.type, { frozen: state.frozen, frozenCount: state.frozenCount });
  }
  // Conditional highlighting ("Editar resaltado condicional" in the column menu): header tint = lightest shade.
  const hlHeader = (key) => (state.highlights[key] ? hlShades(state.highlights[key].style)[4] : '');
  const DEFAULT_W = 190;
  const FIRST_W = 280;
  const MIN_W = 80;
  // Default width by what the column holds, so e-mails, names and phones are readable at once.
  function naturalWidth(key, i) {
    if (i === 0) return FIRST_W;
    if (cfg.defaultWidths && cfg.defaultWidths[key]) return cfg.defaultWidths[key];
    const p = props[key];
    const kind = p ? p.kind : '';
    if (kind === 'email' || key === 'email' || key === 'alt_email') return 270;
    if (kind === 'url' || key === 'domain' || key === 'website') return 240;
    if (kind === 'phone') return 200;
    if (kind === 'date' || kind === 'datetime') return 180;
    if (['number', 'currency', 'percent', 'id', 'bool'].includes(kind)) return 160;
    if (key === 'description' || key === 'message') return 320;
    if (/company|empresa|assoc/.test(key)) return 240;
    if (kind === 'user' || key === 'owner') return 220;
    return DEFAULT_W;
  }
  const widthOf = (key, i) => state.widths[key] || naturalWidth(key, i);
  // When the columns don't fill the table area, the last column takes the spare room (display only).
  function fitColumns() {
    const wrapEl = $('table-wrap');
    const colsEl = [...$('colgroup').querySelectorAll('col[data-key]')];
    if (!wrapEl || !colsEl.length) return;
    colsEl.forEach((c, i) => { c.style.width = `${widthOf(c.dataset.key, i)}px`; });
    const base = 48 + 44 + colsEl.reduce((s, c, i) => s + widthOf(c.dataset.key, i), 0);
    const avail = wrapEl.clientWidth;
    const last = colsEl[colsEl.length - 1];
    if (avail > base) last.style.width = `${widthOf(last.dataset.key, colsEl.length - 1) + (avail - base)}px`;
    table.style.width = `${Math.max(base, avail)}px`;
    wrapEl.classList.toggle('is-overflowing', base > avail);
  }
  function pushLayout() {
    layoutHistory.push({ columns: state.columns.slice(), widths: { ...state.widths } });
    if (layoutHistory.length > 30) layoutHistory.shift();
  }

  // A column is either configured explicitly or derived from the property catalog.
  function col(key) {
    const explicit = cfg.columns.find((c) => c.key === key);
    if (explicit) return explicit;
    const p = props[key];
    if (!p) return null;
    const text = (r) => {
      const v = r[key];
      if (v === undefined || v === null || v === '') return '';
      if (p.kind === 'currency') return formatMoney(v, key === 'amount' ? r.deal_currency_code : undefined);
      if (p.kind === 'percent') return `${v} %`;
      if (p.kind === 'date' || p.kind === 'datetime') return formatDate(v);
      return String(v);
    };
    const sortValue = (r) => {
      const v = r[key];
      if (p.kind === 'date' || p.kind === 'datetime') return v ? new Date(v).getTime() : 0;
      if (['number', 'currency', 'percent', 'id'].includes(p.kind)) return Number(v) || 0;
      return String(v ?? '');
    };
    const render = ['url', 'email', 'phone'].includes(p.kind)
      ? (r) => (r[key] ? linkHtml(p.kind, String(r[key])) : '<span class="muted">—</span>')
      : p.kind === 'user'
        ? (r) => ownerHtml(r[key])
        : (r) => (text(r) === '' ? '<span class="muted">—</span>' : esc(text(r)));
    return { key, label: p.label, text, sortValue, render };
  }
  const labelOf = (key) => (col(key) || { label: key }).label;
  const visibleColumns = () => state.columns.map(col).filter(Boolean);
  const cellText = (c, r) => (c.text ? c.text(r) : r[c.key] ?? '');
  // Web addresses, e-mails and phones open from the table (teal link, external icon, tooltip with the full address).
  const PHONE_KEYS = new Set(['phone', 'mobilephone', 'alt_phone', 'fax', 'hs_whatsapp_phone_number']);
  function kindForLink(key) {
    const p = props[key];
    if (p && ['url', 'email', 'phone'].includes(p.kind)) return p.kind;
    if (key === 'email' || key === 'alt_email') return 'email';
    if (PHONE_KEYS.has(key)) return 'phone';
    if (key === 'domain' || key === 'website') return 'url';
    return '';
  }
  const cellHtml = (c, r) => {
    if (c.render) return c.render(r);
    const k = kindForLink(c.key);
    const v = r[c.key];
    if (k && v !== undefined && v !== null && v !== '') return linkHtml(k, String(v));
    return esc(cellText(c, r));
  };
  // The number a cell counts as on the colour scale: sort value (numbers, money, dates as timestamps) or nothing.
  const NUMERIC_KINDS = new Set(['number', 'currency', 'percent', 'id', 'date', 'datetime']);
  function numericOf(c, r) {
    const raw = r[c.key];
    if (raw === undefined || raw === null || raw === '') return null;
    if (c.sortValue) {
      const v = c.sortValue(r);
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    }
    if (typeof raw === 'number') return raw;
    const p = props[c.key];
    if (p && NUMERIC_KINDS.has(p.kind)) {
      const v = p.kind === 'date' || p.kind === 'datetime' ? new Date(raw).getTime() : Number(String(raw).replace(/[^\d.-]/g, ''));
      return Number.isNaN(v) ? null : v;
    }
    return null;
  }
  // Min/max of one column over all the rows of the view ("todos los datos de esta columna").
  function columnStats(list, c) {
    let min = Infinity;
    let max = -Infinity;
    let n = 0;
    list.forEach((r) => {
      const v = numericOf(c, r);
      if (v === null) return;
      n += 1;
      if (v < min) min = v;
      if (v > max) max = v;
    });
    return { min, max, numeric: n > 0 };
  }
  function highlightStats(list, cols) {
    const stats = {};
    cols.forEach((c) => {
      if (state.highlights[c.key]) stats[c.key] = columnStats(list, c);
    });
    return stats;
  }
  // Background of a cell: step 0 (darkest) for the highest value … step 4 (lightest) for the lowest;
  // columns without numbers get the middle shade on every filled cell.
  function hlCell(c, r, stats) {
    const h = state.highlights[c.key];
    if (!h) return '';
    const txt = String(cellText(c, r) ?? '');
    if (txt === '' || txt === '—' || txt === '--') return '';
    const shades = hlShades(h.style);
    const s = stats[c.key];
    if (!s || !s.numeric) return shades[2];
    const v = numericOf(c, r);
    if (v === null) return '';
    if (s.max === s.min) return shades[2];
    const t = (v - s.min) / (s.max - s.min);
    return shades[4 - Math.min(4, Math.max(0, Math.floor(t * 5)))];
  }
  const allKeys = () => {
    const seen = new Set();
    const out = [];
    groups.forEach((grp) => grp.items.forEach(([k]) => { if (!seen.has(k)) { seen.add(k); out.push(k); } }));
    cfg.columns.forEach((c) => { if (!seen.has(c.key)) { seen.add(c.key); out.push(c.key); } });
    return out;
  };

  const OBJECTS = [['contacts', 'Contactos'], ['companies', 'Empresas'], ['deals', 'Negocios'], ['tickets', 'Tickets'], ['tasks', 'Tareas']];
  const plural = cfg.plural || cfg.title.toLowerCase();
  // Bulk bar wording and actions (contacts add "Crear tareas" and "Agregar a segmento").
  const bulkNoun = { singular: (cfg.bulk && cfg.bulk.singular) || (cfg.singular || cfg.title).toLowerCase(), plural: (cfg.bulk && cfg.bulk.plural) || plural };
  const bulkActions = (cfg.bulk && cfg.bulk.actions) || ['assign', 'edit', 'delete', 'export'];
  const bulkFem = cfg.bulk && cfg.bulk.feminine !== undefined ? cfg.bulk.feminine : /a$/.test(bulkNoun.singular); // "empresa seleccionada"
  const bulkWord = (n, word) => `${word}${bulkFem ? 'a' : 'o'}${n === 1 ? '' : 's'}`; // seleccionado(s) / eliminada(s)…
  const bulkN = (n) => `${n} ${n === 1 ? bulkNoun.singular : bulkNoun.plural}`;

  root.innerHTML = `
    <div class="lpage">
    <div class="page-head page-head--list">
      <div class="menu">
        <button class="ltitle" type="button" aria-haspopup="true" aria-expanded="false"><h1>${cfg.title}</h1> <span class="caret caret--lg"></span></button>
        <div class="menu__panel">
          ${OBJECTS.map(([k, l]) => `<a class="menu__item${k === cfg.type ? ' is-current' : ''}" href="../${k}/">${l}</a>`).join('')}
        </div>
      </div>
      <div class="page-head__actions">
        <div class="menu">
          <button class="icon-btn icon-btn--round" type="button" aria-label="Más opciones" aria-haspopup="true">⋮</button>
          <div class="menu__panel menu__panel--right">
            <button class="menu__item" type="button" data-action="columns">Editar columnas</button>
            <button class="menu__item" type="button" data-action="export">Exportar vista</button>
            <a class="menu__item" href="../data/?from=${cfg.type}">Importar</a>
            <button class="menu__item" type="button" data-action="restore">Restaurar registros eliminados</button>
          </div>
        </div>
        ${cfg.addDirect
          ? `<button class="btn btn--primary btn--pillx" type="button" data-action="create">${cfg.addLabel || `Agregar ${plural}`}</button>`
          : `<div class="menu">
          <button class="btn btn--primary btn--pillx" type="button" aria-haspopup="true" aria-expanded="false">${cfg.addLabel || `Agregar ${plural}`} <span class="caret"></span></button>
          <div class="menu__panel menu__panel--right">
            <button class="menu__item" type="button" data-action="create">${cfg.createLabel}</button>
            <a class="menu__item" href="../data/?from=${cfg.type}">Importar desde un archivo</a>
          </div>
        </div>`}
      </div>
    </div>

    <div class="views" id="views-bar"></div>

    <div class="panel panel--list">
      <div class="view-dirty" id="view-dirty" hidden>
        <span class="view-dirty__text">Has cambiado los filtros o las columnas de esta vista.</span>
        <span class="view-dirty__btns">
          <button class="btn btn--primary btn--sm" type="button" data-action="view-save" id="view-save-btn">Guardar vista</button>
          <button class="btn btn--ghost btn--sm" type="button" data-action="view-saveas">Guardar como nueva</button>
          <button class="link-btn" type="button" data-action="view-discard">Descartar cambios</button>
        </span>
      </div>

      <div class="ltoolbar">
        <div class="ltoolbar__left">
          <div class="search search--pill">
            <span class="ico ico--search" aria-hidden="true"></span>
            <input id="row-search" type="search" placeholder="Buscar ( / )" aria-label="Buscar" />
          </div>
          <button class="pill" type="button" data-action="toggle-filters" id="filter-pill"><span class="ico ico--filter"></span> Filtro</button>
          <div class="menu">
            <button class="pill" type="button" aria-haspopup="true" aria-expanded="false" id="sort-pill">⇅ Ordenar por</button>
            <div class="menu__panel" id="sort-menu"></div>
          </div>
        </div>
        <div class="ltoolbar__right">
          ${cfg.extraActions || ''}
          ${
            cfg.pipeline
              ? `<div class="menu menu--pipeline" id="pipeline-wrap">
                  <button class="pill pill--pipeline" type="button" id="pipeline-pill" aria-haspopup="true" aria-expanded="false"><span id="pipeline-label">Todos los pipelines</span> <span class="caret"></span></button>
                  <div class="menu__panel menu__panel--right pmenu" id="pipeline-menu">
                    <div class="pmenu__search"><input type="search" id="pipeline-q" placeholder="Buscar" aria-label="Buscar pipeline" autocomplete="off" /><span class="ico ico--search" aria-hidden="true"></span></div>
                    <div class="pmenu__list" id="pipeline-items"></div>
                    <div class="pmenu__foot"><a href="${cfg.pipeline.manageHref || '#'}">Administrar pipelines ↗</a></div>
                  </div>
                </div>`
              : ''
          }
          ${
            cfg.board
              ? `<span class="seg seg--icons" role="group" aria-label="Modo de vista">
                  <button class="seg__btn tip" type="button" data-action="mode-board" aria-label="Vista de panel"><span class="ico ico--board"></span><span class="tip__text">Vista de panel</span></button>
                  <button class="seg__btn tip" type="button" data-action="mode-table" aria-label="Vista de tabla"><span class="ico ico--grid"></span><span class="tip__text">Vista de tabla</span></button>
                </span>`
              : ''
          }
          <div class="menu menu--vsettings" id="vsettings">
            <button class="icon-btn icon-btn--round icon-btn--ico tip" type="button" aria-label="Ver configuración" aria-haspopup="true" aria-expanded="false" id="vsettings-btn"><span class="ico ico--gear"></span><span class="tip__text">Ver configuración</span></button>
            <div class="menu__panel menu__panel--right vsmenu" id="vsettings-menu" role="menu"></div>
          </div>
          <button class="icon-btn icon-btn--round tip" type="button" data-action="toggle-filters" aria-label="Mostrar u ocultar filtros" id="collapse-btn"><span id="collapse-ico">︿</span><span class="tip__text" id="collapse-tip">Ocultar filtros</span></button>
        </div>
      </div>

      <div class="quickbar" id="quickbar">
        <div class="quickbar__left" id="filter-bar">
          ${cfg.filters
            .map(
              (f) => `
            <div class="menu">
              <button class="qchip" type="button" data-filter="${f.key}" data-label="${esc(f.label)}" aria-haspopup="true">${f.label} <span class="caret"></span></button>
              <div class="menu__panel">
                <button class="menu__item" type="button" data-filter="${f.key}" data-value="">Todos</button>
                ${f.options.map(([v, l]) => `<button class="menu__item" type="button" data-filter="${f.key}" data-value="${esc(v)}">${l}</button>`).join('')}
              </div>
            </div>`,
            )
            .join('')}
          <button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-action="advanced" aria-label="Añadir filtro" title="Añadir filtro">+</button>
          <button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-action="edit-quick" aria-label="Editar filtros rápidos" title="Editar filtros rápidos">✎</button>
          <span class="pill pill--adv" id="adv-pill" hidden><button type="button" data-action="advanced"><span class="ico ico--filter"></span> Filtros avanzados <span class="badge" id="adv-count">0</span></button><button type="button" data-action="adv-clear-all" aria-label="Quitar filtros avanzados">×</button></span>
          <button class="link-btn" type="button" id="filters-clear-all" data-action="filters-clear-all" hidden>Borrar todo</button>
        </div>
      </div>

      ${cfg.summary ? `<div class="kpis" id="kpis"><button class="kpis__nav" type="button" data-action="kpis-prev" aria-label="Anterior">‹</button><div class="kpis__track" id="kpis-track"></div><button class="kpis__nav" type="button" data-action="kpis-next" aria-label="Siguiente">›</button></div>` : ''}

      <div class="bulk" id="bulk" hidden>
        <span class="bulk__count" id="bulk-count">0 seleccionados</span>
        <button class="bulk__clear" type="button" data-action="bulk-clear" aria-label="Limpiar selección" title="Limpiar selección">×</button>
        <span class="bulk__actions">
          ${bulkActions.includes('assign') ? '<button class="bulk__btn" type="button" data-action="bulk-assign"><span aria-hidden="true">→</span> Asignar</button>' : ''}
          ${bulkActions.includes('edit') ? '<button class="bulk__btn" type="button" data-action="bulk-edit"><span aria-hidden="true">✎</span> Editar</button>' : ''}
          ${bulkActions.includes('delete') ? '<button class="bulk__btn" type="button" data-action="delete"><span aria-hidden="true">🗑</span> Eliminar</button>' : ''}
          ${bulkActions.includes('tasks') ? '<button class="bulk__btn" type="button" data-action="bulk-tasks"><span aria-hidden="true">+</span> Crear tareas</button>' : ''}
          ${bulkActions.includes('segment') ? '<button class="bulk__btn" type="button" data-action="bulk-segment"><span aria-hidden="true">≡</span> Agregar a segmento</button>' : ''}
          ${bulkActions.includes('export') ? '<button class="bulk__btn" type="button" data-action="bulk-export"><span aria-hidden="true">↧</span> Exportar</button>' : ''}
        </span>
        <span class="bulk__all" id="bulk-all" hidden></span>
      </div>

      <div class="table-wrap" id="table-wrap">
        <table class="table table--fixed" id="table">
          <colgroup id="colgroup"></colgroup>
          <thead><tr id="head-row"></tr></thead>
          <tbody id="rows"></tbody>
        </table>
        <div class="col-guide" id="col-guide" hidden></div>
        <div class="col-ghost" id="col-ghost" hidden></div>
      </div>
      <div class="kanban" id="kanban" hidden></div>
      <div class="table-wrap-tail">
        <p class="empty" id="empty" hidden>No hay registros que coincidan con los filtros actuales.</p>
      </div>

      <div class="pager pager--center">
        <button class="pager__btn" type="button" id="prev">‹ Anterior</button>
        <span class="pager__nums" id="pager-nums"></span>
        <button class="pager__btn" type="button" id="next">Siguiente ›</button>
        <div class="menu pager__sizemenu">
          <button class="pager__btn" type="button" aria-haspopup="true" id="page-size-btn">25 por página <span class="caret"></span></button>
          <div class="menu__panel menu__panel--up">
            <button class="menu__item" type="button" data-size="25">25 por página</button>
            <button class="menu__item" type="button" data-size="50">50 por página</button>
            <button class="menu__item" type="button" data-size="100">100 por página</button>
          </div>
        </div>
      </div>
    </div>

    <div class="listfoot">
      <span class="pill pill--total" id="total-pill">0 ${plural}</span>
      <div class="listfoot__right">
        <button class="icon-btn icon-btn--round" type="button" data-action="refresh" aria-label="Actualizar" title="Actualizar">↻</button>
        <button class="pill" type="button" data-action="export">⇪ Exportar</button>
        <span class="pillgroup">
          <button class="pill" type="button" data-action="undo-layout" id="undo-btn" aria-label="Deshacer cambio de columnas" title="Deshacer cambio de columnas" disabled>↶</button>
          <button class="pill" type="button" data-action="view-clone" aria-label="Clonar vista" title="Clonar vista">⧉</button>
          <button class="pill" type="button" data-action="board-save" id="board-save-btn" hidden>Guardar</button>
        </span>
      </div>
    </div>
    </div>

    <div class="cellpop" id="cellpop" hidden role="dialog" aria-labelledby="cellpop-title">
      <div class="cellpop__head"><h3 id="cellpop-title">Editar</h3><button class="icon-btn" type="button" data-cp="close" aria-label="Cerrar">×</button></div>
      <div class="cellpop__body" id="cellpop-body"></div>
      <div class="cellpop__foot">
        <button class="pill pill--save" type="button" data-cp="save" id="cellpop-save" disabled>Guardar</button>
        <button class="pill" type="button" data-cp="close">Cancelar</button>
      </div>
    </div>

    <aside class="preview" id="preview" aria-hidden="true" aria-label="Vista previa">
      <div class="preview__top">
        <span class="avatar avatar--lg avatar--soft" id="pv-avatar">··</span>
        <span class="preview__tools">
          <div class="menu">
            <button class="icon-btn" type="button" aria-label="Más" aria-haspopup="true">⋮</button>
            <div class="menu__panel menu__panel--right">
              <a class="menu__item" href="#" id="pv-open-item">Ver registro</a>
              <button class="menu__item" type="button" data-pv="copy-link">Copiar enlace</button>
              <button class="menu__item" type="button" data-pv="close">Cerrar</button>
            </div>
          </div>
          <button class="icon-btn" type="button" data-pv="close" aria-label="Cerrar">×</button>
        </span>
      </div>
      <h2 class="preview__name" id="pv-name">—</h2>
      <p class="preview__sub" id="pv-sub"></p>
      <p class="preview__mail" id="pv-mail"></p>
      <div class="preview__quick">
        <button class="quick" type="button" data-pv="note"><span class="quick__ico">✎</span>Nota</button>
        <button class="quick" type="button" data-pv="email"><span class="quick__ico">✉</span>Corr…</button>
        <button class="quick" type="button" data-pv="call"><span class="quick__ico">☏</span>Llam…</button>
        <button class="quick" type="button" data-pv="task"><span class="quick__ico">☑</span>Tarea</button>
        <button class="quick" type="button" data-pv="meeting"><span class="quick__ico">▦</span>Reu…</button>
        <button class="quick" type="button" data-pv="more"><span class="quick__ico">⋯</span>Más</button>
      </div>
      <div class="preview__about">
        <div class="preview__about-head">
          <button class="card__toggle" type="button" data-pv="toggle"><span class="chev">⌄</span> Acerca de este objeto <span id="pv-type"></span></button>
          <span class="card__tools">
            <div class="menu">
              <button class="link-btn" type="button" aria-haspopup="true">Acciones <span class="caret"></span></button>
              <div class="menu__panel menu__panel--right">
                <a class="menu__item" href="#" id="pv-props-item">Ver todas las propiedades</a>
                <button class="menu__item" type="button" data-pv="follow">Seguir</button>
                <button class="menu__item" type="button" data-pv="clone">Clonar</button>
                <button class="menu__item" type="button" data-pv="delete">Eliminar</button>
                <button class="menu__item" type="button" data-pv="export">Exportar datos</button>
              </div>
            </div>
            <button class="icon-btn" type="button" data-action="columns" aria-label="Configurar">⚙</button>
          </span>
        </div>
        <dl class="props" id="pv-props"></dl>
      </div>
      <div class="preview__extra" id="pv-extra"></div>
      <div class="preview__foot"><a class="btn btn--primary btn--block btn--pillx" id="pv-open" href="#">Ver registro</a></div>
    </aside>

    <div class="drawer" id="create-drawer" aria-hidden="true">
      <div class="drawer__panel" role="dialog" aria-labelledby="create-title">
        <div class="drawer__head"><h2 id="create-title">${cfg.createLabel}</h2><button class="drawer__close" type="button" data-close="create-drawer" aria-label="Cerrar">×</button></div>
        <form class="drawer__body" id="create-form">
          ${cfg.createFields.map(fieldHtml).join('')}
        </form>
        <div class="drawer__foot">
          <button class="btn btn--primary" type="submit" form="create-form">Crear</button>
          <button class="btn btn--ghost" type="button" data-close="create-drawer">Cancelar</button>
        </div>
      </div>
    </div>

    <div class="drawer drawer--modal" id="columns-drawer" aria-hidden="true">
      <div class="drawer__panel drawer__panel--modal" role="dialog" aria-labelledby="columns-title">
        <div class="drawer__head drawer__head--light">
          <h2 id="columns-title">Editar columnas</h2>
          <button class="drawer__close" type="button" data-close="columns-drawer" aria-label="Cerrar">×</button>
        </div>
        <div class="coled">
          <div class="coled__left">
            <div class="search coled__search">
              <span class="ico ico--search" aria-hidden="true"></span>
              <input id="col-search" type="search" placeholder="Buscar propiedades" aria-label="Buscar propiedades" />
            </div>
            <p class="muted coled__hint" id="col-hint"></p>
            <div class="coled__groups" id="col-groups"></div>
          </div>
          <div class="coled__right">
            <div class="coled__right-head">
              <h3>Columnas seleccionadas (<span id="col-count">0</span>)</h3>
              <button class="link-btn" type="button" id="columns-reset">Restablecer columnas predeterminadas</button>
            </div>
            <label class="coled__freeze"><input type="checkbox" id="col-freeze" /> Fijar la primera columna al desplazarse</label>
            <p class="muted coled__hint">Arrastra para reordenar. La primera columna se muestra siempre a la izquierda.</p>
            <ul class="coled__selected" id="col-selected"></ul>
          </div>
        </div>
        <div class="drawer__foot">
          <button class="btn btn--primary" type="button" id="columns-apply">Aplicar</button>
          <button class="btn btn--ghost" type="button" data-close="columns-drawer">Cancelar</button>
        </div>
      </div>
    </div>

    <div class="drawer" id="adv-drawer" aria-hidden="true">
      <div class="drawer__panel drawer__panel--adv" role="dialog" aria-labelledby="adv-title">
        <div class="drawer__head"><h2 id="adv-title">Todos los filtros</h2><button class="drawer__close" type="button" data-close="adv-drawer" aria-label="Cerrar">×</button></div>
        <div class="drawer__body allf">
          <section class="allf__section" id="allf-assoc">
            <h3>Asociación</h3>
            <p class="muted">Filtrar por objeto asociado: ${esc(plural)} vinculados a otros registros (cualquiera, o los que cumplen un filtro por nombre).</p>
            <div id="allf-assoc-rows"></div>
            <button class="link-btn" type="button" data-allf="add-assoc">+ Agregar filtro de asociación</button>
          </section>
          <div class="allf__and"><span>Y</span></div>
          <section class="allf__section" id="allf-advanced">
            <h3>Filtros avanzados</h3>
            <p class="muted adv-intro">Condiciones sobre las propiedades del ${esc(SINGULAR[cfg.type] || cfg.singular || cfg.title).toLowerCase()}: dentro de un grupo se cumplen todas (<strong>Y</strong>); entre grupos basta con una (<strong>O</strong>).</p>
            <details class="adv-help">
              <summary>¿Qué puedo filtrar?</summary>
              <dl>
                <dt>Filtros avanzados</dt>
                <dd>Condiciones sobre los datos del propio registro: su propietario, su fecha de creación, si tiene teléfono… Las opciones cambian según el tipo de propiedad: un texto ofrece «es igual a cualquiera de» o «contiene exactamente», un número «es mayor que» o «está entre», una fecha «es anterior a» o «es este mes», una lista «es cualquiera de». Ejemplo: «Propietario es cualquiera de: yo <strong>Y</strong> Número de teléfono es conocido».</dd>
                <dt>Filtros por asociación</dt>
                <dd>Condiciones sobre los registros vinculados (su empresa, sus negocios, sus tickets). El resultado sigue mostrando ${esc(plural)}. Ejemplo: «Empresa asociada › Estado/Región es igual a Florida». Con una etiqueta de asociación limitas la relación, por ejemplo solo la empresa principal.</dd>
                <dt>Combinarlos</dt>
                <dd>Sí: «Propietario es cualquiera de: yo <strong>Y</strong> Empresa asociada › Estado/Región es cualquiera de: Florida» mezcla un dato del registro con uno de su empresa. Un segundo grupo añade una alternativa (<strong>O</strong>).</dd>
              </dl>
            </details>
            <p class="muted adv-summary" id="adv-summary"></p>
            <div id="adv-groups"></div>
            <div class="allf__addwrap">
              <button class="btn btn--ghost btn--sm" type="button" id="allf-add" data-allf="add" aria-haspopup="true" aria-expanded="false">+ Agregar filtro</button>
              <div class="allf__pop" id="allf-pop" hidden>
                <input type="search" id="allf-q" placeholder="Buscar propiedades de ${esc(SINGULAR[cfg.type] || cfg.singular || cfg.title).toLowerCase()}" aria-label="Buscar propiedades" autocomplete="off" />
                <div id="allf-pop-list"></div>
              </div>
            </div>
            <button class="link-btn" type="button" id="adv-add-group">+ Añadir grupo de filtros (O)</button>
          </section>
        </div>
        <div class="drawer__foot">
          <button class="btn btn--primary" type="button" id="adv-apply">Aplicar filtros</button>
          <button class="btn btn--ghost" type="button" id="adv-clear">Borrar todo</button>
        </div>
      </div>
    </div>

    <div class="drawer drawer--modal" id="view-dialog" aria-hidden="true">
      <div class="drawer__panel drawer__panel--dialog" role="dialog" aria-labelledby="view-dialog-title">
        <div class="drawer__head drawer__head--light"><h2 id="view-dialog-title">Crear vista</h2><button class="drawer__close" type="button" data-close="view-dialog" aria-label="Cerrar">×</button></div>
        <form class="drawer__body" id="view-form">
          <label class="field"><span>Nombre de la vista</span><input name="name" type="text" required maxlength="60" placeholder="Por ejemplo: Leads de octubre" /></label>
          <fieldset class="field share-field" id="view-share">
            <span>Compartir con</span>
            <label class="radio"><input type="radio" name="share" value="private" checked /> <span><strong>Privada</strong><small>Solo tú puedes ver esta vista.</small></span></label>
            <label class="radio"><input type="radio" name="share" value="team" /> <span><strong>Mi equipo</strong><small>Los miembros de tu equipo pueden verla.</small></span></label>
            <label class="radio"><input type="radio" name="share" value="all" /> <span><strong>Todos</strong><small>Cualquier usuario de la cuenta puede verla.</small></span></label>
          </fieldset>
          <p class="muted" id="view-dialog-hint"></p>
        </form>
        <div class="drawer__foot">
          <button class="btn btn--primary" type="submit" form="view-form" id="view-dialog-ok">Crear</button>
          <button class="btn btn--ghost" type="button" data-close="view-dialog">Cancelar</button>
        </div>
      </div>
    </div>

    <div class="drawer drawer--modal" id="allviews-drawer" aria-hidden="true">
      <div class="drawer__panel drawer__panel--modal" role="dialog" aria-labelledby="allviews-title">
        <div class="drawer__head drawer__head--light"><h2 id="allviews-title">Todas las vistas</h2><button class="drawer__close" type="button" data-close="allviews-drawer" aria-label="Cerrar">×</button></div>
        <div class="allviews">
          <div class="allviews__bar">
            <div class="search">
              <span class="ico ico--search" aria-hidden="true"></span>
              <input id="allviews-search" type="search" placeholder="Buscar vistas" aria-label="Buscar vistas" />
            </div>
            <div class="allviews__tabs" id="allviews-scope">
              <button class="chip is-set" type="button" data-scope="all">Todas</button>
              <button class="chip" type="button" data-scope="mine">Creadas por mí</button>
              <button class="chip" type="button" data-scope="standard">Estándar</button>
            </div>
            <button class="btn btn--primary btn--sm" type="button" data-action="view-create">Crear vista</button>
          </div>
          <div class="table-wrap allviews__table">
            <table class="table">
              <thead><tr><th>Nombre</th><th>Creada por</th><th>Compartida con</th><th>Última actualización</th><th></th></tr></thead>
              <tbody id="allviews-rows"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="drawer drawer--modal" id="colinfo-dialog" aria-hidden="true">
      <div class="drawer__panel drawer__panel--dialog" role="dialog" aria-labelledby="colinfo-title">
        <div class="drawer__head drawer__head--light"><h2 id="colinfo-title">Información de la columna</h2><button class="drawer__close" type="button" data-close="colinfo-dialog" aria-label="Cerrar">×</button></div>
        <div class="drawer__body" id="colinfo-body"></div>
        <div class="drawer__foot">
          <a class="btn btn--ghost" href="../settings/#data-properties">Editar propiedad</a>
          <button class="btn btn--ghost" type="button" data-close="colinfo-dialog">Cerrar</button>
        </div>
      </div>
    </div>

    <div class="hlpop" id="hl-pop" hidden role="dialog" aria-labelledby="hl-title" aria-hidden="true">
      <div class="hlpop__head"><h3 id="hl-title">Resaltado condicional</h3><button class="icon-btn" type="button" data-hl-close aria-label="Cerrar">×</button></div>
      <p class="hlpop__note" id="hl-note">Los valores se basan en todos los datos de esta columna</p>
      <div class="hlpop__label">Aparece como</div>
      <div class="hlpop__scale" id="hl-scale" aria-hidden="true"></div>
      <div class="hlpop__ends"><span>Máx.</span><span>Med.</span><span>Mín.</span></div>
      <div class="hlpop__label">Estilo cromático</div>
      <div class="hlpop__styles" id="hl-styles" role="group" aria-label="Estilo cromático"></div>
      <div class="hlpop__foot">
        <button class="btn btn--primary btn--pillx" type="button" data-hl-apply>Aplicar</button>
        <button class="btn btn--ghost btn--pillx" type="button" data-hl-remove id="hl-remove" hidden>Eliminar</button>
      </div>
    </div>

`;

  const $ = (id) => document.getElementById(id);
  const tbody = $('rows');
  const headRow = $('head-row');
  const table = $('table');

  // Advanced filters: conditions live in groups (cond.group). Inside a group all conditions must hold (Y);
  // a record passes when any group holds (O). A condition with cond.assoc looks at the linked records
  // of that association (optionally only those with cond.label) instead of the record itself.
  const groupedConditions = () => {
    const map = new Map();
    state.advanced.filter((c) => c.key && c.section !== 'assoc').forEach((c) => {
      const g = Number(c.group) || 0;
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(c);
    });
    return [...map.values()];
  };
  // The "Asociación" section of the panel: its conditions are joined with Y to the whole advanced block.
  const assocSection = () => state.advanced.filter((c) => c.key && c.section === 'assoc');
  // Kind of a property of this list (explicit columns without a catalog entry get a sensible kind).
  const DATE_KEYS = new Set(['created', 'lastActivity', 'closeDate', 'due', 'closedate']);
  function ownKind(key) {
    const p = props[key];
    if (p) return p.kind;
    if (cfg.editors && cfg.editors[key]) return 'enum';
    if (DATE_KEYS.has(key)) return 'datetime';
    if (key === 'amount') return 'currency';
    return 'text';
  }
  const ownGroup = (key) => kindGroup(ownKind(key));
  function ownConditionMatches(cond, r) {
    const c = col(cond.key);
    const group = ownGroup(cond.key);
    const text = c ? cellText(c, r) : r[cond.key];
    const dateMs = group === 'date' && c && c.sortValue ? c.sortValue(r) : NaN;
    return evalCondition(cond, conditionValues(r[cond.key], text, group, dateMs));
  }
  const conditionMatches = (cond, r) => (cond.assoc ? assocConditionMatches(cfg.type, cond, r) : ownConditionMatches(cond, r));
  function applyAdvanced(list) {
    const grps = groupedConditions();
    const assoc = assocSection();
    if (!grps.length && !assoc.length) return list;
    return list.filter((r) => assoc.every((cond) => conditionMatches(cond, r)) && (!grps.length || grps.some((g) => g.every((cond) => conditionMatches(cond, r)))));
  }

  function filtered() {
    let list = cfg.rows();
    const view = cfg.views.find((v) => v.key === state.base);
    if (view && view.filter) list = list.filter(view.filter);
    if (cfg.pipeline && state.pipeline) list = list.filter((r) => String(r[cfg.pipeline.key]) === state.pipeline);
    cfg.filters.forEach((f) => {
      const v = state.filters[f.key];
      if (v) list = list.filter((r) => f.test(r, v));
    });
    list = applyAdvanced(list);
    if (state.q) list = list.filter((r) => matches(r, state.q, cfg.searchKeys));
    const c = col(state.sort.key);
    list.sort((a, b) => {
      const av = c && c.sortValue ? c.sortValue(a) : a[state.sort.key];
      const bv = c && c.sortValue ? c.sortValue(b) : b[state.sort.key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * state.sort.dir;
      return String(av ?? '').localeCompare(String(bv ?? ''), 'es') * state.sort.dir;
    });
    return list;
  }

  // ---------- saved views ----------
  const stdId = (key) => `std:${key}`;
  const standardViews = () =>
    cfg.views.map((v) => ({ id: stdId(v.key), name: v.label, standard: true, base: v.key, share: 'all', owner: 'Sistema', updated: null }));
  const allViews = () => [...standardViews(), ...store.custom];
  const viewById = (id) => allViews().find((v) => v.id === id);
  const persist = () => setViewStore(cfg.type, store);
  const cleanAdvanced = (adv) => adv.filter((c) => c.key).map((c) => ({ key: c.key, op: c.op, value: c.value ?? '', value2: c.value2 || '', group: Number(c.group) || 0, assoc: c.assoc || '', label: c.label || '' }));
  const cleanFilters = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const currentSnapshot = () => ({
    filters: cleanFilters(state.filters),
    advanced: cleanAdvanced(state.advanced),
    sort: state.sort,
    columns: state.columns,
  });
  const savedSnapshot = (view) => ({
    filters: cleanFilters(view.filters || {}),
    advanced: cleanAdvanced(view.advanced || []),
    sort: view.sort || cfg.defaultSort || { key: 'created', dir: -1 },
    columns: view.columns || getPrefs(cfg.type).columns || defaultColumns,
  });
  const isDirty = () => {
    const v = viewById(state.viewId);
    return Boolean(v) && JSON.stringify(currentSnapshot()) !== JSON.stringify(savedSnapshot(v));
  };

  function activateView(id, { keepOpen = true } = {}) {
    const v = viewById(id) || standardViews()[0];
    const snap = savedSnapshot(v);
    state.viewId = v.id;
    state.base = v.base || cfg.views[0].key;
    state.filters = { ...snap.filters };
    state.advanced = snap.advanced.map((c) => ({ ...c }));
    state.sort = { ...snap.sort };
    state.columns = snap.columns.slice();
    state.page = 1;
    state.selected.clear();
    if (keepOpen && !store.open.includes(v.id)) store.open.push(v.id);
    store.active = v.id;
    persist();
    render();
  }

  function saveCurrentView() {
    const v = viewById(state.viewId);
    if (!v || v.standard) return;
    Object.assign(v, currentSnapshot(), { updated: Date.now() });
    persist();
    render();
    toast(`Vista "${v.name}" guardada`);
  }

  function createView({ name, share, fromCurrent = true, copyOf = null }) {
    const src = copyOf ? savedSnapshot(copyOf) : fromCurrent ? currentSnapshot() : savedSnapshot(standardViews()[0]);
    const v = {
      id: `v${Date.now()}`,
      name,
      share,
      owner: ME,
      base: copyOf ? copyOf.base || cfg.views[0].key : state.base,
      ...src,
      updated: Date.now(),
    };
    store.custom.push(v);
    activateView(v.id);
    toast(`Vista "${name}" creada`);
    return v;
  }

  function deleteView(id) {
    const v = viewById(id);
    if (!v || v.standard) return;
    // Kept for "Eliminado recientemente" in Configuración › Administrar vistas.
    saveDeletedViews(cfg.type, [{ ...v, deletedAt: new Date().toISOString() }, ...deletedViews(cfg.type).filter((x) => x.id !== id)].slice(0, 50));
    store.custom = store.custom.filter((x) => x.id !== id);
    store.open = store.open.filter((x) => x !== id);
    if (store.active === id) activateView(store.open[0] || stdId(cfg.views[0].key));
    else {
      persist();
      render();
    }
    toast(`Vista "${v.name}" eliminada`);
  }

  function closeTab(id) {
    if (store.open.length <= 1) {
      toast('Debe quedar al menos una pestaña abierta');
      return;
    }
    const idx = store.open.indexOf(id);
    store.open = store.open.filter((x) => x !== id);
    if (store.active === id) activateView(store.open[Math.max(0, idx - 1)]);
    else {
      persist();
      render();
    }
  }

  // Initial tabs: the account's default tabs (Configuración › Objetos › Personalización del índice) until the user changes theirs.
  store.open = (store.open || []).filter((id) => viewById(id));
  if (!store.open.length) {
    const defaults = defaultTabs(cfg.type).filter((id) => viewById(id));
    store.open = defaults.length ? defaults : standardViews().slice(0, 4).map((v) => v.id);
  }
  if (!store.active || !store.open.includes(store.active)) store.active = store.open[0];
  {
    const v = viewById(store.active);
    const snap = savedSnapshot(v);
    state.viewId = v.id;
    state.base = v.base || cfg.views[0].key;
    state.filters = { ...snap.filters };
    state.advanced = snap.advanced.map((c) => ({ ...c }));
    state.sort = { ...snap.sort };
    state.columns = snap.columns.slice();
  }

  function renderViews() {
    const total = allViews().length;
    const active = viewById(state.viewId);
    const tabs = store.open
      .map((id) => viewById(id))
      .filter(Boolean)
      .map((v) => {
        const isActive = v.id === state.viewId;
        return `
        <div class="views__tabwrap${isActive ? ' is-active' : ''}" data-view="${v.id}" draggable="true">
          <button class="views__tab${isActive ? ' is-active' : ''}" role="tab" type="button" data-view="${v.id}" title="${esc(v.name)}">
            ${esc(v.name)}${isActive && isDirty() ? '<span class="views__dot" title="Cambios sin guardar"></span>' : ''}
          </button>
          ${
            isActive
              ? `<div class="menu views__menu">
                  <button class="views__caret" type="button" aria-label="Opciones de la vista" aria-haspopup="true"><span class="caret"></span></button>
                  <div class="menu__panel">
                    <button class="menu__item" type="button" data-action="view-rename" ${v.standard ? 'disabled' : ''}>Cambiar nombre</button>
                    <button class="menu__item" type="button" data-action="view-clone">Clonar</button>
                    <button class="menu__item" type="button" data-action="view-share" ${v.standard ? 'disabled' : ''}>Administrar uso compartido</button>
                    <button class="menu__item" type="button" data-action="view-reset-cols">Restablecer columnas predeterminadas</button>
                    <button class="menu__item" type="button" data-action="view-close">Cerrar pestaña</button>
                    <button class="menu__item menu__item--danger" type="button" data-action="view-delete" ${v.standard ? 'disabled' : ''}>Eliminar</button>
                  </div>
                </div>`
              : `<button class="views__close" type="button" data-close-tab="${v.id}" aria-label="Cerrar pestaña">×</button>`
          }
        </div>`;
      })
      .join('');

    const groups = [
      ['Vistas estándar', standardViews()],
      ['Mis vistas', store.custom.filter((v) => v.owner === ME && v.share === 'private')],
      ['Vistas compartidas', store.custom.filter((v) => v.share !== 'private')],
    ];
    const picker = `
      <div class="menu views__addwrap">
        <button class="views__add views__add--icon" type="button" aria-haspopup="true" aria-label="Añadir vista (${total}/50)" title="Añadir vista (${total}/50)">+</button>
        <div class="menu__panel menu__panel--picker">
          <div class="picker__search search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="picker-search" placeholder="Buscar vistas" aria-label="Buscar vistas" /></div>
          <button class="menu__item menu__item--strong" type="button" data-action="view-create">＋ Crear nueva vista (${total}/50)</button>
          <div id="picker-groups">
            ${groups
              .map(([title, list]) =>
                list.length
                  ? `<div class="picker__group" data-group><div class="menu__title">${title}</div>${list
                      .map((v) => `<button class="menu__item picker__item" type="button" data-open-view="${v.id}" data-name="${esc(strip(v.name))}">${esc(v.name)}${store.open.includes(v.id) ? '<span class="muted">· abierta</span>' : ''}</button>`)
                      .join('')}</div>`
                  : '',
              )
              .join('')}
          </div>
        </div>
      </div>`;

    $('views-bar').innerHTML = `
      <div class="views__tabs" role="tablist" id="view-tabs">${tabs}${picker}</div>
      <a class="views__all" href="#" data-action="allviews">Todas las vistas</a>`;
    $('views-bar').querySelectorAll('button.views__tab').forEach((t) => {
      t.insertAdjacentHTML('afterbegin', '<span class="ico ico--grid" aria-hidden="true"></span>');
    });

    const dirty = isDirty();
    $('view-dirty').hidden = !dirty;
    if (dirty) {
      $('view-save-btn').hidden = Boolean(active && active.standard);
      $('view-dirty').querySelector('.view-dirty__text').textContent = active && active.standard
        ? 'Las vistas estándar no se pueden modificar. Guarda tus filtros como una vista nueva.'
        : 'Has cambiado los filtros, el orden o las columnas de esta vista.';
    }
    wireMenus($('views-bar'));
  }

  // dialog for create / rename / clone / share
  let dialogMode = { kind: 'create' };
  function openViewDialog(kind, view) {
    dialogMode = { kind, view };
    const form = $('view-form');
    form.reset();
    const titles = { create: 'Crear vista', saveas: 'Guardar como nueva vista', rename: 'Cambiar nombre', clone: 'Clonar vista', share: 'Administrar uso compartido' };
    $('view-dialog-title').textContent = titles[kind];
    $('view-dialog-ok').textContent = kind === 'create' || kind === 'clone' || kind === 'saveas' ? 'Crear' : 'Guardar';
    const nameField = form.querySelector('[name="name"]').closest('.field');
    nameField.hidden = kind === 'share';
    $('view-share').hidden = kind === 'rename';
    if (view) {
      form.querySelector('[name="name"]').value = kind === 'clone' ? `Copia de ${view.name}` : kind === 'rename' || kind === 'share' ? view.name : '';
      const r = form.querySelector(`[name="share"][value="${view.share || 'private'}"]`);
      if (r) r.checked = true;
    }
    $('view-dialog-hint').textContent =
      kind === 'saveas'
        ? 'Se guardarán los filtros, el orden y las columnas actuales en la nueva vista.'
        : kind === 'create'
          ? 'La vista nueva parte de los filtros y columnas que tienes ahora.'
          : '';
    openDrawer('view-dialog');
  }
  $('view-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const { kind, view } = dialogMode;
    if (kind === 'create' || kind === 'saveas') createView({ name: data.name.trim(), share: data.share });
    else if (kind === 'clone') createView({ name: data.name.trim(), share: data.share, copyOf: view });
    else if (kind === 'rename') {
      view.name = data.name.trim();
      view.updated = Date.now();
      persist();
      render();
      toast('Nombre actualizado');
    } else if (kind === 'share') {
      view.share = data.share;
      view.updated = Date.now();
      persist();
      render();
      toast(`Vista compartida con: ${SHARE_LABEL[view.share]}`);
    }
    closeDrawer('view-dialog');
  });

  // all views manager
  let avScope = 'all';
  let avQuery = '';
  function renderAllViews() {
    const q = strip(avQuery);
    const rows = allViews().filter((v) => {
      if (avScope === 'mine' && v.owner !== ME) return false;
      if (avScope === 'standard' && !v.standard) return false;
      return !q || strip(v.name).includes(q);
    });
    $('allviews-rows').innerHTML = rows.length
      ? rows
          .map(
            (v) => `
        <tr>
          <td><a href="#" data-open-view="${v.id}"><strong>${esc(v.name)}</strong></a>${v.id === state.viewId ? ' <span class="tag tag--new">Actual</span>' : ''}</td>
          <td>${esc(v.owner)}</td>
          <td>${v.standard ? 'Todos' : SHARE_LABEL[v.share] || 'Privada'}</td>
          <td>${v.updated ? formatDate(new Date(v.updated)) : '—'}</td>
          <td class="allviews__actions">
            <div class="menu">
              <button class="icon-btn" type="button" aria-label="Acciones" aria-haspopup="true">⋯</button>
              <div class="menu__panel menu__panel--right">
                <button class="menu__item" type="button" data-open-view="${v.id}">Abrir</button>
                <button class="menu__item" type="button" data-av="clone" data-id="${v.id}">Clonar</button>
                <button class="menu__item" type="button" data-av="rename" data-id="${v.id}" ${v.standard ? 'disabled' : ''}>Cambiar nombre</button>
                <button class="menu__item" type="button" data-av="share" data-id="${v.id}" ${v.standard ? 'disabled' : ''}>Administrar uso compartido</button>
                <button class="menu__item menu__item--danger" type="button" data-av="delete" data-id="${v.id}" ${v.standard ? 'disabled' : ''}>Eliminar</button>
              </div>
            </div>
          </td>
        </tr>`,
          )
          .join('')
      : '<tr><td colspan="5" class="muted">Ninguna vista coincide con la búsqueda.</td></tr>';
    $('allviews-scope').querySelectorAll('[data-scope]').forEach((b) => b.classList.toggle('is-set', b.dataset.scope === avScope));
    wireMenus($('allviews-drawer'));
  }
  $('allviews-search').addEventListener('input', (e) => {
    avQuery = e.target.value.trim();
    renderAllViews();
  });
  $('allviews-scope').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    avScope = b.dataset.scope;
    renderAllViews();
  });
  $('allviews-drawer').addEventListener('click', (e) => {
    const act = e.target.closest('[data-av]');
    if (!act) return;
    e.preventDefault();
    const v = viewById(act.dataset.id);
    closeMenus();
    if (act.dataset.av === 'delete') {
      if (window.confirm(`¿Eliminar la vista "${v.name}"?`)) {
        deleteView(v.id);
        renderAllViews();
      }
    } else {
      openViewDialog(act.dataset.av, v);
    }
  });

  // ---------- "Ver configuración" (the gear at the right of the toolbar) ----------
  // Table settings, the actions of the open view and the links to manage views and the index page.
  // The menu is redrawn on every render so the checks and the disabled items follow the current view.
  function renderSettingsMenu() {
    const el = $('vsettings-menu');
    if (!el) return;
    const v = viewById(state.viewId);
    const std = !v || v.standard;
    const dirty = isDirty();
    const check = (on) => `<span class="vsmenu__check${on ? ' is-on' : ''}" aria-hidden="true">✓</span>`;
    const toggle = (action, on, label) => `<button class="menu__item vsmenu__toggle" type="button" role="menuitemcheckbox" aria-checked="${on}" data-action="${action}">${check(on)}<span>${label}</span></button>`;
    const item = (action, label, { disabled = false, danger = false } = {}) => `<button class="menu__item${danger ? ' menu__item--danger' : ''}" type="button" role="menuitem" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    el.innerHTML = `
      <div class="vsmenu__label">Tabla</div>
      ${item('columns', 'Editar columnas')}
      ${cfg.summary ? toggle('toggle-metrics', metricsShown(), 'Mostrar métricas') : ''}
      ${toggle('toggle-freeze', state.frozen, 'Fijar la primera columna')}
      ${toggle('toggle-density', state.density === 'compact', 'Filas compactas')}
      ${toggle('toggle-zebra', state.zebra, 'Vista en zebra')}
      <div class="menu__sep"></div>
      <div class="vsmenu__label">Vista${v ? `: <span class="vsmenu__view">${esc(v.name)}</span>` : ''}</div>
      ${item('view-save', 'Guardar vista', { disabled: std || !dirty })}
      ${item('view-saveas', 'Guardar como nueva vista')}
      ${item('view-discard', 'Restablecer vista', { disabled: !dirty })}
      ${item('view-rename', 'Cambiar nombre', { disabled: std })}
      ${item('view-clone', 'Clonar vista')}
      ${item('view-share', 'Administrar uso compartido', { disabled: std })}
      ${item('view-delete', 'Eliminar vista', { disabled: std, danger: true })}
      <div class="menu__sep"></div>
      <a class="menu__item" role="menuitem" href="../views/?type=${cfg.type}">Administrar vistas <span class="ext">↗</span></a>
      <a class="menu__item" role="menuitem" href="../settings/#obj-${cfg.type}:index">Personalizar la página de índice <span class="ext">↗</span></a>
      ${item('export', 'Exportar vista')}`;
  }

  function render() {
    const cols = visibleColumns();
    renderViews();
    renderSettingsMenu();
    table.classList.toggle('table--frozen', state.frozen);
    table.classList.toggle('table--compact', state.density === 'compact');
    table.classList.toggle('table--zebra', state.zebra);
    $('colgroup').innerHTML =
      `<col style="width:48px" />` +
      cols.map((c, i) => `<col data-key="${c.key}" style="width:${widthOf(c.key, i)}px" />`).join('') +
      `<col style="width:44px" />`;
    // Left offsets of the frozen columns (after the 48 px checkbox column).
    const lefts = [];
    cols.reduce((acc, c, i) => { lefts[i] = acc; return acc + widthOf(c.key, i); }, 48);
    const fzClass = (i) => (i < state.frozenCount ? ` fz${i === state.frozenCount - 1 ? ' fz--last' : ''}` : '');
    const fzStyle = (i) => (i < state.frozenCount ? `--fzl:${lefts[i]}px;` : '');
    headRow.innerHTML =
      `<th class="table__check"><input type="checkbox" id="check-all" aria-label="Seleccionar todo" /></th>` +
      cols
        .map(
          (c, i) => `<th class="th${state.sort.key === c.key ? ' is-sorted' : ''}${fzClass(i)}${hlHeader(c.key) ? ' th--hl' : ''}" data-key="${c.key}" data-index="${i}" style="${fzStyle(i)}${hlHeader(c.key) ? `background:${hlHeader(c.key)};` : ''}">
            <div class="th__inner">
              <button class="th-sort${state.sort.key === c.key ? ' is-sorted' : ''}" type="button" data-sort="${c.key}" draggable="false">
                <span class="th__label">${c.label}</span>
                <span class="th__sorticon">${state.sort.key === c.key ? (state.sort.dir > 0 ? '↑' : '↓') : '⇅'}</span>
              </button>
              <div class="menu th__menu">
                <button class="th__more" type="button" aria-label="Opciones de columna" aria-haspopup="true">⋮</button>
                <div class="menu__panel menu__panel--right thmenu" role="menu">
                  <button class="menu__item" type="button" role="menuitem" data-col="asc" data-key="${c.key}"><span class="ico ico--arrow-up"></span>Orden ascendente</button>
                  <button class="menu__item" type="button" role="menuitem" data-col="desc" data-key="${c.key}"><span class="ico ico--arrow-down"></span>Orden descendente</button>
                  <button class="menu__item" type="button" role="menuitem" data-col="filter" data-key="${c.key}"><span class="ico ico--lines"></span>Filtrar por esta columna</button>
                  <button class="menu__item" type="button" role="menuitem" data-col="smart" data-key="${c.key}" disabled title="Disponible con las funciones de IA"><span class="ico ico--copilot"></span>Configura una propiedad inteligente</button>
                  <button class="menu__item" type="button" role="menuitem" data-col="info" data-key="${c.key}"><span class="ico ico--copilot"></span>Ver información de la columna</button>
                  <button class="menu__item" type="button" role="menuitem" data-col="highlight" data-key="${c.key}"><span class="ico ico--highlight"></span>Editar resaltado condicional</button>
                  <button class="menu__item" type="button" role="menuitem" data-col="freeze" data-key="${c.key}"><span class="ico ico--pin"></span>${i < state.frozenCount ? 'Liberar columna' : 'Inmovilizar columna'}</button>
                  <button class="menu__item" type="button" role="menuitem" data-col="add" data-key="${c.key}"><span class="ico ico--plus"></span>Agregar columna</button>
                  <button class="menu__item" type="button" role="menuitem" data-col="hide" data-key="${c.key}" ${cols.length === 1 ? 'disabled' : ''}><span class="ico ico--close"></span>Eliminar columna</button>
                </div>
              </div>
              <span class="th__resize" data-resize="${c.key}" title="Arrastra para cambiar el ancho"></span>
            </div>
          </th>`,
        )
        .join('') +
      `<th class="table__add"><button class="table__add-btn" type="button" data-action="columns" title="Añadir columna" aria-label="Añadir columna">+</button></th>`;
    // The header is rebuilt on every render, so its ⋮ menus need wiring each time.
    wireMenus(headRow);
    $('undo-btn').disabled = layoutHistory.length === 0;

    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / state.size));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * state.size;
    const slice = list.slice(start, start + state.size);
    const hlStats = highlightStats(list, cols);
    const hlOf = (c, r) => hlCell(c, r, hlStats);

    tbody.innerHTML = slice
      .map(
        (r) => `
        <tr data-id="${r.id}" class="${state.previewId === Number(r.id) ? 'is-previewing' : ''}${state.selected.has(Number(r.id)) ? ' is-selected' : ''}">
          <td class="table__check"><input type="checkbox" class="row-check" data-id="${r.id}" ${state.selected.has(Number(r.id)) ? 'checked' : ''} aria-label="Seleccionar" /></td>
          ${cols
            .map(
              (c, i) =>
                `<td class="${c.className || ''}${i === 0 ? ' table__first' : ''}${isEditable(c.key) ? ' cell--editable' : ''}${i > 0 && isSystem(c.key) ? ' cell--locked' : ''}${fzClass(i)}${hlOf(c, r) ? ' cell--hl' : ''}" data-key="${c.key}" data-id="${r.id}" title="${i > 0 && isSystem(c.key) ? 'Valor calculado por el sistema (solo lectura)' : esc(cellText(c, r))}" style="${fzStyle(i)}${hlOf(c, r) ? `background:${hlOf(c, r)};` : ''}">${
                  i === 0
                    ? `<div class="firstcell"><div class="firstcell__content">${cellHtml(c, r)}</div><button class="preview-btn" type="button" data-preview="${r.id}" aria-label="Vista previa"><span class="preview-btn__tip">Vista previa</span>▭</button></div>`
                    : `${cellHtml(c, r)}${isEditable(c.key) ? '<span class="cell__pen" aria-hidden="true">✎</span>' : isSystem(c.key) ? '<span class="cell__lock" aria-hidden="true"></span>' : ''}`
                }</td>`,
            )
            .join('')}
          <td class="table__add"></td>
        </tr>`,
      )
      .join('');
    $('empty').hidden = list.length > 0 || state.mode === 'board';
    $('total-pill').textContent = `${list.length} ${plural}`;
    fitColumns();
    renderBoard(list);

    $('pager-nums').innerHTML = Array.from({ length: pages }, (_, i) => i + 1)
      .filter((n) => pages <= 11 || Math.abs(n - state.page) <= 4 || n === 1 || n === pages)
      .map((n) => `<button class="pager__num${n === state.page ? ' is-active' : ''}" type="button" data-page="${n}">${n}</button>`)
      .join('');
    $('prev').disabled = state.page <= 1;
    $('next').disabled = state.page >= pages;
    $('page-size-btn').innerHTML = `${state.size} por página <span class="caret"></span>`;

    const activeFilters = Object.values(state.filters).filter(Boolean).length + state.advanced.filter((c) => c.key).length;
    $('filter-pill').innerHTML = `<span class="ico ico--filter"></span> Filtro${activeFilters ? ` (${activeFilters})` : ''}`;
    $('filter-pill').classList.toggle('is-set', activeFilters > 0);
    $('quickbar').hidden = !state.showFilters;
    $('collapse-ico').textContent = state.showFilters ? '︿' : '﹀';
    $('collapse-tip').textContent = state.showFilters ? 'Ocultar filtros' : 'Mostrar filtros';
    const sortCol = col(state.sort.key);
    $('sort-pill').innerHTML = `⇅ Ordenar por${sortCol ? `: ${sortCol.label} ${state.sort.dir > 0 ? '↑' : '↓'}` : ''}`;
    $('sort-menu').innerHTML = cols
      .map((c) => `<button class="menu__item${c.key === state.sort.key ? ' is-current' : ''}" type="button" data-sort="${c.key}">${c.label}</button>`)
      .join('');

    const sel = slice.filter((r) => state.selected.has(Number(r.id))).length;
    const checkAll = $('check-all');
    checkAll.checked = slice.length > 0 && sel === slice.length;
    checkAll.indeterminate = sel > 0 && sel < slice.length;
    // Bulk bar: how many are selected and, once the whole page is ticked, the offer to take the whole view.
    const n = state.selected.size;
    $('bulk').hidden = n === 0;
    $('bulk-count').textContent = `${bulkN(n)} ${bulkWord(n, 'seleccionad')}`;
    const inView = list.filter((r) => state.selected.has(Number(r.id))).length;
    const bulkAll = $('bulk-all');
    if (n && list.length > slice.length && inView >= list.length) {
      bulkAll.hidden = false;
      bulkAll.innerHTML = `${bulkFem ? 'Las' : 'Los'} ${list.length} ${bulkNoun.plural} de la vista están ${bulkWord(2, 'seleccionad')}. <button class="link-btn" type="button" data-action="bulk-clear">Limpiar selección</button>`;
    } else if (slice.length && sel === slice.length && list.length > slice.length) {
      bulkAll.hidden = false;
      bulkAll.innerHTML = `<button class="link-btn" type="button" data-action="bulk-select-view">Seleccionar los ${list.length} ${bulkNoun.plural} de la vista completa</button>`;
    } else {
      bulkAll.hidden = true;
      bulkAll.innerHTML = '';
    }

    document.querySelectorAll('.qchip[data-filter]').forEach((chip) => {
      const key = chip.dataset.filter;
      const f = cfg.filters.find((x) => x.key === key);
      const v = state.filters[key];
      const label = v ? `${chip.dataset.label}: ${(f.options.find((o) => o[0] === v) || [v, v])[1]}` : chip.dataset.label;
      chip.innerHTML = `${label} <span class="caret"></span>`;
      chip.classList.toggle('is-set', Boolean(v));
      // an active chip gets its own × to remove just that filter
      let x = chip.parentElement.querySelector('.qchip__x');
      if (v && !x) { x = document.createElement('button'); x.type = 'button'; x.className = 'qchip__x'; x.textContent = '×'; x.setAttribute('aria-label', `Quitar filtro ${chip.dataset.label}`); x.dataset.filterClear = key; chip.after(x); }
      if (!v && x) x.remove();
    });
    const adv = state.advanced.filter((c) => c.key).length;
    $('adv-pill').hidden = adv === 0;
    $('adv-count').textContent = String(adv);
    if ($('filters-clear-all')) $('filters-clear-all').hidden = !(adv || Object.values(state.filters).some(Boolean));
    renderPreview();
    renderPipeline();
    renderKpis(list);
    verifyCount(list.length);
    if (cfg.onRender) cfg.onRender(list);
  }
  // With Supabase, the panel's conditions are also run as a WHERE on the table; the pill carries the
  // database's count (only when every condition can be expressed and no other filter is active).
  let countSeq = 0;
  function verifyCount(local) {
    const pill = $('total-pill');
    if (!pill) return;
    delete pill.dataset.dbCount;
    pill.title = '';
    const conds = state.advanced.filter((c) => c.key);
    if (!dbClient || !conds.length || Object.values(state.filters).some(Boolean) || state.q || (cfg.pipeline && state.pipeline) || state.base !== cfg.views[0].key) return;
    const seq = (countSeq += 1);
    countWithConditions(dbClient, cfg.type, conds, { kindOf: ownKind })
      .then((n) => {
        if (seq !== countSeq || n === null) return;
        pill.dataset.dbCount = String(n);
        pill.title = `${n} según la consulta en Supabase${n !== local ? ` (${local} en esta vista)` : ''}`;
      })
      .catch(() => {});
  }

  // ---------- pipeline selector (deals) ----------
  function renderPipeline() {
    if (!cfg.pipeline) return;
    const options = cfg.pipeline.options();
    if (state.pipeline && !options.includes(state.pipeline)) state.pipeline = '';
    $('pipeline-label').textContent = state.pipeline || 'Todos los pipelines';
    const q = pipelineQuery.trim().toLowerCase();
    const all = cfg.rows();
    const items = ['', ...options].filter((p) => !q || (p || 'Todos los pipelines').toLowerCase().includes(q));
    $('pipeline-items').innerHTML = items.length
      ? items
          .map((p) => {
            const n = p ? all.filter((r) => String(r[cfg.pipeline.key]) === p).length : all.length;
            const detail = cfg.pipeline.detail ? cfg.pipeline.detail(p, all) : ''; // e.g. open / closed tickets of the pipeline
            return `<button class="pmenu__item${(state.pipeline || '') === p ? ' is-current' : ''}" type="button" data-pipeline="${esc(p)}"><span>${esc(p || 'Todos los pipelines')}${detail ? `<small class="pmenu__detail">${esc(detail)}</small>` : ''}</span><span class="pmenu__count">${n}</span></button>`;
          })
          .join('')
      : '<p class="muted pmenu__empty">No hay pipelines que coincidan.</p>';
  }
  // ---------- summary tiles above the table (deals) ----------
  // Whether the summary tiles show: the person's own choice from the gear menu ("Mostrar métricas"),
  // or, until they choose, the account switch in Configuración › Objetos › Personalización del índice.
  function metricsShown() {
    if (typeof state.metrics === 'boolean') return state.metrics;
    try { const s = JSON.parse(localStorage.getItem(`crm:settings:obj-${cfg.type}`)) || {}; if (s.showMetrics === false) return false; } catch { /* ignore */ }
    return cfg.metricsDefault !== false;
  }
  function renderKpis(list) {
    if (!cfg.summary) return;
    const box = $('kpis');
    box.hidden = state.mode === 'board' || !metricsShown();
    if (box.hidden) return;
    $('kpis-track').innerHTML = cfg
      .summary(list)
      .map(([label, value, tip]) => `<div class="kpi tip"><div class="kpi__head"><span class="kpi__label">${esc(label)}</span><span class="kpi__info" aria-hidden="true">ⓘ</span><span class="kpi__more" aria-hidden="true">⋮</span></div><div class="kpi__value">${esc(value)}</div>${tip ? `<span class="tip__text">${esc(tip)}</span>` : ''}</div>`)
      .join('');
  }

  // ---------- Kanban board ("Vista de panel") ----------
  const ACT_ICON = { email: '✉', call: '☏', task: '☑', meeting: '▦', note: '✎' };
  function renderBoard(list) {
    const board = $('kanban');
    const isBoard = state.mode === 'board' && cfg.board;
    $('table-wrap').hidden = isBoard;
    root.querySelector('.pager').hidden = isBoard;
    $('board-save-btn').hidden = !isBoard;
    root.querySelectorAll('.seg__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.action === `mode-${state.mode}`));
    board.hidden = !isBoard;
    if (!isBoard) return;
    const b = cfg.board;
    const groups = boardGroups();
    // Card properties chosen in Configuración › Objetos › Personalización del índice replace the default lines.
    let cardKeys = null;
    try { const saved = JSON.parse(localStorage.getItem(`crm:${cfg.type}:boardcard`)); if (Array.isArray(saved) && saved.length) cardKeys = saved; } catch { /* ignore */ }
    const linesOf = (r) => (cardKeys ? cardKeys.map((k) => { const c = cfg.columns.find((x) => x.key === k); const p = props[k]; const label = (c && c.label) || (p && p.label) || k; const v = c && c.text ? c.text(r) : r[k]; return [label, v === undefined || v === null || v === '' ? '--' : String(v)]; }) : b.lines(r));
    const anyCollapsed = groups.some(([v]) => state.boardCollapsed.has(String(v)));
    board.innerHTML = groups
      .map(([value, label], gi) => {
        const rows = list.filter((r) => String(r[b.key]) === String(value));
        if (state.boardCollapsed.has(String(value))) {
          return `
        <section class="kcol kcol--collapsed tip" data-group="${esc(value)}">
          <button class="kcol__expand" type="button" data-kcol-expand="${esc(value)}" aria-label="Expandir etapa ${esc(label)}">
            <span class="kcol__vlabel">${esc(label)}</span><span class="kcol__vcount">${rows.length}</span>
          </button>
          <span class="tip__text">Expandir etapa</span>
        </section>`;
        }
        return `
        <section class="kcol" data-group="${esc(value)}">
          <header class="kcol__head">
            <h2>${esc(label)} <span class="kcol__count">${rows.length}</span></h2>
            ${b.sum ? `<span class="kcol__sum" title="Total de la etapa">${esc(b.sum(rows))}</span>` : ''}
            ${b.weighted ? `<span class="kcol__sum kcol__sum--weighted" title="Cantidad neta (ponderada): importe de la etapa × probabilidad de cierre">${esc(b.weighted(rows))}</span>` : ''}
            <span class="kcol__tools">
              <div class="menu">
                <button class="kcol__tool" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Opciones de la etapa">⋮</button>
                <div class="menu__panel menu__panel--right">
                  <button class="menu__item" type="button" data-kcol-move="-1" data-group="${esc(value)}" ${gi === 0 ? 'disabled' : ''}>← Mover etapa a la izquierda</button>
                  <button class="menu__item" type="button" data-kcol-move="1" data-group="${esc(value)}" ${gi === groups.length - 1 ? 'disabled' : ''}>→ Mover etapa a la derecha</button>
                  <button class="menu__item" type="button" data-kcol-collapse="${esc(value)}">Contraer etapa</button>
                  <button class="menu__item" type="button" data-kcol-collapse-others="${esc(value)}">Contraer las demás etapas</button>
                  <button class="menu__item" type="button" data-kcol-expand-all ${anyCollapsed ? '' : 'disabled'}>Expandir todas las etapas</button>
                  <button class="menu__item" type="button" data-kcol-reset ${state.boardOrder ? '' : 'disabled'}>Restablecer orden de etapas</button>
                  <a class="menu__item" href="../settings/#obj-${cfg.type}">Editar etapas ↗</a>
                </div>
              </div>
              <span class="tip"><button class="kcol__tool" type="button" data-kcol-collapse="${esc(value)}" aria-label="Contraer etapa">‹</button><span class="tip__text">Contraer etapa</span></span>
            </span>
          </header>
          <button class="kcol__add" type="button" data-kcol-add="${esc(value)}">+ ${esc(cfg.singular)}</button>
          <div class="kcol__cards">
            ${rows
              .slice(0, 60)
              .map((r) => {
                const sub = b.sub ? b.sub(r) : null;
                const when = r.lastActivity || r.created;
                return `
              <article class="kcard" draggable="true" data-id="${r.id}">
                <div class="kcard__top">
                  <a class="kcard__name" href="./record/?id=${r.id}">${esc(r.name)}</a>
                  <span class="kcard__clock" title="Última actividad: ${formatDate(when)}" aria-label="Última actividad ${formatDate(when)}">◷</span>
                </div>
                <div class="kcard__lines">${linesOf(r).map(([k, v]) => `<div><span class="kcard__k">${esc(k)}:</span> ${esc(v)}</div>`).join('')}</div>
                ${sub && sub.name ? `<div class="kcard__sub"><span class="avatar avatar--xs avatar--soft" aria-hidden="true">${esc(String(sub.name).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase())}</span><a href="${sub.href || '#'}">${esc(sub.name)}</a></div>` : ''}
                <span class="kcard__pill"><span class="kcard__pill-ico">${ACT_ICON[r.lastActivityType] || '✉'}</span> ${relativeTime(when)} <span class="kcard__pill-sep">|</span> <span class="kcard__info" title="Tiempo desde la última actividad">ⓘ</span></span>
                <div class="kcard__actions">
                  <button type="button" data-preview="${r.id}" title="Vista previa" aria-label="Vista previa">▭</button>
                  <button type="button" data-kai="${r.id}" title="Resumen" aria-label="Resumen"><span class="ai-spark">✦</span></button>
                  <a href="./record/?id=${r.id}#email" title="Correo" aria-label="Correo">✉</a>
                  <a href="./record/?id=${r.id}#note" title="Nota" aria-label="Nota">✎</a>
                </div>
              </article>`;
              })
              .join('')}
            ${rows.length > 60 ? `<p class="muted kcol__more">… y ${rows.length - 60} más. Usa los filtros para acotar.</p>` : ''}
          </div>
        </section>`;
      })
      .join('');
    wireMenus(board);
  }
  // Stage groups may depend on the current state (e.g. the selected deal pipeline).
  const groupsOf = () => (typeof cfg.board.groups === 'function' ? cfg.board.groups(state) : cfg.board.groups);
  // Column order of the board: saved order first, then any stage added later, in catalogue order.
  function boardGroups() {
    const groups = groupsOf();
    if (!state.boardOrder) return groups;
    const byKey = new Map(groups.map((g) => [String(g[0]), g]));
    const ordered = state.boardOrder.map((k) => byKey.get(String(k))).filter(Boolean);
    groups.forEach((g) => { if (!ordered.includes(g)) ordered.push(g); });
    return ordered;
  }
  function persistBoard() {
    setPrefs(cfg.type, { boardCollapsed: [...state.boardCollapsed], boardOrder: state.boardOrder });
  }
  function moveStage(value, dir) {
    const order = boardGroups().map((g) => String(g[0]));
    const i = order.indexOf(String(value));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    state.boardOrder = order;
    persistBoard();
    render();
    const label = (groupsOf().find((g) => String(g[0]) === String(value)) || [value, value])[1];
    toast(`Etapa "${label}" movida ${dir < 0 ? 'a la izquierda' : 'a la derecha'}`);
  }
  let pendingCreate = null;
  function setMode(mode) {
    state.mode = mode;
    setPrefs(cfg.type, { mode });
    render();
  }
  {
    const board = $('kanban');
    let dragId = null;
    board.addEventListener('click', (e) => {
      const pv = e.target.closest('[data-preview]');
      if (pv) { openPreview(pv.dataset.preview); return; }
      const col = e.target.closest('[data-kcol-collapse]');
      if (col) { closeMenus(); state.boardCollapsed.add(col.dataset.kcolCollapse); persistBoard(); render(); return; }
      const others = e.target.closest('[data-kcol-collapse-others]');
      if (others) { closeMenus(); boardGroups().forEach(([v]) => { if (String(v) !== others.dataset.kcolCollapseOthers) state.boardCollapsed.add(String(v)); }); persistBoard(); render(); return; }
      const exp = e.target.closest('[data-kcol-expand]');
      if (exp) { state.boardCollapsed.delete(exp.dataset.kcolExpand); persistBoard(); render(); return; }
      if (e.target.closest('[data-kcol-expand-all]')) { closeMenus(); state.boardCollapsed.clear(); persistBoard(); render(); return; }
      if (e.target.closest('[data-kcol-reset]')) { closeMenus(); state.boardOrder = null; persistBoard(); render(); toast('Orden de etapas restablecido'); return; }
      const mv = e.target.closest('[data-kcol-move]');
      if (mv) { closeMenus(); moveStage(mv.dataset.group, Number(mv.dataset.kcolMove)); return; }
      const add = e.target.closest('[data-kcol-add]');
      if (add) { createEntry({ [cfg.board.key]: add.dataset.kcolAdd }); return; }
      const ai = e.target.closest('[data-kai]');
      if (ai) {
        const r = recordById(ai.dataset.kai);
        toast(`${r.name}: última actividad ${relativeTime(r.lastActivity || r.created)}. Sugerencia: registrar el resultado y programar el siguiente paso.`);
      }
    });
    board.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.kcard');
      if (!card) return;
      dragId = card.dataset.id;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    board.addEventListener('dragend', () => {
      board.querySelectorAll('.is-dragging, .is-over').forEach((el2) => el2.classList.remove('is-dragging', 'is-over'));
      dragId = null;
    });
    board.addEventListener('dragover', (e) => {
      const colEl = e.target.closest('.kcol');
      if (!colEl || !dragId) return;
      e.preventDefault();
      board.querySelectorAll('.is-over').forEach((el2) => el2.classList.remove('is-over'));
      colEl.classList.add('is-over');
    });
    board.addEventListener('drop', (e) => {
      const colEl = e.target.closest('.kcol');
      if (!colEl || !dragId) return;
      e.preventDefault();
      const r = recordById(dragId);
      const value = colEl.dataset.group;
      if (r && String(r[cfg.board.key]) !== value) {
        // Pipeline rules (deals) may refuse the move.
        const refusal = cfg.board.canMove ? cfg.board.canMove(r, String(r[cfg.board.key]), value) : null;
        if (refusal) {
          toast(refusal);
        } else {
          setField(cfg.type, dragId, cfg.board.key, value);
          const label = (groupsOf().find((g) => String(g[0]) === value) || [value, value])[1];
          toast(`${r.name} movido a "${label}"`);
          if (cfg.board.onMove) cfg.board.onMove(r, value, label);
        }
      }
      dragId = null;
      render();
    });
  }

  // ---------- column reorder (drag header) and resize (drag edge) ----------
  const guide = $('col-guide');
  const ghost = $('col-ghost');
  const wrap = $('table-wrap');
  function persistLayout() {
    const v = viewById(state.viewId);
    if (v && v.standard) setPrefs(cfg.type, { columns: state.columns });
    setPrefs(cfg.type, { widths: state.widths });
  }
  function showGuideAt(clientX) {
    const wr = wrap.getBoundingClientRect();
    guide.hidden = false;
    guide.style.left = `${clientX - wr.left + wrap.scrollLeft}px`;
    guide.style.height = `${Math.min(wrap.scrollHeight, wrap.clientHeight)}px`;
  }
  function hideGuide() {
    guide.hidden = true;
    ghost.hidden = true;
    document.body.classList.remove('is-col-resizing', 'is-col-dragging');
  }

  let drag = null;
  let suppressSortClick = false;
  headRow.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const handle = e.target.closest('[data-resize]');
    if (handle) {
      e.preventDefault();
      const key = handle.dataset.resize;
      const th = handle.closest('th');
      const i = Number(th.dataset.index);
      drag = { kind: 'resize', key, startX: e.clientX, startW: widthOf(key, i), th, colEl: $('colgroup').querySelector(`col[data-key="${key}"]`) };
      document.body.classList.add('is-col-resizing');
      showGuideAt(th.getBoundingClientRect().right);
      return;
    }
    if (e.target.closest('.th__menu, .menu__panel')) return;
    const th = e.target.closest('th.th');
    if (!th) return;
    drag = { kind: 'maybe-move', key: th.dataset.key, startX: e.clientX, startY: e.clientY, th };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.kind === 'resize') {
      const w = Math.max(MIN_W, Math.round(drag.startW + (e.clientX - drag.startX)));
      drag.newW = w;
      state.widths = { ...state.widths, [drag.key]: w };
      fitColumns();
      showGuideAt(drag.th.getBoundingClientRect().right);
      return;
    }
    if (drag.kind === 'maybe-move') {
      if (Math.abs(e.clientX - drag.startX) < 6 && Math.abs(e.clientY - drag.startY) < 6) return;
      drag.kind = 'move';
      document.body.classList.add('is-col-dragging');
      ghost.hidden = false;
      ghost.textContent = `${(col(drag.key) || { label: drag.key }).label} ⇅`;
      drag.th.classList.add('is-dragging');
    }
    if (drag.kind === 'move') {
      const wr = wrap.getBoundingClientRect();
      ghost.style.left = `${e.clientX - wr.left + wrap.scrollLeft + 12}px`;
      ghost.style.top = `${e.clientY - wr.top + wrap.scrollTop - 18}px`;
      const ths = [...headRow.querySelectorAll('th.th')];
      let target = ths.length;
      let x = ths.length ? ths[ths.length - 1].getBoundingClientRect().right : wr.left;
      for (let i = 0; i < ths.length; i += 1) {
        const r = ths[i].getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) {
          target = i;
          x = r.left;
          break;
        }
      }
      drag.target = target;
      showGuideAt(x);
    }
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === 'resize') {
      hideGuide();
      if (d.newW && d.newW !== d.startW) {
        const after = { ...state.widths, [d.key]: d.newW };
        state.widths = { ...state.widths };
        delete state.widths[d.key];
        if (d.startW !== naturalWidth(d.key, Number(d.th.dataset.index))) state.widths[d.key] = d.startW;
        pushLayout();
        state.widths = after;
        persistLayout();
      }
      render();
      return;
    }
    if (d.kind === 'move') {
      suppressSortClick = true;
      setTimeout(() => { suppressSortClick = false; }, 0);
      d.th.classList.remove('is-dragging');
      hideGuide();
      const from = state.columns.indexOf(d.key);
      let to = d.target;
      if (to === undefined || to === from || to === from + 1) {
        render();
        return;
      }
      pushLayout();
      const next = state.columns.slice();
      next.splice(from, 1);
      if (to > from) to -= 1;
      next.splice(to, 0, d.key);
      state.columns = next;
      persistLayout();
      render();
      toast(`Columna "${(col(d.key) || { label: d.key }).label}" movida`);
    }
  });
  headRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-col]');
    if (!b) return;
    const key = b.dataset.key;
    const i = state.columns.indexOf(key);
    closeMenus();
    const a = b.dataset.col;
    if (a === 'asc' || a === 'desc') {
      state.sort = { key, dir: a === 'asc' ? 1 : -1 };
    } else if (a === 'left' || a === 'right') {
      const j = a === 'left' ? i - 1 : i + 1;
      if (j < 0 || j >= state.columns.length) return;
      pushLayout();
      const next = state.columns.slice();
      [next[i], next[j]] = [next[j], next[i]];
      state.columns = next;
      persistLayout();
    } else if (a === 'autosize') {
      pushLayout();
      const w = { ...state.widths };
      delete w[key];
      state.widths = w;
      persistLayout();
    } else if (a === 'hide') {
      if (state.columns.length <= 1) return;
      pushLayout();
      state.columns = state.columns.filter((k) => k !== key);
      if (state.frozenCount > state.columns.length) setFrozenCount(state.columns.length);
      persistLayout();
      toast(`Columna "${labelOf(key)}" eliminada de la vista. Puedes volver a añadirla desde "Agregar columna".`);
    } else if (a === 'filter') {
      // "Filtrar por esta columna": a new condition on this property, in the first group of the advanced filters.
      state.advanced = state.advanced.filter((c) => c.key);
      const g = state.advanced.length ? Math.min(...state.advanced.map((c) => Number(c.group) || 0)) : 0;
      state.advanced.push({ key, op: opsFor(ownGroup(key))[0][0], value: '', value2: '', group: g, assoc: '', label: '' });
      renderAdvRows();
      openDrawer('adv-drawer');
      const last = [...$('adv-groups').querySelectorAll('.advc')].pop();
      const target = last && last.querySelector('[data-k="value"]');
      if (target && !target.disabled) target.focus();
      return;
    } else if (a === 'info') {
      openColumnInfo(key);
      return;
    } else if (a === 'highlight') {
      openHighlightPop(key, b.closest('th'));
      return;
    } else if (a === 'freeze') {
      // Freeze everything up to this column; on a frozen column, release it (and the ones to its right).
      const wasFrozen = i < state.frozenCount;
      setFrozenCount(wasFrozen ? i : i + 1);
      toast(wasFrozen ? `Columna "${labelOf(key)}" liberada` : `${state.frozenCount} columna${state.frozenCount === 1 ? '' : 's'} inmovilizada${state.frozenCount === 1 ? '' : 's'} a la izquierda`);
    } else if (a === 'add') {
      openColumnEditor();
      return;
    }
    render();
  });

  // ---------- "Ver información de la columna" ----------
  const KIND_NAMES = { text: 'Texto de una línea', textarea: 'Texto de varias líneas', enum: 'Lista desplegable', number: 'Número', currency: 'Moneda', percent: 'Porcentaje', date: 'Selector de fecha', datetime: 'Fecha y hora', user: 'Usuario de la cuenta', bool: 'Casilla de verificación', email: 'Correo', phone: 'Número de teléfono', url: 'URL', id: 'Identificador', stage: 'Etapa del pipeline', status: 'Estado', priority: 'Prioridad' };
  function openColumnInfo(key) {
    const c = col(key);
    const p = props[key];
    const rows = cfg.rows();
    const values = rows.map((r) => (c ? cellText(c, r) : r[key])).map((v) => (v === undefined || v === null ? '' : String(v)));
    const filled = values.filter((v) => v !== '' && v !== '—' && v !== '--').length;
    const distinct = [...new Set(values.filter((v) => v !== '' && v !== '—' && v !== '--'))];
    const pct = rows.length ? Math.round((filled / rows.length) * 100) : 0;
    const h = state.highlights[key];
    $('colinfo-title').textContent = labelOf(key);
    $('colinfo-body').innerHTML = `
      <dl class="colinfo">
        <div><dt>Nombre</dt><dd>${esc(labelOf(key))}</dd></div>
        <div><dt>Nombre interno</dt><dd><code>${esc(key)}</code></dd></div>
        <div><dt>Tipo de campo</dt><dd>${esc(p ? KIND_NAMES[p.kind] || p.kind : key.startsWith('assoc_') ? 'Asociación' : 'Calculado')}</dd></div>
        <div><dt>Grupo</dt><dd>${esc(p ? p.group : 'Información de ' + plural)}</dd></div>
        <div><dt>Quién la rellena</dt><dd>${isSystem(key) ? '<span class="lockmark"></span>El sistema, automáticamente · solo lectura' : isEditable(key) ? 'El usuario (se puede editar en la tabla y en la ficha)' : 'Se calcula a partir de otros registros'}</dd></div>
        ${p && Array.isArray(p.options) && p.options.length ? `<div><dt>Opciones</dt><dd>${p.options.length}: ${esc(p.options.slice(0, 6).map((o) => (Array.isArray(o) ? o[1] : o)).join(', '))}${p.options.length > 6 ? '…' : ''}</dd></div>` : ''}
        <div><dt>Registros con valor</dt><dd>${filled} de ${rows.length} (${pct} %)<span class="colinfo__bar"><span style="width:${pct}%"></span></span></dd></div>
        <div><dt>Valores distintos</dt><dd>${distinct.length}${distinct.length ? ` · p. ej. ${esc(distinct.slice(0, 3).join(' · '))}` : ''}</dd></div>
        <div><dt>Orden actual</dt><dd>${state.sort.key === key ? (state.sort.dir > 0 ? 'Ascendente' : 'Descendente') : 'Sin ordenar por esta columna'}</dd></div>
        <div><dt>Resaltado condicional</dt><dd>${h ? `Escala de color ${hlStyleName(h.style).toLowerCase()} (de menos a más)` : 'Sin resaltado'}</dd></div>
        <div><dt>Columna fija</dt><dd>${state.columns.indexOf(key) < state.frozenCount ? 'Sí' : 'No'}</dd></div>
      </dl>`;
    openDrawer('colinfo-dialog');
  }

  // ---------- "Editar resaltado condicional": popover under the column with the colour scale ----------
  let hlKey = null;
  let hlDraft = 'purple';
  function renderHighlightPop() {
    const shades = hlShades(hlDraft);
    $('hl-scale').innerHTML = shades.map((s) => `<span style="background:${s}"></span>`).join('');
    $('hl-styles').innerHTML = HL_STYLES.map(([k, , name]) => {
      const sh = hlShades(k);
      return `<button class="hlstyle${k === hlDraft ? ' is-selected' : ''}" type="button" data-hl-style="${k}" aria-label="${name}" aria-pressed="${k === hlDraft}" title="${name}" style="background:${sh[2]}">123</button>`;
    }).join('');
    $('hl-remove').hidden = !state.highlights[hlKey];
    const c = col(hlKey);
    const stats = c ? columnStats(filtered(), c) : null;
    $('hl-note').textContent = stats && stats.numeric
      ? 'Los valores se basan en todos los datos de esta columna'
      : 'Esta columna no tiene valores numéricos ni fechas: todas las celdas con valor se resaltan por igual';
  }
  function placeHighlightPop(anchor) {
    const pop = $('hl-pop');
    const r = anchor.getBoundingClientRect();
    const width = pop.offsetWidth || 320;
    const viewport = window.innerWidth || document.documentElement.clientWidth || 1440;
    pop.style.top = `${r.bottom + 2}px`;
    pop.style.left = `${Math.max(8, Math.min(r.right - width, viewport - width - 8))}px`;
  }
  function openHighlightPop(key, anchor) {
    hlKey = key;
    hlDraft = state.highlights[key] ? state.highlights[key].style : 'purple';
    renderHighlightPop();
    const pop = $('hl-pop');
    pop.hidden = false;
    pop.setAttribute('aria-hidden', 'false');
    pop.dataset.key = key;
    if (anchor) placeHighlightPop(anchor);
  }
  function closeHighlightPop() {
    const pop = $('hl-pop');
    pop.hidden = true;
    pop.setAttribute('aria-hidden', 'true');
  }
  $('hl-pop').addEventListener('click', (e) => {
    e.stopPropagation();
    const style = e.target.closest('[data-hl-style]');
    if (style) {
      hlDraft = style.dataset.hlStyle;
      renderHighlightPop();
      return;
    }
    if (e.target.closest('[data-hl-close]')) closeHighlightPop();
    else if (e.target.closest('[data-hl-apply]')) {
      state.highlights = { ...state.highlights, [hlKey]: { style: hlDraft } };
      setPrefs(cfg.type, { highlights: state.highlights });
      closeHighlightPop();
      render();
      toast(`Resaltado ${hlStyleName(hlDraft).toLowerCase()} aplicado a "${labelOf(hlKey)}"`);
    } else if (e.target.closest('[data-hl-remove]')) {
      const next = { ...state.highlights };
      delete next[hlKey];
      state.highlights = next;
      setPrefs(cfg.type, { highlights: state.highlights });
      closeHighlightPop();
      render();
      toast('Resaltado eliminado');
    }
  });
  // Clicking anywhere else closes the popover (the menu item that opens it is excluded, since that same click bubbles here).
  document.addEventListener('click', (e) => {
    if ($('hl-pop').hidden || e.target.closest('#hl-pop, [data-col="highlight"]')) return;
    closeHighlightPop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('hl-pop').hidden) closeHighlightPop();
  });
  wrap.addEventListener('scroll', () => { if (!$('hl-pop').hidden) closeHighlightPop(); });
  function undoLayout() {
    const prev = layoutHistory.pop();
    if (!prev) return;
    state.columns = prev.columns;
    state.widths = prev.widths;
    persistLayout();
    render();
    toast('Cambio de columnas deshecho');
  }

  // ---------- inline cell editing ----------
  const READ_ONLY = new Set(['created', 'hs_object_id', 'lastActivity', 'hs_lastmodifieddate', 'lastmodifieddate', ...(cfg.readOnly || [])]);
  // System-filled properties (counters, dates, analytics, scores…) are read-only everywhere.
  const isSystem = (key) => READ_ONLY.has(key) || Boolean(props[key] && props[key].system);
  function isEditable(key) {
    if (isSystem(key)) return false;
    const explicit = cfg.columns.find((c) => c.key === key);
    if (explicit && explicit.editable === false) return false;
    return Boolean((cfg.editors && cfg.editors[key]) || props[key] || key === 'name');
  }
  function editorKind(key) {
    if (cfg.editors && cfg.editors[key]) return { kind: 'select', options: cfg.editors[key] };
    const p = props[key];
    if (!p) return { kind: 'text' };
    if (['enum', 'user', 'bool'].includes(p.kind)) return { kind: 'select', options: (p.options || []).map((o) => [o, o]) };
    if (p.kind === 'phone') return { kind: 'phone' };
    if (p.kind === 'email') return { kind: 'email' };
    if (['number', 'currency', 'percent'].includes(p.kind)) return { kind: 'number' };
    if (p.kind === 'date' || p.kind === 'datetime') return { kind: 'date' };
    if (p.kind === 'url') return { kind: 'url' };
    if (key === 'description' || key === 'message') return { kind: 'textarea' };
    return { kind: 'text' };
  }
  const COUNTRIES = [['+34', 'ES', '🇪🇸'], ['+1', 'US', '🇺🇸'], ['+52', 'MX', '🇲🇽'], ['+54', 'AR', '🇦🇷'], ['+57', 'CO', '🇨🇴'], ['+56', 'CL', '🇨🇱'], ['+51', 'PE', '🇵🇪'], ['+351', 'PT', '🇵🇹'], ['+44', 'GB', '🇬🇧'], ['+49', 'DE', '🇩🇪'], ['+33', 'FR', '🇫🇷']];
  function parsePhone(v) {
    const s = String(v || '');
    const ext = (s.match(/ext\.?\s*(\d+)/i) || [])[1] || '';
    const main = s.replace(/,?\s*ext\.?\s*\d+/i, '');
    const dialMatch = main.match(/^\s*\+(\d{1,3})/);
    let dial = dialMatch ? `+${dialMatch[1]}` : '';
    if (dial && !COUNTRIES.some((c) => c[0] === dial)) {
      const found = COUNTRIES.find((c) => dial.startsWith(c[0]));
      dial = found ? found[0] : dial;
    }
    const digits = (dial ? main.slice(main.indexOf(dial) + dial.length) : main).replace(/\D/g, '');
    return { dial: dial || '+34', digits, ext };
  }
  function formatPhone(dial, digits, ext) {
    const groups = digits.length === 9 ? digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : digits.length === 10 ? digits.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3') : digits;
    return `${dial} ${groups}${ext ? `, ext. ${ext}` : ''}`.trim();
  }
  let cell = null; // { id, key, td }
  const pop = $('cellpop');
  function placePopover(td) {
    const rect = td.getBoundingClientRect();
    pop.hidden = false;
    pop.style.left = '0px';
    pop.style.top = '0px';
    const w = pop.offsetWidth || 560;
    const h = pop.offsetHeight || 240;
    let left = rect.right + 12;
    if (left + w > window.innerWidth - 16) left = Math.max(16, rect.left - w - 12);
    if (left + w > window.innerWidth - 16) left = Math.max(16, window.innerWidth - w - 16);
    let top = rect.top - 24;
    if (top + h > window.innerHeight - 16) top = Math.max(16, window.innerHeight - h - 16);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
  function openCellEditor(td) {
    const key = td.dataset.key;
    const r = recordById(td.dataset.id);
    if (!r) return;
    const c = col(key);
    const ek = editorKind(key);
    cell = { id: Number(r.id), key, td, kind: ek.kind, raw: false };
    document.querySelectorAll('td.is-editing').forEach((x) => x.classList.remove('is-editing'));
    td.classList.add('is-editing');
    $('cellpop-title').textContent = `Editar ${c ? c.label : key}`;
    const v = r[key] ?? '';
    let body = '';
    if (ek.kind === 'phone') {
      const ph = parsePhone(v);
      body = `
        <div class="phonebox" id="phonebox">
          <div class="phonebox__row">
            <div class="menu phonebox__cc">
              <button class="phonebox__ccbtn" type="button" aria-haspopup="true" id="cc-btn"><span id="cc-flag">${(COUNTRIES.find((x) => x[0] === ph.dial) || COUNTRIES[0])[2]}</span> <span class="caret"></span></button>
              <div class="menu__panel" id="cc-menu">${COUNTRIES.map(([d, c2, f]) => `<button class="menu__item" type="button" data-cc="${d}">${f} ${c2} (${d})</button>`).join('')}</div>
            </div>
            <input class="phonebox__num" id="cp-phone" type="tel" value="${esc(ph.digits)}" placeholder="Número" aria-label="Número" />
            <input class="phonebox__ext" id="cp-ext" type="text" value="${esc(ph.ext)}" placeholder="Extensión" aria-label="Extensión" />
          </div>
          <p class="phonebox__err" id="cp-err" hidden>Este número de teléfono no es válido o tiene un formato incorrecto.</p>
        </div>
        <input type="hidden" id="cp-dial" value="${esc(ph.dial)}" />
        <button class="link-btn cellpop__raw" type="button" data-cp="raw" id="cp-raw">Eliminar formato de número <span class="info" title="Guarda el número tal cual lo escribes, sin prefijo ni formato.">ⓘ</span></button>`;
    } else if (ek.kind === 'select') {
      body = `<select class="cellpop__input" id="cp-value"><option value="">--</option>${ek.options.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    } else if (ek.kind === 'textarea') {
      body = `<textarea class="cellpop__input" id="cp-value" rows="4">${esc(v)}</textarea>`;
    } else if (ek.kind === 'date') {
      body = `<input class="cellpop__input" id="cp-value" type="date" value="${v ? new Date(v).toISOString().slice(0, 10) : ''}" />`;
    } else if (ek.kind === 'number') {
      body = `<input class="cellpop__input" id="cp-value" type="number" value="${esc(v)}" />`;
    } else if (ek.kind === 'email') {
      body = `<input class="cellpop__input" id="cp-value" type="email" value="${esc(v)}" placeholder="nombre@empresa.com" /><p class="phonebox__err" id="cp-err" hidden>Introduce una dirección de correo válida.</p>`;
    } else if (ek.kind === 'url') {
      body = `<input class="cellpop__input" id="cp-value" type="url" value="${esc(v)}" placeholder="https://" />`;
    } else {
      body = `<input class="cellpop__input" id="cp-value" type="text" value="${esc(v)}" />`;
    }
    $('cellpop-body').innerHTML = body;
    $('cellpop-save').disabled = true;
    cell.initial = currentValue();
    placePopover(td);
    wireMenus(pop);
    const first = pop.querySelector('#cp-phone, #cp-value');
    if (first) {
      first.focus();
      if (first.select) first.select();
    }
    validate();
  }
  function currentValue() {
    if (!cell) return '';
    if (cell.kind === 'phone') {
      const digits = ($('cp-phone').value || '').replace(/\D/g, '');
      const ext = ($('cp-ext').value || '').trim();
      if (cell.raw) return `${$('cp-phone').value.trim()}${ext ? `, ext. ${ext}` : ''}`;
      return digits ? formatPhone($('cp-dial').value, digits, ext) : '';
    }
    const el = $('cp-value');
    if (!el) return '';
    if (el.type === 'number') return el.value === '' ? '' : Number(el.value);
    if (el.type === 'date') return el.value ? new Date(el.value).toISOString() : '';
    return el.value.trim();
  }
  function validate() {
    if (!cell) return false;
    let ok = true;
    if (cell.kind === 'phone') {
      const digits = ($('cp-phone').value || '').replace(/\D/g, '');
      ok = cell.raw ? true : digits.length === 0 || (digits.length >= 7 && digits.length <= 15 && !/^0+$/.test(digits));
      $('cp-err').hidden = ok;
      $('cc-btn').classList.toggle('is-invalid', !ok);
      $('cc-flag').textContent = ok ? (COUNTRIES.find((x) => x[0] === $('cp-dial').value) || COUNTRIES[0])[2] : '⚠';
    } else if (cell.kind === 'email') {
      const val = $('cp-value').value.trim();
      ok = val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      $('cp-err').hidden = ok;
    }
    const changed = JSON.stringify(currentValue()) !== JSON.stringify(cell.initial);
    $('cellpop-save').disabled = !(ok && changed);
    return ok;
  }
  function closeCellEditor() {
    pop.hidden = true;
    document.querySelectorAll('td.is-editing').forEach((x) => x.classList.remove('is-editing'));
    cell = null;
  }
  function saveCell() {
    if (!cell || !validate()) return;
    const r = recordById(cell.id);
    const value = currentValue();
    const from = r[cell.key];
    setField(cfg.type, cell.id, cell.key, value);
    if (cell.key === 'name' && cfg.type === 'contacts') {
      const [first, ...rest] = String(value).split(' ');
      setField(cfg.type, cell.id, 'first', first);
      setField(cfg.type, cell.id, 'last', rest.join(' '));
    }
    try {
      const hk = `crm:${cfg.type}:history:${cell.id}`;
      const h = JSON.parse(localStorage.getItem(hk) || '[]');
      h.unshift({ key: cell.key, from, to: value, when: Date.now(), who: 'Tú' });
      localStorage.setItem(hk, JSON.stringify(h));
    } catch { /* ignore */ }
    const label = (col(cell.key) || { label: cell.key }).label;
    closeCellEditor();
    render();
    toast(`"${label}" actualizado`);
  }
  pop.addEventListener('click', (e) => {
    const cc = e.target.closest('[data-cc]');
    if (cc) {
      $('cp-dial').value = cc.dataset.cc;
      closeMenus();
      validate();
      return;
    }
    const b = e.target.closest('[data-cp]');
    if (!b) return;
    if (b.dataset.cp === 'close') closeCellEditor();
    else if (b.dataset.cp === 'save') saveCell();
    else if (b.dataset.cp === 'raw') {
      cell.raw = !cell.raw;
      $('phonebox').classList.toggle('is-raw', cell.raw);
      $('cp-raw').firstChild.textContent = cell.raw ? 'Aplicar formato de número ' : 'Eliminar formato de número ';
      validate();
    }
  });
  pop.addEventListener('input', validate);
  pop.addEventListener('change', validate);
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      saveCell();
    }
    if (e.key === 'Escape') closeCellEditor();
  });
  document.addEventListener('click', (e) => {
    if (!cell) return;
    if (pop.contains(e.target) || e.target.closest('td.is-editing')) return;
    closeCellEditor();
  });
  window.addEventListener('resize', () => {
    if (cell) placePopover(cell.td);
    fitColumns();
  });
  // Shadow on the frozen column once the table is scrolled sideways, so it reads as "fixed" and not as cut off.
  wrap.addEventListener('scroll', () => {
    wrap.classList.toggle('is-scrolled', wrap.scrollLeft > 0);
    closeMenus();
  });
  // The header's ⋮ panel would be clipped by the scrolling table, so it is pinned to the viewport
  // (right-aligned with its button) just before the generic menu toggle opens it.
  headRow.addEventListener(
    'click',
    (e) => {
      const more = e.target.closest('.th__more');
      if (!more) return;
      const panel = more.parentElement.querySelector('.menu__panel');
      if (!panel) return;
      const r = more.getBoundingClientRect();
      const width = panel.offsetWidth || 250;
      const viewport = window.innerWidth || document.documentElement.clientWidth || 1440;
      panel.style.position = 'fixed';
      panel.style.top = `${r.bottom + 4}px`;
      panel.style.left = `${Math.max(8, Math.min(r.right - width, viewport - width - 8))}px`;
      panel.style.right = 'auto';
    },
    true,
  );

  // ---------- preview panel ----------
  function recordById(rid) {
    return cfg.rows().find((r) => Number(r.id) === Number(rid));
  }
  function renderPreview() {
    const panel = $('preview');
    const r = state.previewId ? recordById(state.previewId) : null;
    const open = Boolean(r);
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    root.querySelector('.lpage').classList.toggle('has-preview', open);
    if (!r) return;
    const name = r.name || `#${r.id}`;
    const av = $('pv-avatar');
    av.textContent = String(name).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    $('pv-name').textContent = name;
    $('pv-sub').textContent = cfg.type === 'contacts' ? r.company || '' : cfg.type === 'deals' ? `${formatMoney(r.amount, r.deal_currency_code)} · ${r.company || ''}` : r.industry || r.description || r.type || '';
    const mail = r.email || r.domain || '';
    $('pv-mail').innerHTML = mail ? `<a href="${mail.includes('@') ? `mailto:${esc(mail)}` : '#'}">${esc(mail)}</a> <span class="ext">↗</span> <button class="copy" type="button" data-copy="${esc(mail)}" aria-label="Copiar">⧉</button>` : '';
    $('pv-type').textContent = cfg.singular[0].toUpperCase() + cfg.singular.slice(1);
    // The preview panel layout comes from Configuración › Objetos › Previsualizar personalización when saved there.
    let pvLayout = null;
    try { const saved = JSON.parse(localStorage.getItem(`crm:${cfg.type}:preview:default`)); if (saved && Array.isArray(saved.right) && Array.isArray(saved.props)) pvLayout = saved; } catch { /* ignore */ }
    const fields = pvLayout ? pvLayout.props : cfg.previewFields || state.columns.slice(0, 10);
    $('pv-props').closest('.preview__about').hidden = Boolean(pvLayout) && !pvLayout.right.includes('about');
    $('pv-extra').innerHTML = pvLayout
      ? pvLayout.right.filter((c) => c !== 'about').map((c) => {
          if (c.startsWith('assoc-')) {
            const kind = c.slice(6);
            const label = { contacts: 'Contactos', companies: 'Empresas', deals: 'Negocios', tickets: 'Tickets', tasks: 'Tareas' }[kind] || kind;
            const related = kind === 'companies' ? (r.company ? [{ name: r.company, href: `../companies/record/?id=${r.companyId || ''}` }] : []) : kind === 'contacts' ? (r.contact ? [{ name: r.contact, href: `../contacts/record/?id=${r.contactId || ''}` }] : r.contactId && ALL.contacts ? ALL.contacts().filter((x) => Number(x.id) === Number(r.contactId)).map((x) => ({ name: x.name, href: `../contacts/record/?id=${x.id}` })) : (ALL.contacts ? ALL.contacts().filter((x) => (cfg.type === 'companies' ? Number(x.companyId) === Number(r.id) : false)).slice(0, 3).map((x) => ({ name: x.name, href: `../contacts/record/?id=${x.id}` })) : [])) : (ALL[kind] ? ALL[kind]().filter((x) => (cfg.type === 'contacts' ? Number(x.contactId) === Number(r.id) : cfg.type === 'companies' ? Number(x.companyId) === Number(r.id) : r.contactId ? Number(x.contactId) === Number(r.contactId) : false)).slice(0, 3).map((x) => ({ name: x.name, href: `../${kind}/record/?id=${x.id}` })) : []);
            return `<section class="pvcard"><h3 class="pvcard__title">${label} <span class="muted">(${related.length})</span></h3>${related.length ? `<ul class="pvcard__list">${related.map((x) => `<li><a href="${x.href}">${esc(x.name)}</a></li>`).join('')}</ul>` : '<p class="muted">Sin registros asociados.</p>'}</section>`;
          }
          if (c === 'upcoming') { const ts = ALL.tasks ? ALL.tasks().filter((t) => t.status !== 'done' && (cfg.type === 'contacts' ? Number(t.contactId) === Number(r.id) : cfg.type === 'tasks' ? Number(t.id) === Number(r.id) : t.owner === r.owner)).sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 3) : []; return `<section class="pvcard"><h3 class="pvcard__title">Próximas actividades <span class="muted">(${ts.length})</span></h3>${ts.length ? `<ul class="pvcard__list">${ts.map((t) => `<li><a href="../tasks/record/?id=${t.id}">${esc(t.name)}</a> <span class="muted">· ${esc(formatDate(t.due))}</span></li>`).join('')}</ul>` : '<p class="muted">No hay actividades programadas.</p>'}</section>`; }
          if (c === 'activity') return `<section class="pvcard"><h3 class="pvcard__title">Actividades recientes</h3><p>${esc(relativeTime(r.lastActivity || r.created))} · ${esc({ email: 'Correo', call: 'Llamada', meeting: 'Reunión', note: 'Nota', task: 'Tarea' }[r.lastActivityType] || 'Actividad')}</p><p class="muted">Creado el ${esc(formatDate(r.created))}</p></section>`;
          if (c === 'summary') return `<section class="pvcard"><h3 class="pvcard__title">Resumen de registros <span class="ai-badge">✦ AI</span></h3><p class="muted">${esc(r.name)} · propietario ${esc(r.owner || 'sin asignar')} · última actividad ${esc(relativeTime(r.lastActivity || r.created))}.</p></section>`;
          if (c === 'attachments') { let n = 0; try { n = (JSON.parse(localStorage.getItem(`crm:${cfg.type}:files:${r.id}`)) || []).length; } catch { n = 0; } return `<section class="pvcard"><h3 class="pvcard__title">Archivos adjuntos <span class="muted">(${n})</span></h3><p class="muted">${n ? `${n} archivo${n > 1 ? 's' : ''} adjunto${n > 1 ? 's' : ''}.` : 'Sin archivos adjuntos.'}</p></section>`; }
          if (c === 'tasks') { const ts = ALL.tasks ? ALL.tasks().filter((t) => t.status !== 'done' && (cfg.type === 'contacts' ? Number(t.contactId) === Number(r.id) : t.owner === r.owner)).slice(0, 3) : []; return `<section class="pvcard"><h3 class="pvcard__title">Tareas <span class="muted">(${ts.length})</span></h3>${ts.length ? `<ul class="pvcard__list">${ts.map((t) => `<li><a href="../tasks/record/?id=${t.id}">${esc(t.name)}</a></li>`).join('')}</ul>` : '<p class="muted">Sin tareas pendientes.</p>'}</section>`; }
          if (c.startsWith('pcard-') && pvLayout.cards && pvLayout.cards[c]) {
            // Custom property card created in the preview editor.
            const card = pvLayout.cards[c];
            const rows = (card.props || []).map((key) => { const col0 = col(key); const label = col0 ? col0.label : props[key] ? props[key].label : key; const v = col0 ? cellText(col0, r) : r[key]; const isUser = key === 'owner' || (props[key] && props[key].kind === 'user'); return `<div class="props__row"><dt>${esc(label)}</dt><dd>${isUser ? ownerHtml(v, 'sm') : v === '' || v === undefined || v === null ? '<span class="muted">--</span>' : kindForLink(key) ? linkHtml(kindForLink(key), String(r[key] ?? v)) : esc(v)}</dd></div>`; }).join('');
            return `<section class="pvcard"><h3 class="pvcard__title">${esc(card.label)}</h3><dl class="props">${rows || '<p class="muted">Sin propiedades.</p>'}</dl></section>`;
          }
          return '';
        }).join('')
      : '';
    $('pv-props').innerHTML = fields
      .map((f) => {
        const key = Array.isArray(f) ? f[0] : f;
        const c = col(key);
        const label = Array.isArray(f) ? f[1] : c ? c.label : key;
        const v = c ? cellText(c, r) : r[key];
        const isUser = key === 'owner' || (props[key] && props[key].kind === 'user');
        return `<div class="props__row"><dt>${label}</dt><dd>${isUser ? ownerHtml(v, 'sm') : v === '' || v === undefined || v === null ? '<span class="muted">--</span>' : esc(v)}</dd></div>`;
      })
      .join('');
    $('pv-open').href = `./record/?id=${r.id}`;
    $('pv-open-item').href = `./record/?id=${r.id}`;
    $('pv-props-item').href = `./record/?id=${r.id}#advanced`;
    wireMenus(panel);
  }
  function openPreview(rid) {
    state.previewId = Number(rid);
    render();
  }
  function closePreview() {
    state.previewId = null;
    render();
  }
  $('preview').addEventListener('click', (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      navigator.clipboard?.writeText(cp.dataset.copy);
      toast('Copiado');
      return;
    }
    const b = e.target.closest('[data-pv]');
    if (!b) return;
    const r = recordById(state.previewId);
    const a = b.dataset.pv;
    closeMenus();
    if (a === 'close') closePreview();
    else if (a === 'toggle') $('preview').querySelector('.preview__about').classList.toggle('is-collapsed');
    else if (a === 'copy-link') {
      navigator.clipboard?.writeText(`${location.origin}${location.pathname}record/?id=${r.id}`);
      toast('Enlace copiado');
    } else if (a === 'follow') toast(`Ahora sigues a ${r.name}`);
    else if (a === 'clone') {
      const copy = { ...r, name: `${r.name} (copia)` };
      delete copy.id;
      delete copy.created;
      addRecord(cfg.type, copy);
      toast(`${cfg.singular} clonado`);
      render();
    } else if (a === 'delete') {
      if (window.confirm(`¿Eliminar "${r.name}"?`)) {
        deleteRecords(cfg.type, [r.id]);
        closePreview();
        toast('Registro eliminado. Puedes restaurarlo desde ⋮ › Restaurar registros eliminados.');
      }
    } else if (a === 'export') {
      download(`${cfg.singular}-${r.id}.csv`, toCsv([r], visibleColumns()));
      toast('Exportado a CSV');
    } else if (['note', 'email', 'call', 'task', 'meeting'].includes(a)) {
      location.href = `./record/?id=${r.id}#${a}`;
    } else if (a === 'more') toast('Más acciones: Mensaje de WhatsApp, Registrar actividad, Programar reunión.');
  });

  // ---------- drawers ----------
  const openDrawer = (id) => {
    const d = $(id);
    d.classList.add('is-open');
    d.setAttribute('aria-hidden', 'false');
    const first = d.querySelector('input:not([type=checkbox]), select, textarea');
    if (first) first.focus();
  };
  const closeDrawer = (id) => {
    const d = $(id);
    d.classList.remove('is-open');
    d.setAttribute('aria-hidden', 'true');
  };
  root.querySelectorAll('.drawer').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) closeDrawer(d.id);
    });
  });

  // ---------- column editor ----------
  let draft = [];
  let draftFrozen = true;
  let colQuery = '';
  const openGroups = new Set();

  function renderColumnEditor() {
    const q = strip(colQuery);
    const total = allKeys().length;
    $('col-hint').textContent = q ? '' : `${total} propiedades disponibles. Marca una para añadirla como columna.`;
    const groupHtml = groups
      .map((grp) => {
        const items = grp.items.filter(([k, l]) => !q || strip(l).includes(q) || strip(k).includes(q));
        if (!items.length) return '';
        const open = q || openGroups.has(grp.title);
        return `
          <section class="colgrp${open ? ' is-open' : ''}">
            <button class="colgrp__head" type="button" data-group="${esc(grp.title)}">
              <span class="colgrp__chev">${open ? '▾' : '▸'}</span>${grp.title}
              <span class="muted">${items.length}</span>
            </button>
            <div class="colgrp__items">
              ${items
                .map(
                  ([k, l]) => `<label class="colopt"><input type="checkbox" data-key="${k}" ${draft.includes(k) ? 'checked' : ''} /><span>${l}</span></label>`,
                )
                .join('')}
            </div>
          </section>`;
      })
      .join('');
    const extra = cfg.columns.filter((c) => !props[c.key] && (!q || strip(c.label).includes(q)));
    $('col-groups').innerHTML =
      groupHtml +
      (extra.length
        ? `<section class="colgrp is-open"><button class="colgrp__head" type="button"><span class="colgrp__chev">▾</span>Otras columnas <span class="muted">${extra.length}</span></button><div class="colgrp__items">${extra
            .map((c) => `<label class="colopt"><input type="checkbox" data-key="${c.key}" ${draft.includes(c.key) ? 'checked' : ''} /><span>${c.label}</span></label>`)
            .join('')}</div></section>`
        : '') ||
      '<p class="muted">Ninguna propiedad coincide con la búsqueda.</p>';

    $('col-count').textContent = String(draft.length);
    $('col-freeze').checked = draftFrozen;
    $('col-selected').innerHTML = draft
      .map(
        (k, i) => `
        <li class="colsel${i === 0 && draftFrozen ? ' is-frozen' : ''}" draggable="true" data-key="${k}">
          <span class="colsel__grip" aria-hidden="true">⋮⋮</span>
          <span class="colsel__label">${labelOf(k)}${i === 0 && draftFrozen ? ' <span class="muted">· fija</span>' : ''}</span>
          <span class="colsel__btns">
            <button type="button" data-move="-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" data-move="1" aria-label="Bajar" ${i === draft.length - 1 ? 'disabled' : ''}>▼</button>
            <button type="button" data-remove aria-label="Quitar" ${draft.length === 1 ? 'disabled' : ''}>×</button>
          </span>
        </li>`,
      )
      .join('');
  }

  $('col-search').addEventListener('input', (e) => {
    colQuery = e.target.value.trim();
    renderColumnEditor();
  });
  $('col-groups').addEventListener('click', (e) => {
    const head = e.target.closest('[data-group]');
    if (head) {
      const t = head.dataset.group;
      if (openGroups.has(t)) openGroups.delete(t);
      else openGroups.add(t);
      renderColumnEditor();
    }
  });
  $('col-groups').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-key]');
    if (!cb) return;
    const k = cb.dataset.key;
    if (cb.checked && !draft.includes(k)) draft.push(k);
    if (!cb.checked) {
      if (draft.length === 1) {
        toast('Debe quedar al menos una columna');
      } else {
        draft = draft.filter((x) => x !== k);
      }
    }
    renderColumnEditor();
  });
  $('col-freeze').addEventListener('change', (e) => {
    draftFrozen = e.target.checked;
    renderColumnEditor();
  });
  $('col-selected').addEventListener('click', (e) => {
    const li = e.target.closest('.colsel');
    if (!li) return;
    const k = li.dataset.key;
    const i = draft.indexOf(k);
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const j = i + Number(mv.dataset.move);
      if (j < 0 || j >= draft.length) return;
      [draft[i], draft[j]] = [draft[j], draft[i]];
      renderColumnEditor();
    } else if (e.target.closest('[data-remove]') && draft.length > 1) {
      draft.splice(i, 1);
      renderColumnEditor();
    }
  });
  let dragKey = null;
  $('col-selected').addEventListener('dragstart', (e) => {
    const li = e.target.closest('.colsel');
    if (!li) return;
    dragKey = li.dataset.key;
    li.classList.add('is-dragging');
  });
  $('col-selected').addEventListener('dragover', (e) => {
    const li = e.target.closest('.colsel');
    if (!li || !dragKey || li.dataset.key === dragKey) return;
    e.preventDefault();
    const from = draft.indexOf(dragKey);
    const to = draft.indexOf(li.dataset.key);
    draft.splice(from, 1);
    draft.splice(to, 0, dragKey);
    renderColumnEditor();
    $('col-selected').querySelector(`[data-key="${dragKey}"]`)?.classList.add('is-dragging');
  });
  $('col-selected').addEventListener('dragend', () => {
    dragKey = null;
    renderColumnEditor();
  });
  function openColumnEditor() {
    draft = state.columns.slice();
    draftFrozen = state.frozen;
    colQuery = '';
    $('col-search').value = '';
    if (groups[0]) openGroups.add(groups[0].title);
    renderColumnEditor();
    openDrawer('columns-drawer');
  }
  $('columns-apply').addEventListener('click', () => {
    pushLayout();
    state.columns = draft.slice();
    setFrozenCount(draftFrozen ? Math.max(1, state.frozenCount) : 0);
    const v = viewById(state.viewId);
    if (v && v.standard) setPrefs(cfg.type, { columns: state.columns });
    closeDrawer('columns-drawer');
    render();
    toast(`${state.columns.length} columnas aplicadas`);
  });
  $('columns-reset').addEventListener('click', () => {
    draft = defaultColumns.slice();
    draftFrozen = true;
    renderColumnEditor();
  });

  // ---------- advanced filters (shared editor: filter-editor.js) ----------
  const ownValueOptions = (key) => {
    const p = props[key];
    if (p && Array.isArray(p.options) && p.options.length && ['enum', 'user', 'bool'].includes(p.kind)) return p.options.map((o) => (Array.isArray(o) ? [o[1], o[1]] : [o, o]));
    const f = cfg.filters.find((x) => x.key === key);
    if (f && f.options) return f.options.map(([, l]) => [l, l]);
    return null;
  };
  // The editor works on the advanced block; the "Asociación" section keeps its own conditions (section: 'assoc').
  const advEditor = createFilterEditor({
    type: cfg.type,
    container: $('adv-groups'),
    summary: $('adv-summary'),
    get: () => state.advanced.filter((c) => c.section !== 'assoc'),
    set: (c) => { state.advanced = [...state.advanced.filter((x) => x.section === 'assoc'), ...c]; },
    ownValueOptions,
    fallbackKind: (key) => ownKind(key),
    extraProperties: cfg.columns.filter((c) => !props[c.key]).map((c) => [c.key, c.label]),
    singular: SINGULAR[cfg.type] || cfg.singular || cfg.title,
  });
  // ---------- "Todos los filtros": the association section and the add-filter popover ----------
  const assocChoices = associationsFor(cfg.type);
  function renderAssocRows() {
    const box = $('allf-assoc-rows');
    if (!box) return;
    const rows = state.advanced.filter((c) => c.section === 'assoc');
    box.innerHTML = rows.length
      ? rows.map((c) => {
        const i = state.advanced.indexOf(c);
        const mode = c.op === 'filled' ? 'any' : 'name';
        return `<div class="allf__assoc" data-i="${i}">
          <select data-ak="assoc" aria-label="Objeto asociado">${assocChoices.map((a) => `<option value="${a.key}" ${c.assoc === a.key ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select>
          <select data-ak="mode" aria-label="Condición"><option value="any" ${mode === 'any' ? 'selected' : ''}>está asociado a cualquiera</option><option value="name" ${mode === 'name' ? 'selected' : ''}>está asociado a registros cuyo nombre contiene</option></select>
          <button class="icon-btn" type="button" data-ak="rm" aria-label="Quitar filtro de asociación">×</button>
          <input class="allf__assoc-value" data-ak="value" type="text" value="${esc(Array.isArray(c.value) ? c.value.join('; ') : c.value)}" placeholder="Nombre del registro asociado…" aria-label="Nombre" ${mode === 'name' ? '' : 'hidden'} />
        </div>`;
      }).join('')
      : '<p class="muted allf__none">Sin filtros de asociación.</p>';
  }
  const KIND_ICON = (kind) => { const g = kindGroup(kind); return g === 'date' ? ['📅', 'date', 'Fecha'] : g === 'number' ? ['#', 'number', 'Número'] : g === 'bool' ? ['☑', 'bool', 'Casilla'] : g === 'enum' ? ['≡', 'enum', 'Lista'] : ['Abc', 'text', 'Texto']; };
  function renderPropPop(q = '') {
    const listEl = $('allf-pop-list');
    if (!listEl) return;
    const needle = strip(q);
    const groups = propertyGroups(cfg.type).map((g) => ({ title: g.title, items: g.items.filter(([k, l]) => !needle || strip(l).includes(needle) || strip(k).includes(needle)) })).filter((g) => g.items.length);
    listEl.innerHTML = groups.length
      ? groups.map((g) => `<div class="allf__cat">${esc(g.title)}</div>${g.items.map(([k, l]) => { const [glyph, cls, title] = KIND_ICON(ownKind(k)); return `<button class="allf__prop" type="button" data-allf-prop="${esc(k)}"><span class="allf__ico allf__ico--${cls}" title="${title}">${glyph}</span><span>${esc(l)}</span></button>`; }).join('')}`).join('')
      : '<p class="muted allf__empty">Ninguna propiedad coincide con la búsqueda.</p>';
  }
  function togglePropPop(open) {
    const pop = $('allf-pop');
    if (!pop) return;
    const show = open === undefined ? pop.hidden : open;
    pop.hidden = !show;
    $('allf-add').setAttribute('aria-expanded', String(show));
    if (show) { $('allf-q').value = ''; renderPropPop(''); setTimeout(() => $('allf-q').focus(), 0); }
  }
  // "+ Agregar filtro": the chosen property becomes a condition of the last group (filters stack with Y).
  function addFilterFor(key) {
    const own = state.advanced.filter((c) => c.section !== 'assoc');
    const target = own.length ? Math.max(...own.map((c) => Number(c.group) || 0)) : 0;
    const cond = { ...newCondition(target), key, op: opsFor(ownGroup(key))[0][0] };
    const blank = state.advanced.findIndex((c) => c.section !== 'assoc' && !c.key && (Number(c.group) || 0) === target);
    if (blank >= 0) state.advanced[blank] = cond; else state.advanced.push(cond);
    renderAdvRows();
    togglePropPop(false);
    const row = [...$('adv-groups').querySelectorAll('.advc')].pop();
    row?.querySelector('[data-k="op"]')?.focus();
  }
  const renderAdvRows = () => { advEditor.render(); renderAssocRows(); };
  $('adv-drawer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-allf]');
    if (b) {
      e.preventDefault();
      if (b.dataset.allf === 'add') togglePropPop();
      else if (b.dataset.allf === 'add-assoc') {
        if (!assocChoices.length) { toast('Este objeto no tiene asociaciones que filtrar'); return; }
        state.advanced.push({ ...newCondition(0), assoc: assocChoices[0].key, key: 'name', op: 'filled', section: 'assoc' });
        renderAssocRows();
      }
      return;
    }
    const prop = e.target.closest('[data-allf-prop]');
    if (prop) { addFilterFor(prop.dataset.allfProp); return; }
    const rm = e.target.closest('[data-ak="rm"]');
    if (rm) { state.advanced.splice(Number(rm.closest('.allf__assoc').dataset.i), 1); renderAssocRows(); return; }
    if (!e.target.closest('.allf__addwrap')) togglePropPop(false);
  });
  $('adv-drawer').addEventListener('input', (e) => {
    if (e.target.id === 'allf-q') { renderPropPop(e.target.value); return; }
    const row = e.target.closest('.allf__assoc');
    if (!row || !e.target.dataset.ak) return;
    const c = state.advanced[Number(row.dataset.i)];
    if (!c) return;
    const k = e.target.dataset.ak;
    if (k === 'assoc') c.assoc = e.target.value;
    else if (k === 'mode') { c.op = e.target.value === 'any' ? 'filled' : 'contains'; renderAssocRows(); }
    else if (k === 'value') c.value = e.target.value;
  });
  $('adv-add-group').addEventListener('click', () => advEditor.addGroup());
  $('adv-apply').addEventListener('click', () => {
    state.page = 1;
    closeDrawer('adv-drawer');
    render();
  });
  $('adv-clear').addEventListener('click', () => {
    state.advanced = [];
    state.filters = {};
    state.page = 1;
    renderAdvRows();
    render();
  });

  // ---------- pipeline selector + summary strip events ----------
  if (cfg.pipeline) {
    const menu = $('pipeline-menu');
    menu.addEventListener('click', (e) => {
      const it = e.target.closest('[data-pipeline]');
      if (it) {
        state.pipeline = it.dataset.pipeline;
        setPrefs(cfg.type, { pipeline: state.pipeline });
        state.page = 1;
        pipelineQuery = '';
        $('pipeline-q').value = '';
        closeMenus();
        render();
        return;
      }
      if (e.target.closest('.pmenu__search')) e.stopPropagation();
    });
    $('pipeline-q').addEventListener('input', (e) => {
      pipelineQuery = e.target.value;
      renderPipeline();
    });
    $('pipeline-pill').addEventListener('click', () => {
      setTimeout(() => { if (menu.closest('.menu').classList.contains('is-open')) $('pipeline-q').focus(); }, 0);
    });
  }
  if (cfg.summary) {
    $('kpis').addEventListener('click', (e) => {
      const nav = e.target.closest('[data-action^="kpis-"]');
      if (!nav) return;
      e.stopPropagation();
      $('kpis-track').scrollBy({ left: nav.dataset.action === 'kpis-next' ? 320 : -320, behavior: 'smooth' });
    });
  }
  // Opens the create drawer with the current pipeline (and any extra values) already filled in.
  function openCreate(prefill) {
    pendingCreate = { ...(cfg.pipeline && state.pipeline ? { [cfg.pipeline.key]: state.pipeline } : {}), ...(prefill || {}) };
    if (!Object.keys(pendingCreate).length) pendingCreate = null;
    const form = $('create-form');
    Object.entries(pendingCreate || {}).forEach(([k, v]) => { const field = form.elements[k]; if (field) field.value = v; });
    openDrawer('create-drawer');
  }
  // A page may bring its own create panel (contacts: the original's slide-over); the generic drawer otherwise.
  const createEntry = (prefill) => (cfg.openCreate ? cfg.openCreate(prefill) : openCreate(prefill));

  // ---------- bulk actions (the original's bar over the table) ----------
  // Properties a bulk edit may set: editable catalogue properties with the list's own option lists.
  function bulkEditProps() {
    const skip = new Set(['name', 'email', 'first', 'last', 'created', 'hs_object_id', 'hs_import_ids', 'domain', 'hs_additional_emails', 'hs_additional_domains', ...(cfg.readOnly || [])]);
    const kinds = new Set(['text', 'enum', 'user', 'phone', 'number', 'priority', 'status', 'stage', 'url', 'bool', 'currency']);
    const out = [];
    Object.keys(cfg.editors || {}).forEach((key) => { if (!skip.has(key)) out.push({ key, label: (props[key] && props[key].label) || (cfg.columns.find((c) => c.key === key) || { label: key }).label, kind: 'enum', options: cfg.editors[key] }); });
    Object.values(props).forEach((p) => {
      if (skip.has(p.key) || out.some((x) => x.key === p.key) || !kinds.has(p.kind) || p.system || isSystem(p.key)) return;
      const options = Array.isArray(p.options) && p.options.length ? p.options.map((o) => (Array.isArray(o) ? [o[0], o[1]] : [o, o])) : p.kind === 'bool' ? [['Sí', 'Sí'], ['No', 'No']] : null;
      out.push({ key: p.key, label: p.label, kind: p.kind, options });
    });
    return out;
  }
  // One small dialog for every bulk action: body fields, Aplicar / Cancelar; onOk may return false to keep it open.
  let bulkOnOk = null;
  let bulkOnChange = null;
  function bulkModal() {
    let m = $('bulk-modal');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'bmodal';
    m.id = 'bulk-modal';
    m.setAttribute('aria-hidden', 'true');
    m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div>
      <div class="bmodal__panel" role="dialog" aria-modal="true" aria-labelledby="bulk-modal-title">
        <div class="bmodal__head"><h3 id="bulk-modal-title"></h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div>
        <form class="bmodal__body" id="bulk-form" novalidate></form>
        <div class="bmodal__foot"><button class="btn btn--primary" type="submit" form="bulk-form" id="bulk-ok">Aplicar</button><button class="btn btn--ghost" type="button" data-bm="close">Cancelar</button></div>
      </div>`;
    root.appendChild(m);
    const close = () => { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); bulkOnOk = null; bulkOnChange = null; };
    m.addEventListener('click', (e) => { if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); close(); } });
    m.querySelector('#bulk-form').addEventListener('change', (e) => { if (e.target.dataset.bm && bulkOnChange) bulkOnChange(m.querySelector('#bulk-form')); });
    m.querySelector('#bulk-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      const keep = bulkOnOk ? bulkOnOk(d) === false : false;
      if (!keep) close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) close(); });
    return m;
  }
  function bulkDialog({ title, body, okLabel = 'Aplicar', danger = false, onOk, onChange }) {
    const m = bulkModal();
    m.querySelector('#bulk-modal-title').textContent = title;
    m.querySelector('#bulk-form').innerHTML = body;
    const ok = m.querySelector('#bulk-ok');
    ok.textContent = okLabel;
    ok.className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`;
    bulkOnOk = onOk;
    bulkOnChange = onChange || null;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    setTimeout(() => m.querySelector('#bulk-form input, #bulk-form select')?.focus(), 0);
  }

  // ---------- create ----------
  $('create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    if (pendingCreate) Object.entries(pendingCreate).forEach(([k, v]) => { if (!data[k]) data[k] = v; });
    pendingCreate = null;
    const rec = addRecord(cfg.type, cfg.normalize ? cfg.normalize(data) : data);
    e.target.reset();
    closeDrawer('create-drawer');
    activateView(stdId(cfg.views[0].key));
    toast(`${cfg.singular} creado`);
    if (cfg.afterCreate) cfg.afterCreate(rec);
  });

  // ---------- events ----------
  $('views-bar').addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close-tab]');
    if (closeBtn) {
      closeTab(closeBtn.dataset.closeTab);
      return;
    }
    const open = e.target.closest('[data-open-view]');
    if (open) {
      closeMenus();
      activateView(open.dataset.openView);
      return;
    }
    const tab = e.target.closest('button.views__tab[data-view]');
    if (tab && tab.dataset.view !== state.viewId) {
      if (isDirty() && !window.confirm('Tienes cambios sin guardar en esta vista. ¿Cambiar de vista y descartarlos?')) return;
      activateView(tab.dataset.view);
    }
  });
  $('views-bar').addEventListener('input', (e) => {
    if (e.target.id !== 'picker-search') return;
    const q = strip(e.target.value.trim());
    $('views-bar').querySelectorAll('.picker__item').forEach((b) => {
      b.hidden = Boolean(q) && !b.dataset.name.includes(q);
    });
    $('views-bar').querySelectorAll('.picker__group').forEach((g) => {
      g.hidden = [...g.querySelectorAll('.picker__item')].every((b) => b.hidden);
    });
  });
  $('views-bar').addEventListener('click', (e) => {
    if (e.target.closest('#picker-search')) e.stopPropagation();
  });
  // drag to reorder tabs
  let dragTab = null;
  $('views-bar').addEventListener('dragstart', (e) => {
    const w = e.target.closest('.views__tabwrap');
    if (!w) return;
    dragTab = w.dataset.view;
  });
  $('views-bar').addEventListener('dragover', (e) => {
    const w = e.target.closest('.views__tabwrap');
    if (!w || !dragTab || w.dataset.view === dragTab) return;
    e.preventDefault();
  });
  $('views-bar').addEventListener('drop', (e) => {
    const w = e.target.closest('.views__tabwrap');
    if (!w || !dragTab) return;
    const from = store.open.indexOf(dragTab);
    const to = store.open.indexOf(w.dataset.view);
    store.open.splice(from, 1);
    store.open.splice(to, 0, dragTab);
    dragTab = null;
    persist();
    render();
  });
  $('allviews-drawer').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open-view]');
    if (!open) return;
    e.preventDefault();
    closeMenus();
    closeDrawer('allviews-drawer');
    activateView(open.dataset.openView);
  });
  $('filter-bar').addEventListener('click', (e) => {
    const clear = e.target.closest('[data-filter-clear]');
    if (clear) { delete state.filters[clear.dataset.filterClear]; state.page = 1; render(); return; }
    const item = e.target.closest('.menu__item[data-filter]');
    if (!item) return;
    state.filters[item.dataset.filter] = item.dataset.value;
    state.page = 1;
    closeMenus();
    render();
  });
  $('row-search').addEventListener('input', (e) => {
    state.q = e.target.value.trim();
    state.page = 1;
    render();
  });
  headRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (!b) return;
    if (suppressSortClick) return;
    const key = b.dataset.sort;
    if (state.sort.key === key) state.sort.dir *= -1;
    else state.sort = { key, dir: 1 };
    render();
  });
  headRow.addEventListener('change', (e) => {
    if (e.target.id !== 'check-all') return;
    tbody.querySelectorAll('.row-check').forEach((cb) => {
      const id = Number(cb.dataset.id);
      if (e.target.checked) state.selected.add(id);
      else state.selected.delete(id);
    });
    render();
  });
  tbody.addEventListener('change', (e) => {
    const cb = e.target.closest('.row-check');
    if (!cb) return;
    const id = Number(cb.dataset.id);
    if (cb.checked) state.selected.add(id);
    else state.selected.delete(id);
    render();
  });
  $('prev').addEventListener('click', () => { state.page -= 1; render(); });
  $('next').addEventListener('click', () => { state.page += 1; render(); });
  $('pager-nums').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    state.page = Number(b.dataset.page);
    render();
  });
  root.querySelector('.pager__sizemenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (!b) return;
    state.size = Number(b.dataset.size);
    setPrefs(cfg.type, { size: state.size });
    state.page = 1;
    closeMenus();
    render();
  });
  $('sort-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (!b) return;
    const key = b.dataset.sort;
    if (state.sort.key === key) state.sort.dir *= -1;
    else state.sort = { key, dir: 1 };
    closeMenus();
    render();
  });
  tbody.addEventListener('click', (e) => {
    const pv = e.target.closest('[data-preview]');
    if (pv) {
      e.preventDefault();
      openPreview(pv.dataset.preview);
      return;
    }
    if (!e.target.closest('a, input, button, select')) {
      const td = e.target.closest('td.cell--editable');
      if (td) openCellEditor(td);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      $('row-search').focus();
    }
    if (e.key === 'Escape' && state.previewId) closePreview();
  });

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    e.preventDefault();
    const a = el.dataset.action;
    closeMenus();
    if (a === 'create') createEntry();
    else if (a === 'columns') openColumnEditor();
    else if (a === 'advanced') { renderAdvRows(); openDrawer('adv-drawer'); }
    else if (a === 'import') { location.href = `../data/?from=${cfg.type}`; } // imports live in Gestión de datos › Integración de datos, as in the original
    else if (a === 'export' || a === 'bulk-export') {
      const list = filtered().filter((r) => a === 'export' || state.selected.has(Number(r.id)));
      download(`${cfg.type}-${TODAY.toISOString().slice(0, 10)}.csv`, toCsv(list, visibleColumns()));
      toast(`${list.length} registro(s) exportados a CSV`);
    } else if (a === 'delete') {
      const n = state.selected.size;
      bulkDialog({
        title: `Eliminar ${bulkN(n)}`,
        body: `<p>Se eliminará${n === 1 ? '' : 'n'} <strong>${n}</strong> ${n === 1 ? bulkNoun.singular : bulkNoun.plural} ${bulkWord(n, 'seleccionad')}. Podrás restaurar los registros desde ⋮ › Restaurar registros eliminados.</p>`,
        okLabel: `Eliminar ${bulkN(n)}`,
        danger: true,
        onOk: () => {
          deleteRecords(cfg.type, [...state.selected]);
          toast(`${bulkN(n)} ${bulkWord(n, 'eliminad')}. Puedes restaurar los registros desde ⋮ › Restaurar registros eliminados.`);
          state.selected.clear();
          render();
        },
      });
    } else if (a === 'bulk-clear') {
      state.selected.clear();
      render();
    } else if (a === 'bulk-select-view') {
      filtered().forEach((r) => state.selected.add(Number(r.id)));
      render();
    } else if (a === 'bulk-assign') {
      const n = state.selected.size;
      const owners = (cfg.editors && cfg.editors.owner) || OWNERS.map((o) => [o, o]);
      bulkDialog({
        title: `Asignar ${n} ${n === 1 ? bulkNoun.singular : bulkNoun.plural}`,
        body: `<label class="field"><span>Propietario</span><select name="owner">${owners.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label><p class="muted">Se cambia el propietario de los ${n === 1 ? bulkNoun.singular : bulkNoun.plural} seleccionados.</p>`,
        okLabel: 'Asignar',
        onOk: (d) => {
          state.selected.forEach((id) => setField(cfg.type, id, 'owner', d.owner));
          toast(`${bulkN(n)} ${bulkWord(n, 'asignad')} a ${d.owner}`);
          state.selected.clear();
          render();
        },
      });
    } else if (a === 'bulk-edit') {
      const n = state.selected.size;
      const choices = bulkEditProps();
      const valueField = (key) => {
        const p = choices.find((x) => x.key === key) || choices[0];
        if (!p) return '';
        return p.options
          ? `<label class="field" id="bulk-value-wrap"><span>Nuevo valor</span><select name="value">${p.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`
          : `<label class="field" id="bulk-value-wrap"><span>Nuevo valor</span><input name="value" type="${p.kind === 'number' ? 'number' : 'text'}" autocomplete="off" /></label>`;
      };
      bulkDialog({
        title: `Editar ${n} ${n === 1 ? bulkNoun.singular : bulkNoun.plural}`,
        body: `<label class="field"><span>Propiedad</span><select name="key" data-bm="prop">${choices.map((p) => `<option value="${esc(p.key)}">${esc(p.label)}</option>`).join('')}</select></label>${valueField(choices[0] && choices[0].key)}<p class="muted">El valor se aplica a todos los ${n === 1 ? bulkNoun.singular : bulkNoun.plural} seleccionados.</p>`,
        okLabel: 'Actualizar',
        onChange: (form) => { const wrap = form.querySelector('#bulk-value-wrap'); if (wrap) wrap.outerHTML = valueField(form.elements.key.value); },
        onOk: (d) => {
          const p = choices.find((x) => x.key === d.key);
          if (!p) return false;
          const value = p.kind === 'number' ? Number(d.value) : d.value;
          state.selected.forEach((id) => setField(cfg.type, id, p.key, value));
          toast(`"${p.label}" actualizada en ${n} ${n === 1 ? bulkNoun.singular : bulkNoun.plural}`);
          state.selected.clear();
          render();
          return true;
        },
      });
    } else if (a === 'bulk-tasks') {
      const n = state.selected.size;
      const due = new Date(TODAY.getTime() + 3 * 86400000).toISOString().slice(0, 10);
      bulkDialog({
        title: `Crear ${n} ${n === 1 ? 'tarea' : 'tareas'}`,
        body: `<label class="field"><span>Título</span><input name="title" type="text" value="Seguimiento" required /></label>
          <label class="field"><span>Tipo de tarea</span><select name="type">${TASK_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
          <label class="field"><span>Fecha de vencimiento</span><input name="due" type="date" value="${due}" /></label>
          <label class="field"><span>Asignada a</span><select name="owner">${OWNERS.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>
          <p class="muted">Se crea una tarea por cada ${bulkNoun.singular} seleccionado, asociada a él.</p>`,
        okLabel: 'Crear tareas',
        onOk: (d) => {
          const rows = cfg.rows().filter((r) => state.selected.has(Number(r.id)));
          rows.forEach((r) => addRecord('tasks', { name: `${d.title.trim() || 'Seguimiento'}: ${r.name}`, type: d.type, due: d.due ? new Date(`${d.due}T09:00`).toISOString() : TODAY.toISOString(), priority: 'medium', status: 'todo', owner: d.owner, contactId: r.id, contact: r.name, lastActivity: TODAY.toISOString() }));
          toast(`${rows.length} ${rows.length === 1 ? 'tarea creada' : 'tareas creadas'}`);
          state.selected.clear();
          render();
        },
      });
    } else if (a === 'bulk-segment') {
      const n = state.selected.size;
      const statics = allSegments().filter((s) => s.object === cfg.type && s.type === 'static');
      bulkDialog({
        title: `Agregar ${n} ${n === 1 ? bulkNoun.singular : bulkNoun.plural} a un segmento`,
        body: `<label class="field"><span>Segmento estático</span><select name="segment" data-bm="segment">${statics.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}<option value="__new">Crear un segmento estático nuevo…</option></select></label>
          <label class="field" id="bulk-seg-name" ${statics.length ? 'hidden' : ''}><span>Nombre del segmento nuevo</span><input name="name" type="text" autocomplete="off" /></label>
          <p class="muted">Solo los segmentos estáticos admiten registros añadidos a mano; los activos se calculan con sus filtros.</p>`,
        okLabel: 'Agregar',
        onChange: (form) => { const wrap = form.querySelector('#bulk-seg-name'); if (wrap) wrap.hidden = form.elements.segment.value !== '__new'; },
        onOk: (d) => {
          const ids = [...state.selected];
          let name;
          if (d.segment === '__new' || !statics.length) {
            name = (d.name || '').trim();
            if (!name) { toast('Escribe el nombre del segmento nuevo'); return false; }
            addSegment({ name, object: cfg.type, type: 'static', memberIds: ids, size: ids.length });
          } else {
            const seg = statics.find((s) => String(s.id) === String(d.segment));
            name = seg ? seg.name : '';
            addStaticMembers(d.segment, ids);
          }
          toast(`${bulkN(n)} ${bulkWord(n, 'agregad')} al segmento "${name}"`);
          state.selected.clear();
          render();
          return true;
        },
      });
    } else if (a === 'restore') {
      restoreAll(cfg.type);
      toast('Registros restaurados');
      render();
    } else if (a === 'toggle-filters') {
      state.showFilters = !state.showFilters;
      setPrefs(cfg.type, { showFilters: state.showFilters });
      render();
    } else if (a === 'toggle-freeze') {
      setFrozenCount(state.frozenCount > 0 ? 0 : 1);
      render();
      toast(state.frozen ? 'La primera columna queda fija al desplazarte' : 'La primera columna ya no está fija');
    } else if (a === 'toggle-density') {
      state.density = state.density === 'compact' ? 'comfortable' : 'compact';
      setPrefs(cfg.type, { density: state.density });
      render();
      toast(state.density === 'compact' ? 'Filas compactas' : 'Filas cómodas');
    } else if (a === 'toggle-zebra') {
      state.zebra = !state.zebra;
      setPrefs(cfg.type, { zebra: state.zebra });
      render();
      toast(state.zebra ? 'Vista en zebra activada' : 'Vista en zebra desactivada');
    } else if (a === 'toggle-metrics') {
      state.metrics = !metricsShown();
      setPrefs(cfg.type, { metrics: state.metrics });
      render();
      toast(state.metrics ? 'Métricas visibles sobre la tabla' : 'Métricas ocultas');
    } else if (a === 'edit-quick') { window.location.href = `../settings/#obj-${cfg.type}:index`; }
    else if (a === 'adv-clear-all') {
      state.advanced = [];
      render();
    } else if (a === 'filters-clear-all') {
      state.advanced = [];
      state.filters = {};
      state.page = 1;
      render();
    } else if (a === 'undo-layout') undoLayout();
    else if (a === 'mode-board') setMode('board');
    else if (a === 'mode-table') setMode('table');
    else if (a === 'board-save') {
      setPrefs(cfg.type, { mode: 'board' });
      toast('Vista de panel guardada');
    }
    else if (a === 'refresh') {
      render();
      toast('Lista actualizada');
    } else if (a === 'allviews') {
      avQuery = '';
      $('allviews-search').value = '';
      renderAllViews();
      openDrawer('allviews-drawer');
    } else if (a === 'view-create') openViewDialog('create');
    else if (a === 'view-saveas') openViewDialog('saveas');
    else if (a === 'view-save') saveCurrentView();
    else if (a === 'view-discard') activateView(state.viewId);
    else if (a === 'view-rename') openViewDialog('rename', viewById(state.viewId));
    else if (a === 'view-clone') openViewDialog('clone', viewById(state.viewId));
    else if (a === 'view-share') openViewDialog('share', viewById(state.viewId));
    else if (a === 'view-close') closeTab(state.viewId);
    else if (a === 'view-reset-cols') {
      state.columns = defaultColumns.slice();
      render();
      toast('Columnas restablecidas');
    } else if (a === 'view-delete') {
      const v = viewById(state.viewId);
      if (v && !v.standard && window.confirm(`¿Eliminar la vista "${v.name}"?`)) deleteView(v.id);
    } else if (cfg.onAction) cfg.onAction(a, el);
  });

  wireMenus();
  wireLinkTooltips();
  render();
  return { render, state, filtered, setMode };
}

function fieldHtml(f) {
  if (f.type === 'select') {
    return `<label class="field"><span>${f.label}</span><select name="${f.name}">${f.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>`;
  }
  return `<label class="field"><span>${f.label}</span><input name="${f.name}" type="${f.type || 'text'}" ${f.required ? 'required' : ''} placeholder="${f.placeholder || ''}" /></label>`;
}

export const tag = (label, cls) => `<span class="tag ${cls}">${label}</span>`;

// Owner / user with a photo-style avatar (initials; grey placeholder when unassigned).
const OWNER_COLORS = ['#006162', '#0091ae', '#6a78d1', '#f2547d', '#00a4bd', '#ff7a59', '#425b76', '#7c98b6'];
export const ownerHtml = (name, size = 'xs') => {
  if (!name || name === 'Sin asignar') {
    return `<span class="owner owner--none"><span class="avatar avatar--${size} avatar--empty" aria-hidden="true">👤</span><span class="muted">Sin asignar</span></span>`;
  }
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const ini = String(name).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return `<span class="owner"><span class="avatar avatar--${size}" style="background:${OWNER_COLORS[h % OWNER_COLORS.length]}" aria-hidden="true">${esc(ini)}</span>${esc(name)}</span>`;
};
export const link = (href, text) => `<a href="${href}">${esc(text)}</a>`;
export const avatarName = (id, name, href) =>
  `<span class="name"><span class="avatar" style="background:${['#006162', '#0091ae', '#6a78d1', '#f2547d', '#00a4bd', '#ff7a59', '#425b76'][Number(id) % 7]}">${esc(
    String(name)
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase(),
  )}</span><a href="${href}">${esc(name)}</a></span>`;

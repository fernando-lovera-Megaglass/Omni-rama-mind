import { pagination, bindPagination } from './pagination.js';
import './filter-chip.js';
// Secuencias (Ventas › Secuencias): the list with its tabs — Administrar (folders, search, owner filter,
// multi-select table with per-row actions, Acciones: export / papelera), Análisis (filters as chips, metric
// cards and the performance chart computed from the enrolments), Automatizar and Programado.
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { ownerHtml } from './owner.js';
import { emptyStateHtml } from './empty-state.js';
import { relativeTimeFine, formatDate, formatMoney } from './data.js';
import { ready, sequences, trashedSequences, sequenceById, folders, owners, createFolder, cloneSequence, deleteSequences, restoreSequences, moveSequences, sequencesCsv, sequenceMetrics, bannerDismissed, dismissBanner, analytics, series, filterOptions, FILTER_KEYS, SERIES_METRICS, FREQUENCIES, scheduled, unenroll, ME } from './sequences-data.js';

boot({ root: '../', active: 'sales', sub: 'Secuencias', title: 'Secuencias' });
await ready;

const root = document.getElementById('seq-root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TABS = [['manage', 'Administrar'], ['analyze', 'Análisis'], ['automate', 'Automatizar'], ['scheduled', 'Programado']];
const state = { tab: TABS.some((t) => t[0] === params.get('tab')) ? params.get('tab') : 'manage', q: '', owner: '', page: 1, size: 25, selected: new Set(), collapsed: new Set(), filters: {}, metric: 'meetings', freq: 'week' };
const pct = (x) => `${(Math.round(x * 1000) / 10).toLocaleString('es-ES')} %`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const fullDate = (iso) => { const d = new Date(iso); return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

root.innerHTML = `
  <div class="tpls seqs">
    <header class="tpls__head">
      <h1 class="page-title page-title--with-count">Secuencias <span class="tpls__count" id="seq-count"></span></h1>
      <div class="tpls__actions">
        <div class="menu"><button class="btn btn--secondary" type="button" aria-haspopup="true">Acciones <span class="caret"></span></button><div class="menu__panel"><button class="menu__item" type="button" data-ta="export">Exportar</button><button class="menu__item" type="button" data-ta="trash">Papelera <span class="muted" id="seq-trash-n"></span></button></div></div>
        <a class="btn btn--primary" href="create/" data-ta="create">Crear secuencia</a>
      </div>
    </header>
    <nav class="seqs__tabs" role="tablist" aria-label="Secciones">${TABS.map(([k, l]) => `<button class="seqs__tab${state.tab === k ? ' is-active' : ''}" type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`).join('')}</nav>
    <div id="seq-tab"></div>
  </div>`;
const page = root.querySelector('.seqs');
wireMenus(page);

// ---------- Administrar ----------
function visible() {
  const q = state.q.trim().toLowerCase();
  return sequences().filter((s) => (!state.owner || s.ownerId === state.owner) && (!q || `${s.name} ${s.description}`.toLowerCase().includes(q)));
}
function renderManage() {
  const list = visible();
  const pages = Math.max(1, Math.ceil(list.length / state.size));
  state.page = Math.min(state.page, pages);
  const rows = list.slice((state.page - 1) * state.size, state.page * state.size);
  const byFolder = {};
  rows.forEach((s) => { (byFolder[s.folder || ''] = byFolder[s.folder || ''] || []).push(s); });
  const folderNames = [...new Set([...folders(), ...Object.keys(byFolder).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'es'));
  const row = (s) => { const m = sequenceMetrics(s.id); return `
    <tr data-id="${esc(s.id)}" class="${s.folder ? 'seqs__inFolder' : ''}">
      <td class="table__check"><input type="checkbox" data-sel="${esc(s.id)}" aria-label="Seleccionar ${esc(s.name)}" ${state.selected.has(s.id) ? 'checked' : ''} /></td>
      <td><div class="name"><a href="create/?id=${esc(s.id)}" class="tpls__name">${esc(s.name)}</a><span class="muted seqs__steps">${plural(s.steps.length, 'paso', 'pasos')}</span>
        <div class="menu tpls__rowmenu"><button class="link-btn" type="button" aria-haspopup="true">Acciones <span class="caret"></span></button><div class="menu__panel">
          <a class="menu__item" href="create/?id=${esc(s.id)}">Editar</a>
          <button class="menu__item" type="button" data-act="clone" data-id="${esc(s.id)}">Clonar</button>
          <button class="menu__item" type="button" data-act="move" data-id="${esc(s.id)}">Mover</button>
          <div class="menu__sep"></div>
          <button class="menu__item menu__item--danger" type="button" data-act="delete" data-id="${esc(s.id)}">Eliminar</button>
        </div></div></div></td>
      <td>${m.enrolled}</td><td>${pct(m.replyRate)}</td><td>${pct(m.meetingRate)}</td><td>${ownerHtml(s.ownerId)}</td>
      <td title="${esc(fullDate(s.updatedAt))}">${esc(relativeTimeFine(s.updatedAt))}</td>
    </tr>`; };
  const folderRow = (f) => `<tr class="seqs__folder" data-folder-row="${esc(f)}"><td colspan="7"><button class="seqs__foldertoggle" type="button" data-folder-toggle="${esc(f)}" aria-expanded="${!state.collapsed.has(f)}"><span class="seqs__chev">${state.collapsed.has(f) ? '›' : '⌄'}</span> <span class="seqs__folderico" aria-hidden="true">▰</span> ${esc(f)} <span class="muted">(${(byFolder[f] || []).length})</span></button></td></tr>${state.collapsed.has(f) ? '' : (byFolder[f] || []).map(row).join('')}`;
  const n = state.selected.size;
  $('seq-tab').innerHTML = `
    ${bannerDismissed() ? '' : `<div class="seqs__banner" id="seq-banner" role="status"><span class="seqs__bannerico" aria-hidden="true">✉</span><div><strong>Envía secuencias sin salir de tu bandeja de entrada.</strong> Inscribe contactos desde Gmail u Outlook con la extensión de Omni y haz el seguimiento desde aquí.</div><button class="seqs__bannerclose" type="button" data-ta="banner-close" aria-label="Cerrar">×</button></div>`}
    <section class="tpls__main">
      <div class="tpls__filters">
        <div class="search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="seq-q" placeholder="Buscar en secuencias" aria-label="Buscar en secuencias" value="${esc(state.q)}" /></div>
        <filter-chip id="seq-owner" aria-label="Propietario" owner><template><option value="">Cualquiera</option><option value="${esc(ME)}" ${state.owner === ME ? 'selected' : ''}>Yo</option>${owners().filter((o) => o !== ME).map((o) => `<option value="${esc(o)}" ${state.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</template></filter-chip>
        <button class="btn btn--secondary btn--sm" type="button" data-ta="new-folder">Nueva carpeta</button>
        <div class="tpls__bulk" id="seq-bulk">${n ? `<span>${plural(n, 'seleccionada', 'seleccionadas')}</span><button class="btn btn--secondary btn--sm" type="button" data-ta="bulk-move">Mover</button><button class="btn btn--secondary btn--sm" type="button" data-ta="bulk-delete">Eliminar</button>` : ''}</div>
      </div>
      <div class="table-wrap">
        <table class="table tpls__table seqs__table">
          <thead><tr><th class="table__check"><input type="checkbox" id="seq-check-all" aria-label="Seleccionar todo" ${rows.length && rows.every((s) => state.selected.has(s.id)) ? 'checked' : ''} /></th><th>Nombre</th><th>Total inscritos</th><th>Tasa de respuesta</th><th>Tasa de reuniones</th><th>Propietario</th><th>Fecha de modificación</th></tr></thead>
          <tbody id="seq-rows">${list.length ? `${(byFolder[''] || []).map(row).join('')}${folderNames.map(folderRow).join('')}` : `<tr><td colspan="7"><div class="tpls__empty">${emptyStateHtml({ art: 'sequences', title: sequences().length ? 'Ninguna secuencia coincide con los filtros' : 'Todavía no hay secuencias', text: sequences().length ? 'Prueba con otra búsqueda o quita los filtros para ver todas las secuencias.' : 'Una secuencia envía correos y crea tareas en el orden y los días que definas. Crea la primera y aparecerá aquí.', action: { label: 'Crear secuencia', href: 'create/', attrs: 'data-ta="create"' } })}</div></td></tr>`}</tbody>
        </table>
      </div>
      ${pagination({ page: state.page, pages, size: state.size })}
    </section>`;
  bindPagination(page, ({ page: next, size }) => { state.page = next; if (size) state.size = size; closeMenus(); renderManage(); });
  wireMenus(page);
}

// ---------- Análisis ----------
const card = (label, value, sub = '') => `<div class="seqan__card"><div class="seqan__label">${label}</div><div class="seqan__value">${value}</div>${sub ? `<div class="seqan__sub muted">${sub}</div>` : ''}</div>`;
function renderAnalyze() {
  const opts = filterOptions();
  const a = analytics(state.filters);
  const data = series(state.metric, state.freq, state.filters);
  const max = Math.max(1, ...data.map((b) => b.value));
  const W = 760; const H = 220; const pad = 28; const bw = (W - pad * 2) / data.length;
  const bars = data.map((b, i) => { const h = Math.round(((H - pad * 2) * b.value) / max); const x = pad + i * bw + bw * 0.2; const y = H - pad - h; return `<rect class="seqan__bar" x="${x}" y="${y}" width="${bw * 0.6}" height="${h}" rx="3"><title>${esc(b.label)}: ${b.value}</title></rect><text class="seqan__tick" x="${x + bw * 0.3}" y="${H - pad + 16}" text-anchor="middle">${esc(b.label)}</text>${b.value ? `<text class="seqan__val" x="${x + bw * 0.3}" y="${y - 4}" text-anchor="middle">${b.value}</text>` : ''}`; }).join('');
  const chipLabel = (k, v) => { const o = (opts[k] || []).find((x) => String(x[0]) === String(v)); return o ? o[1] : v; };
  $('seq-tab').innerHTML = `
    <section class="seqan">
      <div class="seqan__filters" id="seq-filters">
        ${FILTER_KEYS.map(([k, l]) => `<div class="menu seqan__filter"><button class="chip" type="button" aria-haspopup="true">${l}${state.filters[k] ? `: <strong>${esc(chipLabel(k, state.filters[k]))}</strong>` : ''} <span class="caret"></span></button><div class="menu__panel menu__panel--picker">${(opts[k] || []).length ? (opts[k] || []).map(([v, lab]) => `<button class="menu__item${String(state.filters[k]) === String(v) ? ' menu__item--strong' : ''}" type="button" data-filter="${k}" data-value="${esc(v)}">${esc(lab)}</button>`).join('') : '<div class="menu__note">Sin opciones</div>'}</div></div>`).join('')}
        ${Object.keys(state.filters).length ? `<div class="seqan__chips">${Object.entries(state.filters).map(([k, v]) => `<span class="seqan__chip">${esc((FILTER_KEYS.find((x) => x[0] === k) || [k, k])[1])}: ${esc(chipLabel(k, v))} <button type="button" data-unfilter="${k}" aria-label="Quitar filtro">×</button></span>`).join('')}<button class="link-btn" type="button" data-ta="clear-filters">Borrar todo</button></div>` : ''}
      </div>
      <h2 class="seqan__h">Información</h2>
      <div class="seqan__cards">
        ${card('TOTAL DE INSCRIPCIONES', a.total, `${plural(a.contacts, 'contacto', 'contactos')}`)}
        ${card('TASA DE REUNIONES', pct(a.meetingRate), `${plural(a.meetings, 'reunión', 'reuniones')}`)}
        ${card('TASA DE RESPUESTA', pct(a.replyRate), `${plural(a.replies, 'respuesta', 'respuestas')}`)}
        ${card('SIN RESPUESTA', pct(a.noReplyRate), `${plural(a.noReply, 'contacto', 'contactos')}`)}
        ${card('RESULTADOS DEL NEGOCIO', `${a.deals} <small>negocios</small>`, `${a.dealsWon} ganados · ${formatMoney(a.dealsAmount)}`)}
      </div>
      <h2 class="seqan__h">Interacción por correo</h2>
      <div class="seqan__cards seqan__cards--4">
        ${card('TASA DE APERTURA', pct(a.openRate), `${plural(a.opens, 'apertura', 'aperturas')} de ${plural(a.sent, 'correo', 'correos')}`)}
        ${card('TASA DE CLICS', pct(a.clickRate), `${plural(a.clicks, 'clic', 'clics')}`)}
        ${card('TASA DE REBOTE', pct(a.bounceRate), `${plural(a.bounces, 'rebote', 'rebotes')}`)}
        ${card('TASA DE CANCELACIÓN DE SUSCRIPCIÓN', pct(a.unsubscribeRate), `${plural(a.unsubscribes, 'cancelación', 'cancelaciones')}`)}
      </div>
      <h2 class="seqan__h">Información de la empresa</h2>
      <div class="seqan__cards seqan__cards--3">
        ${card('EMPRESAS INSCRITAS', a.companies, `${a.contactsPerCompany.toLocaleString('es-ES', { maximumFractionDigits: 1 })} contactos por empresa de promedio`)}
        ${card('TASA DE INTERACCIÓN', pct(a.companyInteractionRate), 'empresas con al menos una apertura, clic o respuesta')}
        ${card('TASA DE REUNIONES', pct(a.companyMeetingRate), 'empresas con una reunión reservada')}
      </div>
      <div class="seqan__chart">
        <div class="seqan__charthead"><h2 class="seqan__h">Rendimiento a lo largo del tiempo</h2><div class="seqan__chartctl"><select id="seq-metric" aria-label="Métrica">${SERIES_METRICS.map(([k, l]) => `<option value="${k}" ${state.metric === k ? 'selected' : ''}>${l}</option>`).join('')}</select><select id="seq-freq" aria-label="Frecuencia">${FREQUENCIES.map(([k, l]) => `<option value="${k}" ${state.freq === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <svg class="seqan__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc((SERIES_METRICS.find((m) => m[0] === state.metric) || [])[1] || '')} por periodo"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="seqan__axis" />${bars}</svg>
      </div>
    </section>`;
  wireMenus(page);
}

// ---------- Programado / Automatizar ----------
function renderScheduled() {
  const list = scheduled();
  $('seq-tab').innerHTML = `
    <section class="tpls__main">
      <div class="tpls__filters"><span class="muted">${plural(list.length, 'paso programado', 'pasos programados')} para las inscripciones activas.</span></div>
      <div class="table-wrap"><table class="table tpls__table seqs__table"><thead><tr><th>Contacto</th><th>Secuencia</th><th>Siguiente paso</th><th>Programado para</th><th>Ejecución</th><th>Inscrito por</th><th></th></tr></thead>
      <tbody id="seq-sched">${list.length ? list.map((e) => `<tr data-enr="${esc(e.id)}"><td><a class="tpls__name" href="../contacts/record/?id=${esc(e.contactId)}">${esc(e.contactName)}</a>${e.companyName ? `<span class="muted tpls__folderchip">${esc(e.companyName)}</span>` : ''}</td><td>${esc(e.sequenceName)}</td><td>${esc(e.stepLabel)}</td><td title="${esc(fullDate(e.nextStepAt))}">${esc(formatDate(new Date(e.nextStepAt)))}</td><td><span class="tag ${e.auto ? 'tag--open' : 'tag--new'}">${e.auto ? 'Automática' : 'Manual'}</span></td><td>${ownerHtml(e.enrolledBy)}</td><td><button class="link-btn" type="button" data-unenroll="${esc(e.id)}">Cancelar inscripción</button></td></tr>`).join('') : '<tr><td colspan="7"><div class="tpls__empty">No hay pasos programados.</div></td></tr>'}</tbody></table></div>
    </section>`;
}
function renderAutomate() {
  $('seq-tab').innerHTML = `
    <section class="seqauto">
      <div class="seqauto__card"><h3>Inscribir contactos automáticamente</h3><p class="muted">Crea un workflow que inscriba a los contactos en una secuencia cuando cumplan una condición (por ejemplo, al descargar el catálogo o al cambiar la etapa del lead).</p><button class="btn btn--primary btn--sm" type="button" data-ta="workflow">Crear workflow</button></div>
      <div class="seqauto__card"><h3>Cancelar la inscripción automáticamente</h3><p class="muted">Las secuencias cancelan la inscripción cuando el contacto responde, reserva una reunión o cancela la suscripción, según los criterios de exclusión de cada secuencia.</p><a class="btn btn--secondary btn--sm" href="?tab=manage" data-tab-link="manage">Ver secuencias</a></div>
      <div class="seqauto__card"><h3>Pausar los correos en fechas señaladas</h3><p class="muted">Los correos automatizados no se envían en fin de semana ni en los días festivos configurados; los retrasos se cuentan en días laborables.</p><button class="btn btn--secondary btn--sm" type="button" data-ta="holidays">Configurar días festivos</button></div>
    </section>`;
}
function render() {
  $('seq-count').textContent = plural(sequences().length, 'creado', 'creados');
  $('seq-trash-n').textContent = trashedSequences().length ? `(${trashedSequences().length})` : '';
  page.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === state.tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
  if (state.tab === 'analyze') renderAnalyze(); else if (state.tab === 'scheduled') renderScheduled(); else if (state.tab === 'automate') renderAutomate(); else renderManage();
}

// ---------- modal ----------
function modal(title, body, foot, { size = '' } = {}) {
  let m = $('seq-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal';
    m.id = 'seq-modal';
    m.setAttribute('aria-hidden', 'true');
    root.appendChild(m);
    m.addEventListener('click', onModalClick);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeModal(); });
  }
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel${size ? ` bmodal__panel--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="seq-modal-title"><div class="bmodal__head"><h3 id="seq-modal-title">${esc(title)}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><div class="bmodal__body" id="seq-modal-body">${body}</div><div class="bmodal__foot" id="seq-modal-foot">${foot}</div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  return m;
}
function closeModal() { const m = $('seq-modal'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } }
const cancelBtn = '<button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button>';
const folderOptions = (value) => `<option value="">Sin carpeta</option>${folders().map((f) => `<option value="${esc(f)}" ${f === value ? 'selected' : ''}>${esc(f)}</option>`).join('')}`;
function openTrash() {
  const list = trashedSequences();
  modal('Papelera de secuencias', list.length ? `<p class="muted">Las secuencias eliminadas se pueden restaurar durante 90 días.</p><div class="tpls__lib">${list.map((s) => `<div class="tpls__libitem"><div><strong>${esc(s.name)}</strong><p>Eliminada ${esc(relativeTimeFine(s.deletedAt))} · ${plural(s.steps.length, 'paso', 'pasos')}</p></div><button class="btn btn--secondary btn--sm" type="button" data-se="restore" data-id="${esc(s.id)}">Restaurar</button></div>`).join('')}</div>` : '<p class="muted">La papelera está vacía.</p>', '<button class="btn btn--secondary" type="button" data-bm="close">Cerrar</button>', { size: 'wide' });
}
function exportCsv() {
  const csv = sequencesCsv(visible());
  if (typeof URL.createObjectURL !== 'function') { toast('Exportación lista (CSV).'); return csv; }
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `secuencias-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 1000);
  toast(`Exportadas ${plural(visible().length, 'secuencia', 'secuencias')} a CSV.`);
  return csv;
}

// ---------- events ----------
function onModalClick(e) {
  if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); closeModal(); return; }
  const se = e.target.closest('[data-se]');
  if (!se) return;
  const a = se.dataset.se;
  if (a === 'create-folder') { const f = createFolder($('seqf-name').value); if (!f) { toast('Escribe el nombre de la carpeta.'); return; } closeModal(); render(); toast(`Carpeta «${f.name}» creada`); } else if (a === 'confirm-move') { const ids = se.dataset.ids.split(',').filter(Boolean); const n = moveSequences(ids, $('seqm-folder').value); closeModal(); state.selected.clear(); render(); toast(`${plural(n, 'secuencia movida', 'secuencias movidas')}`); } else if (a === 'confirm-delete') { const ids = se.dataset.ids.split(',').filter(Boolean); const n = deleteSequences(ids); ids.forEach((id) => state.selected.delete(id)); closeModal(); render(); toast(`${plural(n, 'secuencia enviada', 'secuencias enviadas')} a la papelera`); } else if (a === 'restore') { restoreSequences([se.dataset.id]); closeModal(); render(); toast('Secuencia restaurada'); }
}
page.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; params.set('tab', state.tab); history.replaceState(null, '', `?${params}`); render(); return; }
  const tabLink = e.target.closest('[data-tab-link]');
  if (tabLink) { e.preventDefault(); state.tab = tabLink.dataset.tabLink; render(); return; }
  const ft = e.target.closest('[data-folder-toggle]');
  if (ft) { const f = ft.dataset.folderToggle; if (state.collapsed.has(f)) state.collapsed.delete(f); else state.collapsed.add(f); renderManage(); return; }
  const filter = e.target.closest('[data-filter]');
  if (filter) { closeMenus(); state.filters[filter.dataset.filter] = filter.dataset.value; renderAnalyze(); return; }
  const un = e.target.closest('[data-unfilter]');
  if (un) { delete state.filters[un.dataset.unfilter]; renderAnalyze(); return; }
  const unenr = e.target.closest('[data-unenroll]');
  if (unenr) { unenroll(unenr.dataset.unenroll); renderScheduled(); toast('Inscripción cancelada'); return; }
  const act = e.target.closest('[data-act]');
  if (act) {
    const id = act.dataset.id;
    closeMenus();
    if (act.dataset.act === 'clone') { const c = cloneSequence(id); if (c) { render(); toast(`Secuencia clonada como «${c.name}»`); } } else if (act.dataset.act === 'move') { const s = sequenceById(id); modal('Mover a carpeta', `<p class="muted">Mover «${esc(s.name)}» a:</p><label class="field"><span>Carpeta</span><select id="seqm-folder">${folderOptions(s.folder)}</select></label>`, `<button class="btn btn--primary" type="button" data-se="confirm-move" data-ids="${esc(id)}">Mover</button>${cancelBtn}`); } else if (act.dataset.act === 'delete') { const s = sequenceById(id); modal('Eliminar secuencia', `<p>¿Seguro que quieres eliminar «${esc(s.name)}»? Los contactos inscritos dejarán de recibir sus pasos. Podrás restaurarla desde la papelera.</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-se="confirm-delete" data-ids="${esc(id)}">Eliminar</button>${cancelBtn}`); }
    return;
  }
  const ta = e.target.closest('[data-ta]');
  if (!ta) return;
  const a = ta.dataset.ta;
  if (a === 'create') return;
  e.preventDefault();
  closeMenus();
  if (a === 'banner-close') { dismissBanner(); const b = $('seq-banner'); if (b) b.remove(); } else if (a === 'export') exportCsv();
  else if (a === 'trash') openTrash();
  else if (a === 'new-folder') { modal('Nueva carpeta', '<label class="field"><span>Nombre de la carpeta</span><input id="seqf-name" placeholder="P. ej. Prospección" /></label>', `<button class="btn btn--primary" type="button" data-se="create-folder">Crear</button>${cancelBtn}`); $('seqf-name').focus(); } else if (a === 'bulk-move') { const ids = [...state.selected]; modal('Mover a carpeta', `<p class="muted">Mover ${plural(ids.length, 'secuencia', 'secuencias')} a:</p><label class="field"><span>Carpeta</span><select id="seqm-folder">${folderOptions('')}</select></label>`, `<button class="btn btn--primary" type="button" data-se="confirm-move" data-ids="${esc(ids.join(','))}">Mover</button>${cancelBtn}`); } else if (a === 'bulk-delete') { const ids = [...state.selected]; modal('Eliminar secuencias', `<p>¿Seguro que quieres eliminar ${plural(ids.length, 'secuencia', 'secuencias')}? Podrás restaurarlas desde la papelera.</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-se="confirm-delete" data-ids="${esc(ids.join(','))}">Eliminar</button>${cancelBtn}`); } else if (a === 'clear-filters') { state.filters = {}; renderAnalyze(); } else if (a === 'workflow') toast('Los workflows de inscripción automática estarán disponibles en Automatizaciones › Workflows.');
  else if (a === 'holidays') toast('Los días festivos se configuran en Configuración › Calendario de envíos.');
});
page.addEventListener('input', (e) => { if (e.target.id === 'seq-q') { state.q = e.target.value; state.page = 1; const el = e.target; renderManage(); const q = $('seq-q'); if (q && q !== el) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } } });
page.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'seq-owner') { state.owner = t.value; state.page = 1; renderManage(); } else if (t.id === 'seq-metric') { state.metric = t.value; renderAnalyze(); } else if (t.id === 'seq-freq') { state.freq = t.value; renderAnalyze(); } else if (t.id === 'seq-check-all') { visible().slice((state.page - 1) * state.size, state.page * state.size).forEach((s) => (t.checked ? state.selected.add(s.id) : state.selected.delete(s.id))); renderManage(); } else if (t.dataset.sel) { if (t.checked) state.selected.add(t.dataset.sel); else state.selected.delete(t.dataset.sel); renderManage(); }
});

render();

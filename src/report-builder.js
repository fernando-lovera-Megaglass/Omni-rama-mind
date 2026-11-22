import { SOURCES, MEASURES, DIMENSIONS, VIEWS, escapeHtml as esc, reportChart, createReportStore } from './custom-reports.js';
import { supabase } from './supabaseClient.js';

// The page passes shell's wireMenus/closeMenus so the row menus («Acciones») behave like every other .menu of the CRM.
export function mountReportBuilder({ root, dashboard, store = createReportStore(), wireMenus = () => {}, closeMenus = () => {}, panelContext, togglePin, migratePins = () => {} }) {
  let reports = [];
  let query = "", loaded = false, busy = false;
  const host = document.createElement('section');
  host.className = 'card custom-library'; host.hidden = true;
  root.append(host);
  const pinned = document.createElement('div'); pinned.className = 'grid'; dashboard.after(pinned);
  let config = { source: 'deals', measure: 'count', dimension: 'stage', visualization: 'bars' };
  const safeChart = (c, period) => { try { return reportChart(c, period); } catch { return '<p>Configuración no compatible.</p>'; } };
  const isPinned = r => panelContext ? panelContext().pins.includes(r.id) : r.pinned;
  function renderPins() {
    pinned.innerHTML = reports.filter(isPinned).map(r => `<section class="card card--report"><h2>${esc(r.name)}</h2><p class="muted">Informe personalizado · ${esc(panelContext?.().label || "Todos los registros cargados")}</p>${safeChart(r.config, panelContext?.().period)}<button class="btn btn--ghost" data-pin="${esc(r.id)}">Quitar del panel</button></section>`).join('');
  }
  function renderList() {
    const list = host.querySelector('[data-list]'); if (!list) return;
    const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const matches = reports.filter(r => normalize(r.name).includes(normalize(query.trim())));
    list.innerHTML = !loaded ? '<p>Cargando informes…</p>' : !reports.length ? `<div data-empty><svg width="160" height="100" viewBox="0 0 160 100" role="img" aria-label="En construcción"><path d="M15 85h130M40 85V35h80v50" fill="none" stroke="#516f90" stroke-width="5"/><path d="M25 35h110v22H25z" fill="#ffbc4b"/><path d="m40 35 20 22m10-22 20 22m10-22 20 22" stroke="#33475b" stroke-width="8"/></svg><h3>Tu biblioteca está en construcción</h3><p>No hay informes guardados. Crea tu primer informe para empezar.</p></div>` : matches.length ? matches.map(r => `<article class="custom-library-row">
      <div class="custom-library-row__main"><h3>${esc(r.name)}</h3><p class="muted">${esc(SOURCES[r.config?.source] || 'Fuente desconocida')} · ${esc(VIEWS[r.config?.visualization] || '')}${isPinned(r) ? ' · Anclado a este panel' : ''}</p></div>
      <div class="custom-library-row__actions">
        <button class="btn btn--secondary btn--sm" type="button" data-view="${esc(r.id)}">Abrir</button>
        <div class="menu custom-library-row__menu"><button class="link-btn" type="button" aria-haspopup="true" aria-expanded="false">Acciones <span class="caret"></span></button><div class="menu__panel menu__panel--right">
          <button class="menu__item" type="button" data-duplicate="${esc(r.id)}">Duplicar</button>
          <button class="menu__item" type="button" data-rename="${esc(r.id)}">Renombrar</button>
          <button class="menu__item" type="button" data-pin="${esc(r.id)}">${isPinned(r) ? 'Quitar del panel' : 'Anclar a este panel'}</button>
          <div class="menu__sep"></div>
          <button class="menu__item menu__item--danger" type="button" data-delete="${esc(r.id)}">Eliminar</button>
        </div></div>
      </div>
    </article>`).join('') : '<p class="muted">No hay informes que coincidan con la búsqueda.</p>';
    wireMenus(host);
  }
  function library() {
    host.innerHTML = `<div class="page-head"><h2>Biblioteca de informes</h2><div class="page-head__actions"><button class="btn btn--primary" type="button" data-create>Crear informe</button><button class="btn btn--ghost" type="button" data-close>Cerrar</button></div></div><p class="muted">${supabase ? 'Informes guardados en Supabase' : 'Modo local · Informes guardados en este navegador'}</p><div class="search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" data-search value="${esc(query)}" placeholder="Buscar informes" aria-label="Buscar informes" /></div><div role="status" data-status></div><div data-list></div>`;
    host.querySelector('[data-search]').addEventListener('input', e => { query = e.target.value; renderList(); });
    renderList();
  }
  const status = message => { const el = host.querySelector('[data-status]'); if (el) el.textContent = message; };
  async function refresh() {
    loaded = false; library();
    try { reports = await store.list(); migratePins(reports); loaded = true; library(); renderPins(); }
    catch (error) { library(); host.querySelector("[data-list]").innerHTML = '<button class="btn btn--ghost" data-retry>Reintentar</button>'; status(`No se pudieron cargar los informes: ${error.message}. Comprueba la migración reports.sql y tu sesión.`); }
  }
  function builder() {
    // System form classes (.field) so the builder looks like any other form of the CRM, in light and dark.
    const select = (key, label, options) => `<label class="field"><span>${label}</span><select name="${key}">${Object.entries(options).map(([v,l]) => `<option value="${v}" ${config[key] === v ? 'selected' : ''} ${key === 'measure' && config.source !== 'deals' && v !== 'count' ? 'disabled' : ''}>${l}</option>`).join('')}</select></label>`;
    host.innerHTML = `<h2>Crear informe personalizado</h2><form data-builder><label class="field"><span>Nombre del informe</span><input name="name" required maxlength="120" value="Negocios por etapa (barras)"></label><div class="custom-fields">${select('source','1. Fuente',SOURCES)}${select('measure','2. Medida',MEASURES)}${select('dimension','3. Dimensión',DIMENSIONS)}${select('visualization','4. Visualización',VIEWS)}</div><p class="muted">Todos los registros cargados. Suma y promedio usan el importe de negocios en la moneda de la cuenta. Campos ausentes se agrupan como «Sin dato».</p><h3>Vista previa</h3><div data-preview></div><p role="status" data-status></p><button class="btn btn--primary" type="submit">Guardar informe</button> <button class="btn btn--ghost" type="button" data-back>Volver a biblioteca</button></form>`;
    const form = host.querySelector('form');
    function preview() {
      config.source = form.elements.source.value;
      if (config.source !== 'deals') form.elements.measure.value = 'count';
      [...form.elements.measure.options].forEach(o => { o.disabled = config.source !== 'deals' && o.value !== 'count'; });
      for (const key of ['measure','dimension','visualization']) config[key] = form.elements[key].value;
      host.querySelector('[data-preview]').innerHTML = safeChart(config);
    }
    form.addEventListener('change', preview); preview();
    form.addEventListener('submit', async e => {
      e.preventDefault(); const button = form.querySelector('[type=submit]'); if (button.disabled) return;
      button.disabled = true; status('Guardando…');
      try {
        const saved = await store.save(form.elements.name.value, { ...config });
        reports.unshift(saved); loaded = true; query = ""; library(); renderPins(); status(`Informe «${saved.name}» guardado.`);
      } catch (error) { status(`No se pudo guardar: ${error.message}`); button.disabled = false; }
    });
    form.elements.name.focus();
  }
  async function action(e) {
    const button = e.target.closest('button'); if (!button || busy) return;
    if (button.closest('.menu__panel')) closeMenus();
    if (button.hasAttribute('data-retry')) return refresh();
    if (button.hasAttribute('data-create')) builder();
    if (button.hasAttribute('data-back')) library();
    if (button.hasAttribute('data-close')) host.hidden = true;
    if (button.dataset.view) {
      const report = reports.find(r => r.id === button.dataset.view);
      host.innerHTML = `<h2>${esc(report.name)}</h2>${safeChart(report.config)}<button class="btn btn--ghost" data-back>Volver a biblioteca</button><p role="status" data-status></p>`;
    }
    if (button.dataset.duplicate) {
      busy = true; button.disabled = true;
      try {
        const saved = await store.duplicate(button.dataset.duplicate);
        reports.unshift(saved); query = ''; library(); status(`Informe «${saved.name}» duplicado.`);
      } catch (error) { status(`No se pudo duplicar: ${error.message}`); button.disabled = false; }
      finally { busy = false; }
    }
    if (button.dataset.rename || button.dataset.delete) {
      const report = reports.find(r => r.id === (button.dataset.rename || button.dataset.delete));
      const deleting = !!button.dataset.delete;
      host.innerHTML = `<h2>${deleting ? 'Eliminar' : 'Renombrar'} informe</h2><form data-edit>${deleting ? `<p>¿Eliminar «${esc(report.name)}»? Esta acción no se puede deshacer.</p>` : `<label class="field"><span>Nombre del informe</span><input name="name" required maxlength="120" value="${esc(report.name)}"></label>`}<button class="btn ${deleting ? 'btn--primary tpls__danger' : 'btn--primary'}" type="submit">${deleting ? 'Eliminar informe' : 'Guardar nombre'}</button> <button class="btn btn--ghost" type="button" data-back>Cancelar</button><p role="status" data-status></p></form>`;
      const form = host.querySelector('form');
      form.querySelector('input')?.focus();
      form.addEventListener('submit', async e => {
        e.preventDefault(); if (busy) return; busy = true;
        const submit = form.querySelector('[type=submit]'); submit.disabled = true;
        try {
          if (deleting) { await store.remove(report.id); reports = reports.filter(r => r.id !== report.id); }
          else { const saved = await store.rename(report.id, form.elements.name.value); reports = reports.map(r => r.id === saved.id ? saved : r); }
          library(); renderPins(); status(deleting ? 'Informe eliminado.' : 'Nombre actualizado.');
        } catch (error) { status(`No se pudo ${deleting ? 'eliminar' : 'renombrar'}: ${error.message}`); submit.disabled = false; }
        finally { busy = false; }
      });
    }
    if (button.dataset.pin) {
      const report = reports.find(r => r.id === button.dataset.pin); button.disabled = true;
      try { if (togglePin) togglePin(report.id); else { await store.pin(report.id, !report.pinned); report.pinned = !report.pinned; } library(); renderPins(); }
      catch (error) { host.hidden = false; library(); status(`No se pudo actualizar el panel: ${error.message}`); }
    }
  }
  host.addEventListener('click', action); pinned.addEventListener('click', action);
  document.querySelector('[data-action="add-report"]')?.addEventListener('click', () => { host.hidden = false; refresh(); });
  document.querySelector('[data-action="report-library"]')?.addEventListener('click', () => { host.hidden = false; refresh(); host.scrollIntoView?.({ behavior: 'smooth' }); });
  const ready = refresh();
  return { ready, open: () => { host.hidden = false; library(); }, renderPins };
}

// "Crear negocio" as in the original: a slide-over panel on the right of the Negocios list with the fields in
// the original's order (Nombre del negocio, Pipeline, Etapa del negocio, Valor with its currency, Fecha de
// cierre, Propietario, Descripción de la oferta, Fecha de creación), the association sections (Contactos with
// an association label and the timeline checkbox, Empresas with "Principal" on the first one), the line
// items, and Crear / Crear y agregar otro disabled until the name is filled. The insert goes through
// data.js: the deals table (associations in the deal's columns and extra, mirrored on the other records)
// and deal_line_items for the lines.
import { addRecord, setField, addActivity, addLineItems, allContacts, allCompanies, OWNERS, TODAY, strip, dealPipelines, stagesFor, assocLabels, CURRENCY_DEFS, CURRENCY_CODES, homeCurrency, formatMoney, initials } from './data.js';
import { toast } from './shell.js';
import { authEnabled, currentUser } from './auth.js';
import { ownerForUser } from './create-contact.js';

// Prefix shown in the amount field (the original shows "MX$" for the Mexican peso).
export const CURRENCY_PREFIX = { MXN: 'MX$', USD: 'US$', EUR: '€', COP: 'COL$', GBP: '£' };
export const FIELD_ORDER = ['name', 'pipeline', 'stage', 'amount', 'deal_currency_code', 'closeDate', 'owner', 'description', 'created'];
const DAY = 86400000;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
// <input type="date"> value of a date (local calendar day) and back to an ISO instant (noon, so the day never shifts).
export const dateInput = (d) => { const x = d instanceof Date ? d : new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
export const fromDateInput = (s, fallback) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`).toISOString() : fallback);
const KIND_WORD = { contacts: 'Contacto', companies: 'Empresa' };
// Matching records for the association search (name, e-mail or domain), skipping the ones already chosen.
export function findAssociable(kind, q, chosenIds = [], limit = 6) {
  const qq = strip(q);
  if (!qq) return [];
  const chosen = new Set(chosenIds.map(Number));
  const pool = kind === 'contacts' ? allContacts() : allCompanies();
  const sub = (r) => (kind === 'contacts' ? r.email : r.domain) || '';
  return pool.filter((r) => !chosen.has(Number(r.id)) && (strip(r.name || '').includes(qq) || strip(sub(r)).includes(qq))).slice(0, limit).map((r) => ({ id: Number(r.id), name: r.name || 'Sin nombre', sub: sub(r) }));
}

export function mountCreateDeal({ root = document.getElementById('list-root') || document.body, list = null, onCreated = null } = {}) {
  const HOME = homeCurrency();
  const pipelines = dealPipelines();
  const labels = assocLabels();
  const el = document.createElement('div');
  el.className = 'slideover';
  el.id = 'cd-panel';
  el.setAttribute('aria-hidden', 'true');
  const assocSection = (kind, title, placeholder) => `
        <section class="cd-section" data-kind="${kind}">
          <h3 class="cd-section__title">${title}</h3>
          <div class="cd-search">
            <input type="search" id="cd-${kind}-q" placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off" data-cd-search="${kind}" />
            <ul class="cd-search__results" id="cd-${kind}-results" hidden></ul>
          </div>
          <ul class="cd-assoc" id="cd-${kind}-list"></ul>
          <button class="link-btn" type="button" data-cd="more" data-kind="${kind}">+ Agregar más</button>
        </section>`;
  el.innerHTML = `
    <div class="slideover__scrim" data-cd="cancel"></div>
    <aside class="slideover__panel slideover__panel--wide" role="dialog" aria-modal="true" aria-labelledby="cd-title">
      <header class="slideover__head"><h2 id="cd-title">Crear negocio</h2><button class="slideover__close" type="button" data-cd="cancel" aria-label="Cerrar">×</button></header>
      <form class="slideover__body" id="cd-form" novalidate>
        <label class="field"><span>Nombre del negocio <span class="cc-req" aria-hidden="true">*</span></span><input name="name" type="text" required aria-required="true" autocomplete="off" /></label>
        <label class="field"><span>Pipeline</span><select name="pipeline">${pipelines.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></label>
        <label class="field"><span>Etapa del negocio</span><select name="stage"></select></label>
        <div class="field"><span>Valor</span>
          <div class="cd-amount">
            <span class="cd-amount__prefix" id="cd-prefix">${CURRENCY_PREFIX[HOME] || CURRENCY_DEFS[HOME].symbol}</span>
            <input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" aria-label="Valor" />
            <select name="deal_currency_code" aria-label="Moneda">${CURRENCY_CODES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
          </div>
        </div>
        <label class="field"><span>Fecha de cierre</span><input name="closeDate" type="date" /></label>
        <label class="field"><span>Propietario del negocio</span><select name="owner">${OWNERS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>
        <label class="field"><span>Descripción de la oferta</span><textarea name="description" rows="3"></textarea></label>
        <label class="field"><span>Fecha de creación</span><input name="created" type="date" /></label>
        ${assocSection('contacts', 'Asociar negocio con Contactos', 'Buscar contactos')}
        ${assocSection('companies', 'Empresas', 'Buscar empresas')}
        <section class="cd-section" data-kind="items">
          <h3 class="cd-section__title">Elementos de pedido</h3>
          <div id="cd-items"></div>
          <button class="link-btn" type="button" data-cd="add-item">+ Añadir elemento de pedido</button>
        </section>
        <p class="cd-error" id="cd-error" hidden></p>
      </form>
      <footer class="slideover__foot">
        <button class="btn btn--primary" type="submit" form="cd-form" id="cd-create" disabled>Crear</button>
        <button class="btn btn--ghost" type="button" id="cd-create-another" disabled>Crear y agregar otro</button>
        <button class="link-btn" type="button" data-cd="cancel">Cancelar</button>
      </footer>
    </aside>`;
  root.appendChild(el);
  const form = el.querySelector('#cd-form');
  const createBtn = el.querySelector('#cd-create');
  const anotherBtn = el.querySelector('#cd-create-another');
  const errorEl = el.querySelector('#cd-error');
  const state = { open: false, busy: false, contacts: [], companies: [], items: [] };
  const isOpen = () => state.open;
  const read = () => { const d = {}; new FormData(form).forEach((v, k) => { d[k] = String(v).trim(); }); return d; };
  const complete = () => Boolean(form.elements.name.value.trim());
  const update = () => { const ok = complete() && !state.busy; createBtn.disabled = !ok; anotherBtn.disabled = !ok; };
  const busy = (on) => { state.busy = on; update(); };
  const showError = (msg) => { errorEl.hidden = !msg; errorEl.textContent = msg || ''; };
  const currency = () => (CURRENCY_DEFS[form.elements.deal_currency_code.value] ? form.elements.deal_currency_code.value : HOME);
  const setPrefix = () => { const c = currency(); el.querySelector('#cd-prefix').textContent = CURRENCY_PREFIX[c] || CURRENCY_DEFS[c].symbol; };
  // The stage list follows the chosen pipeline; the first stage is the default.
  const fillStages = (keep) => {
    const stages = stagesFor(form.elements.pipeline.value || pipelines[0]);
    form.elements.stage.innerHTML = stages.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('');
    form.elements.stage.value = keep && stages.some((s) => s[0] === keep) ? keep : stages[0][0];
  };
  const setOwner = () => {
    const sel = form.elements.owner;
    sel.value = ownerForUser(null);
    if (authEnabled()) currentUser().then((u) => { if (u && isOpen()) sel.value = ownerForUser(u); }).catch(() => {});
  };
  // ---- associations ----
  const labelOptions = (kind) => (kind === 'contacts' ? labels.filter((l) => l !== 'Principal') : labels);
  const defaultLabel = (kind) => (kind === 'companies' && !state.companies.some((c) => c.label === 'Principal') ? 'Principal' : 'Sin etiqueta');
  const renderAssoc = (kind) => {
    const ul = el.querySelector(`#cd-${kind}-list`);
    ul.innerHTML = state[kind].map((c) => `
          <li class="cd-assoc__row" data-id="${c.id}">
            <div class="cd-assoc__who">
              <span class="avatar avatar--xs avatar--soft" aria-hidden="true">${esc(initials(c.name))}</span>
              <div><strong>${esc(c.name)}</strong>${c.sub ? `<small class="muted">${esc(c.sub)}</small>` : ''}</div>
              <button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-cd="remove" data-kind="${kind}" data-id="${c.id}" aria-label="Quitar ${esc(c.name)}">×</button>
            </div>
            <label class="field cd-assoc__label"><span>Etiqueta de asociación</span><select data-cd-label="${kind}" data-id="${c.id}">${labelOptions(kind).map((l) => `<option value="${esc(l)}" ${l === c.label ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="cd-check"><input type="checkbox" data-cd-log="${kind}" data-id="${c.id}" ${c.log ? 'checked' : ''} /> <span>Agregar actividad de la cronología de este objeto (${KIND_WORD[kind]})</span></label>
          </li>`).join('');
  };
  const renderResults = (kind) => {
    const input = el.querySelector(`#cd-${kind}-q`);
    const box = el.querySelector(`#cd-${kind}-results`);
    const hits = findAssociable(kind, input.value, state[kind].map((c) => c.id));
    box.hidden = !hits.length;
    box.innerHTML = hits.map((r) => `<li><button type="button" data-cd="pick" data-kind="${kind}" data-id="${r.id}"><strong>${esc(r.name)}</strong>${r.sub ? `<span class="muted">${esc(r.sub)}</span>` : ''}</button></li>`).join('');
  };
  const pick = (kind, id) => {
    const r = findAssociable(kind, '', []).length ? null : null; // (search pool is read fresh below)
    const pool = kind === 'contacts' ? allContacts() : allCompanies();
    const rec = pool.find((x) => Number(x.id) === Number(id));
    if (!rec || state[kind].some((c) => Number(c.id) === Number(id))) return r;
    state[kind].push({ id: Number(rec.id), name: rec.name || 'Sin nombre', sub: (kind === 'contacts' ? rec.email : rec.domain) || '', label: defaultLabel(kind), log: true });
    const input = el.querySelector(`#cd-${kind}-q`);
    input.value = '';
    el.querySelector(`#cd-${kind}-results`).hidden = true;
    renderAssoc(kind);
    return rec;
  };
  const setLabel = (kind, id, label) => {
    const row = state[kind].find((c) => Number(c.id) === Number(id));
    if (!row) return;
    // Only one primary company.
    if (kind === 'companies' && label === 'Principal') state.companies.forEach((c) => { if (c.label === 'Principal') c.label = 'Sin etiqueta'; });
    row.label = label;
    renderAssoc(kind);
  };
  // ---- line items ----
  const itemAmount = (x) => (Number(x.quantity) || 0) * (Number(x.price) || 0);
  const renderItems = () => {
    const box = el.querySelector('#cd-items');
    if (!state.items.length) { box.innerHTML = ''; return; }
    const c = currency();
    box.innerHTML = `<table class="cd-items"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th class="cd-items__amount">Importe</th><th></th></tr></thead><tbody>${state.items.map((x, i) => `
          <tr data-i="${i}">
            <td><input type="text" data-item="name" data-i="${i}" value="${esc(x.name)}" placeholder="Nombre del producto" aria-label="Producto" /></td>
            <td><input type="number" min="0" step="1" data-item="quantity" data-i="${i}" value="${esc(x.quantity)}" aria-label="Cantidad" /></td>
            <td><input type="number" min="0" step="0.01" data-item="price" data-i="${i}" value="${esc(x.price)}" aria-label="Precio" /></td>
            <td class="cd-items__amount" data-item-amount="${i}">${esc(formatMoney(itemAmount(x), c))}</td>
            <td><button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-cd="remove-item" data-i="${i}" aria-label="Quitar elemento">×</button></td>
          </tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3">Total de elementos de pedido</td><td class="cd-items__amount" id="cd-items-total">${esc(formatMoney(state.items.reduce((s, x) => s + itemAmount(x), 0), c))}</td><td></td></tr></tfoot></table>`;
  };
  const refreshAmounts = () => {
    const c = currency();
    state.items.forEach((x, i) => { const cell = el.querySelector(`[data-item-amount="${i}"]`); if (cell) cell.textContent = formatMoney(itemAmount(x), c); });
    const total = el.querySelector('#cd-items-total');
    if (total) total.textContent = formatMoney(state.items.reduce((s, x) => s + itemAmount(x), 0), c);
  };
  // ---- open / close / save ----
  const reset = () => {
    form.reset();
    state.contacts = [];
    state.companies = [];
    state.items = [];
    ['contacts', 'companies'].forEach((k) => { renderAssoc(k); el.querySelector(`#cd-${k}-results`).hidden = true; });
    renderItems();
    showError('');
    form.elements.pipeline.value = pipelines[0];
    fillStages();
    form.elements.deal_currency_code.value = HOME;
    setPrefix();
    form.elements.created.value = dateInput(TODAY);
    setOwner();
    update();
  };
  function open(prefill) {
    reset();
    const p = prefill || {};
    if (p.pipeline && pipelines.includes(p.pipeline)) form.elements.pipeline.value = p.pipeline;
    fillStages(p.stage);
    ['name', 'amount', 'closeDate', 'owner', 'description'].forEach((k) => { if (p[k] !== undefined && p[k] !== null && p[k] !== '') form.elements[k].value = p[k]; });
    if (p.deal_currency_code && CURRENCY_DEFS[p.deal_currency_code]) { form.elements.deal_currency_code.value = p.deal_currency_code; setPrefix(); }
    if (p.contactId) pick('contacts', p.contactId);
    if (p.companyId) pick('companies', p.companyId);
    update();
    state.open = true;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-slideover');
    setTimeout(() => form.elements.name.focus(), 50);
  }
  function close() {
    state.open = false;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-slideover');
    reset();
  }
  // The record to insert, from the form and the chosen associations.
  function build() {
    const d = read();
    const pipeline = pipelines.includes(d.pipeline) ? d.pipeline : pipelines[0];
    const stages = stagesFor(pipeline);
    const stage = stages.some((s) => s[0] === d.stage) ? d.stage : stages[0][0];
    const code = CURRENCY_DEFS[d.deal_currency_code] ? d.deal_currency_code : HOME;
    const primary = state.companies.find((c) => c.label === 'Principal') || state.companies[0];
    const first = state.contacts[0];
    return {
      name: d.name,
      pipeline,
      stage,
      amount: Number(d.amount) || 0,
      deal_currency_code: code,
      closeDate: fromDateInput(d.closeDate, new Date(TODAY.getTime() + 30 * DAY).toISOString()),
      owner: d.owner || ownerForUser(null),
      description: d.description || '',
      created: fromDateInput(d.created, TODAY.toISOString()),
      contactId: first ? first.id : '',
      companyId: primary ? primary.id : '',
      company: primary ? primary.name : '',
      assoc_contacts: state.contacts.map((c) => c.id),
      assoc_labels_contacts: Object.fromEntries(state.contacts.map((c) => [c.id, c.label])),
      assoc_companies: state.companies.map((c) => c.id),
      assoc_labels_companies: Object.fromEntries(state.companies.map((c) => [c.id, c.label])),
      priority: 'medium',
      type: 'Nuevo negocio',
      lastActivity: TODAY.toISOString(),
      stageEnteredAt: TODAY.toISOString(),
    };
  }
  async function save(another) {
    if (state.busy || !complete()) return;
    busy(true);
    showError('');
    try {
      const rec = build();
      const made = addRecord('deals', rec);
      const lines = addLineItems(made.id, state.items.map((x) => ({ ...x, currency: rec.deal_currency_code })));
      // The other side of each association: records not covered by the deal's own keys list the deal too.
      const mirror = (kind, c) => {
        const pool = kind === 'contacts' ? allContacts() : allCompanies();
        const other = pool.find((x) => Number(x.id) === Number(c.id));
        if (!other) return;
        const covered = kind === 'contacts' ? Number(rec.contactId) === Number(c.id) : Number(rec.companyId) === Number(c.id);
        if (!covered) setField(kind, other.id, 'assoc_deals', [...new Set([...(other.assoc_deals || []).map(Number), Number(made.id)])]);
        if (c.log) addActivity({ type: 'created', recordType: kind, recordId: Number(c.id), text: `Negocio «${rec.name}» creado y asociado a ${kind === 'contacts' ? 'este contacto' : 'esta empresa'}${c.label && c.label !== 'Sin etiqueta' ? ` (${c.label})` : ''}.`, who: 'Tú', when: Date.now(), extra: { dealId: made.id } });
      };
      state.contacts.forEach((c) => mirror('contacts', c));
      state.companies.forEach((c) => mirror('companies', c));
      addActivity({ type: 'created', recordType: 'deals', recordId: Number(made.id), text: `Negocio creado${lines.length ? ` con ${lines.length} elemento${lines.length === 1 ? '' : 's'} de pedido` : ''}.`, who: 'Tú', when: Date.now(), extra: {} });
      toast('Negocio creado');
      if (list && typeof list.render === 'function') list.render();
      if (onCreated) onCreated(made, { lines });
      if (another) { reset(); setTimeout(() => form.elements.name.focus(), 0); } else close();
    } catch (e) {
      showError(`No se pudo crear el negocio: ${e.message || e}`);
    } finally {
      busy(false);
    }
  }
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.cdSearch) { renderResults(t.dataset.cdSearch); return; }
    if (t.dataset.item) { const x = state.items[Number(t.dataset.i)]; if (x) { x[t.dataset.item] = t.value; refreshAmounts(); } return; }
    update();
  });
  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'pipeline') fillStages();
    if (t.name === 'deal_currency_code') { setPrefix(); refreshAmounts(); }
    if (t.dataset.cdLabel) setLabel(t.dataset.cdLabel, t.dataset.id, t.value);
    if (t.dataset.cdLog) { const row = state[t.dataset.cdLog].find((c) => Number(c.id) === Number(t.dataset.id)); if (row) row.log = t.checked; }
  });
  form.addEventListener('keydown', (e) => {
    // Enter in a search box picks the first match instead of submitting.
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.cdSearch) {
      e.preventDefault();
      const first = el.querySelector(`#cd-${e.target.dataset.cdSearch}-results button`);
      if (first) pick(first.dataset.kind, first.dataset.id);
    }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  anotherBtn.addEventListener('click', () => save(true));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cd]');
    if (!b) return;
    const act = b.dataset.cd;
    if (act === 'cancel') { e.preventDefault(); close(); }
    else if (act === 'pick') pick(b.dataset.kind, b.dataset.id);
    else if (act === 'remove') { state[b.dataset.kind] = state[b.dataset.kind].filter((c) => Number(c.id) !== Number(b.dataset.id)); if (b.dataset.kind === 'companies' && state.companies.length && !state.companies.some((c) => c.label === 'Principal')) state.companies[0].label = 'Principal'; renderAssoc(b.dataset.kind); }
    else if (act === 'more') { const input = el.querySelector(`#cd-${b.dataset.kind}-q`); input.focus(); renderResults(b.dataset.kind); }
    else if (act === 'add-item') { state.items.push({ name: '', quantity: 1, price: '' }); renderItems(); const last = el.querySelector(`[data-item="name"][data-i="${state.items.length - 1}"]`); if (last) last.focus(); }
    else if (act === 'remove-item') { state.items.splice(Number(b.dataset.i), 1); renderItems(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
  return { open, close, isOpen, el, state, build };
}

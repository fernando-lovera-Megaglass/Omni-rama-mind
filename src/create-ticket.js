// "Crear ticket" as in the original: a slide-over panel on the right of the Tickets list (no navigation) with the
// fields in the original's order (Nombre del ticket, Pipeline, Estado del ticket, Descripción, Fuente, Prioridad,
// Propietario del ticket) and the «Asociar ticket con» sections for Contactos, Empresas and Negocios (search box,
// several records, association label, timeline checkbox), plus Crear / Crear y agregar otro / Cancelar. The deals
// are kept on both sides (ticket.assoc_deals and deal.assoc_tickets, both in the extra column). Same skeleton and
// classes as src/create-deal.js. Pipeline and Estado are chained: the statuses of the chosen pipeline, the first
// open one by default (the same rule as the list's normalize). The insert goes through data.js (addRecord), which
// also associates the contact's primary company (autoAssociateTicketCompany) unless a company was chosen here.
import { addRecord, addActivity, setField, allContacts, allCompanies, allDeals, findRecord, OWNERS, PRIORITIES, TODAY, ticketPipelines, ticketStatusesFor, firstOpenTicketStatus, assocLabels, initials, validatePropertyValues } from './data.js';
import { toast, recordToastAction } from './shell.js';
import { authEnabled, currentUser } from './auth.js';
import { customFieldsHtml, ownerForUser } from './create-contact.js';
import { findAssociable } from './create-deal.js';
import { enhanceOwnerSelects, refreshOwnerSelects } from './owner-select.js';

export const FIELD_ORDER = ['name', 'pipeline', 'status', 'description', 'source', 'priority', 'owner'];
export const SOURCES = ['Correo', 'Formulario', 'Chat', 'Teléfono', 'WhatsApp'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND_WORD = { contacts: 'Contacto', companies: 'Empresa', deals: 'Negocio' };
const KIND_THIS = { contacts: 'este contacto', companies: 'esta empresa', deals: 'este negocio' };
const ASSOC_KINDS = ['contacts', 'companies', 'deals'];

export function mountCreateTicket({ root = document.getElementById('list-root') || document.body, list = null, onCreated = null, fromConversation = false } = {}) {
  const pipelines = ticketPipelines();
  const labels = assocLabels();
  const el = document.createElement('div');
  el.className = 'slideover';
  el.id = 'ct-panel';
  el.setAttribute('aria-hidden', 'true');
  const assocSection = (kind, title, placeholder) => `
        <section class="cd-section" data-kind="${kind}">
          <h3 class="cd-section__title">${title}</h3>
          <div class="cd-search">
            <input type="search" id="ct-${kind}-q" placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off" data-ct-search="${kind}" />
            <ul class="cd-search__results" id="ct-${kind}-results" hidden></ul>
          </div>
          <ul class="cd-assoc" id="ct-${kind}-list"></ul>
          <button class="link-btn" type="button" data-ct="more" data-kind="${kind}">+ Agregar más</button>
        </section>`;
  el.innerHTML = `
    <div class="slideover__scrim" data-ct="cancel"></div>
    <aside class="slideover__panel slideover__panel--wide" role="dialog" aria-modal="true" aria-labelledby="ct-title">
      <header class="slideover__head"><h2 id="ct-title">Crear ticket</h2><button class="slideover__close" type="button" data-ct="cancel" aria-label="Cerrar">×</button></header>
      <form class="slideover__body" id="ct-form" novalidate>
        <label class="field"><span>Nombre del ticket <span class="cc-req" aria-hidden="true">*</span></span><input name="name" type="text" required aria-required="true" autocomplete="off" /></label>
        <label class="field"><span>Pipeline</span><select name="pipeline">${pipelines.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></label>
        <label class="field"><span>Estado del ticket</span><select name="status"></select></label>
        <label class="field"><span>Descripción</span><textarea name="description" rows="3"></textarea></label>
        <label class="field"><span>Fuente</span><select name="source">${SOURCES.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></label>
        <label class="field"><span>Prioridad</span><select name="priority">${PRIORITIES.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></label>
        <label class="field"><span>Propietario del ticket</span><select name="owner">${OWNERS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>
        ${customFieldsHtml('tickets')}
        ${assocSection('contacts', 'Asociar ticket con Contactos', 'Buscar contactos')}
        ${assocSection('companies', 'Empresas', 'Buscar empresas')}
        ${assocSection('deals', 'Negocios', 'Buscar negocios')}
        <p class="cd-error" id="ct-error" hidden></p>
      </form>
      <footer class="slideover__foot">
        <button class="btn btn--primary" type="submit" form="ct-form" id="ct-create" disabled>Crear</button>
        <button class="btn btn--ghost" type="button" id="ct-create-another" disabled>Crear y agregar otro</button>
        <button class="link-btn" type="button" data-ct="cancel">Cancelar</button>
      </footer>
    </aside>`;
  root.appendChild(el);
  enhanceOwnerSelects(el);
  const form = el.querySelector('#ct-form');
  const createBtn = el.querySelector('#ct-create');
  const anotherBtn = el.querySelector('#ct-create-another');
  const errorEl = el.querySelector('#ct-error');
  let opening = 0;
  let context = null;
  const state = { open: false, busy: false, contacts: [], companies: [], deals: [] };
  const isOpen = () => state.open;
  const read = () => { const d = {}; new FormData(form).forEach((v, k) => { d[k] = String(v).trim(); }); return d; };
  const complete = () => Boolean(form.elements.name.value.trim());
  const update = () => { const ok = complete() && !state.busy; createBtn.disabled = !ok; anotherBtn.disabled = !ok; };
  const busy = (on) => { state.busy = on; update(); };
  const showError = (msg) => { errorEl.hidden = !msg; errorEl.textContent = msg || ''; };
  // The status list follows the chosen pipeline; the first open status is the default (as the list's normalize).
  const fillStatuses = (keep) => {
    const pipeline = pipelines.includes(form.elements.pipeline.value) ? form.elements.pipeline.value : pipelines[0];
    const statuses = ticketStatusesFor(pipeline);
    form.elements.status.innerHTML = statuses.map(([k, l, t]) => `<option value="${esc(k)}">${esc(l)}${t === 'closed' ? ' (cerrado)' : ''}</option>`).join('');
    form.elements.status.value = keep && statuses.some((s) => s[0] === keep) ? keep : firstOpenTicketStatus(pipeline);
  };
  const setOwner = () => {
    const version = opening;
    const sel = form.elements.owner;
    sel.value = ownerForUser(null);
    refreshOwnerSelects(form);
    if (authEnabled()) currentUser().then((u) => { if (u && isOpen() && version === opening && !context?.owner) { sel.value = ownerForUser(u); refreshOwnerSelects(form); } }).catch(() => {});
  };
  // ---- associations (same search as the deal panel: name, e-mail or domain, up to 6 hits) ----
  const labelOptions = (kind) => (kind === 'contacts' ? labels.filter((l) => l !== 'Principal') : labels);
  const defaultLabel = (kind) => (kind === 'companies' && !state.companies.some((c) => c.label === 'Principal') ? 'Principal' : 'Sin etiqueta');
  const renderAssoc = (kind) => {
    const ul = el.querySelector(`#ct-${kind}-list`);
    ul.innerHTML = state[kind].map((c) => `
          <li class="cd-assoc__row" data-id="${c.id}">
            <div class="cd-assoc__who">
              <span class="avatar avatar--xs avatar--soft" aria-hidden="true">${esc(initials(c.name))}</span>
              <div><strong>${esc(c.name)}</strong>${c.sub ? `<small class="muted">${esc(c.sub)}</small>` : ''}</div>
              <button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-ct="remove" data-kind="${kind}" data-id="${c.id}" aria-label="Quitar ${esc(c.name)}">×</button>
            </div>
            <label class="field cd-assoc__label"><span>Etiqueta de asociación</span><select data-ct-label="${kind}" data-id="${c.id}">${labelOptions(kind).map((l) => `<option value="${esc(l)}" ${l === c.label ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="cd-check"><input type="checkbox" data-ct-log="${kind}" data-id="${c.id}" ${c.log ? 'checked' : ''} /> <span>Agregar actividad de la cronología de este objeto (${KIND_WORD[kind]})</span></label>
          </li>`).join('');
  };
  const renderResults = (kind) => {
    const input = el.querySelector(`#ct-${kind}-q`);
    const box = el.querySelector(`#ct-${kind}-results`);
    const hits = findAssociable(kind, input.value, state[kind].map((c) => c.id));
    box.hidden = !hits.length;
    box.innerHTML = hits.map((r) => `<li><button type="button" data-ct="pick" data-kind="${kind}" data-id="${r.id}"><strong>${esc(r.name)}</strong>${r.sub ? `<span class="muted">${esc(r.sub)}</span>` : ''}</button></li>`).join('');
  };
  const pick = (kind, id) => {
    const pool = kind === 'contacts' ? allContacts() : kind === 'deals' ? allDeals() : allCompanies();
    const rec = pool.find((x) => Number(x.id) === Number(id));
    if (!rec || state[kind].some((c) => Number(c.id) === Number(id))) return null;
    state[kind].push({ id: Number(rec.id), name: rec.name || 'Sin nombre', sub: (kind === 'contacts' ? rec.email : kind === 'deals' ? rec.pipeline : rec.domain) || '', label: defaultLabel(kind), log: true });
    const input = el.querySelector(`#ct-${kind}-q`);
    input.value = '';
    el.querySelector(`#ct-${kind}-results`).hidden = true;
    renderAssoc(kind);
    return rec;
  };
  const setLabel = (kind, id, label) => {
    const row = state[kind].find((c) => Number(c.id) === Number(id));
    if (!row) return;
    if (kind === 'companies' && label === 'Principal') state.companies.forEach((c) => { if (c.label === 'Principal') c.label = 'Sin etiqueta'; });
    row.label = label;
    renderAssoc(kind);
  };
  // ---- open / close / save ----
  const reset = () => {
    form.reset();
    state.contacts = [];
    state.companies = [];
    state.deals = [];
    ASSOC_KINDS.forEach((k) => { renderAssoc(k); el.querySelector(`#ct-${k}-results`).hidden = true; });
    showError('');
    form.elements.pipeline.value = pipelines[0];
    fillStatuses();
    form.elements.priority.value = 'medium';
    form.elements.source.value = SOURCES[0];
    setOwner();
    update();
  };
  function open(prefill) {
    opening += 1;
    context = prefill || {};
    reset();
    const p = context;
    if (p.pipeline && pipelines.includes(p.pipeline)) form.elements.pipeline.value = p.pipeline;
    fillStatuses(p.status);
    ['name', 'description', 'source', 'priority', 'owner'].forEach((k) => { if (p[k] !== undefined && p[k] !== null && p[k] !== '') form.elements[k].value = p[k]; });
    if (p.contactId) pick('contacts', p.contactId);
    if (p.companyId) pick('companies', p.companyId);
    if (p.dealId) pick('deals', p.dealId);
    if (fromConversation) {
      el.querySelectorAll('.cd-section input, .cd-section button, .cd-section select').forEach((control) => { control.disabled = true; });
      anotherBtn.hidden = true;
    }
    refreshOwnerSelects(form);
    update();
    state.open = true;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-slideover');
    setTimeout(() => { if (isOpen()) form.elements.name?.focus?.(); }, 50);
  }
  function close() {
    if (state.busy) return;
    state.open = false;
    opening += 1;
    context = null;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-slideover');
    reset();
  }
  // The record to insert, from the form and the chosen associations (first contact and primary company become
  // the ticket's contactId / companyId; every chosen record stays in assoc_* like the deal panel does).
  function build() {
    const d = read();
    const pipeline = pipelines.includes(d.pipeline) ? d.pipeline : pipelines[0];
    const status = ticketStatusesFor(pipeline).some((s) => s[0] === d.status) ? d.status : firstOpenTicketStatus(pipeline);
    const primary = state.companies.find((c) => c.label === 'Principal') || state.companies[0];
    const first = state.contacts[0];
    return {
      ...d,
      name: d.name,
      pipeline,
      status,
      description: d.description || '',
      source: SOURCES.includes(d.source) ? d.source : SOURCES[0],
      priority: PRIORITIES.some(([k]) => k === d.priority) ? d.priority : 'medium',
      owner: d.owner || ownerForUser(null),
      contactId: first ? first.id : '',
      contact: first ? first.name : '',
      companyId: primary ? primary.id : '',
      company: primary ? primary.name : '',
      assoc_contacts: state.contacts.map((c) => c.id),
      assoc_labels_contacts: Object.fromEntries(state.contacts.map((c) => [c.id, c.label])),
      assoc_companies: state.companies.map((c) => c.id),
      assoc_labels_companies: Object.fromEntries(state.companies.map((c) => [c.id, c.label])),
      assoc_deals: state.deals.map((c) => c.id),
      assoc_labels_deals: Object.fromEntries(state.deals.map((c) => [c.id, c.label])),
      lastActivity: TODAY.toISOString(),
    };
  }
  async function save(another) {
    if (state.busy || !complete()) return;
    busy(true);
    showError('');
    try {
      const rec = build();
      if (fromConversation && (!context?.contactId || !findRecord('contacts', context.contactId))) throw new Error('La conversación necesita un contacto asociado.');
      await validatePropertyValues('tickets', rec);
      // data.js logs «Ticket creado a partir de Creación manual» on the ticket and associates the contact's primary
      // company when none was chosen; the entries on the contacts / companies follow the panel's checkboxes.
      const made = await addRecord('tickets', rec, { waitForSave: true, origin: fromConversation ? 'Bandeja de entrada' : 'Creación manual', logAssoc: false });
      const logOn = (kind, id, suffix = '') => addActivity({ type: 'created', recordType: kind, recordId: Number(id), text: `Ticket «${rec.name}» creado y asociado a ${KIND_THIS[kind]}${suffix}.`, who: 'Tú', when: Date.now(), extra: { ticketId: made.id } });
      state.contacts.forEach((c) => { if (c.log) logOn('contacts', c.id, c.label && c.label !== 'Sin etiqueta' ? ` (${c.label})` : ''); });
      state.companies.forEach((c) => { if (c.log) logOn('companies', c.id, c.label && c.label !== 'Sin etiqueta' ? ` (${c.label})` : ''); });
      // The deal side of each association: the deal lists the ticket too (deal.assoc_tickets), as the record page does.
      state.deals.forEach((c) => {
        const deal = findRecord('deals', c.id);
        if (deal) setField('deals', deal.id, 'assoc_tickets', [...new Set([...(deal.assoc_tickets || []).map(Number), Number(made.id)])]);
        if (c.log) logOn('deals', c.id, c.label && c.label !== 'Sin etiqueta' ? ` (${c.label})` : '');
      });
      // The company data.js attached automatically (the contact's primary one) gets its entry too, once.
      const saved = findRecord('tickets', made.id) || made;
      if (saved.companyId && !state.companies.some((c) => Number(c.id) === Number(saved.companyId))) logOn('companies', saved.companyId, ' (empresa principal del contacto)');
      if (!fromConversation) toast('Ticket creado', recordToastAction('tickets', made.id));
      if (list && typeof list.render === 'function') list.render();
      if (onCreated) await onCreated(saved, context);
      busy(false);
      if (another) { reset(); setTimeout(() => { if (isOpen()) form.elements.name?.focus?.(); }, 0); } else close();
    } catch (e) {
      showError(`No se pudo crear el ticket: ${e.message || e}`);
    } finally {
      busy(false);
    }
  }
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.ctSearch) { renderResults(t.dataset.ctSearch); return; }
    update();
  });
  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'pipeline') fillStatuses();
    if (t.dataset.ctLabel) setLabel(t.dataset.ctLabel, t.dataset.id, t.value);
    if (t.dataset.ctLog) { const row = state[t.dataset.ctLog].find((c) => Number(c.id) === Number(t.dataset.id)); if (row) row.log = t.checked; }
  });
  form.addEventListener('keydown', (e) => {
    // Enter in a search box picks the first match instead of submitting.
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.ctSearch) {
      e.preventDefault();
      const first = el.querySelector(`#ct-${e.target.dataset.ctSearch}-results button`);
      if (first) pick(first.dataset.kind, first.dataset.id);
    }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  anotherBtn.addEventListener('click', () => save(true));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ct]');
    if (!b) return;
    const act = b.dataset.ct;
    if (act === 'cancel') { e.preventDefault(); close(); }
    else if (act === 'pick') pick(b.dataset.kind, b.dataset.id);
    else if (act === 'remove') { state[b.dataset.kind] = state[b.dataset.kind].filter((c) => Number(c.id) !== Number(b.dataset.id)); if (b.dataset.kind === 'companies' && state.companies.length && !state.companies.some((c) => c.label === 'Principal')) state.companies[0].label = 'Principal'; renderAssoc(b.dataset.kind); }
    else if (act === 'more') { const input = el.querySelector(`#ct-${b.dataset.kind}-q`); input.focus(); renderResults(b.dataset.kind); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen() && !state.busy) close(); });
  return { open, close, isOpen, el, state, build };
}

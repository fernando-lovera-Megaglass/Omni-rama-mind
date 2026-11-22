import { validatePropertyValues } from './data.js';
// "Crear empresa" as in the original: a slide-over panel on the right of the Empresas list with the fields
// in the original's order (Nombre de dominio, Nombre de la empresa, Propietario, Estado o región,
// País/región, Número de teléfono, Sector), Crear / Crear y agregar otro disabled until the name is filled,
// duplicate detection by domain or name while typing, a warning when the domain already belongs to a
// company, and the insert through data.js (the companies table).
import { addRecord, allCompanies, OWNERS, TODAY, strip, siteDomain, companyDomains, companiesByDomain, additionalDomainsOf, normalizeAdditionalDomains } from './data.js';
import { supabase } from './supabaseClient.js';
import { toast, recordToastAction } from './shell.js';
import { authEnabled, currentUser } from './auth.js';
import { customFieldsHtml, COUNTRIES, ownerForUser } from './create-contact.js';
import { enhanceOwnerSelects, refreshOwnerSelects } from './owner-select.js';
import { enhancePhoneInputs, refreshPhoneInputs } from './phone.js';

export const INDUSTRIES = ['Construcción', 'Arquitectura', 'Reformas', 'Inmobiliaria', 'Decoración', 'Fabricación de vidrio'];
export const FIELDS = [
  ['domain', 'Nombre de dominio de la empresa', 'text'],
  ['hs_additional_domains', 'Dominios adicionales', 'text'],
  ['name', 'Nombre de la empresa', 'text', true],
  ['owner', 'Propietario de la empresa', 'owner'],
  ['state', 'Estado o región', 'text'],
  ['country', 'País/región', 'country'],
  ['phone', 'Número de teléfono', 'tel'],
  ['industry', 'Sector', 'industry'],
];
export const HINT = 'Comienza por escribir un nombre de dominio, un nombre de cuenta o ambos.';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let searchClient = supabase;
export const setSearchClient = (c) => { searchClient = c; };
const clean = (s) => String(s || '').trim().replace(/[%,()\\'"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
// Companies whose name or domain looks like what is being typed (up to `limit`).
export async function findSimilar({ name, domain }, limit = 5) {
  const n = clean(name);
  const d = clean(siteDomain(domain) || domain);
  if (!n && !d) return [];
  if (searchClient) {
    const parts = [];
    if (n) parts.push(`name.ilike.%${n}%`);
    if (d) parts.push(`domain.ilike.%${d}%`);
    const { data, error } = await searchClient.from('companies').select('id,name,domain').or(parts.join(',')).order('id').limit(limit);
    if (error) throw error;
    return data || [];
  }
  const nn = strip(n);
  const dd = strip(d);
  return allCompanies().filter((c) => (nn && strip(c.name).includes(nn)) || (dd && companyDomains(c).some((x) => x.includes(dd)))).slice(0, limit).map((c) => ({ id: c.id, name: c.name, domain: c.domain }));
}
// The company that already uses this domain, as its main domain or as one of its «Dominios adicionales»
// (normalised, case-insensitive), or null. The one that has it as main domain wins; `matched` says which
// domain it was.
export async function findByDomain(domain) {
  const d = siteDomain(domain);
  if (!d) return null;
  let rows;
  if (searchClient) {
    const { data, error } = await searchClient.from('companies').select('id,name,domain,hs_additional_domains:extra->>hs_additional_domains').or(`domain.ilike.${d},extra->>hs_additional_domains.ilike.%${d}%`).order('id').limit(20);
    if (error) throw error;
    rows = (data || []).filter((c) => companyDomains(c).includes(d)).sort((a, b) => Number(siteDomain(b.domain) === d) - Number(siteDomain(a.domain) === d));
  } else rows = companiesByDomain(d);
  const hit = rows[0];
  return hit ? { id: hit.id, name: hit.name, domain: hit.domain, hs_additional_domains: hit.hs_additional_domains || '', matched: d } : null;
}
export const normalizeCompany = (d) => ({
  ...d,
  name: (d.name || '').trim() || siteDomain(d.domain) || 'Sin nombre',
  domain: siteDomain(d.domain) || d.domain || '',
  ...(d.hs_additional_domains !== undefined ? { hs_additional_domains: normalizeAdditionalDomains(d.hs_additional_domains, d.domain) } : {}),
  owner: d.owner || 'Sin asignar',
  lifecycle: d.lifecycle || 'Lead',
  lastActivity: TODAY.toISOString(),
});

function fieldHtml([name, label, kind, required]) {
  const req = required ? ' <span class="cc-req" aria-hidden="true">*</span>' : '';
  const lab = `<span>${label}${req}</span>`;
  if (kind === 'owner') return `<label class="field">${lab}<select name="${name}">${OWNERS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>`;
  if (kind === 'country') return `<label class="field">${lab}<select name="${name}"><option value="">--</option>${COUNTRIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>`;
  if (kind === 'industry') return `<label class="field">${lab}<select name="${name}"><option value="">--</option>${INDUSTRIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>`;
  const placeholder = name === 'domain' ? 'placeholder="ejemplo.com"' : name === 'hs_additional_domains' ? 'placeholder="filial.com; marca.com"' : '';
  return `<label class="field">${lab}<input name="${name}" type="${kind}" ${required ? 'required aria-required="true"' : ''} ${placeholder} autocomplete="off" /></label>`;
}

export function mountCreateCompany({ root = document.getElementById('list-root') || document.body, list = null, onCreated = null, debounceMs = 300, recordHref = (id) => `./record/?id=${id}` } = {}) {
  const el = document.createElement('div');
  el.className = 'slideover';
  el.id = 'cco-panel';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="slideover__scrim" data-cco="cancel"></div>
    <aside class="slideover__panel" role="dialog" aria-modal="true" aria-labelledby="cco-title">
      <header class="slideover__head"><h2 id="cco-title">Crear empresa</h2><button class="slideover__close" type="button" data-cco="cancel" aria-label="Cerrar">×</button></header>
      <form class="slideover__body" id="cco-form" novalidate>
        ${FIELDS.map(fieldHtml).join('')}<div id="cco-custom">${customFieldsHtml('companies')}</div>
        <section class="cc-dups" id="cco-dups" aria-live="polite"><p class="cc-dups__hint muted">${HINT}</p></section>
      </form>
      <footer class="slideover__foot">
        <button class="btn btn--primary" type="submit" form="cco-form" id="cco-create" disabled>Crear</button>
        <button class="btn btn--ghost" type="button" id="cco-create-another" disabled>Crear y agregar otro</button>
        <button class="link-btn" type="button" data-cco="cancel">Cancelar</button>
      </footer>
    </aside>`;
  root.appendChild(el);
  enhanceOwnerSelects(el);
  enhancePhoneInputs(el);
  const form = el.querySelector('#cco-form');
  const dups = el.querySelector('#cco-dups');
  const createBtn = el.querySelector('#cco-create');
  const anotherBtn = el.querySelector('#cco-create-another');
  const state = { open: false, busy: false, timer: null, seq: 0 };
  const isOpen = () => state.open;
  const read = () => { const d = { lifecycle: state.lifecycle || 'Lead' }; new FormData(form).forEach((v, k) => { const s = String(v).trim(); if (s) d[k] = s; }); return d; };
  const complete = () => Boolean(form.elements.name.value.trim());
  const update = () => { const ok = complete() && !state.busy; createBtn.disabled = !ok; anotherBtn.disabled = !ok; };
  const busy = (on) => { state.busy = on; update(); };
  const hint = () => { dups.className = 'cc-dups'; dups.innerHTML = `<p class="cc-dups__hint muted">${HINT}</p>`; };
  const showMatches = (rows) => {
    dups.className = 'cc-dups';
    dups.innerHTML = rows.length
      ? `<h4 class="cc-dups__title">Posibles duplicados</h4><ul class="cc-dups__list">${rows.map((r) => `<li><a href="${recordHref(r.id)}" target="_blank" rel="noopener">${esc(r.name || 'Sin nombre')}</a>${r.domain ? `<span class="muted">${esc(r.domain)}</span>` : ''}</li>`).join('')}</ul>`
      : '<p class="cc-dups__hint muted">No se han encontrado empresas parecidas.</p>';
  };
  // The same warning for the main domain and for an additional one: which domain clashed, the company that
  // has it (as its main domain or among its additional ones) and the button goes back to the field it came from.
  const showDomainDup = (dup, field = 'domain') => {
    dups.className = 'cc-dups cc-dups--warn';
    const where = dup.matched && siteDomain(dup.domain) !== dup.matched ? ` · dominio adicional ${esc(dup.matched)}` : '';
    dups.innerHTML = `<h4 class="cc-dups__title">Ya existe una empresa con ese dominio</h4><p>${dup.matched ? `<strong>${esc(dup.matched)}</strong> ya pertenece a ` : ''}<a href="${recordHref(dup.id)}" target="_blank" rel="noopener">${esc(dup.name || 'Sin nombre')}</a> <span class="muted">${esc(dup.domain || '')}${where}</span></p><p class="cc-dups__actions"><a class="btn btn--primary btn--sm" href="${recordHref(dup.id)}">Abrir la existente</a><button class="btn btn--ghost btn--sm" type="button" data-cco="fix-domain" data-field="${esc(field)}">${field === 'domain' ? 'Cambiar el dominio' : 'Cambiar los dominios adicionales'}</button></p>`;
  };
  const search = async () => {
    const d = read();
    const extra = additionalDomainsOf({ hs_additional_domains: d.hs_additional_domains });
    if (!d.name && !d.domain && !extra.length) { hint(); return; }
    const seq = (state.seq += 1);
    try {
      // by name / main domain, plus each additional domain typed (the first three), without repeats
      const lists = await Promise.all([findSimilar({ name: d.name, domain: d.domain }, 5), ...extra.slice(0, 3).map((x) => findSimilar({ domain: x }, 5))]);
      const seen = new Set();
      const rows = lists.flat().filter((r) => !seen.has(String(r.id)) && seen.add(String(r.id))).slice(0, 5);
      if (seq === state.seq && isOpen()) showMatches(rows);
    } catch (e) {
      if (seq === state.seq) { dups.className = 'cc-dups'; dups.innerHTML = `<p class="cc-dups__hint muted">No se pudieron buscar duplicados: ${esc(e.message || e)}</p>`; }
    }
  };
  const scheduleSearch = () => { clearTimeout(state.timer); state.timer = setTimeout(search, debounceMs); };
  const setOwner = () => {
    const sel = form.elements.owner;
    sel.value = ownerForUser(null);
    refreshOwnerSelects(form);
    if (authEnabled()) currentUser().then((u) => { if (u && isOpen()) { sel.value = ownerForUser(u); refreshOwnerSelects(form); } }).catch(() => {});
  };
  const reset = () => { form.reset(); hint(); update(); setOwner(); };
  function open(prefill) {
    // Board creation keeps its stage even when the form has no lifecycle field.
    state.lifecycle = prefill?.lifecycle || 'Lead';
    el.querySelector('#cco-custom').innerHTML = customFieldsHtml('companies');
    reset();
    Object.entries(prefill || {}).forEach(([k, v]) => { if (form.elements[k] && v !== undefined && v !== null) form.elements[k].value = v; });
    refreshOwnerSelects(form);
    refreshPhoneInputs(form);
    update();
    state.open = true;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-slideover');
    setTimeout(() => form.elements.domain.focus(), 50);
  }
  function close() {
    state.open = false;
    clearTimeout(state.timer);
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-slideover');
    reset();
  }
  async function save(another) {
    if (state.busy || !complete()) return;
    const d = read();
    busy(true);
    try {
      // the main domain and each additional one must be free (findByDomain looks at both kinds)
      const checks = [...(d.domain ? [[d.domain, 'domain']] : []), ...additionalDomainsOf({ hs_additional_domains: d.hs_additional_domains }).filter((x) => x !== siteDomain(d.domain)).map((x) => [x, 'hs_additional_domains'])];
      for (const [dom, field] of checks) {
        const dup = await findByDomain(dom);
        if (dup) { showDomainDup(dup, field); return; }
      }
      await validatePropertyValues('companies', d, { client: searchClient });
      const rec = await addRecord('companies', normalizeCompany(d), { waitForSave: true });
      toast('Empresa creada', recordToastAction('companies', rec.id));
      if (list && typeof list.render === 'function') list.render();
      if (onCreated) onCreated(rec);
      if (another) { reset(); setTimeout(() => form.elements.domain.focus(), 0); } else close();
    } catch (e) {
      dups.className = 'cc-dups cc-dups--warn';
      dups.innerHTML = `<p>No se pudo crear la empresa: ${esc(e.message || e)}</p>`;
    } finally {
      busy(false);
    }
  }
  form.addEventListener('input', (e) => { update(); if (['domain', 'name', 'hs_additional_domains'].includes(e.target.name)) scheduleSearch(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  anotherBtn.addEventListener('click', () => save(true));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cco]');
    if (!b) return;
    if (b.dataset.cco === 'cancel') { e.preventDefault(); close(); }
    if (b.dataset.cco === 'fix-domain') { hint(); const input = form.elements[b.dataset.field] || form.elements.domain; input.focus(); input.select?.(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
  return { open, close, isOpen, el, state };
}

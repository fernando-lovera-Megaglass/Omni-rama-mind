// "Crear empresa" as in the original: a slide-over panel on the right of the Empresas list with the fields
// in the original's order (Nombre de dominio, Nombre de la empresa, Propietario, Estado o región,
// País/región, Número de teléfono, Sector), Crear / Crear y agregar otro disabled until the name is filled,
// duplicate detection by domain or name while typing, a warning when the domain already belongs to a
// company, and the insert through data.js (the companies table).
import { addRecord, allCompanies, OWNERS, TODAY, strip, siteDomain } from './data.js';
import { supabase } from './supabaseClient.js';
import { toast } from './shell.js';
import { authEnabled, currentUser } from './auth.js';
import { COUNTRIES, ownerForUser } from './create-contact.js';

export const INDUSTRIES = ['Construcción', 'Arquitectura', 'Reformas', 'Inmobiliaria', 'Decoración', 'Fabricación de vidrio'];
export const FIELDS = [
  ['domain', 'Nombre de dominio de la empresa', 'text'],
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
  return allCompanies().filter((c) => (nn && strip(c.name).includes(nn)) || (dd && strip(c.domain).includes(dd))).slice(0, limit).map((c) => ({ id: c.id, name: c.name, domain: c.domain }));
}
// The company that already uses this domain (normalised, case-insensitive), or null.
export async function findByDomain(domain) {
  const d = siteDomain(domain);
  if (!d) return null;
  if (searchClient) {
    const { data, error } = await searchClient.from('companies').select('id,name,domain').ilike('domain', d).limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  }
  return allCompanies().find((c) => siteDomain(c.domain) === d) || null;
}
export const normalizeCompany = (d) => ({
  ...d,
  name: (d.name || '').trim() || siteDomain(d.domain) || 'Sin nombre',
  domain: siteDomain(d.domain) || d.domain || '',
  owner: d.owner || 'Sin asignar',
  lifecycle: 'Lead',
  lastActivity: TODAY.toISOString(),
});

function fieldHtml([name, label, kind, required]) {
  const req = required ? ' <span class="cc-req" aria-hidden="true">*</span>' : '';
  const lab = `<span>${label}${req}</span>`;
  if (kind === 'owner') return `<label class="field">${lab}<select name="${name}">${OWNERS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>`;
  if (kind === 'country') return `<label class="field">${lab}<select name="${name}"><option value="">--</option>${COUNTRIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>`;
  if (kind === 'industry') return `<label class="field">${lab}<select name="${name}"><option value="">--</option>${INDUSTRIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>`;
  return `<label class="field">${lab}<input name="${name}" type="${kind}" ${required ? 'required aria-required="true"' : ''} ${name === 'domain' ? 'placeholder="ejemplo.com"' : ''} autocomplete="off" /></label>`;
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
        ${FIELDS.map(fieldHtml).join('')}
        <section class="cc-dups" id="cco-dups" aria-live="polite"><p class="cc-dups__hint muted">${HINT}</p></section>
      </form>
      <footer class="slideover__foot">
        <button class="btn btn--primary" type="submit" form="cco-form" id="cco-create" disabled>Crear</button>
        <button class="btn btn--ghost" type="button" id="cco-create-another" disabled>Crear y agregar otro</button>
        <button class="link-btn" type="button" data-cco="cancel">Cancelar</button>
      </footer>
    </aside>`;
  root.appendChild(el);
  const form = el.querySelector('#cco-form');
  const dups = el.querySelector('#cco-dups');
  const createBtn = el.querySelector('#cco-create');
  const anotherBtn = el.querySelector('#cco-create-another');
  const state = { open: false, busy: false, timer: null, seq: 0 };
  const isOpen = () => state.open;
  const read = () => { const d = {}; new FormData(form).forEach((v, k) => { const s = String(v).trim(); if (s) d[k] = s; }); return d; };
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
  const showDomainDup = (dup) => {
    dups.className = 'cc-dups cc-dups--warn';
    dups.innerHTML = `<h4 class="cc-dups__title">Ya existe una empresa con ese dominio</h4><p><a href="${recordHref(dup.id)}" target="_blank" rel="noopener">${esc(dup.name || 'Sin nombre')}</a> <span class="muted">${esc(dup.domain || '')}</span></p><p class="cc-dups__actions"><a class="btn btn--primary btn--sm" href="${recordHref(dup.id)}">Abrir la existente</a><button class="btn btn--ghost btn--sm" type="button" data-cco="fix-domain">Cambiar el dominio</button></p>`;
  };
  const search = async () => {
    const d = read();
    if (!d.name && !d.domain) { hint(); return; }
    const seq = (state.seq += 1);
    try {
      const rows = await findSimilar({ name: d.name, domain: d.domain }, 5);
      if (seq === state.seq && isOpen()) showMatches(rows);
    } catch (e) {
      if (seq === state.seq) { dups.className = 'cc-dups'; dups.innerHTML = `<p class="cc-dups__hint muted">No se pudieron buscar duplicados: ${esc(e.message || e)}</p>`; }
    }
  };
  const scheduleSearch = () => { clearTimeout(state.timer); state.timer = setTimeout(search, debounceMs); };
  const setOwner = () => {
    const sel = form.elements.owner;
    sel.value = ownerForUser(null);
    if (authEnabled()) currentUser().then((u) => { if (u && isOpen()) sel.value = ownerForUser(u); }).catch(() => {});
  };
  const reset = () => { form.reset(); hint(); update(); setOwner(); };
  function open(prefill) {
    reset();
    Object.entries(prefill || {}).forEach(([k, v]) => { if (form.elements[k] && v !== undefined && v !== null) form.elements[k].value = v; });
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
      if (d.domain) {
        const dup = await findByDomain(d.domain);
        if (dup) { showDomainDup(dup); return; }
      }
      const rec = addRecord('companies', normalizeCompany(d));
      toast('Empresa creada');
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
  form.addEventListener('input', (e) => { update(); if (['domain', 'name'].includes(e.target.name)) scheduleSearch(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  anotherBtn.addEventListener('click', () => save(true));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cco]');
    if (!b) return;
    if (b.dataset.cco === 'cancel') { e.preventDefault(); close(); }
    if (b.dataset.cco === 'fix-domain') { hint(); form.elements.domain.focus(); form.elements.domain.select?.(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
  return { open, close, isOpen, el, state };
}

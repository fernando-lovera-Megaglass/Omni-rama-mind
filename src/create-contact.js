// "Crear contacto" as in the original: a slide-over panel on the right of the Contactos list (no page
// change) with the fields in the original's order, Crear / Crear y agregar otro disabled until Nombre and
// Apellidos are filled, duplicate detection while typing (Supabase ilike, or the local records), a warning
// when the e-mail already belongs to a contact, and the insert through data.js (the contacts table).
import { addRecord, allContacts, OWNERS, TODAY, strip } from './data.js';
import { supabase } from './supabaseClient.js';
import { toast } from './shell.js';
import { authEnabled, currentUser } from './auth.js';

export const BUYING_ROLES = ['Persona que toma la decisión', 'Influenciador', 'Usuario final', 'Otro'];
export const COUNTRIES = ['España', 'México', 'Estados Unidos', 'Colombia', 'Portugal', 'Argentina', 'Chile', 'Perú'];
// [name, label, kind, required]
export const FIELDS = [
  ['email', 'Correo', 'email'],
  ['first', 'Nombre', 'text', true],
  ['last', 'Apellidos', 'text', true],
  ['jobTitle', 'Cargo', 'text'],
  ['owner', 'Propietario del contacto', 'owner'],
  ['state', 'Estado o región', 'text'],
  ['country', 'País/región', 'country'],
  ['phone', 'Número de teléfono', 'tel'],
  ['mobilephone', 'Número de móvil', 'tel'],
  ['hs_buying_role', 'Rol de compra', 'role'],
];
export const HINT = 'Comienza por escribir el nombre del Contacto, su correo o ambos.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The owner that corresponds to the signed-in person (matched by first name); the first owner otherwise.
export function ownerForUser(user) {
  const owners = OWNERS.filter((o) => o !== 'Sin asignar');
  const local = strip(String((user && user.email) || '').split('@')[0]);
  const hit = owners.find((o) => local && local.startsWith(strip(o.split(' ')[0])));
  return hit || owners[0];
}

let searchClient = supabase;
export const setSearchClient = (c) => { searchClient = c; };
const clean = (s) => String(s || '').trim().replace(/[%,()\\'"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
// Contacts whose name or e-mail looks like what is being typed (up to `limit`).
export async function findSimilar({ name, email }, limit = 5) {
  const n = clean(name);
  const e = clean(email);
  if (!n && !e) return [];
  if (searchClient) {
    const parts = [];
    if (n) parts.push(`name.ilike.%${n}%`);
    if (e) parts.push(`email.ilike.%${e}%`);
    const { data, error } = await searchClient.from('contacts').select('id,name,email').or(parts.join(',')).order('id').limit(limit);
    if (error) throw error;
    return data || [];
  }
  const nn = strip(n);
  const ee = strip(e);
  return allContacts().filter((c) => (nn && strip(c.name).includes(nn)) || (ee && strip(c.email).includes(ee))).slice(0, limit).map((c) => ({ id: c.id, name: c.name, email: c.email }));
}
// The contact that already uses this e-mail (exact, case-insensitive), or null.
export async function findByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  if (searchClient) {
    const { data, error } = await searchClient.from('contacts').select('id,name,email').ilike('email', e).limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  }
  return allContacts().find((c) => String(c.email || '').toLowerCase() === e) || null;
}
export const normalizeContact = (d) => ({
  ...d,
  name: `${d.first || ''} ${d.last || ''}`.trim() || 'Sin nombre',
  status: 'new',
  owner: d.owner || 'Sin asignar',
  lifecycle: 'Lead',
  source: 'Creación manual',
  lastActivity: TODAY.toISOString(),
});

function fieldHtml([name, label, kind, required]) {
  const req = required ? ' <span class="cc-req" aria-hidden="true">*</span>' : '';
  const lab = `<span>${label}${req}</span>`;
  if (kind === 'owner') return `<label class="field">${lab}<select name="${name}">${OWNERS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>`;
  if (kind === 'country') return `<label class="field">${lab}<select name="${name}"><option value="">--</option>${COUNTRIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>`;
  if (kind === 'role') return `<label class="field">${lab}<select name="${name}"><option value="">--</option>${BUYING_ROLES.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label>`;
  return `<label class="field">${lab}<input name="${name}" type="${kind}" ${required ? 'required aria-required="true"' : ''} autocomplete="off" /></label>`;
}

export function mountCreateContact({ root = document.getElementById('list-root') || document.body, list = null, onCreated = null, debounceMs = 300, recordHref = (id) => `./record/?id=${id}` } = {}) {
  const el = document.createElement('div');
  el.className = 'slideover';
  el.id = 'cc-panel';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="slideover__scrim" data-cc="cancel"></div>
    <aside class="slideover__panel" role="dialog" aria-modal="true" aria-labelledby="cc-title">
      <header class="slideover__head"><h2 id="cc-title">Crear contacto</h2><button class="slideover__close" type="button" data-cc="cancel" aria-label="Cerrar">×</button></header>
      <form class="slideover__body" id="cc-form" novalidate>
        ${FIELDS.map(fieldHtml).join('')}
        <section class="cc-dups" id="cc-dups" aria-live="polite"><p class="cc-dups__hint muted">${HINT}</p></section>
      </form>
      <footer class="slideover__foot">
        <button class="btn btn--primary" type="submit" form="cc-form" id="cc-create" disabled>Crear</button>
        <button class="btn btn--ghost" type="button" id="cc-create-another" disabled>Crear y agregar otro</button>
        <button class="link-btn" type="button" data-cc="cancel">Cancelar</button>
      </footer>
    </aside>`;
  root.appendChild(el);
  const form = el.querySelector('#cc-form');
  const dups = el.querySelector('#cc-dups');
  const createBtn = el.querySelector('#cc-create');
  const anotherBtn = el.querySelector('#cc-create-another');
  const state = { open: false, busy: false, timer: null, seq: 0 };
  const isOpen = () => state.open;

  const read = () => {
    const d = {};
    new FormData(form).forEach((v, k) => { const s = String(v).trim(); if (s) d[k] = s; });
    return d;
  };
  const complete = () => Boolean(form.elements.first.value.trim() && form.elements.last.value.trim());
  const update = () => { const ok = complete() && !state.busy; createBtn.disabled = !ok; anotherBtn.disabled = !ok; };
  const busy = (on) => { state.busy = on; update(); };
  const hint = () => { dups.className = 'cc-dups'; dups.innerHTML = `<p class="cc-dups__hint muted">${HINT}</p>`; };
  const showMatches = (rows) => {
    dups.className = 'cc-dups';
    dups.innerHTML = rows.length
      ? `<h4 class="cc-dups__title">Posibles duplicados</h4><ul class="cc-dups__list">${rows.map((r) => `<li><a href="${recordHref(r.id)}" target="_blank" rel="noopener">${esc(r.name || 'Sin nombre')}</a>${r.email ? `<span class="muted">${esc(r.email)}</span>` : ''}</li>`).join('')}</ul>`
      : '<p class="cc-dups__hint muted">No se han encontrado contactos parecidos.</p>';
  };
  const showEmailDup = (dup) => {
    dups.className = 'cc-dups cc-dups--warn';
    dups.innerHTML = `<h4 class="cc-dups__title">Ya existe un contacto con ese correo</h4><p><a href="${recordHref(dup.id)}" target="_blank" rel="noopener">${esc(dup.name || 'Sin nombre')}</a> <span class="muted">${esc(dup.email || '')}</span></p><p class="cc-dups__actions"><a class="btn btn--primary btn--sm" href="${recordHref(dup.id)}">Abrir el existente</a><button class="btn btn--ghost btn--sm" type="button" data-cc="fix-email">Cambiar el correo</button></p>`;
  };
  // Duplicate candidates while typing (debounced); the newest answer wins.
  const search = async () => {
    const d = read();
    const name = [d.first, d.last].filter(Boolean).join(' ');
    if (!name && !d.email) { hint(); return; }
    const seq = (state.seq += 1);
    try {
      const rows = await findSimilar({ name, email: d.email }, 5);
      if (seq === state.seq && isOpen()) showMatches(rows);
    } catch (e) {
      if (seq === state.seq) { dups.className = 'cc-dups'; dups.innerHTML = `<p class="cc-dups__hint muted">No se pudieron buscar duplicados: ${esc(e.message || e)}</p>`; }
    }
  };
  const scheduleSearch = () => { clearTimeout(state.timer); state.timer = setTimeout(search, debounceMs); };

  const reset = () => { form.reset(); hint(); update(); setOwner(); };
  const setOwner = () => {
    const sel = form.elements.owner;
    sel.value = ownerForUser(null);
    if (authEnabled()) currentUser().then((u) => { if (u && isOpen()) sel.value = ownerForUser(u); }).catch(() => {});
  };
  function open(prefill) {
    reset();
    Object.entries(prefill || {}).forEach(([k, v]) => { if (form.elements[k] && v !== undefined && v !== null) form.elements[k].value = v; });
    update();
    state.open = true;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-slideover');
    setTimeout(() => form.elements.email.focus(), 50);
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
    if (d.email && !EMAIL_RE.test(d.email)) { form.elements.email.focus(); dups.className = 'cc-dups cc-dups--warn'; dups.innerHTML = '<p>Escribe un correo válido o deja el campo vacío.</p>'; return; }
    busy(true);
    try {
      if (d.email) {
        const dup = await findByEmail(d.email);
        if (dup) { showEmailDup(dup); return; }
      }
      const rec = addRecord('contacts', normalizeContact(d));
      toast('Contacto creado');
      if (list && typeof list.render === 'function') list.render();
      if (onCreated) onCreated(rec);
      if (another) { reset(); setTimeout(() => form.elements.email.focus(), 0); } else close();
    } catch (e) {
      dups.className = 'cc-dups cc-dups--warn';
      dups.innerHTML = `<p>No se pudo crear el contacto: ${esc(e.message || e)}</p>`;
    } finally {
      busy(false);
    }
  }

  form.addEventListener('input', (e) => {
    update();
    if (['email', 'first', 'last'].includes(e.target.name)) scheduleSearch();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  anotherBtn.addEventListener('click', () => save(true));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cc]');
    if (!b) return;
    if (b.dataset.cc === 'cancel') { e.preventDefault(); close(); }
    if (b.dataset.cc === 'fix-email') { hint(); form.elements.email.focus(); form.elements.email.select?.(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
  return { open, close, isOpen, el, state };
}

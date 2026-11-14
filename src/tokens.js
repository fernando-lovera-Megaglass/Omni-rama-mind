// Personalisation tokens, shared by templates, snippets, the e-mail composer and timeline notes:
// the object/property catalogue (every standard and custom property of contacts, companies, owners, deals
// and tickets), the two-step picker ("Token de personalización"), the non-editable chips inside rich-text
// editors, the {{objeto.propiedad|valor predeterminado}} markers saved in text, and the resolution engine
// that fills them with a record's real data (the default when the record has no value, '' otherwise).
import { allContacts, allCompanies, allDeals, allTickets, formatDate, formatMoney, dealStageLabel, ticketStatusLabel, labelOf, PRIORITIES } from './data.js';
import { propertyList } from './properties.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
export const CURRENT_USER = 'Fernando L.';
// [token prefix, label, data.js type (null = owners), "of the …" for chip labels]
export const OBJECTS = [
  ['contacto', 'Contacto', 'contacts', 'del contacto'],
  ['empresa', 'Empresa', 'companies', 'de la empresa'],
  ['propietario', 'Propietario', null, 'del propietario'],
  ['negocio', 'Negocio', 'deals', 'del negocio'],
  ['ticket', 'Ticket', 'tickets', 'del ticket'],
];
const OWNER_PROPS = [['nombre', 'Nombre', 'first'], ['apellidos', 'Apellidos', 'last'], ['nombre_completo', 'Nombre completo', 'name'], ['correo', 'Correo', 'email'], ['telefono', 'Número de teléfono', 'phone'], ['cargo', 'Cargo', 'jobTitle']];
const OWNER_DIRECTORY = {
  'Fernando L.': { first: 'Fernando', last: 'Lovera Colin', name: 'Fernando Lovera Colin', email: 'fernando-lovera@megaglass.us', phone: '+1-305-753-0007', jobTitle: 'President' },
  'Sofía R.': { first: 'Sofía', last: 'Ramírez', name: 'Sofía Ramírez', email: 'sofia@megaglass.us', phone: '+52-712-690-1001', jobTitle: 'Ejecutiva de ventas' },
  'Diego G.': { first: 'Diego', last: 'García', name: 'Diego García', email: 'diego@megaglass.us', phone: '+52-712-690-1002', jobTitle: 'Ejecutivo de ventas' },
  'Laura M.': { first: 'Laura', last: 'Martín', name: 'Laura Martín', email: 'laura@megaglass.us', phone: '+52-712-690-1003', jobTitle: 'Soporte técnico' },
};
// Readable token names for the usual properties (the rest use a slug of their label).
const ALIASES = {
  contacto: { first: 'nombre', last: 'apellidos', name: 'nombre_completo', email: 'correo', alt_email: 'correo_alternativo', phone: 'telefono', mobilephone: 'movil', jobTitle: 'cargo', city: 'ciudad', company: 'empresa', owner: 'propietario', state: 'estado', country: 'pais', address: 'direccion', zip: 'codigo_postal', lifecycle: 'etapa_del_ciclo_de_vida', leadStatus: 'estado_del_lead' },
  empresa: { name: 'nombre', domain: 'dominio', website: 'sitio_web', industry: 'sector', city: 'ciudad', phone: 'telefono', owner: 'propietario', state: 'estado', country: 'pais', type: 'tipo', address: 'direccion', zip: 'codigo_postal', description: 'descripcion' },
  negocio: { name: 'nombre', amount: 'monto', stage: 'etapa', closeDate: 'fecha_de_cierre', pipeline: 'pipeline', owner: 'propietario', priority: 'prioridad', type: 'tipo', description: 'descripcion' },
  ticket: { name: 'asunto', status: 'estado', priority: 'prioridad', pipeline: 'pipeline', owner: 'propietario', description: 'descripcion', source: 'fuente' },
};

export const objectDef = (key) => OBJECTS.find((o) => o[0] === key) || null;
export function ownerRecord(name) {
  const n = String(name || '').trim();
  if (!n || n === 'Sin asignar') return null;
  if (OWNER_DIRECTORY[n]) return { ...OWNER_DIRECTORY[n], owner: n };
  const first = n.split(' ')[0];
  return { first, last: n.slice(first.length).trim(), name: n, email: '', phone: '', jobTitle: '', owner: n };
}
// Every property of an object, each with its token (`contacto.nombre`), chip label («Nombre del contacto») and group.
export function propertiesFor(objKey) {
  const obj = objectDef(objKey);
  if (!obj) return [];
  let base;
  if (!obj[2]) base = OWNER_PROPS.map(([s, label, key]) => ({ key, label, kind: 'text', group: 'Propietario', custom: false, system: false, hint: s }));
  else {
    base = propertyList(obj[2]).filter((p) => p.kind !== 'calc');
    if (objKey === 'contacto' && !base.some((p) => p.key === 'company')) base.push({ key: 'company', label: 'Nombre de la empresa', kind: 'text', group: 'Información del contacto', custom: false, system: false });
  }
  const alias = ALIASES[objKey] || {};
  const used = new Set();
  return base.map((p) => {
    const b = p.hint || alias[p.key] || slug(p.label) || slug(p.key) || 'propiedad';
    let s = b;
    for (let n = 2; used.has(s); n += 1) s = `${b}_${n}`;
    used.add(s);
    return { ...p, slug: s, token: `${objKey}.${s}`, chip: `${p.label} ${obj[3]}` };
  }).sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
export const findProperty = (objKey, slugOrKey) => propertiesFor(objKey).find((p) => p.slug === slugOrKey || p.key === slugOrKey) || null;
export function chipLabel(token) {
  const [o, s] = String(token).split('.');
  const p = findProperty(o, s);
  return p ? p.chip : token;
}

// ---------- values ----------
function valueOf(objKey, rec, p) {
  if (!rec || !p) return '';
  const v = rec[p.key];
  if (v === undefined || v === null || v === '') return '';
  const k = p.kind;
  try {
    if (k === 'currency' || p.key === 'amount') return formatMoney(v, rec.deal_currency_code);
    if (k === 'date' || k === 'datetime' || k === 'date-ro') return formatDate(v);
    if (k === 'stage') return dealStageLabel(rec.pipeline, v);
    if (k === 'priority') return labelOf(PRIORITIES, v);
    if (k === 'status' && objKey === 'ticket') return ticketStatusLabel(rec.pipeline, v);
    if (k === 'percent') return `${v} %`;
    if (Array.isArray(p.options) && p.options.length && Array.isArray(p.options[0])) { const o = p.options.find((x) => String(x[0]) === String(v)); if (o) return String(o[1]); }
  } catch { /* fall back to the raw value */ }
  return Array.isArray(v) ? v.join(', ') : String(v);
}
const byId = (list, id) => (id ? list().find((x) => String(x.id) === String(id)) : null) || null;
const newest = (list) => [...list].sort((a, b) => new Date(b.created || b.lastActivity || 0) - new Date(a.created || a.lastActivity || 0))[0] || null;
// The records a token can read from, derived from what is known: a contact brings its company, its latest
// deal and ticket and its owner; a company brings its first contact; a deal/ticket brings its contact and company.
export function contextFor({ contact = null, company = null, deal = null, ticket = null, owner = null } = {}) {
  let c = contact; let co = company; let d = deal; let t = ticket;
  if (!c && d && d.contactId) c = byId(allContacts, d.contactId);
  if (!c && t && t.contactId) c = byId(allContacts, t.contactId);
  if (!co && c) co = byId(allCompanies, c.companyId) || (c.company ? allCompanies().find((x) => x.name === c.company) : null) || null;
  if (!co && d && d.companyId) co = byId(allCompanies, d.companyId);
  if (!co && t && t.companyId) co = byId(allCompanies, t.companyId);
  if (!c && co) c = allContacts().find((x) => String(x.companyId) === String(co.id)) || null;
  const linked = (x) => (c && String(x.contactId) === String(c.id)) || (co && String(x.companyId) === String(co.id));
  if (!d && (c || co)) d = newest(allDeals().filter(linked));
  if (!t && (c || co)) t = newest(allTickets().filter(linked));
  const o = (owner && (typeof owner === 'string' ? ownerRecord(owner) : owner)) || ownerRecord((c && c.owner) || (co && co.owner) || (d && d.owner) || (t && t.owner) || '') || ownerRecord(CURRENT_USER);
  return { contact: c, company: co, deal: d, ticket: t, owner: o };
}
export function contextFromRecord(type, rec, extra = {}) {
  const slot = { contacts: 'contact', companies: 'company', deals: 'deal', tickets: 'ticket' }[type];
  return contextFor(slot && rec ? { [slot]: rec, ...extra } : extra);
}
const LISTS = { contacts: allContacts, companies: allCompanies, deals: allDeals, tickets: allTickets };
// The record of the page we are on (contact/company/deal/ticket record pages).
export function contextFromPage() {
  const type = document.body.dataset.type;
  const id = new URLSearchParams(location.search).get('id');
  if (!type || !LISTS[type] || !id) return contextFor({});
  return contextFromRecord(type, LISTS[type]().find((r) => String(r.id) === String(id)) || null);
}
const SLOT = { contacto: 'contact', empresa: 'company', propietario: 'owner', negocio: 'deal', ticket: 'ticket' };
export function resolveToken(objKey, slugOrKey, ctx, cache = {}) {
  const props = cache[objKey] || (cache[objKey] = propertiesFor(objKey));
  const p = props.find((x) => x.slug === slugOrKey || x.key === slugOrKey);
  return valueOf(objKey, (ctx || {})[SLOT[objKey]], p);
}

// ---------- markers ----------
export const MARKER_RE = /{{\s*([a-z_]+)\.([\w-]+)\s*(?:\|([^}]*))?}}/g;
// Replaces every {{objeto.propiedad|predeterminado}} with the record's value, the default, or ''.
export function renderTokens(text, ctx) {
  const cache = {};
  return String(text || '').replace(MARKER_RE, (m, o, s, def) => {
    const v = resolveToken(o, s, ctx, cache);
    return v !== '' ? v : String(def || '').trim();
  });
}
export const hasTokens = (text) => { MARKER_RE.lastIndex = 0; return MARKER_RE.test(String(text || '')); };
export const tokenMarker = (token, def = '') => `{{${token}${def ? `|${def}` : ''}}}`;
// The chip shown inside a rich-text editor (not editable; carries the token and its default).
export const chipHtml = (token, def = '') => `<span class="tok" contenteditable="false" data-token="${esc(token)}"${def ? ` data-default="${esc(def)}"` : ''} title="${esc(tokenMarker(token, def))}">${esc(chipLabel(token))}</span>`;
export const markersToChips = (text) => String(text || '').replace(MARKER_RE, (m, o, s, def) => chipHtml(`${o}.${s}`, String(def || '').trim()));
export function chipsToMarkers(html) {
  if (!html || !html.includes('class="tok"')) return String(html || '');
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('.tok[data-token]').forEach((s) => s.replaceWith(document.createTextNode(tokenMarker(s.dataset.token, s.dataset.default || ''))));
  return div.innerHTML;
}
export function plainText(html) {
  const t = document.createElement('textarea');
  t.innerHTML = String(html || '').replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  return t.value.replace(/\n{3,}/g, '\n\n').trim();
}
// Inserts HTML at the caret of a contenteditable (at the end when the caret is elsewhere).
export function insertAtCaret(el, html) {
  const win = el.ownerDocument.defaultView;
  el.focus();
  try {
    const sel = win.getSelection();
    if (sel && sel.rangeCount && el.contains(sel.getRangeAt(0).startContainer)) {
      const r = sel.getRangeAt(0);
      r.deleteContents();
      const frag = r.createContextualFragment(html);
      const last = frag.lastChild;
      r.insertNode(frag);
      if (last) { r.setStartAfter(last); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
      return true;
    }
  } catch { /* fall through */ }
  el.insertAdjacentHTML('beforeend', html);
  return false;
}

// ---------- picker ----------
let pick = null;
export function closeTokenPicker() {
  if (!pick) return;
  pick.el.remove();
  document.removeEventListener('mousedown', pick.outside, true);
  document.removeEventListener('keydown', pick.key, true);
  pick = null;
}
export const tokenPickerOpen = () => Boolean(pick);
// mode 'token': 1) object type 2) searchable property list + default value + Insertar → onPick({ token, label, chip, defaultValue, property }).
// mode 'snippet': searchable list of the given snippets → onPick({ snippet }).
export function openTokenPicker({ anchor, mode = 'token', onPick, snippets = [], objects = OBJECTS, title = 'Token de personalización' }) {
  closeTokenPicker();
  const el = document.createElement('div');
  el.className = 'tokpick';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', mode === 'snippet' ? 'Fragmento' : title);
  const state = { step: mode === 'snippet' ? 'snippet' : 'object', object: null, props: [], q: '', selected: null, def: '' };
  document.body.appendChild(el);
  if (anchor && typeof anchor.getBoundingClientRect === 'function') {
    const r = anchor.getBoundingClientRect();
    const width = 340;
    const vw = window.innerWidth || 1200;
    const vh = window.innerHeight || 800;
    el.style.left = `${Math.max(8, Math.min(r.left, vw - width - 8))}px`;
    el.style.top = `${r.bottom + 4 + 420 > vh && r.top - 424 > 0 ? r.top - 424 : r.bottom + 4}px`;
  }
  const listHtml = () => {
    const q = state.q.trim().toLowerCase();
    if (state.step === 'snippet') {
      const list = snippets.filter((s) => !q || `${s.name} #${s.shortcut}`.toLowerCase().includes(q));
      return list.length ? list.map((s) => `<button class="tokpick__item" type="button" data-pick-snippet="${esc(s.id)}"><span>${esc(s.name)}</span><span class="muted">#${esc(s.shortcut)}</span></button>`).join('') : '<div class="tokpick__empty muted">Sin fragmentos</div>';
    }
    const list = state.props.filter((p) => !q || p.label.toLowerCase().includes(q) || p.slug.includes(q));
    return list.length ? list.map((p) => `<button class="tokpick__item${state.selected === p.slug ? ' is-active' : ''}" type="button" data-pick-prop="${esc(p.slug)}"><span>${esc(p.label)}</span>${p.custom ? '<span class="tokpick__custom">Personalizada</span>' : ''}</button>`).join('') : '<div class="tokpick__empty muted">Ninguna propiedad coincide</div>';
  };
  const render = () => {
    if (state.step === 'object') {
      el.innerHTML = `<div class="tokpick__head"><strong>${esc(title)}</strong><button class="tokpick__close" type="button" data-pick="close" aria-label="Cerrar">×</button></div><div class="tokpick__hint muted">Elige el tipo de objeto</div><div class="tokpick__list">${objects.map((o) => `<button class="tokpick__item" type="button" data-pick-object="${o[0]}"><span>${esc(o[1])}</span><span class="muted">›</span></button>`).join('')}</div>`;
      return;
    }
    if (state.step === 'snippet') {
      el.innerHTML = `<div class="tokpick__head"><strong>Fragmento</strong><button class="tokpick__close" type="button" data-pick="close" aria-label="Cerrar">×</button></div><input class="tokpick__search" type="search" placeholder="Buscar fragmentos" aria-label="Buscar fragmentos" /><div class="tokpick__list">${listHtml()}</div>`;
      el.querySelector('.tokpick__search').focus();
      return;
    }
    const obj = objectDef(state.object);
    el.innerHTML = `<div class="tokpick__head"><button class="tokpick__back" type="button" data-pick="back" aria-label="Volver">‹</button><strong>${esc(obj[1])}</strong><button class="tokpick__close" type="button" data-pick="close" aria-label="Cerrar">×</button></div><input class="tokpick__search" type="search" placeholder="Buscar propiedades de ${esc(obj[1].toLowerCase())}" aria-label="Buscar propiedades" /><div class="tokpick__list">${listHtml()}</div><div class="tokpick__foot" ${state.selected ? '' : 'hidden'}><label><span>Valor predeterminado</span><input class="tokpick__default" type="text" placeholder="Si el registro no tiene dato" value="${esc(state.def)}" /></label><button class="btn btn--primary btn--sm" type="button" data-pick="insert">Insertar</button></div>`;
    el.querySelector('.tokpick__search').focus();
  };
  el.addEventListener('input', (e) => {
    if (e.target.classList.contains('tokpick__search')) { state.q = e.target.value; el.querySelector('.tokpick__list').innerHTML = listHtml(); } else if (e.target.classList.contains('tokpick__default')) state.def = e.target.value;
  });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const o = e.target.closest('[data-pick-object]');
    if (o) { state.object = o.dataset.pickObject; state.props = propertiesFor(state.object); state.step = 'property'; state.q = ''; state.selected = null; render(); return; }
    const p = e.target.closest('[data-pick-prop]');
    if (p) {
      state.selected = p.dataset.pickProp;
      el.querySelectorAll('[data-pick-prop]').forEach((b) => b.classList.toggle('is-active', b.dataset.pickProp === state.selected));
      const foot = el.querySelector('.tokpick__foot');
      foot.hidden = false;
      foot.querySelector('.tokpick__default').focus();
      return;
    }
    const s = e.target.closest('[data-pick-snippet]');
    if (s) { const snippet = snippets.find((x) => x.id === s.dataset.pickSnippet); closeTokenPicker(); if (snippet && onPick) onPick({ snippet }); return; }
    const a = e.target.closest('[data-pick]');
    if (!a) return;
    if (a.dataset.pick === 'close') closeTokenPicker();
    else if (a.dataset.pick === 'back') { state.step = 'object'; state.selected = null; render(); } else if (a.dataset.pick === 'insert' && state.selected) {
      const property = state.props.find((x) => x.slug === state.selected);
      const token = `${state.object}.${state.selected}`;
      const defaultValue = state.def.trim();
      closeTokenPicker();
      if (onPick) onPick({ token, label: property ? property.label : state.selected, chip: chipLabel(token), defaultValue, property, marker: tokenMarker(token, defaultValue) });
    }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && state.step === 'property' && state.selected) { e.preventDefault(); el.querySelector('[data-pick="insert"]').click(); } });
  pick = {
    el,
    outside: (e) => { if (!el.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) closeTokenPicker(); },
    key: (e) => { if (e.key === 'Escape') closeTokenPicker(); },
  };
  document.addEventListener('mousedown', pick.outside, true);
  document.addEventListener('keydown', pick.key, true);
  render();
  return el;
}

// Owner / user dropdowns like the original's: each option shows the person's avatar (initials with their colour,
// the grey placeholder for «Sin asignar») to the left of the name, the closed field shows the chosen one the
// same way, and a search box filters long user lists. The native <select> stays in the DOM (hidden) as the
// source of truth, so forms, FormData, `form.elements.owner`, `change` listeners and tests keep working:
// picking an option sets its value and dispatches input + change on it.
import { ownerHtml, ownerAvatarHtml } from './owner.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const OWNER_SELECT = 'select[data-owner-select], select[name="owner"]';
const EMPTY_LABELS = /^(sin asignar|--|—|cualquiera|ninguno|)$/i;
let globalWired = false;

function closeOsel(wrap) {
  wrap.classList.remove('is-open');
  const b = wrap.querySelector('.osel__btn');
  if (b) b.setAttribute('aria-expanded', 'false');
  const p = wrap.querySelector('.osel__panel');
  if (p) p.hidden = true;
}
export const closeOwnerSelects = (except = null) => { document.querySelectorAll('.osel.is-open').forEach((w) => { if (w !== except) closeOsel(w); }); };
function wireGlobal() {
  if (globalWired || typeof document === 'undefined') return;
  globalWired = true;
  document.addEventListener('click', (e) => { document.querySelectorAll('.osel.is-open').forEach((w) => { if (!w.contains(e.target)) closeOsel(w); }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.osel.is-open').forEach((w) => { closeOsel(w); const b = w.querySelector('.osel__btn'); if (b) b.focus(); }); });
}
const labelOf = (opt) => (opt ? opt.textContent.trim() : '');
// Avatar + name of an option; an empty value (or «Sin asignar» / «--») gets the placeholder avatar.
export function ownerOptionHtml(opt) {
  const label = labelOf(opt);
  if (!opt || opt.value === '' || EMPTY_LABELS.test(label)) return `<span class="owner owner--none">${ownerAvatarHtml('', 'xs')}<span class="owner__name muted">${esc(label && !/^(--|—|)$/.test(label) ? label : 'Sin asignar')}</span></span>`;
  return ownerHtml(label, 'xs');
}

function enhance(sel) {
  if (!sel || sel.dataset.oselWired) return;
  sel.dataset.oselWired = '1';
  const doc = sel.ownerDocument;
  const Ev = (name) => new doc.defaultView.Event(name, { bubbles: true });
  const wrap = doc.createElement('div');
  wrap.className = `osel${sel.classList.contains('cellpop__input') || sel.classList.contains('ginput--sm') ? ' osel--sm' : ''}`;
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add('osel__native');
  sel.setAttribute('aria-hidden', 'true');
  sel.tabIndex = -1;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'osel__btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const label = sel.getAttribute('aria-label') || (sel.labels && sel.labels[0] ? sel.labels[0].textContent.trim() : '') || 'Propietario';
  btn.setAttribute('aria-label', label);
  const panel = doc.createElement('div');
  panel.className = 'osel__panel';
  panel.hidden = true;
  panel.innerHTML = '<div class="osel__search"><input type="search" placeholder="Buscar usuario" aria-label="Buscar usuario" autocomplete="off" /></div><div class="osel__list" role="listbox"></div>';
  wrap.append(btn, panel);
  const search = panel.querySelector('input');
  const listEl = panel.querySelector('.osel__list');
  const options = () => [...sel.options].filter((o) => !o.disabled);
  const renderBtn = () => { btn.innerHTML = `${ownerOptionHtml(sel.selectedOptions[0] || null)}<span class="caret" aria-hidden="true"></span>`; };
  const renderList = () => {
    const q = search.value.trim().toLowerCase();
    const items = options().filter((o) => !q || labelOf(o).toLowerCase().includes(q));
    listEl.innerHTML = items.length ? items.map((o) => `<button type="button" class="osel__opt${o.selected ? ' is-selected' : ''}" role="option" aria-selected="${o.selected}" data-value="${esc(o.value)}">${ownerOptionHtml(o)}</button>`).join('') : '<div class="osel__empty muted">Ningún usuario coincide</div>';
  };
  const open = () => { closeOwnerSelects(wrap); wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); panel.hidden = false; search.value = ''; renderList(); search.focus(); };
  const pick = (value) => {
    if (sel.value !== value) { sel.value = value; sel.dispatchEvent(Ev('input')); sel.dispatchEvent(Ev('change')); }
    closeOsel(wrap);
    renderBtn();
    btn.focus();
  };
  btn.addEventListener('click', () => (wrap.classList.contains('is-open') ? closeOsel(wrap) : open()));
  // Keep the focus inside the field while choosing (inline editors save when the focus leaves them).
  listEl.addEventListener('mousedown', (e) => e.preventDefault());
  listEl.addEventListener('click', (e) => { const o = e.target.closest('.osel__opt'); if (o) pick(o.dataset.value); });
  search.addEventListener('input', renderList);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const first = listEl.querySelector('.osel__opt'); if (first) pick(first.dataset.value); } else if (e.key === 'ArrowDown') { e.preventDefault(); const first = listEl.querySelector('.osel__opt'); if (first) first.focus(); }
  });
  listEl.addEventListener('keydown', (e) => {
    const items = [...listEl.querySelectorAll('.osel__opt')];
    const i = items.indexOf(doc.activeElement);
    if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) items[i - 1].focus(); else search.focus(); }
  });
  sel.addEventListener('change', renderBtn);
  if (sel.form) sel.form.addEventListener('reset', () => setTimeout(renderBtn, 0));
  renderBtn();
  wrap._osel = { renderBtn, renderList };
}

// Enhances every owner select inside `scope` (a container or a select) that is not enhanced yet.
export function enhanceOwnerSelects(scope = typeof document !== 'undefined' ? document : null) {
  if (!scope) return 0;
  wireGlobal();
  const list = scope.matches && scope.matches('select') ? [scope] : [...scope.querySelectorAll(OWNER_SELECT)];
  list.forEach(enhance);
  return list.length;
}
// Redraws the closed fields after their value was set by code (prefill, reset).
export function refreshOwnerSelects(scope = typeof document !== 'undefined' ? document : null) {
  if (!scope) return;
  scope.querySelectorAll('.osel').forEach((w) => { if (w._osel) w._osel.renderBtn(); });
}

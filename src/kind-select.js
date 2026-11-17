// «Tipo de campo» dropdown with an icon per kind (Ajustes › Propiedades › Crear propiedad).
// Like owner-select.js: the native <select> stays hidden in the DOM as the source of truth —
// picking an option sets its value and dispatches input + change so forms and tests keep working.
import { FIELD_ICONS } from './action-icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let globalWired = false;

function closeKsel(wrap) {
  wrap.classList.remove('is-open');
  const b = wrap.querySelector('.ksel__btn');
  if (b) b.setAttribute('aria-expanded', 'false');
  const p = wrap.querySelector('.ksel__panel');
  if (p) p.hidden = true;
}
export const closeKindSelects = (except = null) => { document.querySelectorAll('.ksel.is-open').forEach((w) => { if (w !== except) closeKsel(w); }); };
function wireGlobal() {
  if (globalWired || typeof document === 'undefined') return;
  globalWired = true;
  document.addEventListener('click', (e) => { document.querySelectorAll('.ksel.is-open').forEach((w) => { if (!w.contains(e.target)) closeKsel(w); }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.ksel.is-open').forEach((w) => { closeKsel(w); const b = w.querySelector('.ksel__btn'); if (b) b.focus(); }); });
}

function enhance(sel) {
  if (!sel || sel.dataset.kselWired) return;
  sel.dataset.kselWired = '1';
  const doc = sel.ownerDocument;
  const Ev = (name) => new doc.defaultView.Event(name, { bubbles: true });
  const wrap = doc.createElement('div');
  wrap.className = 'ksel';
  const render = () => {
    const cur = sel.options[sel.selectedIndex];
    wrap.querySelector('.ksel__btn').innerHTML = `<span class="ksel__opt"><span class="ksel__ico">${FIELD_ICONS[sel.value] || ''}</span>${esc(cur ? cur.textContent.trim() : '')}</span><span class="caret" aria-hidden="true"></span>`;
    wrap.querySelectorAll('.ksel__item').forEach((it) => {
      const on = it.dataset.value === sel.value;
      it.classList.toggle('is-selected', on);
      if (on) it.setAttribute('aria-selected', 'true'); else it.removeAttribute('aria-selected');
    });
  };
  wrap.innerHTML = `<button class="ksel__btn" type="button" aria-haspopup="listbox" aria-expanded="false"></button>
    <div class="ksel__panel" role="listbox" hidden>
      ${Array.from(sel.options).map((o) => `<button class="ksel__item" type="button" role="option" data-value="${esc(o.value)}"><span class="ksel__ico">${FIELD_ICONS[o.value] || ''}</span><span class="ksel__txt">${esc(o.textContent.trim())}</span><span class="ksel__check" aria-hidden="true">✓</span></button>`).join('')}
    </div>`;
  sel.classList.add('ksel__native');
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  const btn = wrap.querySelector('.ksel__btn');
  const panel = wrap.querySelector('.ksel__panel');
  btn.addEventListener('click', () => {
    const open = !wrap.classList.contains('is-open');
    closeKindSelects(wrap);
    wrap.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  });
  panel.addEventListener('click', (e) => {
    const it = e.target.closest('.ksel__item');
    if (!it) return;
    sel.value = it.dataset.value;
    sel.dispatchEvent(Ev('input'));
    sel.dispatchEvent(Ev('change'));
    render();
    closeKsel(wrap);
    btn.focus();
  });
  sel.addEventListener('change', render);
  render();
}

// Enhance every «kind» select present now and added later (the property editor opens in a modal).
export function enhanceKindSelects(root = document) {
  wireGlobal();
  root.querySelectorAll('select#prop-kind, select[name="kind"][data-icons]').forEach(enhance);
}

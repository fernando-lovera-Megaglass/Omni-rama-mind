// Filter controls keep their existing id/value/change contract without a native select.
// Option templates also preserve grouped action catalogs and dynamically refreshed owners.
import { ownerOptionHtml } from './owner-select.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
class FilterChip extends HTMLElement {
  connectedCallback() {
    if (this._ready) return;
    this._ready = true;
    this.classList.add('menu', 'filter-chip');
    this.dataset.wired = '1'; // This control handles its own search and keyboard events.
    this.readOptions();
    this.addEventListener('click', (event) => {
      event.stopPropagation();
      const option = event.target.closest('[data-value]');
      if (option) this.pick(option.dataset.value);
      else if (event.target.closest('.qchip__x')) this.pick('');
      else if (event.target.closest('.qchip')) this.open(!this.classList.contains('is-open'));
    });
    this.addEventListener('input', (event) => {
      if (event.target.type !== 'search') return;
      const q = event.target.value.trim().toLocaleLowerCase();
      this.querySelectorAll('[data-value]').forEach((o) => { o.hidden = !o.textContent.toLocaleLowerCase().includes(q); });
    });
    this.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { this.open(false); this.querySelector('.qchip').focus(); }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      if (!this.classList.contains('is-open')) this.open(true);
      const items = [...this.querySelectorAll('[data-value]')].filter((o) => !o.hidden);
      const index = items.indexOf(this.ownerDocument.activeElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    });
    this._outside = (e) => { if (!this.contains(e.target)) this.open(false); };
    document.addEventListener('click', this._outside);
    this._observer = new window.MutationObserver(() => { if (this.querySelector('template')) this.readOptions(); });
    this._observer.observe(this, { childList: true });
  }
  disconnectedCallback() {
    document.removeEventListener('click', this._outside);
    this._observer?.disconnect();
    this._ready = false;
  }
  readOptions() {
    const template = this.querySelector('template');
    if (!template) return;
    this._options = [...template.content.querySelectorAll('option')].map((o) => ({ value: o.value, textContent: o.textContent, group: o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement.label : '' }));
    if (this._value === undefined) this._value = template.content.querySelector('option[selected]')?.value || '';
    this.render();
  }
  get value() { return this._value || ''; }
  set value(v) { this._value = String(v ?? ''); if (this.querySelector('template')) this.readOptions(); else if (this._options) this.render(); }
  render() {
    const label = this.getAttribute('aria-label') || 'Filtro';
    const owner = this.hasAttribute('owner');
    const display = (o) => owner ? ownerOptionHtml(o) : esc(o.textContent);
    const selected = this._options.find((o) => o.value === this.value);
    let group = '';
    this.innerHTML = `<button type="button" class="qchip${this.value ? ' is-set' : ''}" aria-haspopup="listbox" aria-expanded="false">${esc(label)}${this.value && selected ? `: ${display(selected)}` : ''} <span class="caret" aria-hidden="true"></span></button>${this.value ? `<button type="button" class="qchip__x" aria-label="Quitar filtro ${esc(label)}">×</button>` : ''}<div class="menu__panel">${owner ? '<div class="osel__search"><input type="search" placeholder="Buscar usuario" aria-label="Buscar usuario" /></div>' : ''}<div role="listbox" aria-label="${esc(label)}">${this._options.map((o) => {
      const heading = o.group && o.group !== group ? `<div class="menu__note">${esc(o.group)}</div>` : ''; group = o.group;
      return `${heading}<button type="button" class="menu__item${owner ? ' osel__opt' : ''}${o.value === this.value ? ' is-current is-selected' : ''}" role="option" aria-selected="${o.value === this.value}" data-value="${esc(o.value)}">${display(o)}${o.value === this.value ? '<span aria-hidden="true"> ✓</span>' : ''}</button>`;
    }).join('')}</div></div>`;
    this.open(false);
  }
  open(on) {
    if (on) document.querySelectorAll('filter-chip.is-open').forEach((chip) => { if (chip !== this) chip.open(false); });
    this.classList.toggle('is-open', on);
    this.querySelector('.qchip')?.setAttribute('aria-expanded', String(on));
    if (on) this.querySelector('input')?.focus();
  }
  pick(value) {
    this.value = value;
    this.querySelector('.qchip').focus();
    this.dispatchEvent(new window.Event('change', { bubbles: true }));
  }
}
window.customElements.define('filter-chip', FilterChip);

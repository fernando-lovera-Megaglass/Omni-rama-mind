// One phone editor and one phone format for the whole app, like the original's: a country selector with flag
// and prefix, the number formatted as it is typed, an extension field and «Eliminar formato de número» (keep
// the number as typed). Values are stored with the international prefix («+34 612 345 678, ext. 2»).
// `enhancePhoneInputs(scope)` upgrades every <input type="tel"> (or [data-phone]) in place: the native input
// stays in the DOM, hidden, as the source of truth (forms, FormData, inline editors and tests keep working);
// every change writes the normalised value into it and dispatches input + change.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const COUNTRIES = [
  ['+34', 'ES', '🇪🇸', 'España'], ['+1', 'US', '🇺🇸', 'Estados Unidos'], ['+52', 'MX', '🇲🇽', 'México'], ['+54', 'AR', '🇦🇷', 'Argentina'],
  ['+57', 'CO', '🇨🇴', 'Colombia'], ['+56', 'CL', '🇨🇱', 'Chile'], ['+51', 'PE', '🇵🇪', 'Perú'], ['+351', 'PT', '🇵🇹', 'Portugal'],
  ['+44', 'GB', '🇬🇧', 'Reino Unido'], ['+49', 'DE', '🇩🇪', 'Alemania'], ['+33', 'FR', '🇫🇷', 'Francia'],
];
export const DEFAULT_DIAL = '+34';
export const countryOf = (dial) => COUNTRIES.find((c) => c[0] === dial) || null;

// "+1 (305) 555-0100, ext. 12" → { dial: '+1', digits: '3055550100', ext: '12', raw: false }
export function parsePhone(v) {
  const s = String(v || '').trim();
  const ext = (s.match(/ext\.?\s*(\d+)/i) || [])[1] || '';
  const main = s.replace(/,?\s*ext\.?\s*\d+/i, '').trim();
  const dialMatch = main.match(/^\+(\d{1,3})/);
  let dial = dialMatch ? `+${dialMatch[1]}` : '';
  if (dial && !countryOf(dial)) {
    const found = COUNTRIES.find((c) => dial.startsWith(c[0]));
    dial = found ? found[0] : dial;
  }
  const rest = dial ? main.slice(main.indexOf(dial) + dial.length) : main;
  const digits = rest.replace(/\D/g, '');
  // Letters or other symbols mean the number was saved without formatting.
  const raw = /[^\d\s().\-+]/.test(rest);
  return { dial: dial || DEFAULT_DIAL, digits, ext, raw, main };
}
export const isValidDigits = (digits) => digits.length === 0 || (digits.length >= 7 && digits.length <= 15 && !/^0+$/.test(digits));
// Groups the national part by country / length: +1 → (305) 555-0100 · +52 → 55 1234 5678 · 9 digits → 612 345 678.
export function groupDigits(dial, digits) {
  const d = String(digits || '');
  if (!d) return '';
  if (d.length === 10 && dial === '+1') return d.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  if (d.length === 10 && dial === '+52') return d.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3');
  if (d.length === 10) return d.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  if (d.length === 9) return d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  if (d.length === 8) return d.replace(/(\d)(\d{3})(\d{4})/, '$1 $2 $3');
  if (d.length === 7) return d.replace(/(\d{3})(\d{4})/, '$1 $2');
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3');
  return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}
export const formatPhone = (dial, digits, ext = '') => (digits ? `${dial} ${groupDigits(dial, digits)}${ext ? `, ext. ${ext}` : ''}` : '');
// The stored / displayed form of any phone text: international prefix + grouped digits (+ extension).
export function normalizePhone(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const p = parsePhone(s);
  if (p.raw || !p.digits) return s;
  return formatPhone(p.dial, p.digits, p.ext);
}
export const displayPhone = normalizePhone;
export function phoneHref(v) {
  const p = parsePhone(v);
  if (!p.digits) return `tel:${String(v || '').replace(/\s+/g, '')}`;
  return `tel:${p.dial}${p.digits}`;
}

// ---------- the editor ----------
const PHONE_INPUTS = 'input[type="tel"], input[data-phone]';
export const phoneEditorHtml = (value = '', { prefix = '' } = {}) => `<input type="tel" value="${esc(value)}"${prefix ? ` data-phone-prefix="${esc(prefix)}"` : ''} />`;

function enhance(input) {
  if (!input || input.dataset.phoneWired) return;
  input.dataset.phoneWired = '1';
  const doc = input.ownerDocument;
  const Ev = (name) => new doc.defaultView.Event(name, { bubbles: true });
  const prefix = input.dataset.phonePrefix || '';
  const id = (part) => (prefix ? ` id="${prefix}-${part}"` : '');
  const wrap = doc.createElement('div');
  wrap.className = 'phonebox';
  if (prefix) wrap.id = prefix === 'cp' ? 'phonebox' : `${prefix}-box`;
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.classList.add('phonebox__native');
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  const state = parsePhone(input.value);
  state.raw = state.raw && Boolean(state.main);
  const flag = () => (countryOf(state.dial) || COUNTRIES[0])[2];
  wrap.insertAdjacentHTML('beforeend', `
    <div class="phonebox__row">
      <div class="menu phonebox__cc"><button class="phonebox__ccbtn" type="button" aria-haspopup="true" aria-label="País"${prefix === 'cp' ? ' id="cc-btn"' : ''}><span class="phonebox__flag"${prefix === 'cp' ? ' id="cc-flag"' : ''}>${flag()}</span> <span class="phonebox__dial">${esc(state.dial)}</span> <span class="caret"></span></button>
        <div class="menu__panel phonebox__menu"${prefix === 'cp' ? ' id="cc-menu"' : ''}>${COUNTRIES.map(([d, c, f, n]) => `<button class="menu__item" type="button" data-cc="${d}">${f} ${esc(n)} (${d})</button>`).join('')}</div></div>
      <input class="phonebox__num" type="tel" value="${esc(state.raw ? state.main : groupDigits(state.dial, state.digits))}" placeholder="Número" aria-label="Número" autocomplete="off"${id('phone')} />
      <input class="phonebox__ext" type="text" value="${esc(state.ext)}" placeholder="Extensión" aria-label="Extensión" autocomplete="off"${id('ext')} />
    </div>
    <input type="hidden" value="${esc(state.dial)}"${id('dial')} class="phonebox__dialval" />
    <p class="phonebox__err"${id('err')} hidden>Este número de teléfono no es válido o tiene un formato incorrecto.</p>
    <button class="link-btn phonebox__raw" type="button" data-phone-raw${id('raw')}>${state.raw ? 'Aplicar formato de número ' : 'Eliminar formato de número '}<span class="info" title="Guarda el número tal cual lo escribes, sin prefijo ni formato.">ⓘ</span></button>`);
  wrap.classList.toggle('is-raw', state.raw);
  const num = wrap.querySelector('.phonebox__num');
  const ext = wrap.querySelector('.phonebox__ext');
  const dialVal = wrap.querySelector('.phonebox__dialval');
  const err = wrap.querySelector('.phonebox__err');
  const ccBtn = wrap.querySelector('.phonebox__ccbtn');
  const rawBtn = wrap.querySelector('.phonebox__raw');
  const digits = () => num.value.replace(/\D/g, '');
  const valid = () => state.raw || isValidDigits(digits());
  const value = () => {
    const e = ext.value.trim();
    if (state.raw) { const t = num.value.trim(); return t ? `${t}${e ? `, ext. ${e}` : ''}` : ''; }
    return formatPhone(state.dial, digits(), e);
  };
  // Writes the normalised value into the native input and lets the page know (inline editors validate on input).
  const sync = (event = 'input') => {
    const ok = valid();
    err.hidden = ok;
    ccBtn.classList.toggle('is-invalid', !ok);
    wrap.querySelector('.phonebox__flag').textContent = ok ? flag() : '⚠';
    input.dataset.valid = ok ? '1' : '0';
    if (typeof input.setCustomValidity === 'function') input.setCustomValidity(ok ? '' : 'Este número de teléfono no es válido o tiene un formato incorrecto.');
    const v = value();
    if (input.value !== v) { input.value = v; input.dispatchEvent(Ev(event)); if (event === 'change') input.dispatchEvent(Ev('input')); }
    else input.dispatchEvent(Ev(event));
  };
  // Formats the digits as they are typed (caret kept at the end).
  num.addEventListener('input', () => {
    if (!state.raw) { const d = digits(); const grouped = groupDigits(state.dial, d); if (num.value !== grouped) num.value = grouped; }
    sync('input');
  });
  num.addEventListener('change', () => sync('change'));
  ext.addEventListener('input', () => { ext.value = ext.value.replace(/\D/g, ''); sync('input'); });
  ext.addEventListener('change', () => sync('change'));
  wrap.querySelector('.phonebox__menu').addEventListener('click', (e) => {
    const cc = e.target.closest('[data-cc]');
    if (!cc) return;
    state.dial = cc.dataset.cc;
    dialVal.value = state.dial;
    wrap.querySelector('.phonebox__dial').textContent = state.dial;
    wrap.querySelector('.phonebox__cc').classList.remove('is-open');
    if (!state.raw) num.value = groupDigits(state.dial, digits());
    sync('change');
    num.focus();
  });
  rawBtn.addEventListener('click', () => {
    state.raw = !state.raw;
    wrap.classList.toggle('is-raw', state.raw);
    rawBtn.firstChild.textContent = state.raw ? 'Aplicar formato de número ' : 'Eliminar formato de número ';
    if (!state.raw) num.value = groupDigits(state.dial, digits());
    sync('change');
    num.focus();
  });
  // The country menu opens/closes like the app's menus (shell.wireMenus may not cover dynamic content).
  ccBtn.addEventListener('click', (e) => { e.stopPropagation(); const m = wrap.querySelector('.phonebox__cc'); const open = m.classList.toggle('is-open'); ccBtn.setAttribute('aria-expanded', String(open)); });
  doc.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.querySelector('.phonebox__cc').classList.remove('is-open'); });
  // When code sets the native value (prefill, reset), the parts follow.
  const reload = () => { const p = parsePhone(input.value); state.dial = p.dial; state.ext = p.ext; state.raw = p.raw && Boolean(p.main); dialVal.value = state.dial; wrap.querySelector('.phonebox__dial').textContent = state.dial; wrap.querySelector('.phonebox__flag').textContent = flag(); num.value = state.raw ? p.main : groupDigits(state.dial, p.digits); ext.value = p.ext; wrap.classList.toggle('is-raw', state.raw); rawBtn.firstChild.textContent = state.raw ? 'Aplicar formato de número ' : 'Eliminar formato de número '; err.hidden = true; ccBtn.classList.remove('is-invalid'); input.dataset.valid = '1'; };
  if (input.form) input.form.addEventListener('reset', () => setTimeout(reload, 0));
  wrap._phone = { reload, value, valid, focus: () => num.focus() };
  input.dataset.valid = valid() ? '1' : '0';
}
// Upgrades every phone input inside `scope` (a container or an input) that is not upgraded yet.
export function enhancePhoneInputs(scope = typeof document !== 'undefined' ? document : null) {
  if (!scope) return 0;
  const list = scope.matches && scope.matches('input') ? [scope] : [...scope.querySelectorAll(PHONE_INPUTS)];
  list.forEach(enhance);
  return list.length;
}
// Re-reads the native values into the editors after code changed them (prefill).
export function refreshPhoneInputs(scope = typeof document !== 'undefined' ? document : null) {
  if (!scope) return;
  scope.querySelectorAll('.phonebox').forEach((w) => { if (w._phone) w._phone.reload(); });
}
export const focusPhoneInput = (scope) => { const w = scope && scope.querySelector('.phonebox'); if (w && w._phone) { w._phone.focus(); return true; } return false; };

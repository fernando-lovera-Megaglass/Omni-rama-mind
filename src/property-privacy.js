// Values stay out of markup until the user explicitly reveals them.
const values = new Map();
let next = 0;
export function sensitiveValue(value) {
  if (value === undefined || value === null || value === '') return '--';
  const token = String(++next);
  values.set(token, String(value));
  return `<span class="sensitive-value"><span>•••</span> <button type="button" data-sensitive="${token}" aria-label="Mostrar dato sensible" aria-pressed="false">👁</button></span>`;
}
if (typeof document !== 'undefined') document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-sensitive]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const revealed = button.getAttribute('aria-pressed') !== 'true';
  button.previousElementSibling.textContent = revealed ? values.get(button.dataset.sensitive) || '' : '•••';
  button.setAttribute('aria-pressed', String(revealed));
  button.setAttribute('aria-label', revealed ? 'Ocultar dato sensible' : 'Mostrar dato sensible');
}, true);

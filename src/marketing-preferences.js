import { findRecord, setField } from './data.js';
const root = document.getElementById('preferences');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render() {
  const params = new URLSearchParams(location.hash.slice(1) || location.search);
  const contact = findRecord('contacts', params.get('c'));
  if (!contact) { root.innerHTML = '<h1>Preferencias de marketing</h1><p>Selecciona un contacto en la prueba para abrir sus preferencias. Este enlace no identifica un contacto válido.</p>'; return; }
  const out = contact.marketingOptOut === 'Sí';
  root.innerHTML = `<h1>Preferencias de marketing</h1><p>${esc(contact.email)}</p><p>Suscripción: Correos de marketing</p><p><strong>${out ? 'Dado de baja' : 'Suscripción activa'}</strong></p>${contact.marketingOptOutAt ? `<p>Fecha de la baja: ${esc(new Date(contact.marketingOptOutAt).toLocaleString('es'))}</p>` : ''}<p>${esc(contact.marketingOptOutReason || '')}</p><form><label>Motivo (opcional)<input name="reason" maxlength="500"></label><p><button class="btn btn--primary">${out ? 'Reactivar mi suscripción' : 'Confirmar baja de marketing'}</button></p></form><p role="status" id="saved"></p>`;
  root.querySelector('form').onsubmit = (event) => {
    event.preventDefault();
    setField('contacts', contact.id, 'marketingOptOut', out ? 'No' : 'Sí', { reason: event.target.elements.reason.value.trim() || (out ? 'Reactivación desde preferencias' : 'Baja solicitada desde preferencias'), emailId: params.get('e'), who: contact.name || contact.email });
    render();
    document.getElementById('saved').textContent = 'Preferencias actualizadas';
  };
}
window.addEventListener('hashchange', render);
render();

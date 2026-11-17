// Settings pane for the real Twilio connection (Ajustes › General › Llamadas): the connect form
// (Account SID + Auth Token + número), the connected card with capabilities and the disconnect action.
// The state lives in src/twilio.js; the Edge Functions live in supabase/functions/twilio-*.
import { twilioConnection, connectTwilio, disconnectTwilio, ready as twilioReady } from './twilio.js';
export { twilioReady };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CAPS = [['voice', 'Llamadas'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']];

export function twilioPaneHtml() {
  const c = twilioConnection();
  if (!c) {
    return `<div id="twilio-pane">
      <h3 class="gh">Twilio</h3><p class="muted">Conecta tu cuenta de Twilio para llamar, recibir llamadas y mandar SMS y WhatsApp desde el CRM. Crea tu cuenta en <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener">twilio.com</a> y compra un número con voz y SMS.</p>
      <form class="gform" id="twilio-connect-form">
        <div class="gfield"><label for="tw-sid">Account SID</label><input id="tw-sid" class="ginput ginput--wide" name="accountSid" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off" required /></div>
        <div class="gfield"><label for="tw-token">Auth Token</label><input id="tw-token" class="ginput ginput--wide" name="authToken" type="password" autocomplete="off" required /><p class="muted">Se guarda cifrado en el servidor; nunca se muestra en el navegador.</p></div>
        <div class="gfield"><label for="tw-number">Tu número de Twilio</label><input id="tw-number" class="ginput" name="phoneNumber" placeholder="+15551234567" autocomplete="off" required /><p class="muted">Formato internacional. Lo encuentras en Phone Numbers → Active Numbers.</p></div>
        <div class="sform__btns"><button class="btn btn--primary" type="submit">Conectar Twilio</button><span class="muted" id="twilio-msg" role="status"></span></div>
      </form>
    </div>`;
  }
  const caps = CAPS.map(([k, l]) => `<span class="dtag ${c.capabilities && c.capabilities[k] ? '' : 'dtag--off'}">${l}</span>`).join(' ');
  const state = c.status === 'active' ? '<span class="dtag dtag--green">Activa</span>' : c.status === 'disabled' ? '<span class="dtag">Pausada</span>' : `<span class="dtag dtag--red">Error</span>`;
  return `<div id="twilio-pane">
    <h3 class="gh">Twilio</h3>
    <div class="icard"><div class="icard__logo">T</div><div class="icard__text"><strong>${esc(c.phoneNumber)}</strong><small>${esc(c.friendlyName || 'Cuenta de Twilio')} · ${esc(c.accountSid)}</small><div class="icard__caps">${caps} ${state}</div>${c.lastError ? `<p class="muted">⚠ ${esc(c.lastError)}</p>` : ''}</div><button class="btn btn--ghost" type="button" id="twilio-disconnect">Desconectar</button></div>
    <p class="muted">Para recibir SMS y WhatsApp en el CRM, pon en tu número de Twilio (Phone Numbers → tu número → Messaging → «A message comes in») esta URL: <code id="twilio-hook">${esc(hookUrl())}</code> <button class="btn btn--ghost btn--sm" type="button" id="twilio-copy-hook">Copiar</button></p>
    <div id="twilio-msg" class="muted" role="status"></div>
  </div>`;
}

function hookUrl() {
  // The public webhook Twilio calls on inbound messages. Derived from the Supabase URL the app uses.
  try {
    const u = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || '';
    return u ? `${u}/functions/v1/twilio-inbound` : 'https://<tu-proyecto>.supabase.co/functions/v1/twilio-inbound';
  } catch { return 'https://<tu-proyecto>.supabase.co/functions/v1/twilio-inbound'; }
}

export function mountTwilioPane(root, { rerender } = {}) {
  const form = root.querySelector('#twilio-connect-form');
  const msg = () => root.querySelector('#twilio-msg');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    if (btn) btn.disabled = true;
    if (msg()) msg().textContent = 'Comprobando con Twilio…';
    try {
      await connectTwilio({ accountSid: fd.get('accountSid'), authToken: fd.get('authToken'), phoneNumber: fd.get('phoneNumber') });
      if (rerender) rerender();
    } catch (err) {
      if (msg()) msg().textContent = `⚠ ${(err && err.message) || 'No se pudo conectar'}`;
      if (btn) btn.disabled = false;
    }
  });
  const off = root.querySelector('#twilio-disconnect');
  if (off) off.addEventListener('click', async () => {
    off.disabled = true;
    try { await disconnectTwilio(); if (rerender) rerender(); }
    catch (err) { if (msg()) msg().textContent = `⚠ ${(err && err.message) || 'No se pudo desconectar'}`; off.disabled = false; }
  });
  const copy = root.querySelector('#twilio-copy-hook');
  if (copy) copy.addEventListener('click', () => {
    const t = hookUrl();
    if (navigator.clipboard) navigator.clipboard.writeText(t);
    copy.textContent = 'Copiado ✓';
    setTimeout(() => { copy.textContent = 'Copiar'; }, 1500);
  });
}

// Only persisted OAuth connections count; connected_emails also contains demo accounts.
// Secrets remain server-only. Provider lifecycle actions reuse the existing flows.
import { supabase } from './supabaseClient.js';
import { startConnect, consumeCallbackParams, disconnect as disconnectGmail } from './gmail.js';
import { disconnectTwilio } from './twilio.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const svg = (body) => `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">${body}</svg>`;
const providers = [
  { id: 'gmail', name: 'Gmail', description: 'Envía y recibe correo con tu cuenta de Google.', table: 'connected_accounts', fields: 'id,email,status,last_error', logo: svg('<path d="M4 25V8l12 9L28 8v17" stroke="#4285f4" stroke-width="4" stroke-linejoin="round"/><path d="M4 8l12 9L28 8" stroke="#ea4335" stroke-width="4" stroke-linejoin="round"/>') },
  { id: 'twilio', name: 'Twilio', description: 'Llamadas, SMS y WhatsApp con tu número de Twilio.', table: 'twilio_connections', fields: 'id,phone_number,status,last_error', logo: svg('<circle cx="16" cy="16" r="13" stroke="#f22f46" stroke-width="3"/><g fill="#f22f46"><circle cx="12" cy="12" r="3"/><circle cx="20" cy="12" r="3"/><circle cx="12" cy="20" r="3"/><circle cx="20" cy="20" r="3"/></g>') },
];
export const integrationsPaneHtml = () => '<h2>Aplicaciones conectadas</h2><p class="muted">Conexiones de tu cuenta. El estado se consulta en el servidor.</p><div id="real-integrations" class="igrid" aria-live="polite"></div>';
export function connectionLabel(rows) {
  if (rows.some((r) => !['active', 'disabled'].includes(r.status))) return 'Error';
  return rows.some((r) => r.status === 'active') ? 'Conectada' : 'No conectada';
}
export function mountIntegrations(root, { client = supabase, connect = startConnect, gmailDisconnect = disconnectGmail, twilioDisconnect = disconnectTwilio } = {}) {
  let disposed = false, generation = 0, busy = false;
  let states = Object.fromEntries(providers.map((p) => [p.id, { rows: [], loading: true }]));
  const callback = consumeCallbackParams();
  let message = callback?.status === 'error' ? `Google no completó la conexión: ${callback.reason || 'error'}` : '';
  function draw() {
    if (disposed) return;
    root.innerHTML = providers.map((p) => {
      const s = states[p.id];
      const status = s.loading ? 'Consultando…' : s.error ? 'Error' : connectionLabel(s.rows);
      const disabled = busy || s.loading || !!s.error;
      return `<article class="icard" data-provider="${p.id}"><div class="icard__logo">${p.logo}</div><div class="icard__text"><strong>${p.name}</strong><small>${p.description}</small><p><strong>${status}</strong></p>${s.error ? `<p role="alert">No se pudo consultar el estado: ${esc(s.error)}</p>` : s.rows.map((r) => `<p>${esc(r.email || r.phone_number)} · ${connectionLabel([r])}${r.status === 'disabled' ? ' (pausada)' : ''}${r.last_error ? `<small>${esc(r.last_error)}</small>` : ''}<button type="button" class="btn btn--ghost" data-disconnect="${p.id}" data-id="${esc(r.id)}" ${disabled ? 'disabled' : ''}>Desconectar</button></p>`).join('')}<button type="button" class="btn btn--secondary" data-connect="${p.id}" ${disabled ? 'disabled' : ''}>${s.rows.length ? (p.id === 'gmail' ? 'Conectar otra cuenta' : 'Configurar') : 'Conectar'}</button> <button type="button" class="btn btn--ghost" data-refresh ${busy ? 'disabled' : ''}>Actualizar</button></div></article>`;
    }).join('') + (message ? `<p role="alert">${esc(message)}</p>` : '');
  }
  async function refresh() {
    const version = ++generation;
    const next = await Promise.all(providers.map(async (p) => {
      try {
        if (!client) throw new Error('No hay conexión con Supabase.');
        const { data: auth, error: authError } = await client.auth.getUser();
        if (authError) throw authError;
        if (!auth?.user) throw new Error('Inicia sesión para consultar tus integraciones.');
        let query = client.from(p.table).select(p.fields).eq('user_id', auth.user.id);
        if (p.id === 'gmail') query = query.eq('provider', 'gmail');
        const { data, error } = await query;
        if (error) throw error;
        return [p.id, { rows: data || [], loading: false }];
      } catch (e) { return [p.id, { rows: [], loading: false, error: e.message || String(e) }]; }
    }));
    if (disposed || version !== generation) return;
    states = Object.fromEntries(next);
    draw();
  }
  async function onClick(e) {
    const button = e.target.closest('button');
    if (!button || button.disabled || busy) return;
    if (button.hasAttribute('data-refresh')) { await refresh(); return; }
    const provider = button.dataset.connect || button.dataset.disconnect;
    if (!provider) return;
    busy = true; message = ''; draw();
    try {
      if (button.dataset.disconnect) {
        if (provider === 'gmail') await gmailDisconnect(button.dataset.id);
        else await twilioDisconnect();
      } else if (provider === 'gmail') await connect({ returnTo: new URL('../settings/#int-connected', location.href).href });
      else location.hash = 'tools-calling';
    } catch (error) { message = error.message || 'No se pudo completar la acción.'; }
    finally { busy = false; await refresh(); }
  }
  const onVisible = () => { if (!document.hidden) void refresh(); };
  const onOffline = () => { ++generation; states = Object.fromEntries(providers.map((p) => [p.id, { rows: [], error: 'Sin conexión. Vuelve a actualizar cuando tengas internet.' }])); draw(); };
  root.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', onVisible);
  for (const event of ['crm:gmail', 'crm:twilio']) document.addEventListener(event, onVisible);
  window.addEventListener('focus', onVisible);
  window.addEventListener('online', onVisible);
  window.addEventListener('offline', onOffline);
  const authSubscription = client?.auth.onAuthStateChange(() => { queueMicrotask(() => { if (!disposed) { onOffline(); void refresh(); } }); }).data.subscription;
  const channel = client?.channel('settings-integrations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connected_accounts' }, onVisible)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'twilio_connections' }, onVisible)
    .subscribe();
  // Fallback for installations where these tables are not in the Realtime publication.
  const timer = setInterval(onVisible, 15000);
  draw(); void refresh();
  return () => {
    disposed = true; ++generation; clearInterval(timer);
    root.removeEventListener('click', onClick);
    document.removeEventListener('visibilitychange', onVisible);
    for (const event of ['crm:gmail', 'crm:twilio']) document.removeEventListener(event, onVisible);
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('online', onVisible);
    window.removeEventListener('offline', onOffline);
    authSubscription?.unsubscribe();
    if (channel) void client.removeChannel(channel);
  };
}

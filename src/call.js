// Real browser calls with the Twilio Voice SDK (@twilio/voice-sdk, loaded on demand so tests and
// non-call pages never touch WebRTC). The panel: name/number, timer, mute, hang up; it also rings
// on inbound PSTN calls to the Twilio number (twilio-voice rings the identity omni-<userId>).
import { supabase } from './supabaseClient.js';
import { ready as twilioReady, hasTwilio } from './twilio.js';

let device = null;
let deviceFor = null;
let call = null;
let panel = null;
let timerId = null;
let startedAt = 0;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function tokenFor() {
  const { data, error } = await supabase.functions.invoke('twilio-token', { method: 'GET' });
  if (error || !data || !data.token) throw new Error((data && data.error) || (error && error.message) || 'No se pudo obtener el token de voz.');
  return data;
}

async function ensureDevice() {
  await twilioReady;
  if (!hasTwilio()) throw new Error('Primero conecta tu cuenta de Twilio en Ajustes › Llamadas.');
  if (device) return device;
  const { token } = await tokenFor();
  const { Device } = await import('@twilio/voice-sdk');
  device = new Device(token, { codecPreferences: ['opus', 'pcmu'], enableRingingState: true });
  device.on('tokenWillExpire', async () => { try { device.updateToken((await tokenFor()).token); } catch { /* se renueva en la próxima llamada */ } });
  device.on('incoming', (c) => showIncoming(c));
  device.on('error', () => {});
  await device.register();
  return device;
}

function paint(state, { name = '', to = '' } = {}) {
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'callbox';
    document.body.appendChild(panel);
  }
  const isIncomingRing = !!incoming && incoming === call && state !== 'En curso';
  panel.innerHTML = `
    <div class="callbox__state">${esc(state)}</div>
    <div class="callbox__name">${esc(name || 'Llamada')}</div>
    <div class="callbox__num">${esc(to)}</div>
    <div class="callbox__timer" ${state === 'En curso' ? '' : 'hidden'}>00:00</div>
    <div class="callbox__btns">
      ${isIncomingRing ? '<button class="btn btn--primary" type="button" data-call="answer">Contestar</button>' : '<button class="btn btn--ghost" type="button" data-call="mute">Silenciar</button>'}
      <button class="btn btn--primary callbox__hang" type="button" data-call="hangup">${isIncomingRing ? 'Rechazar' : 'Colgar'}</button>
    </div>`;
  panel.hidden = false;
}

let incoming = null;
function showIncoming(c) {
  call = c;
  incoming = c;
  const from = (c.parameters && c.parameters.From) || 'Número desconocido';
  paint('Llamada entrante…', { name: from });
  if (panel) panel.dataset.info = JSON.stringify({ name: from, to: '' });
  c.on('cancel', () => endPanel('Cancelada'));
  c.on('disconnect', () => endPanel('Finalizada'));
}

function tick() {
  const el = panel && panel.querySelector('.callbox__timer');
  if (!el) return;
  const s = Math.floor((Date.now() - startedAt) / 1000);
  el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
  stopTimer();
  startedAt = Date.now();
  timerId = setInterval(tick, 1000);
  tick();
}
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }

function endPanel(state) {
  stopTimer();
  if (panel) paint(state, panel.dataset.info ? JSON.parse(panel.dataset.info) : {});
  setTimeout(() => { if (panel) { panel.remove(); panel = null; } call = null; incoming = null; }, 1800);
}

// Start an outbound call. Returns when the call connects (or throws).
export async function startCall({ to, name = '', onState } = {}) {
  const d = await ensureDevice();
  paint('Marcando…', { name, to });
  if (panel) panel.dataset.info = JSON.stringify({ name, to });
  const c = await d.connect({ params: { To: to } });
  call = c;
  c.on('accept', () => { paint('En curso', { name, to }); if (panel) panel.dataset.info = JSON.stringify({ name, to }); startTimer(); });
  c.on('disconnect', () => endPanel('Finalizada'));
  c.on('cancel', () => endPanel('Cancelada'));
  c.on('error', (e) => { endPanel('Error'); throw e; });
  return c;
}

export const callInProgress = () => !!call;

// Panel buttons (one delegated listener for the whole page).
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-call]');
    if (!b || !call) return;
    const a = b.dataset.call;
    if (a === 'hangup') { call.disconnect(); }
    else if (a === 'answer' && incoming === call) { call.accept(); incoming = null; paint('En curso', panel.dataset.info ? JSON.parse(panel.dataset.info) : {}); startTimer(); }
    else if (a === 'mute') { const m = !call.isMuted(); call.mute(m); b.textContent = m ? 'Activar sonido' : 'Silenciar'; }
  });
}

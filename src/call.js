// Real browser calls with the Twilio Voice SDK (@twilio/voice-sdk, loaded on demand so tests and
// non-call pages never touch WebRTC). The panel: name/number, timer, mute, hang up; it also rings
// on inbound PSTN calls to the Twilio number (twilio-voice rings the identity omni-<userId>).
// Also here: the «Llamar» menu on record pages and the topbar dialer (search + keypad + recents),
// both copies of the original's calling UI.
import { supabase } from './supabaseClient.js';
import { ready as twilioReady, hasTwilio, twilioConnection, hasVoicemail, dropVoicemail } from './twilio.js';
import { displayPhone } from './phone.js';
import { allContacts, addActivity, addRecord, TODAY } from './data.js';
import { toast } from './shell.js';

let device = null;
let deviceFor = null;
let call = null;
let panel = null;
let timerId = null;
let startedAt = 0;
let callNotes = '';
let callOutcome = '';
let callType = '';
let callRecording = false;
let minimized = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- preferencia de grabación ----------
const RECORD_KEY = 'omni:call:record';
export const recordPref = () => { try { return localStorage.getItem(RECORD_KEY) === '1'; } catch { return false; } };
export const setRecordPref = (on) => { try { localStorage.setItem(RECORD_KEY, on ? '1' : '0'); } catch { /* sin storage */ } };
// Casilla «Grabar llamada» (menú de la ficha y marcador). Aviso legal incluido.
const recordToggleHtml = () => `
  <label class="callrec"><input type="checkbox" data-callrecord ${recordPref() ? 'checked' : ''} /> Grabar llamada</label>
  <p class="callrec__note muted" data-callrecord-note ${recordPref() ? '' : 'hidden'}>● Se grabará. Avisa a la otra persona si la ley de tu país lo pide.</p>`;
const wireRecordToggle = (root) => {
  const box = root.querySelector('[data-callrecord]');
  if (!box) return;
  box.addEventListener('change', () => {
    setRecordPref(box.checked);
    root.querySelectorAll('[data-callrecord-note]').forEach((n) => { n.hidden = !box.checked; });
  });
};

const OUTCOMES = ['Conectado', 'Sin respuesta', 'Ocupado', 'Dejé mensaje de voz', 'Número equivocado'];
const CALL_TYPES = ['Prospección', 'Seguimiento', 'Demostración', 'Cotización', 'Soporte', 'Cierre', 'Otro'];

const fmtClock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

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
    // Las notas y el resultado sobreviven a los repintados (Marcando… → En curso → Finalizada).
    panel.addEventListener('input', (e) => {
      if (e.target.matches('.callbox__notes')) callNotes = e.target.value;
      if (e.target.matches('.callbox__outcome')) callOutcome = e.target.value;
      if (e.target.matches('[data-wrap="type"]')) callType = e.target.value;
    });
  }
  const isIncomingRing = !!incoming && incoming === call && state !== 'En curso';
  const ended = ['Finalizada', 'Cancelada', 'Error'].includes(state);
  panel.innerHTML = `
    <div class="callbox__top">
      <div class="callbox__state">${esc(state)}${callRecording && !ended ? ' <span class="callbox__rec" title="Grabando">● REC</span>' : ''}</div>
      <button class="callbox__min" type="button" data-call="min" aria-label="${minimized ? 'Restaurar' : 'Minimizar'} la ventana de la llamada">${minimized ? '▢' : '—'}</button>
    </div>
    <div class="callbox__name">${esc(name || 'Llamada')}</div>
    <div class="callbox__num">${esc(to)}</div>
    <div class="callbox__timer" ${state === 'En curso' ? '' : 'hidden'}>00:00</div>
    ${ended ? '' : `
    <select class="callbox__outcome" aria-label="Resultado de la llamada">
      <option value="">Resultado…</option>
      ${OUTCOMES.map((o) => `<option value="${esc(o)}" ${callOutcome === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>
    <textarea class="callbox__notes" rows="3" placeholder="Toma notas de la llamada…" aria-label="Notas de la llamada">${esc(callNotes)}</textarea>`}
    <div class="callbox__keypad" hidden>
      ${KEYS.map(([d]) => `<button class="keypad__key keypad__key--sm" type="button" data-dtmf="${d}"><b>${d}</b></button>`).join('')}
    </div>
    <div class="callbox__btns">
      ${isIncomingRing ? `
      <button class="callbox__ico callbox__ico--hang" type="button" data-call="hangup" title="Rechazar" aria-label="Rechazar llamada"><span class="ico ico--hang"></span></button>
      <button class="callbox__ico callbox__ico--answer" type="button" data-call="answer" title="Contestar" aria-label="Contestar llamada"><span class="ico ico--phone"></span></button>` : ended ? '' : `
      <button class="callbox__ico" type="button" data-call="mute" title="Silenciar micrófono" aria-label="Silenciar micrófono"><span class="ico ico--mic"></span></button>
      <button class="callbox__ico" type="button" data-call="dtmf" title="Teclado (marcar extensiones)" aria-label="Teclado"><span class="ico ico--pad"></span></button>
      <button class="callbox__ico" type="button" data-call="voicemail" title="${hasVoicemail() ? 'Dejar mi mensaje de buzón de voz y colgar' : 'Buzón de voz: primero guarda tu mensaje en Ajustes › Llamadas'}" aria-label="Dejar mensaje de buzón de voz"><span class="ico ico--vmail"></span></button>
      ${callRecording
        ? '<span class="callbox__ico callbox__ico--rec-on" title="La llamada se está grabando"><span class="ico ico--rec"></span></span>'
        : '<button class="callbox__ico" type="button" data-call="record" title="Grabar la llamada" aria-label="Grabar la llamada"><span class="ico ico--rec"></span></button>'}
      <button class="callbox__ico callbox__ico--hang" type="button" data-call="hangup" title="Colgar" aria-label="Colgar"><span class="ico ico--hang"></span></button>`}
    </div>`;
  panel.classList.toggle('is-min', minimized);
  panel.hidden = false;
}

// Pantalla de cierre tras colgar (cuando la llamada tiene ficha): resultado, tipo de llamada,
// comentarios (arrancan con las notas tomadas durante la llamada) y tarea de seguimiento opcional.
function paintWrapUp() {
  const ctx = callCtx;
  const dur = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
  panel.innerHTML = `
    <div class="callbox__top">
      <div class="callbox__state">Llamada finalizada</div>
      <button class="callbox__min" type="button" data-call="min" aria-label="${minimized ? 'Restaurar' : 'Minimizar'}">${minimized ? '▢' : '—'}</button>
    </div>
    <div class="callbox__name">${esc(ctx.name || 'Llamada')}</div>
    <div class="callbox__num">${esc(displayPhone(ctx.to || ''))}${dur ? ` · ${fmtClock(dur)}` : ''}${callRecording ? ' · ● Grabada' : ''}</div>
    <select class="callbox__outcome" aria-label="Resultado de la llamada">
      <option value="">Resultado de la llamada…</option>
      ${OUTCOMES.map((o) => `<option value="${esc(o)}" ${callOutcome === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>
    <select class="callbox__outcome" data-wrap="type" aria-label="Tipo de llamada">
      <option value="">Tipo de llamada…</option>
      ${CALL_TYPES.map((o) => `<option value="${esc(o)}" ${callType === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>
    <textarea class="callbox__notes" rows="4" placeholder="Comentarios de la llamada…" aria-label="Comentarios">${esc(callNotes)}</textarea>
    <label class="callrec"><input type="checkbox" data-wrap="task" /> Crear tarea de seguimiento para mañana</label>
    <div class="callbox__btns">
      <button class="btn btn--ghost btn--sm" type="button" data-call="discard">Descartar</button>
      <button class="btn btn--primary btn--sm" type="button" data-call="save">Guardar</button>
    </div>`;
  panel.classList.toggle('is-min', minimized);
  panel.hidden = false;
}

let incoming = null;
function showIncoming(c) {
  call = c;
  incoming = c;
  const from = (c.parameters && c.parameters.From) || 'Número desconocido';
  const who = contactByPhone(from);
  callNotes = '';
  callOutcome = '';
  callRecording = false;
  callLogged = false;
  callCtx = { contactId: who ? who.id : '', recordType: 'contacts', name: who ? who.name : from, to: from, incoming: true };
  paint('Llamada entrante…', { name: callCtx.name });
  if (panel) panel.dataset.info = JSON.stringify({ name: callCtx.name, to: '' });
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
  // Llamada contestada y con ficha conocida: pantalla de cierre (resultado, tipo, comentarios, tarea).
  if (state === 'Finalizada' && callCtx.contactId && startedAt) {
    paintWrapUp();
    call = null;
    incoming = null;
    return;
  }
  saveCallLog(state);
  if (panel) paint(state, panel.dataset.info ? JSON.parse(panel.dataset.info) : {});
  setTimeout(() => closePanel(), 2200);
}

function closePanel() {
  if (panel) { panel.remove(); panel = null; }
  call = null;
  incoming = null;
  minimized = false;
  callCtx = {};
  callNotes = '';
  callOutcome = '';
  callType = '';
  callRecording = false;
}

// Guardar desde la pantalla de cierre: actividad en la ficha (con duración, resultado, tipo y
// comentarios) y, si se pidió, la tarea de seguimiento para mañana.
function saveWrapUp(wantTask) {
  const ctx = callCtx;
  if (!ctx.contactId || callLogged) { closePanel(); return; }
  callLogged = true;
  const durationMin = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : 0;
  const bits = [`Llamada ${ctx.incoming ? 'entrante' : 'saliente'} con ${ctx.name || ctx.to}.`];
  if (callNotes.trim()) bits.push(callNotes.trim());
  try {
    addActivity({
      type: 'call',
      recordType: ctx.recordType || 'contacts',
      recordId: ctx.contactId,
      text: bits.join(' '),
      who: 'Tú',
      when: Date.now(),
      extra: { direction: ctx.incoming ? 'Entrante' : 'Saliente', outcome: callOutcome, callType, durationMin, recorded: callRecording || undefined, callSid: ctx.callSid || undefined },
    });
    if (wantTask) {
      const contact = contactById(ctx.contactId);
      addRecord('tasks', {
        name: `Seguimiento de la llamada con ${ctx.name || ctx.to}`,
        type: 'Llamada',
        due: new Date(TODAY.getTime() + 86400000).toISOString(),
        priority: 'medium',
        status: 'todo',
        owner: (contact && contact.owner) || 'Sin asignar',
        contactId: ctx.contactId,
        contact: ctx.name || '',
        lastActivity: TODAY.toISOString(),
      });
    }
    toast(wantTask ? 'Llamada guardada y tarea creada' : 'Llamada guardada en la ficha');
    if (typeof ctx.onLogged === 'function') ctx.onLogged();
  } catch (e) { console.error('[llamada] no se pudo guardar en la ficha', e); }
  closePanel();
}

// Al colgar, la llamada queda en la ficha del contacto con duración, resultado y notas.
let callCtx = {};
let callLogged = false;
function saveCallLog(state) {
  if (state !== 'Finalizada' && state !== 'Cancelada') return;
  const ctx = callCtx;
  callCtx = {};
  if (!ctx.contactId || callLogged) return;
  callLogged = true;
  const durationMin = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : 0;
  const bits = [`Llamada ${ctx.incoming ? 'entrante' : 'saliente'} con ${ctx.name || ctx.to}.`];
  if (callNotes.trim()) bits.push(callNotes.trim());
  try {
    addActivity({
      type: 'call',
      recordType: ctx.recordType || 'contacts',
      recordId: ctx.contactId,
      text: bits.join(' '),
      who: 'Tú',
      when: Date.now(),
      extra: { direction: ctx.incoming ? 'Entrante' : 'Saliente', outcome: callOutcome, durationMin, recorded: callRecording || undefined, callSid: ctx.callSid || undefined },
    });
    toast(callNotes.trim() ? 'Llamada y notas guardadas en la ficha' : 'Llamada guardada en la ficha');
    if (typeof ctx.onLogged === 'function') ctx.onLogged();
  } catch (e) { console.error('[llamada] no se pudo guardar en la ficha', e); }
  callNotes = '';
  callOutcome = '';
  callRecording = false;
}

// Start an outbound call. Returns when the call connects (or throws).
// contactId/recordType: la ficha donde se guarda al colgar. record: fuerza grabar o no (por defecto,
// la preferencia «Grabar llamada»). onLogged: se dispara tras guardar (para refrescar la cronología).
export async function startCall({ to, name = '', contactId = '', recordType = 'contacts', record, onLogged } = {}) {
  const d = await ensureDevice();
  callNotes = '';
  callOutcome = '';
  callRecording = record !== undefined ? !!record : recordPref();
  callLogged = false;
  callCtx = { contactId, recordType, name, to, incoming: false, onLogged };
  paint('Marcando…', { name, to });
  if (panel) panel.dataset.info = JSON.stringify({ name, to });
  const c = await d.connect({
    params: {
      To: to,
      ...(callRecording ? { Record: '1' } : {}),
      // La ficha asociada viaja al webhook para que la llamada quede ligada al contacto/empresa.
      ...(contactId && recordType === 'companies' ? { CompanyId: String(contactId) } : {}),
      ...(contactId && recordType !== 'companies' ? { ContactId: String(contactId) } : {}),
    },
  });
  call = c;
  // El SID de Twilio enlaza esta llamada con su fila de call_logs (grabación, transcripción).
  callCtx.callSid = (c.parameters && c.parameters.CallSid) || '';
  c.on('accept', () => { paint('En curso', { name, to }); if (panel) panel.dataset.info = JSON.stringify({ name, to }); startTimer(); });
  c.on('disconnect', () => endPanel('Finalizada'));
  c.on('cancel', () => endPanel('Cancelada'));
  c.on('error', (e) => { endPanel('Error'); throw e; });
  return c;
}

export const callInProgress = () => !!call;

// ---------- shared helpers for the calling UI ----------
const fromNumber = () => {
  const c = twilioConnection();
  return (c && (c.phoneNumber || c.phone_number)) || '';
};
// Latest Twilio calls for the "Recientes" tab (empty without a connection).
export async function recentCalls(limit = 20) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('call_logs').select('id,direction,from_number,to_number,status,duration_sec,started_at,contact_id').order('started_at', { ascending: false }).limit(50);
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch { return []; }
}
const contactById = (id) => allContacts().find((c) => String(c.id) === String(id)) || null;
const contactByPhone = (num) => {
  const digits = String(num || '').replace(/\D/g, '').slice(-10);
  if (!digits) return null;
  return allContacts().find((c) => [c.phone, c.mobilephone].some((p) => String(p || '').replace(/\D/g, '').slice(-10) === digits)) || null;
};

// ---------- «Llamar» menu on the record pages (the original's call dropdown) ----------
// Numbers of the record, "+ Agregar número de teléfono", "Llamada desde", "Dispositivo: Navegador"
// and "Abrir opciones de llamadas". Without Twilio it offers the manual call log instead.
export function openCallMenu({ anchor, rec = {}, recordType = 'contacts', onCalled, onAddPhone, onManualLog } = {}) {
  closeCallMenu();
  const name = rec.name || rec.first || 'Registro';
  const numbers = [
    rec.mobilephone ? { value: rec.mobilephone, label: 'Número de móvil' } : null,
    rec.phone ? { value: rec.phone, label: 'Número de teléfono' } : null,
  ].filter((x) => x && String(x.value).trim());
  const live = hasTwilio();
  const el = document.createElement('div');
  el.className = 'callmenu';
  el.innerHTML = `
    <div class="callmenu__head">${esc(name)}</div>
    ${numbers.map((n, i) => `
      <button class="callmenu__num" type="button" data-num="${i}" ${live ? '' : 'disabled'}>
        <span class="callmenu__num-main">Llamada ${esc(displayPhone(n.value))}</span>
        <span class="callmenu__num-sub">(${esc(n.label)})</span>
      </button>`).join('')}
    ${!numbers.length ? '<p class="callmenu__empty">Este registro no tiene número de teléfono.</p>' : ''}
    <button class="callmenu__add" type="button" data-add>+ Agregar número de teléfono</button>
    <div class="callmenu__add-form" hidden>
      <input class="callmenu__input" type="tel" placeholder="+52 55 1234 5678" aria-label="Nuevo número de teléfono" />
      <button class="btn btn--primary btn--sm" type="button" data-add-save>Guardar</button>
    </div>
    <div class="callmenu__meta">
      ${live
        ? `<div class="callmenu__row"><span class="muted">Llamada desde:</span> <strong>${esc(displayPhone(fromNumber()))}</strong></div>
           <div class="callmenu__row"><span class="muted">Dispositivo:</span> Navegador</div>
           ${recordToggleHtml()}`
        : '<div class="callmenu__row muted">Conecta Twilio para llamar desde el navegador.</div>'}
      <a class="callmenu__opts" href="${settingsHref()}">Abrir opciones de llamadas</a>
    </div>
    <button class="callmenu__log" type="button" data-log>Registrar una llamada</button>`;
  document.body.appendChild(el);
  wireRecordToggle(el);
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 80, bottom: 120 };
  el.style.left = `${Math.min(r.left, window.innerWidth - 320)}px`;
  el.style.top = `${r.bottom + 6}px`;
  const closeOnDoc = (e) => { if (!el.contains(e.target) && e.target !== anchor && !(anchor && anchor.contains && anchor.contains(e.target))) closeCallMenu(); };
  setTimeout(() => document.addEventListener('click', closeOnDoc), 0);
  el._closeDoc = closeOnDoc;
  el.addEventListener('click', async (e) => {
    const numBtn = e.target.closest('[data-num]');
    if (numBtn) {
      const n = numbers[Number(numBtn.dataset.num)];
      closeCallMenu();
      try {
        await startCall({ to: n.value, name, contactId: rec.id || '', recordType, onLogged: onCalled });
      } catch (err) {
        toast(`No se pudo llamar: ${(err && err.message) || 'error de voz'}`);
        if (onManualLog) onManualLog();
      }
      return;
    }
    if (e.target.closest('[data-add]')) {
      const f = el.querySelector('.callmenu__add-form');
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector('input').focus();
      return;
    }
    if (e.target.closest('[data-add-save]')) {
      const v = el.querySelector('.callmenu__input').value.trim();
      if (!v) { toast('Escribe el número de teléfono.'); return; }
      closeCallMenu();
      if (onAddPhone) onAddPhone(v);
      return;
    }
    if (e.target.closest('[data-log]')) {
      closeCallMenu();
      if (onManualLog) onManualLog();
    }
  });
  callMenu = el;
  return el;
}
let callMenu = null;
export function closeCallMenu() {
  if (callMenu) {
    document.removeEventListener('click', callMenu._closeDoc);
    callMenu.remove();
    callMenu = null;
  }
}
function settingsHref() {
  const path = location.pathname;
  const depth = path.split('/').filter(Boolean).length - 1;
  return `${'../'.repeat(Math.max(1, depth))}settings/#tools-calls`;
}

// ---------- topbar dialer (the original's calling popup: search, keypad, recents) ----------
const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];
let dialerEl = null;
export async function openDialer() {
  if (dialerEl) { closeDialer(); return; }
  await twilioReady;
  const el = document.createElement('div');
  el.className = 'dialer';
  el.innerHTML = `
    <div class="dialer__head">
      <span class="dialer__brand">Omni</span>
      <button class="dialer__close" type="button" data-dialer="close" aria-label="Cerrar">×</button>
    </div>
    <div class="dialer__search">
      <input type="search" placeholder="Contacto, empresa o número" aria-label="Buscar contacto, empresa o número" data-dialer="q" autocomplete="off" />
    </div>
    <div class="dialer__body">
      <div class="dialer__pane" data-pane="recents"><p class="muted dialer__hint">Cargando…</p></div>
      <div class="dialer__pane" data-pane="pad" hidden>
        <input class="dialer__display" type="text" readonly aria-label="Número a marcar" data-dialer="display" />
        <div class="keypad">
          ${KEYS.map(([d, sub]) => `<button class="keypad__key" type="button" data-key="${d}"><b>${d}</b>${sub ? `<small>${sub}</small>` : ''}</button>`).join('')}
        </div>
        <div class="dialer__actions">
          <button class="dialer__back" type="button" data-dialer="back" aria-label="Borrar">⌫</button>
          <button class="dialer__call" type="button" data-dialer="call" disabled aria-label="Llamar"><span class="ico ico--phone"></span></button>
        </div>
      </div>
      <div class="dialer__pane" data-pane="results" hidden></div>
    </div>
    <div class="dialer__foot">
      <div class="dialer__row"><span class="muted">Llamada desde:</span> <strong>${hasTwilio() ? esc(displayPhone(fromNumber())) : 'Sin número'}</strong></div>
      <div class="dialer__row"><span class="muted">Dispositivo:</span> Navegador</div>
      ${hasTwilio() ? recordToggleHtml() : ''}
    </div>
    <div class="dialer__tabs">
      <button class="dialer__tab is-active" type="button" data-tab="recents">Recientes</button>
      <button class="dialer__tab" type="button" data-tab="pad">Teclado</button>
    </div>`;
  document.body.appendChild(el);
  dialerEl = el;
  wireRecordToggle(el);

  const q = el.querySelector('[data-dialer="q"]');
  const display = el.querySelector('[data-dialer="display"]');
  const callBtn = el.querySelector('[data-dialer="call"]');
  const panes = { recents: el.querySelector('[data-pane="recents"]'), pad: el.querySelector('[data-pane="pad"]'), results: el.querySelector('[data-pane="results"]') };
  const state = { tab: 'recents' };

  const showPane = (name) => {
    Object.entries(panes).forEach(([k, p]) => { p.hidden = k !== name; });
    el.querySelectorAll('.dialer__tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name || (name === 'results' && t.dataset.tab === 'recents')));
  };
  const setNumber = (v) => { display.value = v; callBtn.disabled = !v.trim(); };
  const placeCall = async (to, name, contactId = '') => {
    if (!hasTwilio()) { toast('Primero conecta tu cuenta de Twilio en Ajustes › Llamadas.'); return; }
    closeDialer();
    try { await startCall({ to, name, contactId }); } catch (err) { toast(`No se pudo llamar: ${(err && err.message) || 'error de voz'}`); }
  };

  const fmtAgo = (iso) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const diff = Math.floor((today - d) / 86400000);
    if (diff < 7) return d.toLocaleDateString('es-MX', { weekday: 'long' });
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'numeric', year: '2-digit' });
  };
  const renderRecents = (rows) => {
    panes.recents.innerHTML = rows.length
      ? rows.map((r) => {
          const isOut = r.direction === 'outbound';
          const num = isOut ? r.to_number : r.from_number;
          const c = r.contact_id ? contactById(r.contact_id) : contactByPhone(num);
          const title = c ? c.name : displayPhone(num);
          return `<button class="dialer__recent" type="button" data-callnum="${esc(num)}" data-callname="${esc(c ? c.name : '')}"${c ? ` data-contactid="${esc(c.id)}"` : ''}>
            <span class="dialer__avatar">${esc((c ? c.name : '?').trim().charAt(0).toUpperCase())}</span>
            <span class="dialer__recent-main"><b>${esc(title)}</b><small>${isOut ? '↗' : '↙'} ${esc(displayPhone(num))}</small></span>
            <span class="dialer__recent-when">${esc(fmtAgo(r.started_at))}</span>
          </button>`;
        }).join('')
      : '<p class="muted dialer__hint">Aún no hay llamadas. Marca un número en el teclado o llama desde la ficha de un contacto.</p>';
  };
  renderRecents([]);
  recentCalls().then(renderRecents);

  const renderResults = (term) => {
    const t = term.trim().toLowerCase();
    if (!t) { showPane(state.tab); return; }
    const digits = t.replace(/\D/g, '');
    const hits = allContacts().filter((c) =>
      String(c.name || '').toLowerCase().includes(t) ||
      String(c.email || '').toLowerCase().includes(t) ||
      (digits && [c.phone, c.mobilephone].some((p) => String(p || '').replace(/\D/g, '').includes(digits))),
    ).slice(0, 8);
    panes.results.innerHTML = hits.length
      ? hits.map((c) => {
          const num = c.mobilephone || c.phone || '';
          return `<button class="dialer__recent" type="button" data-callnum="${esc(num)}" data-callname="${esc(c.name)}" data-contactid="${esc(c.id)}" ${num ? '' : 'disabled'}>
            <span class="dialer__avatar">${esc((c.name || '?').charAt(0).toUpperCase())}</span>
            <span class="dialer__recent-main"><b>${esc(c.name)}</b><small>${num ? esc(displayPhone(num)) : 'Sin número'}</small></span>
          </button>`;
        }).join('')
      : `<p class="muted dialer__hint">Sin resultados para «${esc(term)}».</p>${/^[+*\d][\d\s+()-]*$/.test(term) ? '<button class="dialer__recent" type="button" data-callnum="' + esc(term) + '"><span class="dialer__avatar">#</span><span class="dialer__recent-main"><b>Llamar a ' + esc(term) + '</b><small>Número libre</small></span></button>' : ''}`;
    showPane('results');
  };

  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-dialer="close"]')) { closeDialer(); return; }
    const tab = t.closest('.dialer__tab');
    if (tab) { state.tab = tab.dataset.tab; q.value = ''; showPane(state.tab); return; }
    const key = t.closest('.keypad__key');
    if (key) { setNumber(display.value + key.dataset.key); return; }
    if (t.closest('[data-dialer="back"]')) { setNumber(display.value.slice(0, -1)); return; }
    if (t.closest('[data-dialer="call"]')) { placeCall(display.value.trim()); return; }
    const rec = t.closest('[data-callnum]');
    if (rec && !rec.disabled) {
      const num = rec.dataset.callnum;
      if (state.tab === 'pad' || q.value) { placeCall(num, rec.dataset.callname || '', rec.dataset.contactid || ''); }
      else { state.tab = 'pad'; showPane('pad'); setNumber(num); display.focus(); }
    }
  });
  q.addEventListener('input', () => renderResults(q.value));
  const onKey = (e) => { if (e.key === 'Escape') closeDialer(); };
  document.addEventListener('keydown', onKey);
  el._onKey = onKey;
  setTimeout(() => q.focus(), 50);
}
export function closeDialer() {
  if (dialerEl) {
    document.removeEventListener('keydown', dialerEl._onKey);
    dialerEl.remove();
    dialerEl = null;
  }
}

// ---------- reproducción de grabaciones ----------
// La grabación la sirve Twilio con Basic auth; el navegador la pide a la función twilio-recording
// (que valida la sesión) y la reproduce como blob.
export async function playRecording(btn, callSid) {
  if (!btn || !callSid) return;
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Cargando…';
  try {
    const { data: sess } = await supabase.auth.getSession();
    const jwt = sess && sess.session && sess.session.access_token;
    const base = (supabase.supabaseUrl || '').replace(/\/$/, '');
    const res = await fetch(`${base}/functions/v1/twilio-recording?call=${encodeURIComponent(callSid)}`, {
      headers: { apikey: supabase.supabaseKey, Authorization: `Bearer ${jwt || supabase.supabaseKey}` },
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    const holder = btn.closest('td') || btn.parentElement;
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    audio.className = 'calls-audio';
    btn.replaceWith(audio);
    audio.play().catch(() => {});
  } catch (e) {
    btn.disabled = false;
    btn.textContent = old;
    toast(`No se pudo reproducir: ${(e && e.message) || e}`);
  }
}

// Panel buttons (one delegated listener for the whole page).
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const dtmf = e.target.closest && e.target.closest('[data-dtmf]');
    if (dtmf && call && panel && panel.contains(dtmf)) {
      // Tonos del teclado en plena llamada (extensiones, contestadoras).
      try { call.sendDigits(dtmf.dataset.dtmf); } catch { /* la llamada ya terminó */ }
      return;
    }
    const b = e.target.closest && e.target.closest('[data-call]');
    if (!b || !panel || !panel.contains(b)) return;
    const a = b.dataset.call;
    // Minimizar/restaurar y guardar/descartar funcionan también sin llamada activa (pantalla de cierre).
    if (a === 'min') {
      minimized = !minimized;
      panel.classList.toggle('is-min', minimized);
      b.textContent = minimized ? '▢' : '—';
      b.setAttribute('aria-label', minimized ? 'Restaurar la ventana de la llamada' : 'Minimizar la ventana de la llamada');
      return;
    }
    if (a === 'save') { saveWrapUp(!!(panel.querySelector('[data-wrap="task"]') || {}).checked); return; }
    if (a === 'discard') { closePanel(); return; }
    if (!call) return;
    if (a === 'hangup') { call.disconnect(); }
    else if (a === 'answer' && incoming === call) { call.accept(); incoming = null; paint('En curso', panel.dataset.info ? JSON.parse(panel.dataset.info) : {}); startTimer(); }
    else if (a === 'mute') {
      const m = !call.isMuted();
      call.mute(m);
      b.classList.toggle('is-on', m);
      const ico = b.querySelector('.ico');
      if (ico) ico.className = m ? 'ico ico--mic-off' : 'ico ico--mic';
      b.title = m ? 'Activar micrófono' : 'Silenciar micrófono';
    }
    else if (a === 'dtmf') {
      const pad = panel && panel.querySelector('.callbox__keypad');
      if (pad) { pad.hidden = !pad.hidden; b.classList.toggle('is-on', !pad.hidden); }
    } else if (a === 'voicemail') {
      // Buzón de voz: cuelga la llamada actual y deja el mensaje precargado tras el tono.
      if (!hasVoicemail()) { toast('Primero guarda tu mensaje de buzón en Ajustes › Llamadas.'); return; }
      const to = callCtx.to;
      if (!to) { toast('Esta llamada no tiene número de destino.'); return; }
      b.disabled = true;
      const drop = dropVoicemail({ to, contactId: callCtx.contactId || '' })
        .then(() => toast('Dejando tu mensaje en el buzón de voz…'))
        .catch((err) => { b.disabled = false; toast(`No se pudo dejar el mensaje: ${(err && err.message) || err}`); });
      try { call.disconnect(); } catch { /* ya colgó */ }
      drop.catch(() => {});
    } else if (a === 'record') {
      // Grabar a media llamada: la función crea la grabación sobre la llamada en curso.
      const sid = call.parameters && call.parameters.CallSid;
      if (!sid) { toast('Aún no puedo grabar: espera a que contesten.'); return; }
      b.disabled = true;
      supabase.functions.invoke('twilio-call-record', { body: { callSid: sid } })
        .then(({ data, error }) => {
          if (error || (data && data.error)) throw new Error((data && data.error) || (error && error.message) || 'error');
          callRecording = true;
          toast('Grabando la llamada');
          paint('En curso', panel.dataset.info ? JSON.parse(panel.dataset.info) : {});
        })
        .catch((err) => {
          b.disabled = false;
          toast(`No se pudo grabar: ${(err && err.message) || err}`);
        });
    }
  });
}

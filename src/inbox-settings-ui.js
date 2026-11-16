// Ajustes › Herramientas › Bandeja de entrada: the four pages — Canales (web/app and team channel cards with
// their connection flows), Bandejas de entrada (current inbox, Acciones, tabs Canales / ANS / Personalización
// de la barra lateral / Acceso), Gestión de disponibilidad (filters + per-user status) and Lista de permitidos
// y denegados. Each pane renders into #ibs and mountInboxSettings() wires it.
import { toast, wireMenus, closeMenus } from './shell.js';
import { relativeTimeFine } from './data.js';
import { USERS, TEAM_OF, ALL_TEAMS, CHANNEL_DEFS, SAMPLE_FORMS, SAMPLE_PAGES, channels, connectChat, connectForms, addTeamEmail, addNumber, connectPages, disconnectChannel, channelOptions, channelLabel, inboxes, inboxById, createInbox, renameInbox, deleteInbox, addInboxChannel, removeInboxChannel, setSla, addView, removeView, setAccess, availability, userStatus, setAvailability, setAutoAssign, autoAssign, spam, addSpamEntry, removeSpamEntry, setAutoSpam, isValidSpamEntry } from './inbox-settings.js';
import { openConnectWizard } from './connected-emails-ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const initials = (n) => String(n).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const ui = { inboxId: null, tab: 'channels', filters: { user: '', status: '', team: '', inbox: '' } };

// ---------- 1 · Canales ----------
function channelCard(key) {
  const d = CHANNEL_DEFS[key];
  const c = channels();
  let status = ''; let btn = ''; let list = [];
  if (key === 'chat') { status = c.chat.connected ? `<span class="ibs__ok">●</span> ${plural(c.chat.activeChats || 0, 'chat activo', 'chats activos')}` : '<span class="ibs__off">●</span> Sin conectar'; btn = c.chat.connected ? 'Configurar chat' : 'Conectar chat'; } else if (key === 'forms') { const n = (c.forms.forms || []).length; status = n ? `<span class="ibs__ok">●</span> ${plural(n, 'formulario conectado', 'formularios conectados')}` : '<span class="ibs__off">●</span> Sin formularios'; btn = 'Conectar formulario'; list = (c.forms.forms || []).map((f) => [f, (SAMPLE_FORMS.find((x) => x[0] === f) || [f, f])[1]]); } else if (key === 'teamEmail') { const n = c.teamEmail.addresses.length; status = n ? `<span class="ibs__ok">●</span> ${plural(n, 'dirección conectada', 'direcciones conectadas')}` : '<span class="ibs__off">●</span> Sin direcciones'; btn = 'Conectar correo del equipo'; list = c.teamEmail.addresses.map((a) => [a, a]); } else if (key === 'calls') { const n = c.calls.numbers.length; status = n ? `<span class="ibs__ok">●</span> ${plural(n, 'número conectado', 'números conectados')}` : '<span class="ibs__off">●</span> Sin número'; btn = 'Conectar número de teléfono'; list = c.calls.numbers.map((x) => [x, x]); } else if (key === 'whatsapp') { const n = c.whatsapp.numbers.length; status = n ? `<span class="ibs__ok">●</span> ${plural(n, 'número conectado', 'números conectados')}` : '<span class="ibs__off">●</span> Sin número'; btn = 'Conectar número'; list = c.whatsapp.numbers.map((x) => [x, x]); } else if (key === 'messenger') { const n = c.messenger.pages.length; status = n ? `<span class="ibs__ok">●</span> ${plural(n, 'página conectada', 'páginas conectadas')}` : '<span class="ibs__off">●</span> Sin páginas'; btn = 'Conectar páginas'; list = c.messenger.pages.map((p) => [p, (SAMPLE_PAGES.find((x) => x[0] === p) || [p, p])[1]]); }
  return `<div class="ibs__card" data-channel-card="${key}"><div class="ibs__cardhead"><span class="ibs__cardico" aria-hidden="true">${d.icon}</span><div><strong>${esc(d.label)}</strong><small class="muted">${esc(d.desc)}</small></div></div><div class="ibs__status">${status}</div>${list.length ? `<ul class="cem__list ibs__items">${list.map(([id, l]) => `<li><span>${esc(l)}</span><button class="link-btn" type="button" data-ib="disconnect" data-key="${key}" data-item="${esc(id)}">Quitar</button></li>`).join('')}</ul>` : ''}<button class="btn btn--secondary btn--sm" type="button" data-ib="connect" data-key="${key}">${btn}</button></div>`;
}
export function paneChannels() {
  return `<div id="ibs" class="ibs" data-ibs="channels"><h2>Canales</h2><p class="muted">Conecta los canales por los que tus contactos te escriben: cada mensaje llega como conversación a la bandeja de entrada.</p>
    <h3>Canales web y de aplicaciones</h3><div class="ibs__grid">${['chat', 'forms'].map(channelCard).join('')}</div>
    <h3>Canales del equipo</h3><div class="ibs__grid">${['teamEmail', 'calls', 'whatsapp', 'messenger'].map(channelCard).join('')}</div></div>`;
}

// ---------- 2 · Bandejas de entrada ----------
const switchRow = (label, on, attr, value) => `<label class="srow"><span><strong>${label}</strong></span><span class="ibs__switch"><span class="ibs__switchlbl ${on ? 'is-on' : ''}">${on ? 'ACTIVADA' : 'DESACTIVADA'}</span><input type="checkbox" class="switch" ${attr}="${esc(value)}" ${on ? 'checked' : ''} aria-label="${label}" /></span></label>`;
function currentInbox() { const list = inboxes(); const found = list.find((i) => i.id === ui.inboxId) || list[0]; if (found) ui.inboxId = found.id; return found; }
export function paneInboxes() {
  const list = inboxes();
  const ib = currentInbox();
  const tabs = [['channels', 'Canales'], ['sla', 'ANS'], ['views', 'Personalización de la barra lateral'], ['access', 'Acceso']];
  let body = '';
  if (ib && ui.tab === 'channels') {
    body = `<p class="muted">Las conversaciones de estos canales llegan a «${esc(ib.name)}».</p><ul class="cem__list ibs__items" id="ibx-channels">${ib.channels.length ? ib.channels.map((c) => `<li><span>${esc(channelLabel(c))}</span><button class="link-btn" type="button" data-ibx="remove-channel" data-channel="${esc(c)}">Quitar</button></li>`).join('') : '<li class="muted">Esta bandeja todavía no tiene canales.</li>'}</ul><button class="btn btn--secondary btn--sm" type="button" data-ibx="add-channel">Agregar canal</button>`;
  } else if (ib && ui.tab === 'sla') {
    const s = ib.sla;
    const limit = (key, label) => `<div class="ibs__sla">${switchRow(label, s[key].on, 'data-ibx-sla-on', key)}${s[key].on ? `<div class="ibs__slatime"><label>Horas <input type="number" min="0" max="999" value="${esc(s[key].hours)}" data-ibx-sla-h="${key}" /></label><label>Minutos <input type="number" min="0" max="59" value="${esc(s[key].minutes)}" data-ibx-sla-m="${key}" /></label></div>` : ''}</div>`;
    body = `<p class="muted">Los ANS (acuerdos de nivel de servicio) fijan cuánto tiempo puede pasar hasta la primera respuesta y hasta el cierre de una conversación; las que lo superan se marcan en la bandeja.</p>
      <h3>Define cuándo se aplican los ANS</h3><p class="muted">Aplicar en función de:</p><label class="ibs__radio"><input type="radio" name="sla-basis" value="business" data-ibx-sla-basis="business" ${s.basis !== 'calendar' ? 'checked' : ''} /> Horario de funcionamiento</label><label class="ibs__radio"><input type="radio" name="sla-basis" value="calendar" data-ibx-sla-basis="calendar" ${s.basis === 'calendar' ? 'checked' : ''} /> Horas calendario</label>
      <h3>Fijar límites del ANS</h3>${limit('firstReply', 'Tiempo hasta primera respuesta')}${limit('close', 'Tiempo hasta el cierre')}`;
  } else if (ib && ui.tab === 'views') {
    body = `<p class="muted">Vistas compartidas que ven todos los usuarios con acceso a esta bandeja.</p><table class="mini-table stable ibs__table"><thead><tr><th>Ver nombre</th><th>Asignado a</th><th>Última actualización</th><th>Acciones</th></tr></thead><tbody id="ibx-views">${ib.views.map((v) => `<tr data-view="${esc(v.id)}"><td><strong>${esc(v.name)}</strong></td><td>${esc(v.assignedTo)}</td><td>${esc(relativeTimeFine(v.updatedAt))}</td><td><button class="link-btn" type="button" data-ibx="remove-view" data-view="${esc(v.id)}">Eliminar</button></td></tr>`).join('')}</tbody></table><p><button class="btn btn--primary btn--sm" type="button" data-ibx="create-view">Crear vista de equipo</button></p>`;
  } else if (ib) {
    const a = ib.access;
    body = `<label class="ibs__radio"><input type="radio" name="ibx-access" value="all" data-ibx-access="all" ${a.mode !== 'selected' ? 'checked' : ''} /> Disponible para todos</label><label class="ibs__radio"><input type="radio" name="ibx-access" value="selected" data-ibx-access="selected" ${a.mode === 'selected' ? 'checked' : ''} /> Selecciona usuarios y equipos que pueden editar</label>
      <div class="ibs__accesslists" id="ibx-access-lists" ${a.mode === 'selected' ? '' : 'hidden'}><div><h4>Usuarios</h4>${USERS.map((u) => `<label class="snp__check"><input type="checkbox" data-ibx-user="${esc(u)}" ${a.users.includes(u) ? 'checked' : ''} /> ${esc(u)}</label>`).join('')}</div><div><h4>Equipos</h4>${ALL_TEAMS.map((t) => `<label class="snp__check"><input type="checkbox" data-ibx-team="${esc(t)}" ${a.teams.includes(t) ? 'checked' : ''} /> ${esc(t)}</label>`).join('')}</div></div>`;
  }
  return `<div id="ibs" class="ibs" data-ibs="inboxes"><h2>Bandejas de entrada</h2>
    <div class="ibs__current"><label>Vista actual <select id="ibx-current">${list.map((i) => `<option value="${esc(i.id)}" ${ib && i.id === ib.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label><span class="muted">Solo estás modificando esta vista.</span>
      <div class="menu"><button class="btn btn--secondary btn--sm" type="button" aria-haspopup="true">Acciones <span class="caret"></span></button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-ibx="rename">Renombrar</button><button class="menu__item" type="button" data-ibx="create">Crear bandeja</button><div class="menu__sep"></div><button class="menu__item menu__item--danger" type="button" data-ibx="delete">Eliminar</button></div></div></div>
    <div class="gtabs ibs__tabs">${tabs.map(([k, l]) => `<button type="button" class="${ui.tab === k ? 'is-active' : ''}" data-ibx-tab="${k}">${l}</button>`).join('')}</div>
    <div class="ibs__tabbody" id="ibx-body">${body}</div></div>`;
}

// ---------- 3 · Gestión de disponibilidad ----------
export function paneAvailability() {
  const f = ui.filters;
  const av = availability();
  const list = inboxes();
  const rows = USERS.filter((u) => (!f.user || u === f.user) && (!f.status || userStatus(u) === f.status) && (!f.team || TEAM_OF[u] === f.team));
  return `<div id="ibs" class="ibs" data-ibs="availability"><h2>Gestión de disponibilidad</h2><p class="muted">El estado de cada usuario decide si recibe conversaciones: las nuevas conversaciones entrantes solo se asignan, por turnos, a los usuarios disponibles.</p>
    <div class="ibs__filters"><select id="av-user" aria-label="Usuarios"><option value="">Usuarios</option>${USERS.map((u) => `<option value="${esc(u)}" ${f.user === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select><select id="av-status" aria-label="Estado del usuario"><option value="">Estado del usuario</option><option value="available" ${f.status === 'available' ? 'selected' : ''}>Disponible</option><option value="away" ${f.status === 'away' ? 'selected' : ''}>No disponible</option></select><select id="av-team" aria-label="Equipos"><option value="">Equipos</option>${ALL_TEAMS.map((t) => `<option value="${esc(t)}" ${f.team === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><select id="av-inbox" aria-label="Bandejas de entrada"><option value="">Bandejas de entrada</option>${list.map((i) => `<option value="${esc(i.id)}" ${f.inbox === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></div>
    <label class="srow"><span><strong>Asignación automática por turnos</strong><small>Reparte las conversaciones entrantes entre los usuarios disponibles.</small></span><input type="checkbox" class="switch" id="av-auto" ${av.autoAssign !== false ? 'checked' : ''} /></label>
    <table class="mini-table stable ibs__table"><thead><tr><th>Usuario</th><th>Equipo</th><th>Bandejas de entrada</th><th>Estado</th></tr></thead><tbody id="av-rows">${rows.map((u) => { const st = userStatus(u); return `<tr data-user="${esc(u)}"><td><span class="name"><span class="avatar avatar--xs">${esc(initials(u))}</span>${esc(u)}</span></td><td>${esc(TEAM_OF[u] || '--')}</td><td>${list.length === 1 ? esc(list[0].name) : `${list.length} bandejas`}</td><td><span class="ibs__dot ibs__dot--${st}" aria-hidden="true"></span><select data-av-user="${esc(u)}" aria-label="Estado de ${esc(u)}"><option value="available" ${st === 'available' ? 'selected' : ''}>Disponible</option><option value="away" ${st === 'away' ? 'selected' : ''}>No disponible</option></select></td></tr>`; }).join('') || '<tr><td colspan="4"><div class="tpls__empty">Ningún usuario coincide con los filtros.</div></td></tr>'}</tbody></table></div>`;
}

// ---------- 4 · Lista de permitidos y denegados ----------
export function paneSpam() {
  const s = spam();
  const section = (key, title, desc) => `<div class="ibs__spamlist"><h3>${title}</h3><p class="muted">${desc}</p><form class="ibs__spamform" data-spam-form="${key}"><input id="spam-${key}" placeholder="Agregar correo o dominio" aria-label="${title}" /><button class="btn btn--secondary btn--sm" type="submit">Agregar</button></form><table class="mini-table stable ibs__table"><thead><tr><th>Correo o dominio</th><th></th></tr></thead><tbody id="spam-${key}-rows">${s[key].length ? s[key].map((e) => `<tr data-entry="${esc(e)}"><td>${esc(e)}</td><td><button class="link-btn" type="button" data-spam-remove="${key}" data-entry="${esc(e)}">Eliminar</button></td></tr>`).join('') : '<tr><td colspan="2" class="muted">Sin entradas.</td></tr>'}</tbody></table></div>`;
  return `<div id="ibs" class="ibs" data-ibs="spam"><h2>Lista de permitidos y denegados</h2><p class="muted">Elige qué conversaciones entrantes deberían marcarse como spam.</p>
    ${section('allow', 'Lista de permitidos', 'Nunca marcar conversaciones de los remitentes como spam.')}${section('deny', 'Lista de denegados', 'Siempre marcar conversaciones de los remitentes como spam.')}
    <label class="ibs__autospam"><input type="checkbox" id="spam-auto" ${s.autoSpam ? 'checked' : ''} /><span><strong>Marcar automáticamente como spam</strong><small>Las conversaciones que parezcan spam se apartan de la bandeja y quedan en la carpeta Spam.</small></span></label></div>`;
}

// ---------- modal + connection flows ----------
let modalAction = null;
function modal(title, body, foot, { onAction = null, size = '' } = {}) {
  let m = $('ibs-modal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'bmodal bmodal--top';
    m.id = 'ibs-modal';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target.closest('[data-bm="close"]')) { e.preventDefault(); closeModal(); return; } const b = e.target.closest('[data-ibm]'); if (b && modalAction) modalAction(b.dataset.ibm, b); });
    m.addEventListener('submit', (e) => { e.preventDefault(); const b = m.querySelector('[data-ibm][data-primary]'); if (b && modalAction) modalAction(b.dataset.ibm, b); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('is-open')) closeModal(); });
  }
  modalAction = onAction;
  m.innerHTML = `<div class="bmodal__scrim" data-bm="close"></div><div class="bmodal__panel${size ? ` bmodal__panel--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="ibs-modal-title"><div class="bmodal__head"><h3 id="ibs-modal-title">${esc(title)}</h3><button class="bmodal__close" type="button" data-bm="close" aria-label="Cerrar">×</button></div><form class="bmodal__body" id="ibs-modal-body">${body}</form><div class="bmodal__foot" id="ibs-modal-foot">${foot}</div></div>`;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  const first = m.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
  if (first) first.focus();
  return m;
}
function closeModal() { const m = $('ibs-modal'); if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); } modalAction = null; }
const cancelBtn = '<button class="btn btn--secondary" type="button" data-bm="close">Cancelar</button>';
const steps = (n, total) => `<p class="ibs__steps">Paso ${n} de ${total}</p>`;
function openChannelFlow(key, rerender) {
  const done = (msg) => { closeModal(); rerender(); toast(msg); };
  if (key === 'chat') {
    const c = channels().chat;
    modal(c.connected ? 'Configurar chat' : 'Conectar chat', `${steps(1, 1)}<label class="field"><span>Nombre del chat</span><input id="ibf-chat-name" value="${esc(c.name || 'Chat del sitio web')}" /></label><label class="field"><span>Mensaje de bienvenida</span><textarea id="ibf-chat-welcome" rows="3">${esc(c.welcome || '')}</textarea></label><p class="muted">El chat se muestra en tu sitio web con el código de seguimiento de Omni.</p>`, `<button class="btn btn--primary" type="button" data-ibm="chat-save" data-primary>${c.connected ? 'Guardar' : 'Conectar chat'}</button>${cancelBtn}`, { onAction: () => { const r = connectChat({ name: $('ibf-chat-name').value, welcome: $('ibf-chat-welcome').value }); done(`Chat «${r.name}» conectado`); } });
  } else if (key === 'forms') {
    const have = channels().forms.forms || [];
    modal('Conectar formulario', `${steps(1, 1)}<p class="muted">Elige los formularios cuyos envíos llegarán a la bandeja de entrada.</p>${SAMPLE_FORMS.map(([id, l]) => `<label class="snp__check"><input type="checkbox" data-ibf-form="${id}" ${have.includes(id) ? 'checked disabled' : ''} /> ${esc(l)}${have.includes(id) ? ' <span class="muted">· conectado</span>' : ''}</label>`).join('')}`, `<button class="btn btn--primary" type="button" data-ibm="forms-save" data-primary>Conectar formulario</button>${cancelBtn}`, { onAction: () => { const ids = [...$('ibs-modal').querySelectorAll('[data-ibf-form]:checked:not([disabled])')].map((i) => i.dataset.ibfForm); if (!ids.length) { toast('Elige al menos un formulario.'); return; } connectForms(ids); done(`${plural(ids.length, 'formulario conectado', 'formularios conectados')}`); } });
  } else if (key === 'teamEmail') {
    openConnectWizard({ onConnected: (acc) => { addTeamEmail(acc.email); rerender(); toast(`Correo del equipo ${acc.email} conectado`); } });
  } else if (key === 'calls') {
    const flow = { number: '' };
    const step1 = () => modal('Conectar número de teléfono', `${steps(1, 2)}<p class="muted">Conecta el número desde el que llamas y recibes llamadas; te enviaremos un código de verificación por SMS.</p><div class="enr__row"><label class="field"><span>País</span><select id="ibf-country">${[['+52', 'México (+52)'], ['+1', 'Estados Unidos (+1)'], ['+34', 'España (+34)'], ['+57', 'Colombia (+57)']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label class="field"><span>Número de teléfono</span><input id="ibf-number" placeholder="712 690 1001" /></label></div><div class="snp__error" id="ibf-err" hidden></div>`, `<button class="btn btn--primary" type="button" data-ibm="calls-send" data-primary>Enviar código</button>${cancelBtn}`, { onAction: (a) => { if (a !== 'calls-send') return; const n = `${$('ibf-country').value}${$('ibf-number').value.replace(/\D/g, '')}`; if (n.replace(/\D/g, '').length < 8) { const err = $('ibf-err'); err.textContent = 'Escribe un número de teléfono válido.'; err.hidden = false; return; } flow.number = n; step2(); } });
    const step2 = () => modal('Conectar número de teléfono', `${steps(2, 2)}<p>Hemos enviado un código de 6 dígitos al <strong>${esc(flow.number)}</strong>.</p><label class="field"><span>Código de verificación</span><input id="ibf-code" inputmode="numeric" maxlength="6" placeholder="123456" /></label><div class="snp__error" id="ibf-err" hidden></div>`, `<button class="btn btn--primary" type="button" data-ibm="calls-verify" data-primary>Verificar</button><button class="btn btn--secondary" type="button" data-ibm="calls-back">Atrás</button>`, { onAction: (a) => { if (a === 'calls-back') { step1(); return; } if (!/^\d{6}$/.test($('ibf-code').value.trim())) { const err = $('ibf-err'); err.textContent = 'El código tiene 6 dígitos.'; err.hidden = false; return; } addNumber('calls', flow.number); done(`Número ${flow.number} conectado para llamadas`); } });
    step1();
  } else if (key === 'whatsapp') {
    const flow = { number: '' };
    const step1 = () => modal('Conectar número de WhatsApp', `${steps(1, 3)}<p class="muted">Conecta tu cuenta de WhatsApp Business para recibir y responder mensajes desde la bandeja.</p><label class="field"><span>Número de WhatsApp Business</span><input id="ibf-wa" placeholder="+52 712 690 1001" /></label><div class="snp__error" id="ibf-err" hidden></div>`, `<button class="btn btn--primary" type="button" data-ibm="wa-next" data-primary>Siguiente</button>${cancelBtn}`, { onAction: () => { const n = $('ibf-wa').value.replace(/[^\d+]/g, ''); if (n.replace(/\D/g, '').length < 8) { const err = $('ibf-err'); err.textContent = 'Escribe un número de WhatsApp válido.'; err.hidden = false; return; } flow.number = n; step2(); } });
    const step2 = () => modal('Conectar número de WhatsApp', `${steps(2, 3)}<p>Abre WhatsApp Business en tu teléfono, entra en <strong>Dispositivos vinculados</strong> y escanea este código.</p><div class="ibs__qr" aria-hidden="true">▣</div><p class="muted">Vinculando el ${esc(flow.number)} (simulación: pulsa cuando lo hayas vinculado).</p>`, `<button class="btn btn--primary" type="button" data-ibm="wa-linked" data-primary>He vinculado la cuenta</button><button class="btn btn--secondary" type="button" data-ibm="wa-back">Atrás</button>`, { onAction: (a) => { if (a === 'wa-back') { step1(); return; } step3(); } });
    const step3 = () => modal('Conectar número de WhatsApp', `${steps(3, 3)}<p><strong>¡Listo!</strong> El ${esc(flow.number)} quedará conectado a la bandeja de entrada.</p>`, `<button class="btn btn--primary" type="button" data-ibm="wa-done" data-primary>Conectar</button>${cancelBtn}`, { onAction: () => { addNumber('whatsapp', flow.number); done(`WhatsApp ${flow.number} conectado`); } });
    step1();
  } else if (key === 'messenger') {
    const have = channels().messenger.pages || [];
    modal('Conectar páginas de Facebook', `${steps(1, 1)}<p class="muted">Elige las páginas cuyos mensajes de Messenger llegarán a la bandeja.</p>${SAMPLE_PAGES.map(([id, l]) => `<label class="snp__check"><input type="checkbox" data-ibf-page="${id}" ${have.includes(id) ? 'checked disabled' : ''} /> ${esc(l)}${have.includes(id) ? ' <span class="muted">· conectada</span>' : ''}</label>`).join('')}`, `<button class="btn btn--primary" type="button" data-ibm="pages-save" data-primary>Conectar páginas</button>${cancelBtn}`, { onAction: () => { const ids = [...$('ibs-modal').querySelectorAll('[data-ibf-page]:checked:not([disabled])')].map((i) => i.dataset.ibfPage); if (!ids.length) { toast('Elige al menos una página.'); return; } connectPages(ids); done(`${plural(ids.length, 'página conectada', 'páginas conectadas')}`); } });
  }
}

// ---------- mount ----------
const PANES = { channels: paneChannels, inboxes: paneInboxes, availability: paneAvailability, spam: paneSpam };
export function mountInboxSettings(container) {
  if (!container) return;
  const rerender = () => { const kind = container.dataset.ibs; const html = PANES[kind](); const tmp = document.createElement('div'); tmp.innerHTML = html; container.innerHTML = tmp.firstElementChild.innerHTML; wireMenus(container); };
  if (!container.dataset.ibsWired) {
    container.dataset.ibsWired = '1';
    container.addEventListener('click', (e) => {
      const ch = e.target.closest('[data-ib]');
      if (ch) { closeMenus(); if (ch.dataset.ib === 'connect') openChannelFlow(ch.dataset.key, rerender); else if (ch.dataset.ib === 'disconnect') { disconnectChannel(ch.dataset.key, ch.dataset.item); rerender(); toast('Canal desconectado'); } return; }
      const tab = e.target.closest('[data-ibx-tab]');
      if (tab) { ui.tab = tab.dataset.ibxTab; rerender(); return; }
      const x = e.target.closest('[data-ibx]');
      if (!x) return;
      closeMenus();
      const a = x.dataset.ibx;
      const ib = currentInbox();
      if (a === 'rename') modal('Renombrar bandeja', `<label class="field"><span>Nombre</span><input id="ibx-name" value="${esc(ib.name)}" /></label>`, `<button class="btn btn--primary" type="button" data-ibm="rename" data-primary>Guardar</button>${cancelBtn}`, { onAction: () => { if (!renameInbox(ib.id, $('ibx-name').value)) { toast('Escribe un nombre.'); return; } closeModal(); rerender(); toast('Bandeja renombrada'); } });
      else if (a === 'create') modal('Crear bandeja de entrada', '<label class="field"><span>Nombre de la bandeja</span><input id="ibx-name" placeholder="P. ej. Soporte" /></label><p class="muted">Después podrás asignarle canales, ANS, vistas y acceso.</p>', `<button class="btn btn--primary" type="button" data-ibm="create" data-primary>Crear bandeja</button>${cancelBtn}`, { onAction: () => { const i = createInbox($('ibx-name').value); if (!i) { toast('Escribe un nombre.'); return; } ui.inboxId = i.id; ui.tab = 'channels'; closeModal(); rerender(); toast(`Bandeja «${i.name}» creada`); } });
      else if (a === 'delete') { if (inboxes().length <= 1) { toast('No puedes eliminar la única bandeja de entrada.'); return; } modal('Eliminar bandeja', `<p>¿Seguro que quieres eliminar «<strong>${esc(ib.name)}</strong>»? Sus canales dejarán de tener bandeja hasta que los asignes a otra.</p>`, `<button class="btn btn--primary tpls__danger" type="button" data-ibm="delete" data-primary>Eliminar</button>${cancelBtn}`, { onAction: () => { deleteInbox(ib.id); ui.inboxId = null; closeModal(); rerender(); toast('Bandeja eliminada'); } }); } else if (a === 'add-channel') { const free = channelOptions().filter(([id]) => !ib.channels.includes(id)); modal('Agregar canal', free.length ? `<p class="muted">Canales conectados que todavía no están en esta bandeja.</p>${free.map(([id, l]) => `<label class="snp__check"><input type="checkbox" data-ibx-pick="${esc(id)}" /> ${esc(l)}</label>`).join('')}` : '<p class="muted">Todos los canales conectados ya están en esta bandeja. Conecta más en Canales.</p>', `${free.length ? '<button class="btn btn--primary" type="button" data-ibm="add-channel" data-primary>Agregar</button>' : ''}${cancelBtn}`, { onAction: () => { const ids = [...$('ibs-modal').querySelectorAll('[data-ibx-pick]:checked')].map((i) => i.dataset.ibxPick); if (!ids.length) { toast('Elige al menos un canal.'); return; } ids.forEach((id) => addInboxChannel(ib.id, id)); closeModal(); rerender(); toast(`${plural(ids.length, 'canal agregado', 'canales agregados')}`); } }); } else if (a === 'remove-channel') { removeInboxChannel(ib.id, x.dataset.channel); rerender(); toast('Canal quitado de la bandeja'); } else if (a === 'create-view') modal('Crear vista de equipo', `<label class="field"><span>Nombre de la vista</span><input id="ibx-view-name" placeholder="P. ej. Urgentes" /></label><label class="field"><span>Asignado a</span><select id="ibx-view-assignee"><option>Todos</option>${USERS.map((u) => `<option>${esc(u)}</option>`).join('')}${ALL_TEAMS.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>`, `<button class="btn btn--primary" type="button" data-ibm="create-view" data-primary>Crear vista</button>${cancelBtn}`, { onAction: () => { if (!addView(ib.id, { name: $('ibx-view-name').value, assignedTo: $('ibx-view-assignee').value })) { toast('Escribe el nombre de la vista.'); return; } closeModal(); rerender(); toast('Vista de equipo creada'); } });
      else if (a === 'remove-view') { removeView(ib.id, x.dataset.view); rerender(); toast('Vista eliminada'); }
    });
    container.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-spam-form]');
      if (!form) return;
      e.preventDefault();
      const key = form.dataset.spamForm;
      const inp = $(`spam-${key}`);
      if (!isValidSpamEntry(inp.value)) { toast('Escribe un correo o un dominio válido (p. ej. nombre@empresa.com o empresa.com).'); inp.focus(); return; }
      const e2 = addSpamEntry(key, inp.value);
      rerender();
      toast(`${e2} añadido a la lista de ${key === 'allow' ? 'permitidos' : 'denegados'}`);
    });
    container.addEventListener('click', (e) => { const r = e.target.closest('[data-spam-remove]'); if (r) { removeSpamEntry(r.dataset.spamRemove, r.dataset.entry); rerender(); toast('Entrada eliminada'); } });
    container.addEventListener('change', (e) => {
      const t = e.target;
      const ib = currentInbox();
      if (t.id === 'ibx-current') { ui.inboxId = t.value; rerender(); } else if (t.dataset.ibxSlaBasis) { setSla(ib.id, { basis: t.value }); toast(t.value === 'calendar' ? 'Los ANS se aplican en horas calendario' : 'Los ANS se aplican según el horario de funcionamiento'); } else if (t.dataset.ibxSlaOn) { setSla(ib.id, { [t.dataset.ibxSlaOn]: { on: t.checked } }); rerender(); } else if (t.dataset.ibxSlaH || t.dataset.ibxSlaM) { const key = t.dataset.ibxSlaH || t.dataset.ibxSlaM; const h = container.querySelector(`[data-ibx-sla-h="${key}"]`); const m = container.querySelector(`[data-ibx-sla-m="${key}"]`); setSla(ib.id, { [key]: { hours: Math.max(0, Number(h.value) || 0), minutes: Math.max(0, Math.min(59, Number(m.value) || 0)) } }); toast('Límite del ANS guardado'); } else if (t.dataset.ibxAccess) { const lists = $('ibx-access-lists'); if (lists) lists.hidden = t.value !== 'selected'; setAccess(ib.id, { mode: t.value, users: ib.access.users, teams: ib.access.teams }); } else if (t.dataset.ibxUser !== undefined || t.dataset.ibxTeam !== undefined) { setAccess(ib.id, { mode: 'selected', users: [...container.querySelectorAll('[data-ibx-user]:checked')].map((i) => i.dataset.ibxUser), teams: [...container.querySelectorAll('[data-ibx-team]:checked')].map((i) => i.dataset.ibxTeam) }); } else if (t.dataset.avUser) { setAvailability(t.dataset.avUser, t.value); rerender(); toast(`${t.dataset.avUser}: ${t.value === 'away' ? 'no disponible' : 'disponible'}`); } else if (t.id === 'av-auto') { setAutoAssign(t.checked); toast(t.checked ? 'Asignación automática activada' : 'Asignación automática desactivada'); } else if (['av-user', 'av-status', 'av-team', 'av-inbox'].includes(t.id)) { ui.filters[t.id.slice(3)] = t.value; rerender(); } else if (t.id === 'spam-auto') { setAutoSpam(t.checked); toast(t.checked ? 'Se marcará el spam automáticamente' : 'No se marcará el spam automáticamente'); }
    });
  }
  wireMenus(container);
}

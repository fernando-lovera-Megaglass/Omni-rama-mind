// Account settings (the gear in the top bar): a full settings tree with a pane per section.
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { ticketPipelines, saveTicketPipelines, CURRENCY_DEFS, CURRENCY_CODES, currencyRates, saveCurrencyRates, homeCurrency, OWNERS, DEAL_STAGES, TICKET_STATUSES, PIPELINE_KEY, ASSOC_LABELS_KEY, assocLabels, ALL, formatDate, formatMoney, dealPipelines, saveDealPipelines, dealPipelineDefs, saveDealPipelineDefs, newPipelineDef, setField, LIFECYCLES, download, lifecycleDef, saveLifecycleDef, defaultLifecycleDef } from './data.js';
import { propertyGroups, customProperties, saveCustomProperties, propertyList } from './properties.js';
import { TEAMS, loadLayout, cardCatalog } from './layout-defaults.js';
import { STD_VIEWS, defaultTabs } from './std-views.js';
import { getViewStore } from './data.js';
import { getSignature, setSignature, emailTemplates } from './compose.js';

boot({ root: '../', active: 'none', sub: '', title: 'Configuración' });
document.body.classList.add('app--settings-page');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const root = document.getElementById('settings-root');
const OBJECTS = [['contacts', 'Contactos'], ['companies', 'Empresas'], ['deals', 'Negocios'], ['tickets', 'Tickets'], ['tasks', 'Tareas']];
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ---------- navigation tree ----------
const NAV = [
  { title: 'Tus preferencias', items: [['prefs-general', 'General'], ['prefs-notif', 'Notificaciones']] },
  { title: 'Gestión de la organización', items: [['org-accounts', 'Múltiples cuentas'], ['org-copy', 'Copia de recursos']] },
  {
    title: 'Gestión de cuentas',
    items: [
      ['account-defaults', 'Valores predeterminados de la cuenta'],
      ['account-billing', 'Cuenta y facturación', 'ext'],
      ['data-audit', 'Registro de auditoría'],
      ['account-users', 'Usuarios y equipos'],
      ['account-updates', 'Actualizaciones de productos', 'ext'],
      { id: 'account-integrations', label: 'Integraciones', children: [['int-connected', 'Aplicaciones conectadas'], ['int-private', 'Aplicaciones privadas'], ['int-api', 'Clave de API'], ['int-webhooks', 'Webhooks'], ['int-email', 'Integraciones de correo']] },
      ['account-marketplace', 'Descargas del mercado'],
      { id: 'account-tracking', label: 'Seguimiento y analíticas', children: [['track-code', 'Código de seguimiento'], ['track-analytics', 'Analíticas de tráfico'], ['track-domains', 'Dominios'], ['track-utm', 'Parámetros UTM']] },
      ['account-privacy', 'Privacidad y consentimiento'],
      ['account-security', 'Seguridad'],
      ['account-ai', 'IA'],
      ['account-payments', 'Cuenta de pagos'],
    ],
  },
  {
    title: 'Gestión de datos',
    items: [
      ['data-objects', 'Objetos'],
      ['data-properties', 'Propiedades'],
      ['data-import', 'Importar y exportar'],
      ['data-quality', 'Calidad de los datos'],
      ['data-enrich', 'Enriquecimiento de datos'],
      ['data-sync', 'Sincronización de datos'],
    ],
  },
  {
    title: 'Herramientas',
    items: [
      { id: 'tools-marketing', label: 'Marketing', children: [['mk-email', 'Correo'], ['mk-forms', 'Formularios'], ['mk-ads', 'Anuncios'], ['mk-social', 'Redes sociales']] },
      { id: 'tools-content', label: 'Contenido', children: [['ct-pages', 'Páginas'], ['ct-blog', 'Blog'], ['ct-domains', 'Dominios y URL']] },
      { id: 'tools-sales', label: 'Ventas', children: [['sl-deals', 'Negocios'], ['sl-quotes', 'Cotizaciones'], ['sl-meetings', 'Reuniones'], ['sl-products', 'Productos'], ['sl-templates', 'Plantillas y firma']] },
      { id: 'tools-service', label: 'Servicio', children: [['sv-tickets', 'Tickets'], ['sv-inbox', 'Bandeja de entrada'], ['sv-surveys', 'Encuestas de feedback'], ['sv-kb', 'Base de conocimientos']] },
      ['tools-calling', 'Llamadas'],
      ['tools-payments', 'Pagos'],
    ],
  },
];
const flatItems = () => NAV.flatMap((g) => g.items.flatMap((it) => (Array.isArray(it) ? [it] : it.children)));
const parentOf = (id) => NAV.flatMap((g) => g.items).find((it) => !Array.isArray(it) && it.children.some((c) => c[0] === id));

const state = { section: 'prefs-general', generalTab: 'perfil', propsObject: 'contacts', propsQuery: '', propsGroup: '', objectsTab: 'config', objectsObject: 'deals', open: new Set() };
const OBJECT_PAGES = [...OBJECTS, ['products', 'Productos'], ['custom', 'Objetos personalizados']];
function setSection(id) {
  // "#obj-deals" and "#obj-deals:pipelines" open the Objetos page on that object (and tab).
  const m = /^obj-([a-z]+)(?::([a-z]+))?$/.exec(id || '');
  if (m && OBJECT_PAGES.some((o) => o[0] === m[1])) {
    state.objectsObject = m[1];
    state.objectsTab = m[2] || 'config';
    id = 'data-objects';
  }
  state.section = flatItems().some((it) => it[0] === id) ? id : 'prefs-general';
  const p = parentOf(state.section);
  if (p) state.open.add(p.id);
}
setSection((location.hash || '#prefs-general').slice(1));

// ---------- stores ----------
const profile = () => ({ first: 'Fernando', last: 'Lovera Colin', email: 'fernando-lovera@megaglass.us', lang: 'Español', region: 'México y Centroamérica', currency: 'MXN', dial: '+52', phone: '72-25-103617', ...load('crm:profile', {}) });
const notif = () => ({ email_assign: true, email_mention: true, email_digest: false, push_tasks: true, push_deals: true, ...load('crm:notif', {}) });
const account = () => ({ name: 'Megaglass', tz: 'America/Mexico_City', currency: 'MXN', lang: 'Español', fiscalYear: 'Enero', ...load('crm:account', {}) });
const users = () => load('crm:users', OWNERS.filter((o) => o !== 'Sin asignar').map((o, i) => ({ name: o, email: `${slug(o).replace(/_/g, '.')}@megaglass.us`, team: TEAMS[i % 3], role: i === 0 ? 'Superadministrador' : 'Usuario', status: 'Activo' })));
const teams = () => load('crm:teams', TEAMS.map((t) => ({ name: t })));
const integrations = () => load('crm:integrations', [
  { name: 'Gmail', desc: 'Correo y calendario', on: true }, { name: 'WhatsApp Business', desc: 'Mensajería', on: true }, { name: 'Zoom', desc: 'Reuniones', on: false },
  { name: 'Stripe', desc: 'Pagos', on: false }, { name: 'Slack', desc: 'Notificaciones', on: true }, { name: 'QuickBooks', desc: 'Facturación', on: false },
]);
const exportsLog = () => load('crm:exports', []);
const setting = (id, defaults) => ({ ...defaults, ...load(`crm:settings:${id}`, {}) });

// ---------- small builders ----------
const REGIONS = { 'México y Centroamérica': ['8 de noviembre de 2026', '08/11/2026', '20:11 CST', '1,234.56'], España: ['8 de noviembre de 2026', '08/11/2026', '20:11 CET', '1.234,56'], 'Estados Unidos': ['November 8, 2026', '11/08/2026', '8:11 PM EST', '1,234.56'], Colombia: ['8 de noviembre de 2026', '08/11/2026', '20:11 COT', '1.234,56'] };
const CURRENCIES = [['MXN', 'Mexican Peso (MXN) MX$'], ['EUR', 'Euro (EUR) €'], ['USD', 'US Dollar (USD) $'], ['COP', 'Colombian Peso (COP) $']];
const DIALS = [['+52', '🇲🇽'], ['+34', '🇪🇸'], ['+1', '🇺🇸'], ['+57', '🇨🇴'], ['+54', '🇦🇷'], ['+56', '🇨🇱'], ['+51', '🇵🇪']];
const HOME_PAGES = ['Panel de informes', 'Contactos', 'Empresas', 'Negocios', 'Tickets', 'Tareas'];
const TIMEZONES = ['(UTC-06:00) Ciudad de México', '(UTC+01:00) Madrid', '(UTC-05:00) Bogotá', '(UTC-05:00) Nueva York', '(UTC-03:00) Buenos Aires'];
const switchRow = (id, key, label, desc, on) => `<label class="srow"><span><strong>${label}</strong><small>${desc}</small></span><input type="checkbox" class="switch" data-setting="${id}" data-key="${key}" ${on ? 'checked' : ''} /></label>`;
function togglePane(id, title, desc, rows, extra = '') {
  const s = setting(id, Object.fromEntries(rows.map((r) => [r[0], r[3]])));
  return `${title ? `<h2>${title}</h2>` : ''}${desc ? `<p class="muted">${desc}</p>` : ''}${rows.map(([k, l, d]) => switchRow(id, k, l, d, s[k])).join('')}${extra}`;
}
const infoList = (title, items) => `<h3>${title}</h3><table class="mini-table stable"><tbody>${items.map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td>${v}</td></tr>`).join('')}</tbody></table>`;
const simpleTable = (head, rows) => `<table class="mini-table stable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const cardGrid = (items) => `<div class="igrid">${items.map(([n, d, btn]) => `<div class="icard"><div class="icard__logo">${esc(n[0])}</div><div class="icard__text"><strong>${esc(n)}</strong><small>${esc(d)}</small></div>${btn}</div>`).join('')}</div>`;
const toastBtn = (label, msg, cls = 'btn btn--ghost btn--sm') => `<button class="${cls}" type="button" data-act="toast" data-msg="${esc(msg)}">${label}</button>`;

// ---------- panes: preferences (General with tabs) ----------
function paneGeneral() {
  const tabs = [['perfil', 'Perfil'], ['correo', 'Correo'], ['llamadas', 'Llamadas'], ['calendario', 'Calendario'], ['tareas', 'Tareas'], ['seguridad', 'Seguridad'], ['automatizacion', 'Automatización']];
  const body = { perfil: tabPerfil, correo: tabCorreo, llamadas: tabLlamadas, calendario: tabCalendario, tareas: tabTareas, seguridad: tabSeguridad, automatizacion: tabAutomatizacion }[state.generalTab]();
  return `<h2>General</h2>
    <div class="gtabs">${tabs.map(([k, l]) => `<button type="button" class="${state.generalTab === k ? 'is-active' : ''}" data-general-tab="${k}">${l}</button>`).join('')}</div>
    <p class="muted">Estas preferencias solo se aplican a ti.</p><hr class="cd-sep" />${body}`;
}
function tabPerfil() {
  const p = profile();
  const sample = REGIONS[p.region] || REGIONS['México y Centroamérica'];
  const avatar = p.avatar ? `<img class="avatar avatar--lg gavatar__img" src="${esc(p.avatar)}" alt="" />` : `<span class="avatar avatar--lg" style="background:#6a78d1">${esc((p.first[0] || '') + (p.last[0] || ''))}</span>`;
  return `<h3 class="gh">Global</h3><p class="muted">Esto se aplica a todas las cuentas que tienes.</p>
    <form class="gform" data-save="profile">
      <div class="gfield"><label>Imagen de perfil</label><div class="gavatar"><label class="gavatar__pick tip" data-tip="Cambiar imagen">${avatar}<input type="file" id="avatar-file" accept="image/*" hidden /></label>${p.avatar ? '<button class="link-btn" type="button" data-act="avatar-rm">Quitar</button>' : ''}</div></div>
      <div class="gfield"><label for="pf-first">Nombre</label><input id="pf-first" class="ginput" name="first" value="${esc(p.first)}" /></div>
      <div class="gfield"><label for="pf-last">Apellidos</label><input id="pf-last" class="ginput" name="last" value="${esc(p.last)}" /></div>
      <div class="gfield"><label for="pf-lang">Idioma <span class="info">ⓘ</span></label><select id="pf-lang" class="ginput" name="lang">${['Español', 'Inglés', 'Portugués', 'Francés'].map((l) => `<option ${p.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="gfield"><label for="pf-region">Formato de hora, fecha y número <span class="info">ⓘ</span></label><p class="muted gformat" id="pf-sample">Formato: ${sample[0]}, ${sample[1]}, ${sample[2]} y ${sample[3]}</p><select id="pf-region" class="ginput" name="region">${Object.keys(REGIONS).map((r) => `<option ${p.region === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="gfield"><label for="pf-currency">Divisa preferida <span class="info">ⓘ</span></label><select id="pf-currency" class="ginput" name="currency">${CURRENCIES.map(([c, l]) => `<option value="${c}" ${p.currency === c ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="gfield"><label for="pf-phone">Número de teléfono</label><p class="muted">Podríamos usar este número de teléfono para contactarte en referencia a eventos de seguridad. Consulta nuestra política de privacidad para <a href="#">obtener más información ↗</a></p>
        <div class="gphone"><select name="dial" aria-label="País">${DIALS.map(([d, f]) => `<option value="${d}" ${p.dial === d ? 'selected' : ''}>${f}</option>`).join('')}</select><input id="pf-phone" name="phone" value="${esc(`${p.dial}-${p.phone}`)}" /></div></div>
      <hr class="cd-sep" />
      <h3 class="gh">Correo</h3>
      <div class="gfield"><label for="pf-email">Dirección de correo</label><p class="muted">Esta es la dirección con la que inicias sesión y a la que llegan las notificaciones.</p><div class="gfield--row"><input id="pf-email" class="ginput ginput--wide" name="email" type="email" value="${esc(p.email)}" /><button class="btn btn--ghost" type="button" data-act="toast" data-msg="Te enviamos un correo de verificación a la nueva dirección">Cambiar dirección de correo</button></div></div>
      <h3 class="gh">Contraseña</h3>
      <div class="gfield"><p class="muted">Te enviaremos un enlace para restablecer tu contraseña.</p><a class="btn btn--ghost" href="#prefs-general" data-general-tab="seguridad">Restablecer contraseña</a></div>
      <hr class="cd-sep" />
      <h3 class="gh">Esta cuenta</h3><p class="muted">Esto solo se aplica a la cuenta ${esc(account().name)}.</p>
      <div class="gfield"><label for="pf-home">Página de inicio predeterminada <span class="info">ⓘ</span></label><p class="muted">Elige la página que quieres ver al iniciar sesión.</p><select id="pf-home" class="ginput" name="home">${HOME_PAGES.map((h) => `<option ${(p.home || HOME_PAGES[0]) === h ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
      <div class="gfield"><label for="pf-theme">Tema</label><select id="pf-theme" class="ginput" name="theme">${['Claro', 'Oscuro', 'Según el sistema'].map((h) => `<option ${(p.theme || 'Claro') === h ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
      <div class="gfield"><label for="pf-tz">Zona horaria</label><select id="pf-tz" class="ginput" name="tz">${TIMEZONES.map((h) => `<option ${(p.tz || TIMEZONES[0]) === h ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
      <div class="sform__btns gsave"><button class="btn btn--primary" type="submit">Guardar</button><button class="btn btn--ghost" type="reset">Cancelar</button></div>
    </form>`;
}
function tabCorreo() {
  return `<h3 class="gh">Correo</h3><p class="muted">Cómo se registran y envían tus correos uno a uno.</p>${togglePane('general-correo', '', '', [
    ['log', 'Registrar correos en el CRM', 'Los correos que envías desde tu bandeja se guardan en la ficha del contacto.', true],
    ['track', 'Seguimiento de aperturas y clics', 'Recibe una notificación cuando abren tus correos.', true],
    ['bcc', 'BCC automático', 'Añade la dirección de registro a los correos enviados desde otras aplicaciones.', false],
    ['signature_default', 'Incluir mi firma por defecto', 'La firma se añade a cada correo nuevo.', true],
  ], `<h3>Bandeja de entrada conectada</h3>${cardGrid([['Gmail', 'fernando-lovera@megaglass.us · conectada', toastBtn('Desconectar', 'Bandeja desconectada (demostración).')]])}<p><a class="link-btn" href="#sl-templates">Editar mi firma y plantillas</a></p>`)}`;
}
function tabLlamadas() {
  const s = setting('general-llamadas', { provider: 'Llamadas integradas', number: '+52 712 690 1001', record: true, voicemail: false });
  return `<h3 class="gh">Llamadas</h3><p class="muted">Desde qué número llamas y cómo se registran las llamadas.</p>
    <form class="gform" data-save="general-llamadas">
      <div class="gfield"><label>Proveedor de llamadas</label><select class="ginput" name="provider">${['Llamadas integradas', 'Twilio Connect', 'Aircall', 'Teléfono propio'].map((o) => `<option ${s.provider === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="gfield"><label>Número desde el que llamas</label><input class="ginput" name="number" value="${esc(s.number)}" /></div>
      <div class="sform__btns"><button class="btn btn--primary" type="submit">Guardar</button></div>
    </form>
    ${switchRow('general-llamadas', 'record', 'Grabar llamadas', 'Las grabaciones se guardan en la actividad de la llamada.', s.record)}
    ${switchRow('general-llamadas', 'voicemail', 'Buzón de voz', 'Desvía al buzón cuando no contestas.', s.voicemail)}`;
}
function tabCalendario() {
  const s = setting('general-calendario', { from: '09:00', to: '18:00', tz: 'America/Mexico_City', connected: true, buffer: '15 minutos' });
  return `<h3 class="gh">Calendario</h3><p class="muted">Tu calendario conectado y tu disponibilidad para reuniones.</p>
    <div class="icard"><div class="icard__logo">G</div><div class="icard__text"><strong>Google Calendar</strong><small>${s.connected ? 'Conectado · fernando-lovera@megaglass.us' : 'No conectado'}</small></div><label class="switchwrap"><input type="checkbox" class="switch" data-setting="general-calendario" data-key="connected" ${s.connected ? 'checked' : ''} /><span>${s.connected ? 'Conectado' : 'Desconectado'}</span></label></div>
    <form class="gform" data-save="general-calendario">
      <div class="gfield"><label>Zona horaria</label><select class="ginput" name="tz">${['America/Mexico_City', 'Europe/Madrid', 'America/New_York', 'America/Bogota'].map((o) => `<option ${s.tz === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="gfield gfield--row"><label>Disponible de</label><input class="ginput" type="time" name="from" value="${esc(s.from)}" /><label>a</label><input class="ginput" type="time" name="to" value="${esc(s.to)}" /></div>
      <div class="gfield"><label>Margen entre reuniones</label><select class="ginput" name="buffer">${['Sin margen', '15 minutos', '30 minutos'].map((o) => `<option ${s.buffer === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="sform__btns"><button class="btn btn--primary" type="submit">Guardar</button></div>
    </form>`;
}
function tabTareas() {
  const s = setting('general-tareas', { reminder: 'El día de vencimiento a las 9:00', view: 'Para hoy', followup: true, digest: true });
  return `<h3 class="gh">Tareas</h3><p class="muted">Valores predeterminados al crear tareas.</p>
    <form class="gform" data-save="general-tareas">
      <div class="gfield"><label>Recordatorio predeterminado</label><select class="ginput" name="reminder">${['Sin recordatorio', 'El día de vencimiento a las 9:00', '1 hora antes', '1 día antes'].map((o) => `<option ${s.reminder === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="gfield"><label>Vista predeterminada de tareas</label><select class="ginput" name="view">${['Todas las tareas', 'Para hoy', 'Atrasadas', 'Próximas'].map((o) => `<option ${s.view === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="sform__btns"><button class="btn btn--primary" type="submit">Guardar</button></div>
    </form>
    ${switchRow('general-tareas', 'followup', 'Proponer tarea de seguimiento al enviar correos', 'Marca la casilla de seguimiento por defecto en el redactor de correo.', s.followup)}
    ${switchRow('general-tareas', 'digest', 'Resumen diario de tareas', 'Un correo cada mañana con las tareas del día.', s.digest)}`;
}
function tabSeguridad() {
  const s = load('crm:security', { twofa: false });
  return `<h3 class="gh">Seguridad</h3>
    <form class="gform" data-save="password">
      <div class="gfield"><label>Contraseña actual</label><input class="ginput" name="current" type="password" required /></div>
      <div class="gfield"><label>Nueva contraseña</label><input class="ginput" name="next" type="password" minlength="8" required /></div>
      <div class="sform__btns"><button class="btn btn--primary" type="submit">Actualizar contraseña</button></div>
    </form>
    <label class="srow"><span><strong>Autenticación en dos pasos</strong><small>Añade una segunda comprobación al iniciar sesión.</small></span><input type="checkbox" class="switch" data-security="twofa" ${s.twofa ? 'checked' : ''} /></label>
    <h3>Sesiones activas</h3>${simpleTable(['Dispositivo', 'Ubicación', 'Último acceso', ''], [['Este navegador', 'Miami, FL', 'Ahora', '<span class="muted">Sesión actual</span>'], ['iPhone', 'Ciudad de México', 'Ayer', toastBtn('Cerrar sesión', 'Sesión cerrada en iPhone', 'link-btn')]])}`;
}
function tabAutomatizacion() {
  return `<h3 class="gh">Automatización</h3><p class="muted">Acciones automáticas sobre tus registros.</p>${togglePane('general-automatizacion', '', '', [
    ['auto_owner', 'Asignarme los registros que creo', 'Serás el propietario de los contactos y negocios que crees.', true],
    ['rotation', 'Participar en la rotación de leads', 'Recibe leads nuevos por turnos con tu equipo.', false],
    ['auto_task', 'Crear tarea al cerrar un negocio', 'Añade una tarea de seguimiento post-venta.', true],
  ])}`;
}
function paneNotif() {
  const n = notif();
  const row = (k, l, d) => `<label class="srow"><span><strong>${l}</strong><small>${d}</small></span><input type="checkbox" class="switch" data-notif="${k}" ${n[k] ? 'checked' : ''} /></label>`;
  return `<h2>Notificaciones</h2><p class="muted">Elige qué avisos recibes y por dónde.</p>
    <h3>Correo</h3>${row('email_assign', 'Registro asignado', 'Cuando te asignan un contacto, negocio o ticket.')}${row('email_mention', 'Menciones', 'Cuando alguien te menciona en una nota.')}${row('email_digest', 'Resumen diario', 'Un correo cada mañana con tu actividad pendiente.')}
    <h3>En la aplicación</h3>${row('push_tasks', 'Tareas vencidas', 'Aviso cuando una tarea pasa su fecha de vencimiento.')}${row('push_deals', 'Cambios de etapa', 'Cuando un negocio tuyo cambia de etapa.')}`;
}

// ---------- panes: organisation & account ----------
const paneOrgAccounts = () => `<h2>Múltiples cuentas</h2><p class="muted">Cuentas a las que tienes acceso con este usuario.</p>${simpleTable(['Cuenta', 'ID', 'Rol', ''], [['<strong>Megaglass</strong>', '5417939', 'Superadministrador', '<span class="tag tag--done">Actual</span>'], ['Megaglass México', '8821004', 'Usuario', toastBtn('Cambiar', 'Cambiando de cuenta… (demostración)', 'link-btn')]])}<p>${toastBtn('Solicitar acceso a otra cuenta', 'Solicitud enviada al administrador.', 'btn btn--ghost')}</p>`;
const paneOrgCopy = () => `<h2>Copia de recursos</h2><p class="muted">Copia propiedades, pipelines, plantillas o vistas a otra cuenta.</p>
  <form class="sform" data-save="copy"><div class="sform__row"><label class="field"><span>Recurso</span><select name="res">${['Propiedades personalizadas', 'Pipelines', 'Plantillas de correo', 'Vistas guardadas', 'Diseño de la página de registro'].map((o) => `<option>${o}</option>`).join('')}</select></label><label class="field"><span>Cuenta de destino</span><select name="to"><option>Megaglass México (8821004)</option></select></label></div><div class="sform__btns"><button class="btn btn--primary" type="submit">Copiar</button></div></form>
  <h3>Historial</h3>${simpleTable(['Fecha', 'Recurso', 'Destino', 'Estado'], load('crm:copies', []).map((c) => [esc(c.when), esc(c.res), esc(c.to), '<span class="tag tag--done">Completada</span>']))}`;
function paneDefaults() {
  const a = account();
  return `<h2>Valores predeterminados de la cuenta</h2>
    <form class="sform" data-save="account">
      <div class="sform__row"><label class="field"><span>Nombre de la cuenta</span><input name="name" value="${esc(a.name)}" /></label><label class="field"><span>Moneda de la empresa</span><select name="currency">${CURRENCY_CODES.map((c) => `<option value="${c}" ${a.currency === c ? 'selected' : ''}>${c} · ${CURRENCY_DEFS[c].name} (${CURRENCY_DEFS[c].symbol})</option>`).join('')}</select></label></div>
      <div class="sform__row"><label class="field"><span>Zona horaria</span><select name="tz">${['America/Mexico_City', 'Europe/Madrid', 'America/New_York'].map((l) => `<option ${a.tz === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Idioma</span><select name="lang">${['Español', 'Inglés'].map((l) => `<option ${a.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Inicio del año fiscal</span><select name="fiscalYear">${['Enero', 'Abril', 'Julio', 'Octubre'].map((l) => `<option ${a.fiscalYear === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="sform__btns"><button class="btn btn--primary" type="submit">Guardar</button></div>
    </form>
    <h3>Monedas y tipos de cambio</h3>
    <p class="muted">Cada negocio tiene su propia moneda. Los importes se muestran en la moneda del negocio y los totales de las listas y los paneles se convierten a la moneda de la empresa (${esc(homeCurrency())}) con estos tipos de cambio.</p>
    <form class="sform" data-save="currencies">
      <table class="mini-table stable ptable ctable"><thead><tr><th>Moneda</th><th>Símbolo</th><th>Tipo de cambio</th></tr></thead><tbody>
        ${CURRENCY_CODES.map((c) => `<tr><td><strong>${c}</strong> · ${esc(CURRENCY_DEFS[c].name)}${c === homeCurrency() ? ' <span class="tag tag--done">Moneda de la empresa</span>' : ''}</td><td>${esc(CURRENCY_DEFS[c].symbol)}</td><td>${c === homeCurrency() ? '<span class="muted">—</span>' : `<span class="ctable__rate">1 ${c} = <input name="${c}" type="number" step="any" min="0" value="${currencyRates()[c]}" aria-label="Tipo de cambio de ${c}" /> ${esc(homeCurrency())}</span>`}</td></tr>`).join('')}
      </tbody></table>
      <div class="sform__btns"><button class="btn btn--primary" type="submit">Guardar tipos de cambio</button></div>
    </form>
    ${infoList('Información de la cuenta', [['ID de la cuenta', '5417939 <button class="copy" type="button" data-copy="5417939" aria-label="Copiar">⧉</button>'], ['Centro de datos', 'Norteamérica'], ['Creada', '22 de diciembre de 2021']])}`;
}
// ---------- Usuarios y equipos: Usuarios / Licencias / Equipos / Ajustes preestablecidos ----------
Object.assign(state, { utab: 'users', uq: '', uFilter: { perm: '', team: '', active: '', status: '' }, uSel: new Set(), uSort: { key: 'name', dir: 1 }, uPage: 1, uSize: 10, tq: '' });
const ROLES = ['Superadministrador', 'Administrador', 'Usuario', 'Solo lectura'];
const SEATS = { core: 'Licencia principal', view: 'Solo lectura', sales: 'Sales Hub', service: 'Service Hub' };
const SEAT_TOTALS = () => load('crm:seats', { core: 10, view: 5, sales: 5, service: 3 });
const PERM_AREAS = [['crm', 'CRM', ['Ver contactos y empresas', 'Editar registros', 'Eliminar registros', 'Importar y exportar']], ['marketing', 'Marketing', ['Correos de marketing', 'Formularios', 'Anuncios']], ['sales', 'Ventas', ['Negocios y pipelines', 'Cotizaciones', 'Secuencias']], ['service', 'Servicio', ['Tickets', 'Bandeja de entrada', 'Base de conocimientos']], ['reports', 'Informes', ['Ver paneles', 'Crear y editar informes']], ['account', 'Cuenta', ['Configuración de la cuenta', 'Usuarios y equipos', 'Facturación']]];
// Users with the extra fields the tabs need (seat, add-ons, last activity, permissions); older saves get defaults.
function userRows() {
  const base = users();
  let changed = false;
  base.forEach((u, i) => {
    if (!u.seat) { u.seat = u.role === 'Solo lectura' ? 'view' : 'core'; changed = true; }
    if (!Array.isArray(u.addons)) { u.addons = i % 2 === 0 ? ['sales'] : []; changed = true; }
    if (!u.lastActive) { u.lastActive = new Date(Date.now() - [0.2, 1, 3, 9, 40][i % 5] * 86400000).toISOString(); changed = true; }
    if (!u.status) { u.status = 'Activo'; changed = true; }
    if (u.status === 'Invitado') { u.status = 'Invitación pendiente'; changed = true; }
  });
  if (changed) save('crm:users', base);
  return base;
}
const saveUsers = (list) => save('crm:users', list);
const initialsOf = (n) => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const lastActiveText = (iso) => { const d = (Date.now() - new Date(iso)) / 86400000; return d < 1 ? 'Hoy' : d < 2 ? 'Ayer' : d < 30 ? `Hace ${Math.round(d)} días` : formatDate(iso); };
const presets = () => load('crm:presets', [{ id: 'p1', name: 'Ajuste predeterminado de ventas', home: 'Negocios', lang: 'Español', tz: '(UTC-06:00) Ciudad de México', dateFormat: 'dd/mm/aaaa', notifEmail: true, notifDesktop: true, notifMobile: false, teams: ['Ventas en el Extranjero'], users: [], updated: new Date(2026, 9, 2, 10, 15).toISOString(), by: 'Fernando Lovera Colin' }]);
const savePresets = (list) => save('crm:presets', list);
const seatLog = () => load('crm:seatlog', []);
function usersTabHtml() {
  const ts = teams();
  const all = userRows();
  const f = state.uFilter;
  const q = state.uq.trim().toLowerCase();
  const daysAgo = (iso) => (Date.now() - new Date(iso)) / 86400000;
  let rows = all.map((u, i) => ({ ...u, i })).filter((u) => (!f.perm || u.role === f.perm) && (!f.team || u.team === f.team) && (!f.status || u.status === f.status) && (!f.active || (f.active === 'today' ? daysAgo(u.lastActive) < 1 : f.active === '7' ? daysAgo(u.lastActive) <= 7 : f.active === '30' ? daysAgo(u.lastActive) <= 30 : daysAgo(u.lastActive) > 30)) && (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
  const { key, dir } = state.uSort;
  rows.sort((a, b) => (key === 'lastActive' ? new Date(a.lastActive) - new Date(b.lastActive) : String(a[key] || '').localeCompare(String(b[key] || ''), 'es')) * dir);
  const pages = Math.max(1, Math.ceil(rows.length / state.uSize));
  if (state.uPage > pages) state.uPage = pages;
  const page = rows.slice((state.uPage - 1) * state.uSize, state.uPage * state.uSize);
  const chip = (name, label, current, options) => `<div class="menu"><button class="qchip${current ? ' is-set' : ''}" type="button" aria-haspopup="true" aria-expanded="false">${esc(current ? `${label}: ${(options.find((o) => o[0] === current) || [current, current])[1]}` : label)} <span class="caret"></span></button><div class="menu__panel"><button class="menu__item" type="button" data-uset="${name}" data-value="">Todos</button>${options.map(([v, l]) => `<button class="menu__item${current === v ? ' is-current' : ''}" type="button" data-uset="${name}" data-value="${esc(v)}">${esc(l)}</button>`).join('')}</div></div>`;
  const th = (k, label) => `<th><button class="psort${key === k ? ' is-active' : ''}" type="button" data-usort="${k}">${label} <span aria-hidden="true">${key === k ? (dir > 0 ? '↑' : '↓') : '⇅'}</span></button></th>`;
  const selCount = [...state.uSel].filter((e) => all.some((u) => u.email === e)).length;
  const anyFilter = f.perm || f.team || f.status || f.active || q;
  return `<div class="pchips">${chip('perm', 'Permisos', f.perm, ROLES.map((r) => [r, r]))}${chip('team', 'Equipos', f.team, ts.map((t) => [t.name, t.name]))}${chip('active', 'Último activo', f.active, [['today', 'Hoy'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['old', 'Más de 30 días']])}${chip('status', 'Estado', f.status, [['Activo', 'Activo'], ['Invitación pendiente', 'Invitación pendiente'], ['Desactivado', 'Desactivado']])}${anyFilter ? '<button class="link-btn" type="button" data-act="users-clear">Borrar filtros</button>' : ''}</div>
    <div class="ptoolbar"><div class="search search--sm ptoolbar__search"><input type="search" id="users-q" value="${esc(state.uq)}" placeholder="Buscar usuarios" aria-label="Buscar usuarios" /><span class="ico ico--search" aria-hidden="true"></span></div><span class="muted">${rows.length} usuario${rows.length === 1 ? '' : 's'}</span></div>
    ${selCount ? `<div class="pbulk"><strong>${selCount} seleccionado${selCount > 1 ? 's' : ''}</strong><button class="link-btn" type="button" data-act="ubulk-team">Asignar equipo</button><button class="link-btn" type="button" data-act="ubulk-role">Cambiar permisos</button><button class="link-btn" type="button" data-act="ubulk-off">Desactivar</button><button class="link-btn" type="button" data-act="ubulk-export">Exportar</button><button class="link-btn" type="button" data-act="ubulk-clear">Limpiar</button></div>` : ''}
    <table class="mini-table stable proptable utable"><thead><tr><th class="pcheck"><input type="checkbox" data-ucheck-all ${page.length && page.every((u) => state.uSel.has(u.email)) ? 'checked' : ''} aria-label="Seleccionar todo" /></th>${th('name', 'Nombre')}${th('team', 'Equipos')}${th('role', 'Acceso')}<th>Licencia</th>${th('lastActive', 'Último activo')}${th('status', 'Estado')}<th class="num">Acciones</th></tr></thead><tbody>
      ${page.length ? page.map((u) => `<tr class="${u.status === 'Desactivado' ? 'is-off' : ''}"><td class="pcheck"><input type="checkbox" data-ucheck="${esc(u.email)}" ${state.uSel.has(u.email) ? 'checked' : ''} aria-label="Seleccionar ${esc(u.name)}" /></td>
        <td><div class="uname"><span class="avatar avatar--sm" style="background:${['#006162', '#0091ae', '#6a78d1', '#f2547d', '#00a4bd'][u.i % 5]}">${esc(initialsOf(u.name))}</span><div><button class="olink" type="button" data-uact="edit" data-i="${u.i}">${esc(u.name)}</button>${u.role === 'Superadministrador' ? ' <span class="tag tag--new">Superadministrador</span>' : ''}<br /><span class="muted">${esc(u.email)}</span></div></div></td>
        <td>${u.team ? `<span class="rvchip">${esc(u.team)}</span>` : '<span class="muted">--</span>'}</td>
        <td>${esc(u.role)}</td>
        <td>${esc(SEATS[u.seat] || SEATS.core)}${(u.addons || []).length ? `<br /><span class="muted">+ ${u.addons.map((a) => SEATS[a]).join(', ')}</span>` : ''}</td>
        <td>${u.status === 'Invitación pendiente' ? '<span class="muted">--</span>' : esc(lastActiveText(u.lastActive))}</td>
        <td><span class="tag ${u.status === 'Activo' ? 'tag--done' : u.status === 'Desactivado' ? 'tag--high' : 'tag--open'}">${esc(u.status)}</span></td>
        <td class="num"><div class="menu"><button class="icon-btn icon-btn--round" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Acciones">⋯</button><div class="menu__panel menu__panel--right">
          <button class="menu__item" type="button" data-uact="edit" data-i="${u.i}">Editar usuario</button>
          <button class="menu__item" type="button" data-uact="perms" data-i="${u.i}">Editar permisos</button>
          <button class="menu__item" type="button" data-uact="super" data-i="${u.i}">${u.role === 'Superadministrador' ? 'Quitar superadministrador' : 'Establecer como superadministrador'}</button>
          ${u.status === 'Invitación pendiente' ? `<button class="menu__item" type="button" data-uact="resend" data-i="${u.i}">Reenviar invitación</button>` : ''}
          <button class="menu__item" type="button" data-user-toggle="${u.i}">${u.status === 'Activo' ? 'Desactivar usuario' : 'Activar usuario'}</button>
          <button class="menu__item menu__item--danger" type="button" data-uact="rm" data-i="${u.i}" ${u.role === 'Superadministrador' && all.filter((x) => x.role === 'Superadministrador').length < 2 ? 'disabled' : ''}>Eliminar usuario</button>
        </div></div></td></tr>`).join('') : '<tr><td colspan="8" class="muted">No hay usuarios que coincidan con los filtros.</td></tr>'}
    </tbody></table>
    <div class="ppager"><span></span><nav class="ppager__nav" aria-label="Páginas"><button class="link-btn" type="button" data-upage="${state.uPage - 1}" ${state.uPage <= 1 ? 'disabled' : ''}>‹ Anterior</button>${Array.from({ length: pages }, (_, i) => i + 1).map((n) => `<button class="ppager__num${n === state.uPage ? ' is-active' : ''}" type="button" data-upage="${n}">${n}</button>`).join('')}<button class="link-btn" type="button" data-upage="${state.uPage + 1}" ${state.uPage >= pages ? 'disabled' : ''}>Siguiente ›</button></nav><div class="menu"><button class="qchip" type="button" aria-haspopup="true" aria-expanded="false">${state.uSize} por página <span class="caret"></span></button><div class="menu__panel menu__panel--right">${[10, 25, 50].map((n) => `<button class="menu__item${state.uSize === n ? ' is-current' : ''}" type="button" data-usize="${n}">${n} por página</button>`).join('')}</div></div></div>`;
}
function seatsTabHtml() {
  const all = userRows();
  const totals = SEAT_TOTALS();
  const used = { core: all.filter((u) => u.seat === 'core' && u.status !== 'Desactivado').length, view: all.filter((u) => u.seat === 'view' && u.status !== 'Desactivado').length, sales: all.filter((u) => (u.addons || []).includes('sales')).length, service: all.filter((u) => (u.addons || []).includes('service')).length };
  const DESC = { core: 'Acceso completo a las herramientas incluidas en tu suscripción.', view: 'Puede ver registros e informes, pero no editarlos.', sales: 'Herramientas de ventas: secuencias, cotizaciones, previsión.', service: 'Herramientas de servicio: tickets, bandeja compartida, encuestas.' };
  return `<p class="muted">Cada usuario necesita una licencia principal o de solo lectura. Las licencias de Sales Hub y Service Hub se añaden a la principal. <a href="#" onclick="return false">Comprar más licencias ↗</a></p>
    <div class="seats">${Object.entries(SEATS).map(([k, l]) => { const pct = totals[k] ? Math.min(100, Math.round((used[k] / totals[k]) * 100)) : 0; return `<div class="seat${state.uFilter.seat === k ? ' is-active' : ''}"><div class="seat__head"><strong>${l}</strong><span class="muted">${used[k]} de ${totals[k]} asignadas</span></div><p class="muted">${DESC[k]}</p><div class="seat__bar"><i style="width:${pct}%"></i></div><div class="seat__foot"><button class="btn btn--ghost btn--sm" type="button" data-seatfilter="${k}">${state.uFilter.seat === k ? 'Ver todos' : 'Administrar'}</button><button class="link-btn" type="button" data-act="seats-buy" data-seat="${k}">Añadir licencias</button></div></div>`; }).join('')}</div>
    <h3>Asignación de licencias</h3>
    <table class="mini-table stable proptable utable"><thead><tr><th>Usuario</th><th>Licencia principal</th><th>Sales Hub</th><th>Service Hub</th><th>Estado</th></tr></thead><tbody>
      ${all.map((u, i) => ({ ...u, i })).filter((u) => !state.uFilter.seat || u.seat === state.uFilter.seat || (u.addons || []).includes(state.uFilter.seat)).map((u) => `<tr class="${u.status === 'Desactivado' ? 'is-off' : ''}"><td><div class="uname"><span class="avatar avatar--sm" style="background:${['#006162', '#0091ae', '#6a78d1', '#f2547d', '#00a4bd'][u.i % 5]}">${esc(initialsOf(u.name))}</span><div><strong>${esc(u.name)}</strong><br /><span class="muted">${esc(u.email)}</span></div></div></td><td><select class="ginput ginput--sm" data-user-seat="${u.i}"><option value="core" ${u.seat === 'core' ? 'selected' : ''}>${SEATS.core}</option><option value="view" ${u.seat === 'view' ? 'selected' : ''}>${SEATS.view}</option></select></td><td><label class="lcswitch"><input type="checkbox" class="switch" data-user-addon="sales" data-i="${u.i}" ${(u.addons || []).includes('sales') ? 'checked' : ''} ${u.seat === 'view' ? 'disabled' : ''} /></label></td><td><label class="lcswitch"><input type="checkbox" class="switch" data-user-addon="service" data-i="${u.i}" ${(u.addons || []).includes('service') ? 'checked' : ''} ${u.seat === 'view' ? 'disabled' : ''} /></label></td><td><span class="tag ${u.status === 'Activo' ? 'tag--done' : u.status === 'Desactivado' ? 'tag--high' : 'tag--open'}">${esc(u.status)}</span></td></tr>`).join('')}
    </tbody></table>
    <h3>Historial de licencias</h3>
    ${seatLog().length ? `<ul class="updates">${seatLog().slice(0, 8).map((l) => `<li><span class="muted">${esc(formatDate(l.when))}</span><strong>${esc(l.text)}</strong></li>`).join('')}</ul>` : '<p class="muted">Todavía no hay cambios de licencias.</p>'}`;
}
function teamsTabHtml() {
  const ts = teams();
  const all = userRows();
  const q = state.tq.trim().toLowerCase();
  const members = (name) => all.filter((u) => u.team === name);
  const roots = ts.filter((t) => !t.parent || !ts.some((x) => x.name === t.parent));
  const ordered = [];
  const walk = (t, depth) => { ordered.push({ t, depth }); ts.filter((c) => c.parent === t.name).forEach((c) => walk(c, depth + 1)); };
  roots.forEach((t) => walk(t, 0));
  const rows = ordered.filter(({ t }) => !q || t.name.toLowerCase().includes(q));
  return `<div class="ptoolbar"><div class="search search--sm ptoolbar__search"><input type="search" id="teams-q" value="${esc(state.tq)}" placeholder="Buscar equipos" aria-label="Buscar equipos" /><span class="ico ico--search" aria-hidden="true"></span></div><div class="ptoolbar__right"><span class="muted">${ts.length} equipos</span><button class="btn btn--primary" type="button" data-act="new-team">Crear equipo</button></div></div>
    <p class="muted">Organiza a tus usuarios en equipos para asignar registros, vistas y permisos. Un equipo puede tener equipos secundarios.</p>
    <table class="mini-table stable proptable utable"><thead><tr><th>Nombre del equipo</th><th>Miembros</th><th>Equipo principal</th><th class="num">Acciones</th></tr></thead><tbody>
      ${rows.length ? rows.map(({ t, depth }) => { const i = ts.indexOf(t); const ms = members(t.name); return `<tr><td><span class="tindent" style="--d:${depth}">${depth ? '↳ ' : ''}<button class="olink" type="button" data-team-edit="${i}">${esc(t.name)}</button></span></td><td>${ms.length ? `<span class="ustack">${ms.slice(0, 4).map((u, k) => `<span class="avatar avatar--xs" style="background:${['#006162', '#0091ae', '#6a78d1', '#f2547d', '#00a4bd'][(all.indexOf(u) + k) % 5]}" title="${esc(u.name)}">${esc(initialsOf(u.name))}</span>`).join('')}</span> ${ms.length} miembro${ms.length > 1 ? 's' : ''}` : '<span class="muted">Sin miembros</span>'}</td><td>${t.parent ? esc(t.parent) : '<span class="muted">--</span>'}</td><td class="num"><div class="menu"><button class="icon-btn icon-btn--round" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Acciones">⋯</button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-team-edit="${i}">Editar equipo</button><button class="menu__item" type="button" data-team-child="${i}">Agregar equipo secundario</button><button class="menu__item menu__item--danger" type="button" data-team-rm="${i}" ${ms.length || ts.some((c) => c.parent === t.name) ? 'disabled title="Tiene miembros o equipos secundarios"' : ''}>Eliminar</button></div></div></td></tr>`; }).join('') : '<tr><td colspan="4" class="muted">No hay equipos que coincidan.</td></tr>'}
    </tbody></table>`;
}
function presetsTabHtml() {
  const list = presets();
  return `<div class="shead"><p class="muted">Los ajustes preestablecidos definen la configuración inicial (página de inicio, idioma, formato y notificaciones) de los usuarios y equipos a los que se asignan. Cada usuario puede cambiarla después en sus preferencias.</p><button class="btn btn--primary" type="button" data-act="new-preset">Crear ajuste preestablecido</button></div>
    ${list.length ? `<table class="mini-table stable proptable utable"><thead><tr><th>Nombre</th><th>Página de inicio</th><th>Asignado a</th><th>Última actualización</th><th class="num">Acciones</th></tr></thead><tbody>
      ${list.map((p, i) => `<tr><td><button class="olink" type="button" data-preset-edit="${i}">${esc(p.name)}</button></td><td>${esc(p.home)}</td><td>${[...(p.teams || []).map((t) => `<span class="rvchip">${esc(t)}</span>`), ...(p.users || []).map((u) => `<span class="rvchip rvchip--user">${esc(u)}</span>`)].join(' ') || '<span class="muted">Sin asignar</span>'}</td><td><div>${esc(rvDate(p.updated))}</div><div class="muted">${esc(p.by || '')}</div></td><td class="num"><div class="menu"><button class="icon-btn icon-btn--round" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Acciones">⋯</button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-preset-edit="${i}">Editar</button><button class="menu__item" type="button" data-preset-clone="${i}">Clonar</button><button class="menu__item menu__item--danger" type="button" data-preset-rm="${i}">Eliminar</button></div></div></td></tr>`).join('')}
    </tbody></table>` : '<p class="pempty">Todavía no hay ajustes preestablecidos. Crea uno para que los usuarios nuevos empiecen con la configuración de su equipo.</p>'}`;
}
function paneUsers() {
  const all = userRows();
  const tabs = [['users', `Usuarios (${all.length})`], ['seats', 'Licencias'], ['teams', `Equipos (${teams().length})`], ['presets', `Ajustes preestablecidos (${presets().length})`]];
  const body = state.utab === 'seats' ? seatsTabHtml() : state.utab === 'teams' ? teamsTabHtml() : state.utab === 'presets' ? presetsTabHtml() : usersTabHtml();
  return `<div class="shead"><h2>Usuarios y equipos</h2><span class="ad-foot__btns"><button class="btn btn--ghost" type="button" data-act="export-users">Exportar usuarios</button><button class="btn btn--primary" type="button" data-act="new-user">Crear usuario</button></span></div>
    <p class="odesc">Crea usuarios, personaliza sus permisos y licencias, y organízalos en equipos. <a href="#" onclick="return false">Más información ↗</a></p>
    <div class="otabs"><div class="otabs__tabs">${tabs.map(([k, l]) => `<button type="button" class="${state.utab === k ? 'is-active' : ''}" data-utab="${k}">${l}</button>`).join('')}</div></div>
    <div class="obody">${body}</div>`;
}
// Modals for users, permissions, teams and presets.
function userModal(i) {
  const all = userRows();
  const u = i === null ? { name: '', email: '', team: teams()[0] ? teams()[0].name : '', role: 'Usuario', seat: 'core', addons: [] } : all[i];
  openModal(i === null ? 'Crear usuario' : `Editar usuario: ${esc(u.name)}`, `<form id="u-form" class="ad-form">
      <label class="field"><span>Nombre</span><input name="name" required value="${esc(u.name)}" /></label>
      <label class="field"><span>Correo</span><input name="email" type="email" required value="${esc(u.email)}" ${i === null ? '' : 'readonly'} /></label>
      <label class="field"><span>Equipo</span><select name="team"><option value="">Sin equipo</option>${teams().map((t) => `<option ${u.team === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Nivel de acceso</span><select name="role">${ROLES.map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label class="field"><span>Licencia principal</span><select name="seat"><option value="core" ${u.seat === 'core' ? 'selected' : ''}>${SEATS.core}</option><option value="view" ${u.seat === 'view' ? 'selected' : ''}>${SEATS.view}</option></select></label>
      <fieldset class="field"><span>Licencias adicionales</span><label class="ocheck ocheck--sm"><input type="checkbox" name="sales" ${(u.addons || []).includes('sales') ? 'checked' : ''} /><span>Sales Hub</span></label><label class="ocheck ocheck--sm"><input type="checkbox" name="service" ${(u.addons || []).includes('service') ? 'checked' : ''} /><span>Service Hub</span></label></fieldset>
      ${i === null ? '<p class="muted">El usuario recibirá un correo de invitación para crear su contraseña.</p>' : ''}
    </form>`, `<button class="btn btn--primary" type="submit" form="u-form">${i === null ? 'Enviar invitación' : 'Guardar'}</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  document.getElementById('u-form').onsubmit = (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(ev.target).entries());
    const addons = ['sales', 'service'].filter((k) => ev.target.elements[k].checked);
    if (i === null) {
      if (all.some((x) => x.email.toLowerCase() === d.email.trim().toLowerCase())) { toast('Ya existe un usuario con ese correo'); return; }
      all.push({ name: d.name.trim(), email: d.email.trim(), team: d.team, role: d.role, seat: d.seat, addons, status: 'Invitación pendiente', lastActive: new Date().toISOString() });
      toast(`Invitación enviada a ${d.email.trim()}`);
    } else {
      Object.assign(u, { name: d.name.trim(), team: d.team, role: d.role, seat: d.seat, addons });
      toast('Usuario actualizado');
    }
    saveUsers(all); closeModal(); render();
  };
}
function permsModal(i) {
  const all = userRows();
  const u = all[i];
  const perms = u.perms || {};
  openModal(`Permisos de ${esc(u.name)}`, `<p class="muted">Nivel de acceso: <strong>${esc(u.role)}</strong>. Ajusta qué puede hacer en cada área.</p><form id="perm-form">${PERM_AREAS.map(([k, label, items]) => `<fieldset class="permgroup"><legend>${label}</legend>${items.map((it, j) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="${k}:${j}" ${perms[`${k}:${j}`] !== undefined ? (perms[`${k}:${j}`] ? 'checked' : '') : u.role === 'Solo lectura' && !/Ver/.test(it) ? '' : 'checked'} /><span>${it}</span></label>`).join('')}</fieldset>`).join('')}</form>`, `<button class="btn btn--primary" type="button" id="perm-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  document.getElementById('perm-save').onclick = () => { const f = document.getElementById('perm-form'); u.perms = Object.fromEntries([...f.querySelectorAll('input')].map((inp) => [inp.name, inp.checked])); saveUsers(all); closeModal(); toast('Permisos guardados'); };
}
function teamModal(i, parent) {
  const ts = teams();
  const all = userRows();
  const t = i === null ? { name: '', parent: parent || '' } : ts[i];
  openModal(i === null ? (parent ? `Crear equipo secundario de ${esc(parent)}` : 'Crear equipo') : `Editar equipo: ${esc(t.name)}`, `<form id="t-form" class="ad-form">
      <label class="field"><span>Nombre del equipo</span><input name="name" required value="${esc(t.name)}" /></label>
      <label class="field"><span>Equipo principal</span><select name="parent"><option value="">Ninguno</option>${ts.filter((x) => x !== t).map((x) => `<option ${(t.parent || '') === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <fieldset class="field"><span>Miembros</span><div class="ocardgrid ocardgrid--modal">${all.map((u, k) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="m" value="${k}" ${u.team === t.name && t.name ? 'checked' : ''} /><span>${esc(u.name)}${u.team && u.team !== t.name ? ` <small class="muted">(${esc(u.team)})</small>` : ''}</span></label>`).join('')}</div></fieldset>
    </form>`, `<button class="btn btn--primary" type="submit" form="t-form">${i === null ? 'Crear' : 'Guardar'}</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  document.getElementById('t-form').onsubmit = (ev) => {
    ev.preventDefault();
    const name = ev.target.elements.name.value.trim();
    if (!name) return;
    if (ts.some((x) => x !== t && x.name.toLowerCase() === name.toLowerCase())) { toast('Ya existe un equipo con ese nombre'); return; }
    const old = t.name;
    t.name = name; t.parent = ev.target.elements.parent.value || undefined;
    if (i === null) ts.push(t);
    if (old && old !== name) { ts.forEach((x) => { if (x.parent === old) x.parent = name; }); all.forEach((u) => { if (u.team === old) u.team = name; }); }
    const picked = new Set([...ev.target.querySelectorAll('input[name="m"]:checked')].map((x) => Number(x.value)));
    all.forEach((u, k) => { if (picked.has(k)) u.team = name; else if (u.team === name) u.team = ''; });
    save('crm:teams', ts); saveUsers(all); closeModal(); render(); toast(i === null ? `Equipo "${name}" creado` : 'Equipo guardado');
  };
}
function presetModal(i) {
  const list = presets();
  const p = i === null ? { name: '', home: 'Panel de informes', lang: 'Español', tz: '(UTC-06:00) Ciudad de México', dateFormat: 'dd/mm/aaaa', notifEmail: true, notifDesktop: true, notifMobile: false, teams: [], users: [] } : list[i];
  const all = userRows();
  openModal(i === null ? 'Crear ajuste preestablecido' : `Editar ajuste: ${esc(p.name)}`, `<form id="ps-form" class="ad-form">
      <label class="field"><span>Nombre</span><input name="name" required value="${esc(p.name)}" placeholder="Por ejemplo: Equipo de instalación" /></label>
      <div class="pgrid">
        <label class="field"><span>Página de inicio</span><select name="home">${['Panel de informes', 'Contactos', 'Empresas', 'Negocios', 'Tickets', 'Tareas'].map((h) => `<option ${p.home === h ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        <label class="field"><span>Idioma</span><select name="lang">${['Español', 'Inglés', 'Portugués'].map((h) => `<option ${p.lang === h ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        <label class="field"><span>Zona horaria</span><select name="tz">${['(UTC-06:00) Ciudad de México', '(UTC+01:00) Madrid', '(UTC-05:00) Bogotá', '(UTC-05:00) Nueva York'].map((h) => `<option ${p.tz === h ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        <label class="field"><span>Formato de fecha</span><select name="dateFormat">${['dd/mm/aaaa', 'mm/dd/aaaa', 'aaaa-mm-dd'].map((h) => `<option ${p.dateFormat === h ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
      </div>
      <fieldset class="field"><span>Notificaciones iniciales</span><label class="ocheck ocheck--sm"><input type="checkbox" name="notifEmail" ${p.notifEmail ? 'checked' : ''} /><span>Correo</span></label><label class="ocheck ocheck--sm"><input type="checkbox" name="notifDesktop" ${p.notifDesktop ? 'checked' : ''} /><span>Escritorio</span></label><label class="ocheck ocheck--sm"><input type="checkbox" name="notifMobile" ${p.notifMobile ? 'checked' : ''} /><span>Móvil</span></label></fieldset>
      <fieldset class="field"><span>Asignar a equipos</span><div class="ocardgrid ocardgrid--modal">${teams().map((t) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="t" value="${esc(t.name)}" ${(p.teams || []).includes(t.name) ? 'checked' : ''} /><span>${esc(t.name)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="field"><span>Asignar a usuarios</span><div class="ocardgrid ocardgrid--modal">${all.map((u) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="u" value="${esc(u.name)}" ${(p.users || []).includes(u.name) ? 'checked' : ''} /><span>${esc(u.name)}</span></label>`).join('')}</div></fieldset>
    </form>`, `<button class="btn btn--primary" type="submit" form="ps-form">${i === null ? 'Crear' : 'Guardar'}</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  document.getElementById('ps-form').onsubmit = (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const vals = (n) => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map((x) => x.value);
    Object.assign(p, { name: f.elements.name.value.trim(), home: f.elements.home.value, lang: f.elements.lang.value, tz: f.elements.tz.value, dateFormat: f.elements.dateFormat.value, notifEmail: f.elements.notifEmail.checked, notifDesktop: f.elements.notifDesktop.checked, notifMobile: f.elements.notifMobile.checked, teams: vals('t'), users: vals('u'), updated: new Date().toISOString(), by: 'Fernando Lovera Colin' });
    if (!p.name) return;
    if (i === null) { p.id = `p${Date.now().toString(36)}`; list.push(p); }
    savePresets(list); closeModal(); render(); toast(i === null ? `Ajuste "${p.name}" creado` : 'Ajuste guardado');
  };
}
const paneUpdates = () => `<h2>Actualizaciones de productos</h2><p class="muted">Novedades recientes de la plataforma.</p><ul class="updates">${[['Noviembre 2026', 'Vista de panel (Kanban) para contactos y empresas.'], ['Octubre 2026', 'Editor de tarjetas de asociación con vista previa.'], ['Septiembre 2026', 'Nuevo redactor de correo con asistente.'], ['Agosto 2026', 'Edición en línea en las tablas.']].map(([d, t]) => `<li><span class="muted">${d}</span><strong>${t}</strong></li>`).join('')}</ul>`;
const paneIntegrations = () => `<h2>Aplicaciones conectadas</h2><p class="muted">Aplicaciones conectadas a la cuenta.</p><div class="igrid">${integrations().map((it, i) => `<div class="icard"><div class="icard__logo">${esc(it.name[0])}</div><div class="icard__text"><strong>${esc(it.name)}</strong><small>${esc(it.desc)}</small></div><label class="switchwrap"><input type="checkbox" class="switch" data-integration="${i}" ${it.on ? 'checked' : ''} /><span>${it.on ? 'Conectada' : 'Desconectada'}</span></label></div>`).join('')}</div>`;
const panePrivateApps = () => {
  const apps = load('crm:privateapps', [{ name: 'Integración ERP', scopes: 'crm.objects.contacts.read, crm.objects.deals.write', created: '12 mar 2026' }]);
  return `<div class="shead"><h2>Aplicaciones privadas</h2><button class="btn btn--primary" type="button" data-act="new-app">Crear aplicación privada</button></div><p class="muted">Tokens de acceso para tus propias integraciones.</p>${simpleTable(['Nombre', 'Permisos', 'Creada', ''], apps.map((a, i) => [`<strong>${esc(a.name)}</strong>`, `<span class="muted">${esc(a.scopes)}</span>`, esc(a.created), `${toastBtn('Ver token', `Token: pat-na1-••••••••-${i}42 (copiado)`, 'link-btn')} <button class="link-btn" type="button" data-app-rm="${i}">Eliminar</button>`]))}`;
};
const paneApiKey = () => `<h2>Clave de API</h2><p class="muted">Las claves de API heredadas están desactivadas; usa aplicaciones privadas.</p><div class="sform"><p><code>••••••••-••••-••••-••••-5417939</code> ${toastBtn('Regenerar', 'Clave regenerada (demostración)')}</p><p class="muted">Última utilización: nunca.</p></div>`;
const paneWebhooks = () => {
  const hooks = load('crm:webhooks', []);
  return `<div class="shead"><h2>Webhooks</h2><button class="btn btn--primary" type="button" data-act="new-webhook">Crear suscripción</button></div><p class="muted">Avisa a una URL cuando cambian tus registros.</p>${simpleTable(['Evento', 'URL', 'Estado', ''], hooks.map((h, i) => [esc(h.event), `<span class="muted">${esc(h.url)}</span>`, '<span class="tag tag--done">Activa</span>', `<button class="link-btn" type="button" data-hook-rm="${i}">Eliminar</button>`]))}`;
};
const paneEmailIntegrations = () => togglePane('int-email', 'Integraciones de correo', 'Bandejas conectadas y extensiones.', [['gmail', 'Extensión de Gmail', 'Registra y rastrea correos desde Gmail.', true], ['outlook', 'Complemento de Outlook', 'Lo mismo para Outlook y Office 365.', false], ['shared', 'Bandeja compartida ventas@megaglass.us', 'Conversaciones del equipo en una sola bandeja.', true]]);
const paneMarketplace = () => `<h2>Descargas del mercado</h2><p class="muted">Recursos instalados desde el marketplace.</p>${cardGrid([['Plantilla de cotización Pro', 'Plantilla', toastBtn('Actualizar', 'Actualizado a la última versión.')], ['Tema web Cristal', 'Tema', toastBtn('Actualizar', 'Actualizado a la última versión.')], ['Workflow de bienvenida', 'Workflow', toastBtn('Actualizar', 'Actualizado a la última versión.')], ['Panel de ventas avanzado', 'Panel', toastBtn('Actualizar', 'Actualizado a la última versión.')]])}`;
const paneTrackCode = () => `<h2>Código de seguimiento</h2><p class="muted">Pega este código antes de la etiqueta de cierre del cuerpo en tu sitio web.</p><pre class="codebox">&lt;script type="text/javascript" id="hs-script-loader" async defer src="//js.hs-scripts.com/5417939.js"&gt;&lt;/script&gt;</pre><p><button class="btn btn--primary" type="button" data-copy="&lt;script src=&quot;//js.hs-scripts.com/5417939.js&quot;&gt;&lt;/script&gt;">Copiar código</button></p>${togglePane('track-code', '', '', [['consent', 'Esperar el consentimiento de cookies', 'No rastrea visitantes hasta que acepten.', true], ['crossdomain', 'Seguimiento entre dominios', 'Reconoce al visitante en todos tus dominios.', false]])}`;
const paneTrackAnalytics = () => `<h2>Analíticas de tráfico</h2><p class="muted">Cómo se clasifican las visitas.</p>${infoList('Fuentes', [['Búsqueda orgánica', 'Google, Bing, DuckDuckGo'], ['Redes sociales', 'LinkedIn, Facebook, Instagram'], ['Referencias', 'Cualquier otro dominio'], ['Tráfico directo', 'Sin referencia']])}<p>${toastBtn('Excluir IP de la oficina', 'Las IP de la oficina se excluirán del tráfico.', 'btn btn--ghost')}</p>`;
const paneTrackDomains = (title = 'Dominios') => `<h2>${title}</h2>${simpleTable(['Dominio', 'Uso', 'Estado'], [['<strong>megaglass.com.mx</strong>', 'Sitio web', '<span class="tag tag--done">Conectado</span>'], ['<strong>info.megaglass.us</strong>', 'Landing pages', '<span class="tag tag--done">Conectado</span>'], ['<strong>mail.megaglass.us</strong>', 'Correo', '<span class="tag tag--done">Verificado</span>']])}<p>${toastBtn('Conectar un dominio', 'Asistente de conexión de dominio (demostración).', 'btn btn--primary')}</p>`;
const paneTrackUtm = () => `<h2>Parámetros UTM</h2><p class="muted">Cómo se atribuyen las campañas.</p>${infoList('Parámetros reconocidos', [['utm_source', 'Fuente'], ['utm_medium', 'Medio'], ['utm_campaign', 'Campaña'], ['utm_content', 'Contenido'], ['utm_term', 'Término']])}`;
function panePrivacy() {
  const p = load('crm:privacy', { consent: true, gdpr: false, cookieBanner: true });
  const row = (k, l, d) => `<label class="srow"><span><strong>${l}</strong><small>${d}</small></span><input type="checkbox" class="switch" data-privacy="${k}" ${p[k] ? 'checked' : ''} /></label>`;
  return `<h2>Privacidad y consentimiento</h2>${row('consent', 'Registrar consentimiento de comunicación', 'Guarda la base legal de cada contacto para enviarle correos.')}${row('gdpr', 'Funciones RGPD', 'Permite eliminar contactos de forma permanente y gestionar solicitudes.')}${row('cookieBanner', 'Aviso de cookies en formularios', 'Muestra el aviso en los formularios incrustados.')}`;
}
const paneAccountSecurity = () => togglePane('account-security', 'Seguridad', 'Políticas de acceso para toda la cuenta.', [['force2fa', 'Exigir autenticación en dos pasos', 'Todos los usuarios deberán activarla.', false], ['sso', 'Inicio de sesión único (SSO)', 'Permite entrar con la identidad de la empresa.', false], ['session', 'Cerrar sesiones inactivas a las 8 horas', 'Protege los equipos compartidos.', true]], infoList('Actividad de seguridad reciente', [['Inicio de sesión', 'Fernando L. · Miami · hoy'], ['Cambio de contraseña', 'Sofía R. · hace 3 días'], ['Nuevo usuario', 'Laura M. · hace 2 semanas']]));
const paneAI = () => togglePane('account-ai', 'IA', 'Funciones del asistente en la cuenta.', [['assistant', 'Asistente activado', 'Resúmenes y redacción en fichas y correos.', true], ['summaries', 'Resúmenes automáticos de registros', 'Genera el resumen al abrir una ficha.', true], ['training', 'Permitir usar mis datos para mejorar sugerencias', 'Solo dentro de esta cuenta.', false]]);
const panePayments = () => `<h2>Cuenta de pagos</h2><p class="muted">Cobra facturas y cotizaciones en línea.</p><div class="plan"><div><span class="muted">Procesador</span><h3>Stripe (no conectado)</h3><p>Conecta tu cuenta para aceptar pagos con tarjeta y transferencia.</p></div>${toastBtn('Conectar Stripe', 'Redirigiendo a Stripe… (demostración)', 'btn btn--primary')}</div>${infoList('Monedas aceptadas', [['Principal', 'EUR'], ['Adicionales', 'USD, MXN']])}`;
function paneBilling() {
  const counts = OBJECTS.map(([k, l]) => `<li>${l}: <strong>${ALL[k]().length}</strong></li>`).join('');
  return `<h2>Cuenta y facturación</h2><div class="plan"><div><span class="muted">Plan actual</span><h3>CRM Suite Professional</h3><p>Renovación el 1 de enero de 2027 · 5 usuarios de pago</p></div>${toastBtn('Cambiar plan', 'Te contactará un asesor para cambiar de plan.', 'btn btn--primary')}</div>
    <h3>Uso</h3><ul class="bullets">${counts}<li>Contactos de marketing: <strong>${ALL.contacts().filter((c) => c.hs_marketable_status === 'Contacto de marketing').length}</strong> de 2.000</li></ul>
    <h3>Historial de facturas</h3>${simpleTable(['Fecha', 'Concepto', 'Importe', ''], ['1 nov 2026', '1 oct 2026', '1 sep 2026'].map((d) => [d, 'Suscripción mensual', formatMoney(890), toastBtn('PDF', 'Descargando factura…', 'link-btn')]))}`;
}

// ---------- panes: data management ----------
const KINDS = { text: 'Texto de una línea', number: 'Número', currency: 'Número (moneda)', percent: 'Número (porcentaje)', date: 'Selector de fecha', datetime: 'Fecha y hora', enum: 'Selección desplegable', bool: 'Casilla de verificación', user: 'Usuario', email: 'Texto (correo)', phone: 'Número de teléfono', url: 'Texto (URL)', id: 'Identificador', stage: 'Etapa', status: 'Estado', priority: 'Prioridad' };
// Propiedades page: object card, tabs, filter chips, sortable paged table (as in the original).
Object.assign(state, { propsTab: 'list', propsKind: '', propsUser: '', propsFilter: '', propsSort: { key: 'label', dir: 1 }, propsPage: 1, propsSize: 10, propsSel: new Set() });
const PROP_SINGULAR = { contacts: 'Contacto', companies: 'Empresa', deals: 'Negocio', tickets: 'Ticket', tasks: 'Tarea' };
const propGroupsStore = (type) => load(`crm:propgroups:${type}`, []);
function propertyRows(type) {
  const records = ALL[type] ? ALL[type]() : [];
  const custom = customProperties(type);
  const customMap = new Map(custom.map((p) => [p.key, p]));
  const used = (k) => records.filter((r) => r[k] !== undefined && r[k] !== null && r[k] !== '').length;
  return propertyList(type).map((p) => {
    const c = customMap.get(p.key);
    const n = used(p.key);
    return { ...p, custom: Boolean(c), creator: c ? 'Fernando Lovera Colin' : 'Omni', used: n, rate: records.length ? Math.round((n / records.length) * 10000) / 100 : 0 };
  });
}
function paneProperties() {
  const type = state.propsObject;
  const sing = PROP_SINGULAR[type];
  const plural = OBJECTS.find((o) => o[0] === type)[1];
  const all = propertyRows(type);
  const archived = customProperties(type).filter((p) => p.archived);
  const groups = [...new Set(all.map((p) => p.group)), ...propGroupsStore(type).filter((g) => !all.some((p) => p.group === g))];
  const kinds = [...new Set(all.map((p) => p.kind))];
  const q = state.propsQuery.trim().toLowerCase();
  let rows = all.filter((p) => (!state.propsGroup || p.group === state.propsGroup) && (!state.propsKind || p.kind === state.propsKind) && (!state.propsUser || (state.propsUser === 'me' ? p.custom : !p.custom)) && (!state.propsFilter || (state.propsFilter === 'used' ? p.used > 0 : state.propsFilter === 'unused' ? p.used === 0 : p.custom)) && (!q || p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)));
  const { key, dir } = state.propsSort;
  rows.sort((a, b) => (typeof a[key] === 'number' ? (a[key] - b[key]) : String(a[key]).localeCompare(String(b[key]), 'es')) * dir);
  const pages = Math.max(1, Math.ceil(rows.length / state.propsSize));
  if (state.propsPage > pages) state.propsPage = pages;
  const page = rows.slice((state.propsPage - 1) * state.propsSize, state.propsPage * state.propsSize);
  const chip = (name, label, current, options) => `<div class="menu"><button class="qchip" type="button" aria-haspopup="true" aria-expanded="false">${esc(current ? (options.find((o) => o[0] === current) || [current, current])[1] : label)} <span class="caret"></span></button><div class="menu__panel"><button class="menu__item${!current ? ' is-current' : ''}" type="button" data-props-set="${name}" data-value="">${label}</button>${options.map(([v, l]) => `<button class="menu__item${current === v ? ' is-current' : ''}" type="button" data-props-set="${name}" data-value="${esc(v)}">${esc(l)}</button>`).join('')}</div></div>`;
  const sortTh = (k, label, cls = '') => `<th class="${cls}"><button class="psort${key === k ? ' is-active' : ''}" type="button" data-props-sort="${k}">${label} <span aria-hidden="true">${key === k ? (dir > 0 ? '↑' : '↓') : '⇅'}</span></button></th>`;
  const tabs = [['list', `Propiedades (${all.length})`], ['logic', 'Lógica condicional'], ['groups', 'Grupos'], ['archived', `Archivado (${archived.length})`]];
  let body = '';
  if (state.propsTab === 'list') {
    const selCount = [...state.propsSel].filter((k) => all.some((p) => p.key === k)).length;
    body = `<div class="pchips">${chip('group', 'Todos los grupos', state.propsGroup, groups.map((g) => [g, g]))}${chip('kind', 'Todos los tipos de campos', state.propsKind, kinds.map((k) => [k, KINDS[k] || k]))}${chip('user', 'Todos los usuarios', state.propsUser, [['me', 'Fernando Lovera Colin'], ['system', 'Omni']])}${chip('filter', 'Todas las propiedades', state.propsFilter, [['used', 'Propiedades en uso'], ['unused', 'Propiedades sin usar'], ['custom', 'Propiedades personalizadas']])}</div>
      <div class="ptoolbar">
        <div class="search search--sm ptoolbar__search"><input type="search" id="props-q" value="${esc(state.propsQuery)}" placeholder="Buscar propiedades" aria-label="Buscar propiedades" /><span class="ico ico--search" aria-hidden="true"></span></div>
        <div class="ptoolbar__right"><span class="muted">🔒 La monitorización de la calidad de los datos está desactivado</span><button class="btn btn--primary" type="button" data-act="new-prop">Crear propiedad</button></div>
      </div>
      ${selCount ? `<div class="pbulk"><strong>${selCount} seleccionada${selCount > 1 ? 's' : ''}</strong><button class="link-btn" type="button" data-act="props-export-sel">Exportar selección</button><button class="link-btn" type="button" data-act="props-archive-sel">Archivar personalizadas</button><button class="link-btn" type="button" data-act="props-clear-sel">Limpiar</button></div>` : ''}
      <table class="mini-table stable proptable"><thead><tr><th class="pcheck"><input type="checkbox" data-props-check-all ${page.length && page.every((p) => state.propsSel.has(p.key)) ? 'checked' : ''} aria-label="Seleccionar todo" /></th>${sortTh('label', 'Nombre')}${sortTh('group', 'Grupo')}${sortTh('creator', 'Creado por')}${sortTh('used', 'Se usa en', 'num')}<th class="num">Tasa de completación</th><th></th></tr></thead><tbody>
        ${page.length ? page.map((p) => `<tr><td class="pcheck"><input type="checkbox" data-props-check="${esc(p.key)}" ${state.propsSel.has(p.key) ? 'checked' : ''} aria-label="Seleccionar ${esc(p.label)}" /></td><td><button class="olink" type="button" data-prop-${p.custom ? 'edit' : 'view'}="${esc(p.key)}">${esc(p.label)}</button><br /><span class="muted">${esc(KINDS[p.kind] || p.kind)}${p.system ? ' · Solo lectura (la rellena el sistema)' : ''}</span></td><td>${esc(p.group)}</td><td>${esc(p.creator)}</td><td class="num">${p.used ? `<a class="plink" href="../${type}/">${p.used}</a>` : '0'}</td><td class="num">${p.rate.toLocaleString('es-ES', { minimumFractionDigits: p.rate % 1 ? 2 : 0, maximumFractionDigits: 2 })}%</td><td class="num"><div class="menu"><button class="icon-btn icon-btn--sm rowact" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Acciones">⋮</button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-prop-view="${esc(p.key)}">Ver detalles</button>${p.custom ? `<button class="menu__item" type="button" data-prop-edit="${esc(p.key)}">Editar</button><button class="menu__item" type="button" data-prop-archive="${esc(p.key)}">Archivar</button><button class="menu__item menu__item--danger" type="button" data-prop-rm="${esc(p.key)}">Eliminar</button>` : `<button class="menu__item" type="button" data-copy="${esc(p.key)}">Copiar nombre interno</button>`}</div></div></td></tr>`).join('') : '<tr><td colspan="7" class="muted">No hay propiedades que coincidan.</td></tr>'}
      </tbody></table>
      <div class="ppager">
        <span></span>
        <nav class="ppager__nav" aria-label="Páginas"><button class="link-btn" type="button" data-props-page="${state.propsPage - 1}" ${state.propsPage <= 1 ? 'disabled' : ''}>‹ Anterior</button>${Array.from({ length: pages }, (_, i) => i + 1).filter((n) => pages <= 12 || n <= 10 || n === pages || Math.abs(n - state.propsPage) < 2).map((n, i, arr) => `${i && arr[i - 1] !== n - 1 ? '<span class="muted">…</span>' : ''}<button class="ppager__num${n === state.propsPage ? ' is-active' : ''}" type="button" data-props-page="${n}">${n}</button>`).join('')}<button class="link-btn" type="button" data-props-page="${state.propsPage + 1}" ${state.propsPage >= pages ? 'disabled' : ''}>Siguiente ›</button></nav>
        <div class="menu"><button class="qchip" type="button" aria-haspopup="true" aria-expanded="false">${state.propsSize} por página <span class="caret"></span></button><div class="menu__panel menu__panel--right">${[10, 25, 50, 100].map((n) => `<button class="menu__item${state.propsSize === n ? ' is-current' : ''}" type="button" data-props-size="${n}">${n} por página</button>`).join('')}</div></div>
      </div>`;
  } else if (state.propsTab === 'logic') {
    const rules = type === 'deals' ? dealPipelineDefs().flatMap((p) => Object.entries(p.logic || {}).filter(([, l]) => l.props && l.props.length).map(([k, l]) => ({ pipe: p.name, stage: labelOfStage(p, k), props: l.props }))) : [];
    body = `<div class="shead"><div><h3>Lógica condicional</h3><p class="muted">Muestra o exige propiedades según el valor de otra. Las reglas de las etapas de negocio se crean desde Objetos › Negocios › Pipelines.</p></div>${type === 'deals' ? '<a class="btn btn--primary" href="#obj-deals:pipelines">Crear regla de lógica</a>' : toastBtn('Crear regla de lógica', 'La lógica condicional para este objeto estará disponible próximamente.', 'btn btn--primary')}</div>
      ${rules.length ? simpleTable(['Propiedad de control', 'Valor', 'Propiedades dependientes', 'Pipeline'], rules.map((r) => ['Etapa del negocio', esc(r.stage), r.props.map((x) => `${esc(x.name)}${x.required ? ' <em class="req">*</em>' : ''}`).join(', '), esc(r.pipe)])) : '<p class="pempty">Todavía no hay reglas de lógica condicional para este objeto.</p>'}`;
  } else if (state.propsTab === 'groups') {
    const counts = Object.fromEntries(groups.map((g) => [g, all.filter((p) => p.group === g).length]));
    body = `<div class="shead"><div><h3>Grupos de propiedades</h3><p class="muted">Los grupos ordenan las propiedades en las fichas y en el editor de columnas.</p></div><button class="btn btn--primary" type="button" data-act="new-propgroup">Crear grupo</button></div>
      ${simpleTable(['Nombre del grupo', 'Propiedades', 'Creado por', ''], groups.map((g) => [`<strong>${esc(g)}</strong>`, String(counts[g] || 0), propGroupsStore(type).includes(g) ? 'Fernando Lovera Colin' : 'Omni', propGroupsStore(type).includes(g) ? `<button class="link-btn" type="button" data-propgroup-rm="${esc(g)}" ${counts[g] ? 'disabled title="Tiene propiedades"' : ''}>Eliminar</button> <button class="link-btn" type="button" data-props-set="group" data-value="${esc(g)}" data-goto-list>Ver propiedades</button>` : `<button class="link-btn" type="button" data-props-set="group" data-value="${esc(g)}" data-goto-list>Ver propiedades</button>`]))}`;
  } else {
    body = `<h3>Propiedades archivadas</h3><p class="muted">Las propiedades archivadas dejan de verse en las fichas y listas. Se eliminan definitivamente a los 90 días.</p>
      ${archived.length ? simpleTable(['Nombre', 'Tipo', 'Grupo', ''], archived.map((p) => [`<strong>${esc(p.label)}</strong>`, esc(KINDS[p.kind] || p.kind), esc(p.group), `<button class="link-btn" type="button" data-prop-restore="${esc(p.key)}">Restaurar</button> <button class="link-btn" type="button" data-prop-rm="${esc(p.key)}">Eliminar</button>`])) : '<p class="pempty">No hay propiedades archivadas.</p>'}`;
  }
  return `<div class="shead"><h2>Propiedades</h2><div class="phead__actions">${toastBtn('✦ Agente de datos', 'El agente de datos revisa tus propiedades y sugiere limpiezas.', 'link-btn')}${toastBtn('🔒 Calidad de los datos', 'La monitorización de la calidad de los datos no está incluida en tu plan.', 'link-btn')}<button class="btn btn--ghost" type="button" data-act="props-export">Exportar propiedades</button></div></div>
    <p class="odesc">Las propiedades se usan para reunir y almacenar información acerca de tus registros en Omni. Por ejemplo, un contacto podría tener propiedades como Nombre o Estado del lead.</p>
    <div class="objsel objsel--props"><strong>Selecciona un objeto:</strong><span class="objsel__pick"><select class="ginput" data-props-object aria-label="Objeto">${OBJECTS.map(([k, l]) => `<option value="${k}" ${type === k ? 'selected' : ''}>Propiedades de ${PROP_SINGULAR[k]}</option>`).join('')}</select></span><a class="objsel__link" href="#obj-${type}">Ir a la configuración de ${plural}</a></div>
    <div class="otabs"><div class="otabs__tabs">${tabs.map(([k, l]) => `<button type="button" class="${state.propsTab === k ? 'is-active' : ''}" data-props-tab="${k}">${l}</button>`).join('')}</div></div>
    <div class="obody">${body}</div>`;
}
function objectPipelineHtml(type) {
  if (type === 'deals') return dealPipelinesHtml();
  if (type === 'tickets') {
    const ov = load(PIPELINE_KEY('tickets'), {});
    const pipes = ticketPipelines();
    const counts = Object.fromEntries(pipes.map((p) => [p, ALL.tickets().filter((t) => t.pipeline === p).length]));
    return `<h3>Pipelines de tickets</h3><p class="muted">Cada ticket pertenece a un pipeline; en la lista de Tickets se eligen con el selector de pipelines.</p>
    ${simpleTable(['Pipeline', 'Tickets', ''], pipes.map((p, i) => [`<strong>${esc(p)}</strong>`, String(counts[p] || 0), pipes.length > 1 ? `<button class="link-btn" type="button" data-ticketpipe-rm="${i}" ${counts[p] ? 'disabled title="Tiene tickets"' : ''}>Eliminar</button>` : '']))}
    <form class="sform" data-save="ticketpipeline"><div class="sform__row"><label class="field"><span>Nuevo pipeline</span><input name="name" required maxlength="60" placeholder="Por ejemplo: Cotizaciones Kafer" /></label></div><div class="sform__btns"><button class="btn btn--primary" type="submit">Crear pipeline</button></div></form>
    <h3>Estados de los tickets (compartidos por todos los pipelines)</h3>${simpleTable(['Estado', 'Nombre'], TICKET_STATUSES.map(([k, l]) => [`<span class="muted">${k}</span>`, `<input class="cellpop__input cellpop__input--sm" data-stage-label="${k}" value="${esc((ov[k] && ov[k].label) || l)}" />`]))}<div class="sform__btns"><button class="btn btn--primary" type="button" data-act="save-pipeline" data-type="tickets">Guardar pipeline</button><button class="btn btn--ghost" type="button" data-act="reset-pipeline" data-type="tickets">Restablecer</button></div>`;
  }
  return '<p class="muted">Este objeto no usa pipelines. Los ciclos de vida se gestionan en la propiedad "Etapa del ciclo de vida".</p>';
}
// ---------- Deal pipelines: overview table, labels, per-pipeline stage editor ----------
Object.assign(state, { pipeTab: 'overview', pipeEdit: null, pipeQuery: '' });
const STAGE_COLORS = [['none', 'Texto (sin color)'], ['dot', '<span class="pdot" aria-hidden="true"></span> Texto con punto de color'], ['badge', '<span class="pbadge">Texto en insignia de color</span>']];
function labelsHtml() {
  const labels = assocLabels();
  return `<h3>Etiquetas de Negocio</h3><p class="muted">Describen la relación de un negocio con sus contactos y empresas (por ejemplo, "Responsable de la decisión").</p><ul class="chips-list">${labels.map((l, i) => `<li><span class="chip">${esc(l)} ${i > 1 ? `<button class="chip__x" type="button" data-label-rm="${i}" aria-label="Quitar">×</button>` : ''}</span></li>`).join('')}</ul><form class="sform sform--inline" data-save="label"><input class="cellpop__input cellpop__input--sm" name="label" placeholder="Nueva etiqueta" required /><button class="btn btn--primary" type="submit">Añadir</button></form>`;
}
function dealPipelinesHtml() {
  const defs = dealPipelineDefs();
  const deals = ALL.deals();
  if (state.pipeEdit !== null) return pipelineEditorHtml(defs, deals);
  const sub = `<div class="ptabs">${[['overview', 'Vista general'], ['labels', 'Etiquetas de Negocio']].map(([k, l]) => `<button type="button" class="${state.pipeTab === k ? 'is-active' : ''}" data-pipe-tab="${k}">${l}</button>`).join('')}</div>`;
  if (state.pipeTab === 'labels') return sub + labelsHtml();
  const s = objSetting('deals');
  const q = state.pipeQuery.trim().toLowerCase();
  const rows = defs.map((p, i) => ({ p, i })).filter(({ p }) => !q || p.name.toLowerCase().includes(q));
  const calc = defs.reduce((n, p) => n + p.stages.length * 4, 0);
  const inPipe = (p) => deals.filter((d) => d.pipeline === p.name).length;
  return `${sub}
    <div class="ofield"><strong>Definir los colores de visualización del pipeline <span class="info">ⓘ</span></strong>
      <div class="pcolors">${STAGE_COLORS.map(([k, l]) => `<button type="button" class="pcolor${(s.stageColor || 'none') === k ? ' is-active' : ''}" data-stage-color="${k}">${l}</button>`).join('')}</div></div>
    <div class="ofield"><strong>Propiedades calculadas de etapa <span class="info">ⓘ</span></strong><div class="pcalc">${calc.toLocaleString('es-ES')}/4.500 habilitados</div></div>
    <div class="ptoolbar">
      <div class="search search--sm ptoolbar__search"><input type="search" id="pipe-q" placeholder="Buscar pipelines" aria-label="Buscar pipelines" value="${esc(state.pipeQuery)}" /><span class="ico ico--search" aria-hidden="true"></span></div>
      <div class="ptoolbar__right"><span>${defs.length} pipelines de objetos del tipo negocio | <strong class="plink">${100 - defs.length} pipelines restantes</strong></span>
        <div class="menu"><button class="btn btn--primary" type="button" aria-haspopup="true" aria-expanded="false">Crear pipeline <span class="caret"></span></button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-act="new-pipeline">Crear desde cero</button><button class="menu__item" type="button" data-act="clone-pipeline">Clonar</button></div></div></div>
    </div>
    <table class="mini-table stable ptable"><thead><tr><th></th><th>Pipeline <span class="muted">⇅</span></th><th>Descripción del pipeline</th><th class="num">Propiedades calculadas de etapa <span class="info">ⓘ</span></th><th class="num">Etiquetas de negocios</th><th class="num">Reglas del pipeline <span class="info">ⓘ</span></th><th class="num">Número de etapas</th><th class="num">Negocios</th><th class="num">ID interno</th><th class="num">Acciones</th></tr></thead><tbody data-dnd="pipes">
      ${rows.length ? rows.map(({ p, i }) => { const acc = p.access || { mode: 'all' }; return `<tr data-row="${i}"><td class="phandle" title="Arrastra para cambiar el orden" aria-hidden="true">⋮⋮</td><td><button class="olink" type="button" data-pipe-edit="${i}">${esc(p.name)}</button>${i === 0 ? ' <span class="tag tag--new">Predeterminado</span>' : ''}${acc.mode === 'private' ? ' <span class="tag tag--none" title="Privado para ti">🔒 Privado</span>' : acc.mode === 'teams' || acc.mode === 'select' ? ` <span class="tag tag--none" title="Acceso restringido a ${esc([...(acc.teams || []), ...(acc.users || [])].join(', '))}">🔒 ${(acc.teams || []).length + (acc.users || []).length}</span>` : ''}</td><td class="pdesccell"><span class="muted">${p.desc ? esc(p.desc) : '--'}</span><button class="icon-btn icon-btn--round icon-btn--sm rowact" type="button" data-pipe-desc="${i}" aria-label="Editar descripción">✎</button></td><td class="num">${p.stages.length * 4}</td><td class="num">${labelsOf(p).length}</td><td class="num">${rulesCount(p)}</td><td class="num">${p.stages.length}</td><td class="num">${inPipe(p)}</td><td class="num muted pidcell">${p.id}<button class="icon-btn icon-btn--sm rowact" type="button" data-copy="${p.id}" aria-label="Copiar ID">⧉</button></td><td class="num"><div class="menu"><button class="icon-btn icon-btn--sm" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Acciones del pipeline">⋮</button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-pipe-access="${i}">Gestionar acceso</button><button class="menu__item" type="button" data-pipe-clone="${i}">Clonar</button><button class="menu__item menu__item--danger" type="button" data-pipe-rm="${i}" ${defs.length < 2 ? 'disabled' : ''}>Eliminar</button></div></div></td></tr>`; }).join('') : '<tr><td colspan="10" class="muted">No hay pipelines que coincidan con la búsqueda.</td></tr>'}
    </tbody></table>`;
}
// Rules a pipeline can enforce on its deals (checked by the deals board when a card is dragged).
const PIPE_RULES = [
  ['firstStage', 'Restringir la creación de negocios a la primera etapa', 'Los negocios nuevos de este pipeline empiezan siempre en la primera etapa.'],
  ['noSkip', 'Limitar los saltos de etapa', 'Un negocio solo puede avanzar a la etapa siguiente (o cerrarse como perdido).'],
  ['noBack', 'Impedir retroceder de etapa', 'Un negocio no puede volver a una etapa anterior.'],
  ['lockClosed', 'Restringir la edición de negocios cerrados', 'Los negocios ganados o perdidos no se pueden mover a otra etapa.'],
  ['requireAmount', 'Exigir un importe para cerrar como ganado', 'No se puede marcar un negocio como ganado sin importe.'],
];
const PIPE_AUTOS = [['task', 'Crear una tarea de seguimiento para el propietario'], ['notify', 'Enviar una notificación al propietario'], ['closeDate', 'Actualizar la fecha de cierre a hoy']];
const rulesCount = (p) => Object.values(p.rules || {}).filter(Boolean).length;
const labelOfStage = (p, k) => (p.stages.find((s) => s[0] === k) || [k, k])[1];
// Conditional property logic per stage: closed stages ship with one built-in rule.
const logicCount = (p, k) => ((p.logic && p.logic[k] && p.logic[k].props && p.logic[k].props.length) ? 1 : 0) + (k === 'won' || k === 'lost' ? 1 : 0);
const LOGIC_PROPS = ['Etapa del negocio', 'Pipeline', 'Importe', 'Prioridad', 'Tipo de negocio', 'Propietario del negocio'];
const LOGIC_OPS = ['es igual a', 'no es igual a', 'está definido', 'no está definido'];
const stageValue = (p, k) => (p && p.lifecycle ? labelOfStage(p, k) : `${labelOfStage(p, k)} (${p.name})`);
function defaultLogic(p, k) {
  if (k === 'won') return { groups: [{ conditions: [{ prop: 'Etapa del negocio', op: 'es igual a', value: stageValue(p, k) }] }], props: [{ name: 'Motivo de cierre ganado', required: true }], builtin: true };
  if (k === 'lost') return { groups: [{ conditions: [{ prop: 'Etapa del negocio', op: 'es igual a', value: stageValue(p, k) }] }], props: [{ name: 'Motivo de cierre perdido', required: true }], builtin: true };
  return { groups: [{ conditions: [{ prop: stageProp(p), op: 'es igual a', value: stageValue(p, k) }] }], props: [] };
}
// The logic editor works either on a deal pipeline (state.pipeEdit) or on the shared lifecycle definition.
const stageProp = (p) => (p && p.lifecycle ? 'Etapa del ciclo de vida' : 'Etapa del negocio');
const logicProps = (p) => (p && p.lifecycle ? ['Etapa del ciclo de vida', 'Estado del lead', 'Propietario', 'Fuente original', 'País/región'] : LOGIC_PROPS);
function logicTarget() {
  if (state.logicEdit && state.logicEdit.lifecycle) {
    const p = lifecycleDef();
    return { p, defs: [], persist: (msg) => { saveLifecycleDef(p); if (msg) toast(msg); } };
  }
  const defs = dealPipelineDefs();
  return { p: defs[state.pipeEdit], defs, persist: (msg) => persistPipelines(defs, msg) };
}
function logicHtml() {
  const { stage, draft, preview, adding, addingProp, lifecycle, objectType } = state.logicEdit;
  const { p, defs } = logicTarget();
  const pv = preview || stage;
  const SP = stageProp(p);
  // A group is true for the previewed stage when all its stage conditions match (other properties count as true).
  const groupTrue = (g) => g.conditions.every((c) => (c.prop !== SP ? true : c.op === 'es igual a' ? c.value === stageValue(p, pv) : c.op === 'no es igual a' ? c.value !== stageValue(p, pv) : true));
  const show = draft.groups.some(groupTrue) ? draft.props : [];
  const propType = lifecycle ? objectType || 'contacts' : 'deals';
  const available = propertyList(propType).map((x) => x.label).filter((l) => !draft.props.some((x) => x.name === l)).slice(0, 80);
  const condEditor = (gi) => `<div class="lcond lcond--edit" data-gi="${gi}">
      <select class="ginput ginput--sm" data-cond-prop>${logicProps(p).map((x) => `<option ${adding.prop === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select class="ginput ginput--sm" data-cond-op>${LOGIC_OPS.map((x) => `<option ${adding.op === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      ${adding.prop === SP ? `<select class="ginput ginput--sm" data-cond-value>${p.stages.map(([k]) => `<option ${adding.value === stageValue(p, k) ? 'selected' : ''}>${esc(stageValue(p, k))}</option>`).join('')}</select>` : adding.prop === 'Pipeline' ? `<select class="ginput ginput--sm" data-cond-value>${defs.map((d) => `<option ${adding.value === d.name ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : `<input class="ginput ginput--sm" data-cond-value value="${esc(adding.value || '')}" placeholder="Valor" ${adding.op.includes('definido') ? 'disabled' : ''} />`}
      <button class="btn btn--primary btn--sm" type="button" data-logic-cond-apply="${gi}">Aplicar</button><button class="btn btn--ghost btn--sm" type="button" data-logic-cond-cancel>Cancelar</button>
    </div>`;
  return `<div class="logic" role="dialog" aria-modal="true" aria-labelledby="logic-title">
    <header class="logic__head"><div><h2 id="logic-title">Editar lógica de propiedad</h2><span class="muted">${lifecycle ? esc(OBJ_META[propType].s) : 'Negocio'} · ${esc(labelOfStage(p, stage))}</span></div><div class="logic__btns"><button class="btn btn--ghost" type="button" data-logic-save>Guardar</button><button class="icon-btn icon-btn--round" type="button" data-logic-close aria-label="Cerrar">×</button></div></header>
    <div class="logic__body">
      <section class="logic__left">
        <p>La lógica de propiedades te permite mostrar y solicitar propiedades basadas en el valor de otra propiedad.</p>
        <h3>Establecer condiciones</h3><p class="muted">Las propiedades dependientes aparecen cuando cualquier grupo es verdadero.</p>
        ${draft.groups.map((g, gi) => `<div class="lgroup"><div class="lgroup__head"><strong>Grupo ${gi + 1}</strong><span><button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-logic-group-copy="${gi}" aria-label="Duplicar grupo">⧉</button><button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-logic-group-rm="${gi}" aria-label="Eliminar grupo" ${draft.groups.length < 2 ? 'disabled' : ''}>🗑</button></span></div>
          ${g.conditions.map((c, ci) => `<div class="lcond"><span><strong>${esc(c.prop)}</strong> ${esc(c.op)}${c.op.includes('definido') ? '' : `: <strong>"${esc(c.value)}"</strong>`}</span><button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-logic-cond-rm="${gi}:${ci}" aria-label="Quitar condición">×</button></div>`).join('')}
          ${adding && adding.gi === gi ? condEditor(gi) : `<button class="pill pill--sm" type="button" data-logic-cond-add="${gi}">+ Agregar condición</button>`}
        </div>`).join('')}
        <button class="pill pill--sm" type="button" data-logic-group-add>+ Agregar grupo</button>
        <h3>Muestra estas propiedades (${draft.props.length})</h3><p class="muted">Elige qué propiedades aparecen y si son obligatorias.</p>
        ${draft.props.map((x, i) => `<div class="lprop"><strong>${esc(x.name)}</strong><label class="lprop__req"><input type="checkbox" data-logic-prop-req="${i}" ${x.required ? 'checked' : ''} /> Obligatoria</label><button class="icon-btn icon-btn--round icon-btn--sm" type="button" data-logic-prop-rm="${i}" aria-label="Quitar propiedad">×</button></div>`).join('')}
        ${addingProp ? `<div class="lcond lcond--edit"><select class="ginput ginput--sm" data-prop-pick>${available.map((l) => `<option>${esc(l)}</option>`).join('')}</select><label class="lprop__req"><input type="checkbox" data-prop-pick-req /> Obligatoria</label><button class="btn btn--primary btn--sm" type="button" data-logic-prop-apply>Agregar</button><button class="btn btn--ghost btn--sm" type="button" data-logic-prop-cancel>Cancelar</button></div>` : `<button class="pill pill--sm" type="button" data-logic-prop-add>+ Agregar propiedad</button>`}
      </section>
      <section class="logic__right">
        <h3>Vista previa</h3><p class="muted">Cambia el valor de abajo para probar cómo se comporta tu lógica en un registro.</p>
        <label class="gfield"><span>${SP}</span><select class="ginput ginput--md" data-logic-preview>${p.stages.map(([k]) => `<option value="${k}" ${pv === k ? 'selected' : ''}>${esc(stageValue(p, k))}</option>`).join('')}</select></label>
        <div class="lpreview">${show.length ? `<p class="muted">Propiedades que se piden en esta etapa:</p>${show.map((x) => `<label class="gfield lpreview__field"><span>${esc(x.name)}${x.required ? ' <em class="req">*</em>' : ''}</span><input class="ginput" placeholder="${x.required ? 'Obligatoria' : 'Opcional'}" /></label>`).join('')}` : '<p class="lpreview__empty">No existen propiedades dependientes para esta opción</p>'}</div>
      </section>
    </div>
  </div>`;
}
function openLogic(k, lifecycle = false, objectType = 'contacts') {
  const p = lifecycle ? lifecycleDef() : dealPipelineDefs()[state.pipeEdit];
  const saved = p.logic && p.logic[k];
  state.logicEdit = { stage: k, lifecycle, objectType, draft: JSON.parse(JSON.stringify(saved || defaultLogic(p, k))), preview: k, adding: null, addingProp: false };
}
const labelsOf = (p) => (Array.isArray(p.labelList) ? p.labelList : assocLabels().slice(2, 2 + (p.labels || 0)));
const PROBS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
function pipelineEditorHtml(defs, deals) {
  const p = defs[state.pipeEdit];
  if (!p) { state.pipeEdit = null; return dealPipelinesHtml(); }
  const sub = state.pipeSub || 'configure';
  const count = (k) => deals.filter((d) => d.pipeline === p.name && d.stage === k).length;
  const tabs = [['configure', 'Configurar'], ['rules', 'Reglas del pipeline'], ['automate', 'Automatizar'], ['labels', 'Etiquetas de Negocio']];
  let body = '';
  if (sub === 'configure') {
    body = `<form class="peditor" data-save="pipeline" data-pipe="${state.pipeEdit}">
      <div class="pdesc"><strong>Descripción del pipeline</strong><div>${p.desc ? esc(p.desc) : '--'} <button type="button" class="icon-btn icon-btn--round icon-btn--sm" data-act="pipe-desc" aria-label="Editar descripción">✎</button></div></div>
      <div class="pdesc"><strong>Propiedades calculadas de etapa <span class="info">ⓘ</span></strong><div>${p.stages.length * 4} habilitado(s)</div></div>
      <table class="mini-table stable ptable ptable--stages"><thead><tr><th>Nombre de la etapa</th><th>Descripción de la etapa</th><th>Probabilidad</th><th>Se usa en</th><th>Reglas de lógica condicional <span class="info">ⓘ</span></th><th><span class="plink">Reglas del pipeline <span class="info">ⓘ</span></span></th><th></th></tr></thead><tbody data-dnd="stages">
        ${p.stages.map(([k, l, prob, desc], i) => {
          const closed = k === 'won' || k === 'lost';
          const opts = closed ? `<option value="${prob}">${k === 'won' ? 'Ganados (100%)' : 'Perdidos (0%)'}</option>` : [...new Set([...PROBS, Number(prob)])].sort((a, b) => a - b).map((v) => `<option value="${v}" ${Number(prob) === v ? 'selected' : ''}>${v}%</option>`).join('');
          const ruleHits = (p.rules && p.rules.lockClosed && closed ? 1 : 0) + (p.rules && p.rules.firstStage && i === 0 ? 1 : 0) + (p.rules && p.rules.requireAmount && k === 'won' ? 1 : 0);
          return `<tr data-row="${i}"><td class="pstagecell"><span class="phandle" title="Arrastra para cambiar el orden" aria-hidden="true">⋮⋮</span><span class="pmoves"><button type="button" class="icon-btn icon-btn--sm" data-stage-move="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button type="button" class="icon-btn icon-btn--sm" data-stage-move="1" data-i="${i}" ${i === p.stages.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button></span><input class="cellpop__input cellpop__input--sm pstage" data-stage-label="${k}" value="${esc(l)}" required /></td><td><input class="cellpop__input cellpop__input--sm" data-stage-desc="${k}" value="${esc(desc || '')}" placeholder="--" /></td><td><select class="ginput ginput--sm pprob" data-stage-prob="${k}" ${closed ? 'disabled' : ''}>${opts}</select></td><td><a class="plink" href="../deals/">${count(k).toLocaleString('es-ES')}</a></td><td>${logicCount(p, k) ? `<button type="button" class="link-btn plogic" data-logic-edit="${k}">${logicCount(p, k)} regla${logicCount(p, k) > 1 ? 's' : ''} de lógica</button>` : `<span class="muted rowdash">--</span><button type="button" class="pill pill--sm rowact" data-logic-edit="${k}">Agregar regla</button>`}</td><td>${ruleHits ? `<span class="muted">${ruleHits} regla${ruleHits > 1 ? 's' : ''}</span>` : '<span class="muted rowdash">--</span>'}<button type="button" class="pill pill--sm rowact" data-pipe-sub="rules">Editar</button></td><td>${closed ? '' : `<button type="button" class="link-btn" data-stage-rm="${k}" ${count(k) ? 'disabled title="Tiene negocios"' : ''}>Eliminar</button>`}</td></tr>`;
        }).join('')}
      </tbody></table>
      <p><button type="button" class="link-btn" data-act="stage-add">+ Agregar etapa</button></p>
      <div class="sform__btns gsave"><button class="btn btn--primary" type="submit">Guardar</button><button class="btn btn--ghost" type="button" data-act="pipe-back">Cancelar</button></div>
    </form>`;
  } else if (sub === 'rules') {
    const r = p.rules || {};
    body = `<h3>Reglas del pipeline</h3><p class="muted">Las reglas se aplican al mover negocios de este pipeline en la lista y en el tablero. Reglas activas: <strong>${rulesCount(p)}</strong>.</p>
      ${PIPE_RULES.map(([k, l, d]) => `<label class="ocheck"><input type="checkbox" data-pipe-rule="${k}" ${r[k] ? 'checked' : ''} /><span><strong>${l}</strong><small>${d}</small></span></label>`).join('')}
      <h3>Propiedades obligatorias por etapa</h3><p class="muted">Pide información al entrar en una etapa. Los negocios que no la tengan no podrán moverse a ella.</p>
      ${simpleTable(['Etapa', 'Propiedades obligatorias', ''], p.stages.map(([k, l]) => [esc(l), (p.required && p.required[k] && p.required[k].length) ? p.required[k].map((x) => `<span class="chip">${esc(x)}</span>`).join(' ') : '<span class="muted">Ninguna</span>', `<button class="link-btn" type="button" data-act="pipe-required" data-stage="${k}">Editar</button>`]))}`;
  } else if (sub === 'automate') {
    const a = p.automation || {};
    body = `<h3>Automatizar</h3><p class="muted">Elige qué ocurre cuando un negocio entra en cada etapa de este pipeline. Se ejecuta al mover la tarjeta en el tablero o al cambiar la etapa.</p>
      <div class="pautos">${p.stages.map(([k, l]) => { const s = a[k] || {}; const n = Object.values(s).filter(Boolean).length; return `<div class="pauto"><div class="pauto__head"><strong>Cuando un negocio entra en «${esc(l)}»</strong><span class="muted">${n ? `${n} acción${n > 1 ? 'es' : ''}` : 'Sin acciones'}</span></div>${PIPE_AUTOS.map(([ak, al]) => `<label class="ocheck ocheck--sm"><input type="checkbox" data-pipe-auto="${ak}" data-stage="${k}" ${s[ak] ? 'checked' : ''} /><span>${al}</span></label>`).join('')}</div>`; }).join('')}</div>`;
  } else {
    const labels = labelsOf(p);
    body = `<h3>Etiquetas de Negocio</h3><p class="muted">Etiquetas disponibles para los negocios de «${esc(p.name)}». Se añaden a las etiquetas generales de la cuenta.</p>
      <ul class="chips-list">${labels.length ? labels.map((l, i) => `<li><span class="chip">${esc(l)} <button class="chip__x" type="button" data-pipelabel-rm="${i}" aria-label="Quitar">×</button></span></li>`).join('') : '<li class="muted">Este pipeline aún no tiene etiquetas propias.</li>'}</ul>
      <form class="sform sform--inline" data-save="pipelabel"><input class="cellpop__input cellpop__input--sm" name="label" placeholder="Nueva etiqueta" required /><button class="btn btn--primary" type="submit">Añadir</button></form>`;
  }
  return `<h2>Administrar ${esc(p.name)}</h2>
    <div class="pmanage">
      <div class="pmanage__top">
        <select class="ginput ginput--md pmanage__select" data-pipe-select aria-label="Pipeline">${defs.map((d, i) => `<option value="${i}" ${i === state.pipeEdit ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
        <div class="menu"><button class="btn btn--ghost" type="button" aria-haspopup="true" aria-expanded="false">Acciones <span class="caret"></span></button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-act="pipe-rename">Cambiar nombre</button><button class="menu__item" type="button" data-pipe-clone="${state.pipeEdit}">Clonar pipeline</button><button class="menu__item" type="button" data-pipe-default="${state.pipeEdit}" ${state.pipeEdit === 0 ? 'disabled' : ''}>Establecer como predeterminado</button><a class="menu__item" href="../deals/">Ver negocios</a><button class="menu__item" type="button" data-pipe-rm="${state.pipeEdit}" ${defs.length < 2 ? 'disabled' : ''}>Eliminar pipeline</button><button class="menu__item" type="button" data-act="pipe-back">Volver a pipelines</button></div></div>
      </div>
      <p class="pmanage__link"><button class="olink" type="button" data-act="board-header">Configura encabezado/pie de página del tablero</button><br /><span class="muted">Configura la vista predeterminada para el encabezado/pie de página del negocio que se mostrará para todos los usuarios.</span></p>
      <div class="ptabs ptabs--sub">${tabs.map(([k, l]) => `<button type="button" class="${sub === k ? 'is-active' : ''}" data-pipe-sub="${k}">${l}</button>`).join('')}</div>
      ${body}
    </div>`;
}
// Reads the editor's inputs into the pipeline definition (so reordering/adding keeps unsaved edits).
function collectPipeline(p) {
  const form = root.querySelector('form[data-save="pipeline"]');
  if (!form || !p) return p;
  if (form.elements.name) p.name = form.elements.name.value.trim() || p.name;
  if (form.elements.desc) p.desc = form.elements.desc.value.trim();
  p.stages.forEach((s) => {
    const l = form.querySelector(`[data-stage-label="${s[0]}"]`);
    const pr = form.querySelector(`[data-stage-prob="${s[0]}"]`);
    const d = form.querySelector(`[data-stage-desc="${s[0]}"]`);
    if (l && l.value.trim()) s[1] = l.value.trim();
    if (pr && !pr.disabled) s[2] = Math.max(0, Math.min(100, Number(pr.value) || 0));
    if (d) s[3] = d.value.trim();
  });
  return p;
}
// "Crear pipeline" side panel: from scratch (name only, default stages) or cloning an existing one.
// After creating, the new pipeline opens in its "Administrar" page so its stages can be edited.
function openPipelinePanel(mode) {
  const defs = dealPipelineDefs();
  const MAX = 60;
  const isClone = mode === 'clone';
  const srcDefault = defs[state.pipeEdit !== null ? state.pipeEdit : 0];
  const body = `<form id="cp-form" class="cp">
      ${isClone ? `<p class="cp__intro">Se copiarán las etapas, sus probabilidades y, si lo marcas, las reglas y automatizaciones del pipeline elegido. Los negocios no se copian.</p>
      <label class="gfield"><span>Pipeline que se va a clonar</span><select class="ginput" name="src">${defs.map((p) => `<option ${p === srcDefault ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : '<p class="cp__intro">El pipeline nuevo empieza con las etapas predeterminadas de negocios; podrás cambiarlas, añadir más o reordenarlas en el siguiente paso.</p>'}
      <label class="gfield"><span>Nombre del pipeline <em class="req">*</em></span><input class="ginput" name="name" maxlength="${MAX}" autocomplete="off" value="${isClone ? esc(`${srcDefault.name} (copia)`) : ''}" placeholder="Por ejemplo: Ventas nacionales" /><small class="cp__count"><span id="cp-count">${isClone ? `${srcDefault.name} (copia)`.length : 0}</span>/${MAX}</small><small class="cp__error" id="cp-error" hidden>Ya existe un pipeline con ese nombre.</small></label>
      ${isClone ? '<label class="ocheck"><input type="checkbox" name="rules" checked /><span><strong>Incluir reglas y automatizaciones</strong><small>Reglas del pipeline, lógica condicional de las etapas y acciones automáticas.</small></span></label>' : `<div class="cp__stages"><strong>Etapas iniciales</strong><ol>${DEAL_STAGES.map(([, l, p]) => `<li>${esc(l)} <span class="muted">${p}%</span></li>`).join('')}</ol></div>`}
      <p class="muted cp__note">Solo los superadministradores y los usuarios con permiso para editar la configuración de la propiedad podrán modificar este pipeline.</p>
    </form>`;
  openModal(isClone ? 'Clonar pipeline' : 'Crear pipeline', body, `<button class="btn btn--primary" type="submit" form="cp-form" id="cp-save" disabled>${isClone ? 'Clonar' : 'Crear'}</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  const form = document.getElementById('cp-form');
  const nameInput = form.elements.name;
  const validate = () => {
    const name = nameInput.value.trim();
    const dup = defs.some((p) => p.name.toLowerCase() === name.toLowerCase());
    document.getElementById('cp-count').textContent = nameInput.value.length;
    document.getElementById('cp-error').hidden = !dup;
    document.getElementById('cp-save').disabled = !name || dup;
  };
  nameInput.addEventListener('input', validate);
  if (isClone) form.elements.src.addEventListener('change', () => { nameInput.value = `${form.elements.src.value} (copia)`; validate(); });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = nameInput.value.trim();
    if (!name || defs.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    let created;
    if (isClone) {
      const src = defs.find((p) => p.name === form.elements.src.value) || defs[0];
      created = newPipelineDef(name, src.stages);
      created.desc = src.desc || '';
      if (form.elements.rules.checked) { created.rules = { ...(src.rules || {}) }; created.automation = JSON.parse(JSON.stringify(src.automation || {})); created.logic = JSON.parse(JSON.stringify(src.logic || {})); created.required = JSON.parse(JSON.stringify(src.required || {})); }
    } else {
      created = newPipelineDef(name);
    }
    defs.push(created);
    persistPipelines(defs, isClone ? `Pipeline "${name}" clonado` : `Pipeline "${name}" creado: configura sus etapas`);
    closeModal();
    state.pipeEdit = defs.length - 1;
    state.pipeSub = 'configure';
    render();
  });
  validate();
  nameInput.focus();
  if (isClone) nameInput.select();
}
// "Asignar usuarios y equipos" drawer for one pipeline (private / everyone / selected teams & users).
function openAccessDrawer(i) {
  const defs = dealPipelineDefs();
  const p = defs[i];
  const saved = { mode: 'all', teams: [], users: [], ...(p.access || {}) };
  if (saved.mode === 'teams') saved.mode = 'select';
  const draft = { mode: saved.mode, teams: [...saved.teams], users: [...saved.users] };
  let tab = 'teams';
  let q = '';
  const dirty = () => JSON.stringify(draft) !== JSON.stringify({ mode: saved.mode, teams: saved.teams, users: saved.users });
  const body = () => {
    const list = tab === 'teams' ? teams().map((t) => t.name) : users().map((u) => u.name);
    const sel = tab === 'teams' ? draft.teams : draft.users;
    const items = list.filter((n) => !q || n.toLowerCase().includes(q.toLowerCase()));
    return `<div class="acc">
      <p class="acc__intro">Esto solo restringe el acceso de los usuarios al pipeline, no a los registros de este.<br /><a href="#" class="acc__more" onclick="return false">Más información ↗</a></p>
      <div class="acc__modes">
        ${[['private', 'Privado para mí'], ['all', 'Disponible para todos'], ['select', 'Selecciona usuarios y equipos que pueden editar']].map(([v, l]) => `<label class="acc__radio"><input type="radio" name="acc-mode" value="${v}" ${draft.mode === v ? 'checked' : ''} /><span>${l}</span></label>`).join('')}
      </div>
      ${draft.mode === 'select' ? `
      <div class="acc__pick">
        <div class="acc__search"><input type="search" id="acc-q" placeholder="Buscar" value="${esc(q)}" aria-label="Buscar usuarios y equipos" /><span class="caret" aria-hidden="true"></span></div>
        <div class="acc__tabs"><button type="button" class="${tab === 'teams' ? 'is-active' : ''}" data-acc-tab="teams">Equipos${draft.teams.length ? ` (${draft.teams.length})` : ''}</button><button type="button" class="${tab === 'users' ? 'is-active' : ''}" data-acc-tab="users">Usuarios${draft.users.length ? ` (${draft.users.length})` : ''}</button></div>
        <ul class="acc__list">${items.length ? items.map((n) => `<li><label><input type="checkbox" data-acc-item="${esc(n)}" ${sel.includes(n) ? 'checked' : ''} /><span class="acc__ico" aria-hidden="true">${tab === 'teams' ? '👥' : '👤'}</span><span>${esc(n)}</span></label></li>`).join('') : '<li class="muted">Sin resultados</li>'}</ul>
      </div>` : ''}
    </div>`;
  };
  const paint = () => {
    document.getElementById('s-modal-body').innerHTML = body();
    const saveBtn = document.getElementById('acc-save');
    saveBtn.disabled = !dirty() || (draft.mode === 'select' && !draft.teams.length && !draft.users.length);
    const qInput = document.getElementById('acc-q');
    if (qInput && q) { qInput.focus(); qInput.setSelectionRange(q.length, q.length); }
  };
  openModal('Asignar usuarios y equipos', '', `<button class="btn btn--primary" type="button" id="acc-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  const modalBody = document.getElementById('s-modal-body');
  modalBody.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.name === 'acc-mode') { draft.mode = t.value; paint(); }
    else if (t.dataset.accItem !== undefined) { const arr = tab === 'teams' ? draft.teams : draft.users; const n = t.dataset.accItem; if (t.checked) { if (!arr.includes(n)) arr.push(n); } else arr.splice(arr.indexOf(n), 1); paint(); }
  });
  modalBody.addEventListener('input', (ev) => { if (ev.target.id === 'acc-q') { q = ev.target.value; paint(); } });
  modalBody.addEventListener('click', (ev) => { const b = ev.target.closest('[data-acc-tab]'); if (b) { tab = b.dataset.accTab; q = ''; paint(); } });
  document.getElementById('acc-save').onclick = () => {
    p.access = draft.mode === 'all' ? { mode: 'all' } : draft.mode === 'private' ? { mode: 'private', teams: [], users: ['Fernando L.'] } : { mode: 'select', teams: draft.teams, users: draft.users };
    persistPipelines(defs, draft.mode === 'all' ? 'Pipeline disponible para todos' : draft.mode === 'private' ? 'Pipeline privado para ti' : 'Acceso al pipeline guardado');
    closeModal();
    render();
  };
  paint();
}
function persistPipelines(defs, msg) {
  saveDealPipelineDefs(defs);
  // The default pipeline's base stages also feed the global catalogue used by lists and boards.
  const ov = {};
  defs[0].stages.forEach(([k, l, pr]) => { if (DEAL_STAGES.some((s) => s[0] === k)) ov[k] = { label: l, prob: pr }; });
  save(PIPELINE_KEY('deals'), ov);
  if (msg) toast(msg);
}

// ---------- Objetos: one page, object selector + tabs ----------
const OBJ_META = {
  contacts: { s: 'Contacto', p: 'Contactos', desc: 'Almacena información sobre una persona que interactúa con tu negocio.', icon: '👤' },
  companies: { s: 'Empresa', p: 'Empresas', desc: 'Almacena información sobre una organización o un negocio.', icon: '🏢' },
  deals: { s: 'Negocio', p: 'Negocios', desc: 'Realiza un seguimiento del progreso, la propiedad y otros detalles de una transacción con un cliente o una empresa.', icon: '🤝' },
  tickets: { s: 'Ticket', p: 'Tickets', desc: 'Realiza un seguimiento de las solicitudes de ayuda de tus clientes.', icon: '🎫' },
  tasks: { s: 'Tarea', p: 'Tareas', desc: 'Actividades pendientes asignadas a los usuarios de tu cuenta.', icon: '☑' },
  products: { s: 'Producto', p: 'Productos', desc: 'Bienes y servicios que vendes, para usarlos en negocios y cotizaciones.', icon: '📦' },
  custom: { s: 'Objeto personalizado', p: 'Objetos personalizados', desc: 'Objetos que defines tú para almacenar datos que no encajan en los objetos estándar.', icon: '◫' },
};
const AMOUNT_MODES = ['Total adeudado en el cierre (versión anterior)', 'Valor total del contrato', 'Valor anual del contrato', 'Valor mensual recurrente', 'Importe fijo'];
const CLOSE_PERIODS = ['Este mes', 'Este trimestre', 'Este año', 'El mes que viene'];
const objSetting = (type) => setting(`obj-${type}`, { amountMode: AMOUNT_MODES[0], defaultClose: true, closeMode: 'period', closePeriod: 'Este mes', closeDays: 30, followOwn: true, comments: true, notifyOwner: true, dupes: true, assocReq: false, autoAssign: false, defaultView: 'Todos', boardCount: true });
const objRadio = (type, key, value, label, checked, extra = '') => `<label class="oradio"><input type="radio" name="${type}-${key}" data-objsetting="${key}" data-type="${type}" value="${esc(value)}" ${checked ? 'checked' : ''} /><span>${label}</span>${extra}</label>`;
const objCheck = (type, key, label, desc, checked) => `<label class="ocheck"><input type="checkbox" data-objsetting="${key}" data-type="${type}" ${checked ? 'checked' : ''} /><span><strong>${label}</strong>${desc ? `<small>${desc}</small>` : ''}</span></label>`;

function objectConfigHtml(type) {
  const m = OBJ_META[type];
  const s = objSetting(type);
  const lower = m.p.toLowerCase();
  const props = `<h3>Propiedades</h3>
    <p><a class="olink" href="#data-properties" data-props-object-link="${type}">Gestionar propiedades de ${m.s}</a><br /><span class="muted">Administra la información que recoges sobre tus ${m.p}.</span></p>
    ${type === 'deals' ? `<div class="ofield"><strong>Cantidad predeterminada del Negocio</strong><p class="muted">Elige cómo se calcula el valor de un Negocio y cómo se muestra en tu registro de Negocio. <a href="#">Más información. ↗</a></p><select class="ginput ginput--md" data-objsetting="amountMode" data-type="deals">${AMOUNT_MODES.map((a) => `<option ${s.amountMode === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>` : ''}
    ${type === 'tickets' ? `<div class="ofield"><strong>Estado predeterminado del Ticket</strong><p class="muted">Estado con el que se crean los tickets nuevos.</p><select class="ginput ginput--md" data-objsetting="defaultStatus" data-type="tickets">${TICKET_STATUSES.map(([, l]) => `<option ${(s.defaultStatus || TICKET_STATUSES[0][1]) === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}`;
  const assoc = `<h3>Asociaciones</h3><p><button class="olink" type="button" data-objects-tab="assoc">Gestionar asociaciones de ${m.s}</button><br /><span class="muted">Gestiona las relaciones entre tus ${m.p} y otros objetos.</span></p>`;
  const creating = `<h3>Creando ${m.p}</h3>
    <div class="othumb"><span class="othumb__img" aria-hidden="true"><i></i><i></i><i></i></span><div><button class="olink" type="button" data-act="customize-create" data-type="${type}">Personaliza el formulario "Crear ${m.s}"</button><br /><span class="muted">Agrega, elimina o edita campos en el formulario "Crear ${m.s}"</span></div></div>
    ${type === 'deals' ? `${objCheck('deals', 'defaultClose', 'Aplicar fecha de cierre predeterminada a Negocios nuevos', 'Selecciona la fecha de cierre predeterminada al crear un Negocio. <a href="#">Más información ↗</a>', s.defaultClose)}
      <div class="oindent ${s.defaultClose ? '' : 'is-disabled'}">
        ${objRadio('deals', 'closeMode', 'period', 'Fin de cierto periodo', s.closeMode === 'period', `<select class="ginput ginput--sm oinline" data-objsetting="closePeriod" data-type="deals" ${s.closeMode === 'period' ? '' : 'disabled'}>${CLOSE_PERIODS.map((p) => `<option ${s.closePeriod === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`)}
        ${objRadio('deals', 'closeMode', 'days', 'Tiempo a partir de la creación del Negocio <span class="info">ⓘ</span>', s.closeMode === 'days', `<span class="oinline"><input class="ginput ginput--xs" type="number" min="1" max="365" data-objsetting="closeDays" data-type="deals" value="${s.closeDays}" ${s.closeMode === 'days' ? '' : 'disabled'} /> días</span>`)}
      </div>` : ''}
    ${type === 'contacts' ? objCheck('contacts', 'autoAssign', 'Asignar automáticamente los Contactos nuevos a quien los crea', 'Si no se elige un propietario, el Contacto se asigna al usuario que lo creó.', s.autoAssign) : ''}
    ${type === 'tasks' ? objCheck('tasks', 'autoAssign', 'Asignar las Tareas nuevas a quien las crea', 'Si no se indica, la Tarea queda asignada al usuario que la creó.', s.autoAssign !== false) : ''}
    ${objCheck(type, 'dupes', `Avisar de ${lower} duplicados`, 'Al crear un registro parecido a otro existente se muestra un aviso.', s.dupes)}
    ${type === 'deals' || type === 'tickets' ? objCheck(type, 'assocReq', 'Exigir un contacto o una empresa asociados', 'No permite guardar el registro sin una asociación.', s.assocReq) : ''}`;
  const collab = `<h3>Colaboración</h3>
    ${objCheck(type, 'followOwn', `Seguir automáticamente los ${m.p} que creas`, 'Recibirás notificaciones de la actividad de esos registros.', s.followOwn)}
    ${objCheck(type, 'comments', `Permitir comentarios en los ${m.p}`, 'Los usuarios pueden dejar comentarios y mencionar a compañeros.', s.comments)}
    ${objCheck(type, 'notifyOwner', 'Notificar al propietario al asignar un registro', 'Se envía una notificación al nuevo propietario.', s.notifyOwner)}`;
  const excluded = load('crm:companies:excluded-domains', ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com']);
  const automation = type === 'companies' ? `<h3>Automatización</h3>
    ${objCheck('companies', 'autoCreate', 'Crea y asocia Empresas con Contactos', `Asocia Contactos actuales y agregados recientemente con Empresas basándote en la dirección de correo de un Contacto y el dominio de una Empresa.<br /><button class="olink olink--sm" type="button" data-act="excluded-domains">Excluye un dominio de la asociación automática</button> <span class="muted">(${excluded.length} excluidos)</span>`, s.autoCreate !== false)}` : '';
  const danger = `<h3>Eliminación</h3><p class="muted">Los ${lower} eliminados se guardan 90 días en la papelera y después se borran definitivamente.</p><p><a class="link-btn" href="../${type}/">Ver ${lower} eliminados en la lista ↗</a></p>`;
  return `<p class="odesc">${m.desc}</p><hr class="cd-sep" />${props}${assoc}${creating}${automation}${collab}${['contacts', 'companies', 'deals', 'tickets', 'tasks'].includes(type) ? danger : ''}`;
}
// "Etapa del ciclo de vida" tab for contacts and companies.
// ---------- Etapa del ciclo de vida (shared by contacts and companies), as in the original ----------
Object.assign(state, { lcSub: 'configure', lcBannerHidden: false });
const LC_RULES = [
  ['noBack', 'Solo permitir avanzar de etapa', 'La etapa del ciclo de vida no retrocede, ni manualmente ni por flujos o importaciones.'],
  ['noSkip', 'Limitar los saltos de etapa', 'Un registro solo puede pasar a la etapa siguiente.'],
  ['lockCustomer', 'No cambiar automáticamente la etapa de los clientes', 'Los registros en "Cliente" o posteriores no se mueven por automatizaciones.'],
  ['requireOwner', 'Exigir propietario para avanzar de Lead', 'Un registro sin propietario no puede pasar de la etapa Lead.'],
];
const LC_SYNC = [['onDeal', 'Cuando se crea un negocio asociado, pasar a «Oportunidad»', 'Contactos y empresas en etapas anteriores avanzan a Oportunidad.'], ['onWon', 'Cuando se gana un negocio asociado, pasar a «Cliente»', 'Contactos y empresas asociados al negocio pasan a Cliente.'], ['company', 'Sincronizar la etapa entre contactos y su empresa', 'Al avanzar un contacto, su empresa avanza si está por detrás, y al revés.']];
function collectLifecycle(def) {
  const form = root.querySelector('form[data-save="lifecycle"]');
  if (!form) return def;
  def.stages.forEach((s) => {
    const l = form.querySelector(`[data-lc-label="${s[0]}"]`);
    const d = form.querySelector(`[data-lc-desc="${s[0]}"]`);
    if (l && l.value.trim()) s[1] = l.value.trim();
    if (d) s[2] = d.value.trim();
  });
  return def;
}
function lifecycleHtml(type) {
  const m = OBJ_META[type];
  const def = lifecycleDef();
  const records = ALL[type]();
  const sub = state.lcSub || 'configure';
  const count = (label) => records.filter((r) => r.lifecycle === label).length;
  const logicN = (id) => (def.logic && def.logic[id] && def.logic[id].props && def.logic[id].props.length ? 1 : 0);
  const ruleHits = (id, i) => (def.rules && def.rules.requireOwner && id === 'lead' ? 1 : 0) + (def.rules && def.rules.lockCustomer && i >= def.stages.findIndex((s) => s[0] === 'customer') && def.stages.some((s) => s[0] === 'customer') ? 1 : 0) + ((def.required && def.required[id] && def.required[id].length) ? 1 : 0);
  let body = '';
  if (sub === 'configure') {
    body = `<div class="lcinfo"><strong>Los contactos y las empresas comparten algunos ajustes.</strong> Al cambiar el nombre o el color de la etapa, o al activar las propiedades calculadas de la etapa en los contactos, también se cambiarán en las empresas. Las reglas de lógica condicional son independientes para contactos y empresas.</div>
      <form class="peditor" data-save="lifecycle">
        <div class="pdesc"><strong>Descripción del pipeline</strong><div>${def.desc ? esc(def.desc) : '--'} <button type="button" class="icon-btn icon-btn--round icon-btn--sm" data-act="lc-desc" aria-label="Editar descripción">✎</button></div></div>
        <p class="muted">Monitoriza ${m.p.toLowerCase()} a medida que avanzan por los procesos de marketing y de ventas. <a href="#" onclick="return false">Más información acerca de las etapas del ciclo de vida</a></p>
        <table class="mini-table stable ptable ptable--stages ptable--lc"><thead><tr><th>Nombre de la etapa</th><th>Descripción de la etapa</th><th>Habilitar propiedades calculadas de etapa <span class="muted">⋮</span></th><th>Se usa en</th><th>Reglas de lógica condicional <span class="info">ⓘ</span> <span class="tag tag--done">Nuevo</span></th><th><span class="plink">Reglas del pipeline <span class="info">ⓘ</span></span></th><th>Identificación de la etapa</th><th>Eliminar</th></tr></thead><tbody data-dnd="lcstages">
          ${def.stages.map(([id, label, desc, calc], i) => `<tr data-row="${i}"><td class="pstagecell"><span class="phandle" title="Arrastra para cambiar el orden" aria-hidden="true">⋮⋮</span><input class="cellpop__input cellpop__input--sm pstage" data-lc-label="${esc(id)}" value="${esc(label)}" required /></td><td><input class="cellpop__input cellpop__input--sm" data-lc-desc="${esc(id)}" value="${esc(desc || '')}" placeholder="--" /></td><td><label class="lcswitch"><input type="checkbox" class="switch" data-lc-calc="${esc(id)}" ${calc !== false ? 'checked' : ''} /><span class="visually-hidden">Propiedades calculadas de ${esc(label)}</span></label></td><td><a class="plink" href="../${type}/">${count(label).toLocaleString('es-ES')}</a></td><td>${logicN(id) ? `<button type="button" class="link-btn plogic" data-logic-edit="${esc(id)}" data-logic-lifecycle>1 regla de lógica</button>` : `<span class="muted rowdash">--</span><button type="button" class="pill pill--sm rowact" data-logic-edit="${esc(id)}" data-logic-lifecycle>Agregar regla</button>`}</td><td>${ruleHits(id, i) ? `<span class="muted">${ruleHits(id, i)} regla${ruleHits(id, i) > 1 ? 's' : ''}</span>` : '<span class="muted rowdash">--</span>'}<button type="button" class="pill pill--sm rowact" data-lc-sub="rules">Editar</button></td><td class="muted">${esc(id)}</td><td><button type="button" class="icon-btn icon-btn--sm lctrash" data-lc-rm="${esc(id)}" aria-label="Eliminar etapa ${esc(label)}" ${count(label) || def.stages.length <= 2 ? 'disabled title="Tiene registros"' : ''}>🗑</button></td></tr>`).join('')}
        </tbody></table>
        <p><button type="button" class="link-btn" data-act="lc-stage-add">+ Agregar etapa</button></p>
        <div class="sform__btns gsave"><button class="btn btn--primary" type="submit">Guardar</button><button class="btn btn--ghost" type="button" data-act="lc-reset">Restablecer etapas</button></div>
      </form>`;
  } else if (sub === 'automate') {
    const a = def.automation || {};
    const sync = def.sync || {};
    body = `<h3>Automatizar</h3><p class="muted">Acciones automáticas sobre la etapa del ciclo de vida de contactos y empresas.</p>
      ${LC_SYNC.map(([k, l, d]) => `<label class="ocheck"><input type="checkbox" data-lc-sync="${k}" ${sync[k] !== false ? 'checked' : ''} /><span><strong>${l}</strong><small>${d}</small></span></label>`).join('')}
      <h3>Al entrar en una etapa</h3>
      <div class="pautos">${def.stages.map(([id, label]) => { const s = a[id] || {}; const n = Object.values(s).filter(Boolean).length; return `<div class="pauto"><div class="pauto__head"><strong>Cuando un registro entra en «${esc(label)}»</strong><span class="muted">${n ? `${n} acción${n > 1 ? 'es' : ''}` : 'Sin acciones'}</span></div>${PIPE_AUTOS.map(([ak, al]) => `<label class="ocheck ocheck--sm"><input type="checkbox" data-lc-auto="${ak}" data-stage="${esc(id)}" ${s[ak] ? 'checked' : ''} /><span>${al}</span></label>`).join('')}</div>`; }).join('')}</div>`;
  } else {
    const r = def.rules || {};
    body = `<h3>Reglas del pipeline</h3><p class="muted">Las reglas se aplican al cambiar la etapa del ciclo de vida desde la ficha, la lista o el tablero. Reglas activas: <strong>${Object.values(r).filter(Boolean).length}</strong>.</p>
      ${LC_RULES.map(([k, l, d]) => `<label class="ocheck"><input type="checkbox" data-lc-rule="${k}" ${r[k] ? 'checked' : ''} /><span><strong>${l}</strong><small>${d}</small></span></label>`).join('')}
      <h3>Propiedades obligatorias por etapa</h3><p class="muted">Pide información al entrar en una etapa. Los registros que no la tengan no podrán moverse a ella.</p>
      ${simpleTable(['Etapa', 'Propiedades obligatorias', ''], def.stages.map(([id, label]) => [esc(label), (def.required && def.required[id] && def.required[id].length) ? def.required[id].map((x) => `<span class="chip">${esc(x)}</span>`).join(' ') : '<span class="muted">Ninguna</span>', `<button class="link-btn" type="button" data-act="lc-required" data-stage="${esc(id)}">Editar</button>`]))}`;
  }
  return `${state.lcBannerHidden ? '' : `<div class="lcbanner"><div><strong>Las integraciones que utilizan valores preestablecidos para la «lifecyclestage» deberán actualizarse.</strong> <span class="muted">Actualiza tu integración para usar la <a href="#" onclick="return false">API de propiedades de CRM ↗</a> para obtener los detalles de la propiedad.</span></div><button type="button" class="icon-btn icon-btn--sm" data-act="lc-banner-close" aria-label="Cerrar">×</button></div>`}
    <h3>Personaliza las etapas del ciclo de vida de ${m.p}</h3>
    <div class="ofield"><strong>Definir los colores de visualización de las etapas del ciclo de vida <span class="info">ⓘ</span></strong>
      <div class="pcolors">${STAGE_COLORS.map(([k, l]) => `<button type="button" class="pcolor${(def.color || 'none') === k ? ' is-active' : ''}" data-lc-color="${k}">${l}</button>`).join('')}</div></div>
    <div class="pmanage lcpanel">
      <div class="ptabs ptabs--sub">${[['configure', 'Configurar'], ['automate', 'Automatizar'], ['rules', 'Reglas del pipeline']].map(([k, l]) => `<button type="button" class="${sub === k ? 'is-active' : ''}" data-lc-sub="${k}">${l}</button>`).join('')}</div>
      ${body}
    </div>`;
}
// Record views ("Personalización de registros"): the default view plus team views.
Object.assign(state, { rvQuery: '', rvSort: { key: 'name', dir: 1 }, rvSel: new Set() });
const RV_DEFAULT_UPDATED = new Date(2026, 2, 23, 11, 23).toISOString();
const RV_SEEDS = {
  deals: [{ name: 'Ventas Extranjero', teams: ['Ventas en el Extranjero'], updated: new Date(2026, 6, 10, 11, 13).toISOString(), by: 'Fernando Lovera Colin' }, { name: 'Vista de Acristala', teams: ['Acristala'], updated: new Date(2026, 6, 10, 11, 13).toISOString(), by: 'Fernando Lovera Colin' }, { name: 'Proyectos+ 100', teams: ['Proyectos'], updated: RV_DEFAULT_UPDATED, by: '' }],
  contacts: [{ name: 'Vista de ventas', teams: ['Ventas en el Extranjero', 'SACA'], updated: new Date(2026, 4, 2, 9, 40).toISOString(), by: 'Fernando Lovera Colin' }],
  companies: [{ name: 'Cuentas clave', teams: ['Gerentes'], updated: new Date(2026, 5, 18, 16, 5).toISOString(), by: 'Fernando Lovera Colin' }],
};
// The same views table serves "Personalización de registros" (record page) and "Previsualizar personalización" (preview panel).
const PV_SEEDS = { deals: [{ name: 'Ventas Extranjero', teams: ['Ventas en el Extranjero'], updated: new Date(2026, 10, 9, 17, 39).toISOString(), by: 'Fernando Lovera Colin' }] };
const viewsKind = () => (state.objectsTab === 'preview' ? 'preview' : 'record');
const viewsKey = (type) => `crm:${type}:${viewsKind() === 'preview' ? 'previewviews' : 'recordviews'}`;
const recordViews = (type) => load(viewsKey(type), (viewsKind() === 'preview' ? PV_SEEDS : RV_SEEDS)[type] || []);
const saveRecordViews = (type, list) => save(viewsKey(type), list);
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const rvDate = (iso) => { const d = new Date(iso); return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]}. de ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} CST`; };
function objectRecordHtml(type) {
  const m = OBJ_META[type];
  const isPreview = viewsKind() === 'preview';
  const layout = isPreview ? { name: 'Vista predeterminada' } : loadLayout(type);
  const editorHref = (view) => `../layout/?type=${type}${isPreview ? '&preview=1' : ''}${view ? `&view=${encodeURIComponent(view)}` : ''}`;
  const stored = recordViews(type);
  const q = state.rvQuery.trim().toLowerCase();
  const all = [{ name: layout.name || 'Vista predeterminada', teams: [], updated: load(isPreview ? `crm:${type}:preview-updated` : `crm:${type}:layout-updated`, isPreview ? new Date(2024, 11, 9, 16, 28).toISOString() : RV_DEFAULT_UPDATED), by: '', isDefault: true, i: -1 }, ...stored.map((v, i) => ({ ...v, i }))];
  const { key, dir } = state.rvSort;
  const rows = all.filter((v) => !q || v.name.toLowerCase().includes(q)).sort((a, b) => (a.isDefault ? -1 : b.isDefault ? 1 : (key === 'updated' ? new Date(a.updated) - new Date(b.updated) : String(key === 'teams' ? a.teams.join() : a.name).localeCompare(String(key === 'teams' ? b.teams.join() : b.name), 'es')) * dir));
  const th = (k, label) => `<th><button class="psort${key === k ? ' is-active' : ''}" type="button" data-rv-sort="${k}">${label} <span aria-hidden="true">${key === k ? (dir > 0 ? '↑' : '↓') : '⇅'}</span></button></th>`;
  return `<p class="odesc">${isPreview ? `Personaliza el panel de vista previa de ${m.s} registros. También puedes <a href="../${type}/">actualizar tarjetas de vista previa</a> que aparecen fuera del CRM. <span class="info">ⓘ</span>` : `Crea vistas para personalizar el diseño y el contenido de los registros de ${m.s}.`}</p><hr class="cd-sep" />
    <div class="rvbar">
      <div class="search search--sm ptoolbar__search"><input type="search" id="rv-q" value="${esc(state.rvQuery)}" placeholder="Buscar por nombre de vista" aria-label="Buscar por nombre de vista" /><span class="ico ico--search" aria-hidden="true"></span></div>
      <a class="pill pill--lg" href="${editorHref('')}&new=1" id="rv-new">Crear vista de equipo</a>
    </div>
    <table class="mini-table stable proptable rvtable"><thead><tr><th class="pcheck"><input type="checkbox" aria-label="Seleccionar todo" data-rv-check-all ${rows.filter((v) => !v.isDefault).length && rows.filter((v) => !v.isDefault).every((v) => state.rvSel.has(v.name)) ? 'checked' : ''} /></th>${th('name', 'Ver nombre')}${th('teams', 'Asignado a')}${th('updated', 'Última actualización')}<th class="num">Acciones</th></tr></thead><tbody>
      ${rows.map((v) => `<tr><td class="pcheck">${v.isDefault ? '<input type="checkbox" disabled aria-label="Vista predeterminada" />' : `<input type="checkbox" data-rv-check="${esc(v.name)}" ${state.rvSel.has(v.name) ? 'checked' : ''} aria-label="Seleccionar ${esc(v.name)}" />`}</td>
        <td>${v.isDefault ? '<span class="rvpin" aria-hidden="true">📌</span> ' : ''}<a class="olink" href="${editorHref(v.isDefault ? '' : v.name)}">${esc(v.name)}</a></td>
        <td>${v.isDefault ? 'Todos los equipos y usuarios sin asignar' : v.teams.length ? v.teams.map((t) => `<span class="rvchip">${esc(t)}</span>`).join(' ') : '<span class="muted">Sin asignar</span>'}</td>
        <td><div>${rvDate(v.updated)}</div>${v.by ? `<div class="muted">${esc(v.by)}</div>` : ''}</td>
        <td class="num"><div class="menu"><button class="icon-btn icon-btn--round" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Acciones">⋯</button><div class="menu__panel menu__panel--right">
          <a class="menu__item" href="${editorHref(v.isDefault ? '' : v.name)}">Editar vista</a>
          ${v.isDefault ? `<button class="menu__item" type="button" data-rv-reset="${type}">Restablecer la vista predeterminada</button>` : `<button class="menu__item" type="button" data-rv-rename="${v.i}">Cambiar nombre</button><button class="menu__item" type="button" data-rv-teams="${v.i}">Asignar equipos</button><button class="menu__item" type="button" data-rv-clone="${v.i}">Clonar</button><button class="menu__item menu__item--danger" type="button" data-rv-rm="${v.i}">Eliminar</button>`}
        </div></div></td></tr>`).join('')}
    </tbody></table>
    ${state.rvSel.size ? `<div class="pbulk"><strong>${state.rvSel.size} seleccionada${state.rvSel.size > 1 ? 's' : ''}</strong><button class="link-btn" type="button" data-act="rv-delete-sel" data-type="${type}">Eliminar</button><button class="link-btn" type="button" data-act="rv-clear-sel">Limpiar</button></div>` : ''}
    <div class="ppager ppager--center"><nav class="ppager__nav" aria-label="Páginas"><button class="link-btn" type="button" disabled>‹ Anterior</button><button class="ppager__num is-active" type="button">1</button><button class="link-btn" type="button" disabled>Siguiente ›</button></nav></div>`;
}
const objectPreviewHtml = (type) => objectRecordHtml(type);
function objectPreviewHtmlOld(type) {
  const m = OBJ_META[type];
  const layout = loadLayout(type);
  const cards = cardCatalog(type);
  const first = (ALL[type] ? ALL[type]() : [])[0];
  const team = state.previewTeam || 'Todos los usuarios';
  return `<div class="shead"><div class="gfield--row"><label>Vista:</label><select class="ginput ginput--sm" disabled><option>${esc(layout.name || 'Vista predeterminada')}</option></select><label>Equipo:</label><select class="ginput ginput--sm" data-preview-team>${['Todos los usuarios', ...TEAMS].map((t) => `<option ${team === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>${first ? `<a class="btn btn--ghost btn--sm" href="../${type}/record/?id=${first.id}">Abrir un ${m.s.toLowerCase()} de ejemplo ↗</a>` : ''}</div>
    <p class="muted">Así verá la ficha de ${m.s.toLowerCase()} el equipo ${esc(team)} con la vista actual.</p>
    <div class="opreview">
      <div class="opreview__col"><div class="opreview__id"><span class="avatar avatar--sm avatar--soft">${esc(first ? String(first.name).slice(0, 2).toUpperCase() : m.s.slice(0, 2))}</span><div><strong>${esc(first ? first.name : `${m.s} de ejemplo`)}</strong><small class="muted">${esc(first && first.owner ? first.owner : 'Sin propietario')}</small></div></div>${layout.left.map((c) => `<div class="opreview__card"><strong>${esc((cards[c] || { label: c }).label)}</strong><i></i><i></i><i></i></div>`).join('')}</div>
      <div class="opreview__col opreview__col--mid"><div class="opreview__tabs">${layout.tabs.map((t, i) => `<span class="${i === 0 ? 'is-active' : ''}">${esc(t.label)}</span>`).join('')}</div>${(layout.tabs[0].sections || []).map((sec) => `<div class="opreview__section"><strong>${esc(sec.title)}</strong><div class="opreview__grid">${sec.cards.map((c) => `<div class="opreview__card"><strong>${esc((cards[c] || { label: c }).label)}</strong><i></i><i></i></div>`).join('')}</div></div>`).join('')}</div>
      <div class="opreview__col">${layout.right.map((c) => `<div class="opreview__card"><strong>${esc((cards[c] || { label: c }).label)}</strong><i></i><i></i></div>`).join('')}</div>
    </div>`;
}
// ---------- Personalización del índice: default columns, quick filters and board cards of the list page ----------
const INDEX_DEFAULT_COLUMNS = {
  contacts: ['name', 'email', 'phone', 'owner', 'assoc_company', 'status', 'created'],
  companies: ['name', 'domain', 'phone', 'owner', 'industry', 'city', 'contacts', 'deals', 'created'],
  deals: ['name', 'stage', 'pipeline', 'amount', 'closeDate', 'lastActivity', 'owner'],
  tickets: ['name', 'status', 'priority', 'contact', 'owner', 'source', 'created'],
  tasks: ['done', 'name', 'contact', 'due', 'type', 'priority', 'status', 'owner'],
};
const INDEX_DEFAULT_FILTERS = {
  contacts: ['owner', 'created', 'activity', 'status'],
  companies: ['owner', 'created', 'activity', 'industry', 'lifecycle'],
  deals: ['owner', 'created', 'activity', 'close', 'stage', 'priority'],
  tickets: ['owner', 'status', 'priority', 'created', 'source'],
  tasks: ['owner', 'type', 'priority', 'status'],
};
const INDEX_EXTRA_LABELS = { assoc_company: 'Contacto → Empresas', contacts: 'Contactos', deals: 'Negocios abiertos', done: 'Hecha', contact: 'Contacto asociado', activity: 'Última actividad', close: 'Fecha de cierre', created: 'Fecha de creación', owner: 'Propietario', status: 'Estado', priority: 'Prioridad', type: 'Tipo', due: 'Fecha de vencimiento', industry: 'Sector', lifecycle: 'Etapa del ciclo de vida', source: 'Fuente', stage: 'Etapa del negocio', amount: 'Importe', closeDate: 'Fecha de cierre', lastActivity: 'Última actividad', pipeline: 'Pipeline', domain: 'Dominio', phone: 'Número de teléfono', email: 'Correo', name: 'Nombre', city: 'Ciudad' };
const indexLabel = (type, k) => { const p = propertyList(type).find((x) => x.key === k); return p ? p.label : INDEX_EXTRA_LABELS[k] || k; };
const indexColumns = (type) => load(`crm:${type}:defaultcolumns`, INDEX_DEFAULT_COLUMNS[type] || []);
const indexFilters = (type) => load(`crm:${type}:quickfilters`, INDEX_DEFAULT_FILTERS[type] || []);
const indexBoard = (type) => load(`crm:${type}:boardcard`, null);
function objectIndexHtml(type) {
  const m = OBJ_META[type];
  const s = objSetting(type);
  const views = ['Todos', 'Míos', 'Sin asignar', 'Creados este mes'];
  const now = (keys) => (keys && keys.length ? keys.map((k) => indexLabel(type, k)).join(', ') : 'Valores predeterminados');
  const row = (title, desc, nowText, act, btn, extra = '') => `<div class="ixrow"><div><strong>${title}</strong><p class="muted">${desc}</p><p class="ixrow__now"><span class="muted">Ahora:</span> ${esc(nowText)}</p>${extra}</div><button class="btn btn--ghost" type="button" data-act="${act}" data-type="${type}">${btn}</button></div>`;
  return `<p class="odesc">Controla el diseño y el contenido de la página de índice de ${m.s}.</p><hr class="cd-sep" />
    <h3>Personalizar Página de índice</h3>
    <p class="ixlink"><a class="olink" href="../views/?type=${type}&tab=all">Todas las vistas</a><br /><span class="muted">Ve y actúa sobre todas tus vistas en un solo lugar.</span></p>
    <p class="ixlink"><a class="olink" href="../views/?type=${type}&tab=defaults">Personalización de la vista predeterminada</a><br /><span class="muted">Para los nuevos usuarios agregados a tu portal de Omni, la configuración predeterminada de pestañas a nivel de cuenta aparecerá automáticamente cuando naveguen a ese objeto.</span></p>
    <p class="ixlink"><span class="muted">Pestañas predeterminadas ahora:</span> ${esc(defaultTabs(type).map((id) => (id.startsWith('std:') ? ((STD_VIEWS[type] || []).find(([k]) => `std:${k}` === id) || [id, id])[1] : ((getViewStore(type).custom || []).find((v) => v.id === id) || { name: id }).name)).join(' · '))}</p>
    ${switchRow(`obj-${type}`, 'showMetrics', `Mostrar métricas de ${m.s} <span class="tag tag--done">Nuevo</span>`, `Agrega una tarjeta de métricas a cada vista en la página de índice de ${m.p}.`, s.showMetrics !== false)}
    <details class="ixmore"><summary>Más opciones de la página de índice</summary>
    <h3>Vista de tabla</h3>
    ${row('Columnas predeterminadas', `Elige qué columnas ven los usuarios de forma predeterminada en la vista de tabla de ${m.p.toLowerCase()}. Cada usuario puede ajustar las suyas desde la lista con "Editar columnas". <a href="../${type}/">Más información ↗</a>`, now(indexColumns(type)), 'ix-columns', 'Personalizar las columnas predeterminadas')}
    ${row('Filtros rápidos predeterminados', 'Los filtros rápidos aparecen encima de la tabla y del tablero. Puedes elegir hasta cinco propiedades.', now(indexFilters(type)), 'ix-filters', 'Personalizar los filtros rápidos')}
    <div class="ixrow"><div><strong>Vista predeterminada</strong><p class="muted">La vista que se abre primero al entrar en ${m.p}.</p><select class="ginput ginput--md" data-objsetting="defaultView" data-type="${type}">${views.map((v) => `<option ${s.defaultView === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
    <h3>Vista de tablero</h3>
    ${row('Tarjetas del tablero', 'Elige qué propiedades se muestran en cada tarjeta de la vista de tablero (máximo cuatro, en este orden).', indexBoard(type) ? now(indexBoard(type)) : 'Valores predeterminados', 'ix-board', 'Personalizar las tarjetas del tablero')}
    ${objCheck(type, 'boardCount', 'Mostrar el número de registros en cada etapa del tablero', 'Aparece junto al nombre de la etapa.', s.boardCount)}
    <h3>Enlaces relacionados</h3>
    <ul class="ixlinks">
      <li><a class="olink" href="#data-properties" data-props-object-link="${type}">Gestionar propiedades de ${m.s}</a><span class="muted"> · Crea o edita las propiedades que puedes mostrar como columnas.</span></li>
      <li><button class="olink" type="button" data-objects-tab="record">Personalización de registros</button><span class="muted"> · Diseña la ficha que se abre al pulsar un registro.</span></li>
      <li><button class="olink" type="button" data-objects-tab="preview">Previsualizar personalización</button><span class="muted"> · Configura el panel de vista previa de la lista.</span></li>
      <li><a class="olink" href="../${type}/">Gestionar vistas guardadas ↗</a><span class="muted"> · Las vistas se crean y comparten desde la propia lista.</span></li>
      <li><a class="olink" href="#data-import">Importar y exportar ${m.p.toLowerCase()}</a><span class="muted"> · Carga registros desde un archivo o descarga la lista.</span></li>
    </ul>
    </details>`;
}
// Ordered picker used by the index customization: chosen items first (with ↑↓), the rest below.
function orderedPicker({ title, intro, items, chosen, max, onSave, onReset }) {
  let sel = [...chosen];
  let q = '';
  const paint = () => {
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    const rest = items.filter((i) => !sel.includes(i.key) && (!q || i.label.toLowerCase().includes(q)));
    document.getElementById('s-modal-body').innerHTML = `<div class="ixpick">
      ${intro ? `<p class="muted">${intro}</p>` : ''}
      <div class="ixpick__sel"><strong>Seleccionadas (${sel.length}${max ? `/${max}` : ''})</strong>${sel.length ? `<ol>${sel.map((k, i) => `<li><span class="phandle" aria-hidden="true">⋮⋮</span><span class="ixpick__name">${esc((byKey[k] || { label: k }).label)}</span><span class="pmoves"><button type="button" class="icon-btn icon-btn--sm" data-ix-move="-1" data-k="${esc(k)}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button type="button" class="icon-btn icon-btn--sm" data-ix-move="1" data-k="${esc(k)}" ${i === sel.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button></span><button type="button" class="icon-btn icon-btn--sm" data-ix-rm="${esc(k)}" aria-label="Quitar">×</button></li>`).join('')}</ol>` : '<p class="muted">Nada seleccionado todavía.</p>'}</div>
      <input class="ginput" type="search" id="ix-q" placeholder="Buscar propiedad" value="${esc(q)}" />
      <div class="ocardgrid ocardgrid--modal">${rest.map((i) => `<label class="ocheck ocheck--sm"><input type="checkbox" data-ix-add="${esc(i.key)}" ${max && sel.length >= max ? 'disabled' : ''} /><span>${esc(i.label)}</span></label>`).join('') || '<p class="muted">Sin resultados.</p>'}</div>
    </div>`;
    document.getElementById('ix-save').disabled = sel.length === 0;
    const qi = document.getElementById('ix-q');
    if (q) { qi.focus(); qi.setSelectionRange(q.length, q.length); }
  };
  openModal(title, '', `<button class="btn btn--primary" type="button" id="ix-save">Guardar</button>${onReset ? '<button class="btn btn--ghost" type="button" id="ix-reset">Restablecer</button>' : ''}<button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  const body = document.getElementById('s-modal-body');
  body.addEventListener('click', (ev) => {
    const mv = ev.target.closest('[data-ix-move]');
    if (mv) { const i = sel.indexOf(mv.dataset.k); const j = i + Number(mv.dataset.ixMove); if (j >= 0 && j < sel.length) { [sel[i], sel[j]] = [sel[j], sel[i]]; paint(); } return; }
    const rm = ev.target.closest('[data-ix-rm]');
    if (rm) { sel = sel.filter((k) => k !== rm.dataset.ixRm); paint(); }
  });
  body.addEventListener('change', (ev) => { const add = ev.target.closest('[data-ix-add]'); if (add && add.checked) { if (!max || sel.length < max) sel.push(add.dataset.ixAdd); paint(); } });
  body.addEventListener('input', (ev) => { if (ev.target.id === 'ix-q') { q = ev.target.value.trim().toLowerCase(); paint(); } });
  document.getElementById('ix-save').onclick = () => { onSave(sel); closeModal(); render(); };
  if (onReset) document.getElementById('ix-reset').onclick = () => { onReset(); closeModal(); render(); };
  paint();
}
function openIndexPicker(kind, type) {
  const m = OBJ_META[type];
  const propItems = propertyList(type).map((p) => ({ key: p.key, label: p.label }));
  const withExtras = (keys) => [...keys.filter((k) => !propItems.some((p) => p.key === k)).map((k) => ({ key: k, label: indexLabel(type, k) })), ...propItems];
  if (kind === 'columns') {
    orderedPicker({ title: `Columnas predeterminadas de ${m.p}`, intro: 'Las columnas se muestran en este orden a quien no haya personalizado las suyas.', items: withExtras(INDEX_DEFAULT_COLUMNS[type] || []), chosen: indexColumns(type), max: 12, onSave: (sel) => { save(`crm:${type}:defaultcolumns`, sel); toast('Columnas predeterminadas guardadas'); }, onReset: () => { localStorage.removeItem(`crm:${type}:defaultcolumns`); toast('Columnas restablecidas'); } });
  } else if (kind === 'filters') {
    orderedPicker({ title: `Filtros rápidos de ${m.p}`, intro: 'Hasta cinco filtros, en este orden, encima de la lista y del tablero.', items: withExtras(INDEX_DEFAULT_FILTERS[type] || []), chosen: indexFilters(type), max: 5, onSave: (sel) => { save(`crm:${type}:quickfilters`, sel); toast('Filtros rápidos guardados'); }, onReset: () => { localStorage.removeItem(`crm:${type}:quickfilters`); toast('Filtros rápidos restablecidos'); } });
  } else {
    orderedPicker({ title: `Tarjetas del tablero de ${m.p}`, intro: 'Hasta cuatro propiedades por tarjeta, en este orden.', items: propItems, chosen: indexBoard(type) || [], max: 4, onSave: (sel) => { save(`crm:${type}:boardcard`, sel); toast('Tarjetas del tablero guardadas'); }, onReset: () => { localStorage.removeItem(`crm:${type}:boardcard`); toast('Tarjetas del tablero restablecidas'); } });
  }
}
function objectAssocHtml(type) {
  const m = OBJ_META[type];
  const labels = assocLabels();
  const others = OBJECTS.filter((o) => o[0] !== type);
  return `<p><button class="link-btn" type="button" data-objects-tab="config">‹ Volver a Configuración</button></p>
    <h3>Asociaciones de ${m.s}</h3><p class="muted">Objetos con los que se pueden relacionar tus ${m.p.toLowerCase()}.</p>
    ${simpleTable(['Objeto', 'Tipo de asociación', 'Etiquetas disponibles'], others.map(([, l]) => [`<strong>${l}</strong>`, 'Muchos a muchos', String(labels.length)]))}
    <h3>Etiquetas de asociación</h3><p class="muted">Se usan al asociar registros entre sí (por ejemplo, "Facturación").</p><ul class="chips-list">${labels.map((l, i) => `<li><span class="chip">${esc(l)} ${i > 1 ? `<button class="chip__x" type="button" data-label-rm="${i}" aria-label="Quitar">×</button>` : ''}</span></li>`).join('')}</ul><form class="sform sform--inline" data-save="label"><input class="cellpop__input cellpop__input--sm" name="label" placeholder="Nueva etiqueta" required /><button class="btn btn--primary" type="submit">Añadir</button></form>`;
}
function paneObjects() {
  const type = state.objectsObject;
  const m = OBJ_META[type];
  // Managing one deal pipeline takes over the whole page, as in the original.
  if (type === 'deals' && state.objectsTab === 'pipelines' && state.pipeEdit !== null) return pipelineEditorHtml(dealPipelineDefs(), ALL.deals());
  const hasPipelines = type === 'deals' || type === 'tickets';
  const hasLifecycle = type === 'contacts' || type === 'companies';
  const tabs = [['config', 'Configuración'], ...(hasPipelines ? [['pipelines', 'Pipelines']] : []), ...(hasLifecycle ? [['lifecycle', 'Etapa del ciclo de vida']] : []), ['record', 'Personalización de registros'], ['preview', 'Previsualizar personalización'], ['index', 'Personalización del índice']];
  if (!tabs.some((t) => t[0] === state.objectsTab) && state.objectsTab !== 'assoc') state.objectsTab = 'config';
  let body = '';
  if (type === 'products') body = paneProducts().replace(/<h2>.*?<\/h2>/, '');
  else if (type === 'custom') body = paneCustomObjects().replace(/<h2>.*?<\/h2>/, '');
  else if (state.objectsTab === 'config') body = objectConfigHtml(type);
  else if (state.objectsTab === 'pipelines') body = objectPipelineHtml(type);
  else if (state.objectsTab === 'lifecycle') body = lifecycleHtml(type);
  else if (state.objectsTab === 'record') body = objectRecordHtml(type);
  else if (state.objectsTab === 'preview') body = objectPreviewHtml(type);
  else if (state.objectsTab === 'index') body = objectIndexHtml(type);
  else body = objectAssocHtml(type);
  const simple = type === 'products' || type === 'custom';
  return `<h2>Objetos</h2>
    <div class="objsel"><strong>Seleccionar un objeto:</strong><span class="objsel__pick"><span class="objsel__ico" aria-hidden="true">${m.icon}</span><select class="ginput" data-objects-object aria-label="Objeto">${OBJECT_PAGES.map(([k, l]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${l}</option>`).join('')}</select></span></div>
    ${simple ? '' : `<div class="otabs"><div class="otabs__tabs">${tabs.map(([k, l]) => `<button type="button" class="${state.objectsTab === k ? 'is-active' : ''}" data-objects-tab="${k}">${l}</button>`).join('')}</div><a class="otabs__ext" href="../${type}/">Ver ${m.p} en el modelo de datos ↗</a></div>`}
    <div class="obody">${body}</div>`;
}
const paneProducts = () => `<h2>Productos</h2><p class="muted">Biblioteca de productos para cotizaciones y negocios.</p>${simpleTable(['Producto', 'Precio', 'Unidad'], [['<strong>Vidrio templado 10 mm</strong>', formatMoney(85), 'm²'], ['<strong>Vidrio laminado 6+6</strong>', formatMoney(120), 'm²'], ['<strong>Mampara de baño a medida</strong>', formatMoney(650), 'ud'], ['<strong>Instalación</strong>', formatMoney(45), 'hora']])}<p>${toastBtn('Crear producto', 'Alta de producto (demostración).', 'btn btn--primary')}</p>`;
const paneCustomObjects = () => `<h2>Objetos personalizados</h2><p class="muted">Crea objetos propios cuando contactos, empresas, negocios y tickets no bastan.</p><div class="plan"><div><h3>Proyectos de obra</h3><p>Ejemplo de objeto personalizado con propiedades: Nombre, Superficie, Fecha de entrega.</p></div>${toastBtn('Crear objeto', 'La creación de objetos personalizados requiere el plan Enterprise.', 'btn btn--primary')}</div>`;
function paneImport() {
  const log = exportsLog();
  return `<div class="shead"><h2>Importar y exportar</h2><span class="ad-foot__btns"><a class="btn btn--ghost" href="../contacts/">Importar</a><button class="btn btn--primary" type="button" data-act="export-all">Exportar todos los datos</button></span></div><p class="muted">Las importaciones se hacen desde cada lista con "Importar". Aquí queda el historial.</p>${simpleTable(['Fecha', 'Tipo', 'Objeto', 'Registros'], log.map((e) => [esc(e.when), esc(e.kind), esc(e.object), String(e.count)]))}${log.length ? '' : '<p class="muted">Todavía no hay importaciones ni exportaciones registradas.</p>'}`;
}
function paneQuality() {
  const c = ALL.contacts();
  const kpi = (l, v) => `<div class="kpi"><span class="kpi__label">${l}</span><span class="kpi__value">${v}</span></div>`;
  return `<h2>Calidad de los datos</h2><p class="muted">Problemas detectados en tus registros.</p><div class="kpis">${kpi('Contactos sin correo', c.filter((r) => !r.email).length)}${kpi('Sin teléfono', c.filter((r) => !r.phone && !r.mobilephone).length)}${kpi('Sin empresa', c.filter((r) => !r.company).length)}${kpi('Posibles duplicados', c.length - new Set(c.map((r) => r.name.toLowerCase())).size)}</div>${togglePane('data-quality', '', '', [['autofix', 'Corregir formato automáticamente', 'Mayúsculas en nombres y formato de teléfonos.', true], ['dedupe', 'Sugerir fusiones de duplicados', 'Muestra duplicados en la ficha del registro.', true]])}`;
}
const paneEnrich = () => togglePane('data-enrich', 'Enriquecimiento de datos', 'Completa automáticamente datos de empresas y contactos.', [['companies', 'Enriquecer empresas', 'Sector, tamaño, dirección y web a partir del dominio.', true], ['contacts', 'Enriquecer contactos', 'Cargo y redes a partir del correo.', false]], infoList('Créditos', [['Usados este mes', '128 de 1.000'], ['Última ejecución', 'hoy 06:00']]));
const paneSync = () => `<h2>Sincronización de datos</h2><p class="muted">Sincroniza registros con otras herramientas en dos direcciones.</p>${cardGrid([['Google Contacts', 'Sincronizando contactos', toastBtn('Configurar', 'Configuración de sincronización (demostración)')], ['Mailchimp', 'No configurado', toastBtn('Conectar', 'Conectando con Mailchimp… (demostración)')], ['Shopify', 'No configurado', toastBtn('Conectar', 'Conectando con Shopify… (demostración)')], ['QuickBooks', 'No configurado', toastBtn('Conectar', 'Conectando con QuickBooks… (demostración)')]])}`;
function paneAudit() {
  const entries = [];
  try {
    Object.keys(localStorage).forEach((k) => {
      const m = k.match(/^crm:(\w+):history:(\d+)$/);
      if (m) (load(k, []) || []).forEach((h) => entries.push({ ...h, type: m[1], id: m[2] }));
    });
  } catch { /* ignore */ }
  entries.sort((a, b) => b.when - a.when);
  return `<h2>Registro de auditoría</h2><p class="muted">Cambios de propiedades hechos en las fichas.</p>${simpleTable(['Fecha', 'Usuario', 'Objeto', 'Registro', 'Propiedad', 'Antes', 'Después'], entries.slice(0, 100).map((e) => [formatDate(new Date(e.when)), esc(e.who), esc((OBJECTS.find((o) => o[0] === e.type) || [e.type, e.type])[1]), `<a href="../${e.type}/record/?id=${e.id}">#${e.id}</a>`, esc(e.key), `<span class="muted">${esc(String(e.from ?? '--')).slice(0, 40)}</span>`, esc(String(e.to ?? '--')).slice(0, 40)]))}${entries.length ? '' : '<p class="muted">Aún no hay cambios registrados. Edita una propiedad en una ficha y aparecerá aquí.</p>'}`;
}

// ---------- panes: tools ----------
const paneMkEmail = () => togglePane('mk-email', 'Correo de marketing', 'Ajustes de los envíos masivos.', [['footer', 'Pie de página legal', 'Añade la dirección física y el enlace de baja a cada correo.', true], ['doubleopt', 'Doble confirmación de suscripción', 'Pide confirmar el correo antes de enviar campañas.', false], ['sendtime', 'Hora de envío inteligente', 'Envía cuando cada contacto suele abrir.', true]], infoList('Remitente predeterminado', [['Nombre', 'Megaglass'], ['Dirección', 'noticias@megaglass.us'], ['Dirección física', 'Brickell AVE STE 950976, Miami, FL']]));
const paneMkForms = () => togglePane('mk-forms', 'Formularios', 'Comportamiento de los formularios incrustados.', [['create', 'Crear contactos desde envíos', 'Cada envío crea o actualiza un contacto.', true], ['notify', 'Avisar al propietario', 'Notificación por correo en cada envío.', true], ['captcha', 'Protección contra spam', 'Añade una comprobación invisible.', true]]);
const paneMkAds = () => `<h2>Anuncios</h2><p class="muted">Cuentas publicitarias conectadas.</p>${cardGrid([['Google Ads', 'Conectada', toastBtn('Desconectar', 'Cuenta desconectada (demostración)')], ['Meta Ads', 'Conectada', toastBtn('Desconectar', 'Cuenta desconectada (demostración)')], ['LinkedIn Ads', 'No conectada', toastBtn('Conectar', 'Conectando… (demostración)')]])}`;
const paneMkSocial = () => `<h2>Redes sociales</h2>${simpleTable(['Cuenta', 'Red', 'Estado'], [['<strong>@megaglass</strong>', 'Instagram', '<span class="tag tag--done">Conectada</span>'], ['<strong>Megaglass</strong>', 'LinkedIn', '<span class="tag tag--done">Conectada</span>'], ['<strong>Megaglass MX</strong>', 'Facebook', '<span class="tag tag--done">Conectada</span>']])}<p>${toastBtn('Conectar cuenta', 'Selecciona la red para conectar (demostración).', 'btn btn--primary')}</p>`;
const paneCtPages = () => togglePane('ct-pages', 'Páginas', 'Ajustes del editor de páginas.', [['drafts', 'Guardar borradores automáticamente', 'Cada 30 segundos.', true], ['amp', 'Versiones AMP', 'Genera versiones rápidas para móvil.', false]]);
const paneCtBlog = () => togglePane('ct-blog', 'Blog', 'Ajustes del blog corporativo.', [['comments', 'Permitir comentarios', 'Con moderación previa.', true], ['rss', 'Fuente RSS pública', 'Para lectores de noticias.', true]], infoList('Blog', [['Título', 'Blog de Megaglass'], ['URL', 'megaglass.com.mx/blog'], ['Autor predeterminado', 'Fernando Lovera Colin']]));
const paneSlDeals = () => `<h2>Negocios</h2><p class="muted">Pipeline, etapas y reglas al crear negocios.</p><div class="spanel">${objectPipelineHtml('deals')}</div>${togglePane('sl-deals', '', '', [['requireAmount', 'Exigir importe al crear', 'No permite negocios sin importe.', false], ['autoClose', 'Fecha de cierre automática', 'A 30 días si no se indica.', true]])}`;
const paneSlQuotes = () => togglePane('sl-quotes', 'Cotizaciones', 'Plantillas y firma electrónica.', [['esign', 'Firma electrónica', 'El cliente firma la cotización en línea.', true], ['pay', 'Pago desde la cotización', 'Requiere la cuenta de pagos.', false], ['approval', 'Aprobación interna', 'Las cotizaciones mayores de 20.000 € requieren aprobación.', true]], infoList('Numeración', [['Siguiente número', `COT-${Number(localStorage.getItem('crm:counter:COT') || 1040) + 1}`], ['Validez', '30 días']]));
const paneSlMeetings = () => `<h2>Reuniones</h2><p class="muted">Tus enlaces de reserva.</p>${simpleTable(['Enlace', 'Duración', ''], [['megaglass.us/reunion/fernando', '30 minutos'], ['megaglass.us/reunion/visita-tecnica', '60 minutos'], ['megaglass.us/reunion/equipo-ventas', '15 minutos (rotativo)']].map(([l, d]) => [`<strong>${l}</strong>`, d, `<button class="copy" type="button" data-copy="https://${l}" aria-label="Copiar">⧉</button>`]))}<p><a class="link-btn" href="#prefs-general" data-general="calendario">Configurar mi disponibilidad</a></p>`;
function paneSlTemplates() {
  const s = getSignature();
  return `<h2>Plantillas y firma</h2><h3>Firma de correo</h3>
    <form class="sform" data-save="signature">
      <div class="sform__row"><label class="field"><span>Nombre</span><input name="name" value="${esc(s.name)}" /></label><label class="field"><span>Cargo</span><input name="title" value="${esc(s.title)}" /></label><label class="field"><span>Empresa</span><input name="company" value="${esc(s.company)}" /></label></div>
      <div class="sform__row"><label class="field"><span>Teléfonos</span><input name="phones" value="${esc(s.phones)}" /></label><label class="field"><span>Correo</span><input name="email" value="${esc(s.email)}" /></label><label class="field"><span>Web</span><input name="web" value="${esc(s.web)}" /></label></div>
      <div class="sform__row"><label class="field"><span>Dirección</span><input name="address" value="${esc(s.address)}" /></label><label class="field"><span>Texto del botón</span><input name="cta" value="${esc(s.cta)}" /></label></div>
      <div class="sform__btns"><button class="btn btn--primary" type="submit">Guardar firma</button></div>
    </form>
    <h3>Plantillas de correo</h3>${simpleTable(['Nombre', 'Asunto'], emailTemplates().map((t) => [`<strong>${esc(t.name)}</strong>`, esc(t.subject)]))}`;
}
const paneSvTickets = () => `<h2>Tickets</h2><p class="muted">Pipeline de soporte y reglas de los tickets.</p><div class="spanel">${objectPipelineHtml('tickets')}</div>${togglePane('sv-tickets', '', '', [['fromEmail', 'Crear ticket desde cada correo entrante', 'Convierte los correos de la bandeja compartida en tickets.', true], ['survey', 'Encuesta de satisfacción al cerrar', 'Envía una encuesta cuando un ticket se cierra.', false]])}${infoList('Acuerdos de nivel de servicio', [['Primera respuesta', '4 horas laborables'], ['Resolución', '2 días laborables']])}`;
const paneSvInbox = () => togglePane('sv-inbox', 'Bandeja de entrada', 'Bandeja compartida del equipo.', [['assign', 'Asignación automática por turnos', 'Reparte las conversaciones nuevas.', true], ['away', 'Respuesta automática fuera de horario', 'L–V 9:00–18:00.', true], ['chat', 'Chat en el sitio web', 'Widget de chat conectado a la bandeja.', false]], infoList('Canales conectados', [['Correo', 'soporte@megaglass.us'], ['WhatsApp', '+52 712 690 1001'], ['Formulario', 'Contacto web']]));
const paneSvSurveys = () => `<h2>Encuestas de feedback</h2>${simpleTable(['Encuesta', 'Tipo', 'Respuestas', 'Estado'], [['<strong>Satisfacción tras ticket</strong>', 'CSAT', '42', '<span class="tag tag--done">Activa</span>'], ['<strong>Recomendación anual</strong>', 'NPS', '118', '<span class="tag tag--done">Activa</span>'], ['<strong>Instalación completada</strong>', 'CES', '9', '<span class="tag tag--none">Borrador</span>']])}`;
const paneSvKb = () => togglePane('sv-kb', 'Base de conocimientos', 'Centro de ayuda público.', [['public', 'Publicada', 'Visible en ayuda.megaglass.us.', true], ['feedback', 'Permitir valorar artículos', 'Pulgar arriba o abajo al final de cada artículo.', true]], infoList('Contenido', [['Artículos', '24'], ['Categorías', 'Instalación, Mantenimiento, Garantía']]));
const paneCalling = () => togglePane('tools-calling', 'Llamadas', 'Ajustes de llamadas para toda la cuenta.', [['record', 'Grabar llamadas', 'Con aviso al inicio de la llamada.', true], ['transcribe', 'Transcribir llamadas', 'Texto y resumen en la actividad.', false], ['inbound', 'Llamadas entrantes', 'Recibe llamadas al número de la cuenta.', true]], infoList('Números', [['Principal', '+52 712 690 1001'], ['Estados Unidos', '+1 305 753 0007']]));

const PANES = {
  'prefs-general': paneGeneral, 'prefs-notif': paneNotif, 'org-accounts': paneOrgAccounts, 'org-copy': paneOrgCopy,
  'account-defaults': paneDefaults, 'account-billing': paneBilling, 'data-audit': paneAudit, 'account-users': paneUsers, 'account-updates': paneUpdates,
  'int-connected': paneIntegrations, 'int-private': panePrivateApps, 'int-api': paneApiKey, 'int-webhooks': paneWebhooks, 'int-email': paneEmailIntegrations,
  'account-marketplace': paneMarketplace, 'track-code': paneTrackCode, 'track-analytics': paneTrackAnalytics, 'track-domains': () => paneTrackDomains(), 'track-utm': paneTrackUtm,
  'account-privacy': panePrivacy, 'account-security': paneAccountSecurity, 'account-ai': paneAI, 'account-payments': panePayments,
  'data-objects': paneObjects,
  'data-properties': paneProperties, 'data-import': paneImport, 'data-quality': paneQuality, 'data-enrich': paneEnrich, 'data-sync': paneSync,
  'mk-email': paneMkEmail, 'mk-forms': paneMkForms, 'mk-ads': paneMkAds, 'mk-social': paneMkSocial,
  'ct-pages': paneCtPages, 'ct-blog': paneCtBlog, 'ct-domains': () => paneTrackDomains('Dominios y URL'),
  'sl-deals': paneSlDeals, 'sl-quotes': paneSlQuotes, 'sl-meetings': paneSlMeetings, 'sl-products': paneProducts, 'sl-templates': paneSlTemplates,
  'sv-tickets': paneSvTickets, 'sv-inbox': paneSvInbox, 'sv-surveys': paneSvSurveys, 'sv-kb': paneSvKb,
  'tools-calling': paneCalling, 'tools-payments': panePayments,
};

// ---------- render ----------
function navItem(it) {
  if (Array.isArray(it)) {
    const [id, label, ext] = it;
    return `<a class="snav__item${state.section === id ? ' is-active' : ''}" href="#${id}" data-name="${esc(label.toLowerCase())}">${label}${ext ? ' <span class="snav__ext">↗</span>' : ''}</a>`;
  }
  const open = state.open.has(it.id);
  return `<div class="snav__parent${open ? ' is-open' : ''}" data-parent="${it.id}"><button class="snav__item snav__item--parent" type="button" data-toggle-parent="${it.id}" data-name="${esc(it.label.toLowerCase())}">${it.label} <span class="snav__chev">${open ? '⌃' : '⌄'}</span></button><div class="snav__children">${it.children.map(([id, label]) => `<a class="snav__item snav__item--child${state.section === id ? ' is-active' : ''}" href="#${id}" data-name="${esc(label.toLowerCase())}">${label}</a>`).join('')}</div></div>`;
}
// The settings menu can be collapsed to a slim rail; the choice is remembered.
const SNAV_KEY = 'crm:settings:navcollapsed';
state.navCollapsed = localStorage.getItem(SNAV_KEY) === '1';
function render() {
  const collapsed = state.navCollapsed;
  root.innerHTML = `
    <div class="settings${collapsed ? ' is-collapsed' : ''}">
      ${collapsed
        ? `<nav class="snav snav--rail" aria-label="Configuración">
            <button class="snav__collapse tip" type="button" data-act="snav-toggle" aria-expanded="false" aria-label="Expandir menú"><span aria-hidden="true">›</span><span class="tip__text">Expandir menú</span></button>
            <a class="snav__railback tip" href="../contacts/" aria-label="Volver"><span aria-hidden="true">‹</span><span class="tip__text">Volver</span></a>
          </nav>`
        : `<nav class="snav" aria-label="Configuración">
            <div class="snav__top"><a class="snav__back" href="../contacts/">‹ Volver</a><button class="snav__collapse tip" type="button" data-act="snav-toggle" aria-expanded="true" aria-label="Contraer menú"><span aria-hidden="true">‹</span><span class="tip__text">Contraer menú</span></button></div>
            <div class="search search--sm snav__search"><input type="search" id="snav-q" placeholder="Configuración de búsqueda" aria-label="Buscar en la configuración" /><span class="ico ico--search" aria-hidden="true"></span></div>
            ${NAV.map((g) => `<div class="snav__group" data-group><div class="snav__title">${g.title}</div>${g.items.map(navItem).join('')}</div>`).join('')}
          </nav>`}
      <section class="spane">${(PANES[state.section] || paneGeneral)()}</section>
    </div>
    ${state.logicEdit && (state.logicEdit.lifecycle || state.pipeEdit !== null) ? logicHtml() : ''}
    <div class="drawer drawer--modal" id="s-modal" aria-hidden="true"><div class="drawer__panel drawer__panel--dialog" role="dialog" aria-labelledby="s-modal-title"><div class="drawer__head drawer__head--light"><h2 id="s-modal-title">—</h2><button class="drawer__close" type="button" data-close aria-label="Cerrar">×</button></div><div class="drawer__body" id="s-modal-body"></div><div class="drawer__foot" id="s-modal-foot"></div></div></div>`;
  wireMenus(root);
  if (state.section === 'data-properties') {
    const q = document.getElementById('props-q');
    if (q && state.propsQuery) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
}
function openModal(title, body, foot) {
  document.getElementById('s-modal-title').textContent = title;
  document.getElementById('s-modal-body').innerHTML = body;
  document.getElementById('s-modal-foot').innerHTML = foot;
  const m = document.getElementById('s-modal');
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  m.querySelector('input, select')?.focus();
}
function closeModal() {
  const m = document.getElementById('s-modal');
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
}
function promptModal(title, fields, okLabel, onOk) {
  openModal(title, `<form id="pm-form" class="ad-form">${fields.map(([n, l, type, opts]) => (type === 'select' ? `<label class="field"><span>${l}</span><select name="${n}">${opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>` : `<label class="field"><span>${l}</span><input name="${n}" type="${type || 'text'}" ${type !== 'email' ? 'required' : ''} value="${esc(opts || '')}" /></label>`)).join('')}</form>`, `<button class="btn btn--primary" type="submit" form="pm-form">${okLabel}</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  document.getElementById('pm-form').onsubmit = (e) => { e.preventDefault(); onOk(Object.fromEntries(new FormData(e.target).entries())); closeModal(); render(); };
}

const PROP_KINDS = [['text', 'Texto de una línea'], ['textarea', 'Texto de varias líneas'], ['number', 'Número'], ['currency', 'Número (moneda)'], ['date', 'Selector de fecha'], ['enum', 'Selección desplegable'], ['bool', 'Casilla de verificación'], ['phone', 'Número de teléfono'], ['email', 'Correo'], ['url', 'URL']];
function propertyForm(type, existing) {
  const groups = propertyGroups(type);
  return `<form id="prop-form" class="ad-form">
      <label class="field"><span>Etiqueta</span><input name="label" required value="${esc(existing ? existing.label : '')}" placeholder="Por ejemplo: Tipo de vidrio" /></label>
      <label class="field"><span>Objeto</span><input value="${esc(OBJECTS.find((o) => o[0] === type)[1])}" disabled /></label>
      <label class="field"><span>Grupo</span><select name="group">${[...new Set(['Propiedades personalizadas', ...propGroupsStore(type), ...groups.map((g) => g.title)])].map((g) => `<option ${existing && existing.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label class="field"><span>Tipo de campo</span><select name="kind" id="prop-kind">${PROP_KINDS.map(([k, l]) => `<option value="${k}" ${existing && existing.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field" id="prop-options-field" ${existing && existing.kind === 'enum' ? '' : 'hidden'}><span>Opciones (una por línea)</span><textarea name="options" rows="4">${esc(existing && existing.options ? existing.options.join('\n') : '')}</textarea></label>
      <label class="field"><span>Descripción</span><input name="desc" value="${esc(existing ? existing.desc || '' : '')}" /></label>
    </form>`;
}
function saveProperty(type, existingKey) {
  const d = Object.fromEntries(new FormData(document.getElementById('prop-form')).entries());
  if (!d.label.trim()) return;
  const list = customProperties(type);
  const key = existingKey || `custom_${slug(d.label)}_${Date.now().toString(36)}`;
  const prop = { key, label: d.label.trim(), group: d.group, kind: d.kind === 'textarea' ? 'text' : d.kind, options: d.kind === 'enum' ? d.options.split('\n').map((s) => s.trim()).filter(Boolean) : d.kind === 'bool' ? ['Sí', 'No'] : undefined, desc: d.desc };
  const i = list.findIndex((p) => p.key === key);
  if (i >= 0) list[i] = prop; else list.push(prop);
  saveCustomProperties(type, list);
  closeModal();
  render();
  toast(existingKey ? 'Propiedad actualizada' : `Propiedad "${prop.label}" creada. Ya puedes añadirla como columna o a las tarjetas.`);
}

// ---------- events ----------
window.addEventListener('hashchange', () => { setSection(location.hash.slice(1)); render(); });
root.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-save]');
  if (!form) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form).entries());
  const what = form.dataset.save;
  if (what === 'profile') {
    if (d.phone && d.dial && d.phone.trim().startsWith(d.dial)) d.phone = d.phone.trim().slice(d.dial.length).replace(/^[-\s]+/, '');
    save('crm:profile', { ...profile(), ...d }); toast('Perfil guardado'); render();
  }
  else if (what === 'account') { save('crm:account', { ...account(), ...d }); toast('Valores de la cuenta guardados'); render(); }
  else if (what === 'currencies') {
    const rates = Object.fromEntries(Object.entries(d).filter(([k]) => CURRENCY_DEFS[k]).map(([k, v]) => [k, Number(v) > 0 ? Number(v) : currencyRates()[k]]));
    saveCurrencyRates(rates);
    toast('Tipos de cambio guardados');
    render();
  }
  else if (what === 'password') { form.reset(); toast('Contraseña actualizada'); }
  else if (what === 'signature') { setSignature(d); toast('Firma guardada'); }
  else if (what === 'ticketpipeline') {
    const name = (d.name || '').trim();
    const list = ticketPipelines();
    if (name && !list.includes(name)) { saveTicketPipelines([...list, name]); toast(`Pipeline "${name}" creado`); } else toast('Ese pipeline ya existe');
    render();
  }
  else if (what === 'copy') { const log = load('crm:copies', []); log.unshift({ when: formatDate(new Date()), res: d.res, to: d.to }); save('crm:copies', log); render(); toast(`"${d.res}" copiado a ${d.to}`); }
  else if (what === 'pipelabel') {
    const defs = dealPipelineDefs(); const p = defs[state.pipeEdit]; const list = labelsOf(p).slice(); const v = d.label.trim();
    if (v && !list.includes(v)) list.push(v);
    p.labelList = list; persistPipelines(defs, 'Etiqueta añadida'); render();
  }
  else if (what === 'lifecycle') {
    const def = collectLifecycle(lifecycleDef());
    const names = def.stages.map((s) => s[1].toLowerCase());
    if (new Set(names).size !== names.length) { toast('Dos etapas no pueden tener el mismo nombre'); return; }
    saveLifecycleDef(def);
    toast('Etapas del ciclo de vida guardadas: las listas usan los nombres nuevos al recargar');
    render();
  }
  else if (what === 'pipeline') {
    const defs = dealPipelineDefs();
    const p = defs[Number(form.dataset.pipe)];
    if (!p) return;
    const oldName = p.name;
    collectPipeline(p);
    if (defs.some((x, i) => i !== Number(form.dataset.pipe) && x.name.toLowerCase() === p.name.toLowerCase())) { toast('Ya existe un pipeline con ese nombre'); return; }
    if (oldName !== p.name) {
      // Keep the deals attached to the renamed pipeline.
      ALL.deals().filter((d) => d.pipeline === oldName).forEach((d) => setField('deals', d.id, 'pipeline', p.name));
    }
    persistPipelines(defs, 'Pipeline guardado');
    render();
  }
  else if (form.dataset.boardcard) {
    const keys = [...form.querySelectorAll('input[name="k"]:checked')].map((i) => i.value).slice(0, 4);
    if (!keys.length) { toast('Elige al menos una propiedad'); return; }
    save(`crm:${form.dataset.boardcard}:boardcard`, keys);
    render();
    toast('Tarjetas del tablero guardadas');
  }
  else if (what === 'label') { const labels = assocLabels(); if (!labels.includes(d.label.trim())) labels.push(d.label.trim()); save(ASSOC_LABELS_KEY, labels); render(); toast('Etiqueta añadida'); }
  else if (what.startsWith('general-')) { save(`crm:settings:${what}`, { ...setting(what, {}), ...d }); toast('Preferencias guardadas'); }
});
root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.setting) { const s = setting(t.dataset.setting, {}); s[t.dataset.key] = t.checked; save(`crm:settings:${t.dataset.setting}`, s); toast('Ajuste guardado'); if (t.dataset.key === 'connected') render(); }
  else if (t.dataset.notif) { const n = notif(); n[t.dataset.notif] = t.checked; save('crm:notif', n); toast('Preferencia guardada'); }
  else if (t.dataset.security) { save('crm:security', { ...load('crm:security', {}), [t.dataset.security]: t.checked }); toast(t.checked ? 'Autenticación en dos pasos activada' : 'Autenticación en dos pasos desactivada'); }
  else if (t.dataset.privacy) { save('crm:privacy', { ...load('crm:privacy', {}), [t.dataset.privacy]: t.checked }); toast('Ajuste guardado'); }
  else if (t.dataset.integration !== undefined) { const list = integrations(); list[Number(t.dataset.integration)].on = t.checked; save('crm:integrations', list); render(); toast(t.checked ? 'Integración conectada' : 'Integración desconectada'); }
  else if (t.dataset.userTeam !== undefined || t.dataset.userRole !== undefined) { const us = users(); const i = Number(t.dataset.userTeam ?? t.dataset.userRole); if (t.dataset.userTeam !== undefined) us[i].team = t.value; else us[i].role = t.value; save('crm:users', us); toast('Usuario actualizado'); }
  else if (t.dataset.userSeat !== undefined) { const us = userRows(); const u = us[Number(t.dataset.userSeat)]; u.seat = t.value; if (t.value === 'view') u.addons = []; saveUsers(us); save('crm:seatlog', [{ when: new Date().toISOString(), text: `${u.name}: licencia ${SEATS[t.value]}` }, ...seatLog()].slice(0, 30)); render(); toast('Licencia actualizada'); }
  else if (t.dataset.userAddon) { const us = userRows(); const u = us[Number(t.dataset.i)]; const k = t.dataset.userAddon; u.addons = (u.addons || []).filter((x) => x !== k); if (t.checked) u.addons.push(k); saveUsers(us); save('crm:seatlog', [{ when: new Date().toISOString(), text: `${u.name}: ${t.checked ? 'añadida' : 'quitada'} licencia ${SEATS[k]}` }, ...seatLog()].slice(0, 30)); render(); toast(t.checked ? `Licencia de ${SEATS[k]} asignada` : `Licencia de ${SEATS[k]} quitada`); }
  else if (t.hasAttribute('data-ucheck-all')) { root.querySelectorAll('[data-ucheck]').forEach((c) => { if (t.checked) state.uSel.add(c.dataset.ucheck); else state.uSel.delete(c.dataset.ucheck); }); render(); }
  else if (t.hasAttribute('data-ucheck')) { if (t.checked) state.uSel.add(t.dataset.ucheck); else state.uSel.delete(t.dataset.ucheck); render(); }
  else if (t.hasAttribute('data-objects-object')) { state.objectsObject = t.value; state.objectsTab = 'config'; window.history.replaceState(null, '', `#obj-${t.value}`); render(); }
  else if (t.hasAttribute('data-preview-team')) { state.previewTeam = t.value; render(); }
  else if (t.hasAttribute('data-pipe-select')) { state.pipeEdit = Number(t.value); render(); }
  else if (t.hasAttribute('data-logic-preview')) { state.logicEdit.preview = t.value; render(); }
  else if (t.dataset.logicPropReq !== undefined) { state.logicEdit.draft.props[Number(t.dataset.logicPropReq)].required = t.checked; render(); }
  else if (t.hasAttribute('data-cond-prop') || t.hasAttribute('data-cond-op')) { const L = state.logicEdit; const box = t.closest('.lcond--edit'); L.adding.prop = box.querySelector('[data-cond-prop]').value; L.adding.op = box.querySelector('[data-cond-op]').value; const v = box.querySelector('[data-cond-value]'); L.adding.value = L.adding.prop === 'Etapa del negocio' || L.adding.prop === 'Pipeline' ? '' : (v ? v.value : ''); render(); }
  else if (t.dataset.lcCalc) { const def = collectLifecycle(lifecycleDef()); const st = def.stages.find((s) => s[0] === t.dataset.lcCalc); if (st) st[3] = t.checked; saveLifecycleDef(def); toast(t.checked ? 'Propiedades calculadas habilitadas' : 'Propiedades calculadas deshabilitadas'); }
  else if (t.dataset.lcRule) { const def = lifecycleDef(); def.rules = { ...(def.rules || {}), [t.dataset.lcRule]: t.checked }; saveLifecycleDef(def); toast(t.checked ? 'Regla activada' : 'Regla desactivada'); render(); }
  else if (t.dataset.lcSync) { const def = lifecycleDef(); def.sync = { ...(def.sync || {}), [t.dataset.lcSync]: t.checked }; saveLifecycleDef(def); toast('Automatización guardada'); }
  else if (t.dataset.lcAuto) { const def = lifecycleDef(); def.automation = { ...(def.automation || {}) }; def.automation[t.dataset.stage] = { ...(def.automation[t.dataset.stage] || {}), [t.dataset.lcAuto]: t.checked }; saveLifecycleDef(def); toast('Automatización guardada'); render(); }
  else if (t.dataset.pipeRule) { const defs = dealPipelineDefs(); const p = defs[state.pipeEdit]; p.rules = { ...(p.rules || {}), [t.dataset.pipeRule]: t.checked }; persistPipelines(defs, t.checked ? 'Regla activada' : 'Regla desactivada'); render(); }
  else if (t.dataset.pipeAuto) { const defs = dealPipelineDefs(); const p = defs[state.pipeEdit]; p.automation = { ...(p.automation || {}) }; p.automation[t.dataset.stage] = { ...(p.automation[t.dataset.stage] || {}), [t.dataset.pipeAuto]: t.checked }; persistPipelines(defs, 'Automatización guardada'); render(); }
  else if (t.dataset.objsetting) {
    const s = objSetting(t.dataset.type);
    s[t.dataset.objsetting] = t.type === 'checkbox' ? t.checked : t.value;
    save(`crm:settings:obj-${t.dataset.type}`, s);
    toast('Ajuste guardado');
    if (t.type === 'checkbox' || t.type === 'radio') render();
  }
  else if (t.hasAttribute('data-props-object')) { state.propsObject = t.value; state.propsGroup = ''; state.propsKind = ''; state.propsPage = 1; state.propsSel = new Set(); render(); }
  else if (t.hasAttribute('data-props-group')) { state.propsGroup = t.value; render(); }
  else if (t.hasAttribute('data-rv-check-all')) { root.querySelectorAll('[data-rv-check]').forEach((c) => { if (t.checked) state.rvSel.add(c.dataset.rvCheck); else state.rvSel.delete(c.dataset.rvCheck); }); render(); }
  else if (t.hasAttribute('data-rv-check')) { if (t.checked) state.rvSel.add(t.dataset.rvCheck); else state.rvSel.delete(t.dataset.rvCheck); render(); }
  else if (t.hasAttribute('data-props-check-all')) { root.querySelectorAll('[data-props-check]').forEach((c) => { if (t.checked) state.propsSel.add(c.dataset.propsCheck); else state.propsSel.delete(c.dataset.propsCheck); }); render(); }
  else if (t.hasAttribute('data-props-check')) { if (t.checked) state.propsSel.add(t.dataset.propsCheck); else state.propsSel.delete(t.dataset.propsCheck); render(); }
  else if (t.id === 'prop-kind') { document.getElementById('prop-options-field').hidden = t.value !== 'enum'; }
  else if (t.id === 'pf-region') { const s = REGIONS[t.value]; document.getElementById('pf-sample').textContent = `Formato: ${s[0]}, ${s[1]}, ${s[2]} y ${s[3]}`; }
  else if (t.id === 'avatar-file') {
    const f = t.files && t.files[0];
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { toast('La imagen debe pesar menos de 1,5 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => { save('crm:profile', { ...profile(), avatar: String(reader.result) }); render(); toast('Imagen de perfil actualizada'); };
    reader.readAsDataURL(f);
  }
});
root.addEventListener('input', (e) => {
  if (e.target.id === 'props-q') { state.propsQuery = e.target.value; render(); }
  if (e.target.id === 'users-q') { state.uq = e.target.value; state.uPage = 1; render(); const q = document.getElementById('users-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  if (e.target.id === 'teams-q') { state.tq = e.target.value; render(); const q = document.getElementById('teams-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  if (e.target.id === 'rv-q') { state.rvQuery = e.target.value; render(); const q = document.getElementById('rv-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  if (e.target.id === 'pipe-q') { state.pipeQuery = e.target.value; render(); const q = document.getElementById('pipe-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  if (e.target.id === 'snav-q') {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll('.snav__item').forEach((a) => { a.hidden = Boolean(q) && !a.dataset.name.includes(q); });
    root.querySelectorAll('.snav__parent').forEach((p) => {
      const anyChild = [...p.querySelectorAll('.snav__item--child')].some((a) => !a.hidden);
      p.classList.toggle('is-open', q ? anyChild : state.open.has(p.dataset.parent));
      p.hidden = Boolean(q) && !anyChild && p.querySelector('.snav__item--parent').hidden;
    });
    root.querySelectorAll('[data-group]').forEach((g) => { g.hidden = Boolean(q) && [...g.querySelectorAll('.snav__item')].every((a) => a.hidden); });
  }
});
root.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target === document.getElementById('s-modal')) { closeModal(); return; }
  const tp = e.target.closest('[data-toggle-parent]');
  if (tp) { const id = tp.dataset.toggleParent; if (state.open.has(id)) state.open.delete(id); else state.open.add(id); render(); return; }
  const gt = e.target.closest('[data-general-tab]');
  if (gt) { state.generalTab = gt.dataset.generalTab; render(); return; }
  const gl = e.target.closest('[data-general]');
  if (gl) state.generalTab = gl.dataset.general;
  const cp = e.target.closest('[data-copy]');
  if (cp) { navigator.clipboard?.writeText(cp.dataset.copy); toast('Copiado'); return; }
  const tab = e.target.closest('[data-objects-tab]');
  if (tab) { state.objectsTab = tab.dataset.objectsTab; state.pipeEdit = null; render(); return; }
  const ptab = e.target.closest('[data-pipe-tab]');
  if (ptab) { state.pipeTab = ptab.dataset.pipeTab; render(); return; }
  // conditional property logic editor
  const le = e.target.closest('[data-logic-edit]');
  if (le) {
    if (le.dataset.logicLifecycle !== undefined) { const def = collectLifecycle(lifecycleDef()); saveLifecycleDef(def); openLogic(le.dataset.logicEdit, true, state.objectsObject); }
    else { const defs = dealPipelineDefs(); collectPipeline(defs[state.pipeEdit]); saveDealPipelineDefs(defs); openLogic(le.dataset.logicEdit); }
    render(); return;
  }
  if (state.logicEdit) {
    const L = state.logicEdit;
    const d = L.draft;
    const t = e.target;
    const hit = (sel) => t.closest(sel);
    if (hit('[data-logic-close]')) { state.logicEdit = null; render(); return; }
    if (hit('[data-logic-save]')) {
      const { p, persist } = logicTarget();
      p.logic = { ...(p.logic || {}), [L.stage]: d };
      p.required = { ...(p.required || {}), [L.stage]: d.props.filter((x) => x.required).map((x) => x.name) };
      persist('Lógica de propiedad guardada');
      state.logicEdit = null; render(); return;
    }
    if (hit('[data-logic-group-add]')) { const { p } = logicTarget(); d.groups.push({ conditions: [{ prop: stageProp(p), op: 'es igual a', value: stageValue(p, L.stage) }] }); render(); return; }
    const gc = hit('[data-logic-group-copy]'); if (gc) { d.groups.splice(Number(gc.dataset.logicGroupCopy) + 1, 0, JSON.parse(JSON.stringify(d.groups[Number(gc.dataset.logicGroupCopy)]))); render(); return; }
    const gr = hit('[data-logic-group-rm]'); if (gr) { if (d.groups.length > 1) d.groups.splice(Number(gr.dataset.logicGroupRm), 1); render(); return; }
    const cr = hit('[data-logic-cond-rm]'); if (cr) { const [gi, ci] = cr.dataset.logicCondRm.split(':').map(Number); d.groups[gi].conditions.splice(ci, 1); render(); return; }
    const ca = hit('[data-logic-cond-add]'); if (ca) { const { p } = logicTarget(); L.adding = { gi: Number(ca.dataset.logicCondAdd), prop: stageProp(p), op: 'es igual a', value: stageValue(p, L.stage) }; render(); return; }
    if (hit('[data-logic-cond-cancel]')) { L.adding = null; render(); return; }
    const cap = hit('[data-logic-cond-apply]'); if (cap) { const box = root.querySelector('.lcond--edit'); const v = box.querySelector('[data-cond-value]'); d.groups[Number(cap.dataset.logicCondApply)].conditions.push({ prop: box.querySelector('[data-cond-prop]').value, op: box.querySelector('[data-cond-op]').value, value: v ? v.value : '' }); L.adding = null; render(); return; }
    if (hit('[data-logic-prop-add]')) { L.addingProp = true; render(); return; }
    if (hit('[data-logic-prop-cancel]')) { L.addingProp = false; render(); return; }
    if (hit('[data-logic-prop-apply]')) { const pick = root.querySelector('[data-prop-pick]'); if (pick && pick.value) d.props.push({ name: pick.value, required: root.querySelector('[data-prop-pick-req]').checked }); L.addingProp = false; render(); return; }
    const pr = hit('[data-logic-prop-rm]'); if (pr) { d.props.splice(Number(pr.dataset.logicPropRm), 1); render(); return; }
  }
  // lifecycle stages (Etapa del ciclo de vida)
  const lcs = e.target.closest('[data-lc-sub]');
  if (lcs) { const def = collectLifecycle(lifecycleDef()); saveLifecycleDef(def); state.lcSub = lcs.dataset.lcSub; render(); return; }
  const lcc = e.target.closest('[data-lc-color]');
  if (lcc) { const def = collectLifecycle(lifecycleDef()); def.color = lcc.dataset.lcColor; saveLifecycleDef(def); render(); toast('Colores de las etapas guardados'); return; }
  const lcrm = e.target.closest('[data-lc-rm]');
  if (lcrm && !lcrm.disabled) { const def = collectLifecycle(lifecycleDef()); const st = def.stages.find((s) => s[0] === lcrm.dataset.lcRm); if (!st || !window.confirm(`¿Eliminar la etapa "${st[1]}"?`)) return; def.stages = def.stages.filter((s) => s[0] !== st[0]); saveLifecycleDef(def); render(); toast('Etapa eliminada'); return; }
  // record views (Personalización de registros)
  const rvs = e.target.closest('[data-rv-sort]');
  if (rvs) { const k = rvs.dataset.rvSort; state.rvSort = { key: k, dir: state.rvSort.key === k ? -state.rvSort.dir : 1 }; render(); return; }
  const rvAct = e.target.closest('[data-rv-rename], [data-rv-teams], [data-rv-clone], [data-rv-rm], [data-rv-reset]');
  if (rvAct) {
    closeMenus();
    const type = state.objectsObject;
    const list = recordViews(type);
    const d = rvAct.dataset;
    const stamp = (v) => { v.updated = new Date().toISOString(); v.by = 'Fernando Lovera Colin'; };
    if (d.rvReset !== undefined) { if (window.confirm('¿Restablecer la vista predeterminada a su diseño original?')) { if (viewsKind() === 'preview') { localStorage.removeItem(`crm:${type}:preview:default`); localStorage.removeItem(`crm:${type}:preview-updated`); } else { localStorage.removeItem(`crm:${type}:layout`); localStorage.removeItem(`crm:${type}:layout-updated`); } render(); toast('Vista predeterminada restablecida'); } return; }
    const v = list[Number(d.rvRename ?? d.rvTeams ?? d.rvClone ?? d.rvRm)];
    if (!v) return;
    if (d.rvRename !== undefined) promptModal('Cambiar nombre de la vista', [['name', 'Nombre de la vista', 'text', v.name]], 'Guardar', (f) => { const name = f.name.trim(); if (!name) return; state.rvSel.delete(v.name); v.name = name; stamp(v); saveRecordViews(type, list); toast('Nombre guardado'); });
    else if (d.rvTeams !== undefined) {
      openModal(`Asignar equipos: ${esc(v.name)}`, `<p class="muted">Los usuarios de estos equipos verán esta vista al abrir un ${OBJ_META[type].s.toLowerCase()}.</p><ul class="acc__list" id="rvt-list">${teams().map((t) => `<li><label><input type="checkbox" value="${esc(t.name)}" ${v.teams.includes(t.name) ? 'checked' : ''} /><span class="acc__ico" aria-hidden="true">👥</span><span>${esc(t.name)}</span></label></li>`).join('')}</ul>`, `<button class="btn btn--primary" type="button" id="rvt-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
      document.getElementById('rvt-save').onclick = () => { v.teams = [...document.querySelectorAll('#rvt-list input:checked')].map((i) => i.value); stamp(v); saveRecordViews(type, list); closeModal(); render(); toast('Equipos asignados'); };
    } else if (d.rvClone !== undefined) { const copy = { ...v, name: `${v.name} (copia)`, teams: [] }; stamp(copy); list.push(copy); saveRecordViews(type, list); render(); toast(`Vista "${copy.name}" creada`); }
    else if (d.rvRm !== undefined) { if (window.confirm(`¿Eliminar la vista "${v.name}"?`)) { list.splice(list.indexOf(v), 1); state.rvSel.delete(v.name); saveRecordViews(type, list); render(); toast('Vista eliminada'); } }
    return;
  }
  const psub = e.target.closest('[data-pipe-sub]');
  if (psub) { const defs = dealPipelineDefs(); collectPipeline(defs[state.pipeEdit]); saveDealPipelineDefs(defs); state.pipeSub = psub.dataset.pipeSub; render(); return; }
  const plrm = e.target.closest('[data-pipelabel-rm]');
  if (plrm) { const defs = dealPipelineDefs(); const p = defs[state.pipeEdit]; const list = labelsOf(p).slice(); list.splice(Number(plrm.dataset.pipelabelRm), 1); p.labelList = list; persistPipelines(defs, 'Etiqueta quitada'); render(); return; }
  const pcolor = e.target.closest('[data-stage-color]');
  if (pcolor) { const s = objSetting('deals'); s.stageColor = pcolor.dataset.stageColor; save('crm:settings:obj-deals', s); render(); toast('Colores del pipeline guardados'); return; }
  const pedit = e.target.closest('[data-pipe-edit]');
  if (pedit) { closeMenus(); state.pipeEdit = Number(pedit.dataset.pipeEdit); render(); return; }
  const pmove = e.target.closest('[data-pipe-move]');
  if (pmove) { closeMenus(); const defs = dealPipelineDefs(); const i = Number(pmove.dataset.i); const j = i + Number(pmove.dataset.pipeMove); if (j >= 0 && j < defs.length) { [defs[i], defs[j]] = [defs[j], defs[i]]; persistPipelines(defs, 'Orden de pipelines guardado'); render(); } return; }
  const pdef = e.target.closest('[data-pipe-default]');
  if (pdef) { closeMenus(); const defs = dealPipelineDefs(); const i = Number(pdef.dataset.pipeDefault); if (state.pipeEdit === i) collectPipeline(defs[i]); const [p] = defs.splice(i, 1); defs.unshift(p); if (state.pipeEdit !== null) state.pipeEdit = 0; persistPipelines(defs, `"${p.name}" es ahora el pipeline predeterminado`); render(); return; }
  const pdesc = e.target.closest('[data-pipe-desc]');
  if (pdesc) { const defs = dealPipelineDefs(); const p = defs[Number(pdesc.dataset.pipeDesc)]; promptModal(`Descripción de "${p.name}"`, [['desc', 'Descripción del pipeline', 'text', p.desc || '']], 'Guardar', (d) => { p.desc = d.desc.trim(); persistPipelines(defs, 'Descripción guardada'); }); return; }
  const pacc = e.target.closest('[data-pipe-access]');
  if (pacc) {
    closeMenus();
    openAccessDrawer(Number(pacc.dataset.pipeAccess));
    return;
  }
  const pclone = e.target.closest('[data-pipe-clone]');
  if (pclone) { closeMenus(); const defs = dealPipelineDefs(); const src = defs[Number(pclone.dataset.pipeClone)]; const copy = newPipelineDef(`${src.name} (copia)`, src.stages); copy.desc = src.desc; defs.push(copy); persistPipelines(defs, `Pipeline "${copy.name}" creado`); state.pipeEdit = defs.length - 1; render(); return; }
  const prm = e.target.closest('[data-pipe-rm]');
  if (prm) {
    closeMenus();
    const defs = dealPipelineDefs(); const i = Number(prm.dataset.pipeRm); const p = defs[i];
    const n = ALL.deals().filter((d) => d.pipeline === p.name).length;
    if (n) { toast(`"${p.name}" tiene ${n} negocios: muévelos a otro pipeline antes de eliminarlo`); return; }
    if (!window.confirm(`¿Eliminar el pipeline "${p.name}"?`)) return;
    defs.splice(i, 1); persistPipelines(defs, `Pipeline "${p.name}" eliminado`); render(); return;
  }
  const smove = e.target.closest('[data-stage-move]');
  if (smove) { const defs = dealPipelineDefs(); const p = collectPipeline(defs[state.pipeEdit]); const i = Number(smove.dataset.i); const j = i + Number(smove.dataset.stageMove); if (j >= 0 && j < p.stages.length) { [p.stages[i], p.stages[j]] = [p.stages[j], p.stages[i]]; persistPipelines(defs); render(); } return; }
  const srm = e.target.closest('[data-stage-rm]');
  if (srm) { const defs = dealPipelineDefs(); const p = collectPipeline(defs[state.pipeEdit]); p.stages = p.stages.filter((s) => s[0] !== srm.dataset.stageRm); persistPipelines(defs, 'Etapa eliminada'); render(); return; }
  const ut = e.target.closest('[data-user-toggle]');
  if (ut) { closeMenus(); const us = userRows(); const u = us[Number(ut.dataset.userToggle)]; u.status = u.status === 'Activo' ? 'Desactivado' : 'Activo'; saveUsers(us); render(); toast(`Usuario ${u.status.toLowerCase()}`); return; }
  // users & teams tabs
  const utb = e.target.closest('[data-utab]');
  if (utb) { state.utab = utb.dataset.utab; render(); return; }
  const uset = e.target.closest('[data-uset]');
  if (uset) { closeMenus(); state.uFilter[uset.dataset.uset] = uset.dataset.value; state.uPage = 1; render(); return; }
  const usrt = e.target.closest('[data-usort]');
  if (usrt) { const k = usrt.dataset.usort; state.uSort = { key: k, dir: state.uSort.key === k ? -state.uSort.dir : 1 }; render(); return; }
  const upg = e.target.closest('[data-upage]');
  if (upg && !upg.disabled) { state.uPage = Math.max(1, Number(upg.dataset.upage)); render(); return; }
  const usz = e.target.closest('[data-usize]');
  if (usz) { closeMenus(); state.uSize = Number(usz.dataset.usize); state.uPage = 1; render(); return; }
  const uact = e.target.closest('[data-uact]');
  if (uact) {
    closeMenus();
    const us = userRows(); const i = Number(uact.dataset.i); const u = us[i]; const a2 = uact.dataset.uact;
    if (a2 === 'edit') userModal(i);
    else if (a2 === 'perms') permsModal(i);
    else if (a2 === 'super') { u.role = u.role === 'Superadministrador' ? 'Administrador' : 'Superadministrador'; saveUsers(us); render(); toast(u.role === 'Superadministrador' ? `${u.name} ahora es superadministrador` : `${u.name} ya no es superadministrador`); }
    else if (a2 === 'resend') { toast(`Invitación reenviada a ${u.email}`); }
    else if (a2 === 'rm') { if (window.confirm(`¿Eliminar al usuario ${u.name}? Sus registros pasarán a "Sin asignar".`)) { us.splice(i, 1); saveUsers(us); state.uSel.delete(u.email); render(); toast('Usuario eliminado'); } }
    return;
  }
  const sf = e.target.closest('[data-seatfilter]');
  if (sf) { state.uFilter.seat = state.uFilter.seat === sf.dataset.seatfilter ? '' : sf.dataset.seatfilter; render(); return; }
  const te = e.target.closest('[data-team-edit]');
  if (te) { closeMenus(); teamModal(Number(te.dataset.teamEdit)); return; }
  const tc = e.target.closest('[data-team-child]');
  if (tc) { closeMenus(); teamModal(null, teams()[Number(tc.dataset.teamChild)].name); return; }
  const pe2 = e.target.closest('[data-preset-edit]');
  if (pe2) { closeMenus(); presetModal(Number(pe2.dataset.presetEdit)); return; }
  const pc2 = e.target.closest('[data-preset-clone]');
  if (pc2) { closeMenus(); const list = presets(); const src = list[Number(pc2.dataset.presetClone)]; list.push({ ...src, id: `p${Date.now().toString(36)}`, name: `${src.name} (copia)`, teams: [], users: [], updated: new Date().toISOString(), by: 'Fernando Lovera Colin' }); savePresets(list); render(); toast('Ajuste clonado'); return; }
  const pr2 = e.target.closest('[data-preset-rm]');
  if (pr2) { closeMenus(); const list = presets(); const p = list[Number(pr2.dataset.presetRm)]; if (p && window.confirm(`¿Eliminar el ajuste "${p.name}"?`)) { list.splice(Number(pr2.dataset.presetRm), 1); savePresets(list); render(); toast('Ajuste eliminado'); } return; }
  const pl = e.target.closest('[data-props-object-link]');
  if (pl) { state.propsObject = pl.dataset.propsObjectLink; state.propsGroup = ''; state.propsQuery = ''; state.propsTab = 'list'; state.propsPage = 1; }
  const ptab2 = e.target.closest('[data-props-tab]');
  if (ptab2) { state.propsTab = ptab2.dataset.propsTab; render(); return; }
  const pset = e.target.closest('[data-props-set]');
  if (pset) { closeMenus(); const map = { group: 'propsGroup', kind: 'propsKind', user: 'propsUser', filter: 'propsFilter' }; state[map[pset.dataset.propsSet]] = pset.dataset.value; state.propsPage = 1; if (pset.hasAttribute('data-goto-list')) state.propsTab = 'list'; render(); return; }
  const psort = e.target.closest('[data-props-sort]');
  if (psort) { const k = psort.dataset.propsSort; state.propsSort = { key: k, dir: state.propsSort.key === k ? -state.propsSort.dir : 1 }; render(); return; }
  const ppage = e.target.closest('[data-props-page]');
  if (ppage && !ppage.disabled) { state.propsPage = Math.max(1, Number(ppage.dataset.propsPage)); render(); return; }
  const psize = e.target.closest('[data-props-size]');
  if (psize) { closeMenus(); state.propsSize = Number(psize.dataset.propsSize); state.propsPage = 1; render(); return; }
  const parch = e.target.closest('[data-prop-archive], [data-prop-restore]');
  if (parch) { closeMenus(); const k = parch.dataset.propArchive || parch.dataset.propRestore; const list = customProperties(state.propsObject); const p = list.find((x) => x.key === k); if (p) { p.archived = Boolean(parch.dataset.propArchive); saveCustomProperties(state.propsObject, list); } render(); toast(parch.dataset.propArchive ? 'Propiedad archivada' : 'Propiedad restaurada'); return; }
  const pgrm = e.target.closest('[data-propgroup-rm]');
  if (pgrm) { save(`crm:propgroups:${state.propsObject}`, propGroupsStore(state.propsObject).filter((g) => g !== pgrm.dataset.propgroupRm)); render(); toast('Grupo eliminado'); return; }
  const rm = e.target.closest('[data-team-rm], [data-label-rm], [data-app-rm], [data-hook-rm], [data-pipeline-rm], [data-ticketpipe-rm], [data-recordview-rm]');
  if (rm) {
    const d = rm.dataset;
    if (d.pipelineRm !== undefined) { const list = dealPipelines(); const [p] = list.splice(Number(d.pipelineRm), 1); saveDealPipelines(list); toast(`Pipeline "${p}" eliminado`); }
    else if (d.ticketpipeRm !== undefined) { const list = ticketPipelines(); const [p] = list.splice(Number(d.ticketpipeRm), 1); saveTicketPipelines(list); toast(`Pipeline "${p}" eliminado`); }
    else if (d.recordviewRm !== undefined) { const list = recordViews(d.type); list.splice(Number(d.recordviewRm), 1); saveRecordViews(d.type, list); toast('Vista eliminada'); }
    else if (d.teamRm !== undefined) { const ts = teams(); const [t] = ts.splice(Number(d.teamRm), 1); save('crm:teams', ts); toast(`Equipo "${t.name}" eliminado`); }
    else if (d.labelRm !== undefined) { const labels = assocLabels(); labels.splice(Number(d.labelRm), 1); save(ASSOC_LABELS_KEY, labels); toast('Etiqueta quitada'); }
    else if (d.appRm !== undefined) { const apps = load('crm:privateapps', []); apps.splice(Number(d.appRm), 1); save('crm:privateapps', apps); toast('Aplicación eliminada'); }
    else { const hooks = load('crm:webhooks', []); hooks.splice(Number(d.hookRm), 1); save('crm:webhooks', hooks); toast('Suscripción eliminada'); }
    render();
    return;
  }
  const pe = e.target.closest('[data-prop-edit]');
  if (pe) { const p = customProperties(state.propsObject).find((x) => x.key === pe.dataset.propEdit); openModal('Editar propiedad', propertyForm(state.propsObject, p), `<button class="btn btn--primary" type="button" id="prop-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`); document.getElementById('prop-save').onclick = () => saveProperty(state.propsObject, p.key); return; }
  const pr = e.target.closest('[data-prop-rm]');
  if (pr) { if (window.confirm('¿Eliminar esta propiedad personalizada?')) { saveCustomProperties(state.propsObject, customProperties(state.propsObject).filter((x) => x.key !== pr.dataset.propRm)); render(); toast('Propiedad eliminada'); } return; }
  const pv = e.target.closest('[data-prop-view]');
  if (pv) { const p = propertyList(state.propsObject).find((x) => x.key === pv.dataset.propView); openModal(p.label, `<dl class="props"><div class="props__row"><dt>Nombre interno</dt><dd>${esc(p.key)}</dd></div><div class="props__row"><dt>Tipo</dt><dd>${esc(KINDS[p.kind] || p.kind)}</dd></div><div class="props__row"><dt>Grupo</dt><dd>${esc(p.group)}</dd></div>${p.options ? `<div class="props__row"><dt>Opciones</dt><dd>${p.options.map(esc).join(', ')}</dd></div>` : ''}<div class="props__row"><dt>Usada en</dt><dd>${ALL[state.propsObject]().filter((r) => r[p.key] !== undefined && r[p.key] !== '').length} registros</dd></div></dl>`, `<button class="btn btn--ghost" type="button" data-close>Cerrar</button>`); return; }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  const a = act.dataset.act;
  closeMenus();
  if (a === 'toast') toast(act.dataset.msg);
  else if (a === 'pipe-back') { state.pipeEdit = null; state.pipeSub = 'configure'; render(); }
  else if (a === 'pipe-desc') { const defs = dealPipelineDefs(); const p = collectPipeline(defs[state.pipeEdit]); promptModal('Descripción del pipeline', [['desc', 'Descripción', 'text', p.desc || '']], 'Guardar', (d) => { p.desc = d.desc.trim(); persistPipelines(defs, 'Descripción guardada'); }); }
  else if (a === 'pipe-rename') { const defs = dealPipelineDefs(); const p = collectPipeline(defs[state.pipeEdit]); promptModal('Cambiar nombre del pipeline', [['name', 'Nombre', 'text', p.name]], 'Guardar', (d) => { const name = d.name.trim(); if (!name || defs.some((x) => x !== p && x.name.toLowerCase() === name.toLowerCase())) { toast('Ese nombre no está disponible'); return; } const old = p.name; p.name = name; ALL.deals().filter((x) => x.pipeline === old).forEach((x) => setField('deals', x.id, 'pipeline', name)); persistPipelines(defs, 'Nombre guardado'); }); }
  else if (a === 'board-header') {
    const defs = dealPipelineDefs(); const p = defs[state.pipeEdit]; const b = { count: true, sum: true, weighted: false, ...(p.board || {}) };
    openModal('Encabezado/pie de página del tablero', `<p class="muted">Qué se muestra en cada etapa del tablero de «${esc(p.name)}» para todos los usuarios.</p><form id="bh-form">${[['count', 'Número de negocios'], ['sum', 'Importe total de la etapa'], ['weighted', 'Importe ponderado por probabilidad']].map(([k, l]) => `<label class="ocheck"><input type="checkbox" name="${k}" ${b[k] ? 'checked' : ''} /><span><strong>${l}</strong></span></label>`).join('')}</form>`, `<button class="btn btn--primary" type="button" id="bh-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
    document.getElementById('bh-save').onclick = () => { const f = document.getElementById('bh-form'); p.board = { count: f.elements.count.checked, sum: f.elements.sum.checked, weighted: f.elements.weighted.checked }; persistPipelines(defs, 'Encabezado del tablero guardado'); closeModal(); };
  }
  else if (a === 'lc-banner-close') { state.lcBannerHidden = true; render(); }
  else if (a === 'lc-desc') { const def = collectLifecycle(lifecycleDef()); promptModal('Descripción del pipeline', [['desc', 'Descripción', 'text', def.desc || '']], 'Guardar', (d) => { def.desc = d.desc.trim(); saveLifecycleDef(def); toast('Descripción guardada'); }); }
  else if (a === 'lc-stage-add') {
    const def = collectLifecycle(lifecycleDef());
    const n = def.stages.length + 1;
    const id = `stage${Date.now().toString(36)}`;
    const i = def.stages.findIndex((s) => s[0] === 'other');
    def.stages.splice(i < 0 ? def.stages.length : i, 0, [id, `Etapa ${n}`, '', true]);
    saveLifecycleDef(def); render();
    const inp = root.querySelector(`[data-lc-label="${id}"]`); if (inp) { inp.focus(); inp.select(); }
    toast('Etapa añadida: cámbiale el nombre y guarda');
  }
  else if (a === 'lc-reset') { if (window.confirm('¿Restablecer las etapas del ciclo de vida a las predeterminadas? Se perderán los nombres, reglas y automatizaciones.')) { localStorage.removeItem('crm:lifecycle'); render(); toast('Etapas restablecidas'); } }
  else if (a === 'lc-required') {
    const def = lifecycleDef(); const k = act.dataset.stage; const cur = (def.required && def.required[k]) || [];
    const opts = ['Propietario', 'Correo', 'Número de teléfono', 'Empresa', 'Estado del lead', 'Fuente original', 'País/región', 'Sector', 'Nombre de dominio'];
    openModal(`Propiedades obligatorias: ${esc(labelOfStage(def, k))}`, `<form id="rq-form" class="ocardgrid ocardgrid--modal">${opts.map((o) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="k" value="${esc(o)}" ${cur.includes(o) ? 'checked' : ''} /><span>${o}</span></label>`).join('')}</form>`, `<button class="btn btn--primary" type="button" id="rq-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
    document.getElementById('rq-save').onclick = () => { def.required = { ...(def.required || {}), [k]: [...document.querySelectorAll('#rq-form input:checked')].map((i) => i.value) }; saveLifecycleDef(def); toast('Propiedades obligatorias guardadas'); closeModal(); render(); };
  }
  else if (a === 'pipe-required') {
    const defs = dealPipelineDefs(); const p = defs[state.pipeEdit]; const k = act.dataset.stage; const cur = (p.required && p.required[k]) || [];
    const opts = ['Importe', 'Fecha de cierre', 'Empresa asociada', 'Contacto asociado', 'Prioridad', 'Tipo de negocio', 'Propietario del negocio', 'Siguiente paso'];
    openModal(`Propiedades obligatorias: ${esc(labelOfStage(p, k))}`, `<form id="rq-form" class="ocardgrid ocardgrid--modal">${opts.map((o) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="k" value="${esc(o)}" ${cur.includes(o) ? 'checked' : ''} /><span>${o}</span></label>`).join('')}</form>`, `<button class="btn btn--primary" type="button" id="rq-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
    document.getElementById('rq-save').onclick = () => { p.required = { ...(p.required || {}), [k]: [...document.querySelectorAll('#rq-form input:checked')].map((i) => i.value) }; persistPipelines(defs, 'Propiedades obligatorias guardadas'); closeModal(); render(); };
  }
  else if (a === 'stage-add') {
    const defs = dealPipelineDefs(); const p = collectPipeline(defs[state.pipeEdit]);
    const key = `stage_${Date.now().toString(36)}`;
    const i = p.stages.findIndex((s) => s[0] === 'won');
    p.stages.splice(i < 0 ? p.stages.length : i, 0, [key, `Etapa ${p.stages.length + 1}`, 50]);
    persistPipelines(defs, 'Etapa añadida: cámbiale el nombre'); render();
    const inp = root.querySelector(`[data-stage-label="${key}"]`); if (inp) { inp.focus(); inp.select(); }
  }
  else if (a === 'clone-pipeline') openPipelinePanel('clone');
  else if (a === 'snav-toggle') { state.navCollapsed = !state.navCollapsed; localStorage.setItem(SNAV_KEY, state.navCollapsed ? '1' : '0'); render(); }
  else if (a === 'ix-columns') openIndexPicker('columns', act.dataset.type);
  else if (a === 'ix-filters') openIndexPicker('filters', act.dataset.type);
  else if (a === 'ix-board') openIndexPicker('board', act.dataset.type);
  else if (a === 'reset-boardcard') { localStorage.removeItem(`crm:${act.dataset.type}:boardcard`); render(); toast('Tarjetas del tablero restablecidas'); }
  else if (a === 'new-recordview') promptModal('Crear vista de equipo', [['name', 'Nombre de la vista'], ['teams', 'Asignar al equipo', 'select', teams().map((t) => t.name)]], 'Crear', (d) => { const type = act.dataset.type; const list = recordViews(type); const name = d.name.trim(); if (!name) return; if (list.some((v) => v.name.toLowerCase() === name.toLowerCase())) { toast('Ya existe una vista con ese nombre'); return; } list.push({ name, teams: [d.teams], updated: new Date().toISOString(), by: 'Fernando Lovera Colin' }); saveRecordViews(type, list); toast(`Vista "${name}" creada`); });
  else if (a === 'rv-delete-sel') { const type = act.dataset.type; const list = recordViews(type).filter((v) => !state.rvSel.has(v.name)); saveRecordViews(type, list); state.rvSel = new Set(); render(); toast('Vistas eliminadas'); }
  else if (a === 'rv-clear-sel') { state.rvSel = new Set(); render(); }
  else if (a === 'customize-create') {
    const type = act.dataset.type;
    const saved = load(`crm:${type}:createform`, null);
    const list = propertyList(type).slice(0, 36);
    openModal(`Formulario "Crear ${OBJ_META[type].s}"`, `<p class="muted">Marca los campos que aparecen al crear un ${OBJ_META[type].s.toLowerCase()}.</p><form id="cf-form" class="ocardgrid ocardgrid--modal">${list.map((p, i) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="k" value="${esc(p.key)}" ${saved ? (saved.includes(p.key) ? 'checked' : '') : i < 8 ? 'checked' : ''} /><span>${esc(p.label)}</span></label>`).join('')}</form>`, `<button class="btn btn--primary" type="button" id="cf-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
    document.getElementById('cf-save').onclick = () => { const keys = [...document.querySelectorAll('#cf-form input:checked')].map((i) => i.value); save(`crm:${type}:createform`, keys); closeModal(); toast(`Formulario guardado con ${keys.length} campos`); };
  }
  else if (a === 'new-pipeline') openPipelinePanel('new');
  else if (a === 'avatar-rm') { const p = profile(); delete p.avatar; save('crm:profile', p); render(); toast('Imagen de perfil quitada'); }
  else if (a === 'props-export' || a === 'props-export-sel') {
    const rows = propertyRows(state.propsObject).filter((p) => a === 'props-export' || state.propsSel.has(p.key));
    const csv = ['Nombre;Nombre interno;Tipo;Grupo;Creado por;Se usa en;Tasa de completación', ...rows.map((p) => [p.label, p.key, KINDS[p.kind] || p.kind, p.group, p.creator, p.used, `${p.rate}%`].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))].join('\n');
    download(`propiedades-${state.propsObject}.csv`, csv);
    toast(`${rows.length} propiedades exportadas`);
  }
  else if (a === 'props-archive-sel') { const list = customProperties(state.propsObject); let n = 0; list.forEach((p) => { if (state.propsSel.has(p.key) && !p.archived) { p.archived = true; n += 1; } }); saveCustomProperties(state.propsObject, list); state.propsSel = new Set(); render(); toast(n ? `${n} propiedad${n > 1 ? 'es' : ''} archivada${n > 1 ? 's' : ''}` : 'Solo se pueden archivar propiedades personalizadas'); }
  else if (a === 'props-clear-sel') { state.propsSel = new Set(); render(); }
  else if (a === 'excluded-domains') {
    const list = load('crm:companies:excluded-domains', ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com']);
    openModal('Dominios excluidos de la asociación automática', `<p class="muted">Los contactos con estos dominios de correo no crean ni se asocian a una empresa automáticamente.</p><ul class="chips-list" id="exd-list">${list.map((d, i) => `<li><span class="chip">${esc(d)} <button class="chip__x" type="button" data-exd-rm="${i}" aria-label="Quitar">×</button></span></li>`).join('')}</ul><form id="exd-form" class="sform sform--inline"><input class="cellpop__input cellpop__input--sm" name="d" placeholder="ejemplo.com" required /><button class="btn btn--primary" type="submit">Añadir</button></form>`, `<button class="btn btn--ghost" type="button" data-close>Cerrar</button>`);
    const saveList = (l) => { save('crm:companies:excluded-domains', l); closeModal(); render(); act.click(); };
    document.getElementById('exd-form').onsubmit = (ev) => { ev.preventDefault(); const d = ev.target.elements.d.value.trim().toLowerCase(); if (d && !list.includes(d)) list.push(d); saveList(list); toast('Dominio excluido'); };
    document.getElementById('exd-list').addEventListener('click', (ev) => { const b = ev.target.closest('[data-exd-rm]'); if (!b) return; list.splice(Number(b.dataset.exdRm), 1); saveList(list); toast('Dominio quitado'); });
  }
  else if (a === 'new-propgroup') promptModal('Crear grupo de propiedades', [['name', 'Nombre del grupo']], 'Crear', (d) => { const list = propGroupsStore(state.propsObject); const name = d.name.trim(); if (name && !list.includes(name)) list.push(name); save(`crm:propgroups:${state.propsObject}`, list); toast(`Grupo "${name}" creado`); });
  else if (a === 'new-prop') { openModal('Crear propiedad', propertyForm(state.propsObject), `<button class="btn btn--primary" type="button" id="prop-save">Crear</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`); document.getElementById('prop-save').onclick = () => saveProperty(state.propsObject); }
  else if (a === 'new-user') userModal(null);
  else if (a === 'new-team') teamModal(null);
  else if (a === 'new-preset') presetModal(null);
  else if (a === 'users-clear') { state.uFilter = { perm: '', team: '', active: '', status: '', seat: '' }; state.uq = ''; state.uPage = 1; render(); }
  else if (a === 'export-users' || a === 'ubulk-export') {
    const rows = userRows().filter((u) => a === 'export-users' || state.uSel.has(u.email));
    download(`usuarios-omni.csv`, ['Nombre;Correo;Equipo;Acceso;Licencia;Estado;Último activo', ...rows.map((u) => [u.name, u.email, u.team, u.role, SEATS[u.seat] || '', u.status, formatDate(u.lastActive)].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n'));
    toast(`${rows.length} usuarios exportados`);
  }
  else if (a === 'ubulk-team') promptModal('Asignar equipo', [['team', 'Equipo', 'select', teams().map((t) => t.name)]], 'Asignar', (d) => { const us = userRows(); us.forEach((u) => { if (state.uSel.has(u.email)) u.team = d.team; }); saveUsers(us); state.uSel = new Set(); toast('Equipo asignado'); });
  else if (a === 'ubulk-role') promptModal('Cambiar permisos', [['role', 'Nivel de acceso', 'select', ROLES]], 'Aplicar', (d) => { const us = userRows(); us.forEach((u) => { if (state.uSel.has(u.email)) u.role = d.role; }); saveUsers(us); state.uSel = new Set(); toast('Permisos actualizados'); });
  else if (a === 'ubulk-off') { const us = userRows(); let n = 0; us.forEach((u) => { if (state.uSel.has(u.email) && u.status !== 'Desactivado' && u.role !== 'Superadministrador') { u.status = 'Desactivado'; n += 1; } }); saveUsers(us); state.uSel = new Set(); render(); toast(`${n} usuario${n === 1 ? '' : 's'} desactivado${n === 1 ? '' : 's'}`); }
  else if (a === 'ubulk-clear') { state.uSel = new Set(); render(); }
  else if (a === 'seats-buy') { const totals = SEAT_TOTALS(); totals[act.dataset.seat] = (totals[act.dataset.seat] || 0) + 1; save('crm:seats', totals); save('crm:seatlog', [{ when: new Date().toISOString(), text: `Se añadió una licencia de ${SEATS[act.dataset.seat]}` }, ...seatLog()].slice(0, 30)); render(); toast(`Licencia de ${SEATS[act.dataset.seat]} añadida`); }
  else if (a === 'new-app') promptModal('Crear aplicación privada', [['name', 'Nombre'], ['scopes', 'Permisos', 'text', 'crm.objects.contacts.read']], 'Crear', (d) => { const apps = load('crm:privateapps', []); apps.push({ ...d, created: formatDate(new Date()) }); save('crm:privateapps', apps); toast('Aplicación creada: copia el token ahora'); });
  else if (a === 'new-webhook') promptModal('Crear suscripción de webhook', [['event', 'Evento', 'select', ['contact.creation', 'contact.propertyChange', 'deal.creation', 'deal.propertyChange', 'ticket.creation']], ['url', 'URL de destino', 'url']], 'Crear', (d) => { const hooks = load('crm:webhooks', []); hooks.push(d); save('crm:webhooks', hooks); toast('Suscripción creada'); });
  else if (a === 'save-pipeline') {
    const ov = {};
    root.querySelectorAll('[data-stage-label]').forEach((inp) => { ov[inp.dataset.stageLabel] = { ...(ov[inp.dataset.stageLabel] || {}), label: inp.value.trim() }; });
    root.querySelectorAll('[data-stage-prob]').forEach((inp) => { ov[inp.dataset.stageProb] = { ...(ov[inp.dataset.stageProb] || {}), prob: Number(inp.value) }; });
    save(PIPELINE_KEY(act.dataset.type), ov);
    toast('Pipeline guardado. Los cambios se ven al recargar las listas.');
  } else if (a === 'reset-pipeline') { localStorage.removeItem(PIPELINE_KEY(act.dataset.type)); toast('Pipeline restablecido. Recarga para ver los nombres originales.'); }
  else if (a === 'export-all') {
    const log = exportsLog();
    OBJECTS.forEach(([k, l]) => log.unshift({ when: formatDate(new Date()), kind: 'Exportación', object: l, count: ALL[k]().length }));
    save('crm:exports', log.slice(0, 50));
    render();
    toast('Exportación completa en preparación: recibirás un correo con el archivo.');
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ---------- drag-and-drop ordering of pipelines and stages (⋮⋮ handle) ----------
let dnd = null;
function moveRow(kind, from, to) {
  const defs = dealPipelineDefs();
  if (kind === 'lcstages') {
    const def = collectLifecycle(lifecycleDef());
    const [s] = def.stages.splice(from, 1);
    def.stages.splice(to, 0, s);
    saveLifecycleDef(def);
    toast('Orden de etapas guardado');
    render();
    return;
  }
  if (kind === 'pipes') {
    const [p] = defs.splice(from, 1);
    defs.splice(to, 0, p);
    if (state.pipeEdit !== null) state.pipeEdit = defs.indexOf(p) === -1 ? state.pipeEdit : state.pipeEdit;
    persistPipelines(defs, to === 0 ? `"${p.name}" es ahora el pipeline predeterminado` : 'Orden de pipelines guardado');
  } else {
    const p = collectPipeline(defs[state.pipeEdit]);
    const [s] = p.stages.splice(from, 1);
    p.stages.splice(to, 0, s);
    persistPipelines(defs, 'Orden de etapas guardado');
  }
  render();
}
root.addEventListener('mousedown', (e) => {
  const h = e.target.closest('.phandle');
  const tr = h && h.closest('tr[data-row]');
  if (tr && tr.closest('[data-dnd]')) tr.draggable = true;
});
root.addEventListener('dragstart', (e) => {
  const tr = e.target.closest ? e.target.closest('tr[data-row]') : null;
  if (!tr || !tr.draggable) return;
  dnd = { kind: tr.closest('[data-dnd]').dataset.dnd, from: Number(tr.dataset.row) };
  tr.classList.add('is-dragging');
  if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dnd.from)); } catch { /* ignore */ } }
});
const clearOver = () => root.querySelectorAll('.is-over-top, .is-over-bottom').forEach((x) => x.classList.remove('is-over-top', 'is-over-bottom'));
const isUpperHalf = (tr, e) => { const r = tr.getBoundingClientRect(); return r.height ? e.clientY < r.top + r.height / 2 : false; };
root.addEventListener('dragover', (e) => {
  if (!dnd) return;
  const tr = e.target.closest('tr[data-row]');
  if (!tr || tr.closest('[data-dnd]').dataset.dnd !== dnd.kind) return;
  e.preventDefault();
  clearOver();
  tr.classList.add(isUpperHalf(tr, e) ? 'is-over-top' : 'is-over-bottom');
});
root.addEventListener('drop', (e) => {
  if (!dnd) return;
  const tr = e.target.closest('tr[data-row]');
  if (!tr || tr.closest('[data-dnd]').dataset.dnd !== dnd.kind) return;
  e.preventDefault();
  const { kind, from } = dnd;
  dnd = null;
  let to = Number(tr.dataset.row) + (isUpperHalf(tr, e) ? 0 : 1);
  if (to > from) to -= 1;
  clearOver();
  if (to === from) return;
  moveRow(kind, from, to);
});
root.addEventListener('dragend', () => {
  dnd = null;
  clearOver();
  root.querySelectorAll('tr[draggable]').forEach((tr) => { tr.draggable = false; tr.classList.remove('is-dragging'); });
});

render();

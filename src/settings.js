// Account settings (the gear in the top bar): a full settings tree with a pane per section.
import { boot } from './page.js';
import { toast, wireMenus, closeMenus } from './shell.js';
import { OWNERS, DEAL_STAGES, TICKET_STATUSES, PIPELINE_KEY, ASSOC_LABELS_KEY, assocLabels, ALL, formatDate, formatMoney, dealPipelines, saveDealPipelines, dealPipelineDefs, saveDealPipelineDefs, newPipelineDef, setField } from './data.js';
import { propertyGroups, customProperties, saveCustomProperties, propertyList } from './properties.js';
import { TEAMS, loadLayout, cardCatalog } from './layout-defaults.js';
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
const account = () => ({ name: 'Megaglass', tz: 'America/Mexico_City', currency: 'EUR', lang: 'Español', fiscalYear: 'Enero', ...load('crm:account', {}) });
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
      <div class="sform__row"><label class="field"><span>Nombre de la cuenta</span><input name="name" value="${esc(a.name)}" /></label><label class="field"><span>Moneda de la empresa</span><select name="currency">${['EUR', 'USD', 'MXN'].map((c) => `<option ${a.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
      <div class="sform__row"><label class="field"><span>Zona horaria</span><select name="tz">${['America/Mexico_City', 'Europe/Madrid', 'America/New_York'].map((l) => `<option ${a.tz === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Idioma</span><select name="lang">${['Español', 'Inglés'].map((l) => `<option ${a.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Inicio del año fiscal</span><select name="fiscalYear">${['Enero', 'Abril', 'Julio', 'Octubre'].map((l) => `<option ${a.fiscalYear === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="sform__btns"><button class="btn btn--primary" type="submit">Guardar</button></div>
    </form>
    ${infoList('Información de la cuenta', [['ID de la cuenta', '5417939 <button class="copy" type="button" data-copy="5417939" aria-label="Copiar">⧉</button>'], ['Centro de datos', 'Norteamérica'], ['Creada', '22 de diciembre de 2021']])}`;
}
function paneUsers() {
  const us = users();
  const ts = teams();
  return `<div class="shead"><h2>Usuarios y equipos</h2><span class="ad-foot__btns"><button class="btn btn--ghost" type="button" data-act="new-team">Crear equipo</button><button class="btn btn--primary" type="button" data-act="new-user">Crear usuario</button></span></div>
    <h3>Usuarios (${us.length})</h3>${simpleTable(['Nombre', 'Correo', 'Equipo', 'Rol', 'Estado', ''], us.map((u, i) => [`<strong>${esc(u.name)}</strong>`, esc(u.email), `<select data-user-team="${i}">${ts.map((t) => `<option ${u.team === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`, `<select data-user-role="${i}">${['Superadministrador', 'Administrador', 'Usuario', 'Solo lectura'].map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>`, `<span class="tag ${u.status === 'Activo' ? 'tag--done' : 'tag--none'}">${u.status}</span>`, `<button class="link-btn" type="button" data-user-toggle="${i}">${u.status === 'Activo' ? 'Desactivar' : 'Activar'}</button>`]))}
    <h3>Equipos (${ts.length})</h3>${simpleTable(['Equipo', 'Miembros', ''], ts.map((t, i) => [`<strong>${esc(t.name)}</strong>`, us.filter((u) => u.team === t.name).map((u) => esc(u.name)).join(', ') || '<span class="muted">Sin miembros</span>', `<button class="link-btn" type="button" data-team-rm="${i}">Eliminar</button>`]))}`;
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
function paneProperties() {
  const type = state.propsObject;
  const groups = propertyGroups(type);
  const custom = new Set(customProperties(type).map((p) => p.key));
  const q = state.propsQuery.toLowerCase();
  const rows = groups.flatMap((g) => g.items.map(([k, l, kind]) => ({ k, l, kind, g: g.title }))).filter((r) => (!state.propsGroup || r.g === state.propsGroup) && (!q || r.l.toLowerCase().includes(q) || r.k.toLowerCase().includes(q)));
  return `<div class="shead"><h2>Propiedades</h2><button class="btn btn--primary" type="button" data-act="new-prop">Crear propiedad</button></div>
    <p class="muted">Las propiedades guardan la información de cada registro. Las personalizadas se pueden editar o eliminar; las predeterminadas solo consultarse.</p>
    <div class="sbar">
      <label class="field field--inline"><span>Objeto</span><select data-props-object>${OBJECTS.map(([k, l]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="props-q" value="${esc(state.propsQuery)}" placeholder="Buscar propiedades" /></div>
      <label class="field field--inline"><span>Grupo</span><select data-props-group><option value="">Todos los grupos</option>${groups.map((g) => `<option ${state.propsGroup === g.title ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label>
      <span class="muted">${rows.length} propiedades</span>
    </div>
    ${simpleTable(['Nombre', 'Nombre interno', 'Tipo', 'Grupo', 'Creada por', ''], rows.slice(0, 200).map((r) => [`<strong>${esc(r.l)}</strong>`, `<span class="muted">${esc(r.k)}</span>`, KINDS[r.kind] || esc(r.kind), esc(r.g), custom.has(r.k) ? 'Tú' : 'Sistema', custom.has(r.k) ? `<button class="link-btn" type="button" data-prop-edit="${r.k}">Editar</button> <button class="link-btn" type="button" data-prop-rm="${r.k}">Eliminar</button>` : `<button class="link-btn" type="button" data-prop-view="${r.k}">Ver</button>`]))}`;
}
function objectPipelineHtml(type) {
  if (type === 'deals') return dealPipelinesHtml();
  if (type === 'tickets') {
    const ov = load(PIPELINE_KEY('tickets'), {});
    return `<h3>Pipeline de soporte</h3>${simpleTable(['Estado', 'Nombre'], TICKET_STATUSES.map(([k, l]) => [`<span class="muted">${k}</span>`, `<input class="cellpop__input cellpop__input--sm" data-stage-label="${k}" value="${esc((ov[k] && ov[k].label) || l)}" />`]))}<div class="sform__btns"><button class="btn btn--primary" type="button" data-act="save-pipeline" data-type="tickets">Guardar pipeline</button><button class="btn btn--ghost" type="button" data-act="reset-pipeline" data-type="tickets">Restablecer</button></div>`;
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
        <div class="menu"><button class="btn btn--primary" type="button" aria-haspopup="true" aria-expanded="false">Crear pipeline <span class="caret"></span></button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-act="new-pipeline">Crear pipeline desde cero</button><button class="menu__item" type="button" data-act="clone-pipeline">Clonar un pipeline existente</button></div></div></div>
    </div>
    <table class="mini-table stable ptable"><thead><tr><th></th><th>Pipeline <span class="muted">⇅</span></th><th>Descripción del pipeline</th><th class="num">Propiedades calculadas de etapa <span class="info">ⓘ</span></th><th class="num">Etiquetas de negocios</th><th class="num">Reglas del pipeline <span class="info">ⓘ</span></th><th class="num">Número de etapas</th><th class="num">Negocios</th><th class="num">ID interno</th><th class="num">Acciones</th></tr></thead><tbody data-dnd="pipes">
      ${rows.length ? rows.map(({ p, i }) => { const acc = p.access || { mode: 'all' }; return `<tr data-row="${i}"><td class="phandle" title="Arrastra para cambiar el orden" aria-hidden="true">⋮⋮</td><td><button class="olink" type="button" data-pipe-edit="${i}">${esc(p.name)}</button>${i === 0 ? ' <span class="tag tag--new">Predeterminado</span>' : ''}${acc.mode === 'teams' ? ` <span class="tag tag--none" title="Acceso restringido a ${esc([...(acc.teams || []), ...(acc.users || [])].join(', '))}">🔒 ${(acc.teams || []).length + (acc.users || []).length}</span>` : ''}</td><td class="pdesccell"><span class="muted">${p.desc ? esc(p.desc) : '--'}</span><button class="icon-btn icon-btn--round icon-btn--sm rowact" type="button" data-pipe-desc="${i}" aria-label="Editar descripción">✎</button></td><td class="num">${p.stages.length * 4}</td><td class="num">${labelsOf(p).length}</td><td class="num">${rulesCount(p)}</td><td class="num">${p.stages.length}</td><td class="num">${inPipe(p)}</td><td class="num muted pidcell">${p.id}<button class="icon-btn icon-btn--sm rowact" type="button" data-copy="${p.id}" aria-label="Copiar ID">⧉</button></td><td class="num"><div class="menu"><button class="icon-btn icon-btn--sm" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Acciones del pipeline">⋮</button><div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-pipe-access="${i}">Gestionar acceso</button><button class="menu__item" type="button" data-pipe-clone="${i}">Clonar</button><button class="menu__item menu__item--danger" type="button" data-pipe-rm="${i}" ${defs.length < 2 ? 'disabled' : ''}>Eliminar</button></div></div></td></tr>`; }).join('') : '<tr><td colspan="10" class="muted">No hay pipelines que coincidan con la búsqueda.</td></tr>'}
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
const stageValue = (p, k) => `${labelOfStage(p, k)} (${p.name})`;
function defaultLogic(p, k) {
  if (k === 'won') return { groups: [{ conditions: [{ prop: 'Etapa del negocio', op: 'es igual a', value: stageValue(p, k) }] }], props: [{ name: 'Motivo de cierre ganado', required: true }], builtin: true };
  if (k === 'lost') return { groups: [{ conditions: [{ prop: 'Etapa del negocio', op: 'es igual a', value: stageValue(p, k) }] }], props: [{ name: 'Motivo de cierre perdido', required: true }], builtin: true };
  return { groups: [{ conditions: [{ prop: 'Etapa del negocio', op: 'es igual a', value: stageValue(p, k) }] }], props: [] };
}
function logicHtml() {
  const { stage, draft, preview, adding, addingProp } = state.logicEdit;
  const defs = dealPipelineDefs();
  const p = defs[state.pipeEdit];
  const pv = preview || stage;
  // A group is true for the previewed stage when all its "Etapa del negocio" conditions match (other properties count as true).
  const groupTrue = (g) => g.conditions.every((c) => (c.prop !== 'Etapa del negocio' ? true : c.op === 'es igual a' ? c.value === stageValue(p, pv) : c.op === 'no es igual a' ? c.value !== stageValue(p, pv) : true));
  const show = draft.groups.some(groupTrue) ? draft.props : [];
  const available = propertyList('deals').map((x) => x.label).filter((l) => !draft.props.some((x) => x.name === l)).slice(0, 60);
  const condEditor = (gi) => `<div class="lcond lcond--edit" data-gi="${gi}">
      <select class="ginput ginput--sm" data-cond-prop>${LOGIC_PROPS.map((x) => `<option ${adding.prop === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select class="ginput ginput--sm" data-cond-op>${LOGIC_OPS.map((x) => `<option ${adding.op === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      ${adding.prop === 'Etapa del negocio' ? `<select class="ginput ginput--sm" data-cond-value>${p.stages.map(([k]) => `<option ${adding.value === stageValue(p, k) ? 'selected' : ''}>${esc(stageValue(p, k))}</option>`).join('')}</select>` : adding.prop === 'Pipeline' ? `<select class="ginput ginput--sm" data-cond-value>${defs.map((d) => `<option ${adding.value === d.name ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : `<input class="ginput ginput--sm" data-cond-value value="${esc(adding.value || '')}" placeholder="Valor" ${adding.op.includes('definido') ? 'disabled' : ''} />`}
      <button class="btn btn--primary btn--sm" type="button" data-logic-cond-apply="${gi}">Aplicar</button><button class="btn btn--ghost btn--sm" type="button" data-logic-cond-cancel>Cancelar</button>
    </div>`;
  return `<div class="logic" role="dialog" aria-modal="true" aria-labelledby="logic-title">
    <header class="logic__head"><div><h2 id="logic-title">Editar lógica de propiedad</h2><span class="muted">Negocio · ${esc(labelOfStage(p, stage))}</span></div><div class="logic__btns"><button class="btn btn--ghost" type="button" data-logic-save>Guardar</button><button class="icon-btn icon-btn--round" type="button" data-logic-close aria-label="Cerrar">×</button></div></header>
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
        <label class="gfield"><span>Etapa del negocio</span><select class="ginput ginput--md" data-logic-preview>${p.stages.map(([k]) => `<option value="${k}" ${pv === k ? 'selected' : ''}>${esc(stageValue(p, k))}</option>`).join('')}</select></label>
        <div class="lpreview">${show.length ? `<p class="muted">Propiedades que se piden en esta etapa:</p>${show.map((x) => `<label class="gfield lpreview__field"><span>${esc(x.name)}${x.required ? ' <em class="req">*</em>' : ''}</span><input class="ginput" placeholder="${x.required ? 'Obligatoria' : 'Opcional'}" /></label>`).join('')}` : '<p class="lpreview__empty">No existen propiedades dependientes para esta opción</p>'}</div>
      </section>
    </div>
  </div>`;
}
function openLogic(k) {
  const defs = dealPipelineDefs();
  const p = defs[state.pipeEdit];
  const saved = p.logic && p.logic[k];
  state.logicEdit = { stage: k, draft: JSON.parse(JSON.stringify(saved || defaultLogic(p, k))), preview: k, adding: null, addingProp: false };
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
    ${type === 'companies' ? objCheck('companies', 'autoCreate', 'Crear y asociar empresas automáticamente', 'Cuando un contacto nuevo tiene un dominio de correo de empresa, se crea la Empresa y se asocia.', s.autoCreate !== false) : ''}
    ${type === 'tasks' ? objCheck('tasks', 'autoAssign', 'Asignar las Tareas nuevas a quien las crea', 'Si no se indica, la Tarea queda asignada al usuario que la creó.', s.autoAssign !== false) : ''}
    ${objCheck(type, 'dupes', `Avisar de ${lower} duplicados`, 'Al crear un registro parecido a otro existente se muestra un aviso.', s.dupes)}
    ${type === 'deals' || type === 'tickets' ? objCheck(type, 'assocReq', 'Exigir un contacto o una empresa asociados', 'No permite guardar el registro sin una asociación.', s.assocReq) : ''}`;
  const collab = `<h3>Colaboración</h3>
    ${objCheck(type, 'followOwn', `Seguir automáticamente los ${m.p} que creas`, 'Recibirás notificaciones de la actividad de esos registros.', s.followOwn)}
    ${objCheck(type, 'comments', `Permitir comentarios en los ${m.p}`, 'Los usuarios pueden dejar comentarios y mencionar a compañeros.', s.comments)}
    ${objCheck(type, 'notifyOwner', 'Notificar al propietario al asignar un registro', 'Se envía una notificación al nuevo propietario.', s.notifyOwner)}`;
  const danger = `<h3>Eliminación</h3><p class="muted">Los ${lower} eliminados se guardan 90 días en la papelera y después se borran definitivamente.</p><p><a class="link-btn" href="../${type}/">Ver ${lower} eliminados en la lista ↗</a></p>`;
  return `<p class="odesc">${m.desc}</p><hr class="cd-sep" />${props}${assoc}${creating}${collab}${['contacts', 'companies', 'deals', 'tickets', 'tasks'].includes(type) ? danger : ''}`;
}
function objectRecordHtml(type) {
  const m = OBJ_META[type];
  const layout = loadLayout(type);
  const views = [{ name: layout.name || 'Vista predeterminada', teams: 'Todos los usuarios', updated: formatDate(new Date()), isDefault: true }, ...load(`crm:${type}:recordviews`, [])];
  return `<div class="shead"><h3>Vistas de registro</h3><button class="btn btn--primary btn--sm" type="button" data-act="new-recordview" data-type="${type}">Crear vista de registro</button></div>
    <p class="muted">Decide qué pestañas, secciones y tarjetas ven los usuarios en la ficha de ${m.p.toLowerCase()}. Cada equipo puede tener su propia vista.</p>
    ${simpleTable(['Nombre de la vista', 'Asignada a', 'Última edición', ''], views.map((v, i) => [`<strong>${esc(v.name)}</strong>${v.isDefault ? ' <span class="tag tag--new">Predeterminada</span>' : ''}`, esc(v.teams), esc(v.updated), `<a class="link-btn" href="../layout/?type=${type}">Editar</a>${v.isDefault ? '' : ` <button class="link-btn" type="button" data-recordview-rm="${i - 1}" data-type="${type}">Eliminar</button>`}`]))}
    <h3>Qué incluye la vista predeterminada</h3>
    <div class="ocols">
      <div><strong>Barra lateral izquierda</strong><ul>${layout.left.map((c) => `<li>${esc((cardCatalog(type)[c] || { label: c }).label)}</li>`).join('')}</ul></div>
      <div><strong>Columna central</strong><ul>${layout.tabs.map((t) => `<li>${esc(t.label)}</li>`).join('')}</ul></div>
      <div><strong>Barra lateral derecha</strong><ul>${layout.right.map((c) => `<li>${esc((cardCatalog(type)[c] || { label: c }).label)}</li>`).join('')}</ul></div>
    </div>`;
}
function objectPreviewHtml(type) {
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
function objectIndexHtml(type) {
  const m = OBJ_META[type];
  const s = objSetting(type);
  const saved = load(`crm:${type}:boardcard`, null);
  const list = propertyList(type).slice(0, 40);
  const views = ['Todos', 'Míos', 'Sin asignar', 'Creados este mes'];
  return `<h3>Página de índice de ${m.p.toLowerCase()}</h3><p class="muted">Configura la lista y el tablero que ven los usuarios al abrir ${m.p}.</p>
    <div class="ofield"><strong>Vista predeterminada</strong><p class="muted">La vista que se abre primero al entrar en ${m.p}.</p><select class="ginput ginput--md" data-objsetting="defaultView" data-type="${type}">${views.map((v) => `<option ${s.defaultView === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="ofield"><strong>Columnas predeterminadas</strong><p class="muted">Las columnas se editan desde la propia lista con el botón ⚙ "Editar columnas"; cada usuario guarda las suyas.</p><a class="btn btn--ghost btn--sm" href="../${type}/">Abrir la lista de ${m.p.toLowerCase()} ↗</a></div>
    ${objCheck(type, 'boardCount', 'Mostrar el número de registros en cada etapa del tablero', 'Aparece junto al nombre de la etapa.', s.boardCount)}
    <h3>Tarjetas del tablero</h3><p class="muted">Elige qué propiedades se muestran en cada tarjeta de la vista de tablero (máximo 4, en este orden).</p>
    <form class="ocardform" data-save="boardcard" data-boardcard="${type}">
      <div class="ocardgrid">${list.map((p) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="k" value="${esc(p.key)}" ${saved ? (saved.includes(p.key) ? 'checked' : '') : ''} /><span>${esc(p.label)}</span></label>`).join('')}</div>
      <div class="sform__btns"><button class="btn btn--primary" type="submit">Guardar tarjetas</button><button class="btn btn--ghost" type="button" data-act="reset-boardcard" data-type="${type}">Usar las predeterminadas</button></div>
    </form>`;
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
  const tabs = [['config', 'Configuración'], ...(hasPipelines ? [['pipelines', 'Pipelines']] : []), ['record', 'Personalización de registros'], ['preview', 'Previsualizar personalización'], ['index', 'Personalización del índice']];
  if (!tabs.some((t) => t[0] === state.objectsTab) && state.objectsTab !== 'assoc') state.objectsTab = 'config';
  let body = '';
  if (type === 'products') body = paneProducts().replace(/<h2>.*?<\/h2>/, '');
  else if (type === 'custom') body = paneCustomObjects().replace(/<h2>.*?<\/h2>/, '');
  else if (state.objectsTab === 'config') body = objectConfigHtml(type);
  else if (state.objectsTab === 'pipelines') body = objectPipelineHtml(type);
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
    ${state.logicEdit && state.pipeEdit !== null ? logicHtml() : ''}
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
      <label class="field"><span>Grupo</span><select name="group">${['Propiedades personalizadas', ...groups.map((g) => g.title).filter((t) => t !== 'Propiedades personalizadas')].map((g) => `<option ${existing && existing.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
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
  else if (what === 'account') { save('crm:account', { ...account(), ...d }); toast('Valores de la cuenta guardados'); }
  else if (what === 'password') { form.reset(); toast('Contraseña actualizada'); }
  else if (what === 'signature') { setSignature(d); toast('Firma guardada'); }
  else if (what === 'copy') { const log = load('crm:copies', []); log.unshift({ when: formatDate(new Date()), res: d.res, to: d.to }); save('crm:copies', log); render(); toast(`"${d.res}" copiado a ${d.to}`); }
  else if (what === 'pipelabel') {
    const defs = dealPipelineDefs(); const p = defs[state.pipeEdit]; const list = labelsOf(p).slice(); const v = d.label.trim();
    if (v && !list.includes(v)) list.push(v);
    p.labelList = list; persistPipelines(defs, 'Etiqueta añadida'); render();
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
  else if (t.hasAttribute('data-objects-object')) { state.objectsObject = t.value; state.objectsTab = 'config'; window.history.replaceState(null, '', `#obj-${t.value}`); render(); }
  else if (t.hasAttribute('data-preview-team')) { state.previewTeam = t.value; render(); }
  else if (t.hasAttribute('data-pipe-select')) { state.pipeEdit = Number(t.value); render(); }
  else if (t.hasAttribute('data-logic-preview')) { state.logicEdit.preview = t.value; render(); }
  else if (t.dataset.logicPropReq !== undefined) { state.logicEdit.draft.props[Number(t.dataset.logicPropReq)].required = t.checked; render(); }
  else if (t.hasAttribute('data-cond-prop') || t.hasAttribute('data-cond-op')) { const L = state.logicEdit; const box = t.closest('.lcond--edit'); L.adding.prop = box.querySelector('[data-cond-prop]').value; L.adding.op = box.querySelector('[data-cond-op]').value; const v = box.querySelector('[data-cond-value]'); L.adding.value = L.adding.prop === 'Etapa del negocio' || L.adding.prop === 'Pipeline' ? '' : (v ? v.value : ''); render(); }
  else if (t.dataset.pipeRule) { const defs = dealPipelineDefs(); const p = defs[state.pipeEdit]; p.rules = { ...(p.rules || {}), [t.dataset.pipeRule]: t.checked }; persistPipelines(defs, t.checked ? 'Regla activada' : 'Regla desactivada'); render(); }
  else if (t.dataset.pipeAuto) { const defs = dealPipelineDefs(); const p = defs[state.pipeEdit]; p.automation = { ...(p.automation || {}) }; p.automation[t.dataset.stage] = { ...(p.automation[t.dataset.stage] || {}), [t.dataset.pipeAuto]: t.checked }; persistPipelines(defs, 'Automatización guardada'); render(); }
  else if (t.dataset.objsetting) {
    const s = objSetting(t.dataset.type);
    s[t.dataset.objsetting] = t.type === 'checkbox' ? t.checked : t.value;
    save(`crm:settings:obj-${t.dataset.type}`, s);
    toast('Ajuste guardado');
    if (t.type === 'checkbox' || t.type === 'radio') render();
  }
  else if (t.hasAttribute('data-props-object')) { state.propsObject = t.value; state.propsGroup = ''; render(); }
  else if (t.hasAttribute('data-props-group')) { state.propsGroup = t.value; render(); }
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
  if (le) { const defs = dealPipelineDefs(); collectPipeline(defs[state.pipeEdit]); saveDealPipelineDefs(defs); openLogic(le.dataset.logicEdit); render(); return; }
  if (state.logicEdit) {
    const L = state.logicEdit;
    const d = L.draft;
    const t = e.target;
    const hit = (sel) => t.closest(sel);
    if (hit('[data-logic-close]')) { state.logicEdit = null; render(); return; }
    if (hit('[data-logic-save]')) {
      const defs = dealPipelineDefs(); const p = defs[state.pipeEdit];
      p.logic = { ...(p.logic || {}), [L.stage]: d };
      p.required = { ...(p.required || {}), [L.stage]: d.props.filter((x) => x.required).map((x) => x.name) };
      persistPipelines(defs, 'Lógica de propiedad guardada');
      state.logicEdit = null; render(); return;
    }
    if (hit('[data-logic-group-add]')) { const defs = dealPipelineDefs(); d.groups.push({ conditions: [{ prop: 'Etapa del negocio', op: 'es igual a', value: stageValue(defs[state.pipeEdit], L.stage) }] }); render(); return; }
    const gc = hit('[data-logic-group-copy]'); if (gc) { d.groups.splice(Number(gc.dataset.logicGroupCopy) + 1, 0, JSON.parse(JSON.stringify(d.groups[Number(gc.dataset.logicGroupCopy)]))); render(); return; }
    const gr = hit('[data-logic-group-rm]'); if (gr) { if (d.groups.length > 1) d.groups.splice(Number(gr.dataset.logicGroupRm), 1); render(); return; }
    const cr = hit('[data-logic-cond-rm]'); if (cr) { const [gi, ci] = cr.dataset.logicCondRm.split(':').map(Number); d.groups[gi].conditions.splice(ci, 1); render(); return; }
    const ca = hit('[data-logic-cond-add]'); if (ca) { const defs = dealPipelineDefs(); L.adding = { gi: Number(ca.dataset.logicCondAdd), prop: 'Etapa del negocio', op: 'es igual a', value: stageValue(defs[state.pipeEdit], L.stage) }; render(); return; }
    if (hit('[data-logic-cond-cancel]')) { L.adding = null; render(); return; }
    const cap = hit('[data-logic-cond-apply]'); if (cap) { const box = root.querySelector('.lcond--edit'); const v = box.querySelector('[data-cond-value]'); d.groups[Number(cap.dataset.logicCondApply)].conditions.push({ prop: box.querySelector('[data-cond-prop]').value, op: box.querySelector('[data-cond-op]').value, value: v ? v.value : '' }); L.adding = null; render(); return; }
    if (hit('[data-logic-prop-add]')) { L.addingProp = true; render(); return; }
    if (hit('[data-logic-prop-cancel]')) { L.addingProp = false; render(); return; }
    if (hit('[data-logic-prop-apply]')) { const pick = root.querySelector('[data-prop-pick]'); if (pick && pick.value) d.props.push({ name: pick.value, required: root.querySelector('[data-prop-pick-req]').checked }); L.addingProp = false; render(); return; }
    const pr = hit('[data-logic-prop-rm]'); if (pr) { d.props.splice(Number(pr.dataset.logicPropRm), 1); render(); return; }
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
    const defs = dealPipelineDefs(); const i = Number(pacc.dataset.pipeAccess); const p = defs[i]; const acc = { mode: 'all', teams: [], users: [], ...(p.access || {}) };
    openModal(`Gestionar acceso: ${esc(p.name)}`, `<p class="muted">Decide quién puede ver y usar este pipeline en la lista y el tablero de negocios.</p><form id="acc-form">
        <label class="oradio"><input type="radio" name="mode" value="all" ${acc.mode === 'all' ? 'checked' : ''} /><span>Todos los usuarios</span></label>
        <label class="oradio"><input type="radio" name="mode" value="teams" ${acc.mode === 'teams' ? 'checked' : ''} /><span>Equipos y usuarios específicos</span></label>
        <div class="oindent ${acc.mode === 'teams' ? '' : 'is-disabled'}" id="acc-pick"><strong>Equipos</strong><div class="ocardgrid ocardgrid--modal">${teams().map((t) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="team" value="${esc(t.name)}" ${acc.teams.includes(t.name) ? 'checked' : ''} /><span>${esc(t.name)}</span></label>`).join('')}</div><strong>Usuarios</strong><div class="ocardgrid ocardgrid--modal">${users().map((u) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="user" value="${esc(u.name)}" ${acc.users.includes(u.name) ? 'checked' : ''} /><span>${esc(u.name)}</span></label>`).join('')}</div></div>
      </form>`, `<button class="btn btn--primary" type="button" id="acc-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
    const form = document.getElementById('acc-form');
    form.addEventListener('change', (ev) => { if (ev.target.name === 'mode') document.getElementById('acc-pick').classList.toggle('is-disabled', ev.target.value !== 'teams'); });
    document.getElementById('acc-save').onclick = () => {
      const mode = form.querySelector('[name="mode"]:checked').value;
      const pick = (n) => [...form.querySelectorAll(`[name="${n}"]:checked`)].map((x) => x.value);
      p.access = mode === 'all' ? { mode: 'all' } : { mode: 'teams', teams: pick('team'), users: pick('user') };
      if (mode === 'teams' && !p.access.teams.length && !p.access.users.length) { toast('Elige al menos un equipo o usuario'); return; }
      persistPipelines(defs, mode === 'all' ? 'Acceso abierto a todos los usuarios' : 'Acceso guardado'); closeModal(); render();
    };
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
  if (ut) { const us = users(); const u = us[Number(ut.dataset.userToggle)]; u.status = u.status === 'Activo' ? 'Desactivado' : 'Activo'; save('crm:users', us); render(); toast(`Usuario ${u.status.toLowerCase()}`); return; }
  const pl = e.target.closest('[data-props-object-link]');
  if (pl) { state.propsObject = pl.dataset.propsObjectLink; state.propsGroup = ''; state.propsQuery = ''; }
  const rm = e.target.closest('[data-team-rm], [data-label-rm], [data-app-rm], [data-hook-rm], [data-pipeline-rm], [data-recordview-rm]');
  if (rm) {
    const d = rm.dataset;
    if (d.pipelineRm !== undefined) { const list = dealPipelines(); const [p] = list.splice(Number(d.pipelineRm), 1); saveDealPipelines(list); toast(`Pipeline "${p}" eliminado`); }
    else if (d.recordviewRm !== undefined) { const list = load(`crm:${d.type}:recordviews`, []); list.splice(Number(d.recordviewRm), 1); save(`crm:${d.type}:recordviews`, list); toast('Vista eliminada'); }
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
  else if (a === 'clone-pipeline') promptModal('Clonar un pipeline existente', [['src', 'Pipeline de origen', 'select', dealPipelines()], ['name', 'Nombre del nuevo pipeline']], 'Clonar', (d) => { const defs = dealPipelineDefs(); const src = defs.find((p) => p.name === d.src) || defs[0]; const copy = newPipelineDef(d.name.trim() || `${src.name} (copia)`, src.stages); defs.push(copy); persistPipelines(defs, `Pipeline "${copy.name}" creado`); });
  else if (a === 'snav-toggle') { state.navCollapsed = !state.navCollapsed; localStorage.setItem(SNAV_KEY, state.navCollapsed ? '1' : '0'); render(); }
  else if (a === 'reset-boardcard') { localStorage.removeItem(`crm:${act.dataset.type}:boardcard`); render(); toast('Tarjetas del tablero restablecidas'); }
  else if (a === 'new-recordview') promptModal('Crear vista de registro', [['name', 'Nombre de la vista'], ['teams', 'Asignar a', 'select', TEAMS]], 'Crear', (d) => { const list = load(`crm:${act.dataset.type}:recordviews`, []); list.push({ name: d.name, teams: d.teams, updated: formatDate(new Date()) }); save(`crm:${act.dataset.type}:recordviews`, list); toast(`Vista "${d.name}" creada`); });
  else if (a === 'customize-create') {
    const type = act.dataset.type;
    const saved = load(`crm:${type}:createform`, null);
    const list = propertyList(type).slice(0, 36);
    openModal(`Formulario "Crear ${OBJ_META[type].s}"`, `<p class="muted">Marca los campos que aparecen al crear un ${OBJ_META[type].s.toLowerCase()}.</p><form id="cf-form" class="ocardgrid ocardgrid--modal">${list.map((p, i) => `<label class="ocheck ocheck--sm"><input type="checkbox" name="k" value="${esc(p.key)}" ${saved ? (saved.includes(p.key) ? 'checked' : '') : i < 8 ? 'checked' : ''} /><span>${esc(p.label)}</span></label>`).join('')}</form>`, `<button class="btn btn--primary" type="button" id="cf-save">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
    document.getElementById('cf-save').onclick = () => { const keys = [...document.querySelectorAll('#cf-form input:checked')].map((i) => i.value); save(`crm:${type}:createform`, keys); closeModal(); toast(`Formulario guardado con ${keys.length} campos`); };
  }
  else if (a === 'new-pipeline') promptModal('Crear pipeline', [['name', 'Nombre del pipeline']], 'Crear', (d) => { const list = dealPipelines(); const name = d.name.trim(); if (!name) return; if (list.includes(name)) { toast('Ya existe un pipeline con ese nombre'); return; } list.push(name); saveDealPipelines(list); toast(`Pipeline "${name}" creado`); });
  else if (a === 'avatar-rm') { const p = profile(); delete p.avatar; save('crm:profile', p); render(); toast('Imagen de perfil quitada'); }
  else if (a === 'new-prop') { openModal('Crear propiedad', propertyForm(state.propsObject), `<button class="btn btn--primary" type="button" id="prop-save">Crear</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`); document.getElementById('prop-save').onclick = () => saveProperty(state.propsObject); }
  else if (a === 'new-user') promptModal('Crear usuario', [['name', 'Nombre'], ['email', 'Correo', 'email'], ['team', 'Equipo', 'select', teams().map((t) => t.name)], ['role', 'Rol', 'select', ['Usuario', 'Administrador', 'Solo lectura']]], 'Enviar invitación', (d) => { const us = users(); us.push({ ...d, status: 'Invitado' }); save('crm:users', us); toast(`Invitación enviada a ${d.email}`); });
  else if (a === 'new-team') promptModal('Crear equipo', [['name', 'Nombre del equipo']], 'Crear', (d) => { const ts = teams(); ts.push({ name: d.name }); save('crm:teams', ts); toast('Equipo creado'); });
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

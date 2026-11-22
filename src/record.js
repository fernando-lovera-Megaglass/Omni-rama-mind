import { openLogModal as showLogModal, selectedActivityAssociations, readLogActivity, logAssociationsHtml as sharedLogAssociationsHtml, attendeeTargets } from './log-modal.js';
import { formatAttachmentSize } from './mail-attachments.js';
import { TASK_ASSOCIATIONS, taskAssociationLinks, taskLinksTo } from './task-associations.js';
import { isFollowing as followStoreHas, toggleFollow } from './follows.js';
import { ready as sequencesReady, scheduled, sequenceById, pauseEnrollment, resumeEnrollment, unenroll, enrollmentsOfContact, unenrollReasonOf, STATUS_LABELS as SEQ_STATUS } from './sequences-data.js';
import { propertyEditor } from './property-editor.js';
import { mountCreateDeal } from './create-deal.js';
import { mountCreateTicket } from './create-ticket.js';
import { changeDealStage } from './deal-close.js';
import { saveAssociatedActivity } from './activity-associations.js';
import './filter-chip.js';
import { validatePropertyValues, companyDomainPrefill, companyDomains, mergeRecords, mergeConflicts, mergeFillable } from './data.js';
import { suggestedKeep } from './duplicates.js';
import { cancelScheduled, rescheduleEmail, scheduledById, datetimeInput as scheduledInput, whenText as scheduledWhen, timeZoneName as scheduledTz } from './scheduled-emails.js';
import { attachMentionAutocomplete, mentionsIn } from './mention-autocomplete.js';
import { segments, segmentMembers, segmentSize, addStaticMembers, removeStaticMembers, objectPlural } from './segments-data.js';
import { notifyMentions, recordHref } from './notifications.js';
import { sensitiveValue } from './property-privacy.js';
import { mountActivityComments } from './activity-comments.js';
// Generic record page for contacts, companies, deals, tickets and tasks.
// Layout follows the person's screenshot of their contact page: left column
// (back link + "Acciones" menu, identity, quick actions, "Acerca de este objeto"),
// middle column (tabs, summary and recent activity cards), right column (AI summary,
// lead stage, associations).
import { mountSubtasks } from './subtasks.js';
import { boot } from './page.js';
import { toast, wireMenus, closeMenus, linkHtml, wireLinkTooltips, recordToastAction } from './shell.js';
import {
  findRecord, setField, deleteRecords, addRecord, allContacts, allCompanies, allDeals, allTickets, allTasks, ALL,
  STATUSES, LIFECYCLES, SOURCES, OWNERS, TICKET_STATUSES, PRIORITIES, TASK_TYPES, TASK_STATUSES, RECUR_OPTIONS,
  ticketStatusIsClosed, ticketStatusesFor, ticketStatusLabel, firstOpenTicketStatus, ticketPipelines, dealPipelines, stagesFor, allDealStages, dealStageLabel, dealStageProb, isClosedStage, dealStageIsClosed,
  formatDate, formatMoney, initials, colorFor, labelOf, toCsv, download, TODAY, assocLabels, CURRENCY_DEFS, CURRENCY_CODES, relativeTimeFine,
  activitiesFor, ensureActivitiesFor, addActivity, updateActivity, deleteActivity, restoreActivity, deletedActivitiesFor, activityIdForComment, historyFor, addHistoryEntry, getSetting, setSetting, settingsLive, settingScope, lineItemsFor, fetchLineItems, lineItemsTotal, addLineItems, updateLineItem, removeLineItem, applyLineItemsToDeal,
  parentCompanyOf, childCompaniesOf, isCompanyDescendant, dbIsLive,
} from './data.js';
import { supabase } from './supabaseClient.js';
import { propertyGroups, propertyMap } from './properties.js';
const PROPERTIES = new Proxy({}, { get: (_, t) => propertyGroups(t) });
wireLinkTooltips();
import { openCompose, editSignature } from './compose.js';
import { renderTokens, contextFromRecord } from './tokens.js';
import { attachSnippetAutocomplete } from './snippet-autocomplete.js';
import { openEnrollDialog } from './sequence-enroll.js';
import { workflows } from './workflows-data.js';
import { enroll as enrollInWorkflow, activeRun as activeWorkflowRun, whenText as workflowWhenText } from './workflow-engine.js';
import { ownerHtml, companyAvatarHtml } from './owner.js';
import { enhanceOwnerSelects } from './owner-select.js';
import { enhancePhoneInputs, focusPhoneInput, displayPhone, phoneHref } from './phone.js';
import { sendSms, hasTwilio } from './twilio.js';
import { openCallMenu, playRecording, openCallReview, attachInlinePlayer } from './call.js';
import { loadLayout, saveLayout, cardCatalog } from './layout-defaults.js';
import { mountQueueBar, dueText, dueClass, completeTaskWithLog } from './task-queue.js';
import { datetimeInput, reminderText } from './task-reminders.js';

const type = document.body.dataset.type;
const root = '../../';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const opt = (list) => list.map((x) => (Array.isArray(x) ? [x[0], x[1]] : [x, x]));
const ownerOpts = opt(OWNERS);
const byId = (list, id) => list.find((r) => Number(r.id) === Number(id));
const dateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const EMPTY = '<span class="muted">--</span>';
const fmtTime = (d) => `${d.getDate()} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][d.getMonth()]} de ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const CONFIG = {
  contacts: {
    label: 'Contactos', singular: 'contacto', sub: 'Contactos', listHref: `${root}contacts/`,
    title: (r) => r.name, subtitle: (r) => r.company || '', mail: (r) => r.email,
    fields: [
      ['mobilephone', 'Número de móvil', 'tel'], ['phone', 'Número de teléfono', 'tel'], ['alt_phone', 'Numero de Telefono alternativo', 'tel'],
      ['email', 'Correo', 'email'], ['alt_email', 'Correo Alternativo', 'email'],
      ['status', 'Estado del lead', 'select', opt(Object.entries(STATUSES).map(([k, [l]]) => [k, l]))], ['jobTitle', 'Cargo'],
      ['country', 'País/región'], ['customer_type', 'Tipo de Cliente', 'select', opt(['Instalador', 'Distribuidor', 'Arquitecto', 'Constructor', 'Particular'])],
      ['state', 'Estado o región'], ['sales_rep', 'Independent Sales Rep'], ['hs_buying_role', 'Rol de compra'],
      ['owner', 'Propietario del contacto', 'select', ownerOpts], ['lifecycle', 'Etapa del ciclo de vida', 'select', opt(LIFECYCLES)],
      ['source', 'Fuente original', 'select', opt(SOURCES)], ['city', 'Ciudad'], ['created', 'Fecha de creación', 'date-ro'],
      ['notes_next_activity_date', 'Fecha de la próxima actividad', 'date-ro'],
    ],
    highlights: (r) => [['Fecha de creación', formatDate(r.created)], ['Etapa del ciclo de vida', r.lifecycle], ['Última actividad', formatDate(r.lastActivity)], ['Próxima actividad', r.notes_next_activity_date ? formatDate(r.notes_next_activity_date) : '--'], ['Estado del lead', labelOf(Object.entries(STATUSES).map(([k, [l]]) => [k, l]), r.status)]],
    assoc: (r) => [
      ['Empresas', r.companyId ? [byId(allCompanies(), r.companyId)].filter(Boolean) : [], 'companies'],
      ['Negocios', allDeals().filter((d) => Number(d.contactId) === Number(r.id)), 'deals'],
      ['Tickets', allTickets().filter((t) => Number(t.contactId) === Number(r.id)), 'tickets'],
      ['Tareas', allTasks().filter((t) => taskLinksTo(t, 'contacts', r.id)), 'tasks'],
    ],
    leadStage: true,
  },
  companies: {
    label: 'Empresas', singular: 'empresa', sub: 'Empresas', listHref: `${root}companies/`,
    title: (r) => r.name, subtitle: (r) => [r.industry, r.city].filter(Boolean).join(' · '), mail: (r) => r.domain,
    // "Información clave" of the original's company record, in its order; the last one is calculated.
    fields: [
      ['name', 'Nombre'], ['address', 'Dirección'], ['city', 'Ciudad'], ['owner', 'Propietario', 'select', ownerOpts],
      ['lifecycle', 'Etapa del ciclo de vida', 'select', opt(LIFECYCLES)], ['hs_lead_status', 'Estado del lead', 'select', opt(['Nuevo', 'Abierto', 'En progreso', 'Abierto para negocio', 'No calificado', 'Intento de contacto', 'Conectado', 'Mal momento'])],
      ['industry', 'Sector', 'select', opt(['Construcción', 'Arquitectura', 'Reformas', 'Inmobiliaria', 'Decoración', 'Fabricación de vidrio'])], ['customer_type', 'Tipo de Cliente', 'select', opt(['Instalador', 'Distribuidor', 'Arquitecto', 'Constructor', 'Particular'])],
      ['notes_last_contacted', 'Último contacto', 'date'], ['target_account', 'Cuenta objetivo', 'select', opt(['Sí', 'No'])], ['products_of_interest', 'Productos de interés'],
      ['assoc_deals_count', 'Negocios asociados', 'calc', (r) => String(allDeals().filter((d) => Number(d.companyId) === Number(r.id)).length)],
      ['domain', 'Dominio'], ['hs_additional_domains', 'Dominios adicionales'], ['phone', 'Número de teléfono', 'tel'], ['employees', 'Empleados', 'number'], ['revenue', 'Ingresos anuales', 'number'], ['created', 'Fecha de creación', 'date-ro'],
      ['notes_next_activity_date', 'Fecha de la próxima actividad', 'date-ro'],
    ],
    highlights: (r) => [['Fecha de creación', formatDate(r.created)], ['Etapa del ciclo de vida', r.lifecycle], ['Última actividad', formatDate(r.lastActivity)], ['Próxima actividad', r.notes_next_activity_date ? formatDate(r.notes_next_activity_date) : '--'], ['Ingresos anuales', formatMoney(r.revenue)]],
    assoc: (r) => [
      // Contacts whose primary company this is, plus the ones associated to it as a secondary company.
      ['Contactos', allContacts().filter((c) => Number(c.companyId) === Number(r.id) || (Array.isArray(c.assoc_companies) && c.assoc_companies.map(Number).includes(Number(r.id)))), 'contacts'],
      ['Negocios', allDeals().filter((d) => Number(d.companyId) === Number(r.id)), 'deals'],
      ['Tickets', allTickets().filter((t) => Number(t.companyId) === Number(r.id) || allContacts().some((c) => Number(c.id) === Number(t.contactId) && Number(c.companyId) === Number(r.id))), 'tickets'],
      // Tasks tied to the company (companyId or assoc_companies: bulk «Crear tareas», the task form).
      ['Tareas', allTasks().filter((t) => taskLinksTo(t, 'companies', r.id)), 'tasks'],
    ],
  },
  deals: {
    label: 'Negocios', singular: 'negocio', sub: 'Negocios', listHref: `${root}deals/`,
    title: (r) => r.name, subtitle: (r) => `${formatMoney(r.amount, r.deal_currency_code)} · ${dealStageLabel(r.pipeline, r.stage)}`, mail: () => '',
    fields: [
      ['closedLostReason', 'Motivo del cierre perdido'], ['closedWonReason', 'Motivo del cierre ganado'],
      ['amount', 'Importe', 'number'], ['deal_currency_code', 'Moneda', 'select', opt(CURRENCY_CODES.map((c) => [c, `${c} · ${CURRENCY_DEFS[c].name}`]))], ['stage', 'Etapa del negocio', 'select', opt(allDealStages().map(([k, l]) => [k, l]))], ['closeDate', 'Fecha de cierre', 'date'],
      ['owner', 'Propietario del negocio', 'select', ownerOpts], ['company', 'Empresa asociada'], ['priority', 'Prioridad', 'select', opt(PRIORITIES.map(([k, l]) => [k, l]))],
      ['type', 'Tipo de negocio', 'select', opt(['Nuevo negocio', 'Negocio existente'])], ['important', 'Importante', 'select', [['true', 'Sí'], ['', 'No']]], ['pipeline', 'Pipeline', 'ro'], ['created', 'Fecha de creación', 'date-ro'],
      ['notes_next_activity_date', 'Fecha de la próxima actividad', 'date-ro'],
    ],
    highlights: (r) => [['Importe', formatMoney(r.amount, r.deal_currency_code)], ['Fecha de cierre', formatDate(r.closeDate)], ['Probabilidad', `${dealStageProb(r.pipeline, r.stage)} %`], ['Última actividad', formatDate(r.lastActivity)], ['Próxima actividad', r.notes_next_activity_date ? formatDate(r.notes_next_activity_date) : '--']],
    stages: true,
    assoc: (r) => [
      ['Contactos', r.contactId ? [byId(allContacts(), r.contactId)].filter(Boolean) : [], 'contacts'],
      ['Empresas', r.companyId ? [byId(allCompanies(), r.companyId)].filter(Boolean) : [], 'companies'],
      ['Tareas', allTasks().filter((t) => taskLinksTo(t, 'deals', r.id)), 'tasks'],
    ],
  },
  tickets: {
    label: 'Tickets', singular: 'ticket', sub: 'Tickets', listHref: `${root}tickets/`,
    title: (r) => r.name, subtitle: (r) => `${ticketStatusLabel(r.pipeline, r.status)} · Prioridad ${labelOf(PRIORITIES, r.priority).toLowerCase()}`, mail: () => '',
    fields: [
      ['status', 'Estado del ticket', 'select', opt(TICKET_STATUSES.map(([k, l]) => [k, l]))], ['priority', 'Prioridad', 'select', opt(PRIORITIES.map(([k, l]) => [k, l]))],
      ['owner', 'Propietario del ticket', 'select', ownerOpts], ['source', 'Fuente', 'select', opt(['Correo', 'Formulario', 'Chat', 'Teléfono'])],
      ['description', 'Descripción', 'textarea'], ['pipeline', 'Pipeline', 'select', opt(ticketPipelines())], ['created', 'Fecha de creación', 'date-ro'],
    ],
    highlights: (r) => [['Fecha de creación', formatDate(r.created)], ['Estado', ticketStatusLabel(r.pipeline, r.status)], ['Prioridad', labelOf(PRIORITIES, r.priority)], ['Última actividad', formatDate(r.lastActivity)]],
    // The account's real custom ticket properties shown on the «Acerca de» card by default (the two hidden
    // «Source Incoming …» ones stay in «Ver todas las propiedades»).
    cardExtra: ['municipio', 'vendedor_solicitante'],
    stages: true,
    // Contacts and companies (a ticket gets the primary company of its contact automatically).
    assoc: (r) => [
      ['Contactos', r.contactId ? [byId(allContacts(), r.contactId)].filter(Boolean) : [], 'contacts'],
      ['Empresas', r.companyId ? [byId(allCompanies(), r.companyId)].filter(Boolean) : [], 'companies'],
      ['Tareas', allTasks().filter((t) => taskLinksTo(t, 'tickets', r.id)), 'tasks'],
    ],
  },
  tasks: {
    label: 'Tareas', singular: 'tarea', sub: 'Tareas', listHref: `${root}tasks/`,
    title: (r) => r.name, subtitle: (r) => `${r.type} · vence ${formatDate(r.due)}`, mail: () => '',
    fields: [
      ['notes', 'Notas', 'textarea'],
      ['status', 'Estado', 'select', opt(TASK_STATUSES.map(([k, l]) => [k, l]))], ['type', 'Tipo de tarea', 'select', opt(TASK_TYPES)], ['due', 'Fecha de vencimiento', 'date'], ['reminderAt', 'Recordatorio', 'datetime'],
      ['priority', 'Prioridad', 'select', opt(PRIORITIES.map(([k, l]) => [k, l]))], ['owner', 'Asignada a', 'select', ownerOpts], ['recur', 'Repetir', 'select', opt(RECUR_OPTIONS)], ['created', 'Fecha de creación', 'date-ro'],
    ],
    highlights: (r) => [['Vence', formatDate(r.due)], ['Estado', labelOf(TASK_STATUSES, r.status)], ['Prioridad', labelOf(PRIORITIES, r.priority)], ['Recordatorio', r.reminderAt ? `${reminderText(r.reminderAt)}${r.reminderFiredAt ? ' · avisado' : ''}` : '--']],
    assoc: (r) => Object.entries(TASK_ASSOCIATIONS).map(([kind, label]) => [label, kind === 'contacts' && r.contactId ? [byId(allContacts(), r.contactId)].filter(Boolean) : [], kind]),
  },
};

const cfg = CONFIG[type];
boot({ root, active: 'crm', sub: cfg.sub, title: cfg.label });

const id = new URLSearchParams(location.search).get('id');
// The timeline loads only this record's activities (record_type + record_id), not the whole table.
await ensureActivitiesFor(type, id);
await sequencesReady;
// Llamadas reales de Twilio ligadas a esta ficha (aparecen en la cronología con grabación y
// transcripción), como en la pestaña «Llamadas» del original.
let callLogs = [];
const CALL_OUTCOME = { completed: 'Conectado', 'no-answer': 'Sin respuesta', busy: 'Ocupado', canceled: 'Cancelada', failed: 'Fallida', 'in-progress': 'En curso', ringing: 'Sonando', queued: 'En cola', initiated: 'Iniciada' };
async function loadCallLogs() {
  callLogs = [];
  if (!supabase || !dbIsLive() || (type !== 'contacts' && type !== 'companies')) return;
  const col = type === 'companies' ? 'company_id' : 'contact_id';
  try {
    const { data, error } = await supabase.from('call_logs').select('call_sid,direction,status,duration_sec,started_at,recording_url,transcript,outcome').eq(col, String(id)).order('started_at', { ascending: false }).limit(100);
    if (!error && Array.isArray(data)) callLogs = data;
  } catch { /* sin llamadas */ }
}
await loadCallLogs();
let rec = findRecord(type, id);
// A ticket's status choices are the statuses of its own pipeline.
if (type === 'tickets' && rec) { const f = cfg.fields.find((x) => x[0] === 'status'); if (f) f[3] = opt(ticketStatusesFor(rec.pipeline).map(([k, l]) => [k, l])); }
const $ = (s) => document.getElementById(s);
const mount = $('record-root');
const props = propertyMap(type);
let queueBar = null; // the task-queue bar on top of the page (mounted at the end, refreshed after saves)

// ---------- static layout ----------
mount.innerHTML = `
  <div class="tq" id="task-queue" hidden></div>
  <div class="record">
    <section class="record__left">
      <div class="card card--tight">
        <div class="record__top">
          <a class="back" id="back" href="../">‹ ${cfg.label}</a>
          <div class="menu record__actions">
            <button class="btn btn--outline btn--sm" type="button" aria-haspopup="true" aria-expanded="false">Acciones <span class="caret"></span></button>
            <div class="menu__panel menu__panel--actions" id="actions-menu">
              <button class="menu__item" type="button" data-act="follow" id="follow-item">Seguir</button>
              <div class="menu__sep"></div>
              <button class="menu__item" type="button" data-act="all-props">Ver todas las propiedades</button>
              <button class="menu__item" type="button" data-act="prop-history">Ver el historial de la propiedad</button>
              <div class="menu__sep"></div>
              <button class="menu__item" type="button" data-act="assoc-history">Ver historial de asociaciones</button>
              <button class="menu__item" type="button" data-act="review-assoc">Revisar asociaciones</button>
              <div class="menu__sep"></div>
              <button class="menu__item" type="button" data-act="summarize"><span class="ai-spark">✦</span> Resumir</button>
              <div class="menu__sep"></div>
              <button class="menu__item" type="button" data-act="google">Buscar en Google <span class="ext">↗</span></button>
              ${type === 'contacts' ? '<button class="menu__item" type="button" data-act="unsubscribe">Gestionar suscripción de marketing</button>' : ''}
              <div class="menu__sep"></div>
              <button class="menu__item" type="button" data-act="restore-activity">Restaurar actividades eliminadas</button>
              <button class="menu__item" type="button" data-act="access">Ver acceso a los registros</button>
              <button class="menu__item" type="button" data-act="merge">Fusionar</button>
              <button class="menu__item" type="button" data-act="clone">Clonar</button>
              <button class="menu__item" type="button" data-act="delete">Eliminar</button>
              <div class="menu__sep"></div>
              <button class="menu__item" type="button" data-act="export">Exportar datos de ${cfg.singular}</button>
              <div class="menu__sep"></div>
              <button class="menu__item" type="button" data-action="signature">Editar mi firma de correo</button>
            </div>
          </div>
        </div>
        <div class="record__identity">
          <span class="avatar avatar--lg avatar--soft" id="rec-avatar">··</span>
          <div class="record__who">
            <h1 id="rec-name">Registro <button class="pencil" type="button" data-act="rename" aria-label="Editar nombre">✎</button></h1>
            <p class="record__sub" id="rec-sub"></p>
            <p class="record__mail" id="rec-mail"></p>
            <p class="record__mail" id="rec-phone"></p>
          </div>
        </div>
        <div class="record__quick" id="quick-row"></div>
      </div>

      <div class="card">
        <div class="card__head card__head--about">
          <button class="card__toggle" type="button" data-toggle="about"><span class="chev">⌄</span> <span id="about-title">Acerca de este objeto</span></button>
          <span class="card__tools">
            <div class="menu">
              <button class="link-btn link-btn--dark" type="button" aria-haspopup="true" aria-expanded="false">Acciones <span class="caret"></span></button>
              <div class="menu__panel menu__panel--right">
                <button class="menu__item" type="button" data-act="all-props">Ver todas las propiedades</button>
                <button class="menu__item" type="button" data-act="prop-history">Ver el historial de la propiedad</button>
                <div class="menu__sep"></div>
                <button class="menu__item" type="button" data-act="customize-props">Personalizar propiedades</button>
              </div>
            </div>
            <button class="icon-btn icon-btn--round icon-btn--sm tip" type="button" data-act="customize-props" aria-label="Personalizar la tarjeta"><span class="ico ico--gear"></span><span class="tip__text">Personalizar la tarjeta</span></button>
          </span>
        </div>
        <dl class="props" id="rec-props"></dl>
        <p class="props__custom"><button class="link-btn" type="button" data-act="all-props-panel">Ver todas las propiedades</button><button class="link-btn" type="button" data-act="customize-props">Personalizar</button></p>
      </div>
    </section>
    <div class="slideover" id="allprops-panel" aria-hidden="true">
      <div class="slideover__scrim" data-act="all-props-close"></div>
      <aside class="slideover__panel slideover__panel--wide" role="dialog" aria-modal="true" aria-labelledby="allprops-title">
        <header class="slideover__head"><h2 id="allprops-title">Todas las propiedades</h2><button class="slideover__close" type="button" data-act="all-props-close" aria-label="Cerrar">×</button></header>
        <div class="slideover__body allprops">
          <div class="search allprops__search"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="allprops-q" placeholder="Buscar propiedades" aria-label="Buscar propiedades" autocomplete="off" /></div>
          <p class="allprops__count" id="allprops-count" aria-live="polite"></p>
          <div id="allprops-groups"></div>
        </div>
      </aside>
    </div>

    <section class="record__middle">
      <button class="side-toggle tip" type="button" id="side-toggle" aria-pressed="false" aria-label="Contraer barra lateral">
        <span class="ico ico--sidebar" aria-hidden="true"></span>
        <span class="tip__text tip__text--left" id="side-toggle-tip">Contraer barra lateral</span>
      </button>
      <div class="rtabs" role="tablist" id="rec-tabs"></div>

      <div class="tabpane" id="pane-overview">
        <div class="card" id="rec-stages" hidden></div>
        <div id="overview-body"></div>
      </div>
      <div id="custom-panes"></div>

      <div class="tabpane" id="pane-description" hidden>
        <div class="card">
          <h3 class="card__title">Descripción</h3>
          <form class="note" id="desc-form">
            <textarea name="desc" rows="5" placeholder="Añade una descripción de este registro..." aria-label="Descripción"></textarea>
            <div class="note__foot"><button class="btn btn--primary btn--sm" type="submit">Guardar</button></div>
          </form>
        </div>
      </div>

      <div class="tabpane" id="pane-activity" hidden>
        <div class="card">
          <div class="card__head">
            <h3 class="card__title">Actividades</h3>
            <div class="search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="act-search" placeholder="Buscar actividades" aria-label="Buscar actividades" /></div>
          </div>
          <div class="act-filters" id="act-filters">
            <button class="chip is-set" type="button" data-kind="">Todo</button>
            <button class="chip" type="button" data-kind="note">Notas</button>
            <button class="chip" type="button" data-kind="email">Correos</button>
            <button class="chip" type="button" data-kind="call">Llamadas</button>
            <button class="chip" type="button" data-kind="task">Tareas</button>
            <button class="chip" type="button" data-kind="meeting">Reuniones</button>
            <button class="chip" type="button" data-kind="message">Mensajes</button>
            <button class="chip" type="button" data-kind="system">Sistema</button>
          </div>
          <div class="act-selects" id="act-selects">
            <filter-chip id="act-date" aria-label="Fecha de actividad"><template><option value="">Todas las fechas</option><option value="0">Hoy</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option></template></filter-chip>
            <filter-chip id="act-who" aria-label="Actividad asignada a" owner><template><option value="">Cualquiera</option><option value="Tú">Tú</option>${OWNERS.filter((o) => o !== 'Sin asignar').map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}<option value="Sistema">Sistema</option></template></filter-chip>
            <button class="link-btn" type="button" data-actclear="1" id="act-clear" hidden>Borrar todo</button>
          </div>
          <form class="note" id="note-form">
            <textarea name="note" rows="3" placeholder="Escribe una nota..." aria-label="Nueva nota"></textarea>
            ${logAssociationsHtml()}
            <div class="note__foot"><button class="btn btn--primary btn--sm" type="submit">Guardar nota</button></div>
          </form>
          <ul class="timeline" id="rec-timeline"></ul>
        </div>
      </div>

      <div class="tabpane" id="pane-advanced" hidden>
        <div class="card">
          <div class="card__head">
            <h3 class="card__title">Todas las propiedades</h3>
            <div class="search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="adv-search" placeholder="Buscar propiedad" aria-label="Buscar propiedad" /></div>
          </div>
          <div id="all-props"></div>
        </div>
      </div>
    </section>

    <section class="record__right" id="rec-right"></section>
  </div>

  <aside class="adrawer" id="assoc-drawer" hidden></aside>
  <aside class="adrawer cdrawer" id="card-drawer" hidden></aside>

  <div class="drawer drawer--modal" id="rec-modal" aria-hidden="true">
    <div class="drawer__panel drawer__panel--modal drawer__panel--md" role="dialog" aria-labelledby="rec-modal-title">
      <div class="drawer__head drawer__head--light"><h2 id="rec-modal-title">—</h2><button class="drawer__close" type="button" data-close aria-label="Cerrar">×</button></div>
      <div class="drawer__body" id="rec-modal-body"></div>
      <div class="drawer__foot" id="rec-modal-foot"></div>
    </div>
  </div>`;

// ---------- helpers ----------
const loadJson = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const saveJson = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ---------- quick action buttons + "Más" menu ----------
import { ACT_ICONS } from './action-icons.js';
const QUICK = [
  ['note', ACT_ICONS.note, 'Nota'],
  ['email', ACT_ICONS.email, 'Correo'],
  ['call', ACT_ICONS.call, 'Llamar'],
  ['task', ACT_ICONS.task, 'Tarea'],
  ['meeting', ACT_ICONS.meeting, 'Reunión'],
];
const QUICK_ORDER_KEY = 'crm:quickorder';
const quickOrder = () => {
  const saved = loadJson(QUICK_ORDER_KEY, null);
  const keys = Array.isArray(saved) && saved.length === QUICK.length ? saved : QUICK.map((q) => q[0]);
  return keys.map((k) => QUICK.find((q) => q[0] === k)).filter(Boolean);
};
const MORE_ITEMS = [
  ['invoice', ACT_ICONS.invoice, 'Crea una factura'],
  ['quote', ACT_ICONS.quote, 'Crear cotización'],
  ['paylink', ACT_ICONS.paylink, 'Crear enlace de pago'],
  ['contract', ACT_ICONS.contract, 'Crear un contrato'],
  ['sequence', ACT_ICONS.sequence, 'Inscribir en una secuencia'],
  ['linkedin', ACT_ICONS.linkedin, 'Interactuar en LinkedIn', ['Ver perfil de LinkedIn', 'Enviar solicitud de conexión', 'Enviar InMail']],
  ['log', ACT_ICONS.log, 'Registrar actividad', ['Llamada', 'Correo', 'Reunión', 'Mensaje de LinkedIn', 'Mensaje de WhatsApp', 'SMS']],
  ['whatsapp', ACT_ICONS.whatsapp, 'Enviar mensaje de WhatsApp'],
  ['sms', ACT_ICONS.sms, 'Enviar SMS'],
  ['schedule', ACT_ICONS.schedule, 'Programar una reunión'],
  ['deal', ACT_ICONS.deal, 'Crear negocio'],
  ['ticket', ACT_ICONS.ticket, 'Crear ticket'],
  ['workflow', ACT_ICONS.workflow, 'Inscribir en un workflow'],
  ['list', ACT_ICONS.list, 'Agregar a lista'],
];
function renderQuick() {
  $('quick-row').innerHTML =
    quickOrder()
      .map(([k, ico, label]) => `<button class="quick" type="button" data-action="${k}"><span class="quick__ico">${ico}</span>${label}</button>`)
      .join('') +
    `<div class="menu quick__more">
      <button class="quick" type="button" aria-haspopup="true" aria-expanded="false"><span class="quick__ico">${ACT_ICONS.more}</span>Más</button>
      <div class="menu__panel more-menu" id="more-menu">
        <div class="more-menu__search"><input type="search" id="more-search" placeholder="Buscar" aria-label="Buscar acción" autocomplete="off" /><span class="ico ico--search" aria-hidden="true"></span></div>
        <div class="more-menu__list" id="more-list">
          ${MORE_ITEMS.map(
            ([k, ico, label, sub]) => `
            <div class="more-item${sub ? ' has-sub' : ''}" data-name="${esc(label.toLowerCase())}">
              <button class="more-item__btn" type="button" data-more="${k}">
                <span class="more-item__ico" aria-hidden="true">${ico}</span><span class="more-item__label">${label}</span>${sub ? '<span class="more-item__chev">›</span>' : ''}
              </button>
              ${sub ? `<div class="more-sub">${sub.map((s) => `<button class="menu__item" type="button" data-more="${k}" data-sub="${esc(s)}">${s}</button>`).join('')}</div>` : ''}
            </div>`,
          ).join('')}
          <p class="muted more-menu__empty" id="more-empty" hidden>Ninguna acción coincide.</p>
        </div>
        <div class="more-menu__foot"><button class="link-btn link-btn--dark" type="button" data-more="reorder">Reordenar botones de actividad</button></div>
      </div>
    </div>`;
  wireMenus($('quick-row'));
}
const loadNotes = () => activitiesFor(type, id);
const loadHistory = () => historyFor(type, id);
// «Seguir»: the per-user follow store (src/follows.js); its followers get the record's activity in the bell.
const isFollowing = () => followStoreHas(type, id);

function openModal(title, bodyHtml, footHtml = '<button class="btn btn--ghost" type="button" data-close>Cerrar</button>') {
  $('rec-modal-title').textContent = title;
  $('rec-modal-body').innerHTML = bodyHtml;
  $('rec-modal-foot').innerHTML = footHtml;
  $('rec-modal').classList.add('is-open');
  $('rec-modal').setAttribute('aria-hidden', 'false');
}
function closeModal() {
  $('rec-modal').classList.remove('is-open');
  $('rec-modal').setAttribute('aria-hidden', 'true');
}
$('rec-modal').addEventListener('click', (e) => {
  if (e.target === $('rec-modal') || e.target.closest('[data-close]')) closeModal();
});

// ---------- "Registrar actividad": dedicated forms per type (espec actividades §2) ----------
function logAssociationsHtml() { return sharedLogAssociationsHtml(type, rec); }
let editingActivity = null;
function activityOriginHtml(ev) {
  const origin = ev.extra?.associatedFrom;
  if (!origin) return '';
  const label = CONFIG[origin.type]?.singular || origin.type;
  const name = findRecord(origin.type, origin.id)?.name || ev.extra.associatedFromName || origin.id;
  return `<div class="muted">registrada desde ${esc(label)} ${esc(name)}</div>`;
}
function openLogModal(kind, options = {}) {
  editingActivity = options.activity || null;
  showLogModal(kind, { ...options, type, rec, openModal, $ });
}

function displayValue(f, r) {
  const [key, , kind, options] = f;
  const v = key === 'recur' ? ((r.recur && r.recur.freq) || '') : r[key]; // the recurrence is stored as { freq }
  if (props[key]?.sensitive) return sensitiveValue(v);
  if (kind === 'calc') return esc(typeof options === 'function' ? options(r) : '--'); // calculated (e.g. "Negocios asociados")
  if (key === 'owner' || (props[key] && props[key].kind === 'user')) return ownerHtml(v, 'sm');
  if (v === undefined || v === null || v === '') return EMPTY;
  if (props[key]?.hubspot?.options.length) return propValue(props[key], v);
  if (kind === 'select') return esc((options.find((o) => String(o[0]) === String(v)) || [v, v])[1]);
  if (kind === 'date' || kind === 'date-ro') return formatDate(v);
  if (kind === 'datetime') return esc(`${reminderText(v) || formatDate(v)}${key === 'reminderAt' && r.reminderFiredAt ? ' · avisado' : ''}`);
  if (key === 'amount' || key === 'revenue') return formatMoney(v, key === 'amount' ? r.deal_currency_code : undefined);
  if (kind === 'email' || key === 'email' || key === 'alt_email' || (props[key] && props[key].kind === 'email')) return linkHtml('email', v);
  if (kind === 'url' || key === 'domain' || key === 'website' || (props[key] && props[key].kind === 'url')) return linkHtml('url', v);
  if (kind === 'tel' || (props[key] && props[key].kind === 'phone')) return linkHtml('phone', v);
  return esc(v);
}
// «Repetir» of tasks is stored as { freq }: the dropdown edits the frequency string (data.js normalises it back).
const editor = (f, r) => propertyEditor(f, f[0] === 'recur' ? { ...r, recur: (r.recur && r.recur.freq) || '' } : r, props);

function propValue(p, v) {
  if (p?.sensitive) return sensitiveValue(v);
  if (p && p.kind === 'user') return ownerHtml(v, 'sm');
  if (v === undefined || v === null || v === '') return EMPTY;
  if (p.hubspot?.options.length) return esc((Array.isArray(v) ? v : String(v).split(';')).map(value => p.hubspot.options.find(o => o.value === String(value))?.label ?? value).join('; '));
  if (p.kind === 'currency') return formatMoney(v, type === 'deals' && p.key === 'amount' ? rec.deal_currency_code : undefined);
  if (p.kind === 'percent') return `${v} %`;
  if (p.kind === 'date' || p.kind === 'datetime') return formatDate(v);
  if (p.kind === 'url' || p.kind === 'email' || p.kind === 'phone') return linkHtml(p.kind, v);
  if (p.kind === 'stage') return esc(dealStageLabel(rec.pipeline, v));
  if (p.kind === 'priority') return esc(labelOf(PRIORITIES, v));
  if (p.kind === 'status') return esc(type === 'tickets' ? ticketStatusLabel(rec.pipeline, v) : labelOf(TASK_STATUSES, v));
  return esc(v);
}

// ---------- which properties the "Acerca de" card shows (customisable via the gear) ----------
// Saved in Supabase (user_settings: for this user, or for the whole account) with a localStorage copy.
const CARD_KEY = `crm:${type}:cardprops`;
const loadCard = () => (settingsLive() ? getSetting(CARD_KEY) : null) || loadJson(CARD_KEY, null);
// System-filled properties (counters, dates, analytics, scores…) are shown but never editable on the card.
const systemProp = (key) => Boolean(props[key] && props[key].system);
function fieldFor(key) {
  const own = cfg.fields.find((f) => f[0] === key);
  if (own) return systemProp(key) && own[2] !== 'ro' && own[2] !== 'date-ro' ? [key, own[1], own[2] === 'date' ? 'date-ro' : 'ro'] : own;
  const p = props[key];
  if (!p) return null;
  if (p.system) return [key, p.label, p.kind === 'date' || p.kind === 'datetime' ? 'date-ro' : 'ro'];
  // Keep semicolon-separated multi-checkbox values intact when editing.
  if (p.hubspot?.fieldType === 'checkbox') return [key, p.label, 'text'];
  if (p.hubspot && ['enum', 'bool'].includes(p.kind)) return p.options?.length
    ? [key, p.label, 'select', [['', '--'], ...p.hubspot.options.filter(o => !o.hidden || o.value === String(rec[key])).map(o => [o.value, o.label])]]
    : [key, p.label, 'text'];
  if (['enum', 'user', 'bool'].includes(p.kind)) return [key, p.label, 'select', (p.options || []).map((o) => [o, o])];
  if (p.kind === 'date' || p.kind === 'datetime') return [key, p.label, key === 'created' ? 'date-ro' : p.kind === 'datetime' ? 'datetime' : 'date'];
  if (['number', 'currency', 'percent'].includes(p.kind)) return [key, p.label, 'number'];
  if (p.kind === 'phone') return [key, p.label, 'tel'];
  if (p.kind === 'email') return [key, p.label, 'email'];
  if (p.kind === 'url') return [key, p.label, 'url'];
  if (p.kind === 'id') return [key, p.label, 'ro'];
  if (['stage', 'status', 'priority'].includes(p.kind)) return [key, p.label, 'ro'];
  if (key === 'description' || key === 'message') return [key, p.label, 'textarea'];
  return [key, p.label, 'text'];
}
const defaultCardKeys = () => [...(type === 'contacts' ? ['marketingOptOut', 'marketingOptOutAt', 'marketingOptOutReason'] : []), ...cfg.fields.map((f) => f[0]), ...(cfg.cardExtra || []).filter((k) => props[k])];
function currentFields() {
  const saved = loadCard();
  const keys = saved && Array.isArray(saved.keys) && saved.keys.length ? saved.keys : defaultCardKeys();
  return [...new Set([...(type === 'contacts' ? ['marketingOptOut', 'marketingOptOutAt', 'marketingOptOutReason'] : []), ...keys])].map(fieldFor).filter(Boolean);
}
function cardTitle() {
  const saved = loadCard();
  return (saved && saved.title) || (type === 'companies' ? 'Información clave' : 'Acerca de este objeto');
}

let cardDraft = null;
function openCardEditor() {
  const saved = loadCard();
  cardDraft = { title: cardTitle(), keys: (saved && saved.keys) || defaultCardKeys(), q: '', global: settingScope(CARD_KEY) === 'global' };
  renderCardEditor();
}
function renderCardEditor() {
  const groups = PROPERTIES[type] || [];
  const q = cardDraft.q.toLowerCase();
  const left = groups
    .map((grp) => {
      const items = grp.items.filter(([, l]) => !q || l.toLowerCase().includes(q));
      if (!items.length) return '';
      return `<section class="colgrp is-open"><button class="colgrp__head" type="button"><span class="colgrp__chev">▾</span>${grp.title} <span class="muted">${items.length}</span></button>
        <div class="colgrp__items">${items.map(([k, l]) => `<label class="colopt"><input type="checkbox" data-cardkey="${k}" ${cardDraft.keys.includes(k) ? 'checked' : ''} /><span>${l}</span></label>`).join('')}</div></section>`;
    })
    .join('');
  const right = cardDraft.keys
    .map((k, i) => {
      const f = fieldFor(k);
      if (!f) return '';
      return `<li class="colsel" data-key="${k}">
        <span class="colsel__grip" aria-hidden="true">⋮⋮</span><span class="colsel__label">${f[1]}</span>
        <span class="colsel__btns"><button type="button" data-cardmove="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button><button type="button" data-cardmove="1" ${i === cardDraft.keys.length - 1 ? 'disabled' : ''} aria-label="Bajar">▼</button><button type="button" data-cardremove aria-label="Quitar" ${cardDraft.keys.length === 1 ? 'disabled' : ''}>×</button></span>
      </li>`;
    })
    .join('');
  openModal(
    'Personalizar la tarjeta de propiedades',
    `<div class="cardprops">
      <div class="cardprops__left">
        <div class="search coled__search"><span class="ico ico--search" aria-hidden="true"></span><input id="card-search" type="search" value="${esc(cardDraft.q)}" placeholder="Buscar propiedades" aria-label="Buscar propiedades" /></div>
        <p class="muted coled__hint">Marca las propiedades que quieres ver en la tarjeta de la ficha.</p>
        <div class="coled__groups cardprops__groups">${left || '<p class="muted">Ninguna propiedad coincide.</p>'}</div>
      </div>
      <div class="cardprops__right">
        <label class="field"><span>Nombre de la tarjeta</span><input id="card-title" type="text" value="${esc(cardDraft.title)}" maxlength="40" /></label>
        <h3 class="cardprops__h">Propiedades seleccionadas (${cardDraft.keys.length})</h3>
        <ul class="coled__selected cardprops__selected" id="card-selected">${right}</ul>
        <label class="ocheck ocheck--sm cardprops__scope"><input type="checkbox" id="card-global" ${cardDraft.global ? 'checked' : ''} /><span><strong>Aplicar a todos los usuarios de la cuenta</strong><small>${settingsLive() ? 'Se guarda en Supabase: solo para ti, o para toda la cuenta si marcas esta casilla.' : 'Sin conexión con Supabase se guarda en este navegador.'}</small></span></label>
      </div>
    </div>`,
    `<button class="btn btn--primary" type="button" data-confirm="card-save">Guardar</button><button class="btn btn--ghost" type="button" data-confirm="card-reset">Restablecer</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`,
  );
  const s = $('card-search');
  if (q) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

// ---------- renderers ----------
function renderProps() {
  $('about-title').textContent = cardTitle();
  $('rec-props').innerHTML = currentFields()
    .map((f) => {
      const ro = f[2] === 'ro' || f[2] === 'date-ro' || f[2] === 'calc';
      return `<div class="props__row" data-key="${f[0]}">
        <dt>${f[1]}</dt>
        <dd class="props__value">${displayValue(f, rec)}${ro ? '' : `<button class="props__edit" type="button" data-edit-key="${f[0]}" aria-label="Editar ${f[1]}">✎</button>`}</dd>
      </div>`;
    })
    .join('');
  if (type === 'tasks') $('rec-props').insertAdjacentHTML('beforeend', Object.entries(TASK_ASSOCIATIONS).map(([kind, label]) => `<div class="props__row"><dt>${label}</dt><dd>${taskAssociationLinks(rec, kind, root)}</dd></div>`).join(''));
}

// "Ver todas las propiedades": a slide-over with every property of the catalog (custom ones included), its
// value, inline editing, a search box and how many have a value.
const hasValue = (k) => { const v = rec[k]; return !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)); };
const allPropsOpen = () => Boolean($('allprops-panel') && $('allprops-panel').classList.contains('is-open'));
function openAllProps() {
  const panel = $('allprops-panel');
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-slideover');
  renderAllPropsPanel();
  setTimeout(() => $('allprops-q').focus(), 50);
}
function closeAllProps() {
  const panel = $('allprops-panel');
  if (!panel) return;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-slideover');
}
function renderAllPropsPanel() {
  if (!allPropsOpen()) return;
  const q = $('allprops-q').value.trim().toLowerCase();
  const groups = PROPERTIES[type] || [];
  const all = groups.flatMap((g) => g.items);
  const withValue = all.filter(([k]) => hasValue(k)).length;
  $('allprops-count').innerHTML = `<strong>${withValue}</strong> de ${all.length} propiedades con valor`;
  $('allprops-groups').innerHTML = groups
    .map((grp) => {
      const items = grp.items.filter(([k, l]) => !q || l.toLowerCase().includes(q) || k.toLowerCase().includes(q));
      if (!items.length) return '';
      const n = grp.items.filter(([k]) => hasValue(k)).length;
      return `<section class="propgrp allprops__group" data-group="${esc(grp.title)}"><h4>${esc(grp.title)} <span class="allprops__n">${n} de ${grp.items.length} con valor</span></h4><dl class="props">${items
        .map(([k, l]) => {
          const f = fieldFor(k);
          const ro = !f || f[2] === 'ro' || f[2] === 'date-ro' || f[2] === 'calc';
          return `<div class="props__row" data-key="${esc(k)}"><dt>${esc(l)}</dt><dd class="props__value">${f ? displayValue(f, rec) : propValue(props[k], rec[k])}${ro ? '' : `<button class="props__edit" type="button" data-edit-key="${esc(k)}" aria-label="Editar ${esc(l)}">✎</button>`}</dd></div>`;
        })
        .join('')}</dl></section>`;
    })
    .join('') || '<p class="muted">Ninguna propiedad coincide con la búsqueda.</p>';
}

function renderAllProps(query = '') {
  const q = query.trim().toLowerCase();
  const groups = PROPERTIES[type] || [];
  $('all-props').innerHTML = groups
    .map((grp) => {
      const items = grp.items.filter(([, l]) => !q || l.toLowerCase().includes(q));
      if (!items.length) return '';
      return `<section class="propgrp"><h4>${grp.title}</h4><dl class="props props--two">${items
        .map(([k, l]) => `<div class="props__row"><dt>${l}</dt><dd>${propValue(props[k], rec[k])}</dd></div>`)
        .join('')}</dl></section>`;
    })
    .join('') || '<p class="muted">Ninguna propiedad coincide.</p>';
}

function renderHeader() {
  document.title = `${cfg.title(rec)} · ${cfg.label}`;
  const av = $('rec-avatar');
  if (type === 'companies') av.outerHTML = companyAvatarHtml(rec, 'lg').replace('<span ', '<span id="rec-avatar" ');
  else { av.textContent = initials(cfg.title(rec)); av.style.background = colorFor(rec.id); }
  $('rec-name').firstChild.textContent = `${cfg.title(rec)} `;
  $('rec-sub').textContent = cfg.subtitle(rec);
  const mail = cfg.mail(rec);
  const copyBtn = (v) => `<button class="copy" type="button" data-copy="${esc(v)}" aria-label="Copiar ${esc(v)}" title="Copiar">⧉</button>`;
  $('rec-mail').innerHTML = mail ? `<a href="${mail.includes('@') ? `mailto:${esc(mail)}` : `https://${esc(mail.replace(/^https?:\/\//, ''))}`}" ${mail.includes('@') ? '' : 'target="_blank" rel="noopener"'}>${esc(mail)}</a> ${copyBtn(mail)} <span class="ext">↗</span>` : '';
  // Phone with its own copy button (the original's company header shows domain and phone side by side).
  const phone = displayPhone(rec.phone || rec.mobilephone || '');
  if ($('rec-phone')) $('rec-phone').innerHTML = phone ? `<a href="${esc(phoneHref(phone))}">${esc(phone)}</a> ${copyBtn(phone)}` : '';
  $('follow-item').textContent = isFollowing() ? 'Dejar de seguir' : 'Seguir';
  if ($('rec-highlights')) $('rec-highlights').innerHTML = cfg.highlights(rec).map(([k, v]) => `<div class="highlight"><span class="highlight__label">${k}</span><span class="highlight__value">${esc(v)}</span></div>`).join('');

  const stagesEl = $('rec-stages');
  if (cfg.stages && type === 'deals') {
    // The stage bar follows the deal's own pipeline: its open stages, then "Ganado".
    const steps = stagesFor(rec.pipeline).filter((s) => !isClosedStage(s[0]) || s[0] === 'won');
    const idx = steps.findIndex((s) => s[0] === rec.stage);
    stagesEl.hidden = false;
    stagesEl.innerHTML = `<div class="stages">${steps
      .map((s, i) => `<button type="button" class="stages__step${i <= idx ? ' is-done' : ''}${s[0] === rec.stage ? ' is-current' : ''}" data-stage="${s[0]}" title="${esc(s[1])}">${esc(s[1])}</button>`)
      .join('')}</div>
      <div class="stages__actions"><button class="btn btn--primary btn--sm" type="button" data-stage="won">Marcar como ganado</button><button class="btn btn--ghost btn--sm" type="button" data-stage="lost">Marcar como perdido</button></div>`;
  } else if (cfg.stages && type === 'tickets') {
    stagesEl.hidden = false;
    const statuses = ticketStatusesFor(rec.pipeline);
    stagesEl.innerHTML = `<div class="stages">${statuses.map(([k, l, t]) => `<button type="button" class="stages__step${k === rec.status ? ' is-current is-done' : ''}${t === 'closed' ? ' stages__step--closed' : ''}" data-status="${k}" title="${t === 'closed' ? 'Estado cerrado' : 'Estado abierto'}">${esc(l)}</button>`).join('')}</div>
      <p class="muted stages__note">Pipeline «${esc(rec.pipeline || ticketPipelines()[0])}» · ${statuses.filter((s) => s[2] !== 'closed').length} estados abiertos y ${statuses.filter((s) => s[2] === 'closed').length} cerrado${statuses.filter((s) => s[2] === 'closed').length === 1 ? '' : 's'}</p>`;
  } else if (type === 'tasks') {
    stagesEl.hidden = false;
    stagesEl.innerHTML = rec.status === 'done'
      ? `<button class="btn btn--ghost btn--sm" type="button" data-status="todo">Reabrir tarea</button>`
      : `<button class="btn btn--primary btn--sm" type="button" data-status="done">Marcar como completada</button>`;
    let panel = $('task-subtasks');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'task-subtasks';
      stagesEl.after(panel);
    }
    mountSubtasks(panel, rec.id, () => {
      rec = findRecord('tasks', rec.id);
      renderAll();
    });
  }
}

function summaryText() {
  const name = cfg.title(rec);
  const who = rec.owner && rec.owner !== 'Sin asignar' ? rec.owner : 'nadie todavía';
  const open = allTasks().filter((t) => Number(t.contactId) === Number(rec.id) && t.status !== 'done');
  const pending = open.length
    ? `Hay ${open.length === 1 ? 'una tarea pendiente' : `${open.length} tareas pendientes`}: "${open[0].name}" con vencimiento el ${formatDate(open[0].due)}.`
    : 'No hay tareas pendientes en este registro.';
  return {
    when: fmtTime(new Date()),
    lines: [
      `${name} se creó el ${formatDate(rec.created)}${rec.company ? ` y está asociado a ${rec.company}` : ''}. Propietario: ${who}.`,
      pending,
      `Acción sugerida: revisar la última actividad del ${formatDate(rec.lastActivity)} y registrar el resultado en el ${cfg.singular}.`,
    ],
  };
}
function renderAi() {
  const s = summaryText();
  const html = `
    <div class="ai-box__meta">Generado ${s.when} <button class="icon-btn icon-btn--xs" type="button" data-act="summarize" aria-label="Regenerar">↻</button></div>
    ${s.lines.map((l, i) => `<p>${i === 1 ? '<strong>Tarea pendiente:</strong> ' : ''}${esc(l)} ${i === 1 ? '<span class="src-badge">1</span>' : ''}</p>`).join('')}
    <div class="ai-box__foot"><span class="src">${ACT_ICONS.link} 2 Fuentes</span><button type="button" data-act="fb-up" aria-label="Útil">${ACT_ICONS.thumbsUp}</button><button type="button" data-act="fb-down" aria-label="No útil">${ACT_ICONS.thumbsDown}</button><button type="button" data-act="copy-summary" aria-label="Copiar">${ACT_ICONS.copy}</button></div>
    <button class="btn btn--pill btn--sm" type="button" data-act="ask">✦ Hacer una pregunta</button>`;
  if ($('ai-summary')) $('ai-summary').innerHTML = html;
  if ($('ai-right')) $('ai-right').innerHTML = html;
  if ($('recent-box')) $('recent-box').innerHTML = `<div class="ai-box__meta">Generado ${s.when}</div><p>${esc(`${cfg.title(rec)} ha tenido ${1 + (Number(rec.id) % 4)} visitas al sitio, la más reciente el ${formatDate(rec.lastActivity)}. ${s.lines[1]}`)}</p><div class="recent__cta"><button class="btn btn--outline btn--sm" type="button" data-action="email">✉ Crear correo</button></div>`;
}

function renderLead() {
  if (!cfg.leadStage || !$('lead-card')) return;
  $('lead-card').hidden = false;
  const stage = rec.lead_stage || 'Nuevo';
  const stages = ['Nuevo', 'Intentando contactar', 'Conectado', 'Calificado'];
  const idx = stages.indexOf(stage);
  $('lead-box').innerHTML = `
    <div class="lead">
      <span class="tag tag--none">Principal</span>
      <a class="lead__name" href="#">${esc(cfg.title(rec))} ${new Date(rec.created).getFullYear()}-${String(new Date(rec.created).getMonth() + 1).padStart(2, '0')}</a>
      <div class="lead__row"><span>Responsable:</span><strong>${ownerHtml(rec.owner, 'xs')}</strong></div>
      <div class="lead__row"><span>Tipo de lead:</span>
        <select class="lead__select" data-lead="lead_type" aria-label="Tipo de lead">${['Nueva empresa', 'Venta adicional', 'Venta cruzada', 'Renovación'].map((o) => `<option ${(rec.lead_type || 'Nueva empresa') === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="lead__row"><span>Etapa:</span>
        <select class="lead__select" data-lead="lead_stage" aria-label="Etapa del lead">${stages.map((o) => `<option ${stage === o ? 'selected' : ''}>${o}</option>`).join('')}</select> <span class="muted">(Lead pipeline)</span></div>
      <div class="lead__row"><span>Creado el ${formatDate(rec.created)}</span></div>
      <div class="lead__bar">${stages.map((_, i) => `<span class="${i <= idx ? 'is-done' : ''}"></span>`).join('')}</div>
    </div>`;
}

// ---------- association cards: settings (gear → "Editar tarjeta predeterminada") ----------
const ACARD_KEY = (kind) => `crm:${type}:assoccard:${kind}`;
const ACARD_DEFAULT = {
  companies: ['name', 'domain', 'phone'],
  contacts: ['name', 'email', 'phone'],
  deals: ['name', 'amount', 'closeDate', 'stage'],
  tickets: ['name', 'status', 'priority'],
  tasks: ['name', 'due', 'type'],
};
const ACARD_MAX = 6;
const kindProps = {};
const propsOf = (kind) => kindProps[kind] || (kindProps[kind] = propertyMap(kind));
function acardSettings(kind) {
  const meta = KIND_META[kind] || { p: kind };
  return { title: meta.p, props: ACARD_DEFAULT[kind] || ['name'], quick: true, sortKey: 'created', sortDir: -1, ...loadJson(ACARD_KEY(kind), {}) };
}
function kindLabel(kind, key) {
  const p = propsOf(kind)[key];
  if (p) return p.label;
  return { name: 'Nombre', contact: 'Contacto asociado', company: 'Empresa asociada', due: 'Fecha de vencimiento', lastActivity: 'Última actividad' }[key] || key;
}
function kindValue(kind, key, r) {
  const v = r[key];
  if (v === undefined || v === null || v === '') return '--';
  if (kind === 'deals' && key === 'stage') return dealStageLabel(r.pipeline, v);
  if (kind === 'tickets' && key === 'status') return ticketStatusLabel(r.pipeline, v);
  if (kind === 'tasks' && key === 'status') return labelOf(TASK_STATUSES, v);
  if (kind === 'contacts' && key === 'status') return labelOf(Object.entries(STATUSES).map(([k, [l]]) => [k, l]), v);
  if (key === 'priority') return labelOf(PRIORITIES, v);
  const p = propsOf(kind)[key];
  const kindOf = p ? p.kind : '';
  if (kindOf === 'currency' || key === 'amount' || key === 'revenue') return formatMoney(v, kind === 'deals' && key === 'amount' ? r.deal_currency_code : undefined);
  if (kindOf === 'percent') return `${v} %`;
  if (kindOf === 'date' || kindOf === 'datetime' || /Date|^due$|^created$/.test(key)) return formatDate(v);
  return String(v);
}
function kindSortValue(kind, key, r) {
  const v = r[key];
  const p = propsOf(kind)[key];
  if ((p && (p.kind === 'date' || p.kind === 'datetime')) || /Date|^due$|^created$/.test(key)) return v ? new Date(v).getTime() : 0;
  if (typeof v === 'number') return v;
  return String(v ?? '');
}
const acardUi = {}; // per kind: { q, showSearch, filter }
function assocCard(title, rows, kind) {
  const s = acardSettings(kind);
  const ui = acardUi[kind] || (acardUi[kind] = { q: '', showSearch: false, filter: 'all', sortKey: null, sortDir: null });
  const href = (r) => `${root}${kind}/record/?id=${r.id}`;
  const sortKey = ui.sortKey || s.sortKey;
  const sortDir = ui.sortDir || s.sortDir;
  let list = rows.map((r, i) => ({ ...r, assocLabel: r.assocLabel || (i === 0 ? 'Principal' : 'Sin etiqueta') }));
  if (ui.q) list = list.filter((r) => `${r.name} ${s.props.map((k) => kindValue(kind, k, r)).join(' ')}`.toLowerCase().includes(ui.q.toLowerCase()));
  if (ui.filter === 'primary') list = list.filter((r) => r.assocLabel === 'Principal');
  if (ui.filter === 'unlabeled') list = list.filter((r) => r.assocLabel === 'Sin etiqueta');
  list.sort((a, b) => {
    const av = kindSortValue(kind, sortKey, a);
    const bv = kindSortValue(kind, sortKey, b);
    return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'es')) * sortDir;
  });
  const sortable = ['created', ...s.props.filter((k) => k !== 'name')];
  const lines = s.props.filter((k) => k !== 'name');
  // Tasks can be completed right here: pending ones first, a checkbox instead of the initials.
  const isTask = kind === 'tasks';
  if (isTask) list.sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));
  const head = (r) => isTask
    ? `<input type="checkbox" class="assoc-card__check" data-task-done="${r.id}" ${r.status === 'done' ? 'checked' : ''} aria-label="${r.status === 'done' ? 'Reabrir tarea' : 'Marcar como completada'}" title="${r.status === 'done' ? 'Reabrir tarea' : 'Marcar como completada'}" /><a href="${href(r)}"><strong>${esc(r.name)}</strong></a><span class="assoc-card__due ${r.status === 'done' ? '' : dueClass(r)}">${r.status === 'done' ? 'Completada' : esc(dueText(r))}</span>`
    : `${kind === 'companies' ? companyAvatarHtml(r) : `<span class="assoc__logo">${esc(initials(r.name))}</span>`}<a href="${href(r)}"><strong>${esc(r.name)}</strong></a>`;
  return `
    <div class="card card--assoc" data-kind="${kind}">
      <div class="card__head">
        <button class="card__toggle" type="button" data-toggle="assoc-${kind}"><span class="chev">⌄</span> ${esc(s.title)} (${rows.length})</button>
        <span class="card__tools">
          <button class="link-btn" type="button" data-act="add-assoc" data-kind="${kind}">+ Agregar</button>
          <button class="icon-btn icon-btn--round icon-btn--sm tip" type="button" data-act="acard-edit" data-kind="${kind}" aria-label="Editar tarjeta"><span class="ico ico--gear"></span><span class="tip__text">Editar tarjeta</span></button>
        </span>
      </div>
      <div class="assoc-list" data-pane="assoc-${kind}">
        ${rows.length ? `
        <div class="acard-tools">
          <button class="icon-btn icon-btn--round icon-btn--sm${ui.showSearch ? ' is-on' : ''}" type="button" data-acard="search" data-kind="${kind}" aria-label="Buscar"><span class="ico ico--search"></span></button>
          <span class="acard-tools__right">
            <div class="menu"><button class="pill pill--xs${ui.filter !== 'all' ? ' is-set' : ''}" type="button" aria-haspopup="true">⚟ Filtros</button>
              <div class="menu__panel menu__panel--right">${[['all', 'Todos'], ['primary', 'Solo principal'], ['unlabeled', 'Sin etiqueta']].map(([v, l]) => `<button class="menu__item${ui.filter === v ? ' is-current' : ''}" type="button" data-acard="filter" data-kind="${kind}" data-value="${v}">${l}</button>`).join('')}</div></div>
            <div class="menu"><button class="pill pill--xs" type="button" aria-haspopup="true">${sortDir > 0 ? '↑' : '↓'} Ordenar</button>
              <div class="menu__panel menu__panel--right">${sortable.map((k) => `<button class="menu__item${sortKey === k ? ' is-current' : ''}" type="button" data-acard="sort" data-kind="${kind}" data-value="${k}">${esc(kindLabel(kind, k))}${sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}</button>`).join('')}</div></div>
          </span>
        </div>
        ${ui.showSearch ? `<div class="search search--sm acard-search"><span class="ico ico--search" aria-hidden="true"></span><input type="search" data-acard="q" data-kind="${kind}" value="${esc(ui.q)}" placeholder="Buscar ${esc(s.title.toLowerCase())}" aria-label="Buscar" /></div>` : ''}` : ''}
      ${list.length
        ? list
            .slice(0, 4)
            .map(
              (r) => `
          <div class="assoc-card${isTask && r.status === 'done' ? ' is-done' : ''}">
            <div class="assoc-card__head">${head(r)}</div>
            ${lines.map((k) => (kind === 'deals' && k === 'stage'
              ? `<div class="assoc-card__row"><span class="muted">${esc(kindLabel(kind, k))}:</span> <select class="acard-stage" data-deal-stage="${r.id}" aria-label="Etapa de ${esc(r.name)}">${stagesFor(r.pipeline).map((s) => `<option value="${esc(s[0])}" ${s[0] === r.stage ? 'selected' : ''}>${esc(s[1])}</option>`).join('')}</select></div>`
              : `<div class="assoc-card__row"><span class="muted">${esc(kindLabel(kind, k))}:</span> <a href="#">${esc(kindValue(kind, k, r))}</a> <button class="copy" type="button" data-copy="${esc(kindValue(kind, k, r))}" aria-label="Copiar">⧉</button></div>`)).join('')}
            ${s.quick ? `<span class="tag ${r.assocLabel === 'Principal' ? 'tag--done' : 'tag--none'} assoc-card__label">${esc(r.assocLabel === 'Principal' ? `${(KIND_META[kind] || { s: kind }).s} con ${cfg.singular} principal` : r.assocLabel)}</span>` : ''}
          </div>`,
            )
            .join('') + `<a class="link-btn assoc-more" href="${root}${kind}/${type === 'companies' ? `?company=${rec.id}` : type === 'contacts' ? `?contact=${rec.id}` : ''}">Ver todos los elementos asociados del tipo ${esc(s.title)} ↗</a>`
        : rows.length
          ? '<p class="muted">Ningún registro coincide con la búsqueda o el filtro.</p>'
          : `<div class="assoc-empty"><span class="assoc-empty__art" aria-hidden="true"></span><p class="muted">${esc(emptyText(kind))}</p></div>`}
      </div>
    </div>`;
}
function emptyText(kind) {
  return {
    companies: 'Ve las empresas u organizaciones asociadas a este registro.',
    contacts: 'Ve las personas asociadas a este registro.',
    deals: 'Haz seguimiento de las oportunidades de ingresos asociadas con este registro.',
    tickets: 'Haz seguimiento de las solicitudes de asistencia asociadas con este registro.',
    tasks: 'Ve las tareas pendientes asociadas con este registro.',
  }[kind] || 'Sin registros asociados.';
}

// "Editar tarjeta predeterminada" drawer
let cd = null;
function openAcardEditor(kind) {
  const s = acardSettings(kind);
  const sample = assocRows().find((x) => x[2] === kind);
  cd = { kind, title: s.title, props: s.props.slice(), quick: s.quick, sortKey: s.sortKey, sortDir: s.sortDir, previewId: rec.id, sampleRows: sample ? sample[1] : [] };
  renderAcardEditor();
  $('card-drawer').hidden = false;
}
function closeAcardEditor() {
  $('card-drawer').hidden = true;
  cd = null;
}
function renderAcardEditor() {
  if (!cd) return;
  const meta = KIND_META[cd.kind];
  const catalog = PROPERTIES[cd.kind] || [];
  const allKeys = catalog.flatMap((g) => g.items.map(([k, l]) => [k, l]));
  const sortOptions = [['created', 'Fecha de creación'], ...cd.props.filter((k) => k !== 'name').map((k) => [k, kindLabel(cd.kind, k)])];
  const previewSettings = { title: cd.title, props: cd.props, quick: cd.quick, sortKey: cd.sortKey, sortDir: cd.sortDir };
  const previewRows = cd.sampleRows;
  $('card-drawer').innerHTML = `
    <div class="cdrawer__panel" role="dialog" aria-labelledby="cd-title">
      <header class="cdrawer__head"><h2 id="cd-title">Editar tarjeta predeterminada</h2><button class="icon-btn" type="button" data-cd="close" aria-label="Cerrar">×</button></header>
      <div class="cdrawer__body">
        <div class="cdrawer__editor">
          <label class="cd-label" for="cd-name">Título de la tarjeta <span class="req">*</span> <span class="info" title="Es el nombre que verán los usuarios en la ficha.">ⓘ</span></label>
          <div class="cd-row">
            <input class="cd-input" id="cd-name" type="text" value="${esc(cd.title)}" maxlength="40" />
            <div class="menu"><button class="icon-btn icon-btn--round" type="button" aria-haspopup="true" aria-label="Más opciones">⋯</button>
              <div class="menu__panel menu__panel--right"><button class="menu__item" type="button" data-cd="reset">Restablecer valores predeterminados</button><button class="menu__item menu__item--danger" type="button" data-cd="remove">Eliminar tarjeta</button></div></div>
          </div>
          <p class="muted cd-internal">Nombre int… <span class="info">ⓘ</span>: ${esc(meta.p)} Tarjeta de asociación (${esc(cfg.label)}) <button class="pencil" type="button" data-cd="rename-internal" aria-label="Editar nombre interno">✎</button></p>
          <hr class="cd-sep" />
          <h3 class="cd-h">Propiedades</h3>
          <p>Decide sobre las propiedades que aparecerán en esta tarjeta.</p>
          <p class="cd-type">Tipo de objeto: <span class="muted">${esc(meta.p)} ▾</span></p>
          <div class="menu cd-addmenu">
            <button class="cd-addbtn" type="button" aria-haspopup="true">Agregar propiedades (${cd.props.length}/${ACARD_MAX}) <span class="caret"></span></button>
            <div class="menu__panel cd-addpanel">
              <div class="picker__search search search--sm"><span class="ico ico--search" aria-hidden="true"></span><input type="search" id="cd-addsearch" placeholder="Buscar propiedades" aria-label="Buscar propiedades" /></div>
              <div id="cd-addlist">${allKeys.map(([k, l]) => `<label class="colopt cd-addopt" data-name="${esc(l.toLowerCase())}"><input type="checkbox" data-cdadd="${k}" ${cd.props.includes(k) ? 'checked' : ''} ${!cd.props.includes(k) && cd.props.length >= ACARD_MAX ? 'disabled' : ''} /><span>${l}</span></label>`).join('')}</div>
            </div>
          </div>
          <ul class="cd-props">${cd.props
            .map((k, i) => `<li class="cd-prop" data-key="${k}" draggable="true">
              <span class="colsel__grip" aria-hidden="true">⋮⋮</span>
              ${i === 0 ? `<span class="cd-prop__fixed">${esc(kindLabel(cd.kind, k))}</span>` : `<select class="cd-prop__select" data-cdswap="${i}" aria-label="Propiedad">${allKeys.filter(([kk]) => kk === k || !cd.props.includes(kk)).map(([kk, l]) => `<option value="${kk}" ${kk === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}
              ${k === 'stage' || k === 'status' ? '<span class="cd-warn" title="Esta propiedad puede cambiar según el pipeline del registro.">⚠</span>' : ''}
              <button class="icon-btn" type="button" data-cdremove="${i}" aria-label="Quitar" ${i === 0 ? 'disabled' : ''}>×</button>
            </li>`)
            .join('')}</ul>
          <hr class="cd-sep" />
          <h3 class="cd-h">Filtrar y ordenar</h3>
          <div class="cd-line"><span>Filtro <span class="info">ⓘ</span></span><button class="link-btn link-btn--dark" type="button" data-cd="filters">⚟ Gestionar filtros</button></div>
          <hr class="cd-sep cd-sep--light" />
          <div class="cd-line"><span>Filtros rápidos <span class="info">ⓘ</span></span>
            <div class="menu"><button class="link-btn link-btn--dark" type="button" aria-haspopup="true">${cd.quick ? '1 filtro rápido' : '0 filtros rápidos'} <span class="caret"></span></button>
              <div class="menu__panel menu__panel--right"><label class="menu__item compose__assoc"><input type="checkbox" data-cd="quick" ${cd.quick ? 'checked' : ''} /> Etiqueta de asociación</label></div></div>
          </div>
          ${cd.quick ? '<div class="cd-chips"><span class="tag tag--none">Etiqueta de asociación</span></div>' : ''}
          <hr class="cd-sep cd-sep--light" />
          <div class="cd-line"><span>Ordenar por <span class="info">ⓘ</span></span>
            <span class="cd-sort">
              <div class="menu"><button class="link-btn link-btn--dark" type="button" aria-haspopup="true">${esc((sortOptions.find((o) => o[0] === cd.sortKey) || sortOptions[0])[1])} <span class="caret"></span></button>
                <div class="menu__panel menu__panel--right menu__panel--up">${sortOptions.map(([k, l]) => `<button class="menu__item${cd.sortKey === k ? ' is-current' : ''}" type="button" data-cdsort="${k}">${esc(l)}</button>`).join('')}</div></div>
              <button class="cd-dir${cd.sortDir < 0 ? ' is-active' : ''}" type="button" data-cddir="-1" aria-label="Descendente">↓</button>
              <button class="cd-dir${cd.sortDir > 0 ? ' is-active' : ''}" type="button" data-cddir="1" aria-label="Ascendente">↑</button>
            </span>
          </div>
        </div>
        <aside class="cdrawer__preview">
          <h4>Vista previa</h4>
          <select class="cd-input" id="cd-sample" aria-label="Registro de ejemplo">${[rec, ...ALL[type]().filter((r) => Number(r.id) !== Number(rec.id)).slice(0, 8)].map((r) => `<option value="${r.id}" ${Number(r.id) === Number(cd.previewId) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
          <div class="cd-previewcard">${previewCard(previewSettings, previewRows, cd.kind)}</div>
        </aside>
      </div>
      <footer class="cdrawer__foot">
        <span class="cd-usage">Se usa en ${ALL[type]().length} fichas</span>
        <span class="ad-foot__btns"><button class="pill" type="button" data-cd="close">Cancelar</button><button class="pill pill--primary" type="button" data-cd="save">Guardar</button></span>
      </footer>
    </div>`;
  wireMenus($('card-drawer'));
}
function previewCard(s, rows, kind) {
  const lines = s.props.filter((k) => k !== 'name');
  const sorted = rows.slice().sort((a, b) => {
    const av = kindSortValue(kind, s.sortKey, a);
    const bv = kindSortValue(kind, s.sortKey, b);
    return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'es')) * s.sortDir;
  });
  return `
    <div class="card card--assoc">
      <div class="card__head"><span class="card__toggle">${esc(s.title)} (${rows.length})</span><span class="link-btn">+ Agregar</span></div>
      ${sorted.length
        ? sorted.slice(0, 2).map((r, i) => `<div class="assoc-card"><div class="assoc-card__head">${kind === 'companies' ? companyAvatarHtml(r) : `<span class="assoc__logo">${esc(initials(r.name))}</span>`}<strong>${esc(r.name)}</strong></div>${lines.map((k) => `<div class="assoc-card__row"><span class="muted">${esc(kindLabel(kind, k))}:</span> ${esc(kindValue(kind, k, r))}</div>`).join('')}${s.quick ? `<span class="tag ${i === 0 ? 'tag--done' : 'tag--none'} assoc-card__label">${i === 0 ? `${KIND_META[kind].s} con ${cfg.singular} principal` : 'Sin etiqueta'}</span>` : ''}</div>`).join('')
        : `<div class="assoc-empty"><span class="assoc-empty__art" aria-hidden="true"></span><p class="muted">${esc(emptyText(kind))}</p></div>`}
    </div>`;
}
// Associations = the ones implied by the data + the ones added by hand (stored on the record as assoc_<kind>).
function assocRows() {
  return cfg.assoc(rec).map(([t, rows, kind]) => {
    const extra = (rec[`assoc_${kind}`] || []).map((id2) => byId(ALL[kind](), id2)).filter(Boolean);
    const seen = new Set(rows.map((r) => Number(r.id)));
    const merged = [...rows, ...extra.filter((r) => !seen.has(Number(r.id)))];
    const labels = rec[`assoc_labels_${kind}`] || {};
    return [t, merged.map((r) => ({ ...r, assocLabel: labels[r.id] })), kind];
  });
}
// ---------- page layout (columns, sections, tabs) from the layout editor ----------
const layoutOf = () => loadLayout(type);
const CATALOG = cardCatalog(type);
let activeTabId = 'overview';
function renderTabs() {
  const L = layoutOf();
  $('rec-tabs').innerHTML =
    L.tabs.map((t) => `<button class="rtabs__tab${t.id === activeTabId ? ' is-active' : ''}" role="tab" type="button" data-tab="${t.id}">${esc(t.label)}</button>`).join('') +
    `<button class="rtabs__custom" type="button" data-act="customize">⚙ Personalizar</button>`;
}
function sectionsHtml(sections, tabId = 'overview') {
  return sections
    .map((s, si) => `<h2 class="rsection">${esc(s.title)}</h2>${s.cards.map((cid) => middleCardHtml(cid).replace('<div class="card', `<div data-lcard="${esc(cid)}" data-ltab="${esc(tabId)}" data-sect="${si}" class="card`)).join('')}`)
    .join('') || '<p class="muted">Esta pestaña no tiene tarjetas. Añádelas desde "Personalizar".</p>';
}
function renderMiddle() {
  const L = layoutOf();
  const overview = L.tabs.find((t) => t.id === 'overview');
  $('overview-body').innerHTML = overview ? sectionsHtml(overview.sections || [], 'overview') : '';
  $('custom-panes').innerHTML = L.tabs
    .filter((t) => !t.fixed && t.id !== 'overview')
    .map((t) => `<div class="tabpane" id="pane-${t.id}" hidden>${sectionsHtml(t.sections || [], t.id)}</div>`)
    .join('');
  addGrips($('record-root').querySelector('.record__middle'));
  const aboutCard = $('rec-props').closest('.card');
  aboutCard.hidden = !L.left.includes('about');
}
function middleCardHtml(id) {
  const label = (CATALOG[id] || { label: id }).label;
  switch (id) {
    case 'insights':
      return `<div class="card"><div class="card__head"><h3 class="card__title">Resumen de ${esc(cfg.label.toLowerCase())}</h3><span class="card__tools"><span class="ai-badge">✦ AI</span><button class="icon-btn" type="button" data-act="customize" aria-label="Configurar">⚙</button></span></div><div class="ai-box" id="ai-summary"></div></div>`;
    case 'recent':
      return `<div class="card"><div class="card__head"><h3 class="card__title">Actividades recientes</h3><span class="card__tools"><span class="ai-badge">✦ AI</span></span></div>
        <div class="recent" id="recent-box"></div>
        <div class="recent__split"><div class="recent__col recent__col--empty"><div class="recent__art" aria-hidden="true"></div><p>No hay actividad entrante en este registro.</p></div><div class="recent__col"><h4>Salientes</h4><ul class="timeline timeline--compact" id="rec-timeline-short"></ul></div></div>
        <div class="ai-feedback"><button type="button" data-act="fb-up" aria-label="Útil">${ACT_ICONS.thumbsUp}</button><button type="button" data-act="fb-down" aria-label="No útil">${ACT_ICONS.thumbsDown}</button></div></div>`;
    case 'highlights':
      return `<div class="card"><h3 class="card__title">${esc(label)}</h3><div class="highlights" id="rec-highlights"></div></div>`;
    case 'sentiment': {
      const n = Number(rec.id) % 3;
      const mood = ['Positivo', 'Neutral', 'Atento'][n];
      const pct = [82, 55, 34][n];
      return `<div class="card"><div class="card__head"><h3 class="card__title">${esc(label)}</h3><span class="ai-badge">✦ AI</span></div>
        <div class="gauge"><div class="gauge__bar"><span style="width:${pct}%" class="gauge__fill gauge__fill--${n}"></span></div><div class="gauge__meta"><strong>${mood}</strong><span class="muted">${pct} % de interacciones con tono positivo</span></div></div>
        <p class="muted">Basado en las últimas ${3 + n} conversaciones registradas.</p></div>`;
    }
    case 'challenges':
      return `<div class="card"><div class="card__head"><h3 class="card__title">${esc(label)}</h3><span class="ai-badge">✦ AI</span></div><ul class="bullets">
        <li>Plazos de entrega ajustados en ${esc(rec.company || 'sus proyectos')}.</li><li>Comparación de precios con otros proveedores.</li><li>Necesita confirmar medidas antes de aprobar la cotización.</li></ul></div>`;
    case 'positive':
      return `<div class="card"><div class="card__head"><h3 class="card__title">${esc(label)}</h3><span class="ai-badge">✦ AI</span></div><ul class="bullets bullets--ok">
        <li>Valora la calidad del vidrio templado y la garantía.</li><li>Buena experiencia con la última instalación.</li><li>Responde rápido a los correos del equipo.</li></ul></div>`;
    case 'missing': {
      const empty = currentFields().filter((f) => f[2] !== 'ro' && f[2] !== 'date-ro' && f[2] !== 'calc' && (rec[f[0]] === undefined || rec[f[0]] === null || rec[f[0]] === ''));
      return `<div class="card"><h3 class="card__title">${esc(label)}</h3>${empty.length
        ? `<p>Faltan <strong>${empty.length}</strong> datos en este registro:</p><ul class="chips-list">${empty.map((f) => `<li><button class="chip" type="button" data-fill="${f[0]}">${esc(f[1])} +</button></li>`).join('')}</ul>`
        : '<p class="muted">Todos los datos de la tarjeta están completos. ✓</p>'}</div>`;
    }
    case 'duplicates': {
      const all = ALL[type]().filter((r) => Number(r.id) !== Number(rec.id));
      // companies: any shared domain, main or additional («Dominios adicionales»)
      const mine = type === 'companies' ? companyDomains(rec) : [];
      const dups = all.filter((r) => (rec.email && r.email && r.email.toLowerCase() === rec.email.toLowerCase()) || (mine.length && companyDomains(r).some((d) => mine.includes(d))) || (r.name && rec.name && r.name.toLowerCase() === rec.name.toLowerCase())).slice(0, 5);
      return `<div class="card"><h3 class="card__title">${esc(label)}</h3>${dups.length
        ? `<p>Se han encontrado <strong>${dups.length}</strong> posibles duplicados:</p><ul class="dup-list">${dups.map((r) => `<li><a href="./?id=${r.id}">${esc(r.name)}</a> <span class="muted">${esc(r.email || r.domain || '')}</span><button class="link-btn" type="button" data-act="merge" data-merge-with="${r.id}">Fusionar</button></li>`).join('')}</ul>`
        : '<p class="muted">No se han detectado registros duplicados. ✓</p>'}</div>`;
    }
    default:
      return `<div class="card"><h3 class="card__title">${esc(label)}</h3><p class="muted">Tarjeta sin contenido.</p></div>`;
  }
}
const FILES_KEY = `crm:${type}:files:${id}`;
const loadFiles = () => loadJson(FILES_KEY, []);
// ---------- company hierarchy cards ----------
const companyItem = (c) => `<div class="hier__item">${companyAvatarHtml(c)}<a href="./record/?id=${c.id}">${esc(c.name)}</a>${c.domain ? `<small>${esc(c.domain)}</small>` : ''}</div>`;
let parentQuery = '';
// "Empresa matriz": the parent company with a search box to assign or change it (never itself or a subsidiary).
function parentCompanyCard(label) {
  const parent = parentCompanyOf(rec);
  const q = parentQuery.trim().toLowerCase();
  const hits = q ? allCompanies().filter((c) => Number(c.id) !== Number(rec.id) && (c.name.toLowerCase().includes(q) || String(c.domain || '').toLowerCase().includes(q))).slice(0, 6) : [];
  return `<div class="card" data-card="parent"><div class="card__head"><button class="card__toggle" type="button" data-toggle="parent"><span class="chev">⌄</span> ${esc(label)}</button>${parent ? `<button class="link-btn" type="button" data-parent-clear aria-label="Quitar la empresa matriz">Quitar</button>` : ''}</div>
    <div data-pane="parent">
      ${parent ? companyItem(parent) : '<p class="muted">Esta empresa no cuelga de ninguna otra.</p>'}
      <div class="hier__search"><input type="search" id="parent-q" value="${esc(parentQuery)}" placeholder="${parent ? 'Cambiar la empresa matriz' : 'Buscar la empresa matriz'}" aria-label="Buscar la empresa matriz" autocomplete="off" />
        ${q ? `<ul class="hier__results" id="parent-results">${hits.length ? hits.map((c) => { const blocked = isCompanyDescendant(rec.id, c.id); return `<li><button type="button" data-parent-pick="${c.id}" ${blocked ? 'disabled title="Es una empresa secundaria de esta"' : ''}><strong>${esc(c.name)}</strong>${c.domain ? `<span class="muted">${esc(c.domain)}</span>` : ''}${blocked ? '<span class="muted">(secundaria)</span>' : ''}</button></li>`; }).join('') : '<li><span class="muted" style="padding:0 10px">Ninguna empresa coincide.</span></li>'}</ul>` : ''}
      </div>
    </div></div>`;
}
// "Empresas secundarias": the companies that hang from this one.
function subsidiariesCard(label) {
  const kids = childCompaniesOf(rec.id);
  return `<div class="card" data-card="subsidiaries"><div class="card__head"><button class="card__toggle" type="button" data-toggle="subsidiaries"><span class="chev">⌄</span> ${esc(label)} (${kids.length})</button></div>
    <div data-pane="subsidiaries">${kids.length ? kids.map(companyItem).join('') : '<p class="muted">Ninguna empresa cuelga de esta. Asigna esta empresa como matriz desde la ficha de la secundaria.</p>'}</div></div>`;
}
function setParentCompany(parentId) {
  const parent = parentId ? allCompanies().find((c) => Number(c.id) === Number(parentId)) : null;
  if (parentId && (!parent || Number(parent.id) === Number(rec.id) || isCompanyDescendant(rec.id, parent.id))) { toast('Una empresa no puede colgar de sí misma ni de una de sus secundarias'); return; }
  parentQuery = '';
  const from = parentCompanyOf(rec);
  setField(type, rec.id, 'parentCompanyId', parent ? Number(parent.id) : '');
  rec = findRecord(type, id);
  addEvent({ type: 'stage', when: Date.now(), who: 'Tú', text: parent ? `Empresa matriz: ${parent.name}${from ? ` (antes ${from.name})` : ''}.` : `Empresa matriz quitada${from ? ` (${from.name})` : ''}.` });
  renderRight();
  toast(parent ? `Empresa matriz: ${parent.name}` : 'Empresa matriz quitada');
}
function rightCardHtml(cardId) {
  const label = (CATALOG[cardId] || { label: cardId }).label;
  if (cardId === 'summary') {
    return `<div class="card"><button class="card__toggle" type="button" data-toggle="aisum"><span class="chev">⌄</span> ${esc(label)}</button><span class="ai-badge ai-badge--corner">✦ AI</span><div class="ai-box" id="ai-right"></div></div>`;
  }
  if (cardId === 'lead') {
    return `<div class="card" id="lead-card"><div class="card__head"><button class="card__toggle" type="button" data-toggle="lead"><span class="chev">⌄</span> ${esc(label)}</button><button class="link-btn" type="button" data-act="add-lead">+Agregar</button></div><div id="lead-box"></div></div>`;
  }
  if (cardId.startsWith('assoc-')) {
    const kind = cardId.slice(6);
    const found = assocRows().find((x) => x[2] === kind);
    return found ? assocCard(found[0], found[1], kind) : '';
  }
  if (cardId === 'lineitems' && type === 'deals') return lineItemsCard(label);
  if (cardId === 'parent' && type === 'companies') return parentCompanyCard(label);
  if (cardId === 'subsidiaries' && type === 'companies') return subsidiariesCard(label);
  if (cardId === 'attachments') {
    const files = loadFiles();
    return `<div class="card"><div class="card__head"><button class="card__toggle" type="button" data-toggle="files"><span class="chev">⌄</span> ${esc(label)} (${files.length})</button><label class="link-btn files__add">+ Subir<input type="file" id="file-add" multiple hidden /></label></div>
      ${files.length ? `<ul class="files">${files.map((f, i) => `<li><span class="files__ico">📎</span><span class="files__name">${esc(f.name)}</span><span class="muted">${esc(f.when)}</span><button class="icon-btn" type="button" data-file-rm="${i}" aria-label="Quitar">×</button></li>`).join('')}</ul>` : `<p class="muted">Ve los archivos adjuntos a este registro. Sube uno con “+ Subir”.</p>`}</div>`;
  }
  if (cardId === 'playbooks') {
    const guides = ['Llamada de descubrimiento', 'Presentación de cotización', 'Gestión de objeciones de precio'];
    return `<div class="card"><button class="card__toggle" type="button" data-toggle="guides"><span class="chev">⌄</span> ${esc(label)}</button><ul class="guides">${guides.map((g) => `<li><span class="guides__ico">📘</span><span>${esc(g)}</span><button class="link-btn" type="button" data-guide="${esc(g)}">Abrir</button></li>`).join('')}</ul></div>`;
  }
  return `<div class="card"><h3 class="card__title">${esc(label)}</h3><p class="muted">Tarjeta sin contenido.</p></div>`;
}
function renderRight() {
  const L = layoutOf();
  $('rec-right').innerHTML = L.right
    .map((cid) => {
      const html = rightCardHtml(cid);
      return html ? html.replace('<div class="card', `<div data-lcard="${esc(cid)}" class="card`) : '';
    })
    .join('');
  if (type === 'contacts') {
    const card = document.createElement('section');
    card.className = 'card';
    // Enrolments ended by an exclusion criterion (reply, meeting, new deal, unsubscribe) stay visible with their
    // reason, newest first, under the running ones.
    const ended = enrollmentsOfContact(id).filter((e) => unenrollReasonOf(e)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);
    card.innerHTML = '<h3>Secuencias</h3>' + scheduled().filter(e => String(e.contactId) === String(id)).map(e => `<div><strong>${esc(e.sequenceName)}</strong><p>Paso ${e.currentStep} de ${sequenceById(e.sequenceId)?.steps.length || 0} · ${esc(e.stepLabel)}</p><p>${e.status === 'paused' ? 'En pausa' : e.nextStepAt ? esc(new Date(e.nextStepAt).toLocaleString()) : 'Esperando la tarea'}</p><button data-seq-action="${e.status === 'paused' ? 'resume' : 'pause'}" data-id="${esc(e.id)}">${e.status === 'paused' ? 'Reanudar' : 'Pausar'}</button><button data-seq-action="cancel" data-id="${esc(e.id)}">Cancelar inscripción</button></div>`).join('')
      + ended.map((e) => `<p class="muted" data-seq-ended="${esc(e.id)}"><strong>${esc(sequenceById(e.sequenceId)?.name || 'Secuencia')}</strong> · ${esc(SEQ_STATUS[e.status] || e.status)}${e.extra && e.extra.reason ? `: ${esc(e.extra.reason)}` : ''} · ${esc(formatDate(e.updatedAt))}</p>`).join('');
    card.addEventListener('click', event => {
      const b = event.target.closest('[data-seq-action]');
      if (!b) return;
      ({ pause: pauseEnrollment, resume: resumeEnrollment, cancel: unenroll })[b.dataset.seqAction](b.dataset.id);
      renderRight(); renderTimeline();
    });
    $('rec-right').appendChild(card);
  }
  addGrips($('rec-right'));
  renderLead();
}
// Grip de arrastre estilo HubSpot: aparece al pasar el cursor sobre la tarjeta y
// permite reordenarla dentro de su columna/sección; el orden se guarda en el layout.
const GRIP_HTML = '<span class="card__grip" draggable="true" title="Arrastrar para mover la tarjeta" aria-label="Arrastrar para mover la tarjeta">⋮⋮</span>';
function addGrips(container) {
  if (!container) return;
  container.querySelectorAll('.card[data-lcard]').forEach((el) => {
    if (!el.querySelector(':scope > .card__grip')) el.insertAdjacentHTML('afterbegin', GRIP_HTML);
  });
}
let dragCard = null; // { id, tab, sect, zone }
function dropZoneOf(el) {
  return el.closest('#rec-right') ? 'right' : 'middle';
}
function cardListOf(zone, tabId) {
  const L = layoutOf();
  if (zone === 'right') return L.right;
  const tab = L.tabs.find((t) => t.id === tabId) || { sections: [] };
  return (tab.sections || []).flatMap((s) => s.cards);
}
mount.addEventListener('dragstart', (e) => {
  const grip = e.target.closest('.card__grip');
  if (!grip) return;
  const card = grip.closest('.card[data-lcard]');
  if (!card) return;
  dragCard = { id: card.dataset.lcard, tab: card.dataset.ltab || '', sect: card.dataset.sect || '', zone: dropZoneOf(card) };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragCard.id);
  requestAnimationFrame(() => card.classList.add('is-dragging'));
});
mount.addEventListener('dragover', (e) => {
  if (!dragCard) return;
  const over = e.target.closest('.card[data-lcard]');
  mount.querySelectorAll('.card.drop-before, .card.drop-after').forEach((c) => c.classList.remove('drop-before', 'drop-after'));
  if (!over || over.dataset.lcard === dragCard.id || dropZoneOf(over) !== dragCard.zone) return;
  if (dragCard.zone === 'middle' && (over.dataset.ltab || '') !== dragCard.tab) return; // solo dentro de la misma pestaña
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const r = over.getBoundingClientRect();
  over.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
});
mount.addEventListener('drop', (e) => {
  if (!dragCard) return;
  const over = e.target.closest('.card[data-lcard]');
  if (!over || over.dataset.lcard === dragCard.id || dropZoneOf(over) !== dragCard.zone) return;
  e.preventDefault();
  const before = over.classList.contains('drop-before');
  const L = layoutOf();
  if (dragCard.zone === 'right') {
    const i = L.right.indexOf(dragCard.id);
    if (i >= 0) L.right.splice(i, 1);
    const j = L.right.indexOf(over.dataset.lcard);
    L.right.splice(j < 0 ? L.right.length : before ? j : j + 1, 0, dragCard.id);
  } else {
    const tab = L.tabs.find((t) => t.id === dragCard.tab);
    if (!tab) return;
    const from = tab.sections[Number(dragCard.sect)];
    if (from) {
      const i = from.cards.indexOf(dragCard.id);
      if (i >= 0) from.cards.splice(i, 1);
    }
    const to = tab.sections[Number(over.dataset.sect)];
    if (!to) return;
    const j = to.cards.indexOf(over.dataset.lcard);
    to.cards.splice(j < 0 ? to.cards.length : before ? j : j + 1, 0, dragCard.id);
  }
  dragCard = null;
  saveLayout(type, L);
  renderMiddle();
  renderRight();
  toast('Tarjeta movida · diseño guardado');
});
mount.addEventListener('dragend', () => {
  dragCard = null;
  mount.querySelectorAll('.card.is-dragging, .card.drop-before, .card.drop-after').forEach((c) => c.classList.remove('is-dragging', 'drop-before', 'drop-after'));
});
// "Elementos de pedido" of a deal: the lines saved in deal_line_items (fetched once from Supabase).
let lineItemsFetched = false;
function lineItemsCard(label) {
  if (!lineItemsFetched) {
    lineItemsFetched = true;
    Promise.resolve(fetchLineItems(rec.id)).then(() => renderRight()).catch((e) => console.error('[elementos de pedido]', e));
  }
  const rows = lineItemsFor(rec.id);
  const code = rec.deal_currency_code;
  const money = (n) => formatMoney(n, code);
  const st = liState;
  const amountOf = (x) => (Number(x.quantity) || 0) * (Number(x.price) || 0);
  // the editable row (a new line, or an existing one being edited)
  const inputRow = (x, id) => `<tr class="lineitems__editrow" data-li-row="${esc(id)}">
      <td><input type="text" data-li-field="name" value="${esc(x.name)}" placeholder="Nombre del producto" aria-label="Producto" /></td>
      <td><input type="number" min="0" step="1" data-li-field="quantity" value="${esc(x.quantity)}" aria-label="Cantidad" /></td>
      <td><input type="number" min="0" step="0.01" data-li-field="price" value="${esc(x.price)}" aria-label="Precio" /></td>
      <td data-li-amount>${esc(money(amountOf(x)))}</td>
      <td class="lineitems__actions"><button class="btn btn--primary btn--sm" type="button" data-li="save" data-id="${esc(id)}">Guardar</button><button class="btn btn--ghost btn--sm" type="button" data-li="cancel">Cancelar</button></td></tr>`;
  const body = rows.map((r) => (st.editing === r.id ? inputRow(st.draft, r.id) : `<tr data-li-row="${esc(r.id)}"><td>${esc(r.name)}</td><td>${esc(r.quantity)}</td><td>${esc(money(r.price))}</td><td>${esc(money(r.quantity * r.price))}</td><td class="lineitems__actions"><button class="link-btn" type="button" data-li="edit" data-id="${esc(r.id)}">Editar</button><button class="link-btn" type="button" data-li="remove" data-id="${esc(r.id)}">Quitar</button></td></tr>`)).join('') + (st.adding ? inputRow(st.draft, 'new') : '');
  return `<div class="card" data-card="lineitems"><div class="card__head"><button class="card__toggle" type="button" data-toggle="lineitems"><span class="chev">⌄</span> ${esc(label)} (${rows.length})</button>${st.adding || st.editing ? '' : '<button class="link-btn" type="button" data-li="add">+ Agregar elemento de pedido</button>'}</div>
    <div data-pane="lineitems">${rows.length || st.adding
      ? `<table class="lineitems lineitems--editable"><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Importe</th><th></th></tr></thead><tbody>${body}</tbody>${rows.length ? `<tfoot><tr><td colspan="3">Total</td><td data-li-total>${esc(money(lineItemsTotal(rows)))}</td><td></td></tr></tfoot>` : ''}</table>`
      : '<p class="muted">Este negocio no tiene elementos de pedido. Agrega el primero con «+ Agregar elemento de pedido».</p>'}</div></div>`;
}
// Editing state of the line items card: a new line being typed, or an existing line being edited.
let liState = { adding: false, editing: null, draft: {} };
function lineItemDraftFrom(row) {
  const get = (k) => { const i = row.querySelector(`[data-li-field="${k}"]`); return i ? i.value : ''; };
  return { name: String(get('name') || '').trim(), quantity: Number(get('quantity')), price: Number(get('price')) };
}
// After any change of the lines: the deal's amount follows the total, the header and the timeline refresh.
function lineItemsChanged(message) {
  const res = applyLineItemsToDeal(rec.id);
  const fresh = findRecord(type, rec.id);
  if (fresh) { rec.amount = fresh.amount; rec.amountBeforeLines = fresh.amountBeforeLines; }
  liState = { adding: false, editing: null, draft: {} };
  renderAll();
  toast(res ? `${message} · importe del negocio ${formatMoney(res.amount, rec.deal_currency_code)}` : message);
}
mount.addEventListener('click', (e) => {
  const b = e.target.closest('[data-li]');
  if (!b || type !== 'deals') return;
  e.preventDefault();
  const a = b.dataset.li;
  if (a === 'add') { liState = { adding: true, editing: null, draft: { name: '', quantity: 1, price: '' } }; renderRight(); const i = mount.querySelector('[data-li-row="new"] [data-li-field="name"]'); if (i) i.focus(); return; }
  if (a === 'edit') { const r = lineItemsFor(rec.id).find((x) => String(x.id) === String(b.dataset.id)); if (!r) return; liState = { adding: false, editing: r.id, draft: { ...r } }; renderRight(); return; }
  if (a === 'cancel') { liState = { adding: false, editing: null, draft: {} }; renderRight(); return; }
  if (a === 'save') {
    const row = b.closest('[data-li-row]');
    const d = lineItemDraftFrom(row);
    if (!d.name) { toast('Escribe el nombre del producto'); return; }
    if (!(d.quantity > 0)) { toast('La cantidad debe ser mayor que cero'); return; }
    if (!(d.price >= 0)) { toast('Escribe un precio válido'); return; }
    if (b.dataset.id === 'new') { addLineItems(rec.id, [{ ...d, currency: rec.deal_currency_code }]); lineItemsChanged('Elemento de pedido agregado'); }
    else { if (!updateLineItem(b.dataset.id, d)) { toast('No se pudo guardar el elemento'); return; } lineItemsChanged('Elemento de pedido actualizado'); }
    return;
  }
  if (a === 'remove') {
    const r = lineItemsFor(rec.id).find((x) => String(x.id) === String(b.dataset.id));
    if (!r || !window.confirm(`¿Quitar «${r.name}» de los elementos de pedido?`)) return;
    removeLineItem(r.id);
    lineItemsChanged('Elemento de pedido quitado');
  }
});
// the amount of the row being typed follows quantity × price
mount.addEventListener('input', (e) => {
  const f = e.target.closest && e.target.closest('[data-li-field]');
  if (!f) return;
  const row = f.closest('[data-li-row]');
  const d = lineItemDraftFrom(row);
  liState.draft = { ...liState.draft, ...d };
  const cell = row.querySelector('[data-li-amount]');
  if (cell) cell.textContent = formatMoney((Number(d.quantity) || 0) * (Number(d.price) || 0), rec.deal_currency_code);
});
function renderAssoc() {
  renderRight();
}

// ---------- "+ Agregar" association drawer ----------
const KIND_META = {
  companies: { s: 'Empresa', p: 'Empresas', sub: (r) => r.domain || '', fields: [['name', 'Nombre de la empresa'], ['domain', 'Dominio'], ['phone', 'Número de teléfono']] },
  contacts: { s: 'Contacto', p: 'Contactos', sub: (r) => r.email || '', fields: [['first', 'Nombre'], ['last', 'Apellidos'], ['email', 'Correo']] },
  deals: { s: 'Negocio', p: 'Negocios', sub: (r) => formatMoney(r.amount, r.deal_currency_code), fields: [['name', 'Nombre del negocio'], ['amount', 'Importe'], ['closeDate', 'Fecha de cierre']] },
  tickets: { s: 'Ticket', p: 'Tickets', sub: (r) => ticketStatusLabel(r.pipeline, r.status), fields: [['name', 'Nombre del ticket'], ['description', 'Descripción']] },
  tasks: { s: 'Tarea', p: 'Tareas', sub: (r) => `vence ${formatDate(r.due)}`, fields: [['name', 'Título'], ['due', 'Fecha de vencimiento']] },
};
const ASSOC_LABELS = assocLabels();
let ad = null; // drawer state
let lastAssocKind = 'companies';
function alreadyAssociated(kind) {
  const found = assocRows().find((x) => x[2] === kind);
  return new Set(found ? found[1].map((r) => Number(r.id)) : []);
}
function openAssocDrawer(kind) {
  ad = { kind, tab: 'existing', q: '', sort: 'recent', page: 1, size: 10, selected: new Set(), step: 1, labels: {} };
  renderAssocDrawer();
  $('assoc-drawer').hidden = false;
  setTimeout(() => $('ad-search')?.focus(), 0);
}
function closeAssocDrawer() {
  $('assoc-drawer').hidden = true;
  ad = null;
}
function adCandidates() {
  const meta = KIND_META[ad.kind];
  const have = alreadyAssociated(ad.kind);
  let list = ALL[ad.kind]().filter((r) => !have.has(Number(r.id)) && !(ad.kind === type && Number(r.id) === Number(rec.id)));
  const q = ad.q.toLowerCase();
  if (q) list = list.filter((r) => `${r.name} ${meta.sub(r)}`.toLowerCase().includes(q));
  if (ad.sort === 'az') list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
  else if (ad.sort === 'za') list.sort((a, b) => String(b.name).localeCompare(String(a.name), 'es'));
  else list.sort((a, b) => new Date(b.created) - new Date(a.created));
  return list;
}
function renderAssocDrawer() {
  if (!ad) return;
  const meta = KIND_META[ad.kind];
  const el = $('assoc-drawer');
  const SORTS = [['recent', 'Predeterminado (Agregado recientemente)'], ['az', 'Nombre (A–Z)'], ['za', 'Nombre (Z–A)']];
  let body = '';
  let foot = '';
  if (ad.step === 2) {
    const chosen = [...ad.selected].map((id2) => byId(ALL[ad.kind](), id2)).filter(Boolean);
    body = `
      <p class="muted">Elige la etiqueta de asociación de cada ${meta.s.toLowerCase()}. La etiqueta "Principal" solo puede tenerla un registro.</p>
      <ul class="ad-labels">${chosen
        .map((r) => `<li><span class="ad-labels__name">${ad.kind === 'companies' ? companyAvatarHtml(r) : `<span class="avatar avatar--sm avatar--soft">${esc(initials(r.name))}</span>`}${esc(r.name)}</span>
          <select data-adlabel="${r.id}">${ASSOC_LABELS.map((l) => `<option ${(ad.labels[r.id] || 'Sin etiqueta') === l ? 'selected' : ''}>${l}</option>`).join('')}</select></li>`)
        .join('')}</ul>`;
    foot = `<span class="muted">Paso 2 de 2</span><span class="ad-foot__btns"><button class="pill" type="button" data-ad="back">‹ Volver</button><button class="pill pill--primary" type="button" data-ad="save">Guardar</button></span>`;
  } else if (ad.tab === 'new') {
    body = `
      <form id="ad-new-form" class="ad-form">
        ${meta.fields.map(([k, l]) => `<label class="field"><span>${l}</span><input name="${k}" value="${esc(ad.kind === 'companies' && type === 'contacts' && k === 'domain' ? companyDomainPrefill(rec) : '')}" type="${k === 'amount' ? 'number' : /Date|due/.test(k) ? 'date' : k === 'email' ? 'email' : 'text'}" ${k === 'name' || k === 'first' ? 'required' : ''} /></label>`).join('')}
        <label class="field"><span>Etiqueta de asociación</span><select name="label">${ASSOC_LABELS.map((l) => `<option>${l}</option>`).join('')}</select></label>
      </form>`;
    foot = `<span></span><span class="ad-foot__btns"><button class="pill" type="button" data-ad="close">Cancelar</button><button class="pill pill--primary" type="submit" form="ad-new-form">Crear y asociar</button></span>`;
  } else {
    const list = adCandidates();
    const pages = Math.max(1, Math.ceil(list.length / ad.size));
    if (ad.page > pages) ad.page = pages;
    const slice = list.slice((ad.page - 1) * ad.size, ad.page * ad.size);
    body = `
      <div class="search ad-search"><input id="ad-search" type="search" value="${esc(ad.q)}" placeholder="Buscar ${meta.p}" aria-label="Buscar ${meta.p}" /><span class="ico ico--search" aria-hidden="true"></span></div>
      <div class="ad-bar">
        <strong>${list.length.toLocaleString('es-ES')} ${meta.p}</strong>
        <div class="menu"><button class="link-btn link-btn--dark" type="button" aria-haspopup="true">${SORTS.find((s) => s[0] === ad.sort)[1]} <span class="caret caret--lg"></span></button>
          <div class="menu__panel menu__panel--right">${SORTS.map(([v, l]) => `<button class="menu__item${v === ad.sort ? ' is-current' : ''}" type="button" data-adsort="${v}">${l}</button>`).join('')}</div></div>
      </div>
      <ul class="ad-list">${slice.length
        ? slice.map((r) => `<li><label class="ad-row"><input type="checkbox" data-adpick="${r.id}" ${ad.selected.has(Number(r.id)) ? 'checked' : ''} /><span>${esc(r.name)}${meta.sub(r) ? ` <span class="muted">(${esc(meta.sub(r))})</span>` : ''}</span></label></li>`).join('')
        : '<li class="muted">No hay resultados.</li>'}</ul>
      <div class="ad-pager">
        <button class="pager__btn" type="button" data-adpage="${ad.page - 1}" ${ad.page <= 1 ? 'disabled' : ''}>‹</button>
        ${Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((n) => `<button class="pager__num${n === ad.page ? ' is-active' : ''}" type="button" data-adpage="${n}">${n}</button>`).join('')}
        <button class="pager__btn" type="button" data-adpage="${ad.page + 1}" ${ad.page >= pages ? 'disabled' : ''}>›</button>
        <div class="menu ad-size"><button class="link-btn link-btn--dark" type="button" aria-haspopup="true">${ad.size} elementos <span class="caret caret--lg"></span></button>
          <div class="menu__panel menu__panel--right menu__panel--up">${[10, 25, 50].map((n) => `<button class="menu__item" type="button" data-adsize="${n}">${n} elementos</button>`).join('')}</div></div>
      </div>`;
    foot = `<span class="muted">Paso 1 de 2</span><button class="pill pill--next" type="button" data-ad="next" ${ad.selected.size ? '' : 'disabled'}>Siguiente ›</button>`;
  }
  el.innerHTML = `
    <div class="adrawer__panel" role="dialog" aria-labelledby="ad-title">
      <header class="adrawer__head"><h2 id="ad-title">${ad.step === 2 ? 'Etiquetas de asociación' : ad.tab === 'new' ? `Crear ${meta.s}` : `Agregar ${meta.s} existente`}</h2><button class="icon-btn" type="button" data-ad="close" aria-label="Cerrar">×</button></header>
      ${ad.step === 1 ? `<nav class="adrawer__tabs"><button type="button" class="${ad.tab === 'new' ? 'is-active' : ''}" data-adtab="new">Crear nueva</button><button type="button" class="${ad.tab === 'existing' ? 'is-active' : ''}" data-adtab="existing">Agregar existente</button></nav>` : ''}
      <div class="adrawer__body">${body}</div>
      <footer class="adrawer__foot">${foot}</footer>
    </div>`;
  wireMenus(el);
}
function saveAssociations(ids, labels) {
  const kind = ad.kind;
  const existing = new Set((rec[`assoc_${kind}`] || []).map(Number));
  const lab = { ...(rec[`assoc_labels_${kind}`] || {}) };
  // Keep the records that were implied by the data (e.g. the current primary company) when a new primary takes over.
  const implied = (cfg.assoc(rec).find((x) => x[2] === kind) || [null, []])[1];
  implied.forEach((r) => {
    existing.add(Number(r.id));
    if (!lab[r.id]) lab[r.id] = r.assocLabel || (implied.indexOf(r) === 0 ? 'Principal' : 'Sin etiqueta');
  });
  const newPrimary = ids.find((id2) => labels[id2] === 'Principal');
  if (newPrimary) Object.keys(lab).forEach((k) => { if (lab[k] === 'Principal') lab[k] = 'Sin etiqueta'; });
  ids.forEach((id2) => existing.add(Number(id2)));
  setField(type, rec.id, `assoc_${kind}`, [...existing]);
  ids.forEach((id2) => { lab[id2] = labels[id2] || 'Sin etiqueta'; });
  setField(type, rec.id, `assoc_labels_${kind}`, lab);
  // Keep the simple foreign keys in sync where they exist, so lists and boards reflect it too.
  ids.forEach((id2) => {
    const other = byId(ALL[kind](), id2);
    if (!other) return;
    if (type === 'contacts' && kind === 'companies' && (labels[id2] === 'Principal' || !rec.companyId)) {
      setField('contacts', rec.id, 'companyId', other.id);
      setField('contacts', rec.id, 'company', other.name);
    }
    if (type === 'companies' && kind === 'contacts') {
      setField('contacts', other.id, 'companyId', rec.id);
      setField('contacts', other.id, 'company', rec.name);
    }
    if (type === 'contacts' && ['deals', 'tickets', 'tasks'].includes(kind)) {
      setField(kind, other.id, 'contactId', rec.id);
      if (kind === 'tasks') setField(kind, other.id, 'contact', rec.name);
    }
    if (type === 'companies' && kind === 'deals') {
      setField('deals', other.id, 'companyId', rec.id);
      setField('deals', other.id, 'company', rec.name);
    }
    if (['deals', 'tickets', 'tasks'].includes(type) && kind === 'contacts') setField(type, rec.id, 'contactId', other.id);
    if (type === 'deals' && kind === 'companies') {
      setField('deals', rec.id, 'companyId', other.id);
      setField('deals', rec.id, 'company', other.name);
    }
    if (type === 'tickets' && kind === 'companies') {
      setField('tickets', rec.id, 'companyId', other.id);
      setField('tickets', rec.id, 'company', other.name);
    }
    if (type === 'companies' && kind === 'tickets') {
      setField('tickets', other.id, 'companyId', rec.id);
      setField('tickets', other.id, 'company', rec.name);
    }
  });
  rec = findRecord(type, id);
  const names = ids.map((id2) => (byId(ALL[kind](), id2) || {}).name).filter(Boolean);
  addEvent({ type: 'stage', when: Date.now(), who: 'Tú', text: `${KIND_META[kind].p} asociados: ${names.join(', ')}.` });
  renderAll();
  toast(`${names.length} ${names.length === 1 ? KIND_META[kind].s.toLowerCase() : KIND_META[kind].p.toLowerCase()} asociad${names.length === 1 ? 'o' : 'os'}`);
}

const ICONS = { note: ACT_ICONS.note, email: ACT_ICONS.email, call: ACT_ICONS.call, created: ACT_ICONS.created, task: ACT_ICONS.task, meeting: ACT_ICONS.meeting, stage: ACT_ICONS.stage, prop: ACT_ICONS.prop, message: ACT_ICONS.sms, system: ACT_ICONS.system };
// Title of a timeline entry by type (what the collapsed row shows first).
const KIND_TITLE = { note: 'Nota', email: 'Correo', call: 'Llamada', created: 'Registro creado', task: 'Tarea', meeting: 'Reunión', stage: 'Asociación', prop: 'Propiedad actualizada', message: 'Mensaje', system: 'Actividad del sistema' };
function sampleEvents() {
  const day = 86400000;
  const base = new Date(rec.created).getTime();
  const who = rec.owner === 'Sin asignar' ? 'Fernando L.' : rec.owner || 'Fernando L.';
  return [
    { type: 'task', when: base + 10 * day, who, text: `Tarea asignada a ${who}: llamada de prospección. Con demora: ${formatDate(new Date(base + 10 * day))}.` },
    { type: 'email', when: base + 6 * day, who: 'Sistema', text: 'Correo de seguimiento enviado.' },
    { type: 'call', when: base + 3 * day, who, text: 'Llamada de 12 minutos. Resultado: conectado.' },
    { type: 'created', when: base, who: 'Sistema', text: `${cfg.singular[0].toUpperCase() + cfg.singular.slice(1)} creado.` },
  ];
}
let actKind = '';
let actQuery = '';
const evKey = (ev) => `${ev.id || ''}:${ev.when}:${ev.type}`;
const pinnedStorageKey = `crm:${type}:${id}:pinned`;
// An empty value explicitly overrides legacy extra.pinned flags after unpinning.
function pinnedEvent(events) {
  const key = localStorage.getItem(pinnedStorageKey);
  return key === null ? events.find((ev) => ev.extra?.pinned) : events.find((ev) => evKey(ev) === key);
}
const openEvents = new Set(); // timeline entries expanded by the person
let actDate = ''; // '' | days back ('0' = today)
let actWho = ''; // '' | 'Tú' | owner name | 'Sistema'
const actDateOk = (ev) => { if (actDate === '') return true; const n = Number(actDate); const start = new Date(); start.setHours(0, 0, 0, 0); return new Date(ev.when).getTime() >= start.getTime() - n * 86400000; };
function allEvents() {
  const real = loadNotes();
  const deleted = deletedActivitiesFor(type, id, true);
  const base = [...real, ...sampleEvents().filter((e) => e.type === 'created' && !real.some((a) => a.type === 'created'))];
  // Mezclar las llamadas reales de Twilio: si una actividad ya trae su callSid (la pantalla de
  // cierre la guardó), solo se enriquece con grabación/transcripción; si no, entra como evento.
  const loggedSids = new Set([...base, ...deleted].map((a) => a.extra && a.extra.callSid).filter(Boolean));
  const enriched = base.map((a) => {
    const sid = a.extra && a.extra.callSid;
    const log = sid ? callLogs.find((l) => l.call_sid === sid) : null;
    if (!log) return a;
    return { ...a, extra: { ...a.extra, recording: !!log.recording_url, transcript: log.transcript || '' } };
  });
  const callEvs = callLogs.filter((l) => !loggedSids.has(l.call_sid)).map((l) => ({
    type: 'call',
    when: l.started_at ? new Date(l.started_at).getTime() : Date.now(),
    who: 'Tú',
    text: `Llamada ${l.direction === 'inbound' ? 'entrante' : 'saliente'}.`,
    extra: {
      direction: l.direction === 'inbound' ? 'Entrante' : 'Saliente',
      outcome: l.outcome || CALL_OUTCOME[l.status] || l.status || '',
      durationSec: Number(l.duration_sec) || 0,
      callSid: l.call_sid,
      recording: !!l.recording_url,
      transcript: l.transcript || '',
    },
  }));
  return [...enriched, ...callEvs].sort((a, b) => b.when - a.when);
}
function renderTimeline() {
  const q = actQuery.toLowerCase();
  const all = allEvents();
  const pinned = pinnedEvent(all);
  const events = all.filter((ev) => ev !== pinned && (!actKind || ev.type === actKind) && (!q || ev.text.toLowerCase().includes(q)) && actDateOk(ev) && (!actWho || ev.who === actWho));
  if ($('act-clear')) $('act-clear').hidden = !(actKind || actDate || actWho || q);
  const fmtWhen = (ev) => {
    const d = new Date(ev.when);
    const date = formatDate(d);
    return ['call', 'meeting', 'email', 'message'].includes(ev.type) ? `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : date;
  };
  const extraTags = (ev) => {
    const x = ev.extra || {};
    const tags = [];
    if (x.outcome) tags.push(`Resultado: ${x.outcome}`);
    if (x.direction) tags.push(x.direction);
    if (x.durationMin) tags.push(`${x.durationMin} min`);
    else if (x.durationSec) tags.push(x.durationSec < 60 ? `${x.durationSec} s` : `${Math.round(x.durationSec / 60)} min`);
    if (x.locationType) tags.push(x.locationType);
    if (x.channel) tags.push(x.channel);
    if (x.subject) tags.push(`Asunto: ${x.subject}`);
    // The meeting's attendees («con Ana, Luis…»), the same on every timeline that carries it.
    if (Array.isArray(x.attendees) && x.attendees.length) tags.push(`con ${x.attendees.map((a) => a.name).filter(Boolean).join(', ')}`);
    return tags.length ? `<div class="timeline__tags">${tags.map((t) => `<span class="tag tag--none">${esc(t)}</span>`).join('')}</div>` : '';
  };
  // Grabada: mini reproductor en línea (play grande, tiempo y duración) + enlace al panel lateral.
  const callMedia = (ev) => {
    const x = ev.extra || {};
    if (!x.callSid || (!x.recording && !x.transcript)) return '';
    const dur = x.durationSec || (Number(x.durationMin) || 0) * 60;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    return `<div class="tplayer" data-tplayer="${esc(x.callSid)}">
      <button class="tplayer__play" type="button" data-tplay aria-label="Escuchar la grabación">▶</button>
      <span class="tplayer__time" data-tcur>0:00</span>
      <div class="tplayer__bar" data-tbar><div class="tplayer__fill" data-tfill></div></div>
      <span class="tplayer__time">${dur ? esc(fmt(dur)) : ''}</span>
      <button class="tplayer__review" type="button" data-reviewcall="${esc(x.callSid)}">Revisar grabación y seguimiento</button>
    </div>`;
  };
  // Each entry: icon by type, title, who logged it and when (relative); click expands the full text,
  // the exact date and the details.
  const titleOf = (ev) => { const x = ev.extra || {}; const base = KIND_TITLE[ev.type] || 'Actividad'; return x.subject ? `${base}: ${x.subject}` : base; };
  const item = (ev) => `
    <li class="timeline__item${ev === pinned ? ' timeline__item--pinned' : ''}${openEvents.has(evKey(ev)) ? ' is-open' : ''}" data-ev="${esc(evKey(ev))}">
      <span class="timeline__ico" aria-hidden="true">${ev.type === 'call' && ev.extra?.direction === 'Entrante' ? ACT_ICONS.inbound : ICONS[ev.type] || ACT_ICONS.more}</span>
      <div class="timeline__body">
        <details class="timeline__actions"><summary aria-label="Acciones de actividad">⋮</summary><div class="timeline__actions-panel">${[...(ev.extra?.scheduled && ev.extra.status === 'scheduled' ? [['cancel-send', 'Cancelar envío'], ['edit-send', 'Editar fecha']] : ['note', 'call', 'email', 'meeting', 'message'].includes(ev.type) ? [['edit', 'Editar'], ['delete', 'Eliminar']] : []), ['pin', ev === pinned ? 'Desfijar' : 'Fijar en la parte superior']].map(([action, label]) => `<button type="button" class="btn btn--ghost" data-activity-action="${action}" data-activity-key="${esc(evKey(ev))}">${label}</button>`).join('')}</div></details>
        <button class="timeline__head" type="button" aria-expanded="${openEvents.has(evKey(ev))}">
          <span class="timeline__title">${ev === pinned ? '📌 Fijada · ' : ''}${esc(titleOf(ev))}</span>
          <span class="timeline__chev" aria-hidden="true">⌄</span>
        </button>
        <div class="timeline__meta"><strong>${esc(ev.who)}</strong> · <span title="${esc(fmtWhen(ev))}">${esc(relativeTimeFine(ev.when))}</span></div>
        ${activityOriginHtml(ev)}<div class="timeline__text">${esc(ev.text)}</div>
        ${ev.type === 'email' && ev.extra?.attachments?.length ? `<ul aria-label="Adjuntos del correo">${ev.extra.attachments.map((f) => `<li>📎 ${esc(f.name)} · ${formatAttachmentSize(f.size)}</li>`).join('')}</ul>` : ''}
        <div class="timeline__detail"><div class="muted">${esc(fmtWhen(ev))}</div>${extraTags(ev)}${callMedia(ev)}</div>
        ${['system', 'prop', 'created'].includes(ev.type) ? '' : `<div data-comments-key="${esc(evKey(ev))}"></div>`}
      </div>
    </li>`;
  $('rec-timeline').innerHTML = (pinned ? `<li class="timeline__section"><h3>📌 Fijado</h3><span class="muted">Visible independientemente de los filtros</span></li>${item(pinned)}` : '') + '<li class="timeline__section"><h3>Actividad</h3></li>' + (events.length ? events.map(item).join('') : '<li class="muted">Sin actividades que coincidan.</li>');
  if ($('rec-timeline-short')) $('rec-timeline-short').innerHTML = allEvents().filter((e) => e.type === 'task' || e.type === 'email').slice(0, 2).map(item).join('');
  document.querySelectorAll('[data-activity-action]').forEach((button) => button.addEventListener('click', async () => {
    const ev = allEvents().find((a) => evKey(a) === button.dataset.activityKey);
    if (!ev) return;
    button.disabled = true;
    try {
      if (button.dataset.activityAction === 'pin') {
        const unpin = evKey(ev) === (pinned && evKey(pinned));
        localStorage.setItem(pinnedStorageKey, unpin ? '' : evKey(ev));
        renderTimeline();
        toast(unpin ? 'Actividad desfijada' : 'Actividad fijada');
        return;
      }
      // a scheduled e-mail (src/scheduled-emails.js) can be cancelled or moved while it waits
      if (button.dataset.activityAction === 'cancel-send') {
        const item = await cancelScheduled(ev.extra.scheduledId);
        toast(item ? 'Envío cancelado: el correo no se enviará' : 'Ese correo ya no estaba programado');
        renderTimeline();
        return;
      }
      if (button.dataset.activityAction === 'edit-send') {
        const item = scheduledById(ev.extra.scheduledId);
        if (!item || item.status !== 'scheduled') { toast('Ese correo ya no está programado'); renderTimeline(); return; }
        const min = scheduledInput(new Date(Date.now() + 60000).toISOString());
        openModal('Editar la fecha de envío', `<p>«${esc(item.subject)}» a ${esc(item.toNames)} · programado para el ${esc(scheduledWhen(item.sendAt))}.</p><label class="field"><span>Nueva fecha y hora</span><input type="datetime-local" id="resched-at" value="${esc(scheduledInput(item.sendAt))}" min="${esc(min)}" /></label><p class="muted">Zona horaria: ${esc(scheduledTz())}</p>`,
          `<button class="btn btn--primary" type="button" data-confirm="reschedule-send" data-id="${esc(item.id)}">Guardar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
        return;
      }
      if (!ev.id) {
        if (dbIsLive()) ev.id = await activityIdForComment(ev, type, id);
        else { addActivity({ ...ev, recordType: type, recordId: id }); ev.id = activitiesFor(type, id).find((a) => a.extra?.callSid === ev.extra?.callSid)?.id; }
      }
      if (button.dataset.activityAction === 'edit') openLogModal(ev.type, { activity: ev, channel: ev.extra?.channel || '' });
      else openModal('Eliminar actividad', '<p>La actividad se podrá restaurar durante 90 días.</p>', `<button class="btn btn--danger" data-confirm="activity-delete" data-id="${esc(ev.id)}">Eliminar</button><button class="btn btn--ghost" data-close>Cancelar</button>`);
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }));
  $('rec-timeline').querySelectorAll('[data-playcall]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    playRecording(b, b.dataset.playcall);
  }));
  $('rec-timeline').querySelectorAll('[data-tplayer]').forEach((el) => attachInlinePlayer(el, el.dataset.tplayer));
  $('rec-timeline').querySelectorAll('[data-reviewcall]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const ev = all.find((x) => x.extra && x.extra.callSid === b.dataset.reviewcall);
    if (!ev) return;
    openCallReview({
      callSid: ev.extra.callSid,
      title: `Llamada con ${cfg.title(rec)}`,
      name: cfg.title(rec),
      when: ev.when,
      durationSec: ev.extra.durationSec || (Number(ev.extra.durationMin) || 0) * 60,
      outcome: ev.extra.outcome || '',
      transcript: ev.extra.transcript || '',
      hasRecording: !!ev.extra.recording,
      onOutcome: (val) => {
        ev.extra.outcome = val;
        const log = callLogs.find((l) => l.call_sid === ev.extra.callSid);
        if (log) log.outcome = val;
        renderTimeline();
      },
    });
  }));
  document.querySelectorAll('[data-comments-key]').forEach((container) => {
    const ev = allEvents().find((entry) => evKey(entry) === container.dataset.commentsKey);
    if (ev) mountActivityComments(container, ev, type, id);
  });
}
function addEvent(ev) {
  addActivity({ ...ev, recordType: type, recordId: id });
  renderTimeline();
}
function addHistory(key, from, to, label) {
  addHistoryEntry(type, id, key, from, to, label);
}

function nextNumber(prefix) {
  const k = `crm:counter:${prefix}`;
  const n = Number(localStorage.getItem(k) || '1040') + 1;
  localStorage.setItem(k, String(n));
  return `${prefix}-${n}`;
}

// Mount outside the record content so card refreshes preserve the creation forms.
const refreshAfterCreation = () => { renderAssoc(); renderTimeline(); };
const recordCreateDeal = mountCreateDeal({ root: document.body, onCreated: refreshAfterCreation });
const recordCreateTicket = mountCreateTicket({ root: document.body, onCreated: refreshAfterCreation });
function recordAssociationPrefill() {
  const contactId = type === 'contacts' ? rec.id : rec.contactId || '';
  const contact = contactId ? findRecord('contacts', contactId) : null;
  return { contactId, companyId: type === 'companies' ? rec.id : rec.companyId || contact?.companyId || '' };
}

function runMore(kind, sub) {
  const name = cfg.title(rec);
  const docForm = (title, label) => openModal(
    title,
    `<label class="field"><span>Importe (€)</span><input id="doc-amount" type="number" value="${rec.amount || 2500}" /></label>
     <label class="field"><span>Descripción</span><input id="doc-desc" type="text" value="${esc(label)} para ${esc(name)}" /></label>
     <label class="field"><span>Vence</span><input id="doc-due" type="date" value="${new Date(TODAY.getTime() + 30 * 86400000).toISOString().slice(0, 10)}" /></label>`,
    `<button class="btn btn--primary" type="button" data-confirm="doc" data-kind="${kind}">Crear</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`,
  );
  switch (kind) {
    case 'invoice': docForm('Crear factura', 'Factura'); break;
    case 'quote': docForm('Crear cotización', 'Cotización'); break;
    case 'paylink': docForm('Crear enlace de pago', 'Enlace de pago'); break;
    case 'contract': docForm('Crear contrato', 'Contrato'); break;
    case 'sequence':
      // Ventas › Secuencias: pick the sequence, fill its placeholders, preview the steps with this contact's data.
      if (type !== 'contacts') { toast('Las secuencias se inscriben desde la ficha de un contacto.'); break; }
      openEnrollDialog({ contact: rec, onEnrolled: () => renderTimeline() });
      break;
    case 'linkedin':
      if (sub === 'Ver perfil de LinkedIn') window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`, '_blank', 'noopener');
      else {
        addEvent({ type: 'note', when: Date.now(), who: 'Tú', text: `LinkedIn: ${sub || 'interacción'} registrada para ${name}.` });
        toast(`${sub || 'Interacción'} registrada`);
      }
      break;
    case 'log': {
      const map = { Llamada: ['call'], Correo: ['email'], Reunión: ['meeting'], 'Mensaje de LinkedIn': ['message', 'LinkedIn'], 'Mensaje de WhatsApp': ['message', 'WhatsApp'], SMS: ['message', 'SMS'] };
      const [k, ch] = map[sub] || ['call'];
      openLogModal(k, { channel: ch || '' });
      break;
    }
    case 'whatsapp': {
      const digits = String(rec.mobilephone || rec.phone || '').replace(/\D/g, '');
      if (!digits) { toast('Este registro no tiene número de teléfono.'); break; }
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(`Hola ${rec.first || name}, te escribo de Megaglass.`)}`, '_blank', 'noopener');
      addEvent({ type: 'note', when: Date.now(), who: 'Tú', text: 'Mensaje de WhatsApp iniciado.' });
      break;
    }
    case 'sms': {
      if (!hasTwilio()) {
        openModal('Enviar SMS', `<p class="muted">Para enviar SMS de verdad primero conecta tu cuenta de Twilio.</p>`, `<a class="btn btn--primary" href="../settings/#prefs-general:llamadas">Ir a Ajustes › Llamadas</a><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
        break;
      }
      const phone = String(rec.mobilephone || rec.phone || '').trim();
      if (!phone) { toast('Este registro no tiene número de teléfono.'); break; }
      openModal(
        `Enviar SMS a ${esc(name)}`,
        `<label class="field"><span>Al número</span><input id="sms-to" value="${esc(phone)}" /></label>
         <label class="field"><span>Mensaje</span><textarea id="sms-body" rows="4" maxlength="1600" placeholder="Escribe tu mensaje…"></textarea></label>
         <p class="muted" id="sms-count">0 / 1600 · se envía desde tu número de Twilio</p>`,
        `<button class="btn btn--primary" type="button" data-confirm="sendsms">Enviar SMS</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`,
      );
      const ta = $('sms-body');
      ta.addEventListener('input', () => { $('sms-count').textContent = `${ta.value.length} / 1600 · se envía desde tu número de Twilio`; });
      ta.focus();
      break;
    }
    case 'schedule':
      openLogModal('meeting', { schedule: true });
      break;
    case 'deal':
      recordCreateDeal.open(recordAssociationPrefill());
      break;
    case 'ticket':
      recordCreateTicket.open(recordAssociationPrefill());
      break;
    case 'workflow': {
      // Automatización › Workflows: the real workflows of this object; the engine (src/workflow-engine.js)
      // creates the run, executes the steps now and schedules the delays.
      const list = workflows().filter((w) => w.objectType === type && w.actions.length);
      openModal(
        'Inscribir en un workflow',
        list.length
          ? `<label class="field"><span>Workflow</span><select id="wf-name">${list.map((w) => `<option value="${esc(w.id)}">${esc(w.name)} (${w.actions.length} ${w.actions.length === 1 ? 'acción' : 'acciones'}${w.status === 'published' ? '' : ' · sin publicar'}${activeWorkflowRun(w.id, type, rec.id) ? ' · ya inscrito' : ''})</option>`).join('')}</select></label>
           <p class="muted">Se crea la inscripción: las acciones se ejecutan ahora (correo desde la cuenta conectada, tareas, propiedades), las esperas se programan y cada paso queda en la cronología.</p>`
          : `<p class="muted">No hay workflows para ${cfg.singular}s todavía. Créalos en Automatización › Workflows.</p>`,
        `${list.length ? '<button class="btn btn--primary" type="button" data-confirm="workflow">Inscribir</button>' : ''}<button class="btn btn--ghost" type="button" data-close>Cancelar</button>`,
      );
      break;
    }
    case 'list':
      openListMemberships();
      break;
    case 'reorder':
      openModal(
        'Reordenar botones de actividad',
        `<p class="muted">Usa las flechas para cambiar el orden de los botones de la ficha.</p>
         <ul class="col-list" id="quick-order">${quickOrder().map(([k, ico, label]) => `<li class="col-item" data-key="${k}"><label><span class="more-item__ico">${ico}</span> ${label}</label><span class="col-item__moves"><button type="button" data-move="-1" aria-label="Subir">▲</button><button type="button" data-move="1" aria-label="Bajar">▼</button></span></li>`).join('')}</ul>`,
        `<button class="btn btn--primary" type="button" data-confirm="reorder">Guardar</button><button class="btn btn--ghost" type="button" data-confirm="reorder-reset">Restablecer</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`,
      );
      break;
    default:
      break;
  }
}

function renderAll() {
  renderQuick();
  renderTabs();
  renderMiddle();
  renderRight();
  renderHeader();
  renderProps();
  renderAllProps($('adv-search').value);
  renderAllPropsPanel();
  renderAi();
  renderTimeline();
  wireMenus(mount);
}

// Reads the inline editor's value in the record's own type and saves it when it changed; otherwise it just
// closes the editor (clicking away from an untouched field must not write anything).
function commitEdit(form) {
  if (!form || !form.isConnected) return;
  const key = form.dataset.key;
  const el = form.querySelector('[data-edit]');
  if (!el) return;
  let value = el.value;
  if (el.type === 'number') value = value === '' ? '' : Number(value) || 0;
  if (el.type === 'date') value = value ? new Date(`${value}T12:00:00`).toISOString() : '';
  if (el.type === 'datetime-local') value = value ? new Date(value).toISOString() : '';
  const before = rec[key] ?? '';
  const same = el.type === 'date' ? dateInput(before) === dateInput(value) : el.type === 'datetime-local' ? datetimeInput(before) === datetimeInput(value) : String(before) === String(value);
  if (same) { cancelEdit(form); return; }
  save(key, value);
}
function cancelEdit(form) {
  if (!form || !form.isConnected) return;
  const inPanel = Boolean(form.closest('#allprops-panel'));
  if (inPanel) renderAllPropsPanel(); else renderProps();
}
async function save(key, value, label) {
  try { await validatePropertyValues(type, { [key]: value }, { id: rec.id }); } catch (e) { toast(e.message); return; }
  const from = rec[key];
  if (type === 'deals' && key === 'stage') {
    if (!await changeDealStage(rec, value)) { renderAll(); return; }
  } else {
    // a rule of the lifecycle stage (Ajustes) may refuse the change: show why and leave the record as it was
    try { setField(type, rec.id, key, value); } catch (e) { toast(e.message || String(e)); renderAll(); return; }
  }
  // A reminder set again (after it was shown) must fire again: the checker in src/task-reminders.js watches it.
  if (type === 'tasks' && key === 'reminderAt' && rec.reminderFiredAt) setField(type, rec.id, 'reminderFiredAt', '');
  // A ticket moved to another pipeline takes that pipeline's statuses (first open one if its status is not there).
  if (type === 'tickets' && key === 'pipeline') {
    const statuses = ticketStatusesFor(value);
    const f = cfg.fields.find((x) => x[0] === 'status');
    if (f) f[3] = opt(statuses.map(([k, l]) => [k, l]));
    if (!statuses.some((s) => s[0] === rec.status)) setField(type, rec.id, 'status', firstOpenTicketStatus(value));
  }
  rec = findRecord(type, id);
  const lbl = label || (cfg.fields.find((f) => f[0] === key) || props[key] || { label: key })[1] || props[key]?.label || key;
  addHistory(key, from, value, lbl);
  renderAll();
  if (queueBar) queueBar.refresh();
  toast('Guardado');
}

// ---------- Acciones menu ----------
// ---------- Fusionar, as the original: pick the duplicate (search), compare side by side, choose the kept values ----------
let mergeState = null;
const mergeHaystack = (r) => [r.name, r.first, r.last, r.email, r.domain, r.phone, r.company].filter(Boolean).join(' ').toLowerCase();
// How many empty properties of `keep` the merge will fill from `other` (the same rule mergeRecords applies).
const mergeGaps = (keep, other) => mergeFillable(type, keep, other).length;
function mergeCandidates(q) {
  const all = ALL[type]().filter((r) => Number(r.id) !== Number(rec.id));
  const s = String(q || '').trim().toLowerCase();
  if (s) return all.filter((r) => mergeHaystack(r).includes(s)).slice(0, 8);
  // without a query: the likely duplicates first (same e-mail, domain or name), then the rest
  const likely = all.filter((r) => (rec.email && r.email && r.email.toLowerCase() === rec.email.toLowerCase()) || (rec.domain && r.domain && r.domain === rec.domain) || (rec.name && r.name && r.name.toLowerCase() === rec.name.toLowerCase()));
  return [...likely, ...all.filter((r) => !likely.includes(r))].slice(0, 8);
}
const mergeResultsHtml = (q) => { const rows = mergeCandidates(q); return rows.length ? rows.map((r) => `<li><button class="merge__pick" type="button" data-merge-pick="${r.id}"><strong>${esc(r.name)}</strong><span class="muted">${esc(r.email || r.domain || r.company || '')}</span></button></li>`).join('') : '<li class="muted">Sin resultados</li>'; };
function openMergePick(preselect = null) {
  mergeState = null;
  if (preselect && findRecord(type, preselect)) { openMergeCompare(preselect); return; }
  openModal(`Fusionar ${cfg.singular}`, `<p>Elige el ${cfg.singular} que quieres fusionar con <strong>${esc(cfg.title(rec))}</strong>.</p>
    <label class="field"><span>Buscar ${cfg.singular}</span><input id="merge-search" type="search" placeholder="Nombre, correo o dominio" autocomplete="off"></label>
    <ul class="merge__results" id="merge-results">${mergeResultsHtml('')}</ul>`, '<button class="btn btn--ghost" type="button" data-close>Cancelar</button>');
  setTimeout(() => { const i = $('merge-search'); if (i) i.focus(); }, 30);
}
function openMergeCompare(otherId) {
  const other = findRecord(type, otherId);
  if (!other || Number(other.id) === Number(rec.id)) { toast('Registro no encontrado'); return; }
  const keep = suggestedKeep([rec, other]);
  mergeState = { other, keepId: Number(keep.id), conflicts: mergeConflicts(type, rec, other) };
  const pm = propertyMap(type);
  const label = (k) => ({ first: 'Nombre', last: 'Apellidos', name: 'Nombre completo' }[k] || (pm[k] && pm[k].label) || k);
  const side = (r) => `<strong>${esc(r.name)}</strong><br><span class="muted">${esc(r.email || r.domain || '')}</span>`;
  const rows = mergeState.conflicts.map((c) => `<tr data-merge-key="${esc(c.key)}"><th scope="row">${esc(label(c.key))}</th>
      <td><label class="merge__opt"><input type="radio" name="merge-val-${esc(c.key)}" value="${rec.id}"> <span>${esc(String(c.keep))}</span></label></td>
      <td><label class="merge__opt"><input type="radio" name="merge-val-${esc(c.key)}" value="${other.id}"> <span>${esc(String(c.other))}</span></label></td></tr>`).join('');
  openModal(`Fusionar ${cfg.singular}`, `
    <p>Fusionar <strong>${esc(rec.name)}</strong> con <strong>${esc(other.name)}</strong>. Elige el registro principal y, en cada propiedad con valores distintos, el valor que se conserva.</p>
    <div class="merge__keep" id="merge-keep">
      <label class="merge__opt"><input type="radio" name="merge-keep" value="${rec.id}"> <span>Conservar <strong>${esc(rec.name)}</strong> como principal</span></label>
      <label class="merge__opt"><input type="radio" name="merge-keep" value="${other.id}"> <span>Conservar <strong>${esc(other.name)}</strong> como principal</span></label>
    </div>
    ${rows ? `<table class="table merge__table" id="merge-table"><thead><tr><th>Propiedad</th><th>${side(rec)}</th><th>${side(other)}</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted" id="merge-table">No hay propiedades con valores distintos: no hay nada que elegir.</p>'}
    <p class="muted" id="merge-gaps"></p>
    <p class="merge__warn">El otro registro se envía a la papelera y puede restaurarse desde «Acciones › Papelera» de la lista; sus actividades, asociaciones e inscripciones en secuencias pasan al principal.</p>`,
  `<button class="btn btn--primary" type="button" data-confirm="merge">Fusionar</button><button class="btn btn--ghost" type="button" data-merge-back>Atrás</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`);
  syncMergeDefaults();
}
// The principal's values are selected by default; choosing the other record as principal flips every row.
function syncMergeDefaults() {
  if (!mergeState) return;
  const keepId = String(mergeState.keepId);
  $('rec-modal-body').querySelectorAll('input[type="radio"]').forEach((i) => { if (i.name === 'merge-keep' || i.name.startsWith('merge-val-')) i.checked = i.value === keepId; });
  const keep = keepId === String(rec.id) ? rec : mergeState.other;
  const other = keep === rec ? mergeState.other : rec;
  const n = mergeGaps(keep, other);
  $('merge-gaps').textContent = n ? `${n} ${n === 1 ? 'propiedad vacía' : 'propiedades vacías'} de «${keep.name}» se completará${n === 1 ? '' : 'n'} con los valores del otro registro.` : `«${keep.name}» no tiene propiedades vacías que completar.`;
}
$('rec-modal').addEventListener('click', (e) => {
  const pick = e.target.closest('[data-merge-pick]');
  if (pick) { openMergeCompare(Number(pick.dataset.mergePick)); return; }
  if (e.target.closest('[data-merge-back]')) openMergePick();
});
$('rec-modal').addEventListener('input', (e) => { if (e.target.id === 'merge-search') $('merge-results').innerHTML = mergeResultsHtml(e.target.value); });
$('rec-modal').addEventListener('change', (e) => { if (e.target.name === 'merge-keep' && mergeState) { mergeState.keepId = Number(e.target.value); syncMergeDefaults(); } });

// ---------- «Agregar a lista»: the record's memberships in the real segments of its object ----------
// Static segments carry a checkbox (checking adds, unchecking removes: addStaticMembers / removeStaticMembers
// persist and write the timeline); active segments are read-only: their criteria decide the membership.
const segmentsOfRecord = () => segments().filter((s) => s.object === type);
const inSegment = (s) => segmentMembers(s).some((m) => Number(m.id) === Number(rec.id));
function listMembershipsHtml() {
  const mine = segmentsOfRecord();
  const statics = mine.filter((s) => s.type === 'static');
  const actives = mine.filter((s) => s.type !== 'static');
  const href = (s) => `../../segments/editor/?id=${encodeURIComponent(s.id)}`;
  const count = (s) => `${segmentSize(s)} ${objectPlural(type)}`;
  const staticItem = (s) => { const m = inSegment(s); return `<li class="listmem__item${m ? ' is-member' : ''}" data-seg="${esc(s.id)}"><label class="listmem__check"><input type="checkbox" data-seg-toggle="${esc(s.id)}" ${m ? 'checked' : ''} aria-label="${m ? 'Quitar de' : 'Agregar a'} ${esc(s.name)}" /><span><a href="${href(s)}">${esc(s.name)}</a> <span class="muted">· ${esc(count(s))}</span></span></label></li>`; };
  const activeItem = (s) => { const m = inSegment(s); return `<li class="listmem__item listmem__item--active${m ? ' is-member' : ''}" data-seg="${esc(s.id)}"><span><a href="${href(s)}">${esc(s.name)}</a> <span class="muted">· ${esc(count(s))}</span></span><span class="tag ${m ? 'tag--done' : 'tag--none'}" data-seg-membership="${m ? 'member' : 'none'}">${m ? 'Miembro' : 'No miembro'}</span></li>`; };
  return `<p class="muted">Las listas estáticas de ${esc(objectPlural(type))} se editan aquí: marca para agregar «${esc(cfg.title(rec))}», desmarca para quitarlo. Las listas activas se calculan solas con sus criterios.</p>
    <h4 class="listmem__title">Listas estáticas</h4>
    ${statics.length ? `<ul class="listmem" id="listmem-static">${statics.map(staticItem).join('')}</ul>` : `<p class="muted">No hay listas estáticas de ${esc(objectPlural(type))}. <a href="../../segments/">Crea una en CRM › Segmentos</a>.</p>`}
    <h4 class="listmem__title">Listas activas <span class="muted">· solo lectura</span></h4>
    ${actives.length ? `<ul class="listmem" id="listmem-active">${actives.map(activeItem).join('')}</ul>` : `<p class="muted">No hay listas activas de ${esc(objectPlural(type))}.</p>`}`;
}
function openListMemberships() {
  openModal('Administrar membresías de lista', listMembershipsHtml(), '<a class="btn btn--ghost" href="../../segments/">Ver todos los segmentos</a><button class="btn btn--primary" type="button" data-close>Listo</button>');
}
$('rec-modal').addEventListener('change', (e) => {
  const cb = e.target.closest && e.target.closest('[data-seg-toggle]');
  if (!cb) return;
  const seg = segments().find((s) => String(s.id) === String(cb.dataset.segToggle));
  if (!seg || seg.type !== 'static') return;
  if (cb.checked) { addStaticMembers(seg.id, [Number(rec.id)]); toast(`Agregado a «${seg.name}»`); }
  else { removeStaticMembers(seg.id, [Number(rec.id)]); toast(`Quitado de «${seg.name}»`); }
  $('rec-modal-body').innerHTML = listMembershipsHtml();
  renderTimeline();
});

function runAction(act, data = {}) {
  const name = cfg.title(rec);
  switch (act) {
    case 'follow': {
      const next = toggleFollow(type, id);
      $('follow-item').textContent = next ? 'Dejar de seguir' : 'Seguir';
      toast(next ? `Ahora sigues a ${name}. Recibirás notificaciones de su actividad.` : `Has dejado de seguir a ${name}.`);
      break;
    }
    case 'all-props':
    case 'all-props-panel':
      openAllProps();
      break;
    case 'all-props-close':
      closeAllProps();
      break;
    case 'prop-history': {
      const h = loadHistory();
      openModal(
        'Historial de la propiedad',
        h.length
          ? `<table class="mini-table"><thead><tr><th>Propiedad</th><th>Valor anterior</th><th>Valor nuevo</th><th>Cambiado por</th><th>Fecha</th></tr></thead><tbody>${h
              .map((x) => `<tr><td>${esc((props[x.key] || { label: x.key }).label)}</td><td>${esc(x.from ?? '--')}</td><td>${esc(x.to ?? '--')}</td><td>${esc(x.who)}</td><td>${formatDate(new Date(x.when))}</td></tr>`)
              .join('')}</tbody></table>`
          : `<p class="muted">Todavía no hay cambios registrados en este ${cfg.singular}. Edita una propiedad y aparecerá aquí.</p>`,
      );
      break;
    }
    case 'assoc-history': {
      const rows = cfg.assoc(rec).flatMap(([t, list]) => list.map((r) => [t, r.name]));
      openModal(
        'Historial de asociaciones',
        rows.length
          ? `<table class="mini-table"><thead><tr><th>Tipo</th><th>Registro</th><th>Acción</th><th>Fecha</th></tr></thead><tbody>${rows
              .map(([t, n]) => `<tr><td>${t}</td><td>${esc(n)}</td><td>Asociado</td><td>${formatDate(rec.created)}</td></tr>`)
              .join('')}</tbody></table>`
          : '<p class="muted">Este registro no tiene asociaciones.</p>',
      );
      break;
    }
    case 'review-assoc':
      $('rec-assoc').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Revisa las asociaciones en la columna derecha.');
      break;
    case 'summarize':
      renderAi();
      toast('Resumen actualizado');
      break;
    case 'google':
      window.open(`https://www.google.com/search?q=${encodeURIComponent(name)}`, '_blank', 'noopener');
      break;
    case 'unsubscribe':
      openModal(
        'Suscripción de marketing',
        `<p><strong>${esc(name)}</strong> ${rec.marketingOptOut === 'Sí' ? 'volverá a recibir correos de marketing' : 'dejará de recibir correos de marketing' }.</p><p class="muted">Podrás volver a suscribirlo desde sus propiedades de correo.</p>`,
        `<button class="btn btn--primary" type="button" data-confirm="unsubscribe">${rec.marketingOptOut === 'Sí' ? 'Reactivar suscripción' : 'Confirmar baja'}</button><button class="btn btn--ghost" type="button" data-close>Volver</button>`,
      );
      break;
    case 'restore-activity':
      openActivityTrash();
      break;
    case 'access':
      openModal(
        'Acceso a los registros',
        `<table class="mini-table"><thead><tr><th>Usuario</th><th>Equipo</th><th>Acceso</th></tr></thead><tbody>
          <tr><td>${ownerHtml('Fernando L.')}</td><td>Ventas Norte</td><td>Propietario · Editar</td></tr>
          <tr><td>${ownerHtml('Sofía R.')}</td><td>Ventas Sur</td><td>Ver y editar</td></tr>
          <tr><td>Administradores</td><td>—</td><td>Control total</td></tr>
        </tbody></table><p class="muted">El acceso depende de los permisos de cada usuario y de la propiedad del registro.</p>`,
      );
      break;
    case 'merge':
      openMergePick(Number(data.mergeWith) || null);
      break;
    case 'clone': {
      const copy = { ...rec };
      delete copy.id;
      delete copy.created;
      copy.name = `${rec.name} (copia)`;
      if (type === 'contacts') copy.last = `${rec.last} (copia)`;
      const made = addRecord(type, copy);
      toast(`${cfg.singular[0].toUpperCase() + cfg.singular.slice(1)} clonado`);
      setTimeout(() => { location.href = `./?id=${made.id}`; }, 400);
      break;
    }
    case 'delete':
      openModal(
        `Eliminar ${cfg.singular}`,
        `<p>¿Seguro que quieres eliminar <strong>${esc(name)}</strong>? Podrás restaurarlo desde la lista (Acciones › Restaurar registros eliminados).</p>`,
        `<button class="btn btn--danger" type="button" data-confirm="delete">Eliminar</button><button class="btn btn--ghost" type="button" data-close>Cancelar</button>`,
      );
      break;
    case 'export': {
      const cols = Object.values(props).map((p) => ({ key: p.key, label: p.label, text: (r) => (r[p.key] ?? '') }));
      download(`${cfg.singular}-${rec.id}.csv`, toCsv([rec], cols, type));
      toast(`Datos de ${name} exportados a CSV`);
      break;
    }
    case 'rename': {
      const next = window.prompt('Nuevo nombre', name);
      if (next && next.trim()) {
        if (type === 'contacts') {
          const [first, ...rest] = next.trim().split(' ');
          setField(type, rec.id, 'first', first);
          setField(type, rec.id, 'last', rest.join(' '));
        }
        save('name', next.trim(), 'Nombre');
      }
      break;
    }
    case 'customize':
      location.href = `${root}layout/?type=${type}&id=${rec.id}`;
      break;
    case 'customize-props':
      openCardEditor();
      break;
    case 'ask':
      openModal('Hacer una pregunta', `<label class="field"><span>Pregunta sobre ${esc(name)}</span><input id="ask-q" type="text" placeholder="¿Cuándo fue la última llamada?" /></label><div id="ask-a" class="ai-box"></div>`, `<button class="btn btn--primary" type="button" data-confirm="ask">Preguntar</button><button class="btn btn--ghost" type="button" data-close>Cerrar</button>`);
      break;
    case 'copy-summary':
      navigator.clipboard?.writeText(summaryText().lines.join('\n'));
      toast('Resumen copiado');
      break;
    case 'fb-up':
    case 'fb-down':
      toast('Gracias por tu valoración');
      break;
    case 'add-lead':
      save('lead_stage', 'Nuevo', 'Etapa del lead');
      break;
    case 'add-assoc':
      openAssocDrawer(document.activeElement?.dataset?.kind || lastAssocKind || 'companies');
      break;
    case 'assoc-label':
      toast('Etiquetas de asociación disponibles: Principal, Facturación, Contacto técnico.');
      break;
    default:
      break;
  }
}

function openActivityTrash() {
  const rows = deletedActivitiesFor(type, id);
  openModal('Restaurar actividades eliminadas', '<p>Actividades eliminadas en los últimos 90 días.</p>' + (rows.length ? `<table class="mini-table"><tbody>${rows.map((a) => `<tr><td>${esc(KIND_TITLE[a.type])}</td><td>${esc(a.text)}</td><td><button class="btn btn--ghost" data-confirm="activity-restore" data-id="${esc(a.id)}">Restaurar</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No hay actividades eliminadas.</p>'));
}

$('rec-modal').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-confirm]');
  if (!b) return;
  const what = b.dataset.confirm;
  if (what === 'activity-delete' || what === 'activity-restore') {
    b.disabled = true;
    try {
      await (what === 'activity-delete' ? deleteActivity(b.dataset.id) : restoreActivity(b.dataset.id));
      renderTimeline();
      if (what === 'activity-restore') openActivityTrash(); else closeModal();
    } catch (error) { toast(error.message); b.disabled = false; }
  } else if (what === 'unsubscribe') {
    await save('marketingOptOut', rec.marketingOptOut === 'Sí' ? 'No' : 'Sí');
    closeModal();
    toast(rec.marketingOptOut === 'Sí' ? 'Baja de marketing guardada' : 'Suscripción de marketing reactivada');
  } else if (what === 'merge') {
    // never a bare delete: mergeRecords fills the gaps, moves associations, timeline and enrolments, trashes the duplicate
    if (!mergeState) { toast('Elige primero el registro que quieres fusionar'); return; }
    const checked = $('rec-modal-body').querySelector('input[name="merge-keep"]:checked');
    const keepId = Number((checked && checked.value) || mergeState.keepId);
    const keep = keepId === Number(rec.id) ? rec : mergeState.other;
    const other = keep === rec ? mergeState.other : rec;
    const choices = {};
    mergeState.conflicts.forEach((c) => {
      const picked = $('rec-modal-body').querySelector(`tr[data-merge-key="${c.key}"] input:checked`);
      if (picked && Number(picked.value) !== keepId) choices[c.key] = Number(picked.value) === Number(rec.id) ? c.keep : c.other;
    });
    const result = mergeRecords(type, keepId, [other.id], { choices });
    if (!result) { toast('No se pudo fusionar'); return; }
    const done = result.filled.length + result.chosen.length;
    closeModal();
    mergeState = null;
    toast(`1 registro fusionado en «${result.kept.name}»${done ? ` · ${done} ${done === 1 ? 'propiedad completada' : 'propiedades completadas'}` : ''}`);
    if (Number(result.kept.id) !== Number(rec.id)) { location.href = `./?id=${result.kept.id}`; return; }
    Object.assign(rec, findRecord(type, rec.id) || {});
    renderAll();
  } else if (what === 'reschedule-send') {
    const v = $('resched-at') && $('resched-at').value;
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) { toast('Elige una fecha y hora válidas'); return; }
    try {
      const item = await rescheduleEmail(b.dataset.id, d.toISOString());
      if (!item) { toast('Ese correo ya no está programado'); closeModal(); renderTimeline(); return; }
      closeModal();
      toast(`Envío reprogramado para el ${scheduledWhen(item.sendAt)}`);
      renderTimeline();
    } catch (e) { toast(e.message || String(e)); }
  } else if (what === 'delete') {
    deleteRecords(type, [rec.id]);
    location.href = cfg.listHref;
  } else if (what === 'card-save') {
    cardDraft.title = $('card-title').value.trim() || 'Acerca de este objeto';
    const global = Boolean($('card-global') && $('card-global').checked);
    const card = { title: cardDraft.title, keys: cardDraft.keys };
    saveJson(CARD_KEY, card);
    const remote = setSetting(CARD_KEY, card, { scope: global ? 'global' : 'user' });
    closeModal();
    renderProps();
    toast(remote ? (global ? 'Tarjeta actualizada para toda la cuenta' : 'Tarjeta actualizada (solo para ti)') : 'Tarjeta actualizada');
  } else if (what === 'card-reset') {
    localStorage.removeItem(CARD_KEY);
    setSetting(CARD_KEY, null, { scope: settingScope(CARD_KEY) === 'global' ? 'global' : 'user' });
    closeModal();
    renderProps();
    toast('Tarjeta restablecida');
  } else if (what === 'doc') {
    const kind = b.dataset.kind;
    const labels = { invoice: ['Factura', 'INV'], quote: ['Cotización', 'COT'], paylink: ['Enlace de pago', 'PAY'], contract: ['Contrato', 'CTR'] };
    const [label, prefix] = labels[kind];
    const num = nextNumber(prefix);
    const amount = Number($('doc-amount').value) || 0;
    addEvent({ type: 'stage', when: Date.now(), who: 'Tú', text: `${label} ${num} creada por ${formatMoney(amount)}: ${$('doc-desc').value.trim()}. Vence el ${formatDate($('doc-due').value)}.` });
    closeModal();
    toast(`${label} ${num} creada`);
  } else if (what === 'sendsms') {
    const to = $('sms-to').value.trim();
    const body = $('sms-body').value.trim();
    if (!to) { toast('Escribe el número de destino.'); return; }
    if (!body) { toast('Escribe el mensaje.'); return; }
    b.disabled = true;
    b.textContent = 'Enviando…';
    try {
      await sendSms({ to, body, contactId: type === 'contacts' ? rec.id : (rec.contactId || undefined) });
      addEvent({ type: 'message', when: Date.now(), who: 'Tú', text: `SMS enviado a ${to}: ${body}` });
      closeModal();
      toast(`SMS enviado a ${to}`);
      renderTimeline();
    } catch (err) {
      b.disabled = false;
      b.textContent = 'Enviar SMS';
      toast(`No se pudo enviar: ${(err && err.message) || 'error de Twilio'}`);
    }
  } else if (what === 'logact') {
    const kind = b.dataset.kind;
    const schedule = b.dataset.schedule === '1';
    const channel = b.dataset.channel || '';
    const name = cfg.title(rec);
    const { when, text, extra } = readLogActivity($, kind, name, schedule, channel);
    if (editingActivity) {
      b.disabled = true;
      try {
        const wasPinned = pinnedEvent(allEvents());
        await updateActivity(editingActivity.id, { when, text, extra });
        if (wasPinned && evKey(wasPinned) === evKey(editingActivity)) localStorage.setItem(pinnedStorageKey, evKey({ ...editingActivity, when }));
        // Attendees added while editing a meeting get their copy too (the ones it already had keep theirs).
        if (kind === 'meeting' && !editingActivity.extra?.associatedFrom) {
          const had = new Set(((editingActivity.extra && editingActivity.extra.attendees) || []).map((a) => Number(a.id)));
          const added = attendeeTargets(extra).filter((t) => !had.has(Number(t.id)) && !(type === 'contacts' && Number(t.id) === Number(id)));
          if (added.length) saveAssociatedActivity({ type: kind, when, who: 'Tú', text, extra }, { type, id, name }, added, (ev) => { if (!(ev.recordType === type && Number(ev.recordId) === Number(id))) addActivity(ev); });
        }
        renderTimeline();
      }
      catch (error) { toast(error.message); b.disabled = false; return; }
    } else {
      if (b.disabled) return;
      b.disabled = true;
      // A meeting is logged on every attendee's timeline as well (saveAssociatedActivity skips duplicates).
      const targets = [...selectedActivityAssociations($('rec-modal')), ...attendeeTargets(extra)];
      saveAssociatedActivity({ type: kind, when, who: 'Tú', text, extra }, { type, id, name }, targets, addActivity);
      renderTimeline();
    }
    let followupTask;
    if ($('log-followup')?.checked && $('log-followup-date').value) {
      const contact = type === 'contacts' ? rec : byId(allContacts(), rec.contactId);
      const task = addRecord('tasks', {
        name: `Seguimiento de la ${kind === 'call' ? 'llamada' : 'correo'} con ${name}`,
        type: kind === 'call' ? 'Llamada' : 'Correo',
        status: 'todo',
        priority: 'medium',
        owner: rec.owner && rec.owner !== 'Sin asignar' ? rec.owner : 'Fernando L.',
        contactId: contact ? contact.id : '',
        contact: contact ? contact.name : '',
        due: new Date(`${$('log-followup-date').value}T09:00`).toISOString(),
        lastActivity: TODAY.toISOString(),
      });
      followupTask = task;
      addEvent({ type: 'task', when: Date.now(), who: 'Tú', text: `Tarea de seguimiento creada: "${task.name}", vence el ${formatDate(task.due)}.` });
      renderAssoc();
    }
    closeModal();
    toast(editingActivity ? 'Actividad actualizada' : schedule ? 'Reunión programada' : 'Actividad registrada', followupTask ? recordToastAction('tasks', followupTask.id) : {});
    editingActivity = null;
  } else if (what === 'workflow') {
    b.disabled = true;
    b.textContent = 'Inscribiendo…';
    const r = await enrollInWorkflow($('wf-name').value, type, rec);
    closeModal();
    if (!r || !r.ok) { toast(r && r.reason ? r.reason : 'No se pudo inscribir el registro en el workflow.'); return; }
    renderTimeline();
    renderAssoc();
    const done = r.steps.filter((s) => !s.pending).length;
    const waiting = r.run.estado === 'waiting' ? ` · continúa el ${workflowWhenText(r.run.proximaEjecucion)}` : '';
    toast(`Inscrito en «${r.workflow.name}» · ${done} ${done === 1 ? 'acción ejecutada' : 'acciones ejecutadas'}${waiting}`);
  } else if (what === 'reorder') {
    saveJson(QUICK_ORDER_KEY, [...$('quick-order').querySelectorAll('.col-item')].map((li) => li.dataset.key));
    closeModal();
    renderQuick();
    toast('Botones reordenados');
  } else if (what === 'reorder-reset') {
    localStorage.removeItem(QUICK_ORDER_KEY);
    closeModal();
    renderQuick();
    toast('Orden restablecido');
  } else if (what === 'ask') {
    const q = $('ask-q').value.trim();
    const last = allEvents()[0];
    $('ask-a').innerHTML = q
      ? `<p><strong>Respuesta:</strong> La actividad más reciente de ${esc(cfg.title(rec))} fue el ${formatDate(new Date(last.when))}: ${esc(last.text)}</p><div class="ai-box__foot"><span class="src">${ACT_ICONS.link} 1 Fuente</span></div>`
      : '<p class="muted">Escribe una pregunta.</p>';
  }
});

// ---------- wiring ----------
if (!rec) {
  $('rec-name').firstChild.textContent = 'Registro no encontrado ';
  $('rec-sub').textContent = 'Vuelve a la lista para elegir otro.';
  $('back').href = cfg.listHref;
} else {
  $('back').href = cfg.listHref;
  $('desc-form').querySelector('textarea').value = rec.description || '';
  renderAll();

  // Deep links from the list preview: #note, #email, #call, #task, #meeting, #more, #advanced
  const hash = location.hash.replace('#', '');
  if (hash === 'advanced') document.querySelector('[data-tab="advanced"]').click();
  else if (['note', 'email', 'call', 'task', 'meeting'].includes(hash)) {
    setTimeout(() => document.querySelector(`.record__quick [data-action="${hash}"]`)?.click(), 0);
  } else if (hash === 'more') {
    setTimeout(() => document.querySelector('.record__quick .quick__more > button')?.click(), 0);
  }

  // "Más" menu: search, submenus and actions
  mount.addEventListener('input', (e) => {
    if (e.target.id !== 'more-search') return;
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#more-list .more-item').forEach((it) => {
      const hit = !q || it.dataset.name.includes(q) || [...it.querySelectorAll('.more-sub button')].some((b) => b.textContent.toLowerCase().includes(q));
      it.hidden = !hit;
      if (hit) shown += 1;
    });
    $('more-empty').hidden = shown > 0;
  });
  $('rec-modal').addEventListener('input', (e) => {
    if (e.target.id === 'card-search' && cardDraft) {
      cardDraft.q = e.target.value;
      cardDraft.title = $('card-title').value;
      renderCardEditor();
    }
  });
  $('rec-modal').addEventListener('change', (e) => {
    if (e.target.id === 'log-followup') {
      const row = $('log-followup-row');
      if (row) row.hidden = !e.target.checked;
    }
  });
  $('rec-modal').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-cardkey]');
    if (!cb || !cardDraft) return;
    const k = cb.dataset.cardkey;
    cardDraft.title = $('card-title').value;
    if (cb.checked && !cardDraft.keys.includes(k)) cardDraft.keys.push(k);
    if (!cb.checked) {
      if (cardDraft.keys.length === 1) { toast('Debe quedar al menos una propiedad'); cb.checked = true; return; }
      cardDraft.keys = cardDraft.keys.filter((x) => x !== k);
    }
    renderCardEditor();
  });
  $('rec-modal').addEventListener('click', (e) => {
    const cm = e.target.closest('[data-cardmove], [data-cardremove]');
    if (cm && cardDraft) {
      const li = cm.closest('.colsel');
      const i = cardDraft.keys.indexOf(li.dataset.key);
      cardDraft.title = $('card-title').value;
      if (cm.dataset.cardmove !== undefined) {
        const j = i + Number(cm.dataset.cardmove);
        if (j < 0 || j >= cardDraft.keys.length) return;
        [cardDraft.keys[i], cardDraft.keys[j]] = [cardDraft.keys[j], cardDraft.keys[i]];
      } else if (cardDraft.keys.length > 1) {
        cardDraft.keys.splice(i, 1);
      }
      renderCardEditor();
      return;
    }
    const mv = e.target.closest('#quick-order [data-move]');
    if (!mv) return;
    const li = mv.closest('.col-item');
    const sib = Number(mv.dataset.move) < 0 ? li.previousElementSibling : li.nextElementSibling;
    if (!sib) return;
    if (Number(mv.dataset.move) < 0) sib.before(li);
    else sib.after(li);
  });
  mount.addEventListener('click', (e) => {
    if (e.target.closest('#more-search')) {
      e.stopPropagation();
      return;
    }
    const addAssoc = e.target.closest('[data-act="add-assoc"]');
    if (addAssoc) {
      e.preventDefault();
      closeMenus();
      lastAssocKind = addAssoc.dataset.kind;
      openAssocDrawer(addAssoc.dataset.kind);
      return;
    }
    const more = e.target.closest('[data-more]');
    if (more) {
      const item = more.closest('.more-item');
      if (item && item.classList.contains('has-sub') && !more.dataset.sub) {
        e.stopPropagation();
        document.querySelectorAll('#more-list .more-item.is-open').forEach((x) => { if (x !== item) x.classList.remove('is-open'); });
        item.classList.toggle('is-open');
        return;
      }
      closeMenus();
      runMore(more.dataset.more, more.dataset.sub);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act) {
      e.preventDefault();
      closeMenus();
      runAction(act.dataset.act, act.dataset);
      return;
    }
    const tog = e.target.closest('[data-toggle]');
    if (tog) {
      const card = tog.closest('.card');
      card.classList.toggle('is-collapsed');
      return;
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      navigator.clipboard?.writeText(cp.dataset.copy);
      toast('Copiado');
      return;
    }
    const pp = e.target.closest('[data-parent-pick]');
    if (pp) { if (!pp.disabled) setParentCompany(pp.dataset.parentPick); return; }
    if (e.target.closest('[data-parent-clear]')) { setParentCompany(''); return; }
    const btn = e.target.closest('[data-edit-key]');
    if (btn) {
      // Inline editing (card or "Todas las propiedades"): the value becomes an input / dropdown / date picker
      // for its type; Enter or clicking elsewhere saves, Escape cancels. One row at a time.
      const key = btn.dataset.editKey;
      if (systemProp(key)) return;
      const f = currentFields().find((x) => x[0] === key) || fieldFor(key);
      if (!f) return;
      const inPanel = Boolean(btn.closest('#allprops-panel'));
      // Another field still open keeps its change (saved if it changed), then the rows are re-drawn.
      mount.querySelectorAll('.props__form').forEach((open) => commitEdit(open));
      const row = mount.querySelector(`${inPanel ? '#allprops-panel' : '#rec-props'} .props__row[data-key="${key}"]`) || btn.closest('.props__row');
      if (!row) return;
      row.querySelector('dd').innerHTML = `<form class="props__form" data-key="${esc(key)}" data-original="${esc(JSON.stringify(rec[key] ?? ''))}">${editor(f, rec)}<span class="props__btns"><button class="btn btn--primary btn--sm" type="submit">Guardar</button><button class="btn btn--ghost btn--sm" type="button" data-cancel>Cancelar</button></span></form>`;
      enhanceOwnerSelects(row);
      enhancePhoneInputs(row);
      const input = row.querySelector('[data-edit]');
      if (!focusPhoneInput(row)) (row.querySelector('.osel__btn') || input).focus();
      if (input.select && input.type === 'text') input.select();
      return;
    }
    if (e.target.closest('[data-cancel]')) {
      cancelEdit(e.target.closest('.props__form'));
      return;
    }
    const st = e.target.closest('[data-stage], [data-status]');
    if (st && st.closest('#rec-stages')) {
      if (st.dataset.stage) save('stage', st.dataset.stage, 'Etapa del negocio');
      else save('status', st.dataset.status, 'Estado');
      return;
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      activeTabId = tab.dataset.tab;
      document.querySelectorAll('.rtabs__tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      mount.querySelectorAll('.tabpane').forEach((p) => { p.hidden = p.id !== `pane-${activeTabId}`; });
      return;
    }
    const fill = e.target.closest('[data-fill]');
    if (fill) {
      const row = mount.querySelector(`.props__row[data-key="${fill.dataset.fill}"] [data-edit-key]`);
      if (row) { row.click(); row.closest('.props__row').scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    const frm = e.target.closest('[data-file-rm]');
    if (frm) {
      const files = loadFiles();
      files.splice(Number(frm.dataset.fileRm), 1);
      saveJson(FILES_KEY, files);
      renderRight();
      toast('Archivo quitado');
      return;
    }
    const guide = e.target.closest('[data-guide]');
    if (guide) {
      toast(`Guía "${guide.dataset.guide}": 1) Prepara el contexto · 2) Haz las preguntas clave · 3) Registra el resultado.`);
      return;
    }
    const evHead = e.target.closest('.timeline__head');
    if (evHead) {
      const li = evHead.closest('.timeline__item');
      const key = li.dataset.ev;
      if (openEvents.has(key)) openEvents.delete(key); else openEvents.add(key);
      li.classList.toggle('is-open', openEvents.has(key));
      evHead.setAttribute('aria-expanded', String(openEvents.has(key)));
      return;
    }
    const kind = e.target.closest('#act-filters [data-kind]');
    if (kind) {
      actKind = kind.dataset.kind;
      document.querySelectorAll('#act-filters .chip').forEach((c) => c.classList.toggle('is-set', c === kind));
      renderTimeline();
      return;
    }
    if (e.target.closest('[data-actclear]')) {
      actKind = ''; actDate = ''; actWho = ''; actQuery = '';
      document.querySelectorAll('#act-filters .chip').forEach((c) => c.classList.toggle('is-set', c.dataset.kind === ''));
      if ($('act-date')) $('act-date').value = '';
      if ($('act-who')) $('act-who').value = '';
      if ($('act-search')) $('act-search').value = '';
      renderTimeline();
      return;
    }
    const quick = e.target.closest('[data-action]');
    if (quick) {
      const a = quick.dataset.action;
      if (a === 'note') {
        document.querySelector('[data-tab="activity"]').click();
        document.querySelector('#note-form textarea').focus();
      } else if (a === 'task') {
        addEvent({ type: 'task', when: Date.now(), who: 'Tú', text: `Tarea creada: seguimiento con ${cfg.title(rec)} para ${formatDate(new Date(TODAY.getTime() + 3 * 86400000))}.` });
        const task = addRecord('tasks', { name: `Seguimiento con ${cfg.title(rec)}`, type: 'Tarea', status: 'todo', priority: 'medium', owner: rec.owner, due: new Date(TODAY.getTime() + 3 * 86400000).toISOString(), contactId: type === 'contacts' ? rec.id : rec.contactId || '', companyId: type === 'companies' ? rec.id : rec.companyId || '' });
        renderAssoc();
        toast('Tarea creada', recordToastAction('tasks', task.id));
      } else if (a === 'call') {
        // El menú de llamada del original: números del registro, agregar número, «Llamada desde»,
        // dispositivo y opciones. Sin Twilio ofrece el registro manual.
        openCallMenu({
          anchor: quick,
          rec,
          recordType: type,
          onCalled: () => renderTimeline(),
          onAddPhone: (v) => { setField(type, rec.id, rec.phone ? 'mobilephone' : 'phone', v); toast('Número agregado'); renderProps(); },
          onManualLog: () => openLogModal('call'),
        });
      } else if (a === 'email') {
        openCompose({
          to: cfg.title(rec),
          firstName: rec.first || cfg.title(rec).split(' ')[0],
          email: rec.email || (type === 'companies' ? `info@${rec.domain || 'ejemplo.es'}` : ''),
          company: type === 'companies' ? rec.name : rec.company || '',
          contactId: type === 'contacts' ? rec.id : rec.contactId || '',
          recordType: type,
          recordId: rec.id,
          assoc: [
            { label: cfg.title(rec), kind: cfg.singular, on: true },
            ...cfg.assoc(rec).flatMap(([t, rows, kind]) => rows.slice(0, 3).map((r) => ({ label: r.name, kind: t.toLowerCase().replace(/s$/, ''), on: true }))),
          ],
          onSent: (ev) => addEvent(ev),
        });
      } else if (a === 'signature') {
        editSignature();
      } else if (a === 'meeting') {
        openLogModal('meeting', { schedule: true });
      }
    }
  });

  // "#atajo" in the note box inserts a snippet with this record's data in place of its tokens.
  // "#atajo" inserts a snippet; "@usuario" mentions a colleague (notified when the note is saved).
  const wireNoteBox = (ta) => { attachSnippetAutocomplete(ta, { context: () => contextFromRecord(type, rec) }); attachMentionAutocomplete(ta); };
  mount.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('#note-form textarea')) wireNoteBox(e.target); });
  const noteBox = mount.querySelector('#note-form textarea');
  if (noteBox) wireNoteBox(noteBox);
  // An enrolment made from the e-mail composer's Secuencias tab also lands in this timeline; an enrolment
  // ended by an exclusion criterion (reply, new deal, unsubscribe) updates the Secuencias card too.
  document.addEventListener('crm:enrolled', () => { renderRight(); renderTimeline(); });
  // A scheduled e-mail of this record going out (or cancelled / moved) refreshes its entry.
  document.addEventListener('crm:scheduled-email', (e) => { if (e.detail && e.detail.recordType === type && String(e.detail.recordId) === String(id)) renderTimeline(); });
  // A workflow run advancing on this record (the checker finished a delay, a step ran) refreshes the timeline.
  document.addEventListener('crm:workflow', (e) => { if (e.detail && e.detail.recordType === type && Number(e.detail.recordId) === Number(id)) { renderTimeline(); renderAssoc(); } });

  mount.addEventListener('submit', (e) => {
    const form = e.target.closest('.props__form');
    if (form) {
      e.preventDefault();
      commitEdit(form);
      return;
    }
    if (e.target.id === 'note-form') {
      e.preventDefault();
      const ta = e.target.querySelector('textarea');
      // Any {{objeto.propiedad}} left in the note becomes this record's data.
      const text = renderTokens(ta.value.trim(), contextFromRecord(type, rec));
      if (!text) return;
      saveAssociatedActivity({ type: 'note', when: Date.now(), who: 'Tú', text },
        { type, id, name: cfg.title(rec) }, selectedActivityAssociations(e.target), addActivity);
      // «@usuario» in the note → a bell notification for each colleague named, linking to this record
      const mentioned = notifyMentions({ names: mentionsIn(text).map((u) => u.name), type, id, recordName: cfg.title(rec), excerpt: text, href: recordHref(type, id) });
      renderTimeline();
      ta.value = '';
      toast(mentioned.length ? `Nota guardada · ${mentioned.length === 1 ? `${mentioned[0].to} recibirá una notificación` : `${mentioned.length} personas recibirán una notificación`}` : 'Nota guardada');
      return;
    }
    if (e.target.id === 'desc-form') {
      e.preventDefault();
      save('description', e.target.querySelector('textarea').value.trim(), 'Descripción');
    }
  });

  // Escape cancels the inline edit (and, with nothing being edited, closes "Todas las propiedades");
  // Ctrl/Cmd+Enter saves a multi-line field.
  mount.addEventListener('keydown', (e) => {
    const form = e.target.closest('.props__form');
    if (!form) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit(form); }
    else if (e.key === 'Enter' && e.target.tagName === 'TEXTAREA' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEdit(form); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && allPropsOpen() && !mount.querySelector('.props__form')) closeAllProps(); });
  // Clicking (or tabbing) outside the field saves it, as in the original.
  mount.addEventListener('focusout', (e) => {
    const form = e.target.closest('.props__form');
    if (!form) return;
    if (e.relatedTarget && form.contains(e.relatedTarget)) return;
    setTimeout(() => {
      if (!form.isConnected) return;
      if (document.activeElement && form.contains(document.activeElement)) return;
      commitEdit(form);
    }, 0);
  });

  mount.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-lead]');
    if (sel) save(sel.dataset.lead, sel.value, sel.dataset.lead === 'lead_stage' ? 'Etapa del lead' : 'Tipo de lead');
    if (e.target.id === 'act-date' || e.target.id === 'act-who') {
      if (e.target.id === 'act-date') actDate = e.target.value; else actWho = e.target.value;
      renderTimeline();
      return;
    }
    // The stage of an associated deal is a dropdown on its card (saved straight away).
    const stageSel = e.target.closest('[data-deal-stage]');
    if (stageSel) {
      const dealId = stageSel.dataset.dealStage;
      const label = (stageSel.options[stageSel.selectedIndex] || {}).textContent || stageSel.value;
      const nextStage = stageSel.value;
      if (!await changeDealStage(findRecord('deals', dealId), nextStage)) { renderRight(); return; }
      renderTimeline(); // data.js logs the stage change here and on the deal (system entries)
      toast(`Etapa actualizada: ${label}`);
      renderRight();
      return;
    }
    // Completing (or reopening) an associated task from its card.
    const cb = e.target.closest('[data-task-done]');
    if (cb) {
      const t = findRecord('tasks', cb.dataset.taskDone) || { name: 'Tarea' };
      const done = cb.checked;
      cb.checked = !done;
      cb.disabled = true;
      const result = completeTaskWithLog(cb.dataset.taskDone, done);
      const saved = result instanceof Promise ? await result : result;
      cb.disabled = false;
      if (!saved) return;
      addEvent({ type: 'task', when: Date.now(), who: 'Tú', text: done ? `Tarea completada: "${t.name}".` : `Tarea reabierta: "${t.name}".` });
      toast(done ? 'Tarea completada' : 'Tarea reabierta');
      renderRight();
      renderAi();
      if (queueBar) queueBar.refresh();
      return;
    }
    if (e.target.id === 'file-add') {
      const files = loadFiles();
      [...e.target.files].forEach((f) => files.unshift({ name: f.name, size: f.size, when: formatDate(new Date()) }));
      saveJson(FILES_KEY, files);
      addEvent({ type: 'note', when: Date.now(), who: 'Tú', text: `${e.target.files.length} archivo(s) adjuntado(s).` });
      renderRight();
      toast('Archivo adjuntado');
    }
  });
  mount.addEventListener('input', (e) => {
    if (e.target.id === 'act-search') {
      actQuery = e.target.value;
      renderTimeline();
    } else if (e.target.id === 'adv-search') {
      renderAllProps(e.target.value);
    } else if (e.target.id === 'allprops-q') {
      renderAllPropsPanel();
    } else if (e.target.id === 'parent-q') {
      parentQuery = e.target.value;
      const card = e.target.closest('[data-card="parent"]');
      if (card) {
        card.outerHTML = parentCompanyCard((CATALOG.parent || { label: 'Empresa matriz' }).label);
        const inp = $('parent-q');
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  });
}

// Association card tools (search / filters / sort) and the card editor drawer
if (rec) {
  mount.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-act="acard-edit"]');
    if (edit) {
      e.preventDefault();
      closeMenus();
      openAcardEditor(edit.dataset.kind);
      return;
    }
    const t = e.target.closest('[data-acard]');
    if (!t) return;
    const ui = acardUi[t.dataset.kind];
    if (!ui) return;
    if (t.dataset.acard === 'search') { ui.showSearch = !ui.showSearch; if (!ui.showSearch) ui.q = ''; renderAssoc(); if (ui.showSearch) mount.querySelector(`[data-acard="q"][data-kind="${t.dataset.kind}"]`)?.focus(); }
    else if (t.dataset.acard === 'filter') { ui.filter = t.dataset.value; closeMenus(); renderAssoc(); }
    else if (t.dataset.acard === 'sort') {
      if (ui.sortKey === t.dataset.value) ui.sortDir = -(ui.sortDir || acardSettings(t.dataset.kind).sortDir);
      else { ui.sortKey = t.dataset.value; ui.sortDir = 1; }
      closeMenus();
      renderAssoc();
    }
  });
  mount.addEventListener('input', (e) => {
    const q = e.target.closest('[data-acard="q"]');
    if (!q) return;
    const ui = acardUi[q.dataset.kind];
    ui.q = q.value;
    const pos = q.selectionStart;
    renderAssoc();
    const again = mount.querySelector(`[data-acard="q"][data-kind="${q.dataset.kind}"]`);
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });

  const el = $('card-drawer');
  el.addEventListener('click', (e) => {
    if (e.target === el) { closeAcardEditor(); return; }
    const b = e.target.closest('[data-cd]');
    if (b && b.tagName !== 'INPUT') {
      const a = b.dataset.cd;
      closeMenus();
      if (a === 'close') closeAcardEditor();
      else if (a === 'save') {
        cd.title = $('cd-name').value.trim() || KIND_META[cd.kind].p;
        saveJson(ACARD_KEY(cd.kind), { title: cd.title, props: cd.props, quick: cd.quick, sortKey: cd.sortKey, sortDir: cd.sortDir });
        closeAcardEditor();
        renderAssoc();
        toast('Tarjeta guardada');
      } else if (a === 'reset') { localStorage.removeItem(ACARD_KEY(cd.kind)); const kind = cd.kind; closeAcardEditor(); renderAssoc(); toast('Tarjeta restablecida'); openAcardEditor(kind); }
      else if (a === 'remove') toast('Las tarjetas predeterminadas no se pueden eliminar; puedes ocultarla desde "Personalizar".');
      else if (a === 'filters') toast('Los filtros de la tarjeta se gestionan por etiqueta de asociación en esta versión.');
      else if (a === 'rename-internal') toast('El nombre interno solo se usa en la configuración.');
      return;
    }
    const rm = e.target.closest('[data-cdremove]');
    if (rm && !rm.disabled) { cd.title = $('cd-name').value; cd.props.splice(Number(rm.dataset.cdremove), 1); renderAcardEditor(); return; }
    const so = e.target.closest('[data-cdsort]');
    if (so) { cd.sortKey = so.dataset.cdsort; closeMenus(); renderAcardEditor(); return; }
    const dir = e.target.closest('[data-cddir]');
    if (dir) { cd.sortDir = Number(dir.dataset.cddir); renderAcardEditor(); }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-cd="quick"]')) { cd.quick = e.target.checked; cd.title = $('cd-name').value; renderAcardEditor(); return; }
    const add = e.target.closest('[data-cdadd]');
    if (add) {
      cd.title = $('cd-name').value;
      const k = add.dataset.cdadd;
      if (add.checked && !cd.props.includes(k) && cd.props.length < ACARD_MAX) cd.props.push(k);
      if (!add.checked && k !== cd.props[0]) cd.props = cd.props.filter((x) => x !== k);
      renderAcardEditor();
      el.querySelector('.cd-addmenu')?.classList.add('is-open');
      return;
    }
    const sw = e.target.closest('[data-cdswap]');
    if (sw) { cd.title = $('cd-name').value; cd.props[Number(sw.dataset.cdswap)] = sw.value; renderAcardEditor(); return; }
    if (e.target.id === 'cd-sample') {
      cd.previewId = Number(e.target.value);
      const sampleRec = findRecord(type, cd.previewId);
      const saved = rec;
      rec = sampleRec || rec;
      const found = assocRows().find((x) => x[2] === cd.kind);
      rec = saved;
      cd.sampleRows = found ? found[1] : [];
      cd.title = $('cd-name').value;
      renderAcardEditor();
    }
  });
  el.addEventListener('input', (e) => {
    if (e.target.id === 'cd-name') {
      cd.title = e.target.value;
      el.querySelector('.cd-previewcard .card__toggle').textContent = `${cd.title} (${cd.sampleRows.length})`;
    }
    if (e.target.id === 'cd-addsearch') {
      const q = e.target.value.trim().toLowerCase();
      el.querySelectorAll('.cd-addopt').forEach((o) => { o.hidden = Boolean(q) && !o.dataset.name.includes(q); });
      e.stopPropagation();
    }
  });
  el.addEventListener('click', (e) => { if (e.target.closest('#cd-addsearch')) e.stopPropagation(); });
  // drag to reorder property rows
  let dragKey = null;
  el.addEventListener('dragstart', (e) => { const li = e.target.closest('.cd-prop'); if (li) dragKey = li.dataset.key; });
  el.addEventListener('dragover', (e) => { if (dragKey && e.target.closest('.cd-prop')) e.preventDefault(); });
  el.addEventListener('drop', (e) => {
    const li = e.target.closest('.cd-prop');
    if (!li || !dragKey || li.dataset.key === dragKey) return;
    const from = cd.props.indexOf(dragKey);
    let to = cd.props.indexOf(li.dataset.key);
    if (from === 0 || to === 0) { dragKey = null; return; }
    cd.props.splice(from, 1);
    cd.props.splice(to, 0, dragKey);
    dragKey = null;
    cd.title = $('cd-name').value;
    renderAcardEditor();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cd) closeAcardEditor(); });
}

// Association drawer events
{
  const el = $('assoc-drawer');
  el.addEventListener('click', (e) => {
    if (e.target === el) { closeAssocDrawer(); return; }
    const b = e.target.closest('[data-ad]');
    if (b) {
      closeMenus();
      const a = b.dataset.ad;
      if (a === 'close') closeAssocDrawer();
      else if (a === 'next') { ad.step = 2; renderAssocDrawer(); }
      else if (a === 'back') { ad.step = 1; renderAssocDrawer(); }
      else if (a === 'save') { const ids = [...ad.selected]; const labels = { ...ad.labels }; closeAssocDrawer(); ad = { kind: lastAssocKind }; saveAssociations(ids, labels); ad = null; }
      return;
    }
    const tab = e.target.closest('[data-adtab]');
    if (tab) { ad.tab = tab.dataset.adtab; renderAssocDrawer(); return; }
    const sort = e.target.closest('[data-adsort]');
    if (sort) { ad.sort = sort.dataset.adsort; ad.page = 1; closeMenus(); renderAssocDrawer(); return; }
    const size = e.target.closest('[data-adsize]');
    if (size) { ad.size = Number(size.dataset.adsize); ad.page = 1; closeMenus(); renderAssocDrawer(); return; }
    const pg = e.target.closest('[data-adpage]');
    if (pg && !pg.disabled) { ad.page = Number(pg.dataset.adpage); renderAssocDrawer(); }
  });
  el.addEventListener('change', (e) => {
    const pick = e.target.closest('[data-adpick]');
    if (pick) {
      const id2 = Number(pick.dataset.adpick);
      if (pick.checked) ad.selected.add(id2); else ad.selected.delete(id2);
      const next = el.querySelector('[data-ad="next"]');
      if (next) next.disabled = ad.selected.size === 0;
      return;
    }
    const lab = e.target.closest('[data-adlabel]');
    if (lab) ad.labels[lab.dataset.adlabel] = lab.value;
  });
  el.addEventListener('input', (e) => {
    if (e.target.id === 'ad-search') {
      ad.q = e.target.value;
      ad.page = 1;
      const pos = e.target.selectionStart;
      renderAssocDrawer();
      const inp = $('ad-search');
      inp.focus();
      inp.setSelectionRange(pos, pos);
    }
  });
  el.addEventListener('submit', (e) => {
    if (e.target.id !== 'ad-new-form') return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const kind = ad.kind;
    const label = data.label;
    delete data.label;
    if (kind === 'contacts') data.name = `${data.first || ''} ${data.last || ''}`.trim();
    if (kind === 'deals') { data.amount = Number(data.amount) || 0; data.pipeline = dealPipelines()[0]; data.stage = stagesFor(data.pipeline).find((stage) => !dealStageIsClosed(data.pipeline, stage[0]))?.[0]; if (!data.pipeline || !data.stage) { toast('No hay etapas abiertas en el pipeline de negocios.'); return; } data.closeDate = data.closeDate ? new Date(data.closeDate).toISOString() : new Date(TODAY.getTime() + 30 * 86400000).toISOString(); }
    if (kind === 'tickets') { data.pipeline = ticketPipelines()[0]; data.status = ticketStatusesFor(data.pipeline).find((status) => status[2] !== 'closed')?.[0]; if (!data.pipeline || !data.status) { toast('No hay estados abiertos en el pipeline de tickets.'); return; } data.priority = 'medium'; if (type === 'contacts') data.contactId = rec.id; }
    if (kind === 'tasks') { data.status = 'todo'; data.type = 'Tarea'; data.priority = 'medium'; data.due = data.due ? new Date(data.due).toISOString() : TODAY.toISOString(); }
    if (kind === 'companies') data.lifecycle = 'Lead';
    data.owner = rec.owner && rec.owner !== 'Sin asignar' ? rec.owner : 'Fernando L.';
    data.lastActivity = TODAY.toISOString();
    const made = addRecord(kind, data);
    closeAssocDrawer();
    ad = { kind };
    saveAssociations([made.id], { [made.id]: label });
    toast(`${KIND_META[kind].s} creado`, recordToastAction(kind, made.id));
    ad = null;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ad) closeAssocDrawer(); });
}

// Collapse / expand the right-hand column (remembered across record pages).
const SIDE_KEY = 'crm:record:side';
function applySide() {
  const collapsed = localStorage.getItem(SIDE_KEY) === 'collapsed';
  mount.querySelector('.record').classList.toggle('is-side-collapsed', collapsed);
  const btn = $('side-toggle');
  btn.setAttribute('aria-pressed', String(collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral');
  $('side-toggle-tip').textContent = collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral';
  btn.classList.toggle('is-collapsed', collapsed);
}
$('side-toggle').addEventListener('click', () => {
  const collapsed = localStorage.getItem(SIDE_KEY) === 'collapsed';
  localStorage.setItem(SIDE_KEY, collapsed ? 'open' : 'collapsed');
  applySide();
});
applySide();

// Task queue bar ("Iniciar N tareas" on the tasks list): shown while a queue is in progress.
if (rec) {
  queueBar = mountQueueBar({ container: $('task-queue'), root, onChange: () => { rec = findRecord(type, id) || rec; renderAll(); } });
}

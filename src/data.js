// Sample data for the app (placeholder people and companies, not real records).
// When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, records live in
// Supabase and all edits go to the database. Without them, edits, additions
// and deletions are kept in localStorage so the demo remembers them.
import { propertyList } from './properties.js';
import { supabase, DB_MODE, createAnonProbe } from './supabaseClient.js';
import { requireSession, signOut, siteRoot } from './auth.js';

const FIRST = ['Ana', 'Luis', 'Marta', 'Pedro', 'Lucía', 'Javier', 'Carmen', 'Diego', 'Elena', 'Raúl', 'Sara', 'Hugo', 'Paula', 'Álvaro', 'Nuria', 'Iván', 'Laura', 'Sergio', 'Irene', 'Mario', 'Clara', 'Andrés', 'Beatriz', 'Tomás', 'Rocío', 'Daniel', 'Eva', 'Jorge', 'Alicia', 'Pablo', 'Silvia', 'Rubén', 'María José', 'Juan Carlos', 'Guadalupe', 'Ximena', 'Rodrigo', 'Valentina', 'Mateo', 'Camila', 'Santiago', 'Renata', 'Emilio', 'Fernanda', 'Joaquín', 'Patricia', 'Óscar', 'Verónica', 'Ignacio', 'Lorena'];
const LAST = ['Torres', 'Martín', 'Gómez', 'Ruiz', 'Fernández', 'López', 'Díaz', 'Sánchez', 'Navarro', 'Moreno', 'Jiménez', 'Romero', 'Ortega', 'Castro', 'Serrano', 'Molina', 'Garrido', 'Pascual', 'Blanco', 'Herrera', 'Vidal', 'Peña', 'Cano', 'Ibáñez', 'Reyes', 'Prieto', 'Campos', 'Vargas', 'Lozano', 'Méndez', 'Gil', 'Santos', 'Zurita Rico', 'Cubas Vicencio', 'Hernández Zuviri', 'Zúñiga Verde', 'Garduño', 'De la Fuente', 'Ochoa', 'Salazar', 'Quintero', 'Villanueva', 'Esparza', 'Beltrán'];
const COMPANY_A = ['Cristales', 'Vidrios', 'Construcciones', 'Ventanas', 'Arquitectura', 'Reformas', 'Hogar', 'Obras', 'Interiores', 'Fachadas', 'Aluminios', 'Mamparas', 'Cerramientos', 'Grupo', 'Ingeniería', 'Diseño', 'Promociones', 'Carpintería'];
const COMPANY_B = ['Norte', 'del Sur', 'Alba', 'Prado', 'Vega', 'Delta', 'Luz', 'Mar', 'Sol', 'Río', 'Ibérica', 'Levante', 'Atlántico', 'Pacífico', 'Central', 'Monterrey', 'Bajío', 'Andina', 'Castilla', 'Valle', 'Sierra', 'Costa'];
const COMPANY_NAMES = Array.from({ length: 36 }, (_, i) => `${COMPANY_A[i % COMPANY_A.length]} ${COMPANY_B[(i * 5) % COMPANY_B.length]}${i % 9 === 8 ? ' S.A. de C.V.' : i % 7 === 6 ? ' S.L.' : ''}`);
const CITIES = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao', 'Málaga', 'Ciudad de México', 'Monterrey', 'Guadalajara', 'Miami', 'Bogotá', 'Lisboa'];
const INDUSTRIES = ['Construcción', 'Arquitectura', 'Reformas', 'Inmobiliaria', 'Decoración', 'Fabricación de vidrio'];
const COUNTS = { contacts: 420, companies: 36, deals: 150, tickets: 84, tasks: 64 };

export const OWNERS = ['Fernando L.', 'Sofía R.', 'Diego G.', 'Laura M.', 'Sin asignar'];
export const STATUSES = {
  new: ['Nuevo', 'tag--new'],
  open: ['Abierto', 'tag--open'],
  progress: ['En progreso', 'tag--progress'],
  done: ['Conectado', 'tag--done'],
  none: ['Sin estado', 'tag--none'],
};
export const LIFECYCLES = ['Suscriptor', 'Lead', 'Lead calificado por marketing', 'Lead calificado por ventas', 'Oportunidad', 'Cliente', 'Evangelista', 'Otro'];
// Lifecycle stages shared by contacts and companies, editable in Configuración › Objetos › Etapa del ciclo de vida.
export const LIFECYCLE_IDS = ['subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer', 'evangelist', 'other'];
export const LIFECYCLE_KEY = 'crm:lifecycle';
export function defaultLifecycleDef() {
  return { name: 'Etapa del ciclo de vida', lifecycle: true, desc: '', color: 'none', stages: LIFECYCLE_IDS.map((id, i) => [id, LIFECYCLES[i], '', true]), rules: {}, automation: {}, logic: {}, required: {}, sync: { onDeal: true, onWon: true, company: true } };
}
export function lifecycleDef() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIFECYCLE_KEY));
    if (saved && Array.isArray(saved.stages) && saved.stages.length) return { ...defaultLifecycleDef(), ...saved };
  } catch {
    /* ignore */
  }
  return defaultLifecycleDef();
}
export function saveLifecycleDef(def) {
  localStorage.setItem(LIFECYCLE_KEY, JSON.stringify(def));
}
export const lifecycleColorMode = () => lifecycleDef().color || 'none';
const LIFECYCLE_PALETTE = ['#7c98b6', '#2a62c9', '#0091ae', '#6a78d1', '#f2547d', '#00a38d', '#ff7a59', '#99acc2'];
// Lifecycle stage cell for lists: plain text, text with a colour dot, or a colour badge (Configuración › Etapa del ciclo de vida).
export function lifecycleTag(label) {
  if (!label) return '<span class="muted">--</span>';
  const i = Math.max(0, LIFECYCLES.indexOf(label));
  const color = LIFECYCLE_PALETTE[i % LIFECYCLE_PALETTE.length];
  const mode = lifecycleColorMode();
  const safe = String(label).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  if (mode === 'badge') return `<span class="tag lctag" style="background:${color};color:#fff;border-color:${color}">${safe}</span>`;
  if (mode === 'dot') return `<span class="stage stage--dot" style="--dot:${color}">${safe}</span>`;
  return safe;
}
// Renamed or added stages flow into the shared LIFECYCLES catalogue used by lists, boards and generated data.
(function applyLifecycleOverrides() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIFECYCLE_KEY));
    if (!saved || !Array.isArray(saved.stages)) return;
    LIFECYCLES.length = 0;
    saved.stages.forEach((s) => LIFECYCLES.push(s[1]));
  } catch {
    /* ignore */
  }
})();
// Realistic spread: mostly leads, some subscribers, opportunities and customers.
const LIFECYCLE_MIX = [1, 1, 0, 1, 4, 1, 5, 1, 1, 0, 1, 4, 1, 2, 1, 5, 1, 3, 1, 6, 0, 1, 1, 7];
const lifecycleFor = (i) => LIFECYCLES[LIFECYCLE_MIX[(i * 7) % LIFECYCLE_MIX.length]];
export const SOURCES = ['Búsqueda orgánica', 'Referencias', 'Redes sociales', 'Tráfico directo', 'Correo'];
// Real stages of the default pipeline (FUERZA DE VENTAS) with the close probability saved per stage:
// [key, label, probability %]. They are the account's stage catalogue; Configuración › Objetos edits them.
export const DEAL_STAGES = [
  ['oferta', 'OFERTA A+W', 10],
  ['cotizacion', 'Proyecto en Cotización', 30],
  ['ganado_cliente', 'Proyecto Ganado por el cliente', 40],
  ['evalua', 'Evalua', 80],
  ['won', 'Ganado', 100],
  ['lost', 'Perdido', 0],
  ['deleted', 'Eliminado', 0],
];
// Stages the other pipelines were created with (kept so their deals stay where they are).
export const LEGACY_STAGES = [
  ['appointment', 'Cita programada', 20],
  ['qualified', 'Calificado para comprar', 40],
  ['presentation', 'Presentación programada', 60],
  ['decision', 'Decisión pendiente', 80],
  ['contract', 'Contrato enviado', 90],
  ['won', 'Cerrado ganado', 100],
  ['lost', 'Cerrado perdido', 0],
];
// Where a FUERZA DE VENTAS deal that still carries a legacy key belongs (supabase/fuerza-ventas-stages.sql
// applies the same mapping to the database; the app also applies it when reading, so nothing gets lost).
export const LEGACY_TO_REAL = { appointment: 'oferta', qualified: 'cotizacion', presentation: 'ganado_cliente', decision: 'evalua', contract: 'evalua' };
export const CLOSED_STAGES = ['won', 'lost', 'deleted'];
export const isClosedStage = (key) => CLOSED_STAGES.includes(key);
export const isOpenDeal = (r) => !isClosedStage(r.stage);
export const TICKET_STATUSES = [
  ['new', 'Nuevo', 'tag--new'],
  ['waiting', 'En espera de contacto', 'tag--open'],
  ['progress', 'En espera de nosotros', 'tag--progress'],
  ['closed', 'Cerrado', 'tag--done'],
];
// Pipeline stage names/probabilities edited in Configuración › Objetos are applied on load.
export const PIPELINE_KEY = (type) => `crm:pipeline:${type}`;
export function applyPipelineOverrides() {
  try {
    const d = JSON.parse(localStorage.getItem(PIPELINE_KEY('deals'))) || {};
    DEAL_STAGES.forEach((s) => { if (d[s[0]]) { if (d[s[0]].label) s[1] = d[s[0]].label; if (d[s[0]].prob !== undefined) s[2] = Number(d[s[0]].prob); } });
    const t = JSON.parse(localStorage.getItem(PIPELINE_KEY('tickets'))) || {};
    TICKET_STATUSES.forEach((s) => { if (t[s[0]] && t[s[0]].label) s[1] = t[s[0]].label; });
  } catch {
    /* ignore */
  }
}
applyPipelineOverrides();
// Deal pipelines: the account's own list, editable in Configuración › Objetos › Negocios › Pipelines.
export const DEAL_PIPELINES_KEY = 'crm:pipelines:deals';
// Every pipeline has its own stages; all of them include the seven base stages so any deal fits.
const EXTRA_STAGES = {
  visit: ['visit', 'Visita técnica', 30],
  measure: ['measure', 'Medición en obra', 50],
  quote: ['quote', 'Cotización enviada', 55],
  negotiation: ['negotiation', 'Negociación', 70],
  production: ['production', 'En fabricación', 85],
  install: ['install', 'Instalación programada', 95],
};
const baseStages = () => DEAL_STAGES.map((s) => [...s]);
// The other pipelines keep the legacy base stages plus their own extras.
function withExtras(keys) {
  const stages = LEGACY_STAGES.map((s) => [...s]);
  const i = stages.findIndex((s) => s[0] === 'won');
  stages.splice(i, 0, ...keys.map((k) => [...EXTRA_STAGES[k]]));
  return stages;
}
export const DEFAULT_PIPELINE_NAME = 'FUERZA DE VENTAS';
export const DEFAULT_DEAL_PIPELINES = [
  { id: 102418, name: DEFAULT_PIPELINE_NAME, desc: '', labels: 2, stages: baseStages() },
  { id: 740211, name: 'SACA SUMINISTRO', desc: '', labels: 1, stages: withExtras(['quote', 'negotiation']) },
  { id: 203877, name: 'SACA Instalaciones', desc: '', labels: 0, stages: withExtras(['visit', 'measure', 'quote', 'production', 'install']) },
  { id: 121930, name: 'Proyectos Nacionales Desarrolladores', desc: '', labels: 0, stages: withExtras(['quote']) },
  { id: 740562, name: 'Ventas Extranjero', desc: '', labels: 2, stages: withExtras(['quote', 'negotiation']) },
  { id: 740988, name: 'JFC Cargo Destino', desc: '', labels: 0, stages: withExtras([]) },
  { id: 741320, name: 'Acristala obras', desc: '', labels: 0, stages: withExtras(['visit', 'measure']) },
  { id: 929114, name: 'Acristala Proyectos', desc: '', labels: 0, stages: withExtras([]) },
];
const clonePipe = (p) => ({ ...p, stages: p.stages.map((s) => [...s]) });
export function newPipelineDef(name, stages) {
  return { id: 100000 + (Math.abs(Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)) % 900000), name, desc: '', labels: 0, stages: (stages || DEAL_STAGES).map((s) => [...s]) };
}
// A pipeline definition saved before FUERZA DE VENTAS adopted its real stages is upgraded once: the stages
// become the real ones and the per-stage settings (rules, automations, logic) follow the key mapping.
const remapStageKeys = (obj) => (obj && typeof obj === 'object' ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [LEGACY_TO_REAL[k] || k, v])) : obj);
function upgradePipelineDef(p) {
  if (!p || p.name !== DEFAULT_PIPELINE_NAME || !Array.isArray(p.stages) || !p.stages.some((s) => LEGACY_TO_REAL[s[0]])) return p;
  const out = { ...p, stages: baseStages() };
  ['required', 'automation', 'logic'].forEach((k) => { if (p[k]) out[k] = remapStageKeys(p[k]); });
  return out;
}
export function dealPipelineDefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEAL_PIPELINES_KEY));
    if (Array.isArray(saved) && saved.length) {
      // Older saves kept only the names.
      if (typeof saved[0] === 'string') return saved.map((name) => clonePipe(DEFAULT_DEAL_PIPELINES.find((p) => p.name === name) || newPipelineDef(name)));
      const upgraded = saved.map(upgradePipelineDef);
      if (upgraded.some((p, i) => p !== saved[i])) localStorage.setItem(DEAL_PIPELINES_KEY, JSON.stringify(upgraded));
      return upgraded;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DEAL_PIPELINES.map(clonePipe);
}
// Every stage across the pipelines, the default pipeline's first (dropdowns that span all pipelines).
export function allDealStages() {
  const out = [];
  const seen = new Set();
  [...DEAL_STAGES, ...dealPipelineDefs().flatMap((p) => p.stages)].forEach((s) => { if (!seen.has(s[0])) { seen.add(s[0]); out.push([...s]); } });
  return out;
}
// A deal's stage definition, looked up in its own pipeline first (the same key may exist in several).
export function dealStageDef(pipeline, key) {
  return stagesFor(pipeline).find((s) => s[0] === key) || allDealStages().find((s) => s[0] === key) || null;
}
export const dealStageLabel = (pipeline, key) => (dealStageDef(pipeline, key) || [key, key || '—'])[1];
export const dealStageProb = (pipeline, key) => Number((dealStageDef(pipeline, key) || [0, 0, 0])[2]) || 0;
// A FUERZA DE VENTAS deal read with a legacy stage key lands on the real stage it maps to.
export function normalizeDealStage(r) {
  if ((r.pipeline || DEFAULT_PIPELINE_NAME) !== DEFAULT_PIPELINE_NAME || !LEGACY_TO_REAL[r.stage]) return r;
  return { ...r, stage: LEGACY_TO_REAL[r.stage] };
}
export function saveDealPipelineDefs(list) {
  localStorage.setItem(DEAL_PIPELINES_KEY, JSON.stringify(list));
}
export function dealPipelines() {
  return dealPipelineDefs().map((p) => p.name);
}
export function saveDealPipelines(names) {
  const defs = dealPipelineDefs();
  saveDealPipelineDefs(names.map((n) => defs.find((d) => d.name === n) || newPipelineDef(n)));
}
// Ticket pipelines (Configuración › Objetos › Tickets › Pipelines). Each pipeline owns its statuses — the
// original's "estados", [key, label, 'open' | 'closed'] — and the default support pipeline exists from the
// first run with the four statuses of especificacion-tickets-crm.md §2.
export const TICKET_PIPELINES_KEY = 'crm:pipelines:tickets';
export const DEFAULT_TICKET_STATUSES = [['new', 'Nuevo', 'open'], ['waiting', 'En espera de contacto', 'open'], ['progress', 'En espera de nosotros', 'open'], ['closed', 'Cerrado', 'closed']];
export const DEFAULT_TICKET_PIPELINES = ['Pipeline de soporte', 'Cotizaciones', 'Garantías', 'Instalaciones'];
const ticketPipeId = (name) => 200000 + (Math.abs(Array.from(String(name)).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11)) % 700000);
const ticketStage = (s) => [String(s[0]), String(s[1]), s[2] === 'closed' ? 'closed' : 'open'];
export function newTicketPipelineDef(name, stages) {
  return { id: ticketPipeId(name), name, desc: '', stages: (stages || DEFAULT_TICKET_STATUSES).map(ticketStage) };
}
const normalizeTicketDef = (p) => ({ ...p, id: p.id || ticketPipeId(p.name), desc: p.desc || '', stages: Array.isArray(p.stages) && p.stages.length ? p.stages.map(ticketStage) : DEFAULT_TICKET_STATUSES.map(ticketStage) });
export function ticketPipelineDefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(TICKET_PIPELINES_KEY));
    if (Array.isArray(saved) && saved.length) {
      if (typeof saved[0] === 'string') return saved.map((n) => newTicketPipelineDef(n)); // older saves kept only the names
      return saved.map(normalizeTicketDef);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_TICKET_PIPELINES.map((n) => newTicketPipelineDef(n));
}
export function saveTicketPipelineDefs(list) {
  localStorage.setItem(TICKET_PIPELINES_KEY, JSON.stringify(list.map(normalizeTicketDef)));
  if (typeof bump === 'function') bump();
}
export function ticketPipelines() {
  return ticketPipelineDefs().map((p) => p.name);
}
export function saveTicketPipelines(names) {
  const defs = ticketPipelineDefs();
  saveTicketPipelineDefs(names.map((n) => String(n).trim()).filter(Boolean).map((n) => defs.find((d) => d.name === n) || newTicketPipelineDef(n)));
}
export function ticketStatusesFor(pipelineName) {
  const d = ticketPipelineDefs().find((p) => p.name === pipelineName);
  return d ? d.stages : DEFAULT_TICKET_STATUSES.map(ticketStage);
}
// Every status across the pipelines (lists that show all pipelines at once), the default ones first.
export function allTicketStatuses() {
  const out = [];
  const seen = new Set();
  [...DEFAULT_TICKET_STATUSES, ...ticketPipelineDefs().flatMap((p) => p.stages)].forEach((s) => { if (!seen.has(s[0])) { seen.add(s[0]); out.push(ticketStage(s)); } });
  return out;
}
export const ticketStatusDef = (pipeline, key) => ticketStatusesFor(pipeline).find((s) => s[0] === key) || allTicketStatuses().find((s) => s[0] === key) || null;
export const ticketStatusLabel = (pipeline, key) => { const s = ticketStatusDef(pipeline, key); return s ? s[1] : key || '—'; };
export const ticketStatusIsClosed = (pipeline, key) => { const s = ticketStatusDef(pipeline, key); return s ? s[2] === 'closed' : key === 'closed'; };
export const isTicketOpen = (t) => !ticketStatusIsClosed(t.pipeline, t.status);
export const ticketStatusClass = (pipeline, key) => (TICKET_STATUSES.find((s) => s[0] === key) || [])[2] || (ticketStatusIsClosed(pipeline, key) ? 'tag--done' : 'tag--open');
export const firstOpenTicketStatus = (pipeline) => { const st = ticketStatusesFor(pipeline); return (st.find((s) => s[2] !== 'closed') || st[0])[0]; };
// Open and closed tickets per pipeline (the indicator of the pipeline selector and of settings).
export function ticketPipelineCounts() {
  const out = {};
  ticketPipelines().forEach((n) => { out[n] = { open: 0, closed: 0 }; });
  allTickets().forEach((t) => { const c = out[t.pipeline] || (out[t.pipeline] = { open: 0, closed: 0 }); if (isTicketOpen(t)) c.open += 1; else c.closed += 1; });
  return out;
}
export function stagesFor(pipelineName) {
  const d = dealPipelineDefs().find((p) => p.name === pipelineName);
  return d ? d.stages : DEAL_STAGES;
}
const PIPELINE_MIX = [0, 1, 0, 2, 1, 3, 0, 4, 1, 5, 2, 6, 1, 0, 3, 7, 2, 4];
const pipelineFor = (i) => DEFAULT_DEAL_PIPELINES[PIPELINE_MIX[(i * 7) % PIPELINE_MIX.length]].name;
export const ASSOC_LABELS_KEY = 'crm:assoclabels';
export function assocLabels() {
  try {
    const saved = JSON.parse(localStorage.getItem(ASSOC_LABELS_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {
    /* ignore */
  }
  return ['Principal', 'Sin etiqueta', 'Facturación', 'Contacto técnico', 'Responsable de la decisión', 'Socio'];
}
export const PRIORITIES = [
  ['low', 'Baja', 'tag--none'],
  ['medium', 'Media', 'tag--open'],
  ['high', 'Alta', 'tag--high'],
];
export const TASK_TYPES = ['Llamada', 'Correo', 'Tarea'];
export const TASK_STATUSES = [
  ['todo', 'Pendiente', 'tag--open'],
  ['done', 'Completada', 'tag--done'],
];

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const COLORS = ['#006162', '#0091ae', '#6a78d1', '#f2547d', '#00a4bd', '#ff7a59', '#425b76'];
export const TODAY = new Date(2026, 10, 7);
const DAY = 86400000;

export function strip(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function formatDate(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}

export function formatShortDate(d) {
  if (!d) return '--';
  const x = d instanceof Date ? d : new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
}

export function relativeTime(d) {
  if (!d) return '--';
  const x = d instanceof Date ? d : new Date(d);
  const days = Math.round((TODAY - x) / DAY);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  if (days < 30) return `hace ${days} días`;
  const months = Math.round(days / 30);
  if (months < 2) return 'hace un mes';
  if (months < 12) return `hace ${months} meses`;
  const years = Math.round(days / 365);
  return years < 2 ? 'hace un año' : `hace ${years} años`;
}

// ---------- currencies ----------
// The company currency lives in Configuración › Valores predeterminados de la cuenta (crm:account.currency);
// each deal carries its own currency (deal_currency_code) and the exchange rates (home units per 1 unit of
// each currency) live in crm:currencies. Amounts are shown in the deal's currency; totals in the company's.
export const CURRENCY_DEFS = {
  MXN: { name: 'Peso mexicano', symbol: '$', after: false },
  USD: { name: 'Dólar estadounidense', symbol: '$', after: false },
  EUR: { name: 'Euro', symbol: '€', after: true },
  COP: { name: 'Peso colombiano', symbol: '$', after: false },
  GBP: { name: 'Libra esterlina', symbol: '£', after: false },
};
export const CURRENCY_CODES = Object.keys(CURRENCY_DEFS);
export const CURRENCY_KEY = 'crm:currencies';
export const DEFAULT_HOME_CURRENCY = 'MXN';
const EUR_VALUE = { EUR: 1, USD: 0.92, MXN: 0.049, COP: 0.00023, GBP: 1.17 };
export function homeCurrency() {
  try {
    const a = JSON.parse(localStorage.getItem('crm:account'));
    if (a && CURRENCY_DEFS[a.currency]) return a.currency;
  } catch {
    /* ignore */
  }
  return DEFAULT_HOME_CURRENCY;
}
// Rates: how many units of the company currency 1 unit of each currency is worth ("1 USD = 0,92 EUR").
export function currencyRates() {
  const home = homeCurrency();
  const defaults = Object.fromEntries(CURRENCY_CODES.map((c) => [c, Math.round((EUR_VALUE[c] / EUR_VALUE[home]) * 1e6) / 1e6]));
  const saved = read(CURRENCY_KEY, null);
  if (saved && saved.home === home && saved.rates) return { ...defaults, ...saved.rates, [home]: 1 };
  return defaults;
}
export function saveCurrencyRates(rates) {
  write(CURRENCY_KEY, { home: homeCurrency(), rates });
}
export const currencyOf = (code) => (CURRENCY_DEFS[code] ? code : homeCurrency());
export function toHomeCurrency(amount, code) {
  const n = Number(amount) || 0;
  const c = currencyOf(code);
  if (c === homeCurrency()) return n;
  return n * (currencyRates()[c] || 1);
}
// Amounts read like the original: the company currency with its symbol ("$71,937,108.59"), any other
// currency with its code ("USD 200,000,000"); decimals only when the amount has them.
const fmtNum = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const dec = Number.isInteger(v) ? 0 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const withCurrency = (num, code) => {
  const c = currencyOf(code);
  const def = CURRENCY_DEFS[c];
  if (c !== homeCurrency()) return `${c} ${num}`;
  return def.after ? `${num} ${def.symbol}` : `${def.symbol}${num}`;
};
export function formatMoney(n, code) {
  return withCurrency(fmtNum(n), code);
}
// Abbreviated amounts for the metrics card: "$35.62 mil M" (thousands of millions), "$683.46 M", "$523.41 mil".
export function formatMoneyShort(n, code) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const short = abs >= 1e9 ? `${(v / 1e9).toFixed(2)} mil M` : abs >= 1e6 ? `${(v / 1e6).toFixed(2)} M` : abs >= 1e3 ? `${(v / 1e3).toFixed(2)} mil` : fmtNum(v);
  return withCurrency(short, code);
}
// A deal's derived money fields: its currency (defaulting to the company's), the rate and the amount in the company currency.
export function withHomeAmount(r) {
  const code = currencyOf(r.deal_currency_code);
  return { ...r, deal_currency_code: code, hs_exchange_rate: currencyRates()[code] || 1, amount_in_home_currency: Math.round(toHomeCurrency(r.amount, code)) };
}

export function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function colorFor(id) {
  return COLORS[Number(id) % COLORS.length];
}

// ---------- persistence ----------
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  if (typeof bump === 'function') bump();
}
const K = (type, what) => `crm:${type}:${what}`;

// ---------- Supabase mapping ----------
// JS records use camelCase; the database uses snake_case columns.
const CAMEL_TO_DB = {
  contacts: { companyId: 'company_id', lastActivity: 'last_activity', lastActivityType: 'last_activity_type', jobTitle: 'job_title' },
  companies: { lastActivity: 'last_activity', lastActivityType: 'last_activity_type' },
  deals: { closeDate: 'close_date', companyId: 'company_id', contactId: 'contact_id', lastActivity: 'last_activity' },
  tickets: { contactId: 'contact_id', lastActivity: 'last_activity' },
  tasks: { contactId: 'contact_id', lastActivity: 'last_activity' },
};
const DB_TO_CAMEL = Object.fromEntries(
  Object.entries(CAMEL_TO_DB).map(([t, m]) => [t, Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]))])
);
const TABLE_COLS = {
  contacts: ['id', 'first', 'last', 'name', 'email', 'phone', 'mobilephone', 'owner', 'company_id', 'company', 'status', 'created', 'last_activity', 'last_activity_type', 'lifecycle', 'city', 'country', 'source', 'job_title', 'customer_type'],
  companies: ['id', 'name', 'domain', 'phone', 'owner', 'industry', 'city', 'country', 'employees', 'revenue', 'lifecycle', 'created', 'last_activity', 'last_activity_type'],
  deals: ['id', 'name', 'amount', 'stage', 'pipeline', 'close_date', 'owner', 'company_id', 'company', 'contact_id', 'created', 'last_activity', 'priority', 'type'],
  tickets: ['id', 'name', 'status', 'priority', 'pipeline', 'owner', 'contact_id', 'source', 'created', 'last_activity', 'description'],
  tasks: ['id', 'name', 'type', 'status', 'priority', 'owner', 'contact_id', 'contact', 'due', 'created', 'last_activity'],
};
// Catalog properties (sample decoration) and real columns never go to `extra`;
// anything else (associations, custom fields) is stored in the extra jsonb column.
// Numeric/date columns reject empty strings in Postgres; store null instead.
const EMPTY_AS_NULL = new Set(['company_id', 'contact_id', 'employees', 'revenue', 'amount', 'created', 'last_activity', 'close_date', 'due']);
// Where a record field lives in Supabase: a real column, or inside the `extra` jsonb (the filter panel
// translates its conditions into the query with this). { column, json } — json true when it is extra->>key.
export function dbColumnFor(type, key) {
  const col = (CAMEL_TO_DB[type] && CAMEL_TO_DB[type][key]) || key;
  if ((TABLE_COLS[type] || []).includes(col)) return { column: col, json: false };
  return { column: `extra->>${key}`, json: true };
}
function toDb(type, rec) {
  const props = PROP_CACHE[type] || propertyList(type);
  const propKeys = new Set(props.map((p) => p.key));
  const out = {};
  const extra = { ...(rec.extra || {}) };
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined || k === 'extra') continue;
    const col = (CAMEL_TO_DB[type] && CAMEL_TO_DB[type][k]) || k;
    if (TABLE_COLS[type].includes(col)) out[col] = v === '' && EMPTY_AS_NULL.has(col) ? null : v;
    else if (!propKeys.has(k)) extra[k] = v;
  }
  out.extra = extra;
  return out;
}
function fromDb(type, row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'extra') continue;
    out[(DB_TO_CAMEL[type] && DB_TO_CAMEL[type][k]) || k] = v;
  }
  return { ...out, ...(row.extra || {}) };
}
// Writes are applied to the in-memory cache immediately (the UI stays
// synchronous) and then sent to Supabase in order, in the background.
let writeQueue = Promise.resolve();
function dbWrite(fn) {
  writeQueue = writeQueue.then(fn).catch((e) => console.error('[supabase]', e));
}
const dbRows = {};
const nextId = {};
// Starts optimistic; initFromSupabase() flips it to false if the database
// cannot be reached, in which case everything falls back to localStorage.
let dbLive = DB_MODE;

export function getExtra(type) {
  if (dbLive) return [];
  return read(K(type, 'extra'), []);
}
export function getOverrides(type) {
  if (dbLive) return {};
  return read(K(type, 'overrides'), {});
}
export function getDeleted(type) {
  if (dbLive) return new Set();
  return new Set(read(K(type, 'deleted'), []));
}
export function getPrefs(type) {
  return read(K(type, 'prefs'), {});
}
export function setPrefs(type, prefs) {
  write(K(type, 'prefs'), { ...getPrefs(type), ...prefs });
}

export function getViewStore(type) {
  return read(K(type, 'views'), { custom: [], open: [], active: null });
}
export function setViewStore(type, store) {
  write(K(type, 'views'), store);
}

export function setField(type, id, field, value) {
  if (dbLive) {
    const rec = (dbRows[type] || []).find((r) => Number(r.id) === Number(id));
    if (rec) rec[field] = value;
    bump();
    const col = (CAMEL_TO_DB[type] && CAMEL_TO_DB[type][field]) || field;
    dbWrite(async () => {
      if (TABLE_COLS[type].includes(col)) {
        const { error } = await supabase.from(type).update({ [col]: value }).eq('id', id);
        if (error) console.error('[supabase] update', type, error);
      } else {
        const { data: row, error: readErr } = await supabase.from(type).select('extra').eq('id', id).single();
        if (readErr) { console.error('[supabase] read extra', type, readErr); return; }
        const extra = { ...(row?.extra || {}), [field]: value };
        const { error } = await supabase.from(type).update({ extra }).eq('id', id);
        if (error) console.error('[supabase] update extra', type, error);
      }
    });
    afterSet(type, id, field, value);
    return;
  }
  const o = getOverrides(type);
  o[id] = { ...(o[id] || {}), [field]: value };
  write(K(type, 'overrides'), o);
  afterSet(type, id, field, value);
}

export function deleteRecords(type, ids) {
  if (dbLive) {
    const rows = dbRows[type] || [];
    const doomed = new Set(ids.map(Number));
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (doomed.has(Number(rows[i].id))) rows.splice(i, 1);
    }
    bump();
    dbWrite(async () => {
      const { error } = await supabase.from(type).delete().in('id', [...doomed]);
      if (error) console.error('[supabase] delete', type, error);
    });
    return;
  }
  const d = getDeleted(type);
  ids.forEach((id) => d.add(Number(id)));
  write(K(type, 'deleted'), [...d]);
}

export function restoreAll(type) {
  if (dbLive) {
    // In database mode deletes are real, so "restore" re-inserts the sample
    // records whose ids are missing.
    const rows = dbRows[type] || [];
    const have = new Set(rows.map((r) => Number(r.id)));
    const missing = [];
    for (let i = 0; i < COUNTS[type]; i += 1) {
      if (!have.has(i + 1)) missing.push(BUILDERS[type](i));
    }
    if (!missing.length) return;
    missing.forEach((r) => rows.push(augment(type, { ...r })));
    rows.sort((a, b) => Number(a.id) - Number(b.id));
    bump();
    dbWrite(async () => {
      const payload = missing.map((r) => toDb(type, r));
      const { error } = await supabase.from(type).insert(payload);
      if (error) console.error('[supabase] restore', type, error);
    });
    return;
  }
  write(K(type, 'deleted'), []);
}

export function addRecord(type, fields) {
  if (dbLive) {
    const id = nextId[type];
    nextId[type] += 1;
    const rec = { id, created: TODAY.toISOString(), ...fields };
    (dbRows[type] = dbRows[type] || []).unshift(augment(type, { ...rec }));
    bump();
    dbWrite(async () => {
      const { error } = await supabase.from(type).insert(toDb(type, rec));
      if (error) console.error('[supabase] insert', type, error);
    });
    return afterAdd(type, rec);
  }
  const extra = getExtra(type);
  const rec = { id: 1000 + extra.length + 1, created: TODAY.toISOString(), ...fields };
  extra.unshift(rec);
  write(K(type, 'extra'), extra);
  return afterAdd(type, rec);
}
// Rules that run right after a record is created or a field changes (companies by e-mail domain, §2 of the
// companies specification). They never break the write that triggered them.
function afterAdd(type, rec) {
  if (type === 'contacts') { try { autoAssociateCompany(rec); } catch (e) { console.error('[empresas automáticas]', e); } }
  if (type === 'tickets') { try { autoAssociateTicketCompany(rec); } catch (e) { console.error('[tickets: empresa del contacto]', e); } }
  return rec;
}
function afterSet(type, id, field, value) {
  if (type === 'contacts' && (field === 'email' || field === 'website') && value) { try { autoAssociateCompany(id); } catch (e) { console.error('[empresas automáticas]', e); } }
  if (type === 'tickets' && field === 'contactId' && value) { try { autoAssociateTicketCompany(id); } catch (e) { console.error('[tickets: empresa del contacto]', e); } }
}

function merge(type, base) {
  const extra = getExtra(type).map((r) => augment(type, { ...r }));
  const overrides = getOverrides(type);
  const deleted = getDeleted(type);
  return [...extra, ...base]
    .filter((r) => !deleted.has(Number(r.id)))
    .map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r))
    .map((r) => (type === 'deals' ? withHomeAmount(normalizeDealStage(r)) : r));
}

// ---------- sample values for every catalog property ----------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const TEXT_POOLS = {
  address: (n) => `Calle ${['Mayor', 'Real', 'del Sol', 'de la Paz', 'Nueva', 'del Prado'][n % 6]} ${1 + (n % 120)}`,
  zip: (n) => String(28000 + (n % 999)).padStart(5, '0'),
  ip: (n) => `83.${n % 255}.${(n * 7) % 255}.${(n * 13) % 255}`,
  ip_city: (n) => CITIES[n % CITIES.length],
  message: (n) => ['Quiero un presupuesto para cambiar las ventanas.', 'Me interesa un cerramiento de terraza.', 'Necesito información sobre mamparas.', '¿Hacen fachadas de vidrio?'][n % 4],
  description: (n) => ['Proyecto de sustitución de carpintería en vivienda.', 'Cerramiento de terraza con vidrio templado.', 'Instalación de mamparas en 12 baños.', 'Fachada acristalada para local comercial.'][n % 4],
  hs_analytics_source_data_1: (n) => ['google', 'bing', 'newsletter-octubre', 'linkedin', 'facebook', 'referral'][n % 6],
  hs_analytics_source_data_2: (n) => ['organic', 'cpc', 'boletin', 'post', 'ads', 'ejemplo.es'][n % 6],
  hs_latest_source_data_1: (n) => ['google', 'newsletter-noviembre', 'instagram', 'directo'][n % 4],
  hs_latest_source_data_2: (n) => ['organic', 'boletin', 'post', ''][n % 4],
  hs_analytics_first_touch_converting_campaign: (n) => ['Promoción otoño', 'Guía de ventanas', 'Feria Construmat', ''][n % 4],
  hs_analytics_last_touch_converting_campaign: (n) => ['Boletín mensual', 'Oferta de primavera', 'Guía de ventanas', ''][n % 4],
  twitterbio: (n) => ['Apasionado de la arquitectura.', 'Reformas con cabeza.', '', 'Construimos hogares.'][n % 4],
  hs_linkedinbio: (n) => ['Dirección de obra · 10 años de experiencia', 'Arquitectura y diseño', 'Compras y aprovisionamiento', ''][n % 4],
  hs_merged_object_ids: () => '',
  hs_google_click_id: (n) => (n % 3 ? '' : `Cj0KCQ${n}x`),
  hs_facebook_click_id: (n) => (n % 4 ? '' : `fb.1.${n}`),
  hs_parent_company_id: () => '',
  hs_task_body: (n) => ['Revisar medidas antes de llamar.', 'Enviar catálogo actualizado.', 'Confirmar fecha de visita.', ''][n % 4],
};

function sampleValue(prop, r, type) {
  const n = hash(`${type}:${prop.key}:${r.id}`) >>> 0;
  const base = new Date(r.created || TODAY).getTime();
  switch (prop.kind) {
    case 'text': {
      if (TEXT_POOLS[prop.key]) return TEXT_POOLS[prop.key](n);
      if (prop.key === 'twitterhandle') return `@${strip(r.name || r.first || 'usuario').replace(/\s+/g, '')}`;
      if (prop.key === 'hs_email_domain') return (r.email || 'ejemplo.com').split('@')[1] || 'ejemplo.com';
      if (prop.key === 'associatedcompany') return r.company || '';
      return '';
    }
    case 'number': {
      if (/score|puntuacion|hubspotscore/i.test(prop.key)) return n % 100;
      if (/follower/i.test(prop.key)) return 50 + (n % 4800);
      if (/founded/i.test(prop.key)) return 1985 + (n % 38);
      if (/time|days|dias|hours/i.test(prop.key)) return n % 120;
      if (/exchange/i.test(prop.key)) return 1;
      if (/nps/i.test(prop.key)) return n % 11;
      return n % 40;
    }
    case 'currency': return 500 + (n % 48000);
    case 'percent': return n % 101;
    case 'date':
    case 'datetime': {
      const off = ((n % 60) - 30) * DAY;
      return new Date(Math.min(base + Math.abs(off), TODAY.getTime() + 60 * DAY)).toISOString();
    }
    case 'enum':
    case 'user':
    case 'bool': return prop.options ? prop.options[n % prop.options.length] : '';
    case 'email': return r.email || `${strip(r.first || 'contacto')}.${strip(r.last || r.id)}@ejemplo.com`;
    case 'phone': return phoneFor(r.id, prop.key);
    case 'url': {
      if (prop.key === 'website' || prop.key === 'domain') return `https://www.${strip(r.company || r.name || 'ejemplo').replace(/\s+/g, '')}.es`;
      if (/referrer/i.test(prop.key)) return ['https://www.google.com/', 'https://www.bing.com/', 'https://es.linkedin.com/', ''][n % 4];
      if (/profilephoto|linkedin_company/i.test(prop.key)) return `https://www.ejemplo.es/perfil/${r.id}`;
      return `https://www.ejemplo.es/${['', 'productos/ventanas', 'presupuesto', 'blog/aislamiento', 'contacto'][n % 5]}`;
    }
    case 'id': return r.id;
    default: return '';
  }
}

const PROP_CACHE = {};
function augment(type, r) {
  const props = PROP_CACHE[type] || (PROP_CACHE[type] = propertyList(type));
  for (const p of props) {
    if (r[p.key] === undefined || r[p.key] === null) r[p.key] = sampleValue(p, r, type);
  }
  return r;
}

// ---------- generators ----------
function daysAgo(n) {
  return new Date(TODAY.getTime() - n * DAY).toISOString();
}

const DIALS = ['+34 6', '+34 6', '+34 9', '+1 (305) ', '+52 55 ', '+52 81 ', '+1 (617) ', '+57 1 '];
function phoneFor(i, salt) {
  const n = hash(`phone:${i}:${salt}`);
  const dial = DIALS[n % DIALS.length];
  const a = String(n % 100).padStart(2, '0');
  const b = String((n >>> 4) % 1000).padStart(3, '0');
  const c = String((n >>> 9) % 1000).padStart(3, '0');
  const d = String((n >>> 14) % 10000).padStart(4, '0');
  if (dial.startsWith('+1')) return `${dial}${b}-${d}${n % 11 === 0 ? ', ext. ' + (1 + (n % 9)) : ''}`;
  if (dial.startsWith('+52')) return `${dial}${d} ${d.slice(0, 4)}`;
  if (dial.startsWith('+57')) return `${dial}${b} ${d}`;
  return `${dial}${a} ${b} ${c}`;
}

function buildContact(i) {
  const first = FIRST[(i * 7) % FIRST.length];
  const last = LAST[(i * 11 + 3) % LAST.length];
  const noCompany = i % 9 === 8;
  const companyIdx = (i * 3) % COMPANY_NAMES.length;
  const domain = noCompany ? ['gmail.com', 'hotmail.com', 'outlook.es', 'yahoo.com'][i % 4] : `${strip(COMPANY_NAMES[companyIdx]).replace(/[^a-z0-9]/g, '')}.com`;
  return {
    id: i + 1,
    first,
    last,
    name: `${first} ${last}`,
    email: i % 11 === 10 ? '' : `${strip(first).replace(/\s+/g, '.')}.${strip(last).split(' ')[0]}@${domain}`,
    phone: i % 7 === 6 ? '' : phoneFor(i, 'p'),
    mobilephone: i % 5 === 0 ? '' : phoneFor(i, 'm'),
    owner: OWNERS[(i * 3) % OWNERS.length],
    companyId: noCompany ? '' : companyIdx + 1,
    company: noCompany ? '' : COMPANY_NAMES[companyIdx],
    status: Object.keys(STATUSES)[(i * 2) % 5],
    created: daysAgo((i * 13) % 700),
    lastActivity: daysAgo((i * 5) % 90),
    lastActivityType: ['email', 'call', 'task', 'email', 'meeting', 'note'][(i * 3) % 6],
    lifecycle: lifecycleFor(i),
    city: CITIES[(i * 5) % CITIES.length],
    country: ['España', 'España', 'México', 'Estados Unidos', 'Colombia', 'Portugal'][(i * 7) % 6],
    source: SOURCES[(i * 7) % 5],
    jobTitle: i % 6 === 5 ? '' : ['Gerente', 'Arquitecta', 'Jefe de obra', 'Compras', 'Dirección', 'Administración', 'Project Manager', 'Estimator', 'Senior Project Manager', 'Dueño/a', 'Supervisor', 'Purchasing'][(i * 11) % 12],
    customer_type: ['Instalador', 'Distribuidor', 'Arquitecto', 'Constructor', 'Particular'][(i * 3) % 5],
  };
}

function buildCompany(i) {
  const name = COMPANY_NAMES[i];
  return {
    id: i + 1,
    name,
    domain: `${strip(name).replace(/[^a-z0-9]/g, '')}.com`,
    phone: phoneFor(i, 'c'),
    owner: OWNERS[(i * 2) % OWNERS.length],
    industry: INDUSTRIES[i % INDUSTRIES.length],
    city: CITIES[(i * 3) % CITIES.length],
    country: ['España', 'México', 'Estados Unidos', 'Colombia'][(i * 5) % 4],
    employees: [5, 12, 25, 40, 80, 150, 320, 900][(i * 5) % 8],
    revenue: (250 + (i * 137) % 9000) * 1000,
    created: daysAgo(120 + i * 15),
    lastActivity: daysAgo((i * 7) % 60),
    lastActivityType: ['email', 'call', 'meeting'][i % 3],
    lifecycle: lifecycleFor(i * 5),
  };
}

const DEAL_KINDS = ['Instalación ventanas', 'Cerramiento terraza', 'Mampara de baño', 'Fachada de vidrio', 'Reforma oficina', 'Puertas correderas', 'Doble acristalamiento', 'Escaparate comercial', 'Barandilla de cristal', 'Lucernario', 'Muro cortina', 'Vidrio templado a medida'];
function buildDeal(i) {
  const pipeline = pipelineFor(i);
  // Each deal sits in a stage of its own pipeline.
  const stages = (DEFAULT_DEAL_PIPELINES.find((p) => p.name === pipeline) || { stages: DEAL_STAGES }).stages;
  const stage = stages[hash(`deal-stage:${i}`) % stages.length][0];
  const companyIdx = (i * 7) % COMPANY_NAMES.length;
  return {
    id: i + 1,
    name: `${DEAL_KINDS[i % DEAL_KINDS.length]} ${COMPANY_NAMES[companyIdx].split(' ').slice(0, 2).join(' ')}`,
    amount: i % 13 === 12 ? 0 : 900 + (i * 731) % 120000,
    stage,
    pipeline,
    closeDate: daysAgo(40 - ((i * 13) % 160)),
    owner: OWNERS[(i * 7) % OWNERS.length],
    companyId: companyIdx + 1,
    company: COMPANY_NAMES[companyIdx],
    contactId: (i * 5) % COUNTS.contacts + 1,
    created: daysAgo((i * 7) % 400),
    // Last activity at a time of day, so the board can say "hace 3 horas" for today's ones.
    lastActivity: new Date(TODAY.getTime() - ((i * 3) % 45) * DAY - (((i * 5) % 20) + 1) * 3600000).toISOString(),
    priority: PRIORITIES[(i * 2) % 3][0],
    type: ['Nuevo negocio', 'Negocio existente'][i % 2],
    // "Importante" tag of the board card.
    important: i % 4 === 1,
  };
}

function buildTicket(i) {
  return {
    id: i + 1,
    name: ['Cristal roto en entrega', 'Retraso en instalación', 'Consulta de garantía', 'Factura incorrecta', 'Medidas no coinciden', 'Solicitud de presupuesto', 'Ruido en ventana', 'Cambio de fecha', 'Condensación entre vidrios', 'Herraje suelto', 'Duda sobre mantenimiento', 'Reclamación de transporte'][i % 12],
    status: TICKET_STATUSES[(i * 3) % 4][0],
    priority: PRIORITIES[(i * 3) % 3][0],
    pipeline: DEFAULT_TICKET_PIPELINES[[0, 0, 1, 2, 0, 1, 3][i % 7]],
    owner: OWNERS[(i * 3) % OWNERS.length],
    contactId: (i * 7) % COUNTS.contacts + 1,
    source: ['Correo', 'Formulario', 'Chat', 'Teléfono', 'WhatsApp'][i % 5],
    created: daysAgo((i * 3) % 120),
    lastActivity: daysAgo((i * 2) % 20),
    description: ['El cliente indica el problema y solicita una respuesta en las próximas 48 horas.', 'Se adjuntan fotos del incidente. Pide visita técnica.', 'Solicita copia de la factura corregida con los datos fiscales nuevos.', 'Quiere adelantar la fecha de instalación una semana.'][i % 4],
  };
}

function buildTask(i) {
  const c = buildContact((i * 4) % COUNTS.contacts);
  return {
    id: i + 1,
    name: [`Llamar a ${c.name}`, `Enviar presupuesto a ${c.name}`, `Seguimiento con ${c.name}`, `Preparar reunión con ${c.name}`, `Enviar catálogo a ${c.name}`, `Confirmar medidas con ${c.name}`][i % 6],
    type: TASK_TYPES[i % 3],
    status: TASK_STATUSES[i % 4 === 0 ? 1 : 0][0],
    priority: PRIORITIES[(i * 2) % 3][0],
    owner: OWNERS[(i * 2) % OWNERS.length],
    contactId: c.id,
    contact: c.name,
    due: daysAgo(6 - (i % 15)),
    created: daysAgo(4 + i),
    lastActivity: daysAgo(i % 5),
  };
}

// Base records are deterministic, so they are built once and reused; the cache is dropped when anything is written.
const BUILDERS = { contacts: buildContact, companies: buildCompany, deals: buildDeal, tickets: buildTicket, tasks: buildTask };
const baseCache = {};
let version = 0;
const bump = () => { version += 1; };
function baseRecords(type) {
  if (!baseCache[type]) {
    baseCache[type] = dbLive
      ? dbRows[type] || []
      : Array.from({ length: COUNTS[type] }, (_, i) => augment(type, BUILDERS[type](i)));
  }
  return baseCache[type];
}
const mergedCache = {};
function cached(type) {
  const hit = mergedCache[type];
  if (hit && hit.version === version) return hit.rows;
  const rows = merge(type, baseRecords(type));
  mergedCache[type] = { version, rows };
  return rows;
}

export const allContacts = () => cached('contacts');
export const allCompanies = () => cached('companies');
export const allDeals = () => cached('deals');
export const allTickets = () => cached('tickets');
export const allTasks = () => cached('tasks');

export const ALL = {
  contacts: allContacts,
  companies: allCompanies,
  deals: allDeals,
  tickets: allTickets,
  tasks: allTasks,
};

export function findRecord(type, id) {
  return ALL[type]().find((r) => String(r.id) === String(id));
}

export function labelOf(list, key) {
  const hit = list.find((x) => x[0] === key);
  return hit ? hit[1] : key;
}

export function classOf(list, key) {
  const hit = list.find((x) => x[0] === key);
  return hit ? hit[2] : 'tag--none';
}

export function matches(r, q, keys) {
  if (!q) return true;
  const hay = strip(keys.map((k) => r[k]).join(' '));
  return hay.includes(strip(q));
}

export function toCsv(rows, columns) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = columns.map((c) => esc(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => esc(c.text ? c.text(r) : r[c.key])).join(';'));
  return [head, ...body].join('\n');
}

export function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- companies by e-mail domain (especificacion-empresas-crm.md §2) ----------
// When a contact is created, imported, or gets a new e-mail / website, the domain of its e-mail is compared
// with the companies' domains: an existing company is associated, a missing one is created (one per domain;
// subdomains are different domains). Free e-mail domains fall back to the contact's website URL; excluded
// domains and contacts that already have a company are left alone. The switch lives in
// Configuración › Objetos › Empresas ("Crea y asocia Empresas con Contactos", on by default).
export const COMPANY_AUTO_KEY = 'crm:settings:obj-companies';
export const EXCLUDED_DOMAINS_KEY = 'crm:companies:excluded-domains';
export const EXCLUDED_DOMAINS_MAX = 1000;
export const DEFAULT_EXCLUDED_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com'];
export const FREE_EMAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.es', 'yahoo.com.mx', 'ymail.com', 'hotmail.com', 'hotmail.es', 'hotmail.com.mx', 'outlook.com', 'outlook.es', 'live.com', 'live.com.mx', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.es', 'mail.com', 'yandex.com', 'zoho.com', 'prodigy.net.mx', 'terra.com', 'terra.com.mx'];
export const companyAutoEnabled = () => (read(COMPANY_AUTO_KEY, {}) || {}).autoCreate !== false;
export const excludedDomains = () => (read(EXCLUDED_DOMAINS_KEY, null) || DEFAULT_EXCLUDED_DOMAINS).map((d) => String(d).trim().toLowerCase()).filter(Boolean).slice(0, EXCLUDED_DOMAINS_MAX);
export const isFreeEmailDomain = (d) => FREE_EMAIL_DOMAINS.includes(String(d || '').toLowerCase());
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;
export function emailDomain(email) {
  const s = String(email ?? '').trim().toLowerCase().replace(/^<|>$/g, '');
  const at = s.lastIndexOf('@');
  if (at < 0) return null;
  const d = s.slice(at + 1);
  return DOMAIN_RE.test(d) ? d : null;
}
// Host of a website URL without the protocol and "www." (subdomains are kept: info.ejemplo.com ≠ ejemplo.com).
export function siteDomain(url) {
  let s = String(url ?? '').trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0].replace(/:\d+$/, '');
  return DOMAIN_RE.test(s) ? s : null;
}
export function companyNameFromDomain(domain) {
  const label = String(domain || '').split('.')[0];
  return label.split(/[-_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || domain;
}
// The domain a contact would be matched with: its e-mail's, or its website's when the e-mail is a free one.
export function companyDomainFor(contact) {
  const e = emailDomain(contact.email);
  if (e && !isFreeEmailDomain(e)) return { domain: e, via: 'email' };
  const w = siteDomain(contact.website);
  if (w && !isFreeEmailDomain(w)) return { domain: w, via: 'website' };
  return { domain: null, reason: e ? 'free_email' : 'no_email' };
}
export function companiesByDomain(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d) return [];
  return allCompanies().filter((c) => siteDomain(c.domain) === d).sort((a, b) => Number(a.id) - Number(b.id));
}
function linkContactToCompany(contact, company, via, created) {
  setField('contacts', contact.id, 'companyId', company.id);
  setField('contacts', contact.id, 'company', company.name);
  contact.companyId = company.id;
  contact.company = company.name;
  const when = Date.now();
  addActivity({ type: 'note', recordType: 'contacts', recordId: contact.id, who: 'Sistema', when, text: `Empresa "${company.name}" ${created ? 'creada y ' : ''}asociada automáticamente por el dominio ${via === 'website' ? 'del sitio web' : 'del correo'} (${company.domain}).` });
  if (created) addActivity({ type: 'note', recordType: 'companies', recordId: company.id, who: 'Sistema', when, text: `Empresa creada automáticamente a partir del contacto ${contact.name || contact.email || ''}${contact.email ? ` (${contact.email})` : ''}.` });
}
// Applies the rule to one contact (record or id). Returns { action: 'associated' | 'created' | 'skipped', reason, domain, via, company }.
export function autoAssociateCompany(contactOrId, { create = true, dryRun = false, force = false } = {}) {
  if (!force && !companyAutoEnabled()) return { action: 'skipped', reason: 'disabled' };
  const contact = contactOrId && typeof contactOrId === 'object' ? contactOrId : findRecord('contacts', contactOrId);
  if (!contact) return { action: 'skipped', reason: 'not_found' };
  if (contact.companyId) return { action: 'skipped', reason: 'already_associated' };
  const { domain, via, reason } = companyDomainFor(contact);
  if (!domain) return { action: 'skipped', reason };
  if (excludedDomains().includes(domain)) return { action: 'skipped', reason: 'excluded', domain };
  const hits = companiesByDomain(domain);
  if (hits.length) {
    if (!dryRun) linkContactToCompany(contact, hits[0], via, false);
    return { action: 'associated', domain, via, company: hits[0], duplicates: hits.length - 1 };
  }
  // the website of a free-e-mail contact only looks for an existing company; companies are created from e-mail domains
  if (via === 'website') return { action: 'skipped', reason: 'website_no_company', domain };
  if (!create) return { action: 'skipped', reason: 'no_company', domain };
  if (dryRun) return { action: 'created', domain, via, company: null };
  const company = addRecord('companies', {
    name: companyNameFromDomain(domain), domain, owner: contact.owner && contact.owner !== 'Sin asignar' ? contact.owner : 'Sin asignar', lifecycle: contact.lifecycle || 'Lead',
    lastActivity: TODAY.toISOString(), hs_created_by_automation: true, hs_created_from_email: contact.email || '',
  });
  linkContactToCompany(contact, company, via, true);
  return { action: 'created', domain, via, company };
}
// The "apply to existing contacts" choice of the setting: every contact without a company, in one pass.
export function applyCompanyAutomation({ dryRun = false } = {}) {
  const out = { checked: 0, associated: 0, created: 0, skipped: { free_email: 0, no_email: 0, excluded: 0 } };
  const newDomains = new Set();
  allContacts().filter((c) => !c.companyId).forEach((c) => {
    out.checked += 1;
    const r = autoAssociateCompany(dryRun ? { ...c } : c, { dryRun, force: true });
    if (r.action === 'created') { if (newDomains.has(r.domain)) out.associated += 1; else { newDomains.add(r.domain); out.created += 1; } }
    else if (r.action === 'associated') out.associated += 1;
    else { const k = r.reason === 'website_no_company' ? 'free_email' : r.reason; out.skipped[k] = (out.skipped[k] || 0) + 1; }
  });
  return out;
}

// ---------- tickets: the primary company of the contact (especificacion-tickets-crm.md §1) ----------
// A ticket created with a contact (form, record page, import) or that later gets one is associated to that
// contact's primary company, unless the switch in Configuración › Objetos › Tickets is off or the ticket
// already has a company.
export const TICKET_SETTINGS_KEY = 'crm:settings:obj-tickets';
export const ticketAutoCompanyEnabled = () => (read(TICKET_SETTINGS_KEY, {}) || {}).autoCompany !== false;
export function autoAssociateTicketCompany(ticketOrId, { force = false } = {}) {
  if (!force && !ticketAutoCompanyEnabled()) return { action: 'skipped', reason: 'disabled' };
  const t = ticketOrId && typeof ticketOrId === 'object' ? ticketOrId : findRecord('tickets', ticketOrId);
  if (!t) return { action: 'skipped', reason: 'not_found' };
  if (t.companyId) return { action: 'skipped', reason: 'already_associated' };
  if (!t.contactId) return { action: 'skipped', reason: 'no_contact' };
  const contact = findRecord('contacts', t.contactId);
  if (!contact || !contact.companyId) return { action: 'skipped', reason: 'contact_without_company' };
  const company = findRecord('companies', contact.companyId);
  if (!company) return { action: 'skipped', reason: 'company_not_found' };
  setField('tickets', t.id, 'companyId', company.id);
  setField('tickets', t.id, 'company', company.name);
  t.companyId = company.id;
  t.company = company.name;
  addActivity({ type: 'note', recordType: 'tickets', recordId: t.id, who: 'Sistema', when: Date.now(), text: `Empresa "${company.name}" asociada automáticamente: es la empresa principal del contacto ${contact.name || ''}.` });
  return { action: 'associated', company, contact };
}

// ---------- activities (unified timeline: notes, calls, emails, meetings, tasks, property history) ----------
// Persisted in the `activities` table (supabase/activities.sql). If that
// migration has not been run yet, activities fall back to the legacy
// per-record localStorage keys and the rest of the app keeps working.
const ACT_NOTES_KEY = (type, id) => `crm:${type}:notes:${id}`;
const ACT_HISTORY_KEY = (type, id) => `crm:${type}:history:${id}`;
const ACT_MIGRATED_KEY = 'crm:activities:migrated';
const ACT_LS_RE = /^crm:(contacts|companies|deals|tickets|tasks):(notes|history):(\d+)$/;
let activitiesLive = DB_MODE;
let activityRows = [];

function activityFromDb(row) {
  return {
    id: row.id,
    type: row.type,
    recordType: row.record_type,
    recordId: Number(row.record_id),
    text: row.text || '',
    who: row.who || '',
    when: row.occurred_at ? new Date(row.occurred_at).getTime() : Date.now(),
    extra: row.extra || {},
  };
}
function activityToDb(ev) {
  return {
    type: ev.type,
    record_type: ev.recordType,
    record_id: ev.recordId,
    text: ev.text || '',
    who: ev.who || '',
    occurred_at: new Date(ev.when || Date.now()).toISOString(),
    extra: ev.extra || {},
  };
}

export function activitiesFor(recordType, recordId) {
  if (!activitiesLive) return read(ACT_NOTES_KEY(recordType, recordId), []);
  return activityRows
    .filter((a) => a.recordType === recordType && a.recordId === Number(recordId))
    .sort((a, b) => b.when - a.when);
}

export function addActivity(ev) {
  if (activitiesLive) {
    activityRows.unshift({ ...ev, recordId: Number(ev.recordId) });
    dbWrite(async () => {
      const { error } = await supabase.from('activities').insert(activityToDb(ev));
      if (error) console.error('[supabase] insert activity', error);
    });
    return;
  }
  const key = ACT_NOTES_KEY(ev.recordType, ev.recordId);
  const list = read(key, []);
  list.unshift({ type: ev.type, when: ev.when, who: ev.who, text: ev.text });
  write(key, list);
}

export function historyFor(recordType, recordId) {
  if (!activitiesLive) return read(ACT_HISTORY_KEY(recordType, recordId), []);
  return activitiesFor(recordType, recordId)
    .filter((a) => a.type === 'prop')
    .map((a) => ({ key: a.extra.key, from: a.extra.from, to: a.extra.to, when: a.when, who: a.who }));
}

export function addHistoryEntry(recordType, recordId, key, from, to, label) {
  const text = `Propiedad "${label || key}" actualizada.`;
  if (!activitiesLive) {
    const hk = ACT_HISTORY_KEY(recordType, recordId);
    const h = read(hk, []);
    h.unshift({ key, from, to, when: Date.now(), who: 'Tú' });
    write(hk, h);
  }
  addActivity({ type: 'prop', recordType, recordId, text, who: 'Tú', when: Date.now(), extra: { key, from, to } });
}

// Every activity of the account (the reports count calls and emails by date). In localStorage mode the
// per-record keys are scanned; a storage without key enumeration (tests) simply yields none.
export function allActivities() {
  if (activitiesLive) return activityRows.slice();
  const out = [];
  try {
    for (let i = 0; i < (localStorage.length || 0); i += 1) {
      const k = localStorage.key(i);
      const m = ACT_LS_RE.exec(k || '');
      if (!m || m[2] !== 'notes') continue;
      (read(k, []) || []).forEach((a) => out.push({ ...a, recordType: m[1], recordId: Number(m[3]) }));
    }
  } catch { /* no enumeration */ }
  return out;
}

// ---------- segments (Segmentos: active and static lists) ----------
// Persisted in the `segments` table (supabase/segments.sql). Until that migration runs, segments live in
// localStorage (crm:segments) and the page keeps working.
const SEGMENTS_LS_KEY = 'crm:segments';
let segmentsLive = DB_MODE;
let segmentRows = [];
let nextSegmentId = 1;
function segmentFromDb(row) {
  return {
    id: Number(row.id), name: row.name || '', object: row.object || 'contacts', type: row.type || 'active', description: row.description || '', folder: row.folder || '',
    creator: row.creator || '', updatedBy: row.updated_by || row.creator || '', filters: Array.isArray(row.filters) ? row.filters : [], memberIds: Array.isArray(row.member_ids) ? row.member_ids : [],
    size: row.size === null || row.size === undefined ? null : Number(row.size), usedIn: Number(row.used_in || 0), campaign: row.campaign || '', access: row.access || {}, importId: row.import_id || null,
    processedAt: row.processed_at || '', created: row.created || '', updated: row.updated || row.created || '', ...(row.extra || {}),
  };
}
function segmentToDb(s) {
  const { id, name, object, type, description, folder, creator, updatedBy, filters, memberIds, size, usedIn, campaign, access, importId, processedAt, created, updated, ...rest } = s;
  return { name: name || '', object: object || 'contacts', type: type || 'active', description: description || '', folder: folder || '', creator: creator || '', updated_by: updatedBy || creator || '', filters: filters || [], member_ids: memberIds || [], size: size === null || size === undefined ? null : Math.round(Number(size)), used_in: Number(usedIn || 0), campaign: campaign || '', access: access || {}, import_id: importId || null, processed_at: processedAt || null, updated: updated || new Date().toISOString(), extra: rest };
}
export const segmentsAreLive = () => segmentsLive;
export function listSegments() {
  if (!segmentsLive) return read(SEGMENTS_LS_KEY, null);
  return segmentRows.slice();
}
export function saveAllSegments(list) {
  if (!segmentsLive) { write(SEGMENTS_LS_KEY, list); return; }
  segmentRows = list.map((s) => ({ ...s }));
}
export function insertSegment(seg) {
  if (!segmentsLive) { const list = read(SEGMENTS_LS_KEY, []) || []; list.unshift(seg); write(SEGMENTS_LS_KEY, list); return seg; }
  const row = { ...seg, id: seg.id || nextSegmentId };
  nextSegmentId = Math.max(nextSegmentId, Number(row.id) + 1);
  segmentRows.unshift(row);
  bump();
  dbWrite(async () => {
    const { error } = await supabase.from('segments').insert({ id: row.id, ...segmentToDb(row), created: row.created || new Date().toISOString() });
    if (error) console.error('[supabase] insert segment', error);
  });
  return row;
}
export function patchSegment(id, patch) {
  if (!segmentsLive) {
    const list = read(SEGMENTS_LS_KEY, []) || [];
    const i = list.findIndex((s) => Number(s.id) === Number(id));
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch };
    write(SEGMENTS_LS_KEY, list);
    return list[i];
  }
  const i = segmentRows.findIndex((s) => Number(s.id) === Number(id));
  if (i < 0) return null;
  segmentRows[i] = { ...segmentRows[i], ...patch };
  bump();
  const row = segmentRows[i];
  dbWrite(async () => {
    const { error } = await supabase.from('segments').update(segmentToDb(row)).eq('id', id);
    if (error) console.error('[supabase] update segment', error);
  });
  return row;
}
export function deleteSegments(ids) {
  const set = new Set(ids.map(Number));
  if (!segmentsLive) { write(SEGMENTS_LS_KEY, (read(SEGMENTS_LS_KEY, []) || []).filter((s) => !set.has(Number(s.id)))); return; }
  segmentRows = segmentRows.filter((s) => !set.has(Number(s.id)));
  bump();
  dbWrite(async () => {
    const { error } = await supabase.from('segments').delete().in('id', [...set]);
    if (error) console.error('[supabase] delete segments', error);
  });
}
// First run with the table available: move the segments kept in localStorage (or the sample set) into Supabase.
export async function seedSegments(sample) {
  if (!segmentsLive || segmentRows.length) return;
  let rows = read(SEGMENTS_LS_KEY, null);
  if (!Array.isArray(rows) || !rows.length) rows = typeof sample === 'function' ? sample() : [];
  if (!rows.length) return;
  const payload = rows.map((s) => ({ id: Number(s.id), ...segmentToDb(s), created: s.created || s.updated || new Date().toISOString() }));
  for (let j = 0; j < payload.length; j += 200) {
    const { error } = await supabase.from('segments').insert(payload.slice(j, j + 200));
    if (error) { console.error('[supabase] seed segments', error); return; }
  }
  segmentRows = rows.map((s) => ({ ...s, id: Number(s.id) }));
  nextSegmentId = segmentRows.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0) + 1;
  localStorage.removeItem(SEGMENTS_LS_KEY);
  console.info(`[supabase] ${rows.length} segmentos cargados en la tabla segments.`);
}
async function fetchSegments() {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('segments').select('*').order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all.map(segmentFromDb);
}

// ---------- Supabase bootstrap ----------
async function fetchTable(type) {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(type)
      .select('*')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all.map((r) => augment(type, fromDb(type, r)));
}
// Re-read one table from Supabase so a check runs against the current rows (the import wizard does this
// before looking for duplicates). Does nothing in local mode.
export const dbIsLive = () => dbLive;
export async function refreshTable(type) {
  if (!dbLive || !BUILDERS[type]) return false;
  dbRows[type] = await fetchTable(type);
  nextId[type] = dbRows[type].reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  delete baseCache[type];
  bump();
  return true;
}

async function seedAll() {
  // First run with an empty database: load the sample dataset so the CRM
  // looks exactly like the demo, but now persisted in Supabase.
  for (const type of ['companies', 'contacts', 'deals', 'tickets', 'tasks']) {
    const rows = Array.from({ length: COUNTS[type] }, (_, i) => toDb(type, BUILDERS[type](i)));
    for (let j = 0; j < rows.length; j += 200) {
      const { error } = await supabase.from(type).insert(rows.slice(j, j + 200));
      if (error) console.error('[supabase] seed', type, error);
    }
  }
}

async function fetchActivities() {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all.map(activityFromDb);
}

// One-time move of the legacy per-record localStorage timelines into the
// activities table. Idempotent via ACT_MIGRATED_KEY.
async function migrateLocalActivities() {
  if (localStorage.getItem(ACT_MIGRATED_KEY) === '1') return;
  const rows = [];
  const doomed = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    const m = ACT_LS_RE.exec(k || '');
    if (!m) continue;
    const [, recordType, kind, recordId] = m;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(k)) || []; } catch { list = []; }
    if (!Array.isArray(list) || !list.length) continue;
    doomed.push(k);
    for (const ev of list) {
      rows.push(kind === 'notes'
        ? { type: ev.type || 'note', record_type: recordType, record_id: Number(recordId), text: ev.text || '', who: ev.who || '', occurred_at: new Date(ev.when || Date.now()).toISOString(), extra: {} }
        : { type: 'prop', record_type: recordType, record_id: Number(recordId), text: `Propiedad "${ev.key}" actualizada.`, who: ev.who || '', occurred_at: new Date(ev.when || Date.now()).toISOString(), extra: { key: ev.key, from: ev.from, to: ev.to } });
    }
  }
  if (rows.length) {
    for (let j = 0; j < rows.length; j += 200) {
      const { error } = await supabase.from('activities').insert(rows.slice(j, j + 200));
      if (error) { console.error('[supabase] migración de actividades', error); return; }
    }
    doomed.forEach((k) => localStorage.removeItem(k));
    console.info(`[supabase] ${rows.length} actividades migradas desde localStorage.`);
  }
  localStorage.setItem(ACT_MIGRATED_KEY, '1');
}

// Signed in, but the tables look empty while the anon key still sees rows: the policies for authenticated
// users (supabase/auth.sql) have not been applied yet. Explain it instead of showing an empty CRM or seeding.
async function anonSeesRows(table) {
  try {
    const probe = createAnonProbe();
    if (!probe) return false;
    const { count, error } = await probe.from(table).select('id', { count: 'exact', head: true });
    return !error && Number(count) > 0;
  } catch {
    return false;
  }
}
function showRlsNotice(session) {
  const email = session?.user?.email || '';
  document.body.innerHTML = `<main style="max-width:640px;margin:80px auto;padding:32px;font-family:'Lexend Deca',Helvetica,Arial,sans-serif;color:#333;border:1px solid #dfe3eb;border-radius:8px;background:#fff">
    <h1 style="font-size:22px;margin:0 0 12px">Falta un paso en Supabase</h1>
    <p>Has iniciado sesión como <strong>${email.replace(/[&<>]/g, '')}</strong>, pero la base de datos todavía no deja leer ni escribir a los usuarios autenticados (solo a la clave anónima).</p>
    <ol style="line-height:1.6"><li>Abre el <strong>SQL Editor</strong> del proyecto de Supabase.</li><li>Pega y ejecuta el archivo <code>supabase/auth.sql</code> (añade las políticas para usuarios autenticados sin quitar el acceso actual).</li><li>Vuelve a cargar esta página.</li></ol>
    <p style="margin-top:20px"><button id="rls-reload" type="button" style="padding:10px 16px;border:0;border-radius:6px;background:#ff5c35;color:#fff;font:inherit;font-weight:600">Volver a cargar</button> <button id="rls-signout" type="button" style="padding:10px 16px;border:1px solid #dfe3eb;border-radius:6px;background:#fff;color:#006162;font:inherit;font-weight:600">Cerrar sesión</button></p>
  </main>`;
  document.getElementById('rls-reload').onclick = () => location.reload();
  document.getElementById('rls-signout').onclick = async () => { await signOut(); location.replace(siteRoot()); };
}
async function initFromSupabase() {
  // Route protection: without a session the browser goes to the login page and nothing else loads.
  const session = await requireSession();
  try {
    for (const type of Object.keys(BUILDERS)) {
      dbRows[type] = await fetchTable(type);
    }
    if (session && !dbRows.contacts.length && !dbRows.companies.length && (await anonSeesRows('contacts'))) {
      showRlsNotice(session);
      await new Promise(() => {});
    }
    if (!dbRows.contacts.length && !dbRows.companies.length) {
      await seedAll();
      for (const type of Object.keys(BUILDERS)) {
        dbRows[type] = await fetchTable(type);
      }
    }
    for (const type of Object.keys(BUILDERS)) {
      nextId[type] = dbRows[type].reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
    }
    try {
      activityRows = await fetchActivities();
    } catch (e) {
      // La migración supabase/activities.sql aún no se ha ejecutado: la
      // cronología sigue en localStorage hasta que exista la tabla.
      activitiesLive = false;
      console.error('[supabase] tabla activities no disponible; cronología en localStorage.', e);
    }
    if (activitiesLive) await migrateLocalActivities();
    try {
      segmentRows = await fetchSegments();
      nextSegmentId = segmentRows.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0) + 1;
    } catch (e) {
      // La migración supabase/segments.sql aún no se ha ejecutado: los segmentos siguen en localStorage.
      segmentsLive = false;
      console.error('[supabase] tabla segments no disponible; segmentos en localStorage.', e);
    }
  } catch (e) {
    console.error('[supabase] no se pudieron cargar los datos; se usa el modo demo con localStorage.', e);
    dbLive = false;
  }
}

// Top-level await: every page imports data.js before rendering, so awaiting
// here guarantees the records are ready before the UI is painted.
if (dbLive) {
  await initFromSupabase();
}

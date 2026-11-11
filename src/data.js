// Sample data for the app (placeholder people and companies, not real records).
// When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, records live in
// Supabase and all edits go to the database. Without them, edits, additions
// and deletions are kept in localStorage so the demo remembers them.
import { propertyList } from './properties.js';
import { supabase, DB_MODE } from './supabaseClient.js';

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
export const DEAL_STAGES = [
  ['appointment', 'Cita programada', 20],
  ['qualified', 'Calificado para comprar', 40],
  ['presentation', 'Presentación programada', 60],
  ['decision', 'Decisión pendiente', 80],
  ['contract', 'Contrato enviado', 90],
  ['won', 'Cerrado ganado', 100],
  ['lost', 'Cerrado perdido', 0],
];
export const TICKET_STATUSES = [
  ['new', 'Nuevo', 'tag--new'],
  ['waiting', 'En espera del contacto', 'tag--open'],
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
function withExtras(keys) {
  const stages = baseStages();
  const i = stages.findIndex((s) => s[0] === 'won');
  stages.splice(i, 0, ...keys.map((k) => [...EXTRA_STAGES[k]]));
  return stages;
}
export const DEFAULT_DEAL_PIPELINES = [
  { id: 102418, name: 'FUERZA DE VENTAS', desc: '', labels: 2, stages: withExtras([]) },
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
export function dealPipelineDefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEAL_PIPELINES_KEY));
    if (Array.isArray(saved) && saved.length) {
      // Older saves kept only the names.
      if (typeof saved[0] === 'string') return saved.map((name) => clonePipe(DEFAULT_DEAL_PIPELINES.find((p) => p.name === name) || newPipelineDef(name)));
      return saved;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DEAL_PIPELINES.map(clonePipe);
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
  EUR: { name: 'Euro', symbol: '€', after: true },
  USD: { name: 'Dólar estadounidense', symbol: '$', after: false },
  MXN: { name: 'Peso mexicano', symbol: 'MX$', after: false },
  COP: { name: 'Peso colombiano', symbol: 'COP $', after: false },
  GBP: { name: 'Libra esterlina', symbol: '£', after: false },
};
export const CURRENCY_CODES = Object.keys(CURRENCY_DEFS);
export const CURRENCY_KEY = 'crm:currencies';
const EUR_VALUE = { EUR: 1, USD: 0.92, MXN: 0.049, COP: 0.00023, GBP: 1.17 };
export function homeCurrency() {
  try {
    const a = JSON.parse(localStorage.getItem('crm:account'));
    if (a && CURRENCY_DEFS[a.currency]) return a.currency;
  } catch {
    /* ignore */
  }
  return 'EUR';
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
export function formatMoney(n, code) {
  const def = CURRENCY_DEFS[currencyOf(code)];
  const num = Math.round(Number(n) || 0).toLocaleString('es-ES');
  return def.after ? `${num} ${def.symbol}` : `${def.symbol}${num}`;
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
    return;
  }
  const o = getOverrides(type);
  o[id] = { ...(o[id] || {}), [field]: value };
  write(K(type, 'overrides'), o);
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
    return rec;
  }
  const extra = getExtra(type);
  const rec = { id: 1000 + extra.length + 1, created: TODAY.toISOString(), ...fields };
  extra.unshift(rec);
  write(K(type, 'extra'), extra);
  return rec;
}

function merge(type, base) {
  const extra = getExtra(type).map((r) => augment(type, { ...r }));
  const overrides = getOverrides(type);
  const deleted = getDeleted(type);
  return [...extra, ...base]
    .filter((r) => !deleted.has(Number(r.id)))
    .map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r))
    .map((r) => (type === 'deals' ? withHomeAmount(r) : r));
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
  const stage = DEAL_STAGES[(i * 3) % DEAL_STAGES.length][0];
  const companyIdx = (i * 7) % COMPANY_NAMES.length;
  return {
    id: i + 1,
    name: `${DEAL_KINDS[i % DEAL_KINDS.length]} ${COMPANY_NAMES[companyIdx].split(' ').slice(0, 2).join(' ')}`,
    amount: i % 13 === 12 ? 0 : 900 + (i * 731) % 120000,
    stage,
    pipeline: pipelineFor(i),
    closeDate: daysAgo(40 - ((i * 13) % 160)),
    owner: OWNERS[(i * 7) % OWNERS.length],
    companyId: companyIdx + 1,
    company: COMPANY_NAMES[companyIdx],
    contactId: (i * 5) % COUNTS.contacts + 1,
    created: daysAgo((i * 7) % 400),
    lastActivity: daysAgo((i * 3) % 45),
    priority: PRIORITIES[(i * 2) % 3][0],
    type: ['Nuevo negocio', 'Negocio existente'][i % 2],
  };
}

function buildTicket(i) {
  return {
    id: i + 1,
    name: ['Cristal roto en entrega', 'Retraso en instalación', 'Consulta de garantía', 'Factura incorrecta', 'Medidas no coinciden', 'Solicitud de presupuesto', 'Ruido en ventana', 'Cambio de fecha', 'Condensación entre vidrios', 'Herraje suelto', 'Duda sobre mantenimiento', 'Reclamación de transporte'][i % 12],
    status: TICKET_STATUSES[(i * 2) % 4][0],
    priority: PRIORITIES[(i * 3) % 3][0],
    pipeline: 'Pipeline de soporte',
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

async function initFromSupabase() {
  try {
    for (const type of Object.keys(BUILDERS)) {
      dbRows[type] = await fetchTable(type);
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

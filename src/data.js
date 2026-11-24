import { matchesSearch } from './search-match.js';
import { bootstrapDemo } from './demo-bootstrap.js';
export { getDemoBootstrapStatus } from './demo-bootstrap.js';
// Sample data for the app (placeholder people and companies, not real records).
// When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, records live in
// Supabase and all edits go to the database. Without them, edits, additions
// and deletions are kept in localStorage so the demo remembers them.
import { customProperties, propertyList, loadCustomProperties, setCustomPropertyWriter, localCustomProperties, clearLocalCustomProperties, customPropToDb, purgeArchivedLocalProperties, CUSTOM_OBJECT_NAME, SEED_BY_TYPE } from './properties.js';
import { REAL_DEAL_PIPELINES, LEGACY_STAGE_MAP, DEFAULT_PIPELINE_NAME, REAL_TICKET_PIPELINES, LEGACY_TICKET_MAP } from './pipelines-seed.js';
import { supabase, DB_MODE, createAnonProbe } from './supabaseClient.js';
import { requireSession, signOut, siteRoot } from './auth.js';
import { reportDbError } from './db-report.js';
import { notifyAssigned, notifyFollowers, ACTOR } from './notifications.js';
import { followersOf, bindFollowSettings } from './follows.js';
import { bindLayoutSettings, bindLayoutTeam, TEAMS } from './layout-defaults.js';

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
// Stage catalogue = the stages of the default pipeline (FUERZA DE VENTAS): [key, label, probability %].
// The pipelines themselves come from src/pipelines-seed.js and, with Supabase, from the pipelines /
// pipeline_stages tables; the catalogue follows the default pipeline whenever it is read or saved.
export const DEAL_STAGES = REAL_DEAL_PIPELINES[0].stages.map((s) => [...s]);
export { LEGACY_STAGE_MAP, DEFAULT_PIPELINE_NAME, REAL_DEAL_PIPELINES };
// Where a deal that still carries one of the sample keys belongs (the database rows were updated by
// supabase/pipelines.sql; the app also applies it when reading, so nothing gets lost).
export const LEGACY_TO_REAL = LEGACY_STAGE_MAP[DEFAULT_PIPELINE_NAME];
// won / lost / deleted in every pipeline, plus the stages HubSpot marks as closed in one pipeline each
// (Ventas Extranjero: Cotizacion Duplicada, Muestras · Acristala obras: Instaladores, Cierre de obra).
export const CLOSED_STAGES = ['won', 'lost', 'deleted', 'cotizacion_duplicada', 'muestras', 'instaladores', 'cierre_obra'];
export const isClosedStage = (key) => CLOSED_STAGES.includes(key);
export const isOpenDeal = (r) => !isClosedStage(r.stage);
// Closed in a given pipeline: the built-in won / lost keys or any stage whose forecast category is won / lost.
export function dealStageIsClosed(pipeline, key) {
  if (isClosedStage(key)) return true;
  const stage = (typeof stagesFor === 'function' ? stagesFor(pipeline) : []).find((s) => s[0] === key);
  return Boolean(stage) && ['won', 'lost'].includes(stageForecastCategory(stage));
}
// «Fecha de cierre» must become today when the deal closes with no date or a date still ahead of today. "Today"
// is the real calendar day (like the closeDate automation of deal-close.js and the timeline stamps), at noon so
// the day never shifts across time zones.
export const todayNoonIso = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0).toISOString(); };
export function closeDateNeedsToday(closeDate) {
  if (!closeDate) return true;
  const d = new Date(closeDate);
  if (Number.isNaN(d.getTime())) return true;
  const n = new Date();
  const endOfToday = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
  return d > endOfToday;
}
// Apply before persistence so inserts and stage/date/pipeline updates share the invariant.
function dealClosePatch(record) {
  const stage = stagesFor(record.pipeline).find(s => s[0] === record.stage);
  const zero = stage?.[2] !== '' && stage?.[2] != null && Number(stage[2]) === 0;
  return (zero || dealStageIsClosed(record.pipeline, record.stage)) && closeDateNeedsToday(record.closeDate)
    ? { closeDate: todayNoonIso() } : {};
}
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
// Deal pipelines: the account's real ones (src/pipelines-seed.js), editable in Configuración › Objetos ›
// Negocios › Pipelines. With Supabase they live in the pipelines / pipeline_stages tables (read at start-up,
// written on every change); without the tables they stay in localStorage. A definition is
// { id, name, desc, labels, stages: [[key, label, prob, desc?, forecastCategory?]], rules?, required?, automation?, logic?, labelList?, access? }.
export const DEAL_PIPELINES_KEY = 'crm:pipelines:deals';
const clonePipe = (p) => ({ ...p, stages: p.stages.map((s) => [...s]) });
export const DEFAULT_DEAL_PIPELINES = REAL_DEAL_PIPELINES.map(clonePipe);
export function newPipelineDef(name, stages) {
  return { id: 100000 + (Math.abs(Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)) % 900000), name, desc: '', labels: 0, stages: (stages || DEAL_STAGES).map((s) => [...s]) };
}
// A saved definition of a real pipeline whose stages still use the sample keys is upgraded once: the stages
// become the real ones and the per-stage settings (rules, automations, logic) follow the key mapping.
const remapStageKeys = (obj, map) => (obj && typeof obj === 'object' ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [map[k] || k, v])) : obj);
function upgradePipelineDef(p) {
  const real = p && REAL_DEAL_PIPELINES.find((x) => x.name === p.name);
  const map = (p && LEGACY_STAGE_MAP[p.name]) || {};
  if (!real || !Array.isArray(p.stages) || !p.stages.some((s) => map[s[0]] && !real.stages.some((r) => r[0] === s[0]))) return p;
  const out = { ...p, stages: real.stages.map((s) => [...s]) };
  ['required', 'automation', 'logic'].forEach((k) => { if (p[k]) out[k] = remapStageKeys(p[k], map); });
  return out;
}
// What localStorage holds (upgraded), or null when nothing was ever saved there.
function localSavedPipelineDefs() {
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
  return null;
}
let pipelineDefsRemote = null; // the deal pipelines once the tables have been read
export const pipelinesLive = () => pipelineDefsRemote !== null;
let ticketDefsRemote = null; // the ticket pipelines once the tables have been read
export const ticketPipelinesLive = () => ticketDefsRemote !== null;
export function dealPipelineDefs() {
  if (pipelineDefsRemote) return pipelineDefsRemote.map(clonePipe);
  return localSavedPipelineDefs() || DEFAULT_DEAL_PIPELINES.map(clonePipe);
}
// The stage catalogue mirrors the default pipeline's stages.
function syncDealStagesFromDefault() {
  const first = dealPipelineDefs()[0];
  if (!first || !first.stages.length) return;
  DEAL_STAGES.length = 0;
  first.stages.forEach((s) => DEAL_STAGES.push([s[0], s[1], Number(s[2]) || 0]));
}
// ---- pipelines / pipeline_stages tables ----
// pipelines: { id, objeto, nombre, orden, descripcion, extra } · pipeline_stages: { id, pipeline_id, clave, nombre, probabilidad, orden, descripcion }
// Per-stage categories are stored in pipelines.extra.forecastCategories, keyed by stage key.
// This uses the existing JSON column and needs no schema migration.
export const FORECAST_CATEGORIES = [['pipeline', 'Pipeline'], ['best_case', 'Mejor caso'], ['committed', 'Comprometido'], ['won', 'Ganado'], ['lost', 'Perdido']];
export function stageForecastCategory(stage) {
  if (FORECAST_CATEGORIES.some(([key]) => key === stage?.[4])) return stage[4];
  return stage?.[0] === 'won' ? 'won' : isClosedStage(stage?.[0]) ? 'lost' : 'pipeline';
}
export function dealForecastLabel(deal) {
  const stage = stagesFor(deal.pipeline).find((s) => s[0] === deal.stage);
  return stage ? FORECAST_CATEGORIES.find(([key]) => key === stageForecastCategory(stage))[1] : '—';
}
// Ticket statuses in pipeline_stages: the open / closed flag travels in `descripcion` ('open' | 'closed', the
// format the seed migration used) and `probabilidad` is 0 for open statuses and 100 for closed ones; the deal
// stages keep their probability in `probabilidad` and a free text in `descripcion`. Rules, required properties
// and automations of both objects ride in pipelines.extra ({ rules, required, automation, publicId, … }).
export function pipelineDefsFromRows(pipes, stages, objeto = 'deal') {
  return (pipes || [])
    .filter((p) => p.objeto === objeto)
    .sort((a, b) => (a.orden - b.orden) || (a.id - b.id))
    .map((p) => {
      const extra = p.extra && typeof p.extra === 'object' ? p.extra : {};
      const { publicId, forecastCategories, ...rest } = extra;
      const rows = (stages || []).filter((s) => Number(s.pipeline_id) === Number(p.id)).sort((a, b) => (a.orden - b.orden) || (a.id - b.id));
      if (objeto === 'ticket') {
        const st = rows.map((s) => [s.clave, s.nombre, s.descripcion === 'closed' || (!s.descripcion && Number(s.probabilidad) >= 100) ? 'closed' : 'open']);
        return { ...rest, id: publicId || p.id, dbId: p.id, name: p.nombre, desc: p.descripcion || '', stages: st, rules: { ...(rest.rules || {}) }, required: { ...(rest.required || {}) }, automation: { ...(rest.automation || {}) } };
      }
      const st = rows.map((s) => (s.descripcion ? [s.clave, s.nombre, Number(s.probabilidad) || 0, s.descripcion] : [s.clave, s.nombre, Number(s.probabilidad) || 0]));
      st.forEach((s) => { if (FORECAST_CATEGORIES.some(([key]) => key === forecastCategories?.[s[0]])) { s[3] ||= ''; s[4] = forecastCategories[s[0]]; } });
      return { ...rest, id: publicId || p.id, dbId: p.id, name: p.nombre, desc: p.descripcion || '', labels: rest.labels || 0, stages: st };
    });
}
export function pipelineRowsFromDefs(defs, objeto = 'deal') {
  return defs.map((p, i) => {
    const { id, dbId, name, desc, stages, ...rest } = p;
    const stageRows = objeto === 'ticket'
      ? stages.map((s, j) => ({ clave: s[0], nombre: s[1], probabilidad: s[2] === 'closed' ? 100 : 0, orden: j, descripcion: s[2] === 'closed' ? 'closed' : 'open' }))
      : stages.map((s, j) => ({ clave: s[0], nombre: s[1], probabilidad: Number(s[2]) || 0, orden: j, descripcion: s[3] || '' }));
    return { pipeline: { objeto, nombre: name, orden: i, descripcion: desc || '', extra: { ...rest, publicId: id, ...(objeto === 'deal' ? { forecastCategories: Object.fromEntries(stages.filter((s) => s[4]).map((s) => [s[0], stageForecastCategory(s)])) } : {}) } }, stages: stageRows };
  });
}
async function fetchPipelineTables() {
  const { data: pipes, error } = await supabase.from('pipelines').select('*').order('orden');
  if (error) throw error;
  const { data: stages, error: e2 } = await supabase.from('pipeline_stages').select('*').order('orden');
  if (e2) throw e2;
  return { pipes: pipes || [], stages: stages || [] };
}
// Saves every pipeline of the object: upsert by (objeto, nombre), drop the ones removed, replace the stages.
async function writePipelines(defs, objeto = 'deal') {
  const rows = pipelineRowsFromDefs(defs, objeto);
  const { data: saved, error } = await supabase.from('pipelines').upsert(rows.map((r) => r.pipeline), { onConflict: 'objeto,nombre' }).select('id,nombre');
  if (error) { console.error('[supabase] pipelines upsert', error); return; }
  const idOf = new Map((saved || []).map((r) => [r.nombre, r.id]));
  const keep = rows.map((r) => r.pipeline.nombre);
  let del = supabase.from('pipelines').delete().eq('objeto', objeto);
  if (keep.length) del = del.not('nombre', 'in', `(${keep.map((n) => `"${String(n).replace(/"/g, '')}"`).join(',')})`);
  const { error: delErr } = await del;
  if (delErr) console.error('[supabase] pipelines delete', delErr);
  for (const r of rows) {
    const pid = idOf.get(r.pipeline.nombre);
    if (!pid) continue;
    const { error: e1 } = await supabase.from('pipeline_stages').delete().eq('pipeline_id', pid);
    if (e1) { console.error('[supabase] pipeline_stages delete', e1); continue; }
    if (r.stages.length) {
      const { error: e2 } = await supabase.from('pipeline_stages').insert(r.stages.map((s) => ({ ...s, pipeline_id: pid })));
      if (e2) console.error('[supabase] pipeline_stages insert', e2);
    }
  }
  const remote = objeto === 'ticket' ? ticketDefsRemote : pipelineDefsRemote;
  if (remote) remote.forEach((p) => { if (idOf.has(p.name)) p.dbId = idOf.get(p.name); });
}
const PIPELINES_MIGRATED_KEY = 'crm:pipelines:migrated';
const TICKET_PIPELINES_MIGRATED_KEY = 'crm:pipelines:tickets:migrated';
// Reads the tables; the first time, moves the definitions kept in localStorage and adds any real pipeline
// the tables still miss (an empty table gets all of them). Deals first, then tickets.
async function initPipelines() {
  let { pipes, stages } = await fetchPipelineTables();
  let defs = pipelineDefsFromRows(pipes, stages, 'deal');
  let changed = false;
  if (localStorage.getItem(PIPELINES_MIGRATED_KEY) !== '1') {
    const local = localSavedPipelineDefs();
    if (local) {
      local.forEach((p) => { if (!defs.some((d) => d.name === p.name)) { defs.push(clonePipe(p)); changed = true; } });
      console.info(`[supabase] pipelines de negocios migrados desde localStorage: ${local.length} leídos.`);
    }
  }
  REAL_DEAL_PIPELINES.forEach((p) => { if (!defs.some((d) => d.name === p.name)) { defs.push(clonePipe(p)); changed = true; } });
  if (changed) {
    await writePipelines(defs, 'deal');
    ({ pipes, stages } = await fetchPipelineTables());
    defs = pipelineDefsFromRows(pipes, stages, 'deal');
  }
  pipelineDefsRemote = defs;
  localStorage.setItem(PIPELINES_MIGRATED_KEY, '1');
  localStorage.removeItem(DEAL_PIPELINES_KEY);
  syncDealStagesFromDefault();
  // Ticket pipelines: the same tables (objeto 'ticket'). The configuration this browser kept in localStorage
  // (renamed / reordered statuses, rules, required properties, automations) wins once over the seeded rows,
  // then the tables are the shared source of truth for every browser and colleague.
  let tdefs = pipelineDefsFromRows(pipes, stages, 'ticket').map(normalizeTicketDef);
  let tchanged = false;
  if (localStorage.getItem(TICKET_PIPELINES_MIGRATED_KEY) !== '1') {
    const local = localSavedTicketPipelineDefs();
    if (local) {
      tdefs = mergeTicketPipelineDefs(tdefs, local);
      tchanged = true;
      console.info(`[supabase] pipelines de tickets migrados desde localStorage: ${local.length} leídos.`);
    }
  }
  REAL_TICKET_PIPELINES.forEach((p) => { if (!tdefs.some((d) => d.name === p.name)) { tdefs.push(normalizeTicketDef(cloneTicketPipe(p))); tchanged = true; } });
  if (tchanged) {
    await writePipelines(tdefs, 'ticket');
    ({ pipes, stages } = await fetchPipelineTables());
    tdefs = pipelineDefsFromRows(pipes, stages, 'ticket').map(normalizeTicketDef);
  }
  ticketDefsRemote = tdefs;
  localStorage.setItem(TICKET_PIPELINES_MIGRATED_KEY, '1');
  localStorage.removeItem(TICKET_PIPELINES_KEY);
}
// The one-time merge of the ticket pipelines kept in localStorage into the table's rows: a pipeline this
// browser configured keeps its statuses, rules, required properties, automations and description (its row
// keeps its ids); pipelines only known locally are added; the rest of the table stays as it is.
export function mergeTicketPipelineDefs(remote, local) {
  const out = remote.map(cloneTicketPipe);
  (local || []).forEach((l) => {
    const i = out.findIndex((d) => d.name === l.name);
    if (i >= 0) out[i] = { ...out[i], ...cloneTicketPipe(l), id: out[i].id, dbId: out[i].dbId };
    else out.push(cloneTicketPipe(l));
  });
  return out;
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
// A deal read with one of the sample stage keys lands on the real stage of its pipeline.
export function normalizeDealStage(r) {
  const name = r.pipeline || DEFAULT_PIPELINE_NAME;
  const map = LEGACY_STAGE_MAP[name];
  if (!map || !r.stage || !map[r.stage]) return r;
  if (stagesFor(name).some((s) => s[0] === r.stage)) return r; // the key is real in this pipeline
  return { ...r, stage: map[r.stage] };
}
export function saveDealPipelineDefs(list) {
  const defs = list.map(clonePipe);
  if (pipelineDefsRemote) {
    pipelineDefsRemote = defs;
    syncDealStagesFromDefault();
    bump();
    dbWrite(() => writePipelines(defs, 'deal'));
    return;
  }
  localStorage.setItem(DEAL_PIPELINES_KEY, JSON.stringify(defs));
  syncDealStagesFromDefault();
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
// The built-in pipelines are the account's real ones (src/pipelines-seed.js: Cotizaciones Proyectos / SACA /
// Acristala / Kafer with their 27 statuses); a pipeline created by hand starts with the four generic statuses.
export const DEFAULT_TICKET_PIPELINES = REAL_TICKET_PIPELINES.map((p) => p.name);
const TICKET_SEED_PIPE = [0, 0, 1, 2, 0, 1, 3];
const cloneTicketPipe = (p) => ({ ...p, stages: p.stages.map((s) => [...s]) });
const ticketPipeId = (name) => 200000 + (Math.abs(Array.from(String(name)).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11)) % 700000);
const ticketStage = (s) => [String(s[0]), String(s[1]), s[2] === 'closed' ? 'closed' : 'open'];
// rules / required / automation share the deal pipelines' shape (src/ticket-rules.js): { noBack, lockClosed },
// { [status]: [property labels] } and { [status]: { task, notify } }. They travel with the definition: in the
// pipelines / pipeline_stages tables (pipelines.extra jsonb) when there is a session, in localStorage otherwise.
export function newTicketPipelineDef(name, stages) {
  return { id: ticketPipeId(name), name, desc: '', stages: (stages || DEFAULT_TICKET_STATUSES).map(ticketStage), rules: {}, required: {}, automation: {} };
}
const normalizeTicketDef = (p) => ({ ...p, id: p.id || ticketPipeId(p.name), desc: p.desc || '', stages: Array.isArray(p.stages) && p.stages.length ? p.stages.map(ticketStage) : DEFAULT_TICKET_STATUSES.map(ticketStage), rules: { ...(p.rules || {}) }, required: { ...(p.required || {}) }, automation: { ...(p.automation || {}) } });
// What this browser saved before the tables took over (null when nothing was saved).
function localSavedTicketPipelineDefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(TICKET_PIPELINES_KEY));
    if (Array.isArray(saved) && saved.length) {
      if (typeof saved[0] === 'string') return saved.map((n) => newTicketPipelineDef(n)); // older saves kept only the names
      return saved.map(normalizeTicketDef);
    }
  } catch {
    /* ignore */
  }
  return null;
}
export function ticketPipelineDefs() {
  if (ticketDefsRemote) return ticketDefsRemote.map(cloneTicketPipe);
  return localSavedTicketPipelineDefs() || REAL_TICKET_PIPELINES.map(cloneTicketPipe);
}
// A ticket saved with one of the sample pipelines / statuses of earlier versions lands in its real pipeline
// (the n-th open status, or the first closed one); an unknown status falls back to the first open status.
export function normalizeTicket(r, defs = ticketPipelineDefs()) {
  if (!r) return r;
  let pipeline = r.pipeline;
  if (!defs.some((p) => p.name === pipeline)) pipeline = LEGACY_TICKET_MAP.pipelines[pipeline] || (defs[0] ? defs[0].name : pipeline);
  const def = defs.find((p) => p.name === pipeline);
  const stages = def ? def.stages : DEFAULT_TICKET_STATUSES;
  let status = r.status;
  if (!stages.some((s) => s[0] === status)) {
    const open = stages.filter((s) => s[2] !== 'closed');
    const closed = stages.filter((s) => s[2] === 'closed');
    if (status === 'closed') status = (closed[0] || stages[stages.length - 1])[0];
    else { const i = LEGACY_TICKET_MAP.statuses[status]; status = (open[Math.min(i === undefined ? 0 : i, open.length - 1)] || stages[0])[0]; }
  }
  return pipeline === r.pipeline && status === r.status ? r : { ...r, pipeline, status };
}
// With a session the ticket pipelines (statuses, rules, required properties, automations) go to the
// pipelines / pipeline_stages tables, shared by every browser and colleague; otherwise to localStorage.
export function saveTicketPipelineDefs(list) {
  const defs = list.map(normalizeTicketDef);
  if (ticketDefsRemote) {
    ticketDefsRemote = defs.map(cloneTicketPipe);
    if (typeof bump === 'function') bump();
    dbWrite(() => writePipelines(defs, 'ticket'));
    return;
  }
  localStorage.setItem(TICKET_PIPELINES_KEY, JSON.stringify(defs));
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
  [...ticketPipelineDefs().flatMap((p) => p.stages), ...DEFAULT_TICKET_STATUSES].forEach((s) => { if (!seen.has(s[0])) { seen.add(s[0]); out.push(ticketStage(s)); } });
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
  ['todo', 'No iniciada', 'tag--none'],
  ['in-progress', 'En curso', 'tag--open'],
  ['done', 'Completada', 'tag--done'],
  ['waiting', 'En espera', 'tag--warn'],
  ['deferred', 'Aplazada', 'tag--none'],
];

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const COLORS = ['#006162', '#0091ae', '#6a78d1', '#f2547d', '#00a4bd', '#ff7a59', '#425b76'];
export const TODAY = new Date(2026, 10, 7);
const DAY = 86400000;

export function strip(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------- the date rule of every table ----------
// A date column (creation, modification, last activity, due, close…) shows the short standard date,
// «12 nov 2026» (formatDate), the same in every module — Contactos, Empresas, Negocios, Tickets, Tareas,
// Llamadas, Plantillas, Secuencias — and carries the full date and time, «12 nov 2026 14:32»
// (formatDateTime), in the cell's tooltip (title). Relative wording («hace 2 días») is for timelines
// and activity feeds, not for table columns.
export function formatDate(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}
export function formatDateTime(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${formatDate(x)} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}
// The browser's own time-zone abbreviation («CST», «CET», «GMT-6»…) for the times the app shows in local time;
// never a fixed suffix, so a person in another zone reads the zone they are really in. Empty when unknown.
export function tzAbbr(d = new Date()) {
  try { return (new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName') || {}).value || ''; } catch { return ''; }
}
// A table cell for a date: short date with the full date-time as tooltip (the shared rule above).
export function dateCellHtml(d) {
  if (!d) return '<span class="muted">—</span>';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '<span class="muted">—</span>';
  return `<span class="cell__date" title="${formatDateTime(x)}">${formatDate(x)}</span>`;
}

export function formatShortDate(d) {
  if (!d) return '--';
  const x = d instanceof Date ? d : new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
}

// "hace 5 minutos", "hace 3 horas", "ayer", "hace 4 días"… from the real clock (timeline entries).
export function relativeTimeFine(d, now = Date.now()) {
  if (!d) return '--';
  const ms = Math.max(0, now - (d instanceof Date ? d : new Date(d)).getTime());
  const min = Math.round(ms / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.round(ms / 3600000);
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const days = Math.round(ms / DAY);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.round(days / 30);
  if (months < 2) return 'hace un mes';
  if (months < 12) return `hace ${months} meses`;
  const years = Math.round(days / 365);
  return years < 2 ? 'hace un año' : `hace ${years} años`;
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
  contacts: { companyId: 'company_id', lastActivity: 'last_activity', lastActivityType: 'last_activity_type', jobTitle: 'job_title', deletedAt: 'deleted_at' },
  companies: { lastActivity: 'last_activity', lastActivityType: 'last_activity_type', parentCompanyId: 'parent_company_id', deletedAt: 'deleted_at' },
  deals: { closeDate: 'close_date', companyId: 'company_id', contactId: 'contact_id', lastActivity: 'last_activity', deletedAt: 'deleted_at' },
  tickets: { contactId: 'contact_id', lastActivity: 'last_activity', deletedAt: 'deleted_at' },
  tasks: { queueId: 'queue_id', contactId: 'contact_id', parentId: 'parent_id', lastActivity: 'last_activity' },
};
const DB_TO_CAMEL = Object.fromEntries(
  Object.entries(CAMEL_TO_DB).map(([t, m]) => [t, Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]))])
);
const TABLE_COLS = {
  contacts: ['id', 'first', 'last', 'name', 'email', 'phone', 'mobilephone', 'owner', 'company_id', 'company', 'status', 'created', 'last_activity', 'last_activity_type', 'lifecycle', 'city', 'country', 'source', 'job_title', 'customer_type', 'deleted_at'],
  companies: ['id', 'name', 'domain', 'phone', 'owner', 'industry', 'city', 'country', 'employees', 'revenue', 'lifecycle', 'created', 'last_activity', 'last_activity_type', 'parent_company_id', 'deleted_at'],
  deals: ['id', 'name', 'amount', 'stage', 'pipeline', 'close_date', 'owner', 'company_id', 'company', 'contact_id', 'created', 'last_activity', 'priority', 'type', 'deleted_at'],
  tickets: ['id', 'name', 'status', 'priority', 'pipeline', 'owner', 'contact_id', 'source', 'created', 'last_activity', 'description', 'deleted_at'],
  tasks: ['id', 'queue_id', 'parent_id', 'name', 'type', 'status', 'priority', 'owner', 'contact_id', 'contact', 'due', 'created', 'last_activity'],
};
// Catalog properties (sample decoration) and real columns never go to `extra`;
// anything else (associations, custom fields) is stored in the extra jsonb column.
// Numeric/date columns reject empty strings in Postgres; store null instead.
const EMPTY_AS_NULL = new Set(['queue_id', 'parent_id', 'parent_company_id', 'company_id', 'contact_id', 'employees', 'revenue', 'amount', 'created', 'last_activity', 'close_date', 'due']);
// Integer columns: a decimal (an import that read «1.200» as 1.2, a typed «12,5») would be refused by Postgres.
const INTEGER_COLS = new Set(['employees']);
// Where a record field lives in Supabase: a real column, or inside the `extra` jsonb (the filter panel
// translates its conditions into the query with this). { column, json } — json true when it is extra->>key.
export function dbColumnFor(type, key) {
  const col = (CAMEL_TO_DB[type] && CAMEL_TO_DB[type][key]) || key;
  if ((TABLE_COLS[type] || []).includes(col)) return { column: col, json: false };
  return { column: `extra->>${key}`, json: true };
}
// keepProps: values typed by the person (create panels, imports) are kept even for catalogue properties;
// the sample decoration of seeds and restores is not.
function toDb(type, rec, keepProps = false) {
  const props = PROP_CACHE[type] || propertyList(type);
  const propKeys = new Set(props.map((p) => p.key));
  const out = {};
  const extra = { ...(rec.extra || {}) };
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined || k === 'extra') continue;
    const col = (CAMEL_TO_DB[type] && CAMEL_TO_DB[type][k]) || k;
    if (TABLE_COLS[type].includes(col)) out[col] = v === '' && EMPTY_AS_NULL.has(col) ? null : INTEGER_COLS.has(col) && v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.round(Number(v)) : v;
    else if (keepProps || !propKeys.has(k)) extra[k] = v;
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
// A database row as the app uses it (camelCase keys, `extra` unpacked, sample decoration) — for the
// server-side lists that receive one page at a time.
export const rowFromDb = (type, row) => augment(type, fromDb(type, row));
// Server-side lists: the page just received becomes the type's working set, so inline edits, selection,
// bulk actions and the trash keep working on those rows exactly as they do on the full dataset.
export function setPageRows(type, rows) {
  if (dbLive) dbRows[type] = rows;
  baseCache[type] = rows;
  bump();
}
// Writes are applied to the in-memory cache immediately (the UI stays
// synchronous) and then sent to Supabase in order, in the background.
let writeQueue = Promise.resolve();
// Resolves once every queued write has reached (or been refused by) the database: the live smokes wait for it
// before checking the rows with SQL.
export async function dbIdle() {
  // A queued write can enqueue more work (associations / automations).
  // Drain to a stable tail instead of waiting only for the initial snapshot.
  let tail;
  do { tail = writeQueue; await tail; } while (tail !== writeQueue);
  return true;
}
function dbWrite(fn) {
  const pending = writeQueue.then(fn);
  writeQueue = pending.catch((e) => reportDbError('escritura', e));
  return pending;
}
async function resumeTaskSequence(task, completedAt) {
  if (!task?.extra?.enrollmentId && !task?.enrollmentId) return;
  await (await import('./sequences-data.js')).completeSequenceTask(task, completedAt);
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
// The list preferences of a person (columns of the standard views, order, widths, frozen columns, density, zebra,
// metrics, page size, board state, pipeline…): per user in user_settings when signed in (the same store as the
// view tabs and the record layouts), with the localStorage copy as the offline / signed-out fallback — so they
// follow the person to another browser or computer instead of staying in this one.
export function getPrefs(type) {
  const local = read(K(type, 'prefs'), {});
  if (!settingsLive()) return local;
  const remote = getSetting(K(type, 'prefs'));
  return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : local;
}
export function setPrefs(type, prefs) {
  const next = { ...getPrefs(type), ...prefs };
  write(K(type, 'prefs'), next);
  if (settingsLive()) setSetting(K(type, 'prefs'), next);
}

// ---------- saved views (crm_views, supabase/crm_views.sql) ----------
// A custom view (filters, columns, sort…) belongs to the user who created it; «Mi equipo» and «Todos» views are
// read by the account's members (RLS: own rows + share <> 'private'; the team filter is applied here with the
// member's team). The open tabs / active view are personal (user_settings). Without the table everything stays
// in localStorage as before.
let viewRows = null; // the rows of crm_views once read (null: localStorage)
let myTeam = '';
let teamReady = Promise.resolve('');
export const viewsLive = () => viewRows !== null;
export const currentTeam = () => myTeam;
// The person's team: team_members.team when the account sets it (read at start-up with the rest).
async function fetchMyTeam() {
  try { const { data: me } = await supabase.from('team_members').select('team').eq('user_id', settingsUserId).maybeSingle(); myTeam = String((me && me.team) || '').trim(); } catch { myTeam = ''; }
  return myTeam;
}
// The team the record pages and preview panels resolve their team view with (layout-defaults.resolveLayout):
// team_members.team when set, else the team given in Configuración › Usuarios y equipos (the directory kept in
// this browser, crm:users: by e-mail of the session, then by the app's user name; the demo directory assigns the
// first teams in turn, as that screen shows).
let settingsUserEmail = '';
export function userTeam() {
  if (myTeam) return myTeam;
  const stored = read('crm:users', null);
  const users = Array.isArray(stored) ? stored : OWNERS.filter((o) => o !== 'Sin asignar').map((o, i) => ({ name: o, email: '', team: TEAMS[i % 3] }));
  const email = String(settingsUserEmail || '').toLowerCase();
  const me = (email && users.find((u) => u && String(u.email || '').toLowerCase() === email)) || users.find((u) => u && u.name === ACTOR);
  return String((me && me.team) || '').trim();
}
export const refreshUserTeam = () => (dbLive ? fetchMyTeam() : Promise.resolve(userTeam()));
bindLayoutTeam(userTeam);
const VIEWS_MIGRATED_KEY = 'crm:views:migrated';
export const viewFromRow = (r, userId = settingsUserId) => ({ ...(r.payload || {}), id: r.id, name: r.name, share: r.share || 'private', owner: r.owner_name || '', ownerId: r.owner_id, teams: Array.isArray(r.teams) ? r.teams : [], updated: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(), mine: r.owner_id === userId });
export function viewToRow(type, v, { userId = settingsUserId, team = myTeam } = {}) {
  const { id, name, share, owner, ownerId, teams, mine, updated, ...payload } = v;
  const sh = ['private', 'team', 'all'].includes(share) ? share : 'private';
  return { id: String(id), object_type: type, name: String(name || ''), share: sh, owner_id: ownerId || userId, owner_name: owner || ACTOR, teams: sh === 'team' ? (Array.isArray(teams) && teams.length ? teams : [team].filter(Boolean)) : [], payload, updated_at: new Date(updated || Date.now()).toISOString() };
}
// Which of the account's views a member sees: their own, the ones shared with everyone, and the ones shared with
// their team (a team view without a team recorded is visible to every member).
export const viewVisibleTo = (v, { userId, team } = {}) => Boolean(v) && (v.ownerId === userId || v.share === 'all' || (v.share === 'team' && (!v.teams || !v.teams.length || v.teams.includes(team))));
async function fetchViews() {
  const { data, error } = await supabase.from('crm_views').select('*').order('updated_at');
  if (error) throw error;
  await teamReady; // the migration below records the member's team on «Mi equipo» views
  viewRows = data || [];
  // One-time: the views this browser kept in localStorage go to the table, owned by the signed-in user.
  if (localStorage.getItem(VIEWS_MIGRATED_KEY) !== '1') {
    for (const type of Object.keys(BUILDERS)) {
      const local = read(K(type, 'views'), null);
      const mine = local && Array.isArray(local.custom) ? local.custom.filter((v) => v && v.id && !viewRows.some((r) => r.id === String(v.id))) : [];
      if (!mine.length) continue;
      const { data: ins, error: e2 } = await supabase.from('crm_views').upsert(mine.map((v) => viewToRow(type, { ...v, ownerId: settingsUserId })), { onConflict: 'id' }).select('*');
      if (e2) console.error('[supabase] migrar vistas guardadas', e2); else { viewRows.push(...(ins || [])); console.info(`[supabase] vistas de ${type} migradas desde localStorage: ${mine.length}.`); }
      if (!e2) write(K(type, 'views'), { custom: [], open: local.open || [], active: local.active || null });
    }
    localStorage.setItem(VIEWS_MIGRATED_KEY, '1');
  }
}
export function getViewStore(type) {
  const local = read(K(type, 'views'), { custom: [], open: [], active: null });
  if (!viewRows) return local;
  const saved = settingsLive() ? getSetting(K(type, 'views:tabs')) : null;
  const tabs = saved && typeof saved === 'object' ? saved : { open: local.open || [], active: local.active || null };
  const custom = viewRows.filter((r) => r.object_type === type).map((r) => viewFromRow(r)).filter((v) => viewVisibleTo(v, { userId: settingsUserId, team: myTeam }));
  return { custom, open: Array.isArray(tabs.open) ? tabs.open : [], active: tabs.active || null };
}
export function setViewStore(type, store) {
  if (!viewRows) { write(K(type, 'views'), store); return; }
  // the tab state is personal: user_settings (plus the local copy)
  const tabs = { open: Array.isArray(store.open) ? store.open : [], active: store.active || null };
  write(K(type, 'views'), { custom: [], ...tabs });
  if (settingsLive()) setSetting(K(type, 'views:tabs'), tabs);
  // own views: upsert the new / changed ones, delete the removed ones; others' rows are never touched
  const current = viewRows.filter((r) => r.object_type === type);
  const next = (store.custom || []).filter((v) => v && v.id && v.mine !== false);
  const same = (a, b) => JSON.stringify({ ...a, updated_at: '' }) === JSON.stringify({ ...b, updated_at: '' });
  const changed = next.filter((v) => { const r = current.find((x) => x.id === String(v.id)); return !r || r.owner_id !== settingsUserId ? !r : !same(viewToRow(type, v), viewToRow(type, viewFromRow(r))); });
  const removed = current.filter((r) => r.owner_id === settingsUserId && !next.some((v) => String(v.id) === r.id));
  if (removed.length) viewRows = viewRows.filter((r) => !removed.some((x) => x.id === r.id));
  const rows = changed.map((v) => viewToRow(type, { ...v, ownerId: settingsUserId }));
  rows.forEach((row) => { const i = viewRows.findIndex((x) => x.id === row.id); if (i >= 0) viewRows[i] = { ...viewRows[i], ...row }; else viewRows.push(row); });
  if (typeof bump === 'function') bump();
  if (!rows.length && !removed.length) return;
  dbWrite(async () => {
    if (rows.length) { const { error } = await supabase.from('crm_views').upsert(rows, { onConflict: 'id' }); if (error) reportDbError('vistas guardadas', error); }
    if (removed.length) { const { error } = await supabase.from('crm_views').delete().in('id', removed.map((r) => r.id)); if (error) reportDbError('vistas guardadas', error); }
  });
}

// Validate the full catalog, including unique values outside the currently loaded page.
export async function validatePropertyValues(type, fields, { id = null, client = supabase } = {}) {
  validatePropertyValuesLocal(type, fields, id);
  for (const p of customProperties(type).filter((p) => !p.archived && p.unique)) {
    const value = fields[p.key];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    if (client) {
      let query = client.from(type).select('id').eq(dbColumnFor(type, p.key).column, value);
      if (id !== null) query = query.neq('id', id);
      const { data, error } = await query.limit(1);
      if (error) throw new Error(`No se pudo validar ${p.label}: ${error.message}`);
      if (data?.length) throw new Error(`${p.label}: ya existe un registro con ese valor. Debe ser único.`);
    }
  }
}
function validatePropertyValuesLocal(type, fields, id = null) {
  for (const p of customProperties(type).filter((p) => !p.archived)) {
    const value = fields[p.key];
    const empty = value === undefined || value === null || String(value).trim() === '';
    if (id === null && p.required && empty) throw new Error(`${p.label}: es obligatoria al crear.`);
    if (id !== null && Object.hasOwn(fields, p.key) && p.readOnly) throw new Error(`${p.label}: es de solo lectura.`);
    if (!empty && p.kind === 'text' && p.maxLength && Array.from(String(value)).length > p.maxLength) throw new Error(`${p.label}: máximo ${p.maxLength} caracteres.`);
    if (!empty && p.unique && (ALL[type]?.() || []).some((r) => String(r.id) !== String(id) && String(r[p.key]) === String(value))) throw new Error(`${p.label}: ya existe un registro con ese valor. Debe ser único.`);
  }
}

export function setField(type, id, field, value, opts = {}) {
  if (type === 'contacts' && field === 'marketingOptOut' && !opts.subscriptionInternal) {
    const contact = findRecord(type, id);
    if (!contact) throw new Error('Contacto no encontrado');
    const next = [true, 'true', 'Sí'].includes(value) ? 'Sí' : 'No';
    if (contact.marketingOptOut === next) return;
    const when = new Date().toISOString();
    setField(type, id, field, next, { ...opts, subscriptionInternal: true });
    setField(type, id, 'marketingOptOutAt', next === 'Sí' ? when : null);
    setField(type, id, 'marketingOptOutReason', opts.reason || (next === 'Sí' ? 'Baja manual desde la ficha' : 'Reactivación manual desde la ficha'));
    addActivity({ type: 'note', recordType: type, recordId: Number(id), text: next === 'Sí' ? 'Se dio de baja de los correos de marketing' : 'Reactivó su suscripción a los correos de marketing', who: opts.who || 'Marketing', when: Date.now(), extra: { reason: opts.reason || 'Cambio manual', marketingEmailId: opts.emailId || null } });
    // An unsubscribe stops the sequences with «Cancelar la inscripción cuando cancela la suscripción» (the
    // sequence module imports this one, hence the dynamic import).
    if (next === 'Sí') import('./sequences-data.js').then((m) => m.cancelOnUnsubscribe(Number(id), when)).catch((e) => console.error('[secuencias] baja de suscripción', e));
    return;
  }
  const closePatch = type === 'deals' && ['stage', 'pipeline', 'closeDate'].includes(field)
    ? dealClosePatch({ ...findIn(type, id), [field]: value }) : {};
  if (field === 'closeDate' && closePatch.closeDate) value = closePatch.closeDate;
  if (closePatch.closeDate) opts = { ...opts, automaticCloseDate: closePatch.closeDate };
  const completedAt = new Date();
  validatePropertyValuesLocal(type, { [field]: value }, id);
  if (type === 'tasks' && field === 'recur') value = normalizeRecur(value); // the editors hand over the freq string
  if (type === 'companies' && field === 'hs_additional_domains') value = normalizeAdditionalDomains(value, findIn(type, id)?.domain);
  if (type === 'companies' && field === 'domain') {
    const enriched = companyDomainEnrichment({ ...findIn(type, id), domain: value });
    for (const [key, next] of Object.entries(enriched)) setField(type, id, key, next, opts);
  }
  const previousValue = (type === 'tickets' && field === 'status') || ((type === 'contacts' || type === 'companies') && field === 'lifecycle') || (type === 'tasks' && ['status', 'due', 'contactId', 'companyId', 'dealId'].includes(field)) || (type === 'deals' && field === 'stage') || field === 'owner' ? findIn(type, id)?.[field] : undefined;
  // The lifecycle rules of Ajustes (only forward, no skipping, owner required past Lead) stop a manual change
  // with the reason; automations check their own rules before writing (opts.lifecycleAuto).
  if ((type === 'contacts' || type === 'companies') && field === 'lifecycle' && !opts.lifecycleAuto) {
    const block = applyLifecycleRules(type, findIn(type, id), value);
    if (block) throw new Error(`${block}.`);
  }
  if (dbLive) {
    const rec = (dbRows[type] || []).find((r) => Number(r.id) === Number(id));
    if (rec) Object.assign(rec, { [field]: value }, closePatch);
    bump();
    const col = (CAMEL_TO_DB[type] && CAMEL_TO_DB[type][field]) || field;
    dbWrite(async () => {
      if (TABLE_COLS[type].includes(col)) {
        const stored = INTEGER_COLS.has(col) && value !== null && value !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value)) : value;
        const { error } = await supabase.from(type).update({ [col]: stored, ...(closePatch.closeDate ? { close_date: closePatch.closeDate } : {}) }).eq('id', id);
        if (error) reportDbError(`actualizar ${type}`, error);
        else if (type === 'tasks' && field === 'status' && value === 'done') {
          await resumeTaskSequence(findRecord('tasks', id), completedAt);
        }
      } else {
        const { data: row, error: readErr } = await supabase.from(type).select('extra').eq('id', id).single();
        if (readErr) { console.error('[supabase] read extra', type, readErr); return; }
        const extra = { ...(row?.extra || {}), [field]: value };
        const { error } = await supabase.from(type).update({ extra }).eq('id', id);
        if (error) console.error('[supabase] update extra', type, error);
      }
    });
    afterSet(type, id, field, value, opts, previousValue);
    return;
  }
  const o = getOverrides(type);
  o[id] = { ...(o[id] || {}), [field]: value, ...closePatch };
  write(K(type, 'overrides'), o);
  if (type === 'tasks' && field === 'status' && value === 'done') {
    const task = findRecord('tasks', id);
    dbWrite(() => resumeTaskSequence(task, completedAt));
  }
  afterSet(type, id, field, value, opts, previousValue);
}

// ---------- papelera (soft-delete): contacts, companies, deals and tickets keep their rows with deleted_at ----------
// (tasks are not recycled, as in the original). Tickets need supabase/soft_delete_tickets.sql on the database.
const SOFT_DELETE = new Set(['contacts', 'companies', 'deals', 'tickets']);
const trashRows = {}; // live: deleted rows per type (deletedAt set), out of dbRows
const DELETED_AT_KEY = (type) => K(type, 'deletedat'); // local: id → when it was deleted
// A missing migration must never change a recoverable deletion into a physical DELETE.
export const softDeletes = (type) => SOFT_DELETE.has(type);
// Deleting tasks also recomputes «Próxima actividad» of the records they counted for.
export function deleteRecords(type, ids) {
  const links = type === 'tasks' ? cached('tasks').filter((t) => ids.map(Number).includes(Number(t.id)) || ids.map(Number).includes(Number(t.parentId))).flatMap(taskLinks) : [];
  deleteRecordsNow(type, ids);
  links.forEach(([t, rid]) => { try { recomputeNextActivity(t, rid); } catch (e) { console.error('[próxima actividad]', e); } });
}
function deleteRecordsNow(type, ids) {
  const doomed = new Set(ids.map(Number));
  if (type === 'tasks') {
    // Match the database cascade in the local and optimistic caches.
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of cached('tasks')) {
        if (doomed.has(Number(t.parentId)) && !doomed.has(Number(t.id))) {
          doomed.add(Number(t.id));
          changed = true;
        }
      }
    }
    ids = [...doomed];
  }
  if (dbLive) {
    const rows = dbRows[type] || [];
    const stamp = new Date().toISOString();
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (doomed.has(Number(rows[i].id))) {
        const [r] = rows.splice(i, 1);
        if (softDeletes(type)) (trashRows[type] = trashRows[type] || []).unshift({ ...r, deletedAt: stamp });
      }
    }
    bump();
    dbWrite(async () => {
      const q = softDeletes(type) ? supabase.from(type).update({ deleted_at: stamp }).in('id', [...doomed]) : supabase.from(type).delete().in('id', [...doomed]);
      const { error } = await q;
      if (error) reportDbError(`eliminar ${type}`, error);
    });
    return;
  }
  const d = getDeleted(type);
  const when = read(DELETED_AT_KEY(type), {});
  const stamp = new Date().toISOString();
  ids.forEach((id) => { d.add(Number(id)); when[Number(id)] = stamp; });
  write(DELETED_AT_KEY(type), when);
  write(K(type, 'deleted'), [...d]);
}
// The deleted records of a type, newest deletion first (the "Restaurar registros eliminados" view).
export function trashedRecords(type) {
  if (dbLive) return (trashRows[type] || []).slice().sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
  const d = getDeleted(type);
  if (!d.size) return [];
  const when = read(DELETED_AT_KEY(type), {});
  const all = [...getExtra(type).map((r) => augment(type, { ...r })), ...baseRecords(type)];
  const overrides = getOverrides(type);
  return all.filter((r) => d.has(Number(r.id))).map((r) => ({ ...r, ...(overrides[r.id] || {}), deletedAt: when[Number(r.id)] || '' })).sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
}
// Puts deleted records back (deleted_at = null).
export function restoreRecords(type, ids) {
  const wanted = new Set(ids.map(Number));
  if (dbLive) {
    const trash = trashRows[type] || [];
    const back = [];
    for (let i = trash.length - 1; i >= 0; i -= 1) {
      if (wanted.has(Number(trash[i].id))) { const [r] = trash.splice(i, 1); const { deletedAt, ...rest } = r; back.push({ ...rest, deletedAt: null }); }
    }
    if (!back.length) return 0;
    (dbRows[type] = dbRows[type] || []).push(...back);
    dbRows[type].sort((a, b) => Number(a.id) - Number(b.id));
    bump();
    dbWrite(async () => {
      const { error } = await supabase.from(type).update({ deleted_at: null }).in('id', back.map((r) => Number(r.id)));
      if (error) reportDbError(`restaurar ${type}`, error);
    });
    return back.length;
  }
  const d = getDeleted(type);
  const when = read(DELETED_AT_KEY(type), {});
  let n = 0;
  wanted.forEach((id) => { if (d.delete(id)) n += 1; delete when[id]; });
  write(DELETED_AT_KEY(type), when);
  write(K(type, 'deleted'), [...d]);
  return n;
}

// ---------- purga de la papelera: lo que Configuración y las fichas prometen («90 días») ----------
// Once a day at start-up (schedulePurge, end of this file) what expired leaves for good: records whose deleted_at
// is older than TRASH_DAYS (with their activities, company links and line items), activities in the trash that
// old, and archived custom properties that old (archived_at: supabase/custom-properties-archived-at.sql; while
// that column is pending the properties step is skipped and listed in `pending`). Local mode sweeps localStorage
// the same way; seeded demo records that were purged stay out through K(type, 'purged').
export const TRASH_DAYS = 90;
const PURGED_AT_KEY = 'crm:trash:purged-at';
const PURGED_KEY = (type) => K(type, 'purged');
const purgeReport = () => ({ records: Object.fromEntries([...SOFT_DELETE].map((t) => [t, 0])), activities: 0, properties: 0, pending: [], errors: [] });
const purgeCutoff = ({ now = Date.now(), days = TRASH_DAYS } = {}) => { const ms = now - days * 86400000; return { ms, iso: new Date(ms).toISOString() }; };
function purgeLocalTrash(opts) {
  const { ms: cutoffMs, iso: cutoff } = purgeCutoff(opts);
  const out = purgeReport();
  let changed = false;
  for (const type of SOFT_DELETE) {
    const when = read(DELETED_AT_KEY(type), {});
    const expired = Object.keys(when).filter((id) => when[id] && String(when[id]) < cutoff).map(Number);
    if (!expired.length) continue;
    const gone = new Set(expired);
    const extra = read(K(type, 'extra'), []);
    const added = new Set(extra.map((r) => Number(r.id)));
    write(K(type, 'extra'), extra.filter((r) => !gone.has(Number(r.id))));
    const overrides = read(K(type, 'overrides'), {});
    expired.forEach((id) => { delete overrides[id]; delete when[id]; localStorage.removeItem(ACT_NOTES_KEY(type, id)); localStorage.removeItem(ACT_TRASH_KEY(type, id)); });
    write(K(type, 'overrides'), overrides);
    write(DELETED_AT_KEY(type), when);
    write(K(type, 'deleted'), read(K(type, 'deleted'), []).filter((id) => !gone.has(Number(id))));
    const purged = new Set(read(PURGED_KEY(type), []).map(Number));
    expired.forEach((id) => { if (!added.has(id)) purged.add(id); });
    write(PURGED_KEY(type), [...purged]);
    if (type === 'deals') write(LINE_ITEMS_KEY, read(LINE_ITEMS_KEY, []).filter((l) => !gone.has(Number(l.dealId))));
    delete baseCache[type];
    out.records[type] = expired.length;
    changed = true;
  }
  // activities in the trash (crm:<type>:activity-trash:<id>, extra.deletedAt in ms)
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (!key || !/^crm:[^:]+:activity-trash:.+$/.test(key)) continue;
    const rows = read(key, []);
    const keep = rows.filter((a) => !(a && a.extra && a.extra.deletedAt && Number(a.extra.deletedAt) < cutoffMs));
    if (keep.length === rows.length) continue;
    out.activities += rows.length - keep.length;
    if (keep.length) write(key, keep); else localStorage.removeItem(key);
    changed = true;
  }
  out.properties = purgeArchivedLocalProperties(cutoff);
  if (changed || out.properties) bump();
  return out;
}
async function purgeRemoteTrash(opts) {
  const { ms: cutoffMs, iso: cutoff } = purgeCutoff(opts);
  const out = purgeReport();
  const fail = (what, error) => { console.error('[papelera] purga', what, error); out.errors.push(`${what}: ${(error && error.message) || error}`); };
  for (const type of SOFT_DELETE) {
    const { data, error } = await supabase.from(type).select('id').lt('deleted_at', cutoff).limit(1000);
    if (error) { fail(type, error); continue; }
    const ids = (data || []).map((r) => Number(r.id));
    if (!ids.length) continue;
    // what hangs from the records (no cascades in the schema): timeline, company links, line items
    const steps = [supabase.from('activities').delete().eq('record_type', type).in('record_id', ids)];
    if (type === 'contacts') steps.push(supabase.from('contact_companies').delete().in('contact_id', ids));
    if (type === 'companies') steps.push(supabase.from('contact_companies').delete().in('company_id', ids));
    if (type === 'deals') steps.push(supabase.from('deal_line_items').delete().in('deal_id', ids));
    for (const step of steps) { const { error: e } = await step; if (e && e.code !== '42P01') fail(`${type} (dependencias)`, e); }
    const { error: delErr } = await supabase.from(type).delete().in('id', ids).lt('deleted_at', cutoff);
    if (delErr) { fail(type, delErr); continue; }
    const gone = new Set(ids);
    trashRows[type] = (trashRows[type] || []).filter((r) => !gone.has(Number(r.id)));
    activityRows = activityRows.filter((a) => !(a.recordType === type && gone.has(Number(a.recordId))));
    if (type === 'deals') lineItemRows = lineItemRows.filter((l) => !gone.has(Number(l.dealId)));
    out.records[type] = ids.length;
  }
  // activities in the trash (extra.deletedAt in ms) older than the cutoff
  const { data: acts, error: actErr } = await supabase.from('activities').select('id, extra').not('extra->>deletedAt', 'is', null).limit(1000);
  if (actErr) fail('actividades', actErr);
  else {
    const ids = (acts || []).filter((a) => a.extra && Number(a.extra.deletedAt) < cutoffMs).map((a) => a.id);
    if (ids.length) {
      const { error: e } = await supabase.from('activities').delete().in('id', ids);
      if (e) fail('actividades', e);
      else { const gone = new Set(ids.map(String)); activityRows = activityRows.filter((a) => !gone.has(String(a.id))); out.activities = ids.length; }
    }
  }
  // archived custom properties older than the cutoff (needs custom_properties.archived_at)
  if (archivedAtColumn === false) out.pending.push('custom-properties-archived-at.sql');
  else {
    const { data: props, error: propErr } = await supabase.from('custom_properties').select('objeto, name').eq('archived', true).lt('archived_at', cutoff);
    if (propErr) { if (missingColumn(propErr, 'archived_at')) { archivedAtColumn = false; out.pending.push('custom-properties-archived-at.sql'); } else fail('propiedades', propErr); }
    else if (props && props.length) {
      const { error: e } = await supabase.from('custom_properties').delete().eq('archived', true).lt('archived_at', cutoff);
      if (e) fail('propiedades', e);
      else { out.properties = props.length; loadCustomProperties(await fetchCustomProperties()); }
    }
  }
  out.properties += purgeArchivedLocalProperties(cutoff); // tasks keep their custom properties in localStorage
  if (Object.values(out.records).some(Boolean) || out.activities || out.properties) bump();
  return out;
}
// The sweep, on demand: { records: { contacts: n, … }, activities, properties, pending, errors }.
export async function purgeExpiredTrash(opts = {}) {
  return dbLive ? purgeRemoteTrash(opts) : purgeLocalTrash(opts);
}
export const trashPurgedAt = () => Number(localStorage.getItem(PURGED_AT_KEY) || 0) || null;

// "Gestionar duplicados": merges `otherIds` into `keepId`. Empty fields of the kept record are filled from
// the others, everything associated to the others now points to it, and the others go to the trash.
// Properties the merge never copies between records (identity, dates the app maintains, associations handled below).
export const MERGE_SKIP = new Set(['id', 'created', 'deletedAt', 'lastActivity', 'lastActivityType', 'company', 'companyId', 'parentCompanyId']);
const mergeEmpty = (v) => v === undefined || v === null || v === '' || v === 'Sin asignar';
// A catalogue value that is only the sample decoration of augment() (never stored) counts as empty for a merge:
// it must not be offered as a "conflict" nor protect a gap from a real value of the duplicate.
export function isDecorated(type, r, key) {
  if (!r || r[key] === undefined || r[key] === null) return false;
  const props = PROP_CACHE[type] || (PROP_CACHE[type] = propertyList(type));
  const p = props.find((x) => x.key === key);
  if (!p || p.custom || REAL_ONLY.has(key)) return false;
  const marks = DECORATED.get(r);
  // augment() wrote it and nobody edited it since (the value is still the one it wrote)
  if (marks) return marks.has(key) && String(r[key]) === marks.get(key);
  // a copy augment() never saw: only the kinds whose samples are distinctive can be told apart
  if (['enum', 'user', 'bool'].includes(p.kind)) return false;
  try { return String(r[key]) === String(sampleValue(p, r, type)); } catch { return false; }
}
const mergeHas = (type, r, k) => !mergeEmpty(r[k]) && typeof r[k] !== 'object' && !isDecorated(type, r, k);
// The properties a merge fills into `keep` from `other`: really filled there, empty (or only decorated) here.
export function mergeFillable(type, keep, other) {
  return Object.keys(other || {}).filter((k) => !MERGE_SKIP.has(k) && k !== 'name' && k !== 'first' && k !== 'last' && !k.startsWith('assoc_') && !k.startsWith('num_') && !k.startsWith('hs_lifecyclestage_')
    && mergeHas(type, other, k) && (mergeEmpty(keep[k]) || isDecorated(type, keep, k)));
}
const CASELESS = new Set(['email', 'alt_email', 'domain', 'website', 'hs_additional_emails', 'hs_additional_domains']);
// The properties where the kept record and a duplicate differ (both really filled), for the side-by-side
// dialog: [{ key, keep: value, other: value }]. The name parts are included so the person can choose them;
// a contact's full name follows first/last and is not a row of its own.
export function mergeConflicts(type, keep, other) {
  const out = [];
  const keys = [...new Set([...Object.keys(keep || {}), ...Object.keys(other || {})])];
  for (const k of keys) {
    if (MERGE_SKIP.has(k) || k.startsWith('assoc_') || k.startsWith('num_') || k.startsWith('hs_lifecyclestage_') || (type === 'contacts' && k === 'name')) continue;
    if (!mergeHas(type, keep, k) || !mergeHas(type, other, k)) continue;
    const a = keep[k]; const b = other[k];
    const same = CASELESS.has(k) ? String(a).trim().toLowerCase() === String(b).trim().toLowerCase() : String(a) === String(b);
    if (!same) out.push({ key: k, keep: a, other: b });
  }
  return out;
}
// Merges the duplicates into `keep`: empty properties of `keep` are filled from the duplicates; `choices`
// ({ key: value }) are the values the person picked in the comparison dialog for the properties that differ
// (default: the kept record's own value); associations (deals, tickets, tasks, companies, hierarchy), the
// timeline entries and the sequence enrolments of the duplicates move to `keep`; the duplicates go to the trash
// (restorable) and the timeline records the merge. Returns { kept, merged, filled, chosen }.
export function mergeRecords(type, keepId, otherIds, { choices = {} } = {}) {
  const all = ALL[type]();
  const keep = all.find((r) => Number(r.id) === Number(keepId));
  const others = (otherIds || []).map((id) => all.find((r) => Number(r.id) === Number(id))).filter((r) => r && Number(r.id) !== Number(keepId));
  if (!keep || !others.length) return null;
  const filled = [];
  const chosen = [];
  const empty = mergeEmpty;
  // the person's picks first (a chosen value replaces the kept one), then the gaps
  Object.entries(choices || {}).forEach(([k, v]) => {
    if (MERGE_SKIP.has(k) || k === 'id' || empty(v) || String(keep[k] ?? '') === String(v)) return;
    keep[k] = v; chosen.push(k); setField(type, keep.id, k, v);
  });
  if (type === 'contacts' && (chosen.includes('first') || chosen.includes('last'))) { const full = `${keep.first || ''} ${keep.last || ''}`.trim(); if (full && full !== keep.name) { keep.name = full; setField(type, keep.id, 'name', full); } }
  others.forEach((o) => mergeFillable(type, keep, o).forEach((k) => { keep[k] = o[k]; filled.push(k); setField(type, keep.id, k, o[k]); }));
  const ids = new Set(others.map((o) => Number(o.id)));
  // Multi associations live in the related records' extra (assoc_<kind> + assoc_labels_<kind>): every id of a merged
  // duplicate now points at the kept record (deduplicated, «Principal» kept), so no association is lost in a merge.
  const remapAssoc = (t, kind) => ALL[t]().forEach((x) => {
    const arr = Array.isArray(x[`assoc_${kind}`]) ? x[`assoc_${kind}`] : null;
    if (!arr || !arr.some((v) => ids.has(Number(v)))) return;
    setField(t, x.id, `assoc_${kind}`, [...new Set(arr.map((v) => (ids.has(Number(v)) ? Number(keep.id) : Number(v))))]);
    const labels = x[`assoc_labels_${kind}`];
    if (labels && typeof labels === 'object') {
      const next = {};
      Object.entries(labels).forEach(([k, v]) => { const nk = ids.has(Number(k)) ? String(Number(keep.id)) : k; if (next[nk] === undefined || v === 'Principal') next[nk] = v; });
      setField(t, x.id, `assoc_labels_${kind}`, next);
    }
  });
  // The duplicates' own multi associations (their assoc_<kind> arrays) join the kept record's, labels included.
  const unionAssoc = (skip = []) => {
    const kinds = new Set();
    [keep, ...others].forEach((r) => Object.keys(r).forEach((k) => { const m = /^assoc_(?!labels_)(\w+)$/.exec(k); if (m && !skip.includes(m[1])) kinds.add(m[1]); }));
    kinds.forEach((kind) => {
      const merged = [...new Set([...(keep[`assoc_${kind}`] || []), ...others.flatMap((o) => o[`assoc_${kind}`] || [])].map(Number).filter((n) => n > 0 && !(kind === type && ids.has(n))))];
      if (merged.length === (keep[`assoc_${kind}`] || []).length && merged.every((n) => (keep[`assoc_${kind}`] || []).map(Number).includes(n))) return;
      setField(type, keep.id, `assoc_${kind}`, merged);
      setField(type, keep.id, `assoc_labels_${kind}`, Object.assign({}, ...others.map((o) => o[`assoc_labels_${kind}`] || {}), keep[`assoc_labels_${kind}`] || {}));
    });
  };
  if (type === 'contacts') {
    ['deals', 'tickets', 'tasks'].forEach((t) => ALL[t]().forEach((x) => { if (ids.has(Number(x.contactId))) { setField(t, x.id, 'contactId', Number(keep.id)); if (t === 'tasks') setField(t, x.id, 'contact', keep.name); } }));
    ['deals', 'tickets', 'tasks', 'companies'].forEach((t) => remapAssoc(t, 'contacts'));
    unionAssoc(['companies']); // companies: the primary / links below
    const links = [...new Set([Number(keep.companyId) || 0, ...(keep.assoc_companies || []).map(Number), ...others.flatMap((o) => [Number(o.companyId) || 0, ...(o.assoc_companies || []).map(Number)])].filter((n) => n > 0))];
    if (links.length) {
      const labels = Object.assign({}, ...others.map((o) => o.assoc_labels_companies || {}), keep.assoc_labels_companies || {});
      if (!keep.companyId) { const first = others.find((o) => o.companyId); if (first) { setField('contacts', keep.id, 'companyId', Number(first.companyId)); setField('contacts', keep.id, 'company', first.company || ''); } }
      setField('contacts', keep.id, 'assoc_companies', links);
      setField('contacts', keep.id, 'assoc_labels_companies', labels);
    }
  } else if (type === 'companies') {
    allContacts().forEach((c) => {
      if (ids.has(Number(c.companyId))) { setField('contacts', c.id, 'companyId', Number(keep.id)); setField('contacts', c.id, 'company', keep.name); }
    });
    ['contacts', 'deals', 'tickets', 'tasks'].forEach((t) => remapAssoc(t, 'companies'));
    ['deals', 'tickets'].forEach((t) => ALL[t]().forEach((x) => { if (ids.has(Number(x.companyId))) { setField(t, x.id, 'companyId', Number(keep.id)); setField(t, x.id, 'company', keep.name); } }));
    unionAssoc();
    allCompanies().forEach((c) => { if (ids.has(Number(c.parentCompanyId)) && Number(c.id) !== Number(keep.id)) setField('companies', c.id, 'parentCompanyId', Number(keep.id)); });
    if (!keep.parentCompanyId) { const withParent = others.find((o) => o.parentCompanyId && !ids.has(Number(o.parentCompanyId)) && Number(o.parentCompanyId) !== Number(keep.id)); if (withParent) setField('companies', keep.id, 'parentCompanyId', Number(withParent.parentCompanyId)); }
  }
  // the duplicates' timeline entries and sequence enrolments follow the kept record
  others.forEach((o) => { try { moveActivities(type, o.id, keep.id); } catch (e) { console.error('[fusión] cronología', e); } });
  if (type === 'contacts') import('./sequences-data.js').then((m) => m.moveEnrollments([...ids], keep)).catch((e) => console.error('[fusión] secuencias', e));
  addActivity({ type: 'stage', recordType: type, recordId: Number(keep.id), text: `Registros fusionados en este ${type === 'contacts' ? 'contacto' : type === 'companies' ? 'empresa' : 'registro'}: ${others.map((o) => o.name).join(', ')}.`, who: 'Tú', when: Date.now(), extra: { merged: [...ids] } });
  deleteRecords(type, [...ids]);
  return { kept: keep, merged: others.length, filled, chosen };
}
// Every timeline entry (and trashed entry) of `fromId` now belongs to `toId`: a merged duplicate's history is
// not lost. extra.mergedFrom keeps where it came from.
export function moveActivities(recordType, fromId, toId) {
  if (Number(fromId) === Number(toId)) return 0;
  let n = 0;
  if (activitiesLive) {
    activityRows.forEach((a) => { if (a.recordType === recordType && Number(a.recordId) === Number(fromId)) { a.recordId = Number(toId); a.extra = { ...(a.extra || {}), mergedFrom: Number(fromId) }; n += 1; } });
    dbWrite(async () => {
      const { error } = await supabase.from('activities').update({ record_id: Number(toId) }).eq('record_type', recordType).eq('record_id', Number(fromId));
      if (error) console.error('[supabase] mover actividades', error);
    });
    return n;
  }
  for (const keyOf of [ACT_NOTES_KEY, ACT_TRASH_KEY]) {
    const from = localActivities(keyOf(recordType, fromId), recordType, fromId);
    if (!from.length) continue;
    const to = localActivities(keyOf(recordType, toId), recordType, toId);
    from.forEach((a) => { a.recordId = Number(toId); a.extra = { ...(a.extra || {}), mergedFrom: Number(fromId) }; });
    write(keyOf(recordType, toId), [...from, ...to]);
    write(keyOf(recordType, fromId), []);
    n += from.length;
  }
  return n;
}

export function restoreAll(type) {
  if (dbLive && softDeletes(type)) return restoreRecords(type, (trashRows[type] || []).map((r) => r.id));
  if (dbLive) {
    // Hard-deleted types: "restore" re-inserts the sample records whose ids are missing.
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
      if (error) reportDbError(`restaurar ${type}`, error);
    });
    return;
  }
  write(K(type, 'deleted'), []);
}

// ---------- task reminders (Ajustes › General › Tareas › «Recordatorio predeterminado») ----------
// A task carries reminderAt (ISO date-time, '' = none) and reminderFiredAt once the checker in
// src/task-reminders.js has shown it. New tasks without an explicit reminder get the default one.
export const REMINDER_OPTIONS = ['Sin recordatorio', 'El día de vencimiento a las 9:00', '1 hora antes', '1 día antes'];
export const DEFAULT_REMINDER = 'El día de vencimiento a las 9:00';
export function defaultReminderOption() {
  try { const s = JSON.parse(localStorage.getItem('crm:settings:general-tareas')) || {}; return REMINDER_OPTIONS.includes(s.reminder) ? s.reminder : DEFAULT_REMINDER; } catch { return DEFAULT_REMINDER; }
}
// The moment a task is due: its own time, or 9:00 of its day when the due date carries no time (a date-only
// pick is stored as midnight, UTC from the date inputs or local from the seeds).
export function dueMoment(due) {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0, 0, 0);
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0, 0);
  return d;
}
// ---------- recurring tasks («Repetir»: daily / weekly / monthly / yearly) ----------
// The frequency lives on the task as recur = { freq } (extra jsonb in the database, no migration). Completing a
// recurring task (anywhere: queue, list checkbox, record card, task record) creates the next occurrence with the
// same title / type / priority / owner / associations, the due date shifted by the frequency (calendar days,
// UTC arithmetic so a date-only due keeps its day) and the default reminder re-armed by addRecord.
export const RECUR_OPTIONS = [['', 'Sin repetición'], ['daily', 'Diaria'], ['weekly', 'Semanal'], ['monthly', 'Mensual'], ['yearly', 'Anual']];
export function normalizeRecur(v) {
  const f = v && typeof v === 'object' ? v.freq : v;
  return RECUR_OPTIONS.some(([k]) => k && k === f) ? { freq: f } : null;
}
export const recurLabel = (t) => (RECUR_OPTIONS.find(([k]) => k === ((t && t.recur && t.recur.freq) || '')) || RECUR_OPTIONS[0])[1];
export function nextRecurrence(due, freq, from = new Date()) {
  let d = due ? new Date(due) : new Date(from);
  if (Number.isNaN(d.getTime())) d = new Date(from);
  if (freq === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (freq === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (freq === 'monthly' || freq === 'yearly') {
    // Same day of the following month / year, clamped to that month's length (31 → 30, 29 feb → 28 feb).
    const day = d.getUTCDate();
    d.setUTCDate(1);
    if (freq === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCFullYear(d.getUTCFullYear() + 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  } else return null;
  return d.toISOString();
}
function spawnNextOccurrence(t) {
  const r = normalizeRecur(t.recur);
  if (!r) return null;
  const due = nextRecurrence(t.due, r.freq);
  const fields = { name: t.name, type: t.type, priority: t.priority, status: 'todo', owner: t.owner, contact: t.contact || '', contactId: t.contactId || '', due, recur: { freq: r.freq }, lastActivity: new Date().toISOString() };
  ['dealId', 'ticketId', 'companyId', 'queueId'].forEach((k) => { if (t[k]) fields[k] = t[k]; });
  // No reminderAt here: addRecord re-arms the default reminder from the new due date (and no reminderFiredAt).
  const next = addRecord('tasks', fields, { origin: `repetición ${recurLabel(t).toLowerCase()} de la tarea «${t.name}»` });
  const when = formatDate(due);
  logSystem('tasks', t.id, `Tarea recurrente completada: se creó la siguiente para el ${when}.`, { task: next.id });
  if (t.contactId) logSystem('contacts', t.contactId, `Tarea recurrente «${t.name}» completada: se creó la siguiente para el ${when}.`, { task: next.id });
  if (t.dealId) logSystem('deals', t.dealId, `Tarea recurrente «${t.name}» completada: se creó la siguiente para el ${when}.`, { task: next.id });
  return next;
}
export function reminderFromDue(due, option = defaultReminderOption()) {
  const d = dueMoment(due);
  if (!d || !option || option === 'Sin recordatorio') return '';
  if (option === 'El día de vencimiento a las 9:00') return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0, 0).toISOString();
  if (option === '1 hora antes') return new Date(d.getTime() - 3600000).toISOString();
  if (option === '1 día antes') return new Date(d.getTime() - DAY).toISOString();
  return '';
}

// opts.origin: where the record comes from ("Creación manual", "Importación"…), for the timeline entry.
export function addRecord(type, fields, opts = {}) {
  if (type === 'deals') fields = { ...fields, ...dealClosePatch(fields) };
  // A new task without an explicit reminder gets the default one from Ajustes (none for completed ones).
  if (type === 'tasks' && fields && fields.reminderAt === undefined && fields.status !== 'done') fields = { ...fields, reminderAt: reminderFromDue(fields.due) };
  if (type === 'companies' && fields && fields.hs_additional_domains !== undefined) fields = { ...fields, hs_additional_domains: normalizeAdditionalDomains(fields.hs_additional_domains, fields.domain) };
  if (type === 'companies') fields = { ...fields, ...companyDomainEnrichment(fields) };
  validatePropertyValuesLocal(type, fields);
  if (dbLive) {
    const id = nextId[type];
    nextId[type] += 1;
    const rec = { id, created: TODAY.toISOString(), ...fields };
    (dbRows[type] = dbRows[type] || []).unshift(augment(type, { ...rec }));
    bump();
    const pending = dbWrite(async () => {
      let payload = toDb(type, rec, true);
      let { error } = await supabase.from(type).insert(payload);
      if (error && error.code === '23505') {
        // The id was taken by another tab/session after this page loaded: take the real max and retry once.
        const { data: top } = await supabase.from(type).select('id').order('id', { ascending: false }).limit(1);
        const fresh = ((top && top[0] && Number(top[0].id)) || 0) + 1;
        nextId[type] = Math.max(nextId[type] || 1, fresh + 1);
        const mem = (dbRows[type] || []).find((r) => Number(r.id) === Number(rec.id));
        if (mem) mem.id = fresh;
        rec.id = fresh;
        payload = toDb(type, rec, true);
        ({ error } = await supabase.from(type).insert(payload));
      }
      if (error) {
        // Roll the optimistic record back so it does not look saved.
        const rows = dbRows[type] || [];
        const i = rows.findIndex((r) => Number(r.id) === Number(rec.id));
        if (i >= 0) rows.splice(i, 1);
        bump();
        throw error;
      }
    });
    if (opts.waitForSave) return pending.then(async () => {
      afterAdd(type, rec, opts);
      await dbIdle();
      return rec;
    });
    return afterAdd(type, rec, opts);
  }
  const extra = getExtra(type);
  const rec = { id: 1000 + extra.length + 1, created: TODAY.toISOString(), ...fields };
  extra.unshift(rec);
  write(K(type, 'extra'), extra);
  return afterAdd(type, rec, opts);
}
// ---------- automatic timeline entries (type 'system') ----------
export const SYSTEM_WHO = 'Sistema';
export function logSystem(recordType, recordId, text, extra = {}) {
  if (!recordType || !recordId) return;
  addActivity({ type: 'system', recordType, recordId: Number(recordId), text, who: SYSTEM_WHO, when: Date.now(), extra });
}
const RECORD_WORD = { contacts: 'Contacto', companies: 'Empresa', deals: 'Negocio', tickets: 'Ticket', tasks: 'Tarea' };
const findIn = (type, id) => findRecord(type, id);
// Rules that run right after a record is created or a field changes (companies by e-mail domain, §2 of the
// companies specification). They never break the write that triggered them.
const COMPANY_LINK_FIELDS = new Set(['companyId', 'assoc_companies', 'assoc_labels_companies']);

// ---------- «Fecha de la próxima actividad» (notes_next_activity_date) ----------
// The nearest upcoming date among the record's open tasks (due today or later) and its scheduled meetings
// (future meeting entries on its timeline); empty when there is none. Contacts count their own tasks, companies
// theirs, deals theirs plus their contact's (as the board does). Recomputed whenever a task or a meeting of the
// record changes: addRecord / setField / deleteRecords of tasks, addActivity / updateActivity / deleteActivity.
const NEXT_ACTIVITY_TYPES = new Set(['contacts', 'companies', 'deals']);
function taskLinks(t) {
  const out = [];
  if (!t) return out;
  if (t.contactId) out.push(['contacts', Number(t.contactId)]);
  if (t.companyId) out.push(['companies', Number(t.companyId)]);
  if (t.dealId) out.push(['deals', Number(t.dealId)]);
  if (t.contactId) allDeals().filter((d) => Number(d.contactId) === Number(t.contactId)).forEach((d) => out.push(['deals', Number(d.id)]));
  return out;
}
const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); };
export function nextActivityOf(type, id) {
  if (!NEXT_ACTIVITY_TYPES.has(type)) return '';
  const rec = findIn(type, id);
  if (!rec) return '';
  const from = startOfToday();
  const now = Date.now();
  const mine = (t) => t.status !== 'done' && t.due && (
    (type === 'contacts' && Number(t.contactId) === Number(id))
    || (type === 'companies' && Number(t.companyId) === Number(id))
    || (type === 'deals' && (Number(t.dealId) === Number(id) || (rec.contactId && Number(t.contactId) === Number(rec.contactId)))));
  const dates = [];
  allTasks().forEach((t) => { if (mine(t)) { const ts = new Date(t.due).getTime(); if (ts >= from) dates.push(ts); } });
  activitiesFor(type, id).forEach((a) => { if (a.type === 'meeting') { const ts = new Date(a.when).getTime(); if (ts >= now) dates.push(ts); } });
  return dates.length ? new Date(Math.min(...dates)).toISOString() : '';
}
export function recomputeNextActivity(type, id) {
  if (!NEXT_ACTIVITY_TYPES.has(type) || !id) return null;
  const rec = findIn(type, id);
  if (!rec) return null;
  const next = nextActivityOf(type, id);
  const cur = rec.notes_next_activity_date || '';
  const same = cur && next ? new Date(cur).getTime() === new Date(next).getTime() : !cur && !next;
  if (!same) setField(type, id, 'notes_next_activity_date', next);
  return next;
}
const recomputeForTask = (t) => taskLinks(t).forEach(([ty, rid]) => { try { recomputeNextActivity(ty, rid); } catch (e) { console.error('[próxima actividad]', e); } });
const afterMeetingMutation = (p) => p.then((a) => { if (a && a.type === 'meeting' && NEXT_ACTIVITY_TYPES.has(a.recordType)) { try { recomputeNextActivity(a.recordType, a.recordId); } catch (e) { console.error('[próxima actividad]', e); } } return a; });

// ---------- Etapa del ciclo de vida: rules and automations (Ajustes › Objetos › Contactos / Empresas) ----------
// Records store the stage label; the definition's order is the ladder. «Otro» is outside it: automations never
// move a record into or out of it and the rules do not apply to it.
const LC_WORD = { contacts: 'El contacto', companies: 'La empresa' };
const lcStages = (def) => def.stages.filter((s) => s[0] !== 'other');
const lcIndex = (def, label) => lcStages(def).findIndex((s) => s[1] === label);
const lcLabel = (def, id) => (def.stages.find((s) => s[0] === id) || [])[1] || '';
const lcSync = (def) => ({ onDeal: true, onWon: true, company: true, ...(def.sync || {}) });
const noOwner = (r) => !r || !r.owner || r.owner === 'Sin asignar';
// Won in a given pipeline: the built-in «won» key or any stage whose forecast category is won.
export function dealStageIsWon(pipeline, key) {
  if (key === 'won') return true;
  const stage = (typeof stagesFor === 'function' ? stagesFor(pipeline) : []).find((s) => s[0] === key);
  return Boolean(stage) && stageForecastCategory(stage) === 'won';
}
// Why a lifecycle change is not allowed by the definition's rules, or null. `automatic` = made by an automation
// (deal created or won, contact ↔ company sync): only «lockCustomer» and «requireOwner» apply to those; a manual
// change is checked against «noBack», «noSkip» and «requireOwner».
export function applyLifecycleRules(type, record, newStage, { automatic = false, def = lifecycleDef() } = {}) {
  const rules = def.rules || {};
  const from = record ? record.lifecycle || '' : '';
  if (!newStage || from === newStage) return null;
  const i = lcIndex(def, from);
  const j = lcIndex(def, newStage);
  if (j < 0) return null; // «Otro» or a stage the definition does not know: nothing to enforce here
  const who = `${LC_WORD[type] || 'El registro'}${record && record.name ? ` «${record.name}»` : ''}`;
  if (automatic) {
    const ci = lcIndex(def, lcLabel(def, 'customer'));
    if (rules.lockCustomer && ci >= 0 && i >= ci) return `${who} está en «${from}» y la regla «No cambiar automáticamente la etapa de los clientes» lo mantiene ahí`;
  } else {
    if (rules.noBack && i >= 0 && j < i) return `${who} no puede retroceder de «${from}» a «${newStage}»: la regla «Solo permitir avanzar de etapa» está activada`;
    if (rules.noSkip && i >= 0 && j > i + 1) return `${who} solo puede pasar a la etapa siguiente, «${lcStages(def)[i + 1][1]}», no a «${newStage}»: la regla «Limitar los saltos de etapa» está activada`;
  }
  const li = lcIndex(def, lcLabel(def, 'lead'));
  if (rules.requireOwner && li >= 0 && j > li && noOwner(record)) return `${who} no tiene propietario: la regla «Exigir propietario para avanzar de Lead» no permite pasar a «${newStage}»`;
  return null;
}
// An automation moves a contact / company forward to the stage `stageId` when it is behind (never back, never
// from «Otro»), within the rules; the record's timeline says why. Returns true when it moved.
function lifecycleAdvance(type, id, stageId, text, extra = {}, def = lifecycleDef()) {
  const rec = findIn(type, id);
  const target = lcLabel(def, stageId);
  if (!rec || !target) return false;
  const i = lcIndex(def, rec.lifecycle);
  const j = lcIndex(def, target);
  if (j < 0 || (rec.lifecycle && i < 0) || i >= j) return false;
  if (applyLifecycleRules(type, rec, target, { automatic: true, def })) return false;
  const from = rec.lifecycle || '';
  setField(type, id, 'lifecycle', target, { lifecycleAuto: true, lifecycleSync: true });
  logSystem(type, id, `Etapa del ciclo de vida cambiada a «${target}» ${text}.`, { lifecycle: target, lifecycleFrom: from, ...extra });
  return true;
}
// «Cuando se crea un negocio asociado, pasar a Oportunidad»: the deal's contact and company (or the contact's
// company when the sync between them is on) advance to Oportunidad when they are behind.
export function lifecycleOnDeal(d) {
  const def = lifecycleDef();
  const s = lcSync(def);
  if (s.onDeal === false || !d) return [];
  const moved = [];
  const contact = d.contactId ? findIn('contacts', d.contactId) : null;
  const companyId = d.companyId || (s.company !== false && contact ? contact.companyId : null);
  if (contact && lifecycleAdvance('contacts', contact.id, 'opportunity', `por el negocio «${d.name}»`, { deal: d.id, automation: 'onDeal' }, def)) moved.push(`contacts:${contact.id}`);
  if (companyId && lifecycleAdvance('companies', companyId, 'opportunity', `por el negocio «${d.name}»`, { deal: d.id, automation: 'onDeal' }, def)) moved.push(`companies:${companyId}`);
  return moved;
}
// «Cuando se gana un negocio asociado, pasar a Cliente».
export function lifecycleOnWon(d) {
  const def = lifecycleDef();
  const s = lcSync(def);
  if (s.onWon === false || !d) return [];
  const moved = [];
  const contact = d.contactId ? findIn('contacts', d.contactId) : null;
  const companyId = d.companyId || (s.company !== false && contact ? contact.companyId : null);
  if (contact && lifecycleAdvance('contacts', contact.id, 'customer', `al ganarse el negocio «${d.name}»`, { deal: d.id, automation: 'onWon' }, def)) moved.push(`contacts:${contact.id}`);
  if (companyId && lifecycleAdvance('companies', companyId, 'customer', `al ganarse el negocio «${d.name}»`, { deal: d.id, automation: 'onWon' }, def)) moved.push(`companies:${companyId}`);
  return moved;
}
// «Sincronizar la etapa entre contactos y empresa»: the one that advanced pulls the other up when it is behind
// (a contact its primary company; a company its contacts); never back.
export function lifecycleSyncCompany(type, id) {
  const def = lifecycleDef();
  if (lcSync(def).company === false) return [];
  const rec = findIn(type, id);
  if (!rec) return [];
  const stageId = (def.stages.find((x) => x[1] === rec.lifecycle) || [])[0];
  if (!stageId || stageId === 'other') return [];
  const moved = [];
  if (type === 'contacts' && rec.companyId && lifecycleAdvance('companies', rec.companyId, stageId, `para sincronizarla con el contacto «${rec.name}»`, { contact: rec.id, automation: 'company' }, def)) moved.push(`companies:${rec.companyId}`);
  if (type === 'companies') allContacts().filter((c) => Number(c.companyId) === Number(rec.id)).forEach((c) => { if (lifecycleAdvance('contacts', c.id, stageId, `para sincronizarla con la empresa «${rec.name}»`, { company: rec.id, automation: 'company' }, def)) moved.push(`contacts:${c.id}`); });
  return moved;
}

function afterAdd(type, rec, opts = {}) {
  // "Registro creado a partir de…" first, so what the automations add next stays newest on the timeline.
  try {
    const origin = opts.origin || (typeof rec.source === 'string' && rec.source) || 'Creación manual';
    logSystem(type, rec.id, `${RECORD_WORD[type] || 'Registro'} creado a partir de ${origin}.`, { origin });
    if ((type === 'deals' || type === 'tickets') && opts.logAssoc !== false) {
      const word = RECORD_WORD[type];
      if (rec.contactId) logSystem('contacts', rec.contactId, `${word} «${rec.name}» creado y asociado a este contacto.`, { [type]: rec.id });
      if (rec.companyId) logSystem('companies', rec.companyId, `${word} «${rec.name}» creado y asociado a esta empresa.`, { [type]: rec.id });
    }
  } catch (e) { console.error('[cronología]', e); }
  // A new deal for a contact stops the sequences with «Cancelar la inscripción cuando se crea un negocio»
  // (single hook for the slide-over, the record, workflows and the import; dynamic import: sequences import us).
  if (type === 'deals' && rec.contactId) import('./sequences-data.js').then((m) => m.cancelOnDeal(rec.contactId, rec)).catch((e) => console.error('[secuencias] negocio creado', e));
  // A new deal moves its contact and company to «Oportunidad» (Ajustes › Etapa del ciclo de vida, when on).
  if (type === 'deals') { try { lifecycleOnDeal(rec); } catch (e) { console.error('[ciclo de vida] negocio creado', e); } }
  if (type === 'contacts' && !rec.companyId && String(rec.company || '').trim()) resolveContactCompanyName(rec);
  else if (type === 'contacts' && !opts.skipAutoCompany) { try { autoAssociateCompany(rec); } catch (e) { console.error('[empresas automáticas]', e); } }
  if (type === 'contacts' && (rec.companyId || (rec.assoc_companies || []).length)) { try { syncContactCompanies(rec.id); } catch (e) { console.error('[contact_companies]', e); } }
  if (type === 'tickets') { try { autoAssociateTicketCompany(rec); } catch (e) { console.error('[tickets: empresa del contacto]', e); } }
  if (type === 'tasks') recomputeForTask(rec); // «Próxima actividad» of its contact / company / deal
  // A record created for another owner (a task for a colleague, a deal assigned on creation) notifies them too;
  // imports and restores do not (origin other than a manual creation).
  if (rec.owner && (type === 'tasks' || !opts.origin || opts.origin === 'Creación manual')) { try { notifyAssigned({ type, id: rec.id, name: rec.name || `${rec.first || ''} ${rec.last || ''}`.trim(), owner: rec.owner, previousOwner: '' }); } catch (e) { console.error('[notificaciones] asignación', e); } }
  return rec;
}
function afterSet(type, id, field, value, opts = {}, previousValue) {
  if (type === 'contacts' && field === 'lifecycle' && previousValue !== value) {
    const stageId = lifecycleDef().stages.find((stage) => stage[1] === value)?.[0];
    if (LIFECYCLE_IDS.includes(stageId) && stageId !== 'other') {
      // Catalog datetime: retain the exact latest entry, including re-entry on the same day.
      // setField persists this property in extra (or local overrides). It adds no history
      // event: the caller's lifecycle "Propiedad actualizada" entry is sufficient.
      setField(type, id, `hs_lifecyclestage_${stageId}_date`, new Date().toISOString());
    }
  }
  // A new owner (contact, company, deal, ticket or task) gets «Se te ha asignado…» in the bell, unless it is the
  // person making the change, «Sin asignar» or the same owner saved again (Ajustes › Notificaciones › Registro asignado).
  if (field === 'owner' && previousValue !== value) { try { const r = findIn(type, id); if (r) notifyAssigned({ type, id, name: r.name || `${r.first || ''} ${r.last || ''}`.trim(), owner: value, previousOwner: previousValue }); } catch (e) { console.error('[notificaciones] asignación', e); } }
  // The record's followers hear about a new owner or stage (deal stage, ticket status, lifecycle stage).
  if (previousValue !== value && (field === 'owner' || (type === 'deals' && field === 'stage') || (type === 'tickets' && field === 'status') || ((type === 'contacts' || type === 'companies') && field === 'lifecycle'))) {
    const r = findIn(type, id);
    const stageLabel = type === 'deals' ? dealStageLabel(r && r.pipeline, value) : type === 'tickets' ? ((allTicketStatuses().find(([k]) => k === value) || [value, value])[1]) : value;
    notifyRecordFollowers(type, id, field === 'owner' ? 'owner' : 'stage', field === 'owner' ? `ahora es ${value || 'Sin asignar'}` : `ahora está en «${stageLabel || value}»`, ACTOR, `follow:${type}:${id}:${field}:${value}:${Math.floor(Date.now() / 60000)}`);
  }
  // «Sincronizar la etapa entre contactos y empresa»: one hop from the record that changed (never back).
  if ((type === 'contacts' || type === 'companies') && field === 'lifecycle' && previousValue !== value && !opts.lifecycleSync) { try { lifecycleSyncCompany(type, id); } catch (e) { console.error('[ciclo de vida] sincronización', e); } }
  if (type === 'contacts' && field === 'company' && value) resolveContactCompanyName(id);
  if (!opts.skipAutoCompany && type === 'contacts' && (field === 'email' || field === 'website') && value) { try { autoAssociateCompany(id); } catch (e) { console.error('[empresas automáticas]', e); } }
  if (type === 'contacts' && COMPANY_LINK_FIELDS.has(field)) { try { syncContactCompanies(id); } catch (e) { console.error('[contact_companies]', e); } }
  if (type === 'tickets' && field === 'contactId' && value) { try { autoAssociateTicketCompany(id); } catch (e) { console.error('[tickets: empresa del contacto]', e); } }
  try {
    // A deal changing stage: on the deal and on its contact and company.
    if (type === 'deals' && field === 'stage') {
      const d = findIn('deals', id);
      if (d) {
        const label = dealStageLabel(d.pipeline, value);
        logSystem('deals', d.id, `Etapa cambiada a «${label}».`, { stage: value });
        if (d.contactId) logSystem('contacts', d.contactId, `Negocio «${d.name}» pasó a la etapa «${label}».`, { deal: d.id, stage: value });
        if (d.companyId) logSystem('companies', d.companyId, `Negocio «${d.name}» pasó a la etapa «${label}».`, { deal: d.id, stage: value });
        // Closing the deal (won, lost or any closed stage of its pipeline) fixes «Fecha de cierre» to today when it
        // is empty or still in the future, as the original does; a past close date is kept and reopening never
        // touches it. The write goes through setField (its own afterSet has no stage branch, so no recursion) and
        // leaves a system entry on the timeline instead of a property-history row.
        if (opts.automaticCloseDate) {
          logSystem('deals', d.id, `Fecha de cierre fijada a «${formatDate(opts.automaticCloseDate)}» al cerrar el negocio.`, { closeDate: opts.automaticCloseDate, stage: value });
        }
        // «Cuando se gana un negocio asociado, pasar a Cliente» (Ajustes › Etapa del ciclo de vida, when on).
        if (previousValue !== value && dealStageIsWon(d.pipeline, value)) { try { lifecycleOnWon(d); } catch (e) { console.error('[ciclo de vida] negocio ganado', e); } }
      }
    }
    // A ticket changing status: on the ticket and on its contact and company.
    if (type === 'tickets' && field === 'status' && previousValue !== value) {
      const t = findIn('tickets', id);
      if (t) {
        const label = ticketStatusLabel(t.pipeline, value);
        logSystem('tickets', t.id, `Estado cambiado a «${label}».`, { status: value });
        if (t.contactId) logSystem('contacts', t.contactId, `Ticket «${t.name}» pasó al estado «${label}».`, { ticket: t.id, status: value });
        if (t.companyId) logSystem('companies', t.companyId, `Ticket «${t.name}» pasó al estado «${label}».`, { ticket: t.id, status: value });
      }
    }
    // A task's status, due date or links changed: «Próxima actividad» of the records it counts for (and of the
    // record it was linked to before).
    if (type === 'tasks' && ['status', 'due', 'contactId', 'companyId', 'dealId'].includes(field)) {
      const t = findIn('tasks', id);
      recomputeForTask(t);
      if (t && previousValue && ['contactId', 'companyId', 'dealId'].includes(field) && String(previousValue) !== String(value)) recomputeForTask({ ...t, [field]: previousValue });
    }
    // A task completed: on the task's contact and deal; a recurring one spawns its next occurrence (once).
    if (type === 'tasks' && field === 'status' && value === 'done' && previousValue !== 'done') {
      const t = findIn('tasks', id);
      if (t) {
        logSystem('tasks', t.id, 'Tarea completada.', {});
        if (t.contactId) logSystem('contacts', t.contactId, `Tarea «${t.name}» completada.`, { task: t.id });
        if (t.dealId) logSystem('deals', t.dealId, `Tarea «${t.name}» completada.`, { task: t.id });
        try { spawnNextOccurrence(t); } catch (e) { console.error('[tareas recurrentes]', e); }
      }
    }
  } catch (e) { console.error('[cronología]', e); }
}

function merge(type, base) {
  const extra = getExtra(type).map((r) => augment(type, { ...r }));
  const overrides = getOverrides(type);
  const deleted = getDeleted(type);
  // Contacts carry their company links (contact_companies) and their real activity counts.
  const counts = type === 'contacts' ? activityCounts('contacts') : null;
  const tdefs = type === 'tickets' ? ticketPipelineDefs() : null;
  return [...extra, ...base]
    .filter((r) => !deleted.has(Number(r.id)))
    .map((src) => {
      const r = overrides[src.id] ? { ...src, ...overrides[src.id] } : src;
      const out = type === 'deals' ? withHomeAmount(normalizeDealStage(r)) : type === 'contacts' ? withActivityCounts(withCompanyLinks(r), counts) : type === 'tickets' ? normalizeTicket(r, tdefs) : r;
      if (out !== src && DECORATED.has(src)) DECORATED.set(out, DECORATED.get(src)); // the copies keep the decoration marks
      return out;
    });
}

// ---------- contact ↔ companies (contact_companies: a contact can belong to several companies) ----------
// With Supabase the table is the source of truth and the contact's companyId/company (primary) and
// assoc_companies / assoc_labels_companies (all of them, with labels) are derived from it when reading; in
// local mode those fields live on the record as before. Writes go through the record's fields (setField)
// and are mirrored to the table right after (afterSet / afterAdd).
let contactCompanyRows = null; // null until the table has been read
let contactCompanyIndex = null;
const linkFromDb = (r) => ({ id: r.id, contactId: Number(r.contact_id), companyId: Number(r.company_id), label: r.label || 'Sin etiqueta', isPrimary: Boolean(r.is_primary) });
async function fetchContactCompanies() {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('contact_companies').select('*').order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all.map(linkFromDb);
}
function linksByContact() {
  if (!contactCompanyIndex) {
    contactCompanyIndex = new Map();
    (contactCompanyRows || []).forEach((l) => { const a = contactCompanyIndex.get(l.contactId) || []; a.push(l); contactCompanyIndex.set(l.contactId, a); });
  }
  return contactCompanyIndex;
}
export const contactCompaniesLive = () => contactCompanyRows !== null;
// The companies of a contact as its record describes them: [{ companyId, label, isPrimary }], primary first.
export function contactCompanyLinks(r) {
  const labels = r.assoc_labels_companies || {};
  const primary = Number(r.companyId) || 0;
  const ids = [...new Set([primary, ...(Array.isArray(r.assoc_companies) ? r.assoc_companies : [])].map(Number).filter((n) => n > 0))];
  return ids.map((companyId) => ({ companyId, isPrimary: companyId === primary, label: companyId === primary ? 'Principal' : labels[companyId] === 'Principal' ? 'Sin etiqueta' : labels[companyId] || 'Sin etiqueta' }));
}
function withCompanyLinks(r) {
  if (!contactCompanyRows) return r;
  const links = linksByContact().get(Number(r.id));
  if (!links || !links.length) return r;
  const primary = links.find((l) => l.isPrimary) || links[0];
  const company = allCompanies().find((c) => Number(c.id) === primary.companyId);
  return {
    ...r,
    companyId: primary.companyId,
    company: company ? company.name : r.company || '',
    assoc_companies: links.map((l) => l.companyId),
    assoc_labels_companies: Object.fromEntries(links.map((l) => [l.companyId, l === primary ? 'Principal' : l.label === 'Principal' ? 'Sin etiqueta' : l.label])),
  };
}
// Mirrors a contact's company fields to the table (replace its rows), in memory now and in Supabase after.
function syncContactCompanies(contactId) {
  if (!contactCompanyRows) return;
  const raw = (dbRows.contacts || []).find((r) => Number(r.id) === Number(contactId));
  if (!raw) return;
  const desired = contactCompanyLinks(raw).map((l) => ({ id: null, contactId: Number(contactId), companyId: l.companyId, label: l.label, isPrimary: l.isPrimary }));
  contactCompanyRows = [...contactCompanyRows.filter((l) => l.contactId !== Number(contactId)), ...desired];
  contactCompanyIndex = null;
  bump();
  dbWrite(async () => {
    const { error: delErr } = await supabase.from('contact_companies').delete().eq('contact_id', Number(contactId));
    if (delErr) { console.error('[supabase] contact_companies delete', delErr); return; }
    if (!desired.length) return;
    const { error } = await supabase.from('contact_companies').insert(desired.map((l) => ({ contact_id: l.contactId, company_id: l.companyId, label: l.label, is_primary: l.isPrimary })));
    if (error) console.error('[supabase] contact_companies insert', error);
  });
}
// Real activity counts per record, from the timeline: num_notes = «Número de actividades de ventas» (every
// engagement logged: notes, calls, e-mails, meetings, tasks, messages; never system entries nor property changes),
// num_contacted_notes = «Número de veces contactado» (calls, e-mails, meetings and messages with the contact;
// marketing sends do not count). notes_last_contacted falls back to the latest of those when the record has none.
function activityCounts(recordType) {
  const counts = new Map();
  allActivities().forEach((a) => {
    if (a.recordType !== recordType || !ENGAGEMENT_TYPES.has(a.type)) return;
    const id = Number(a.recordId);
    const c = counts.get(id) || { all: 0, contacted: 0, lastContacted: '' };
    c.all += 1;
    if (CONTACT_TYPES.has(a.type) && !isMarketingActivity(a)) {
      c.contacted += 1;
      const w = whenIso(a.when);
      if (w > c.lastContacted) c.lastContacted = w;
    }
    counts.set(id, c);
  });
  return counts;
}
function withActivityCounts(r, counts) {
  const c = counts.get(Number(r.id)) || { all: 0, contacted: 0, lastContacted: '' };
  return { ...r, num_notes: c.all, num_contacted_notes: c.contacted, notes_last_contacted: r.notes_last_contacted || c.lastContacted || '' };
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
  if (type === 'contacts') r.marketingOptOut = [true, 'true', 'Sí'].includes(r.marketingOptOut) ? 'Sí' : 'No';
  const props = PROP_CACHE[type] || (PROP_CACHE[type] = propertyList(type));
  const marks = new Map();
  for (const p of props) {
    if (p.custom || REAL_ONLY.has(p.key) || (type === 'companies' && p.key === 'website')) continue; // custom properties and the real-only ones never get sample values
    if (r[p.key] === undefined || r[p.key] === null) { r[p.key] = sampleValue(p, r, type); marks.set(p.key, String(r[p.key])); }
  }
  DECORATED.set(r, marks);
  return r;
}
// Which keys of an augmented record are sample decoration (never stored), with the value written: read by
// isDecorated() so a merge neither offers them as conflicts nor lets them shadow a real value. Weak: nothing
// leaks into persistence.
const DECORATED = new WeakMap();
// Properties the app really drives: a sample value would be acted upon (a fake reminder would fire).
const REAL_ONLY = new Set(['marketingOptOut', 'marketingOptOutAt', 'marketingOptOutReason', 'reminderAt', 'reminderFiredAt', 'closedLostReason', 'closedWonReason', 'notes_last_contacted', 'notes_next_activity_date', 'hs_additional_domains']);

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

const STATES_BY_COUNTRY = {
  España: ['Madrid', 'Cataluña', 'Andalucía', 'Comunidad Valenciana'],
  México: ['Nuevo León', 'Jalisco', 'Ciudad de México', 'Querétaro'],
  'Estados Unidos': ['Florida', 'Arizona', 'Texas', 'Florida'],
  Colombia: ['Cundinamarca', 'Antioquia', 'Valle del Cauca', 'Atlántico'],
  Portugal: ['Lisboa', 'Oporto', 'Algarve', 'Braga'],
};
// Preserve the first occurrence of each demo email; later formula cycles get a stable suffix.
const CONTACT_EMAILS = (() => {
  const seen = new Set();
  return Array.from({ length: COUNTS.contacts }, (_, i) => {
    const first = FIRST[(i * 7) % FIRST.length];
    const last = LAST[(i * 11 + 3) % LAST.length];
    const noCompany = i % 9 === 8;
    const companyIdx = (i * 3) % COMPANY_NAMES.length;
    const domain = noCompany ? ['gmail.com', 'hotmail.com', 'outlook.es', 'yahoo.com'][i % 4] : `${strip(COMPANY_NAMES[companyIdx]).replace(/[^a-z0-9]/g, '')}.com`;
    const email = i % 11 === 10 ? '' : `${strip(first).replace(/\s+/g, '.')}.${strip(last).split(' ')[0]}@${domain}`;
    if (!email) return '';
    const unique = seen.has(email) ? email.replace('@', `+seed${i + 1}@`) : email;
    seen.add(email);
    return unique;
  });
})();

function buildContact(i) {
  const first = FIRST[(i * 7) % FIRST.length];
  const last = LAST[(i * 11 + 3) % LAST.length];
  const noCompany = i % 9 === 8;
  const companyIdx = (i * 3) % COMPANY_NAMES.length;
  return {
    id: i + 1,
    first,
    last,
    name: `${first} ${last}`,
    email: CONTACT_EMAILS[i],
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
    // State / region by country (the account's "Glaziers Florida / Arizona" views filter on it).
    state: STATES_BY_COUNTRY[['España', 'España', 'México', 'Estados Unidos', 'Colombia', 'Portugal'][(i * 7) % 6]][(i * 5) % 4],
    // Some contacts belong to a second company besides the primary one (the original's "N registros").
    ...(!noCompany && i % 10 === 4 ? { assoc_companies: [companyIdx + 1, ((companyIdx + 5) % COMPANY_NAMES.length) + 1], assoc_labels_companies: { [companyIdx + 1]: 'Principal', [((companyIdx + 5) % COMPANY_NAMES.length) + 1]: 'Facturación' } } : {}),
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
    // A few companies hang from a parent company (the original's matriz / secundarias).
    parentCompanyId: i % 6 === 2 ? ((i * 5) % 7) + 1 : '',
  };
}
// ---------- company hierarchy (parent_company_id) ----------
export const parentCompanyOf = (c) => (c && c.parentCompanyId ? allCompanies().find((x) => Number(x.id) === Number(c.parentCompanyId)) || null : null);
export const childCompaniesOf = (id) => allCompanies().filter((x) => Number(x.parentCompanyId) === Number(id));
// Whether `companyId` is `ancestorId` itself or hangs (at any depth) from it — a parent must never be one of them.
export function isCompanyDescendant(ancestorId, companyId) {
  const seen = new Set();
  let cur = allCompanies().find((x) => Number(x.id) === Number(companyId));
  while (cur) {
    if (Number(cur.id) === Number(ancestorId)) return true;
    if (seen.has(Number(cur.id))) return false;
    seen.add(Number(cur.id));
    cur = parentCompanyOf(cur);
  }
  return false;
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
    status: REAL_TICKET_PIPELINES[TICKET_SEED_PIPE[i % 7]].stages[(i * 3) % REAL_TICKET_PIPELINES[TICKET_SEED_PIPE[i % 7]].stages.length][0],
    priority: PRIORITIES[(i * 3) % 3][0],
    pipeline: REAL_TICKET_PIPELINES[TICKET_SEED_PIPE[i % 7]].name,
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
    status: i % 4 === 0 ? 'done' : 'todo',
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
// Preferences can be changed in another tab while the marketing editor stays open.
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (!dbLive && (event.key === null || event.key.startsWith('crm:'))) bump();
});
function baseRecords(type) {
  if (!baseCache[type]) {
    const purged = dbLive ? null : new Set(read(PURGED_KEY(type), []).map(Number)); // demo records purged for good
    baseCache[type] = dbLive
      ? dbRows[type] || []
      : Array.from({ length: COUNTS[type] }, (_, i) => augment(type, BUILDERS[type](i))).filter((r) => !purged.has(Number(r.id)));
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
// Lists expose only roots; record lookup and the subtask panel still access children.
export const allTasks = () => cached('tasks').filter((t) => !t.parentId);
export const subtasksOf = (id) => cached('tasks').filter((t) => String(t.parentId) === String(id));

export const ALL = {
  contacts: allContacts,
  companies: allCompanies,
  deals: allDeals,
  tickets: allTickets,
  tasks: allTasks,
};

export function findRecord(type, id) {
  return cached(type).find((r) => String(r.id) === String(id));
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
  return matchesSearch(r, q, keys);
}

export function toCsv(rows, columns, type) {
  const sensitive = new Set((type ? customProperties(type) : Object.keys(ALL).flatMap(customProperties)).filter((p) => p.sensitive).map((p) => p.key));
  columns = columns.filter((c) => !sensitive.has(c.key));
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
  setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch { /* page already gone */ } }, 1000);
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
// «Dominios adicionales» of a company (hs_additional_domains, ';'-separated as the original exports it), each
// normalised like the main domain (siteDomain); ',' and spaces are accepted as separators on input.
export function additionalDomainsOf(company) {
  return [...new Set(String((company && company.hs_additional_domains) || '').split(/[;,\s]+/).map((d) => siteDomain(d)).filter(Boolean))];
}
// The stored form of the field: normalised, without repeats and without the company's main domain.
export function normalizeAdditionalDomains(value, mainDomain) {
  const main = siteDomain(mainDomain);
  return additionalDomainsOf({ hs_additional_domains: value }).filter((d) => d !== main).join(';');
}
// Every domain a company answers to: the main one first, then the additional ones.
export function companyDomains(company) {
  return [...new Set([siteDomain(company && company.domain), ...additionalDomainsOf(company)].filter(Boolean))];
}
// Companies that answer to a domain (main or additional); the ones that have it as main domain come first.
export function companiesByDomain(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d) return [];
  return allCompanies().filter((c) => companyDomains(c).includes(d)).sort((a, b) => Number(siteDomain(b.domain) === d) - Number(siteDomain(a.domain) === d) || Number(a.id) - Number(b.id));
}
// Explicit company text is an association request, independent of the optional email automation.
// Remote lookup reads the current database, not the possibly partial companies list cache.
const pendingNamedCompanies = new Set();
function resolveContactCompanyName(contactOrId) {
  const contact = typeof contactOrId === 'object' ? contactOrId : findIn('contacts', contactOrId);
  const name = String(contact?.company || '').trim();
  if (!contact || contact.companyId || !name) return;
  const resolve = (companies) => {
    companies = [...companies, ...pendingNamedCompanies];
    const current = findIn('contacts', contact.id);
    // A later edit or explicit association supersedes an outstanding lookup.
    if (!current || current.companyId || String(current.company || '').trim() !== name) return;
    const candidate = siteDomain(name) || companyDomainFor(current).domain;
    const domain = candidate && !isFreeEmailDomain(candidate) && !excludedDomains().includes(candidate) ? candidate : null;
    let company = companies.filter((c) => String(c.name || '').trim().toLowerCase() === name.toLowerCase())
      .sort((a, b) => Number(a.id) - Number(b.id))[0];
    if (!company && domain) company = companies.filter((c) => companyDomains(c).includes(domain))
      .sort((a, b) => Number(siteDomain(b.domain) === domain) - Number(siteDomain(a.domain) === domain) || Number(a.id) - Number(b.id))[0];
    const created = !company;
    if (!company) company = addRecord('companies', {
      name, domain: domain || '', owner: current.owner || 'Sin asignar', lifecycle: current.lifecycle || 'Lead',
    });
    if (created && dbLive) pendingNamedCompanies.add(company);
    if (dbLive && !created && !findIn('companies', company.id)) {
      (dbRows.companies ||= []).push(augment('companies', { ...company }));
      bump();
    }
    const link = () => {
      pendingNamedCompanies.delete(company);
      const latest = findIn('contacts', contact.id);
      if (!latest || latest.companyId || String(latest.company || '').trim() !== name) return;
      // The company insert (including an id-conflict retry) has finished before linking.
      if (!findIn('companies', company.id)) return;
      setField('contacts', contact.id, 'companyId', company.id);
      setField('contacts', contact.id, 'company', company.name);
      contact.companyId = company.id;
      contact.company = company.name;
    };
    if (dbLive) dbWrite(link);
    else link();
  };
  if (!dbLive) return resolve(allCompanies());
  dbWrite(async () => {
    // fetchTable paginates and excludes recycled companies; names are compared literally (no ILIKE wildcards).
    const companies = await fetchTable('companies');
    resolve(companies);
  });
}
// `matched`: the domain that matched (the company's main one or one of its additional domains).
function linkContactToCompany(contact, company, via, created, matched = '') {
  setField('contacts', contact.id, 'companyId', company.id);
  setField('contacts', contact.id, 'company', company.name);
  contact.companyId = company.id;
  contact.company = company.name;
  const when = Date.now();
  addActivity({ type: 'note', recordType: 'contacts', recordId: contact.id, who: 'Sistema', when, text: `Empresa "${company.name}" ${created ? 'creada y ' : ''}asociada automáticamente por el dominio ${via === 'website' ? 'del sitio web' : 'del correo'} (${matched || company.domain}).` });
  if (created) addActivity({ type: 'note', recordType: 'companies', recordId: company.id, who: 'Sistema', when, text: `Empresa creada automáticamente a partir del contacto ${contact.name || contact.email || ''}${contact.email ? ` (${contact.email})` : ''}.` });
}
// Applies the rule to one contact (record or id). Returns { action: 'associated' | 'created' | 'skipped', reason, domain, via, company }.
export function autoAssociateCompany(contactOrId, { create = true, dryRun = false, force = false } = {}) {
  if (!force && !companyAutoEnabled()) return { action: 'skipped', reason: 'disabled' };
  const contact = contactOrId && typeof contactOrId === 'object' ? contactOrId : findRecord('contacts', contactOrId);
  if (!contact) return { action: 'skipped', reason: 'not_found' };
  if (contact.companyId) return { action: 'skipped', reason: 'already_associated' };
  if (String(contact.company || '').trim()) return { action: 'skipped', reason: 'explicit_company' };
  const { domain, via, reason } = companyDomainFor(contact);
  if (!domain) return { action: 'skipped', reason };
  if (excludedDomains().includes(domain)) return { action: 'skipped', reason: 'excluded', domain };
  const hits = companiesByDomain(domain);
  if (hits.length) {
    if (!dryRun) linkContactToCompany(contact, hits[0], via, false, domain);
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

const ACT_TRASH_KEY = (type, id) => `crm:${type}:activity-trash:${id}`;
const editableActivity = (a) => ['note', 'call', 'email', 'meeting', 'message'].includes(a.type);
function localActivities(key, recordType, recordId) {
  const rows = read(key, []);
  let changed = false;
  rows.forEach((a) => {
    if (!a.id) { a.id = crypto.randomUUID(); changed = true; }
    a.recordType = recordType; a.recordId = Number(recordId);
  });
  if (changed) write(key, rows);
  return rows;
}
export function activitiesFor(recordType, recordId) {
  const rows = activitiesLive ? activityRows.filter((a) => a.recordType === recordType && a.recordId === Number(recordId))
    : localActivities(ACT_NOTES_KEY(recordType, recordId), recordType, recordId);
  return rows.filter((a) => !a.extra?.deletedAt).sort((a, b) => Number(!!b.extra?.pinned) - Number(!!a.extra?.pinned) || b.when - a.when);
}
export function deletedActivitiesFor(recordType, recordId, includeExpired = false) {
  const rows = activitiesLive ? activityRows.filter((a) => a.recordType === recordType && a.recordId === Number(recordId))
    : localActivities(ACT_TRASH_KEY(recordType, recordId), recordType, recordId);
  return rows.filter((a) => a.extra?.deletedAt && (includeExpired || Date.now() - a.extra.deletedAt < TRASH_DAYS * 86400000))
    .sort((a, b) => b.extra.deletedAt - a.extra.deletedAt);
}
async function mutateActivity(id, changes, action = 'update') {
  const mutate = (a) => {
    if (!editableActivity(a)) throw new Error('Esta actividad del sistema no se puede modificar.');
    if (action === 'update' && a.extra?.deletedAt) throw new Error('Restaura la actividad antes de editarla.');
    if (action === 'restore' && Date.now() - a.extra?.deletedAt >= TRASH_DAYS * 86400000) throw new Error('El plazo de restauración ha vencido.');
    // Only delete/restore may change trash membership. Repeated deletion must
    // preserve the original restoration deadline.
    const { deletedAt: ignoredDeletedAt, ...extraChanges } = changes.extra || {};
    const next = { ...a, ...changes, extra: { ...a.extra, ...extraChanges } };
    if (action === 'delete' && !next.extra.deletedAt) next.extra.deletedAt = Date.now();
    if (action === 'restore') delete next.extra.deletedAt;
    return next;
  };
  if (activitiesLive) return dbWrite(async () => {
    const a = activityRows.find((row) => String(row.id) === String(id));
    if (!a) throw new Error('Actividad no encontrada.');
    const next = mutate(a);
    const { data, error } = await supabase.from('activities').update(activityToDb(next)).eq('id', a.id).select('id').single();
    if (error || !data) throw error || new Error('No se pudo guardar la actividad.');
    Object.assign(a, next);
    return a;
  });
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const match = /^crm:([^:]+):(notes|activity-trash):(.+)$/.exec(key);
    if (!match) continue;
    const rows = localActivities(key, match[1], match[3]);
    const index = rows.findIndex((a) => String(a.id) === String(id));
    if (index < 0) continue;
    const next = mutate(rows[index]);
    const target = next.extra.deletedAt ? ACT_TRASH_KEY(match[1], match[3]) : ACT_NOTES_KEY(match[1], match[3]);
    if (target === key) { rows[index] = next; write(key, rows); }
    else { write(target, [next, ...read(target, [])]); rows.splice(index, 1); write(key, rows); }
    return next;
  }
  throw new Error('Actividad no encontrada.');
}
export const updateActivity = (id, changes) => afterMeetingMutation(mutateActivity(id, Object.fromEntries(Object.entries(changes).filter(([key]) => ['text', 'when', 'extra'].includes(key)))));
export const deleteActivity = (id) => afterMeetingMutation(mutateActivity(id, {}, 'delete'));
export const restoreActivity = (id) => afterMeetingMutation(mutateActivity(id, {}, 'restore'));

// Resolve optimistic and legacy entries before attaching a foreign-key comment.
export async function activityIdForComment(ev, recordType, recordId, create = true) {
  if (!DB_MODE) return ev.id || `${recordType}:${recordId}:${ev.type}:${ev.when}:${ev.extra?.callSid || ev.text}`;
  await writeQueue;
  if (ev.id) return ev.id;
  const payload = activityToDb({ ...ev, recordType, recordId });
  const { data: rows, error } = await supabase.from('activities').select('id')
    .eq('record_type', recordType).eq('record_id', recordId).eq('type', ev.type)
    .eq('occurred_at', payload.occurred_at).eq('text', payload.text).limit(1);
  if (error) throw error;
  if (rows.length) {
    const cached = activityRows.find((a) => !a.id && a.recordType === recordType && a.recordId === Number(recordId) && a.type === ev.type && a.when === ev.when && a.text === ev.text);
    if (cached) cached.id = rows[0].id;
    return rows[0].id;
  }
  if (!create) return null;
  const { data, error: insertError } = await supabase.from('activities').insert(payload).select('id').single();
  if (insertError) throw insertError;
  activityRows.unshift({ ...ev, id: data.id, recordType, recordId: Number(recordId) });
  return data.id;
}

// ---------- «Última actividad» / «Fecha del último contacto» follow the timeline (as in the original) ----------
// Logging or receiving an engagement (note, e-mail, call, meeting, task, message…) moves the owner record's
// lastActivity / lastActivityType; a contact's notes_last_contacted moves only for real contact activities
// (call, e-mail, meeting, message), never for marketing sends. System entries and property changes never touch
// them. Every writer (record forms, compose, calls, inbox / Gmail sync, marketing, sequences, workflows) goes
// through addActivity / addActivities, so this is the single place.
export const ENGAGEMENT_TYPES = new Set(['note', 'email', 'call', 'meeting', 'task', 'message', 'sms', 'whatsapp', 'linkedin']);
export const CONTACT_TYPES = new Set(['call', 'email', 'meeting', 'message', 'sms', 'whatsapp', 'linkedin']);
const isMarketingActivity = (ev) => Boolean(ev && ev.extra && ev.extra.marketingEmailId);
const whenIso = (w) => { const d = new Date(w || Date.now()); return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); };
export function touchLastActivity(ev) {
  if (!ev || !ENGAGEMENT_TYPES.has(ev.type) || !ALL[ev.recordType] || !ev.recordId) return false;
  const rec = findRecord(ev.recordType, ev.recordId);
  if (!rec) return false;
  const when = whenIso(ev.when);
  let moved = false;
  // Only forward: an activity logged with an older date does not rewind the record.
  if (!rec.lastActivity || new Date(when) >= new Date(rec.lastActivity)) {
    setField(ev.recordType, ev.recordId, 'lastActivity', when);
    setField(ev.recordType, ev.recordId, 'lastActivityType', ev.type);
    moved = true;
  }
  if (ev.recordType === 'contacts' && CONTACT_TYPES.has(ev.type) && !isMarketingActivity(ev) && (!rec.notes_last_contacted || new Date(when) >= new Date(rec.notes_last_contacted))) {
    setField('contacts', ev.recordId, 'notes_last_contacted', when);
  }
  return moved;
}
// A batch (a marketing blast): one touch per record, with its latest entry.
function touchLastActivities(events) {
  const latest = new Map();
  events.forEach((ev) => {
    if (!ev || !ENGAGEMENT_TYPES.has(ev.type)) return;
    const k = `${ev.recordType}:${ev.recordId}`;
    const cur = latest.get(k);
    if (!cur || whenIso(ev.when) > whenIso(cur.when)) latest.set(k, ev);
  });
  latest.forEach((ev) => { try { touchLastActivity(ev); } catch (e) { console.error('[última actividad]', e); } });
}
function insertActivity(ev) {
  if (activitiesLive) {
    const row = { ...ev, recordId: Number(ev.recordId) };
    activityRows.unshift(row);
    dbWrite(async () => {
      const { data, error } = await supabase.from('activities').insert(activityToDb(ev)).select('id').single();
      if (error) console.error('[supabase] insert activity', error);
      else row.id = data.id;
    });
    return;
  }
  const key = ACT_NOTES_KEY(ev.recordType, ev.recordId);
  const list = read(key, []);
  list.unshift({ id: ev.id || crypto.randomUUID(), type: ev.type, when: ev.when, who: ev.who, text: ev.text, extra: ev.extra || {} });
  write(key, list);
}
// Followers of a record («Seguir» on its page, src/follows.js) hear about real activities and owner / stage
// changes made by someone else; system entries and property history stay silent.
const FOLLOW_SILENT = new Set(['system', 'prop']);
const followName = (r) => (r && (r.name || `${r.first || ''} ${r.last || ''}`.trim())) || '';
function notifyRecordFollowers(type, id, kind, detail, actor, key) {
  try {
    const followers = followersOf(type, id);
    if (!followers.length) return;
    const r = findIn(type, id);
    notifyFollowers({ type, id, name: followName(r) || `#${id}`, followers, kind, detail, actor, key });
  } catch (e) { console.error('[notificaciones] seguidores', e); }
}
export function addActivity(ev) {
  insertActivity(ev);
  try { touchLastActivity(ev); } catch (e) { console.error('[última actividad]', e); }
  if (ev && ev.type && !FOLLOW_SILENT.has(ev.type)) notifyRecordFollowers(ev.recordType, ev.recordId, ev.type, ev.text, !ev.who || ev.who === 'Tú' ? ACTOR : ev.who, `follow:${ev.recordType}:${ev.recordId}:${ev.type}:${ev.when}`);
  // A meeting scheduled ahead becomes the record's «Próxima actividad» when it is the nearest one.
  if (ev && ev.type === 'meeting' && NEXT_ACTIVITY_TYPES.has(ev.recordType)) { try { recomputeNextActivity(ev.recordType, ev.recordId); } catch (e) { console.error('[próxima actividad]', e); } }
}
// Many entries at once (a marketing e-mail sent to hundreds of contacts): one insert per 200 rows.
export function addActivities(events) {
  if (!events.length) return;
  if (activitiesLive) {
    events.forEach((ev) => activityRows.unshift({ ...ev, recordId: Number(ev.recordId) }));
    dbWrite(async () => {
      for (let i = 0; i < events.length; i += 200) {
        const { error } = await supabase.from('activities').insert(events.slice(i, i + 200).map(activityToDb));
        if (error) console.error('[supabase] insert activities', error);
      }
    });
  } else events.forEach((ev) => insertActivity(ev));
  touchLastActivities(events);
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

// ---------- interface settings per user or global (user_settings table) ----------
// Things like the properties shown on a record's "Acerca de" card. Read at start-up for the signed-in user
// (its rows win over the global ones, user_id = zero uuid); saved with setSetting. Without the table (or in
// local mode) the pages keep their localStorage copy.
const GLOBAL_USER = '00000000-0000-0000-0000-000000000000';
let settingsMap = null; // key → { value, scope } once the table has been read
let settingsUserId = GLOBAL_USER;
export const settingsLive = () => settingsMap !== null;
async function fetchUserSettings(uid) {
  const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', uid).eq('scope', 'user').order('updated_at');
  if (error) throw error;
  const globalResult = await supabase.from('account_settings').select('*');
  if (globalResult.error) throw globalResult.error;
  const map = new Map((globalResult.data || []).map((r) => [r.key, { value: r.value, scope: 'global' }]));
  (data || []).forEach((r) => { if (r.user_id === GLOBAL_USER) map.set(r.key, { value: r.value, scope: 'global' }); });
  (data || []).forEach((r) => { if (r.user_id !== GLOBAL_USER) map.set(r.key, { value: r.value, scope: 'user' }); });
  return map;
}
export function getSetting(key) {
  const hit = settingsMap && settingsMap.get(key);
  return hit ? hit.value : null;
}
export const settingScope = (key) => ((settingsMap && settingsMap.get(key)) || {}).scope || null;
// scope: 'user' (default when signed in) or 'global' (the whole account).
export function setSetting(key, value, { scope } = {}) {
  if (!settingsMap) return false;
  const useGlobal = scope === 'global' || settingsUserId === GLOBAL_USER;
  const table = useGlobal ? 'account_settings' : 'user_settings';
  const what = useGlobal ? 'ajustes de la cuenta' : 'ajustes de la interfaz';
  // «Restablecer»: a null value means "no setting" → the row is deleted (value is NOT NULL in both tables), so
  // the default comes back in every browser; the local copy is already gone.
  if (value === null || value === undefined) {
    settingsMap.delete(key);
    dbWrite(async () => {
      let q = supabase.from(table).delete().eq('key', key);
      if (!useGlobal) q = q.eq('user_id', settingsUserId);
      const { error } = await q;
      if (error) reportDbError(what, error);
    });
    return true;
  }
  settingsMap.set(key, { value, scope: useGlobal ? 'global' : 'user' });
  const row = { ...(useGlobal ? {} : { user_id: settingsUserId }), scope: useGlobal ? 'account' : 'user', key, value, updated_at: new Date().toISOString() };
  dbWrite(async () => {
    const { error } = await supabase.from(table).upsert(row, { onConflict: useGlobal ? 'key' : 'user_id,key' });
    // A refused write (for example, a missing policy) must not look like success.
    if (error) reportDbError(what, error);
  });
  return true;
}
// The follow lists («Seguir» on records) and the record / preview layouts («Personalizar») use the same
// per-user settings when the table is live.
bindFollowSettings({ live: settingsLive, get: getSetting, set: setSetting });
bindLayoutSettings({ live: settingsLive, get: getSetting, set: setSetting });

// ---------- deal line items ("Elementos de pedido" of the Crear negocio panel) ----------
// Persisted in deal_line_items (supabase/deal_line_items.sql); in local mode in localStorage. There is no
// products table, so a line is name + quantity + unit price in the deal's currency.
const LINE_ITEMS_KEY = 'crm:deals:lineitems';
let lineItemRows = [];
const lineItemFromDb = (r) => ({ id: r.id, dealId: Number(r.deal_id), name: r.name || '', quantity: Number(r.quantity) || 0, price: Number(r.price) || 0, currency: r.currency || homeCurrency(), created: r.created });
const normLine = (x) => ({ name: String(x.name || '').trim(), quantity: Math.max(0, Number(x.quantity) || 0), price: Math.max(0, Number(x.price) || 0), currency: currencyOf(x.currency) });
export function lineItemsFor(dealId) {
  const rows = dbLive ? lineItemRows : read(LINE_ITEMS_KEY, []);
  return rows.filter((r) => Number(r.dealId) === Number(dealId));
}
// Reads the lines of one deal (or all) from Supabase into the cache; local mode just answers from storage.
export async function fetchLineItems(dealId) {
  if (!dbLive) return lineItemsFor(dealId);
  let q = supabase.from('deal_line_items').select('*').order('id');
  if (dealId) q = q.eq('deal_id', Number(dealId));
  const { data, error } = await q;
  if (error) throw error;
  const fresh = (data || []).map(lineItemFromDb);
  lineItemRows = [...lineItemRows.filter((r) => (dealId ? Number(r.dealId) !== Number(dealId) : false)), ...fresh];
  return lineItemsFor(dealId);
}
export function addLineItems(dealId, items) {
  const lines = (items || []).map(normLine).filter((x) => x.name);
  if (!lines.length) return [];
  const stamp = TODAY.toISOString();
  if (dbLive) {
    const base = Date.now();
    const recs = lines.map((x, i) => ({ id: -(base + i), dealId: Number(dealId), ...x, created: stamp }));
    lineItemRows.push(...recs);
    dbWrite(async () => {
      const payload = lines.map((x) => ({ deal_id: Number(dealId), name: x.name, quantity: x.quantity, price: x.price, currency: x.currency, created: stamp }));
      const { data, error } = await supabase.from('deal_line_items').insert(payload).select('id');
      if (error) { console.error('[supabase] insert deal_line_items', error); return; }
      (data || []).forEach((row, i) => { if (recs[i]) recs[i].id = row.id; });
    });
    return recs;
  }
  const all = read(LINE_ITEMS_KEY, []);
  const next = all.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  const recs = lines.map((x, i) => ({ id: next + i, dealId: Number(dealId), ...x, created: stamp }));
  write(LINE_ITEMS_KEY, [...all, ...recs]);
  return recs;
}
export const lineItemsTotal = (rows) => rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.price) || 0), 0);
// Edits one line (name, quantity, price) in place: UPDATE on deal_line_items, or the localStorage copy.
export function updateLineItem(id, patch) {
  const rows = dbLive ? lineItemRows : read(LINE_ITEMS_KEY, []);
  const r = rows.find((x) => Number(x.id) === Number(id));
  if (!r) return null;
  const next = normLine({ ...r, ...patch, currency: (patch && patch.currency) || r.currency });
  if (!next.name) return null;
  Object.assign(r, next);
  if (dbLive) {
    if (Number(r.id) > 0) dbWrite(async () => { const { error } = await supabase.from('deal_line_items').update({ name: r.name, quantity: r.quantity, price: r.price, currency: r.currency }).eq('id', r.id); if (error) console.error('[supabase] update deal_line_items', error); });
  } else write(LINE_ITEMS_KEY, rows);
  return { ...r };
}
// Removes one line: DELETE on deal_line_items, or the localStorage copy. Returns true when it existed.
export function removeLineItem(id) {
  if (dbLive) {
    const i = lineItemRows.findIndex((x) => Number(x.id) === Number(id));
    if (i < 0) return false;
    const [r] = lineItemRows.splice(i, 1);
    if (Number(r.id) > 0) dbWrite(async () => { const { error } = await supabase.from('deal_line_items').delete().eq('id', r.id); if (error) console.error('[supabase] delete deal_line_items', error); });
    return true;
  }
  const all = read(LINE_ITEMS_KEY, []);
  const next = all.filter((x) => Number(x.id) !== Number(id));
  if (next.length === all.length) return false;
  write(LINE_ITEMS_KEY, next);
  return true;
}
// The deal's amount follows its lines, as the original does: the lines' total while there are lines, and the
// amount the deal had before its first line (amountBeforeLines) once the last one is removed. Every change
// leaves «Elementos de pedido actualizados: total …» on the deal's timeline.
export function applyLineItemsToDeal(dealId) {
  const d = findIn('deals', dealId);
  if (!d) return null;
  const rows = lineItemsFor(dealId);
  const total = lineItemsTotal(rows);
  const code = (rows[0] && rows[0].currency) || d.deal_currency_code || homeCurrency();
  const hadBefore = d.amountBeforeLines !== undefined && d.amountBeforeLines !== null && d.amountBeforeLines !== '';
  let amount;
  if (rows.length) {
    if (!hadBefore) setField('deals', dealId, 'amountBeforeLines', Number(d.amount) || 0);
    amount = total;
  } else {
    amount = hadBefore ? Number(d.amountBeforeLines) || 0 : Number(d.amount) || 0;
    if (hadBefore) setField('deals', dealId, 'amountBeforeLines', null);
  }
  const changed = Number(d.amount) !== amount;
  if (changed) setField('deals', dealId, 'amount', amount);
  logSystem('deals', dealId, `Elementos de pedido actualizados: total ${formatMoney(total, code)} (${rows.length} ${rows.length === 1 ? 'línea' : 'líneas'})${changed ? ` · importe del negocio ${formatMoney(amount, code)}` : ''}.`, { lineItems: rows.length, lineItemsTotal: total, amount });
  return { total, amount, count: rows.length, changed };
}

// Every activity of the account (the reports count calls and emails by date). In localStorage mode the
// per-record keys are scanned; a storage without key enumeration (tests) simply yields none.
export function allActivities() {
  if (activitiesLive) return activityRows.filter((a) => !a.extra?.deletedAt);
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

// ---------- custom properties (Configuración › Propiedades) in the custom_properties table ----------
// Read before the records, so the catalog (and the fields of every list, record and form) already has them.
const CUSTOM_MIGRATED_KEY = 'crm:customprops:migrated';
async function fetchCustomProperties() {
  const { data, error } = await supabase.from('custom_properties').select('*').order('created_at');
  if (error) throw error;
  if (data && data.length) archivedAtColumn = 'archived_at' in data[0];
  return data || [];
}
// custom_properties.archived_at (supabase/custom-properties-archived-at.sql) may still be pending on the database:
// the rows are then written without it (the archive date stays in the app's memory only) and the purge of archived
// properties is skipped, instead of every save failing with «column archived_at does not exist».
let archivedAtColumn = null; // null = not seen yet, true / false once known
const missingColumn = (e, col) => Boolean(e) && (e.code === '42703' || e.code === 'PGRST204') && String(e.message || '').includes(col);
const stripArchivedAt = (rows) => rows.map(({ archived_at, ...r }) => r);
async function withArchivedAt(rows, run) {
  let res = await run(archivedAtColumn === false ? stripArchivedAt(rows) : rows);
  if (res.error && archivedAtColumn !== false && missingColumn(res.error, 'archived_at')) {
    archivedAtColumn = false;
    console.warn('[supabase] custom_properties.archived_at no existe (migración custom-properties-archived-at.sql pendiente); las propiedades se guardan sin fecha de archivado.');
    res = await run(stripArchivedAt(rows));
  }
  return res;
}
// Saves one object's whole list: upserts what is there and removes what was deleted in Configuración.
async function writeCustomProperties(type, list) {
  const objeto = CUSTOM_OBJECT_NAME[type];
  if (!objeto) return;
  const rows = list.map((p) => customPropToDb(type, p));
  if (rows.length) {
    const { error } = await withArchivedAt(rows, (payload) => supabase.from('custom_properties').upsert(payload, { onConflict: 'objeto,name' }));
    if (error) throw error;
  }
  let q = supabase.from('custom_properties').delete().eq('objeto', objeto);
  if (rows.length) q = q.not('name', 'in', `(${rows.map((r) => `"${String(r.name).replace(/"/g, '')}"`).join(',')})`);
  const { error: delErr } = await q;
  if (delErr) console.error('[supabase] delete custom_properties', delErr);
}
// One-time move of the properties that were kept in localStorage into the table (then they leave localStorage).
async function migrateLocalCustomProperties(existing) {
  if (localStorage.getItem(CUSTOM_MIGRATED_KEY) === '1') return 0;
  const have = new Set(existing.map((r) => `${r.objeto}:${r.name}`));
  const rows = [];
  const types = [];
  for (const type of Object.keys(CUSTOM_OBJECT_NAME)) {
    const local = localCustomProperties(type);
    if (!local.length) continue;
    types.push(type);
    local.forEach((p) => { const row = customPropToDb(type, p); if (p.key && !have.has(`${row.objeto}:${row.name}`)) rows.push(row); });
  }
  if (rows.length) {
    const { error } = await withArchivedAt(rows, (payload) => supabase.from('custom_properties').insert(payload));
    if (error) { console.error('[supabase] migración de propiedades personalizadas', error); return 0; }
    console.info(`[supabase] ${rows.length} propiedades personalizadas migradas desde localStorage.`);
  }
  types.forEach(clearLocalCustomProperties);
  localStorage.setItem(CUSTOM_MIGRATED_KEY, '1');
  return rows.length;
}
// The account's real contact properties are part of the catalog: if the table misses any (an older
// custom-properties.sql, or rows deleted by hand) they are inserted again, never overwritten.
async function ensureSeedProperties(rows) {
  const have = new Set(rows.map((r) => `${r.objeto}:${r.name}`));
  const missing = Object.entries(SEED_BY_TYPE).flatMap(([type, seeds]) => seeds.filter((s) => !have.has(`${CUSTOM_OBJECT_NAME[type]}:${s.key}`)).map((s) => customPropToDb(type, s)));
  if (!missing.length) return 0;
  const { error } = await withArchivedAt(missing, (payload) => supabase.from('custom_properties').upsert(payload, { onConflict: 'objeto,name', ignoreDuplicates: true }));
  if (error) { console.error('[supabase] siembra de propiedades personalizadas', error); return 0; }
  return missing.length;
}
async function initCustomProperties() {
  let rows = await fetchCustomProperties();
  const moved = await migrateLocalCustomProperties(rows);
  const seeded = await ensureSeedProperties(rows);
  if (moved || seeded) rows = await fetchCustomProperties();
  loadCustomProperties(rows);
  setCustomPropertyWriter((type, list) => dbWrite(() => writeCustomProperties(type, list)));
}

// ---------- Supabase bootstrap ----------
// Soft-deleted rows stay in the database: the lists never download them (the trash loads on demand, ensureTrash).
const trashLoaded = new Set();
export async function ensureTrash(type) {
  if (!dbLive || !softDeletes(type) || trashLoaded.has(type)) return false;
  const { data, error } = await supabase.from(type).select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(500);
  if (error) throw error;
  const known = new Set((trashRows[type] || []).map((r) => Number(r.id)));
  trashRows[type] = [...(trashRows[type] || []), ...(data || []).filter((r) => !known.has(Number(r.id))).map((r) => augment(type, fromDb(type, r)))];
  trashLoaded.add(type);
  return true;
}
async function fetchTable(type) {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(type).select('*');
    if (softDeletes(type)) q = q.is('deleted_at', null);
    let { data, error } = await q
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  // Soft-deleted rows go to the trash, the rest to the list.
  const live = [];
  const trash = [];
  all.forEach((r) => (softDeletes(type) && r.deleted_at ? trash : live).push(r));
  trashRows[type] = trash.map((r) => augment(type, fromDb(type, r)));
  return live.map((r) => augment(type, fromDb(type, r)));
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

export function buildDemoSeedPayload() {
  return Object.fromEntries(Object.keys(BUILDERS).map((type) => [type,
    Array.from({ length: COUNTS[type] }, (_, i) => toDb(type, BUILDERS[type](i))),
  ]));
}

async function seedAll() {
  // bootstrap-demo.sql serializes concurrent calls with a transaction advisory lock.
  // The database checks emptiness while holding table locks and inserts all tables atomically.
  // Never fall back to client-side inserts when the RPC/migration is unavailable.
  const payload = buildDemoSeedPayload();
  return bootstrapDemo(supabase, payload);
}

// Which pages load light: the four record lists download their own table one page at a time (src/server-list.js)
// and, like the record pages, only the activities they show; every other page keeps the full bootstrap.
const PATH = typeof location !== 'undefined' ? location.pathname : '';
const LIST_PAGE = /\/(contacts|companies|deals|tickets)\/(index\.html)?$/;
const lazyTypes = new Set(DB_MODE && LIST_PAGE.test(PATH) ? [PATH.match(LIST_PAGE)[1]] : []);
const LIGHT_ACTIVITIES = lazyTypes.size > 0 || /\/record\//.test(PATH);
const lazyCounts = {};
const ensurePromises = {};
export const isLazy = (type) => dbLive && lazyTypes.has(type);
export const lazyCount = (type) => lazyCounts[type] || 0;
// Row count and highest id of a lazy table (for the pager and for new ids) without downloading it.
async function fetchLazyMeta(type) {
  const { data, count, error } = await supabase.from(type).select('id', { count: 'exact' }).is('deleted_at', null).order('id', { ascending: false }).limit(1);
  if (error) throw error;
  lazyCounts[type] = Number(count) || 0;
  nextId[type] = ((data && data[0] && Number(data[0].id)) || 0) + 1;
  dbRows[type] = [];
}
// Downloads the whole table of a lazy type (board view, exports, duplicates, nested hierarchy, filters the
// database can't express); from then on the list works in memory as before.
export function ensureAll(type) {
  if (!isLazy(type)) return Promise.resolve(false);
  if (!ensurePromises[type]) {
    ensurePromises[type] = fetchTable(type).then((rows) => {
      dbRows[type] = rows;
      nextId[type] = Math.max(nextId[type] || 1, rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1);
      lazyTypes.delete(type);
      delete baseCache[type];
      bump();
      return true;
    }).catch((e) => { delete ensurePromises[type]; throw e; });
  }
  return ensurePromises[type];
}
// Activities of specific records (a record page's timeline, the board's cards), merged into the cache.
const loadedActivityKeys = new Set();
let allActivitiesLoaded = !LIGHT_ACTIVITIES;
export async function ensureActivitiesFor(recordType, recordIds) {
  if (!dbLive || !activitiesLive || allActivitiesLoaded) return allActivitiesLoaded;
  const ids = (Array.isArray(recordIds) ? recordIds : [recordIds]).map(Number).filter((n) => Number.isFinite(n) && !loadedActivityKeys.has(`${recordType}:${n}`));
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase.from('activities').select('*').eq('record_type', recordType).in('record_id', chunk).order('id');
    if (error) { console.error('[supabase] activities', error); return false; }
    const known = new Set(activityRows.map((a) => a.id));
    (data || []).map(activityFromDb).forEach((a) => { if (!known.has(a.id)) activityRows.push(a); });
    chunk.forEach((n) => loadedActivityKeys.add(`${recordType}:${n}`));
  }
  return true;
}
export async function ensureAllActivities() {
  if (!dbLive || !activitiesLive || allActivitiesLoaded) return allActivitiesLoaded;
  activityRows = await fetchActivities();
  allActivitiesLoaded = true;
  return true;
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
// With the team policies (supabase/rls_team.sql) a signed-in user who is not an active member of
// public.team_members sees nothing: say so instead of seeding or switching to the demo. 'unknown' when the
// migration has not been applied (no table) — the app behaves as before.
export async function teamMembership(session, client = supabase) {
  const uid = session && session.user && session.user.id;
  if (!uid || !client) return 'unknown';
  try {
    const { data, error } = await client.from('team_members').select('active').eq('user_id', uid).maybeSingle();
    if (error) return 'unknown';
    if (!data) return 'none';
    return data.active ? 'active' : 'inactive';
  } catch {
    return 'unknown';
  }
}
export const teamNoticeHtml = (email, status) => `<main style="max-width:640px;margin:80px auto;padding:32px;font-family:'Lexend Deca',Helvetica,Arial,sans-serif;color:#333;border:1px solid #dfe3eb;border-radius:8px;background:#fff">
    <h1 style="font-size:22px;margin:0 0 12px">Tu cuenta no está activa en el equipo</h1>
    <p>Has iniciado sesión como <strong>${String(email || '').replace(/[&<>]/g, '')}</strong>, pero ${status === 'inactive' ? 'un administrador dio de baja tu acceso' : 'tu usuario todavía no figura como miembro del equipo'} en Omni, así que la base de datos no muestra ningún registro.</p>
    <p>Pide a un administrador que te active en la tabla <code>team_members</code> de Supabase (<code>update public.team_members set active = true where email = '…'</code>) y vuelve a cargar esta página.</p>
    <p style="margin-top:20px"><button id="rls-reload" type="button" style="padding:10px 16px;border:0;border-radius:6px;background:#ff5c35;color:#fff;font:inherit;font-weight:600">Volver a cargar</button> <button id="rls-signout" type="button" style="padding:10px 16px;border:1px solid #dfe3eb;border-radius:6px;background:#fff;font:inherit">Cerrar sesión</button></p>
  </main>`;
function showTeamNotice(session, status) {
  document.body.innerHTML = teamNoticeHtml(session?.user?.email || '', status);
  document.getElementById('rls-reload').onclick = () => location.reload();
  document.getElementById('rls-signout').onclick = async () => { await signOut(); location.replace(siteRoot()); };
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
    // Parallel bootstrap: every independent fetch fires in a single wave, and
    // each keeps its own fallback so a missing migration only disables its
    // feature. A failure in a main table still rejects Promise.all and flips
    // the app to demo mode, exactly as the sequential version did.
    settingsUserId = (session && session.user && session.user.id) || GLOBAL_USER;
    settingsUserEmail = (session && session.user && session.user.email) || '';
    teamReady = fetchMyTeam();
    await Promise.all([
      teamReady,
      initCustomProperties().catch((e) => {
        // supabase/custom-properties.sql not applied yet: custom properties stay in localStorage.
        console.error('[supabase] tabla custom_properties no disponible; propiedades personalizadas en localStorage.', e);
      }),
      initPipelines().catch((e) => {
        // supabase/pipelines.sql not applied yet: the pipelines stay in localStorage / the built-in ones.
        pipelineDefsRemote = null;
        console.error('[supabase] tablas pipelines no disponibles; pipelines en localStorage.', e);
      }),
      ...Object.keys(BUILDERS).map((type) => (lazyTypes.has(type) ? fetchLazyMeta(type) : fetchTable(type).then((rows) => { dbRows[type] = rows; }))),
      fetchViews().catch((e) => {
        // supabase/crm_views.sql not applied yet: the saved views stay in localStorage (not shared).
        viewRows = null;
        console.error('[supabase] tabla crm_views no disponible; vistas guardadas en localStorage.', e);
      }),
      fetchUserSettings(settingsUserId).then(
        (map) => { settingsMap = map; },
        (e) => {
          // supabase/user_settings.sql not applied yet: interface settings stay in localStorage.
          settingsMap = null;
          console.error('[supabase] tabla user_settings no disponible; ajustes de la interfaz en localStorage.', e);
        },
      ),
      fetchContactCompanies().then(
        (rows) => { contactCompanyRows = rows; contactCompanyIndex = null; },
        (e) => {
          // supabase/contact_companies.sql not applied yet: the links stay on the contact records.
          contactCompanyRows = null;
          console.error('[supabase] tabla contact_companies no disponible; empresas del contacto en el propio registro.', e);
        },
      ),
      (LIGHT_ACTIVITIES ? Promise.resolve([]) : fetchActivities()).then(
        (rows) => { activityRows = rows; },
        (e) => {
          // La migración supabase/activities.sql aún no se ha ejecutado: la
          // cronología sigue en localStorage hasta que exista la tabla.
          activitiesLive = false;
          console.error('[supabase] tabla activities no disponible; cronología en localStorage.', e);
        },
      ),
      fetchSegments().then(
        (rows) => {
          segmentRows = rows;
          nextSegmentId = segmentRows.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0) + 1;
        },
        (e) => {
          // La migración supabase/segments.sql aún no se ha ejecutado: los segmentos siguen en localStorage.
          segmentsLive = false;
          console.error('[supabase] tabla segments no disponible; segmentos en localStorage.', e);
        },
      ),
    ]);
    const known = (type) => dbRows[type].length + (lazyCounts[type] || 0);
    if (session && !known('contacts') && !known('companies') && (await anonSeesRows('contacts'))) {
      showRlsNotice(session);
      await new Promise(() => {});
    }
    // Team policies in force (rls_team.sql) and this user is not an active member: nothing to seed, explain.
    if (session && !known('contacts') && !known('companies')) {
      const membership = await teamMembership(session);
      if (membership === 'none' || membership === 'inactive') {
        showTeamNotice(session, membership);
        await new Promise(() => {});
      }
    }
    if (!known('contacts') && !known('companies')) {
      const bootstrap = await seedAll();
      if (bootstrap.state !== 'failed') {
        const refetched = await Promise.all(Object.keys(BUILDERS).map((type) => fetchTable(type)));
        Object.keys(BUILDERS).forEach((type, i) => { dbRows[type] = refetched[i]; });
        lazyTypes.clear();
      }
    }
    for (const type of Object.keys(BUILDERS)) {
      nextId[type] = Math.max(nextId[type] || 0, dbRows[type].reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1);
    }
    if (activitiesLive) await migrateLocalActivities();
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

// The promise of the interface (TRASH_DAYS days in the trash, then gone for good) is kept here: once a day, at
// start-up. Local mode sweeps right away; live mode joins the write queue (dbIdle() waits for it) and tries again
// next start if something failed.
function schedulePurge() {
  try {
    const last = Number(localStorage.getItem(PURGED_AT_KEY) || 0);
    if (last && Date.now() - last < 86400000) return;
    localStorage.setItem(PURGED_AT_KEY, String(Date.now()));
    if (dbLive) dbWrite(() => purgeRemoteTrash().then((r) => { if (r.errors.length) localStorage.removeItem(PURGED_AT_KEY); }));
    else purgeLocalTrash();
  } catch (e) {
    console.error('[papelera] purga', e);
  }
}
schedulePurge();

// Queue assignments are confirmed by the database before updating the visible cache.
export async function assignTaskQueue(ids, queueId) {
  if (dbLive) {
    const { data, error } = await supabase.from('tasks').update({ queue_id: queueId }).in('id', ids).select('id');
    if (error) throw error;
    const saved = new Set(data.map(r => String(r.id)));
    for (const r of dbRows.tasks || []) if (saved.has(String(r.id))) r.queueId = queueId;
    bump();
    if (saved.size !== ids.length) throw new Error('No se pudieron asignar todas las tareas. Actualiza la lista.');
  } else {
    for (const id of ids) setField('tasks', id, 'queueId', queueId);
  }
}
export function clearDeletedTaskQueue(id) {
  if (dbLive) {
    for (const r of dbRows.tasks || []) if (r.queueId === id) r.queueId = null;
    bump();
  } else {
    for (const r of cached('tasks')) if (r.queueId === id) setField('tasks', r.id, 'queueId', null);
  }
}

// Public domain enrichment only. Unknown properties are persisted in extra by toDb.
export function companyDomainEnrichment(company = {}) {
  const domain = siteDomain(company.domain);
  return {
    logoUrl: domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : '',
    ...(domain && !String(company.website ?? company.extra?.website ?? '').trim() ? { website: `https://${domain}` } : {}),
  };
}
export function companyDomainPrefill(contact = {}) {
  const domain = emailDomain(contact.email);
  return domain && !isFreeEmailDomain(domain) ? domain : '';
}

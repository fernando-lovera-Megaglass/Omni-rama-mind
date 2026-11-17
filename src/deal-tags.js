// Etiquetas de Negocio (deal tags), like the original: a tag has a name, an emoji, a pastel colour, a description,
// the pipelines it applies to and a set of filters (same conditions as the views' advanced filters). It is
// evaluated automatically: a deal that satisfies the filters shows the tag's chip on its board card and in the
// list. Stored in Supabase (deal_tags) with a localStorage fallback; seeded with the account's three tags.
import { dbIsLive, allDeals, isClosedStage, dealPipelineDefs } from './data.js';
import { supabase } from './supabaseClient.js';
import { reportDbError } from './db-report.js';
import { matcherFor, groupConditions } from './filter-editor.js';
import { propertyMap } from './properties.js';
import { opLabel, opsFor, kindGroup, DAYS_OPS, NO_VALUE_OPS, TWO_VALUE_OPS } from './filter-ops.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const MAX_TAGS = 50;
export const PALETTE = [['#FBDDD8', 'Rosa'], ['#FBEECE', 'Crema'], ['#EBEBEB', 'Gris'], ['#D6F2E4', 'Verde'], ['#D8E8FB', 'Azul'], ['#E9DDFB', 'Lila'], ['#FFE5D0', 'Melocotón'], ['#DDF3F8', 'Celeste']];
export const EMOJIS = ['⭐', '🔥', '⚠️', '⏰', '💰', '🏆', '📌', '🚀', '🧊', '📞', '🤝', '✅', '❗', '💎', '🕒', '🏗️'];
// The original's presets of «Crear etiqueta»: name, hint and the filters they preload in step 2.
export const PRESETS = [
  { key: 'late', name: 'Atrasado', hint: 'La fecha de cierre pasó hace más de 1 día', emoji: '⏰', color: '#FBDDD8', filters: [{ key: 'closeDate', op: 'olderdays', value: '1', value2: '', group: 0, assoc: '', label: '' }, { key: 'hs_is_closed', op: 'anyof', value: 'No', value2: '', group: 0, assoc: '', label: '' }] },
  { key: 'urgent', name: 'Urgente', hint: 'La fecha de cierre es en menos de 3 días a partir de ahora', emoji: '🔥', color: '#FBEECE', filters: [{ key: 'closeDate', op: 'nextdays', value: '3', value2: '', group: 0, assoc: '', label: '' }, { key: 'hs_is_closed', op: 'anyof', value: 'No', value2: '', group: 0, assoc: '', label: '' }] },
  { key: 'contact', name: 'Agregar contacto', hint: 'El número de contactos asociados es menor que 1 o está vacío', emoji: '📞', color: '#D8E8FB', filters: [{ key: 'num_associated_contacts', op: 'lt', value: '1', value2: '', group: 0, assoc: '', label: '' }] },
];
export const presetByKey = (key) => PRESETS.find((p) => p.key === key) || null;
const LS = 'crm:deal_tags';
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `dt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const now = () => new Date().toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));
// Compiled matchers per tag (recompiled when a tag changes).
let matchers = new Map();
const invalidate = () => { matchers = new Map(); };
const cond = (key, op, value, group = 0) => ({ key, op, value, value2: '', group, assoc: '', label: '' });
// The account's three tags (same as the original's list): local mode and an empty table get them.
const seed = () => {
  const jfc = dealPipelineDefs().find((p) => /jfc/i.test(p.name));
  const t = now();
  return [
    { id: 'e1000000-0000-4000-8000-000000000001', name: 'Obsoleto', emoji: '', color: '#FBDDD8', description: 'La fecha de creación pasó hace más de 90 días y no se ha movido', pipelineIds: [], filters: [cond('created', 'olderdays', '90'), cond('hs_is_closed', 'anyof', 'No'), cond('lastActivity', 'olderdays', '90')], position: 0, createdAt: t, updatedAt: t },
    { id: 'e1000000-0000-4000-8000-000000000002', name: 'Importante', emoji: '', color: '#FBEECE', description: 'Son negocios importantes que son mayores de 1,000,000 de pesos', pipelineIds: [], filters: [cond('amount', 'gt', '1000000')], position: 1, createdAt: t, updatedAt: t },
    { id: 'e1000000-0000-4000-8000-000000000003', name: 'Negocios importantes', emoji: '', color: '#EBEBEB', description: 'Todos los negocios que se hayan generado arriba de 100,000', pipelineIds: jfc ? [jfc.id] : [], filters: [cond('amount', 'gt', '100000')], position: 2, createdAt: t, updatedAt: t },
  ];
};

// ---------- storage ----------
let live = dbIsLive();
let rows = [];
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn).catch((e) => reportDbError('etiquetas de negocio', e)); return queue; };
export const pending = () => queue;
const fromDb = (r) => ({ id: r.id, name: r.name || '', emoji: r.emoji || '', color: r.color || '#EBEBEB', description: r.description || '', pipelineIds: Array.isArray(r.pipeline_ids) ? r.pipeline_ids : [], filters: Array.isArray(r.filters) ? r.filters : [], position: Number(r.position) || 0, createdAt: r.created_at, updatedAt: r.updated_at || r.created_at });
const toDb = (t) => ({ id: t.id, name: t.name, emoji: t.emoji || '', color: t.color, description: t.description || '', pipeline_ids: t.pipelineIds || [], filters: t.filters || [], position: t.position || 0, created_at: t.createdAt, updated_at: t.updatedAt });
const saveLocal = () => localStorage.setItem(LS, JSON.stringify(rows));
function loadLocal() {
  try { const r = JSON.parse(localStorage.getItem(LS)); if (Array.isArray(r)) { rows = r; return; } } catch { /* seed */ }
  rows = seed();
  saveLocal();
}
async function loadLive() {
  const { data, error } = await supabase.from('deal_tags').select('*').order('position').order('created_at');
  if (error) throw error;
  rows = (data || []).map(fromDb);
  if (!rows.length) {
    rows = seed();
    const { error: e2 } = await supabase.from('deal_tags').insert(rows.map(toDb));
    if (e2) console.error('[supabase] semilla de etiquetas de negocio', e2);
  }
}
export const ready = (async () => {
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tabla deal_tags no disponible; etiquetas en localStorage.', e); loadLocal(); }
  } else loadLocal();
  invalidate();
})();
export const dealTagsLive = () => live;
const persist = (t) => { if (live) enqueue(async () => { const { error } = await supabase.from('deal_tags').upsert(toDb(t), { onConflict: 'id' }); if (error) throw error; }); else saveLocal(); };
const notify = () => { if (typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent('crm:deal-tags')); };

// ---------- reads ----------
export const dealTags = () => rows.map(clone).sort((a, b) => (a.position - b.position) || new Date(a.createdAt) - new Date(b.createdAt));
export const tagById = (id) => { const t = rows.find((x) => x.id === id); return t ? clone(t) : null; };
export const tagCount = () => rows.length;
const pipelineById = (id) => dealPipelineDefs().find((p) => String(p.id) === String(id)) || null;
export const appliesToPipeline = (tag, pipelineId) => !tag.pipelineIds || !tag.pipelineIds.length || tag.pipelineIds.some((id) => String(id) === String(pipelineId));
export const tagsForPipeline = (pipelineId) => dealTags().filter((t) => appliesToPipeline(t, pipelineId));
// "Múltiples pipelines" for every pipeline (or several), the pipeline's name for a single one.
export function pipelineAssignment(tag) {
  const ids = (tag.pipelineIds || []).filter((id) => pipelineById(id));
  if (!tag.pipelineIds || !tag.pipelineIds.length || ids.length > 1) return 'Múltiples pipelines';
  if (!ids.length) return 'Múltiples pipelines';
  return pipelineById(ids[0]).name;
}
export const pipelineNamesOf = (tag) => (tag.pipelineIds || []).map((id) => (pipelineById(id) || { name: String(id) }).name);

// ---------- writes ----------
const sanitize = (data = {}) => ({
  name: String(data.name || '').trim(),
  emoji: String(data.emoji || '').trim(),
  color: /^#[0-9a-f]{6}$/i.test(String(data.color || '')) ? String(data.color).toUpperCase() : PALETTE[2][0],
  description: String(data.description || '').trim(),
  pipelineIds: Array.isArray(data.pipelineIds) ? data.pipelineIds.filter((id) => pipelineById(id)) : [],
  filters: (Array.isArray(data.filters) ? data.filters : []).filter((c) => c && c.key).map((c) => ({ key: c.key, op: c.op || '', value: Array.isArray(c.value) ? c.value.slice() : String(c.value ?? ''), value2: String(c.value2 ?? ''), group: Number(c.group) || 0, assoc: c.assoc || '', label: c.label || '' })),
});
export function createTag(data) {
  const s = sanitize(data);
  if (!s.name) return null;
  if (rows.length >= MAX_TAGS) return null;
  const t = { id: uuid(), ...s, position: rows.length ? Math.max(...rows.map((x) => x.position || 0)) + 1 : 0, createdAt: now(), updatedAt: now() };
  rows.push(t);
  persist(t);
  invalidate();
  notify();
  return clone(t);
}
export function updateTag(id, data) {
  const t = rows.find((x) => x.id === id);
  if (!t) return null;
  const s = sanitize({ ...t, ...data });
  if (!s.name) return null;
  Object.assign(t, s, { updatedAt: now() });
  persist(t);
  invalidate();
  notify();
  return clone(t);
}
export function deleteTag(id) {
  const i = rows.findIndex((x) => x.id === id);
  if (i < 0) return false;
  rows.splice(i, 1);
  if (live) enqueue(async () => { const { error } = await supabase.from('deal_tags').delete().eq('id', id); if (error) throw error; }); else saveLocal();
  invalidate();
  notify();
  return true;
}
export function moveTag(id, dir) {
  const list = dealTags();
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((t, k) => { const r = rows.find((x) => x.id === t.id); if (r && r.position !== k) { r.position = k; r.updatedAt = now(); persist(r); } });
  invalidate();
  notify();
  return true;
}

// ---------- evaluation engine ----------
// The filters run on the deal plus a few computed properties of the original's catalog that the record does not
// carry itself: «Está cerrado» (Sí/No from the stage) and «Número de contactos asociados».
export function decorateDeal(r) {
  return { ...r, hs_is_closed: isClosedStage(r.stage) ? 'Sí' : 'No', num_associated_contacts: r.num_associated_contacts !== undefined && r.num_associated_contacts !== '' ? Number(r.num_associated_contacts) || 0 : r.contactId ? 1 : 0 };
}
const matcherOf = (tag) => {
  const key = `${tag.id}:${tag.updatedAt}`;
  if (!matchers.has(key)) matchers.set(key, tag.filters && tag.filters.length ? matcherFor('deals', tag.filters) : () => false);
  return matchers.get(key);
};
export const tagApplies = (tag, deal) => {
  const pipe = dealPipelineDefs().find((p) => p.name === deal.pipeline);
  if (!appliesToPipeline(tag, pipe ? pipe.id : null)) return false;
  if (!tag.filters || !tag.filters.length) return false;
  return matcherOf(tag)(decorateDeal(deal));
};
// The tags a deal earns right now (in the tags' order).
export const tagsForDeal = (deal) => (deal ? dealTags().filter((t) => tagApplies(t, deal)) : []);
export const usage = () => dealTags().map((t) => ({ tag: t, count: allDeals().filter((d) => tagApplies(t, d)).length }));

// ---------- chips and descriptions ----------
export const tagChipHtml = (tag, { size = '' } = {}) => `<span class="dtag${size ? ` dtag--${size}` : ''}" style="--dtag:${esc(tag.color || '#EBEBEB')}" title="${esc(tag.description || tag.name)}">${tag.emoji ? `<span class="dtag__emoji" aria-hidden="true">${esc(tag.emoji)}</span>` : ''}${esc(tag.name)}</span>`;
export const dealTagChips = (deal, opts) => tagsForDeal(deal).map((t) => tagChipHtml(t, opts)).join('');
const fmtNumber = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('es-MX') : String(v); };
// «Fecha de creación es de hace más de 90 días», «Importe es mayor que 1,000,000», «Está cerrado es igual a No»…
export function describeCondition(c) {
  const p = propertyMap('deals')[c.key];
  const label = p ? p.label : c.key;
  // The operator wording of the property's own family (a boolean reads «es igual a», not «es cualquiera de»).
  const own = p ? opsFor(kindGroup(p.kind)).find((o) => o[0] === c.op) : null;
  const op = (own ? own[1] : opLabel(c.op)).replace(' (días)', '');
  const days = (v) => `${fmtNumber(v)} ${Number(v) === 1 ? 'día' : 'días'}`;
  let value = '';
  if (NO_VALUE_OPS.has(c.op)) value = '';
  else if (DAYS_OPS.has(c.op)) value = days(c.value);
  else if (TWO_VALUE_OPS.has(c.op)) value = `${fmtNumber(c.value)} y ${fmtNumber(c.value2)}`;
  else if (Array.isArray(c.value)) value = c.value.join(', ');
  else if (p && ['number', 'currency', 'percent'].includes(p.kind)) value = fmtNumber(c.value);
  else value = String(c.value ?? '');
  return { label, op, value, text: `${label} ${op}${value ? ` ${value}` : ''}` };
}
export const filterGroups = (filters) => groupConditions(filters || []);

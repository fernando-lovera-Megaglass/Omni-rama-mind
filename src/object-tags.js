// Object tags («Etiquetas de Negocio», «Etiquetas de Ticket»…), like the original: a tag has a name, an emoji, a
// pastel colour, a description, the pipelines it applies to and a set of filters (the same conditions as the
// views' advanced filters). It is evaluated automatically: a record that satisfies the filters shows the tag's
// chip on its board card and in the list. createTagEngine builds one engine per object (src/deal-tags.js,
// src/ticket-tags.js): its own table (localStorage fallback), pipelines, rows, presets and change event.
import { dbIsLive } from './data.js';
import { supabase } from './supabaseClient.js';
import { reportDbError } from './db-report.js';
import { matcherFor, groupConditions } from './filter-editor.js';
import { propertyMap } from './properties.js';
import { opLabel, opsFor, kindGroup, DAYS_OPS, NO_VALUE_OPS, TWO_VALUE_OPS } from './filter-ops.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const MAX_TAGS = 50;
export const PALETTE = [['#FBDDD8', 'Rosa'], ['#FBEECE', 'Crema'], ['#EBEBEB', 'Gris'], ['#D6F2E4', 'Verde'], ['#D8E8FB', 'Azul'], ['#E9DDFB', 'Lila'], ['#FFE5D0', 'Melocotón'], ['#DDF3F8', 'Celeste']];
export const EMOJIS = ['⭐', '🔥', '⚠️', '⏰', '💰', '🏆', '📌', '🚀', '🧊', '📞', '🤝', '✅', '❗', '💎', '🕒', '🏗️'];
export const cond = (key, op, value, group = 0) => ({ key, op, value, value2: '', group, assoc: '', label: '' });
export const tagChipHtml = (tag, { size = '' } = {}) => `<span class="dtag${size ? ` dtag--${size}` : ''}" style="--dtag:${esc(tag.color || '#EBEBEB')}" title="${esc(tag.description || tag.name)}">${tag.emoji ? `<span class="dtag__emoji" aria-hidden="true">${esc(tag.emoji)}</span>` : ''}${esc(tag.name)}</span>`;
export const filterGroups = (filters) => groupConditions(filters || []);
const uuid = (prefix) => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const now = () => new Date().toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));
const fmtNumber = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('es-MX') : String(v); };

// cfg: { object, table, ls, event, label, pipelineDefs, rows, decorate, seed, presets }
//   object: 'deals' | 'tickets' (property catalogue and filter matcher) · table: Supabase table · ls: localStorage key
//   event: document event fired on every change · label: for error reports · pipelineDefs(): [{ id, name, … }]
//   rows(): every record of the object · decorate(r): the record plus computed properties the filters may use
//   seed(defs): the tags an empty store starts with · presets: «Crear etiqueta» presets.
export function createTagEngine(cfg) {
  const { object, table, ls, event, label } = cfg;
  const PRESETS = cfg.presets || [];
  const presetByKey = (key) => PRESETS.find((p) => p.key === key) || null;
  const decorate = cfg.decorate || ((r) => r);
  // Compiled matchers per tag (recompiled when a tag changes).
  let matchers = new Map();
  const invalidate = () => { matchers = new Map(); };

  // ---------- storage ----------
  let live = dbIsLive();
  let rows = [];
  let queue = Promise.resolve();
  const enqueue = (fn) => { queue = queue.then(fn).catch((e) => reportDbError(label, e)); return queue; };
  const fromDb = (r) => ({ id: r.id, name: r.name || '', emoji: r.emoji || '', color: r.color || '#EBEBEB', description: r.description || '', pipelineIds: Array.isArray(r.pipeline_ids) ? r.pipeline_ids : [], filters: Array.isArray(r.filters) ? r.filters : [], position: Number(r.position) || 0, createdAt: r.created_at, updatedAt: r.updated_at || r.created_at });
  const toDb = (t) => ({ id: t.id, name: t.name, emoji: t.emoji || '', color: t.color, description: t.description || '', pipeline_ids: t.pipelineIds || [], filters: t.filters || [], position: t.position || 0, created_at: t.createdAt, updated_at: t.updatedAt });
  const saveLocal = () => localStorage.setItem(ls, JSON.stringify(rows));
  const seed = () => (cfg.seed ? cfg.seed(cfg.pipelineDefs(), now()) : []);
  function loadLocal() {
    try { const r = JSON.parse(localStorage.getItem(ls)); if (Array.isArray(r)) { rows = r; return; } } catch { /* seed */ }
    rows = seed();
    saveLocal();
  }
  async function loadLive() {
    const { data, error } = await supabase.from(table).select('*').order('position').order('created_at');
    if (error) throw error;
    rows = (data || []).map(fromDb);
    if (!rows.length) {
      rows = seed();
      if (rows.length) {
        const { error: e2 } = await supabase.from(table).insert(rows.map(toDb));
        if (e2) console.error(`[supabase] semilla de ${label}`, e2);
      }
    }
  }
  const ready = (async () => {
    if (live) {
      try { await loadLive(); } catch (e) { live = false; console.error(`[supabase] tabla ${table} no disponible; ${label} en localStorage.`, e); loadLocal(); }
    } else loadLocal();
    invalidate();
  })();
  const persist = (t) => { if (live) enqueue(async () => { const { error } = await supabase.from(table).upsert(toDb(t), { onConflict: 'id' }); if (error) throw error; }); else saveLocal(); };
  const notify = () => { if (typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent(event)); };

  // ---------- reads ----------
  const tags = () => rows.map(clone).sort((a, b) => (a.position - b.position) || new Date(a.createdAt) - new Date(b.createdAt));
  const tagById = (id) => { const t = rows.find((x) => x.id === id); return t ? clone(t) : null; };
  const tagCount = () => rows.length;
  const pipelineById = (id) => cfg.pipelineDefs().find((p) => String(p.id) === String(id)) || null;
  const appliesToPipeline = (tag, pipelineId) => !tag.pipelineIds || !tag.pipelineIds.length || tag.pipelineIds.some((id) => String(id) === String(pipelineId));
  const tagsForPipeline = (pipelineId) => tags().filter((t) => appliesToPipeline(t, pipelineId));
  // "Múltiples pipelines" for every pipeline (or several), the pipeline's name for a single one.
  function pipelineAssignment(tag) {
    const ids = (tag.pipelineIds || []).filter((id) => pipelineById(id));
    if (!tag.pipelineIds || !tag.pipelineIds.length || ids.length > 1) return 'Múltiples pipelines';
    if (!ids.length) return 'Múltiples pipelines';
    return pipelineById(ids[0]).name;
  }
  const pipelineNamesOf = (tag) => (tag.pipelineIds || []).map((id) => (pipelineById(id) || { name: String(id) }).name);

  // ---------- writes ----------
  const sanitize = (data = {}) => ({
    name: String(data.name || '').trim(),
    emoji: String(data.emoji || '').trim(),
    color: /^#[0-9a-f]{6}$/i.test(String(data.color || '')) ? String(data.color).toUpperCase() : PALETTE[2][0],
    description: String(data.description || '').trim(),
    pipelineIds: Array.isArray(data.pipelineIds) ? data.pipelineIds.filter((id) => pipelineById(id)) : [],
    filters: (Array.isArray(data.filters) ? data.filters : []).filter((c) => c && c.key).map((c) => ({ key: c.key, op: c.op || '', value: Array.isArray(c.value) ? c.value.slice() : String(c.value ?? ''), value2: String(c.value2 ?? ''), group: Number(c.group) || 0, assoc: c.assoc || '', label: c.label || '' })),
  });
  function createTag(data) {
    const s = sanitize(data);
    if (!s.name) return null;
    if (rows.length >= MAX_TAGS) return null;
    const t = { id: uuid(object), ...s, position: rows.length ? Math.max(...rows.map((x) => x.position || 0)) + 1 : 0, createdAt: now(), updatedAt: now() };
    rows.push(t);
    persist(t);
    invalidate();
    notify();
    return clone(t);
  }
  function updateTag(id, data) {
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
  function deleteTag(id) {
    const i = rows.findIndex((x) => x.id === id);
    if (i < 0) return false;
    rows.splice(i, 1);
    if (live) enqueue(async () => { const { error } = await supabase.from(table).delete().eq('id', id); if (error) throw error; }); else saveLocal();
    invalidate();
    notify();
    return true;
  }
  function moveTag(id, dir) {
    const list = tags();
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
  const matcherOf = (tag) => {
    const key = `${tag.id}:${tag.updatedAt}`;
    if (!matchers.has(key)) matchers.set(key, tag.filters && tag.filters.length ? matcherFor(object, tag.filters) : () => false);
    return matchers.get(key);
  };
  const tagApplies = (tag, r) => {
    const pipe = cfg.pipelineDefs().find((p) => p.name === r.pipeline);
    if (!appliesToPipeline(tag, pipe ? pipe.id : null)) return false;
    if (!tag.filters || !tag.filters.length) return false;
    return matcherOf(tag)(decorate(r));
  };
  // The tags a record earns right now (in the tags' order).
  const tagsFor = (r) => (r ? tags().filter((t) => tagApplies(t, r)) : []);
  const chips = (r, opts) => tagsFor(r).map((t) => tagChipHtml(t, opts)).join('');
  const usage = () => tags().map((t) => ({ tag: t, count: cfg.rows().filter((r) => tagApplies(t, r)).length }));

  // «Fecha de creación es de hace más de 90 días», «Importe es mayor que 1,000,000», «Está cerrado es igual a No»…
  function describeCondition(c) {
    const p = propertyMap(object)[c.key];
    const label = p ? p.label : c.key;
    // The operator wording of the property's own family (a boolean reads «es igual a», not «es cualquiera de»).
    const own = p ? opsFor(kindGroup(p.kind)).find((o) => o[0] === c.op) : null;
    const op = (own ? own[1] : opLabel(c.op)).replace(' (días)', '');
    const days = (v) => `${fmtNumber(v)} ${Number(v) === 1 ? 'día' : 'días'}`;
    let value = '';
    if (NO_VALUE_OPS.has(c.op)) value = '';
    else if (DAYS_OPS.has(c.op)) value = days(c.value);
    else if (TWO_VALUE_OPS.has(c.op)) value = `${fmtNumber(c.value)} y ${fmtNumber(c.value2)}`;
    else if (Array.isArray(c.value)) value = c.value.map((v) => optionLabel(p, v)).join(', ');
    else if (p && ['number', 'currency', 'percent'].includes(p.kind)) value = fmtNumber(c.value);
    else value = optionLabel(p, c.value);
    return { label, op, value, text: `${label} ${op}${value ? ` ${value}` : ''}` };
  }
  // A select-type value reads by its label when the catalogue knows it («Alta» for high).
  const optionLabel = (p, v) => {
    const s = String(v ?? '');
    const opt = p && Array.isArray(p.hubspot?.options) ? p.hubspot.options.find((o) => String(o.value) === s) : null;
    if (opt) return opt.label;
    const own = cfg.optionLabel ? cfg.optionLabel(p ? p.key : '', s) : '';
    return own || s;
  };

  return {
    object, event, table, ready, pending: () => queue, live: () => live,
    tags, tagById, tagCount, appliesToPipeline, tagsForPipeline, pipelineAssignment, pipelineNamesOf,
    createTag, updateTag, deleteTag, moveTag,
    decorate, tagApplies, tagsFor, chips, usage, tagChipHtml, describeCondition, filterGroups,
    PRESETS, presetByKey, PALETTE, EMOJIS, MAX_TAGS, pipelineDefs: cfg.pipelineDefs,
  };
}

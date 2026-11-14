// Segments (the original's "Segmentos"): active segments defined by filter groups on an object's records
// (Y inside a group, O between groups, own properties, associated records and membership of other segments)
// and static segments with a fixed membership edited by hand. Persisted through data.js in the Supabase
// table `segments` (supabase/segments.sql) with a localStorage fallback and a sample set on first run.
import { ALL, TODAY, strip, listSegments, saveAllSegments, insertSegment, patchSegment, deleteSegments, seedSegments, segmentsAreLive, logSystem } from './data.js';
import { matcherFor, countConditions, LIMITS } from './filter-editor.js';

export const FOLDERS_KEY = 'crm:segments:folders';
export const ME = 'Fernando Lovera Colin';
export const SEGMENT_OBJECTS = [['contacts', 'Contacto'], ['companies', 'Empresa'], ['deals', 'Negocio'], ['tickets', 'Ticket']];
export const objectLabel = (o) => (SEGMENT_OBJECTS.find((x) => x[0] === o) || [o, o])[1];
export const objectPlural = (o) => ({ contacts: 'contactos', companies: 'empresas', deals: 'negocios', tickets: 'tickets' }[o] || o);
export const TYPE_LABELS = { active: 'Activo', static: 'Estática' };
export const CAMPAIGNS = ['Promoción otoño', 'Guía de ventanas', 'Feria Construmat', 'Lanzamiento aluminio'];
export { LIMITS };
const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const at = (daysAgo, h, m) => { const d = new Date(TODAY.getTime() - daysAgo * 86400000); d.setHours(h, m, 0, 0); return d.toISOString(); };

// ---------- sample set (neutral names, deterministic sizes and dates) ----------
const PEOPLE = [ME, 'María Gómez', 'Carlos López', 'Edgar Antonio', 'Diana Jiménez'];
export function sampleSegments() {
  const base = [
    ['Exportación Top 50 - Negocios', 'static', 'deals', 50, 0, 0, 18, 33, ME, ''],
    ['Exportación Top 50 - Contactos', 'static', 'contacts', 50, 0, 0, 18, 32, ME, ''],
    ['Exportación Top 50 Empresas Norte', 'static', 'companies', 20, 0, 0, 18, 29, ME, ''],
    ['prueba 1', 'static', 'companies', 10, 0, 0, 18, 24, ME, ''],
    ['Tickets abiertos Región Sur', 'active', 'tickets', null, 0, 29, 10, 45, ME, '', [{ key: 'status', op: 'noneof', value: ['closed'], group: 0 }]],
    ['Instaladores Región Sur', 'active', 'contacts', null, 1, 126, 13, 10, 'María Gómez', '', [{ key: 'customer_type', op: 'anyof', value: ['Instalador'], group: 0 }]],
    ['Empresas de PVC Carlos', 'static', 'companies', 24, 1, 182, 11, 42, ME, ''],
    ['Empresas de vidrio en Texas', 'active', 'companies', null, 0, 184, 13, 36, ME, '', [{ key: 'state', op: 'anyof', value: ['Texas'], group: 0 }]],
    ['Empresas de PVC', 'active', 'companies', null, 0, 188, 15, 8, 'Carlos López', '', [{ key: 'industry', op: 'anyof', value: ['Construcción'], group: 0 }]],
    ['Contactos distribuidor', 'active', 'contacts', null, 1, 213, 11, 56, 'Edgar Antonio', 'Grupo Distribuidores', [{ key: 'customer_type', op: 'anyof', value: ['Distribuidor'], group: 0 }]],
    ['Empresas de aluminio', 'active', 'companies', null, 0, 235, 20, 29, ME, '', [{ key: 'name', op: 'contains', value: 'alumin', group: 0 }]],
    ['Clientes', 'active', 'contacts', null, 1, 238, 16, 6, ME, '', [{ key: 'lifecycle', op: 'anyof', value: ['Cliente'], group: 0 }]],
  ];
  const extraNames = ['Arquitectos Monterrey', 'Constructoras Bajío', 'Clientes con garantía', 'Leads sin propietario', 'Negocios cerrados 2026', 'Tickets abiertos alta prioridad', 'Empresas Florida', 'Instaladores Arizona', 'Contactos newsletter', 'Empresas sin dominio', 'Negocios en cotización', 'Contactos sin actividad 90 días', 'Empresas Ciudad de México', 'Distribuidores Guadalajara', 'Contactos feria 2026', 'Negocios > 100k', 'Tickets en espera', 'Empresas de muro cortina', 'Contactos compras', 'Leads calificados por ventas'];
  const objects = ['contacts', 'companies', 'deals', 'tickets'];
  const rows = base.map((b, i) => ({ id: i + 1, name: b[0], type: b[1], object: b[2], size: b[3], usedIn: b[4], updated: at(b[5], b[6], b[7]), created: at(b[5] + 30, 9, 0), updatedBy: b[8], creator: b[8], folder: b[9], filters: b[10] || [], memberIds: [], description: '', campaign: '', access: { view: 'all', edit: 'all' }, processedAt: at(b[5], b[6], b[7]) }));
  for (let i = 0; i < 130; i += 1) {
    const n = extraNames[i % extraNames.length];
    rows.push({ id: base.length + i + 1, name: i < extraNames.length ? n : `${n} ${Math.floor(i / extraNames.length) + 1}`, type: i % 3 === 0 ? 'static' : 'active', object: objects[(i * 7) % 4], size: (i * 137) % 400 + 3, usedIn: i % 4 === 0 ? 1 : 0, updated: at(240 + i * 3, 9 + (i % 9), (i * 11) % 60), created: at(270 + i * 3, 9, 0), updatedBy: PEOPLE[(i * 3) % PEOPLE.length], creator: PEOPLE[(i * 3) % PEOPLE.length], folder: i % 9 === 4 ? 'Grupo Distribuidores' : '', filters: [], memberIds: [], description: '', campaign: '', access: { view: 'all', edit: 'all' }, processedAt: at(240 + i * 3, 9, 0) });
  }
  return rows;
}

// ---------- store ----------
let seeded = false;
export function segments() {
  const list = listSegments();
  if (Array.isArray(list) && list.length) return list;
  if (!seeded) {
    seeded = true;
    const sample = sampleSegments();
    saveAllSegments(sample);
    if (segmentsAreLive()) seedSegments(() => sample);
    return sample;
  }
  return Array.isArray(list) ? list : [];
}
export function segmentById(id) {
  return segments().find((s) => Number(s.id) === Number(id)) || null;
}
export function folders() {
  return read(FOLDERS_KEY, null) || ['Grupo Distribuidores'];
}
export function saveFolders(list) {
  write(FOLDERS_KEY, list);
}
export function addSegment({ name, object = 'contacts', type = 'active', folder = '', creator = ME, filters = [], size = null, importId = null, description = '', campaign = '', access = { view: 'all', edit: 'all' }, memberIds = [] }) {
  const list = segments();
  const now = new Date().toISOString();
  const entry = { id: Math.max(0, ...list.map((s) => Number(s.id) || 0)) + 1, name, type, object, size, usedIn: 0, updated: now, created: now, updatedBy: creator, creator, folder, filters, memberIds, importId, description, campaign, access, processedAt: '' };
  insertSegment(entry);
  (memberIds || []).forEach((rid) => logSystem(object, rid, `Añadido al segmento «${name}».`, { segment: entry.id }));
  return entry;
}
export function updateSegment(id, patch) {
  return patchSegment(id, { ...patch, updated: new Date().toISOString(), updatedBy: patch.updatedBy || ME });
}
export function removeSegments(ids) {
  deleteSegments(ids);
}
export function saveSegments(list) {
  saveAllSegments(list);
}

// ---------- membership ----------
const memberCache = new Map();
export function segmentMembers(seg, depth = 0) {
  if (!seg) return [];
  const rows = ALL[seg.object] ? ALL[seg.object]() : [];
  if (seg.type === 'static') {
    const ids = new Set((seg.memberIds || []).map(Number));
    if (ids.size) return rows.filter((r) => ids.has(Number(r.id)));
    return rows.slice(0, Number(seg.size) || 0);
  }
  if (!seg.filters || !seg.filters.length) return rows.slice(0, seg.size === null || seg.size === undefined ? rows.length : Number(seg.size) || 0);
  const lookup = (sid) => {
    if (depth > 3) return [];
    const key = `${sid}`;
    if (memberCache.has(key)) return memberCache.get(key);
    const other = segmentById(sid);
    const ids = other && Number(other.id) !== Number(seg.id) ? segmentMembers(other, depth + 1).map((m) => Number(m.id)) : [];
    memberCache.set(key, ids);
    return ids;
  };
  const match = matcherFor(seg.object, seg.filters, { segmentMembers: lookup });
  const out = rows.filter(match);
  if (depth === 0) memberCache.clear();
  return out;
}
export function segmentSize(seg) {
  if (!seg) return 0;
  if (seg.type === 'active' && seg.filters && seg.filters.length) return segmentMembers(seg).length;
  if (seg.type === 'static' && seg.memberIds && seg.memberIds.length) return seg.memberIds.length;
  return Number(seg.size) || 0;
}
// "Guardar y procesar": a static segment takes its snapshot; an active one records its count and the time.
export function processSegment(id) {
  const seg = segmentById(id);
  if (!seg) return null;
  // A static segment without members yet takes its snapshot from the filters it was saved with.
  const snapshot = seg.type === 'static' && (!seg.memberIds || !seg.memberIds.length) && seg.filters && seg.filters.length;
  const members = snapshot ? segmentMembers({ ...seg, type: 'active' }) : segmentMembers(seg);
  const patch = { size: members.length, processedAt: new Date().toISOString() };
  if (snapshot) patch.memberIds = members.map((m) => Number(m.id));
  return updateSegment(id, patch);
}
export function addStaticMembers(id, recordIds) {
  const seg = segmentById(id);
  if (!seg) return null;
  const before = new Set((seg.memberIds || []).map(Number));
  const ids = [...new Set([...before, ...recordIds.map(Number)])];
  // Each record newly added gets an entry on its timeline.
  recordIds.map(Number).filter((rid) => !before.has(rid)).forEach((rid) => logSystem(seg.object, rid, `Añadido al segmento «${seg.name}».`, { segment: seg.id }));
  return updateSegment(id, { memberIds: ids, size: ids.length });
}
export function removeStaticMembers(id, recordIds) {
  const seg = segmentById(id);
  if (!seg) return null;
  const drop = new Set(recordIds.map(Number));
  const ids = (seg.memberIds || []).map(Number).filter((x) => !drop.has(x));
  return updateSegment(id, { memberIds: ids, size: ids.length });
}
export function cloneSegment(id) {
  const s = segmentById(id);
  if (!s) return null;
  return addSegment({ ...s, name: `${s.name} (copia)`, size: segmentSize(s), memberIds: (s.memberIds || []).slice(), filters: JSON.parse(JSON.stringify(s.filters || [])), creator: ME, importId: null });
}
export function convertToStatic(id) {
  const s = segmentById(id);
  if (!s || s.type !== 'active') return s;
  const members = segmentMembers(s);
  return updateSegment(id, { type: 'static', memberIds: members.map((m) => Number(m.id)), size: members.length, filters: [] });
}
export const filterCounts = (filters) => countConditions(filters || []);
export const matchesSearch = (seg, q) => !q || strip(seg.name).includes(strip(q));
// A short description from the filters (the "Generar con IA" of the specification, done locally).
export function describeSegment(seg) {
  const n = filterCounts(seg.filters || []);
  if (seg.type === 'static') return `Segmento estático de ${objectPlural(seg.object)}: ${segmentSize(seg)} registros fijados al guardar. Los miembros solo cambian a mano.`;
  if (!n.total) return `Segmento activo con todos los ${objectPlural(seg.object)}.`;
  const groups = new Set((seg.filters || []).filter((c) => c.key).map((c) => Number(c.group) || 0)).size;
  return `Segmento activo de ${objectPlural(seg.object)} que cumplen ${n.total} ${n.total === 1 ? 'condición' : 'condiciones'}${groups > 1 ? ` en ${groups} grupos (basta con uno)` : ''}${n.associated ? `, ${n.associated} sobre registros asociados` : ''}. Se actualiza solo: los registros entran y salen según sus datos.`;
}

// Segments (the original's "Segmentos"/lists): active segments defined by conditions on an object's records,
// static segments with a fixed membership. Stored in localStorage with a sample set until the person changes them.
import { ALL, TODAY, strip } from './data.js';
import { evalCondition, conditionValues, kindGroup } from './filter-ops.js';
import { propertyMap } from './properties.js';

export const SEGMENTS_KEY = 'crm:segments';
export const FOLDERS_KEY = 'crm:segments:folders';
export const ME = 'Fernando Lovera Colin';
export const SEGMENT_OBJECTS = [['contacts', 'Contacto'], ['companies', 'Empresa'], ['deals', 'Negocio'], ['tickets', 'Ticket']];
export const objectLabel = (o) => (SEGMENT_OBJECTS.find((x) => x[0] === o) || [o, o])[1];
export const TYPE_LABELS = { active: 'Activo', static: 'Estática' };
const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const at = (daysAgo, h, m) => { const d = new Date(TODAY.getTime() - daysAgo * 86400000); d.setHours(h, m, 0, 0); return d.toISOString(); };

// Sample segments: neutral names, deterministic sizes and dates.
const PEOPLE = [ME, 'María Gómez', 'Carlos López', 'Edgar Antonio', 'Diana Jiménez'];
function sampleSegments() {
  const base = [
    ['Exportación Top 50 - Negocios', 'static', 'deals', 3038, 0, 0, 18, 33, ME, ''],
    ['Exportación Top 50 - Contactos', 'static', 'contacts', 873, 0, 0, 18, 32, ME, ''],
    ['Exportación Top 50 Empresas Norte', 'static', 'companies', 50, 0, 0, 18, 29, ME, ''],
    ['prueba 1', 'static', 'companies', 50, 0, 0, 18, 24, ME, ''],
    ['Negocios de instalación Región Sur', 'active', 'tickets', 14, 0, 29, 10, 45, ME, ''],
    ['Instaladores Región Sur', 'active', 'contacts', 54, 1, 126, 13, 10, 'María Gómez', ''],
    ['Empresas de PVC Carlos', 'static', 'companies', 24, 1, 182, 11, 42, ME, ''],
    ['Empresas de vidrio en Texas', 'active', 'companies', 571, 0, 184, 13, 36, ME, ''],
    ['Empresas de PVC', 'active', 'companies', 34, 0, 188, 15, 8, 'Carlos López', ''],
    ['Contactos distribuidor', 'active', 'contacts', 10296, 1, 213, 11, 56, 'Edgar Antonio', 'Grupo Distribuidores'],
    ['Empresas de aluminio', 'active', 'companies', 290, 0, 235, 20, 29, ME, ''],
    ['Contactos aluminio', 'active', 'contacts', 459, 1, 238, 16, 6, ME, ''],
  ];
  const extraNames = ['Arquitectos Monterrey', 'Constructoras Bajío', 'Clientes con garantía', 'Leads sin propietario', 'Negocios cerrados 2026', 'Tickets abiertos alta prioridad', 'Empresas Florida', 'Instaladores Arizona', 'Contactos newsletter', 'Empresas sin dominio', 'Negocios en cotización', 'Contactos sin actividad 90 días', 'Empresas Ciudad de México', 'Distribuidores Guadalajara', 'Contactos feria 2026', 'Negocios > 100k', 'Tickets en espera', 'Empresas de muro cortina', 'Contactos compras', 'Leads calificados por ventas'];
  const objects = ['contacts', 'companies', 'deals', 'tickets'];
  const rows = base.map((b, i) => ({ id: i + 1, name: b[0], type: b[1], object: b[2], size: b[3], usedIn: b[4], updated: at(b[5], b[6], b[7]), updatedBy: b[8], creator: b[8], folder: b[9], filters: [] }));
  for (let i = 0; i < 130; i += 1) {
    const n = extraNames[i % extraNames.length];
    rows.push({ id: base.length + i + 1, name: i < extraNames.length ? n : `${n} ${Math.floor(i / extraNames.length) + 1}`, type: i % 3 === 0 ? 'static' : 'active', object: objects[(i * 7) % 4], size: (i * 137) % 900 + 3, usedIn: i % 4 === 0 ? 1 : 0, updated: at(240 + i * 3, 9 + (i % 9), (i * 11) % 60), updatedBy: PEOPLE[(i * 3) % PEOPLE.length], creator: PEOPLE[(i * 3) % PEOPLE.length], folder: i % 9 === 4 ? 'Grupo Distribuidores' : '', filters: [] });
  }
  return rows;
}
export function segments() {
  return read(SEGMENTS_KEY, null) || sampleSegments();
}
export function saveSegments(list) {
  write(SEGMENTS_KEY, list);
}
export function folders() {
  return read(FOLDERS_KEY, null) || ['Grupo Distribuidores'];
}
export function saveFolders(list) {
  write(FOLDERS_KEY, list);
}
export function addSegment({ name, object = 'contacts', type = 'active', folder = '', creator = ME, filters = [], size = null, importId = null }) {
  const list = segments();
  const entry = { id: Math.max(0, ...list.map((s) => Number(s.id) || 0)) + 1, name, type, object, size, usedIn: 0, updated: new Date().toISOString(), updatedBy: creator, creator, folder, filters, importId };
  saveSegments([entry, ...list]);
  return entry;
}
export function updateSegment(id, patch) {
  const list = segments();
  const i = list.findIndex((s) => Number(s.id) === Number(id));
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, updated: new Date().toISOString(), updatedBy: patch.updatedBy || ME };
  saveSegments(list);
  return list[i];
}
export function removeSegments(ids) {
  const set = new Set(ids.map(Number));
  saveSegments(segments().filter((s) => !set.has(Number(s.id))));
}
// Members of an active segment: records of its object that satisfy every condition (AND).
export function segmentMembers(seg) {
  const rows = ALL[seg.object] ? ALL[seg.object]() : [];
  if (seg.type !== 'active' || !seg.filters || !seg.filters.length) return rows.slice(0, Number(seg.size) || 0);
  const props = propertyMap(seg.object);
  return rows.filter((r) => seg.filters.every((c) => {
    const p = props[c.key];
    const group = kindGroup(p ? p.kind : 'text');
    const raw = r[c.key];
    const text = Array.isArray(raw) ? raw.join(', ') : raw;
    return evalCondition(c, conditionValues(raw, text, group));
  }));
}
export function segmentSize(seg) {
  if (seg.type === 'active' && seg.filters && seg.filters.length) return segmentMembers(seg).length;
  return Number(seg.size) || 0;
}
export const matchesSearch = (seg, q) => !q || strip(seg.name).includes(strip(q));

// Association filters for the list pages ("Filtros avanzados"): which other objects a record is linked
// to, how to reach the linked records (implied keys plus the associations added on the record page,
// with their labels), and how a property of a linked record reads as text for comparisons.
import { ALL, DEAL_STAGES, TICKET_STATUSES, TASK_STATUSES, PRIORITIES, STATUSES, assocLabels, formatDate, formatMoney, strip } from './data.js';
import { propertyGroups, propertyMap } from './properties.js';
import { evalCondition, conditionValues, kindGroup } from './filter-ops.js';

const num = (v) => Number(v);
const byId = (rows, id) => rows.find((r) => num(r.id) === num(id));
const withLabel = (r, label) => ({ ...r, assocLabel: label });

// Linked records implied by the data (the primary company of a contact, the contact of a ticket...) together
// with the ones added from the record page (rec.assoc_<kind> ids and rec.assoc_labels_<kind>).
function linked(rec, kind, implied) {
  const labels = rec[`assoc_labels_${kind}`] || {};
  const rows = implied.map((r, i) => withLabel(r, labels[r.id] || (i === 0 ? 'Principal' : 'Sin etiqueta')));
  const seen = new Set(rows.map((r) => num(r.id)));
  (rec[`assoc_${kind}`] || []).forEach((id) => {
    if (seen.has(num(id))) return;
    const r = byId(ALL[kind](), id);
    if (r) rows.push(withLabel(r, labels[id] || 'Sin etiqueta'));
  });
  return rows;
}

const ASSOC = {
  contacts: [
    { key: 'companies', label: 'Empresa asociada', records: (r) => linked(r, 'companies', r.companyId ? [byId(ALL.companies(), r.companyId)].filter(Boolean) : []), labels: true },
    { key: 'deals', label: 'Negocio asociado', records: (r) => linked(r, 'deals', ALL.deals().filter((d) => num(d.contactId) === num(r.id))) },
    { key: 'tickets', label: 'Ticket asociado', records: (r) => linked(r, 'tickets', ALL.tickets().filter((t) => num(t.contactId) === num(r.id))) },
  ],
  companies: [
    { key: 'contacts', label: 'Contacto asociado', records: (r) => linked(r, 'contacts', ALL.contacts().filter((c) => num(c.companyId) === num(r.id))), labels: true },
    { key: 'deals', label: 'Negocio asociado', records: (r) => linked(r, 'deals', ALL.deals().filter((d) => num(d.companyId) === num(r.id))) },
  ],
  deals: [
    { key: 'companies', label: 'Empresa asociada', records: (r) => linked(r, 'companies', r.companyId ? [byId(ALL.companies(), r.companyId)].filter(Boolean) : []), labels: true },
    { key: 'contacts', label: 'Contacto asociado', records: (r) => linked(r, 'contacts', r.contactId ? [byId(ALL.contacts(), r.contactId)].filter(Boolean) : []), labels: true },
  ],
  tickets: [
    { key: 'contacts', label: 'Contacto asociado', records: (r) => linked(r, 'contacts', r.contactId ? [byId(ALL.contacts(), r.contactId)].filter(Boolean) : []) },
    { key: 'companies', label: 'Empresa asociada', records: (r) => { const c = r.contactId ? byId(ALL.contacts(), r.contactId) : null; return linked(r, 'companies', c && c.companyId ? [byId(ALL.companies(), c.companyId)].filter(Boolean) : []); } },
  ],
  tasks: [
    { key: 'contacts', label: 'Contacto asociado', records: (r) => linked(r, 'contacts', r.contactId ? [byId(ALL.contacts(), r.contactId)].filter(Boolean) : []) },
    { key: 'companies', label: 'Empresa asociada', records: (r) => { const c = r.contactId ? byId(ALL.contacts(), r.contactId) : null; return linked(r, 'companies', c && c.companyId ? [byId(ALL.companies(), c.companyId)].filter(Boolean) : []); } },
  ],
};

export const SINGULAR = { contacts: 'Contacto', companies: 'Empresa', deals: 'Negocio', tickets: 'Ticket', tasks: 'Tarea' };

export function associationsFor(type) {
  return ASSOC[type] || [];
}

export function associationLabelOptions() {
  return assocLabels();
}

// Property catalog of a linked object, grouped as in the column editor.
const GROUP_CACHE = {};
export function assocPropertyGroups(kind) {
  return GROUP_CACHE[kind] || (GROUP_CACHE[kind] = propertyGroups(kind));
}
const MAP_CACHE = {};
export function assocPropertyMap(kind) {
  return MAP_CACHE[kind] || (MAP_CACHE[kind] = propertyMap(kind));
}

// How a value of a linked record reads on screen (stage ids become their names, money is formatted...).
const labelIn = (list, v) => { const hit = list.find((x) => x[0] === v); return hit ? hit[1] : v; };
export function assocText(kind, key, r) {
  const v = r[key];
  if (v === undefined || v === null || v === '') return '';
  const p = assocPropertyMap(kind)[key];
  const k = p ? p.kind : '';
  if (key === 'stage' || k === 'stage') return labelIn(DEAL_STAGES, v);
  if (key === 'priority' || k === 'priority') return labelIn(PRIORITIES, v);
  if (key === 'status' || k === 'status') {
    if (kind === 'contacts') return (STATUSES[v] || [v])[0];
    if (kind === 'tickets') return labelIn(TICKET_STATUSES, v);
    if (kind === 'tasks') return labelIn(TASK_STATUSES, v);
  }
  if (k === 'currency') return formatMoney(v, kind === 'deals' && key === 'amount' ? r.deal_currency_code : undefined);
  if (k === 'percent') return `${v} %`;
  if (k === 'date' || k === 'datetime') return formatDate(v);
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return '';
  return String(v);
}

// Value choices for a property when it has a closed list (so the person picks instead of typing).
export function assocValueOptions(kind, key) {
  const p = assocPropertyMap(kind)[key];
  if (!p) return null;
  if (key === 'stage' || p.kind === 'stage') return DEAL_STAGES.map((s) => [s[1], s[1]]);
  if (key === 'priority' || p.kind === 'priority') return PRIORITIES.map((s) => [s[1], s[1]]);
  if (key === 'status' || p.kind === 'status') {
    if (kind === 'contacts') return Object.values(STATUSES).map((s) => [s[0], s[0]]);
    if (kind === 'tickets') return TICKET_STATUSES.map((s) => [s[1], s[1]]);
    if (kind === 'tasks') return TASK_STATUSES.map((s) => [s[1], s[1]]);
  }
  if (Array.isArray(p.options) && p.options.length) return p.options.map((o) => (Array.isArray(o) ? [o[1], o[1]] : [o, o]));
  return null;
}

// Operator family of a linked object's property.
export function assocKindGroup(kind, key) {
  const p = assocPropertyMap(kind)[key];
  return kindGroup(p ? p.kind : 'text');
}

// Does the record have a linked record (of the condition's association, optionally with the given label)
// whose property satisfies the condition? With no linked records only "es desconocido" holds.
export function assocConditionMatches(type, cond, r) {
  const a = associationsFor(type).find((x) => x.key === cond.assoc);
  if (!a) return true;
  let rows = a.records(r);
  if (cond.label) rows = rows.filter((x) => x.assocLabel === cond.label);
  if (!rows.length) return cond.op === 'empty';
  const group = assocKindGroup(a.key, cond.key);
  return rows.some((x) => evalCondition(cond, conditionValues(x[cond.key], assocText(a.key, cond.key, x), group)));
}

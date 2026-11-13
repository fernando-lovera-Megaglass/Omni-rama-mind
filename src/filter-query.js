// Translates the conditions of the "Todos los filtros" panel into a Supabase (PostgREST) query, so the
// count the list shows can be confirmed against the database with the same filters as a WHERE clause.
// Conditions on the record's own properties are translated; association filters, several OR groups and
// number/date comparisons on properties stored in the `extra` jsonb cannot be expressed exactly, so the
// result says `exact: false` and the caller keeps the in-memory count.
import { dbColumnFor, TODAY } from './data.js';
import { kindGroup } from './filter-ops.js';
import { propertyMap } from './properties.js';

const DAY = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const iso = (d) => new Date(d).toISOString();
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[;,\n]/)).map((s) => String(s).trim()).filter(Boolean);
const escapeLike = (s) => String(s).replace(/[%_\\]/g, (c) => `\\${c}`);
const escapeIn = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

// Day ranges of the relative date operators (same reference day as the lists: TODAY).
export function dateRange(op, value, value2) {
  const t0 = startOfDay(TODAY);
  const y = t0.getFullYear();
  const m = t0.getMonth();
  const dow = (t0.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(t0.getTime() - dow * DAY);
  const q = Math.floor(m / 3) * 3;
  const day = (s) => (s ? startOfDay(new Date(`${String(s).slice(0, 10)}T00:00`)) : null);
  switch (op) {
    case 'on': { const d = day(value); return d ? [d, new Date(d.getTime() + DAY)] : null; }
    case 'before': { const d = day(value); return d ? [null, d] : null; }
    case 'after': { const d = day(value); return d ? [new Date(d.getTime() + DAY), null] : null; }
    case 'between': { const a = day(value); const b = day(value2); return a && b ? [a, new Date(b.getTime() + DAY)] : null; }
    case 'lastdays': { const n = Number(value); return Number.isFinite(n) ? [new Date(t0.getTime() - n * DAY), null] : null; }
    case 'olderdays': { const n = Number(value); return Number.isFinite(n) ? [null, new Date(t0.getTime() - n * DAY)] : null; }
    case 'today': return [t0, new Date(t0.getTime() + DAY)];
    case 'yesterday': return [new Date(t0.getTime() - DAY), t0];
    case 'thisweek': return [monday, new Date(monday.getTime() + 7 * DAY)];
    case 'lastweek': return [new Date(monday.getTime() - 7 * DAY), monday];
    case 'thismonth': return [new Date(y, m, 1), new Date(y, m + 1, 1)];
    case 'lastmonth': return [new Date(y, m - 1, 1), new Date(y, m, 1)];
    case 'thisquarter': return [new Date(y, q, 1), new Date(y, q + 3, 1)];
    case 'thisyear': return [new Date(y, 0, 1), new Date(y + 1, 0, 1)];
    case 'lastyear': return [new Date(y - 1, 0, 1), new Date(y, 0, 1)];
    default: return null;
  }
}

// Applies the conditions to a query builder (supabase.from(table).select(...)). Returns { query, exact, applied }.
export function applyConditions(query, type, conditions, { kindOf } = {}) {
  const props = propertyMap(type);
  const live = (conditions || []).filter((c) => c && c.key);
  let exact = true;
  let applied = 0;
  const groups = new Set(live.map((c) => Number(c.group) || 0));
  if (groups.size > 1) exact = false; // several OR groups: not expressed here
  live.forEach((c) => {
    if (c.assoc || (groups.size > 1 && (Number(c.group) || 0) !== 0)) { exact = false; return; }
    const kind = (kindOf && kindOf(c.key)) || (props[c.key] && props[c.key].kind) || 'text';
    const group = kindGroup(kind);
    const { column, json } = dbColumnFor(type, c.key);
    const op = c.op;
    const v = c.value;
    const n1 = Number(v);
    const n2 = Number(c.value2);
    if (op === 'filled') { query = query.not(column, 'is', null).neq(column, ''); applied += 1; return; }
    if (op === 'empty') { query = query.or(`${column}.is.null,${column}.eq.`); applied += 1; return; }
    if (group === 'text' || group === 'enum' || group === 'bool') {
      const vals = list(v);
      if (!vals.length) return;
      if (op === 'in' || op === 'anyof' || op === 'is') { query = query.in(column, vals); applied += 1; return; }
      if (op === 'nin' || op === 'noneof' || op === 'not') { query = query.not(column, 'in', `(${vals.map(escapeIn).join(',')})`); applied += 1; return; }
      if (op === 'contains') { query = vals.length === 1 ? query.ilike(column, `%${escapeLike(vals[0])}%`) : query.or(vals.map((x) => `${column}.ilike.%${escapeLike(x)}%`).join(',')); applied += 1; return; }
      if (op === 'ncontains') { vals.forEach((x) => { query = query.not(column, 'ilike', `%${escapeLike(x)}%`); }); applied += 1; return; }
      if (op === 'starts') { query = vals.length === 1 ? query.ilike(column, `${escapeLike(vals[0])}%`) : query.or(vals.map((x) => `${column}.ilike.${escapeLike(x)}%`).join(',')); applied += 1; return; }
      if (op === 'ends') { query = vals.length === 1 ? query.ilike(column, `%${escapeLike(vals[0])}`) : query.or(vals.map((x) => `${column}.ilike.%${escapeLike(x)}`).join(',')); applied += 1; return; }
      exact = false;
      return;
    }
    if (group === 'number') {
      if (json) { exact = false; return; } // text comparison inside jsonb would not be numeric
      if (!Number.isFinite(n1)) return;
      if (op === 'eq') query = query.eq(column, n1);
      else if (op === 'neq') query = query.neq(column, n1);
      else if (op === 'gt') query = query.gt(column, n1);
      else if (op === 'gte') query = query.gte(column, n1);
      else if (op === 'lt') query = query.lt(column, n1);
      else if (op === 'lte') query = query.lte(column, n1);
      else if (op === 'between' && Number.isFinite(n2)) query = query.gte(column, Math.min(n1, n2)).lte(column, Math.max(n1, n2));
      else if (op === 'nbetween' && Number.isFinite(n2)) query = query.or(`${column}.lt.${Math.min(n1, n2)},${column}.gt.${Math.max(n1, n2)}`);
      else { exact = false; return; }
      applied += 1;
      return;
    }
    if (group === 'date') {
      if (json) { exact = false; return; }
      const range = dateRange(op, v, c.value2);
      if (!range) { exact = false; return; }
      const [from, to] = range;
      if (from) query = query.gte(column, iso(from));
      if (to) query = query.lt(column, iso(to));
      applied += 1;
      return;
    }
    exact = false;
  });
  return { query, exact, applied };
}

// Counts the rows the database sees with these conditions. Resolves null when the filters cannot be expressed.
export async function countWithConditions(client, type, conditions, opts = {}) {
  if (!client) return null;
  const base = client.from(type).select('id', { count: 'exact', head: true });
  const { query, exact } = applyConditions(base, type, conditions, opts);
  if (!exact) return null;
  const { count, error } = await query;
  if (error) throw error;
  return Number(count) || 0;
}

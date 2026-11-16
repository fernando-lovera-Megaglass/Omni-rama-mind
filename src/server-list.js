// Server-side lists: the record tables (Contactos, Empresas, Negocios, Tickets) ask Supabase for one page at
// a time — `range()` with `count: 'exact'` — and the search, the quick filters, the saved views' conditions
// and the column sort travel as PostgREST filters (`ilike`, `eq`, `gte`, `order`…; properties kept in the
// `extra` jsonb as `extra->>campo`). Soft-deleted rows are excluded in the query (`deleted_at is null`).
// Anything the database cannot express (association filters, several OR groups, computed columns) is
// reported as `exact: false` and the list falls back to loading everything, as before.
import { dbIsLive, isLazy, rowFromDb, dbColumnFor, softDeletes, TODAY } from './data.js';
import { supabase } from './supabaseClient.js';
import { applyConditions } from './filter-query.js';

const DAY = 86400000;
let override = null;
// Tests (and other hosts) can inject a client that records its queries.
export function setListClient(client) { override = client; }
export const listClient = () => override || (dbIsLive() ? supabase : null);
export const serverListEnabled = (type) => Boolean(override) || (dbIsLive() && isLazy(type));
export const escapeLike = (s) => String(s ?? '').replace(/[%_\\,()]/g, (c) => `\\${c}`);
export const PAGE_SIZES = [25, 50, 100];

// Helpers handed to the `where` functions of views and quick filters: column names, dates relative to TODAY.
export function helpers(type) {
  const col = (key) => dbColumnFor(type, key).column;
  const iso = (d) => new Date(d).toISOString();
  return { col, iso, today: TODAY, daysAgo: (n) => iso(TODAY.getTime() - Number(n) * DAY), daysAhead: (n) => iso(TODAY.getTime() + Number(n) * DAY), escapeLike };
}

// Builds the page query. spec: { page, size, sort: {key, dir}, sortKey, sortable, q, searchKeys, view, pipeline,
// filters: [{ filter, value }], advanced, kindOf, trash }. Returns { query, exact }.
export function buildPageQuery(client, type, spec) {
  const h = helpers(type);
  let q = client.from(type).select('*', { count: 'exact' });
  if (softDeletes(type)) q = spec.trash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
  let exact = true;
  if (spec.view) {
    if (spec.view.where) q = spec.view.where(q, h) || q;
    else if (spec.view.filter) exact = false;
  }
  if (spec.pipeline && spec.pipeline.key && spec.pipeline.value) q = q.eq(h.col(spec.pipeline.key), spec.pipeline.value);
  (spec.filters || []).forEach(({ filter, value }) => {
    if (!value || !filter) return;
    if (filter.where) q = filter.where(q, value, h) || q;
    else exact = false;
  });
  const advanced = (spec.advanced || []).filter((c) => c && c.key);
  if (advanced.length) {
    const r = applyConditions(q, type, advanced, { kindOf: spec.kindOf });
    q = r.query;
    if (!r.exact) exact = false;
  }
  if (spec.q) {
    const term = `%${escapeLike(spec.q)}%`;
    const keys = (spec.searchKeys && spec.searchKeys.length ? spec.searchKeys : ['name']).map(h.col);
    q = keys.length === 1 ? q.ilike(keys[0], term) : q.or(keys.map((k) => `${k}.ilike.${term}`).join(','));
  }
  if (spec.sort && spec.sort.key) {
    if (spec.sortable === false) exact = false;
    else q = q.order(h.col(spec.sortKey || spec.sort.key), { ascending: spec.sort.dir > 0, nullsFirst: false }).order('id', { ascending: true });
  } else q = q.order('id', { ascending: true });
  const size = Math.max(1, Number(spec.size) || 25);
  const from = (Math.max(1, Number(spec.page) || 1) - 1) * size;
  q = q.range(from, from + size - 1);
  return { query: q, exact };
}

// Fetches one page: { exact, rows, total }. `exact: false` means the caller must load everything instead.
export async function fetchPage(client, type, spec) {
  if (!client) return { exact: false, rows: [], total: 0 };
  const { query, exact } = buildPageQuery(client, type, spec);
  if (!exact) return { exact: false, rows: [], total: 0 };
  const { data, count, error } = await query;
  if (error) throw error;
  return { exact: true, rows: (data || []).map((r) => rowFromDb(type, r)), total: Number(count) || 0 };
}

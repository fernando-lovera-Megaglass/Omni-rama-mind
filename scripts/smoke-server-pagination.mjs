// Server-side pagination of the record lists: the Contactos list is booted against a fake Supabase client
// that holds 5,000 contacts and records every query. Checks that the list asks for a single page (range +
// exact count, trash excluded), that changing page / sorting / searching / quick filters / views / saved
// conditions each issue a new query carrying the PostgREST filters, that no query transfers more than
// ~150 KB, and that a page change renders in well under 500 ms. Run: node scripts/smoke-server-pagination.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[paginación]', ...a);
const fail = (msg) => { console.error(`[paginación] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.FormData = dom.window.FormData;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true; // switching views with unsaved filter changes asks for confirmation
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = () => qa('#rows tr[data-id]');

// ---------- a fake Supabase client: 5,000 contacts in database shape, every query recorded ----------
const OWNERS = ['Fernando L.', 'Sofía R.', 'Diego G.', 'Laura M.', 'Sin asignar'];
const STATES = ['Florida', 'Arizona', 'Texas', 'Madrid', 'Jalisco'];
const DB = Array.from({ length: 5000 }, (_, i) => {
  const n = i + 1;
  return { id: n, name: `Contacto ${n}`, first: 'Contacto', last: String(n), email: `contacto${n}@ejemplo.com`, phone: `+34 600 ${String(n).padStart(6, '0')}`, owner: OWNERS[n % OWNERS.length], status: ['new', 'open', 'progress', 'done'][n % 4], lifecycle: ['Lead', 'Cliente', 'Oportunidad'][n % 3], company: `Empresa ${n % 50}`, company_id: (n % 50) + 1, city: ['Madrid', 'Miami', 'Bogotá'][n % 3], created: new Date(2026, 0, 1 + (n % 300)).toISOString(), last_activity: new Date(2026, 9, 1 + (n % 30)).toISOString(), extra: { state: STATES[n % STATES.length], customer_type: 'Instalador' }, deleted_at: n % 50 === 0 ? '2026-10-01T00:00:00.000Z' : null };
});
const colValue = (r, col) => (col.startsWith('extra->>') ? (r.extra || {})[col.slice(8)] : r[col]);
const likeRe = (pattern) => new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\\([%_])/g, '$1').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i');
function runQuery(table, ops) {
  if (table !== 'contacts') return { data: [], count: 0, error: null };
  let list = DB.slice();
  let count = null;
  let range = null;
  const test = (op, col, val) => (r) => {
    const v = colValue(r, col);
    switch (op) {
      case 'is': return val === null ? v === null || v === undefined : v === val;
      case 'eq': return String(v) === String(val);
      case 'neq': return String(v) !== String(val);
      case 'gt': return v > val;
      case 'gte': return v >= val;
      case 'lt': return v < val;
      case 'lte': return v <= val;
      case 'in': return (Array.isArray(val) ? val : String(val).replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''))).map(String).includes(String(v));
      case 'ilike': return likeRe(val).test(String(v ?? ''));
      default: return true;
    }
  };
  ops.forEach(([name, ...args]) => {
    if (name === 'select') { if (args[1] && args[1].count) count = true; } else if (name === 'not') { const [col, op, val] = args; const t = test(op, col, val); list = list.filter((r) => !t(r)); } else if (['is', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'ilike'].includes(name)) { list = list.filter(test(name, args[0], args[1])); } else if (name === 'or') {
      const parts = String(args[0]).split(',').map((p) => { const m = /^([^.]+(?:->>[^.]+)?)\.([a-z]+)\.(.*)$/.exec(p); return m ? [m[1], m[2], m[3]] : null; }).filter(Boolean);
      list = list.filter((r) => parts.some(([col, op, val]) => test(op, col, val)(r)));
    } else if (name === 'order') { const [col, opts] = args; const asc = !opts || opts.ascending !== false; list.sort((a, b) => { const x = colValue(a, col); const y = colValue(b, col); if (x === y) return 0; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (x < y ? -1 : 1) * (asc ? 1 : -1); }); } else if (name === 'range') range = args; else if (name === 'limit') list = list.slice(0, args[0]);
  });
  const total = list.length;
  const data = range ? list.slice(range[0], range[1] + 1) : list;
  return { data: data.map((r) => JSON.parse(JSON.stringify(r))), count: count ? total : null, error: null };
}
const calls = [];
const fake = { from: (table) => { const ops = []; const b = { table, ops }; ['select', 'is', 'not', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'or', 'ilike', 'order', 'range', 'limit'].forEach((m) => { b[m] = (...args) => { ops.push([m, ...args]); return b; }; }); b.then = (res, rej) => { const out = runQuery(table, ops); calls.push({ table, ops, rows: out.data.length, bytes: JSON.stringify(out.data).length, at: Date.now() }); return Promise.resolve(out).then(res, rej); }; return b; } };
const has = (call, name, pred) => call.ops.some((op) => op[0] === name && (!pred || pred(op)));
const last = () => calls[calls.length - 1];

// ---------- boot the Contactos list in server mode ----------
await import(resolve(here, '../src/data.js'));
const SL = await import(resolve(here, '../src/server-list.js'));
SL.setListClient(fake);
if (!SL.serverListEnabled('contacts')) fail('server mode must be on with an injected client');
await import(resolve(here, '../src/contacts.js'));
await wait(60);

// 1) Opening the list asks for one page only
const contactCalls = () => calls.filter((c) => c.table === 'contacts');
if (contactCalls().length !== 1) fail(`expected 1 query on load, got ${contactCalls().length}`);
const first = contactCalls()[0];
if (!has(first, 'select', (op) => op[1] === '*' && op[2] && op[2].count === 'exact')) fail('the page query must ask for the exact count');
if (!has(first, 'is', (op) => op[1] === 'deleted_at' && op[2] === null)) fail('the trash must be excluded server-side (deleted_at is null)');
if (!has(first, 'range', (op) => op[1] === 0 && op[2] === 24)) fail(`first page must be range(0, 24): ${JSON.stringify(first.ops.find((o) => o[0] === 'range'))}`);
if (first.rows !== 25 || rows().length !== 25) fail(`one page of 25 rows expected (query ${first.rows}, table ${rows().length})`);
if (first.bytes > 150 * 1024) fail(`a page must transfer well under 150 KB (got ${first.bytes} bytes)`);
if (text($('total-pill')) !== '4900 contactos') fail(`total from the database: ${text($('total-pill'))}`);
// the list uses the shared pager (src/pagination.js): page buttons carry data-pagination-page
const pageBtn = (n) => qa('#list-pagination .pager__num').find((b) => b.dataset.paginationPage === String(n));
const pagerBtn = (label) => qa('#list-pagination .pager__btn').find((b) => b.textContent.includes(label));
if (!pageBtn(196)) fail('pager must show the last page from the exact count');
log(`load: 1 query, range(0,24), deleted_at is null, ${first.rows} rows / ${first.bytes} bytes, total 4900`);

// 2) Changing page issues a new query and renders fast
const firstId = rows()[0].dataset.id;
const t0 = Date.now();
click(pagerBtn('Siguiente'));
await wait(30);
const elapsed = Date.now() - t0;
if (contactCalls().length !== 2 || !has(last(), 'range', (op) => op[1] === 25 && op[2] === 49)) fail('page 2 must be a new query with range(25, 49)');
if (rows()[0].dataset.id === firstId || rows().length !== 25) fail('page 2 must show other rows');
if (elapsed > 500) fail(`page change took ${elapsed} ms`);
click(pageBtn(196));
await wait(30);
if (!has(last(), 'range', (op) => op[1] === 4875 && op[2] === 4899) || rows().length !== 25) fail('last page range');
click(pagerBtn('Anterior'));
await wait(30);
if (!has(last(), 'range', (op) => op[1] === 4850)) fail('prev page');
log(`page change: new query per page, ${elapsed} ms to render page 2`);

// 3) Sorting, search, quick filters, views and saved conditions travel as PostgREST filters
click(q('[data-sort="name"]'));
await wait(30);
if (!has(last(), 'order', (op) => op[1] === 'name' && op[2] && op[2].ascending === true) || !has(last(), 'range', (op) => op[1] === 0)) fail('sort must be an order() on the query and go back to page 1');
click(q('[data-sort="name"]'));
await wait(30);
if (!has(last(), 'order', (op) => op[1] === 'name' && op[2].ascending === false)) fail('second click must sort descending');
input($('row-search'), 'contacto 12');
await wait(300);
const searchCall = last();
if (!has(searchCall, 'or', (op) => /name\.ilike\.%contacto 12%/.test(op[1]) && /email\.ilike\./.test(op[1]))) fail(`search must be an ilike OR over the search keys: ${JSON.stringify(searchCall.ops.find((o) => o[0] === 'or'))}`);
if (!rows().length || !rows().every((r) => /Contacto 12/.test(text(r)))) fail('search results');
// "Contacto 12", 120-129 and 1200-1299 (minus the two soft-deleted ones) = 109 rows, counted by the database
if (text($('total-pill')) !== '109 contactos') fail(`search count must come from the query: ${text($('total-pill'))}`);
input($('row-search'), '');
await wait(300);
click(q('[data-filter="owner"][data-value="Sofía R."]'));
await wait(30);
if (!has(last(), 'eq', (op) => op[1] === 'owner' && op[2] === 'Sofía R.')) fail('quick filter must be an eq() on the query');
// Sofía owns every 5th contact (1000) and none of them is soft-deleted
if (!rows().every((r) => text(r).includes('Sofía R.')) || text($('total-pill')) !== '1000 contactos') fail(`owner filter rows/count: ${text($('total-pill'))}`);
click(q('[data-filter="created"][data-value="365"]'));
await wait(30);
if (!has(last(), 'gte', (op) => op[1] === 'created')) fail('date quick filter must be a gte() on the query');
click(q('[data-filter="owner"][data-value=""]'));
click(q('[data-filter="created"][data-value=""]'));
await wait(30);
const mineTab = qa('button.views__tab[data-view]').find((b) => text(b).includes('Mis contactos'));
click(mineTab);
await wait(30);
if (!has(last(), 'eq', (op) => op[1] === 'owner' && op[2] === 'Fernando L.')) fail('view must be translated with its where()');
const florida = qa('button.views__tab[data-view]').find((b) => text(b).includes('Glaziers Florida'));
if (!florida) fail('seeded saved view missing');
click(florida);
await wait(30);
if (!has(last(), 'in', (op) => /state$/.test(op[1]) && op[2].includes('Florida'))) fail(`saved view conditions must be applied in the query: ${JSON.stringify(last().ops)}`);
// Florida is every 5th contact (1000) minus the 100 soft-deleted ones (multiples of 50) = 900
if (!rows().length || text($('total-pill')) !== '900 contactos') fail(`Florida view count: ${text($('total-pill'))}`);
if (calls.some((c) => c.rows > 100 || c.bytes > 150 * 1024)) fail('no query may transfer more than one page');
log(`filters in the query: order, ilike search, eq/gte quick filters, view where(), saved conditions (in state); ${contactCalls().length} queries, max ${Math.max(...calls.map((c) => c.bytes))} bytes`);

// 4) Selection and inline data on the page keep working on the page rows
const first25 = rows();
first25[0].querySelector('.row-check').checked = true;
first25[0].querySelector('.row-check').dispatchEvent(new window.Event('change', { bubbles: true }));
if (!text(q('.bulkbar, .bulk, #bulk-bar') || document.body).includes('seleccionad')) fail('bulk bar after selecting a row');
log('selection on the server page works');

console.log('[paginación] OK');
process.exit(0);

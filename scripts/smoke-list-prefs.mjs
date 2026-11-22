// Smoke test: the list preferences of the four modules (columns chosen with «Editar columnas» on a standard view,
// widths, frozen columns, density, zebra, metrics, page size…) persist per user. In local mode they live in
// localStorage (crm:<type>:prefs) and a reload of data.js + the list reads them back. In live mode (SMOKE_LIVE=1,
// docs/smoke-live.md) the real contacts list changes its columns and density, a width is stored as the resize does,
// dbIdle() is awaited and the row is checked in user_settings; then localStorage is emptied and a fresh data.js
// recovers the same preferences from Supabase. Run: node scripts/smoke-list-prefs.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke, requireColumns, lit } from './smoke-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'list-prefs';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const useDom = (url) => {
  const dom = new JSDOM(LIST, { url, pretendToBeVisual: true });
  for (const k of GLOBALS) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
};
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const headerKeys = () => qa('#head-row th[data-key]').map((th) => th.dataset.key);
let n = 0;
// What the person does on the list: «Editar columnas» → tick one more property → Aplicar; gear → «Filas compactas».
async function customiseList(type) {
  useDom(`http://localhost/${type}/`);
  await import(resolve(here, `../src/${type}.js?lp=${n++}`));
  await wait(80);
  const before = headerKeys();
  click(q('[data-action="columns"]'));
  const cb = qa('#col-groups input[data-key]').find((c) => !c.checked);
  if (!cb) fail(`${type}: a property to add`);
  cb.checked = true;
  cb.dispatchEvent(new window.Event('change', { bubbles: true }));
  click($('columns-apply'));
  await wait(20);
  const added = cb.dataset.key;
  if (!headerKeys().includes(added) || headerKeys().length !== before.length + 1) fail(`${type}: the column is applied (${headerKeys().join()})`);
  click(q('[data-action="toggle-density"]'));
  await wait(20);
  return { added, columns: headerKeys() };
}
// Empties the app's own storage (crm:*) as another browser would have it; the Supabase session key stays, since
// the person is still signed in there.
const clearStorage = () => { for (let i = localStorage.length - 1; i >= 0; i -= 1) { const k = localStorage.key(i); if (k && k.startsWith('crm:')) localStorage.removeItem(k); } };

// ---- modo live (SMOKE_LIVE=1): the row in user_settings, then a fresh start without localStorage ----
await liveSmoke(TAG, async ({ data, one, check, log, session }) => {
  await requireColumns('user_settings', ['user_id', 'scope', 'key', 'value']); // user_settings.sql
  check(data.settingsLive(), 'la app arrancó con los ajustes en Supabase (user_settings)');
  const KEY = 'crm:contacts:prefs';
  const { added, columns } = await customiseList('contacts');
  data.setPrefs('contacts', { widths: { ...(data.getPrefs('contacts').widths || {}), [added]: 333 } }); // what persistLayout writes after a resize
  await data.dbIdle();
  const row = await one(`select scope, value from public.user_settings where user_id = ${lit(session.uid)} and key = ${lit(KEY)}`);
  const v = row && (typeof row.value === 'string' ? JSON.parse(row.value) : row.value);
  check(row && row.scope === 'user' && v && Array.isArray(v.columns), `fila crm:contacts:prefs en user_settings (${JSON.stringify(row).slice(0, 200)})`);
  check(v.columns.join() === columns.join() && v.widths && v.widths[added] === 333 && v.density === 'compact', `la fila guarda columnas, anchura y densidad (${JSON.stringify(v).slice(0, 300)})`);
  log(`user_settings: ${KEY} → ${v.columns.length} columnas (añadida «${added}»), anchura ${v.widths[added]}, densidad ${v.density}`);
  // another browser: nothing in localStorage, a fresh start reads the preferences from Supabase
  clearStorage();
  check(localStorage.getItem(KEY) === null, 'localStorage vacío antes de recargar');
  const fresh = await import(resolve(here, '../src/data.js?list-prefs-reload'));
  check(fresh.settingsLive(), 'el arranque nuevo lee user_settings');
  const got = fresh.getPrefs('contacts');
  check(got.columns && got.columns.join() === columns.join() && got.widths && got.widths[added] === 333 && got.density === 'compact', `tras recargar sin localStorage, las preferencias vienen de Supabase (${JSON.stringify(got).slice(0, 300)})`);
  check(localStorage.getItem(KEY) === null, 'no hacían falta copias locales para recuperarlas');
  log(`recarga sin localStorage: columnas ${got.columns.length} (con «${added}»), anchura ${got.widths[added]}, densidad ${got.density} — desde Supabase`);
});

// ---- local mode: localStorage keeps them and a reload reads them back ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
useDom('http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  const { added, columns } = await customiseList(type);
  const stored = JSON.parse(mem[`crm:${type}:prefs`] || '{}');
  if (!stored.columns || stored.columns.join() !== columns.join() || stored.density !== 'compact') fail(`${type}: prefs stored (${JSON.stringify(stored).slice(0, 200)})`);
  if (data.getPrefs(type).columns.join() !== columns.join()) fail(`${type}: getPrefs reads the stored columns`);
  // the list again (a reload): same columns and density
  useDom(`http://localhost/${type}/`);
  await import(resolve(here, `../src/${type}.js?lp=${n++}`));
  await wait(80);
  if (headerKeys().join() !== columns.join() || !headerKeys().includes(added)) fail(`${type}: columns back after a reload (${headerKeys().join()})`);
  if (!q('.table--compact, [data-density="compact"], .is-compact') && !/compact/.test(document.body.className + ' ' + (q('#table') ? q('#table').className : ''))) fail(`${type}: density back after a reload`);
  log(`${type}: columna «${added}» y densidad compacta guardadas y recuperadas al recargar`);
}
console.log(`[${TAG}] OK`);
process.exit(0);

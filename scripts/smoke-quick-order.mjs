// Smoke test: «Reordenar botones de actividad» (record page, four modules) persists like the rest of the
// customisation: per object (crm:<type>:quickorder) and, when signed in, per user in user_settings (localStorage as
// the offline copy); the order chosen on contacts does not touch tickets; the old single key crm:quickorder is still
// read until a new order is saved. Run: node scripts/smoke-quick-order.mjs
// Live mode (SMOKE_LIVE=1, docs/smoke-live.md): the order chosen on a contact record lands in user_settings and a
// fresh start without the app's localStorage reads it back from Supabase.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke, requireColumns, lit } from './smoke-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'quick-order';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RECORD = (type) => `<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`;
const GLOBALS = ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option'];
const useDom = (html, url) => {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
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
let n = 0;
const openRecord = async (type, id) => { useDom(RECORD(type), `http://localhost/${type}/record/?id=${id}`); await import(resolve(here, `../src/record.js?qo=${n++}`)); await wait(60); };
const quickKeys = () => qa('#quick-row .quick[data-action]').map((b) => b.dataset.action);
const DEFAULT = ['note', 'email', 'call', 'task', 'meeting'];
// «Más» › «Reordenar botones de actividad» → move the last button up → confirm
const moveLastUp = () => {
  click(q('[data-more="reorder"]'));
  if (!$('quick-order')) fail('the reorder modal opens');
  click(q('#quick-order .col-item:last-child [data-move="-1"]'));
  click(q('[data-confirm="reorder"]'));
};
const resetOrder = () => { click(q('[data-more="reorder"]')); click(q('[data-confirm="reorder-reset"]')); };
const clearAppStorage = () => { for (let i = localStorage.length - 1; i >= 0; i -= 1) { const k = localStorage.key(i); if (k && k.startsWith('crm:')) localStorage.removeItem(k); } };

// ---- modo live (SMOKE_LIVE=1): the row in user_settings, then a fresh start without the app's storage ----
await liveSmoke(TAG, async ({ data, one, check, log, session }) => {
  await requireColumns('user_settings', ['user_id', 'scope', 'key', 'value']);
  check(data.settingsLive(), 'la app arrancó con los ajustes en Supabase (user_settings)');
  const contact = data.addRecord('contacts', { name: `SMOKE Orden botones ${session.stamp}`, first: 'SMOKE Orden', last: `botones ${session.stamp}`, email: `smoke.${session.stamp}.qo@ejemplo.com`, phone: '', owner: 'Fernando L.', lifecycle: 'Lead' });
  await data.dbIdle();
  await openRecord('contacts', contact.id);
  check(quickKeys().join() === DEFAULT.join(), `orden predeterminado al empezar (${quickKeys().join()})`);
  moveLastUp();
  const wanted = ['note', 'email', 'call', 'meeting', 'task'];
  check(quickKeys().join() === wanted.join(), `la ficha muestra el orden elegido (${quickKeys().join()})`);
  await data.dbIdle();
  const row = await one(`select scope, value from public.user_settings where user_id = ${lit(session.uid)} and key = 'crm:contacts:quickorder'`);
  const v = row && (typeof row.value === 'string' ? JSON.parse(row.value) : row.value);
  check(row && row.scope === 'user' && Array.isArray(v) && v.join() === wanted.join(), `fila crm:contacts:quickorder en user_settings (${JSON.stringify(row)})`);
  const other = await one(`select count(*)::int as n from public.user_settings where user_id = ${lit(session.uid)} and key = 'crm:tickets:quickorder'`);
  check(other && other.n === 0, 'el orden de contactos no toca el de tickets');
  log(`user_settings: crm:contacts:quickorder = ${JSON.stringify(v)} (scope user); sin fila para tickets`);
  clearAppStorage();
  const fresh = await import(resolve(here, '../src/data.js?quick-order-reload'));
  check(fresh.settingsLive() && JSON.stringify(fresh.getSetting('crm:contacts:quickorder')) === JSON.stringify(wanted) && fresh.getSetting('crm:tickets:quickorder') === null, 'otra sesión sin localStorage recupera el orden desde Supabase, solo para contactos');
  log('arranque nuevo sin localStorage: el orden vuelve desde Supabase');
});

// ---- local mode ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
useDom(RECORD('contacts'), 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
const contactId = data.allContacts()[0].id;
const ticketId = data.allTickets()[0].id;

// 1) reorder on a contact → kept after a reload, stored per object, tickets untouched
await openRecord('contacts', contactId);
if (quickKeys().join() !== DEFAULT.join()) fail(`default order (${quickKeys().join()})`);
moveLastUp();
const wanted = ['note', 'email', 'call', 'meeting', 'task'];
if (quickKeys().join() !== wanted.join()) fail(`reordered (${quickKeys().join()})`);
if (JSON.parse(mem['crm:contacts:quickorder'] || 'null')?.join() !== wanted.join() || 'crm:quickorder' in mem) fail(`stored per object, not under the old single key (${Object.keys(mem).filter((k) => /quickorder/.test(k)).join()})`);
await openRecord('contacts', contactId);
if (quickKeys().join() !== wanted.join()) fail('order kept after a reload');
await openRecord('tickets', ticketId);
if (quickKeys().join() !== DEFAULT.join() || 'crm:tickets:quickorder' in mem) fail(`tickets keep the default order (${quickKeys().join()})`);
log(`contactos: ${wanted.join(' › ')} guardado en crm:contacts:quickorder y recuperado al recargar; tickets siguen con el orden predeterminado`);

// 2) reset on contacts → default; the old single key is still honoured until a new order is saved
await openRecord('contacts', contactId);
resetOrder();
if (quickKeys().join() !== DEFAULT.join() || 'crm:contacts:quickorder' in mem) fail('reset restores the default and clears the stored order');
mem['crm:quickorder'] = JSON.stringify(['meeting', 'task', 'call', 'email', 'note']);
await openRecord('deals', data.allDeals()[0].id);
if (quickKeys().join() !== 'meeting,task,call,email,note') fail(`the legacy single key is still read (${quickKeys().join()})`);
moveLastUp();
if (!('crm:deals:quickorder' in mem) || quickKeys().join() !== 'meeting,task,call,note,email') fail(`a new order moves to the per-object key (${quickKeys().join()})`);
await openRecord('companies', data.allCompanies()[0].id);
if (quickKeys().join() !== 'meeting,task,call,email,note') fail('other objects still read the legacy key until they save their own');
log('restablecer vuelve al predeterminado; la clave antigua crm:quickorder se sigue leyendo hasta guardar un orden nuevo por objeto');
console.log(`[${TAG}] OK`);
process.exit(0);

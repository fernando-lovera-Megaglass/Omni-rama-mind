// DOM smoke test for the «Resultado de la llamada» quick filter of CRM › Llamadas (src/calls.js): the chip sits
// between Dirección and Actividad asignada a, offers the Twilio outcomes (STATUS_LABEL) plus the outcomes of the
// manual logs present, «Sin respuesta» keeps only those rows with the chip marked is-set and the footer count
// updated, the choice survives a reload of the rows (load()), and «Todos» restores the whole list. Local mode.
// Run: node scripts/smoke-calls-status-filter.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[calls-status]', ...a);
const fail = (msg) => { console.error(`[calls-status] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="calls-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/calls/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.confirm = () => true;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const rows = () => qa('#calls-root tbody tr[data-callrow]');
const chipText = () => text($('calls-f-status'));
const options = () => qa('[data-call-filter="status"]').map((b) => b.dataset.value);
const count = () => text(q('.calls__count'));
const waitRows = async () => { for (let i = 0; i < 100 && !q('#calls-root table') && !q('#calls-root .calls__empty'); i++) await wait(20); };

const data = await import(resolve(here, '../src/data.js'));
const [c1, c2, c3] = data.allContacts();
const now = Date.now();
const call = (c, outcome, minutesAgo, who = 'Fernando L.') => data.addActivity({ type: 'call', recordType: 'contacts', recordId: c.id, text: `Llamada con ${c.name}`, who, when: now - minutesAgo * 60_000, extra: { direction: 'Saliente', durationSec: 60, outcome } });
call(c1, 'Conectado', 5); call(c2, 'Sin respuesta', 10); call(c3, 'Ocupado', 15); call(c1, 'Sin respuesta', 20, 'Sofía R.'); call(c2, 'Dejó mensaje de voz', 25);
const C = await import(resolve(here, '../src/calls.js'));
await waitRows();
const all = rows().length;
if (all < 5) fail(`calls listed (${all})`);

// ---- the chip: position, options (STATUS_LABEL ∪ manual outcomes), default label ----
const chips = qa('.calls__toolbar .qchip').map((b) => b.id);
if (chips.join(',') !== 'calls-f-direction,calls-f-status,calls-f-owner,calls-f-date,calls-f-duration') fail(`chip order (${chips.join(',')})`);
if (chipText() !== 'Resultado de la llamada' || $('calls-f-status').classList.contains('is-set')) fail(`default chip (${chipText()})`);
const opts = options();
for (const v of ['', 'Conectado', 'Sin respuesta', 'Ocupado', 'Dejó mensaje de voz', 'En curso', 'Fallida', 'Cancelada']) if (!opts.includes(v)) fail(`option «${v}» offered (${opts.join('|')})`);
if (text(q('[data-call-filter="status"][data-value=""]')).replace(/^✓ /, '') !== 'Todos') fail('first option is «Todos»');
log(`chip entre Dirección y Actividad asignada; ${opts.length - 1} resultados (Twilio + manuales: ${opts.filter(Boolean).join(', ')})`);

// ---- «Sin respuesta» keeps only those rows; chip is-set; footer count ----
click(q('[data-call-filter="status"][data-value="Sin respuesta"]'));
await wait(10);
if (rows().length !== 2 || !rows().every((tr) => text(tr).includes('Sin respuesta'))) fail(`only the Sin respuesta rows (${rows().length})`);
if (!$('calls-f-status').classList.contains('is-set') || chipText() !== 'Resultado de la llamada: Sin respuesta') fail(`chip shows the value (${chipText()})`);
if (count() !== '2 llamadas') fail(`footer count (${count()})`);
if (q('[data-call-filter="status"][data-value="Sin respuesta"]').getAttribute('aria-checked') !== 'true') fail('the option is checked');
log(`«Sin respuesta»: ${rows().length} filas, chip is-set «${chipText()}», pie «${count()}»`);

// ---- the choice survives a reload of the rows ----
call(c3, 'Sin respuesta', 2); // a new call logged meanwhile
await C.load();
await waitRows();
if (C.state.status !== 'Sin respuesta' || rows().length !== 3 || !rows().every((tr) => text(tr).includes('Sin respuesta')) || chipText() !== 'Resultado de la llamada: Sin respuesta' || count() !== '3 llamadas') fail(`filter kept after load() (${C.state.status} / ${rows().length} / ${count()})`);
if (!options().includes('Ocupado')) fail('options rebuilt from the reloaded rows');
log(`tras load(): filtro conservado (${rows().length} filas, «${count()}»), opciones reconstruidas`);

// ---- a result nobody has yet: no rows and the empty state; «Todos» restores everything ----
click(q('[data-call-filter="status"][data-value="Fallida"]'));
await wait(10);
if (rows().length || !/No hay llamadas con estos filtros/.test(text(q('#calls-root')))) fail('an outcome without calls → filtered empty state');
click(q('[data-call-filter="status"][data-value=""]'));
await wait(10);
if (rows().length !== all + 1 || $('calls-f-status').classList.contains('is-set') || chipText() !== 'Resultado de la llamada' || count() !== `${all + 1} llamadas`) fail(`«Todos» restores the list (${rows().length})`);
log(`«Fallida» → vacío con mensaje; «Todos» → ${rows().length} filas`);
console.log('[calls-status] OK');
process.exit(0);

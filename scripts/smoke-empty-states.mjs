// DOM smoke test for the shared empty state (src/empty-state.js): the six modules show an illustration, a
// title, a line of help and the module's primary action instead of loose text — the lists («Crear contacto»),
// Llamadas («Abrir el marcador» / «Borrar filtros»), the Bandeja de entrada (list and thread pane, «Nueva
// conversación»), Plantillas («Nueva plantilla»), Secuencias («Crear secuencia») and Workflows («Crear
// workflow», which goes to the create page since 22-nov-2026); the actions work; the illustration is an inline
// SVG drawn with currentColor (dark theme).
// Run: node scripts/smoke-empty-states.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[empty-states]', ...a);
const fail = (msg) => { console.error(`[empty-states] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
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
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  return dom;
}
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
// An empty state: illustration (inline SVG with the badge), title, text and the primary action.
const checkState = (el, where, { title, cta, art }) => {
  if (!el || !el.classList.contains('estate')) fail(`${where}: no .estate`);
  const svg = el.querySelector('.estate__art svg.estate__svg');
  if (!svg || !svg.querySelector('.estate__badge') || !svg.querySelector('.estate__card')) fail(`${where}: illustration`);
  if (art && !svg.querySelector('g[transform] path, g[transform] rect, g[transform] circle')) fail(`${where}: the badge must carry the module icon`);
  if (text(el.querySelector('.estate__title')) !== title) fail(`${where}: title «${text(el.querySelector('.estate__title'))}» (expected «${title}»)`);
  if (!text(el.querySelector('.estate__text'))) fail(`${where}: help text`);
  const btn = el.querySelector('.estate__actions .btn--primary');
  if (!btn || text(btn) !== cta) fail(`${where}: CTA «${btn && text(btn)}» (expected «${cta}»)`);
  return btn;
};
const noLooseText = (root, where) => { const loose = [...root.querySelectorAll('p.empty, p.calls__empty, li.inbox__empty.muted, .tpls__empty')].filter((el) => !el.querySelector('.estate') && text(el)); if (loose.length) fail(`${where}: loose empty text left: ${loose.map(text).join(' | ')}`); };

const { emptyStateHtml, EMPTY_ARTS } = await import(resolve(here, '../src/empty-state.js'));
if (EMPTY_ARTS.length < 10 || !EMPTY_ARTS.includes('contacts') || !EMPTY_ARTS.includes('inbox')) fail('arts');
const probe = emptyStateHtml({ art: 'deals', title: 'T', text: 'X', action: { label: 'Go', attrs: 'data-x="1"' }, secondary: { label: 'Otro', href: 'x/' } });
if (!/<svg class="estate__svg" viewBox="0 0 120 96"/.test(probe) || !probe.includes('stroke="#fff"') || !probe.includes('data-x="1"') || !probe.includes('href="x/"') || probe.includes('<img')) fail('component markup (inline SVG, attrs, link action, no image file)');

// ===== 1) Lists: contacts with a search that matches nothing → «Crear contacto» opens the create panel =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/');
await import(resolve(here, '../src/contacts.js'));
await wait(20);
if (!$('empty').hidden) fail('contacts: the empty state hides while there are rows');
input($('row-search'), 'zzzz-nadie-se-llama-asi');
await wait(20);
if ($('empty').hidden || qa('#table tbody tr[data-id]').length) fail('contacts: empty state must show with no matching rows');
const listBtn = checkState($('empty').querySelector('.estate'), 'contacts list', { title: 'No hay contactos que coincidan con los filtros', cta: 'Crear contacto', art: true });
noLooseText(document.body, 'contacts list');
click(listBtn);
await wait(20);
if (!qa('.drawer.is-open, .cc-panel.is-open, #create-drawer.is-open, [data-create-panel].is-open').length && !q('#create-form') && !q('.cc')) fail('contacts: «Crear contacto» must open the create panel');
log('contacts list: illustration + «No hay contactos que coincidan con los filtros» + «Crear contacto» (opens the create panel)');
// tasks use the same component with their own icon and label
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/tasks/');
await import(resolve(here, '../src/tasks.js'));
await wait(20);
input($('row-search'), 'zzzz');
await wait(20);
checkState($('empty').querySelector('.estate'), 'tasks list', { title: 'No hay tareas que coincidan con los filtros', cta: 'Crear tarea', art: true });
log('tasks list: «Crear tarea»');

// ===== 2) Llamadas =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="calls-root"></main><div id="scrim"></div></body>', 'http://localhost/calls/');
await import(resolve(here, '../src/calls.js'));
await wait(60);
input($('calls-q'), 'zzzz-sin-llamadas');
await wait(20);
const callsEmpty = q('.calls__empty .estate');
checkState(callsEmpty, 'calls', { title: 'No hay llamadas con estos filtros', cta: 'Abrir el marcador', art: true });
if (!text(callsEmpty).includes('No hay llamadas')) fail('calls: the old wording stays for the search case');
const clearBtn = callsEmpty.querySelector('[data-calls="clear"]');
if (!clearBtn || text(clearBtn) !== 'Borrar filtros') fail('calls: «Borrar filtros» secondary action with a search on');
click(clearBtn);
await wait(20);
// Without logged calls (local sample) the state stays, now as «Todavía no hay llamadas» without «Borrar filtros».
const afterClear = q('.calls__empty .estate');
if ($('calls-q').value !== '' || (afterClear && (text(afterClear.querySelector('.estate__title')) !== 'Todavía no hay llamadas' || afterClear.querySelector('[data-calls="clear"]')))) fail(`calls: clearing the filters: «${afterClear && text(afterClear.querySelector('.estate__title'))}»`);
noLooseText(document.body, 'calls');
log('calls: illustration + «No hay llamadas con estos filtros» + «Abrir el marcador» / «Borrar filtros» (clears the search)');

// ===== 3) Bandeja de entrada: list and thread pane =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="inbox-root"></main><div id="scrim"></div></body>', 'http://localhost/inbox/');
await import(resolve(here, '../src/inbox.js'));
await wait(40);
// Filtering keeps the open conversation independent from the visible list.
const search = $('inbox-q'); // not the shell's global search, which comes first in the document
if (!search) fail('inbox search');
const openThread = q('#inbox-thread .inbox__threadhead');
if (!openThread) fail('inbox: initial conversation must be open');
input(search, 'zzzz-sin-conversaciones');
await wait(20);
if (q('#inbox-thread .inbox__threadhead') !== openThread) fail('inbox: filtering must preserve the open thread');
checkState(q('.inbox__empty .estate'), 'inbox filtered list', { title: 'No hay conversaciones', cta: 'Nueva conversación', art: true });
// Remove the visible fixture conversations through the UI to exercise a genuinely empty pane.
input(search, '');
click($('inbox-select-all'));
click(q('[data-bulk="delete"]'));
await wait(20);
if (q('#inbox-items [data-id]')) fail('inbox: fixture conversations must be removed');
const thread = q('#inbox-thread .inbox__placeholder .estate');
checkState(thread, 'inbox thread pane', { title: 'Selecciona una conversación', cta: 'Nueva conversación', art: true });
const listEmpty = q('.inbox__empty .estate');
checkState(listEmpty, 'inbox list', { title: 'No hay conversaciones', cta: 'Nueva conversación', art: true });
if (!listEmpty.classList.contains('estate--compact')) fail('inbox list: compact variant');
click(listEmpty.querySelector('[data-inbox="new"]'));
await wait(20);
if (!q('#inbox-modal.is-open, .bmodal.is-open')) fail('inbox: «Nueva conversación» opens the dialog');
noLooseText(document.body, 'inbox');
log('inbox: thread pane «Selecciona una conversación» + list «No hay conversaciones», both with «Nueva conversación» (opens the dialog)');

// ===== 4) Plantillas =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="tpl-root"></main><div id="scrim"></div></body>', 'http://localhost/templates/');
await import(resolve(here, '../src/templates.js'));
await wait(40);
const tq = $('tpl-q');
if (!tq) fail('templates search');
input(tq, 'zzzz-sin-plantillas');
await wait(20);
const tplBtn = checkState(q('.tpls__empty .estate'), 'templates', { title: 'Ninguna plantilla coincide con los filtros', cta: 'Nueva plantilla', art: true });
click(tplBtn);
await wait(20);
if (!q('.bmodal.is-open, #tpl-modal.is-open')) fail('templates: «Nueva plantilla» opens the editor');
log('templates: illustration + «Nueva plantilla» (opens the editor)');

// ===== 5) Secuencias =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="seq-root"></main><div id="scrim"></div></body>', 'http://localhost/sequences/');
await import(resolve(here, '../src/sequences.js'));
await wait(40);
input($('seq-q'), 'zzzz-sin-secuencias');
await wait(20);
const seqBtn = checkState(q('.tpls__empty .estate'), 'sequences', { title: 'Ninguna secuencia coincide con los filtros', cta: 'Crear secuencia', art: true });
if (seqBtn.tagName !== 'A' || seqBtn.getAttribute('href') !== 'create/') fail('sequences: the CTA links to the sequence editor');
log('sequences: illustration + «Crear secuencia» (link to create/)');

// ===== 6) Workflows =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="wf-root"></main><div id="scrim"></div></body>', 'http://localhost/automation/?tab=workflows');
// Since 22-nov-2026 (workflows engine, commit 78a2fb9) «Crear workflow» no longer opens a «Desde cero» dialog: it
// goes to the create page (create/?mode=blank), like the «Desde cero» entry of the header menu. jsdom cannot
// navigate, so the module gets a stand-in for the global `location` that records the address it is sent to.
const nav = [];
const real = window.location;
globalThis.location = { href: real.href, search: real.search, pathname: real.pathname, origin: real.origin, hash: real.hash, assign: (u) => nav.push(u), replace: (u) => nav.push(u) };
Object.defineProperty(globalThis.location, 'href', { get: () => real.href, set: (u) => nav.push(u) });
await import(resolve(here, '../src/automation.js'));
await wait(40);
input($('wf-q'), 'zzzz-sin-workflows');
await wait(20);
const wfBtn = checkState(q('.tpls__empty .estate'), 'workflows', { title: 'Ningún workflow coincide con los filtros', cta: 'Crear workflow', art: true });
click(wfBtn);
await wait(20);
if (nav[0] !== 'create/?mode=blank') fail(`workflows: «Crear workflow» goes to the create page (create/?mode=blank), got ${JSON.stringify(nav[0] ?? null)}`);
if (q('#wf-modal.is-open')) fail('workflows: «Crear workflow» must not open a dialog any more');
click(q('[data-view="deleted"]'));
await wait(20);
checkState(q('.tpls__empty .estate'), 'workflows (deleted view)', { title: 'No hay workflows eliminados', cta: 'Ver todos los workflows', art: true });
log('workflows: illustration + «Crear workflow» (goes to create/?mode=blank); deleted view → «Ver todos los workflows»');

console.log('[empty-states] OK');
process.exit(0);

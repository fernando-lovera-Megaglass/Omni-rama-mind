// DOM smoke test for inline editing inside the list's preview panel («Acerca de», src/list.js): editable
// properties get the pencil, clicking it mounts the record's editor for the type (src/property-editor.js),
// Enter/submit or clicking away saves through setField (table cell, panel, toast and property history),
// Escape cancels, an untouched field writes nothing, read-only / system properties and the custom preview
// cards (pcard-*) offer no editor, and the change persists in storage. Run: node scripts/smoke-preview-edit.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[preview-edit]', ...a);
const fail = (msg) => { console.error(`[preview-edit] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.HTMLElement.prototype.scrollBy = function () {};
dom.window.confirm = () => true;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const submit = (form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const keydown = (el, key) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
// leaving the field: the focus moves away (blur) and the panel sees the focusout
const leave = (el) => { el.blur(); if (document.activeElement === el) document.body.focus(); el.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: null })); };
const row = (key) => q(`#pv-props .props__row[data-key="${key}"]`);
const pencil = (key) => row(key) && row(key).querySelector('[data-pv-edit]');
const form = () => q('#pv-props form.props__form');

// the table shows the lead status and the city; the preview layout lists them plus read-only properties and a custom card
localStorage.setItem('crm:contacts:prefs', JSON.stringify({ columns: ['name', 'email', 'status', 'city', 'created'] }));
localStorage.setItem('crm:contacts:preview:default', JSON.stringify({ name: 'Vista predeterminada', props: ['status', 'city', 'email', 'phone', 'created', 'hs_object_id'], left: [], tabs: [], right: ['about', 'pcard-1'], cards: { 'pcard-1': { label: 'Tarjeta propia', props: ['city', 'status'] } } }));
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/contacts.js'));
await wait(60);

// ---- open the preview of the first row ----
const pvBtn = q('[data-preview]');
if (!pvBtn) fail('preview button on a row');
const id = Number(pvBtn.dataset.preview);
click(pvBtn);
await wait(10);
if (!$('preview').classList.contains('is-open') || !row('status')) fail('preview open with the status row');
const contact = () => data.findRecord('contacts', id);
const cellOf = (key) => { const tr = q(`#table tbody tr[data-id="${id}"]`); if (!tr) fail('table row'); const headers = qa('#table thead th').map(text); const td = tr.querySelector(`td[data-key="${key}"]`); if (td) return td; const i = headers.findIndex((h) => h === (key === 'status' ? 'Estado del lead' : 'Ciudad')); return tr.querySelectorAll('td')[i]; };
if (!pencil('status') || !pencil('city') || !pencil('email')) fail('pencil on the editable properties');
if (pencil('created') || pencil('hs_object_id')) fail('no pencil on «Fecha de creación» nor on a system property');
if (q('#pv-extra [data-pv-edit]') || !/Tarjeta propia/.test(text($('pv-extra')))) fail('custom preview cards stay read-only');
if (pencil('status').getAttribute('aria-label') !== 'Editar Estado del lead') fail(`pencil label (${pencil('status').getAttribute('aria-label')})`);
log(`vista previa del contacto #${id}: lápiz en Estado del lead, Ciudad y Correo; sin lápiz en Fecha de creación, ID y la tarjeta propia`);

// ---- «Estado del lead» → «Conectado» from the panel ----
const before = contact().status;
const histBefore = data.historyFor('contacts', id).length;
click(pencil('status'));
const sel = q('#pv-props form.props__form select[data-edit="status"]');
if (!sel || !form()) fail('the status editor is a dropdown mounted in the row');
const labels = [...sel.options].map((o) => o.textContent);
if (!labels.includes('Conectado') || !labels.includes('Nuevo') || sel.value !== String(before ?? '')) fail(`dropdown with the lead statuses and the current value (${labels.join('|')} / ${sel.value})`);
if (!form().querySelector('button[type="submit"]') || !form().querySelector('[data-pv-cancel]')) fail('Guardar / Cancelar buttons');
sel.value = 'done';
submit(form());
await wait(30);
if (contact().status !== 'done') fail(`saved on the record (${contact().status})`);
if (form()) fail('editor closed after saving');
if (!/Conectado/.test(text(row('status')))) fail(`panel shows the new value (${text(row('status'))})`);
if (!/Conectado/.test(text(cellOf('status')))) fail(`table cell shows the new value (${text(cellOf('status'))})`);
if (!/"Estado del lead" actualizado/.test(text($('toast')))) fail(`toast (${text($('toast'))})`);
const hist = data.historyFor('contacts', id);
if (hist.length !== histBefore + 1 || hist[0].key !== 'status' || hist[0].to !== 'done' || hist[0].from !== before) fail(`property history (${JSON.stringify(hist[0])})`);
if (!$('preview').classList.contains('is-open')) fail('the panel stays open');
log(`Estado del lead: ${before} → done («Conectado») sin salir del panel; celda de la tabla, toast e historial actualizados`);

// ---- it persists after a reload (a fresh data module reads the same storage) ----
const again = await import(resolve(here, `../src/data.js?reload=${Date.now()}`));
if (again.findRecord('contacts', id).status !== 'done') fail('persisted in storage');
log('tras recargar: status = done');

// ---- Escape cancels; an untouched click-away writes nothing; click-away with a change saves ----
click(pencil('city'));
const input = q('#pv-props form.props__form input[data-edit="city"]');
if (!input || input.type !== 'text') fail('text editor for the city');
const cityBefore = contact().city;
input.value = 'Ciudad que no se guarda';
keydown(input, 'Escape');
await wait(10);
if (form() || contact().city !== cityBefore || !$('preview').classList.contains('is-open')) fail('Escape cancels and keeps the panel open');
click(pencil('email'));
const emailInput = q('#pv-props form.props__form input[data-edit="email"]');
if (!emailInput || emailInput.type !== 'email') fail('e-mail editor');
leave(emailInput);
await wait(20);
if (form() || data.historyFor('contacts', id).length !== histBefore + 1) fail('an untouched field closes without writing');
click(pencil('city'));
const input2 = q('#pv-props form.props__form input[data-edit="city"]');
input2.value = 'Guadalajara';
leave(input2);
await wait(30);
if (contact().city !== 'Guadalajara' || form()) fail(`clicking away saves (${contact().city})`);
if (!/Guadalajara/.test(text(cellOf('city'))) || !/Guadalajara/.test(text(row('city')))) fail('cell and panel show the city');
if (data.historyFor('contacts', id)[0].key !== 'city') fail('city change in the history');
log('Escape cancela; salir del campo sin cambios no escribe; salir con cambio guarda (Ciudad = Guadalajara)');

// ---- Cancelar button and Escape with no editor closes the panel as before ----
click(pencil('city'));
click(form().querySelector('[data-pv-cancel]'));
if (form()) fail('Cancelar closes the editor');
keydown(document.body, 'Escape');
await wait(10);
if ($('preview').classList.contains('is-open')) fail('Escape with nothing being edited closes the panel');
log('«Cancelar» cierra el editor; Escape sin edición cierra el panel');
console.log('[preview-edit] OK');
process.exit(0);

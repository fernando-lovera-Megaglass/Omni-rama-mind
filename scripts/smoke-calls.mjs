// DOM smoke test for the calls module: the CRM › Llamadas index page (views tab, search, filters,
// table, pagination, export), the record-page «Llamar» menu (numbers, add-number form, device/from
// rows, manual log fallback) and the topbar dialer (tabs, keypad, recents, contact search).
// Runs in local mode (no Supabase). Run: node scripts/smoke-calls.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[llamadas]', ...a);
const fail = (msg) => { console.error(`[llamadas] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  return dom;
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== 1) Página CRM › Llamadas =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="calls-root"></main><div id="scrim"></div></body>', 'http://localhost/calls/');
const data = await import(resolve(here, '../src/data.js'));
// Dos llamadas registradas a mano ANTES de abrir la página (una saliente de hoy, una entrante vieja).
const contact = data.allContacts()[0];
data.addActivity({ type: 'call', recordType: 'contacts', recordId: contact.id, text: `Llamada saliente con ${contact.name}.`, who: 'Fernando L.', when: Date.now(), extra: { direction: 'Saliente', outcome: 'Conectado', durationMin: 4 } });
const old = Date.now() - 10 * 86400000;
data.addActivity({ type: 'call', recordType: 'contacts', recordId: contact.id, text: `Llamada entrante con ${contact.name}.`, who: 'Sofía R.', when: old, extra: { direction: 'Entrante', outcome: 'Sin respuesta', durationMin: 0 } });
await import(resolve(here, '../src/calls.js'));
await wait(60);

if (text(q('.calls .page-title')) !== 'Llamadas') fail('título de la página');
if (!q('.calls__view.is-active') || text(q('.calls__view.is-active')) !== 'Todas las llamadas') fail('pestaña de vista');
if (!$('calls-q') || !$('calls-f-direction') || !$('calls-f-owner') || !$('calls-f-date') || !$('calls-f-duration')) fail('filtros rápidos');
// Ambas llamadas en la tabla.
let rowsText = text(q('.calls'));
if (!rowsText.includes(`Llamada con ${contact.name}`)) fail('las llamadas registradas no aparecen');
if (!rowsText.includes('4 minutos')) fail('la duración no aparece');
if (!rowsText.includes('Sin respuesta')) fail('la entrante no aparece');
if (!text(q('.calls__count')).includes('2 llamadas')) fail(`conteo inicial: ${text(q('.calls__count'))}`);
log('página: cabecera, vista, filtros y tabla con las llamadas OK');
if (!q('.search.search--pill .ico--search') || !q('.table-wrap .table')) fail('componentes compartidos');
click(q('[data-sort="durationSec"][data-dir="1"]'));
if (!text(q('.table tbody tr')).includes('Sin respuesta')) fail('orden ascendente');
click(q('[data-sort="durationSec"][data-dir="-1"]'));
if (!text(q('.table tbody tr')).includes('4 minutos')) fail('orden descendente');
click(q('.table__add-btn'));
if (!q('.table__add .menu.is-open')) fail('selector de columnas');
click(q('[data-column="number"]'));
if (qa('.table thead th').length !== 8) fail('añadir columna');
click(q('[data-column="number"]'));
if (qa('.table thead th').length !== 7) fail('quitar columna');
$('calls-q').focus();
$('calls-q').value = 'inexistente';
$('calls-q').dispatchEvent(new window.Event('input', { bubbles: true }));
if (q('.table tbody tr') || document.activeElement !== $('calls-q')) fail('búsqueda y foco');
$('calls-q').value = '';
$('calls-q').dispatchEvent(new window.Event('input', { bubbles: true }));
log('tabla: ordenación, columnas y búsqueda OK');


// Los filtros comparten chips y menús, con selección y cierre al elegir.
if (qa('.calls__toolbar .qchip').length !== 4 || q('select.calls__filter')) fail('chips compartidos');
function chooseFilter(id, value) {
  const chip = $(`calls-f-${id}`);
  click(chip);
  if (!chip.parentElement.classList.contains('is-open') || chip.getAttribute('aria-expanded') !== 'true') fail('abrir filtro');
  const options = [...chip.parentElement.querySelectorAll('[data-call-filter]')];
  if (options[0].dataset.value !== '' || !text(options[0]).includes('Todos')) fail('Todos primero');
  click(options.find((option) => option.dataset.value === value));
  const current = $(`calls-f-${id}`);
  if (current.parentElement.classList.contains('is-open')) fail('cerrar filtro');
  const selected = current.parentElement.querySelector('[aria-checked="true"]');
  if (selected?.dataset.value !== value) fail('opción activa');
  if (value && !current.querySelector('strong')) fail('valor activo en negrita');
}
chooseFilter('direction', 'outbound');
if (!text(q('.table')).includes('4 minutos') || text(q('.table')).includes('Sin respuesta')) fail('dirección');
chooseFilter('direction', '');
chooseFilter('date', 'today');
if (qa('.table tbody tr').length !== 1) fail('fecha hoy');
chooseFilter('date', 'week');
if (qa('.table tbody tr').length !== 1) fail('fecha semana');
chooseFilter('date', '');
chooseFilter('duration', '1-5');
if (qa('.table tbody tr').length !== 1) fail('duración');
chooseFilter('duration', 'gt5');
if (q('.table')) fail('duración sin resultados');
chooseFilter('duration', '');
chooseFilter('owner', 'Sofía R.');
if (!text(q('.table')).includes('Sin respuesta') || text(q('.table')).includes('4 minutos')) fail('responsable');
log('chips: apertura, selección, reinicio y cuatro filtros OK');

// El pie con el total.
if (!text(q('.calls__count')).includes('1 llamada')) fail(`conteo: ${text(q('.calls__count'))}`);
log('conteo del pie OK');

// Búsqueda.
chooseFilter('owner', '');
click(q('.pager__sizemenu > button'));
click(q('[data-pagination-size="50"]'));
if (!text(q('.pager__sizemenu > button')).includes('50 por página')) fail('tamaño de página');
const search = $('calls-q');
search.value = 'zzzz-no-existe';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(10);
if (!text(q('.calls__empty')).includes('No hay llamadas')) fail('estado vacío tras buscar');
search.value = '';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(10);
log('búsqueda y estado vacío OK');

// La fila abre su propia ficha; el guardado actualiza la misma actividad de la cronología.
const manualRow = qa('[data-callrow]').find((r) => text(r).includes('Sin respuesta'));
click(manualRow);
if (!q('[role="dialog"]') || location.pathname !== '/calls/') fail('ficha lateral sin navegación');
if (!q('#call-detail a').href.includes(`/contacts/record/?id=${contact.id}`)) fail('contacto asociado');
$('call-detail-outcome').value = 'Conectado';
$('call-detail-notes').value = 'Notas completas editadas\nSegunda línea <texto>';
click(q('[data-detail-save]'));
await wait(20);
if (!text(q('[data-detail-status]')).includes('guardada')) fail('guardar llamada');
const edited = data.activitiesFor('contacts', contact.id).find((a) => a.when === old);
if (edited.extra.outcome !== 'Conectado' || edited.extra.notes !== $('call-detail-notes').value || edited.text !== edited.extra.notes) fail('edición en datos de cronología');
if (edited.extra.direction !== 'Entrante') fail('preservar metadatos');
if (text(q('.table')).includes('Sin respuesta')) fail('resultado actualizado en tabla');
click(q('[data-detail-close]'));
click(qa('[data-callrow]').find((r) => r.dataset.callrow === `log-${edited.id}`));
if ($('call-detail-notes').value !== edited.extra.notes) fail('persistencia al reabrir');
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
if ($('call-detail')) fail('cerrar con Escape');
// Twilio: lectura y controles dentro del panel, sin requerir una cuenta real.
const { openCallDetail } = await import(resolve(here, '../src/call-detail.js'));
openCallDetail({ source: 'twilio', title: 'Llamada grabada', when: old, direction: 'outbound', recording: true, callSid: 'CA-test', transcript: 'Transcripción de prueba <segura>', status: 'Conectado' });
if (!q('[data-detail-play]') || q('[data-detail-save]')) fail('controles Twilio');
if (text(q('#call-detail details p')) !== 'Transcripción de prueba <segura>') fail('transcripción del panel');
click(q('[data-detail-close]'));
log('ficha: edición persistida, tabla, cronología, enlace, cierre y transcripción OK');

// ===== 2) Menú «Llamar» de la ficha =====
const call = await import(resolve(here, '../src/call.js'));
const anchor = document.createElement('button');
document.body.appendChild(anchor);
let manual = false;
let added = '';
call.openCallMenu({
  anchor,
  rec: { name: 'Vanesa Orejel', phone: '+52 55 1234 5678', mobilephone: '+44 553 225 7642' },
  onManualLog: () => { manual = true; },
  onAddPhone: (v) => { added = v; },
});
const menu = q('.callmenu');
if (!menu) fail('el menú no se abrió');
if (text(menu.querySelector('.callmenu__head')) !== 'Vanesa Orejel') fail('cabecera del menú');
const nums = qa('.callmenu__num');
if (nums.length !== 2) fail(`números: ${nums.length}`);
if (!text(nums[0]).includes('(Número de móvil)') || !text(nums[1]).includes('(Número de teléfono)')) fail('etiquetas de los números');
if (nums[0].disabled !== true) fail('sin Twilio los números deben estar deshabilitados');
if (!text(menu).includes('Dispositivo:') && !text(menu).includes('Conecta Twilio')) fail('meta del menú');
if (!text(menu).includes('Abrir opciones de llamadas')) fail('enlace a opciones');
// Agregar número.
click(menu.querySelector('[data-add]'));
const addForm = menu.querySelector('.callmenu__add-form');
if (addForm.hidden) fail('el formulario de agregar número no se abrió');
addForm.querySelector('input').value = '+52 81 9999 0000';
click(addForm.querySelector('[data-add-save]'));
if (added !== '+52 81 9999 0000') fail(`número agregado: ${added}`);
if (q('.callmenu')) fail('el menú no se cerró tras agregar');
log('menú «Llamar»: números, agregar número y meta OK');

// Sin números: mensaje + registro manual.
call.openCallMenu({ anchor, rec: { name: 'Sin Tel' }, onManualLog: () => { manual = true; } });
const menu2 = q('.callmenu');
if (!text(menu2).includes('no tiene número de teléfono')) fail('aviso de sin números');
click(menu2.querySelector('[data-log]'));
if (!manual) fail('el registro manual no se disparó');
log('menú «Llamar» sin números: registro manual OK');

// ===== 2b) Con Twilio conectado: números activos y casilla «Grabar llamada» =====
const twilio = await import(resolve(here, '../src/twilio.js'));
twilio.setTwilioClient({
  functions: { invoke: async () => ({ data: { connection: { status: 'active', phoneNumber: '+17867418743', friendlyName: 'Cuenta de prueba', accountSid: 'ACx' } }, error: null }) },
  from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
});
await twilio.reloadConnection();
manual = false;
call.openCallMenu({ anchor, rec: { id: 7, name: 'Vanesa Orejel', phone: '+52 55 1234 5678' }, onManualLog: () => { manual = true; } });
const menu3 = q('.callmenu');
if (menu3.querySelector('[data-num]').disabled) fail('con Twilio los números deben estar activos');
if (!text(menu3).includes('786')) fail(`«Llamada desde»: ${text(menu3)}`);
const recBox = menu3.querySelector('[data-callrecord]');
if (!recBox) fail('la casilla «Grabar llamada» no aparece');
recBox.checked = true;
recBox.dispatchEvent(new window.Event('change', { bubbles: true }));
if (localStorage.getItem('omni:call:record') !== '1') fail('la preferencia de grabación no se guardó');
if (menu3.querySelector('[data-callrecord-note]').hidden) fail('el aviso legal de grabación no se muestra');
if (call.recordPref() !== true) fail('recordPref');
// Marcar sin token de voz falla y cae al registro manual (no rompe la interfaz).
click(menu3.querySelector('[data-num]'));
await wait(30);
if (!manual) fail('el fallo de voz no cayó al registro manual');
log('menú «Llamar» con Twilio: números activos, «Llamada desde» y casilla de grabación OK');

// ===== 3) Marcador de la barra superior =====
await call.openDialer();
const dialer = q('.dialer');
if (!dialer) fail('el marcador no se abrió');
if (!text(dialer).includes('Recientes') || !text(dialer).includes('Teclado')) fail('pestañas del marcador');
if (!dialer.querySelector('[data-dialer="q"]').placeholder.includes('Contacto')) fail('buscador del marcador');
// Teclado.
click([...dialer.querySelectorAll('.dialer__tab')].find((t) => t.dataset.tab === 'pad'));
const display = dialer.querySelector('[data-dialer="display"]');
const callBtn = dialer.querySelector('[data-dialer="call"]');
if (!callBtn.disabled) fail('el botón de llamar debe estar deshabilitado sin número');
[...dialer.querySelectorAll('.keypad__key')].slice(0, 3).forEach((k) => click(k));
if (display.value !== '123') fail(`teclado: ${display.value}`);
if (callBtn.disabled) fail('el botón de llamar debe activarse con número');
click(dialer.querySelector('[data-dialer="back"]'));
if (display.value !== '12') fail(`borrar: ${display.value}`);
log('marcador: pestañas, teclado y botón de llamar OK');

// Buscar un contacto por nombre.
const qInput = dialer.querySelector('[data-dialer="q"]');
qInput.value = contact.name.slice(0, 6);
qInput.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(10);
const hit = dialer.querySelector('[data-pane="results"] [data-callnum]');
if (!hit || !text(hit).includes(contact.name.split(' ')[0])) fail('la búsqueda no encontró al contacto');
if (!hit.dataset.contactid) fail('el resultado de búsqueda debe llevar el id del contacto (para guardar la llamada en su ficha)');
log('marcador: búsqueda de contactos OK');

// Con Twilio el pie del marcador también trae la casilla de grabación.
call.closeDialer();
await call.openDialer();
const dialer2 = q('.dialer');
if (!dialer2.querySelector('[data-callrecord]')) fail('la casilla de grabación no aparece en el marcador');
if (!text(dialer2).includes('786')) fail('«Llamada desde» en el marcador');
log('marcador: casilla de grabación OK');

call.closeDialer();
if (q('.dialer')) fail('el marcador no se cerró');

log('OK');

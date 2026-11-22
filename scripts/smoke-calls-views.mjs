// DOM smoke test for the saved views of CRM › Llamadas (src/calls.js): the two system tabs, «+ Añadir vista»
// saving the current search/filters/sort/columns under a name («Conectadas este mes»: this month + result
// Conectado), the tab surviving a page reload with its filters applied, switching tabs applying everything at
// once, rename / duplicate / delete from the tab menu, «Guardar cambios», and the system views that cannot be
// deleted. Local mode (no Supabase). Run: node scripts/smoke-calls-views.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[calls-views]', ...a);
const fail = (msg) => { console.error(`[calls-views] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom() {
  const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="calls-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/calls/', pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements']) globalThis[k] = dom.window[k];
  dom.window.confirm = () => true;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
}
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = () => qa('#calls-views button.views__tab').map((b) => text(b));
const activeTab = () => text(q('#calls-views button.views__tab.is-active'));
const chip = (id) => text($(`calls-f-${id}`));
const rows = () => qa('#calls-root tbody tr[data-callrow]');
const storeRaw = () => JSON.parse(mem['crm:calls:views'] || 'null');
const submitName = (name) => { const f = $('calls-view-form'); f.elements.name.value = name; f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); };
const waitRows = async () => { for (let i = 0; i < 100 && !q('#calls-root table') && !q('#calls-root .calls__empty'); i++) await wait(20); };

useDom();
const data = await import(resolve(here, '../src/data.js'));
// calls of this month with a result, and one connected last month (must not match «este mes»)
const [c1, c2] = data.allContacts();
const now = Date.now();
data.addActivity({ type: 'call', recordType: 'contacts', recordId: c1.id, text: `Llamada con ${c1.name}`, who: 'Fernando L.', when: now - 3600_000, extra: { direction: 'Saliente', durationSec: 180, outcome: 'Conectado' } });
data.addActivity({ type: 'call', recordType: 'contacts', recordId: c2.id, text: `Llamada con ${c2.name}`, who: 'Sofía R.', when: now - 7200_000, extra: { direction: 'Entrante', durationSec: 40, outcome: 'Sin respuesta' } });
const lastMonth = new Date(now); lastMonth.setMonth(lastMonth.getMonth() - 1);
data.addActivity({ type: 'call', recordType: 'contacts', recordId: c2.id, text: `Llamada con ${c2.name}`, who: 'Fernando L.', when: lastMonth.getTime(), extra: { direction: 'Saliente', durationSec: 300, outcome: 'Conectado' } });
let C = await import(resolve(here, '../src/calls.js'));
await waitRows();

// ---- the system tabs, nothing deletable, the store seeded ----
if (tabs().join('|') !== 'Todas las llamadas|Llamadas grabadas' || activeTab() !== 'Todas las llamadas' || !q('[data-calls-view="add"]')) fail(`system tabs + «Añadir vista» (${tabs().join('|')})`);
if (q('[data-calls-view="delete"]')?.disabled !== true || q('[data-calls-view="rename"]')?.disabled !== true || q('[data-calls-view="clone"]')?.disabled) fail('system view: delete and rename disabled, duplicate allowed');
if (C.deleteView('sys:all') !== false || C.deleteView('sys:recorded') !== false || tabs().length !== 2) fail('system views cannot be deleted');
const allCount = rows().length;
if (!allCount) fail('calls listed');
log(`pestañas del sistema: ${tabs().join(' · ')}; eliminar/renombrar deshabilitados; ${allCount} llamadas`);

// ---- filters this month + Conectado, then «+ Añadir vista» → «Conectadas este mes» ----
click(q('[data-call-filter="dateRange"][data-value="month"]'));
click(q('[data-call-filter="status"][data-value="Conectado"]'));
if (!chip('date').includes('Este mes') || !chip('status').includes('Conectado')) fail(`filters set (${chip('date')} / ${chip('status')})`);
const connectedNow = rows().length;
if (!connectedNow || connectedNow >= allCount || rows().some((tr) => !text(tr).includes('Conectado'))) fail(`filtered result (${connectedNow} of ${allCount})`);
if (!q('#calls-views .views__dot')) fail('unsaved changes dot on the active tab');
click(q('[data-calls-view="add"]'));
const dlg = $('calls-view-dialog');
if (!dlg || !dlg.classList.contains('is-open') || text($('calls-view-title')) !== 'Crear vista' || !$('calls-view-form')) fail('the add-view dialog asks for a name');
submitName('Conectadas este mes');
if (dlg.classList.contains('is-open')) fail('dialog closes');
if (activeTab() !== 'Conectadas este mes' || tabs().length !== 3 || rows().length !== connectedNow || q('#calls-views .views__dot')) fail(`new tab active with the same result (${activeTab()} / ${rows().length})`);
if (!/Vista «Conectadas este mes» creada/.test(text($('toast')))) fail(`toast (${text($('toast'))})`);
const saved = storeRaw();
const mine = saved.custom.find((v) => v.name === 'Conectadas este mes');
if (!mine || saved.active !== mine.id || mine.dateRange !== 'month' || mine.status !== 'Conectado' || mine.base !== 'all' || mine.sort.key !== 'when' || !Array.isArray(mine.columns) || mine.system) fail(`persisted in crm:calls:views (${JSON.stringify(mine)})`);
if (!saved.custom.filter((v) => v.system).map((v) => v.id).join() === 'sys:all,sys:recorded') fail('system views stored too');
log(`«Conectadas este mes»: ${connectedNow} llamadas, guardada con dateRange=month, status=Conectado, activa`);

// ---- reload: the tab is still there and active, with its filters applied ----
useDom();
C = await import(resolve(here, '../src/calls.js?reload=1'));
await waitRows();
if (activeTab() !== 'Conectadas este mes' || tabs().length !== 3) fail(`after reload the tab stays active (${activeTab()})`);
if (!chip('date').includes('Este mes') || !chip('status').includes('Conectado') || rows().length !== connectedNow || q('#calls-views .views__dot')) fail(`filters applied after reload (${chip('date')} / ${chip('status')} / ${rows().length})`);
// switching to a system tab clears everything at once; back again re-applies the view
click(qa('#calls-views button.views__tab')[0]);
if (activeTab() !== 'Todas las llamadas' || chip('date').includes('Este mes') || chip('status').includes('Conectado') || rows().length !== allCount) fail('switching to «Todas las llamadas» clears the filters');
click(qa('#calls-views button.views__tab')[2]);
if (activeTab() !== 'Conectadas este mes' || rows().length !== connectedNow || !chip('status').includes('Conectado')) fail('switching back re-applies the view');
if (storeRaw().active !== mine.id) fail('active tab persisted');
log('recarga: pestaña activa con filtros; cambiar de pestaña aplica/quita filtros de golpe');

// ---- rename, save changes, duplicate, delete ----
click(q('[data-calls-view="rename"]'));
if (text($('calls-view-title')) !== 'Cambiar nombre' || $('calls-view-form').elements.name.value !== 'Conectadas este mes') fail('rename dialog prefilled');
submitName('Mis conectadas del mes');
if (activeTab() !== 'Mis conectadas del mes' || storeRaw().custom.find((v) => v.id === mine.id).name !== 'Mis conectadas del mes') fail('renamed');
// a change on the view (sort by duration) shows the dot and «Guardar cambios» keeps it
click(q('[data-sort="durationSec"]'));
if (!q('#calls-views .views__dot') || q('[data-calls-view="save"]').disabled) fail('dirty dot + Guardar cambios enabled');
click(q('[data-calls-view="save"]'));
if (q('#calls-views .views__dot') || storeRaw().custom.find((v) => v.id === mine.id).sort.key !== 'durationSec') fail('changes saved into the view');
click(q('[data-calls-view="clone"]'));
if (text($('calls-view-title')) !== 'Duplicar vista' || $('calls-view-form').elements.name.value !== 'Copia de Mis conectadas del mes') fail('duplicate dialog prefilled');
submitName('Copia de Mis conectadas del mes');
const copy = storeRaw().custom.find((v) => v.name === 'Copia de Mis conectadas del mes');
if (!copy || activeTab() !== 'Copia de Mis conectadas del mes' || tabs().length !== 4 || copy.status !== 'Conectado' || copy.dateRange !== 'month' || copy.sort.key !== 'durationSec' || rows().length !== connectedNow) fail('duplicated with the same filters, sort and columns');
click(q('[data-calls-view="delete"]'));
if (tabs().length !== 3 || tabs().includes('Copia de Mis conectadas del mes') || activeTab() !== 'Todas las llamadas' || rows().length !== allCount || storeRaw().custom.some((v) => v.id === copy.id)) fail(`deleted, back to «Todas las llamadas» (${tabs().join('|')} / ${activeTab()})`);
if (!/Vista eliminada/.test(text($('toast')))) fail('delete toast');
// the system tabs stay and cannot be deleted from the menu either
if (q('[data-calls-view="delete"]')?.disabled !== true) fail('system view delete disabled after deleting a custom one');
click(qa('#calls-views button.views__tab')[1]);
if (activeTab() !== 'Llamadas grabadas' || C.state.view !== 'recorded' || q('[data-calls-view="delete"]')?.disabled !== true) fail('«Llamadas grabadas» applies its base and cannot be deleted');
log('renombrada, cambios guardados (orden por duración), duplicada con los mismos filtros, eliminada; las del sistema siguen');
console.log('[calls-views] OK');
process.exit(0);

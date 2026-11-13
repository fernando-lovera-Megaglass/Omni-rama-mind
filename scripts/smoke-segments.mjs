// DOM smoke test for Segmentos (spec PARTE A): the list page (header, tabs, filters, search, pager, folders,
// bulk actions, Análisis), the editor (object chooser, name, folder, shared filter editor with association and
// membership filters, Y/O groups, limits, AI suggestions, preview, save dialog with type / description /
// campaign / access, processing), static membership edited by hand, clone, and import-created segments.
// Run: node scripts/smoke-segments.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[segments]', ...a);
const fail = (msg) => { console.error(`[segments] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const boot = (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.history = dom.window.history;
  dom.window.confirm = () => true;
  dom.window.prompt = () => 'Carpeta nueva';
  return dom;
};
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="seg-root"></main><div id="scrim"></div></body>';
const EDITOR = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="sedit-root"></main><div id="scrim"></div></body>';
let dom = boot('http://localhost/segments/', LIST);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const input = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const data = await import(resolve(here, '../src/data.js'));
const SD = await import(resolve(here, '../src/segments-data.js'));
await import(resolve(here, '../src/segments.js'));
const $ = (id) => document.getElementById(id);
const rows = () => document.querySelectorAll('.seg__table tbody tr[data-id]').length;
const first = () => document.querySelector('.seg__table tbody tr[data-id]');
const total = () => SD.segments().length;

// ---------- list page ----------
const crm = [...document.querySelectorAll('.sidenav__group')].find((g) => g.textContent.includes('CRM'));
log('nav entry:', [...crm.querySelectorAll('.sidenav__sub')].find((a) => a.textContent.includes('Segmentos'))?.getAttribute('href'), '| live store:', data.segmentsAreLive());
log('title:', document.querySelector('.seg__head h1').textContent, '|', document.querySelector('.seg__count').textContent, '| buttons:', [...document.querySelectorAll('.seg__actions > .menu > button, .seg__actions > a')].map((b) => b.textContent.trim()).join(' | '));
if (total() !== 142) fail('sample size');
log('create links:', [...document.querySelectorAll('[data-create], [data-quick]')].map((a) => a.getAttribute('href')).join(' | '));
if (document.querySelector('[data-create="active"]').getAttribute('href') !== './editor/' || document.querySelector('[data-quick="deals"]').getAttribute('href') !== './editor/?object=deals') fail('create links should open the editor');
const headers = [...document.querySelectorAll('.seg__table thead th')].map((t) => t.textContent.replace(/ⓘ/g, '').trim()).filter(Boolean);
log('columns:', headers.join(' | '), '| rows:', rows(), '| pages:', document.querySelectorAll('.pager__num').length);
if (headers.join('|') !== 'Nombre|Tamaño de la lista|Tipo|Objeto|Última actualización (CST)|Creador|Carpeta|Se usa en (total)' || rows() !== 25) fail('table');
log('first row link:', first().querySelector('.seg__name').getAttribute('href'), '| active sample "Clientes" size:', SD.segmentSize(SD.segments().find((s) => s.name === 'Clientes')), '| expected:', data.allContacts().filter((c) => c.lifecycle === 'Cliente').length);
if (SD.segmentSize(SD.segments().find((s) => s.name === 'Clientes')) !== data.allContacts().filter((c) => c.lifecycle === 'Cliente').length) fail('active sample size from filters');
click(document.querySelector('[data-filter="type"][data-value="static"]'));
if (![...document.querySelectorAll('.seg__table tbody .seg__type')].every((t) => t.textContent.includes('Estática'))) fail('type filter');
click(document.querySelector('[data-filter="type"][data-value=""]'));
input($('seg-q'), 'PVC');
log('search PVC ->', rows());
if (rows() !== 2) fail('search');
input($('seg-q'), '');
click(document.querySelector('.pager__num[data-page="2"]'));
if (document.querySelector('.pager__num.is-active').textContent !== '2') fail('pager');
click(document.querySelector('.pager__num[data-page="1"]'));
// folders, bulk move / clone / static / delete
click(document.querySelector('.seg__folders'));
input($('folder-name'), 'Campañas 2026');
click(document.querySelector('[data-act="folder-create"]'));
if (!SD.folders().includes('Campañas 2026')) fail('folder creation');
click($('seg-modal').querySelector('[data-close]'));
const firstId = Number(first().dataset.id);
const tick = (id) => { const cb = document.querySelector(`tr[data-id="${id}"] .seg-check`); cb.checked = true; cb.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
tick(firstId);
click(document.querySelector('[data-bulk="folder"]'));
$('move-folder').value = 'Campañas 2026';
click(document.querySelector('[data-act="move-confirm"]'));
log('folder column:', document.querySelector(`tr[data-id="${firstId}"] .seg__folder`)?.textContent);
if (document.querySelector(`tr[data-id="${firstId}"] .seg__folder`)?.textContent !== 'Campañas 2026') fail('move to folder');
const clientes = SD.segments().find((s) => s.name === 'Clientes');
tick(clientes.id);
click(document.querySelector('[data-bulk="clone"]'));
const copy = SD.segments().find((s) => s.name === 'Clientes (copia)');
log('clone:', copy && `${copy.type} · filters ${copy.filters.length} · size ${SD.segmentSize(copy)}`, '| total:', total());
if (!copy || copy.filters.length !== 1 || total() !== 143) fail('clone');
tick(copy.id);
click(document.querySelector('[data-bulk="static"]'));
const asStatic = SD.segmentById(copy.id);
log('converted:', asStatic.type, '| members fixed:', asStatic.memberIds.length);
if (asStatic.type !== 'static' || asStatic.memberIds.length !== SD.segmentSize(clientes)) fail('convert to static keeps the members');
tick(copy.id);
click(document.querySelector('[data-bulk="delete"]'));
if (total() !== 142) fail('delete');
click(document.querySelector('[data-tab="analysis"]'));
if (document.querySelectorAll('.seg__stat').length !== 5) fail('analysis tab');

// ---------- editor: object chooser, filters, preview, save & process ----------
dom = boot('http://localhost/segments/editor/', EDITOR);
const ED = await import(resolve(here, '../src/segment-editor.js'));
log('chooser objects:', [...document.querySelectorAll('[data-object]')].map((b) => b.dataset.object).join(','));
if (document.querySelectorAll('[data-object]').length !== 4) fail('object chooser');
click(document.querySelector('[data-object="contacts"]'));
log('editor:', document.querySelector('.sedit__typetag').textContent.trim(), '| name input:', Boolean($('sedit-name')), '| filter groups:', document.querySelectorAll('#sedit-groups .advg').length, '| preview:', document.querySelector('.sedit__preview-head strong').textContent);
input($('sedit-name'), 'Instaladores de Monterrey con correo');
click(document.querySelector('[data-act="name-ok"]'));
log('name set:', document.querySelector('.sedit__title h1').textContent);
// filter categories offered (Propiedades, Afiliaciones, Eventos)
const assocSel = document.querySelector('#sedit-groups .advc [data-k="assoc"]');
log('categories:', [...assocSel.querySelectorAll('optgroup')].map((g) => g.label).join(' | '), '| options:', [...assocSel.options].map((o) => o.textContent.trim()).join(' / '));
if (![...assocSel.querySelectorAll('optgroup')].map((g) => g.label).join('|').includes('Propiedades|Afiliaciones|Eventos')) fail('filter categories');
// own property with a list value, a text value with ";" separators, an association filter and a group O
const setIn = (g, j, k, v) => { const el = document.querySelectorAll(`.advg[data-g="${g}"] .advc`)[j - 1].querySelector(`[data-k="${k}"]`); el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const checkIn = (g, j, v) => { const b = document.querySelectorAll(`.advg[data-g="${g}"] .advc`)[j - 1].querySelector(`[data-multi][value="${v}"]`); b.checked = true; b.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
setIn(0, 1, 'key', 'customer_type');
checkIn(0, 1, 'Instalador');
const after1 = Number(document.querySelector('.sedit__preview-head strong').textContent.split(' ')[0].replace(/,/g, ''));
const expect1 = data.allContacts().filter((c) => c.customer_type === 'Instalador').length;
log('preview after customer_type = Instalador:', after1, '| expected:', expect1);
if (after1 !== expect1) fail('live preview');
click(document.querySelector('.advg[data-g="0"] [data-add-cond]'));
setIn(0, 2, 'key', 'city');
setIn(0, 2, 'op', 'in');
setIn(0, 2, 'value', 'Monterrey; Guadalajara');
const expect2 = data.allContacts().filter((c) => c.customer_type === 'Instalador' && ['monterrey', 'guadalajara'].includes(String(c.city).toLowerCase())).length;
log('with city in Monterrey; Guadalajara:', document.querySelector('.sedit__preview-head strong').textContent, '| expected:', expect2);
if (Number(document.querySelector('.sedit__preview-head strong').textContent.split(' ')[0].replace(/,/g, '')) !== expect2) fail('";" separated values');
click(document.querySelector('.advg[data-g="0"] [data-add-cond]'));
setIn(0, 3, 'assoc', 'companies');
setIn(0, 3, 'key', 'state');
checkIn(0, 3, 'Florida');
log('association filter summary:', $('sedit-summary').textContent);
if (!/1 por asociación/.test($('sedit-summary').textContent)) fail('association filter');
click(document.querySelector('[data-clone-group="0"]'));
log('groups after clone:', document.querySelectorAll('#sedit-groups .advg').length, '| O separators:', document.querySelectorAll('#sedit-groups .advg__or').length);
if (document.querySelectorAll('#sedit-groups .advg').length !== 2) fail('clone group');
click(document.querySelector('[data-remove-group="1"]'));
if (document.querySelectorAll('#sedit-groups .advg').length !== 1) fail('remove group');
log('filter counter:', document.querySelector('.sedit__filters-head .muted').textContent);
// membership filter (Afiliaciones)
$('sedit-add-group').click();
setIn(1, 1, 'assoc', '__segment');
const segOptions = document.querySelectorAll('.advg[data-g="1"] .advc [data-multi]').length;
log('membership options (contact segments):', segOptions);
if (!segOptions) fail('membership filter options');
const clientesBox = [...document.querySelectorAll('.advg[data-g="1"] .advc [data-multi]')].find((b) => b.value === String(clientes.id));
clientesBox.checked = true;
clientesBox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
const expect3 = expect2 + 0; // group 2 adds the Clientes members (O)
const previewNow = Number(document.querySelector('.sedit__preview-head strong').textContent.split(' ')[0].replace(/,/g, ''));
log('with O group "miembro de Clientes":', previewNow, '| at least Clientes size:', SD.segmentSize(clientes));
if (previewNow < SD.segmentSize(clientes)) fail('membership filter should add the Clientes members');
click(document.querySelector('[data-remove-group="1"]'));
// AI suggestion
input($('sedit-ai'), 'contactos distribuidores en Monterrey con correo');
click(document.querySelector('[data-act="ai"]'));
log('AI proposal:', ED.state.filters.map((c) => `${c.key}:${c.op}:${Array.isArray(c.value) ? c.value.join('+') : c.value}`).join(' | '));
if (!ED.state.filters.some((c) => c.key === 'customer_type') || !ED.state.filters.some((c) => c.key === 'email' && c.op === 'filled')) fail('AI suggestion');
// folder from the editor, then save dialog
click(document.querySelector('[data-folder="Campañas 2026"]'));
click(document.querySelector('[data-act="save"]'));
log('save dialog:', $('sedit-modal-title').textContent, '| type radios:', document.querySelectorAll('[name="segtype"]').length, '| tabs:', [...document.querySelectorAll('[data-savetab]')].map((b) => b.textContent).join('/'));
click(document.querySelector('[data-act="describe"]'));
log('description:', $('sedit-desc').value.slice(0, 80));
if (!$('sedit-desc').value.includes('Segmento activo')) fail('generated description');
$('sedit-campaign').value = 'Promoción otoño';
click(document.querySelector('[data-savetab="access"]'));
$('sedit-view').value = 'teams';
document.querySelector('[data-team="Ventas Norte"]').checked = true;
click(document.querySelector('[data-savetab="details"]'));
await ED.saveAndProcess();
await new Promise((r) => setTimeout(r, 400));
const saved = SD.segments().find((s) => s.name === 'Instaladores de Monterrey con correo');
log('saved:', saved && `${saved.type} · ${saved.object} · ${saved.filters.length} filters · folder ${saved.folder} · campaign ${saved.campaign} · access ${JSON.stringify(saved.access)} · size ${saved.size} · processed ${Boolean(saved.processedAt)}`);
if (!saved || saved.folder !== 'Campañas 2026' || saved.campaign !== 'Promoción otoño' || saved.access.view !== 'teams' || !saved.access.teams.includes('Ventas Norte') || !saved.processedAt) fail('save & process');
if (saved.size !== SD.segmentSize(saved)) fail('processed size');
log('editor meta:', document.querySelector('.sedit__meta').textContent, '| uses menu items:', [...document.querySelectorAll('[data-use]')].map((b) => `${b.textContent}${b.disabled ? '(off)' : ''}`).join(' | '));
if (document.querySelector('[data-use="survey"]').disabled !== true || document.querySelector('[data-use="email"]').disabled) fail('uses depend on object and type');

// ---------- static segment: snapshot then manual add / remove ----------
dom = boot('http://localhost/segments/editor/?object=companies&type=static', EDITOR);
const ED2 = await import(resolve(here, '../src/segment-editor.js') + '?static');
input($('sedit-name'), 'Empresas Florida (foto)');
click(document.querySelector('[data-act="name-ok"]'));
setIn(0, 1, 'key', 'state');
checkIn(0, 1, 'Florida');
const fl = data.allCompanies().filter((c) => c.state === 'Florida').length;
click(document.querySelector('[data-act="save"]'));
log('static dialog type:', document.querySelector('[name="segtype"][value="static"]').checked);
await ED2.saveAndProcess();
await new Promise((r) => setTimeout(r, 400));
const st = SD.segments().find((s) => s.name === 'Empresas Florida (foto)');
log('static saved:', st && `${st.type} · members ${st.memberIds.length} · expected ${fl}`, '| preview rows:', document.querySelectorAll('.sedit__table tbody tr[data-id]').length, '| remove buttons:', document.querySelectorAll('[data-remove-member]').length);
if (!st || st.type !== 'static' || st.memberIds.length !== fl) fail('static snapshot');
click(document.querySelector('[data-remove-member]'));
log('after removing one:', SD.segmentById(st.id).memberIds.length);
if (SD.segmentById(st.id).memberIds.length !== fl - 1) fail('manual removal');
const other = data.allCompanies().find((c) => c.state !== 'Florida');
input($('sedit-member-q'), other.name.slice(0, 6));
const addBtn = document.querySelector(`[data-add-member="${other.id}"]`);
log('candidate found:', Boolean(addBtn));
click(addBtn);
log('after adding:', SD.segmentById(st.id).memberIds.length, '| includes other:', SD.segmentById(st.id).memberIds.includes(Number(other.id)));
if (!SD.segmentById(st.id).memberIds.includes(Number(other.id))) fail('manual add');
// the list shows the static size
dom = boot('http://localhost/segments/', LIST);
await import(resolve(here, '../src/segments.js') + '?again');
input($('seg-q'), 'Empresas Florida (foto)');
log('list row:', first().querySelector('.seg__size').textContent, first().querySelector('.seg__type').textContent.trim());
if (Number(first().querySelector('.seg__size').textContent.replace(/,/g, '')) !== fl) fail('list shows static membership size');

// ---------- segment created by an import ----------
const E = await import(resolve(here, '../src/import-engine.js'));
const table = E.parsePasted('Nombre\tApellidos\tCorreo electrónico\nSeg\tUno\tseg.uno@ejemplo.com\nSeg\tDos\tseg.dos@ejemplo.com');
const plan = E.planImport(table, E.autoMap(table.headers, 'es', 'contacts'), {});
const entry = E.registerImport({ name: 'Importación segmentos', table, plan, options: {} });
await E.runImport(entry.id, { ...plan, createSegment: true, segmentName: 'Importación: segmentos' }, { sleep: () => Promise.resolve() });
const imp = SD.segments().find((s) => s.importId === entry.id);
log('import segment:', imp && `${imp.name} · ${imp.object} · ${imp.type} · size ${SD.segmentSize(imp)}`);
if (!imp || SD.segmentSize(imp) !== 2) fail('import-created segment');
// the lists' advanced filters still work through the shared editor
dom = boot('http://localhost/contacts/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/contacts.js'));
click(document.querySelector('.quickbar [data-action="advanced"]'));
log('contacts advanced filter editor:', document.querySelectorAll('#adv-groups .advg').length, 'group(s) |', $('adv-summary').textContent.slice(0, 40));
if (!document.querySelector('#adv-groups .advc [data-k="assoc"]')) fail('shared editor in the lists');
log('OK');

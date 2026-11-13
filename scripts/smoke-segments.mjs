// DOM smoke test for Segmentos: header, tabs, view tabs, filters, search, table, pager, creation, folders,
// bulk actions, the Análisis tab and the segment created by an import.
// Run: node scripts/smoke-segments.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[segments]', ...a);
const fail = (msg) => { console.error(`[segments] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="seg-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/segments/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
dom.window.confirm = () => true;
dom.window.prompt = () => 'Segmento renombrado';

const SD = await import(resolve(here, '../src/segments-data.js'));
const S = await import(resolve(here, '../src/segments.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const rows = () => document.querySelectorAll('.seg__table tbody tr[data-id]').length;
const first = () => document.querySelector('.seg__table tbody tr[data-id]');
const total = () => SD.segments().length;

// navigation entry and header
const crm = [...document.querySelectorAll('.sidenav__group')].find((g) => g.textContent.includes('CRM'));
log('nav entry:', [...crm.querySelectorAll('.sidenav__sub')].find((a) => a.textContent.includes('Segmentos'))?.getAttribute('href'), '| active:', crm.querySelector('.sidenav__sub.is-active')?.textContent.trim());
log('title:', document.querySelector('.seg__head h1').textContent, '|', document.querySelector('.seg__count').textContent, '| buttons:', [...document.querySelectorAll('.seg__actions > .menu > button, .seg__actions > a')].map((b) => b.textContent.trim()).join(' | '));
if (!/^\d+ segmentos$/.test(document.querySelector('.seg__count').textContent) || total() !== 142) fail('header count / sample size');
log('tabs:', [...document.querySelectorAll('.seg__tab')].map((t) => t.textContent).join(' | '), '| view tabs:', [...document.querySelectorAll('.seg__viewtabs button')].map((t) => t.textContent.trim()).join(' | '), '| folders button:', Boolean(document.querySelector('.seg__folders')));
log('chips:', [...document.querySelectorAll('.seg__chips .qchip')].map((c) => c.textContent.trim()).join(' | '));
const headers = [...document.querySelectorAll('.seg__table thead th')].map((t) => t.textContent.replace(/ⓘ/g, '').trim()).filter(Boolean);
log('columns:', headers.join(' | '));
if (headers.join('|') !== 'Nombre|Tamaño de la lista|Tipo|Objeto|Última actualización (CST)|Creador|Carpeta|Se usa en (total)') fail('columns differ');
log('rows on page:', rows(), '| first:', [...first().querySelectorAll('td')].slice(1, 5).map((td) => td.textContent.replace(/\s+/g, ' ').trim()).join(' · '), '| pages:', document.querySelectorAll('.pager__num').length);
if (rows() !== 25) fail('25 per page');
log('type dots:', document.querySelectorAll('.seg__dot--active').length, 'active /', document.querySelectorAll('.seg__dot--static').length, 'static on this page');

// filters, search, pager
click(document.querySelector('[data-filter="type"][data-value="static"]'));
log('type = Estática ->', rows(), 'rows | chip:', document.querySelector('[data-chip="type"]').textContent.trim(), '| all static:', [...document.querySelectorAll('.seg__table tbody .seg__type')].every((t) => t.textContent.includes('Estática')));
if (![...document.querySelectorAll('.seg__table tbody .seg__type')].every((t) => t.textContent.includes('Estática'))) fail('type filter');
click(document.querySelector('[data-filter="type"][data-value=""]'));
click(document.querySelector('[data-filter="object"][data-value="deals"]'));
log('object = Negocio ->', rows(), '| all deals:', [...document.querySelectorAll('.seg__table tbody tr[data-id] td:nth-child(5)')].every((t) => t.textContent.trim() === 'Negocio'));
click(document.querySelector('[data-filter="object"][data-value=""]'));
click(document.querySelector('[data-filter="used"][data-value="used"]'));
log('used only ->', rows());
if ([...document.querySelectorAll('.seg__table tbody tr[data-id] td:last-child')].some((t) => t.textContent.trim() === '0')) fail('used filter');
click(document.querySelector('[data-filter="used"][data-value=""]'));
$('seg-q').value = 'PVC';
$('seg-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('search PVC ->', rows(), [...document.querySelectorAll('.seg__name')].map((a) => a.textContent).join(' | '));
if (rows() !== 2) fail('search');
$('seg-q').value = '';
$('seg-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
click(document.querySelector('.pager__num[data-page="2"]'));
log('page 2 rows:', rows(), '| active page:', document.querySelector('.pager__num.is-active').textContent);
if (document.querySelector('.pager__num.is-active').textContent !== '2') fail('pager');
click(document.querySelector('[data-size="50"]'));
log('50 per page ->', rows(), '| pages:', document.querySelectorAll('.pager__num').length);
if (rows() !== 50) fail('page size');
click(document.querySelector('[data-size="25"]'));
click(document.querySelector('.pager__num[data-page="1"]'));

// create a segment with a criterion
click(document.querySelector('[data-create="active"]'));
log('create modal:', $('seg-modal-title').textContent, '| open:', $('seg-modal').classList.contains('is-open'));
$('seg-name').value = 'Clientes activos prueba';
$('seg-object').value = 'contacts';
$('seg-key').value = 'lifecycle';
$('seg-value').value = 'Cliente';
click(document.querySelector('[data-act="create-confirm"]'));
log('after create: total', total(), '| first row:', first().querySelector('.seg__name').textContent, '| size:', first().querySelector('.seg__size').textContent, '| type:', first().querySelector('.seg__type').textContent.trim());
if (total() !== 143 || first().querySelector('.seg__name').textContent !== 'Clientes activos prueba' || Number(first().querySelector('.seg__size').textContent.replace(/,/g, '')) === 0) fail('segment creation');
const data = await import(resolve(here, '../src/data.js'));
const expected = data.allContacts().filter((c) => String(c.lifecycle || '').toLowerCase().includes('cliente')).length;
log('size matches lifecycle Cliente contacts:', Number(first().querySelector('.seg__size').textContent.replace(/,/g, '')) === expected, `(${expected})`);
if (Number(first().querySelector('.seg__size').textContent.replace(/,/g, '')) !== expected) fail('active segment size');
// open it: details + first members
click(first().querySelector('.seg__name'));
log('detail:', $('seg-modal-title').textContent, '| criteria:', [...document.querySelectorAll('#seg-modal-body dd')][3].textContent, '| members shown:', document.querySelectorAll('.seg__members li').length);
if (!document.querySelectorAll('.seg__members li').length) fail('segment detail members');
click(document.querySelector('[data-rename]'));
log('renamed:', first().querySelector('.seg__name').textContent);
if (first().querySelector('.seg__name').textContent !== 'Segmento renombrado') fail('rename');

// folders + bulk move, clone, convert, delete
click(document.querySelector('.seg__folders'));
$('folder-name').value = 'Campañas 2026';
click(document.querySelector('[data-act="folder-create"]'));
log('folders:', SD.folders().join(' | '));
if (!SD.folders().includes('Campañas 2026')) fail('folder creation');
click($('seg-modal').querySelector('[data-close]'));
const firstId = Number(first().dataset.id);
const cb = first().querySelector('.seg-check');
cb.checked = true;
cb.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('selected:', S.state.selected.size, '| actions enabled:', !document.querySelector('[data-bulk="folder"]').disabled);
click(document.querySelector('[data-bulk="folder"]'));
$('move-folder').value = 'Campañas 2026';
click(document.querySelector('[data-act="move-confirm"]'));
log('folder column:', document.querySelector(`tr[data-id="${firstId}"] .seg__folder`)?.textContent);
if (document.querySelector(`tr[data-id="${firstId}"] .seg__folder`)?.textContent !== 'Campañas 2026') fail('move to folder');
const cb2 = document.querySelector(`tr[data-id="${firstId}"] .seg-check`);
cb2.checked = true;
cb2.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
click(document.querySelector('[data-bulk="clone"]'));
log('after clone: total', total(), '| first:', first().querySelector('.seg__name').textContent);
if (total() !== 144 || !first().querySelector('.seg__name').textContent.endsWith('(copia)')) fail('clone');
const cb3 = first().querySelector('.seg-check');
cb3.checked = true;
cb3.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
click(document.querySelector('[data-bulk="static"]'));
log('converted type:', first().querySelector('.seg__type').textContent.trim());
if (!first().querySelector('.seg__type').textContent.includes('Estática')) fail('convert to static');
const cb4 = first().querySelector('.seg-check');
cb4.checked = true;
cb4.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
click(document.querySelector('[data-bulk="delete"]'));
log('after delete: total', total());
if (total() !== 143) fail('delete');

// Análisis tab
click(document.querySelector('[data-tab="analysis"]'));
log('analysis tiles:', [...document.querySelectorAll('.seg__stat')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
if (document.querySelectorAll('.seg__stat').length !== 5) fail('analysis tab');
click(document.querySelector('[data-tab="manage"]'));

// a segment created by an import shows up here with its members
const E = await import(resolve(here, '../src/import-engine.js'));
const table = E.parsePasted('Nombre\tApellidos\tCorreo electrónico\nSeg\tUno\tseg.uno@ejemplo.com\nSeg\tDos\tseg.dos@ejemplo.com');
const plan = E.planImport(table, E.autoMap(table.headers, 'es', 'contacts'), {});
const entry = E.registerImport({ name: 'Importación segmentos', table, plan, options: {} });
await E.runImport(entry.id, { ...plan, createSegment: true, segmentName: 'Importación: segmentos' }, { sleep: () => Promise.resolve() });
S.render();
const imp = SD.segments().find((s) => s.importId === entry.id);
log('import segment:', imp && `${imp.name} · ${imp.object} · ${imp.type} · size ${SD.segmentSize(imp)}`, '| in table:', Boolean(document.querySelector(`tr[data-id="${imp?.id}"]`)));
if (!imp || SD.segmentSize(imp) !== 2 || !document.querySelector(`tr[data-id="${imp.id}"]`)) fail('import-created segment');
log('OK');

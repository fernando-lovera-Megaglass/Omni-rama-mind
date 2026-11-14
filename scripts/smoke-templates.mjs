// DOM smoke test for CRM › Plantillas de mensaje: the seeded list with its counter, folders, search, owner
// filter, sorting, multi-select and pagination; the editor (create from scratch with tokens, edit, library,
// preview with a real contact, hide/show preview, Save disabled until name+body); the row actions (clone, move,
// sharing, delete); Nueva carpeta, Exportar, Analizar; and the e-mail composer inserting a saved template with
// resolved tokens. Run: node scripts/smoke-templates.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[plantillas]', ...a);
const fail = (msg) => { console.error(`[plantillas] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="tpl-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/templates/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
dom.window.confirm = () => true;
dom.window.prompt = (q, d) => (q.includes('enlace') ? 'https://megaglass.example/catalogo' : d);
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const change = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
const rows = () => [...document.querySelectorAll('#tpl-rows tr[data-id]')];
const names = () => rows().map((r) => text(r.querySelector('.tpls__name')));
const modalOpen = () => $('tpl-modal') && $('tpl-modal').classList.contains('is-open');
const q = (sel) => document.querySelector(sel);

const data = await import(resolve(here, '../src/data.js'));
const T = await import(resolve(here, '../src/templates-data.js'));
await T.ready;
await import(resolve(here, '../src/templates.js'));

// 1) The list loads: seed, counter, columns, folders
if (T.templatesLive()) fail('the test must run in local mode (no Supabase env)');
if (rows().length !== 3) fail(`expected 3 seeded rows, got ${rows().length}`);
if (text($('tpl-count')) !== '3 creados') fail(`counter: ${text($('tpl-count'))}`);
if (!names().includes('[Prueba] Seguimiento de propuesta')) fail('seed name missing');
const heads = [...document.querySelectorAll('.tpls__table thead th button')].map(text);
['Nombre', 'Propietario', 'Fecha de creación', 'Fecha de modificación'].forEach((h) => { if (!heads.some((x) => x.startsWith(h))) fail(`column ${h} missing`); });
if (!/hace|ayer|ahora/.test(text(rows()[0].children[4]))) fail('relative modification date missing');
const folderBtns = [...document.querySelectorAll('#tpl-folders [data-folder]')].map(text);
if (!folderBtns.some((f) => f.startsWith('Ventas') && f.endsWith('2'))) fail(`folders: ${folderBtns.join(' | ')}`);
if (!q('[data-ta="new-folder"]') || !q('[data-ta="analyze"]') || !q('[data-ta="export"]') || !q('[data-ta="new-scratch"]') || !q('[data-ta="new-library"]')) fail('header buttons missing');
if (!q('#tpl-q') || q('#tpl-q').placeholder !== 'Buscar en plantillas') fail('search box missing');
if (!text(q('#tpl-owner option')).startsWith('Propietario: Cualquiera')) fail('owner filter missing');
if (!rows()[0].querySelector('[data-act="clone"]') || !rows()[0].querySelector('[data-act="move"]') || !rows()[0].querySelector('[data-act="share"]') || !rows()[0].querySelector('[data-act="delete"]')) fail('row actions missing');
log('list loads: 3 seeded templates, counter, columns, folders, actions');

// 2) Create from scratch: Save disabled until name + body; tokens in subject and body; folder + private
click(q('[data-ta="new-scratch"]'));
if (!modalOpen() || text($('tpl-modal-title')) !== 'Nueva plantilla') fail('editor did not open');
if (!$('tpe-save').disabled) fail('Save must start disabled');
if (!text(q('.tpe__owner')).includes(T.ME)) fail('owner bar missing');
if (!q('[data-fmt="bold"]') || !q('[data-fmt="italic"]') || !q('[data-fmt="underline"]') || !q('[data-fmt="strikeThrough"]') || !q('[data-fmt="insertUnorderedList"]') || !q('[data-te="link"]') || !q('[data-te="image"]') || !q('[data-te="ai"]')) fail('toolbar incomplete');
if (!text(q('.tpe__sig')).includes('Se incluirá la firma predeterminada')) fail('signature note missing');
input($('tpe-name'), 'Prueba automática');
if (!$('tpe-save').disabled) fail('Save must stay disabled without body');
// Insertar → Token de personalización: object → searchable property list (standard + custom) → default value → chip
const pickToken = (target, object, slug, def = '') => {
  click(q(`[data-ins="token"][data-target="${target}"]`));
  if (!q('.tokpick')) fail('token picker did not open');
  click(q(`.tokpick [data-pick-object="${object}"]`));
  input(q('.tokpick__search'), slug);
  const btn = [...document.querySelectorAll('.tokpick [data-pick-prop]')].find((b) => b.dataset.pickProp === slug);
  if (!btn) fail(`property ${object}.${slug} missing in the picker`);
  click(btn);
  if (q('.tokpick__foot').hidden) fail('default-value field should show after picking a property');
  if (def) input(q('.tokpick__default'), def);
  click(q('.tokpick [data-pick="insert"]'));
  if (q('.tokpick')) fail('picker should close after inserting');
};
click(q('[data-ins="token"][data-target="body"]'));
if ([...document.querySelectorAll('.tokpick [data-pick-object]')].map((b) => b.dataset.pickObject).join() !== 'contacto,empresa,propietario,negocio,ticket') fail('picker objects');
click(q('.tokpick [data-pick-object="contacto"]'));
if (![...document.querySelectorAll('.tokpick [data-pick-prop]')].some((b) => b.querySelector('.tokpick__custom'))) fail('custom contact properties missing in the picker');
click(q('.tokpick [data-pick="close"]'));
pickToken('body', 'contacto', 'nombre', 'amigo');
const chip = q('#tpe-body .tok[data-token="contacto.nombre"]');
if (!chip || chip.dataset.default !== 'amigo' || chip.getAttribute('contenteditable') !== 'false' || text(chip) !== 'Nombre del contacto') fail('token chip not inserted into body');
if ($('tpe-save').disabled) fail('Save must enable with name + body');
input($('tpe-subject'), 'Hola ');
pickToken('subject', 'contacto', 'empresa');
if ($('tpe-subject').value !== 'Hola {{contacto.empresa}}') fail(`subject token: ${$('tpe-subject').value}`);
click(q('[data-ins="snippet"][data-target="body"]'));
if (!q('.tokpick [data-pick-snippet]')) fail('snippet list missing in the picker');
input(q('.tokpick__search'), 'horario');
click(q('.tokpick [data-pick-snippet]'));
if (!$('tpe-body').innerHTML.includes('horario de atención')) fail('snippet not inserted');
click(q('[data-te="link"]'));
if (!$('tpe-body').innerHTML.includes('href="https://megaglass.example/catalogo"')) fail('link not inserted');
click(q('[data-fmt="bold"]'));
click(q('[data-te="ai"]'));
if (!q('#tpe-body .tok[data-token="propietario.nombre"]')) fail('AI draft not inserted');
change($('tpe-folder'), 'Ventas');
change($('tpe-shared'), '0');
click($('tpe-save'));
if (modalOpen()) fail('editor should close after saving');
if (text($('tpl-count')) !== '4 creados') fail(`counter after create: ${text($('tpl-count'))}`);
const created = T.templates().find((t) => t.name === 'Prueba automática');
if (!created || created.folder !== 'Ventas' || created.shared !== false || created.ownerId !== T.ME) fail('created template not persisted correctly');
if (!created.body.includes('{{contacto.nombre|amigo}}') || created.body.includes('class="tok"')) fail(`chips must be saved as markers: ${created.body.slice(0, 120)}`);
const createdRow = rows().find((r) => r.dataset.id === created.id);
if (!createdRow || !text(createdRow).includes('Privado')) fail('created row must show the Privado tag');
if (!JSON.parse(mem['crm:message_templates']).some((t) => t.id === created.id)) fail('template not saved in storage');
log('create from scratch: tokens, snippet, link, AI draft, folder, private → saved and listed');

// 3) Edit from the name link
click(createdRow.querySelector('[data-open]'));
if (!modalOpen() || text($('tpl-modal-title')) !== 'Editar plantilla') fail('editor did not open for editing');
if ($('tpe-name').value !== 'Prueba automática' || $('tpe-folder').value !== 'Ventas' || $('tpe-shared').value !== '0') fail('editor did not load the template');
if (!location.search.includes(`id=${created.id}`)) fail('URL should carry the template id');
input($('tpe-subject'), 'Asunto editado para {{contacto.empresa}}');
click($('tpe-save'));
if (T.templateById(created.id).subject !== 'Asunto editado para {{contacto.empresa}}') fail('edit not saved');
if (location.search.includes('id=')) fail('URL should be cleared after closing');
if (!/ahora mismo|hace \d+ minutos?/.test(text(rows().find((r) => r.dataset.id === created.id).children[4]))) fail('modification date not refreshed');
log('edit: name link opens the editor, change saved, modification date refreshed');

// 4) Clone
click(rows().find((r) => r.dataset.id === created.id).querySelector('[data-act="clone"]'));
const clone = T.templates().find((t) => t.name === 'Prueba automática (copia)');
if (!clone || clone.subject !== 'Asunto editado para {{contacto.empresa}}') fail('clone missing or different');
if (text($('tpl-count')) !== '5 creados' || !names().includes('Prueba automática (copia)')) fail('clone not listed');
log('clone: "(copia)" row added');

// 5) Delete with confirmation dialog
click(rows().find((r) => r.dataset.id === clone.id).querySelector('[data-act="delete"]'));
if (!modalOpen() || !text($('tpl-modal-body')).includes('¿Seguro que quieres eliminar')) fail('delete confirmation missing');
click(q('[data-te="confirm-delete"]'));
if (T.templateById(clone.id) || names().includes('Prueba automática (copia)') || text($('tpl-count')) !== '4 creados') fail('clone not deleted');
log('delete: confirmation → row removed');

// 6) Preview with a real contact (+ hide/show)
const seed = T.templates().find((t) => t.name === '[Prueba] Seguimiento de propuesta');
click(rows().find((r) => r.dataset.id === seed.id).querySelector('[data-open]'));
const opts = [...$('tpe-contact').options].filter((o) => o.value);
if (opts.length < 3) fail('contact selector should list the contacts');
const contact = data.allContacts().find((c) => c.company) || data.allContacts()[0];
const first = contact.first || contact.name.split(' ')[0];
if (!text($('tpe-mail')).includes('Selecciona un contacto')) fail('preview hint missing');
change($('tpe-contact'), String(contact.id));
click(q('[data-te="generate"]'));
const mail = $('tpe-mail').innerHTML;
if (!mail.includes(first)) fail(`preview did not use the contact's first name (${first})`);
if (mail.includes('{{')) fail('preview still has unresolved tokens');
if (!text($('tpe-mail')).includes(`Asunto: Seguimiento: propuesta para ${contact.company}`)) fail(`preview subject: ${text($('tpe-mail')).slice(0, 200)}`);
if (!mail.includes('class="sig"')) fail('preview must include the default signature');
const ownerFirst = (contact.owner && contact.owner !== 'Sin asignar' ? contact.owner : 'Fernando L.').split(' ')[0];
if (!mail.includes(ownerFirst)) fail(`owner token not resolved (${ownerFirst})`);
if (!q('#tpe-body .tok[data-token="contacto.nombre"]')) fail('saved markers must show as chips when editing');
click(q('#tpe-preview [data-te="toggle-preview"]'));
if (!$('tpe-preview').hidden || q('.tpe__show').hidden) fail('Ocultar vista previa did not hide the panel');
click(q('.tpe__show'));
if ($('tpe-preview').hidden) fail('Mostrar vista previa did not show the panel');
click(q('#tpl-modal [data-bm="close"]'));
if (modalOpen()) fail('Cancelar did not close');
log(`preview with contact: tokens resolved for ${contact.name}, signature included, hide/show works`);

// 7) Folders: Nueva carpeta, Mover, folder filter
click(q('[data-ta="new-folder"]'));
input($('tpf-name'), 'Marketing');
click(q('[data-te="create-folder"]'));
if (!T.folders().includes('Marketing')) fail('folder not created');
if (![...document.querySelectorAll('#tpl-folders [data-folder]')].some((b) => b.dataset.folder === 'Marketing')) fail('folder not in sidebar');
click(rows().find((r) => r.dataset.id === created.id).querySelector('[data-act="move"]'));
change($('tpm-folder'), 'Marketing');
click(q('[data-te="confirm-move"]'));
if (T.templateById(created.id).folder !== 'Marketing') fail('move did not change the folder');
click(q('#tpl-folders [data-folder="Marketing"]'));
if (rows().length !== 1 || names()[0] !== 'Prueba automática') fail('folder filter failed');
click(q('#tpl-folders [data-folder="*"]'));
if (rows().length !== 4) fail('"Todas las plantillas" filter failed');
log('folders: created, template moved, sidebar filter works');

// 8) Sharing
click(rows().find((r) => r.dataset.id === created.id).querySelector('[data-act="share"]'));
q('input[name="tps"][value="1"]').checked = true;
click(q('[data-te="confirm-share"]'));
if (T.templateById(created.id).shared !== true) fail('sharing not updated');
if (text(rows().find((r) => r.dataset.id === created.id)).includes('Privado')) fail('Privado tag should be gone');
log('sharing: Privado → Compartido con todos');

// 9) Search, owner filter, sorting
input($('tpl-q'), 'presentación');
if (rows().length !== 1 || !names()[0].includes('Presentación')) fail('search failed');
input($('tpl-q'), '');
change($('tpl-owner'), 'Sofía R.');
if (rows().length !== 1 || text(rows()[0].children[2]) !== 'Sofía R.') fail('owner filter failed');
change($('tpl-owner'), '');
click(q('[data-sort="name"]'));
const asc = names();
if (asc.join() !== [...asc].sort((a, b) => a.localeCompare(b, 'es')).join()) fail(`sort asc: ${asc.join(' | ')}`);
click(q('[data-sort="name"]'));
if (names().join() !== [...asc].reverse().join()) fail('sort desc failed');
click(q('[data-sort="updatedAt"]'));
log('search, owner filter and sorting work');

// 10) Multi-select + bulk delete; pagination
const box = rows().find((r) => r.dataset.id === created.id).querySelector('[data-sel]');
box.checked = true;
box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
if (!text($('tpl-bulk')).startsWith('1 seleccionado')) fail(`bulk bar: ${text($('tpl-bulk'))}`);
click(q('[data-ta="bulk-delete"]'));
click(q('[data-te="confirm-delete"]'));
if (T.templateById(created.id) || text($('tpl-count')) !== '3 creados') fail('bulk delete failed');
for (let i = 1; i <= 30; i += 1) T.createTemplate({ name: `Masiva ${String(i).padStart(2, '0')}`, body: '<p>Cuerpo</p>' });
input($('tpl-q'), '');
if (rows().length !== 25 || text($('tpl-count')) !== '33 creados') fail(`page size: ${rows().length}`);
if (!q('[data-page="next"]') || q('[data-page="next"]').disabled || !q('[data-page="first"]').disabled) fail('pager state wrong on page 1');
click(q('[data-page="next"]'));
if (rows().length !== 8 || !q('[data-page="2"]').classList.contains('is-active')) fail('page 2 failed');
if (!q('[data-page="last"]').disabled) fail('Última should be disabled on the last page');
click(q('[data-page="first"]'));
if (rows().length !== 25 || !q('[data-page="1"]').classList.contains('is-active')) fail('Primero failed');
change($('tpl-size'), '10');
if (rows().length !== 10 || !q('[data-page="4"]')) fail('page size change failed');
click(q('[data-page="last"]'));
if (rows().length !== 3) fail('Última failed');
T.deleteTemplates(T.templates().filter((t) => t.name.startsWith('Masiva')).map((t) => t.id));
change($('tpl-size'), '25');
if (rows().length !== 3) fail('cleanup failed');
log('multi-select + bulk delete; pagination Primero/Anterior/Siguiente/Última with 33 templates');

// 11) Exportar (CSV) and Analizar
const csv = T.templatesCsv();
if (!csv.startsWith('"Nombre","Asunto","Propietario"') || csv.split('\n').length !== 4) fail('CSV wrong');
let clicked = 0;
dom.window.URL.createObjectURL = () => 'blob:tpl';
dom.window.URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function clickStub() { clicked += 1; };
click(q('[data-ta="export"]'));
if (clicked !== 1) fail('export did not download');
click(q('[data-ta="analyze"]'));
if (!modalOpen() || text(q('.tpls__stat strong')) !== '3' || !text($('tpl-modal-body')).includes('Fernando L.')) fail(`analyze: ${text($('tpl-modal-body')).slice(0, 120)}`);
click(q('#tpl-modal [data-bm="close"]'));
log('export CSV + Analizar');

// 12) Library
click(q('[data-ta="new-library"]'));
if (!modalOpen() || document.querySelectorAll('[data-te="use-lib"]').length !== T.LIBRARY.length) fail('library modal');
click(q('[data-te="use-lib"][data-id="lib-quote"]'));
if (text($('tpl-modal-title')) !== 'Nueva plantilla' || $('tpe-name').value !== 'Envío de cotización' || $('tpe-save').disabled) fail('library template not loaded into the editor');
click(q('#tpl-modal [data-bm="close"]'));
log('library → editor prefilled');

// 13) Composer integration: Plantillas menu lists saved templates and inserts subject + body with tokens resolved
const C = await import(resolve(here, '../src/compose.js'));
C.openCompose({ to: contact.name, email: contact.email, firstName: first, company: contact.company, contactId: contact.id });
await new Promise((r) => setTimeout(r, 10));
const panel = $('cmp-tpl-panel');
if (!panel || panel.querySelectorAll('[data-tpl]').length !== 3) fail('composer menu should list the 3 saved templates');
if (!panel.querySelector('a[href$="templates/"]')) fail('"Administrar plantillas" link missing');
click(panel.querySelector(`[data-tpl="${seed.id}"]`));
const subj = $('cmp-subject').value;
const body = $('cmp-text').innerHTML;
if (subj !== `Seguimiento: propuesta para ${contact.company}`) fail(`composer subject: ${subj}`);
if (!body.includes(`Hola ${first},`) || body.includes('{{')) fail(`composer body: ${body.slice(0, 120)}`);
if (!body.includes(ownerFirst)) fail('owner token not resolved in composer');
if (C.emailTemplates().length !== 3) fail('emailTemplates() should expose the saved templates');
log(`composer: template inserted for ${contact.name} with resolved tokens`);

console.log('[plantillas] OK');
process.exit(0);

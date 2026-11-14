// DOM smoke test for CRM › Fragmentos and the shared personalisation tokens: the seeded list (counter, columns,
// folders, actions, pagination), the "Fragmento nuevo" editor (required fields, folder checkbox, Personalizar
// token picker with default value, shortcut validation: one word + unique), edit, clone, delete, search/sort,
// the token catalogue and resolution engine (src/tokens.js), and the "#atajo" autocomplete in the e-mail
// composer (rich text) and in a note textarea, inserting the snippet with the contact's data.
// Run: node scripts/smoke-snippets.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[fragmentos]', ...a);
const fail = (msg) => { console.error(`[fragmentos] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="snp-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/snippets/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
dom.window.confirm = () => true;
dom.window.prompt = (q, d) => (q.includes('enlace') ? 'https://megaglass.example/garantia' : d);
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const change = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
const key = (el, k) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const rows = () => [...document.querySelectorAll('#snp-rows tr[data-id]')];
const names = () => rows().map((r) => text(r.querySelector('.tpls__name')));
const modalOpen = () => $('snp-modal') && $('snp-modal').classList.contains('is-open');
const caretAtEnd = (host) => { const tn = host.querySelector('p') ? host.querySelector('p').lastChild : host.lastChild; const r = document.createRange(); r.setStart(tn, tn.textContent.length); r.collapse(true); const sel = dom.window.getSelection(); sel.removeAllRanges(); sel.addRange(r); };

const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/snippets-data.js'));
const TK = await import(resolve(here, '../src/tokens.js'));
const AC = await import(resolve(here, '../src/snippet-autocomplete.js'));
await S.ready;
await import(resolve(here, '../src/snippets.js'));

// 1) The list loads
if (S.snippetsLive()) fail('the test must run in local mode (no Supabase env)');
if (rows().length !== 3 || text($('snp-count')) !== '3 creados') fail(`seed rows ${rows().length}, counter ${text($('snp-count'))}`);
const heads = [...document.querySelectorAll('.tpls__table thead th button')].map(text);
['Nombre', 'Creado por', 'Fecha de creación', 'Fecha de modificación'].forEach((h) => { if (!heads.some((x) => x.startsWith(h))) fail(`column ${h} missing`); });
if (!q('[data-ta="new-folder"]') || text(q('[data-ta="new"]')) !== 'Crear fragmento' || !q('[data-ta="new"]').classList.contains('btn--green')) fail('header buttons');
if (q('#snp-q').placeholder !== 'Buscar' || !text(q('#snp-owner option')).startsWith('Propietario: Cualquiera')) fail('search / owner filter');
if (!rows()[0].querySelector('[data-act="clone"]') || !rows()[0].querySelector('[data-act="move"]') || !rows()[0].querySelector('[data-act="delete"]') || rows()[0].querySelector('[data-act="share"]')) fail('row actions');
if (!q('[data-page="prev"]') || !q('[data-page="next"]') || q('[data-page="first"]')) fail('pager should be Anterior / páginas / Siguiente');
if (!rows().some((r) => text(r).includes('#horario'))) fail('shortcut not shown');
log('list loads: 3 seeded snippets, counter, columns, actions, pager');

// 2) Token catalogue + resolution engine (src/tokens.js)
const contact = data.allContacts().find((c) => c.company && c.email) || data.allContacts()[0];
const first = contact.first || contact.name.split(' ')[0];
const cProps = TK.propertiesFor('contacto');
const slugs = (list) => list.map((p) => p.slug);
['nombre', 'apellidos', 'nombre_completo', 'correo', 'cargo', 'telefono', 'ciudad', 'empresa'].forEach((s) => { if (!slugs(cProps).includes(s)) fail(`contacto.${s} missing`); });
if (!cProps.some((p) => p.custom)) fail('custom contact properties must be in the catalogue');
if (!slugs(TK.propertiesFor('empresa')).includes('dominio') || !slugs(TK.propertiesFor('negocio')).includes('monto') || !slugs(TK.propertiesFor('ticket')).includes('asunto') || !slugs(TK.propertiesFor('propietario')).includes('nombre_completo')) fail('object catalogues');
if (TK.chipLabel('contacto.nombre') !== 'Nombre del contacto' || TK.chipLabel('negocio.monto') !== 'Importe del negocio' || TK.chipLabel('ticket.asunto') !== 'Nombre del ticket del ticket') fail(`chip labels: ${TK.chipLabel('contacto.nombre')} / ${TK.chipLabel('negocio.monto')} / ${TK.chipLabel('ticket.asunto')}`);
const ctx = TK.contextFromRecord('contacts', contact);
if (!ctx.contact || !ctx.owner) fail('context must carry the contact and an owner');
const rendered = TK.renderTokens('Hola {{contacto.nombre}} de {{contacto.empresa|tu empresa}} · {{contacto.no_existe|sin dato}} · {{contacto.no_existe}} · {{negocio.monto|sin negocio}} · {{propietario.nombre_completo}}', ctx);
if (!rendered.startsWith(`Hola ${first} de ${contact.company}`)) fail(`render: ${rendered}`);
if (!rendered.includes('· sin dato ·  ·')) fail(`defaults: ${rendered}`);
if (!rendered.includes(ctx.owner.name)) fail(`owner: ${rendered}`);
if (rendered.includes('{{')) fail('unresolved tokens');
const chips = TK.markersToChips('<p>Hola {{contacto.nombre|amigo}}</p>');
if (!chips.includes('class="tok"') || !chips.includes('data-default="amigo"') || !chips.includes('Nombre del contacto')) fail(`chips: ${chips}`);
if (TK.chipsToMarkers(chips) !== '<p>Hola {{contacto.nombre|amigo}}</p>') fail(`markers: ${TK.chipsToMarkers(chips)}`);
log(`tokens: catalogue with custom properties, chips ⇄ markers, resolved for ${contact.name}`);

// 3) Create: required fields, folder checkbox, Personalizar picker, shortcut validation
click(q('[data-ta="new"]'));
if (!modalOpen() || text($('snp-modal-title')) !== 'Fragmento nuevo') fail('editor did not open');
if (!text(q('.snp__intro')).startsWith('Los fragmentos te permiten crear bloques de texto reutilizables') || text(q('.snp__intro [data-se="info"]')) !== 'Más información') fail('intro text');
if ($('snp-name').placeholder !== 'Dale un nombre a tu fragmento' || $('snp-body').dataset.placeholder !== 'Agrega el contenido de tu fragmento' || $('snp-shortcut').placeholder !== 'Escribe una palabra para usarla como atajo') fail('placeholders');
if (!text(q('.snp__shortcut')).includes('#') || !text($('snp-modal-body')).includes('escribe el símbolo de numeral (#) seguido del atajo')) fail('shortcut help');
if (!$('snp-save').disabled || !$('snp-folder-wrap').hidden) fail('initial state');
input($('snp-name'), 'Bienvenida');
click(q('[data-se="personalize"]'));
if (!q('.tokpick')) fail('Personalizar did not open the picker');
click(q('.tokpick [data-pick-object="contacto"]'));
input(q('.tokpick__search'), 'correo');
click([...document.querySelectorAll('.tokpick [data-pick-prop]')].find((b) => b.dataset.pickProp === 'correo'));
input(q('.tokpick__default'), 'tu correo');
click(q('.tokpick [data-pick="insert"]'));
const chip = q('#snp-body .tok[data-token="contacto.correo"]');
if (!chip || chip.dataset.default !== 'tu correo') fail('token chip not inserted');
$('snp-body').insertAdjacentHTML('beforeend', ' Bienvenido a Megaglass.');
$('snp-body').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
click(q('[data-fmt="bold"]'));
click(q('[data-se="link"]'));
if (!$('snp-body').innerHTML.includes('megaglass.example/garantia')) fail('link not inserted');
if (!$('snp-save').disabled) fail('Save must stay disabled without a shortcut');
input($('snp-shortcut'), 'dos palabras');
if ($('snp-error').hidden || !text($('snp-error')).includes('una sola palabra') || !$('snp-save').disabled) fail('shortcut with spaces must be rejected');
input($('snp-shortcut'), 'horario');
if ($('snp-error').hidden || !text($('snp-error')).includes('Ya existe') || !$('snp-save').disabled) fail('duplicate shortcut must be rejected');
input($('snp-shortcut'), 'bienvenida');
if (!$('snp-error').hidden || $('snp-save').disabled) fail('valid shortcut must enable Save');
$('snp-folder-check').checked = true;
change($('snp-folder-check'));
if ($('snp-folder-wrap').hidden) fail('folder checkbox must reveal the selector');
change($('snp-folder'), 'Ventas');
click($('snp-save'));
if (modalOpen()) fail('editor should close after saving');
const created = S.byShortcut('bienvenida');
if (!created || created.folder !== 'Ventas' || !created.body.includes('{{contacto.correo|tu correo}}') || created.body.includes('class="tok"')) fail(`created snippet: ${JSON.stringify(created)}`);
if (text($('snp-count')) !== '4 creados' || !names().includes('Bienvenida')) fail('created snippet not listed');
if (!JSON.parse(mem['crm:snippets']).some((s) => s.id === created.id)) fail('snippet not saved in storage');
if (S.validateShortcut('ok-1') !== null || !S.validateShortcut('bienvenida') || !S.validateShortcut('con espacio') || !S.validateShortcut('')) fail('validateShortcut');
log('create: Personalizar chip with default, link, shortcut validation (spaces / duplicate), folder → saved');

// 4) Edit
click(rows().find((r) => r.dataset.id === created.id).querySelector('[data-open]'));
if (!modalOpen() || text($('snp-modal-title')) !== 'Editar fragmento' || $('snp-shortcut').value !== 'bienvenida' || !$('snp-folder-check').checked || $('snp-folder').value !== 'Ventas') fail('editor did not load the snippet');
if (!q('#snp-body .tok[data-token="contacto.correo"]')) fail('saved markers must show as chips');
input($('snp-name'), 'Bienvenida editada');
input($('snp-shortcut'), 'bienvenida2');
click($('snp-save'));
if (S.snippetById(created.id).name !== 'Bienvenida editada' || S.snippetById(created.id).shortcut !== 'bienvenida2') fail('edit not saved');
log('edit: name and shortcut changed');

// 5) Clone (unique shortcut) and 6) delete with confirmation
click(rows().find((r) => r.dataset.id === created.id).querySelector('[data-act="clone"]'));
const clone = S.snippets().find((s) => s.name === 'Bienvenida editada (copia)');
if (!clone || clone.shortcut !== 'bienvenida2-copia' || text($('snp-count')) !== '5 creados') fail('clone');
click(rows().find((r) => r.dataset.id === clone.id).querySelector('[data-act="delete"]'));
if (!modalOpen() || !text($('snp-modal-body')).includes('¿Seguro que quieres eliminar')) fail('delete confirmation missing');
click(q('[data-se="confirm-delete"]'));
if (S.snippetById(clone.id) || text($('snp-count')) !== '4 creados') fail('clone not deleted');
log('clone with "-copia" shortcut; delete with confirmation');

// 7) Folders, search, sort, multi-select, pagination
click(q('[data-ta="new-folder"]'));
input($('snf-name'), 'Marketing');
click(q('[data-se="create-folder"]'));
if (!S.folders().includes('Marketing')) fail('folder not created');
click(rows().find((r) => r.dataset.id === created.id).querySelector('[data-act="move"]'));
change($('snm-folder'), 'Marketing');
click(q('[data-se="confirm-move"]'));
if (S.snippetById(created.id).folder !== 'Marketing') fail('move failed');
click(q('#snp-folders [data-folder="Marketing"]'));
if (rows().length !== 1) fail('folder filter');
click(q('#snp-folders [data-folder="*"]'));
input($('snp-q'), 'horario');
if (rows().length !== 1 || !names()[0].includes('Horario')) fail(`search: ${names().join(' | ')}`);
input($('snp-q'), '');
change($('snp-owner'), 'Sofía R.');
if (rows().length !== 1) fail('owner filter');
change($('snp-owner'), '');
click(q('[data-sort="name"]'));
const asc = names();
if (asc.join() !== [...asc].sort((a, b) => a.localeCompare(b, 'es')).join()) fail('sort');
click(q('[data-sort="updatedAt"]'));
const box = rows().find((r) => r.dataset.id === created.id).querySelector('[data-sel]');
box.checked = true;
change(box);
if (!text($('snp-bulk')).startsWith('1 seleccionado')) fail('bulk bar');
click(q('[data-ta="bulk-delete"]'));
click(q('[data-se="confirm-delete"]'));
if (S.snippetById(created.id) || text($('snp-count')) !== '3 creados') fail('bulk delete');
for (let i = 1; i <= 12; i += 1) S.createSnippet({ name: `Masivo ${i}`, body: '<p>x</p>', shortcut: `masivo${i}` });
change($('snp-size'), '10');
if (rows().length !== 10 || q('[data-page="next"]').disabled) fail('pagination page 1');
click(q('[data-page="next"]'));
if (rows().length !== 5 || !q('[data-page="2"]').classList.contains('is-active') || !q('[data-page="next"]').disabled) fail('pagination page 2');
click(q('[data-page="prev"]'));
if (rows().length !== 10) fail('Anterior');
S.deleteSnippets(S.snippets().filter((s) => s.name.startsWith('Masivo')).map((s) => s.id));
change($('snp-size'), '25');
if (rows().length !== 3) fail('cleanup');
log('folders, move, search, owner filter, sort, multi-select, pagination Anterior/Siguiente');

// 8) "#atajo" autocomplete in the e-mail composer (rich text) + Insertar menu + tokens resolved on send
const C = await import(resolve(here, '../src/compose.js'));
const events = [];
C.openCompose({ to: contact.name, email: contact.email, firstName: first, company: contact.company, contactId: contact.id, onSent: (ev) => events.push(ev) });
const body = $('cmp-text');
body.innerHTML = '<p>Hola #gar</p>';
caretAtEnd(body);
body.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
if (!q('.snipac') || !AC.autocompleteOpen()) fail('"#gar" did not open the autocomplete');
if ([...document.querySelectorAll('.snipac [data-snip]')].map((b) => text(b.querySelector('strong'))).join() !== '#garantia') fail(`autocomplete items: ${text(q('.snipac'))}`);
key(body, 'Enter');
if (q('.snipac')) fail('autocomplete should close after choosing');
if (body.innerHTML.includes('#gar') || !body.textContent.includes(`Hola ${first}, todos nuestros vidrios templados tienen 10 años de garantía.`)) fail(`snippet not inserted/resolved: ${body.innerHTML}`);
body.innerHTML = '<p>Sin coincidencia #zzz</p>';
caretAtEnd(body);
body.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
if (q('.snipac')) fail('no snippet should match #zzz');
click(q('[data-cm="ins-snippet"]'));
if (!q('.tokpick [data-pick-snippet]')) fail('composer Insertar → Fragmento list');
input(q('.tokpick__search'), 'plazo');
click(q('.tokpick [data-pick-snippet]'));
if (!body.textContent.includes(`El plazo habitual de instalación para ${contact.company}`)) fail('composer snippet tokens not resolved');
click(q('[data-cm="ins-token"]'));
click(q('.tokpick [data-pick-object="contacto"]'));
click([...document.querySelectorAll('.tokpick [data-pick-prop]')].find((b) => b.dataset.pickProp === 'nombre'));
click(q('.tokpick [data-pick="insert"]'));
if (!body.querySelector('.tok[data-token="contacto.nombre"]')) fail('composer token chip');
input($('cmp-subject'), 'Para {{contacto.nombre_completo}}');
click(q('[data-cm="send"]'));
if (!events.length || !events[0].text.includes(`"Para ${contact.name}"`)) fail(`send did not resolve the subject: ${events.map((e) => e.text).join(' | ')}`);
log('composer: #atajo autocomplete (Enter), Insertar → Fragmento/Token, tokens resolved on send');

// 9) "#atajo" in a note textarea (timeline notes use a textarea)
const ta = document.createElement('textarea');
document.body.appendChild(ta);
AC.attachSnippetAutocomplete(ta, { context: () => TK.contextFromRecord('contacts', contact) });
ta.value = 'Nota: #pla';
ta.selectionStart = ta.value.length;
ta.selectionEnd = ta.value.length;
ta.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
if (!q('.snipac [data-snip]') || text(q('.snipac [data-snip] strong')) !== '#plazo') fail('textarea autocomplete');
click(q('.snipac [data-snip]'));
if (ta.value.includes('#pla') || !ta.value.includes(`El plazo habitual de instalación para ${contact.company}`)) fail(`textarea insert: ${ta.value}`);
key(ta, 'Escape');
log('note textarea: #plazo → plain text with the contact\'s company');

console.log('[fragmentos] OK');
process.exit(0);

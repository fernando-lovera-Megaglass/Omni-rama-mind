// DOM smoke test for Marketing › Correo: the seeded e-mails and status tabs, the table and its row actions,
// the sending-method dialog and the template picker, the drag-and-drop editor (modules, sections, inline
// editing, autosave, header fields, footer), "Vista previa y prueba", the review checklist and the simulated
// send with metrics and timeline entries, and the Analizar tab. Run: node scripts/smoke-marketing-email.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[marketing]', ...a);
const fail = (msg) => { console.error(`[marketing] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="mkt-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/marketing/email/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
globalThis.Event = dom.window.Event;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
dom.window.confirm = () => true;
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const change = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = () => [...document.querySelectorAll('#mk-rows tr[data-id]')];

const data = await import(resolve(here, '../src/data.js'));
const M = await import(resolve(here, '../src/marketing-data.js'));
const T = await import(resolve(here, '../src/marketing-templates.js'));
await M.ready;
await import(resolve(here, '../src/marketing-email.js'));

// 1) Administrar: seed, status tabs with counts, columns
const counts = M.countsByEstado();
log('seed:', M.emails().length, '| counts:', JSON.stringify(counts), '| nav:', [...document.querySelectorAll('#sidenav .sidenav__sub')].find((a) => text(a).startsWith('Correo'))?.getAttribute('href'));
if (M.emails().length !== 6 || counts.enviado !== 3 || counts.borrador !== 1 || counts.programado !== 1 || counts.archivado !== 1) fail('seeded e-mails');
const tabs = [...document.querySelectorAll('.mk-estado')].map(text);
log('tabs:', tabs.join(' | '));
if (tabs.join('|') !== 'Todos 6|Borradores 1|Programado 1|Enviados 3|Archivados 1') fail('status tabs with counts');
const heads = [...document.querySelectorAll('.mk-table thead th')].map(text).filter(Boolean).map((t) => t.replace(/\s[⇅↑↓]$/, ''));
log('columns:', heads.join(' | '));
if (heads.join('|') !== 'Nombre del correo|Entregado|Tasa de apertura|Tasa de clics|Última actualización|Última actualización por|Fecha de publicación/envío') fail('columns');
click(document.querySelector('[data-estado="enviado"]'));
const sentRow = rows().find((r) => /Boletín de noviembre/.test(text(r)));
log('Enviados rows:', rows().length, '| boletín row:', [...sentRow.querySelectorAll('td')].slice(1, 4).map(text).join(' / '));
if (rows().length !== 3 || text(sentRow.querySelectorAll('td')[1]) !== '407' || text(sentRow.querySelectorAll('td')[2]) !== '27,5 %' || text(sentRow.querySelectorAll('td')[3]) !== '2,2 %') fail('sent rows and rates');
const actions = [...sentRow.querySelectorAll('.mk-rowactions button, .mk-rowactions .menu__item')].map(text);
log('row actions:', actions.join(' | '));
if (!actions.includes('Editar') || !actions.includes('Clonar') || !actions.includes('Archivar') || !actions.includes('Eliminar') || !actions.includes('Exportar')) fail('row actions');
click(document.querySelector('[data-estado="all"]'));
change($('mk-tipo'), 'automatizado');
log('tipo filter:', rows().length, '| folder options:', [...$('mk-folder').options].map((o) => o.value).filter(Boolean).join(','));
if (rows().length !== 1 || ![...$('mk-folder').options].some((o) => o.value === 'Boletines')) fail('type and folder filters');
change($('mk-tipo'), '');
// clone + archive + delete
const before = M.emails().length;
click(rows()[0].querySelector('[data-mk="clone"]'));
log('after clone:', M.emails().length, '|', M.emails()[0].nombre, '| estado:', M.emails()[0].estado);
if (M.emails().length !== before + 1 || !/\(copia\)$/.test(M.emails()[0].nombre) || M.emails()[0].estado !== 'borrador') fail('clone');
const cloneId = M.emails()[0].id;
click(document.querySelector(`tr[data-id="${cloneId}"] [data-mk="archive"]`));
if (M.emailById(cloneId).estado !== 'archivado') fail('archive');
click(document.querySelector('[data-estado="archivado"]'));
click(document.querySelector(`tr[data-id="${cloneId}"] [data-mk="archive"]`));
if (M.emailById(cloneId).estado !== 'borrador') fail('unarchive restores the previous state');
click(document.querySelector('[data-estado="all"]'));
click(document.querySelector(`tr[data-id="${cloneId}"] [data-mk="delete"]`));
log('after delete:', M.emails().length);
if (M.emails().length !== before) fail('delete');

// 2) Crear correo → método de envío → plantillas
click(document.querySelector('[data-mk="create"]'));
const methods = [...document.querySelectorAll('#mk-modal .mk-method strong')].map(text);
log('method dialog:', text($('mk-modal-title')), '|', methods.join(' / '));
if (text($('mk-modal-title')) !== 'Método de envío' || methods.join('/') !== 'Normal/Automatizado/Blog') fail('sending method dialog');
click(document.querySelector('[data-mk="method-continue"]'));
const cats = [...document.querySelectorAll('.mk-tpl__cat')].map((b) => text(b).replace(/\s\d+$/, ''));
const cards = () => [...document.querySelectorAll('.mk-tpl__card')];
log('templates:', text(document.querySelector('h1')), '| categories:', cats.join(', '), '| cards:', cards().length, '| blank:', Boolean(document.querySelector('[data-mk="blank"]')));
if (text(document.querySelector('h1')) !== 'Seleccionar plantilla' || !cats.includes('Boletín informativo') || !cats.includes('Texto sin formato') || cards().length < 6 + 6 || !document.querySelector('[data-mk="blank"]')) fail('template picker');
if (T.TEMPLATES.length < 5 || !T.TEMPLATES.every((t) => t.categoria && t.modules().length)) fail('base templates');
click(document.querySelector('.mk-tpl__cat[data-cat="Evento"]'));
log('Evento cards:', cards().map((c) => text(c.querySelector('h3'))).join(' | '));
if (cards().length !== 1 || text(cards()[0].querySelector('h3')) !== 'Invitación a evento') fail('category filter');
click(cards()[0].querySelector('[data-mk="tpl-preview"]'));
const previewDoc = $('mk-modal').querySelector('iframe.mk-preview')?.getAttribute('srcdoc') || '';
log('preview iframe:', /MEGAGLASS/.test(previewDoc), /Reservar plaza/.test(previewDoc), /Darme de baja/.test(previewDoc));
if (!/MEGAGLASS/.test(previewDoc) || !/Reservar plaza/.test(previewDoc) || !/Darme de baja/.test(previewDoc)) fail('template preview renders brand, modules and footer');
click($('mk-modal').querySelector('[data-bm="close"]'));
input($('tpl-q'), 'boletín');
click(document.querySelector('.mk-tpl__cat[data-cat=""]'));
input($('tpl-q'), 'boletín mensual');
click(cards()[0].querySelector('[data-mk="tpl-use"]'));

// 3) the editor
const current = () => M.emailById(new URLSearchParams(location.search).get('id'));
log('editor:', Boolean(document.querySelector('.mk-editor')), '| name:', $('mk-name').value, '| modules:', current().contenido.length, '| palette:', [...document.querySelectorAll('.mk-mod')].map(text).join(', '));
if (!document.querySelector('.mk-editor') || current().plantilla !== 'newsletter' || current().contenido.length !== 6) fail('editor opens with the template content');
const palette = [...document.querySelectorAll('.mk-mod')].map(text);
if (palette.join('|') !== '¶Texto|▭Botón|◎Redes sociales|<>HTML|▣Imagen|▶Video|—Divisor') fail('module palette (Base / Medios / Estructura)');
log('header fields:', Boolean($('mk-to')), Boolean($('mk-from-name')), Boolean($('mk-from-email')), Boolean($('mk-subject')), '| zones:', document.querySelectorAll('.mz').length, '| footer:', text(document.querySelector('.mk-canvas__footer')).slice(0, 40));
if (!$('mk-to') || document.querySelectorAll('.mz').length !== 7 || !/Darme de baja/.test(text(document.querySelector('.mk-canvas__footer')))) fail('header fields, drop zones and automatic footer');
// drop a button module into the first zone (drag & drop)
const dt = { data: {}, setData(k, v) { this.data[k] = v; }, getData(k) { return this.data[k]; }, effectAllowed: '' };
const ev = (type, target) => { const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); target.dispatchEvent(e); };
ev('dragstart', document.querySelector('.mk-mod[data-mod="button"]'));
ev('dragover', document.querySelector('.mz[data-index="0"]'));
ev('drop', document.querySelector('.mz[data-index="0"]'));
log('after drop:', current().contenido[0].type, '| editing opened:', document.querySelector('.mk-module.is-editing')?.dataset.mid === current().contenido[0].id);
if (current().contenido[0].type !== 'button' || current().contenido.length !== 7 || !document.querySelector('.mk-module.is-editing')) fail('dropping a module inserts it at the zone and opens its inline editor');
// inline edit of the button
input(document.querySelector('.mk-module.is-editing [data-prop="label"]'), 'Ver el catálogo 2027');
log('inline edit:', current().contenido[0].props.label, '| view updated:', /Ver el catálogo 2027/.test(document.querySelector('.mk-module.is-editing .mk-module__view').innerHTML));
if (current().contenido[0].props.label !== 'Ver el catálogo 2027') fail('inline edit saves the property');
click(document.querySelector('[data-mk="done"]'));
if (document.querySelector('.mk-module.is-editing')) fail('Listo closes the editor');
// click a palette item appends; sections tab; move / delete
click(document.querySelector('.mk-mod[data-mod="divider"]'));
if (current().contenido[current().contenido.length - 1].type !== 'divider') fail('click on a module appends it');
click(document.querySelector('[data-addtab="sections"]'));
log('sections:', [...document.querySelectorAll('.mk-mod[data-section]')].map(text).join(' | '));
if (document.querySelectorAll('.mk-mod[data-section]').length < 3) fail('sections tab');
click(document.querySelector('.mk-mod[data-section="text-button"]'));
if (current().contenido.length !== 10) fail('a section adds its modules');
const firstId = current().contenido[0].id;
click(document.querySelector(`.mk-module[data-mid="${firstId}"] [data-mv="1"]`));
if (current().contenido[1].id !== firstId) fail('move down');
click(document.querySelector(`.mk-module[data-mid="${firstId}"] [data-del]`));
if (current().contenido.some((m) => m.id === firstId) || current().contenido.length !== 9) fail('delete module');
// header fields autosave
input($('mk-name'), 'Boletín de prueba automatizada');
input($('mk-subject'), 'Asunto de prueba');
change($('mk-from-email'), 'boletin@megaglass.us');
await wait(900);
log('autosaved:', current().nombre, '|', current().asunto, '|', current().deEmail, '| status:', text($('mk-savestatus')));
if (current().nombre !== 'Boletín de prueba automatizada' || current().asunto !== 'Asunto de prueba' || current().deEmail !== 'boletin@megaglass.us' || !/^Guardado/.test(text($('mk-savestatus')))) fail('autosave');
if (!/Boletín de prueba automatizada/.test(JSON.parse(mem['crm:marketing_emails'])[0].nombre)) fail('persisted');
// preview and test send
click(document.querySelector('[data-mk="preview"]'));
log('preview:', Boolean($('mk-modal').querySelector('iframe.mk-preview')), '| test form:', Boolean($('mk-test')));
$('mk-test').elements.to.value = 'prueba@megaglass.us';
$('mk-test').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
log('test send toast:', text($('toast')));
if (!/prueba enviado a prueba@megaglass.us/.test(text($('toast')))) fail('test send');
click($('mk-modal').querySelector('[data-bm="close"]'));

// 4) Revisar y enviar
click(document.querySelector('[data-mk="review"]'));
const checks = [...document.querySelectorAll('.mk-check__item')].map((li) => `${li.classList.contains('is-ok') ? 'ok' : 'bad'}:${text(li.querySelector('strong'))}`);
log('checklist:', checks.join(' | '), '| send enabled:', !document.querySelector('[data-mk="send"]').disabled);
if (checks.join('|') !== 'ok:Destinatarios|ok:Asunto|ok:Remitente|ok:Contenido' || document.querySelector('[data-mk="send"]').disabled) fail('checklist');
const n = M.recipientsOf(current()).length;
const someContact = M.recipientsOf(current())[0];
const actsBefore = data.activitiesFor('contacts', someContact.id).length;
const id = current().id;
click(document.querySelector('[data-mk="send"]'));
const sent = M.emailById(id);
log('sent:', sent.estado, '| enviados:', sent.enviados, 'of', n, '| entregados:', sent.entregados, '| aperturas:', sent.aperturas, '| clics:', sent.clics, '| toast:', text($('toast')), '| view:', new URLSearchParams(location.search).get('view'), new URLSearchParams(location.search).get('estado'));
if (sent.estado !== 'enviado' || sent.enviados !== n || sent.entregados < Math.floor(n * 0.96) || sent.entregados > n || sent.aperturas < Math.floor(sent.entregados * 0.1) || sent.aperturas > Math.ceil(sent.entregados * 0.35) || sent.clics > Math.ceil(sent.entregados * 0.04)) fail('simulated send and metrics');
const act = data.activitiesFor('contacts', someContact.id)[0];
log('contact timeline:', act.type, '|', act.text, '|', act.who);
if (data.activitiesFor('contacts', someContact.id).length !== actsBefore + 1 || act.type !== 'email' || act.text !== 'Correo de marketing: Boletín de prueba automatizada') fail('every recipient gets the activity');
if (!document.querySelector('.mk-estado[data-estado="enviado"].is-active')) fail('back on the Enviados tab');
// schedule another one
const sched = M.createEmail({ nombre: 'Programado de prueba', asunto: 'Asunto', plantilla: 'promo' });
const later = M.sendEmail(sched.id, { at: new Date(Date.now() + 86400000).toISOString() });
log('scheduled:', later.estado, '|', later.programadoPara && later.programadoPara.slice(0, 10));
if (later.estado !== 'programado' || !later.programadoPara) fail('schedule');
const bad = M.createEmail({ nombre: 'Sin asunto', asunto: '', plantilla: 'plain' });
if (M.sendEmail(bad.id)) fail('an incomplete e-mail cannot be sent');

// 5) Analizar
click(document.querySelector('[data-view="analyze"]'));
const a = M.analytics();
const kpis = [...document.querySelectorAll('.kpi')].map((k) => `${text(k.querySelector('.kpi__label'))}=${text(k.querySelector('.kpi__value'))}`);
log('analyze:', kpis.join(' | '), '| bars:', document.querySelectorAll('#mk-bars li').length, '(3 enviados + 1 archivado enviado + el de la prueba) | totals:', a.enviados, a.tasaEntrega, a.tasaApertura, a.tasaClics);
if (kpis.length !== 4 || !/Correos enviados=/.test(kpis[0]) || document.querySelectorAll('#mk-bars li').length !== a.sent.length || a.sent.length !== 5) fail('Analizar cards and chart');
if (!document.querySelector('.mk-bars__bar[style*="width:100%"]')) fail('the biggest bar fills the track');
log('OK');
process.exit(0);

// DOM smoke test for the "Crear contacto" slide-over of the Contactos list: opens without leaving the page,
// fields in the original's order, Crear / Crear y agregar otro disabled until Nombre and Apellidos are
// filled, duplicate hints while typing (debounced), the e-mail duplicate warning on save, "Crear y agregar
// otro" keeps the panel open, Cancelar / Escape close, and the list refreshes. Run: node scripts/smoke-create-contact.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[create-contact]', ...a);
const fail = (msg) => { console.error(`[create-contact] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.FormData = dom.window.FormData;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
globalThis.URL = dom.window.URL;
globalThis.Blob = dom.window.Blob;
dom.window.confirm = () => true;

const data = await import(resolve(here, '../src/data.js'));
const C = await import(resolve(here, '../src/contacts.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const type = (name, value) => { const el = $('cc-form').elements[name]; el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = () => $('cc-panel');
const total = () => Number($('total-pill').textContent.split(' ')[0]);
const dupsText = () => $('cc-dups').textContent.replace(/\s+/g, ' ').trim();

// 1) the header button opens the panel without navigating
const addBtn = document.querySelector('.page-head__actions [data-action="create"]');
log('add button:', addBtn?.textContent.trim(), '| is a menu?', Boolean(addBtn?.closest('.menu')), '| panel hidden before:', panel().getAttribute('aria-hidden'));
if (!addBtn || addBtn.closest('.menu')) fail('"Agregar contactos" must open the panel directly');
const before = total();
click(addBtn);
log('after click: open?', panel().classList.contains('is-open'), '| location:', location.pathname, '| title:', $('cc-title').textContent);
if (!panel().classList.contains('is-open') || location.pathname !== '/contacts/' || panel().getAttribute('aria-hidden') !== 'false') fail('panel should open in place');
// 2) fields in order, required marks, owner default
const names = [...$('cc-form').querySelectorAll('[name]')].map((e) => e.name);
log('fields:', names.join(', '));
if (names.join(',') !== 'email,first,last,jobTitle,owner,state,country,phone,mobilephone,hs_buying_role') fail('field order');
const labelOf = (n) => $('cc-form').elements[n].closest('label').querySelector('span').textContent.trim();
log('labels:', ['email', 'first', 'last', 'owner', 'state', 'country', 'hs_buying_role'].map(labelOf).join(' | '), '| email type:', $('cc-form').elements.email.type);
if (labelOf('first') !== 'Nombre *' || labelOf('last') !== 'Apellidos *' || $('cc-form').elements.email.type !== 'email') fail('required marks / e-mail type');
log('owner options:', [...$('cc-form').elements.owner.options].map((o) => o.value).join(', '), '| default:', $('cc-form').elements.owner.value, '| roles:', [...$('cc-form').elements.hs_buying_role.options].map((o) => o.textContent).join(', '));
if ($('cc-form').elements.owner.value !== 'Fernando L.') fail('owner should default to the current user (first owner without session)');
if ([...$('cc-form').elements.hs_buying_role.options].map((o) => o.textContent).slice(1).join(',') !== 'Persona que toma la decisión,Influenciador,Usuario final,Otro') fail('buying roles');
// 3) buttons disabled until Nombre and Apellidos
log('buttons disabled at start:', $('cc-create').disabled, $('cc-create-another').disabled, '| hint:', dupsText());
if (!$('cc-create').disabled || !$('cc-create-another').disabled || dupsText() !== 'Comienza por escribir el nombre del Contacto, su correo o ambos.') fail('initial state');
type('first', 'Ana');
if (!$('cc-create').disabled) fail('still disabled with only Nombre');
type('last', 'Ruiz');
log('after Nombre+Apellidos: disabled?', $('cc-create').disabled, $('cc-create-another').disabled);
if ($('cc-create').disabled || $('cc-create-another').disabled) fail('buttons should enable');
// 4) duplicates while typing (debounced)
await wait(100);
if (!/Comienza por escribir/.test(dupsText())) fail('no search before the debounce');
await wait(300);
const items = [...document.querySelectorAll('#cc-dups li')];
log('duplicates for "Ana Ruiz":', items.length, '|', items.slice(0, 2).map((li) => li.textContent.replace(/\s+/g, ' ').trim()).join(' | '), '| link:', items[0]?.querySelector('a')?.getAttribute('href'));
if (!/Posibles duplicados/.test(dupsText()) || !items.length || items.length > 5 || !/record\/\?id=/.test(items[0].querySelector('a').getAttribute('href'))) fail('duplicate hints');
type('first', 'Zzyx');
type('last', 'Noexiste');
await wait(350);
log('no matches →', dupsText());
if (!/No se han encontrado/.test(dupsText())) fail('no-match message');
// 5) Crear y agregar otro: saves, clears, keeps the panel open
type('first', 'Prueba');
type('last', 'Panel');
type('email', 'prueba.panel@ejemplo.com');
type('hs_buying_role', 'Influenciador');
click($('cc-create-another'));
await wait(20);
const made = data.allContacts().find((c) => c.email === 'prueba.panel@ejemplo.com');
log('after "Crear y agregar otro": record', made && `${made.name} · ${made.owner} · ${made.hs_buying_role} · ${made.source}`, '| panel open?', panel().classList.contains('is-open'), '| first cleared?', $('cc-form').elements.first.value === '', '| toast:', $('toast')?.textContent, '| total:', total(), '(was', before + ')');
if (!made || made.name !== 'Prueba Panel' || made.owner !== 'Fernando L.' || made.hs_buying_role !== 'Influenciador' || !panel().classList.contains('is-open') || $('cc-form').elements.first.value !== '' || !$('cc-create').disabled || $('toast')?.textContent !== 'Contacto creado' || total() !== before + 1) fail('create and add another');
// 6) exact e-mail duplicate on save: warning with a link to the existing contact, nothing saved
type('first', 'Otra');
type('last', 'Persona');
type('email', 'Prueba.Panel@ejemplo.com');
$('cc-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(20);
log('duplicate e-mail →', dupsText().slice(0, 110), '| link:', $('cc-dups').querySelector('a')?.getAttribute('href'), '| total:', total());
if (!/Ya existe un contacto con ese correo/.test(dupsText()) || $('cc-dups').querySelector('a').getAttribute('href') !== `./record/?id=${made.id}` || total() !== before + 1 || !panel().classList.contains('is-open')) fail('e-mail duplicate warning');
click(document.querySelector('[data-cc="fix-email"]'));
type('email', 'otra.persona@ejemplo.com');
$('cc-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(20);
log('after Crear: panel open?', panel().classList.contains('is-open'), '| total:', total(), '| saved:', Boolean(data.allContacts().find((c) => c.email === 'otra.persona@ejemplo.com')));
if (panel().classList.contains('is-open') || total() !== before + 2) fail('Crear should save and close');
// 7) Cancelar and Escape close without saving
click(addBtn);
type('first', 'Nadie');
click(document.querySelector('#cc-panel .slideover__foot [data-cc="cancel"]'));
if (panel().classList.contains('is-open') || $('cc-form').elements.first.value) fail('Cancelar should close and clear');
click(addBtn);
document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
log('Escape closes:', !panel().classList.contains('is-open'), '| total unchanged:', total() === before + 2);
if (panel().classList.contains('is-open') || total() !== before + 2) fail('Escape should close');
// 8) the X button
click(addBtn);
click(document.querySelector('#cc-panel .slideover__close'));
if (panel().classList.contains('is-open')) fail('X should close');
console.log('[create-contact] OK');

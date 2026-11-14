// DOM smoke test for the "Acciones" menu of the Contactos / Empresas lists: Exportar (CSV of the filtered
// view), Gestionar duplicados (groups by e-mail / name, merge keeping the chosen record), Restaurar registros
// eliminados (soft-delete trash with Restaurar), Editar propiedades en lote (selection) and Corregir
// problemas de formato (names in title case, phones in one format). Run: node scripts/smoke-actions-menu.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[actions-menu]', ...a);
const fail = (msg) => { console.error(`[actions-menu] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const boot = (url) => {
  const dom = new JSDOM(LIST, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  return dom;
};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
let dom = boot('http://localhost/contacts/');
const $ = (id) => document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const menuItems = () => [...document.querySelectorAll('#actions-menu .menu__item')].map(text);
const drawer = () => $('actions-drawer');
const total = () => Number($('total-pill').textContent.split(' ')[0]);

const data = await import(resolve(here, '../src/data.js'));
const Dup = await import(resolve(here, '../src/duplicates.js'));
const C = await import(resolve(here, '../src/contacts.js'));
click(document.querySelector('button.views__tab[data-view="std:all"]'));

// 1) the menu next to "Agregar"
log('menu:', menuItems().join(' | '));
if (menuItems().slice(0, 5).join('|') !== 'Exportar|Gestionar duplicados|Restaurar registros eliminados|Editar propiedades en lote|Corregir problemas de formato') fail('menu options');
const head = document.querySelector('.page-head__actions');
log('order: Acciones before Agregar:', head.querySelector('#actions-menu') && head.querySelector('#actions-menu').nextElementSibling === head.querySelector('[data-action="create"]'));
if (!head.querySelector('#actions-menu') || head.querySelector('#actions-menu').nextElementSibling !== head.querySelector('[data-action="create"]')) fail('Acciones sits next to Agregar');

// 2) Exportar: the current view with its filters
let downloaded = null;
dom.window.URL.createObjectURL = () => 'blob:x';
dom.window.URL.revokeObjectURL = () => {};
const origCreate = document.createElement.bind(document);
document.createElement = (tag) => { const el = origCreate(tag); if (tag === 'a') { el.click = () => { downloaded = el.download; }; } return el; };
click(document.querySelector('.menu__item[data-filter="owner"][data-value]:not([data-value=""])'));
const filteredN = total();
click(document.querySelector('#actions-menu [data-action="export"]'));
log('export:', downloaded, '| toast:', text($('toast')), '| filtered rows:', filteredN);
if (!downloaded || !/contacts-.*\.csv$/.test(downloaded) || !text($('toast')).startsWith(`${filteredN} registro`)) fail('Exportar should download the filtered view');
document.createElement = origCreate;
click(document.querySelector('.menu__item[data-filter="owner"][data-value=""]'));

// 3) Gestionar duplicados: two contacts with the same e-mail (and one by name) → one group; merge keeps the chosen one
const base = data.allContacts()[0];
const dupA = data.addRecord('contacts', { first: 'Clon', last: 'Correo', name: 'Clon Correo', email: base.email.toUpperCase(), phone: '', owner: 'Sin asignar', status: 'new', lifecycle: 'Lead', jobTitle: 'Compras', created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
const dupB = data.addRecord('contacts', { first: base.first.toLowerCase(), last: base.last.toUpperCase(), name: `${base.first.toLowerCase()} ${base.last.toUpperCase()}`, email: '', phone: '55 1234 5678', owner: 'Sin asignar', status: 'new', lifecycle: 'Lead', created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
const deal = data.addRecord('deals', { name: 'Negocio del clon', amount: 100, stage: 'oferta', pipeline: 'FUERZA DE VENTAS', contactId: dupA.id, owner: 'Fernando L.', closeDate: data.TODAY.toISOString(), created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
const groups = Dup.findDuplicateGroups('contacts', data.allContacts());
const grp = groups.find((g) => g.records.some((r) => r.id === base.id));
log('duplicate groups:', groups.length, '| group of the base contact:', grp && grp.records.map((r) => r.id).join(','), '| keys:', grp && grp.keys.join('+'));
if (!grp || grp.records.length < 3 || !grp.records.some((r) => r.id === dupA.id) || !grp.records.some((r) => r.id === dupB.id) || !grp.keys.includes('email') || !grp.keys.includes('name')) fail('e-mail and name duplicates should form one group');
click(document.querySelector('#actions-menu [data-action="dupes"]'));
log('drawer:', text($('actions-title')), '| open:', drawer().classList.contains('is-open'), '| groups shown:', drawer().querySelectorAll('[data-dupe-group]').length, '| suggested keep:', drawer().querySelector('[data-dupe-group] input:checked')?.value);
if (!drawer().classList.contains('is-open') || !drawer().querySelectorAll('[data-dupe-group]').length) fail('the duplicates view should list the groups');
const section = [...drawer().querySelectorAll('[data-dupe-group]')].find((s) => s.querySelector(`tr[data-id="${base.id}"]`));
section.querySelector(`input[value="${base.id}"]`).checked = true;
C.list.render(); // the table did not know about the two new records yet
const before = total();
const gsize = section.querySelectorAll('tbody tr[data-id]').length;
click(section.querySelector('[data-dupe-merge]'));
await wait(5);
const kept = data.allContacts().find((c) => c.id === base.id);
log('after merge: toast:', text($('toast')), '| contacts:', before, '->', total(), '| kept jobTitle:', kept.jobTitle, '| deal now points to:', data.allDeals().find((d) => d.id === deal.id).contactId, '| clones gone:', !data.allContacts().some((c) => c.id === dupA.id || c.id === dupB.id));
if (total() !== before - (gsize - 1) || data.allContacts().some((c) => c.id === dupA.id) || Number(data.allDeals().find((d) => d.id === deal.id).contactId) !== Number(base.id)) fail('merge should keep the chosen record, re-point associations and remove the others');
if (kept.jobTitle !== (base.jobTitle || 'Compras')) fail('empty properties of the kept record are filled from the merged ones');
const note = data.activitiesFor('contacts', base.id)[0];
log('timeline:', note && note.text);
if (!note || !/fusionados/.test(note.text)) fail('the merge should be logged');

// 4) Restaurar registros eliminados: the merged ones are in the trash; restore one
click(drawer().querySelector('[data-close]'));
click(document.querySelector('#actions-menu [data-action="trash"]'));
const trashRows = [...drawer().querySelectorAll('.trash__table tr[data-id]')].map((tr) => Number(tr.dataset.id));
log('trash:', text($('actions-title')), '| rows:', trashRows.join(','), '| has dates:', [...drawer().querySelectorAll('.trash__table tr[data-id] td:nth-child(4)')].every((td) => text(td) !== '--'));
if (!trashRows.includes(dupA.id) || !trashRows.includes(dupB.id)) fail('merged records should be in the trash');
click(drawer().querySelector(`[data-trash-restore="${dupB.id}"]`));
log('after restore:', text($('toast')), '| back in the list:', data.allContacts().some((c) => c.id === dupB.id), '| trash rows:', drawer().querySelectorAll('.trash__table tr[data-id]').length, '| total:', total());
if (!data.allContacts().some((c) => c.id === dupB.id) || drawer().querySelectorAll('.trash__table tr[data-id]').length !== trashRows.length - 1) fail('Restaurar should bring the record back');
click(drawer().querySelector('[data-trash-restore-all]'));
if (!data.allContacts().some((c) => c.id === dupA.id) || !/vacía/.test(text($('actions-body')))) fail('Restaurar todos should empty the trash');
click(drawer().querySelector('[data-close]'));
data.deleteRecords('contacts', [dupA.id, dupB.id]);

// 5) Editar propiedades en lote: needs a selection, then the bulk edit dialog
click(document.querySelector('#actions-menu [data-action="bulk-edit-menu"]'));
log('without selection:', text($('toast')));
if (!/Selecciona/.test(text($('toast')))) fail('bulk edit asks for a selection');
C.list.state.size = 500;
C.list.render();
const pick = (id) => { const cb = document.querySelector(`#rows tr[data-id="${id}"] .row-check`); cb.checked = true; cb.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
pick(base.id);
pick(data.allContacts()[1].id);
click(document.querySelector('#actions-menu [data-action="bulk-edit-menu"]'));
log('bulk edit dialog:', text($('bulk-modal-title')), '| open:', $('bulk-modal').classList.contains('is-open'));
if (!$('bulk-modal').classList.contains('is-open') || !/Editar 2/.test(text($('bulk-modal-title')))) fail('the bulk edit dialog should open for the selection');
click($('bulk-modal').querySelector('[data-bm="close"]'));

// 6) Corregir problemas de formato on the selection
const messy = data.addRecord('contacts', { first: 'MARÍA JOSÉ', last: 'de la torre', name: 'MARÍA JOSÉ de la torre', email: 'mj@ejemplo.com', phone: '(55) 1234-5678', mobilephone: '+34 600 11 22 33', owner: 'Sin asignar', status: 'new', lifecycle: 'Lead', created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
const fixes = Dup.formatFixes('contacts', messy);
log('fixes:', fixes.map((f) => `${f.key}: ${f.from} → ${f.to}`).join(' | '));
if (fixes.find((f) => f.key === 'first').to !== 'María José' || fixes.find((f) => f.key === 'last').to !== 'De la Torre' || fixes.find((f) => f.key === 'phone').to !== '+525512345678' || fixes.find((f) => f.key === 'mobilephone').to !== '+34600112233') fail('format fixes');
log('company names:', Dup.fixCompanyName('cristales del norte s.a. de c.v.'), '|', Dup.fixCompanyName('VIDRIOS DELTA'), '|', Dup.fixCompanyName('Hogar Sol S.L.'));
if (Dup.fixCompanyName('cristales del norte s.a. de c.v.') !== 'Cristales del Norte s.a. de c.v.' || Dup.fixCompanyName('Hogar Sol S.L.') !== 'Hogar Sol S.L.') fail('company name fix');
C.list.state.selected.clear();
C.list.render();
pick(messy.id);
click(document.querySelector('#actions-menu [data-action="fix-format"]'));
log('format dialog:', text($('bulk-modal-title')), '|', text($('bulk-form')).slice(0, 120));
if (!/Corregir problemas de formato/.test(text($('bulk-modal-title'))) || !/3 nombres/.test(text($('bulk-form'))) || !/2 teléfonos/.test(text($('bulk-form')))) fail('the dialog should count the fixes');
$('bulk-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const fixed = data.allContacts().find((c) => c.id === messy.id);
log('after fix:', fixed.name, '|', fixed.phone, '|', fixed.mobilephone, '| toast:', text($('toast')));
if (fixed.name !== 'María José De la Torre' || fixed.phone !== '+525512345678' || fixed.mobilephone !== '+34600112233') fail('fixes should be applied');

// 7) the Empresas list has the same menu; duplicates there group by domain
dom = boot('http://localhost/companies/');
await import(resolve(here, '../src/companies.js'));
log('companies menu:', menuItems().slice(0, 5).join(' | '));
if (menuItems().slice(0, 5).join('|') !== 'Exportar|Gestionar duplicados|Restaurar registros eliminados|Editar propiedades en lote|Corregir problemas de formato') fail('companies menu');
const c0 = data.allCompanies()[0];
const cdup = data.addRecord('companies', { name: `${c0.name} (dup)`, domain: `www.${c0.domain}`, owner: 'Sin asignar', lifecycle: 'Lead', created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
const cg = Dup.findDuplicateGroups('companies', data.allCompanies()).find((g) => g.records.some((r) => r.id === cdup.id));
log('company duplicate group:', cg && cg.records.map((r) => r.id).join(','), '| keys:', cg && cg.keys.join(','));
if (!cg || !cg.keys.includes('domain') || !cg.records.some((r) => r.id === c0.id)) fail('companies group by domain');
const res = data.mergeRecords('companies', c0.id, [cdup.id]);
log('company merge:', res && res.merged, '| trash:', data.trashedRecords('companies').map((r) => r.id).join(','));
if (!res || !data.trashedRecords('companies').some((r) => r.id === cdup.id) || data.allCompanies().some((r) => r.id === cdup.id)) fail('company merge should send the duplicate to the trash');
log('OK');
process.exit(0);

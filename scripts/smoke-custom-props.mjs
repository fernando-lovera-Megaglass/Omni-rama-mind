// DOM smoke test for the custom properties kept in Supabase (custom_properties): the real Megaglass contact
// properties loaded from table rows join the catalog (record page "Información avanzada", list column
// editor, advanced filters, "Crear contacto" for the ones flagged in_form), never get sample values, and
// changes from Configuración go through the registered writer. Run: node scripts/smoke-custom-props.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[custom-props]', ...a);
const fail = (msg) => { console.error(`[custom-props] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const LIST = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>';
const boot = (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  return dom;
};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
let dom = boot('http://localhost/contacts/', LIST);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };

// The rows of supabase/custom-properties.sql, as the table returns them.
const GROUP = 'Información de Megaglass';
const SEED = [
  ['asesor_de_ventas', 'Asesor de ventas', 'text', true], ['nombre_del_proyecto', 'Nombre del proyecto', 'text', true], ['nombre_a_quien_factura', 'Nombre a quien factura', 'text', false],
  ['notas_sobre_el_contacto', 'Notas sobre el contacto', 'text', false], ['numero_de_telefono_2', 'Número de teléfono 2', 'text', false], ['numero_de_telefono_alternativo', 'Número de teléfono alternativo', 'text', false],
  ['cell_phone', 'Cell phone', 'text', true], ['latitud', 'Latitud', 'number', false], ['longitud', 'Longitud', 'number', false], ['mapsly', 'Mapsly', 'text', false], ['destino', 'Destino', 'text', false],
  ['origen', 'Origen', 'text', false], ['calificar_experiencia', 'Calificar experiencia', 'text', false], ['contacto_directo_de_inforte', 'Contacto directo de Inforte', 'text', false],
  ['independent_sales_rep', 'Independent sales rep', 'text', false], ['material_corresponde_a_cotizacion', 'Material corresponde a cotización', 'text', false], ['en_que_te_podemos_ayudar', '¿En qué te podemos ayudar?', 'text', false],
  ['adjunto', 'Adjunto', 'text', false], ['files', 'Files', 'text', false],
];
const rows = SEED.map(([name, label, type, in_form], i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, objeto: 'contact', name, label, type, options: [], group_name: GROUP, description: '', in_form, archived: false, created_at: '2026-11-13T00:00:00Z' }));
rows.push({ id: 'ticket-1', objeto: 'ticket', name: 'portal_url', label: 'URL del portal', type: 'url', options: [], group_name: 'Información del ticket', description: '', in_form: false, archived: false });
// a stale localStorage property that would have been migrated already
mem['crm:customprops:tasks'] = JSON.stringify([{ key: 'custom_turno', label: 'Turno', kind: 'enum', options: ['Mañana', 'Tarde'], group: 'Propiedades personalizadas' }]);

const P = await import(resolve(here, '../src/properties.js'));
const written = [];
P.loadCustomProperties(rows);
P.setCustomPropertyWriter((type, list) => { written.push([type, list]); return Promise.resolve(); });
const data = await import(resolve(here, '../src/data.js'));

// 1) the catalog: a group of 19 contact properties, number for latitud/longitud, flagged as custom
const groups = P.propertyGroups('contacts');
const grp = groups.find((g) => g.title === GROUP);
log('live:', P.customPropertiesLive(), '| group:', grp && grp.title, '| items:', grp && grp.items.length, '| kinds:', grp && [...new Set(grp.items.map((i) => i[2]))].join(','));
if (!P.customPropertiesLive() || !grp || grp.items.length !== 19 || grp.items.find((i) => i[0] === 'latitud')[2] !== 'number' || grp.items.find((i) => i[0] === 'mapsly')[2] !== 'text') fail('seeded contact properties should join the catalog');
const list = P.propertyList('contacts');
if (!list.find((p) => p.key === 'asesor_de_ventas').custom || list.find((p) => p.key === 'email').custom) fail('custom flag');
log('ticket custom prop:', P.propertyMap('tickets').portal_url?.label, '| tasks fall back to localStorage:', P.customProperties('tasks').map((p) => p.key).join(','));
if (P.propertyMap('tickets').portal_url?.label !== 'URL del portal' || P.customProperties('tasks')[0]?.key !== 'custom_turno') fail('other objects');
// 2) no sample decoration: records only show real values
const c1 = data.allContacts()[0];
log('sample decoration skipped:', c1.asesor_de_ventas === undefined, c1.latitud === undefined, '| catalogue prop still decorated:', c1.hs_buying_role !== undefined);
if (c1.asesor_de_ventas !== undefined || c1.latitud !== undefined) fail('custom properties must not get sample values');
data.setField('contacts', c1.id, 'asesor_de_ventas', 'Sofía R.');
data.setField('contacts', c1.id, 'latitud', 19.4326);
// 3) the list: column editor offers them; the advanced-filter popover lists them
await import(resolve(here, '../src/contacts.js'));
click(document.querySelector('[data-action="columns"]'));
const colOpts = [...document.querySelectorAll('#col-groups input[data-key]')].map((e) => e.dataset.key);
log('column editor has custom props:', colOpts.includes('asesor_de_ventas'), colOpts.includes('latitud'), '| total options:', colOpts.length);
if (!colOpts.includes('asesor_de_ventas') || !colOpts.includes('latitud')) fail('the column editor should offer the custom properties');
const grpTitles = [...document.querySelectorAll('#col-groups .colgrp__head')].map((h) => h.dataset.group);
log('column editor groups include the Megaglass group:', grpTitles.includes(GROUP));
if (!grpTitles.includes(GROUP)) fail('the column editor should group them under the Megaglass group');
// pick the custom column and check the real value shows in the table
const colBox = document.querySelector('#col-groups input[data-key="asesor_de_ventas"]');
colBox.checked = true;
colBox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
click(document.getElementById('columns-apply'));
const cell = document.querySelector(`tbody tr[data-id="${c1.id}"] td[data-key="asesor_de_ventas"]`);
const cellText = cell ? text(cell).replace(/\s*✎$/, '') : 'missing'; // the pencil marks an editable cell
log('cell of the custom column:', cellText, '| editable:', Boolean(cell && cell.classList.contains('cell--editable')));
if (!cell || cellText !== 'Sofía R.' || !cell.classList.contains('cell--editable')) fail('the custom column should show the real value and stay editable');
// advanced filters: the "+ Agregar filtro" popover
click(document.querySelector('[data-action="advanced"]'));
click(document.getElementById('allf-add'));
const popText = text(document.querySelector('#allf-pop'));
log('filter popover lists:', /Asesor de ventas/.test(popText), /Latitud/.test(popText), '| group header:', popText.includes(GROUP));
if (!/Asesor de ventas/.test(popText) || !/Latitud/.test(popText)) fail('the filter popover should list the custom properties');
// 4) "Crear contacto": only the in_form ones, after the standard fields
click(document.querySelector('.page-head__actions [data-action="create"]'));
const names = [...document.querySelectorAll('#cc-form [name]')].map((e) => e.name);
log('create form fields:', names.join(', '));
if (names.slice(-3).join(',') !== 'asesor_de_ventas,nombre_del_proyecto,cell_phone' || names.includes('latitud')) fail('the create form should ask only for the in_form properties, after the standard ones');
const typeIn = (name, value) => { const el = document.querySelector(`#cc-form [name="${name}"]`); el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
typeIn('first', 'Prueba');
typeIn('last', 'Megaglass');
typeIn('email', 'prueba.megaglass@ejemplo.com');
typeIn('asesor_de_ventas', 'Diego G.');
typeIn('nombre_del_proyecto', 'Torre Reforma');
document.getElementById('cc-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
const made = data.allContacts().find((c) => c.email === 'prueba.megaglass@ejemplo.com');
log('created with custom values:', made && `${made.asesor_de_ventas} · ${made.nombre_del_proyecto} · cell_phone=${JSON.stringify(made.cell_phone)}`);
if (!made || made.asesor_de_ventas !== 'Diego G.' || made.nombre_del_proyecto !== 'Torre Reforma') fail('custom values from the create form should be saved');
// 5) the record page: "Información avanzada" shows the group with the real values
dom = boot(`http://localhost/contacts/record/?id=${c1.id}`, '<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/record.js'));
click(document.querySelector('[data-tab="advanced"]'));
const section = [...document.querySelectorAll('#all-props .propgrp')].find((s) => text(s.querySelector('h4')) === GROUP);
const rowOf = (label) => [...(section ? section.querySelectorAll('.props__row') : [])].find((r) => text(r.querySelector('dt')) === label);
log('advanced section:', Boolean(section), '| rows:', section && section.querySelectorAll('.props__row').length, '| Asesor:', text(rowOf('Asesor de ventas')?.querySelector('dd')), '| Latitud:', text(rowOf('Latitud')?.querySelector('dd')), '| Mapsly:', text(rowOf('Mapsly')?.querySelector('dd')));
if (!section || section.querySelectorAll('.props__row').length !== 19 || text(rowOf('Asesor de ventas')?.querySelector('dd')) !== 'Sofía R.' || !/19\.43/.test(text(rowOf('Latitud')?.querySelector('dd')))) fail('the record page should show the group with the real values');
// 6) Configuración: creating / editing a property goes through the writer with the table's shape
const beforeN = P.customProperties('contacts').length;
const edited = P.customProperties('contacts');
edited.push({ key: 'custom_zona', label: 'Zona', kind: 'enum', options: ['Norte', 'Sur'], group: GROUP, visible: true });
P.saveCustomProperties('contacts', edited);
const last = written[written.length - 1];
const row = P.customPropToDb('contacts', last[1].find((p) => p.key === 'custom_zona'));
log('writer called:', written.length, '| type:', last && last[0], '| rows:', last && last[1].length, '| new row:', JSON.stringify(row));
if (!last || last[0] !== 'contacts' || last[1].length !== beforeN + 1 || row.objeto !== 'contact' || row.in_form !== true || row.options.join() !== 'Norte,Sur' || row.group_name !== GROUP) fail('saving should persist through the writer');
if (mem['crm:customprops:contacts']) fail('with the table loaded nothing goes to localStorage');
log('round trip:', JSON.stringify(P.customPropFromDb({ ...row, id: 'x' })).includes('"visible":true'));
if (!P.customPropFromDb({ ...row, id: 'x' }).visible || P.customPropFromDb({ ...row, id: 'x' }).options.join() !== 'Norte,Sur') fail('row round trip');
log('OK');

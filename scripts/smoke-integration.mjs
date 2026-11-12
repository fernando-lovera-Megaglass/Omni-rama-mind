// DOM smoke test for Gestión de datos › Integración de datos: nav flyout, the four cards, the monitor
// (tabs, filters, search, columns), a real CSV import into the CRM and the connected apps.
// Run: node scripts/smoke-integration.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[integration]', ...a);
const fail = (msg) => { console.error(`[integration] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="dint-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/data/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
dom.window.confirm = () => true;

const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/integration.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const rows = () => document.querySelectorAll('#dint-pane tbody tr[data-id]').length;

// side navigation: the Gestión de datos flyout lists the original's entries
const fly = [...document.querySelectorAll('.sidenav__group')].find((g) => g.textContent.includes('Gestión de datos'));
const entries = [...fly.querySelectorAll('.sidenav__sub')].map((a) => a.textContent.replace(/[⊕ⓘ]/g, '').trim());
log('flyout:', entries.join(' | '));
if (entries.join('|') !== 'Agente de datos|Integración de datos|Gestión de eventos|Calidad de los datos|Data StudioBeta|Modelo de datos|Enriquecimiento de datos') fail('flyout entries differ');
log('active entry:', fly.querySelector('.sidenav__sub.is-active')?.textContent.trim(), '| beta tag:', Boolean(fly.querySelector('.tag--beta')));

// the page: title, four cards with their buttons, monitor with three tabs
log('title:', document.querySelector('.dint__head h1').textContent);
const cards = [...document.querySelectorAll('.dint__card')].map((c) => `${c.querySelector('h2').textContent} → ${c.querySelector('button').textContent.trim()}`);
log('cards:', cards.join(' | '));
if (cards.length !== 4 || !cards[0].startsWith('Importar un archivo → Importar datos') || !cards[3].includes('Aumentar de nivel a Data Hub')) fail('cards differ from the original');
log('tabs:', [...document.querySelectorAll('.dint__tab')].map((t) => t.textContent).join(' | '), '| rows:', rows());
if (rows() < 10) fail('the imports table should list the sample imports');
const headers = [...document.querySelectorAll('#dint-pane thead th')].map((t) => t.textContent);
log('columns:', headers.join(' | '));
if (headers.join('|') !== 'Nombre de la importación|Import State|New Records|Registros actualizados|New Associations|Errors|Creado por ID de usuario|Fecha y hora de creación del objeto') fail('columns differ');
log('first row:', [...document.querySelector('#dint-pane tbody tr').querySelectorAll('td')].map((td) => td.textContent.trim()).join(' | '));
log('chips:', [...document.querySelectorAll('.dint__chips .qchip')].map((c) => c.textContent.trim()).join(' | '));

// filters and search
const before = rows();
click(document.querySelector('[data-filter="system"][data-value="mobile"]'));
log('system = móvil ->', rows(), '| chip:', document.querySelector('[data-chip="system"]').textContent.trim());
if (rows() !== 1) fail('system filter should keep only the mobile import');
click(document.querySelector('[data-filter="system"][data-value=""]'));
const q = $('dint-q');
q.value = 'julio';
q.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
log('search "julio" ->', rows());
if (rows() !== 4) fail('search should match the four July imports');
$('dint-q').value = '';
$('dint-q').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
if (rows() !== before) fail('clearing the search should restore the rows');

// editing columns
click(document.querySelector('[data-act="columns"]'));
log('columns modal open:', $('dint-modal').classList.contains('is-open'), '| options:', document.querySelectorAll('#dint-modal-body [data-col]').length);
document.querySelector('#dint-modal-body [data-col="object"]').checked = true;
document.querySelector('#dint-modal-body [data-col="associations"]').checked = false;
click($('cols-apply'));
const headers2 = [...document.querySelectorAll('#dint-pane thead th')].map((t) => t.textContent);
log('columns after edit:', headers2.join(' | '));
if (!headers2.includes('Objeto') || headers2.includes('New Associations')) fail('column editor did not apply');

// a real CSV import creates records and a new row in the monitor
const contactsBefore = data.allContacts().length;
click(document.querySelector('[data-act="import"]'));
log('import modal:', $('dint-modal-title').textContent, '| object select:', Boolean($('imp-type')), '| apply disabled:', $('imp-apply').disabled);
const csv = 'Nombre,Apellidos,Correo,Número de teléfono\nLaura,Ejemplo,laura@ejemplo.com,+34 600 000 001\nPedro,Prueba,pedro@ejemplo.com,\n,,,\n';
const file = { name: 'nuevos_contactos.csv', text: () => Promise.resolve(csv) };
Object.defineProperty($('imp-file'), 'files', { value: [file] });
$('imp-file').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
await new Promise((r) => setTimeout(r, 20));
log('status:', $('imp-status').textContent, '| apply enabled:', !$('imp-apply').disabled);
if ($('imp-apply').disabled) fail('a valid CSV should enable the import');
click($('imp-apply'));
const contactsAfter = data.allContacts().length;
log('contacts:', contactsBefore, '->', contactsAfter, '| first row now:', document.querySelector('#dint-pane tbody tr td').textContent.trim(), '| state:', document.querySelector('#dint-pane tbody tr td[data-key="state"]').textContent.trim());
if (contactsAfter !== contactsBefore + 2) fail('CSV rows should become contacts');
if (!document.querySelector('#dint-pane tbody tr td').textContent.includes('nuevos_contactos.csv')) fail('the import should appear first in the monitor');
if (!JSON.parse(mem['crm:imports'])[0] || JSON.parse(mem['crm:imports'])[0].errors !== 1) fail('the empty row should count as an error');
const added = data.allContacts().find((c) => c.email === 'laura@ejemplo.com');
log('imported contact:', added && `${added.name} · ${added.phone} · ${added.owner}`);
if (!added || added.name !== 'Laura Ejemplo') fail('imported contact fields not mapped');

// connected apps and their sync tab
click(document.querySelector('[data-act="apps"]'));
log('apps modal rows:', document.querySelectorAll('#dint-modal-body tbody tr').length, '| connected:', document.querySelectorAll('#dint-modal-body .tag--done').length);
click(document.querySelector('[data-app-toggle="outlook"]'));
log('after connecting Outlook ->', document.querySelectorAll('#dint-modal-body .tag--done').length, 'connected');
click($('dint-modal').querySelector('[data-close]'));
click(document.querySelector('[data-tab="apps"]'));
const appRows = [...document.querySelectorAll('#dint-pane tbody tr[data-app]')].map((r) => r.dataset.app);
log('sync tab apps:', appRows.join(', '));
if (!appRows.includes('outlook') || appRows.length !== 4) fail('the sync tab should list the connected apps');
click(document.querySelector('[data-sync="gmail"]'));
log('after sync now:', document.querySelector('#dint-pane tr[data-app="gmail"] td:nth-child(5)').textContent);
click(document.querySelector('[data-tab="studio"]'));
log('studio tab:', document.querySelector('#dint-pane h3')?.textContent, '| beta tag:', Boolean(document.querySelector('#dint-pane .tag--beta')));
log('OK');

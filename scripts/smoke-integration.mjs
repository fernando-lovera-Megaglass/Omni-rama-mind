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
const cards = [...document.querySelectorAll('.dint__card')].map((c) => `${c.querySelector('h2').textContent} → ${c.querySelector('button, a.btn').textContent.trim()}`);
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

// "Importar datos" opens the import wizard; an import run by the engine shows in the monitor with its state
const E = await import(resolve(here, '../src/import-engine.js'));
log('import link:', document.querySelector('[data-import-link]')?.getAttribute('href'));
if (document.querySelector('[data-import-link]')?.getAttribute('href') !== './import/') fail('"Importar datos" should open the wizard');
const table = E.parsePasted('Nombre\tApellidos\tCorreo electrónico\nLaura\tEjemplo\tlaura@ejemplo.com\nPedro\tPrueba\tpedro@ejemplo.com\n\t\tno-es-correo');
const plan = E.planImport(table, E.autoMap(table.headers, 'es'), {});
const entry = E.registerImport({ name: 'nuevos_contactos.csv', table, plan, options: {} });
const contactsBefore = data.allContacts().length;
await E.runImport(entry.id, plan, { sleep: () => Promise.resolve() });
click(document.querySelector('[data-tab="files"]'));
const first = document.querySelector('#dint-pane tbody tr');
log('contacts:', contactsBefore, '->', data.allContacts().length, '| first row:', first.querySelector('td').textContent.trim(), '| state:', first.querySelector('td[data-key="state"]').textContent.trim(), '| link:', first.querySelector('a').getAttribute('href'), '| errors:', first.querySelector('td[data-key="errors"]').textContent.trim());
if (data.allContacts().length !== contactsBefore + 2) fail('the engine import should create two contacts');
if (!first.querySelector('td').textContent.includes('nuevos_contactos.csv') || first.querySelector('td[data-key="state"]').textContent.trim() !== 'Listo') fail('the import should appear first with state Listo');
if (!first.querySelector('a').getAttribute('href').includes(`import/?id=${entry.id}`)) fail('the monitor should link to the review page');

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
// "Importar" in every list leads here (as in the original) and the import card is pointed out
for (const type of ['contacts', 'companies', 'deals', 'tickets', 'tasks']) {
  const d3 = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: `http://localhost/${type}/` });
  globalThis.window = d3.window; globalThis.document = d3.window.document; globalThis.location = d3.window.location;
  await import(resolve(here, `../src/${type}.js`) + '?links');
  const importLinks = [...document.querySelectorAll('a.menu__item')].filter((a) => /Importar/.test(a.textContent)).map((a) => a.getAttribute('href'));
  log(`${type} import entries:`, importLinks.join(' | '), '| old drawer gone:', !document.getElementById('import-drawer'));
  // contacts: "Agregar contactos" opens the create panel directly, so only the ⋮ menu offers "Importar"
  const expectedLinks = type === 'contacts' ? 1 : 2;
  if (importLinks.length !== expectedLinks || importLinks.some((l) => l !== `../data/?from=${type}`) || document.getElementById('import-drawer')) fail(`${type} "Importar" should lead to Integración de datos`);
}
const dom4 = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="dint-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/data/?from=companies' });
globalThis.window = dom4.window; globalThis.document = dom4.window.document; globalThis.location = dom4.window.location;
await import(resolve(here, '../src/integration.js') + '?from');
log('notice:', document.getElementById('dint-notice')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 90), '| import card highlighted:', document.querySelector('.dint__card.is-highlight h2')?.textContent, '| wizard link:', document.querySelector('[data-import-link]')?.getAttribute('href'));
if (!document.getElementById('dint-notice') || document.querySelector('.dint__card.is-highlight h2')?.textContent !== 'Importar un archivo') fail('landing from a list should point at the import card');
if (document.querySelector('[data-import-link]')?.getAttribute('href') !== './import/?object=companies') fail('the wizard link should carry the object');
log('OK');

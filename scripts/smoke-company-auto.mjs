// DOM smoke test for the automatic companies by e-mail domain (especificacion-empresas-crm.md §2): creating a
// contact finds or creates the company of its domain, free e-mails fall back to the website, excluded domains
// and existing associations are respected, the rule runs on import and on e-mail changes, the retroactive run
// counts, and the setting's checkbox, preview modal and excluded list in Configuración › Objetos › Empresas.
// Run: node scripts/smoke-company-auto.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[company-auto]', ...a);
const fail = (msg) => { console.error(`[company-auto] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/settings/#obj-companies' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
Object.defineProperty(globalThis.localStorage, 'length', { get: () => Object.keys(mem).length });
globalThis.localStorage.key = (i) => Object.keys(mem)[i];
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true;

const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));
const companies = () => data.allCompanies();
const byDomain = (d) => companies().filter((c) => c.domain === d);
const contact = (id) => data.findRecord('contacts', id);
const notes = (type, id) => data.activitiesFor(type, id).map((a) => a.text);

log('helpers:', data.emailDomain(' Ana@Vidrios-Del-Norte.COM '), data.siteDomain('https://www.Info.Ejemplo.com/x'), data.companyNameFromDomain('vidrios-del-norte.com'), '| free gmail:', data.isFreeEmailDomain('gmail.com'), '| enabled by default:', data.companyAutoEnabled());
if (data.emailDomain(' Ana@Vidrios-Del-Norte.COM ') !== 'vidrios-del-norte.com' || data.siteDomain('https://www.Info.Ejemplo.com/x') !== 'info.ejemplo.com' || data.companyNameFromDomain('vidrios-del-norte.com') !== 'Vidrios Del Norte' || !data.companyAutoEnabled()) fail('helpers');

// 1. a new contact with a corporate e-mail creates its company and gets associated
const n0 = companies().length;
const c1 = data.addRecord('contacts', { name: 'Ana Prueba', first: 'Ana', last: 'Prueba', email: 'ana@vidrios-del-norte.com', owner: 'Fernando L.', lifecycle: 'Lead' });
const co = byDomain('vidrios-del-norte.com');
log('created company:', co.length, co[0] && `${co[0].name} · ${co[0].domain} · ${co[0].owner}`, '| contact companyId:', c1.companyId, contact(c1.id).companyId, '| company text:', contact(c1.id).company);
if (co.length !== 1 || co[0].name !== 'Vidrios Del Norte' || Number(c1.companyId) !== Number(co[0].id) || Number(contact(c1.id).companyId) !== Number(co[0].id) || contact(c1.id).company !== 'Vidrios Del Norte') fail('company created and associated');
log('timeline contact:', notes('contacts', c1.id)[0], '| company:', notes('companies', co[0].id)[0]);
if (!/asociada automáticamente/.test(notes('contacts', c1.id)[0] || '') || !/creada automáticamente/.test(notes('companies', co[0].id)[0] || '')) fail('timeline notes');
// 2. a second contact of the same domain joins the same company; a subdomain is another company
const c2 = data.addRecord('contacts', { name: 'Beto Prueba', email: 'beto@vidrios-del-norte.com' });
const c3 = data.addRecord('contacts', { name: 'Caro Prueba', email: 'caro@ventas.vidrios-del-norte.com' });
log('same domain →', c2.companyId, '| subdomain →', c3.companyId, contact(c3.id).company, '| companies now:', companies().length - n0, 'new');
if (Number(c2.companyId) !== Number(co[0].id) || !c3.companyId || Number(c3.companyId) === Number(co[0].id) || companies().length - n0 !== 2) fail('same domain / subdomain');
// 3. free e-mail: nothing without a website, the website's domain otherwise (an existing company of the account)
const known = companies().find((c) => c.domain && !c.hs_created_by_automation);
const c4 = data.addRecord('contacts', { name: 'Dani Gmail', email: 'dani@gmail.com' });
const c5 = data.addRecord('contacts', { name: 'Eli Gmail', email: 'eli@gmail.com', website: `https://www.${known.domain}/contacto` });
const c5b = data.addRecord('contacts', { name: 'Eva Gmail', email: 'eva@gmail.com', website: 'https://www.sitio-sin-empresa.com' });
log('gmail without website →', c4.companyId ?? 'none', '| gmail with website →', c5.companyId, contact(c5.id).company, '(expected', known.name + ')', '| gmail with unknown website →', c5b.companyId ?? 'none', data.autoAssociateCompany(c5b).reason);
if (c4.companyId || Number(c5.companyId) !== Number(known.id) || c5b.companyId || byDomain('sitio-sin-empresa.com').length) fail('free e-mail rule');
// 4. an existing association is never replaced; excluded domains and the switch are respected
const other = companies().find((c) => Number(c.id) !== Number(known.id) && !c.hs_created_by_automation);
const c6 = data.addRecord('contacts', { name: 'Fer Asociado', email: `fer@${known.domain}`, companyId: other.id, company: other.name });
log('preset association kept:', Number(c6.companyId) === Number(other.id));
if (Number(c6.companyId) !== Number(other.id)) fail('existing association must not change');
localStorage.setItem(data.EXCLUDED_DOMAINS_KEY, JSON.stringify([...data.DEFAULT_EXCLUDED_DOMAINS, 'excluido.com']));
const c7 = data.addRecord('contacts', { name: 'Gus Excluido', email: 'gus@excluido.com' });
log('excluded domain →', c7.companyId ?? 'none', '| reason:', data.autoAssociateCompany(c7).reason);
if (c7.companyId || byDomain('excluido.com').length) fail('excluded domain');
localStorage.setItem(data.COMPANY_AUTO_KEY, JSON.stringify({ autoCreate: false }));
const c8 = data.addRecord('contacts', { name: 'Hugo Apagado', email: 'hugo@apagado-sa.com' });
log('switch off →', c8.companyId ?? 'none', '| reason:', data.autoAssociateCompany(c8).reason);
if (c8.companyId || byDomain('apagado-sa.com').length) fail('switch off');
localStorage.setItem(data.COMPANY_AUTO_KEY, JSON.stringify({ autoCreate: true }));
// 5. changing the e-mail of a contact without a company associates it
data.setField('contacts', c4.id, 'email', 'dani@vidrios-del-norte.com');
log('after e-mail change →', contact(c4.id).companyId, contact(c4.id).company);
if (Number(contact(c4.id).companyId) !== Number(co[0].id)) fail('association on e-mail change');
// 6. retroactive run: preview then apply (c8 is still without a company)
const c9 = data.addRecord('contacts', { name: 'Ivy Web', email: 'ivy@yahoo.com' });
const dry = data.applyCompanyAutomation({ dryRun: true });
log('dry run:', JSON.stringify(dry));
if (dry.created !== 1 || byDomain('apagado-sa.com').length) fail('dry run must not write');
const real = data.applyCompanyAutomation();
log('real run:', JSON.stringify(real), '| hugo →', contact(c8.id).company, '| ivy →', contact(c9.id).companyId ?? 'none');
if (real.created !== 1 || contact(c8.id).company !== 'Apagado Sa' || contact(c9.id).companyId) fail('retroactive run');
// 7. import: rows get their companies; a row with a company column keeps that association
const table = E.parsePasted(['Nombre\tApellidos\tCorreo electrónico\tNombre de la empresa', 'Imp\tUno\timp.uno@importada-sa.com\t', 'Imp\tDos\timp.dos@importada-sa.com\t', `Imp\tTres\timp.tres@importada-sa.com\t${known.name}`, 'Imp\tCuatro\timp.cuatro@hotmail.com\t'].join('\n'));
const plan = E.planImport(table, E.autoMap(table.headers, 'es', 'contacts'), { mode: 'create' });
const entry = E.registerImport({ name: 'Auto empresas', table, plan, options: {} });
const run = await E.runImport(entry.id, plan, { sleep: () => Promise.resolve() });
const imp = data.allContacts().filter((c) => /@importada-sa\.com$/.test(c.email || ''));
log('import:', JSON.stringify({ created: run.created, associations: run.associations, autoCompanies: run.autoCompanies }), '| companies importada-sa.com:', byDomain('importada-sa.com').length, '| rows →', imp.map((c) => `${c.last}:${c.company}`).join(', '));
if (run.created !== 4 || run.autoCompanies !== 2 || byDomain('importada-sa.com').length !== 1 || imp.find((c) => c.last === 'Tres').company !== known.name || imp.find((c) => c.last === 'Uno').company !== 'Importada Sa') fail('import rule');
if (data.allContacts().find((c) => c.email === 'imp.cuatro@hotmail.com').companyId) fail('hotmail row must stay without company');

// 8. settings page: checkbox, preview modal, apply, excluded list
localStorage.setItem(data.COMPANY_AUTO_KEY, JSON.stringify({ autoCreate: false }));
const c10 = data.addRecord('contacts', { name: 'Jo Pendiente', email: 'jo@pendiente-sa.com' });
await import(resolve(here, '../src/settings.js'));
const $ = (s) => document.getElementById(s);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el) => el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
const box = document.querySelector('[data-objsetting="autoCreate"]');
log('settings section:', document.querySelector('.snav__item.is-active')?.textContent, '| checkbox:', Boolean(box), '| checked:', box?.checked, '| apply button while off:', Boolean(document.querySelector('[data-act="company-auto-apply"]')));
if (!box || box.checked || document.querySelector('[data-act="company-auto-apply"]')) fail('checkbox state while off');
box.checked = true;
change(box);
const modal = document.querySelector('#company-auto-preview');
log('after turning on: setting', JSON.parse(mem[data.COMPANY_AUTO_KEY]).autoCreate, '| modal:', Boolean(modal), '|', modal && modal.textContent.replace(/\s+/g, ' ').trim().slice(0, 120));
if (!JSON.parse(mem[data.COMPANY_AUTO_KEY]).autoCreate || !modal || !/1 empresas nuevas/.test(modal.textContent)) fail('preview modal');
click($('company-auto-run'));
log('after apply: jo →', contact(c10.id).company, '| apply button now:', Boolean(document.querySelector('[data-act="company-auto-apply"]')));
if (contact(c10.id).company !== 'Pendiente Sa' || !document.querySelector('[data-act="company-auto-apply"]')) fail('apply from the modal');
click(document.querySelector('[data-act="company-auto-apply"]'));
log('apply button modal:', Boolean(document.querySelector('#company-auto-preview')), '| run disabled (nothing to do):', $('company-auto-run')?.disabled);
if (!document.querySelector('#company-auto-preview')) fail('apply button should open the preview');
click(document.querySelector('#rec-modal [data-close], .modal [data-close], [data-close]'));
click(document.querySelector('[data-act="excluded-domains"]'));
$('exd-form').elements.d.value = 'HTTPS://www.Prueba-Excluida.com/';
$('exd-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
const excluded = JSON.parse(mem[data.EXCLUDED_DOMAINS_KEY]);
log('excluded list:', excluded.join(', '));
if (!excluded.includes('prueba-excluida.com')) fail('excluded domain added');
console.log('[company-auto] OK');

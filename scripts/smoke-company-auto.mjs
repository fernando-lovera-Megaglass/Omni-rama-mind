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

// 9. «Dominios adicionales» (especificacion-empresas-crm.md §1-2): a company answers to its main domain and to
// each additional one (';' separated); contacts of a secondary domain join it instead of creating a duplicate
localStorage.setItem(data.COMPANY_AUTO_KEY, JSON.stringify({ autoCreate: true }));
const grupo = data.addRecord('companies', { name: 'Grupo Vidriero', domain: 'grupo-vidriero.com', hs_additional_domains: ' HTTPS://www.Filial.com/; marca-dos.es ,grupo-vidriero.com', owner: 'Fernando L.', lifecycle: 'Lead' });
log('additional domains stored:', JSON.stringify(grupo.hs_additional_domains), '| companyDomains:', data.companyDomains(grupo).join(', '));
if (grupo.hs_additional_domains !== 'filial.com;marca-dos.es' || data.companyDomains(grupo).join(',') !== 'grupo-vidriero.com,filial.com,marca-dos.es') fail('additional domains normalised on create (main domain not repeated)');
if (companies().some((c) => Number(c.id) !== Number(grupo.id) && c.hs_additional_domains)) fail('no sample «Dominios adicionales» on the other companies (REAL_ONLY)');
const n9 = companies().length;
const c11 = data.addRecord('contacts', { name: 'Kai Filial', email: 'kai@filial.com' });
log('contact @filial.com →', contact(c11.id).company, '| companies created:', companies().length - n9, '| note:', notes('contacts', c11.id)[0]);
if (Number(c11.companyId) !== Number(grupo.id) || contact(c11.id).company !== 'Grupo Vidriero' || companies().length !== n9 || byDomain('filial.com').length) fail('contact of an additional domain joins the company without creating one');
if (!/por el dominio del correo \(filial\.com\)/.test(notes('contacts', c11.id)[0] || '')) fail('timeline names the additional domain');
if (data.companiesByDomain('marca-dos.es')[0]?.id !== grupo.id || data.autoAssociateCompany({ id: 0, email: 'x@marca-dos.es' }, { dryRun: true, force: true }).company?.id !== grupo.id) fail('companiesByDomain / dry run by additional domain');
// editing the field («Acerca de», inline column) normalises it and drops the main domain
data.setField('companies', grupo.id, 'hs_additional_domains', 'Marca-Tres.com, www.filial.com; grupo-vidriero.com');
log('after edit:', JSON.stringify(data.findRecord('companies', grupo.id).hs_additional_domains));
if (data.findRecord('companies', grupo.id).hs_additional_domains !== 'marca-tres.com;filial.com') fail('setField normalises the additional domains');
const c12 = data.addRecord('contacts', { name: 'Lu Tres', email: 'lu@marca-tres.com' });
const c13 = data.addRecord('contacts', { name: 'Mo Dos', email: 'mo@marca-dos.es' });
if (Number(c12.companyId) !== Number(grupo.id) || Number(c13.companyId) === Number(grupo.id) || byDomain('marca-dos.es').length !== 1) fail('the edited list is what counts (marca-tres joins, marca-dos no longer)');
// the «Crear empresa» panel: an additional domain already used → the duplicate warning, nothing created
const CC = await import(resolve(here, '../src/create-company.js'));
CC.setSearchClient(null);
const found = await CC.findByDomain('www.FILIAL.com');
log('findByDomain(filial.com) →', found && `${found.name} (matched ${found.matched})`, '| findSimilar(marca-tres) →', (await CC.findSimilar({ domain: 'marca-tres' })).map((r) => r.name).join(', '));
if (!found || Number(found.id) !== Number(grupo.id) || found.matched !== 'filial.com') fail('findByDomain finds the company by an additional domain');
if (!(await CC.findSimilar({ domain: 'marca-tres' })).some((r) => Number(r.id) === Number(grupo.id))) fail('findSimilar looks at the additional domains');
if (!CC.FIELDS.some(([k]) => k === 'hs_additional_domains') || CC.FIELDS.findIndex(([k]) => k === 'hs_additional_domains') !== CC.FIELDS.findIndex(([k]) => k === 'domain') + 1) fail('panel field after the domain');
const panel = CC.mountCreateCompany({ root: document.body });
const submitPanel = async () => { panel.el.querySelector('#cco-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); for (let i = 0; (panel.state.busy || i < 2) && i < 200; i++) await new Promise((r) => setTimeout(r, 5)); };
panel.open({ name: 'Otra Filial SA', domain: 'otra-filial.com', hs_additional_domains: 'nueva-marca.com; FILIAL.com' });
const nPanel = companies().length;
await submitPanel();
const warn = panel.el.querySelector('#cco-dups');
log('panel with a used additional domain:', warn.className, '|', warn.textContent.replace(/\s+/g, ' ').trim().slice(0, 140));
if (!warn.classList.contains('cc-dups--warn') || !/Ya existe una empresa con ese dominio/.test(warn.textContent) || !/filial\.com ya pertenece a Grupo Vidriero/.test(warn.textContent) || companies().length !== nPanel || !panel.isOpen()) fail('duplicate warning for an additional domain, nothing created');
if (panel.el.querySelector('[data-cco="fix-domain"]')?.dataset.field !== 'hs_additional_domains') fail('the button goes back to the additional domains field');
panel.el.querySelector('[data-cco="fix-domain"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
panel.el.querySelector('#cco-form').elements.hs_additional_domains.value = 'nueva-marca.com';
await submitPanel();
const made = companies().find((c) => c.name === 'Otra Filial SA');
log('panel after fixing:', made && `${made.domain} + ${made.hs_additional_domains}`, '| open:', panel.isOpen());
if (!made || made.hs_additional_domains !== 'nueva-marca.com' || panel.isOpen()) fail('created with its additional domain once free');
// import: a row of an additional domain joins the company; a company column with an additional domain associates too
const table9 = E.parsePasted(['Nombre\tApellidos\tCorreo electrónico\tNombre de la empresa', 'Imp\tCinco\timp.cinco@marca-tres.com\t', 'Imp\tSeis\timp.seis@gmail.com\tfilial.com'].join('\n'));
const plan9 = E.planImport(table9, E.autoMap(table9.headers, 'es', 'contacts'), { mode: 'create' });
const entry9 = E.registerImport({ name: 'Dominios adicionales', table: table9, plan: plan9, options: {} });
const run9 = await E.runImport(entry9.id, plan9, { sleep: () => Promise.resolve() });
const cinco = data.allContacts().find((c) => c.email === 'imp.cinco@marca-tres.com');
const seis = data.allContacts().find((c) => c.email === 'imp.seis@gmail.com');
log('import by additional domain:', JSON.stringify({ created: run9.created, autoCompanies: run9.autoCompanies }), '| cinco →', cinco?.company, '| seis →', seis?.company, '| companies now:', companies().length - nPanel - 1, 'new');
if (run9.created !== 2 || run9.autoCompanies !== 0 || Number(cinco?.companyId) !== Number(grupo.id) || Number(seis?.companyId) !== Number(grupo.id) || companies().length !== nPanel + 1) fail('import associates by additional domain (e-mail and company column) without creating companies');
// duplicates: a company whose main domain is another's additional domain → one group by domain; the main domain wins the association
const D = await import(resolve(here, '../src/duplicates.js'));
const suelta = data.addRecord('companies', { name: 'Filial Suelta', domain: 'filial.com', owner: 'Sin asignar', lifecycle: 'Lead' });
const group = D.findDuplicateGroups('companies', companies()).find((g) => g.records.some((r) => Number(r.id) === Number(grupo.id)));
log('duplicate group:', group && `${group.records.map((r) => r.name).join(' + ')} · keys ${group.keys.join(',')}`, '| companiesByDomain(filial.com)[0]:', data.companiesByDomain('filial.com')[0]?.name);
if (!group || !group.records.some((r) => Number(r.id) === Number(suelta.id)) || !group.keys.includes('domain') || data.companiesByDomain('filial.com')[0]?.id !== suelta.id) fail('duplicates tool groups by additional domain; the main domain wins');
console.log('[company-auto] OK');

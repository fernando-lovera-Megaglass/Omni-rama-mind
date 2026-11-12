// Tests for the contact import module (especificacion-importacion-contactos-crm.md): file parsing (CSV, XLSX,
// pasted data, invalid files), auto-mapping ES/EN, value conversion per type, de-duplication by e-mail / record
// ID, the three modes, the error catalogue with downloads, the states (STARTED → PROCESSING → DONE / FAILED /
// CANCELED / DEFERRED), limits, and the wizard pages. Run: node scripts/smoke-import.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const log = (...a) => console.log('[import]', ...a);
const fail = (msg) => { console.error(`[import] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const boot = (url, body) => {
  const dom = new JSDOM(body, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.CSS = dom.window.CSS;
  globalThis.history = dom.window.history;
  dom.window.confirm = () => true;
  return dom;
};
let dom = boot('http://localhost/data/import/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>');
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));
const fileOf = (name, text) => ({ name, size: text.length, text: () => Promise.resolve(text), arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) });

// ---------- parsing ----------
const csv = 'Nombre;Apellidos;"Correo electrónico";Número de teléfono\r\nAna;"Pérez; López";ana@ejemplo.com;+52 55 1234 5678\r\nLuis;Gómez;luis@ejemplo.com;\r\n';
let t = await E.parseFile(fileOf('contactos.csv', '﻿' + csv));
log('csv:', t.headers.join('|'), '| rows:', t.rows.length, '| quoted cell:', t.rows[0][1], '| sep:', JSON.stringify(t.separator));
if (t.headers[2] !== 'Correo electrónico' || t.rows[0][1] !== 'Pérez; López' || t.rows.length !== 2) fail('csv parsing');
const pasted = E.parsePasted('Nombre\tApellidos\tCorreo electrónico\nEva\tRuiz\teva@ejemplo.com');
log('pasted:', pasted.headers.join('|'), pasted.rows[0].join('|'), '| format:', pasted.format);
if (pasted.rows[0][2] !== 'eva@ejemplo.com') fail('pasted TSV parsing');
for (const [name, code] of [['datos.pdf', 'INVALID_FILE_TYPE'], ['datos.docx', 'INVALID_FILE_TYPE']]) {
  try { await E.parseFile(fileOf(name, 'x')); fail(`${name} should be rejected`); } catch (e) { log(name, '->', e.code); if (e.code !== code) fail(`${name} wrong code`); }
}
try { await E.parseFile({ name: 'grande.csv', size: 30 * 1024 * 1024, text: () => Promise.resolve('') }); fail('big file accepted'); } catch (e) { log('30 MB ->', e.code, e.message); if (e.code !== 'LIMIT_EXCEEDED') fail('size limit'); }
// XLSX through SheetJS: one sheet OK, two sheets rejected
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['First Name', 'Last Name', 'Email', 'Phone Number'], ['Marta', 'Excel', 'marta@ejemplo.com', '+34 600 111 222']]), 'Hoja1');
const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
t = await E.parseFile({ name: 'contactos.xlsx', size: xlsxBuf.byteLength, arrayBuffer: () => Promise.resolve(xlsxBuf) });
log('xlsx:', t.headers.join('|'), '| rows:', t.rows.length, '| format:', t.format);
if (t.rows[0][2] !== 'marta@ejemplo.com') fail('xlsx parsing');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), 'Hoja2');
const two = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
try { await E.parseFile({ name: 'dos.xlsx', size: two.byteLength, arrayBuffer: () => Promise.resolve(two) }); fail('two sheets accepted'); } catch (e) { log('two sheets ->', e.code); if (e.code !== 'INVALID_SHEET_COUNT') fail('sheet count'); }
const noHeader = E.parsePasted('Nombre,,Correo electrónico\nAna,x,ana@ejemplo.com');
log('column without header ->', noHeader.warnings.map((w) => `${w.code} ${w.column}`).join(', '));
if (!noHeader.warnings.some((w) => w.code === 'INCORRECT_COLUMN_COUNT')) fail('missing header warning');

// ---------- auto-mapping ----------
const mapEs = E.autoMap(['Nombre', 'Apellidos', 'Correo electrónico', 'Número de teléfono', 'Empresa', 'Propietario del contacto', 'ID de registro', 'Columna rara'], 'es');
log('map es:', mapEs.map((m) => `${m.header}→${m.key || '∅'}`).join(' '));
if (mapEs.map((m) => m.key).join(',') !== 'first,last,email,phone,company,owner,hs_object_id,') fail('spanish auto-map');
const mapEn = E.autoMap(['First Name', 'Last Name', 'Email', 'Phone Number', 'Company Name', 'Contact Owner', 'Record ID'], 'es');
log('map en (fallback):', mapEn.map((m) => m.key).join(','));
if (mapEn.map((m) => m.key).join(',') !== 'first,last,email,phone,company,owner,hs_object_id') fail('english fallback auto-map');
log('unique keys:', E.UNIQUE_KEYS.join(','), '| isUnique(email):', E.isUnique('email'), '| isUnique(domain, companies):', E.isUnique('domain', 'companies'));

// ---------- value conversion ----------
const P = (k) => E.propByKey('contacts', k);
const checks = [
  ['email', 'Ana@Ejemplo.com', 'ana@ejemplo.com'], ['email', 'no-es-correo', undefined, 'INVALID_EMAIL'],
  ['phone', '55 1234 5678', '+525512345678'], ['phone', '+1 (305) 555-0100 ext 12', '+13055550100 ext 12'], ['phone', 'abc', undefined, 'COULD_NOT_PARSE_NUMBER'],
  ['annualrevenue', '1.234,56', 1234.56], ['annualrevenue', '1,234.56', 1234.56], ['annualrevenue', 'mucho', undefined, 'COULD_NOT_PARSE_NUMBER'],
  ['hs_likelihood_to_close', '25%', 25], ['hs_likelihood_to_close', '.25', 25],
  ['date_of_birth', '28/10/2020', '2020-10-28'], ['date_of_birth', '28-OCT-20', '2020-10-28'], ['date_of_birth', '28 octubre 2020', '2020-10-28'], ['date_of_birth', '31/02/2020', undefined, 'COULD_NOT_PARSE_DATE'], ['date_of_birth', '1603900800000', '2020-10-28'], ['date_of_birth', '28/10/0999', undefined, 'OUT_OF_VALID_DATE_RANGE'],
  ['hs_lead_status_date', '28/10/2020 14:30', '14:30'],
  ['hs_sequences_is_enrolled', 'Verdadero', 'Sí'], ['hs_sequences_is_enrolled', 'No', 'No'], ['hs_sequences_is_enrolled', 'tal vez', undefined, 'INVALID_ENUMERATION_OPTION'],
  ['lifecycle', 'Cliente', 'Cliente'], ['lifecycle', 'Astronauta', undefined, 'INVALID_ENUMERATION_OPTION'], ['lifecycle', 'Lead', 'Lead'],
  ['owner', 'Sofía R.', 'Sofía R.'], ['owner', 'sofia.r@omni.crm', 'Sofía R.'], ['owner', 'Nadie Conocido', undefined, 'OWNER_NOT_FOUND'],
  ['website', 'ejemplo.com', 'https://ejemplo.com'],
];
for (const [key, raw, expected, code] of checks) {
  const res = E.convertValue(P(key), raw, { dateFormat: 'dmy' });
  const got = typeof res.value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(res.value) ? (expected && expected.includes(':') ? new Date(res.value).toTimeString().slice(0, 5) : new Date(res.value).toISOString().slice(0, 10)) : res.value;
  const ok = code ? res.error === code : got === expected || (typeof expected === 'string' && got && String(got).startsWith(expected));
  if (!ok) fail(`convert ${key} "${raw}" -> ${JSON.stringify(res)} (expected ${expected} ${code || ''})`);
}
log('convertValue:', checks.length, 'cases OK |', E.convertValue(P('lifecycle'), 'lead calificado por ventas').value, '| mdy date:', E.convertValue(P('date_of_birth'), '10/28/2020', { dateFormat: 'mdy' }).value.slice(0, 10));
if (E.convertValue(P('lifecycle'), 'Lead calificado').error !== 'AMBIGUOUS_ENUMERATION_OPTION') fail('ambiguous enumeration');

// ---------- plan: dedup, modes, errors ----------
const existing = data.allContacts();
const emailsAll = existing.map((c) => String(c.email || '').toLowerCase());
const known = existing.find((c) => c.email && emailsAll.indexOf(String(c.email).toLowerCase()) === emailsAll.lastIndexOf(String(c.email).toLowerCase()));
const table = E.parsePasted([
  'Nombre\tApellidos\tCorreo electrónico\tNúmero de teléfono\tEtapa del ciclo de vida\tFecha de nacimiento\tDirecciones de correo electrónico adicionales\tRara',
  `Nuevo\tUno\tnuevo.uno@ejemplo.com\t+52 55 0000 0001\tCliente\t01/02/1990\tnuevo.uno@otro.com;malo@\t`,
  `${known.first}\tActualizado\t${known.email}\t\tAstronauta\t\t\t`,
  'Nuevo\tUno\tnuevo.uno@ejemplo.com\t\t\t\t\t',
  'Sin\tCorreo\tno-es-correo\t\t\t\t\t',
  '\t\t\t\t\t\t\tsolo columna sin mapear',
  'Solo\tTelefono\t\t+34 600 000 000\t\t\t\t',
  '\t\tsolo.correo@ejemplo.com\t\t\t\t\t',
  'Nuevo\tDos\tnuevo.dos@ejemplo.com\t\tLead\t\t\t',
  'Nuevo\tDos\tnuevo.dos@ejemplo.com\t\tLead\t\t\t',
].join('\n'));
const mapping = E.autoMap(table.headers, 'es', 'contacts');
log('mapping:', mapping.map((m) => m.key).join(','));
let plan = E.planImport(table, mapping, { mode: 'create_update', uniqueKey: 'email', dateFormat: 'dmy' });
const codes = (p) => p.records.map((r) => `${r.rowNumber}:${r.action}${r.code ? `(${r.code})` : ''}`).join(' ');
log('create+update:', codes(plan));
log('summary:', JSON.stringify(plan.summary), '| errors:', plan.errors.map((e) => `${e.row}:${e.code}`).join(' '));
const byRow = Object.fromEntries(plan.records.map((r) => [r.rowNumber, r]));
log('row 3 match:', byRow[3].matchId, 'known:', known.id, known.email);
if (byRow[2].action !== 'create' || byRow[3].action !== 'update' || Number(byRow[3].matchId) !== Number(known.id)) fail('create/update detection');
if (byRow[4].code !== 'DUPLICATE_UNIQUE_PROPERTY_VALUE') fail('duplicate e-mail in file');
if (byRow[5].code !== 'INVALID_EMAIL' || byRow[6].code !== 'EMPTY_PROPERTY_VALUES_OBJECT') fail('invalid e-mail / empty row');
if (byRow[7].action !== 'create' || byRow[8].action !== 'create') fail('name-only and e-mail-only rows should be created');
if (byRow[10].code !== 'DUPLICATE_ROW_CONTENT' && byRow[10].code !== 'DUPLICATE_UNIQUE_PROPERTY_VALUE') fail('identical rows');
if (!plan.errors.some((e) => e.row === 0 && e.code === 'PROPERTY_DEFINITION_NOT_FOUND' && e.column === 'Rara')) fail('unmapped header should be reported');
if (!plan.errors.some((e) => e.row === 3 && e.code === 'INVALID_ENUMERATION_OPTION')) fail('bad enumeration should be a property error, row kept');
if (!plan.errors.some((e) => e.row === 2 && e.code === 'INVALID_ADDITIONAL_EMAIL') || byRow[2].data.hs_additional_emails !== 'nuevo.uno@otro.com') fail('additional e-mails');
if (byRow[2].data.date_of_birth.slice(0, 10) !== '1990-02-01') fail('date conversion in plan');
plan = E.planImport(table, mapping, { mode: 'create', uniqueKey: 'email' });
log('create only:', codes(plan));
if (byRowOf(plan, 3).code !== 'CREATE_ONLY_IMPORT') fail('create-only should skip existing');
plan = E.planImport(table, mapping, { mode: 'update', uniqueKey: 'email' });
log('update only:', codes(plan));
if (byRowOf(plan, 2).code !== 'UPDATE_ONLY_IMPORT' || byRowOf(plan, 3).action !== 'update') fail('update-only mode');
function byRowOf(p, n) { return p.records.find((r) => r.rowNumber === n); }
// record ID prevails over e-mail
const idTable = E.parsePasted(`ID de registro\tCorreo electrónico\tCargo\n${known.id}\tcambiado@ejemplo.com\tDirección\n999999\tx@ejemplo.com\tNada`);
const idPlan = E.planImport(idTable, E.autoMap(idTable.headers, 'es', 'contacts'), { mode: 'create_update', uniqueKey: 'hs_object_id' });
log('by record id:', codes(idPlan), '| e-mail replaced:', idPlan.records[0].data.email);
if (idPlan.records[0].action !== 'update' || idPlan.records[0].matchId !== known.id || idPlan.records[1].code !== 'INVALID_RECORD_ID') fail('record id matching');
// a secondary e-mail identifies the contact but does not replace the primary one
data.setField('contacts', known.id, 'hs_additional_emails', 'secundario@ejemplo.com');
const secTable = E.parsePasted('Correo electrónico\tCargo\nsecundario@ejemplo.com\tGerencia');
const secPlan = E.planImport(secTable, E.autoMap(secTable.headers, 'es', 'contacts'), { mode: 'create_update', uniqueKey: 'email' });
log('secondary e-mail:', codes(secPlan), '| keeps primary:', secPlan.records[0].data.email === undefined);
if (secPlan.records[0].action !== 'update' || secPlan.records[0].data.email !== undefined) fail('secondary e-mail rule');

// ---------- mapping screen helpers ----------
const cols = E.validateColumns(table, mapping, { dateFormat: 'dmy' });
const lc = cols.find((c) => c.key === 'lifecycle');
log('lifecycle column errors:', lc.errors, '| bad values:', lc.badValues.map((b) => `${b.value}(${b.code})`).join(','));
if (lc.errors !== 1) fail('column validation');
lc.replacements = { Astronauta: 'Cliente' };
const fixed = E.validateColumns(table, cols, { dateFormat: 'dmy' }).find((c) => c.key === 'lifecycle');
log('after replacement errors:', fixed.errors);
if (fixed.errors !== 0) fail('value replacement should fix every row');
const newKey = E.createInlineProperty('contacts', 'Zona comercial', 'text');
log('inline property:', newKey, '| in catalog:', Boolean(E.propByKey('contacts', newKey)));
if (!E.propByKey('contacts', newKey)) fail('inline property creation');

// ---------- states and run ----------
const run = E.planImport(table, cols, { mode: 'create_update', uniqueKey: 'email', dateFormat: 'dmy' });
log('canStart:', JSON.stringify(E.canStart(run.summary.rows)));
const entry = E.registerImport({ name: 'Prueba', table, plan: run, options: { mode: 'create_update', mapping: cols } });
log('registered:', entry.id, entry.state, '| timeline:', E.importDetail(entry.id).timeline.map((x) => x.state).join('→'));
if (entry.state !== 'STARTED') fail('new import should be STARTED');
const before = data.allContacts().length;
const progress = [];
const result = await E.runImport(entry.id, { ...run, noOverwrite: [], createSegment: true, segmentName: 'Importación: Prueba' }, { onProgress: (p) => progress.push(p.done), chunk: 2, sleep: () => Promise.resolve() });
const after = E.importHistory().find((r) => r.id === entry.id);
log('run:', JSON.stringify({ created: result.created, updated: result.updated, failed: result.failed, state: result.state }), '| contacts', before, '->', data.allContacts().length, '| timeline:', E.importDetail(entry.id).timeline.map((x) => x.state).join('→'), '| progress:', progress.join(','));
if (result.state !== 'DONE' || after.state !== 'DONE' || result.created !== 4 || result.updated !== 1) fail('run result');
if (E.importDetail(entry.id).timeline.map((x) => x.state).join('→') !== 'STARTED→PROCESSING→DONE') fail('state timeline');
const updated = data.allContacts().find((c) => Number(c.id) === Number(known.id));
log('updated contact:', updated.last, '| lifecycle after the replacement Astronauta→Cliente:', updated.lifecycle, '| import ids:', updated.hs_import_ids);
if (updated.last !== 'Actualizado' || updated.lifecycle !== 'Cliente') fail('update semantics (replacement must apply)');
if (byRow[3].data.lifecycle !== undefined) fail('without the replacement the bad value must be dropped, not written');
const created = data.allContacts().find((c) => c.email === 'nuevo.uno@ejemplo.com');
log('created contact:', created.name, created.phone, created.lifecycle, created.hs_additional_emails, '| segment:', data.getViewStore('contacts').custom.map((v) => v.name).join(','));
if (!created || created.lifecycle !== 'Cliente' || !data.getViewStore('contacts').custom.some((v) => v.id === `imp${entry.id}`)) fail('created contact or segment');
// no-overwrite: a second import must not touch a property that already has a value
const t2 = E.parsePasted(`Correo electrónico\tCargo\n${known.email}\tNuevo cargo`);
data.setField('contacts', known.id, 'jobTitle', 'Cargo original');
const m2 = E.autoMap(t2.headers, 'es', 'contacts');
const e2 = E.registerImport({ name: 'No sobrescribir', table: t2, plan: E.planImport(t2, m2, {}), options: {} });
await E.runImport(e2.id, { ...E.planImport(t2, m2, {}), noOverwrite: ['jobTitle'] }, { sleep: () => Promise.resolve() });
log('no-overwrite kept:', data.allContacts().find((c) => Number(c.id) === Number(known.id)).jobTitle);
if (data.allContacts().find((c) => Number(c.id) === Number(known.id)).jobTitle !== 'Cargo original') fail('no-overwrite rule');
// cancel while processing
const big = E.parsePasted(['Nombre\tCorreo electrónico', ...Array.from({ length: 30 }, (_, i) => `C${i}\tc${i}@ejemplo.com`)].join('\n'));
const bigPlan = E.planImport(big, E.autoMap(big.headers, 'es', 'contacts'), {});
const e3 = E.registerImport({ name: 'Cancelar', table: big, plan: bigPlan, options: {} });
let ticks = 0;
const r3 = await E.runImport(e3.id, bigPlan, { chunk: 5, sleep: () => { ticks += 1; return Promise.resolve(); }, isCanceled: () => ticks >= 2 });
log('canceled run:', r3.state, '| created before cancel:', r3.created, '| stored:', E.importHistory().find((r) => r.id === e3.id).state);
if (r3.state !== 'CANCELED' || r3.created !== 10) fail('cancel');
// failure path
const e4 = E.registerImport({ name: 'Falla', table: big, plan: bigPlan, options: {} });
const r4 = await E.runImport(e4.id, { ...bigPlan, records: [{ action: 'update', matchId: 1, data: null, rowNumber: 2 }] }, { sleep: () => Promise.resolve() });
log('failed run:', r4.state, '| stored:', E.importHistory().find((r) => r.id === e4.id).state, '| note:', E.importDetail(e4.id).timeline.at(-1).note.slice(0, 40));
if (r4.state !== 'FAILED') fail('failure state');
// deferred when three are processing
const base = E.importHistory();
E.saveHistory([...base, ...[1, 2, 3].map((n) => ({ id: 900 + n, name: `P${n}`, object: 'contacts', state: 'PROCESSING', rows: 1, by: 'x', when: new Date().toISOString() }))]);
const e5 = E.registerImport({ name: 'Cola', table: t2, plan: E.planImport(t2, m2, {}), options: {} });
log('with 3 processing ->', e5.state);
if (e5.state !== 'DEFERRED') fail('deferred state');
E.saveHistory(E.importHistory().filter((r) => r.id < 900 && r.id !== e5.id));
// stale sweep and daily limits
E.saveHistory([...E.importHistory(), { id: 950, name: 'Vieja', object: 'contacts', state: 'PROCESSING', rows: 1, by: 'x', when: new Date(Date.now() - 20 * 60000).toISOString() }]);
E.sweepStale();
log('stale processing ->', E.importHistory().find((r) => r.id === 950).state);
if (E.importHistory().find((r) => r.id === 950).state !== 'FAILED') fail('stale sweep');
E.saveHistory(E.importHistory().filter((r) => r.id !== 950));
const many = Array.from({ length: 50 }, (_, i) => ({ id: 800 + i, name: 'x', object: 'contacts', state: 'DONE', rows: 10, by: 'x', when: new Date().toISOString() }));
const keep = E.importHistory();
E.saveHistory([...keep, ...many]);
log('50 imports today ->', JSON.stringify(E.canStart(1)));
if (E.canStart(1).ok) fail('daily import limit');
E.saveHistory(keep);
log('rows limit:', E.canStart(E.LIMITS.rowsPerDay + 1).code);

// ---------- downloads ----------
const detail = E.importDetail(entry.id);
const errCsv = E.errorsCsv(detail);
log('errors csv header:', errCsv.split('\n')[0], '| lines:', errCsv.split('\n').length);
if (!errCsv.startsWith('Código de error,Tipo de objeto,Razón,Impacto')) fail('errors csv');
const rowsCsv = E.failedRowsCsv(detail);
log('failed rows csv:', rowsCsv.split('\n')[0].slice(0, 60), '| rows:', rowsCsv.split('\n').length - 1, '| masked:', rowsCsv.includes('ELIMINADO'));
if (rowsCsv.split('\n').length - 1 !== detail.failedRows.length) fail('failed rows csv');
const zip = E.zipFiles([{ name: 'a.csv', text: errCsv }]);
log('zip bytes:', zip.length, '| signature:', [...zip.slice(0, 4)].map((b) => b.toString(16)).join(' '));
if (zip[0] !== 0x50 || zip[1] !== 0x4b) fail('zip signature');
log('sample file first line:', E.sampleCsv().split('\n')[0]);

// ---------- companies: name or domain required, domain is the unique identifier, domains are normalised ----------
const knownCo = data.allCompanies().find((c) => c.domain);
const coTable = E.parsePasted([
  'Nombre de la empresa\tNombre de dominio de la empresa\tNúmero de teléfono\tSector\tDominios adicionales',
  'Cristales Prueba\thttps://www.cristalesprueba.com/home\t55 1234 5678\tConstrucción\tcristalesprueba.mx;malo',
  `Actualizada\t${knownCo.domain}\t\tArquitectura\t`,
  '\tcristalesprueba.com\t\t\t',
  '\t\t+34 600 000 000\t\t',
  'Solo Nombre\t\t\t\t',
].join('\n'));
const coMap = E.autoMap(coTable.headers, 'es', 'companies');
log('companies map:', coMap.map((m) => m.key).join(','));
if (coMap.map((m) => m.key).join(',') !== 'name,domain,phone,industry,hs_additional_domains') fail('companies auto-map');
const coPlan = E.planImport(coTable, coMap, { object: 'companies', mode: 'create_update' });
log('companies plan:', codes(coPlan), '| unique:', coPlan.uniqueKey, '| domain normalised:', byRowOf(coPlan, 2).data.domain, '| extra domains:', byRowOf(coPlan, 2).data.hs_additional_domains);
if (coPlan.uniqueKey !== 'domain' || byRowOf(coPlan, 2).data.domain !== 'cristalesprueba.com') fail('company domain normalisation');
if (byRowOf(coPlan, 3).action !== 'update' || Number(byRowOf(coPlan, 3).matchId) !== Number(knownCo.id)) fail('company matched by domain');
if (byRowOf(coPlan, 4).code !== 'DUPLICATE_UNIQUE_PROPERTY_VALUE' || byRowOf(coPlan, 5).code !== 'MISSING_REQUIRED_PROPERTY' || byRowOf(coPlan, 6).action !== 'create') fail('company required / duplicate rules');
if (!coPlan.errors.some((e) => e.row === 2 && e.code === 'INVALID_ADDITIONAL_EMAIL') || byRowOf(coPlan, 2).data.hs_additional_domains !== 'cristalesprueba.mx') fail('additional domains');
const coEntry = E.registerImport({ name: 'Empresas', table: coTable, plan: coPlan, options: { object: 'companies' } });
const coRun = await E.runImport(coEntry.id, { ...coPlan, createSegment: true, segmentName: 'Importación: Empresas' }, { sleep: () => Promise.resolve() });
const newCo = data.allCompanies().find((c) => c.domain === 'cristalesprueba.com');
log('companies run:', JSON.stringify({ created: coRun.created, updated: coRun.updated, state: coRun.state }), '| new company:', newCo && `${newCo.name} · ${newCo.industry} · ${newCo.phone}`, '| segment:', data.getViewStore('companies').custom.some((v) => v.id === `imp${coEntry.id}`));
if (coRun.state !== 'DONE' || coRun.created !== 2 || coRun.updated !== 1 || !newCo || newCo.industry !== 'Construcción') fail('companies import run');

// ---------- deals: name, pipeline and stage required; stage must exist in the pipeline; company association ----------
const coNow = data.allCompanies().find((c) => Number(c.id) === Number(knownCo.id)); // renamed by the companies run above
knownCo.name = coNow.name;
const pipe = data.dealPipelines()[0];
const stages = data.stagesFor(pipe);
const dealTable = E.parsePasted([
  'Nombre del negocio\tPipeline\tEtapa del negocio\tImporte\tMoneda\tFecha de cierre\tEmpresa asociada\tPropietario del negocio',
  `Negocio Prueba\t${pipe}\t${stages[0][1]}\t1.250,50\tUSD\t31/12/2026\t${knownCo.name}\tSofía R.`,
  `Negocio Etapa Mala\t${pipe}\tEtapa inexistente\t100\t\t\t\t`,
  `Negocio Pipeline Malo\tPipeline inexistente\t${stages[0][1]}\t100\t\t\t\t`,
  `Sin etapa\t${pipe}\t\t100\t\t\t\t`,
  `Negocio Empresa Desconocida\t${pipe}\t${stages[0][0]}\t5000\tMXN\t\tEmpresa Fantasma\t`,
].join('\n'));
const dealMap = E.autoMap(dealTable.headers, 'es', 'deals');
log('deals map:', dealMap.map((m) => m.key).join(','));
if (dealMap.map((m) => m.key).join(',') !== 'name,pipeline,stage,amount,deal_currency_code,closeDate,company,owner') fail('deals auto-map');
const dealPlan = E.planImport(dealTable, dealMap, { object: 'deals', mode: 'create_update' });
log('deals plan:', codes(dealPlan), '| unique:', dealPlan.uniqueKey, '| first:', JSON.stringify({ stage: byRowOf(dealPlan, 2).data.stage, amount: byRowOf(dealPlan, 2).data.amount, companyId: byRowOf(dealPlan, 2).data.companyId, owner: byRowOf(dealPlan, 2).data.owner }));
if (dealPlan.uniqueKey !== 'hs_object_id' || byRowOf(dealPlan, 2).action !== 'create' || byRowOf(dealPlan, 2).data.stage !== stages[0][0] || byRowOf(dealPlan, 2).data.amount !== 1250.5 || Number(byRowOf(dealPlan, 2).data.companyId) !== Number(knownCo.id)) fail('deal row conversion / association');
if (byRowOf(dealPlan, 3).code !== 'INVALID_DEAL_STAGE' || byRowOf(dealPlan, 4).code !== 'INVALID_PIPELINE' || byRowOf(dealPlan, 5).code !== 'MISSING_REQUIRED_PROPERTY') fail('deal pipeline/stage rules');
if (byRowOf(dealPlan, 6).action !== 'create' || !dealPlan.errors.some((e) => e.row === 6 && e.code === 'ASSOCIATION_RECORD_NOT_FOUND')) fail('unknown company should import without association');
const dealEntry = E.registerImport({ name: 'Negocios', table: dealTable, plan: dealPlan, options: { object: 'deals' } });
const dealRun = await E.runImport(dealEntry.id, dealPlan, { sleep: () => Promise.resolve() });
const newDeal = data.allDeals().find((d) => d.name === 'Negocio Prueba');
log('deals run:', JSON.stringify({ created: dealRun.created, associations: dealRun.associations, state: dealRun.state }), '| new deal:', newDeal && `${newDeal.pipeline} · ${newDeal.stage} · ${newDeal.amount} ${newDeal.deal_currency_code} · ${newDeal.company}`);
if (dealRun.state !== 'DONE' || dealRun.created !== 2 || dealRun.associations !== 1 || !newDeal || newDeal.company !== knownCo.name || newDeal.deal_currency_code !== 'USD') fail('deals import run');
// deals update by record ID (the only identifier of deals)
const idDeals = E.parsePasted(`ID de registro\tImporte\n${newDeal.id}\t9999\n${newDeal.id}\t1`);
const idDealPlan = E.planImport(idDeals, E.autoMap(idDeals.headers, 'es', 'deals'), { object: 'deals' });
log('deals by id:', codes(idDealPlan));
if (idDealPlan.records[0].action !== 'update' || idDealPlan.records[1].code !== 'DUPLICATE_RECORD_ID') fail('deal record id rules');
// tickets: pipeline and status; tasks: title and due date
const tkTable = E.parsePasted(`Nombre del ticket\tPipeline\tEstado del ticket\tPrioridad\nTicket Prueba\t${data.ticketPipelines()[1]}\t${data.TICKET_STATUSES[1][1]}\tAlta\nTicket sin estado\t${data.ticketPipelines()[0]}\t\t`);
const tkPlan = E.planImport(tkTable, E.autoMap(tkTable.headers, 'es', 'tickets'), { object: 'tickets' });
log('tickets plan:', codes(tkPlan), '| first:', JSON.stringify({ pipeline: tkPlan.records[0].data.pipeline, status: tkPlan.records[0].data.status, priority: tkPlan.records[0].data.priority }));
if (tkPlan.records[0].action !== 'create' || tkPlan.records[0].data.status !== data.TICKET_STATUSES[1][0] || tkPlan.records[0].data.priority !== 'high' || tkPlan.records[1].code !== 'MISSING_REQUIRED_PROPERTY') fail('tickets rules');
const taskTable = E.parsePasted('Título\tFecha de vencimiento\tTipo de tarea\nLlamar a la empresa\t15/12/2026\tLlamada\nSin fecha\t\t');
const taskPlan = E.planImport(taskTable, E.autoMap(taskTable.headers, 'es', 'tasks'), { object: 'tasks' });
log('tasks plan:', codes(taskPlan), '| due:', taskPlan.records[0].data.due?.slice(0, 10));
if (taskPlan.records[0].action !== 'create' || taskPlan.records[1].code !== 'MISSING_REQUIRED_PROPERTY') fail('tasks rules');
log('sample files:', E.OBJECT_KEYS.map((k) => `${k}: ${E.sampleCsv(k).split('\n')[0].split(',').length} cols`).join(' | '));

// ---------- wizard pages ----------
dom = boot('http://localhost/data/import/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>');
const W = await import(resolve(here, '../src/import-wizard.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
log('step 1:', document.querySelector('.imp__steps li.is-current').textContent.trim(), '| file input accepts:', $('imp-file').getAttribute('accept').split(',').slice(0, 3).join(','), '| next disabled:', document.querySelector('[data-act="next1"]').disabled);
$('imp-paste').value = 'Nombre\tApellidos\tCorreo electrónico\tEtapa del ciclo de vida\tRara\nWiz\tUno\twiz.uno@ejemplo.com\tAstronauta\tx\nWiz\tDos\twiz.dos@ejemplo.com\tLead\ty';
click(document.querySelector('[data-act="use-paste"]'));
log('after paste:', document.querySelector('.imp__ok')?.textContent.trim(), '| next enabled:', !document.querySelector('[data-act="next1"]').disabled);
click(document.querySelector('[data-act="next1"]'));
log('step 2 summary:', document.querySelector('.imp__summary').textContent.trim());
const mapRows = [...document.querySelectorAll('.imp__map tbody tr')].map((r) => `${r.querySelector('td strong')?.textContent}=${r.querySelector('select[data-map]')?.value}`);
log('mapping rows:', mapRows.join(' | '));
if (!mapRows.includes('Rara=')) fail('unknown header should be unmapped');
// inline property for the unknown column
const raraSel = [...document.querySelectorAll('select[data-map]')].find((s) => s.closest('tr').textContent.includes('Rara'));
raraSel.value = '__new';
raraSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
$('np-name').value = 'Columna rara';
click(document.querySelector('[data-act="np-create"]'));
log('new property mapped:', [...document.querySelectorAll('select[data-map]')].find((s) => s.closest('tr').textContent.includes('Rara')).value);
// fix the bad enumeration value in the side panel
click(document.querySelector('[data-errors]'));
log('panel:', document.querySelector('.imp__panel h3').textContent, '| bad values:', document.querySelectorAll('.imp__bad').length);
document.querySelector('[data-replace-input]').value = 'Cliente';
click(document.querySelector('[data-replace]'));
log('after fix:', document.querySelector('.imp__summary').textContent.trim(), '| edited mark:', Boolean(document.querySelector('.imp__assigned em')));
if (document.querySelector('[data-errors]')) fail('errors should be gone after the replacement');
click(document.querySelector('[data-act="next2"]'));
log('step 3 finish disabled without consent:', document.querySelector('[data-act="finish"]').disabled, '| plan:', document.querySelector('.imp__plan').textContent.trim());
$('imp-consent').checked = true;
$('imp-consent').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
$('imp-segment').checked = true;
$('imp-segment').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
log('finish enabled:', !document.querySelector('[data-act="finish"]').disabled);
await W.finish();
await new Promise((r) => setTimeout(r, 50));
log('review state:', document.querySelector('.imp__state').textContent, '| timeline:', [...document.querySelectorAll('.imp__tl strong')].map((s) => s.textContent).join('→'), '| stats:', [...document.querySelectorAll('.imp__stat strong')].map((s) => s.textContent).join('/'));
if (document.querySelector('.imp__state').textContent !== 'Completada') fail('wizard should finish in DONE');
const wiz = data.allContacts().find((c) => c.email === 'wiz.uno@ejemplo.com');
log('wizard contact:', wiz && `${wiz.name} · ${wiz.lifecycle} · rara=${wiz[Object.keys(wiz).find((k) => k.startsWith('imp_'))]}`);
if (!wiz || wiz.lifecycle !== 'Cliente') fail('wizard import result');
// review page by id (as opened from the monitor)
const lastId = E.importHistory()[0].id;
dom = boot(`http://localhost/data/import/?id=${lastId}`, '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>');
await import(resolve(here, '../src/import-wizard.js') + '?review');
log('review by id:', document.querySelector('.imp__review-head h2').textContent, '|', document.querySelector('.imp__state').textContent, '| error rows table:', Boolean(document.querySelector('.imp__errors')), '| downloads:', document.querySelectorAll('[data-act^="dl-"]').length);
log('OK');

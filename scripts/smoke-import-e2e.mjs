// End-to-end check of the file import on the five objects with realistic files (scripts/import-fixtures.mjs):
// the wizard page itself (upload or paste → automatic and manual mapping, a property created inline → mode,
// unique identifier, number format, consent → preview → import → review page with the real counts → error
// downloads → monitor row → undo), and the records that land in the data layer: converted types, resolved owner,
// associations (company by name / domain, the e-mail-domain rule), de-duplication (no duplicates, no lost
// updates), the ledger «Deshacer» removes, and a history whose counts match the records.
// Run: node scripts/smoke-import-e2e.mjs            (JSDOM + localStorage)
//      SMOKE_LIVE=1 node scripts/smoke-import-e2e.mjs (the same wizard against the real Supabase project with a
//      throw-away «SMOKE» user; every row is checked with SQL; everything the run created is removed)
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke, lit } from './smoke-live.mjs';
import { cleanupImportSmoke } from './import-smoke-cleanup.mjs';
import { contactsFixture, contactsXlsx, companiesFixture, toCsv, toTsv, dealsFixture, ticketsFixture, tasksFixture, contactsAssocFixture } from './import-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'import-e2e';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fileOf = (name, bytes) => {
  const buf = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return { name, size: buf.byteLength, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), text: () => Promise.resolve(typeof bytes === 'string' ? bytes : new TextDecoder().decode(buf)) };
};
const localDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const DIRECTORY = [['Fernando L.', 'fernando.l@megaglass.us'], ['Sofía R.', 'sofia.r@megaglass.us'], ['Diego G.', 'diego.g@megaglass.us'], ['Laura M.', 'laura.m@megaglass.us']].map(([name, email], i) => ({ name, email, team: ['Ventas', 'Soporte', 'Marketing'][i % 3], role: 'Usuario' }));

// ---------------------------------------------------------------------------------------------------------------
// The scenario: the same steps in local and live mode. `ctx` brings data.js, the engine, the fixtures' base
// records, the checker, and (live) the SQL runner.
// ---------------------------------------------------------------------------------------------------------------
async function scenario({ data, E, P, check, log, live = false, stamp = '', one = null, sql = null, session = null }) {
  const $ = (id) => document.getElementById(id);
  const q = (sel) => document.querySelector(sel);
  const click = (el) => { check(Boolean(el), 'click target exists'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
  const change = (el, value) => { if (value !== undefined) el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const text = (sel) => (q(sel) ? q(sel).textContent.replace(/\s+/g, ' ').trim() : '');
  let n = 0;
  // the people the owner column can name (Configuración › Usuarios y equipos keeps this directory in the browser)
  localStorage.setItem('crm:users', JSON.stringify(DIRECTORY));

  // ---- base records the files refer to ----
  const uniq = (list, key) => { const seen = new Map(); list.forEach((r) => { const k = String(r[key] || '').toLowerCase(); if (k) seen.set(k, (seen.get(k) || 0) + 1); }); return list.filter((r) => r[key] && seen.get(String(r[key]).toLowerCase()) === 1); };
  let existing; let companies; let existingCompany;
  if (live) {
    existing = [1, 2, 3].map((i) => data.addRecord('contacts', { first: 'SMOKE', last: `Existente ${i} ${stamp}`, name: `SMOKE Existente ${i} ${stamp}`, email: `smoke.${stamp}.ex${i}@smoke-${stamp}-auto.test`, jobTitle: 'Cargo original', owner: 'Sin asignar', lifecycle: 'Lead', status: 'new', source: 'Formulario' }, { skipAutoCompany: true }));
    companies = ['a', 'b'].map((s) => data.addRecord('companies', { name: `SMOKE Empresa ${s.toUpperCase()} ${stamp}`, domain: `smoke-${stamp}-${s}.test`, owner: 'Sin asignar', lifecycle: 'Lead' }));
    existingCompany = data.addRecord('companies', { name: `SMOKE Empresa Base ${stamp}`, domain: `smoke-${stamp}-base.test`, city: 'Ciudad vieja', owner: 'Sin asignar', lifecycle: 'Lead' });
  } else {
    existing = uniq(data.allContacts(), 'email').slice(0, 3);
    const withDomain = uniq(data.allCompanies(), 'domain').filter((c) => c.domain && !/^smoke/i.test(c.name));
    companies = withDomain.slice(0, 2);
    existingCompany = withDomain[2];
  }
  const twins = [1, 2].map(() => data.addRecord('companies', { name: `SMOKE Gemelos ${stamp || 'local'}`, domain: '', owner: 'Sin asignar', lifecycle: 'Lead' }));
  await data.dbIdle();
  const existingBefore = existing.map((c) => ({ ...data.findRecord('contacts', c.id) }));
  check(existing.length === 3 && companies.length === 2 && existingCompany && twins.length === 2, 'base records for the files');
  log(`base: contacts ${existing.map((c) => c.email).join(', ')} · companies ${companies.map((c) => c.domain).join(', ')} · ${existingCompany.domain} · twins «${twins[0].name}»`);

  // ---- the wizard page, fresh for every import (the module binds its root at import time) ----
  async function freshPage(rootId, path, module) {
    const old = $(rootId);
    const fresh = document.createElement('main');
    fresh.id = rootId;
    fresh.className = 'content content--dint';
    if (old) old.replaceWith(fresh); else document.body.appendChild(fresh);
    window.history.replaceState(null, '', path);
    return import(resolve(here, `../src/${module}`) + `?e2e=${n++}`);
  }
  const entryOf = (id) => E.importHistory().find((r) => Number(r.id) === Number(id));
  // a catalogue property the file left empty shows the app's sample decoration (never stored): read it as empty
  const real = (type, rec, key) => (data.isDecorated(type, rec, key) ? undefined : rec[key]);
  const waitDone = async (id, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const e = entryOf(id); if (e && ['DONE', 'FAILED', 'CANCELED'].includes(e.state)) return e; await wait(100); } return entryOf(id); };

  // Drives the wizard for one file / paste and verifies every screen. Returns the history entry and its detail.
  async function wizardImport({ type, file, paste, name, expect, expectKeys, numberFormat, adjust, mode = 'create_update' }) {
    const W = await freshPage('imp-root', '/data/import/', 'import-wizard.js');
    if (type !== 'contacts') { W.state.flow = 'advanced'; W.setObject(type); W.renderStep1(); }
    check(q('.imp__steps li.is-current')?.textContent.includes('Subir archivo'), `${type}: step 1`);
    if (file) await W.loadFiles([file]); else { $('imp-paste').value = paste; click(q('[data-act="use-paste"]')); }
    check(!W.state.fileError, `${type}: file read without error (${W.state.fileError})`);
    check(W.state.table && W.state.table.rows.length === expect.rows, `${type}: ${expect.rows} rows read (got ${W.state.table && W.state.table.rows.length})`);
    check(text('.imp__ok').includes(`${expect.rows} filas`), `${type}: the page shows the row count (${text('.imp__ok')})`);
    click(q('[data-act="next1"]'));
    // step 2: automatic mapping, then the manual changes
    check(q('.imp__steps li.is-current')?.textContent.includes('Mapear'), `${type}: step 2`);
    const keys = () => [...document.querySelectorAll('select[data-map]')].map((s) => s.value);
    log(`${type}: auto-map ${keys().map((k) => k || '∅').join(',')}`);
    check(keys().join(',') === expectKeys.join(','), `${type}: automatic mapping (expected ${expectKeys.join(',')})`);
    if (adjust) await adjust(W, { keys, change, click, q, $ });
    click(q('[data-act="next2"]'));
    await wait(live ? 1500 : 50); // live: the duplicate check re-reads the table from Supabase first
    // step 3: duplicates, mode, identifier, formats, consent, preview
    check(q('.imp__steps li.is-current')?.textContent.includes('Detalles'), `${type}: step 3`);
    const stats = [...document.querySelectorAll('.imp__dupstat strong')].map((s) => Number(s.textContent.replace(/\./g, '')));
    const inFile = Object.values(expect.rowCodes).filter((c) => c === 'DUPLICATE_UNIQUE_PROPERTY_VALUE').length;
    log(`${type}: duplicates → existing ${stats[0]}, in file ${stats[1]}, new ${stats[2]}${live ? ` · ${text('#imp-dups p.muted').includes('lectura reciente de Supabase') ? 'checked against a fresh read of Supabase' : 'NOT a fresh read'}` : ''}`);
    check(stats[0] === expect.updated && stats[1] === inFile && stats[2] === expect.created, `${type}: duplicate statistics (${stats.join('/')} vs ${expect.updated}/${inFile}/${expect.created})`);
    if (live) check(text('#imp-dups p.muted').includes('lectura reciente de Supabase'), `${type}: the duplicate check ran against a fresh read of Supabase`);
    change(q(`input[name="mode"][value="${mode}"]`));
    const unique = $('imp-unique');
    check(unique.value === expect.uniqueKey, `${type}: unique identifier ${unique.value} (expected ${expect.uniqueKey})`);
    if (numberFormat) change($('imp-num'), numberFormat);
    change($('imp-date'), 'dmy');
    $('imp-name').value = name; $('imp-name').dispatchEvent(new window.Event('input', { bubbles: true }));
    check(q('[data-act="finish"]').disabled, `${type}: «Finalizar» waits for the consent`);
    $('imp-consent').checked = true; change($('imp-consent'));
    check(!q('[data-act="finish"]').disabled, `${type}: consent enables «Finalizar»`);
    const plan = text('.imp__plan');
    log(`${type}: preview → ${plan.replace('Vista previa del resultado: ', '')}`);
    check(plan.includes(`${expect.created} registros nuevos`) && plan.includes(`${expect.updated} actualizaciones`) && plan.includes(`${expect.skipped} filas no se importarán`), `${type}: the preview announces ${expect.created} new / ${expect.updated} updates / ${expect.skipped} skipped`);
    // import
    click(q('[data-act="finish"]'));
    await wait(20);
    const id = W.state.importId;
    check(id && String(id).length >= 13, `${type}: the import id is unique in time (${id})`);
    const entry = await waitDone(id, live ? 240000 : 30000);
    // DONE itself must guarantee that the import's association writes have drained.
    check(entry && entry.state === 'DONE', `${type}: the import finished (${entry && entry.state}: ${E.importDetail(id)?.timeline.at(-1)?.note || ''})`);
    await wait(50);
    W.renderReview();
    const detail = E.importDetail(id);
    // review page: state, timeline, counts, errors
    check(text('.imp__state') === 'Completada', `${type}: review state «Completada»`);
    check(detail.timeline.map((t) => t.state).join('→') === 'STARTED→PROCESSING→DONE', `${type}: timeline STARTED→PROCESSING→DONE`);
    const shown = [...document.querySelectorAll('.imp__stat strong')].map((s) => Number(s.textContent.replace(/\./g, '')));
    log(`${type}: review → rows ${shown[0]} · new ${shown[1]} · updated ${shown[2]} · associations ${shown[3]} · duplicates ${shown[4]} · errors ${shown[5]}`);
    check(shown[0] === expect.rows && shown[1] === expect.created && shown[2] === expect.updated, `${type}: review counts new/updated (${shown[1]}/${shown[2]} vs ${expect.created}/${expect.updated})`);
    check(entry.newRecords === expect.created && entry.updated === expect.updated && entry.rows === expect.rows, `${type}: history entry counts`);
    const ledgerCount = Object.values(detail.createdIds || {}).reduce((s, l) => s + l.length, 0);
    check((detail.createdIds[type] || []).length === expect.created, `${type}: the ledger has exactly the ${expect.created} created records (${(detail.createdIds[type] || []).length})`);
    // every failed row with its code and reason; every property error with its row
    const failed = Object.fromEntries((detail.failedRows || []).map((r) => [r.row, r.code]));
    Object.entries(expect.rowCodes).forEach(([row, code]) => check(failed[row] === code, `${type}: row ${row} fails with ${code} (got ${failed[row]})`));
    check(Object.keys(failed).length === expect.skipped, `${type}: ${expect.skipped} failed rows (${Object.keys(failed).length})`);
    Object.entries(expect.propertyErrors || {}).forEach(([row, codes]) => codes.forEach((code) => check(detail.errors.some((e) => Number(e.row) === Number(row) && e.code === code && !e.rowDropped), `${type}: row ${row} reports ${code} and is still imported`)));
    const expectedErrors = expect.skipped + Object.values(expect.propertyErrors || {}).reduce((s, l) => s + l.length, 0) + (expect.headerErrors || 0);
    check(detail.errors.length === expectedErrors && shown[5] === expectedErrors && entry.errors === expectedErrors, `${type}: ${expectedErrors} errors in the detail, the review and the history (${detail.errors.length}/${shown[5]}/${entry.errors})`);
    detail.errors.forEach((e) => check(e.code && E.errorMeaning(e.code) && e.impact && (e.row > 0 || e.column), `${type}: every error has a code, a reason, an impact and its row or column`));
    const groups = document.querySelectorAll('.imp__errors tbody tr').length;
    check(expectedErrors ? groups > 0 : text('.imp__card:last-of-type').includes('Sin errores'), `${type}: the error table matches the errors`);
    // downloads: the errors file names every error with its row and reason; the failed-rows file every skipped row
    const errCsv = E.errorsCsv(detail, type).split('\n');
    check(errCsv.length === detail.errors.length + 1 && errCsv[0].startsWith('Código de error,Tipo de objeto,Razón,Impacto,Fila'), `${type}: errors CSV has one line per error`);
    Object.entries(expect.rowCodes).forEach(([row, code]) => check(errCsv.some((l) => l.startsWith(`${code},`) && l.includes(`,${row},`) && l.includes(E.errorMeaning(code).split(',')[0])), `${type}: errors CSV names row ${row} with ${code} and its reason`));
    const rowsCsv = E.failedRowsCsv(detail).split('\n');
    check(rowsCsv.length === expect.skipped + 1, `${type}: failed-rows CSV has ${expect.skipped} rows`);
    check(Boolean(q('[data-act="dl-errors"]')) === expectedErrors > 0 && Boolean(q('[data-act="dl-rows"]')) === expect.skipped > 0, `${type}: download buttons present when there is something to download`);
    check(Boolean(q('[data-act="undo-import"]')) === (expect.created > 0), `${type}: «Deshacer importación» offered when records were created`);
    check(q(`a[href$="/${type}/"]`), `${type}: «Ver ${type}» link`);
    return { W, id, entry, detail, ledgerCount };
  }
  // the monitor (Integración de datos): the row of an import with the same counts as its history entry
  async function monitorRow(id) {
    await freshPage('dint-root', '/data/', 'integration.js');
    const row = q(`tr[data-id="${id}"]`);
    check(row, `monitor: row of import ${id}`);
    const cell = (k) => row.querySelector(`td[data-key="${k}"]`)?.textContent.trim();
    const e = entryOf(id);
    const num = (v) => (v === '--' ? 0 : Number(v));
    check(num(cell('newRecords')) === e.newRecords && num(cell('updated')) === e.updated && num(cell('associations')) === e.associations && num(cell('errors')) === e.errors, `monitor: counts of «${e.name}» = ${cell('newRecords')}/${cell('updated')}/${cell('associations')}/${cell('errors')}`);
    check(e.undone ? cell('state').includes('Anulada') : /Listo|Completada/.test(cell('state')) && !cell('state').includes('Anulada'), `monitor: state «${cell('state')}» (undone: ${Boolean(e.undone)})`);
    return row;
  }

  // =============================================================================================================
  // (a) contacts: XLSX of 100 rows with every edge case
  // =============================================================================================================
  const fxA = contactsFixture({ existing: existing.map((c) => ({ email: c.email, first: c.first })), companies: companies.map((c) => ({ id: c.id, name: c.name, domain: c.domain })), stamp });
  fxA.expect.uniqueKey = 'email';
  const contactsBefore = data.allContacts().length;
  const companiesBefore = new Set(data.allCompanies().map((c) => Number(c.id)));
  const customKey = `imp_${fxA.expect.customLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  // a previous run may have left the property in the account: the wizard must create it during this run
  if (E.propByKey('contacts', customKey)) { await P.saveCustomProperties('contacts', P.customProperties('contacts').filter((p) => p.key !== customKey)); check(!E.propByKey('contacts', customKey), 'contacts: the custom property starts absent'); }
  const A = await wizardImport({
    type: 'contacts', file: fileOf('contactos-100.xlsx', contactsXlsx(fxA)), name: `Contactos 100 ${stamp || 'local'}`, expect: fxA.expect,
    expectKeys: ['first', 'last', 'email', 'phone', 'company', 'jobTitle', 'owner', 'lifecycle', 'date_of_birth', 'annualrevenue', 'country', '', 'status'],
    adjust: async (W, { keys, change, click, q, $ }) => {
      // manual mapping: «Zona comercial» is not a property yet → create it inline; «Cargo» un-mapped and mapped again
      const zone = q('select[data-map="11"]');
      change(zone, '__new');
      check($('np-name') && $('np-name').value === fxA.expect.customLabel, 'contacts: the new-property form proposes the header as name');
      click(q('[data-act="np-create"]'));
      check(q('select[data-map="11"]').value === customKey && E.propByKey('contacts', customKey), `contacts: «${fxA.expect.customLabel}» created and mapped (${customKey})`);
      change(q('select[data-map="5"]'), '');
      check(q('tr[data-i="5"]').classList.contains('is-skipped'), 'contacts: an un-mapped column is marked «No importar»');
      change(q('select[data-map="5"]'), 'jobTitle');
      check(keys()[5] === 'jobTitle' && !q('tr[data-i="5"]').classList.contains('is-skipped'), 'contacts: manual mapping back to «Cargo»');
      const errBtn = q('[data-errors="8"]');
      check(errBtn && /\[2\]/.test(errBtn.textContent), `contacts: the date column announces its 2 bad values (${errBtn && errBtn.textContent})`);
      click(errBtn);
      check(q('.imp__panel') && document.querySelectorAll('.imp__bad').length === 2, 'contacts: the column panel lists the two bad dates');
      click(q('[data-act="panel-close"]'));
      check(text('.imp__summary').includes('13 de 13 columnas asignadas'), `contacts: 13 of 13 columns mapped (${text('.imp__summary')})`);
    },
  });
  // the records: every valid row landed with its converted values, owner, company, custom property and stamp
  const byEmail = (e) => data.allContacts().filter((c) => String(c.email || '').toLowerCase() === e);
  const created = A.detail.createdIds.contacts.map(Number);
  check(data.allContacts().length === contactsBefore + fxA.expect.created, `contacts: ${fxA.expect.created} more contacts in the index (${data.allContacts().length - contactsBefore})`);
  Object.entries(fxA.expect.emailOf).forEach(([row, email]) => {
    const hits = byEmail(email);
    check(hits.length === 1, `contacts: row ${row} (${email}) exists exactly once (${hits.length})`);
    const c = hits[0];
    check(created.includes(Number(c.id)), `contacts: row ${row} is in the ledger`);
    check(String(c.hs_import_ids) === String(A.id), `contacts: row ${row} stamped with the import id`);
    check(c.owner === fxA.expect.ownerOf[row], `contacts: row ${row} owner «${c.owner}» (expected «${fxA.expect.ownerOf[row]}»)`);
    const rev = fxA.expect.revenueOf[row];
    const gotRev = real('contacts', c, 'annualrevenue');
    check(rev === undefined ? (gotRev === undefined || gotRev === '' || gotRev === null) : gotRev === rev, `contacts: row ${row} revenue ${JSON.stringify(gotRev)} (expected ${rev})`);
    const birth = fxA.expect.birthOf[row];
    const gotBirth = real('contacts', c, 'date_of_birth');
    check(birth ? localDate(gotBirth) === birth : !gotBirth, `contacts: row ${row} birth date ${gotBirth} (expected ${birth || 'empty'})`);
    check(c[customKey] === fxA.expect.customOf[row], `contacts: row ${row} custom property «${c[customKey]}»`);
    if (fxA.expect.phoneOf[row]) check(c.phone === fxA.expect.phoneOf[row], `contacts: row ${row} numeric phone cell → ${c.phone}`);
    check(c.phone && /^\+\d+/.test(c.phone), `contacts: row ${row} phone normalised (${c.phone})`);
    check(c.name && c.first && c.source === 'Importación', `contacts: row ${row} name/first/source`);
  });
  fxA.expect.companyRows.forEach(({ row, companyId, name }) => { const c = byEmail(fxA.expect.emailOf[row])[0]; check(Number(c.companyId) === Number(companyId) && c.company === name, `contacts: row ${row} associated to «${name}» by name or domain`); });
  const autoLinked = fxA.expect.noCompanyRows.map((row) => byEmail(fxA.expect.emailOf[row])[0]);
  log('domain diagnostics: ' + JSON.stringify(fxA.expect.noCompanyRows.map((row, i) => { const c = autoLinked[i]; const rule = data.companyDomainFor(c); return { row, id: c.id, email: c.email, companyId: c.companyId, rule, candidates: data.companiesByDomain(rule.domain).map(k => ({ id: k.id, domain: k.domain, existedBefore: companiesBefore.has(Number(k.id)) })) }; })));
  if (live) log('domain SQL: ' + JSON.stringify(await sql(`select id, email, company_id from public.contacts where id in (${autoLinked.map(c => c.id).join(',')})`)));
  check(autoLinked.every((c) => c.companyId && !companiesBefore.has(Number(c.companyId)) || companies.some((k) => Number(k.id) === Number(c.companyId))), 'contacts: rows without a known company were linked by the e-mail-domain rule');
  const autoCompanies = (A.detail.createdIds.companies || []).map(Number);
  check(autoCompanies.length === 1 && data.findRecord('companies', autoCompanies[0])?.domain === (live ? `smoke-${stamp}-auto.test` : 'ejemplo.com'), `contacts: the rule created one company (ejemplo.com) and the ledger has it (${autoCompanies.length})`);
  const changedLinks = fxA.expect.updates.filter((u) => u.companyId && Number(existingBefore.find((c) => c.email === u.email)?.companyId) !== Number(u.companyId)).length;
  check(A.entry.associations === fxA.expect.created + changedLinks, `contacts: ${A.entry.associations} associations = ${fxA.expect.created} created rows + ${changedLinks} updated links`);
  // updates: the existing contacts changed and were not duplicated
  fxA.expect.updates.forEach((u) => {
    const hits = byEmail(String(u.email).toLowerCase());
    check(hits.length === 1 && !created.includes(Number(hits[0].id)), `contacts: existing ${u.email} updated in place, not duplicated`);
    check(hits[0].jobTitle === u.jobTitle && String(hits[0].hs_import_ids || '').split(';').includes(String(A.id)), `contacts: existing ${u.email} got «${u.jobTitle}» and the import stamp`);
  });
  // invalid and duplicate rows never landed
  [9, 27, 48, 73].forEach((row) => check(!data.allContacts().some((c) => String(c.email || '').includes(String(fxA.rows[row - 2][2]).trim())), `contacts: bad e-mail of row ${row} not imported`));
  check(byEmail(fxA.expect.emailOf[5]).length === 1 && byEmail(fxA.expect.emailOf[20]).length === 1 && byEmail(fxA.expect.emailOf[44]).length === 1, 'contacts: repeated e-mails produced one contact each');
  log(`contacts: ${created.length} created, ${fxA.expect.updates.length} updated, ${A.entry.associations} associations, ${A.detail.errors.length} errors, ledger ${A.ledgerCount} (incl. ${autoCompanies.length} auto company)`);
  await monitorRow(A.id);
  if (live) {
    const cnt = await one(`select count(*)::int as n from public.contacts where deleted_at is null and extra->>'hs_import_ids' = ${lit(String(A.id))}`);
    check(cnt.n === fxA.expect.created + fxA.expect.updated, `live: ${cnt.n} contacts stamped with the import in Supabase (expected ${fxA.expect.created + fxA.expect.updated})`);
    const inDb = await one(`select count(*)::int as n from public.contacts where id in (${created.join(',')}) and deleted_at is null`);
    check(inDb.n === created.length, `live: the ${created.length} ledger ids exist in contacts`);
    const dup = await one(`select count(*)::int as n from (select lower(email) e from public.contacts where deleted_at is null and email like ${lit(`smoke.${stamp}.%`)} group by lower(email) having count(*) > 1) d`);
    check(dup.n === 0, 'live: no duplicated e-mails among the imported contacts');
    const types = await one(`select count(*) filter (where jsonb_typeof(extra->'annualrevenue') = 'number')::int as rev, count(*) filter (where (extra->>'date_of_birth') ~ '^1990-10-2[78]T')::int as birth, count(*) filter (where owner = 'Sofía R.')::int as sofia, count(*) filter (where company_id is not null)::int as linked, count(*) filter (where extra->>${lit(customKey)} is not null)::int as custom, count(*) filter (where phone ~ '^\\+[0-9]+')::int as phones from public.contacts where id in (${created.join(',')})`);
    const expRev = Object.values(fxA.expect.revenueOf).filter((v) => v !== undefined).length;
    const expBirth = Object.values(fxA.expect.birthOf).filter(Boolean).length;
    const expSofia = Object.values(fxA.expect.ownerOf).filter((o) => o === 'Sofía R.').length;
    log(`live: types in Supabase → revenue numbers ${types.rev}/${expRev}, birth dates ${types.birth}/${expBirth}, owner Sofía ${types.sofia}/${expSofia}, linked ${types.linked}/${created.length}, custom ${types.custom}/${created.length}, phones ${types.phones}/${created.length}`);
    check(types.rev === expRev && types.birth === expBirth && types.sofia === expSofia && types.linked === created.length && types.custom === created.length && types.phones === created.length, 'live: converted types, owner, links, custom property and phones landed in Supabase');
    const links = await one(`select count(*)::int as n from public.contact_companies where contact_id in (${created.join(',')})`);
    check(links.n === created.length, `live: contact_companies has a link for each created contact (${links.n})`);
    const upd = await one(`select count(*)::int as n from public.contacts where id in (${existing.map((c) => c.id).join(',')}) and job_title like 'Actualizado %' and extra->>'hs_import_ids' = ${lit(String(A.id))}`);
    check(upd.n === 3, `live: the 3 existing contacts were updated in place (${upd.n})`);
    const hist = await one(`select value from public.user_settings where user_id = ${lit(session.uid)} and key = 'crm:imports'`);
    const remoteEntry = (hist?.value || []).find((r) => Number(r.id) === Number(A.id));
    check(remoteEntry && remoteEntry.state === 'DONE' && remoteEntry.newRecords === fxA.expect.created, `live: the history is in user_settings with the real counts (${JSON.stringify(remoteEntry && { state: remoteEntry.state, newRecords: remoteEntry.newRecords })})`);
    const det = await one(`select value from public.user_settings where user_id = ${lit(session.uid)} and key = ${lit(E.DETAIL_KEY(A.id))}`);
    check(det?.value?.createdIds?.contacts?.length === created.length, `live: the detail (ledger) is in user_settings (${det?.value?.createdIds?.contacts?.length})`);
    // Decision of 27-nov-2026: the durable history is the import_jobs table (user, file, state, counts, ledger).
    const jobRow = await one(`select estado, nombre, objeto, new_count, updated_count, errors_count, user_id::text as user_id, jsonb_array_length(coalesce(undo_ledger->'contacts', '[]'::jsonb))::int as ledger from public.import_jobs where id = ${Number(A.id)}`);
    check(jobRow && jobRow.estado === 'DONE' && jobRow.objeto === 'contacts' && jobRow.new_count === fxA.expect.created && jobRow.updated_count === fxA.expect.updated && jobRow.user_id === session.uid && jobRow.ledger === created.length, `live: import_jobs has the finished run with its counts, file and user (${JSON.stringify(jobRow && { estado: jobRow.estado, nombre: jobRow.nombre, new_count: jobRow.new_count, updated_count: jobRow.updated_count, errors_count: jobRow.errors_count, ledger: jobRow.ledger })})`);
    const monitor = E.importHistory().find((r) => Number(r.id) === Number(A.id));
    check(monitor && monitor.state === 'DONE' && monitor.newRecords === fxA.expect.created, `live: importHistory() (what the monitor shows) agrees with the database (${JSON.stringify(monitor && { state: monitor.state, newRecords: monitor.newRecords })})`);
    log(`live: import_jobs row ${A.id} → ${jobRow.estado}, «${jobRow.nombre}», new ${jobRow.new_count}, updated ${jobRow.updated_count}, errors ${jobRow.errors_count}, ledger ${jobRow.ledger}, user ${jobRow.user_id === session.uid ? 'ok' : jobRow.user_id}; importHistory() shows ${monitor.state} with ${monitor.newRecords} new`);
  }
  // undo: exactly the created records (and the company the rule created) go to the trash; the updated ones stay
  const updatedNow = existing.map((c) => JSON.stringify(data.findRecord('contacts', c.id)));
  window.confirm = () => true;
  A.W.renderReview();
  click(q('[data-act="undo-import"]'));
  await data.dbIdle();
  check(entryOf(A.id).undone && entryOf(A.id).state === 'CANCELED', 'contacts: the import is marked «Anulada»');
  check(created.every((id) => !data.findRecord('contacts', id)) && data.trashedRecords('contacts').filter((c) => created.includes(Number(c.id))).length === created.length, `contacts: undo moved exactly the ${created.length} created contacts to the trash`);
  check(autoCompanies.every((id) => !data.findRecord('companies', id)) && data.trashedRecords('companies').some((c) => Number(c.id) === autoCompanies[0]), 'contacts: undo also removed the company the import created');
  check(existing.every((c, i) => JSON.stringify(data.findRecord('contacts', c.id)) === updatedNow[i]), 'contacts: the updated contacts keep their changes after undo');
  check(data.allContacts().length === contactsBefore, 'contacts: the index is back to its size before the import');
  check(text('.imp__state') === 'Anulada' && !q('[data-act="undo-import"]'), 'contacts: review shows «Anulada» and no second undo');
  await monitorRow(A.id);
  if (live) {
    const gone = await one(`select count(*)::int as n from public.contacts where id in (${created.join(',')}) and deleted_at is not null`);
    const kept = await one(`select count(*)::int as n from public.contacts where id in (${existing.map((c) => c.id).join(',')}) and deleted_at is null`);
    const co = await one(`select count(*)::int as n from public.companies where id in (${autoCompanies.join(',')}) and deleted_at is not null`);
    check(gone.n === created.length && kept.n === 3 && co.n === autoCompanies.length, `live: undo soft-deleted exactly the ${created.length} created contacts and the auto company; the 3 updated stay (${gone.n}/${kept.n}/${co.n})`);
  }

  // =============================================================================================================
  // (b) companies: CSV with repeated domains (Spanish «;» separator and numbers)
  // =============================================================================================================
  const fxB = companiesFixture({ existing: { name: existingCompany.name, domain: existingCompany.domain }, stamp });
  fxB.expect.uniqueKey = 'domain';
  const B = await wizardImport({ type: 'companies', file: fileOf('empresas-dominios.csv', toCsv(fxB, ';')), name: `Empresas dominios ${stamp || 'local'}`, expect: fxB.expect, numberFormat: 'es', expectKeys: ['name', 'domain', 'phone', 'industry', 'city', 'owner', 'employees', 'revenue'] });
  const coCreated = B.detail.createdIds.companies.map(Number);
  Object.entries(fxB.expect.domainOf).forEach(([row, domain]) => {
    const hits = data.allCompanies().filter((c) => c.domain === domain);
    check(hits.length === 1 && coCreated.includes(Number(hits[0].id)), `companies: row ${row} domain «${domain}» exists once and is in the ledger (${hits.length})`);
    if (fxB.expect.employeesOf[row] !== undefined) check(real('companies', hits[0], 'employees') === fxB.expect.employeesOf[row], `companies: row ${row} employees ${hits[0].employees} (Spanish number format)`);
    if (fxB.expect.revenueOf[row] !== undefined) check(real('companies', hits[0], 'revenue') === fxB.expect.revenueOf[row], `companies: row ${row} revenue ${hits[0].revenue}`);
    if (fxB.expect.nameOf[row]) check(hits[0].name === fxB.expect.nameOf[row], `companies: row ${row} name «${hits[0].name}»`);
  });
  const updatedCo = data.findRecord('companies', existingCompany.id);
  check(updatedCo.city === fxB.expect.updates[0].city && String(updatedCo.hs_import_ids || '').split(';').includes(String(B.id)) && !coCreated.includes(Number(existingCompany.id)), `companies: the existing company was updated by domain (${updatedCo.city})`);
  check(data.allCompanies().filter((c) => c.name === fxB.rows[8][0]).length === 1 && !data.allCompanies().find((c) => c.name === fxB.rows[8][0]).domain, 'companies: an invalid domain leaves the property empty and the company is created by name');
  log(`companies: ${coCreated.length} created, ${B.entry.updated} updated, ${B.detail.errors.length} errors`);
  await monitorRow(B.id);
  if (live) {
    const r = await one(`select count(*)::int as n, count(distinct domain)::int as domains, count(*) filter (where employees = 1200)::int as emp, count(*) filter (where revenue = 3400000)::int as rev from public.companies where id in (${coCreated.join(',')}) and deleted_at is null`);
    check(r.n === coCreated.length && r.domains === coCreated.length - 1 && r.emp === 1 && r.rev === 1, `live: companies landed with normalised domains, integer employees and numeric revenue (${JSON.stringify(r)})`);
    const dupDom = await one(`select count(*)::int as n from public.companies where deleted_at is null and domain = ${lit(fxB.expect.domainOf[4])}`);
    check(dupDom.n === 1, 'live: the repeated domain exists once');
  }

  // =============================================================================================================
  // (c) deals and tickets pasted, with the pipeline and the stage / status as text
  // =============================================================================================================
  const dealPipes = data.dealPipelines().map((name) => ({ name, stages: data.stagesFor(name).map((s) => [s[0], s[1]]) }));
  const fxC = dealsFixture({ pipelines: dealPipes, companies: companies.map((c) => ({ id: c.id, name: c.name, domain: c.domain })), stamp });
  fxC.expect.uniqueKey = 'hs_object_id';
  const C = await wizardImport({ type: 'deals', paste: toTsv(fxC), name: `Negocios pegados ${stamp || 'local'}`, expect: fxC.expect, expectKeys: ['name', 'pipeline', 'stage', 'amount', 'deal_currency_code', 'closeDate', 'owner', 'company', 'priority', 'type'] });
  const dealOf = (row) => data.allDeals().find((d) => d.name === fxC.rows[row - 2][0] && String(d.hs_import_ids) === String(C.id));
  Object.entries(fxC.expect.stageOf).forEach(([row, stage]) => { const d = dealOf(Number(row)); check(d && d.stage === stage && d.pipeline === dealPipes[0].name, `deals: row ${row} pipeline/stage «${d && d.pipeline}» / «${d && d.stage}»`); });
  Object.entries(fxC.expect.amountOf).forEach(([row, amount]) => check(dealOf(Number(row)).amount === amount, `deals: row ${row} amount ${dealOf(Number(row)).amount} (expected ${amount})`));
  Object.entries(fxC.expect.closeOf).forEach(([row, day]) => check(localDate(dealOf(Number(row)).closeDate) === day, `deals: row ${row} close date ${localDate(dealOf(Number(row)).closeDate)} (expected ${day})`));
  Object.entries(fxC.expect.currencyOf).forEach(([row, cur]) => check(real('deals', dealOf(Number(row)), 'deal_currency_code') === cur, `deals: row ${row} currency ${cur}`));
  Object.entries(fxC.expect.ownerOf).forEach(([row, owner]) => check(dealOf(Number(row)).owner === owner, `deals: row ${row} owner ${owner}`));
  Object.entries(fxC.expect.priorityOf).forEach(([row, p]) => check(dealOf(Number(row)).priority === p, `deals: row ${row} priority ${p}`));
  fxC.expect.companyRows.forEach(({ row, companyId, name }) => { const d = dealOf(row); check(Number(d.companyId) === Number(companyId) && d.company === name, `deals: row ${row} associated to «${name}»`); });
  check(!dealOf(7).companyId, 'deals: an unknown company leaves the deal without association (and reports it)');
  check(C.entry.associations === fxC.expect.associations, `deals: ${C.entry.associations} associations (expected ${fxC.expect.associations})`);
  log(`deals: ${C.detail.createdIds.deals.length} created with pipeline «${dealPipes[0].name}», ${C.entry.associations} associations, ${C.detail.errors.length} errors`);
  await monitorRow(C.id);
  if (live) {
    const ids = C.detail.createdIds.deals.join(',');
    const r = await one(`select count(*)::int as n, count(*) filter (where pipeline = ${lit(dealPipes[0].name)} and stage = ${lit(dealPipes[0].stages[0][0])})::int as first_stage, count(*) filter (where amount = 1250000.5)::int as amount, count(*) filter (where close_date::date = date '2027-03-02')::int as closed, count(*) filter (where company_id = ${Number(companies[0].id)})::int as linked, count(*) filter (where extra->>'deal_currency_code' = 'EUR')::int as eur from public.deals where id in (${ids}) and deleted_at is null`);
    check(r.n === fxC.expect.created && r.first_stage === 4 && r.amount === 1 && r.closed === 1 && r.linked === 1 && r.eur === 1, `live: deals landed with pipeline, stage, numeric amount, close date, company and currency (${JSON.stringify(r)})`);
  }

  const ticketPipes = data.ticketPipelines().map((name) => ({ name, stages: data.ticketStatusesFor(name).map((s) => [s[0], s[1]]) }));
  const fxT = ticketsFixture({ pipelines: ticketPipes, stamp });
  fxT.expect.uniqueKey = 'hs_object_id';
  const T = await wizardImport({ type: 'tickets', paste: toTsv(fxT), name: `Tickets pegados ${stamp || 'local'}`, expect: fxT.expect, expectKeys: ['name', 'pipeline', 'status', 'priority', 'owner', 'description', 'source', 'hs_ticket_category'] });
  const ticketOf = (row) => data.allTickets().find((t) => t.name === fxT.rows[row - 2][0] && String(t.hs_import_ids) === String(T.id));
  Object.entries(fxT.expect.statusOf).forEach(([row, st]) => { const t = ticketOf(Number(row)); check(t && t.status === st && t.pipeline === ticketPipes[0].name, `tickets: row ${row} pipeline/status «${t && t.pipeline}» / «${t && t.status}»`); });
  Object.entries(fxT.expect.priorityOf).forEach(([row, p]) => check(ticketOf(Number(row)).priority === p, `tickets: row ${row} priority ${p} (an unknown one falls back to «media»)`));
  Object.entries(fxT.expect.ownerOf).forEach(([row, owner]) => check(ticketOf(Number(row)).owner === owner, `tickets: row ${row} owner ${owner}`));
  check(ticketOf(2).description === fxT.rows[0][5] && ticketOf(2).source === 'Correo' && real('tickets', ticketOf(2), 'hs_ticket_category') === 'Facturación', 'tickets: description, source and category');
  log(`tickets: ${T.detail.createdIds.tickets.length} created with pipeline «${ticketPipes[0].name}», ${T.detail.errors.length} errors`);
  await monitorRow(T.id);
  if (live) {
    const r = await one(`select count(*)::int as n, count(*) filter (where pipeline = ${lit(ticketPipes[0].name)})::int as pipe, count(*) filter (where status = ${lit(ticketPipes[0].stages[0][0])})::int as first_status, count(*) filter (where priority = 'high')::int as high, count(*) filter (where description <> '')::int as described from public.tickets where id in (${T.detail.createdIds.tickets.join(',')}) and deleted_at is null`);
    check(r.n === fxT.expect.created && r.pipe === fxT.expect.created && r.first_status === 2 && r.high === 1 && r.described === 3, `live: tickets landed with pipeline, status, priority and description (${JSON.stringify(r)})`);
  }

  // =============================================================================================================
  // (e) tasks pasted (then undone through the history read from the other copy)
  // =============================================================================================================
  const fxK = tasksFixture({ stamp });
  fxK.expect.uniqueKey = 'hs_object_id';
  const K = await wizardImport({ type: 'tasks', paste: toTsv(fxK), name: `Tareas pegadas ${stamp || 'local'}`, expect: fxK.expect, expectKeys: ['name', 'due', 'type', 'priority', 'owner', 'status', 'hs_task_body'] });
  const taskOf = (row) => data.allTasks().find((t) => t.name === fxK.rows[row - 2][0] && String(t.hs_import_ids) === String(K.id));
  Object.entries(fxK.expect.dueOf).forEach(([row, day]) => check(localDate(taskOf(Number(row)).due) === day, `tasks: row ${row} due ${localDate(taskOf(Number(row)).due)} (expected ${day})`));
  check(new Date(taskOf(2).due).getHours() === 10 && new Date(taskOf(2).due).getMinutes() === 30, 'tasks: row 2 keeps its time 10:30');
  Object.entries(fxK.expect.statusOf).forEach(([row, st]) => check(taskOf(Number(row)).status === st, `tasks: row ${row} status ${st}`));
  Object.entries(fxK.expect.ownerOf).forEach(([row, owner]) => check(taskOf(Number(row)).owner === owner, `tasks: row ${row} owner ${owner}`));
  Object.entries(fxK.expect.typeOf).forEach(([row, tp]) => check(taskOf(Number(row)).type === tp, `tasks: row ${row} type ${tp}`));
  check(real('tasks', taskOf(2), 'hs_task_body') === fxK.rows[0][6], 'tasks: notes');
  log(`tasks: ${K.detail.createdIds.tasks.length} created, ${K.detail.errors.length} errors`);
  await monitorRow(K.id);
  if (live) {
    const r = await one(`select count(*)::int as n, count(*) filter (where due is not null)::int as due, count(*) filter (where status = 'done')::int as done, count(*) filter (where owner = 'Diego G.')::int as diego from public.tasks where id in (${K.detail.createdIds.tasks.join(',')})`);
    check(r.n === fxK.expect.created && r.due === fxK.expect.created && r.done === 1 && r.diego === 1, `live: tasks landed with due date, status and owner (${JSON.stringify(r)})`);
    // another browser: no local copy of the history → the entries and the ledger come from user_settings
    const localKeys = Object.keys(localStorage).length ? null : null; // (the in-memory store has no key listing API)
    ['crm:imports', E.DETAIL_KEY(K.id)].forEach((k) => localStorage.removeItem(k));
    const fromRemote = E.importHistory().find((r) => Number(r.id) === Number(K.id));
    check(fromRemote && fromRemote.state === 'DONE' && fromRemote.newRecords === fxK.expect.created, 'live: without a local copy the history comes from user_settings');
    check(E.importDetail(K.id)?.createdIds?.tasks?.length === fxK.expect.created, 'live: without a local copy the ledger comes from user_settings');
    void localKeys;
  }
  const taskIds = K.detail.createdIds.tasks.map(Number);
  K.W.renderReview();
  click(q('[data-act="undo-import"]'));
  await data.dbIdle();
  check(taskIds.every((id) => !data.findRecord('tasks', id)) && entryOf(K.id).undone, 'tasks: undo removed exactly the created tasks');
  if (live) { const r = await one(`select count(*)::int as n from public.tasks where id in (${taskIds.join(',')})`); check(r.n === 0, 'live: the undone tasks are gone from Supabase'); }

  // =============================================================================================================
  // (d) contacts with an association column: the company by domain
  // =============================================================================================================
  const fxD = contactsAssocFixture({ companies: companies.map((c) => ({ id: c.id, name: c.name, domain: c.domain })), ambiguousName: twins[0].name, stamp });
  fxD.expect.uniqueKey = 'email';
  const D = await wizardImport({ type: 'contacts', file: fileOf('contactos-asociacion-empresa.csv', toCsv(fxD)), name: `Contactos asociación ${stamp || 'local'}`, expect: fxD.expect, expectKeys: ['first', 'last', 'email', 'company', 'jobTitle'] });
  const dContact = (row) => data.allContacts().find((c) => String(c.email || '').toLowerCase() === String(fxD.rows[row - 2][2]).toLowerCase());
  fxD.expect.companyRows.forEach(({ row, companyId, name }) => { const c = dContact(row); check(c && Number(c.companyId) === Number(companyId) && c.company === name, `assoc: row ${row} → «${name}» by domain (${fxD.rows[row - 2][3]})`); });
  check(!twins.some((t) => Number(dContact(5).companyId) === Number(t.id)), 'assoc: an ambiguous company name does not associate (reported as MULTIPLE_COMPANIES_WITH_DOMAIN)');
  check(dContact(4).companyId && !companies.some((k) => Number(k.id) === Number(dContact(4).companyId)), 'assoc: an unknown domain leaves the row to the e-mail-domain rule');
  check(D.entry.associations === fxD.expect.created, `assoc: ${D.entry.associations} associations for ${fxD.expect.created} contacts (3 by the column, 2 by the rule)`);
  log(`assoc: ${D.detail.createdIds.contacts.length} created, ${D.entry.associations} associations, ${D.detail.errors.length} errors`);
  await monitorRow(D.id);
  if (live) {
    const ids = D.detail.createdIds.contacts.join(',');
    const r = await one(`select count(*)::int as n, count(*) filter (where company_id = ${Number(companies[0].id)})::int as a, count(*) filter (where company_id = ${Number(companies[1].id)})::int as b, (select count(*)::int from public.contact_companies where contact_id in (${ids}) and company_id in (${companies.map((c) => Number(c.id)).join(',')})) as links from public.contacts where id in (${ids}) and deleted_at is null`);
    check(r.n === fxD.expect.created && r.a === 2 && r.b === 1 && r.links === 3, `live: the association column produced the company links in contacts and contact_companies (${JSON.stringify(r)})`);
  }

  // the monitor lists every import of the run with its real counts
  await freshPage('dint-root', '/data/', 'integration.js');
  const rows = [A, B, C, T, K, D].map((x) => q(`tr[data-id="${x.id}"]`));
  check(rows.every(Boolean), 'monitor: the six imports are listed');
  check(document.querySelectorAll('tr[data-id]').length >= 6, `monitor: ${document.querySelectorAll('tr[data-id]').length} rows`);
  return { ids: [A, B, C, T, K, D].map((x) => x.id) };
}

// ---------------------------------------------------------------------------------------------------------------
// live mode: the scenario against Supabase with the SMOKE user; then the extra clean-up of what the e-mail-domain
// rule created (companies from smoke e-mails) — the standard clean-up removes the «SMOKE …» rows and the user
// ---------------------------------------------------------------------------------------------------------------
await liveSmoke('import-e2e', async ({ data, sql, one, check, log, session, stamp }) => {
  const E = await import(resolve(here, '../src/import-engine.js'));
  const P = await import(resolve(here, '../src/properties.js'));
  document.body.insertAdjacentHTML('beforeend', '<main id="imp-root"></main><main id="dint-root"></main>');
  try {
    await scenario({ data, E, P, check, log, live: true, stamp, one, sql, session });
  } finally {
    await cleanupImportSmoke({ sql, data, E, stamp, log });
  }
}, { stampScoped: true });

// ---------------------------------------------------------------------------------------------------------------
// local mode: JSDOM + localStorage
// ---------------------------------------------------------------------------------------------------------------
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const check = (ok, msg) => { if (!ok) fail(msg); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><main id="dint-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/data/import/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option', 'CSS']) globalThis[k] = dom.window[k];
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true;
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));
const P = await import(resolve(here, '../src/properties.js'));
const out = await scenario({ data, E, P, check, log });
console.log(`[${TAG}] PASS: wizard end to end on contacts (100-row XLSX), companies (CSV), deals, tickets, tasks (pasted) and contacts with a company column: mapping, modes, preview, real counts, errors with row and reason, monitor, undo (imports ${out.ids.join(', ')})`);
process.exit(0);

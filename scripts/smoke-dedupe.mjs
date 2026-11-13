// DOM smoke test for the e-mail de-duplication of the contacts import: matches against the account's
// contacts (primary and additional e-mails, case and spaces ignored), repeated e-mails inside the file with
// the three policies (first / last / merge), the three modes (update / skip / update-only), the analysis the
// wizard shows in step 3, and the review counters. Run: node scripts/smoke-dedupe.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[dedupe]', ...a);
const fail = (msg) => { console.error(`[dedupe] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const boot = (url) => {
  const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>', { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  globalThis.history = dom.window.history;
  dom.window.confirm = () => true;
  return dom;
};
let dom = boot('http://localhost/data/import/');
const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));
const byRow = (p, n) => p.records.find((r) => r.rowNumber === n);
const codes = (p) => p.records.map((r) => `${r.rowNumber}:${r.action}${r.code ? `(${r.code})` : ''}`).join(' ');

// two existing contacts with unique e-mails; the second one gets an additional e-mail
const contacts = data.allContacts();
const emails = contacts.map((c) => String(c.email || '').toLowerCase());
const uniques = contacts.filter((c) => c.email && emails.indexOf(c.email.toLowerCase()) === emails.lastIndexOf(c.email.toLowerCase()));
const [known, known2] = uniques;
data.setField('contacts', known2.id, 'hs_additional_emails', 'secundario.prueba@ejemplo.com');
const table = E.parsePasted([
  'Nombre\tApellidos\tCorreo electrónico\tNúmero de teléfono\tCargo',
  `Mayus\tEspacios\t  ${known.email.toUpperCase()}  \t+52 55 1111 1111\tDirección`, // row 2: existing, different case and spaces
  'Por\tSecundario\tSecundario.Prueba@ejemplo.com\t\tCompras', // row 3: existing through an additional e-mail
  'Nueva\tPersona\tnueva.persona@ejemplo.com\t\tVentas', // row 4: new
  'Nueva\tRepetida\tNUEVA.persona@ejemplo.com\t+52 55 2222 2222\t', // row 5: same e-mail as row 4, different data
  'Sin\tCorreo\t\t+52 55 3333 3333\t', // row 6: no e-mail, cannot be de-duplicated
  'Nueva\tPersona\tnueva.persona@ejemplo.com\t\tVentas', // row 7: identical to row 4
].join('\n'));
const mapping = E.autoMap(table.headers, 'es', 'contacts');
log('normalizeEmail:', E.normalizeEmail('  Ana@Ejemplo.COM '), E.normalizeEmail('<ana@ejemplo.com>'), E.normalizeEmail('mailto:ana@ejemplo.com'));
if (E.normalizeEmail('  Ana@Ejemplo.COM ') !== 'ana@ejemplo.com' || E.normalizeEmail('<ana@ejemplo.com>') !== 'ana@ejemplo.com') fail('normalizeEmail');

// ---------- analysis (what the wizard shows) ----------
const dup = E.analyzeDuplicates(table, mapping, { object: 'contacts', uniqueKey: 'email' });
log('analysis:', JSON.stringify({ key: dup.uniqueKey, against: dup.checkedAgainst, existing: dup.existingCount, inFile: dup.inFile.map((g) => `${g.value}:${g.rows.join('+')}`), inFileRows: dup.inFileRows, newCount: dup.newCount, withoutKey: dup.withoutKey }));
if (dup.existingCount !== 2 || dup.inFile.length !== 1 || dup.inFileRows !== 2 || dup.newCount !== 2 || dup.withoutKey !== 1) fail('analysis counts');
const e1 = dup.existing.find((x) => x.row === 2);
const e2 = dup.existing.find((x) => x.row === 3);
log('row 2 →', e1.matchName, '| changes:', e1.changes.join(','), '| row 3 →', e2.matchName, '| secondary:', e2.secondary);
if (Number(e1.matchId) !== Number(known.id) || !e1.changes.includes('phone') || Number(e2.matchId) !== Number(known2.id) || !e2.secondary) fail('analysis matches');

// ---------- modes against existing contacts ----------
let plan = E.planImport(table, mapping, { mode: 'create_update', uniqueKey: 'email' });
log('create_update:', codes(plan), '| summary:', JSON.stringify(plan.summary));
if (byRow(plan, 2).action !== 'update' || Number(byRow(plan, 2).matchId) !== Number(known.id) || byRow(plan, 2).data.email !== known.email.toLowerCase()) fail('case-insensitive match should update with the normalised e-mail');
if (byRow(plan, 3).action !== 'update' || !byRow(plan, 3).secondary || byRow(plan, 3).data.email !== undefined) fail('secondary e-mail match keeps the primary e-mail');
if (byRow(plan, 4).action !== 'create' || byRow(plan, 5).code !== 'DUPLICATE_UNIQUE_PROPERTY_VALUE' || byRow(plan, 7).code !== 'DUPLICATE_ROW_CONTENT') fail('file duplicates with the default policy');
if (plan.summary.duplicatesExisting !== 2 || plan.summary.duplicatesInFile !== 2 || plan.summary.toCreate !== 2) fail('summary duplicates');
plan = E.planImport(table, mapping, { mode: 'create', uniqueKey: 'email' });
log('create (skip duplicates):', codes(plan));
if (byRow(plan, 2).code !== 'CREATE_ONLY_IMPORT' || byRow(plan, 3).code !== 'CREATE_ONLY_IMPORT' || byRow(plan, 2).duplicateOf !== 'existing' || byRow(plan, 4).action !== 'create') fail('skip duplicates mode');
plan = E.planImport(table, mapping, { mode: 'update', uniqueKey: 'email' });
log('update only:', codes(plan));
if (byRow(plan, 2).action !== 'update' || byRow(plan, 4).code !== 'UPDATE_ONLY_IMPORT' || byRow(plan, 6).code !== 'UPDATE_ONLY_IMPORT') fail('update-only mode');

// ---------- policies for repeated e-mails inside the file ----------
plan = E.planImport(table, mapping, { mode: 'create_update', uniqueKey: 'email', fileDuplicates: 'last' });
log('policy last:', codes(plan));
if (byRow(plan, 4).code !== 'DUPLICATE_UNIQUE_PROPERTY_VALUE' || byRow(plan, 5).action !== 'create' || byRow(plan, 5).data.phone !== '+525522222222') fail('last-row policy');
if (byRow(plan, 7).code !== 'DUPLICATE_ROW_CONTENT' && byRow(plan, 7).code !== 'DUPLICATE_UNIQUE_PROPERTY_VALUE') fail('identical row still skipped');
plan = E.planImport(table, mapping, { mode: 'create_update', uniqueKey: 'email', fileDuplicates: 'merge' });
log('policy merge:', codes(plan), '| merged row 4 data:', JSON.stringify(byRow(plan, 4).data), '| mergedRows:', byRow(plan, 4).mergedRows);
if (byRow(plan, 4).action !== 'create' || byRow(plan, 4).data.phone !== '+525522222222' || byRow(plan, 4).data.jobTitle !== 'Ventas' || byRow(plan, 5).action !== 'merged' || byRow(plan, 5).mergedInto !== 4) fail('merge policy');
if (plan.summary.merged !== 1 || plan.summary.toCreate !== 2) fail('merge summary');
if (plan.errors.some((e) => e.row === 5)) fail('a merged row is not an error');

// ---------- run the merge plan: one contact with the combined values, duplicates updated ----------
const entry = E.registerImport({ name: 'Dedupe', table, plan, options: { mode: 'create_update', fileDuplicates: 'merge' } });
log('registered:', JSON.stringify({ duplicates: entry.duplicates, fileDuplicates: entry.fileDuplicates, merged: entry.merged, filePolicy: entry.filePolicy }));
if (entry.duplicates !== 2 || entry.fileDuplicates !== 2 || entry.merged !== 1 || entry.filePolicy !== 'merge') fail('registered duplicate counters');
const before = data.allContacts().length;
const run = await E.runImport(entry.id, plan, { sleep: () => Promise.resolve() });
const made = data.allContacts().filter((c) => c.email === 'nueva.persona@ejemplo.com');
const k1 = data.allContacts().find((c) => Number(c.id) === Number(known.id));
log('run:', JSON.stringify({ created: run.created, updated: run.updated, failed: run.failed, state: run.state }), '| contacts', before, '→', data.allContacts().length, '| merged contact:', made.length, made[0] && `${made[0].name} · ${made[0].phone} · ${made[0].jobTitle}`, '| updated known phone:', k1.phone);
if (run.state !== 'DONE' || run.created !== 2 || run.updated !== 2 || made.length !== 1 || made[0].phone !== '+525522222222' || k1.phone !== '+525511111111') fail('run with merge policy');
if (data.allContacts().filter((c) => String(c.email).toLowerCase() === known.email.toLowerCase()).length !== 1) fail('the existing contact must not be duplicated');
// a second import of the same file now finds every e-mail as existing
const again = E.analyzeDuplicates(table, mapping, { object: 'contacts', uniqueKey: 'email' });
log('second pass existing:', again.existingCount, '| new:', again.newCount);
if (again.existingCount !== 3 || again.newCount !== 1) fail('second pass should see the created contact as existing');

// ---------- wizard: step 3 shows the check and the choices ----------
dom = boot('http://localhost/data/import/');
const W = await import(resolve(here, '../src/import-wizard.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
const change = (el) => el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
$('imp-paste').value = ['Nombre\tApellidos\tCorreo electrónico\tCargo', `Wiz\tExistente\t${known.email}\tGerencia`, 'Wiz\tNuevo\twiz.nuevo@ejemplo.com\t', 'Wiz\tOtra\tWIZ.nuevo@ejemplo.com\tCompras'].join('\n');
click(document.querySelector('[data-act="use-paste"]'));
click(document.querySelector('[data-act="next1"]'));
click(document.querySelector('[data-act="next2"]'));
const panel = $('imp-dups');
if (!panel) fail('duplicates panel missing');
const stats = [...panel.querySelectorAll('.imp__dupstat')].map((s) => s.textContent.replace(/\s+/g, ' ').trim());
log('wizard panel:', panel.querySelector('h3').textContent, '|', stats.join(' | '));
if (!stats[0].startsWith('1 fila coincide') || !stats[1].startsWith('1 fila repite') || !stats[2].startsWith('1 contacto nuevo')) fail('wizard duplicate stats');
log('match table:', [...panel.querySelectorAll('.imp__duptable tbody tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' || '));
if (!panel.querySelector('.imp__duptable tbody tr')?.textContent.includes(known.email.toLowerCase())) fail('match table should list the existing contact');
log('plan before:', document.querySelector('.imp__plan').textContent.trim());
const skip = panel.querySelector('input[name="mode"][value="create"]');
skip.checked = true;
change(skip);
log('after "saltar":', document.querySelector('.imp__plan').textContent.trim(), '| action cell:', $('imp-dups').querySelector('.imp__duptable tbody tr td:last-child').textContent.trim());
if (W.state.options.mode !== 'create' || !document.querySelector('.imp__plan').textContent.includes('1 contactos nuevos · 0 actualizaciones') || $('imp-dups').querySelector('.imp__duptable tbody tr td:last-child').textContent.trim() !== 'Se salta') fail('skip duplicates choice');
const merge = $('imp-dups').querySelector('input[name="filedups"][value="merge"]');
merge.checked = true;
change(merge);
log('after "combinar":', document.querySelector('.imp__plan').textContent.trim(), '| repeated list:', $('imp-dups').querySelector('.imp__dupvalues li')?.textContent.trim());
if (W.state.options.fileDuplicates !== 'merge' || !document.querySelector('.imp__plan').textContent.includes('1 filas combinadas')) fail('merge choice');
$('imp-consent').checked = true;
change($('imp-consent'));
await W.finish();
await new Promise((r) => setTimeout(r, 50));
const statLabels = [...document.querySelectorAll('.imp__stat')].map((s) => s.textContent.replace(/\s+/g, ' ').trim());
log('review:', document.querySelector('.imp__state').textContent, '|', statLabels.join(' | '));
if (!statLabels.some((s) => /^Duplicados saltados\s*1/.test(s) && s.includes('combinados'))) fail('review duplicates stat');
const wizNew = data.allContacts().filter((c) => c.email === 'wiz.nuevo@ejemplo.com');
log('wizard contact:', wizNew.length, wizNew[0] && `${wizNew[0].name} · ${wizNew[0].jobTitle}`);
if (wizNew.length !== 1 || wizNew[0].jobTitle !== 'Compras') fail('wizard merge result');
console.log('[dedupe] OK');

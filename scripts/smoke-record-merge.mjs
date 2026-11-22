// Smoke test for «Fusionar» on the record page (src/record.js + mergeRecords of src/data.js): a contact with a
// duplicate (same e-mail) opens Más › Fusionar → the search dialog lists the likely duplicate first and filters
// by name/e-mail; picking it shows the side-by-side comparison with a radio per differing property (the record
// with more filled fields suggested as principal) and the restore warning; choosing the page's contact as
// principal, picking the duplicate's city and confirming: the duplicate is in the trash, its deal, task,
// timeline entries and sequence enrolment now belong to the kept contact, the chosen values win, the empty
// properties are filled, the timeline records the merge, the toast says so and the page re-renders. The
// duplicates card's «Fusionar» button opens the comparison directly. Run: node scripts/smoke-record-merge.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { liveSmoke, lit } from './smoke-live.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[record-merge]', ...a);
const fail = (msg) => { console.error(`[record-merge] FAIL: ${msg}`); process.exit(1); };

// ---- modo live (SMOKE_LIVE=1, docs/smoke-live.md): a merge leaves the duplicate in the trash and the kept row updated ----
await liveSmoke('record-merge', async ({ data, one, check, log, stamp }) => {
  const keep = data.addRecord('contacts', { name: `SMOKE Ana Fusión ${stamp}`, first: 'SMOKE Ana', last: `Fusión ${stamp}`, email: `smoke.${stamp}@ejemplo.com`, phone: '', owner: 'Fernando L.', lifecycle: 'Lead', city: '', lastActivity: data.TODAY.toISOString() });
  const dup = data.addRecord('contacts', { name: `SMOKE Ana Fusion Dup ${stamp}`, first: 'SMOKE Ana', last: `Fusion Dup ${stamp}`, email: `smoke.${stamp}.dup@ejemplo.com`, phone: '+52 55 1234 5678', owner: 'Sofía R.', lifecycle: 'Lead', city: 'SMOKE Toluca', lastActivity: data.TODAY.toISOString() });
  await data.dbIdle();
  const before = await one(`select count(*)::int as n from public.contacts where name in (${lit(keep.name)}, ${lit(dup.name)}) and deleted_at is null`);
  check(before && before.n === 2, 'ambos contactos existen en la base antes de fusionar');
  // choices hold the value to keep per property (what the comparison dialog's radios pick)
  data.mergeRecords('contacts', keep.id, [dup.id], { choices: { city: 'SMOKE Toluca' } });
  await data.dbIdle();
  const kept = await one(`select city, phone, deleted_at from public.contacts where name = ${lit(keep.name)}`);
  const gone = await one(`select deleted_at from public.contacts where name = ${lit(dup.name)}`);
  check(kept && kept.deleted_at === null && kept.city === 'SMOKE Toluca' && kept.phone === '+52 55 1234 5678', `el principal toma el valor elegido y rellena vacíos (${JSON.stringify(kept)})`);
  check(gone && gone.deleted_at, `el duplicado queda en la papelera con deleted_at (${JSON.stringify(gone)})`);
  log(`fusión: «${keep.name}» ciudad «${kept.city}», teléfono rellenado; duplicado con deleted_at = ${gone.deleted_at}`);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
// the data first (local mode), then the record page of the kept contact
let dom = new JSDOM('<!doctype html><body class="app"></body>', { url: 'http://localhost/contacts/', pretendToBeVisual: true });
const useWindow = (d) => { for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = d.window[k]; d.window.HTMLElement.prototype.scrollIntoView = function () {}; d.window.confirm = () => true; d.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); };
useWindow(dom);
const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/sequences-data.js'));
await S.ready;
const keepRec = data.addRecord('contacts', { name: 'Ana Fusión', first: 'Ana', last: 'Fusión', email: 'ana.fusion@ejemplo.com', phone: '', owner: 'Fernando L.', lifecycle: 'Lead', city: 'Toluca', created: '2026-01-10T10:00:00.000Z' });
const dup = data.addRecord('contacts', { name: 'Ana Fusion Duplicada', first: 'Ana', last: 'Fusion Duplicada', email: 'ANA.FUSION@ejemplo.com', phone: '+52 55 1234 5678', owner: 'Sofía R.', lifecycle: 'Cliente', city: 'Madrid', job_title: 'Compras', created: '2026-03-01T10:00:00.000Z' });
const deal = data.addRecord('deals', { name: 'Negocio del duplicado', amount: 900, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: '2026-12-31T12:00:00.000Z', owner: 'Sofía R.', companyId: '', company: '', contactId: dup.id, priority: 'medium', type: 'Nuevo negocio', lastActivity: data.TODAY.toISOString() });
const task = data.addRecord('tasks', { name: 'Tarea del duplicado', type: 'Tarea', status: 'todo', priority: 'medium', owner: 'Sofía R.', contactId: dup.id, contact: dup.name, due: data.TODAY.toISOString() });
data.addActivity({ type: 'note', recordType: 'contacts', recordId: dup.id, text: 'Nota escrita en el duplicado', who: 'Tú', when: Date.now() - 1000, extra: {} });
const seq = S.createSequence({ name: 'Secuencia de fusión', exclusion: ['replied'], steps: [{ id: 'm1', type: 'auto_email', delayDays: 0, title: '', subject: 'Hola', body: 'Hola', templateName: '', version: 'A', replyToPrevious: false }] });
const enr = S.enroll({ sequenceId: seq.id, contact: dup, enrolledBy: 'Fernando L.' })?.enrollment;
if (!enr) fail('enrol the duplicate in a sequence');
const actsKeepBefore = data.activitiesFor('contacts', keepRec.id).length;

dom = new JSDOM('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url: `http://localhost/contacts/record/?id=${keepRec.id}`, pretendToBeVisual: true });
useWindow(dom);
await import(resolve(here, '../src/record.js'));
await wait(60);
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const check = (el) => { el.checked = true; el.dispatchEvent(new window.Event('change', { bubbles: true })); };

// ---- Más › Fusionar: the search dialog ----
click(q('.menu__item[data-act="merge"]'));
await wait(20);
if (!$('rec-modal').classList.contains('is-open') || !$('merge-search') || $('merge-target')) fail('the merge dialog opens with a search box (no 60-row select)');
if (text($('rec-modal-title')) !== 'Fusionar contacto') fail(`title (${text($('rec-modal-title'))})`);
const firstPick = q('#merge-results [data-merge-pick]');
if (!firstPick || Number(firstPick.dataset.mergePick) !== Number(dup.id)) fail('the likely duplicate (same e-mail) is listed first');
input($('merge-search'), 'zzz-nadie');
if (!/Sin resultados/.test(text($('merge-results')))) fail('search with no match');
input($('merge-search'), 'fusion@ejemplo');
const picks = qa('#merge-results [data-merge-pick]');
if (picks.length !== 1 || Number(picks[0].dataset.mergePick) !== Number(dup.id)) fail(`search filters by e-mail (${picks.length})`);
if (q('[data-confirm="merge"]')) fail('no Fusionar button before choosing the record');
log('buscador: duplicado probable primero, filtra por nombre/correo, sin resultados');

// ---- the comparison step ----
click(picks[0]);
await wait(20);
const keepRadios = qa('input[name="merge-keep"]');
if (keepRadios.length !== 2 || !q('#merge-table') || !q('[data-confirm="merge"]') || !q('[data-merge-back]')) fail('comparison step: principal radios, table, Fusionar, Atrás');
if (keepRadios.find((r) => r.checked)?.value !== String(dup.id)) fail('the record with more filled fields is suggested as principal');
const rowKeys = qa('#merge-table tr[data-merge-key]').map((tr) => tr.dataset.mergeKey);
for (const k of ['city', 'lifecycle', 'owner', 'last']) if (!rowKeys.includes(k)) fail(`a row per differing property (${rowKeys.join(',')})`);
// not rows: the same e-mail in another case, the gaps (phone, job title), identity/dates, the full name (follows first/last)
// and the catalogue's sample decoration that neither record really stores
if (rowKeys.includes('email') || rowKeys.includes('phone') || rowKeys.includes('job_title') || rowKeys.includes('id') || rowKeys.includes('created') || rowKeys.includes('name') || rowKeys.includes('first') || rowKeys.length !== 4) fail(`only differing, both-filled properties are rows (${rowKeys.join(',')})`);
const rowRadio = (key, id) => q(`#merge-table tr[data-merge-key="${key}"] input[value="${id}"]`);
if (!rowRadio('city', dup.id).checked || rowRadio('city', keepRec.id).checked) fail('row defaults follow the suggested principal (duplicate)');
if (!/propiedad(es)? vacía/.test(text($('merge-gaps'))) || !/papelera/.test(text(q('.merge__warn')))) fail('gap count and the restore warning');
// the page's contact as principal → every row flips to its values; then pick the duplicate's city
check(keepRadios.find((r) => r.value === String(keepRec.id)));
if (!rowRadio('city', keepRec.id).checked || !rowRadio('lifecycle', keepRec.id).checked || rowRadio('city', dup.id).checked) fail('choosing the other principal flips the row defaults');
if (!/2 propiedades vacías de «Ana Fusión»/.test(text($('merge-gaps')))) fail(`gap count for the page's contact (${text($('merge-gaps'))})`);
check(rowRadio('city', dup.id));
if (!rowRadio('city', dup.id).checked || !rowRadio('lifecycle', keepRec.id).checked) fail('a row can be chosen independently');
// Atrás returns to the search and the picked state resets
click(q('[data-merge-back]'));
if (!$('merge-search')) fail('Atrás returns to the search');
click(q('#merge-results [data-merge-pick]'));
await wait(10);
check(qa('input[name="merge-keep"]').find((r) => r.value === String(keepRec.id)));
check(rowRadio('city', dup.id));
log(`comparación: filas ${rowKeys.join(', ')}; principal sugerido = duplicado (más campos); cambiado a la ficha; ciudad elegida del duplicado; aviso de papelera`);

// ---- confirm ----
click(q('[data-confirm="merge"]'));
await wait(40);
if ($('rec-modal').classList.contains('is-open')) fail('dialog closes');
const kept = data.findRecord('contacts', keepRec.id);
if (!kept || data.findRecord('contacts', dup.id)) fail('the duplicate is gone from the list, the kept one stays');
if (!data.trashedRecords('contacts').some((r) => Number(r.id) === Number(dup.id))) fail('the duplicate is in the trash (restorable)');
if (kept.city !== 'Madrid') fail(`chosen value wins (city ${kept.city})`);
if (kept.lifecycle !== 'Lead' || kept.owner !== 'Fernando L.' || kept.name !== 'Ana Fusión') fail('kept values stay where the principal was chosen');
if (kept.phone !== '+52 55 1234 5678' || kept.job_title !== 'Compras') fail(`empty properties filled from the duplicate (${kept.phone} / ${kept.job_title})`);
if (Number(data.findRecord('deals', deal.id).contactId) !== Number(keepRec.id)) fail('the deal now points to the kept contact');
const t = data.findRecord('tasks', task.id);
if (Number(t.contactId) !== Number(keepRec.id) || t.contact !== 'Ana Fusión') fail('the task now points to the kept contact');
const acts = data.activitiesFor('contacts', keepRec.id);
const mergeNote = acts.find((a) => a.type === 'stage' && /Registros fusionados en este contacto: Ana Fusion Duplicada/.test(a.text));
if (!mergeNote) fail('the timeline records the merge');
const moved = acts.find((a) => a.text === 'Nota escrita en el duplicado');
if (!moved || Number(moved.extra.mergedFrom) !== Number(dup.id) || acts.length < actsKeepBefore + 2) fail('the duplicate\'s timeline entries moved to the kept contact');
if (data.activitiesFor('contacts', dup.id).length) fail('nothing left on the duplicate');
const movedEnr = S.enrollmentsOfContact(keepRec.id).find((e) => e.id === enr.id);
if (!movedEnr || movedEnr.status !== 'active' || Number(movedEnr.extra.mergedFrom) !== Number(dup.id) || S.enrollmentsOfContact(dup.id).length) fail('the sequence enrolment moved to the kept contact');
const toastText = text($('toast'));
if (!/^1 registro fusionado en «Ana Fusión» · 3 propiedades completadas/.test(toastText)) fail(`toast (${toastText})`);
if (!document.body.textContent.includes('Madrid') || !document.body.textContent.includes('Registros fusionados')) fail('the page re-rendered with the merged data and the timeline entry');
log(`confirmado: duplicado en papelera; negocio y tarea → Ana Fusión; ciudad Madrid (elegida), Lead/propietario conservados, teléfono y cargo completados; cronología con la fusión y la nota movida; inscripción movida | ${toastText}`);

// ---- the duplicates card's «Fusionar» opens the comparison directly; restoring from the trash is possible ----
const dup2 = data.addRecord('contacts', { name: 'Ana Fusión Bis', first: 'Ana', last: 'Fusión Bis', email: 'ana.fusion@ejemplo.com', owner: 'Fernando L.', lifecycle: 'Lead' });
// the duplicates card renders «Fusionar» with data-merge-with; the same button, same dispatcher
const cardBtn = document.createElement('button');
cardBtn.type = 'button'; cardBtn.dataset.act = 'merge'; cardBtn.dataset.mergeWith = String(dup2.id); cardBtn.textContent = 'Fusionar';
$('record-root').appendChild(cardBtn);
click(cardBtn);
await wait(10);
if (!qa('input[name="merge-keep"]').length || $('merge-search') || !text($('rec-modal-body')).includes('Ana Fusión Bis')) fail('the card\'s button opens the comparison with that duplicate directly');
click(q('[data-close]'));
cardBtn.remove();
if (data.restoreRecords('contacts', [dup.id]) !== 1 || !data.findRecord('contacts', dup.id)) fail('the merged duplicate can be restored from the trash');
log('segundo duplicado comparado; el fusionado se restaura desde la papelera');
console.log('[record-merge] OK');
process.exit(0);

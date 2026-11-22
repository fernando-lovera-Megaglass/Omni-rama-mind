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
  // multi associations that name the duplicate in the related records' extra (deal and ticket), and the inverse
  const def = data.dealPipelineDefs()[0];
  const stage = def.stages.find((s) => !data.isClosedStage(s[0]))[0];
  const deal = data.addRecord('deals', { name: `SMOKE Negocio fusión ${stamp}`, amount: 5, deal_currency_code: 'MXN', stage, pipeline: def.name, closeDate: new Date(data.TODAY.getTime() + 30 * 86400000).toISOString(), owner: 'Fernando L.', contactId: '', companyId: '', company: '', assoc_contacts: [dup.id], assoc_labels_contacts: { [dup.id]: 'Principal' } });
  const pipe = data.ticketPipelines()[0];
  const ticket = data.addRecord('tickets', { name: `SMOKE Ticket fusión ${stamp}`, pipeline: pipe, status: data.firstOpenTicketStatus(pipe), priority: 'medium', owner: 'Fernando L.', source: 'Correo', contactId: '', assoc_contacts: [dup.id] });
  data.setField('contacts', dup.id, 'assoc_deals', [Number(deal.id)]);
  await data.dbIdle();
  const ids = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? JSON.parse(v || '[]') : []).map(Number);
  // choices hold the value to keep per property (what the comparison dialog's radios pick)
  data.mergeRecords('contacts', keep.id, [dup.id], { choices: { city: 'SMOKE Toluca' } });
  await data.dbIdle();
  const kept = await one(`select city, phone, deleted_at, extra->'assoc_deals' as deals from public.contacts where name = ${lit(keep.name)}`);
  const gone = await one(`select deleted_at from public.contacts where name = ${lit(dup.name)}`);
  check(kept && kept.deleted_at === null && kept.city === 'SMOKE Toluca' && kept.phone === '+52 55 1234 5678', `el principal toma el valor elegido y rellena vacíos (${JSON.stringify(kept)})`);
  check(gone && gone.deleted_at, `el duplicado queda en la papelera con deleted_at (${JSON.stringify(gone)})`);
  log(`fusión: «${keep.name}» ciudad «${kept.city}», teléfono rellenado; duplicado con deleted_at = ${gone.deleted_at}`);
  const d = await one(`select extra->'assoc_contacts' as c, extra->'assoc_labels_contacts' as l from public.deals where name = ${lit(deal.name)}`);
  const t = await one(`select extra->'assoc_contacts' as c from public.tickets where name = ${lit(ticket.name)}`);
  const dl = d && (typeof d.l === 'string' ? JSON.parse(d.l) : d.l) || {};
  check(d && ids(d.c).includes(Number(keep.id)) && !ids(d.c).includes(Number(dup.id)) && dl[String(keep.id)] === 'Principal' && dl[String(dup.id)] === undefined, `deals.extra.assoc_contacts apunta al conservado, con su etiqueta (${JSON.stringify(d)})`);
  check(t && ids(t.c).includes(Number(keep.id)) && !ids(t.c).includes(Number(dup.id)), `tickets.extra.assoc_contacts apunta al conservado (${JSON.stringify(t)})`);
  check(ids(kept.deals).includes(Number(deal.id)), `el conservado hereda assoc_deals del duplicado (${JSON.stringify(kept.deals)})`);
  log(`asociaciones múltiples: negocio ${JSON.stringify(d.c)} (etiqueta ${JSON.stringify(dl)}), ticket ${JSON.stringify(t.c)}, contacto.assoc_deals ${JSON.stringify(kept.deals)}`);
  // companies: a merged company named in a ticket's assoc_companies and in a contact's assoc_companies
  const keepCo = data.addRecord('companies', { name: `SMOKE Empresa fusión ${stamp}`, domain: `smoke-${stamp}.mx`, owner: 'Fernando L.' });
  const dupCo = data.addRecord('companies', { name: `SMOKE Empresa fusión dup ${stamp}`, domain: `smoke-${stamp}-dup.mx`, owner: 'Fernando L.' });
  const ticket2 = data.addRecord('tickets', { name: `SMOKE Ticket empresa ${stamp}`, pipeline: pipe, status: data.firstOpenTicketStatus(pipe), priority: 'medium', owner: 'Fernando L.', source: 'Correo', contactId: '', assoc_companies: [dupCo.id], assoc_labels_companies: { [dupCo.id]: 'Principal' } });
  const contact3 = data.addRecord('contacts', { name: `SMOKE Contacto empresa ${stamp}`, first: 'SMOKE Contacto', last: `empresa ${stamp}`, email: `smoke.${stamp}.co@ejemplo.com`, owner: 'Fernando L.', lifecycle: 'Lead', companyId: '', company: '', assoc_companies: [dupCo.id] });
  await data.dbIdle();
  data.mergeRecords('companies', keepCo.id, [dupCo.id]);
  await data.dbIdle();
  const t2 = await one(`select extra->'assoc_companies' as c, extra->'assoc_labels_companies' as l from public.tickets where name = ${lit(ticket2.name)}`);
  const c3 = await one(`select extra->'assoc_companies' as c from public.contacts where name = ${lit(contact3.name)}`);
  const t2l = t2 && (typeof t2.l === 'string' ? JSON.parse(t2.l) : t2.l) || {};
  check(t2 && ids(t2.c).includes(Number(keepCo.id)) && !ids(t2.c).includes(Number(dupCo.id)) && t2l[String(keepCo.id)] === 'Principal', `tickets.extra.assoc_companies apunta a la empresa conservada (${JSON.stringify(t2)})`);
  check(c3 && ids(c3.c).includes(Number(keepCo.id)) && !ids(c3.c).includes(Number(dupCo.id)), `contacts.extra.assoc_companies apunta a la empresa conservada (${JSON.stringify(c3)})`);
  log(`empresas: ticket ${JSON.stringify(t2.c)}, contacto ${JSON.stringify(c3.c)} → empresa conservada ${keepCo.id}`);
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
// ---- multi associations (assoc_<kind> in the related records) follow the kept record, labels included ----
{
  const ids = (v) => (v || []).map(Number);
  const k2 = data.addRecord('contacts', { name: 'Bruno Fusión', first: 'Bruno', last: 'Fusión', email: 'bruno.fusion@ejemplo.com', owner: 'Fernando L.', lifecycle: 'Lead' });
  const d2 = data.addRecord('contacts', { name: 'Bruno Fusion Dup', first: 'Bruno', last: 'Fusion Dup', email: 'bruno.fusion.dup@ejemplo.com', owner: 'Fernando L.', lifecycle: 'Lead', assoc_deals: [] });
  const multiDeal = data.addRecord('deals', { name: 'Negocio con varios contactos', amount: 100, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: '2026-12-31T12:00:00.000Z', owner: 'Fernando L.', contactId: '', companyId: '', company: '', assoc_contacts: [d2.id, 3], assoc_labels_contacts: { [d2.id]: 'Principal', 3: 'Sin etiqueta' } });
  const pipe = data.ticketPipelines()[0];
  const multiTicket = data.addRecord('tickets', { name: 'Ticket con varios contactos', pipeline: pipe, status: data.firstOpenTicketStatus(pipe), priority: 'medium', owner: 'Fernando L.', source: 'Correo', contactId: '', assoc_contacts: [d2.id, k2.id] });
  data.setField('contacts', d2.id, 'assoc_deals', [Number(multiDeal.id)]);
  data.mergeRecords('contacts', k2.id, [d2.id]);
  const dealNow = data.findRecord('deals', multiDeal.id);
  const ticketNow = data.findRecord('tickets', multiTicket.id);
  const keptNow = data.findRecord('contacts', k2.id);
  if (ids(dealNow.assoc_contacts).join() !== [Number(k2.id), 3].join() || dealNow.assoc_labels_contacts[String(k2.id)] !== 'Principal' || dealNow.assoc_labels_contacts[String(d2.id)] !== undefined) fail(`deal assoc_contacts remapped to the kept contact (${JSON.stringify(dealNow.assoc_contacts)} / ${JSON.stringify(dealNow.assoc_labels_contacts)})`);
  if (ids(ticketNow.assoc_contacts).join() !== String(k2.id)) fail(`ticket assoc_contacts remapped and deduplicated (${JSON.stringify(ticketNow.assoc_contacts)})`);
  if (!ids(keptNow.assoc_deals).includes(Number(multiDeal.id))) fail(`the kept contact inherits the duplicate's assoc_deals (${JSON.stringify(keptNow.assoc_deals)})`);
  log('contactos: assoc_contacts de negocio y ticket apuntan al conservado (etiqueta «Principal» conservada, sin duplicados); el conservado hereda assoc_deals');
  const keepCo = data.addRecord('companies', { name: 'Vidriera Fusión', domain: 'vidriera-fusion.mx', owner: 'Fernando L.' });
  const dupCo = data.addRecord('companies', { name: 'Vidriera Fusión Dup', domain: 'vidriera-fusion-dup.mx', owner: 'Fernando L.' });
  const coTicket = data.addRecord('tickets', { name: 'Ticket con empresa duplicada', pipeline: pipe, status: data.firstOpenTicketStatus(pipe), priority: 'medium', owner: 'Fernando L.', source: 'Correo', contactId: '', assoc_companies: [dupCo.id, keepCo.id], assoc_labels_companies: { [dupCo.id]: 'Principal' } });
  const coContact = data.addRecord('contacts', { name: 'Carla Empresa', first: 'Carla', last: 'Empresa', email: 'carla.empresa@ejemplo.com', owner: 'Fernando L.', lifecycle: 'Lead', companyId: '', company: '', assoc_companies: [dupCo.id] });
  data.mergeRecords('companies', keepCo.id, [dupCo.id]);
  const coTicketNow = data.findRecord('tickets', coTicket.id);
  const coContactNow = data.findRecord('contacts', coContact.id);
  if (ids(coTicketNow.assoc_companies).join() !== String(keepCo.id) || coTicketNow.assoc_labels_companies[String(keepCo.id)] !== 'Principal') fail(`ticket assoc_companies remapped to the kept company (${JSON.stringify(coTicketNow.assoc_companies)} / ${JSON.stringify(coTicketNow.assoc_labels_companies)})`);
  if (!ids(coContactNow.assoc_companies).includes(Number(keepCo.id)) || ids(coContactNow.assoc_companies).includes(Number(dupCo.id))) fail(`contact assoc_companies remapped to the kept company (${JSON.stringify(coContactNow.assoc_companies)})`);
  log('empresas: assoc_companies de ticket y contacto apuntan a la conservada (deduplicado, etiqueta conservada)');
}
console.log('[record-merge] OK');
process.exit(0);

// Smoke test: the exclusion criteria «Cancelar la inscripción cuando se crea un negocio» and «…cuando cancela la
// suscripción» stop the sequence by themselves. Enrol a contact in «Solicitud de productos o demostración»
// (cancels on deal) and in a newsletter that cancels on unsubscribe; create a deal for that contact through
// addRecord (the single hook behind the slide-over, the record, workflows and the import) → the demo enrolment
// ends as Cancelada (status unenrolled, nextStepAt null, extra.reason «Negocio creado», stats.deal), leaves
// scheduled(), the contact timeline gets «Inscripción cancelada en «X»: se creó el negocio Y» and crm:enrolled
// fires; the newsletter keeps running. A deal of another contact changes nothing. Then the marketing opt-out
// («Sí») ends the newsletter with «Suscripción cancelada». The record's Secuencias card lists both with their
// reason. Run: node scripts/smoke-sequence-exclusion.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[seq-exclusion]', ...a);
const fail = (msg) => { console.error(`[seq-exclusion] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
}
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

useDom('<!doctype html><body class="app"></body>', 'http://localhost/deals/');
const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/sequences-data.js'));
await S.ready;
const [contact, other, third] = data.allContacts().filter((c) => c.email && c.marketingOptOut !== 'Sí');
if (!contact || !other || !third) fail('three contacts with e-mail');
// the prebuilt «Solicitud de productos o demostración» (cancels on reply, meeting and deal) and a newsletter that cancels on unsubscribe
const p = S.prebuiltByKey('demo-request');
if (!p || p.name !== 'Solicitud de productos o demostración' || !p.exclusion.includes('deal')) fail('prebuilt demo-request cancels on deal');
const demo = S.createSequence({ name: p.name, description: p.description, exclusion: p.exclusion, steps: typeof p.steps === 'function' ? p.steps() : p.steps, templateKey: p.key });
const news = S.createSequence({ name: 'Boletín con baja', exclusion: ['unsubscribed'], steps: [
  { id: 'n1', type: 'auto_email', delayDays: 0, title: '', subject: 'Novedades', body: 'Hola {{contacto.nombre}}', templateName: '', version: 'A', replyToPrevious: false },
  { id: 'n2', type: 'auto_email', delayDays: 3, title: '', subject: 'Más novedades', body: 'Segundo correo', templateName: '', version: 'A', replyToPrevious: false },
] });
const placeholders = { PRODUCT: 'Vidrio templado' };
// a clean slate for the three contacts: no other running enrolment interferes with the counts
for (const c of [contact, other, third]) S.enrollmentsOfContact(c.id).filter((e) => e.status === 'active' || e.status === 'paused').forEach((e) => S.unenroll(e.id));
const eDemo = S.enroll({ sequenceId: demo.id, contact, placeholders, enrolledBy: 'Fernando L.' })?.enrollment;
const eNews = S.enroll({ sequenceId: news.id, contact, enrolledBy: 'Fernando L.' })?.enrollment;
const eOther = S.enroll({ sequenceId: demo.id, contact: other, placeholders, enrolledBy: 'Fernando L.' })?.enrollment;
if (!eDemo || !eNews || !eOther) fail('three enrolments');
const enr = (id) => S.enrollments().find((e) => e.id === id);
const schedOf = (c) => S.scheduled().filter((x) => String(x.contactId) === String(c.id));
if (schedOf(contact).length !== 2 || schedOf(other).length !== 1) fail(`scheduled before (${schedOf(contact).length} / ${schedOf(other).length})`);
const cancelled = (c) => data.activitiesFor('contacts', c.id).filter((a) => a.type === 'system' && /^Inscripción cancelada en «/.test(a.text));
if (cancelled(contact).length || cancelled(other).length) fail('no cancellation entries yet');
let fired = [];
document.addEventListener('crm:enrolled', (ev) => { fired.push(ev.detail); });

// ---- a deal for the contact (addRecord: the single creation hook) ----
const deal = data.addRecord('deals', { name: 'Demo Megaglass', amount: 1500, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: new Date(data.TODAY.getTime() + 30 * 86400000).toISOString(), owner: 'Fernando L.', companyId: contact.companyId || '', company: contact.company || '', contactId: contact.id, priority: 'medium', type: 'Nuevo negocio', lastActivity: data.TODAY.toISOString() });
if (!deal || !deal.id) fail('deal created');
await wait(30); // the sequence module is imported on demand
const d1 = enr(eDemo.id);
if (d1.status !== 'unenrolled' || d1.nextStepAt !== null || d1.extra.reason !== 'Negocio creado' || d1.extra.reasonKey !== 'deal' || Number(d1.stats.deal) !== 1 || !d1.stats.dealAt) fail(`demo enrolment cancelled by the deal (${d1.status} / ${d1.nextStepAt} / ${JSON.stringify(d1.extra)} / ${JSON.stringify(d1.stats)})`);
if (enr(eNews.id).status !== 'active' || !enr(eNews.id).nextStepAt) fail('the newsletter (no deal criterion) keeps running');
if (enr(eOther.id).status !== 'active') fail('another contact in the same sequence is untouched');
if (schedOf(contact).length !== 1 || schedOf(contact)[0].id !== eNews.id || schedOf(other).length !== 1) fail('scheduled() drops the cancelled enrolment only');
const acts = data.activitiesFor('contacts', contact.id);
const entry = acts.find((a) => a.type === 'system' && a.text === `Inscripción cancelada en «${demo.name}»: se creó el negocio «Demo Megaglass».`);
if (!entry || entry.extra.enrollmentId !== eDemo.id || entry.extra.sequenceId !== demo.id || entry.extra.reason !== 'deal' || Number(entry.extra.deals) !== Number(deal.id)) fail(`timeline entry on the contact (${entry && JSON.stringify(entry.extra)})`);
if (!acts.some((a) => a.type === 'system' && a.text === 'Negocio «Demo Megaglass» creado y asociado a este contacto.')) fail('the deal association entry is still there');
if (cancelled(contact).length !== 1 || cancelled(other).length) fail('exactly one cancellation entry, none on the other contact');
if (fired.length !== 1 || fired[0].reason !== 'deal' || fired[0].enrollments.length !== 1 || fired[0].enrollments[0].id !== eDemo.id || fired[0].enrollments[0].sequenceName !== demo.name) fail('crm:enrolled fired with the cancelled enrolment');
if (!JSON.parse(mem['crm:sequence_enrollments']).some((e) => e.id === eDemo.id && e.status === 'unenrolled' && e.extra && e.extra.reason === 'Negocio creado')) fail('persisted with its reason');
if (S.unenrollReasonOf(d1) !== 'Negocio creado' || S.unenrollReasonOf(enr(eNews.id)) !== '') fail('unenrollReasonOf');
log(`negocio «${deal.name}» → «${demo.name}» = Cancelada: Negocio creado (nextStepAt null, stats.deal 1); «${news.name}» sigue activa; otro contacto intacto; scheduled 2 → 1; cronología + crm:enrolled`);

// ---- a deal of another contact changes nothing for this one ----
data.addRecord('deals', { name: 'Negocio ajeno', amount: 10, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: new Date(data.TODAY.getTime() + 30 * 86400000).toISOString(), owner: 'Fernando L.', companyId: '', company: '', contactId: third.id, priority: 'medium', type: 'Nuevo negocio', lastActivity: data.TODAY.toISOString() });
await wait(30);
if (enr(eNews.id).status !== 'active' || enr(eOther.id).status !== 'active' || cancelled(contact).length !== 1 || cancelled(other).length || cancelled(third).length || fired.length !== 1) fail('a deal of another contact affects nobody enrolled');
// a second deal for the contact: nothing left to cancel, no second entry
data.addRecord('deals', { name: 'Segundo negocio', amount: 20, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: new Date(data.TODAY.getTime() + 30 * 86400000).toISOString(), owner: 'Fernando L.', companyId: '', company: '', contactId: contact.id, priority: 'medium', type: 'Nuevo negocio', lastActivity: data.TODAY.toISOString() });
await wait(30);
if (cancelled(contact).length !== 1 || fired.length !== 1 || enr(eNews.id).status !== 'active') fail('a second deal logs nothing more');
log('negocio de otro contacto y segundo negocio: sin cambios');

// ---- the marketing opt-out («Sí») ends the sequences that cancel on unsubscribe ----
data.setField('contacts', contact.id, 'marketingOptOut', 'Sí');
await wait(30);
const n1 = enr(eNews.id);
if (n1.status !== 'unenrolled' || n1.nextStepAt !== null || n1.extra.reason !== 'Suscripción cancelada' || n1.extra.reasonKey !== 'unsubscribed' || Number(n1.stats.unsubscribed) !== 1 || !n1.stats.unsubscribedAt) fail(`newsletter cancelled by the unsubscribe (${n1.status} / ${JSON.stringify(n1.extra)} / ${JSON.stringify(n1.stats)})`);
if (enr(eOther.id).status !== 'active') fail('other contact still untouched');
if (schedOf(contact).length !== 0) fail('nothing scheduled for the contact any more');
const unsub = data.activitiesFor('contacts', contact.id).find((a) => a.type === 'system' && a.text === `Inscripción cancelada en «${news.name}»: canceló la suscripción.`);
if (!unsub || unsub.extra.enrollmentId !== eNews.id || unsub.extra.reason !== 'unsubscribed') fail('timeline entry for the unsubscribe');
if (!data.activitiesFor('contacts', contact.id).some((a) => a.text === 'Se dio de baja de los correos de marketing')) fail('the opt-out note itself stays');
if (fired.length !== 2 || fired[1].reason !== 'unsubscribed' || fired[1].enrollments[0].id !== eNews.id) fail('crm:enrolled for the unsubscribe');
if (data.findRecord('contacts', contact.id).marketingOptOut !== 'Sí') fail('opt-out saved');
// re-subscribing cancels nothing (and there is nothing left anyway)
data.setField('contacts', contact.id, 'marketingOptOut', 'No');
await wait(30);
if (fired.length !== 2 || cancelled(contact).length !== 2) fail('re-subscribing changes nothing');
log(`baja de marketing → «${news.name}» = Cancelada: Suscripción cancelada; cronología + crm:enrolled; reactivar no cambia nada`);

// ---- the exclusion criteria are respected: a sequence without 'deal' ignores deals; 'replied' still works as before ----
const plain = S.createSequence({ name: 'Sin criterio de negocio', exclusion: ['replied'], steps: [{ id: 'p1', type: 'auto_email', delayDays: 0, title: '', subject: 'Hola', body: 'Hola', templateName: '', version: 'A', replyToPrevious: false }] });
const ePlain = S.enroll({ sequenceId: plain.id, contact: third, enrolledBy: 'Fernando L.' })?.enrollment;
data.addRecord('deals', { name: 'Tercer negocio', amount: 1, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: new Date(data.TODAY.getTime() + 30 * 86400000).toISOString(), owner: 'Fernando L.', companyId: '', company: '', contactId: third.id, priority: 'medium', type: 'Nuevo negocio', lastActivity: data.TODAY.toISOString() });
await wait(30);
if (enr(ePlain.id).status !== 'active' || cancelled(third).length) fail('a sequence without the deal criterion ignores the deal');
const hits = S.unenrollByReason(third.id, 'replied');
if (hits.length !== 1 || hits[0].id !== ePlain.id || enr(ePlain.id).status !== 'replied' || enr(ePlain.id).extra.reason !== undefined || S.unenrollReasonOf(enr(ePlain.id)) !== 'Respondió') fail('replied keeps its own status, no extra.reason');
if (S.unenrollByReason(third.id, 'bogus').length !== 0) fail('unknown reason ignored');
log('secuencia sin el criterio: el negocio no la toca; «replied» sigue con su propio estado');

// ---- the contact record: the Secuencias card lists the ended enrolments with their reason ----
useDom(`<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`, `http://localhost/contacts/record/?id=${contact.id}`);
await import(resolve(here, '../src/record.js'));
await wait(60);
const endedEls = [...document.querySelectorAll('[data-seq-ended]')];
const byId = (id) => endedEls.find((el) => el.dataset.seqEnded === id);
if (!byId(eDemo.id) || !text(byId(eDemo.id)).startsWith(`${demo.name} · Cancelada: Negocio creado`)) fail(`record card shows the deal cancellation (${endedEls.map(text).join(' | ')})`);
if (!byId(eNews.id) || !text(byId(eNews.id)).startsWith(`${news.name} · Cancelada: Suscripción cancelada`)) fail('record card shows the unsubscribe cancellation');
if (![...document.querySelectorAll('#rec-timeline .timeline__item')].some((el) => text(el).includes(`Inscripción cancelada en «${demo.name}»: se creó el negocio «Demo Megaglass».`))) fail('timeline on the record shows the entry');
log('ficha: tarjeta Secuencias con «Cancelada: Negocio creado» y «Cancelada: Suscripción cancelada»; cronología con la entrada');
console.log('[seq-exclusion] OK');
process.exit(0);

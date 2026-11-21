// Smoke test: a contact who replies stops the sequences that cancel on reply. Enrol a contact in a sequence with
// the «replied» exclusion and in one without it; simulate an incoming e-mail from that contact through
// createConversation (the common path of the Gmail sync and the inbox); the first enrolment ends as «Respondió»
// (status replied, nextStepAt null, stats.replied = 1 with repliedAt), leaves scheduled(), is counted by the
// reply rate (sequenceMetrics / analytics), the contact timeline gets the system entry and crm:enrolled fires;
// the second enrolment stays active. A second reply changes nothing more. Run: node scripts/smoke-sequence-reply-unenroll.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[seq-reply]', ...a);
const fail = (msg) => { console.error(`[seq-reply] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"></body>', { url: 'http://localhost/inbox/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });

const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/sequences-data.js'));
const C = await import(resolve(here, '../src/conversations-data.js'));
await S.ready; await C.ready;
if (!S.sequencesLoaded()) fail('sequences loaded flag');
const contact = data.allContacts().find((c) => c.email);
const steps = [
  { id: 's1', type: 'auto_email', delayDays: 0, title: '', subject: 'Hola {{contacto.nombre}}', body: 'Primer correo', templateName: '', version: 'A', replyToPrevious: false },
  { id: 's2', type: 'auto_email', delayDays: 2, title: '', subject: 'Seguimiento', body: 'Segundo correo', templateName: '', version: 'A', replyToPrevious: true },
  { id: 's3', type: 'call', delayDays: 2, title: 'Llamar', subject: '', body: '', templateName: '', version: 'A', replyToPrevious: false },
];
const withReplied = S.createSequence({ name: 'Prospección con cancelación', exclusion: ['replied', 'meeting'], steps });
const without = S.createSequence({ name: 'Boletín sin cancelación', exclusion: ['meeting'], steps });
const e1 = S.enroll({ sequenceId: withReplied.id, contact, enrolledBy: 'Fernando L.' }).enrollment;
const e2 = S.enroll({ sequenceId: without.id, contact, enrolledBy: 'Fernando L.' }).enrollment;
const enr = (id) => S.enrollments().find((e) => e.id === id);
if (enr(e1.id).status !== 'active' || enr(e2.id).status !== 'active') fail('both enrolments start active');
const schedBefore = S.scheduled().filter((x) => x.contactId === contact.id).length;
if (schedBefore !== 2) fail(`both enrolments are scheduled (${schedBefore})`);
const actsBefore = data.activitiesFor('contacts', contact.id).length;
let fired = null;
document.addEventListener('crm:enrolled', (ev) => { fired = ev.detail; });

// ---- the contact replies: an incoming e-mail through createConversation (Gmail sync / inbox path) ----
const conv = C.createConversation({ contactId: contact.id, channel: 'email', subject: 'Re: Hola', body: 'Gracias, me interesa. ¿Podemos hablar el jueves?', direction: 'in', author: contact.name });
if (!conv) fail('conversation created');
await wait(0);
const r1 = enr(e1.id);
if (r1.status !== 'replied' || r1.nextStepAt !== null || Number(r1.stats.replied) !== 1 || !r1.stats.repliedAt) fail(`sequence with the replied criterion ends as Respondió (${r1.status} / ${r1.nextStepAt} / ${JSON.stringify(r1.stats)})`);
if (enr(e2.id).status !== 'active' || !enr(e2.id).nextStepAt) fail('a sequence without the criterion keeps running');
const sched = S.scheduled().filter((x) => x.contactId === contact.id);
if (sched.length !== 1 || sched[0].id !== e2.id) fail('scheduled() drops the cancelled enrolment only');
const acts = data.activitiesFor('contacts', contact.id);
const note = acts.find((a) => a.type === 'system' && a.text === `Respondió a la secuencia «${withReplied.name}»: inscripción cancelada.`);
if (!note || note.extra.enrollmentId !== e1.id || note.extra.sequenceId !== withReplied.id || note.extra.conversationId !== conv.id) fail('timeline entry on the contact');
if (acts.length < actsBefore + 2) fail('the message itself and the cancellation are both on the timeline');
if (!fired || fired.reason !== 'replied' || fired.enrollments.length !== 1 || fired.enrollments[0].id !== e1.id) fail('crm:enrolled fired with the cancelled enrolment');
if (S.sequenceMetrics(withReplied.id).replyRate !== 1 || S.sequenceMetrics(without.id).replyRate !== 0) fail('reply rate counts the reply');
const a = S.analytics({ sequence: withReplied.id });
if (a.replies !== 1 || a.replyRate !== 1) fail(`analytics: ${a.replies} replies, rate ${a.replyRate}`);
if (!JSON.parse(mem['crm:sequence_enrollments']).some((e) => e.id === e1.id && e.status === 'replied')) fail('persisted');
log(`reply → «${withReplied.name}» = Respondió (nextStepAt null, replied 1, repliedAt ${r1.stats.repliedAt.slice(0, 10)}); «${without.name}» sigue activa; scheduled 2 → 1; cronología + crm:enrolled; tasa de respuesta 100 %`);

// ---- a second reply changes nothing; an outgoing message never cancels; a paused enrolment with the criterion also ends ----
C.sendMessage(conv.id, { body: 'Otra respuesta más.', direction: 'in', author: contact.name });
await wait(0);
if (data.activitiesFor('contacts', contact.id).filter((x) => /inscripción cancelada/.test(x.text)).length !== 1) fail('a second reply does not log a second cancellation');
C.sendMessage(conv.id, { body: 'Claro, el jueves a las 10.', direction: 'out' });
await wait(0);
if (enr(e2.id).status !== 'active') fail('an outgoing message never cancels');
const other = data.allContacts().find((c) => c.email && c.id !== contact.id);
const made4 = S.enroll({ sequenceId: withReplied.id, contact: other, enrolledBy: 'Fernando L.' });
if (!made4) fail('enrol another contact');
const e4 = made4.enrollment;
const paused = S.pauseEnrollment(e4.id);
const hits = S.unenrollByReason(other.id, 'replied');
// (the seeded sample data may hold other running enrolments of that contact in sequences with the criterion: they end too)
const mine = hits.find((h) => h.id === e4.id);
if (!paused || paused.status !== 'paused' || !mine || mine.sequenceName !== withReplied.name || enr(e4.id).status !== 'replied' || !hits.every((h) => h.status === 'replied' && h.nextStepAt === null)) fail(`unenrollByReason also ends a paused enrolment and reports the sequence name (paused ${paused && paused.status} | hits ${hits.length} | status ${enr(e4.id) && enr(e4.id).status})`);
if (S.unenrollByReason(other.id, 'replied').length !== 0 || S.unenrollByReason(other.id, 'nope').length !== 0) fail('nothing left to cancel / unknown reason');
log('second reply idempotent; outgoing ignored; paused enrolment ends too; unknown reason ignored');
console.log('[seq-reply] OK');
process.exit(0);

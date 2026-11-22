// Smoke test for «Inscribir en secuencia» from the contacts bulk bar (src/list.js + src/sequence-enroll.js with
// several contacts): select three contacts (one already active in the sequence), open the dialog («3 contactos
// seleccionados» with the list, sequence selector, enrol-as, start date/time, shared placeholders, preview with a
// contact picker), confirm → two new enrolments with their timeline entry and first-step task, the already
// enrolled one skipped, the toast with the breakdown, and the new steps in scheduled() / the Programado tab.
// Also: a contact without e-mail is enrolled with the warning, and the single-contact dialog is unchanged.
// Run: node scripts/smoke-bulk-enroll.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[bulk-enroll]', ...a);
const fail = (msg) => { console.error(`[bulk-enroll] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
function useDom(main, url) {
  const dom = new JSDOM(`<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header>${main}<div id="scrim"></div></body>`, { url, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return dom;
}
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const change = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };

useDom('<main id="list-root"></main>', 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/sequences-data.js'));
await S.ready;
// a sequence whose first step is a call (creates the task) followed by an automatic e-mail; no placeholders
const seq = S.createSequence({ name: 'Prospección masiva', exclusion: ['replied'], steps: [
  { id: 'b1', type: 'call', delayDays: 0, title: 'Llamar a {{contacto.nombre}}', subject: '', body: '', templateName: '', version: 'A', replyToPrevious: false },
  { id: 'b2', type: 'auto_email', delayDays: 2, title: '', subject: 'Seguimiento', body: 'Hola {{contacto.nombre}}', templateName: '', version: 'A', replyToPrevious: false },
] });
await import(resolve(here, '../src/contacts.js'));
await wait(40);
click(q('button.views__tab[data-view="std:all"]'));
await wait(20);
const ids = qa('#table tbody tr[data-id]').slice(0, 3).map((tr) => Number(tr.dataset.id));
const people = ids.map((id) => data.findRecord('contacts', id));
if (people.length !== 3 || people.some((c) => !c)) fail('three contacts on the first page');
// one of them is already active in the sequence
S.enrollmentsOfContact(people[1].id).filter((e) => e.status === 'active' || e.status === 'paused').forEach((e) => S.unenroll(e.id));
const pre = S.enroll({ sequenceId: seq.id, contact: people[1], enrolledBy: 'Fernando L.' });
if (!pre) fail('pre-enrol the second contact');
[people[0], people[2]].forEach((c) => S.enrollmentsOfContact(c.id).filter((e) => e.sequenceId === seq.id && (e.status === 'active' || e.status === 'paused')).forEach((e) => S.unenroll(e.id)));
const tasksBefore = data.allTasks().length;
const schedBefore = S.scheduled().length;
const actsBefore = Object.fromEntries(people.map((c) => [c.id, data.activitiesFor('contacts', c.id).length]));

// ---- select the three rows → «Inscribir en secuencia» in the bulk bar ----
for (const id of ids) { const cb = q(`#table tbody tr[data-id="${id}"] input[type="checkbox"]`); cb.checked = true; cb.dispatchEvent(new window.Event('change', { bubbles: true })); await wait(10); }
const btn = q('[data-action="bulk-enroll"]');
if (!btn || !text(btn).endsWith('Inscribir en secuencia') || !q('[data-action="bulk-tasks"]')) fail(`bulk bar offers «Inscribir en secuencia» next to «Crear tareas» (${btn && text(btn)})`);
click(btn);
await wait(60); // the dialog module loads on demand
if (!$('enr-modal') || !$('enr-modal').classList.contains('is-open') || text($('enr-title')) !== 'Inscribir 3 contactos en una secuencia') fail(`dialog for several contacts (${text($('enr-title'))})`);
if (!$('enr-contacts') || !text(q('#enr-contacts summary')).startsWith('3 contactos seleccionados') || qa('#enr-contacts li').length !== 3) fail('collapsible list of the selected contacts');
if (!$('enr-seq') || !$('enr-by') || !$('enr-date') || !$('enr-time') || !$('enr-confirm').disabled) fail('sequence / enrol as / start date-time / confirm disabled');
const opt = qa('#enr-seq option').find((o) => o.value === seq.id);
if (!opt || !text(opt).includes('1 ya inscrito')) fail(`sequence option counts the already enrolled (${opt && text(opt)})`);
change($('enr-seq'), seq.id);
await wait(10);
if (!text($('enr-warn')).includes('1 contacto ya está inscrito en esta secuencia') || !text($('enr-warn')).includes('se omitirá')) fail(`warning about the skipped contact (${text($('enr-warn'))})`);
if (!$('enr-preview-contact') || qa('#enr-preview-contact option').length !== 3) fail('preview contact picker');
const firstName = (c) => c.first || c.name.split(' ')[0];
if (!text($('enr-preview')).includes(`Llamar a ${firstName(people[0])}`)) fail('preview uses the first contact');
change($('enr-preview-contact'), '2');
await wait(10);
if (!text($('enr-preview')).includes(`Llamar a ${firstName(people[2])}`)) fail('preview switches contact');
if ($('enr-confirm').disabled || text($('enr-confirm')) !== 'Iniciar secuencia · 2 de 3') fail(`confirm label (${text($('enr-confirm'))})`);
log('dialog: 3 contactos, opción «1 ya inscrito», aviso de omisión, vista previa por contacto, botón «Iniciar secuencia · 2 de 3»');

// ---- confirm → 2 enrolments, tasks, timeline, toast, scheduled ----
let fired = null;
document.addEventListener('crm:enrolled', (e) => { fired = e.detail; });
click($('enr-confirm'));
await wait(30);
if ($('enr-modal').classList.contains('is-open')) fail('dialog closes');
const now = (c) => S.enrollmentsOfContact(c.id).filter((e) => e.sequenceId === seq.id && e.status === 'active');
if (now(people[0]).length !== 1 || now(people[2]).length !== 1 || now(people[1]).length !== 1 || now(people[1])[0].id !== pre.enrollment.id) fail('two new enrolments; the already enrolled contact keeps its own');
if (data.allTasks().length !== tasksBefore + 2) fail(`first-step task per new enrolment (${data.allTasks().length - tasksBefore})`);
for (const c of [people[0], people[2]]) if (data.activitiesFor('contacts', c.id).length < actsBefore[c.id] + 1 || !data.activitiesFor('contacts', c.id).some((a) => /Inscrito en la secuencia «Prospección masiva»/.test(a.text))) fail(`timeline entry for ${c.name}`);
if (data.activitiesFor('contacts', people[1].id).filter((a) => /Inscrito en la secuencia «Prospección masiva»/.test(a.text)).length !== 1) fail('the skipped contact gets no second entry');
const toastText = text($('toast'));
if (!toastText.startsWith('Inscritos 2 de 3 en «Prospección masiva»') || !toastText.includes('1 contacto ya estaba inscrito y se omitió') || !toastText.includes('2 tareas creadas')) fail(`toast breakdown (${toastText})`);
if (!fired || fired.enrolled !== 2 || fired.skipped !== 1 || fired.total !== 3) fail('crm:enrolled summary');
if (S.scheduled().length !== schedBefore + 2 || !now(people[0]).every((e) => S.scheduled().some((s) => s.id === e.id))) fail('new steps in scheduled()');
if (qa('#table tbody tr input[type="checkbox"]:checked').length) fail('selection cleared after enrolling');
log('confirm: inscritos 2 de 3, 1 omitido, 2 tareas, cronología, crm:enrolled, scheduled +2 |', toastText);

// ---- Programado tab lists the new steps ----
useDom('<main id="seq-root"></main>', 'http://localhost/sequences/');
await import(resolve(here, '../src/sequences.js'));
await wait(40);
click(q('[data-tab="scheduled"]'));
await wait(20);
for (const c of [people[0], people[2]]) if (!q(`#seq-sched tr[data-enr="${now(c)[0].id}"]`)) fail(`Programado lists the new step of ${c.name}`);
log('Programado: filas de los 2 nuevos pasos');

// ---- a contact without e-mail: enrolled with the warning ----
useDom('<main id="list-root"></main>', 'http://localhost/contacts/');
const E = await import(resolve(here, '../src/sequence-enroll.js'));
const blank = data.addRecord('contacts', { name: 'Sin Correo Pérez', first: 'Sin', last: 'Correo Pérez', email: '', phone: '+52 55 0000 0000', owner: 'Fernando L.', status: 'Nuevo', created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
const other = data.allContacts().find((c) => c.email && !ids.includes(Number(c.id)));
await E.openEnrollDialog({ contacts: [blank, other] });
change($('enr-seq'), seq.id);
await wait(10);
if (!text($('enr-warn')).includes('1 contacto sin correo') || !text($('enr-warn')).includes('se omitirán')) fail(`warning about the contact without e-mail (${text($('enr-warn'))})`);
click($('enr-confirm'));
await wait(20);
if (now(blank).length !== 1 || !text($('toast')).includes('Inscritos 2 de 2') || !text($('toast')).includes('1 sin correo')) fail(`enrols the contact without e-mail and says so (${text($('toast'))})`);
// single contact: the classic dialog (title with the name, no list, no picker)
await E.openEnrollDialog({ contact: other });
if (!text($('enr-title')).startsWith(`Inscribir a ${other.name}`) || $('enr-contacts') || $('enr-preview-contact')) fail('single-contact dialog unchanged');
E.closeEnrollDialog();
log('sin correo: inscrito con aviso; diálogo de un solo contacto intacto');
console.log('[bulk-enroll] OK');
process.exit(0);

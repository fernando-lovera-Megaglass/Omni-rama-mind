// DOM smoke test for Ventas › Secuencias: the list (counter, tabs, Acciones, banner, search, owner filter,
// folders, row actions, papelera), the Análisis tab (filters as chips, metric cards, chart), Programado and
// Automatizar; the create flow (start cards, pre-built list → title/metrics 5/7/40 %/2 and 5 steps, expandable
// step cards with token chips, placeholder, PAUSA LA SECUENCIA, RESPUESTA (n), delays, add/delete step,
// Completado, Crear secuencia → saved); and the enrolment from a contact record (dialog, placeholders,
// resolved preview, enrolment + task + timeline entry). Run: node scripts/smoke-sequences.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[secuencias]', ...a);
const fail = (msg) => { console.error(`[secuencias] FAIL: ${msg}`); process.exit(1); };
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  dom.window.prompt = (q, d) => d;
  return dom;
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const change = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== 1) The list =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content" id="seq-root"></main><div id="scrim"></div></body>', 'http://localhost/sequences/');
const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/sequences-data.js'));
await S.ready;
await import(resolve(here, '../src/sequences.js'));
const rows = () => qa('#seq-rows tr[data-id]');
if (S.sequencesLive()) fail('the test must run in local mode (no Supabase env)');
if (S.sequences().length !== 3 || text($('seq-count')) !== '3 creados') fail(`seed: ${S.sequences().length} / ${text($('seq-count'))}`);
if (S.PREBUILT.length !== 6 || S.enrollments().length < 40) fail('pre-built sequences / seeded enrolments');
if (qa('[data-tab]').map(text).join('|') !== 'Administrar|Análisis|Automatizar|Programado') fail('tabs');
if (!q('[data-ta="export"]') || !q('[data-ta="trash"]') || !q('[data-ta="create"]') || q('[data-ta="create"]').getAttribute('href') !== 'create/') fail('Acciones / Crear secuencia');
if (!text($('seq-banner')).includes('Envía secuencias sin salir de tu bandeja de entrada')) fail('banner');
if ($('seq-q').placeholder !== 'Buscar en secuencias' || !text(q('#seq-owner [data-value=""] .owner__name')).startsWith('Cualquiera') || !q('[data-ta="new-folder"]')) fail('filters row');
const heads = qa('.seqs__table thead th').map(text).filter(Boolean);
if (heads.join('|') !== 'Nombre|Total inscritos|Tasa de respuesta|Tasa de reuniones|Propietario|Fecha de modificación') fail(`columns: ${heads.join('|')}`);
if (rows().length !== 3 || !qa('[data-folder-row]').map((r) => r.dataset.folderRow).includes('Ventas')) fail('rows / folders');
const r0 = rows()[0];
// Date rule of the tables (src/data.js): short date «6 nov 2026» in the cell, full date-time in the tooltip.
if (!/^\d+$/.test(text(r0.children[2])) || !text(r0.children[3]).includes('%') || !text(r0.children[4]).includes('%') || !/^\d{1,2} [a-z]{3} \d{4}$/.test(text(r0.children[6])) || !/^\d{1,2} [a-z]{3} \d{4} \d{2}:\d{2}$/.test(r0.children[6].querySelector('[title]')?.getAttribute('title') || '')) fail(`row cells: ${text(r0)}`);
if (qa('[data-id] .menu__item').slice(0, 4).map(text).join('|') !== 'Editar|Clonar|Mover|Eliminar') fail('row actions');
click(q('[data-folder-toggle="Ventas"]'));
if (rows().length !== 1 || q('[data-folder-toggle="Ventas"]').getAttribute('aria-expanded') !== 'false') fail('folder collapse');
click(q('[data-folder-toggle="Ventas"]'));
if (rows().length !== 3) fail('folder expand');
click(q('[data-ta="banner-close"]'));
if ($('seq-banner') || !S.bannerDismissed()) fail('banner dismiss');
input($('seq-q'), 'reactiv');
if (rows().length !== 1 || !text(rows()[0]).includes('Reactivación')) fail('search');
input($('seq-q'), '');
change($('seq-owner'), 'Sofía R.');
if (rows().length !== 1) fail('owner filter');
change($('seq-owner'), '');
const first = S.sequences().find((s) => s.name.includes('Prospección'));
click(rows().find((r) => r.dataset.id === first.id).querySelector('[data-act="clone"]'));
if (text($('seq-count')) !== '4 creados' || !S.sequences().some((s) => s.name === `${first.name} (copia)`)) fail('clone');
const copy = S.sequences().find((s) => s.name === `${first.name} (copia)`);
click(rows().find((r) => r.dataset.id === copy.id).querySelector('[data-act="delete"]'));
if (!text($('seq-modal-body')).includes('¿Seguro que quieres eliminar')) fail('delete confirmation');
click(q('[data-se="confirm-delete"]'));
if (text($('seq-count')) !== '3 creados' || S.trashedSequences().length !== 1) fail('delete → papelera');
click(q('[data-ta="trash"]'));
if (qa('#seq-modal [data-se="restore"]').length !== 1) fail('papelera list');
click(q('#seq-modal [data-bm="close"]'));
click(q('[data-ta="new-folder"]'));
input($('seqf-name'), 'Prospección');
click(q('[data-se="create-folder"]'));
if (!S.folders().includes('Prospección') || !qa('[data-folder-row]').map((r) => r.dataset.folderRow).includes('Prospección')) fail('new folder');
click(rows().find((r) => r.dataset.id === first.id).querySelector('[data-act="move"]'));
change($('seqm-folder'), 'Prospección');
click(q('[data-se="confirm-move"]'));
if (S.sequenceById(first.id).folder !== 'Prospección') fail('move');
if (!S.sequencesCsv().startsWith('"Nombre","Total inscritos"')) fail('csv');
log('list: counter, tabs, Acciones, banner, search/owner, folders collapse, clone/delete/papelera, move');

// ===== 2) Tabs: Análisis, Programado, Automatizar =====
click(q('[data-tab="analyze"]'));
if (!q('[data-tab="analyze"]').classList.contains('is-active') || !location.search.includes('tab=analyze')) fail('tab switch');
const filters = qa('.seqan__filter > button').map(text);
['Empresa', 'Secuencia', 'Estado', 'Carpeta', 'Inscrito por', 'Fecha de inscripción'].forEach((f) => { if (!filters.some((x) => x.startsWith(f))) fail(`filter ${f}`); });
const labels = qa('.seqan__label').map(text);
['TOTAL DE INSCRIPCIONES', 'TASA DE REUNIONES', 'TASA DE RESPUESTA', 'SIN RESPUESTA', 'RESULTADOS DEL NEGOCIO', 'TASA DE APERTURA', 'TASA DE CLICS', 'TASA DE REBOTE', 'TASA DE CANCELACIÓN DE SUSCRIPCIÓN', 'EMPRESAS INSCRITAS', 'TASA DE INTERACCIÓN'].forEach((l) => { if (!labels.includes(l)) fail(`card ${l}`); });
const a = S.analytics();
const cardOf = (label) => qa('.seqan__card').find((c) => text(c.querySelector('.seqan__label')) === label);
if (text(cardOf('TOTAL DE INSCRIPCIONES').querySelector('.seqan__value')) !== String(a.total) || !text(cardOf('TOTAL DE INSCRIPCIONES')).includes(`${a.contacts} contactos`)) fail('total card');
if (!text(cardOf('TASA DE RESPUESTA')).includes(`${a.replies} respuestas`) || !text(cardOf('TASA DE APERTURA')).includes(`${a.opens} aperturas`)) fail('rate cards');
if (!text(cardOf('EMPRESAS INSCRITAS')).includes('contactos por empresa')) fail('company card');
if (!q('.seqan__svg') || qa('.seqan__bar').length !== 8 || !q('#seq-metric') || !q('#seq-freq')) fail('chart');
if (q('#seq-metric option:checked').textContent !== 'Reuniones programadas' || q('#seq-freq option:checked').textContent !== 'Semanalmente') fail('chart defaults');
change($('seq-freq'), 'day');
if (qa('.seqan__bar').length !== 14) fail('daily chart');
change($('seq-freq'), 'week');
click(q('[data-filter="status"][data-value="meeting"]'));
if (!q('.seqan__chip') || !text(q('.seqan__chip')).includes('Estado: Reunión reservada')) fail('filter chip');
if (text(cardOf('TOTAL DE INSCRIPCIONES').querySelector('.seqan__value')) !== String(S.analytics({ status: 'meeting' }).total) || text(cardOf('TASA DE REUNIONES').querySelector('.seqan__value')) !== '100 %') fail('filtered metrics');
click(q('[data-unfilter="status"]'));
if (q('.seqan__chip')) fail('chip removal');
const waitingPreview = S.enroll({ sequenceId: S.sequences().find(s => s.steps[0].type === 'manual_email').id, contact: data.allContacts()[0] });
click(q('[data-tab="scheduled"]'));
const waitingRow = q(`#seq-sched tr[data-enr="${waitingPreview.enrollment.id}"]`);
if (!text(waitingRow).includes('esperando la tarea') || !text(waitingRow).includes('Manual')) fail('scheduled waiting label');
if (qa('#seq-sched tr[data-enr]').length !== S.scheduled().length || !S.scheduled().length) fail('scheduled rows');
click(q('[data-tab="automate"]'));
if (qa('.seqauto__card').length !== 3) fail('automate cards');
click(q('[data-tab="manage"]'));
log(`analysis: ${a.total} enrolments, ${a.contacts} contacts, cards, chips, chart (week/day); scheduled ${S.scheduled().length}; automate`);

// ===== 3) Create from a pre-built sequence =====
useDom('<!doctype html><body class="app app--editor"><main class="seqed-root" id="seqed-root"></main></body>', 'http://localhost/sequences/create/');
await import(resolve(here, '../src/sequence-editor.js'));
if (text($('seqed-title')) !== 'Nueva secuencia' || text(q('.seqed__back')) !== '‹ Volver a Secuencias' || text($('seqed-create')) !== 'Crear secuencia') fail('editor bar');
if (!q('[data-se="blank"]') || !q('[data-se="dynamic"]') || !text(q('[data-se="dynamic"]')).includes('Crear una secuencia dinámica')) fail('start cards');
const pre = qa('[data-prebuilt]').map(text);
['Conversión más reciente', 'Seguimiento de eventos', 'Solicitud de productos o demostración', 'Secuencia de seguimiento tras llamada/reunión', 'Captación de prospectos - Basada en llamadas', 'Captación de prospectos - Basada en correos'].forEach((n) => { if (!pre.some((p) => p.startsWith(n))) fail(`pre-built ${n}`); });
if (!text(q('.seqed__right h2')).includes('Vista previa') || qa('.seqed__metric span').map(text).join('|') !== 'Total de pasos|Días para completar|Pasos automatizados|Criterios de exclusión') fail('metrics bar');
if (!q('[data-chooser="0"]') || !text(q('[data-chooser="0"]')).includes('Elige la primera acción que realizará la secuencia') || qa('[data-add-type]').length !== 6 || !text(q('[data-add-type="auto_email"]')).includes('Enviar automáticamente un correo por mí')) fail('step 1 chooser');
click(q('[data-prebuilt="recent-conversion"]'));
if (text($('seqed-title')) !== 'Conversión más reciente' || $('seqed-desc').hidden || !text($('seqed-desc')).length) fail('title/description after choosing the template');
const metric = (k) => text(q(`[data-metric="${k}"]`));
if (metric('steps') !== '5' || metric('days') !== '7' || metric('auto') !== '40 %' || metric('exclusion') !== '2') fail(`metrics: ${metric('steps')}/${metric('days')}/${metric('auto')}/${metric('exclusion')}`);
const steps = () => qa('.seqstep[data-step]');
if (steps().length !== 5) fail('5 steps');
const names = () => steps().map((s) => text(s.querySelector('.seqstep__name')));
if (names()[0] !== '1. Correo automatizado - Día 1' || names()[1] !== '2. Tarea de llamada - Día 3' || names()[4] !== '5. Tarea de correo manual - Día 8') fail(`step names: ${names().join(' | ')}`);
if (qa('.seqstep[data-step] .seqstep__pause').length !== 3 || text(steps()[1].querySelector('.seqstep__pause')) !== 'PAUSA LA SECUENCIA' || steps()[0].querySelector('.seqstep__pause')) fail('pause badges');
click(steps()[0].querySelector('[data-toggle]'));
if (!steps()[0].classList.contains('is-open') || text(steps()[0].querySelector('.seqstep__version')) !== 'Versión A' || text(steps()[0].querySelector('.seqstep__tpl')) !== 'Conversión reciente (Correo No. 1)') fail('step 1 expanded');
if (!steps()[0].querySelector('[data-subject]').value.includes('{{contacto.empresa|tu proyecto}}')) fail('subject');
const chips = [...steps()[0].querySelectorAll('[data-body] .tok')].map(text);
if (!chips.includes('Contacto: Nombre') || !chips.includes('Empresa: Sector') || !chips.includes('Propietario: Nombre')) fail(`token chips: ${chips.join(' | ')}`);
if (text(steps()[0].querySelector('[data-body] .ph')) !== 'Marcador de posición: X CONTENT' || steps()[0].querySelector('.ph').getAttribute('contenteditable') !== 'false') fail('placeholder chip');
if (steps()[0].querySelector('.seqstep__reply')) fail('first e-mail must not offer RESPUESTA');
click(steps()[1].querySelector('[data-toggle]'));
if (!steps()[1].querySelector('[data-title]') || !text(steps()[1]).includes('Título de la tarea') || !steps()[1].querySelector('[data-title]').value.includes('{{contacto.nombre}}')) fail('task step');
click(steps()[2].querySelector('[data-toggle]'));
const reply = steps()[2].querySelector('.seqstep__reply');
if (!reply || !text(reply).startsWith('RESPUESTA (1)') || !reply.querySelector('input').checked) fail(`RESPUESTA option: ${text(reply)}`);
const delays = () => qa('.seqflow__delay').map(text);
if (delays()[0] !== 'Retraso: 2 días laborables' || delays()[2] !== 'Retraso: 1 día laborable') fail(`delays: ${delays().join(' | ')}`);
click(qa('.seqflow__delay')[0]);
if (!q('[data-delay-input]')) fail('delay editor');
q('[data-delay-input]').value = '3';
click(q('[data-delay-ok]'));
if (metric('days') !== '8' || names()[1] !== '2. Tarea de llamada - Día 4' || delays()[0] !== 'Retraso: 3 días laborables') fail('delay change');
click(qa('.seqflow__delay')[0]);
q('[data-delay-input]').value = '0';
click(q('[data-delay-ok]'));
if (delays()[0] !== 'Retraso: Ninguna' || metric('days') !== '5') fail('delay none');
click(qa('.seqflow__delay')[0]);
q('[data-delay-input]').value = '2';
click(q('[data-delay-ok]'));
if (metric('days') !== '7') fail('delay restored');
if (!q('.seqflow__done') || text(q('.seqflow__done')) !== '✓ Completado') fail('Completado node');
click(q('[data-add-at="5"]'));
if (!q('[data-chooser="5"]')) fail('add-step chooser');
click(q('[data-add-type="task"][data-at="5"]'));
if (steps().length !== 6 || metric('steps') !== '6' || metric('auto') !== '33 %') fail('step added');
click(steps()[5].querySelector('[data-del]'));
if (steps().length !== 5 || metric('steps') !== '5') fail('step deleted');
click($('seqed-create'));
if (!$('seqed-modal') || $('seqed-modal-name').value !== 'Conversión más reciente') fail('create modal');
change($('seqed-modal-folder'), 'Ventas');
click(q('[data-se="confirm-create"]'));
const created = S.sequences().find((s) => s.name === 'Conversión más reciente');
if (!created || created.steps.length !== 5 || created.folder !== 'Ventas' || created.exclusion.length !== 2 || created.templateKey !== 'recent-conversion') fail('sequence not saved');
if (!created.steps[0].body.includes('{{contacto.nombre}}') || !created.steps[0].body.includes('[[X CONTENT]]') || created.steps[0].body.includes('class="tok"')) fail('step body must be saved as markers');
if (!location.search.includes(`id=${created.id}`) || text($('seqed-create')) !== 'Guardar' || !$('seqed-name')) fail('editor should switch to edit mode');
input($('seqed-name'), 'Conversión más reciente (web)');
click($('seqed-create'));
if (S.sequenceById(created.id).name !== 'Conversión más reciente (web)' || text($('seqed-title')) !== 'Conversión más reciente (web)') fail('save');
log('create: pre-built → title, 5/7/40 %/2, 5 steps, chips, placeholder, pause, RESPUESTA, delays, add/delete, Completado, created + edited');

// ===== 4) Enrol from a contact record =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/record/?id=3');
document.body.dataset.type = 'contacts';
document.execCommand = () => true;
await import(resolve(here, '../src/record.js'));
const contact = data.allContacts().find((c) => String(c.id) === '3');
const firstName = contact.first || contact.name.split(' ')[0];
// The seed may have enrolled this contact already: cancel it so the plain enrolment path is exercised first.
S.enrollmentsOfContact(3).filter((e) => e.status === 'active' || e.status === 'paused').forEach((e) => S.unenroll(e.id));
const tasksBefore = data.allTasks().length;
const enrBefore = S.enrollmentsOfContact(3).length;
if (!q('[data-more="sequence"]') || !text(q('[data-more="sequence"]')).includes('Inscribir en una secuencia')) fail('Más menu item');
click(q('[data-more="sequence"]'));
await wait(20);
if (!$('enr-modal') || !$('enr-modal').classList.contains('is-open') || !text($('enr-title')).includes(contact.name)) fail('enrol dialog');
if (!$('enr-confirm').disabled || qa('#enr-seq option').length !== S.sequences().length + 1) fail('dialog initial state');
const target = S.sequences().find((s) => s.name.includes('Reactivación'));
change($('enr-seq'), target.id);
if (!q('[data-ph="NEXT STEPS"]') || !$('enr-confirm').disabled) fail('placeholder input / confirm must wait for placeholders');
const preview = text($('enr-preview'));
if (!preview.includes(`${target.steps.length} pasos`) || !preview.includes(`Hola ${firstName}`) || preview.includes('{{') || !preview.includes('Pausa la secuencia')) fail(`preview: ${preview.slice(0, 160)}`);
input(q('[data-ph="NEXT STEPS"]'), 'enviar la cotización el lunes');
change(q('[data-ph="NEXT STEPS"]'));
if ($('enr-confirm').disabled || !text($('enr-preview')).includes('enviar la cotización el lunes') || text($('enr-preview')).includes('[[')) fail('placeholder resolved in preview');
click($('enr-confirm'));
if ($('enr-modal').classList.contains('is-open')) fail('dialog should close');
const enr = S.enrollmentsOfContact(3);
if (enr.length !== enrBefore + 1 || enr[0].sequenceId !== target.id || enr[0].status !== 'active' || enr[0].currentStep !== 1 || enr[0].placeholders['NEXT STEPS'] !== 'enviar la cotización el lunes') fail(`enrolment: ${JSON.stringify(enr[0])}`);
if (data.allTasks().length !== tasksBefore + 1) fail('first manual step must create a task');
const tl = text($('rec-timeline').firstElementChild);
if (!tl.includes('Inscrito en la secuencia') || !tl.includes(target.name)) fail(`timeline: ${tl.slice(0, 160)}`);
if (!S.scheduled().some((e) => e.id === enr[0].id)) fail('first step must be scheduled');
// Already enrolled: warning + "Reinscribir" (cancels the running enrolment), start date/time
click(q('[data-more="sequence"]'));
await wait(20);
change($('enr-seq'), target.id);
if (!$('enr-warn') || !text($('enr-warn')).includes('ya tiene una inscripción activa en esta secuencia') || !$('enr-reenroll') || !$('enr-confirm').disabled) fail('already-enrolled warning');
if (!text(qa('#enr-seq option').find((o) => o.value === target.id)).includes('ya inscrito')) fail('option should say "ya inscrito"');
input(q('[data-ph="NEXT STEPS"]'), 'reenviar la propuesta');
if (!$('enr-confirm').disabled) fail('confirm must stay disabled until Reinscribir is checked');
$('enr-reenroll').checked = true;
change($('enr-reenroll'));
if ($('enr-confirm').disabled) fail('Reinscribir must enable confirm');
if (!$('enr-date') || !$('enr-time') || !/^\d{4}-\d{2}-\d{2}$/.test($('enr-date').value)) fail('start date/time fields');
const previousId = enr[0].id;
click($('enr-confirm'));
const after = S.enrollmentsOfContact(3);
if (after.length !== enrBefore + 2 || after[0].id === previousId || after[0].status !== 'active' || S.enrollmentsOfContact(3).find((e) => e.id === previousId).status !== 'unenrolled') fail('re-enrol must cancel the previous enrolment and create a new one');
log(`enrol: ${contact.name} in «${target.name}» — preview resolved, placeholder, task + timeline + scheduled; re-enrol with warning`);

// Local task links, completion hook and business-day scheduling.
const linked = data.allTasks().find(t => t.extra?.enrollmentId === after[0].id);
if (!linked || linked.extra.sequenceId !== target.id || linked.extra.stepPosition !== 0) fail('manual task links');
if (after[0].nextStepAt !== null || after[0].extra.waiting_task !== linked.id) fail('manual enrollment must wait');
const friday = new Date('2026-11-20T09:00:00');
const resumed = await S.completeSequenceTask({ ...linked, status: 'done' }, friday);
if (!data.activitiesFor('contacts', contact.id).some(a => a.text.includes('Paso 1 completado: la secuencia continúa el'))) fail('completion timeline');
if (resumed.currentStep !== 2 || resumed.nextStepAt !== S.businessDaysFrom(friday, target.steps[1].delayDays).toISOString()) fail('completion schedules from completion time');
if (await S.completeSequenceTask({ ...linked, status: 'done' }, friday)) fail('duplicate completion');
if (S.businessDaysFrom(friday, 1).getDay() !== 1) fail('Friday plus one business day must be Monday');
const single = S.createSequence({ name: 'Manual final smoke', steps: [{ type: 'connection', delayDays: 0, title: 'Conectar' }] });
const finalEnrollment = S.enroll({ sequenceId: single.id, contact });
data.setField('tasks', finalEnrollment.task.id, 'status', 'done');
for (let i = 0; i < 50 && S.enrollments().find(e => e.id === finalEnrollment.enrollment.id).status !== 'finished'; i++) await wait(10);
if (S.enrollments().find(e => e.id === finalEnrollment.enrollment.id).status !== 'finished') fail('task status hook finishes last manual step');
console.log('[secuencias] OK');
{
// Pause/resume retains position and persists the remaining delay.
const running = S.scheduled().find(e => e.status === 'active');
const paused = S.pauseEnrollment(running.id);
if (paused.status !== 'paused' || paused.currentStep !== running.currentStep || paused.extra.pauseRemainingMs < 0) fail('pause state');
if (!JSON.parse(localStorage.getItem('crm:sequence_enrollments')).some(e => e.id === running.id && e.status === 'paused')) fail('pause persistence');
const resumed = S.resumeEnrollment(running.id);
if (resumed.status !== 'active' || resumed.currentStep !== running.currentStep) fail('resume state');
if (resumed.nextStepAt && ([0, 6].includes(new Date(resumed.nextStepAt).getDay()) || Date.parse(resumed.nextStepAt) < Date.now() - 1000)) fail('resume business day');
log('pause/resume persistence, position and business day OK');

}

process.exit(0);


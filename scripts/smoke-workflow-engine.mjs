// DOM smoke test for the workflow engine (src/workflow-engine.js): the workflow_runs migration; enrolling a
// contact from its record («Más › Inscribir en un workflow») in a 2-step workflow (e-mail + task) runs both
// steps and leaves them on the timeline; the real Gmail path (fake client, gmail-send) and its failure; wait N
// days (scheduled next run) + if/then branch + property change resumed by the checker; the editor's view
// with the active enrolees and the action history (cancel, process due); the minute checker; publishing as
// runs; the local persistence. Run: node scripts/smoke-workflow-engine.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const log = (...a) => console.log('[workflow-engine]', ...a);
const fail = (msg) => { console.error(`[workflow-engine] FAIL: ${msg}`); process.exit(1); };
const read = (p) => readFileSync(resolve(app, p), 'utf8');
const DAY = 86400000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== 1) Migration =====
const sql = read('supabase/workflow_runs.sql');
if (!/create table if not exists public\.workflow_runs\s*\(/.test(sql)) fail('workflow_runs table missing');
for (const col of ['workflow_id uuid not null references public.workflows', 'record_type text', 'record_id bigint not null', 'step_actual int', 'estado text', 'proxima_ejecucion timestamptz', 'log jsonb']) if (!sql.includes(col)) fail(`column missing: ${col}`);
if (!sql.includes('alter table public.workflow_runs enable row level security') || !sql.includes('"anon full access"') || !sql.includes('"authenticated full access"')) fail('RLS policies missing');
if (!/workflow_runs_due_idx .* \(estado, proxima_ejecucion\)/.test(sql)) fail('due index missing');
if (!read('src/page.js').includes('startWorkflowChecker') || !read('src/workflow-editor.js').includes('startWorkflowChecker()')) fail('the checker must start when the app loads (page.js) and in the editor');
log('migration: workflow_runs (workflow_id, record_type, record_id, step_actual, estado, proxima_ejecucion, log), RLS, due index; checker wired at load');

// ===== DOM helpers =====
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
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
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
const change = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const toastText = () => text($('toast'));

// ===== 2) A contact enrolled from its record in a 2-step workflow (e-mail + task) =====
const data = await import(resolve(here, '../src/data.js'));
const contact = data.allContacts().find((c) => c.email && c.email.includes('@') && c.first);
useDom('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', `http://localhost/contacts/record/?id=${contact.id}`);
const W = await import(resolve(here, '../src/workflows-data.js'));
const E = await import(resolve(here, '../src/workflow-engine.js'));
const G = await import(resolve(here, '../src/gmail.js'));
const CE = await import(resolve(here, '../src/connected-emails.js'));
await W.ready;
await E.ready;
if (E.runsLive() || W.workflowsLive()) fail('the test must run in local mode (no Supabase env)');
if (!W.ACTION_DEFS.send_email || W.ACTION_DEFS.send_email.group !== 'Comunicación') fail('«Enviar correo» must be in the catalogue');
const wf = W.createWorkflow({ name: 'Bienvenida (motor)', objectType: 'contacts', folder: 'Marketing', actions: [
  { type: 'send_email', config: { subject: 'Bienvenido {{contacto.nombre}}', body: 'Hola {{contacto.nombre}},\n\nGracias por tu interés en Megaglass.\n\nUn saludo' } },
  { type: 'create_task', config: { title: 'Llamar a {{contacto.nombre_completo}}', dueDays: 1, assignee: 'Sofía R.', taskType: 'Llamada' } },
] });
if (!wf || wf.actions.length !== 2) fail('workflow with 2 steps');
await import(resolve(here, '../src/record.js'));
await wait(20);
click(q('[data-tab="activity"]'));
const tasksBefore = data.allTasks().length;
const actsBefore = data.activitiesFor('contacts', contact.id).length;
click(q('[data-more="workflow"]'));
if (!$('rec-modal').classList.contains('is-open') || !$('wf-name') || !text($('rec-modal-body')).includes('las esperas se programan')) fail('enrol dialog');
if (!qa('#wf-name option').some((o) => o.value === wf.id && text(o).includes('Bienvenida (motor) (2 acciones'))) fail('the new workflow must be offered');
change($('wf-name'), wf.id);
click(q('[data-confirm="workflow"]'));
await wait(60);
const run1 = E.runsOf(wf.id)[0];
if (!run1 || run1.recordId !== Number(contact.id) || run1.estado !== 'completed' || run1.stepActual !== 2 || run1.proximaEjecucion !== null) fail(`run after enrol: ${JSON.stringify(run1)}`);
if (run1.log.length !== 2 || run1.log[0].type !== 'send_email' || !run1.log[0].ok || !run1.log[0].result.startsWith(`Correo «Bienvenido ${contact.first}» enviado a ${contact.email}`) || run1.log[1].type !== 'create_task' || !run1.log[1].ok) fail(`run log: ${JSON.stringify(run1.log)}`);
if (!toastText().includes('Inscrito en «Bienvenida (motor)» · 2 acciones ejecutadas')) fail(`toast: ${toastText()}`);
const task = data.allTasks().find((t) => t.name === `Llamar a ${contact.name}` && Number(t.contactId) === Number(contact.id));
if (data.allTasks().length !== tasksBefore + 1 || !task || task.owner !== 'Sofía R.' || task.type !== 'Llamada') fail('the task must be created for real');
const acts = data.activitiesFor('contacts', contact.id);
const mail = acts.find((a) => a.type === 'email' && a.who === 'Workflow');
const taskAct = acts.find((a) => a.type === 'task' && a.who === 'Workflow');
if (acts.length < actsBefore + 4) fail(`timeline entries: ${acts.length - actsBefore}`);
if (!mail || mail.extra.subject !== `Bienvenido ${contact.first}` || !mail.text.includes(`Correo enviado a ${contact.name} (${contact.email})`) || !mail.text.includes('enviado desde ') || mail.text.includes('por Gmail') || mail.extra.runId !== run1.id) fail(`e-mail entry: ${JSON.stringify(mail)}`);
if (!taskAct || !taskAct.text.includes(`tarea «Llamar a ${contact.name}» creada para Sofía R.`)) fail(`task entry: ${JSON.stringify(taskAct)}`);
if (!acts.some((a) => a.type === 'system' && a.text === 'Inscrito en el workflow «Bienvenida (motor)» por Fernando L.') || !acts.some((a) => a.type === 'system' && a.text.includes('Workflow «Bienvenida (motor)» completado (2 acciones ejecutadas)'))) fail(`enrol + completion entries: ${JSON.stringify(acts.filter((a) => a.who === 'Workflow').map((a) => [a.type, a.text]))}`);
const tl = text($('rec-timeline'));
if (!tl.includes(`Correo: Bienvenido ${contact.first}`) || !tl.includes(`tarea «Llamar a ${contact.name}» creada`) || !tl.includes('Inscrito en el workflow «Bienvenida (motor)»')) fail(`timeline DOM: ${tl.slice(0, 300)}`);
if (!(W.enrollmentsOf(wf.id).length === 1 && W.performance(wf.id).actionsRun === 2 && W.performance(wf.id).enrollments === 1)) fail('history must count the run');
log(`record: «${contact.name}» enrolled in «Bienvenida (motor)» → e-mail «Bienvenido ${contact.first}» (simulated account) + task for Sofía R., both on the timeline; run completed`);

// ===== 3) Real Gmail: the step goes out through gmail-send; a failure marks the step =====
process.env.VITE_GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const fake = { calls: [], responses: {}, accounts: [{ id: 'acc-1', email: 'real@gmail.com', provider: 'gmail', status: 'active', last_error: null, last_checked_at: null, last_synced_at: null, created_at: '2020-01-01T00:00:00.000Z' }] };
fake.functions = { invoke: async (name, opts = {}) => { fake.calls.push({ name, body: opts.body }); const r = fake.responses[name]; if (r instanceof Error) return { data: null, error: r }; return { data: r === undefined ? { ok: true } : r, error: null }; } };
fake.from = () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: fake.accounts, error: null }) }) }) });
G.setGmailClient(fake);
await G.reloadAccounts();
if (!CE.activeAccounts()[0] || !CE.activeAccounts()[0].real) fail('the real Google account must be the sender');
fake.responses['gmail-send'] = { ok: true, id: 'msg-9', threadId: 'thr-9' };
const res2 = await E.enroll(wf.id, 'contacts', contact);
if (!res2.ok || res2.run.estado !== 'completed') fail(`real enrol: ${JSON.stringify(res2)}`);
const sendCall = fake.calls.find((c) => c.name === 'gmail-send');
if (!sendCall || sendCall.body.accountId !== 'acc-1' || sendCall.body.to.join() !== contact.email || sendCall.body.subject !== `Bienvenido ${contact.first}` || !sendCall.body.html.includes(`<p>Hola ${contact.first},</p>`) || !/<div class="sig/.test(sendCall.body.html)) fail(`gmail-send call: ${JSON.stringify(sendCall && sendCall.body).slice(0, 300)}`);
const mailReal = data.activitiesFor('contacts', contact.id).find((a) => a.type === 'email' && a.extra.via === 'gmail');
if (!mailReal || mailReal.extra.gmailId !== 'msg-9' || !mailReal.text.includes('enviado desde real@gmail.com por Gmail') || !res2.steps[0].result.endsWith('por Gmail')) fail(`real e-mail entry: ${JSON.stringify(mailReal)}`);
fake.responses['gmail-send'] = new Error('Gmail respondió 403');
const res3 = await E.enroll(wf.id, 'contacts', contact);
if (res3.ok !== true || res3.run.estado !== 'failed' || res3.steps[0].ok !== false || !res3.steps[0].result.includes('No se pudo enviar por Gmail: Gmail respondió 403') || res3.steps[1].ok !== true) fail(`failed send: ${JSON.stringify(res3.steps)}`);
G.setGmailClient(null);
await G.reloadAccounts();
if (CE.activeAccounts()[0].real) fail('back to the simulated account');
log('real Gmail: gmail-send called with to / subject / html + signature, timeline «por Gmail»; a Gmail error marks the step and the run (the task still runs)');

// ===== 4) Wait N days → next run scheduled; if/then branch by property value; property change =====
const others = data.allContacts().filter((c) => c.id !== contact.id && c.email && c.owner && c.owner !== 'Sin asignar');
const [c2, c3, c4] = others;
const wf2 = W.createWorkflow({ name: 'Seguimiento (motor)', objectType: 'contacts', actions: (() => {
  const branch = { id: 'b1', type: 'branch', config: { groups: [{ id: 'g', conditions: [{ id: 'c', property: 'owner', operator: 'known', value: '' }] }] } };
  return [
    { type: 'create_task', config: { title: 'Seguimiento de {{contacto.nombre_completo}}', dueDays: 0, assignee: 'Fernando L.', taskType: 'Tarea' } },
    { type: 'delay', config: { amount: 2, unit: 'days' } },
    branch,
    { type: 'edit_record', parentId: 'b1', branch: 'yes', config: { property: 'lifecycle', value: 'Oportunidad' } },
    { type: 'notify_app', parentId: 'b1', branch: 'no', config: { to: 'Fernando L.', title: 'Sin propietario', text: '{{contacto.nombre_completo}} sigue sin propietario' } },
  ];
})() });
const T0 = Date.now();
const r4 = await E.enroll(wf2.id, 'contacts', c2, { now: T0 });
if (!r4.ok || r4.run.estado !== 'waiting' || r4.run.stepActual !== 2 || Math.abs(new Date(r4.run.proximaEjecucion).getTime() - (T0 + 2 * DAY)) > 1000) fail(`waiting run: ${JSON.stringify(r4.run)}`);
if (r4.steps.length !== 2 || r4.steps[0].type !== 'create_task' || r4.steps[1].type !== 'delay' || !r4.steps[1].pending || !r4.steps[1].result.startsWith('Esperando 2 días · continúa el ')) fail(`delay log: ${JSON.stringify(r4.steps)}`);
if (!data.activitiesFor('contacts', c2.id).some((a) => a.who === 'Workflow' && /espera 2 días; continúa el /.test(a.text))) fail('delay timeline entry');
if (E.stepLabel(W.workflowById(wf2.id), r4.run) !== 'Paso 3 de 5 · Rama if/then') fail(`step label: ${E.stepLabel(W.workflowById(wf2.id), r4.run)}`);
let p = await E.processDueRuns(T0 + DAY);
if (p.advanced !== 0 || E.runById(r4.run.id).estado !== 'waiting') fail('not due yet after 1 day');
const lifecycleBefore = data.allContacts().find((x) => x.id === c2.id).lifecycle;
p = await E.processDueRuns(T0 + 2 * DAY + 60000);
const r4b = E.runById(r4.run.id);
if (p.advanced !== 1 || r4b.estado !== 'completed' || r4b.proximaEjecucion !== null) fail(`resumed run: ${JSON.stringify({ p, estado: r4b.estado })}`);
if (r4b.log.map((l) => `${l.type}:${l.ok}:${l.pending ? 'p' : ''}`).join('|') !== 'create_task:true:|delay:true:|branch:true:|edit_record:true:' || r4b.log[1].result !== 'Retraso de 2 días completado' || r4b.log[2].result !== 'Condición cumplida → rama Sí') fail(`resumed log: ${JSON.stringify(r4b.log)}`);
if (data.allContacts().find((x) => x.id === c2.id).lifecycle !== 'Oportunidad' || lifecycleBefore === 'Oportunidad') fail('the Sí branch must change the property for real');
const c2acts = data.activitiesFor('contacts', c2.id).filter((a) => a.who === 'Workflow').map((a) => a.text);
if (!c2acts.some((t) => t.includes('retraso de 2 días completado; el workflow continúa')) || !c2acts.some((t) => t.includes('rama if/then (Propietario del contacto se conoce) → cumple, sigue por Sí')) || !c2acts.some((t) => t.includes('propiedad «Etapa del ciclo de vida» cambiada a «Oportunidad»')) || !c2acts.some((t) => t.includes('Workflow «Seguimiento (motor)» completado (4 acciones ejecutadas)'))) fail(`resumed timeline: ${c2acts.join(' | ')}`);
// the No branch
const noOwner = data.addRecord('contacts', { first: 'Nadie', last: 'Motor', name: 'Nadie Motor', email: 'nadie.motor@ejemplo.com', owner: 'Sin asignar', status: 'new', lifecycle: 'Lead', source: 'Creación manual', created: data.TODAY.toISOString(), lastActivity: data.TODAY.toISOString() });
const r5 = await E.enroll(wf2.id, 'contacts', noOwner, { now: T0 - 3 * DAY });
if (r5.run.estado !== 'waiting') fail('No-branch run must wait first');
p = await E.processDueRuns(T0);
const r5b = E.runById(r5.run.id);
if (r5b.estado !== 'completed' || r5b.log[2].result !== 'Condición no cumplida → rama No' || r5b.log[3].type !== 'notify_app' || !r5b.log[3].ok) fail(`No branch: ${JSON.stringify(r5b.log)}`);
// a record with a run in progress cannot be enrolled twice in the same workflow
const r6 = await E.enroll(wf2.id, 'contacts', c3, { now: T0 });
const again = await E.enroll(wf2.id, 'contacts', c3, { now: T0 });
if (!r6.ok || again.ok || !again.reason.includes('Ya está inscrito')) fail(`double enrol guard: ${JSON.stringify(again)}`);
log('delay: next run scheduled in 2 days (not due after 1 day; resumed after 2 → branch Sí → lifecycle = Oportunidad); No branch → in-app notification; double enrol refused');

// ===== 5) The editor: active enrolees + action history, process due, cancel =====
useDom('<!doctype html><body class="app app--editor"><main class="wfe-root" id="wfe-root"></main></body>', `http://localhost/automation/editor/?id=${wf2.id}`);
await import(resolve(here, '../src/workflow-editor.js'));
if (text(q('[data-we="runs"]')) !== 'Inscritos activos (1)') fail(`runs button: ${text(q('[data-we="runs"]'))}`);
click(q('[data-we="runs"]'));
if (!$('wfe-modal').classList.contains('is-open') || text($('wfe-modal-title')) !== 'Inscritos e historial del workflow') fail('runs modal');
if (text($('wfe-runs-title')) !== 'Inscritos activos (1)' || qa('#wfe-runs tbody tr[data-run]').length !== 1) fail('active enrolees table');
const activeRow = q('#wfe-runs tbody tr[data-run]');
if (!text(activeRow).includes(c3.name) || !text(activeRow).includes('Paso 3 de 5 · Rama if/then') || !text(activeRow).includes('En espera') || !/\d{4} a las \d{2}:\d{2}/.test(text(activeRow)) || !activeRow.querySelector('[data-wm="cancel-run"]')) fail(`active row: ${text(activeRow)}`);
const hist = qa('#wfe-actlog tbody tr').map(text);
if (hist.length < 7 || !hist.some((t) => t.includes(c2.name) && t.includes('Editar registro') && t.includes('✓')) || !hist.some((t) => t.includes('Retraso') && t.includes('completado')) || hist.some((t) => t.includes('Esperando'))) fail(`action history: ${hist.slice(0, 4).join(' || ')}`);
if (qa('#wfe-hist tbody tr').length !== 3 || !text($('wfe-hist')).includes('Completada') || !text($('wfe-hist')).includes('En espera')) fail('enrolment table');
click(q('[data-wm="process-due"]'));
await wait(30);
if (!toastText().includes('No hay pasos vencidos')) fail(`process due toast: ${toastText()}`);
click(q('#wfe-runs [data-wm="cancel-run"]'));
if (E.runById(r6.run.id).estado !== 'cancelled' || qa('#wfe-runs tbody tr[data-run]').length !== 0 || !text($('wfe-hist')).includes('Cancelada') || text(q('[data-we="runs"]')) !== 'Inscritos activos') fail('cancel from the view');
if (!data.activitiesFor('contacts', c3.id).some((a) => a.text === 'Inscripción en el workflow «Seguimiento (motor)» cancelada por Fernando L.')) fail('cancel timeline entry');
click(q('#wfe-modal [data-bm="close"]'));
log('editor: «Inscritos activos (1)» → table with step, state, next run, cancel; action history; enrolment table; «Procesar pasos vencidos»');

// ===== 6) The checker: a due run advances on its own while the app is open =====
const r7 = await E.enroll(wf2.id, 'contacts', c4, { now: Date.now() - 3 * DAY });
if (r7.run.estado !== 'waiting' || new Date(r7.run.proximaEjecucion).getTime() > Date.now()) fail('run due in the past');
E.stopWorkflowChecker();
if (E.checkerRunning()) fail('stop');
E.startWorkflowChecker({ intervalMs: 25 });
await wait(80);
if (!E.checkerRunning() || E.runById(r7.run.id).estado !== 'completed' || !E.lastCheckAt()) fail(`checker did not advance the run: ${E.runById(r7.run.id).estado}`);
if (text(q('[data-we="runs"]')) !== 'Inscritos activos') fail('the editor button refreshes after the checker');
E.stopWorkflowChecker();
log('checker: the due run resumed by itself (start → every 25 ms here, every minute in the app)');

// ===== 7) Publishing creates runs; local persistence =====
const wf3 = W.createWorkflow({ name: 'Leads (motor)', objectType: 'contacts', trigger: { reenroll: false, groups: [{ id: 'g1', conditions: [{ id: 'c1', property: 'lifecycle', operator: 'eq', value: 'Lead' }] }] }, actions: [{ type: 'notify_app', config: { to: 'Fernando L.', title: 'Lead', text: '{{contacto.nombre_completo}}' } }] });
const matched = W.matchingRecords(W.workflowById(wf3.id)).length;
const pub = await E.publishWorkflow(wf3.id);
if (!pub || pub.enrolled !== Math.min(matched, W.ENROLL_CAP) || W.workflowById(wf3.id).status !== 'published' || E.runsOf(wf3.id).length !== pub.enrolled || !E.runsOf(wf3.id).every((r) => r.estado === 'completed')) fail(`publish: ${JSON.stringify(pub)}`);
const stored = JSON.parse(mem['crm:workflow_runs']);
if (!Array.isArray(stored) || stored.length !== E.allRuns().length || !stored.every((r) => 'stepActual' in r && 'estado' in r && 'proximaEjecucion' in r && 'workflowId' in r)) fail('runs must persist locally with step/estado/próxima ejecución');
log(`publish: ${pub.enrolled} contacts enrolled as runs; ${stored.length} runs persisted (crm:workflow_runs)`);

console.log('[workflow-engine] OK');
process.exit(0);

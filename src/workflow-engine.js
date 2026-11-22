// Workflow engine (Automatización › Workflows): the runs — one per record enrolled in a workflow — in the
// workflow_runs table (localStorage until supabase/workflow_runs.sql runs), the step walker (send an e-mail
// through the connected Gmail account, create a task, change a property, wait N days, if/then branch by a
// property value, go to another action), the checker that processes the due runs when the app loads and
// every minute while it stays open, and the record's timeline entry for every action. Enrolling by hand
// («Inscribir en un workflow») and publishing create runs here; src/workflows-data.js keeps the definitions,
// the conditions, the catalogue and the «Prueba» simulation.
import { addActivity, dbIsLive, formatDate } from './data.js';
import { supabase } from './supabaseClient.js';
import { reportDbError } from './db-report.js';
import { renderTokens, contextFromRecord } from './tokens.js';
import { ready as emailsReady, activeAccounts, signatureById } from './connected-emails.js';
import { sendMail } from './gmail.js';
import { ready as workflowsReady, workflowById, recordsOf, recordName, recipientEmailOf, childrenOf, evaluateTrigger, conditionText, applyAction, matchingRecords, markPublished, registerRunSource, ACTION_DEFS, ENROLL_CAP, OBJECT_LABEL, ME } from './workflows-data.js';

const DAY = 86400000;
const HOUR = 3600000;
const LS_KEY = 'crm:workflow_runs';
const MAX_STEPS = 60;
const MAX_JUMPS = 3;
const STALE_MS = 2 * 60000; // an 'active' run nobody touched for 2 minutes (tab closed mid-run) is resumed
export const ESTADO_LABELS = { active: 'En curso', waiting: 'En espera', completed: 'Completada', failed: 'Con errores', cancelled: 'Cancelada' };
export const isRunActive = (run) => run.estado === 'active' || run.estado === 'waiting';
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const clone = (x) => JSON.parse(JSON.stringify(x));
const iso = (t) => new Date(t).toISOString();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const timeStr = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// «por Fernando L.» already ends with a dot: no double period at the end of the sentence.
const sentence = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
export const whenText = (value) => { if (!value) return ''; const d = new Date(value); return `${formatDate(d)} a las ${timeStr(d)}`; };

// ---------- storage ----------
let live = dbIsLive();
let rows = [];
let queue = Promise.resolve();
const enqueue = (fn) => { const write = queue.then(fn); queue = write.catch((e) => reportDbError('workflow_runs', e)); return write; };
export const pending = () => queue;
const fromDb = (r) => ({ id: r.id, workflowId: r.workflow_id, recordType: r.record_type || 'contacts', recordId: Number(r.record_id), recordName: r.record_name || '', stepActual: Number(r.step_actual) || 0, estado: r.estado || 'active', proximaEjecucion: r.proxima_ejecucion || null, log: Array.isArray(r.log) ? r.log : [], jumps: Number(r.jumps) || 0, enrolledBy: r.enrolled_by || '', startedAt: r.started_at, updatedAt: r.updated_at || r.started_at, finishedAt: r.finished_at || null, claimedUntil: r.claimed_until || null });
// (claimed_until is the server executor's reservation — supabase/workflow-process.sql — read here, never written)
const toDb = (x) => ({ id: x.id, workflow_id: x.workflowId, record_type: x.recordType, record_id: Number(x.recordId), record_name: x.recordName, step_actual: x.stepActual, estado: x.estado, proxima_ejecucion: x.proximaEjecucion, log: x.log, jumps: x.jumps, enrolled_by: x.enrolledBy, started_at: x.startedAt, updated_at: x.updatedAt, finished_at: x.finishedAt });
const saveLocal = () => { localStorage.setItem(LS_KEY, JSON.stringify(rows)); };
function persist(run) {
  run.updatedAt = new Date().toISOString();
  if (live) {
    const snapshot = clone(toDb(run));
    return enqueue(async () => { const { error } = await supabase.from('workflow_runs').upsert(snapshot, { onConflict: 'id' }); if (error) throw error; });
  }
  else saveLocal();
}
function loadLocal() { try { const v = JSON.parse(localStorage.getItem(LS_KEY)); rows = Array.isArray(v) ? v : []; } catch { rows = []; } }
async function loadLive() {
  const { data, error } = await supabase.from('workflow_runs').select('*').order('started_at', { ascending: false });
  if (error) throw error;
  rows = (data || []).map(fromDb);
}
export const ready = (async () => {
  await workflowsReady;
  // «Enviar correo» needs the connected accounts (Ajustes › General › Correo) to know the sender.
  try { await emailsReady; } catch { /* the step reports the missing account */ }
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tabla workflow_runs no disponible (supabase/workflow_runs.sql); inscripciones en localStorage.', e); loadLocal(); }
  } else loadLocal();
})();
export const runsLive = () => live;
// Tests reset the store between scenarios.
export const resetRuns = () => { rows = []; if (!live) saveLocal(); };

// ---------- reads ----------
const out = (x) => clone(x);
const byStart = (a, b) => new Date(b.startedAt) - new Date(a.startedAt);
export const allRuns = () => rows.map(out).sort(byStart);
export const runById = (id) => { const r = rows.find((x) => x.id === id); return r ? out(r) : null; };
export const runsOf = (workflowId) => rows.filter((r) => r.workflowId === workflowId).map(out).sort(byStart);
export const activeRunsOf = (workflowId) => runsOf(workflowId).filter(isRunActive);
export const runsOfRecord = (type, id) => rows.filter((r) => r.recordType === type && Number(r.recordId) === Number(id)).map(out).sort(byStart);
export const activeRun = (workflowId, type, id) => { const r = rows.find((x) => x.workflowId === workflowId && x.recordType === type && Number(x.recordId) === Number(id) && isRunActive(x)); return r ? out(r) : null; };
// Every executed action of a workflow, newest first (pending delays are not "executed" yet).
export function actionHistory(workflowId, { limit = 100 } = {}) {
  return rows.filter((r) => r.workflowId === workflowId)
    .flatMap((r) => r.log.filter((l) => !l.pending).map((l) => ({ ...l, runId: r.id, recordType: r.recordType, recordId: r.recordId, recordName: r.recordName })))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
}
// The runs due now: waiting ones whose time came, plus 'active' ones left behind by a closed tab. A run reserved
// by the server executor (workflow-process, claimed_until still ahead) is left to it.
export const dueRuns = (now = Date.now()) => rows.filter((r) => !busy.has(r.id) && !(r.claimedUntil && new Date(r.claimedUntil).getTime() > now) && ((r.estado === 'waiting' && r.proximaEjecucion && new Date(r.proximaEjecucion).getTime() <= now) || (r.estado === 'active' && new Date(r.updatedAt).getTime() <= now - STALE_MS))).map(out);
// The history/analytics of src/workflows-data.js read the runs in the enrolment shape.
const legacyStatus = { active: 'in_progress', waiting: 'in_progress', completed: 'completed', failed: 'failed', cancelled: 'cancelled' };
registerRunSource(() => rows.map((r) => ({ id: r.id, workflowId: r.workflowId, objectType: r.recordType, recordId: r.recordId, recordName: r.recordName, status: legacyStatus[r.estado] || 'in_progress', estado: r.estado, stepActual: r.stepActual, nextRunAt: r.proximaEjecucion, actionsRun: r.log.filter((l) => !l.pending).length, log: r.log.map((l) => ({ action: l.type, title: l.title, ok: l.ok, result: l.result, at: l.at })), enrolledAt: r.startedAt, run: true })));

// ---------- the walk through the actions ----------
// The actions in the editor's numbering order: a branch is followed by its Sí children, then its No children.
export function flatten(actions) {
  const list = [];
  const walk = (parentId, branch) => childrenOf(actions, parentId, branch).forEach((a) => { list.push(a); if (a.type === 'branch') { walk(a.id, 'yes'); walk(a.id, 'no'); } });
  walk(null, '');
  return list;
}
// The index of the step that follows step i once its subtree is done: the next sibling, or — at the end of a
// branch's children — whatever follows the branch itself.
function nextAfter(actions, flat, i) {
  const a = flat[i];
  if (!a) return flat.length;
  const sibs = childrenOf(actions, a.parentId, a.branch);
  const k = sibs.findIndex((x) => x.id === a.id);
  if (k >= 0 && k < sibs.length - 1) return flat.findIndex((x) => x.id === sibs[k + 1].id);
  if (!a.parentId) return flat.length;
  const pi = flat.findIndex((x) => x.id === a.parentId);
  return pi < 0 ? flat.length : nextAfter(actions, flat, pi);
}
// «Paso 3 de 6 · Crear tarea» for the active runs table.
export function stepLabel(w, run) {
  const flat = flatten(w.actions);
  const a = flat[run.stepActual];
  if (!a) return `Fin (${flat.length} ${flat.length === 1 ? 'paso' : 'pasos'})`;
  return `Paso ${run.stepActual + 1} de ${flat.length} · ${ACTION_DEFS[a.type] ? ACTION_DEFS[a.type].label : a.type}`;
}
const delayMs = (c) => Math.max(0, Number(c.amount) || 0) * (c.unit === 'hours' ? HOUR : DAY);
const delayText = (c) => `${Number(c.amount) || 0} ${c.unit === 'hours' ? (Number(c.amount) === 1 ? 'hora' : 'horas') : Number(c.amount) === 1 ? 'día' : 'días'}`;

// ---------- timeline ----------
const emit = (run) => { if (typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent('crm:workflow', { detail: { runId: run.id, workflowId: run.workflowId, recordType: run.recordType, recordId: run.recordId, estado: run.estado } })); };
function note(w, run, text, { kind = 'system', when = Date.now(), extra = {} } = {}) {
  addActivity({ type: kind, when, who: 'Workflow', text, recordType: run.recordType, recordId: run.recordId, extra: { workflowId: w.id, runId: run.id, subject: `Workflow: ${w.name}`, ...extra } });
}
const logStep = (run, entry, now) => { const e = { at: iso(now), ...entry }; run.log.push(e); return e; };

// ---------- actions ----------
const textToHtml = (text) => String(text || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
async function signatureFor(account) {
  try {
    const custom = account && account.signatureId && account.signatureId !== 'default' ? signatureById(account.signatureId) : null;
    if (custom) return `<div class="sig sig--custom">${custom.html}</div>`;
    const C = await import('./compose.js');
    return C.signatureHtmlOf();
  } catch { return ''; }
}
// «Enviar correo»: to the record's e-mail, from the first active connected account (the same «De» the composer
// offers); a real Google account goes out through the Gmail API (gmail-send), a simulated one is just logged.
async function sendEmailStep(w, a, r, run, ctx) {
  const c = a.config || {};
  const to = recipientEmailOf(run.recordType, r);
  if (!to) return { ok: false, result: `El ${OBJECT_LABEL[run.recordType] ? OBJECT_LABEL[run.recordType].toLowerCase() : 'registro'} no tiene correo electrónico` };
  const account = activeAccounts()[0] || null;
  if (!account) return { ok: false, result: 'No hay ninguna cuenta de correo conectada (Ajustes › General › Correo)' };
  const subject = renderTokens(String(c.subject || ''), ctx).trim() || '(sin asunto)';
  const body = renderTokens(String(c.body || ''), ctx);
  const html = `${textToHtml(body)}${await signatureFor(account)}`;
  let extra = { from: account.email, subject, via: '' };
  if (account.real) {
    try {
      const res = await sendMail({ accountId: account.id, to: [to], subject, html, fromName: ME });
      extra = { ...extra, via: 'gmail', gmailId: (res && res.id) || '', threadId: (res && res.threadId) || '' };
    } catch (e) { return { ok: false, result: `No se pudo enviar por Gmail: ${e.message}` }; }
  }
  const name = recordName(run.recordType, r);
  note(w, run, `Correo enviado a ${name} (${to}): "${subject}" · enviado desde ${account.email}${extra.via === 'gmail' ? ' por Gmail' : ''} · workflow «${w.name}».`, { kind: 'email', extra: { ...extra, body } });
  return { ok: true, result: `Correo «${subject}» enviado a ${to}${extra.via === 'gmail' ? ' por Gmail' : ''}` };
}
async function executeAction(w, a, r, run) {
  const ctx = contextFromRecord(run.recordType, r);
  if (a.type === 'send_email') return sendEmailStep(w, a, r, run, ctx);
  try { return applyAction(w, a, r, ctx, { runId: run.id }); } catch (e) { return { ok: false, result: e.message || String(e) }; }
}

// ---------- advancing a run ----------
const busy = new Set();
async function finish(run, w, now, error) {
  if (error) logStep(run, { actionId: null, type: 'error', title: 'Inscripción detenida', ok: false, result: error }, now);
  run.estado = error || run.log.some((l) => l.ok === false) ? 'failed' : 'completed';
  run.proximaEjecucion = null;
  run.finishedAt = iso(now);
  await persist(run);
  if (w) { const n = run.log.filter((l) => !l.pending && l.type !== 'error').length; note(w, run, `Workflow «${w.name}» ${run.estado === 'completed' ? 'completado' : 'terminado con errores'} (${n} ${n === 1 ? 'acción ejecutada' : 'acciones ejecutadas'}).`, { when: now }); }
  emit(run);
}
// Runs the steps from run.stepActual until the end or until a delay schedules the next execution.
export async function advance(run, now = Date.now()) {
  if (busy.has(run.id) || !isRunActive(run)) return run;
  busy.add(run.id);
  try {
    const w = workflowById(run.workflowId);
    if (!w) { await finish(run, null, now, 'El workflow ya no existe'); return run; }
    const r = recordsOf(run.recordType).find((x) => Number(x.id) === Number(run.recordId));
    if (!r) { await finish(run, w, now, `El ${OBJECT_LABEL[run.recordType] ? OBJECT_LABEL[run.recordType].toLowerCase() : 'registro'} ya no existe`); return run; }
    const flat = flatten(w.actions);
    const resumed = run.log.find((l) => l.pending);
    if (resumed) { resumed.pending = false; resumed.result = `Retraso de ${resumed.wait || ''} completado`.replace('  ', ' '); resumed.resumedAt = iso(now); note(w, run, `Workflow «${w.name}»: retraso de ${resumed.wait || ''} completado; el workflow continúa.`.replace('  ', ' '), { when: now }); }
    run.estado = 'active';
    run.proximaEjecucion = null;
    let guard = 0;
    while (run.stepActual < flat.length) {
      if (!isRunActive(run)) return run;
      guard += 1;
      if (guard > MAX_STEPS) { logStep(run, { actionId: null, type: 'error', title: 'Bucle detenido', ok: false, result: `Se alcanzó el límite de ${MAX_STEPS} pasos` }, now); break; }
      const i = run.stepActual;
      const a = flat[i];
      const def = ACTION_DEFS[a.type] || { label: a.type };
      if (a.type === 'branch') {
        const ev = evaluateTrigger(run.recordType, r, a.config || {});
        const text = ((a.config && a.config.groups) || []).map((g) => (g.conditions || []).map((c) => conditionText(run.recordType, c)).join(' y ')).filter(Boolean).join(' · o · ');
        logStep(run, { actionId: a.id, type: a.type, title: def.label, ok: true, result: ev.ok ? 'Condición cumplida → rama Sí' : 'Condición no cumplida → rama No' }, now);
        note(w, run, `Workflow «${w.name}»: rama if/then (${text || 'sin condiciones'}) → ${ev.ok ? 'cumple, sigue por Sí' : 'no cumple, sigue por No'}.`, { when: now });
        const kids = childrenOf(w.actions, a.id, ev.ok ? 'yes' : 'no');
        run.stepActual = kids.length ? flat.findIndex((x) => x.id === kids[0].id) : nextAfter(w.actions, flat, i);
        await persist(run);
        continue;
      }
      if (a.type === 'goto') {
        const target = w.actions.find((x) => x.id === (a.config || {}).target);
        if (!target) { logStep(run, { actionId: a.id, type: a.type, title: def.label, ok: false, result: 'Destino no encontrado' }, now); run.stepActual = nextAfter(w.actions, flat, i); await persist(run); continue; }
        run.jumps += 1;
        if (run.jumps > MAX_JUMPS) { logStep(run, { actionId: a.id, type: a.type, title: def.label, ok: false, result: `Salto ignorado para evitar un bucle (máximo ${MAX_JUMPS})` }, now); run.stepActual = nextAfter(w.actions, flat, i); await persist(run); continue; }
        logStep(run, { actionId: a.id, type: a.type, title: def.label, ok: true, result: `Salta a «${ACTION_DEFS[target.type] ? ACTION_DEFS[target.type].label : target.type}»` }, now);
        run.stepActual = flat.findIndex((x) => x.id === target.id);
        await persist(run);
        continue;
      }
      if (a.type === 'delay') {
        const c = a.config || {};
        const until = new Date(now + delayMs(c));
        logStep(run, { actionId: a.id, type: a.type, title: def.label, ok: true, pending: true, wait: delayText(c), until: until.toISOString(), result: `Esperando ${delayText(c)} · continúa el ${whenText(until)}` }, now);
        note(w, run, `Workflow «${w.name}»: espera ${delayText(c)}; continúa el ${whenText(until)}.`, { when: now });
        run.stepActual = nextAfter(w.actions, flat, i);
        run.estado = 'waiting';
        run.proximaEjecucion = until.toISOString();
        await persist(run);
        emit(run);
        return run;
      }
      const res = await executeAction(w, a, r, run);
      logStep(run, { actionId: a.id, type: a.type, title: def.label, ok: Boolean(res && res.ok), result: (res && res.result) || '' }, now);
      if (!res?.ok) note(w, run, `Workflow «${w.name}»: ${def.label} falló: ${res?.result || 'Error desconocido'}.`, { when: now });
      if (!isRunActive(run)) { await persist(run); emit(run); return run; }
      run.stepActual = nextAfter(w.actions, flat, i);
      await persist(run);
    }
    await finish(run, w, now);
  } finally { busy.delete(run.id); }
  return run;
}

// ---------- enrolling ----------
// Creates the run and executes its steps right away (delays schedule the rest). The trigger is not required:
// the person chose to enrol this record. Returns { ok, run, steps } or { ok: false, reason }.
export async function enroll(workflowId, type, record, { by = ME, source = 'manual', now = Date.now() } = {}) {
  await ready;
  const w = workflowById(workflowId);
  if (!w || w.objectType !== type || !record) return { ok: false, reason: 'El workflow no existe o no es de este tipo de registro.' };
  if (activeRun(workflowId, type, record.id)) return { ok: false, reason: `Ya está inscrito en «${w.name}» (inscripción en curso).` };
  const run = { id: uuid(), workflowId, recordType: type, recordId: Number(record.id), recordName: recordName(type, record), stepActual: 0, estado: 'active', proximaEjecucion: null, log: [], jumps: 0, enrolledBy: by, startedAt: iso(now), updatedAt: iso(now), finishedAt: null };
  rows.unshift(run);
  try { await persist(run); } catch (e) {
    rows = rows.filter((r) => r.id !== run.id);
    return { ok: false, reason: `No se pudo guardar la inscripción: ${e.message || e}` };
  }
  note(w, run, source === 'manual' ? sentence(`Inscrito en el workflow «${w.name}» por ${by}`) : `Inscrito en el workflow «${w.name}» (cumple el desencadenante).`, { when: now });
  await advance(run, now);
  return { ok: true, run: out(run), steps: clone(run.log), workflow: w };
}
// Publishes: the matching records (up to ENROLL_CAP, skipping records already enrolled unless the workflow
// re-enrols) become runs, then the workflow is marked published.
export async function publishWorkflow(id, { by = ME, now = Date.now() } = {}) {
  await ready;
  const w = workflowById(id);
  if (!w) return null;
  const matched = matchingRecords(w);
  const prior = new Set(rows.filter((r) => r.workflowId === id).map((r) => String(r.recordId)));
  const candidates = matched.filter((r) => (w.trigger.reenroll || !prior.has(String(r.id))) && !activeRun(id, w.objectType, r.id)).slice(0, ENROLL_CAP);
  const published = markPublished(id);
  let enrolled = 0;
  for (const r of candidates) {
    const res = await enroll(id, w.objectType, r, { by, source: 'trigger', now });
    if (res && res.ok) enrolled += 1;
  }
  return { workflow: published, matched: matched.length, enrolled, capped: matched.length > candidates.length };
}
export function cancelRun(id, { by = ME, now = Date.now() } = {}) {
  const run = rows.find((x) => x.id === id);
  if (!run || !isRunActive(run)) return null;
  const w = workflowById(run.workflowId);
  const pend = run.log.find((l) => l.pending);
  if (pend) { pend.pending = false; pend.result = `Retraso de ${pend.wait || ''} cancelado`.replace('  ', ' '); }
  logStep(run, { actionId: null, type: 'cancel', title: 'Inscripción cancelada', ok: true, result: `Cancelada por ${by}` }, now);
  run.estado = 'cancelled';
  run.proximaEjecucion = null;
  run.finishedAt = iso(now);
  // The synchronous UI reads the cancelled state immediately; the queue reports save errors.
  persist(run)?.catch(() => {});
  if (w) note(w, run, sentence(`Inscripción en el workflow «${w.name}» cancelada por ${by}`), { when: now });
  emit(run);
  return out(run);
}

// ---------- the checker ----------
// Processes every due run (a delay that ended; a run left 'active' by a closed tab). With Supabase, a run is
// claimed against its observed timestamp so competing checkers cannot claim the same version.
async function claim(run) {
  const { data, error } = await supabase.from('workflow_runs').update({ estado: 'active', updated_at: new Date().toISOString() }).eq('id', run.id).eq('estado', run.estado).eq('updated_at', run.updatedAt).select('id');
  if (error) { reportDbError('workflow_runs', error); return false; }
  return Array.isArray(data) && data.length > 0;
}
let checking = false;
export async function processDueRuns(now = Date.now()) {
  await ready;
  if (checking) return { due: 0, advanced: 0 };
  checking = true;
  try {
    await pending();
    // Refresh runs created or advanced by other tabs without replacing in-flight objects.
    if (live) {
      const { data, error } = await supabase.from('workflow_runs').select('*').order('started_at', { ascending: false });
      if (error) throw error;
      const fresh = (data || []).map(fromDb);
      rows = rows.filter((r) => busy.has(r.id));
      rows.push(...fresh.filter((r) => !busy.has(r.id)));
    }
    const due = rows.filter((r) => !busy.has(r.id) && ((r.estado === 'waiting' && r.proximaEjecucion && new Date(r.proximaEjecucion).getTime() <= now) || (r.estado === 'active' && new Date(r.updatedAt).getTime() <= now - STALE_MS)));
    let advanced = 0;
    for (const run of due) {
      if (live && !(await claim(run))) continue;
      await advance(run, now);
      advanced += 1;
    }
    return { due: due.length, advanced };
  } finally { checking = false; }
}
let timer = null;
let lastCheck = null;
export const lastCheckAt = () => lastCheck;
// Called when the app loads (src/page.js and the workflow editor): one pass now, then one every minute.
export function startWorkflowChecker({ intervalMs = 60000 } = {}) {
  if (timer) return timer;
  const tick = () => { lastCheck = new Date().toISOString(); processDueRuns().catch((e) => console.error('[workflows] verificador', e)); };
  tick();
  timer = setInterval(tick, intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}
export function stopWorkflowChecker() { if (timer) clearInterval(timer); timer = null; }
export const checkerRunning = () => Boolean(timer);

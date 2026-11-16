// Workflows (Automatización › Workflows): the workflows / workflow_actions / workflow_enrollments tables with
// Supabase (localStorage otherwise), the trigger condition engine (OR between groups, AND inside), the action
// catalogue, the step-by-step simulation ("Prueba") and the real execution on publish — matching records are
// enrolled and the actions really change Omni's data (property edits, tasks, bell notifications).
import { allContacts, allCompanies, allDeals, allTickets, addRecord, setField, addActivity, dbIsLive, OWNERS, PRIORITIES, dealPipelines, stagesFor, allTicketStatuses, formatDate, TODAY } from './data.js';
import { propertyList } from './properties.js';
import { renderTokens, contextFromRecord } from './tokens.js';
import { addNotification } from './notifications.js';
import { supabase } from './supabaseClient.js';

export const ME = 'Fernando L.';
export const OBJECT_TYPES = [['contacts', 'Contacto'], ['companies', 'Empresa'], ['deals', 'Negocio'], ['tickets', 'Ticket']];
export const OBJECT_LABEL = Object.fromEntries(OBJECT_TYPES);
export const OBJECT_PLURAL = { contacts: 'contactos', companies: 'empresas', deals: 'negocios', tickets: 'tickets' };
export const TOKEN_OBJECT = { contacts: 'contacto', companies: 'empresa', deals: 'negocio', tickets: 'ticket' };
export const OPERATORS = [['is_any_of', 'es cualquiera de'], ['eq', 'es igual a'], ['neq', 'no es igual a'], ['lt', 'es menos que'], ['gt', 'es más que'], ['contains', 'contiene'], ['known', 'se conoce'], ['unknown', 'no se conoce']];
export const STATUS_LABELS = { published: 'Publicado', off: 'Retirado', draft: 'Borrador' };
export const ENROLL_CAP = 25;
export const ACTION_CATALOG = [
  ['Comunicación', [['notify_email', 'Enviar notificación interna por correo', '✉'], ['notify_app', 'Enviar notificación en la app', '🔔'], ['marketing_email', 'Enviar correo de marketing', '📣']]],
  ['CRM', [['create_record', 'Crear registro', '＋'], ['edit_record', 'Editar registro', '✎'], ['assign_owner', 'Asignar propietario', '👤'], ['copy_property', 'Copiar propiedad entre objetos asociados', '⇄']]],
  ['Flujo', [['delay', 'Retraso', '⏱'], ['branch', 'Rama if/then', '⑂'], ['goto', 'Ir a otra acción', '↪']]],
  ['Tareas', [['create_task', 'Crear tarea', '☑']]],
];
export const ACTION_DEFS = Object.fromEntries(ACTION_CATALOG.flatMap(([group, items]) => items.map(([type, label, icon]) => [type, { type, label, icon, group }])));
const DAY = 86400000;
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const clone = (x) => JSON.parse(JSON.stringify(x));
const LISTS = { contacts: allContacts, companies: allCompanies, deals: allDeals, tickets: allTickets };
export const recordsOf = (type) => (LISTS[type] ? LISTS[type]() : []);
export const recordName = (type, r) => r.name || `${r.first || ''} ${r.last || ''}`.trim() || `#${r.id}`;

// ---------- properties available to conditions ----------
const VIRTUAL = {
  contacts: [['assoc_deals', 'Negocios asociados']],
  companies: [['assoc_contacts', 'Contactos asociados'], ['assoc_deals', 'Negocios asociados']],
  deals: [['assoc_contacts', 'Contactos asociados']],
  tickets: [['assoc_contacts', 'Contactos asociados']],
};
export function conditionProperties(type) {
  const virt = (VIRTUAL[type] || []).map(([key, label]) => ({ key, label, kind: 'number', options: null, virtual: true }));
  const base = propertyList(type).filter((p) => p.kind !== 'calc').map((p) => {
    let options = Array.isArray(p.options) && p.options.length ? p.options.map((o) => (Array.isArray(o) ? [String(o[0]), String(o[1])] : [String(o), String(o)])) : null;
    if (p.key === 'pipeline' && type === 'deals') options = dealPipelines().map((n) => [n, n]);
    if (p.kind === 'stage') options = [...new Map(dealPipelines().flatMap((n) => stagesFor(n)).map((s) => [s[0], [s[0], s[1]]])).values()];
    if (p.kind === 'user' || p.key === 'owner') options = OWNERS.map((o) => [o, o]);
    if (p.kind === 'priority') options = PRIORITIES.map(([k, l]) => [k, l]);
    if (p.kind === 'status' && type === 'tickets') options = allTicketStatuses().map(([k, l]) => [k, l]);
    return { key: p.key, label: p.label, kind: p.kind, options, virtual: false };
  });
  return [...virt, ...base];
}
export const propertyDef = (type, key) => conditionProperties(type).find((p) => p.key === key) || null;
export function valueOf(type, r, key) {
  if (!r) return undefined;
  if (key === 'assoc_contacts') {
    if (type === 'deals' || type === 'tickets') return (r.contactId ? 1 : 0) + (Array.isArray(r.assoc_contacts) ? r.assoc_contacts.length : 0);
    if (type === 'companies') return allContacts().filter((c) => Number(c.companyId) === Number(r.id)).length;
  }
  if (key === 'assoc_deals') {
    if (type === 'contacts') return allDeals().filter((d) => Number(d.contactId) === Number(r.id)).length;
    if (type === 'companies') return allDeals().filter((d) => Number(d.companyId) === Number(r.id)).length;
  }
  return r[key];
}
export const labelOfValue = (type, key, value) => { const p = propertyDef(type, key); const o = p && p.options ? p.options.find((x) => String(x[0]) === String(value)) : null; return o ? o[1] : String(value ?? ''); };
export const operatorLabel = (op) => (OPERATORS.find((o) => o[0] === op) || [op, op])[1];
const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
export function evalCondition(type, r, c) {
  const v = valueOf(type, r, c.property);
  const values = Array.isArray(c.value) ? c.value.map(String) : String(c.value ?? '').split('|').map((s) => s.trim()).filter(Boolean);
  switch (c.operator) {
    case 'known': return !empty(v);
    case 'unknown': return empty(v);
    case 'eq': return !empty(v) && (Number.isFinite(Number(v)) && Number.isFinite(Number(c.value)) && String(c.value).trim() !== '' ? Number(v) === Number(c.value) : String(v).toLowerCase() === String(c.value ?? '').toLowerCase());
    case 'neq': return empty(v) ? true : !(Number.isFinite(Number(v)) && Number.isFinite(Number(c.value)) && String(c.value).trim() !== '' ? Number(v) === Number(c.value) : String(v).toLowerCase() === String(c.value ?? '').toLowerCase());
    case 'lt': return !empty(v) && Number(v) < Number(c.value);
    case 'gt': return !empty(v) && Number(v) > Number(c.value);
    case 'contains': return !empty(v) && String(v).toLowerCase().includes(String(c.value ?? '').toLowerCase());
    case 'is_any_of': return !empty(v) && values.some((x) => x.toLowerCase() === String(v).toLowerCase());
    default: return false;
  }
}
export const conditionText = (type, c) => { const p = propertyDef(type, c.property); const name = p ? p.label : c.property || '(propiedad)'; if (c.operator === 'known' || c.operator === 'unknown') return `${name} ${operatorLabel(c.operator)}`; const vals = Array.isArray(c.value) ? c.value : String(c.value ?? '').split('|').filter(Boolean); return `${name} ${operatorLabel(c.operator)} ${vals.map((v) => labelOfValue(type, c.property, v)).join(', ') || '…'}`; };
// OR between groups, AND inside a group; an empty trigger matches nothing.
export function evaluateTrigger(type, r, trigger) {
  const groups = (trigger && trigger.groups) || [];
  const detail = groups.map((g) => { const conds = (g.conditions || []).map((c) => ({ ...c, text: conditionText(type, c), ok: evalCondition(type, r, c) })); return { id: g.id, ok: conds.length > 0 && conds.every((c) => c.ok), conditions: conds }; });
  return { ok: detail.some((g) => g.ok), groups: detail };
}
export const matches = (type, r, trigger) => evaluateTrigger(type, r, trigger).ok;
export const matchingRecords = (wf) => recordsOf(wf.objectType).filter((r) => matches(wf.objectType, r, wf.trigger));

// ---------- storage ----------
let live = dbIsLive();
let rows = [];
let enrollRows = [];
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn).catch((e) => console.error('[supabase] workflows', e)); return queue; };
export const pending = () => queue;
const LS = { wf: 'crm:workflows', enr: 'crm:workflow_enrollments', folders: 'crm:workflow_folders', views: 'crm:workflows:views' };
const wfFromDb = (r, actions) => ({ id: r.id, name: r.name || '', description: r.description || '', folder: r.folder || '', objectType: r.object_type || 'contacts', status: r.status || 'draft', trigger: r.trigger && r.trigger.groups ? r.trigger : { groups: [], reenroll: false }, createdBy: r.created_by || '', deletedAt: r.deleted_at || null, publishedAt: r.published_at || null, createdAt: r.created_at, updatedAt: r.updated_at || r.created_at, actions: actions.map((a) => ({ id: a.id, parentId: a.parent_id || null, branch: a.branch || '', position: Number(a.position) || 0, type: a.type, config: a.config || {} })) });
const wfToDb = (w) => ({ id: w.id, name: w.name, description: w.description, folder: w.folder || '', object_type: w.objectType, status: w.status, trigger: w.trigger, created_by: w.createdBy, deleted_at: w.deletedAt || null, published_at: w.publishedAt || null, created_at: w.createdAt, updated_at: w.updatedAt });
const actToDb = (wfId, a) => ({ id: a.id, workflow_id: wfId, parent_id: a.parentId || null, branch: a.branch || '', position: a.position, type: a.type, config: a.config || {} });
const enrFromDb = (r) => ({ id: r.id, workflowId: r.workflow_id, objectType: r.object_type, recordId: r.record_id, recordName: r.record_name || '', status: r.status || 'completed', actionsRun: Number(r.actions_run) || 0, log: Array.isArray(r.log) ? r.log : [], enrolledAt: r.enrolled_at });
const enrToDb = (e) => ({ id: e.id, workflow_id: e.workflowId, object_type: e.objectType, record_id: e.recordId == null ? null : Number(e.recordId), record_name: e.recordName, status: e.status, actions_run: e.actionsRun, log: e.log, enrolled_at: e.enrolledAt });
const saveLocal = () => { localStorage.setItem(LS.wf, JSON.stringify(rows)); localStorage.setItem(LS.enr, JSON.stringify(enrollRows)); };
const persistWf = (w) => { if (live) enqueue(async () => { const { error } = await supabase.from('workflows').upsert(wfToDb(w), { onConflict: 'id' }); if (error) throw error; const { error: e2 } = await supabase.from('workflow_actions').delete().eq('workflow_id', w.id); if (e2) throw e2; if (w.actions.length) { const { error: e3 } = await supabase.from('workflow_actions').insert(w.actions.map((a) => actToDb(w.id, a))); if (e3) throw e3; } }); else saveLocal(); };
const persistEnr = (list) => { if (!list.length) return; if (live) enqueue(async () => { const { error } = await supabase.from('workflow_enrollments').insert(list.map(enrToDb)); if (error) throw error; }); else saveLocal(); };

const act = (type, config, extra = {}) => ({ id: uuid(), parentId: null, branch: '', position: 0, type, config, ...extra });
const withPositions = (actions) => { const groups = {}; actions.forEach((a) => { const k = `${a.parentId || ''}|${a.branch || ''}`; (groups[k] = groups[k] || []).push(a); }); Object.values(groups).forEach((list) => list.forEach((a, i) => { a.position = i; })); return actions; };
function seedWorkflows() {
  const ago = (d) => new Date(TODAY.getTime() - d * DAY).toISOString();
  const w1 = { id: 'd9000000-0000-4000-8000-000000000001', name: '[Prueba] Negocios sin contacto', description: 'Avisa cuando un negocio de FUERZA DE VENTAS no tiene ningún contacto asociado.', folder: 'Ventas', objectType: 'deals', status: 'published', createdBy: 'Fernando L.', deletedAt: null, publishedAt: ago(20), createdAt: ago(40), updatedAt: ago(20), trigger: { reenroll: false, groups: [{ id: 'g1', conditions: [{ id: 'c1', property: 'pipeline', operator: 'is_any_of', value: ['FUERZA DE VENTAS'] }, { id: 'c2', property: 'assoc_contacts', operator: 'lt', value: '1' }] }] }, actions: [] };
  w1.actions = withPositions([
    act('notify_email', { to: 'Fernando L.', subject: 'Negocio sin contacto: {{negocio.nombre}}', body: 'El negocio {{negocio.nombre}} ({{negocio.monto}}) no tiene contactos asociados. Asocia uno para poder hacer seguimiento.' }),
    act('notify_app', { to: 'Fernando L.', title: 'Negocio sin contacto', text: '{{negocio.nombre}} necesita un contacto asociado.' }),
  ]);
  const w2 = { id: 'd9000000-0000-4000-8000-000000000002', name: '[Prueba] Lead nuevo sin propietario', description: 'Asigna un propietario a los leads nuevos, crea la tarea de llamada y avisa si no avanzan en dos días.', folder: 'Marketing', objectType: 'contacts', status: 'published', createdBy: 'Sofía R.', deletedAt: null, publishedAt: ago(12), createdAt: ago(30), updatedAt: ago(12), trigger: { reenroll: true, groups: [{ id: 'g1', conditions: [{ id: 'c1', property: 'lead_stage', operator: 'eq', value: 'Nuevo' }, { id: 'c2', property: 'owner', operator: 'unknown', value: '' }] }, { id: 'g2', conditions: [{ id: 'c3', property: 'lifecycle', operator: 'eq', value: 'Lead' }, { id: 'c4', property: 'source', operator: 'eq', value: 'Formulario web' }] }] }, actions: [] };
  const branch = act('branch', { groups: [{ id: 'bg1', conditions: [{ id: 'bc1', property: 'lead_stage', operator: 'eq', value: 'Nuevo' }] }] });
  w2.actions = withPositions([
    act('assign_owner', { owner: 'Sofía R.' }),
    act('create_task', { title: 'Llamar a {{contacto.nombre_completo}} (lead nuevo)', dueDays: 1, assignee: 'Sofía R.', taskType: 'Llamada' }),
    act('delay', { amount: 2, unit: 'days' }),
    branch,
    act('notify_app', { to: 'Sofía R.', title: 'Lead sin avance', text: '{{contacto.nombre_completo}} sigue en la etapa Nuevo tras 2 días.' }, { parentId: branch.id, branch: 'yes' }),
  ]);
  const w3 = { id: 'd9000000-0000-4000-8000-000000000003', name: '[Prueba] Tickets de prioridad alta', description: 'Pasa los tickets urgentes a «En espera de nosotros» y avisa a soporte.', folder: 'Soporte', objectType: 'tickets', status: 'draft', createdBy: 'Laura M.', deletedAt: null, publishedAt: null, createdAt: ago(6), updatedAt: ago(2), trigger: { reenroll: false, groups: [{ id: 'g1', conditions: [{ id: 'c1', property: 'priority', operator: 'is_any_of', value: ['high'] }, { id: 'c2', property: 'status', operator: 'is_any_of', value: ['new'] }] }] }, actions: [] };
  w3.actions = withPositions([
    act('edit_record', { property: 'status', value: 'progress' }),
    act('notify_email', { to: 'Laura M.', subject: 'Ticket urgente: {{ticket.asunto}}', body: 'El ticket {{ticket.asunto}} de {{contacto.nombre_completo}} tiene prioridad alta. Revísalo cuanto antes.' }),
  ]);
  return [w1, w2, w3];
}
// Simulated history for the seeded published workflows (nothing is changed in the records).
function seedEnrollments(list) {
  const out = [];
  const w1 = list.find((w) => w.id === 'd9000000-0000-4000-8000-000000000001');
  const w2 = list.find((w) => w.id === 'd9000000-0000-4000-8000-000000000002');
  allDeals().slice(0, 5).forEach((d, i) => out.push({ id: `da000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, workflowId: w1.id, objectType: 'deals', recordId: d.id, recordName: d.name, status: i === 3 ? 'failed' : 'completed', actionsRun: i === 3 ? 1 : 2, log: [{ action: 'notify_email', title: 'Enviar notificación interna por correo', ok: true, result: 'Correo interno enviado a Fernando L.' }, { action: 'notify_app', title: 'Enviar notificación en la app', ok: i !== 3, result: i === 3 ? 'El usuario no tiene las notificaciones en la app activadas' : 'Notificación mostrada a Fernando L.' }], enrolledAt: new Date(TODAY.getTime() - (18 - i * 3) * DAY).toISOString() }));
  allContacts().slice(5, 12).forEach((c, i) => out.push({ id: `da000000-0000-4000-8000-${String(i + 11).padStart(12, '0')}`, workflowId: w2.id, objectType: 'contacts', recordId: c.id, recordName: c.name, status: i < 5 ? 'completed' : 'in_progress', actionsRun: i < 5 ? 4 : 2, log: [{ action: 'assign_owner', title: 'Asignar propietario', ok: true, result: 'Propietario: Sofía R.' }, { action: 'create_task', title: 'Crear tarea', ok: true, result: `Tarea «Llamar a ${c.name} (lead nuevo)» creada` }, { action: 'delay', title: 'Retraso', ok: true, result: i < 5 ? 'Retraso de 2 días completado' : 'Esperando 2 días' }, ...(i < 5 ? [{ action: 'branch', title: 'Rama if/then', ok: true, result: i % 2 ? 'Condición cumplida → rama Sí' : 'Condición no cumplida → rama No' }] : [])], enrolledAt: new Date(TODAY.getTime() - (11 - i) * DAY).toISOString() }));
  return out;
}
function loadLocal() {
  try { const w = JSON.parse(localStorage.getItem(LS.wf)); const e = JSON.parse(localStorage.getItem(LS.enr)); if (Array.isArray(w) && Array.isArray(e)) { rows = w; enrollRows = e; return; } } catch { /* seed */ }
  rows = seedWorkflows();
  enrollRows = seedEnrollments(rows);
  saveLocal();
}
async function loadLive() {
  const { data: w, error } = await supabase.from('workflows').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  const { data: a, error: e2 } = await supabase.from('workflow_actions').select('*').order('position');
  if (e2) throw e2;
  const { data: e, error: e3 } = await supabase.from('workflow_enrollments').select('*').order('enrolled_at', { ascending: false });
  if (e3) throw e3;
  rows = (w || []).map((r) => wfFromDb(r, (a || []).filter((x) => x.workflow_id === r.id)));
  enrollRows = (e || []).map(enrFromDb);
  if (!rows.length) {
    rows = seedWorkflows();
    const { error: e4 } = await supabase.from('workflows').insert(rows.map(wfToDb));
    if (e4) console.error('[supabase] semilla de workflows', e4);
    const { error: e5 } = await supabase.from('workflow_actions').insert(rows.flatMap((x) => x.actions.map((y) => actToDb(x.id, y))));
    if (e5) console.error('[supabase] semilla de acciones', e5);
    enrollRows = seedEnrollments(rows);
    const { error: e6 } = await supabase.from('workflow_enrollments').insert(enrollRows.map(enrToDb));
    if (e6) console.error('[supabase] semilla de inscripciones', e6);
  }
}
export const ready = (async () => {
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tablas de workflows no disponibles; workflows en localStorage.', e); loadLocal(); }
  } else loadLocal();
})();
export const workflowsLive = () => live;

// ---------- reads ----------
const out = (w) => clone(w);
export const workflows = () => rows.filter((w) => !w.deletedAt).map(out).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
export const deletedWorkflows = () => rows.filter((w) => w.deletedAt).map(out);
export const workflowById = (id) => { const w = rows.find((x) => x.id === id); return w ? out(w) : null; };
export const enrollmentsOf = (id) => enrollRows.filter((e) => e.workflowId === id).map(out).sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt));
export const creators = () => [...new Set(rows.filter((w) => !w.deletedAt).map((w) => w.createdBy).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const readJson = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
export const folders = () => [...new Set([...readJson(LS.folders, []), ...rows.filter((w) => !w.deletedAt).map((w) => w.folder).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'es'));
export function createFolder(name) { const n = String(name || '').trim(); if (!n) return null; const list = readJson(LS.folders, []); if (!list.includes(n)) { list.push(n); localStorage.setItem(LS.folders, JSON.stringify(list)); } return n; }
export const views = () => readJson(LS.views, []);
export function saveView(name, filters) { const n = String(name || '').trim(); if (!n) return null; const list = views(); const v = { id: uuid(), name: n, filters: { ...filters } }; list.push(v); localStorage.setItem(LS.views, JSON.stringify(list)); return v; }
export function deleteView(id) { localStorage.setItem(LS.views, JSON.stringify(views().filter((v) => v.id !== id))); }
// Problems that need a look ("Revisar problemas de automatización" / "Revisión necesaria").
export function problemsOf(w) {
  const p = [];
  const groups = (w.trigger && w.trigger.groups) || [];
  if (!groups.length || groups.every((g) => !(g.conditions || []).length)) p.push('El desencadenante no tiene condiciones: ningún registro se inscribirá.');
  groups.forEach((g) => (g.conditions || []).forEach((c) => { if (!propertyDef(w.objectType, c.property)) p.push(`La condición usa una propiedad que ya no existe (${c.property}).`); if (!['known', 'unknown'].includes(c.operator) && empty(c.value)) p.push(`La condición «${conditionText(w.objectType, c)}» no tiene valor.`); }));
  if (!w.actions.length) p.push('El workflow no tiene acciones.');
  w.actions.forEach((a) => { if (a.type === 'branch' && !((a.config.groups || []).some((g) => (g.conditions || []).length))) p.push('Una rama if/then no tiene condiciones.'); if (a.type === 'goto' && !w.actions.some((x) => x.id === a.config.target)) p.push('Una acción «Ir a otra acción» apunta a una acción que no existe.'); if (a.type === 'edit_record' && !a.config.property) p.push('Una acción «Editar registro» no indica la propiedad.'); });
  return p;
}
export const needsReview = (w) => problemsOf(w).length > 0 && w.status !== 'draft';
export const issues = () => workflows().map((w) => ({ workflow: w, problems: problemsOf(w) })).filter((x) => x.problems.length && x.workflow.status !== 'draft');
export function performance(id) {
  const list = enrollmentsOf(id);
  const actionsRun = list.reduce((a, e) => a + (Number(e.actionsRun) || 0), 0);
  const ok = list.filter((e) => e.status !== 'failed').length;
  return { enrollments: list.length, actionsRun, successRate: list.length ? ok / list.length : 0, inProgress: list.filter((e) => e.status === 'in_progress').length, rows: list };
}
export function analytics() {
  const list = workflows();
  const since = TODAY.getTime() - 30 * DAY;
  const recent = enrollRows.filter((e) => new Date(e.enrolledAt).getTime() >= since);
  const byObject = OBJECT_TYPES.map(([k, l]) => ({ type: k, label: l, workflows: list.filter((w) => w.objectType === k).length, enrollments: enrollRows.filter((e) => e.objectType === k).length }));
  return { workflows: list.length, published: list.filter((w) => w.status === 'published').length, enrollments30: recent.length, actionsRun: enrollRows.reduce((a, e) => a + (Number(e.actionsRun) || 0), 0), failed: enrollRows.filter((e) => e.status === 'failed').length, byObject, perWorkflow: list.map((w) => ({ ...w, ...performance(w.id) })) };
}
export const health = () => workflows().map((w) => { const p = problemsOf(w); const perf = performance(w.id); return { ...w, problems: p, lastRun: perf.rows[0] ? perf.rows[0].enrolledAt : null, enrollments: perf.enrollments, state: w.status !== 'published' ? 'off' : p.length ? 'review' : 'ok' }; });

// ---------- writes ----------
export function createWorkflow({ name, objectType = 'contacts', description = '', folder = '', trigger = null, actions = [], createdBy = ME } = {}) {
  const n = String(name || '').trim();
  if (!n || !OBJECT_LABEL[objectType]) return null;
  const now = new Date().toISOString();
  const w = { id: uuid(), name: n, description: String(description || ''), folder: folder || '', objectType, status: 'draft', trigger: trigger || { groups: [], reenroll: false }, createdBy, deletedAt: null, publishedAt: null, createdAt: now, updatedAt: now, actions: withPositions(clone(actions).map((a) => ({ ...a, id: a.id || uuid() }))) };
  rows.unshift(w);
  persistWf(w);
  return out(w);
}
export function saveWorkflow(id, patch) {
  const w = rows.find((x) => x.id === id);
  if (!w) return null;
  const next = { ...w, ...patch };
  if (!String(next.name || '').trim()) return null;
  Object.assign(w, next, { name: String(next.name).trim(), trigger: clone(next.trigger || w.trigger), actions: withPositions(clone(next.actions || w.actions)), updatedAt: new Date().toISOString() });
  persistWf(w);
  return out(w);
}
export function cloneWorkflow(id, { createdBy = ME } = {}) {
  const src = rows.find((x) => x.id === id);
  if (!src) return null;
  const now = new Date().toISOString();
  const map = {};
  src.actions.forEach((a) => { map[a.id] = uuid(); });
  const w = { ...clone(src), id: uuid(), name: `${src.name} (copia)`, status: 'draft', publishedAt: null, deletedAt: null, createdBy, createdAt: now, updatedAt: now, actions: src.actions.map((a) => ({ ...clone(a), id: map[a.id], parentId: a.parentId ? map[a.parentId] : null, config: a.type === 'goto' && a.config.target ? { ...a.config, target: map[a.config.target] || '' } : clone(a.config) })) };
  rows.unshift(w);
  persistWf(w);
  return out(w);
}
export function deleteWorkflows(ids) { const set = new Set(ids); let n = 0; rows.forEach((w) => { if (set.has(w.id) && !w.deletedAt) { w.deletedAt = new Date().toISOString(); w.status = w.status === 'published' ? 'off' : w.status; w.updatedAt = w.deletedAt; persistWf(w); n += 1; } }); return n; }
export function restoreWorkflows(ids) { const set = new Set(ids); let n = 0; rows.forEach((w) => { if (set.has(w.id) && w.deletedAt) { w.deletedAt = null; w.updatedAt = new Date().toISOString(); persistWf(w); n += 1; } }); return n; }
export const moveWorkflows = (ids, folder) => ids.map((id) => { const w = rows.find((x) => x.id === id); if (!w) return null; w.folder = folder || ''; w.updatedAt = new Date().toISOString(); persistWf(w); return w; }).filter(Boolean).length;
export function unpublish(id) { const w = rows.find((x) => x.id === id); if (!w) return null; w.status = 'off'; w.updatedAt = new Date().toISOString(); persistWf(w); return out(w); }

// ---------- action helpers ----------
export const childrenOf = (actions, parentId = null, branch = '') => actions.filter((a) => (a.parentId || null) === (parentId || null) && (a.branch || '') === (branch || '')).sort((a, b) => a.position - b.position);
export function defaultConfig(type, objectType) {
  const tok = TOKEN_OBJECT[objectType] || 'contacto';
  const nameTok = objectType === 'contacts' ? '{{contacto.nombre_completo}}' : objectType === 'tickets' ? '{{ticket.asunto}}' : `{{${tok}.nombre}}`;
  return {
    notify_email: { to: ME, subject: `Aviso sobre ${nameTok}`, body: `Revisa el registro ${nameTok}.` },
    notify_app: { to: ME, title: `Aviso: ${nameTok}`, text: 'Revisa este registro.' },
    marketing_email: { email: 'Boletín mensual' },
    create_record: { objectType: 'tasks', name: `Seguimiento de ${nameTok}` },
    edit_record: { property: '', value: '' },
    assign_owner: { owner: ME },
    copy_property: { from: '', toObject: objectType === 'contacts' ? 'companies' : 'contacts', to: '' },
    delay: { amount: 1, unit: 'days' },
    branch: { groups: [{ id: uuid(), conditions: [] }] },
    goto: { target: '' },
    create_task: { title: `Seguimiento con ${nameTok}`, dueDays: 2, assignee: ME, taskType: 'Tarea' },
  }[type] || {};
}
export function newAction(type, objectType, { parentId = null, branch = '' } = {}) { return { id: uuid(), parentId, branch, position: 0, type, config: defaultConfig(type, objectType) }; }
// Inserts `action` among the siblings of (parentId, branch) at `index`.
export function insertAction(actions, action, index, parentId = null, branch = '') {
  const siblings = childrenOf(actions, parentId, branch);
  const others = actions.filter((a) => !siblings.includes(a));
  siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, { ...action, parentId, branch });
  siblings.forEach((a, i) => { a.position = i; });
  return [...others, ...siblings];
}
export function removeAction(actions, id) {
  const doomed = new Set([id]);
  let grew = true;
  while (grew) { grew = false; actions.forEach((a) => { if (a.parentId && doomed.has(a.parentId) && !doomed.has(a.id)) { doomed.add(a.id); grew = true; } }); }
  return withPositions(actions.filter((a) => !doomed.has(a.id)));
}
export function moveAction(actions, id, dir) {
  const a = actions.find((x) => x.id === id);
  if (!a) return actions;
  const siblings = childrenOf(actions, a.parentId, a.branch);
  const i = siblings.indexOf(a);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return actions;
  siblings.splice(i, 1); siblings.splice(j, 0, a);
  siblings.forEach((x, k) => { x.position = k; });
  return actions;
}
export const describeAction = (w, a) => {
  const c = a.config || {};
  const t = w.objectType;
  switch (a.type) {
    case 'notify_email': return { text: `Asunto: «${c.subject || ''}»`, to: c.to || '' };
    case 'notify_app': return { text: `${c.title || ''}${c.text ? ` — ${c.text}` : ''}`, to: c.to || '' };
    case 'marketing_email': return { text: `Correo «${c.email || ''}»`, to: '' };
    case 'create_record': return { text: `Crear ${OBJECT_PLURAL[c.objectType] ? OBJECT_LABEL[c.objectType].toLowerCase() : c.objectType === 'tasks' ? 'tarea' : c.objectType} «${c.name || ''}»`, to: '' };
    case 'edit_record': { const p = propertyDef(t, c.property); return { text: `${p ? p.label : c.property || '(propiedad)'} = ${c.property ? labelOfValue(t, c.property, c.value) : '…'}`, to: '' }; }
    case 'assign_owner': return { text: 'Propietario', to: c.owner || '' };
    case 'copy_property': { const p = propertyDef(t, c.from); const q = propertyDef(c.toObject, c.to); return { text: `${p ? p.label : c.from || '(propiedad)'} → ${OBJECT_LABEL[c.toObject] || ''}: ${q ? q.label : c.to || '(propiedad)'}`, to: '' }; }
    case 'delay': return { text: `Esperar ${c.amount || 0} ${c.unit === 'hours' ? (Number(c.amount) === 1 ? 'hora' : 'horas') : Number(c.amount) === 1 ? 'día' : 'días'}`, to: '' };
    case 'branch': { const gs = c.groups || []; return { text: gs.length && gs.some((g) => (g.conditions || []).length) ? gs.map((g) => (g.conditions || []).map((x) => conditionText(t, x)).join(' y ')).filter(Boolean).join(' · o · ') : 'Sin condiciones', to: '' }; }
    case 'goto': { const target = w.actions.find((x) => x.id === c.target); return { text: target ? `Ir a «${ACTION_DEFS[target.type].label}»` : 'Sin destino', to: '' }; }
    case 'create_task': return { text: `«${c.title || ''}» · vence en ${c.dueDays ?? 0} días`, to: c.assignee || '' };
    default: return { text: '', to: '' };
  }
};

// ---------- execution ----------
const link = (type, id) => `${type}/record/?id=${id}`;
function associated(type, r, toObject) {
  if (toObject === 'contacts') { if (type === 'contacts') return r; if (r.contactId) return allContacts().find((c) => Number(c.id) === Number(r.contactId)) || null; if (type === 'companies') return allContacts().find((c) => Number(c.companyId) === Number(r.id)) || null; return null; }
  if (toObject === 'companies') { if (type === 'companies') return r; if (r.companyId) return allCompanies().find((c) => Number(c.id) === Number(r.companyId)) || null; const c = r.contactId ? allContacts().find((x) => Number(x.id) === Number(r.contactId)) : null; return c && c.companyId ? allCompanies().find((x) => Number(x.id) === Number(c.companyId)) || null : null; }
  if (toObject === 'deals') { if (type === 'deals') return r; return allDeals().find((d) => (type === 'contacts' && Number(d.contactId) === Number(r.id)) || (type === 'companies' && Number(d.companyId) === Number(r.id))) || null; }
  if (toObject === 'tickets') { if (type === 'tickets') return r; return allTickets().find((d) => type === 'contacts' && Number(d.contactId) === Number(r.id)) || null; }
  return null;
}
function runAction(w, a, r, ctx, apply) {
  const type = w.objectType;
  const c = a.config || {};
  const tok = (s) => renderTokens(String(s || ''), ctx);
  const name = recordName(type, r);
  const note = (text) => { if (apply) addActivity({ type: 'system', when: Date.now(), who: 'Workflow', text: `Workflow «${w.name}»: ${text}`, recordType: type, recordId: r.id, extra: { workflowId: w.id, subject: `Workflow: ${w.name}` } }); };
  switch (a.type) {
    case 'notify_email': { const subject = tok(c.subject); if (apply) addNotification({ kind: 'email', title: `Correo interno para ${c.to || ME}: ${subject}`, text: tok(c.body), href: link(type, r.id) }); note(`notificación interna por correo a ${c.to || ME}: «${subject}».`); return { ok: true, result: `Correo interno «${subject}» enviado a ${c.to || ME}` }; }
    case 'notify_app': { const title = tok(c.title); if (apply) addNotification({ kind: 'app', title, text: tok(c.text), href: link(type, r.id) }); note(`notificación en la app a ${c.to || ME}: «${title}».`); return { ok: true, result: `Notificación «${title}» mostrada a ${c.to || ME}` }; }
    case 'marketing_email': { note(`correo de marketing «${c.email || ''}» enviado.`); return { ok: true, result: `Correo de marketing «${c.email || ''}» enviado a ${name}` }; }
    case 'create_record': {
      const n = tok(c.name) || `Seguimiento de ${name}`;
      if (apply) {
        if (c.objectType === 'tasks') addRecord('tasks', { name: n, type: 'Tarea', status: 'todo', priority: 'medium', owner: r.owner && r.owner !== 'Sin asignar' ? r.owner : ME, contactId: type === 'contacts' ? r.id : r.contactId || '', contact: type === 'contacts' ? name : r.contact || '', due: new Date(Date.now() + 2 * DAY).toISOString(), lastActivity: new Date().toISOString() });
        else if (c.objectType === 'tickets') addRecord('tickets', { name: n, status: 'new', priority: 'medium', pipeline: 'Pipeline de soporte', owner: ME, contactId: type === 'contacts' ? r.id : r.contactId || null, source: 'Workflow' });
        else if (c.objectType === 'deals') addRecord('deals', { name: n, amount: 0, pipeline: dealPipelines()[0], stage: (stagesFor(dealPipelines()[0])[0] || [''])[0], owner: ME, contactId: type === 'contacts' ? r.id : r.contactId || null, companyId: r.companyId || null, company: r.company || '' });
      }
      note(`${c.objectType === 'tasks' ? 'tarea' : c.objectType === 'tickets' ? 'ticket' : 'negocio'} «${n}» creado.`);
      return { ok: true, result: `${c.objectType === 'tasks' ? 'Tarea' : c.objectType === 'tickets' ? 'Ticket' : 'Negocio'} «${n}» creado` };
    }
    case 'edit_record': { if (!c.property) return { ok: false, result: 'La acción no indica qué propiedad editar' }; const p = propertyDef(type, c.property); if (apply) setField(type, r.id, c.property, c.value); note(`propiedad «${p ? p.label : c.property}» cambiada a «${labelOfValue(type, c.property, c.value)}».`); return { ok: true, result: `${p ? p.label : c.property} = ${labelOfValue(type, c.property, c.value)}` }; }
    case 'assign_owner': { if (apply) setField(type, r.id, 'owner', c.owner || ME); note(`propietario asignado: ${c.owner || ME}.`); return { ok: true, result: `Propietario: ${c.owner || ME}` }; }
    case 'copy_property': { const target = associated(type, r, c.toObject); if (!target) return { ok: false, result: `No hay ${OBJECT_LABEL[c.toObject] ? OBJECT_LABEL[c.toObject].toLowerCase() : 'registro'} asociado` }; if (!c.from || !c.to) return { ok: false, result: 'Faltan las propiedades de origen o destino' }; const v = valueOf(type, r, c.from); if (apply) setField(c.toObject, target.id, c.to, v); note(`propiedad «${c.from}» copiada a ${OBJECT_LABEL[c.toObject].toLowerCase()} «${recordName(c.toObject, target)}».`); return { ok: true, result: `${c.to} de «${recordName(c.toObject, target)}» = ${v ?? ''}` }; }
    case 'delay': return { ok: true, result: `Retraso de ${c.amount || 0} ${c.unit === 'hours' ? 'horas' : 'días'} (simulado: continúa)` };
    case 'create_task': { const title = tok(c.title) || `Seguimiento con ${name}`; if (apply) addRecord('tasks', { name: title, type: c.taskType || 'Tarea', status: 'todo', priority: 'medium', owner: c.assignee || ME, contactId: type === 'contacts' ? r.id : r.contactId || '', contact: type === 'contacts' ? name : r.contact || '', due: new Date(Date.now() + (Number(c.dueDays) || 0) * DAY).toISOString(), lastActivity: new Date().toISOString() }); note(`tarea «${title}» creada para ${c.assignee || ME}.`); return { ok: true, result: `Tarea «${title}» creada para ${c.assignee || ME}` }; }
    default: return { ok: false, result: 'Acción desconocida' };
  }
}
// Walks the actions for one record: branches follow their Sí/No children, "Ir a" jumps, delays are logged.
export function simulate(w, r, { apply = false } = {}) {
  const type = w.objectType;
  const trigger = evaluateTrigger(type, r, w.trigger);
  const steps = [];
  if (!trigger.ok) return { enrolled: false, trigger, steps };
  const ctx = contextFromRecord(type, r);
  let guard = 0;
  let jumps = 0;
  // Runs the siblings of (parentId, branch) from index `from`; a branch descends into its Sí/No children and
  // then continues with the next sibling; "Ir a" restarts at the target (once, to avoid loops).
  const walk = (parentId, branch, from = 0) => {
    const list = childrenOf(w.actions, parentId, branch);
    for (let i = from; i < list.length; i += 1) {
      const a = list[i];
      const def = ACTION_DEFS[a.type] || { label: a.type };
      guard += 1;
      if (guard > 60) { steps.push({ actionId: a.id, type: a.type, title: 'Bucle detenido', ok: false, result: 'Se alcanzó el límite de 60 pasos' }); return; }
      if (a.type === 'branch') {
        const ev = evaluateTrigger(type, r, a.config);
        steps.push({ actionId: a.id, type: a.type, title: def.label, ok: true, result: ev.ok ? 'Condición cumplida → rama Sí' : 'Condición no cumplida → rama No', detail: ev });
        walk(a.id, ev.ok ? 'yes' : 'no');
        continue;
      }
      if (a.type === 'goto') {
        const target = w.actions.find((x) => x.id === a.config.target);
        if (!target) { steps.push({ actionId: a.id, type: a.type, title: def.label, ok: false, result: 'Destino no encontrado' }); return; }
        jumps += 1;
        steps.push({ actionId: a.id, type: a.type, title: def.label, ok: jumps <= 1, result: jumps <= 1 ? `Salta a «${ACTION_DEFS[target.type].label}»` : 'Segundo salto ignorado para evitar un bucle' });
        if (jumps <= 1) { const sibs = childrenOf(w.actions, target.parentId, target.branch); walk(target.parentId, target.branch, sibs.indexOf(target)); }
        return;
      }
      const res = runAction(w, a, r, ctx, apply);
      steps.push({ actionId: a.id, type: a.type, title: def.label, ok: res.ok, result: res.result });
    }
  };
  walk(null, '');
  return { enrolled: true, trigger, steps };
}
// Publishes: the matching records (up to ENROLL_CAP) are enrolled and the actions really run.
export function publish(id) {
  const w = rows.find((x) => x.id === id);
  if (!w) return null;
  const matched = matchingRecords(w);
  const already = new Set(enrollRows.filter((e) => e.workflowId === id).map((e) => String(e.recordId)));
  const candidates = matched.filter((r) => w.trigger.reenroll || !already.has(String(r.id))).slice(0, ENROLL_CAP);
  const created = [];
  candidates.forEach((r) => {
    const sim = simulate(w, r, { apply: true });
    const failed = sim.steps.some((s) => !s.ok);
    created.push({ id: uuid(), workflowId: id, objectType: w.objectType, recordId: r.id, recordName: recordName(w.objectType, r), status: failed ? 'failed' : sim.steps.some((s) => s.type === 'delay') ? 'completed' : 'completed', actionsRun: sim.steps.length, log: sim.steps.map((s) => ({ action: s.type, title: s.title, ok: s.ok, result: s.result })), enrolledAt: new Date().toISOString() });
    addActivity({ type: 'system', when: Date.now(), who: 'Workflow', text: `Inscrito en el workflow «${w.name}» (${sim.steps.length} ${sim.steps.length === 1 ? 'acción ejecutada' : 'acciones ejecutadas'}).`, recordType: w.objectType, recordId: r.id, extra: { workflowId: id, subject: `Workflow: ${w.name}` } });
  });
  enrollRows.unshift(...created);
  persistEnr(created);
  w.status = 'published'; w.publishedAt = new Date().toISOString(); w.updatedAt = w.publishedAt;
  persistWf(w);
  return { workflow: out(w), matched: matched.length, enrolled: created.length, capped: matched.length > created.length };
}
// Enrols one record by hand (Más › Inscribir en un workflow); the trigger is not required.
export function enrollRecord(id, type, r) {
  const w = rows.find((x) => x.id === id);
  if (!w || w.objectType !== type || !r) return null;
  const forced = { ...out(w), trigger: { groups: [{ id: 'manual', conditions: [{ id: 'm', property: 'id', operator: 'known', value: '' }] }], reenroll: true } };
  const sim = simulate(forced, r, { apply: true });
  const e = { id: uuid(), workflowId: id, objectType: type, recordId: r.id, recordName: recordName(type, r), status: sim.steps.some((s) => !s.ok) ? 'failed' : 'completed', actionsRun: sim.steps.length, log: sim.steps.map((s) => ({ action: s.type, title: s.title, ok: s.ok, result: s.result })), enrolledAt: new Date().toISOString() };
  enrollRows.unshift(e);
  persistEnr([e]);
  addActivity({ type: 'system', when: Date.now(), who: 'Workflow', text: `Inscrito manualmente en el workflow «${w.name}» (${sim.steps.length} ${sim.steps.length === 1 ? 'acción ejecutada' : 'acciones ejecutadas'}).`, recordType: type, recordId: r.id, extra: { workflowId: id, subject: `Workflow: ${w.name}` } });
  return { enrollment: out(e), steps: sim.steps };
}
// Pre-built templates for "Crear workflow › Desde plantilla".
export const TEMPLATES = [
  { key: 'new-lead-task', name: 'Lead nuevo → tarea de llamada', objectType: 'contacts', description: 'Crea una tarea de llamada para cada lead nuevo y se la asigna a su propietario.', trigger: { reenroll: false, groups: [{ id: 'g1', conditions: [{ id: 'c1', property: 'lead_stage', operator: 'eq', value: 'Nuevo' }] }] }, actions: () => [act('create_task', { title: 'Llamar a {{contacto.nombre_completo}}', dueDays: 1, assignee: ME, taskType: 'Llamada' })] },
  { key: 'deal-won', name: 'Negocio ganado → aviso al equipo', objectType: 'deals', description: 'Avisa en la app y por correo interno cuando un negocio pasa a Ganado.', trigger: { reenroll: false, groups: [{ id: 'g1', conditions: [{ id: 'c1', property: 'stage', operator: 'is_any_of', value: ['ganado', 'won'] }] }] }, actions: () => [act('notify_app', { to: ME, title: '¡Negocio ganado!', text: '{{negocio.nombre}} por {{negocio.monto}}' }), act('notify_email', { to: ME, subject: 'Negocio ganado: {{negocio.nombre}}', body: 'El negocio {{negocio.nombre}} ({{negocio.monto}}) se ha ganado.' })] },
  { key: 'ticket-waiting', name: 'Ticket sin respuesta → recordatorio', objectType: 'tickets', description: 'Si un ticket sigue nuevo, espera un día y crea una tarea de seguimiento.', trigger: { reenroll: true, groups: [{ id: 'g1', conditions: [{ id: 'c1', property: 'status', operator: 'is_any_of', value: ['new'] }] }] }, actions: () => [act('delay', { amount: 1, unit: 'days' }), act('create_task', { title: 'Responder al ticket {{ticket.asunto}}', dueDays: 0, assignee: 'Laura M.', taskType: 'Tarea' })] },
  { key: 'company-owner', name: 'Empresa nueva → asignar propietario', objectType: 'companies', description: 'Asigna un propietario a las empresas sin propietario y copia el sector a su contacto principal.', trigger: { reenroll: false, groups: [{ id: 'g1', conditions: [{ id: 'c1', property: 'owner', operator: 'unknown', value: '' }] }] }, actions: () => [act('assign_owner', { owner: 'Diego G.' }), act('copy_property', { from: 'industry', toObject: 'contacts', to: 'customer_type' })] },
];
// "Con IA": a tiny heuristic that turns a sentence into a draft workflow.
export function draftFromPrompt(prompt) {
  const p = String(prompt || '').toLowerCase();
  const objectType = /ticket/.test(p) ? 'tickets' : /negocio|deal|venta/.test(p) ? 'deals' : /empresa|compañ/.test(p) ? 'companies' : 'contacts';
  const actions = [];
  if (/tarea|llamar|llamada/.test(p)) actions.push(act('create_task', defaultConfig('create_task', objectType)));
  if (/correo|email|notific|avis/.test(p)) actions.push(act('notify_email', defaultConfig('notify_email', objectType)));
  if (/propietario|asign/.test(p)) actions.push(act('assign_owner', defaultConfig('assign_owner', objectType)));
  if (!actions.length) actions.push(act('notify_app', defaultConfig('notify_app', objectType)));
  const name = String(prompt || '').trim().slice(0, 60) || 'Workflow con IA';
  return { name: name[0].toUpperCase() + name.slice(1), objectType, description: `Borrador generado con IA a partir de: «${String(prompt || '').trim()}».`, trigger: { reenroll: false, groups: [{ id: uuid(), conditions: [] }] }, actions };
}

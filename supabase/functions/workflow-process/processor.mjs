// Runtime-independent engine of workflow-process, shared by the Edge Function and the local PGlite smoke test:
// the same walk as src/workflow-engine.js (flatten in the editor's numbering order, branches by condition,
// «Ir a» with a jump cap, a delay schedules the next execution) on top of a store that reserves and saves runs.
export const MAX_STEPS = 60;
export const MAX_JUMPS = 3;
const DAY = 86400000;
const HOUR = 3600000;
export const ACTION_LABELS = {
  send_email: 'Enviar correo', notify_email: 'Enviar notificación interna por correo', notify_app: 'Enviar notificación en la app', marketing_email: 'Enviar correo de marketing',
  create_record: 'Crear registro', edit_record: 'Editar registro', assign_owner: 'Asignar propietario', copy_property: 'Copiar propiedad entre objetos asociados',
  delay: 'Retraso', branch: 'Rama if/then', goto: 'Ir a otra acción', create_task: 'Crear tarea',
};
export const OBJECT_LABEL = { contacts: 'Contacto', companies: 'Empresa', deals: 'Negocio', tickets: 'Ticket' };
const ME = 'Fernando L.';
const iso = (t) => new Date(t).toISOString();
export const recordName = (r) => (r && (r.name || `${r.first || ''} ${r.last || ''}`.trim())) || (r ? `#${r.id}` : '');

// ---------- the actions in order ----------
const childrenOf = (actions, parentId = null, branch = '') => actions.filter((a) => (a.parent_id || a.parentId || null) === (parentId || null) && (a.branch || '') === (branch || '')).sort((a, b) => a.position - b.position);
export function flatten(actions) {
  const list = [];
  const walk = (parentId, branch) => childrenOf(actions, parentId, branch).forEach((a) => { list.push(a); if (a.type === 'branch') { walk(a.id, 'yes'); walk(a.id, 'no'); } });
  walk(null, '');
  return list;
}
export function nextAfter(actions, flat, i) {
  const a = flat[i];
  if (!a) return flat.length;
  const parentId = a.parent_id || a.parentId || null;
  const sibs = childrenOf(actions, parentId, a.branch);
  const k = sibs.findIndex((x) => x.id === a.id);
  if (k >= 0 && k < sibs.length - 1) return flat.findIndex((x) => x.id === sibs[k + 1].id);
  if (!parentId) return flat.length;
  const pi = flat.findIndex((x) => x.id === parentId);
  return pi < 0 ? flat.length : nextAfter(actions, flat, pi);
}

// ---------- conditions (same semantics as evalCondition / evaluateTrigger of src/workflows-data.js) ----------
const empty = (v) => v === undefined || v === null || v === '' || v === 'Sin asignar' || (Array.isArray(v) && !v.length);
const numeric = (v, c) => Number.isFinite(Number(v)) && Number.isFinite(Number(c)) && String(c).trim() !== '';
export function evalCondition(record, c, assoc = () => 0) {
  const v = c.property === 'assoc_contacts' || c.property === 'assoc_deals' ? assoc(c.property) : record[c.property] !== undefined ? record[c.property] : (record.extra || {})[c.property];
  const values = Array.isArray(c.value) ? c.value.map(String) : String(c.value ?? '').split('|').map((s) => s.trim()).filter(Boolean);
  switch (c.operator) {
    case 'known': return !empty(v);
    case 'unknown': return empty(v);
    case 'eq': return !empty(v) && (numeric(v, c.value) ? Number(v) === Number(c.value) : String(v).toLowerCase() === String(c.value ?? '').toLowerCase());
    case 'neq': return empty(v) ? true : !(numeric(v, c.value) ? Number(v) === Number(c.value) : String(v).toLowerCase() === String(c.value ?? '').toLowerCase());
    case 'lt': return !empty(v) && Number(v) < Number(c.value);
    case 'gt': return !empty(v) && Number(v) > Number(c.value);
    case 'contains': return !empty(v) && String(v).toLowerCase().includes(String(c.value ?? '').toLowerCase());
    case 'is_any_of': return !empty(v) && values.some((x) => x.toLowerCase() === String(v).toLowerCase());
    default: return false;
  }
}
// OR between groups, AND inside a group; an empty branch matches nothing.
export const evaluate = (record, cfg, assoc) => ((cfg && cfg.groups) || []).some((g) => (g.conditions || []).length > 0 && (g.conditions || []).every((c) => evalCondition(record, c, assoc)));
const conditionText = (c) => (c.operator === 'known' || c.operator === 'unknown' ? `${c.property} ${c.operator === 'known' ? 'se conoce' : 'no se conoce'}` : `${c.property} ${c.operator} ${Array.isArray(c.value) ? c.value.join(', ') : c.value ?? ''}`);

// ---------- tokens: {{contacto.nombre|predeterminado}} with the run's own record (plus its owner) ----------
const ALIASES = {
  contacto: { nombre: 'first', apellidos: 'last', nombre_completo: 'name', correo: 'email', telefono: 'phone', movil: 'mobilephone', cargo: 'job_title', ciudad: 'city', empresa: 'company', propietario: 'owner', pais: 'country', etapa_del_ciclo_de_vida: 'lifecycle' },
  empresa: { nombre: 'name', dominio: 'domain', sector: 'industry', ciudad: 'city', telefono: 'phone', propietario: 'owner', pais: 'country', tipo: 'type' },
  negocio: { nombre: 'name', monto: 'amount', etapa: 'stage', fecha_de_cierre: 'close_date', pipeline: 'pipeline', propietario: 'owner', prioridad: 'priority', tipo: 'type' },
  ticket: { asunto: 'name', estado: 'status', prioridad: 'priority', pipeline: 'pipeline', propietario: 'owner', fuente: 'source' },
};
const SLOT = { contacts: 'contacto', companies: 'empresa', deals: 'negocio', tickets: 'ticket' };
export function renderTokens(text, type, record) {
  return String(text || '').replace(/{{\s*([a-z_]+)\.([\w-]+)\s*(?:\|([^}]*))?}}/g, (m, o, s, def) => {
    let v = '';
    if (o === SLOT[type] && record) { const key = (ALIASES[o] || {})[s] || s; v = record[key] !== undefined ? record[key] : (record.extra || {})[key]; }
    else if (o === 'propietario' && record && record.owner && record.owner !== 'Sin asignar') { const owner = String(record.owner); v = s === 'nombre' ? owner.split(' ')[0] : s === 'nombre_completo' || s === 'apellidos' ? owner : ''; }
    return v !== undefined && v !== null && String(v) !== '' ? String(v) : String(def || '').trim();
  });
}

// ---------- delays ----------
const delayMs = (c) => Math.max(0, Number(c.amount) || 0) * (c.unit === 'hours' ? HOUR : DAY);
export const delayText = (c) => `${Number(c.amount) || 0} ${c.unit === 'hours' ? (Number(c.amount) === 1 ? 'hora' : 'horas') : Number(c.amount) === 1 ? 'día' : 'días'}`;
const whenText = (d) => `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;

// ---------- one action on the record ----------
// Returns { ok, result } and, through the store, changes data and writes the record's timeline entry.
async function executeAction(store, w, run, a, record, now) {
  const type = run.record_type;
  const c = a.config || {};
  const tok = (s) => renderTokens(s, type, record);
  const name = recordName(record);
  const note = (text, kind = 'system', extra = {}) => store.note(run, { type: kind, text: `Workflow «${w.name}»: ${text}`, when: now, extra: { workflowId: w.id, runId: run.id, subject: `Workflow: ${w.name}`, ...extra } });
  switch (a.type) {
    case 'create_task': {
      const title = tok(c.title) || `Seguimiento con ${name}`;
      const due = new Date(now.getTime() + (Number(c.dueDays) || 0) * DAY);
      const owner = c.assignee || (record.owner && record.owner !== 'Sin asignar' ? record.owner : run.enrolled_by) || ME;
      await store.createTask({ name: title, type: c.taskType || 'Tarea', status: 'todo', priority: 'medium', owner, contact_id: type === 'contacts' ? record.id : record.contact_id || null, contact: type === 'contacts' ? name : record.contact || '', due: due.toISOString(), extra: { workflowId: w.id, runId: run.id } });
      await note(`tarea «${title}» creada para ${owner}, vence el ${due.toISOString().slice(0, 10)}.`, 'task');
      return { ok: true, result: `Tarea «${title}» creada para ${owner}` };
    }
    case 'create_record': {
      const n = tok(c.name) || `Seguimiento de ${name}`;
      const contactId = type === 'contacts' ? record.id : record.contact_id || null;
      if (c.objectType === 'tasks') await store.createTask({ name: n, type: 'Tarea', status: 'todo', priority: 'medium', owner: record.owner && record.owner !== 'Sin asignar' ? record.owner : ME, contact_id: contactId, contact: type === 'contacts' ? name : record.contact || '', due: now.toISOString(), extra: { workflowId: w.id, runId: run.id } });
      else if (c.objectType === 'tickets') await store.createRecord('tickets', { name: n, status: 'new', priority: 'medium', pipeline: 'Pipeline de soporte', owner: ME, contact_id: contactId, source: 'Workflow' });
      else if (c.objectType === 'deals') await store.createRecord('deals', { name: n, amount: 0, pipeline: 'Pipeline de ventas', stage: 'appointment', owner: ME, contact_id: contactId, company_id: type === 'companies' ? record.id : record.company_id || null });
      else return { ok: false, result: 'La acción no indica qué tipo de registro crear' };
      const word = c.objectType === 'tasks' ? 'Tarea' : c.objectType === 'tickets' ? 'Ticket' : 'Negocio';
      await note(`${word.toLowerCase()} «${n}» creado.`, c.objectType === 'tasks' ? 'task' : 'system');
      return { ok: true, result: `${word} «${n}» creado` };
    }
    case 'notify_email': { const subject = tok(c.subject); await note(`notificación interna por correo para ${c.to || ME}: «${subject}».`, 'system', { notification: { kind: 'email', to: c.to || ME, subject, text: tok(c.body) } }); return { ok: true, result: `Notificación por correo para ${c.to || ME}: «${subject}»` }; }
    case 'notify_app': { const title = tok(c.title); await note(`notificación en la app a ${c.to || ME}: «${title}».`, 'system', { notification: { kind: 'app', to: c.to || ME, title, text: tok(c.text) } }); return { ok: true, result: `Notificación en la app a ${c.to || ME}: «${title}»` }; }
    case 'marketing_email': { await note(`correo de marketing «${c.email || ''}» enviado.`); return { ok: true, result: `Correo de marketing «${c.email || ''}» enviado a ${name}` }; }
    case 'edit_record': {
      if (!c.property) return { ok: false, result: 'La acción no indica qué propiedad editar' };
      await store.updateRecord(type, record.id, c.property, c.value);
      record[c.property] = c.value;
      await note(`propiedad «${c.property}» cambiada a «${c.value ?? ''}».`);
      return { ok: true, result: `${c.property} = ${c.value ?? ''}` };
    }
    case 'assign_owner': { const owner = c.owner || ME; await store.updateRecord(type, record.id, 'owner', owner); record.owner = owner; await note(`propietario asignado: ${owner}.`); return { ok: true, result: `Propietario: ${owner}` }; }
    case 'copy_property': {
      if (!c.from || !c.to || !c.toObject) return { ok: false, result: 'La acción no indica qué copiar' };
      const target = await store.associated(type, record, c.toObject);
      if (!target) return { ok: false, result: `No hay ${(OBJECT_LABEL[c.toObject] || 'registro').toLowerCase()} asociado` };
      const value = record[c.from] !== undefined ? record[c.from] : (record.extra || {})[c.from];
      await store.updateRecord(c.toObject, target.id, c.to, value ?? '');
      await note(`propiedad «${c.from}» copiada a «${c.to}» de ${(OBJECT_LABEL[c.toObject] || '').toLowerCase()} «${recordName(target)}».`);
      return { ok: true, result: `${c.from} → ${c.toObject}.${c.to}` };
    }
    case 'send_email': {
      const to = type === 'contacts' ? record.email : (record.email || (record.contact_email || ''));
      if (!to) return { ok: false, result: `El ${(OBJECT_LABEL[type] || 'registro').toLowerCase()} no tiene correo electrónico` };
      if (!store.sendEmail) return { ok: false, result: 'El envío de correo no está disponible en este ejecutor' };
      const subject = tok(c.subject).trim() || '(sin asunto)';
      const body = tok(c.body);
      const sent = await store.sendEmail({ to, subject, body, run, workflow: w });
      await note(`Correo enviado a ${name} (${to}): "${subject}" · enviado desde ${sent.from}${sent.via === 'gmail' ? ' por Gmail' : ''} · workflow «${w.name}».`, 'email', { from: sent.from, subject, via: sent.via || '', gmailId: sent.id || '', threadId: sent.threadId || '', body });
      return { ok: true, result: `Correo «${subject}» enviado a ${to}${sent.via === 'gmail' ? ' por Gmail' : ''}` };
    }
    default: return { ok: false, result: 'Acción desconocida' };
  }
}

// ---------- one run: from step_actual until the end or the next delay ----------
async function advance(store, run, now) {
  const log = Array.isArray(run.log) ? run.log.map((l) => ({ ...l })) : [];
  const push = (entry) => { const e = { at: iso(now), ...entry }; log.push(e); return e; };
  let jumps = Number(run.jumps) || 0;
  let step = Number(run.step_actual) || 0;
  const done = async (estado, next, error) => {
    if (error) push({ actionId: null, type: 'error', title: 'Inscripción detenida', ok: false, result: error });
    const final = estado || (error || log.some((l) => l.ok === false) ? 'failed' : 'completed');
    const saved = await store.finish(run, step, final, next, log, jumps);
    return saved ? final : 'cancelled';
  };
  const w = await store.workflow(run.workflow_id);
  if (!w) return done(null, null, 'El workflow ya no existe');
  const record = await store.record(run.record_type, run.record_id);
  if (!record) return done(null, null, `El ${(OBJECT_LABEL[run.record_type] || 'registro').toLowerCase()} ya no existe`);
  const note = (text, extra = {}) => store.note(run, { type: 'system', text, when: now, extra: { workflowId: w.id, runId: run.id, subject: `Workflow: ${w.name}`, ...extra } });
  const flat = flatten(w.actions);
  const resumed = log.find((l) => l.pending);
  if (resumed) { resumed.pending = false; resumed.result = `Retraso de ${resumed.wait || ''} completado`.replace('  ', ' '); resumed.resumedAt = iso(now); await note(`Workflow «${w.name}»: retraso de ${resumed.wait || ''} completado, continúa.`.replace('  ', ' ')); }
  let guard = 0;
  while (step < flat.length) {
    guard += 1;
    if (guard > MAX_STEPS) { push({ actionId: null, type: 'error', title: 'Bucle detenido', ok: false, result: `Se alcanzó el límite de ${MAX_STEPS} pasos` }); break; }
    const i = step;
    const a = flat[i];
    const title = ACTION_LABELS[a.type] || a.type;
    if (a.type === 'branch') {
      const ok = evaluate(record, a.config || {}, (key) => store.assoc(run.record_type, record, key));
      const text = (((a.config || {}).groups) || []).map((g) => (g.conditions || []).map(conditionText).join(' y ')).filter(Boolean).join(' · o · ');
      push({ actionId: a.id, type: a.type, title, ok: true, result: ok ? 'Condición cumplida → rama Sí' : 'Condición no cumplida → rama No' });
      await note(`Workflow «${w.name}»: rama if/then (${text || 'sin condiciones'}) → ${ok ? 'cumple, sigue por Sí' : 'no cumple, sigue por No'}.`);
      const kids = childrenOf(w.actions, a.id, ok ? 'yes' : 'no');
      step = kids.length ? flat.findIndex((x) => x.id === kids[0].id) : nextAfter(w.actions, flat, i);
      continue;
    }
    if (a.type === 'goto') {
      const target = w.actions.find((x) => x.id === (a.config || {}).target);
      if (!target) { push({ actionId: a.id, type: a.type, title, ok: false, result: 'Destino no encontrado' }); step = nextAfter(w.actions, flat, i); continue; }
      jumps += 1;
      if (jumps > MAX_JUMPS) { push({ actionId: a.id, type: a.type, title, ok: false, result: `Salto ignorado para evitar un bucle (máximo ${MAX_JUMPS})` }); step = nextAfter(w.actions, flat, i); continue; }
      push({ actionId: a.id, type: a.type, title, ok: true, result: `Salta a «${ACTION_LABELS[target.type] || target.type}»` });
      step = flat.findIndex((x) => x.id === target.id);
      continue;
    }
    if (a.type === 'delay') {
      const c = a.config || {};
      const until = new Date(now.getTime() + delayMs(c));
      push({ actionId: a.id, type: a.type, title, ok: true, pending: true, wait: delayText(c), until: until.toISOString(), result: `Esperando ${delayText(c)} · continúa el ${whenText(until)}` });
      await note(`Workflow «${w.name}»: espera ${delayText(c)}; continúa el ${whenText(until)}.`);
      step = nextAfter(w.actions, flat, i);
      return done('waiting', until.toISOString());
    }
    let res;
    try { res = await executeAction(store, w, run, a, record, now); } catch (e) { res = { ok: false, result: e.message || String(e) }; }
    push({ actionId: a.id, type: a.type, title, ok: Boolean(res && res.ok), result: (res && res.result) || '' });
    if (!res?.ok) await note(`Workflow «${w.name}»: ${title} falló: ${res?.result || 'Error desconocido'}.`);
    step = nextAfter(w.actions, flat, i);
  }
  const executed = log.filter((l) => !l.pending && l.type !== 'error' && l.type !== 'migration').length;
  const estado = log.some((l) => l.ok === false) ? 'failed' : 'completed';
  await note(`Workflow «${w.name}» ${estado === 'completed' ? 'completado' : 'terminado con errores'} (${executed} ${executed === 1 ? 'acción ejecutada' : 'acciones ejecutadas'}).`);
  return done(estado, null);
}

// Every due run: reserve it (skip locked), advance it, save it. Returns [{ id, status }].
export async function processDue(store, now = new Date()) {
  const results = [];
  for (const candidate of await store.due(now.toISOString())) {
    const run = await store.claim(candidate.id);
    if (!run) continue;
    try {
      results.push({ id: run.id, status: await advance(store, run, now) });
    } catch (error) {
      let status = 'error';
      try { const log = [...(Array.isArray(run.log) ? run.log : []), { at: iso(now), actionId: null, type: 'error', title: 'Inscripción detenida', ok: false, result: String(error.message || error) }]; await store.finish(run, run.step_actual, 'failed', null, log, run.jumps || 0); status = 'failed'; } catch { /* the claim expires in 5 minutes and the run is retried */ }
      results.push({ id: run.id, status, error: String(error.message || error) });
    }
  }
  return results;
}

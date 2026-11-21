// Pipeline rules and automation of tickets (Ajustes › Objetos › Tickets › Pipelines › «Reglas del pipeline» /
// «Automatizar»): the ticket counterpart of src/deal-close.js, used by the board of src/tickets.js (canMove /
// onMove) and by the settings editor. Every pipeline definition may carry, with the same shape as deals:
//   rules      = { noBack, lockClosed }
//   required   = { [statusKey]: ['Propietario del ticket', 'Prioridad', …] }   (labels of TICKET_REQUIRED_PROPS)
//   automation = { [statusKey]: { task, notify } }
// Stored with the pipeline (localStorage today; pipelines.extra jsonb once the tables migration applies).
// DOM-free on purpose: the callers show the toasts.
import { ticketPipelineDefs, addRecord, findRecord } from './data.js';

export const TICKET_PIPE_RULES = [
  ['noBack', 'Impedir retroceder de estado', 'Un ticket no puede volver a un estado anterior de su pipeline.'],
  ['lockClosed', 'Restringir el movimiento de tickets cerrados', 'Un ticket en un estado cerrado no se puede mover a otro estado.'],
];
export const TICKET_PIPE_AUTOS = [
  ['task', 'Crear una tarea de seguimiento para el propietario del ticket'],
  ['notify', 'Enviar una notificación al propietario del ticket'],
];
export const TICKET_REQUIRED_PROPS = [
  ['owner', 'Propietario del ticket'],
  ['priority', 'Prioridad'],
  ['source', 'Fuente'],
  ['contactId', 'Contacto asociado'],
  ['description', 'Descripción'],
];

export const ticketDefinition = (r, defs = ticketPipelineDefs()) => defs.find((d) => d.name === r.pipeline) || defs[0];
const statusOf = (d, key) => (d.stages || []).find((s) => s[0] === key);
export const isClosedStatus = (d, key) => (statusOf(d, key) || [])[2] === 'closed';
const labelOfStatus = (d, key) => (statusOf(d, key) || [key, key])[1];
const propKey = (p) => (TICKET_REQUIRED_PROPS.find(([k, l]) => l === p || k === p) || [p])[0];
const propLabel = (k) => (TICKET_REQUIRED_PROPS.find(([key]) => key === k) || [k, k])[1];
const empty = (v) => v === undefined || v === null || String(v).trim() === '' || v === 'Sin asignar';

// Property keys required to enter `to` in the pipeline `d`.
export const requiredTicketKeys = (d, to) => [...new Set((((d && d.required) || {})[to] || []).map(propKey))];
// Labels of the required properties the ticket still lacks for `to`.
export function missingTicketProps(r, to, d = ticketDefinition(r)) {
  return requiredTicketKeys(d, to).filter((k) => empty(r[k])).map(propLabel);
}
// Why a ticket may not move from `from` to `to` (null = allowed): structural rules first, then required properties.
export function ticketMoveRefusal(r, from, to) {
  const d = ticketDefinition(r);
  if (!d) return 'No se encontró el pipeline del ticket';
  const keys = d.stages.map((s) => s[0]);
  const i = keys.indexOf(from);
  const j = keys.indexOf(to);
  if (j < 0) return 'El estado no pertenece al pipeline del ticket';
  if (from === to) return null;
  const rules = d.rules || {};
  if (rules.lockClosed && isClosedStatus(d, from)) return `"${d.name}" no permite mover tickets cerrados`;
  if (rules.noBack && i >= 0 && j < i) return `"${d.name}" no permite retroceder de estado`;
  const missing = missingTicketProps(r, to, d);
  if (missing.length) return `Para pasar a "${labelOfStatus(d, to)}" completa: ${missing.join(', ')}`;
  return null;
}
// Runs the automation of the status the ticket just entered: a follow-up task for the owner (associated to the
// ticket and its contact) and/or a notification. Returns what happened so the caller can tell the person.
export function runTicketAutomation(r, to, label = '') {
  const d = ticketDefinition(r);
  const a = ((d && d.automation) || {})[to] || {};
  const current = findRecord('tickets', r.id) || r;
  const now = new Date();
  const statusLabel = label || labelOfStatus(d, to);
  const out = { task: null, notified: false };
  if (a.task) {
    out.task = addRecord('tasks', {
      name: `Seguimiento: ${current.name} (${statusLabel})`,
      type: 'Tarea',
      priority: current.priority || 'medium',
      status: 'todo',
      owner: current.owner,
      due: new Date(now.getTime() + 2 * 86400000).toISOString(),
      contact: current.contact || '',
      contactId: current.contactId || '',
      ticketId: current.id,
      lastActivity: now.toISOString(),
    }) || true;
  }
  if (a.notify) out.notified = true;
  return out;
}

// «Eventos» in the segment filter editor: criteria over the record's real timeline (the activities table:
// calls, e-mails, meetings, notes, tasks, messages) and over the Twilio call logs (call_logs) — last activity,
// last call / number of calls / recorded call / last call outcome, last e-mail / number of e-mails / opened or
// unopened e-mail. The same condition format and operators as the property filters (filter-ops.js), evaluated
// in memory against an index built from the activities, so the segment preview and sizes count the records
// the timeline really shows.
import { allActivities, ensureAllActivities, dbIsLive } from './data.js';
import { supabase } from './supabaseClient.js';
import { kindGroup, evalCondition, conditionValues } from './filter-ops.js';

export const EVENTS_ASSOC = '__event';
export const EVENTS_LABEL = 'Actividades, llamadas y correos (cronología)';
// Outcomes the call box and the record's «Registrar llamada» dialog offer (union, deduplicated).
export const CALL_OUTCOMES = ['Conectado', 'Sin respuesta', 'No contesta', 'Ocupado', 'Dejé mensaje de voz', 'Dejó mensaje de voz', 'Dejó mensaje en directo', 'Número equivocado'];
const YES_NO = [['Sí', 'Sí'], ['No', 'No']];
// [key, label, kind]: kind decides the operator family (date → «es de hace menos de (días)»…, number, bool, enum).
export const EVENT_GROUPS = [
  { title: 'Actividad', items: [['last_activity', 'Última actividad registrada', 'datetime'], ['activity_count', 'Número de actividades', 'number']] },
  { title: 'Llamadas', items: [['last_call', 'Última llamada', 'datetime'], ['calls_count', 'Número de llamadas', 'number'], ['call_recorded', 'Tiene llamada grabada', 'bool'], ['last_call_outcome', 'Último resultado de llamada', 'enum']] },
  { title: 'Correos', items: [['last_email', 'Último correo', 'datetime'], ['emails_count', 'Número de correos', 'number'], ['email_opened', 'Tiene correo abierto', 'bool'], ['email_unopened', 'Tiene correo sin abrir', 'bool']] },
];
const DEFS = Object.fromEntries(EVENT_GROUPS.flatMap((g) => g.items.map(([k, l, kind]) => [k, { key: k, label: l, kind }])));
export const eventPropertyGroups = () => EVENT_GROUPS.map((g) => ({ title: g.title, items: g.items.map(([k, l]) => [k, l]) }));
export const eventDef = (key) => DEFS[key] || null;
export const eventLabel = (key) => (DEFS[key] ? DEFS[key].label : key);
export const eventKindGroup = (key) => kindGroup(DEFS[key] ? DEFS[key].kind : 'text');
export function eventValueOptions(key) {
  const d = DEFS[key];
  if (!d) return null;
  if (d.kind === 'bool') return YES_NO;
  if (key === 'last_call_outcome') return CALL_OUTCOMES.map((o) => [o, o]);
  return null;
}

// ---------- the data: activities (already in data.js) + Twilio call logs ----------
let callLogRows = [];
let callLogsLoaded = false;
let loading = null;
// Tests inject call logs; the app loads them from call_logs when Supabase is live.
export const setCallLogs = (rows) => { callLogRows = Array.isArray(rows) ? rows : []; callLogsLoaded = true; };
export const callLogs = () => callLogRows;
async function loadCallLogs() {
  if (callLogsLoaded) return callLogRows;
  if (!dbIsLive() || !supabase) { callLogsLoaded = true; return callLogRows; }
  try {
    const { data, error } = await supabase.from('call_logs').select('call_sid,contact_id,started_at,recording_url,outcome,status,duration_sec').order('started_at', { ascending: false }).limit(2000);
    if (!error && Array.isArray(data)) callLogRows = data;
  } catch { /* the table is optional (supabase/twilio.sql) */ }
  callLogsLoaded = true;
  return callLogRows;
}
// Everything the event criteria need, loaded once (the activities of every record and the call logs).
export function ensureEventData() {
  if (!loading) loading = Promise.all([ensureAllActivities().catch(() => false), loadCallLogs()]).then(() => true);
  return loading;
}

// ---------- the index: one summary per record of a type ----------
const ENGAGEMENT = new Set(['note', 'email', 'call', 'meeting', 'task', 'message']);
const ms = (v) => { if (!v) return 0; const n = typeof v === 'number' ? v : new Date(v).getTime(); return Number.isFinite(n) ? n : 0; };
const incomingMail = (x) => x.direction === 'Entrante' || x.direction === 'in' || x.direction === 'inbound' || x.incoming === true;
const blank = () => ({ lastActivity: 0, activities: 0, lastCall: 0, calls: 0, recorded: false, lastCallOutcome: '', lastEmail: 0, emails: 0, opened: false, unopened: false, sids: new Set() });
export function eventIndex(type) {
  const map = new Map();
  const get = (id) => { const k = Number(id); if (!map.has(k)) map.set(k, blank()); return map.get(k); };
  allActivities().forEach((a) => {
    if (a.recordType !== type) return;
    const e = get(a.recordId);
    const when = ms(a.when);
    const x = a.extra || {};
    if (ENGAGEMENT.has(a.type)) { e.activities += 1; if (when > e.lastActivity) e.lastActivity = when; }
    if (a.type === 'call') {
      e.calls += 1;
      if (x.callSid) e.sids.add(x.callSid);
      if (x.recorded || x.recording) e.recorded = true;
      if (when >= e.lastCall) { e.lastCall = when; if (x.outcome) e.lastCallOutcome = x.outcome; }
    } else if (a.type === 'email') {
      e.emails += 1;
      if (when > e.lastEmail) e.lastEmail = when;
      if (x.opened || x.openedAt) e.opened = true;
      else if (!incomingMail(x)) e.unopened = true;
    }
  });
  // Twilio calls: a logged activity already carries the sid (only its recording / outcome enrich it); the rest count.
  if (type === 'contacts') {
    callLogRows.forEach((l) => {
      if (!l.contact_id) return;
      const e = get(l.contact_id);
      const when = ms(l.started_at);
      if (l.recording_url) e.recorded = true;
      if (l.call_sid && e.sids.has(l.call_sid)) { if (l.outcome && when >= e.lastCall) e.lastCallOutcome = l.outcome; return; }
      e.calls += 1;
      e.activities += 1;
      if (when > e.lastActivity) e.lastActivity = when;
      if (when >= e.lastCall) { e.lastCall = when; if (l.outcome) e.lastCallOutcome = l.outcome; }
    });
  }
  return map;
}
const NONE = blank();
export function eventValue(key, e = NONE) {
  switch (key) {
    case 'last_activity': return e.lastActivity ? new Date(e.lastActivity).toISOString() : '';
    case 'activity_count': return e.activities;
    case 'last_call': return e.lastCall ? new Date(e.lastCall).toISOString() : '';
    case 'calls_count': return e.calls;
    case 'call_recorded': return e.recorded ? 'Sí' : 'No';
    case 'last_call_outcome': return e.lastCallOutcome || '';
    case 'last_email': return e.lastEmail ? new Date(e.lastEmail).toISOString() : '';
    case 'emails_count': return e.emails;
    case 'email_opened': return e.opened ? 'Sí' : 'No';
    case 'email_unopened': return e.unopened ? 'Sí' : 'No';
    default: return '';
  }
}
// Does the record satisfy one event condition? `index` comes from eventIndex(type) (built once per evaluation).
export function eventConditionMatches(cond, r, index) {
  const d = DEFS[cond.key];
  if (!d) return true;
  const e = index.get(Number(r.id)) || NONE;
  const raw = eventValue(cond.key, e);
  const group = kindGroup(d.kind);
  const dateMs = group === 'date' && raw ? new Date(raw).getTime() : NaN;
  return evalCondition(cond, conditionValues(raw, raw === '' ? '' : String(raw), group, dateMs));
}
// A compiled matcher for every event condition of a filter set (one index for all of them).
export function eventMatcher(type, cond) {
  const index = eventIndex(type);
  return (r) => eventConditionMatches(cond, r, index);
}

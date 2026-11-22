// «Enviar más tarde» (e-mail composer): the queue of scheduled e-mails in localStorage (crm:scheduled-emails),
// the checker that sends the due ones (gmail-send through a real Google account; a simulated account marks them
// sent without sending), and the record's timeline entry that goes from «programado» to «enviado» (or
// «cancelado»). While an e-mail waits, the entry offers «Cancelar envío» and «Editar fecha».
import { addActivity, activitiesFor, updateActivity, formatDate } from './data.js';
import { accountById } from './connected-emails.js';
import { restoreDraftAttachments } from './compose-drafts.js';
import { sendMail } from './gmail.js';

export const SCHEDULED_KEY = 'crm:scheduled-emails';
const pad = (n) => String(n).padStart(2, '0');
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `se-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
// «23 nov 2026 a las 09:00» (local time).
export const whenText = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${formatDate(d)} a las ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// Value for an <input type="datetime-local"> in the browser's own time zone.
export const datetimeInput = (iso) => { const d = iso ? new Date(iso) : new Date(); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const timeZoneName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'hora local'; } catch { return 'hora local'; } };
// The presets of the original, in local time: tomorrow 08:00, tomorrow 13:00, next Monday 08:00.
export const SEND_LATER_PRESETS = [['tomorrow-am', 'Mañana por la mañana'], ['tomorrow-pm', 'Mañana por la tarde'], ['monday-am', 'Lunes por la mañana']];
export function presetSendAt(key, now = new Date()) {
  const d = new Date(now);
  d.setSeconds(0, 0);
  if (key === 'tomorrow-am') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
  else if (key === 'tomorrow-pm') { d.setDate(d.getDate() + 1); d.setHours(13, 0, 0, 0); }
  else if (key === 'monday-am') { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(8, 0, 0, 0); }
  else return null;
  return d.toISOString();
}

// ---------- the queue ----------
const read = () => { try { const v = JSON.parse(localStorage.getItem(SCHEDULED_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (list) => localStorage.setItem(SCHEDULED_KEY, JSON.stringify(list));
const emit = (item, action) => { if (typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent('crm:scheduled-email', { detail: { id: item.id, action, status: item.status, recordType: item.recordType, recordId: item.recordId } })); };
export const scheduledEmails = () => read();
export const scheduledById = (id) => read().find((x) => x.id === id) || null;
export const scheduledFor = (recordType, recordId) => read().filter((x) => x.recordType === recordType && String(x.recordId) === String(recordId));
export const pendingScheduled = (now = Date.now()) => read().filter((x) => x.status === 'scheduled' && new Date(x.sendAt).getTime() > now);
export const dueScheduled = (now = Date.now()) => read().filter((x) => x.status === 'scheduled' && new Date(x.sendAt).getTime() <= now);
function save(item) { const list = read(); const i = list.findIndex((x) => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); write(list); return item; }

// Queues an e-mail: { to[], toNames, cc[], bcc[], subject, html, text, fromAccountId, fromName, fromEmail, via,
// recordType, recordId, sendAt (ISO, in the future), templateId }.
export function scheduleEmail(fields) {
  const sendAt = new Date(fields.sendAt);
  if (Number.isNaN(sendAt.getTime())) throw new Error('Elige una fecha y hora válidas');
  if (sendAt.getTime() <= Date.now()) throw new Error('La fecha de envío debe ser posterior a ahora');
  const to = [].concat(fields.to || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!to.length) throw new Error('Añade al menos un destinatario');
  const item = {
    id: uuid(), status: 'scheduled', createdAt: new Date().toISOString(), sendAt: sendAt.toISOString(),
    attachments: fields.attachments || [],
    to, toNames: fields.toNames || to.join(', '), cc: [].concat(fields.cc || []).filter(Boolean), bcc: [].concat(fields.bcc || []).filter(Boolean),
    subject: String(fields.subject || '(sin asunto)'), html: String(fields.html || ''), text: String(fields.text || ''),
    fromAccountId: fields.fromAccountId || '', fromName: fields.fromName || '', fromEmail: fields.fromEmail || '', via: fields.via === 'gmail' ? 'gmail' : 'simulado',
    recordType: fields.recordType || '', recordId: fields.recordId || '', templateId: fields.templateId || null,
  };
  save(item);
  emit(item, 'scheduled');
  return item;
}
// The timeline entry while it waits («Correo programado para el …»), and its extra.
export const scheduledEntryText = (item) => `Correo programado para el ${whenText(item.sendAt)} a ${item.toNames}: "${item.subject}" · se enviará desde ${item.fromEmail || item.fromName}${item.via === 'gmail' ? ' por Gmail' : ' (cuenta simulada: no saldrá ningún correo)'}`;
export const scheduledEntryExtra = (item) => ({ scheduled: true, scheduledId: item.id, status: 'scheduled', sendAt: item.sendAt, subject: item.subject, to: item.to, via: item.via });
export function scheduledEntry(item, who = item.fromName) { return { type: 'email', when: Date.now(), who, text: scheduledEntryText(item), extra: scheduledEntryExtra(item) }; }
// Writes the entry on the record (when the composer has no timeline of its own to write to).
export function logScheduled(item) {
  if (!item.recordType || !item.recordId) return null;
  const ev = { ...scheduledEntry(item), recordType: item.recordType, recordId: item.recordId };
  addActivity(ev);
  return ev;
}
const findEntry = (item) => (item.recordType && item.recordId ? activitiesFor(item.recordType, item.recordId).find((a) => a.extra && a.extra.scheduledId === item.id) : null);
async function updateEntry(item, text, extra, when) {
  const a = findEntry(item);
  if (!a) return false;
  try { await updateActivity(a.id, { text, ...(when ? { when } : {}), extra }); } catch (e) { console.error('[correo programado] cronología', e); return false; }
  return true;
}
// «Cancelar envío»: nothing goes out; the entry says so.
export async function cancelScheduled(id) {
  const item = scheduledById(id);
  if (!item || item.status !== 'scheduled') return null;
  item.status = 'cancelled';
  item.cancelledAt = new Date().toISOString();
  save(item);
  await updateEntry(item, `Envío cancelado: el correo programado para el ${whenText(item.sendAt)} a ${item.toNames}: "${item.subject}" no se enviará.`, { status: 'cancelled', cancelledAt: item.cancelledAt });
  emit(item, 'cancelled');
  return item;
}
// «Editar fecha»: a new send time (also brings an errored one back to the queue).
export async function rescheduleEmail(id, sendAt) {
  const item = scheduledById(id);
  if (!item || !['scheduled', 'error'].includes(item.status)) return null;
  const d = new Date(sendAt);
  if (Number.isNaN(d.getTime())) throw new Error('Elige una fecha y hora válidas');
  if (d.getTime() <= Date.now()) throw new Error('La fecha de envío debe ser posterior a ahora');
  item.sendAt = d.toISOString();
  item.status = 'scheduled';
  delete item.lastError;
  save(item);
  await updateEntry(item, scheduledEntryText(item), { status: 'scheduled', sendAt: item.sendAt, error: null });
  emit(item, 'rescheduled');
  return item;
}

// ---------- the checker ----------
// Sends every due e-mail: through gmail-send when its account is a real, active Google account (the same path
// as the composer's immediate send); a simulated account marks it sent without sending anything. A failure
// leaves the item in error (the entry says why) until «Editar fecha» queues it again.
let sending = false;
export async function processDueEmails(now = Date.now()) {
  if (sending) return [];
  sending = true;
  const results = [];
  try {
    for (const due of dueScheduled(now)) {
      const item = scheduledById(due.id);
      if (!item || item.status !== 'scheduled') continue;
      item.status = 'sending';
      save(item);
      const account = item.fromAccountId ? accountById(item.fromAccountId) : null;
      try {
        if (account && account.real) {
          if (account.status !== 'active') throw new Error(`La cuenta ${account.email} no está activa`);
          const r = await sendMail({ accountId: account.id, to: item.to, cc: item.cc, bcc: item.bcc, subject: item.subject, html: item.html, text: item.text, fromName: item.fromName, attachments: restoreDraftAttachments(item.attachments) });
          Object.assign(item, { status: 'sent', sentAt: new Date().toISOString(), simulated: false, gmailId: (r && r.id) || '', threadId: (r && r.threadId) || '' });
          save(item);
          await updateEntry(item, `Correo enviado a ${item.toNames}: "${item.subject}" · enviado desde ${account.email} por Gmail (programado para el ${whenText(item.sendAt)})`, { status: 'sent', sentAt: item.sentAt, via: 'gmail', gmailId: item.gmailId, threadId: item.threadId }, Date.now());
        } else {
          Object.assign(item, { status: 'sent', sentAt: new Date().toISOString(), simulated: true });
          save(item);
          await updateEntry(item, `Simulación · no se envió ningún correo (programado para el ${whenText(item.sendAt)}) a ${item.toNames}: "${item.subject}" · desde ${item.fromEmail || item.fromName}`, { status: 'sent', sentAt: item.sentAt, via: 'simulado', simulated: true }, Date.now());
        }
        results.push({ id: item.id, status: 'sent', simulated: Boolean(item.simulated) });
      } catch (e) {
        Object.assign(item, { status: 'error', lastError: String(e.message || e) });
        save(item);
        await updateEntry(item, `No se pudo enviar el correo programado para el ${whenText(item.sendAt)} a ${item.toNames}: "${item.subject}" · ${item.lastError}. Usa «Editar fecha» para volver a intentarlo.`, { status: 'error', error: item.lastError });
        results.push({ id: item.id, status: 'error', error: item.lastError });
      }
      emit(item, item.status);
    }
  } finally { sending = false; }
  return results;
}
let timer = null;
let lastCheck = null;
export const lastCheckedAt = () => lastCheck;
export function startScheduledEmailChecker({ intervalMs = 60000 } = {}) {
  if (timer) return timer;
  const tick = () => { lastCheck = new Date().toISOString(); processDueEmails().catch((e) => console.error('[correos programados] verificador', e)); };
  tick();
  timer = setInterval(tick, intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}
export function stopScheduledEmailChecker() { if (timer) clearInterval(timer); timer = null; }
export const checkerRunning = () => Boolean(timer);

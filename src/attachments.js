// Attachments of a record («Archivos adjuntos» card of the record page, counted on the lists' preview panel): the
// real file goes to Supabase Storage (private bucket `attachments`, path <object>/<record id>/<uuid>-<name>) and
// its row to public.attachments (supabase/attachments.sql: name, path, size, content type, who, when; team RLS).
// Opening a file asks for a short-lived signed URL; removing it deletes the object and the row. Without a session,
// or while the migration is pending, uploads are off and the card says so instead of pretending (the old card kept
// only the name in localStorage and threw the bytes away). Tests inject a fake client and user.
import { supabase } from './supabaseClient.js';
import { currentUser, authEnabled } from './auth.js';

export const BUCKET = 'attachments';
export const MIGRATION = 'supabase/attachments.sql';
let client = supabase;
let fakeUser = null;
let rows = null; // every row once read (null before)
let ready = null; // the read in flight
let status = 'unknown'; // 'ok' | 'off' (no client / no session) | 'missing' (table or bucket not there yet)
export function setAttachmentsClient(c, user = null) { client = c; fakeUser = user; rows = null; ready = null; status = 'unknown'; }
const whoami = async () => fakeUser || (client && authEnabled() ? currentUser().catch(() => null) : null);
const emit = () => { if (typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent('crm:attachments')); };
const fromRow = (r) => ({ id: r.id, type: r.object_type, recordId: Number(r.record_id), name: r.name, path: r.path, size: Number(r.size) || 0, contentType: r.content_type || '', by: r.uploaded_by_name || '', when: r.created_at });

// Reads every attachment row once (small table); tolerant of a missing migration.
export function ensureAttachments() {
  if (ready) return ready;
  ready = (async () => {
    if (!client) { status = 'off'; rows = []; return rows; }
    const user = await whoami();
    if (!user) { status = 'off'; rows = []; return rows; }
    const { data, error } = await client.from('attachments').select('*').order('created_at', { ascending: false });
    if (error) { status = 'missing'; rows = []; console.warn(`[adjuntos] tabla attachments no disponible (migración ${MIGRATION} pendiente):`, error.message || error); return rows; }
    status = 'ok';
    rows = (data || []).map(fromRow);
    return rows;
  })();
  return ready;
}
export const attachmentsStatus = () => status;
export const attachmentsEnabled = () => status === 'ok';
export const attachmentsFor = (type, id) => (rows || []).filter((a) => a.type === type && a.recordId === Number(id));
export const attachmentCount = (type, id) => attachmentsFor(type, id).length;
const safeName = (name) => String(name || 'archivo').replace(/[^\w.\-()[\] ]+/g, '_').slice(0, 120);
const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
export function formatSize(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// Uploads the bytes, then records the row; a refused row removes the object again so nothing is left orphaned.
export async function uploadAttachment(type, id, file) {
  await ensureAttachments();
  if (status !== 'ok') throw new Error(status === 'off' ? 'Inicia sesión para subir archivos.' : `Los adjuntos necesitan la migración ${MIGRATION}.`);
  const user = await whoami();
  const path = `${type}/${Number(id)}/${uuid()}-${safeName(file.name)}`;
  const { error: upErr } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upErr) throw new Error(upErr.message || String(upErr));
  const row = { object_type: type, record_id: Number(id), name: file.name || 'archivo', path, size: Number(file.size) || 0, content_type: file.type || '', uploaded_by: (user && user.id) || null, uploaded_by_name: (user && ((user.user_metadata && (user.user_metadata.name || user.user_metadata.full_name)) || user.email)) || '' };
  const { data, error } = await client.from('attachments').insert(row).select('*').single();
  if (error) {
    try { await client.storage.from(BUCKET).remove([path]); } catch { /* best effort */ }
    throw new Error(error.message || String(error));
  }
  const att = fromRow(data);
  rows.unshift(att);
  emit();
  return att;
}
// Deletes the object from the bucket and then its row.
export async function removeAttachment(att) {
  await ensureAttachments();
  const { error: sErr } = await client.storage.from(BUCKET).remove([att.path]);
  if (sErr) throw new Error(sErr.message || String(sErr));
  const { error } = await client.from('attachments').delete().eq('id', att.id);
  if (error) throw new Error(error.message || String(error));
  rows = (rows || []).filter((a) => String(a.id) !== String(att.id));
  emit();
}
// A signed URL (one hour) that downloads the file with its own name.
export async function attachmentUrl(att, seconds = 3600) {
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(att.path, seconds, { download: att.name });
  if (error || !data || !data.signedUrl) throw new Error((error && error.message) || 'No se pudo generar el enlace.');
  return data.signedUrl;
}

// Record composer drafts only; inbox conversation drafts have their own store.
import { encodeAttachments } from './mail-attachments.js';
export const draftKey = (type, id) => type && id !== '' && id != null ? `crm:drafts:${type}:${id}` : null;
export function getComposeDraft(type, id) {
  const key = draftKey(type, id);
  if (!key) return null;
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}
export async function saveComposeDraft(type, id, fields) {
  const key = draftKey(type, id);
  if (!key) throw new Error('No se pudo identificar el registro del borrador');
  const { attachments = [], ...values } = fields;
  const draft = { ...values, attachments: await encodeAttachments(attachments), updatedAt: new Date().toISOString() };
  // Let quota/security errors reach the composer; never acknowledge a failed write.
  localStorage.setItem(key, JSON.stringify(draft));
  return draft;
}
export function removeComposeDraft(type, id) {
  const key = draftKey(type, id);
  if (key) localStorage.removeItem(key);
}
export function restoreDraftAttachments(attachments = []) {
  return attachments.map(({ name, type, content }) => new window.File([
    Uint8Array.from(window.atob(content), (c) => c.charCodeAt(0)),
  ], name, { type }));
}

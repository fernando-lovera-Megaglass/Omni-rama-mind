// Invitations: the e-mails allowed to create an account (table public.invitations, supabase/invitations.sql).
// Inviting saves the e-mail and sends it a magic link; revoking deletes the row. Without Supabase (local
// mode, tests) the list lives in this browser and no e-mail is sent.
import { supabase } from './supabaseClient.js';
import { signInWithOtp } from './auth.js';

let client = supabase;
export const invitationsEnabled = () => Boolean(client);
export function setInvitationsClient(c) { client = c; }
const LS_KEY = 'crm:invitations';
const read = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const write = (list) => localStorage.setItem(LS_KEY, JSON.stringify(list));
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
const isDuplicate = (error) => Boolean(error) && /duplicate|unique|23505/i.test(`${error.message || ''} ${error.code || ''}`);

export async function listInvitations() {
  if (!client) return read().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const { data, error } = await client.from('invitations').select('email,invited_by,created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({ email: normalizeEmail(r.email), invitedBy: r.invited_by || null, createdAt: r.created_at }));
}
// Saves the invitation and (with Supabase) sends the magic link. Returns { email, existed, sent, sendError }.
export async function invite(email, { sendLink = true } = {}) {
  const e = normalizeEmail(email);
  if (!EMAIL_RE.test(e)) throw new Error('Escribe un correo válido, por ejemplo nombre@empresa.com.');
  if (!client) {
    const list = read();
    const existed = list.some((x) => x.email === e);
    if (!existed) { list.unshift({ email: e, createdAt: new Date().toISOString(), local: true }); write(list); }
    return { email: e, existed, sent: false, sendError: null };
  }
  const { error } = await client.from('invitations').insert({ email: e });
  if (error && !isDuplicate(error)) throw error;
  let sent = false;
  let sendError = null;
  if (sendLink) {
    try { await signInWithOtp(e); sent = true; } catch (err) { sendError = err; }
  }
  return { email: e, existed: Boolean(error), sent, sendError };
}
export async function revoke(email) {
  const e = normalizeEmail(email);
  if (!client) { write(read().filter((x) => x.email !== e)); return; }
  const { error } = await client.from('invitations').delete().eq('email', e);
  if (error) throw error;
}

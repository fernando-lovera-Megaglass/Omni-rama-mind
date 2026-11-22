// Gmail → Bandeja de entrada: «Sincronizar ahora» calls the gmail-sync Edge Function (it stores the latest
// INBOX messages in inbox_messages) and then imports the pending rows as conversations of the inbox — one
// conversation per Gmail thread, the sender matched with a contact by e-mail, each message logged on the
// contact's timeline through conversations-data (same path as any other incoming message). Replies from the
// inbox find the Gmail thread of a conversation here.
import { supabase } from './supabaseClient.js';
import { allContacts } from './data.js';
import { createConversation, sendMessage, conversationById } from './conversations-data.js';
import { callFunction, clientId } from './gmail.js';

let client = supabase;
export const setGmailInboxClient = (c) => { client = c; };
let threads = []; // imported inbox_messages rows (thread ↔ conversation)

const norm = (e) => String(e || '').trim().toLowerCase();
export function matchContact(email) {
  const e = norm(email);
  if (!e) return null;
  const c = allContacts().find((x) => [x.email, x.alt_email].some((v) => norm(v) === e));
  return c ? Number(c.id) : null;
}
const threadConversation = (threadId) => { const t = threads.filter((x) => x.thread_id === threadId && x.conversation_id).sort((a, b) => new Date(b.received_at) - new Date(a.received_at))[0]; return t ? t.conversation_id : null; };

export async function loadThreads() {
  if (!client || !clientId()) { threads = []; return threads; }
  try {
    const { data, error } = await client.from('inbox_messages').select('id, account_id, thread_id, rfc_message_id, from_email, from_name, subject, received_at, conversation_id').not('conversation_id', 'is', null).order('received_at', { ascending: false }).limit(500);
    threads = !error && Array.isArray(data) ? data : [];
  } catch { threads = []; }
  return threads;
}
export const ready = loadThreads();

// Pending rows (imported_at null) → conversations + messages (+ contact timeline via conversations-data).
export async function importPending() {
  if (!client) return { count: 0, conversations: [] };
  const { data, error } = await client.from('inbox_messages').select('id, account_id, gmail_id, thread_id, rfc_message_id, from_email, from_name, to_email, subject, snippet, body_text, received_at, contact_id, conversation_id').is('imported_at', null).order('received_at', { ascending: true });
  if (error) throw new Error(error.message);
  const list = data || [];
  const created = [];
  for (const m of list) {
    const contactId = m.contact_id || matchContact(m.from_email);
    const author = m.from_name || m.from_email || 'Remitente';
    const body = String(m.body_text || m.snippet || '').trim() || '(sin contenido)';
    const when = m.received_at || new Date().toISOString();
    let convId = m.thread_id ? threadConversation(m.thread_id) : null;
    if (convId && conversationById(convId)) {
      sendMessage(convId, { body, direction: 'in', author, when });
    } else {
      const c = createConversation({ contactId, channel: 'email', subject: m.subject || '(sin asunto)', body, direction: 'in', author, when });
      convId = c ? c.id : null;
      if (c) created.push(c);
    }
    threads.unshift({ ...m, conversation_id: convId });
    const { error: e2 } = await client.from('inbox_messages').update({ conversation_id: convId, imported_at: new Date().toISOString(), contact_id: contactId || null }).eq('id', m.id);
    if (e2) console.error('[gmail] no se pudo marcar el mensaje como importado', e2);
  }
  return { count: list.length, conversations: created };
}

// «Sincronizar ahora»: fetch from Gmail (Edge Function) and import what is new.
export async function syncInbox({ accountId } = {}) {
  const r = await callFunction('gmail-sync', { body: { accountId, max: 50 } });
  const imported = await importPending();
  return { fetched: Number(r.fetched) || 0, inserted: Number(r.inserted) || 0, matched: Number(r.matched) || 0, imported: imported.count, conversations: imported.conversations, account: r.account || '' };
}

// The Gmail thread behind a conversation of the inbox (to reply in the same thread), or null.
export function gmailThreadFor(conversationId) {
  const t = threads.filter((x) => x.conversation_id === conversationId).sort((a, b) => new Date(b.received_at) - new Date(a.received_at))[0];
  if (!t) return null;
  return { accountId: t.account_id, threadId: t.thread_id, rfcMessageId: t.rfc_message_id || '', fromEmail: t.from_email || '', subject: t.subject || '' };
}
export const gmailThreads = () => threads.slice();
// Tests inject imported threads directly (no Supabase).
export const setThreads = (rows) => { threads = Array.isArray(rows) ? rows.slice() : []; };

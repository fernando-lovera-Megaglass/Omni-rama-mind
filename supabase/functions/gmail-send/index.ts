// gmail-send: sends an e-mail through the Gmail API with the user's connected account.
// POST { to, subject, html, text?, cc?, bcc?, threadId?, inReplyTo?, references?, accountId?, fromName? }
// (Authorization: Bearer <Supabase JWT>) → { ok, id, threadId, from }
import { handle, userFromRequest, serviceClient, accountFor, withAccount, gmail, buildMime, b64urlEncode, markStatus, json, fail } from '../_shared/gmail.ts';

const list = (v: unknown): string[] => (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map((s) => String(s).trim()).filter(Boolean);

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') return fail('Usa POST', 405);
  const user = await userFromRequest(req);
  const b = await req.json().catch(() => ({}));
  const to = list(b.to);
  if (!to.length) return fail('Falta el destinatario (to).');
  const service = serviceClient();
  const account = await accountFor(service, user.id, b.accountId);
  if (!account) return fail('No hay ninguna cuenta de Gmail conectada: conéctala en Ajustes › Correo.', 404, { code: 'no_account' });
  const raw = buildMime({
    from: b.fromName ? `${String(b.fromName).replace(/["<>]/g, '')} <${account.email}>` : account.email,
    to,
    cc: list(b.cc),
    bcc: list(b.bcc),
    subject: String(b.subject || '(sin asunto)'),
    html: b.html ? String(b.html) : undefined,
    text: b.text ? String(b.text) : undefined,
    inReplyTo: b.inReplyTo ? String(b.inReplyTo) : undefined,
    references: b.references ? String(b.references) : undefined,
  });
  const res = await withAccount(service, account, (token) => gmail(token, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: b64urlEncode(raw), ...(b.threadId ? { threadId: String(b.threadId) } : {}) }) }));
  await markStatus(service, account.id, 'active');
  return json({ ok: true, id: res.id, threadId: res.threadId, labelIds: res.labelIds, from: account.email });
}));

// Smoke test for the real Gmail integration: the migration (connected_accounts / tokens / inbox_messages with
// owner-only RLS), the five Edge Functions and their scopes, the notice when VITE_GOOGLE_CLIENT_ID is missing
// (the simulated account stays available), and — with a fake Supabase client, no network — the OAuth start
// (gmail-auth-url → Google), the callback result, the real account in Ajustes › Correo with its real status,
// a real send from the composer logged on the timeline, the inbox sync imported as conversations with the
// contact's timeline entry, the reply in the same Gmail thread and the disconnection.
// Run: node scripts/smoke-gmail.mjs
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const log = (...a) => console.log('[gmail]', ...a);
const fail = (msg) => { console.error(`[gmail] FAIL: ${msg}`); process.exit(1); };
const read = (p) => readFileSync(resolve(app, p), 'utf8');

// ===== 1) Migration, Edge Functions, configuration files =====
const sql = read('supabase/gmail.sql');
if (!/create table if not exists public\.connected_accounts\s*\(/.test(sql) || !/user_id uuid not null references auth\.users/.test(sql) || !/provider text/.test(sql) || !/email text not null/.test(sql)) fail('connected_accounts table not defined as expected');
if (!/create table if not exists public\.connected_account_tokens/.test(sql) || !/refresh_token text/.test(sql) || !/expires_at timestamptz/.test(sql)) fail('tokens table missing');
if (!/create table if not exists public\.inbox_messages/.test(sql) || !/gmail_id text not null/.test(sql) || !/unique \(account_id, gmail_id\)/.test(sql)) fail('inbox_messages table missing');
for (const t of ['connected_accounts', 'connected_account_tokens', 'inbox_messages']) if (!sql.includes(`alter table public.${t} enable row level security`)) fail(`RLS not enabled on ${t}`);
if ((sql.match(/auth\.uid\(\) = user_id/g) || []).length < 6) fail('owner-only policies missing');
if (/create policy "[^"]*" on public\.connected_account_tokens/.test(sql)) fail('the tokens table must have no client policies');
if (/anon/.test(sql)) fail('no anon access on the Gmail tables');
const fns = ['gmail-auth-url', 'gmail-oauth-callback', 'gmail-send', 'gmail-sync', 'gmail-account'];
fns.forEach((f) => { if (!existsSync(resolve(app, `supabase/functions/${f}/index.ts`))) fail(`Edge Function ${f} missing`); });
const shared = read('supabase/functions/_shared/gmail.ts');
['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email'].forEach((s) => { if (!shared.includes(s)) fail(`scope ${s} missing`); });
if (!shared.includes("requireEnv('GOOGLE_CLIENT_SECRET')") || !/oauth2\.googleapis\.com\/token/.test(shared) || !/gmail\.googleapis\.com\/gmail\/v1\/users\/me/.test(shared)) fail('shared helpers incomplete');
if (!read('supabase/functions/gmail-auth-url/index.ts').includes('accounts.google.com/o/oauth2/v2/auth') || !read('supabase/functions/gmail-oauth-callback/index.ts').includes('connected_account_tokens') || !read('supabase/functions/gmail-send/index.ts').includes('messages/send') || !read('supabase/functions/gmail-sync/index.ts').includes('labelIds=INBOX') || !read('supabase/functions/gmail-account/index.ts').includes("'profile'")) fail('functions do not call the expected Google endpoints');
const srcFiles = readdirSync(resolve(app, 'src')).filter((f) => f.endsWith('.js'));
if (srcFiles.some((f) => /VITE_GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_SECRET\s*=/.test(read(`src/${f}`)))) fail('the client secret must never be read in the browser code');
if (!read('src/gmail.js').includes('VITE_GOOGLE_CLIENT_ID') || !read('.env.example').includes('VITE_GOOGLE_CLIENT_ID=')) fail('VITE_GOOGLE_CLIENT_ID not wired');
if (!/\[functions\.gmail-oauth-callback\]\s*\nverify_jwt = false/.test(read('supabase/config.toml'))) fail('config.toml must disable JWT verification for the callback');
const docs = read('docs/gmail-setup.md');
if (!docs.includes('functions/v1/gmail-oauth-callback') || !docs.includes('VITE_GOOGLE_CLIENT_ID') || !docs.includes('GOOGLE_CLIENT_SECRET') || !docs.includes('supabase/gmail.sql')) fail('docs/gmail-setup.md incomplete');
log('migration (3 tables, owner-only RLS, tokens without client policies), 5 Edge Functions with the 3 scopes, config.toml, .env.example and docs OK');

// ===== DOM helpers =====
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); } };
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.FileReader = dom.window.FileReader;
  globalThis.URL = dom.window.URL;
  globalThis.Blob = dom.window.Blob;
  dom.window.confirm = () => true;
  dom.window.prompt = (q, d) => d;
  return dom;
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const toastText = () => text($('toast'));
const SETTINGS = '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main class="content content--settings" id="settings-root"></main><div id="scrim"></div></body>';

// A fake Supabase client: functions.invoke records the calls and answers canned data; from() serves the tables.
function makeFake() {
  const fake = { calls: [], updates: [], accounts: [], pending: [], threads: [], responses: {} };
  fake.functions = { invoke: async (name, opts = {}) => { const method = (opts.method || 'POST').toUpperCase(); fake.calls.push({ name, method, body: opts.body }); const r = fake.responses[`${name}:${method}`] !== undefined ? fake.responses[`${name}:${method}`] : fake.responses[name]; if (r instanceof Error) return { data: null, error: r }; return { data: r === undefined ? { ok: true } : r, error: null }; } };
  fake.from = (table) => {
    const st = { op: 'select', filters: [], payload: null };
    const run = () => {
      if (table === 'connected_accounts') return { data: fake.accounts.map((a) => ({ ...a })), error: null };
      if (table === 'inbox_messages') {
        if (st.op === 'update') { const f = st.filters.find((x) => x[1] === 'id'); fake.updates.push({ id: f ? f[2] : null, ...st.payload }); return { data: null, error: null }; }
        if (st.filters.some((x) => x[0] === 'is' && x[1] === 'imported_at')) return { data: fake.pending.splice(0), error: null };
        return { data: fake.threads.slice(), error: null };
      }
      return { data: [], error: null };
    };
    const self = {
      select() { st.op = 'select'; return self; }, update(p) { st.op = 'update'; st.payload = p; return self; }, insert(p) { st.op = 'insert'; st.payload = p; return self; }, delete() { st.op = 'delete'; return self; },
      eq(k, v) { st.filters.push(['eq', k, v]); return self; }, is(k, v) { st.filters.push(['is', k, v]); return self; }, not(k, o, v) { st.filters.push(['not', k, o, v]); return self; }, in(k, v) { st.filters.push(['in', k, v]); return self; }, ilike(k, v) { st.filters.push(['ilike', k, v]); return self; },
      order() { return self; }, limit() { return self; }, maybeSingle() { return self; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return self;
  };
  return fake;
}

// ===== 2) Without VITE_GOOGLE_CLIENT_ID: the notice, nothing breaks, the simulated account still works =====
delete process.env.VITE_GOOGLE_CLIENT_ID;
useDom(SETTINGS, 'http://localhost/settings/#prefs-general');
const G = await import(resolve(here, '../src/gmail.js'));
if (G.gmailConfigured() || !G.missingConfig().includes('VITE_GOOGLE_CLIENT_ID') || !G.configNotice().includes('docs/gmail-setup.md')) fail('without the client id the module must report what is missing');
await G.startConnect().then(() => fail('startConnect must refuse without credentials')).catch((e) => { if (!e.message.includes('VITE_GOOGLE_CLIENT_ID')) fail(`startConnect error: ${e.message}`); });
const E = await import(resolve(here, '../src/connected-emails.js'));
await E.ready;
await import(resolve(here, '../src/settings.js'));
await wait(10);
click(q('[data-general-tab="correo"]'));
await wait(5);
const rows = () => qa('#cem-rows tr[data-account]');
const openGoogle = async (email) => { click(q('[data-cem="connect"]')); await wait(5); click(q('[data-w="to-email"]')); input($('w-email'), email); click(q('[data-w="detect"]')); click(q('[data-w="use"][data-provider="gmail"]')); };
await openGoogle('maria@gmail.com');
const notice = $('w-google-missing');
if (!notice || !text(notice).includes('Falta configurar las credenciales de Google') || !text(notice).includes('VITE_GOOGLE_CLIENT_ID') || !text(notice).includes('docs/gmail-setup.md')) fail('notice missing');
const realBtn = qa('.cw .bmodal__foot button').find((b) => text(b) === 'Continuar con Google');
if (!realBtn || !realBtn.disabled) fail('the real button must be disabled without credentials');
if (!q('.cw [data-w="allow"]') || text(q('.cw [data-w="allow"]')) !== 'Usar cuenta simulada (demo)') fail('the simulated account must stay available');
const before = rows().length;
click(q('.cw [data-w="allow"]'));
if ($('cem-wizard').classList.contains('is-open') || rows().length !== before + 1 || !text(rows()[rows().length - 1]).includes('maria@gmail.com') || rows()[rows().length - 1].dataset.real) fail('simulated Google account not connected');
log('without VITE_GOOGLE_CLIENT_ID: clear notice, real button disabled, simulated account still connects');

// ===== 3) With credentials and a fake Supabase client: OAuth start, callback, real account and status =====
process.env.VITE_GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const fake = makeFake();
fake.accounts = [{ id: 'acc-1', email: 'real@gmail.com', provider: 'gmail', status: 'active', last_error: null, last_checked_at: null, last_synced_at: null, created_at: '2020-01-01T00:00:00.000Z' }];
fake.responses['gmail-auth-url'] = { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=signed', redirectUri: 'https://x.supabase.co/functions/v1/gmail-oauth-callback' };
fake.responses['gmail-account:GET'] = { accounts: [{ id: 'acc-1', email: 'real@gmail.com', status: 'active', lastError: null, messagesTotal: 120, checkedAt: new Date().toISOString() }] };
G.setGmailClient(fake);
const GI = await import(resolve(here, '../src/gmail-inbox.js'));
GI.setGmailInboxClient(fake);
let navigated = '';
G.setGmailNavigator((url) => { navigated = url; });
if (!G.gmailConfigured()) fail('with the client id and a client the module must be configured');
await G.reloadAccounts();
await GI.loadThreads();
await wait(5);
const realRow = q('#cem-rows tr[data-real="1"]');
if (!realRow || !text(realRow).includes('real@gmail.com') || !text(realRow).includes('Conectada con Google') || !text(realRow.querySelector('.cem__status')).includes('Activado')) fail(`real account row: ${realRow && text(realRow)}`);
if (qa('#cem-rows tr[data-real="1"] .menu__item').map(text).join('|') !== 'Comprobar estado|Editar firma|Desactivar|Desconectar') fail(`real account menu: ${qa('#cem-rows tr[data-real="1"] .menu__item').map(text).join('|')}`);
const acc = E.accountById('acc-1');
if (!acc || !acc.real || acc.provider !== 'gmail' || !E.activeAccounts().some((a) => a.id === 'acc-1')) fail('the real account must be a sender');
// real status: gmail.users.getProfile through gmail-account (error, then active again)
fake.responses['gmail-account:GET'] = { accounts: [{ id: 'acc-1', email: 'real@gmail.com', status: 'error', lastError: 'Token caducado', checkedAt: new Date().toISOString() }] };
click(q('#cem-rows tr[data-real="1"] [data-cem="gmail-status"]'));
await wait(10);
if (!fake.calls.some((c) => c.name === 'gmail-account' && c.method === 'GET')) fail('status check must call gmail-account');
const errRow = q('#cem-rows tr[data-real="1"]');
if (!text(errRow.querySelector('.cem__status')).includes('Error de conexión') || !text(errRow.querySelector('.cem__err')).includes('Token caducado') || !toastText().includes('Token caducado')) fail(`error state not shown: ${text(errRow)}`);
if (E.activeAccounts().some((a) => a.id === 'acc-1')) fail('an account in error must not be a sender');
fake.responses['gmail-account:GET'] = { accounts: [{ id: 'acc-1', email: 'real@gmail.com', status: 'active', lastError: null, checkedAt: new Date().toISOString() }] };
click(q('#cem-rows tr[data-real="1"] [data-cem="gmail-status"]'));
await wait(10);
if (!text(q('#cem-rows tr[data-real="1"] .cem__status')).includes('Activado')) fail('active state not restored');
log('real account listed with its badge and real status (Activado → Error de conexión → Activado)');
// OAuth start from the wizard
await openGoogle('otra@gmail.com');
const goBtn = q('.cw [data-w="google-oauth"]');
if (!goBtn || text(goBtn) !== 'Continuar con Google' || $('w-google-missing')) fail('with credentials the real button must show');
click(goBtn);
await wait(10);
const authCall = fake.calls.find((c) => c.name === 'gmail-auth-url');
if (!authCall || authCall.body.returnTo !== location.href || authCall.body.email !== 'otra@gmail.com') fail(`gmail-auth-url call: ${JSON.stringify(authCall)}`);
if (!navigated.startsWith('https://accounts.google.com/o/oauth2/v2/auth')) fail(`should navigate to Google, got ${navigated}`);
click(q('#cem-wizard [data-w="close"]'));
const cb = G.consumeCallbackParams({ search: '?gmail=connected&email=real%40gmail.com&keep=1', pathname: '/settings/', hash: '#prefs-general' });
if (!cb || cb.status !== 'connected' || cb.email !== 'real@gmail.com' || !location.href.endsWith('/settings/?keep=1#prefs-general')) fail(`callback params: ${JSON.stringify(cb)} ${location.href}`);
if (G.consumeCallbackParams({ search: '?keep=1', pathname: '/settings/', hash: '' }) !== null) fail('no gmail param → null');
log('OAuth start: gmail-auth-url called with returnTo + login hint, browser sent to Google; callback params consumed');

// ===== 4) Composer: a real sender sends through gmail-send and logs «por Gmail» on the timeline =====
const C = await import(resolve(here, '../src/compose.js'));
const events = [];
const usageData = await import(resolve(here, '../src/templates-data.js'));
await usageData.ready;
const usageId = usageData.templates()[0].id;
fake.responses['gmail-send'] = { ok: true, id: 'msg-1', threadId: 'thr-1', from: 'real@gmail.com' };
C.openCompose({ to: 'Ana Ruiz', email: 'ana.ruiz@cristalesnorte.com', contactId: 1, onSent: (ev) => events.push(ev) });
await wait(10);
if (!text(q('#compose .compose__frombtn')).includes('real@gmail.com')) fail(`the real account must be the sender: ${text(q('#compose .compose__frombtn'))}`);
click(q(`[data-tpl="${usageId}"]`));
input(q('#cmp-subject'), 'Prueba desde Omni');
click(q('#compose [data-cm="send"]'));
await wait(20);
const sendCall = fake.calls.find((c) => c.name === 'gmail-send');
if (!sendCall || sendCall.body.accountId !== 'acc-1' || sendCall.body.to.join() !== 'ana.ruiz@cristalesnorte.com' || sendCall.body.subject !== 'Prueba desde Omni' || !/<div class="sig/.test(sendCall.body.html)) fail(`gmail-send call: ${JSON.stringify(sendCall && sendCall.body).slice(0, 300)}`);
if (!events.length || events[0].type !== 'email' || events[0].extra.via !== 'gmail' || events[0].extra.gmailId !== 'msg-1' || !events[0].text.includes('enviado desde real@gmail.com por Gmail')) fail(`timeline event: ${JSON.stringify(events[0])}`);
if (!$('compose').hidden || !toastText().includes('por Gmail')) fail('composer should close with the Gmail toast');
if (usageData.templateById(usageId).uses !== 1) fail('confirmed Gmail send counts once');
// a failure keeps the draft
fake.responses['gmail-send'] = new Error('Gmail respondió 403');
C.openCompose({ to: 'Ana Ruiz', email: 'ana.ruiz@cristalesnorte.com', contactId: 1, onSent: (ev) => events.push(ev) });
await wait(10);
click(q(`[data-tpl="${usageId}"]`));
click(q('#compose [data-cm="send"]'));
await wait(20);
if (usageData.templateById(usageId).uses !== 1) fail('failed Gmail send must not count');
if ($('compose').hidden || !toastText().includes('No se pudo enviar por Gmail') || events.length !== 1 || q('#compose [data-cm="send"]').disabled) fail('a failed send must keep the composer open');
click(q('#compose [data-cm="close"]'));
log('composer: real send through gmail-send (to, subject, html + signature), timeline «por Gmail», failure keeps the draft');

// ===== 5) Inbox sync: gmail-sync + import as conversations + contact timeline + reply in the thread =====
const data = await import(resolve(here, '../src/data.js'));
const Conv = await import(resolve(here, '../src/conversations-data.js'));
await Conv.ready;
const contact = data.allContacts().find((c) => c.email && c.email.includes('@'));
const iso = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();
fake.responses['gmail-sync'] = { ok: true, fetched: 2, inserted: 2, matched: 0, account: 'real@gmail.com' };
fake.pending = [
  { id: 'im-1', account_id: 'acc-1', gmail_id: 'g1', thread_id: 't-1', rfc_message_id: '<m1@mail.gmail.com>', from_email: contact.email.toUpperCase(), from_name: contact.name, to_email: 'real@gmail.com', subject: 'Presupuesto de fachada', snippet: '', body_text: 'Hola, ¿me pasan presupuesto de la fachada?', received_at: iso(60), contact_id: null, conversation_id: null },
  { id: 'im-2', account_id: 'acc-1', gmail_id: 'g2', thread_id: 't-2', rfc_message_id: '<m2@mail.gmail.com>', from_email: 'alguien@desconocido.example', from_name: 'Alguien', to_email: 'real@gmail.com', subject: 'Newsletter', snippet: 'Novedades', body_text: '', received_at: iso(30), contact_id: null, conversation_id: null },
];
const countBefore = Conv.conversations().length;
const r = await GI.syncInbox();
if (r.fetched !== 2 || r.imported !== 2 || r.conversations.length !== 2 || Conv.conversations().length !== countBefore + 2) fail(`sync result: ${JSON.stringify({ ...r, conversations: r.conversations.length })}`);
const conv = Conv.conversations().find((c) => c.subject === 'Presupuesto de fachada');
if (!conv || conv.contactId !== Number(contact.id) || conv.channel !== 'email' || !conv.unread || conv.lastMessage.direction !== 'in' || conv.lastMessage.author !== contact.name) fail(`imported conversation: ${JSON.stringify(conv)}`);
const other = Conv.conversations().find((c) => c.subject === 'Newsletter');
if (!other || other.contactId || other.lastMessage.body !== 'Novedades') fail('unknown sender → conversation without contact, snippet as body');
const upd = fake.updates.find((u) => u.id === 'im-1');
if (!upd || upd.conversation_id !== conv.id || !upd.imported_at || upd.contact_id !== Number(contact.id)) fail(`inbox_messages not marked as imported: ${JSON.stringify(upd)}`);
const tl = data.activitiesFor('contacts', contact.id).find((a) => a.type === 'email' && a.text.includes('Mensaje recibido por Correo'));
if (!tl || !tl.text.includes('presupuesto de la fachada') || tl.extra.direction !== 'Entrante') fail('the contact timeline must get the received e-mail');
const th = GI.gmailThreadFor(conv.id);
if (!th || th.threadId !== 't-1' || th.rfcMessageId !== '<m1@mail.gmail.com>' || th.fromEmail !== contact.email.toUpperCase() || th.accountId !== 'acc-1') fail(`thread mapping: ${JSON.stringify(th)}`);
// a later message of the same thread lands in the same conversation
fake.pending = [{ id: 'im-3', account_id: 'acc-1', gmail_id: 'g3', thread_id: 't-1', rfc_message_id: '<m3@mail.gmail.com>', from_email: contact.email, from_name: contact.name, to_email: 'real@gmail.com', subject: 'Re: Presupuesto de fachada', snippet: '', body_text: '¿Alguna novedad?', received_at: iso(5), contact_id: Number(contact.id), conversation_id: null }];
fake.responses['gmail-sync'] = { ok: true, fetched: 3, inserted: 1, matched: 1, account: 'real@gmail.com' };
const r2 = await GI.syncInbox();
if (r2.imported !== 1 || r2.conversations.length !== 0 || Conv.messagesOf(conv.id).length !== 2 || Conv.conversations().length !== countBefore + 2) fail('same thread must append to the existing conversation');
log(`inbox sync: 2 messages → 2 conversations (contact matched by e-mail, ${contact.name}), timeline entry, thread message appended`);
// the inbox page: Sincronizar button, reply goes through gmail-send in the same thread
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="inbox-root"></main><div id="scrim"></div></body>', `http://localhost/inbox/?id=${encodeURIComponent(conv.id)}`);
await import(resolve(here, '../src/inbox.js'));
await wait(10);
if (q('.inbox__sync').hidden || text(q('.inbox__sync')) !== 'Sincronizar Gmail') fail('sync button must show with a Gmail account');
if (!q('.inbox__item.is-active') || q('.inbox__item.is-active').dataset.id !== conv.id) fail('imported conversation not selected');
fake.responses['gmail-send'] = { ok: true, id: 'msg-2', threadId: 't-1' };
$('inbox-reply').elements.body.value = 'Te lo envío hoy mismo.';
$('inbox-reply').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(20);
const reply = fake.calls.filter((c) => c.name === 'gmail-send').pop();
if (!reply || reply.body.threadId !== 't-1' || reply.body.inReplyTo !== '<m3@mail.gmail.com>' || reply.body.to.join() !== contact.email || reply.body.subject !== 'Re: Presupuesto de fachada' || !reply.body.html.includes('Te lo envío hoy mismo.')) fail(`reply call: ${JSON.stringify(reply && reply.body)}`);
if (Conv.messagesOf(conv.id).length !== 3 || !toastText().includes('Respuesta enviada por Gmail')) fail('reply must be stored and confirmed');
fake.responses['gmail-sync'] = { ok: true, fetched: 3, inserted: 0, matched: 0, account: 'real@gmail.com' };
click(q('.inbox__sync'));
await wait(20);
if (!toastText().includes('No hay correos nuevos en Gmail') || q('.inbox__sync').disabled) fail(`sync button: ${toastText()}`);
log('inbox page: «Sincronizar Gmail» button, reply sent in the Gmail thread (In-Reply-To), nothing new → message');

// ===== 6) Disconnect =====
fake.responses['gmail-account:POST'] = { ok: true, id: 'acc-1' };
await G.disconnect('acc-1');
const disc = fake.calls.filter((c) => c.name === 'gmail-account' && c.method === 'POST').pop();
if (!disc || disc.body.action !== 'disconnect' || disc.body.accountId !== 'acc-1' || G.gmailAccounts().length || E.accounts().some((a) => a.real)) fail('disconnect must drop the account');
log('disconnect: gmail-account {action: disconnect} and the account disappears');
log('OK');

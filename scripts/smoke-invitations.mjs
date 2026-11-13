// Invitation-only access. Part 1 (always, stub clients): Configuración › Usuarios y equipos › Invitaciones
// lists, invites (validates the e-mail, inserts, sends the magic link), resends and revokes.
// Part 2 (live, when run with node --env-file=.env and app/.supabase-mgmt-token exists): invites a test
// e-mail through SQL, checks that signInWithOtp works for it, that a sign-up and a magic link for a
// NON-invited e-mail are refused by the database trigger, and cleans up (also when a check fails).
// Run: node --env-file=.env scripts/smoke-invitations.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[invitations]', ...a);
const fail = (msg) => { console.error(`[invitations] FAIL: ${msg}`); process.exit(1); };
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i += 1) await tick(); };

// ---------- part 1: the settings page with stub clients ----------
const mem = {};
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/settings/#account-users' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; } };
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
dom.window.confirm = () => true;

const authStub = { calls: [], auth: {
  getSession: async () => ({ data: { session: { user: { email: 'fernando-lovera@megaglass.us' } } }, error: null }),
  signInWithOtp: async ({ email }) => { authStub.calls.push(['otp', email]); return { data: {}, error: null }; },
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signOut: async () => ({ error: null }),
} };
const db = { rows: [{ email: 'fernando-lovera@megaglass.us', invited_by: null, created_at: '2026-11-13T10:00:00Z' }], calls: [] };
const dbStub = { from: (table) => {
  if (table !== 'invitations') fail(`unexpected table ${table}`);
  return {
    select: () => ({ order: async () => ({ data: db.rows.slice(), error: null }) }),
    insert: async (row) => { db.calls.push(['insert', row.email]); if (db.rows.some((r) => r.email === row.email)) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "invitations_pkey"' } }; db.rows.unshift({ email: row.email, invited_by: 'u1', created_at: new Date().toISOString() }); return { error: null }; },
    delete: () => ({ eq: async (k, v) => { db.calls.push(['delete', v]); db.rows = db.rows.filter((r) => r.email !== v); return { error: null }; } }),
  };
} };
const A = await import(resolve(here, '../src/auth.js'));
const I = await import(resolve(here, '../src/invitations.js'));
A.setAuthClient(authStub);
I.setInvitationsClient(dbStub);
await import(resolve(here, '../src/settings.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const toastText = () => $('toast')?.textContent || '';
const rowsText = () => [...document.querySelectorAll('.obody tbody tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
await settle();
log('section:', document.querySelector('.snav__item.is-active')?.textContent, '| tab:', document.querySelector('.otabs__tabs .is-active')?.textContent, '| sample users table gone:', !document.querySelector('.utable'), '| "Crear usuario" gone:', !document.querySelector('[data-act="new-user"]'));
log('rows:', rowsText().join(' || '));
if (document.querySelector('.utable') || document.querySelector('[data-act="new-user"]')) fail('the sample users must be replaced');
if (rowsText().length !== 1 || !/fernando-lovera@megaglass.us/.test(rowsText()[0]) || !/Aceptada · tú/.test(rowsText()[0])) fail('the signed-in user shows as accepted');
if (!document.querySelector('[data-invite-rm="fernando-lovera@megaglass.us"]').disabled) fail('own invitation cannot be revoked');
// invalid e-mail
const form = $('invite-form');
form.elements.email.value = 'no-es-correo';
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await settle();
log('invalid e-mail → toast:', toastText());
if (!/correo válido/.test(toastText()) || db.calls.length) fail('invalid e-mail must not reach the database');
// invite
$('invite-form').elements.email.value = ' Nueva.Persona@Ejemplo.com ';
$('invite-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await settle();
log('invite → toast:', toastText(), '| db calls:', JSON.stringify(db.calls), '| otp calls:', JSON.stringify(authStub.calls), '| rows:', rowsText().length);
if (!/Invitación enviada a nueva.persona@ejemplo.com/.test(toastText()) || !db.calls.some((c) => c[0] === 'insert' && c[1] === 'nueva.persona@ejemplo.com') || !authStub.calls.some((c) => c[0] === 'otp' && c[1] === 'nueva.persona@ejemplo.com')) fail('invite should insert and send the link');
if (rowsText().length !== 2 || !/Pendiente/.test(rowsText().find((t) => /nueva.persona/.test(t)) || '')) fail('new invitation listed as pending');
// duplicate
$('invite-form').elements.email.value = 'nueva.persona@ejemplo.com';
$('invite-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await settle();
log('duplicate → toast:', toastText());
if (!/ya tenía invitación/.test(toastText())) fail('duplicate invitation message');
// resend and revoke
click(document.querySelector('[data-invite-resend="nueva.persona@ejemplo.com"]'));
await settle();
if (!/Enlace enviado/.test(toastText())) fail('resend');
click(document.querySelector('[data-invite-rm="nueva.persona@ejemplo.com"]'));
await settle();
log('revoke → toast:', toastText(), '| rows:', rowsText().length, '| tab label:', document.querySelector('.otabs__tabs .is-active')?.textContent);
if (!/revocada/.test(toastText()) || !db.calls.some((c) => c[0] === 'delete' && c[1] === 'nueva.persona@ejemplo.com') || rowsText().length !== 1) fail('revoke');
// messages for the trigger error
log('trigger message mapping:', A.authMessage({ message: 'Database error saving new user', code: 'unexpected_failure' }), '|', A.isNotInvitedError(new Error('Solo usuarios invitados: este correo no tiene invitación')));
if (A.authMessage({ message: 'Database error saving new user' }) !== A.INVITE_MESSAGE || !A.isNotInvitedError(new Error('Solo usuarios invitados: este correo no tiene invitación'))) fail('trigger message mapping');
log('[part 1] OK');

// ---------- part 2: live against Supabase (needs .env and the management token) ----------
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const { runSql, hasMgmtToken } = await import(resolve(here, './mgmt-sql.mjs'));
if (!url || !key || !hasMgmtToken()) {
  log('[part 2] omitida: faltan VITE_SUPABASE_URL/ANON_KEY (usa node --env-file=.env) o app/.supabase-mgmt-token.');
  console.log('[invitations] OK');
  process.exit(0);
}
const { createClient } = await import('@supabase/supabase-js');
const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
// Supabase only accepts addresses whose domain can receive mail (example.com and made-up domains are
// refused as invalid), so the test uses throw-away mailboxes on the account's own domain; the one magic
// link it triggers bounces there. Both the invitation and the created user are removed at the end.
const stamp = Date.now().toString(36);
const INVITED = `invitado.prueba.${stamp}@megaglass.us`;
const DIRECT = `directo.prueba.${stamp}@megaglass.us`;
const INTRUDER = `no.invitado.${stamp}@megaglass.us`;
const cleanup = async () => {
  await runSql(`delete from auth.users where lower(email) in ('${INVITED}', '${DIRECT}', '${INTRUDER}'); delete from public.invitations where lower(email::text) in ('${INVITED}', '${DIRECT}', '${INTRUDER}');`);
};
const check = (ok, msg) => { if (!ok) throw new Error(msg); };
let part2Error = null;
try {
  const trg = await runSql("select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'require_invitation_before_insert'");
  log('trigger installed:', Array.isArray(trg) && trg.length === 1);
  check(Array.isArray(trg) && trg.length === 1, 'run supabase/invitations.sql first (node scripts/apply-migration.mjs supabase/invitations.sql)');
  const seeded = await runSql("select count(*)::int as n from public.invitations where lower(email::text) = 'fernando-lovera@megaglass.us'");
  check(seeded[0] && seeded[0].n === 1, 'seed row for fernando-lovera@megaglass.us missing');
  // anon can neither read nor insert invitations
  const { data: anonRead } = await anon.from('invitations').select('email');
  const { error: anonInsErr } = await anon.from('invitations').insert({ email: INTRUDER });
  log('anon read →', `${(anonRead || []).length} rows`, '| anon insert →', anonInsErr ? `refused (${anonInsErr.message})` : 'allowed');
  check(!(anonRead || []).length && anonInsErr, 'anon must not read or insert invitations');
  // invite the test e-mails (as an authenticated admin would, here through SQL)
  await runSql(`insert into public.invitations (email) values ('${INVITED}'), ('${DIRECT}') on conflict (email) do nothing`);
  // the Auth API for the invited e-mail: the magic link is accepted (the built-in mail service allows very
  // few e-mails per hour, so "email rate limit exceeded" only means the quota, not the trigger)
  const { error: otpOk } = await anon.auth.signInWithOtp({ email: INVITED, options: { shouldCreateUser: true } });
  log('magic link for invited →', otpOk ? `not sent: ${otpOk.message}` : 'sent');
  check(!otpOk || /rate limit/i.test(otpOk.message), `signInWithOtp for an invited e-mail failed: ${otpOk && otpOk.message}`);
  // the trigger itself, straight in the database: an invited e-mail may be inserted into auth.users, a
  // non-invited one raises the exception (what the Auth API runs into, whatever the path)
  const newUser = (email) => `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${email}', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '')`;
  await runSql(newUser(DIRECT));
  const created = await runSql(`select count(*)::int as n from auth.users where lower(email) = '${DIRECT}'`);
  log('trigger lets an invited e-mail in:', created[0].n === 1);
  check(created[0].n === 1, 'the invited user should exist in auth.users after the insert');
  let directError = '';
  try { await runSql(newUser(INTRUDER)); } catch (e) { directError = e.message; }
  log('trigger refuses a non-invited e-mail:', /Solo usuarios invitados/.test(directError) ? 'yes' : `NO (${directError.slice(0, 120)})`);
  check(/Solo usuarios invitados: este correo no tiene invitaci/.test(directError), 'the trigger must raise its message for a non-invited e-mail');
  // not invited: sign-up and magic link must be refused by the trigger (no e-mail is ever sent)
  const { error: signUpErr } = await anon.auth.signUp({ email: INTRUDER, password: 'Secreta123!' });
  log('sign-up for NOT invited →', signUpErr ? `refused: ${signUpErr.message}` : 'ACCEPTED');
  check(signUpErr && A.isNotInvitedError(signUpErr), `sign-up of a non-invited e-mail must be refused with the trigger message (got: ${signUpErr && signUpErr.message})`);
  const { error: otpErr } = await anon.auth.signInWithOtp({ email: INTRUDER, options: { shouldCreateUser: true } });
  log('magic link for NOT invited →', otpErr ? `refused: ${otpErr.message}` : 'ACCEPTED');
  check(otpErr && (A.isNotInvitedError(otpErr) || /rate limit/i.test(otpErr.message)), 'magic link for a non-invited e-mail must be refused');
  const intruders = await runSql(`select count(*)::int as n from auth.users where lower(email) = '${INTRUDER}'`);
  check(intruders[0].n === 0, 'a non-invited user must not exist in auth.users');
  log('[part 2] OK');
} catch (e) {
  part2Error = e;
} finally {
  await cleanup();
  log('cleanup done (test invitation and test user removed)');
}
if (part2Error) fail(part2Error.message);
console.log('[invitations] OK');
process.exit(0); // the Supabase client keeps timers alive; nothing else to wait for

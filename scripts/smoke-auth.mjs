// DOM smoke test for Supabase Auth: the auth helpers (site root, safe return address, route protection),
// the login page (original first paint, password step, errors, register, reset, recovery) and the account
// menu of the shell (signed-in user, sign out). A stub client stands in for Supabase, and navigations are
// recorded instead of leaving the page. Run: node scripts/smoke-auth.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[auth]', ...a);
const fail = (msg) => { console.error(`[auth] FAIL: ${msg}`); process.exit(1); };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const boot = (url, html) => {
  const dom = new JSDOM(html, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
  globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  dom.window.scrollTo = () => {};
  return dom;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

// a stand-in for supabase.auth
const stub = {
  session: null, calls: [], cb: null,
  auth: {
    getSession: async () => ({ data: { session: stub.session }, error: null }),
    signInWithPassword: async ({ email, password }) => { stub.calls.push(['signIn', email]); if (password !== 'secreta1') return { data: {}, error: { message: 'Invalid login credentials' } }; stub.session = { user: { email } }; return { data: { session: stub.session }, error: null }; },
    signUp: async ({ email }) => { stub.calls.push(['signUp', email]); if (email === 'existe@ejemplo.com') return { data: {}, error: { message: 'User already registered' } }; return { data: { user: { email }, session: null }, error: null }; },
    resetPasswordForEmail: async (email) => { stub.calls.push(['reset', email]); return { error: null }; },
    updateUser: async ({ password }) => { stub.calls.push(['update', password]); return { data: {}, error: null }; },
    signOut: async () => { stub.calls.push(['signOut']); stub.session = null; return { error: null }; },
    onAuthStateChange: (cb) => { stub.cb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
  },
};

// ---------- helpers and route protection ----------
let dom = boot('http://localhost/contacts/record/?id=3', '<!doctype html><body></body>');
const A = await import(resolve(here, '../src/auth.js'));
const nav = [];
A.setNavigator((h) => nav.push(h));
log('enabled without Supabase:', A.authEnabled(), '| siteRoot:', A.siteRoot('/contacts/record/'), A.siteRoot('/crm/app/data/import/index.html'), A.siteRoot('/'), '| safeNext:', A.safeNext('https://evil.example/x', 'contacts/'), A.safeNext('/deals/?x=1'));
if (A.authEnabled() || A.siteRoot('/contacts/record/') !== '/' || A.siteRoot('/crm/app/data/import/index.html') !== '/crm/app/' || A.safeNext('https://evil.example/x', 'contacts/') !== 'contacts/' || A.safeNext('/deals/?x=1') !== '/deals/?x=1') fail('helpers');
if ((await A.requireSession()) !== null) fail('without Supabase requireSession is a no-op');
A.setAuthClient(stub);
const guarded = await Promise.race([A.requireSession(), new Promise((r) => setTimeout(() => r('pending'), 50))]);
log('guard without session →', guarded, '| navigated to:', nav[0]);
if (guarded !== 'pending' || !nav[0] || !nav[0].startsWith('/?next=%2Fcontacts%2Frecord%2F%3Fid%3D3') || !nav[0].includes('reason=expired')) fail('route protection should send to the login page with the return address');
stub.session = { user: { email: 'ana@ejemplo.com' } };
const s = await A.requireSession();
if (!s || s.user.email !== 'ana@ejemplo.com') fail('with a session requireSession resolves');
log('messages:', A.authMessage({ message: 'Invalid login credentials' }), '|', A.authMessage({ message: 'User already registered' }), '|', A.authMessage(new Error('Failed to fetch')));
stub.session = null;
nav.length = 0;

// ---------- login page ----------
const html = readFileSync(resolve(here, '../index.html'), 'utf8').replace(/<script[^>]*><\/script>/, '');
dom = boot('http://localhost/?next=%2Fdeals%2F', html);
const M = await import(resolve(here, '../src/main.js'));
const $ = (id) => document.getElementById(id);
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const submit = async () => { $('login-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick(); };
const alertText = () => `${document.querySelector('.alert__title').textContent} · ${document.querySelector('.alert__body').textContent}`;
await tick();
log('first paint: title', document.querySelector('.login__title').textContent, '| password field:', Boolean($('password')), '| alert:', alertText(), '| button:', $('submit').textContent);
if ($('password') || document.querySelector('.login__title').textContent !== 'Iniciar sesión' || $('submit').textContent !== 'Continuar' || !/caducó/.test(alertText())) fail('first paint must stay as the original');
$('username').value = 'ana@ejemplo.com';
await submit();
log('after Continuar: password field:', Boolean($('password')), '| button:', $('submit').textContent, '| links:', $('form-links')?.textContent.trim());
if (!$('password') || $('submit').textContent !== 'Iniciar sesión' || !$('to-reset')) fail('the password step should appear');
$('password').value = 'mala';
await submit();
log('wrong password →', alertText());
if (!/incorrectos/.test(alertText()) || nav.length) fail('wrong password message');
$('password').value = 'secreta1';
await submit();
log('right password → navigated to:', nav[0]);
if (nav[0] !== '/deals/') fail('sign in should go to the return address');
nav.length = 0; stub.session = null;
// register
click(document.querySelector('.login__alt a'));
log('register mode:', document.querySelector('.login__title').textContent, '| fields:', Boolean($('password')), Boolean($('password2')), '| button:', $('submit').textContent);
if (document.querySelector('.login__title').textContent !== 'Crear una cuenta' || !$('password2')) fail('register mode');
$('username').value = 'nueva@ejemplo.com'; $('password').value = 'secreta1'; $('password2').value = 'otra';
await submit();
if (!/no coinciden/.test(alertText())) fail('password mismatch');
$('password2').value = 'secreta1';
$('username').value = 'existe@ejemplo.com';
await submit();
log('existing e-mail →', alertText());
if (!/Ya existe/.test(alertText())) fail('existing account message');
$('username').value = 'nueva@ejemplo.com'; $('password').value = 'secreta1'; $('password2').value = 'secreta1';
await submit();
log('new account →', alertText(), '| mode now:', M.state.mode, '| alert class:', document.querySelector('.alert').className);
if (!/Revisa tu correo/.test(alertText()) || M.state.mode !== 'login' || !stub.calls.some((c) => c[0] === 'signUp' && c[1] === 'nueva@ejemplo.com')) fail('sign-up flow with e-mail confirmation');
// reset
$('username').value = 'ana@ejemplo.com';
await submit();
click($('to-reset'));
log('reset mode:', document.querySelector('.login__title').textContent, '| button:', $('submit').textContent);
await submit();
log('reset sent →', alertText());
if (!/Enlace enviado/.test(alertText()) || !stub.calls.some((c) => c[0] === 'reset' && c[1] === 'ana@ejemplo.com')) fail('reset flow');
// recovery link (event from the client)
stub.cb('PASSWORD_RECOVERY', { user: { email: 'ana@ejemplo.com' } });
log('recovery mode:', document.querySelector('.login__title').textContent, '| e-mail hidden:', $('username').hidden);
if (M.state.mode !== 'recovery' || !$('username').hidden) fail('recovery mode');
$('password').value = 'nueva123'; $('password2').value = 'nueva123';
await submit();
log('recovery saved → update called:', stub.calls.some((c) => c[0] === 'update' && c[1] === 'nueva123'), '| navigated:', nav[0]);
if (!stub.calls.some((c) => c[0] === 'update') || nav[0] !== '/deals/') fail('recovery flow');
nav.length = 0;

// ---------- shell: signed-in user and sign out ----------
stub.session = { user: { email: 'ana@ejemplo.com', user_metadata: { name: 'Ana Ejemplo' } } };
dom = boot('http://localhost/contacts/', '<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>');
const S = await import(resolve(here, '../src/shell.js'));
S.mountShell({ root: '../', active: 'crm', sub: 'Contactos' });
await tick();
log('account menu:', $('account-avatar').textContent, $('account-name').textContent, '|', $('account-email').textContent, '| signout button:', Boolean($('signout')));
if ($('account-avatar').textContent !== 'A' || $('account-name').textContent !== 'Ana Ejemplo' || $('account-email').textContent !== 'ana@ejemplo.com') fail('account menu should show the signed-in user');
click($('signout'));
await tick(); await tick();
log('after sign out: calls', stub.calls.filter((c) => c[0] === 'signOut').length, '| navigated to:', nav[0], '| session:', stub.session);
if (!stub.calls.some((c) => c[0] === 'signOut') || nav[0] !== '/' || stub.session) fail('sign out');
// signed out elsewhere → back to the login page
nav.length = 0;
stub.cb('SIGNED_OUT', null);
if (nav[0] !== '/') fail('SIGNED_OUT event should leave to the login page');
console.log('[auth] OK');

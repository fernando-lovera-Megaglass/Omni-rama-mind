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
  session: null, calls: [], cb: null, factors: [], aal: 'aal1',
  auth: {
    mfa: {
      listFactors: async () => ({ data: { all: stub.factors, totp: stub.factors.filter((f) => f.status === 'verified') } }),
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: stub.aal, nextLevel: stub.factors.some((f) => f.status === 'verified') ? 'aal2' : 'aal1' } }),
      enroll: async () => { const factor = { id: 'totp-1', factor_type: 'totp', status: 'unverified' }; stub.factors.push(factor); return { data: { ...factor, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg"/>', uri: 'otpauth://totp/CRM?secret=TEST' } } }; },
      challengeAndVerify: async ({ factorId, code }) => {
        stub.calls.push(['verify', factorId]);
        if (code !== '123456') return { error: { message: 'Invalid TOTP code' } };
        stub.factors.find((f) => f.id === factorId).status = 'verified'; stub.aal = 'aal2'; return { data: {} };
      },
      unenroll: async ({ factorId }) => { stub.calls.push(['unenroll', factorId]); stub.factors = stub.factors.filter((f) => f.id !== factorId); return { data: {} }; },
    },
    getSession: async () => ({ data: { session: stub.session }, error: null }),
    signInWithPassword: async ({ email, password }) => { stub.calls.push(['signIn', email]); if (password !== 'secreta1') return { data: {}, error: { message: 'Invalid login credentials' } }; stub.session = { user: { email } }; return { data: { session: stub.session }, error: null }; },
    signInWithOtp: async ({ email }) => { stub.calls.push(['otp', email]); if (email === 'intruso@ejemplo.com') return { data: {}, error: { message: 'Database error saving new user', code: 'unexpected_failure' } }; return { data: {}, error: null }; },
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
// magic link instead of a public sign-up
click(document.querySelector('.login__alt a'));
log('magic mode:', document.querySelector('.login__title').textContent, '| button:', $('submit').textContent, '| password fields:', Boolean($('password')), Boolean($('password2')), '| "crear una cuenta" anywhere:', /crear una cuenta/i.test(document.body.textContent));
if (document.querySelector('.login__title').textContent !== 'Entrar con enlace mágico' || $('password') || $('password2') || /crear una cuenta/i.test(document.body.textContent)) fail('magic-link mode without sign-up');
$('username').value = 'invitada@ejemplo.com';
await submit();
log('magic link sent →', alertText());
if (!/Revisa tu correo/.test(alertText()) || !stub.calls.some((c) => c[0] === 'otp' && c[1] === 'invitada@ejemplo.com')) fail('magic-link flow');
$('username').value = 'intruso@ejemplo.com';
await submit();
log('not invited →', alertText());
if (!/no tiene invitación/.test(alertText())) fail('not-invited message');
click($('to-login'));
if (M.state.mode !== 'login') fail('back to the password mode');
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

// ---------- MFA enrollment, sign-in gate and removal ----------
const { mountMfaSettings, ssoUnavailable } = await import(resolve(here, '../src/mfa-settings.js'));
const panel = document.createElement('div'); document.body.append(panel);
await mountMfaSettings(panel);
click(panel.querySelector('[data-action="enroll"]')); await tick(); await tick();
if (!panel.querySelector('img')?.src.startsWith('data:image/svg+xml') || !panel.querySelector('[data-uri]').href.startsWith('otpauth:') || (await A.mfaStatus()).active) fail('unverified QR enrollment');
const mfaSubmit = async (code) => {
  panel.querySelector('input').value = code;
  panel.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
};
await mfaSubmit('000000');
if ((await A.mfaStatus()).active || !panel.querySelector('[data-error]').textContent) fail('bad enrollment code');
await mfaSubmit('123456');
if (!(await A.mfaStatus()).active || panel.querySelector('img') || panel.querySelector('[data-status]').textContent !== 'Activo') fail('verified enrollment state');
stub.aal = 'aal1'; nav.length = 0;
stub.session = { user: { email: 'ana@ejemplo.com' } };
const blockedMfa = await Promise.race([A.requireSession(), new Promise((r) => setTimeout(() => r('pending'), 20))]);
if (blockedMfa !== 'pending' || !nav[0]?.includes('reason=mfa')) fail('AAL1 route must be blocked');
nav.length = 0;
M.state.mode = 'login'; M.state.step = 2; M.render();
$('username').value = 'ana@ejemplo.com'; $('password').value = 'secreta1';
await submit();
if (nav.length || M.state.mode !== 'mfa' || !$('mfa-code')) fail('password must lead to second-factor challenge');
$('mfa-code').value = '000000'; await submit();
if (nav.length) fail('bad second factor must not navigate');
$('mfa-code').value = '123456'; await submit();
if (nav[0] !== '/deals/' || stub.aal !== 'aal2') fail('valid second factor');
await mfaSubmit('000000');
if (!(await A.mfaStatus()).active || stub.calls.some((c) => c[0] === 'unenroll')) fail('removal requires valid code');
await mfaSubmit('123456');
if ((await A.mfaStatus()).active || panel.querySelector('[data-status]').textContent !== 'Inactivo') fail('remove factor');
click(panel.querySelector('[data-action="enroll"]')); await tick(); await tick();
click(panel.querySelector('[data-action="cancel"]')); await tick(); await tick();
if (stub.factors.length || panel.querySelector('img')) fail('cancel must remove pending enrollment and secret');
const reloadedPanel = document.createElement('div'); document.body.append(reloadedPanel);
await mountMfaSettings(reloadedPanel);
if (reloadedPanel.querySelector('[data-status]').textContent !== 'Inactivo') fail('reload reads real factor state');
if (!/disabled/.test(ssoUnavailable) || !/Próximamente/.test(ssoUnavailable)) fail('SSO unavailable');
nav.length = 0;
log('MFA enrollment, invalid codes, AAL gate, login challenge, removal and SSO OK');

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

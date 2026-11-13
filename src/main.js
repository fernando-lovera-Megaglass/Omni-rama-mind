// Login page: the cookie banner (as before) and Supabase Auth for invited users only. The first paint is
// the original's first step (only the e-mail); "Continuar" reveals the password, as the original does.
// Modes: login (e-mail → password), magic (a sign-in link by e-mail, also for invited people without a
// password yet), reset ("¿Olvidaste tu contraseña?") and recovery (the link of the reset e-mail). There is
// no public sign-up: an e-mail without invitation is refused by the database and told to ask the
// administrator. Without Supabase the page stays open: "Continuar" enters directly.
import { authEnabled, getSession, signIn, signInWithOtp, resetPassword, updatePassword, onAuthChange, authMessage, isNotInvitedError, INVITE_MESSAGE, safeNext, goTo } from './auth.js';

const banner = document.getElementById('cookie-banner');
const hideBanner = () => {
  banner.hidden = true;
};
const showBanner = () => {
  banner.hidden = false;
};

['cookie-close', 'cookie-accept', 'cookie-decline', 'cookie-settings'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', hideBanner);
});

const footerCookies = document.getElementById('footer-cookies');
if (footerCookies) {
  footerCookies.addEventListener('click', (e) => {
    e.preventDefault();
    showBanner();
    window.scrollTo({ top: 0 });
  });
}

const $ = (id) => document.getElementById(id);
const input = $('username');
const submit = $('submit');
const form = $('login-form');
const title = document.querySelector('.login__title');
const alt = document.querySelector('.login__alt');
const alertBox = document.querySelector('.alert');
const params = new URLSearchParams(location.search);
const next = safeNext(params.get('next'), './contacts/');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const state = { mode: 'login', step: 1, busy: false };

const ready = () => {
  const pw = $('password');
  submit.classList.toggle('is-ready', input.value.trim().length > 0 && (!pw || pw.value.length > 0 || state.mode === 'recovery'));
};
if (input && submit) input.addEventListener('input', ready);
form?.addEventListener('input', ready);

function setAlert(kind, head, body) {
  if (!alertBox) return;
  alertBox.hidden = !head;
  alertBox.className = `alert${kind ? ` alert--${kind}` : ''}`;
  alertBox.querySelector('.alert__title').textContent = head || '';
  alertBox.querySelector('.alert__body').textContent = body || '';
}
const fail = (msg) => setAlert('error', 'No se pudo continuar', msg);
const failWith = (err) => (isNotInvitedError(err) ? setAlert('error', 'Sin invitación', INVITE_MESSAGE) : fail(authMessage(err)));

function field(id, label, autocomplete) {
  let el = $(id);
  if (el) return el;
  const lab = document.createElement('label');
  lab.className = 'form__label';
  lab.htmlFor = id;
  lab.textContent = label;
  el = document.createElement('input');
  el.className = 'form__input';
  el.id = id;
  el.type = 'password';
  el.autocomplete = autocomplete;
  el.placeholder = 'Introduce tu contraseña';
  form.insertBefore(lab, submit);
  form.insertBefore(el, submit);
  return el;
}
function removeField(id) {
  const el = $(id);
  if (!el) return;
  form.querySelector(`label[for="${id}"]`)?.remove();
  el.remove();
}
function links(html) {
  let p = $('form-links');
  if (!html) { p?.remove(); return; }
  if (!p) { p = document.createElement('p'); p.className = 'form__links'; p.id = 'form-links'; form.appendChild(p); }
  p.innerHTML = html;
}
// Re-draws the form for the current mode. Not called at load: the first paint is the original's.
export function render() {
  removeField('password');
  removeField('password2');
  const emailLabel = form.querySelector('label[for="username"]');
  input.hidden = false;
  if (emailLabel) emailLabel.hidden = false;
  if (state.mode === 'login') {
    title.textContent = 'Iniciar sesión';
    alt.innerHTML = 'o <a href="#" id="to-magic">entrar con enlace mágico</a>';
    if (state.step === 2) {
      field('password', 'Contraseña', 'current-password');
      submit.textContent = 'Iniciar sesión';
      links('<a href="#" id="to-reset">¿Olvidaste tu contraseña?</a> · <a href="#" id="to-magic-2">Enviarme un enlace mágico</a> · <a href="#" id="to-email">Usar otro correo</a>');
    } else {
      submit.textContent = 'Continuar';
      links('');
    }
  } else if (state.mode === 'magic') {
    title.textContent = 'Entrar con enlace mágico';
    alt.innerHTML = 'Te enviamos un enlace por correo; sin contraseña · <a href="#" id="to-login">usar contraseña</a>';
    submit.textContent = 'Enviarme el enlace';
    links('<span class="muted">Solo los correos invitados por el administrador pueden entrar.</span>');
  } else if (state.mode === 'reset') {
    title.textContent = 'Restablecer la contraseña';
    alt.innerHTML = 'Te enviaremos un enlace por correo · <a href="#" id="to-login">volver</a>';
    submit.textContent = 'Enviar enlace';
    links('');
  } else if (state.mode === 'recovery') {
    title.textContent = 'Nueva contraseña';
    alt.innerHTML = 'Escribe la contraseña nueva de tu cuenta.';
    input.hidden = true;
    if (emailLabel) emailLabel.hidden = true;
    field('password', 'Contraseña nueva (mínimo 6 caracteres)', 'new-password');
    field('password2', 'Repite la contraseña', 'new-password');
    submit.textContent = 'Guardar contraseña';
    links('');
  }
  ready();
}
function go(mode, step = 1) {
  state.mode = mode;
  state.step = step;
  render();
  ($('password') || input).focus?.();
}
document.querySelector('.login')?.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a || !a.closest('.login__alt, .form__links')) return;
  e.preventDefault();
  if (a.id === 'to-login') go('login', 1);
  else if (a.id === 'to-reset') go('reset');
  else if (a.id === 'to-email') go('login', 1);
  else go('magic'); // "entrar con enlace mágico" (also the original's alt link before the first render)
});
const busy = (on) => { state.busy = on; submit.disabled = on; };

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    // Open mode (no Supabase): "Continuar" enters directly, as before.
    if (!authEnabled()) { goTo(next); return; }
    const email = input.value.trim();
    const pw = $('password')?.value || '';
    const pw2 = $('password2')?.value || '';
    try {
      busy(true);
      if (state.mode === 'login') {
        if (!EMAIL_RE.test(email)) { fail('Escribe un correo válido.'); return; }
        if (state.step === 1) { go('login', 2); return; }
        if (!pw) { fail('Escribe tu contraseña.'); return; }
        await signIn(email, pw);
        goTo(next);
      } else if (state.mode === 'magic') {
        if (!EMAIL_RE.test(email)) { fail('Escribe un correo válido.'); return; }
        await signInWithOtp(email);
        setAlert('ok', 'Revisa tu correo', `Te enviamos un enlace a ${email} para entrar. Ábrelo desde este mismo dispositivo.`);
      } else if (state.mode === 'reset') {
        if (!EMAIL_RE.test(email)) { fail('Escribe un correo válido.'); return; }
        await resetPassword(email);
        go('login', 1);
        setAlert('ok', 'Enlace enviado', `Si ${email} tiene una cuenta, recibirá un enlace para crear una contraseña nueva.`);
      } else if (state.mode === 'recovery') {
        if (pw.length < 6) { fail('La contraseña debe tener al menos 6 caracteres.'); return; }
        if (pw !== pw2) { fail('Las contraseñas no coinciden.'); return; }
        await updatePassword(pw);
        setAlert('ok', 'Contraseña guardada', 'Ya puedes usar tu contraseña nueva.');
        goTo(next);
      }
    } catch (err) {
      failWith(err);
    } finally {
      busy(false);
    }
  });
}

// With Supabase: an existing session goes straight in; the link of a reset e-mail opens the new-password form.
if (authEnabled()) {
  const recovery = params.get('recovery') === '1' || /type=recovery/.test(location.hash);
  if (recovery) go('recovery');
  else getSession().then((session) => { if (session) goTo(next); });
  onAuthChange((event) => { if (event === 'PASSWORD_RECOVERY') go('recovery'); });
}

// Supabase Auth with e-mail and password. The session persists in localStorage (supabase-js keeps and
// refreshes it); every CRM page requires one when Supabase is configured (data.js calls requireSession()
// before loading anything). Without Supabase (local mode, smoke tests) nothing here applies.
import { supabase } from './supabaseClient.js';

let client = supabase;
export const authEnabled = () => Boolean(client);
// Tests swap the client for a stub and watch navigations instead of leaving the page.
export function setAuthClient(c) { client = c; }
let navigate = (href) => { location.replace(href); };
export const setNavigator = (fn) => { navigate = fn; };
export const goTo = (href) => navigate(href);

// ---------- where the login page lives ----------
const PAGE_RE = /\/(contacts|companies|deals|tickets|tasks|reports|layout|views|settings|data|segments|automation|calls|inbox|marketing|sequences|snippets|templates)(\/(record|import|editor|create|email))?\/?(index\.html)?$/;
// Site root (the folder of the login page) from the path of any CRM page, also when the site is hosted
// under a sub-path.
export function siteRoot(pathname = location.pathname) {
  const root = pathname.replace(PAGE_RE, '/').replace(/index\.html$/, '');
  return root || '/';
}
export const appUrl = (rel = '') => `${location.origin}${siteRoot()}${rel}`;
export function loginUrl(reason = '') {
  const next = `${location.pathname}${location.search}${location.hash}`;
  const params = new URLSearchParams();
  params.set('next', next);
  if (reason) params.set('reason', reason);
  return `${siteRoot()}?${params.toString()}`;
}
// Only paths inside the site are accepted as a return address (never another origin).
export function safeNext(next, fallback = 'contacts/') {
  const s = String(next || '');
  if (!s || /^[a-z]+:/i.test(s) || s.startsWith('//')) return fallback;
  return s;
}

// ---------- session ----------
export async function getSession() {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data?.session || null;
}
export async function currentUser() {
  const s = await getSession();
  return s ? s.user : null;
}
// Resolve at save time so attribution follows the current session, not a demo actor.
export async function currentUserName() {
  const user = await currentUser();
  if (!user) return '';
  const name = (profile) => [profile?.name, profile?.full_name, profile?.display_name]
    .find((value) => typeof value === 'string' && value.trim())?.trim() || '';
  try {
    // Some installations only have membership fields; optional profile fields may be absent.
    const { data, error } = await client.from('team_members').select('*').eq('user_id', user.id).maybeSingle();
    if (!error && name(data)) return name(data);
  } catch { /* Fall back to the authenticated user's metadata when the profile is unavailable. */ }
  return name(user.user_metadata) || user.email || '';
}
// Route protection: resolves with the session, or sends the browser to the login page and never resolves
// (the page is leaving, nothing else should render).
export async function requireSession() {
  if (!client) return null;
  const session = await getSession();
  if (session) {
    try { if (!(await mfaStatus()).required) return session; }
    catch { /* Fail closed if the assurance check is unavailable. */ }
    navigate(loginUrl('mfa'));
    return new Promise(() => {});
  }
  navigate(loginUrl('expired'));
  return new Promise(() => {});
}

// ---------- actions ----------
export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email: String(email).trim(), password });
  if (error) throw error;
  return data.session;
}
// Magic link: the person receives an e-mail with a link that signs them in (and creates the account on
// first use — only for invited e-mails, see supabase/invitations.sql). There is no public sign-up.
export async function signInWithOtp(email) {
  if (!client) throw new Error('Sin conexión con Supabase (modo local): no se puede enviar el enlace.');
  const { error } = await client.auth.signInWithOtp({ email: String(email).trim().toLowerCase(), options: { emailRedirectTo: appUrl(''), shouldCreateUser: true } });
  if (error) throw error;
  return true;
}
export const INVITE_MESSAGE = 'Tu correo no tiene invitación. Pide al administrador que te invite.';
// The invitation trigger refuses the account: Supabase relays the exception text or a generic
// "Database error saving new user" (unexpected_failure) when it cannot create the user.
export const isNotInvitedError = (error) => /solo usuarios invitados|no tiene invitaci|database error (saving|creating) new user|unexpected_failure/i.test(String((error && (error.message || error.error_description || error.code)) || error || ''));
export async function resetPassword(email) {
  const { error } = await client.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: appUrl('?recovery=1') });
  if (error) throw error;
}
export async function updatePassword(password) {
  const { data, error } = await client.auth.updateUser({ password });
  if (error) throw error;
  return data;
}
export async function signOut() {
  if (!client) return;
  try { await client.auth.signOut(); } catch { /* the local session is dropped anyway */ }
}
export function onAuthChange(cb) {
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data?.subscription?.unsubscribe?.();
}

// ---------- messages in the person's language ----------
const MESSAGES = [
  [/invalid.*(totp|mfa|verification).*code|mfa_verification_failed|incorrect.*code/i, 'Código incorrecto o caducado. Prueba con el código actual de tu aplicación.'],
  [/solo usuarios invitados|no tiene invitaci|database error (saving|creating) new user|unexpected_failure/i, INVITE_MESSAGE],
  [/invalid login credentials|invalid_credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Confirma tu correo desde el mensaje que te enviamos antes de iniciar sesión.'],
  [/already registered|already been registered|user_already_exists/i, 'Ya existe una cuenta con ese correo. Inicia sesión.'],
  [/password should be at least|weak_password|password is too short/i, 'La contraseña debe tener al menos 6 caracteres.'],
  [/rate limit|too many requests|over_email_send_rate_limit/i, 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'],
  [/signups? not allowed|signup_disabled/i, 'El registro de cuentas nuevas está desactivado en este proyecto.'],
  [/unable to validate email|invalid email|validation_failed/i, 'Escribe un correo válido.'],
  [/network|fetch|failed to fetch/i, 'No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.'],
];
export function authMessage(error) {
  const text = String((error && (error.message || error.error_description)) || error || '');
  const hit = MESSAGES.find(([re]) => re.test(text));
  return hit ? hit[1] : text ? `No se pudo completar la operación: ${text}` : 'No se pudo completar la operación.';
}
export const userLabel = (user) => (user && (user.user_metadata?.name || user.email)) || '';
export const userInitial = (user) => (userLabel(user).trim()[0] || 'U').toUpperCase();

// MFA state comes from Auth, never localStorage.
const mfaResult = ({ data, error }) => { if (error) throw error; return data; };
export async function mfaStatus() {
  const factors = mfaResult(await client.auth.mfa.listFactors()).totp.filter((f) => f.status === 'verified');
  const aal = mfaResult(await client.auth.mfa.getAuthenticatorAssuranceLevel());
  return { factors, active: factors.length > 0, required: aal.currentLevel !== 'aal2' && (factors.length > 0 || aal.nextLevel === 'aal2') };
}
export async function enrollTotp() {
  // Clear abandoned, unverified enrollments; never remove a verified factor here.
  const factors = mfaResult(await client.auth.mfa.listFactors());
  for (const f of factors.all || []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await cancelTotp(f.id);
  }
  return mfaResult(await client.auth.mfa.enroll({ factorType: 'totp' }));
}
export async function verifyTotp(factorId, code) {
  if (!/^\d{6}$/.test(String(code).trim())) throw new Error('Escribe el código de 6 dígitos de tu aplicación.');
  return mfaResult(await client.auth.mfa.challengeAndVerify({ factorId, code: String(code).trim() }));
}
export async function cancelTotp(factorId) {
  return mfaResult(await client.auth.mfa.unenroll({ factorId }));
}
export async function disableTotp(factorId, code) {
  await verifyTotp(factorId, code);
  return cancelTotp(factorId);
}

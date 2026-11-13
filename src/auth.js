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
const PAGE_RE = /\/(contacts|companies|deals|tickets|tasks|reports|layout|views|settings|data|segments)(\/(record|import|editor))?\/?(index\.html)?$/;
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
// Route protection: resolves with the session, or sends the browser to the login page and never resolves
// (the page is leaving, nothing else should render).
export async function requireSession() {
  if (!client) return null;
  const session = await getSession();
  if (session) return session;
  navigate(loginUrl('expired'));
  return new Promise(() => {});
}

// ---------- actions ----------
export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email: String(email).trim(), password });
  if (error) throw error;
  return data.session;
}
// data.session is null when the project asks new accounts to confirm their e-mail first.
export async function signUp(email, password) {
  const { data, error } = await client.auth.signUp({ email: String(email).trim(), password, options: { emailRedirectTo: appUrl('') } });
  if (error) throw error;
  return data;
}
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

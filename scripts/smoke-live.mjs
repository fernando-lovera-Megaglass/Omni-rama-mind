// Opt-in live mode of the persistence smokes (SMOKE_LIVE=1 node scripts/smoke-<x>.mjs): the app's own modules
// (src/data.js and friends) run against the real Supabase project with a throw-away «SMOKE» user — invited,
// added to team_members, signed in with a password on the app's own client — and every action is checked with
// SQL through the Management API (scripts/mgmt-sql.mjs). The records are prefixed «SMOKE» and everything the run
// created (rows, settings, the user) is removed at the end, also when a check fails. Without SMOKE_LIVE=1 the
// helper does nothing and the smoke runs as always (JSDOM + localStorage). How to run it: docs/smoke-live.md.
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runSql, hasMgmtToken } from './mgmt-sql.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const isLive = () => process.env.SMOKE_LIVE === '1';
export const sql = (query) => runSql(query);
export const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from app/.env into process.env (the app's client reads them there
// in Node; `node --env-file=.env` works too). The values are never printed.
export function loadEnv() {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) return true;
  const file = resolve(here, '..', '.env');
  if (!existsSync(file)) return false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);
}

// Fails with a clear message when the database lacks what the feature needs (a migration not applied yet).
export async function requireColumns(table, columns = []) {
  const rows = await sql(`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${lit(table)}`);
  const have = new Set((rows || []).map((r) => r.column_name));
  if (!have.size) throw new Error(`la tabla public.${table} no existe: aplica su migración (node scripts/apply-migration.mjs supabase/<archivo>.sql)`);
  const missing = columns.filter((c) => !have.has(c));
  if (missing.length) throw new Error(`public.${table} no tiene la(s) columna(s) ${missing.join(', ')}: aplica la migración que las añade`);
}
export const requireTable = (table) => requireColumns(table, []);

// The throw-away user: invitation row + auth.users row (bcrypt password) + active team_members row, then a
// real session on the app's own client. Nothing of the person's own user is touched.
export async function startLiveSession(tag, supabase) {
  const stamp = Date.now().toString(36);
  const email = `smoke.${tag}.${stamp}@megaglass.us`;
  const password = `Smoke-${randomBytes(12).toString('base64url')}`;
  await sql(`insert into public.invitations (email) values (${lit(email)}) on conflict (email) do nothing`);
  await sql(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', ${lit(email)}, extensions.crypt(${lit(password)}, extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '')`);
  const found = await sql(`select id from auth.users where email = ${lit(email)}`);
  const uid = found && found[0] && found[0].id;
  if (!uid) throw new Error('no se pudo crear el usuario SMOKE en auth.users');
  try {
    // A trigger of rls_team.sql may have mirrored the new user already: make sure the row is active either way.
    await sql(`insert into public.team_members (user_id, email, role, team, active) values (${lit(uid)}, ${lit(email)}, 'member', '', true) on conflict (user_id) do update set active = true, email = excluded.email`);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`no se pudo iniciar sesión con el usuario SMOKE: ${error.message}`);
  } catch (e) {
    // Never leave the throw-away user behind when the session could not be set up.
    await removeLiveUser({ email, uid }).catch(() => {});
    throw e;
  }
  return { email, uid, stamp };
}
export async function removeLiveUser({ email, uid }) {
  await sql(`delete from public.user_settings where user_id = ${lit(uid)}; delete from public.team_members where user_id = ${lit(uid)}; delete from auth.users where id = ${lit(uid)}; delete from public.invitations where lower(email::text) = ${lit(email.toLowerCase())};`);
}
// Every «SMOKE …» record of the run (and their associations, activities, tasks and line items), then the user.
export async function cleanupLive(session) {
  const like = lit('SMOKE %');
  await sql(`delete from public.contact_companies cc using public.contacts c where cc.contact_id = c.id and (c.name like ${like} or c.email like 'smoke.%@ejemplo.com');
    delete from public.contact_companies cc using public.companies c where cc.company_id = c.id and c.name like ${like};
    delete from public.activities a using public.contacts c where a.record_type = 'contacts' and a.record_id = c.id and (c.name like ${like} or c.email like 'smoke.%@ejemplo.com');
    delete from public.activities a using public.companies c where a.record_type = 'companies' and a.record_id = c.id and c.name like ${like};
    delete from public.activities a using public.deals d where a.record_type = 'deals' and a.record_id = d.id and d.name like ${like};
    delete from public.activities a using public.tickets t where a.record_type = 'tickets' and a.record_id = t.id and t.name like ${like};
    delete from public.activities a using public.tasks t where a.record_type = 'tasks' and a.record_id = t.id and t.name like ${like};
    delete from public.deal_line_items l using public.deals d where l.deal_id = d.id and d.name like ${like};
    delete from public.tasks where name like ${like};
    delete from public.deals where name like ${like};
    delete from public.tickets where name like ${like};
    delete from public.companies where name like ${like};
    delete from public.contacts where name like ${like} or email like 'smoke.%@ejemplo.com';`);
  // Saved views of the run (the table may not exist yet: crm_views.sql pending).
  try { await sql(`delete from public.crm_views where name like ${like}`); } catch { /* no table */ }
  if (session) await removeLiveUser(session);
}

// Runs `scenario` in live mode and exits; returns at once when SMOKE_LIVE is not set so the smoke goes on as
// usual. The scenario gets the live-booted data.js module, the SQL runner and the session (uid, stamp).
export async function liveSmoke(tag, scenario) {
  if (!isLive()) return;
  const log = (...a) => console.log(`[${tag}:live]`, ...a);
  if (!loadEnv() || !hasMgmtToken()) { console.error(`[${tag}:live] FAIL: faltan app/.env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) o app/.supabase-mgmt-token`); process.exit(2); }
  const { JSDOM } = await import('jsdom');
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
  // A neutral page (not a record list): data.js downloads the full tables instead of one server page.
  const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/reports/', pretendToBeVisual: true });
  for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver', 'customElements', 'Option']) globalThis[k] = dom.window[k];
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
  const { supabase } = await import(resolve(here, '../src/supabaseClient.js'));
  if (!supabase) { console.error(`[${tag}:live] FAIL: el cliente de Supabase no se creó (revisa app/.env)`); process.exit(2); }
  let session = null;
  let failed = null;
  try {
    session = await startLiveSession(tag.replace(/[^a-z0-9]/gi, '').toLowerCase(), supabase);
    log(`usuario SMOKE con sesión (${session.email})`);
    const data = await import(resolve(here, '../src/data.js'));
    if (!data.dbIsLive()) throw new Error('data.js no arrancó en modo Supabase (¿sesión o políticas de team_members?)');
    const check = (ok, msg) => { if (!ok) throw new Error(msg); };
    const one = async (query) => { const rows = await sql(query); return Array.isArray(rows) && rows.length ? rows[0] : null; };
    await scenario({ data, sql, one, check, log, session, stamp: session.stamp, supabase });
    log('OK');
  } catch (e) {
    failed = e;
    console.error(`[${tag}:live] FAIL: ${e && e.message ? e.message : e}`);
  } finally {
    try { await cleanupLive(session); log('limpieza: registros SMOKE y usuario eliminados'); } catch (e) { console.error(`[${tag}:live] limpieza incompleta: ${e.message}`); }
    try { await supabase.auth.signOut(); } catch { /* no session */ }
  }
  process.exit(failed ? 1 : 0);
}

// Smoke test for the strict-RLS migration by team (supabase/rls_team.sql, the PASO 2 of auth.sql for a
// multi-user account with shared data): the team table, the security-definer membership checks, the
// lock-out guard, every table that today has an open anon/authenticated policy moves to «team access» (and
// only those: the personal tables stay owner-only), user_settings becomes personal, the rollback block, the
// pointer from auth.sql, and the app side — teamMembership() against a fake client and the notice shown to
// a signed-in user who is not an active member. Nothing is applied. Run: node scripts/smoke-rls-team.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const log = (...a) => console.log('[rls-team]', ...a);
const fail = (msg) => { console.error(`[rls-team] FAIL: ${msg}`); process.exit(1); };
const read = (p) => readFileSync(resolve(app, p), 'utf8');

// ===== 1) The migration =====
const sql = read('supabase/rls_team.sql');
if (!/create table if not exists public\.team_members \(/.test(sql) || !sql.includes('user_id uuid primary key references auth.users (id) on delete cascade') || !sql.includes("role text not null default 'member' check (role in ('admin', 'member'))") || !sql.includes('active boolean not null default true')) fail('team_members table');
if (!/insert into public\.team_members \(user_id, email, role\)\s*select u\.id/.test(sql) || !sql.includes('from auth.users u') || !sql.includes('on conflict (user_id) do nothing')) fail('existing accounts must be seeded as members');
if (!/create or replace function public\.handle_new_user\(\)[\s\S]*insert into public\.team_members/.test(sql)) fail('new accounts must join the team through the profiles trigger');
for (const fn of ['is_team_member', 'is_team_admin']) {
  const re = new RegExp(`create or replace function public\\.${fn}\\(\\)\\s*returns boolean\\s*language sql stable security definer set search_path = public`);
  if (!re.test(sql)) fail(`${fn} must be a stable security-definer SQL function`);
  if (!sql.includes(`grant execute on function public.${fn}() to authenticated, anon`)) fail(`${fn} grant`);
}
if (!sql.includes('m.user_id = auth.uid() and m.active)') || !sql.includes("m.active and m.role = 'admin'")) fail('membership checks');
if (!/raise exception 'No hay ningún miembro activo del equipo/.test(sql) || sql.indexOf('raise exception') > sql.indexOf('create policy "team access"')) fail('the lock-out guard must run before the policies are swapped');
const listMatch = sql.match(/foreach t in array array\[([\s\S]*?)\] loop[\s\S]*?create policy "team access"/);
if (!listMatch) fail('shared table list');
const shared = [...listMatch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
if (!sql.includes(`execute format('create policy "team access" on public.%I for all to authenticated using (public.is_team_member()) with check (public.is_team_member())', t)`)) fail('team access policy');
for (const p of ['"anon full access"', '"authenticated full access"', '"authenticated queues"', '"read activity comments"', '"add activity comments"', '"invitations read"', '"account_settings_admin"']) if (!sql.includes(`drop policy if exists ${p} on public.%I`)) fail(`must drop ${p}`);
// every table with an open anon / authenticated policy in the other migrations is in the list…
const open = new Set();
for (const f of readdirSync(resolve(app, 'supabase')).filter((x) => x.endsWith('.sql') && x !== 'rls_team.sql')) {
  const s = read(`supabase/${f}`);
  // explicit policies on a named table (the `public.%I` of the format() loops is handled by the second pass)
  [...s.matchAll(/create policy "(?:anon full access|authenticated full access|authenticated queues|read activity comments|invitations read)" on (?:public\.)?([a-z_]+)(?=\s)/g)].forEach((m) => open.add(m[1]));
  [...s.matchAll(/foreach t in array array\[([^\]]+)\][\s\S]{0,600}?create policy "(?:anon full access|authenticated full access)"/g)].forEach((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].forEach((x) => open.add(x[1])));
}
open.delete('user_settings'); // handled apart (personal)
const missing = [...open].filter((t) => !shared.includes(t));
if (missing.length) fail(`tables with open policies not covered: ${missing.join(', ')}`);
// …and the personal / owner-only tables are not
const personal = ['user_settings', 'connected_accounts', 'connected_account_tokens', 'inbox_messages', 'twilio_connections', 'twilio_connection_secrets', 'call_logs', 'twilio_messages', 'reports', 'profiles', 'team_members'];
const leaked = personal.filter((t) => shared.includes(t));
if (leaked.length) fail(`personal tables must not get team-wide access: ${leaked.join(', ')}`);
if (!sql.includes('create policy personal_settings on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())')) fail('user_settings must become personal');
if (!sql.includes('create policy "team reads profiles" on public.profiles for select to authenticated using (public.is_team_member())')) fail('team reads profiles');
if (!/\/\*[\s\S]*VOLVER ATRÁS[\s\S]*\*\//.test(sql) && !/VOLVER ATRÁS[\s\S]*\/\*[\s\S]*create policy "anon full access"[\s\S]*\*\//.test(sql)) fail('rollback block (commented)');
if (!/contactos 423 \(3 con user_id\)/.test(sql) || !sql.includes('5 correos invitados')) fail('the verification of the shared data must be documented');
const auth = read('supabase/auth.sql');
if (!auth.includes('supabase/rls_team.sql') || !/\/\*[\s\S]*create policy "owner only"[\s\S]*\*\//.test(auth)) fail('auth.sql must point to rls_team.sql and keep the owner-only block commented');
log(`migration: team_members + is_team_member/is_team_admin, guard, ${shared.length} shared tables → «team access» (covers the ${open.size} tables with open policies), ${personal.length} personal tables untouched, user_settings personal, rollback documented`);

// ===== 2) The app: membership check and notice =====
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/contacts/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.location = dom.window.location;
const data = await import(resolve(here, '../src/data.js'));
const fakeClient = (answer) => ({ from: (table) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => (table === 'team_members' ? answer : { data: null, error: { code: '42P01' } }) }) }) }) });
const session = { user: { id: 'u-1', email: 'sofia.r@megaglass.us' } };
if ((await data.teamMembership(session, fakeClient({ data: { active: true }, error: null }))) !== 'active') fail('active member');
if ((await data.teamMembership(session, fakeClient({ data: { active: false }, error: null }))) !== 'inactive') fail('inactive member');
if ((await data.teamMembership(session, fakeClient({ data: null, error: null }))) !== 'none') fail('not a member');
if ((await data.teamMembership(session, fakeClient({ data: null, error: { code: '42P01', message: 'relation "team_members" does not exist' } }))) !== 'unknown') fail('migration not applied → unknown (the app behaves as before)');
if ((await data.teamMembership(null, fakeClient({ data: { active: true }, error: null }))) !== 'unknown' || (await data.teamMembership(session, null)) !== 'unknown') fail('no session / no client → unknown');
const html = data.teamNoticeHtml('sofia.r@megaglass.us', 'inactive');
if (!html.includes('Tu cuenta no está activa en el equipo') || !html.includes('sofia.r@megaglass.us') || !html.includes('dio de baja tu acceso') || !html.includes('team_members') || !html.includes('id="rls-signout"')) fail('team notice (inactive)');
if (!data.teamNoticeHtml('x@y.z', 'none').includes('todavía no figura como miembro')) fail('team notice (none)');
if (data.teamNoticeHtml('<b>x</b>', 'none').includes('<b>x</b>')) fail('the e-mail is escaped');
const src = read('src/data.js');
if (!/const membership = await teamMembership\(session\);[\s\S]*showTeamNotice\(session, membership\)/.test(src) || src.indexOf('showTeamNotice(session, membership)') > src.indexOf('await seedAll();')) fail('the bootstrap must check the membership before seeding');
log('app: teamMembership → active / inactive / none / unknown; notice for a signed-in non-member before any seeding');

console.log('[rls-team] OK');
process.exit(0);

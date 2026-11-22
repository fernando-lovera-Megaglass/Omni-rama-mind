-- Omni CRM · PASO 2 de supabase/auth.sql, versión POR EQUIPO (RLS estricto sin romper la operación)
-- Aplicar con: node scripts/apply-migration.mjs supabase/rls_team.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Idempotente. Requiere supabase/auth.sql (PASO 1)
-- y supabase/invitations.sql. NO está aplicada: se aplica cuando el equipo decida pasar a acceso estricto.
--
-- ============ POR QUÉ POR EQUIPO Y NO POR USUARIO (verificado el 2026-11-21 en el proyecto) ============
--  · La cuenta es multiusuario con datos compartidos: 5 correos invitados (los vendedores de Megaglass),
--    1 usuario con cuenta hoy. Los registros se asignan con la propiedad «Propietario» (texto), pero todo el
--    equipo trabaja sobre los mismos contactos, empresas, negocios, tickets, tareas, actividades, segmentos,
--    pipelines, plantillas, secuencias y workflows (como en HubSpot: toda la cuenta ve los registros).
--  · Casi ninguna fila tiene user_id: contactos 423 (3 con user_id), empresas 38 (2), negocios 150 (0),
--    tickets 84 (0), tareas 64 (0), actividades 172 (142), segmentos 13 (1). Unas políticas «owner only»
--    (user_id = auth.uid()) dejarían el CRM vacío para todos, incluido el usuario actual, y ocultarían a
--    cada vendedor lo que creen los demás.
--  → Por eso este archivo sustituye el bloque comentado de auth.sql por políticas de EQUIPO: solo los
--    usuarios autenticados que son miembros activos del equipo (public.team_members) leen y escriben las
--    tablas compartidas; se retira el acceso con la clave anónima; las tablas personales siguen siendo
--    solo del dueño (ajustes de la interfaz, cuentas de Gmail y sus mensajes, conexiones y registros de
--    Twilio, informes propios, perfil).
--
-- ============ QUÉ HACE ============
--  1. Tabla public.team_members (user_id → auth.users, email, role admin|member, team, active) sembrada con
--     TODOS los usuarios que ya tienen cuenta (el más antiguo como admin). Cada cuenta nueva (solo correos
--     invitados, ver invitations.sql) entra como miembro activo mediante el disparador de perfiles.
--  2. Funciones security definer public.is_team_member() / public.is_team_admin() para usarlas en las políticas
--     sin recursión.
--  3. Comprobación de seguridad: si no hay ningún miembro activo, el archivo se detiene (nadie se queda fuera).
--  4. En cada tabla compartida quita «anon full access» y «authenticated full access» (y las abiertas
--     equivalentes) y crea «team access» (miembros activos). user_settings pasa a ser solo del dueño.
--  5. profiles: además de «own profile», los miembros leen los perfiles del equipo (nombres en la app).
--  6. Al final, comentado: cómo restringir por equipo concreto (columna team en los registros) y cómo volver atrás.
--
-- ============ DESPUÉS DE APLICAR ============
--  · Para dar de baja a alguien: update public.team_members set active = false where email = '…';
--  · Para hacer admin:          update public.team_members set role = 'admin' where email = '…';
--  · La app muestra «Tu cuenta no está activa en el equipo» a un usuario con sesión que no sea miembro activo.

-- ---------- 1: el equipo ----------
create table if not exists public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  role text not null default 'member' check (role in ('admin', 'member')),
  team text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists team_members_active_idx on public.team_members (active);

-- Everyone who already has an account is a member; the oldest account is the admin.
insert into public.team_members (user_id, email, role)
select u.id, coalesce(u.email, ''), case when u.id = (select id from auth.users order by created_at asc limit 1) then 'admin' else 'member' end
from auth.users u
on conflict (user_id) do nothing;

-- New accounts (only invited e-mails can sign up) join the team as active members, next to their profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do update set email = excluded.email;
  insert into public.team_members (user_id, email, role)
  values (new.id, coalesce(new.email, ''), 'member')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- 2: membership checks (security definer: the policies never recurse into team_members) ----------
create or replace function public.is_team_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.team_members m where m.user_id = auth.uid() and m.active);
$$;
create or replace function public.is_team_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.team_members m where m.user_id = auth.uid() and m.active and m.role = 'admin');
$$;
revoke all on function public.is_team_member() from public;
revoke all on function public.is_team_admin() from public;
grant execute on function public.is_team_member() to authenticated, anon;
grant execute on function public.is_team_admin() to authenticated, anon;

alter table public.team_members enable row level security;
drop policy if exists "team reads team" on public.team_members;
drop policy if exists "admin manages team" on public.team_members;
create policy "team reads team" on public.team_members for select to authenticated using (public.is_team_member());
create policy "admin manages team" on public.team_members for all to authenticated using (public.is_team_admin()) with check (public.is_team_admin());

-- ---------- 3: nobody gets locked out ----------
do $$
begin
  if not exists (select 1 from public.team_members where active) then
    raise exception 'No hay ningún miembro activo del equipo: inicia sesión en Omni al menos una vez (o inserta tu usuario en public.team_members) antes de aplicar las políticas de equipo.';
  end if;
end $$;

-- ---------- 4: shared tables → team access only (no anonymous access) ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'deals', 'tickets', 'tasks', 'activities', 'segments',
    'activity_comments', 'contact_companies', 'deal_line_items', 'deal_tags', 'ticket_tags',
    'pipelines', 'pipeline_stages', 'custom_properties', 'connected_emails',
    'conversations', 'conversation_messages', 'inbox_settings', 'marketing_emails',
    'message_templates', 'message_template_folders',
    'sequences', 'sequence_steps', 'sequence_enrollments', 'sequence_folders',
    'snippets', 'snippet_folders',
    'workflows', 'workflow_actions', 'workflow_enrollments', 'workflow_runs',
    'task_queues', 'invitations', 'account_settings'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'La tabla % no existe todavía (ejecuta antes su migración); se omite.', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "anon full access" on public.%I', t);
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format('drop policy if exists "authenticated queues" on public.%I', t);
    execute format('drop policy if exists "read activity comments" on public.%I', t);
    execute format('drop policy if exists "add activity comments" on public.%I', t);
    execute format('drop policy if exists "invitations read" on public.%I', t);
    execute format('drop policy if exists "invitations insert" on public.%I', t);
    execute format('drop policy if exists "invitations delete" on public.%I', t);
    execute format('drop policy if exists "account_settings_read" on public.%I', t);
    execute format('drop policy if exists "account_settings_admin" on public.%I', t);
    execute format('drop policy if exists "team access" on public.%I', t);
    execute format('create policy "team access" on public.%I for all to authenticated using (public.is_team_member()) with check (public.is_team_member())', t);
  end loop;
end $$;

-- Interface settings are personal: each member reads and writes only its own rows.
do $$
begin
  if to_regclass('public.user_settings') is not null then
    execute 'alter table public.user_settings enable row level security';
    execute 'drop policy if exists "anon full access" on public.user_settings';
    execute 'drop policy if exists "authenticated full access" on public.user_settings';
    execute 'drop policy if exists personal_settings on public.user_settings';
    execute 'create policy personal_settings on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
end $$;

-- ---------- 5: profiles readable by the team (the app shows teammates' names) ----------
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists "team reads profiles" on public.profiles';
    execute 'create policy "team reads profiles" on public.profiles for select to authenticated using (public.is_team_member())';
  end if;
end $$;

-- Tablas que NO se tocan (ya son solo del dueño o públicas de lectura):
--   user_settings (personal_settings, arriba), connected_accounts, connected_account_tokens, inbox_messages,
--   twilio_connections, twilio_connection_secrets, call_logs, twilio_messages, reports (own reports),
--   profiles (own profile + lectura del equipo), roadmap_sections (lectura autenticada).

-- ============ 6 (OPCIONAL, COMENTADO): RESTRINGIR POR EQUIPO CONCRETO ============
-- Si más adelante un equipo (p. ej. «Ventas Norte») no debe ver los registros de otro, añade la columna
-- team a los registros y cambia la política de esas tablas; los registros sin equipo siguen siendo de todos:
/*
alter table public.contacts add column if not exists team text not null default '';
drop policy if exists "team access" on public.contacts;
create policy "team access" on public.contacts for all to authenticated
  using (public.is_team_member() and (team = '' or team = (select m.team from public.team_members m where m.user_id = auth.uid())))
  with check (public.is_team_member() and (team = '' or team = (select m.team from public.team_members m where m.user_id = auth.uid())));
*/

-- ============ VOLVER ATRÁS (COMENTADO): acceso abierto como en el PASO 1 ============
/*
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'contacts', 'deals', 'tickets', 'tasks', 'activities', 'segments', 'activity_comments', 'contact_companies', 'deal_line_items', 'deal_tags', 'ticket_tags', 'pipelines', 'pipeline_stages', 'custom_properties', 'connected_emails', 'conversations', 'conversation_messages', 'inbox_settings', 'marketing_emails', 'message_templates', 'message_template_folders', 'sequences', 'sequence_steps', 'sequence_enrollments', 'sequence_folders', 'snippets', 'snippet_folders', 'workflows', 'workflow_actions', 'workflow_enrollments', 'workflow_runs', 'task_queues', 'invitations', 'account_settings', 'user_settings'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "team access" on public.%I', t);
    execute format('drop policy if exists "anon full access" on public.%I', t);
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format('create policy "anon full access" on public.%I for all to anon using (true) with check (true)', t);
    execute format('create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
*/

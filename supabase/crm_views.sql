-- Omni CRM · Vistas guardadas de las listas (Contactos / Empresas / Negocios / Tickets / Tareas)
-- Aplicar con: node scripts/apply-migration.mjs supabase/crm_views.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Idempotente.
--
-- crm_views: una vista personalizada por fila. `payload` guarda lo que la app serializa de la vista (base,
--   filtros, filtros avanzados, columnas, orden…); `share` = 'private' (solo el autor), 'team' (los miembros
--   de los equipos de `teams`, nombres de team_members.team; vacío = todos los miembros) o 'all' (toda la cuenta).
--   Las pestañas abiertas y la vista activa de cada usuario viven en user_settings (crm:<objeto>:views:tabs).
-- Seguridad: solo miembros activos del equipo (public.is_team_member()); cada quien lee sus vistas y las
--   compartidas por los demás, y solo escribe las suyas (owner_id = auth.uid()).

create table if not exists public.crm_views (
  id text primary key,
  object_type text not null check (object_type in ('contacts', 'companies', 'deals', 'tickets', 'tasks')),
  name text not null,
  share text not null default 'private' check (share in ('private', 'team', 'all')),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name text not null default '',
  teams jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_views_object_idx on public.crm_views (object_type);
create index if not exists crm_views_owner_idx on public.crm_views (owner_id);

alter table public.crm_views enable row level security;
drop policy if exists crm_views_read on public.crm_views;
create policy crm_views_read on public.crm_views for select to authenticated
using (public.is_team_member() and (owner_id = auth.uid() or share <> 'private'));
drop policy if exists crm_views_insert on public.crm_views;
create policy crm_views_insert on public.crm_views for insert to authenticated
with check (public.is_team_member() and owner_id = auth.uid());
drop policy if exists crm_views_update on public.crm_views;
create policy crm_views_update on public.crm_views for update to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists crm_views_delete on public.crm_views;
create policy crm_views_delete on public.crm_views for delete to authenticated
using (owner_id = auth.uid());
revoke all on public.crm_views from anon;
grant select, insert, update, delete on public.crm_views to authenticated;

-- updated_at al modificar (misma función que user_settings.sql; se crea si aún no existe).
create or replace function public.settings_updated_at() returns trigger language plpgsql
set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists crm_views_timestamp on public.crm_views;
create trigger crm_views_timestamp before update on public.crm_views for each row execute function public.settings_updated_at();

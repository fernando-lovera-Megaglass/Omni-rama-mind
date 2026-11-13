-- Omni CRM · migración: solo usuarios invitados (Supabase Auth)
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo una sola vez (es idempotente).
-- Proyecto: https://xysgvxnieigpaxtmxiui.supabase.co
--
-- QUÉ HACE
--  1. Tabla public.invitations: los correos que pueden crear cuenta (email citext único, quién invitó,
--     fecha). Lectura, inserción y borrado solo para usuarios autenticados (por ahora cualquier usuario
--     del equipo puede invitar). Las políticas "anon full access" de las tablas de datos no se tocan.
--  2. Semilla: fernando-lovera@megaglass.us y los correos de los propietarios de la muestra
--     (los OWNERS de la app con su correo @megaglass.us). ON CONFLICT DO NOTHING.
--  3. Disparador BEFORE INSERT en auth.users: si el correo (en minúsculas) no está en invitations,
--     lanza 'Solo usuarios invitados: este correo no tiene invitación'. Aplica aunque se llame a la API
--     directamente (registro con contraseña, enlace mágico u OTP). La función es security definer con
--     search_path fijo. Los usuarios que ya existen no se ven afectados: solo controla quién puede CREAR
--     cuenta; la sesión actual sigue funcionando.
--
-- PARA INVITAR A ALGUIEN: Configuración › Usuarios y equipos › Invitaciones (o insertar su correo aquí).
-- PARA VOLVER ATRÁS: drop trigger require_invitation_before_insert on auth.users;

create extension if not exists citext;

create table if not exists public.invitations (
  email      citext primary key,
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- RLS: solo usuarios autenticados ----------
alter table public.invitations enable row level security;
drop policy if exists "invitations read"   on public.invitations;
drop policy if exists "invitations insert" on public.invitations;
drop policy if exists "invitations delete" on public.invitations;
create policy "invitations read"   on public.invitations for select to authenticated using (true);
create policy "invitations insert" on public.invitations for insert to authenticated with check (true);
create policy "invitations delete" on public.invitations for delete to authenticated using (true);

-- ---------- semilla ----------
insert into public.invitations (email) values
  ('fernando-lovera@megaglass.us'),
  ('fernando.l@megaglass.us'),
  ('sofia.r@megaglass.us'),
  ('diego.g@megaglass.us'),
  ('laura.m@megaglass.us')
on conflict (email) do nothing;

-- ---------- disparador: solo correos invitados pueden crear cuenta ----------
create or replace function public.require_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is null
     or not exists (select 1 from public.invitations i where lower(i.email::text) = lower(new.email)) then
    raise exception 'Solo usuarios invitados: este correo no tiene invitación' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.require_invitation() from public;
grant execute on function public.require_invitation() to supabase_auth_admin;

drop trigger if exists require_invitation_before_insert on auth.users;
create trigger require_invitation_before_insert
  before insert on auth.users
  for each row execute procedure public.require_invitation();

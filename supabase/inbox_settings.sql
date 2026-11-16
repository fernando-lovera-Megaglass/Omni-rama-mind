-- Omni CRM · Configuración de la bandeja de entrada (Ajustes › Herramientas › Bandeja de entrada)
-- Aplicar con: node scripts/apply-migration.mjs supabase/inbox_settings.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- inbox_settings: un JSON por clave, compartido por toda la cuenta:
--   channels      → canales web/aplicaciones y del equipo (chat, formularios, correo del equipo, llamadas, WhatsApp, Messenger)
--   inboxes       → bandejas configuradas (canales asignados, ANS, vistas de equipo, acceso)
--   availability  → estado por usuario (available | away), usado por la asignación automática
--   spam          → listas de permitidos y denegados y el marcado automático
-- Misma seguridad que el resto de tablas.

create table if not exists public.inbox_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.inbox_settings enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inbox_settings' and policyname = 'anon full access') then
    create policy "anon full access" on public.inbox_settings for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inbox_settings' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on public.inbox_settings for all to authenticated using (true) with check (true);
  end if;
end $$;

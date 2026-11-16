-- Omni CRM · Cuentas de correo conectadas (Ajustes › General › Correo)
-- Aplicar con: node scripts/apply-migration.mjs supabase/connected_emails.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- connected_emails: una cuenta de correo conectada por fila, por usuario (user_id = correo del usuario).
--   provider: gmail | gsuite | outlook | exchange | imap · status: active | error | disabled
--   inbox_automation: registrar respuestas y sugerir tareas · signature_id: 'default' (ficha) o id de firma propia
--   alias: dirección alternativa asociada · imap_host/imap_port/smtp_host/smtp_port/username: solo IMAP (nulos con OAuth).
--   La contraseña nunca se guarda: la verificación es simulada y las credenciales no salen del navegador.
-- Misma seguridad que el resto de tablas. Idempotente: no duplica la semilla.

create table if not exists public.connected_emails (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default '',
  email text not null default '',
  provider text not null default 'imap',
  status text not null default 'active',
  inbox_automation boolean not null default true,
  signature_id text not null default 'default',
  alias text not null default '',
  imap_host text,
  imap_port int,
  smtp_host text,
  smtp_port int,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists connected_emails_user_email_idx on public.connected_emails (user_id, lower(email));

alter table public.connected_emails enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'connected_emails' and policyname = 'anon full access') then
    create policy "anon full access" on public.connected_emails for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'connected_emails' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on public.connected_emails for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ===== Semilla: la cuenta de trabajo del usuario actual =====
insert into public.connected_emails (id, user_id, email, provider, status, inbox_automation, signature_id, created_at, updated_at) values
  ('d8000000-0000-4000-8000-000000000001', 'fernando-lovera@megaglass.us', 'fernando-lovera@megaglass.us', 'gsuite', 'active', true, 'default', now() - interval '45 days', now() - interval '45 days')
on conflict (id) do nothing;

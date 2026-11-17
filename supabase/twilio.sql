-- Omni CRM · Twilio de verdad (llamadas desde el navegador, llamadas entrantes, SMS y WhatsApp)
-- Aplicar con: node scripts/apply-migration.mjs supabase/twilio.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Idempotente.
--
-- twilio_connections:        una conexión de Twilio por usuario de Supabase Auth (user_id = auth.uid()).
--                            Guarda el Account SID y el número comprado (datos no secretos), el estado
--                            (active | error | disabled) y las capacidades del número (voz/sms/whatsapp).
-- twilio_connection_secrets: el Auth Token (y más adelante API Key SID/Secret para los tokens del
--                            navegador). RLS activada SIN políticas: ningún cliente puede leerla; solo
--                            las Edge Functions con la service role. El navegador nunca ve el token.
-- call_logs:                 cada llamada (saliente desde el navegador o entrante al número Twilio),
--                            con estado, duración, grabación y el contacto/empresa emparejado por
--                            teléfono. activity_id enlaza con la actividad que la app crea en la ficha.
-- twilio_messages:           mensajes SMS y WhatsApp (entrantes y salientes), agrupados por hilo
--                            (par de teléfonos) y emparejados con el contacto por número.
-- Seguridad: cada usuario solo ve sus filas (auth.uid() = user_id). Las escrituras sensibles las hacen
-- las Edge Functions con la service role; la app solo lee lo suyo y marca preferencias.

create table if not exists public.twilio_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_sid text not null,
  phone_number text not null,
  friendly_name text,
  capabilities jsonb not null default '{"voice": true, "sms": true, "whatsapp": false}',
  status text not null default 'active' check (status in ('active', 'error', 'disabled')),
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists twilio_connections_user_idx on public.twilio_connections (user_id);

create table if not exists public.twilio_connection_secrets (
  connection_id uuid primary key references public.twilio_connections (id) on delete cascade,
  auth_token text not null,
  api_key_sid text,
  api_key_secret text,
  twiml_app_sid text,
  updated_at timestamptz not null default now()
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid references public.twilio_connections (id) on delete set null,
  call_sid text,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_number text not null,
  to_number text not null,
  status text not null default 'queued',
  duration_sec integer,
  recording_url text,
  contact_id text,
  company_id text,
  activity_id text,
  answered_by text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists call_logs_sid_idx on public.call_logs (call_sid) where call_sid is not null;
create index if not exists call_logs_user_created_idx on public.call_logs (user_id, created_at desc);

create table if not exists public.twilio_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid references public.twilio_connections (id) on delete set null,
  message_sid text,
  channel text not null default 'sms' check (channel in ('sms', 'whatsapp')),
  direction text not null check (direction in ('inbound', 'outbound')),
  from_number text not null,
  to_number text not null,
  body text not null,
  status text not null default 'queued',
  error text,
  contact_id text,
  thread_key text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists twilio_messages_sid_idx on public.twilio_messages (message_sid) where message_sid is not null;
create index if not exists twilio_messages_thread_idx on public.twilio_messages (user_id, thread_key, created_at);

alter table public.twilio_connections enable row level security;
alter table public.twilio_connection_secrets enable row level security;
alter table public.call_logs enable row level security;
alter table public.twilio_messages enable row level security;

-- Conexiones: cada usuario ve y administra solo la suya (sin secretos).
drop policy if exists twilio_connections_select on public.twilio_connections;
create policy twilio_connections_select on public.twilio_connections for select using (auth.uid() = user_id);
drop policy if exists twilio_connections_update on public.twilio_connections;
create policy twilio_connections_update on public.twilio_connections for update using (auth.uid() = user_id);
drop policy if exists twilio_connections_delete on public.twilio_connections;
create policy twilio_connections_delete on public.twilio_connections for delete using (auth.uid() = user_id);
-- (INSERT solo vía Edge Function con service role, como gmail-oauth-callback.)

-- Secretos: SIN políticas a propósito — ni el dueño puede leerlos desde el navegador.

-- Llamadas: lectura para el dueño; escritura vía Edge Functions.
drop policy if exists call_logs_select on public.call_logs;
create policy call_logs_select on public.call_logs for select using (auth.uid() = user_id);

-- Mensajes: lectura para el dueño; escritura vía Edge Functions.
drop policy if exists twilio_messages_select on public.twilio_messages;
create policy twilio_messages_select on public.twilio_messages for select using (auth.uid() = user_id);

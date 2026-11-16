-- Omni CRM · Gmail de verdad (OAuth con Google + Gmail API a través de Edge Functions)
-- Aplicar con: node scripts/apply-migration.mjs supabase/gmail.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Idempotente.
--
-- connected_accounts:        una cuenta de Google conectada por usuario de Supabase Auth (user_id = auth.uid()).
--                            status: active | error | disabled · last_error / last_checked_at los rellena la
--                            comprobación real (gmail.users.getProfile) · last_synced_at la última sincronización.
-- connected_account_tokens:  los tokens OAuth (access_token, refresh_token, caducidad). RLS activada SIN políticas:
--                            ningún cliente (ni el dueño) puede leerlos; solo las Edge Functions con la service
--                            role. El navegador nunca ve los tokens.
-- inbox_messages:            los últimos mensajes INBOX traídos por gmail-sync (uno por mensaje de Gmail), con el
--                            contacto emparejado por correo y la conversación de la Bandeja de entrada a la que
--                            se importó (conversation_id / imported_at los rellena la app).
-- Seguridad: cada usuario solo ve sus filas (auth.uid() = user_id). Las inserciones en connected_accounts las hace
-- la Edge Function gmail-oauth-callback con la service role; la app solo lee, actualiza y borra lo suyo.

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail')),
  email text not null,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'error', 'disabled')),
  last_error text,
  last_checked_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists connected_accounts_user_provider_email_idx on public.connected_accounts (user_id, provider, lower(email));

create table if not exists public.connected_account_tokens (
  account_id uuid primary key references public.connected_accounts (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_type text not null default 'Bearer',
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  gmail_id text not null,
  thread_id text,
  rfc_message_id text,
  from_email text,
  from_name text,
  to_email text,
  subject text not null default '',
  snippet text not null default '',
  body_text text not null default '',
  body_html text not null default '',
  received_at timestamptz not null default now(),
  unread boolean not null default false,
  labels text[] not null default '{}',
  contact_id bigint,
  conversation_id uuid,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, gmail_id)
);
create index if not exists inbox_messages_user_received_idx on public.inbox_messages (user_id, received_at desc);
create index if not exists inbox_messages_thread_idx on public.inbox_messages (account_id, thread_id);

-- ============ SEGURIDAD (RLS): solo el dueño ============
alter table public.connected_accounts enable row level security;
alter table public.connected_account_tokens enable row level security;
alter table public.inbox_messages enable row level security;

drop policy if exists "owner reads connected_accounts" on public.connected_accounts;
create policy "owner reads connected_accounts" on public.connected_accounts for select to authenticated using (auth.uid() = user_id);
drop policy if exists "owner updates connected_accounts" on public.connected_accounts;
create policy "owner updates connected_accounts" on public.connected_accounts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner deletes connected_accounts" on public.connected_accounts;
create policy "owner deletes connected_accounts" on public.connected_accounts for delete to authenticated using (auth.uid() = user_id);

-- connected_account_tokens: sin políticas a propósito (solo la service role de las Edge Functions).

drop policy if exists "owner reads inbox_messages" on public.inbox_messages;
create policy "owner reads inbox_messages" on public.inbox_messages for select to authenticated using (auth.uid() = user_id);
drop policy if exists "owner updates inbox_messages" on public.inbox_messages;
create policy "owner updates inbox_messages" on public.inbox_messages for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner deletes inbox_messages" on public.inbox_messages;
create policy "owner deletes inbox_messages" on public.inbox_messages for delete to authenticated using (auth.uid() = user_id);

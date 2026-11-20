-- Omni CRM · Secuencias (Ventas › Secuencias)
-- Aplicar con: node scripts/apply-migration.mjs supabase/sequences.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- sequences:            una secuencia por fila (name, description, folder, owner_id, template_key = plantilla preelaborada
--                       de la que nació, exclusion = criterios de exclusión, deleted_at = en la papelera).
-- sequence_steps:       los pasos en orden (position), type = auto_email | manual_email | call | task | inmail | connection,
--                       delay_days = días laborables desde el paso anterior, subject/body (HTML con tokens y [[MARCADORES]]).
-- sequence_enrollments: current_step es el ordinal pendiente (1-based); next_step_at es su vencimiento.
-- Ejecutar también sequence-process.sql para habilitar el ejecutor. Ver docs/sequence-process.md.
-- Las 6 secuencias preelaboradas se siembran con template_key y prebuilt = true (no cuentan en la lista).
-- Misma seguridad que el resto de tablas. Idempotente: no duplica la semilla.

create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  description text not null default '',
  folder text not null default '',
  owner_id text not null default '',
  template_key text not null default '',
  prebuilt boolean not null default false,
  dynamic boolean not null default false,
  exclusion jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences (id) on delete cascade,
  position int not null default 0,
  type text not null default 'auto_email',
  delay_days int not null default 0,
  title text not null default '',
  subject text not null default '',
  body text not null default '',
  template_name text not null default '',
  version text not null default 'A',
  reply_to_previous boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sequence_steps_seq_idx on public.sequence_steps (sequence_id, position);
create table if not exists public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences (id) on delete cascade,
  contact_id bigint,
  contact_name text not null default '',
  company_id bigint,
  company_name text not null default '',
  enrolled_by text not null default '',
  sender_account_id uuid,
  status text not null default 'active',
  current_step int not null default 1,
  next_step_at timestamptz,
  placeholders jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sequence_enrollments_seq_idx on public.sequence_enrollments (sequence_id);
create table if not exists public.sequence_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.sequence_enrollments enable row level security;
alter table public.sequence_folders enable row level security;
do $$
declare t text;
begin
  foreach t in array array['sequences', 'sequence_steps', 'sequence_enrollments', 'sequence_folders'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'anon full access') then
      execute format('create policy "anon full access" on public.%I for all to anon using (true) with check (true)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'authenticated full access') then
      execute format('create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- ===== Semilla: carpetas y secuencias [Prueba] (las preelaboradas y las inscripciones las siembra la app al cargar) =====
insert into public.sequence_folders (id, name) values
  ('d6000000-0000-4000-8000-000000000001', 'Ventas'),
  ('d6000000-0000-4000-8000-000000000002', 'Clientes')
on conflict (name) do nothing;

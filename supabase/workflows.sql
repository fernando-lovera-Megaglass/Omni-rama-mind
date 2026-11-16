-- Omni CRM · Workflows (Automatización › Workflows)
-- Aplicar con: node scripts/apply-migration.mjs supabase/workflows.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- workflows:            un workflow por fila (object_type contacts|companies|deals|tickets, status draft|published|off,
--                       trigger = grupos de condiciones (OR entre grupos, AND dentro) + reinscripción, deleted_at = eliminado).
-- workflow_actions:     las acciones en orden (position); parent_id + branch ('yes'|'no') cuelgan de una rama if/then.
-- workflow_enrollments: los registros inscritos al publicar y el registro de cada acción ejecutada (log).
-- Misma seguridad que el resto de tablas. La semilla [Prueba] la crea la app al cargar si no hay workflows.

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  description text not null default '',
  folder text not null default '',
  object_type text not null default 'contacts',
  status text not null default 'draft',
  trigger jsonb not null default '{"groups":[],"reenroll":false}'::jsonb,
  created_by text not null default '',
  deleted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.workflow_actions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  parent_id uuid,
  branch text not null default '',
  position int not null default 0,
  type text not null default 'notify_app',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workflow_actions_wf_idx on public.workflow_actions (workflow_id, position);
create table if not exists public.workflow_enrollments (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  object_type text not null default 'contacts',
  record_id bigint,
  record_name text not null default '',
  status text not null default 'completed',
  actions_run int not null default 0,
  log jsonb not null default '[]'::jsonb,
  enrolled_at timestamptz not null default now()
);
create index if not exists workflow_enrollments_wf_idx on public.workflow_enrollments (workflow_id, enrolled_at desc);

alter table public.workflows enable row level security;
alter table public.workflow_actions enable row level security;
alter table public.workflow_enrollments enable row level security;
do $$
declare t text;
begin
  foreach t in array array['workflows', 'workflow_actions', 'workflow_enrollments'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'anon full access') then
      execute format('create policy "anon full access" on public.%I for all to anon using (true) with check (true)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'authenticated full access') then
      execute format('create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

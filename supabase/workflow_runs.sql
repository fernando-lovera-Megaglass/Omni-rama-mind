-- Omni CRM · Motor de workflows: inscripciones en ejecución (Automatización › Workflows)
-- Aplicar con: node scripts/apply-migration.mjs supabase/workflow_runs.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Requiere supabase/workflows.sql.
--
-- workflow_runs: una fila por registro inscrito en un workflow (a mano desde la ficha o al publicar).
--   workflow_id        → el workflow (se borra en cascada con él)
--   record_type        → contacts | companies | deals | tickets
--   record_id          → el id del registro inscrito (record_name solo para listarlo sin consultar)
--   step_actual        → índice del siguiente paso a ejecutar en el recorrido del workflow (0 = la primera acción)
--   estado             → active (ejecutándose) | waiting (esperando un retraso) | completed | failed | cancelled
--   proxima_ejecucion  → cuándo debe continuar un run en espera (null si no espera); el verificador de la app
--                        procesa los runs vencidos al cargar y cada minuto con la app abierta
--   log                → acciones ejecutadas [{ at, actionId, type, title, ok, result, pending }]
--   jumps              → saltos «Ir a otra acción» ya hechos (máximo 3 por inscripción, evita bucles)
-- Misma seguridad que el resto de tablas.

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  record_type text not null default 'contacts',
  record_id bigint not null,
  record_name text not null default '',
  step_actual int not null default 0,
  estado text not null default 'active',
  proxima_ejecucion timestamptz,
  log jsonb not null default '[]'::jsonb,
  jumps int not null default 0,
  enrolled_by text not null default '',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists workflow_runs_wf_idx on public.workflow_runs (workflow_id, started_at desc);
create index if not exists workflow_runs_due_idx on public.workflow_runs (estado, proxima_ejecucion);
create index if not exists workflow_runs_record_idx on public.workflow_runs (record_type, record_id);

alter table public.workflow_runs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workflow_runs' and policyname = 'anon full access') then
    create policy "anon full access" on public.workflow_runs for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workflow_runs' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on public.workflow_runs for all to authenticated using (true) with check (true);
  end if;
end $$;

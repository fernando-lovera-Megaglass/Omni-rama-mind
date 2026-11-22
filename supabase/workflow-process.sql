-- Omni CRM · Ejecutor de workflows (workflow-process): reanuda los runs en espera de un retraso sin la app abierta.
-- Local/pendiente. Aplicar después de workflows.sql y workflow_runs.sql:
--   node scripts/apply-migration.mjs supabase/workflow-process.sql   (o pegarlo en el SQL Editor)
-- Mismo patrón que sequence-process.sql: RPC security definer solo para la service role, reserva con
-- `for update skip locked`, y la Edge Function supabase/functions/workflow-process que las invoca cada minuto
-- (scripts/local-scheduler.mjs / scripts/remote-scheduler.mjs --functions workflow-process). Repetible.
--
-- workflow_runs.claimed_until: reserva del ejecutor mientras avanza un run (null = libre). El verificador de la app
-- (src/workflow-engine.js) no toca un run reservado; una reserva caducada (5 min) se considera abandonada.
alter table public.workflow_runs add column if not exists claimed_until timestamptz;
create index if not exists workflow_runs_claim_idx on public.workflow_runs (claimed_until) where claimed_until is not null;

-- Runs vencidos: en espera con proxima_ejecucion cumplida, o activos abandonados (sin cambios desde hace 2 min:
-- una pestaña cerrada a mitad de ejecución), de workflows no eliminados y sin reserva vigente. Lotes de 100.
create or replace function public.workflow_due(p_now timestamptz)
returns table(id uuid) language sql security definer set search_path = public as $$
  select r.id from public.workflow_runs r
  join public.workflows w on w.id = r.workflow_id and w.deleted_at is null
  where ((r.estado = 'waiting' and r.proxima_ejecucion is not null and r.proxima_ejecucion <= least(p_now, now()))
      or (r.estado = 'active' and r.updated_at <= least(p_now, now()) - interval '2 minutes'))
    and (r.claimed_until is null or r.claimed_until < now())
  order by r.proxima_ejecucion nulls first, r.started_at, r.id limit 100;
$$;
revoke all on function public.workflow_due(timestamptz) from public, anon, authenticated;
grant execute on function public.workflow_due(timestamptz) to service_role;

-- Reserva un run vencido (skip locked: dos invocaciones simultáneas nunca lo toman las dos) y lo devuelve.
create or replace function public.workflow_claim(p_id uuid)
returns setof public.workflow_runs language plpgsql security definer set search_path = public as $$
declare r public.workflow_runs;
begin
  select * into r from public.workflow_runs
    where id = p_id
      and ((estado = 'waiting' and proxima_ejecucion is not null and proxima_ejecucion <= now())
        or (estado = 'active' and updated_at <= now() - interval '2 minutes'))
      and (claimed_until is null or claimed_until < now())
    for update skip locked;
  if not found then return; end if;
  if not exists (select 1 from public.workflows where id = r.workflow_id and deleted_at is null) then return; end if;
  update public.workflow_runs set claimed_until = now() + interval '5 minutes', estado = 'active', updated_at = now()
    where id = p_id returning * into r;
  return next r;
end $$;
revoke all on function public.workflow_claim(uuid) from public, anon, authenticated;
grant execute on function public.workflow_claim(uuid) to service_role;

-- Guarda el avance de un run reservado: paso siguiente, estado (waiting | completed | failed), próxima ejecución,
-- log y saltos, y libera la reserva. Si mientras tanto la app lo canceló, conserva la cancelación y devuelve false.
create or replace function public.workflow_finish(p_id uuid, p_step int, p_estado text, p_next timestamptz, p_log jsonb, p_jumps int)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.workflow_runs;
begin
  if p_estado not in ('waiting', 'completed', 'failed') then raise exception 'Estado no permitido: %', p_estado; end if;
  select * into r from public.workflow_runs where id = p_id for update;
  if not found or r.claimed_until is null then return false; end if;
  if r.estado not in ('active', 'waiting') then
    update public.workflow_runs set claimed_until = null where id = p_id;
    return false;
  end if;
  update public.workflow_runs set step_actual = p_step, estado = p_estado, proxima_ejecucion = p_next, log = p_log, jumps = p_jumps,
    claimed_until = null, updated_at = now(),
    finished_at = case when p_estado in ('completed', 'failed') then now() else null end
    where id = p_id;
  return true;
end $$;
revoke all on function public.workflow_finish(uuid, int, text, timestamptz, jsonb, int) from public, anon, authenticated;
grant execute on function public.workflow_finish(uuid, int, text, timestamptz, jsonb, int) to service_role;

-- Inscripciones históricas de workflow_enrollments que se quedaron 'in_progress' en un retraso simulado (el motor
-- anterior nunca las reanudaba): pasan al modelo de runs como 'waiting' con proxima_ejecucion = now(), paso
-- siguiente = acciones ya registradas (el recorrido de esos workflows es lineal) y el log convertido; el retraso
-- queda marcado como pendiente para que la reanudación lo anote. La inscripción original se marca 'migrated'
-- (la app la oculta y la lista como run). Repetible: no duplica.
insert into public.workflow_runs (workflow_id, record_type, record_id, record_name, step_actual, estado, proxima_ejecucion, log, jumps, enrolled_by, started_at, updated_at)
select e.workflow_id, e.object_type, e.record_id, e.record_name, jsonb_array_length(coalesce(e.log, '[]'::jsonb)), 'waiting', now(),
  jsonb_build_array(jsonb_build_object('at', e.enrolled_at, 'actionId', null, 'type', 'migration', 'title', 'Migrada desde workflow_enrollments', 'ok', true,
    'result', 'Inscripción histórica en curso migrada al ejecutor; continúa en el siguiente paso', 'migratedFrom', e.id))
  || coalesce((select jsonb_agg(jsonb_build_object('at', e.enrolled_at, 'actionId', null, 'type', l->>'action', 'title', coalesce(l->>'title', l->>'action'), 'ok', coalesce((l->>'ok')::boolean, true),
       'result', coalesce(l->>'result', ''), 'pending', (l->>'action') = 'delay', 'wait', case when (l->>'action') = 'delay' then regexp_replace(coalesce(l->>'result', ''), '^Esperando ', '') else null end) order by ord)
     from jsonb_array_elements(coalesce(e.log, '[]'::jsonb)) with ordinality as x(l, ord)), '[]'::jsonb),
  0, 'migración', e.enrolled_at, now()
from public.workflow_enrollments e
join public.workflows w on w.id = e.workflow_id
where e.status = 'in_progress' and e.record_id is not null
  and not exists (select 1 from public.workflow_runs r where r.log->0->>'migratedFrom' = e.id::text);
update public.workflow_enrollments e set status = 'migrated'
  where e.status = 'in_progress' and exists (select 1 from public.workflow_runs r where r.log->0->>'migratedFrom' = e.id::text);

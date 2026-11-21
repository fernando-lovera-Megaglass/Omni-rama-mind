-- Local/pending migration. Apply after sequences.sql, schema.sql and gmail.sql.
-- current_step is a 1-based ordinal over steps sorted by position (positions start at 0).
alter table public.sequence_enrollments add column if not exists sender_account_id uuid;
alter table public.sequence_enrollments add column if not exists extra jsonb not null default '{}'::jsonb;
create index if not exists sequence_enrollments_due_idx
  on public.sequence_enrollments(next_step_at) where status = 'active';
create table if not exists public.sequence_step_runs (
  enrollment_id uuid not null references public.sequence_enrollments(id) on delete cascade,
  step_number int not null,
  status text not null default 'processing' check (status in ('processing', 'done', 'error', 'cancelled')),
  receipt jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (enrollment_id, step_number)
);
alter table public.sequence_step_runs enable row level security;
grant all on public.sequence_step_runs to service_role;
-- No browser policies: only the service role may access execution records.

create or replace function public.sequence_claim(p_id uuid)
returns setof public.sequence_enrollments language plpgsql security definer set search_path = public as $$
declare e public.sequence_enrollments; claimed int;
begin
  select * into e from public.sequence_enrollments
    where id = p_id and status = 'active' and next_step_at <= now() and not (extra ? 'waiting_task') for update skip locked;
  if not found then return; end if;
  if not exists (select 1 from public.sequences where id = e.sequence_id and deleted_at is null) then return; end if;
  insert into public.sequence_step_runs(enrollment_id, step_number) values(e.id, e.current_step)
    on conflict do nothing;
  get diagnostics claimed = row_count;
  if claimed = 1 then return next e; end if;
end $$;

create or replace function public.sequence_finish(p_id uuid, p_step int, p_next timestamptz, p_type text, p_title text, p_receipt jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.sequence_enrollments; task_id bigint; step_position int;
begin
  select * into e from public.sequence_enrollments where id = p_id for update;
  if not found then return false; end if;
  if not exists (select 1 from public.sequence_step_runs where enrollment_id = p_id and step_number = p_step and status = 'processing') then return false; end if;
  -- Preserve a terminal status set while the network request was in flight.
  update public.sequence_step_runs set status = 'done', receipt = p_receipt, updated_at = now()
    where enrollment_id = p_id and step_number = p_step;
  if e.status <> 'active' or e.current_step <> p_step then return false; end if;
  if p_type <> 'auto_email' then
    select position into step_position from public.sequence_steps where sequence_id = e.sequence_id order by position offset (p_step - 1) limit 1;
    insert into public.tasks(name, type, status, priority, owner, contact_id, contact, due, extra)
      values(coalesce(nullif(p_title, ''), 'Paso manual de secuencia'),
        case p_type when 'call' then 'Llamada' when 'manual_email' then 'Correo' else 'Tarea' end,
        'todo', 'medium', e.enrolled_by, e.contact_id, e.contact_name, now(),
        jsonb_build_object('sequenceId', e.sequence_id, 'enrollmentId', e.id, 'stepPosition', step_position)) returning id into task_id;
    update public.sequence_enrollments set next_step_at = null,
      extra = extra || jsonb_build_object('waiting_task', task_id), updated_at = now() where id = p_id;
    return true;
  end if;
  update public.sequence_enrollments set current_step = p_step + 1, next_step_at = p_next,
    status = case when p_next is null then 'finished' else 'active' end, updated_at = now(),
    stats = case when p_type = 'auto_email' then jsonb_set(stats, '{sent}', to_jsonb(coalesce((stats->>'sent')::int, 0) + 1)) else stats end
    where id = p_id;
  return true;
end $$;
revoke all on function public.sequence_claim(uuid) from public, anon, authenticated;
revoke all on function public.sequence_finish(uuid, int, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.sequence_claim(uuid) to service_role;
grant execute on function public.sequence_finish(uuid, int, timestamptz, text, text, jsonb) to service_role;

-- Exclude claimed/error rows before LIMIT so a broken batch cannot starve later enrollments.
create or replace function public.sequence_due(p_now timestamptz)
returns table(id uuid) language sql security definer set search_path = public as $$
  select e.id from public.sequence_enrollments e
  join public.sequences s on s.id = e.sequence_id and s.deleted_at is null
  where e.status = 'active' and not (e.extra ? 'waiting_task') and e.next_step_at <= least(p_now, now())
    and not exists (select 1 from public.sequence_step_runs r where r.enrollment_id = e.id and r.step_number = e.current_step)
  order by e.next_step_at, e.id limit 100;
$$;
revoke all on function public.sequence_due(timestamptz) from public, anon, authenticated;
grant execute on function public.sequence_due(timestamptz) to service_role;

-- Called only after saving a completed task. Row locking makes retries idempotent.
create or replace function public.sequence_complete_task(p_task bigint, p_next timestamptz)
returns setof public.sequence_enrollments language plpgsql security definer set search_path = public as $$
declare t public.tasks; e public.sequence_enrollments; pos int; has_next boolean;
begin
  select * into t from public.tasks where id = p_task and status = 'done';
  if not found or t.extra->>'enrollmentId' is null then return; end if;
  select * into e from public.sequence_enrollments where id::text = t.extra->>'enrollmentId' for update;
  if not found or e.status <> 'active' or e.extra->>'waiting_task' is distinct from p_task::text
    or e.sequence_id::text is distinct from t.extra->>'sequenceId' then return; end if;
  select position into pos from public.sequence_steps where sequence_id = e.sequence_id order by position offset (e.current_step - 1) limit 1;
  if pos::text is distinct from t.extra->>'stepPosition' then return; end if;
  select exists(select 1 from public.sequence_steps where sequence_id = e.sequence_id order by position offset e.current_step limit 1) into has_next;
  if has_next and p_next is null then raise exception 'Next step date required'; end if;
  return query update public.sequence_enrollments set current_step = e.current_step + 1,
    next_step_at = case when has_next then p_next else null end,
    status = case when has_next then 'active' else 'finished' end,
    extra = extra - 'waiting_task', updated_at = now() where id = e.id returning *;
end $$;
revoke all on function public.sequence_complete_task(bigint, timestamptz) from public;
-- Match the existing CRM access policies; execution RPCs remain service-only.
grant execute on function public.sequence_complete_task(bigint, timestamptz) to anon, authenticated, service_role;

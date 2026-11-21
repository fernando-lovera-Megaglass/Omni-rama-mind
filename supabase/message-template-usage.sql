-- LOCAL / PENDING. Do not apply automatically.
-- Requires message_templates.sql, sequences.sql and sequence-process.sql.
alter table public.message_templates add column if not exists uses bigint not null default 0 check (uses >= 0);
alter table public.message_templates add column if not exists last_used_at timestamptz;
alter table public.sequence_steps add column if not exists template_id uuid references public.message_templates(id) on delete set null;

create or replace function public.record_template_use(p_id uuid)
returns setof public.message_templates language sql security invoker set search_path = public as $$
  update public.message_templates set uses = uses + 1, last_used_at = now() where id = p_id returning *;
$$;
revoke all on function public.record_template_use(uuid) from public;
grant execute on function public.record_template_use(uuid) to anon, authenticated, service_role;

-- The run transition and increment share the finish transaction. Repeated finish
-- calls cannot increment again. Manual task creation is never a sent email.
create or replace function public.sequence_record_template_use()
returns trigger language plpgsql security definer set search_path = public as $$
declare template uuid;
begin
  if new.status = 'done' and old.status = 'processing' and new.receipt is not null and new.receipt <> 'null'::jsonb then
    select s.template_id into template from public.sequence_steps s
      join public.sequence_enrollments e on e.sequence_id = s.sequence_id
      where e.id = new.enrollment_id and s.type = 'auto_email'
        and s.position = (select position from public.sequence_steps where sequence_id = e.sequence_id order by position offset (new.step_number - 1) limit 1);
    if template is not null then perform public.record_template_use(template); end if;
  end if;
  return new;
end $$;
revoke all on function public.sequence_record_template_use() from public;
drop trigger if exists sequence_template_usage on public.sequence_step_runs;
create trigger sequence_template_usage after update on public.sequence_step_runs
  for each row execute function public.sequence_record_template_use();

-- Apply before releasing the tasks UI. Shared CRM queues, authenticated access.
begin;
create table if not exists public.task_queues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create unique index if not exists task_queues_name_unique on public.task_queues (lower(name));
alter table public.task_queues enable row level security;
drop policy if exists "authenticated queues" on public.task_queues;
create policy "authenticated queues" on public.task_queues for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.task_queues to authenticated;
alter table public.tasks add column if not exists queue_id uuid references public.task_queues(id) on delete set null;
create index if not exists tasks_queue_id_idx on public.tasks(queue_id);
-- Preserve legacy names without interpreting them as foreign keys.
insert into public.task_queues(name)
select distinct on (lower(btrim(extra->>'hs_queue_membership_ids'))) btrim(extra->>'hs_queue_membership_ids')
from public.tasks where char_length(btrim(extra->>'hs_queue_membership_ids')) between 1 and 100
and lower(btrim(extra->>'hs_queue_membership_ids')) <> 'sin cola'
on conflict do nothing;
update public.tasks t set queue_id = q.id from public.task_queues q
where t.queue_id is null and lower(btrim(t.extra->>'hs_queue_membership_ids')) = lower(q.name);
-- Retire the legacy value so rerunning this migration cannot restore a deleted membership.
update public.tasks set extra = extra - 'hs_queue_membership_ids' where extra ? 'hs_queue_membership_ids';
commit;

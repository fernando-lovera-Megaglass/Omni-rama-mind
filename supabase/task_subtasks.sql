-- Additive migration. Apply to the target database before releasing the UI.
begin;
alter table public.tasks
  add column if not exists parent_id bigint references public.tasks(id) on delete cascade;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_parent_not_self' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_parent_not_self check (parent_id is distinct from id);
  end if;
end $$;
create index if not exists tasks_parent_id_idx on public.tasks(parent_id);
commit;

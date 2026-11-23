-- Local migration only. Requires rls_team.sql. No anonymous access.
begin;
create table if not exists public.import_jobs (
  id bigint primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  team text not null default '',
  objeto text not null,
  nombre text not null,
  fuente text not null default '',
  sistema text not null default '',
  estado text not null check (estado in ('STARTED','DEFERRED','PROCESSING','DONE','FAILED','CANCELED')),
  new_count integer not null default 0 check (new_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  associations_count integer not null default 0 check (associations_count >= 0),
  errors_count integer not null default 0 check (errors_count >= 0),
  undo_ledger jsonb not null default '{}',
  row_data jsonb not null default '{}',
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
-- Derive team server-side and keep original author/team on updates.
create or replace function public.import_jobs_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    new.user_id := auth.uid();
    select team into new.team from public.team_members where user_id = auth.uid() and active;
    if new.team is null then raise exception 'Active team membership required'; end if;
  else
    new.user_id := old.user_id;
    new.team := old.team;
  end if;
  return new;
end;
$$;
drop trigger if exists import_jobs_owner on public.import_jobs;
create trigger import_jobs_owner before insert or update on public.import_jobs for each row execute function public.import_jobs_owner();
alter table public.import_jobs enable row level security;
drop policy if exists import_jobs_team on public.import_jobs;
create policy import_jobs_team on public.import_jobs for all to authenticated
using (exists (select 1 from public.team_members m where m.user_id = auth.uid() and m.active and m.team = import_jobs.team))
with check (exists (select 1 from public.team_members m where m.user_id = auth.uid() and m.active and m.team = import_jobs.team));
revoke all on public.import_jobs from anon;
grant select, insert, update on public.import_jobs to authenticated;
create index if not exists import_jobs_team_created on public.import_jobs(team, created_at desc);
commit;

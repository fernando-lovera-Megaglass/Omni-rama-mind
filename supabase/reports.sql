-- Migración local pendiente de aplicar. Informes privados por usuario.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "own reports" on public.reports;
create policy "own reports" on public.reports for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.reports to authenticated;
create index if not exists reports_user_created_idx on public.reports(user_id, created_at desc);

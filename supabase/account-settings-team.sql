-- Shared settings for the single-team CRM. Apply AFTER user_settings.sql and rls_team.sql.
-- Supersedes account-settings-authenticated.sql; do not apply that older alternative afterward.
-- Keep existing authenticated read access; only active team members may write.
begin;
alter table public.account_settings enable row level security;
drop policy if exists account_settings_admin on public.account_settings;
drop policy if exists account_settings_authenticated on public.account_settings;
drop policy if exists "team access" on public.account_settings;
drop policy if exists account_settings_read on public.account_settings;
create policy account_settings_read on public.account_settings
for select to authenticated using (true);
drop policy if exists account_settings_team on public.account_settings;
create policy account_settings_team on public.account_settings
for all to authenticated
using (public.is_team_member())
with check (public.is_team_member() and scope = 'account');
revoke all on public.account_settings from anon;
grant select, insert, update, delete on public.account_settings to authenticated;
commit;

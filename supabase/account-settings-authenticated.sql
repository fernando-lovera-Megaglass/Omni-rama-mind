-- SUPERSEDED: use account-settings-team.sql. This older alternative permits non-members to write.
-- Option (b): one CRM account per Supabase project; all authenticated users
-- may manage shared settings. Apply AFTER user_settings.sql and rls_team.sql.
-- This does not grant access to anonymous clients or change personal settings.
begin;
alter table public.account_settings enable row level security;
drop policy if exists account_settings_admin on public.account_settings;
drop policy if exists account_settings_read on public.account_settings;
drop policy if exists "team access" on public.account_settings;
drop policy if exists account_settings_authenticated on public.account_settings;
create policy account_settings_authenticated on public.account_settings
for all to authenticated
using (true) with check (scope = 'account');
revoke all on public.account_settings from anon;
grant select, insert, update, delete on public.account_settings to authenticated;
commit;

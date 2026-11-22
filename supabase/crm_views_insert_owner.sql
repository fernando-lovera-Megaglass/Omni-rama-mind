-- Pendiente de aplicación remota: este cambio se entrega solo como código local.
-- Aplicar con: node scripts/apply-migration.mjs supabase/crm_views_insert_owner.sql
-- Los ejemplos a nombre de terceros deben sembrarse desde un backend con service role.
begin;
drop policy if exists crm_views_insert on public.crm_views;
create policy crm_views_insert on public.crm_views for insert to authenticated
with check (owner_id = auth.uid());

-- Conserva la restricción de miembro activo de crm_views.sql, incluso si otra
-- política permisiva permite INSERT. No valida los valores del campo teams.
drop policy if exists crm_views_insert_member on public.crm_views;
create policy crm_views_insert_member on public.crm_views as restrictive for insert to authenticated
with check (public.is_team_member());
commit;

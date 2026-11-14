-- Omni CRM · Papelera (soft-delete) de contactos, empresas y negocios
-- Aplicar con: node scripts/apply-migration.mjs supabase/soft_delete.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- Eliminar un registro desde la app ya no lo borra: escribe deleted_at. La app no muestra las filas con
-- deleted_at y las lista en «Acciones › Restaurar registros eliminados», donde «Restaurar» vuelve a poner
-- deleted_at en null. Idempotente.

alter table public.contacts  add column if not exists deleted_at timestamptz;
alter table public.companies add column if not exists deleted_at timestamptz;
alter table public.deals     add column if not exists deleted_at timestamptz;
create index if not exists contacts_deleted_at_idx  on public.contacts (deleted_at) where deleted_at is not null;
create index if not exists companies_deleted_at_idx on public.companies (deleted_at) where deleted_at is not null;
create index if not exists deals_deleted_at_idx     on public.deals (deleted_at) where deleted_at is not null;

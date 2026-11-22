-- Omni CRM · Papelera (soft-delete) de tickets
-- Aplicar con: node scripts/apply-migration.mjs supabase/soft_delete_tickets.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Idempotente. Estado de aplicación: scripts/applied-migrations.json.
--
-- Igual que contactos, empresas y negocios (soft_delete.sql): eliminar un ticket desde la lista o la ficha ya no
-- borra la fila, escribe deleted_at. La app no descarga las filas con deleted_at (fetchTable / server-list las
-- excluyen con `deleted_at is null`), las lista en «Acciones › Restaurar registros eliminados» y «Restaurar»
-- vuelve a poner deleted_at en null, con el ticket de vuelta en su pipeline y estado. Las tareas no se reciclan.

alter table public.tickets add column if not exists deleted_at timestamptz;
create index if not exists tickets_deleted_at_idx on public.tickets (deleted_at) where deleted_at is not null;

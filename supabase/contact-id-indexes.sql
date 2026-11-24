-- Contact associations: tickets queries must exclude soft-deleted rows to use
-- the partial index. Tasks has no deleted_at column.
BEGIN;
CREATE INDEX IF NOT EXISTS tickets_contact_id_idx
  ON public.tickets (contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_contact_id_idx
  ON public.tasks (contact_id);
COMMIT;

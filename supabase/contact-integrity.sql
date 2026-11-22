-- Apply ONLY after the dedupe script succeeds. This migration fails atomically on duplicates.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_live_email_unique
  ON public.contacts (lower(btrim(email)))
  WHERE btrim(email) <> '' AND deleted_at IS NULL;

COMMIT;

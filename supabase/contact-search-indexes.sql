-- Requires schema.sql and soft_delete.sql (do not reapply schema.sql to production).
-- Exact, case-insensitive lookup: lower(email) = lower($1) AND deleted_at IS NULL.
-- This B-tree does not accelerate email ILIKE '%term%' or email ILIKE $1.
BEGIN;
CREATE INDEX IF NOT EXISTS contacts_email_idx
  ON public.contacts (lower(email)) WHERE deleted_at IS NULL;

-- Full indexes also support relationship lookups involving archived deals.
CREATE INDEX IF NOT EXISTS deals_contact_id_idx ON public.deals (contact_id);
CREATE INDEX IF NOT EXISTS deals_company_id_idx ON public.deals (company_id);
COMMIT;

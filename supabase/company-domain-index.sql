-- Independent of contact-integrity.sql: non-unique, allows existing duplicates.
CREATE INDEX IF NOT EXISTS companies_domain_idx
  ON public.companies (lower(domain))
  WHERE deleted_at IS NULL;

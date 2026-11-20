-- Run inside a transaction. Locks prevent new references during the repair.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname = 'public' OR (quote_ident(schemaname)||'.'||quote_ident(tablename))::regclass IN
      (SELECT conrelid FROM pg_constraint WHERE contype='f' AND confrelid='public.contacts'::regclass)
    ORDER BY schemaname, tablename LOOP
    EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE', r.schemaname, r.tablename);
  END LOOP;
END $$;
CREATE TEMP TABLE contact_merge ON COMMIT DROP AS
SELECT id AS duplicate_id, canonical_id FROM (
  SELECT id, min(id) OVER (PARTITION BY lower(btrim(email))) AS canonical_id
  FROM public.contacts WHERE deleted_at IS NULL AND btrim(email) <> ''
) c WHERE id <> canonical_id;
SELECT m.*, row_to_json(c) AS duplicate_before FROM contact_merge m JOIN public.contacts c ON c.id=m.duplicate_id ORDER BY duplicate_id;

-- Merge bridge collisions before updating its unique (contact_id, company_id).
DO $$
DECLARE snapshot jsonb;
BEGIN
  IF to_regclass('public.contact_companies') IS NOT NULL THEN
    CREATE TEMP TABLE bridge_merge ON COMMIT DROP AS
    SELECT cc.id, first_value(cc.id) OVER (
      PARTITION BY coalesce(m.canonical_id, cc.contact_id), cc.company_id
      ORDER BY (m.canonical_id IS NULL) DESC, cc.id
    ) AS keep_id
    FROM public.contact_companies cc LEFT JOIN contact_merge m ON m.duplicate_id = cc.contact_id;
    SELECT jsonb_agg(to_jsonb(c)) INTO snapshot FROM public.contact_companies c
      JOIN bridge_merge b ON b.id=c.id WHERE b.keep_id IN (SELECT keep_id FROM bridge_merge GROUP BY keep_id HAVING count(*) > 1);
    RAISE NOTICE 'Bridge rows before merge: %', snapshot;
    UPDATE public.contact_companies cc SET is_primary = x.is_primary
    FROM (SELECT b.keep_id, bool_or(c.is_primary) AS is_primary
          FROM bridge_merge b JOIN public.contact_companies c ON c.id = b.id GROUP BY b.keep_id) x
    WHERE cc.id = x.keep_id;
    -- Snapshot includes labels on redundant edges for review/recovery.
    DELETE FROM public.contact_companies c USING bridge_merge b WHERE c.id = b.id AND b.id <> b.keep_id;
  END IF;
END $$;

DO $$
DECLARE r record; remaining bigint;
BEGIN
  -- Includes undeclared contact_id links, polymorphic references, and all single-column FKs.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.contacts'::regclass AND cardinality(conkey) <> 1) THEN
    RAISE EXCEPTION 'Composite contact FK requires explicit repair; rolling back';
  END IF;
  FOR r IN
    SELECT DISTINCT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS column_type,
      CASE WHEN a.attname = 'record_id' THEN
        CASE WHEN EXISTS (SELECT 1 FROM pg_attribute p WHERE p.attrelid=c.oid AND p.attname='record_type')
          THEN ' AND t.record_type = ''contacts''' ELSE ' AND t.object_type = ''contacts''' END
        ELSE '' END AS predicate
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind='r' AND (
      (n.nspname='public' AND a.attname='contact_id')
      OR (n.nspname='public' AND a.attname='record_id' AND EXISTS (SELECT 1 FROM pg_attribute p WHERE p.attrelid=c.oid AND p.attname IN ('record_type','object_type')))
      OR EXISTS (SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=c.oid
        AND f.confrelid='public.contacts'::regclass AND a.attnum=ANY(f.conkey)))
  LOOP
    EXECUTE format('UPDATE %I.%I t SET %I = m.canonical_id::%s FROM contact_merge m WHERE t.%I::text = m.duplicate_id::text%s',
      r.schema_name, r.table_name, r.column_name, r.column_type, r.column_name, r.predicate);
    EXECUTE format('SELECT count(*) FROM %I.%I t JOIN contact_merge m ON t.%I::text=m.duplicate_id::text WHERE true%s',
      r.schema_name, r.table_name, r.column_name, r.predicate) INTO remaining;
    IF remaining <> 0 THEN RAISE EXCEPTION 'Unrepaired references in %', r.table_name; END IF;
  END LOOP;
END $$;
UPDATE public.contacts c SET deleted_at = now() FROM contact_merge m WHERE c.id=m.duplicate_id;
SELECT count(*) AS duplicate_groups FROM (
  SELECT lower(btrim(email)) FROM public.contacts WHERE deleted_at IS NULL AND btrim(email) <> ''
  GROUP BY 1 HAVING count(*) > 1
) duplicates;

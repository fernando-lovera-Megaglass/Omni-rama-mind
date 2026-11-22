-- Run inside a transaction. Locks prevent new references during the repair.
-- Serialize with bootstrap before acquiring tables in a different order.
SELECT pg_advisory_xact_lock(714025, 1);
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
-- Inventory and scoring use persisted values, never UI demo decorations.
CREATE TEMP TABLE contact_inventory ON COMMIT DROP AS
SELECT c.id, lower(btrim(c.email)) AS email, c.created, to_jsonb(c) AS before,
  (SELECT count(*) FROM jsonb_each(to_jsonb(c) - ARRAY['id','created','deleted_at','extra','last_activity','last_activity_type']) e
   WHERE e.value NOT IN ('null'::jsonb, '""'::jsonb, '{}'::jsonb, '[]'::jsonb)) +
  (SELECT count(*) FROM jsonb_each(coalesce(c.extra,'{}')) e
   WHERE e.value NOT IN ('null'::jsonb, '""'::jsonb, '{}'::jsonb, '[]'::jsonb)) AS filled_fields,
  (SELECT count(*) FROM deals d WHERE d.contact_id=c.id) AS deals,
  (SELECT count(*) FROM tickets t WHERE t.contact_id=c.id) AS tickets,
  (SELECT count(*) FROM tasks t WHERE t.contact_id=c.id) AS tasks,
  0::bigint AS activities, 0::bigint AS enrollments
FROM public.contacts c WHERE c.deleted_at IS NULL AND btrim(c.email) <> '';
DO $$ BEGIN
  IF to_regclass('public.activities') IS NOT NULL THEN
    UPDATE contact_inventory i SET activities=(SELECT count(*) FROM public.activities a WHERE a.record_type='contacts' AND a.record_id=i.id);
  END IF;
  IF to_regclass('public.sequence_enrollments') IS NOT NULL THEN
    UPDATE contact_inventory i SET enrollments=(SELECT count(*) FROM public.sequence_enrollments e WHERE e.contact_id=i.id);
  END IF;
END $$;
CREATE TEMP TABLE contact_merge ON COMMIT DROP AS
SELECT id AS duplicate_id, canonical_id FROM (
  SELECT id, first_value(id) OVER (PARTITION BY email ORDER BY filled_fields DESC, created ASC NULLS LAST, id) AS canonical_id
  FROM contact_inventory
) c WHERE id <> canonical_id;
SELECT i.*, min(i.id) OVER (PARTITION BY i.email) AS lower_id,
 max(i.id) OVER (PARTITION BY i.email) AS higher_id
FROM contact_inventory i WHERE email IN (SELECT email FROM contact_inventory GROUP BY email HAVING count(*)>1)
ORDER BY email, id;
SELECT * FROM contact_merge ORDER BY canonical_id, duplicate_id;

-- Ambiguous identities require review before any write. Do not silently merge people
-- sharing a mailbox. The complete transaction rolls back, including safe pairs.
CREATE TEMP TABLE contact_merge_ambiguous ON COMMIT DROP AS
SELECT m.*, 'conflicting identity' AS review_reason
FROM contact_merge m JOIN contact_inventory i ON i.id=m.canonical_id
WHERE i.email IN (
 SELECT email FROM contact_inventory GROUP BY email
 HAVING count(DISTINCT nullif(lower(btrim(before->>'first')),''))>1
     OR count(DISTINCT nullif(lower(btrim(before->>'last')),''))>1
);
SELECT * FROM contact_merge_ambiguous ORDER BY canonical_id, duplicate_id;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM contact_merge_ambiguous) THEN
   RAISE EXCEPTION 'Ambiguous contact identities: review inventory; 0 merges committed';
 END IF;
END $$;
-- Like mergeRecords: retain principal values and fill empty scalar properties.
-- Full before images above include conflicting values for review and recovery.
DO $$
DECLARE m record; col record; patch jsonb; source jsonb; target jsonb; e record;
BEGIN
 FOR m IN SELECT * FROM contact_merge ORDER BY canonical_id, duplicate_id LOOP
  SELECT to_jsonb(c) INTO source FROM contacts c WHERE id=m.duplicate_id;
  SELECT to_jsonb(c) INTO target FROM contacts c WHERE id=m.canonical_id;
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.contacts'::regclass
    AND attnum>0 AND NOT attisdropped AND attgenerated='' AND attname NOT IN
    ('id','created','deleted_at','name','extra') LOOP
    IF target->col.attname IN ('null'::jsonb, '""'::jsonb) AND source->col.attname NOT IN ('null'::jsonb, '""'::jsonb) THEN
      EXECUTE format('UPDATE contacts SET %1$I=(jsonb_populate_record(NULL::contacts,$1)).%1$I WHERE id=$2',col.attname)
        USING source, m.canonical_id;
    END IF;
  END LOOP;
  patch := coalesce(target->'extra','{}');
  FOR e IN SELECT * FROM jsonb_each(coalesce(source->'extra','{}')) LOOP
    IF (patch->e.key IS NULL OR patch->e.key IN ('null'::jsonb,'""'::jsonb))
       AND jsonb_typeof(e.value) NOT IN ('object','array','null') THEN
      patch := jsonb_set(patch,ARRAY[e.key],e.value);
    END IF;
  END LOOP;
  UPDATE contacts SET extra=patch WHERE id=m.canonical_id;
 END LOOP;
END $$;

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

-- Match moveEnrollments: preserve history but cancel duplicate running enrollments.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
            AND table_name='sequence_enrollments' AND column_name='status') THEN
   WITH ranked AS (
     SELECT e.id, row_number() OVER (
       PARTITION BY coalesce(m.canonical_id,e.contact_id), e.sequence_id
       ORDER BY (m.canonical_id IS NULL) DESC, e.id
     ) AS position
     FROM sequence_enrollments e LEFT JOIN contact_merge m ON m.duplicate_id=e.contact_id
     WHERE e.status IN ('active','paused') AND coalesce(m.canonical_id,e.contact_id)
       IN (SELECT canonical_id FROM contact_merge)
   )
   UPDATE sequence_enrollments e SET status='unenrolled', next_step_at=NULL
   FROM ranked r WHERE e.id=r.id AND r.position>1;
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
      -- A declared FK is unconditional, even if its column is called record_id.
      CASE WHEN a.attname = 'record_id' AND NOT EXISTS (
        SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=c.oid
          AND f.confrelid='public.contacts'::regclass AND a.attnum=ANY(f.conkey)
      ) THEN
        CASE WHEN EXISTS (SELECT 1 FROM pg_attribute p WHERE p.attrelid=c.oid AND p.attname='record_type')
          THEN ' AND t.record_type = ''contacts''' ELSE ' AND t.object_type = ''contacts''' END
        ELSE '' END AS predicate
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind IN ('r','p') AND (
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
    EXECUTE format('SELECT count(*) FROM %I.%I t JOIN public.contacts c ON t.%I::text=c.id::text WHERE c.deleted_at IS NOT NULL%s',
      r.schema_name, r.table_name, r.column_name, r.predicate) INTO remaining;
    IF remaining <> 0 THEN RAISE EXCEPTION 'References to trashed contacts in %, rolling back', r.table_name; END IF;
  END LOOP;
END $$;
UPDATE public.contacts c SET deleted_at = now() FROM contact_merge m WHERE c.id=m.duplicate_id;
SELECT count(*) AS duplicate_groups FROM (
  SELECT lower(btrim(email)) FROM public.contacts WHERE deleted_at IS NULL AND btrim(email) <> ''
  GROUP BY 1 HAVING count(*) > 1
) duplicates;

DO $$
BEGIN
  IF EXISTS (
    SELECT lower(btrim(email)) FROM public.contacts
    WHERE deleted_at IS NULL AND btrim(email) <> ''
    GROUP BY 1 HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Live duplicate emails remain; rolling back'; END IF;
END $$;

-- Check existing orphans too, not only links touched by this run.
DO $$
DECLARE t text; n bigint;
BEGIN
 FOREACH t IN ARRAY ARRAY['deals','tickets'] LOOP
  EXECUTE format('SELECT count(*) FROM %I r LEFT JOIN contacts c ON c.id=r.contact_id WHERE r.contact_id IS NOT NULL AND c.id IS NULL',t) INTO n;
  RAISE NOTICE '% orphan contact references: %', t, n;
  IF n <> 0 THEN RAISE EXCEPTION 'Orphans in %, rolling back',t; END IF;
 END LOOP;
END $$;
SELECT count(*) AS merged_copies, count(DISTINCT canonical_id) AS merged_groups FROM contact_merge;

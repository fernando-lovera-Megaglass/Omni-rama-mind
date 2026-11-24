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
-- Inventory and field counts use persisted values, never UI demo decorations.
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
  SELECT id, first_value(id) OVER (PARTITION BY email ORDER BY filled_fields DESC, activities DESC, (deals+tickets+tasks+enrollments) DESC, id) AS canonical_id
  FROM contact_inventory
) c WHERE id <> canonical_id;
SELECT i.*, min(i.id) OVER (PARTITION BY i.email) AS lower_id,
 max(i.id) OVER (PARTITION BY i.email) AS higher_id
FROM contact_inventory i WHERE email IN (SELECT email FROM contact_inventory GROUP BY email HAVING count(*)>1)
ORDER BY email, id;
SELECT m.*, i.email, i.filled_fields AS duplicate_fields,
 k.filled_fields AS canonical_fields,
 'filled_fields DESC, activities DESC, associations DESC, id ASC' AS selection_rule
FROM contact_merge m JOIN contact_inventory i ON i.id=m.duplicate_id
JOIN contact_inventory k ON k.id=m.canonical_id
ORDER BY canonical_id, duplicate_id;

-- Email defines identity for this repair. Keep the richest persisted record.
-- Equal field counts prefer activity, then associations, then the smallest active ID. Before images retain conflicts.
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
    IF e.key LIKE 'assoc\_%' ESCAPE '\' AND jsonb_typeof(e.value)='array' THEN
      patch := jsonb_set(patch,ARRAY[e.key], (SELECT coalesce(jsonb_agg(value),'[]') FROM (SELECT DISTINCT value FROM jsonb_array_elements(coalesce(patch->e.key,'[]') || e.value)) a));
    ELSIF e.key LIKE 'assoc_labels_%' AND jsonb_typeof(e.value)='object' THEN
      patch := jsonb_set(patch,ARRAY[e.key],e.value || coalesce(patch->e.key,'{}'));
      target := jsonb_set(target,ARRAY['extra'],patch);
    ELSIF (patch->e.key IS NULL OR patch->e.key IN ('null'::jsonb,'""'::jsonb))
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
    EXECUTE format('SELECT count(*) FROM %I.%I t LEFT JOIN public.contacts c ON t.%I::text=c.id::text WHERE t.%I IS NOT NULL AND c.id IS NULL%s',
      r.schema_name, r.table_name, r.column_name, r.column_name, r.predicate) INTO remaining;
    IF remaining <> 0 THEN RAISE EXCEPTION 'Orphans in %.%, rolling back', r.schema_name, r.table_name; END IF;
  END LOOP;
END $$;
CREATE TEMP TABLE contact_json_audit (table_name text, record_id text, before_extra jsonb, after_extra jsonb) ON COMMIT DROP;
-- Transfer JSON edges on every public object, retaining originals on suppressed contacts.
DO $$
DECLARE r record; row_data record; edge record; mapped jsonb; item jsonb;
        payload jsonb; labels jsonb; dest text; target_table regclass; valid boolean;
BEGIN
 FOR r IN SELECT table_name FROM information_schema.columns
   WHERE table_schema='public' AND column_name='extra' AND data_type='jsonb'
   AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public'
     AND c.table_name=columns.table_name AND c.column_name='id') LOOP
  FOR row_data IN EXECUTE format('SELECT id, extra FROM public.%I WHERE extra IS NOT NULL',r.table_name) LOOP
   IF r.table_name='contacts' AND EXISTS(SELECT 1 FROM contact_merge WHERE duplicate_id::text=row_data.id::text) THEN CONTINUE; END IF;
   payload := row_data.extra;
   FOR edge IN SELECT * FROM jsonb_each(payload) WHERE key LIKE 'assoc_%' AND key NOT LIKE 'assoc_labels_%' LOOP
    IF jsonb_typeof(edge.value) <> 'array' THEN RAISE EXCEPTION 'Malformed association %.%',r.table_name,edge.key; END IF;
    target_table := to_regclass('public.' || quote_ident(substr(edge.key,7)));
    IF target_table IS NULL THEN RAISE EXCEPTION 'Unknown association target %',edge.key; END IF;
    mapped := '[]';
    FOR item IN SELECT value FROM jsonb_array_elements(edge.value) LOOP
     IF jsonb_typeof(item) NOT IN ('string','number') THEN RAISE EXCEPTION 'Malformed association ID'; END IF;
     IF edge.key='assoc_contacts' THEN
      SELECT canonical_id::text INTO dest FROM contact_merge WHERE duplicate_id::text=item#>>'{}';
      IF dest IS NOT NULL THEN item := CASE WHEN jsonb_typeof(item)='string' THEN to_jsonb(dest) ELSE to_jsonb(dest::bigint) END; END IF;
     END IF;
     EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s t WHERE t.id::text=$1 AND (to_jsonb(t)->>''deleted_at'') IS NULL %s)',target_table,
       CASE WHEN edge.key='assoc_contacts' THEN 'AND NOT EXISTS(SELECT 1 FROM contact_merge m WHERE m.duplicate_id=t.id)' ELSE '' END)
       INTO valid USING item#>>'{}';
     IF NOT valid THEN RAISE EXCEPTION 'Orphans in JSON %.%',r.table_name,edge.key; END IF;
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(mapped) v WHERE v#>>'{}'=item#>>'{}') THEN mapped := mapped || jsonb_build_array(item); END IF;
    END LOOP;
    payload := jsonb_set(payload,ARRAY[edge.key],mapped);
   END LOOP;
   IF payload ? 'assoc_labels_contacts' THEN
    labels := payload->'assoc_labels_contacts';
    IF jsonb_typeof(labels)<>'object' THEN RAISE EXCEPTION 'Malformed contact labels'; END IF;
    FOR edge IN SELECT * FROM jsonb_each(labels) LOOP
     SELECT canonical_id::text INTO dest FROM contact_merge WHERE duplicate_id::text=edge.key;
     IF dest IS NOT NULL THEN
      labels := (labels-edge.key) || jsonb_build_object(dest,coalesce(labels->dest,edge.value));
     END IF;
    END LOOP;
    FOR edge IN SELECT * FROM jsonb_each(labels) LOOP
     IF NOT EXISTS(SELECT 1 FROM contacts c WHERE c.id::text=edge.key AND c.deleted_at IS NULL)
       OR EXISTS(SELECT 1 FROM contact_merge m WHERE m.duplicate_id::text=edge.key)
       THEN RAISE EXCEPTION 'Orphans in JSON contact labels'; END IF;
    END LOOP;
    payload := jsonb_set(payload,ARRAY['assoc_labels_contacts'],labels);
   END IF;
   IF payload IS DISTINCT FROM row_data.extra THEN
    INSERT INTO contact_json_audit VALUES (r.table_name,row_data.id::text,row_data.extra,payload);
    EXECUTE format('UPDATE public.%I SET extra=$1 WHERE id=$2',r.table_name) USING payload,row_data.id;
   END IF;
  END LOOP;
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
 FOREACH t IN ARRAY ARRAY['deals','tickets','tasks','contact_companies'] LOOP
  EXECUTE format('SELECT count(*) FROM %I r LEFT JOIN contacts c ON c.id=r.contact_id WHERE r.contact_id IS NOT NULL AND c.id IS NULL',t) INTO n;
  RAISE NOTICE '% orphan contact references: %', t, n;
  IF n <> 0 THEN RAISE EXCEPTION 'Orphans in %, rolling back',t; END IF;
 END LOOP;
END $$;
SELECT count(*) AS merged_copies, count(DISTINCT canonical_id) AS merged_groups FROM contact_merge;

-- Normalize future email-less writes so the exact partial unique index permits them.
CREATE OR REPLACE FUNCTION public.contacts_empty_email_to_null() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF btrim(NEW.email)='' THEN NEW.email := NULL; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contacts_empty_email_to_null ON public.contacts;
CREATE TRIGGER contacts_empty_email_to_null BEFORE INSERT OR UPDATE OF email
 ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.contacts_empty_email_to_null();
-- Blank emails represent no identity; NULL permits multiple email-less contacts.
UPDATE public.contacts SET email=NULL WHERE deleted_at IS NULL AND btrim(email)='';
DROP INDEX IF EXISTS public.contacts_email_idx;
CREATE UNIQUE INDEX contacts_email_idx ON public.contacts (lower(email))
 WHERE deleted_at IS NULL AND coalesce(email,'')<>'';

-- Single final result also retains before images through the Management API.
SELECT jsonb_build_object(
 'merged_copies', (SELECT count(*) FROM contact_merge),
 'merged_groups', (SELECT count(DISTINCT canonical_id) FROM contact_merge),
 'before_images', (SELECT jsonb_agg(i.before) FROM contact_inventory i WHERE i.id IN
   (SELECT duplicate_id FROM contact_merge UNION SELECT canonical_id FROM contact_merge)),
 'json_changes', (SELECT jsonb_agg(to_jsonb(a)) FROM contact_json_audit a),
 'email_index', (SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='contacts_email_idx'),
 'merge_map', (SELECT jsonb_agg(to_jsonb(m)) FROM contact_merge m),
 'duplicate_groups', (SELECT count(*) FROM (SELECT lower(email) FROM contacts
    WHERE email IS NOT NULL AND email<>'' AND deleted_at IS NULL GROUP BY 1 HAVING count(*)>1) d)
) AS audit;

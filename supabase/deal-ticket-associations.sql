-- Local migration: preserve existing extras and consolidate legacy primary/reverse links.
-- Idempotent; does not infer missing historical associations.
BEGIN;
DO $$
DECLARE object_kind text; target_kind text; primary_expr text;
BEGIN
  FOREACH object_kind IN ARRAY ARRAY['deals', 'tickets'] LOOP
    FOREACH target_kind IN ARRAY ARRAY['contacts', 'companies'] LOOP
      primary_expr := CASE WHEN target_kind = 'contacts' THEN 'r.contact_id::text'
        WHEN object_kind = 'deals' THEN 'r.company_id::text' ELSE 'r.extra->>''companyId''' END;
      EXECUTE format($sql$
        UPDATE %I r SET extra = coalesce(r.extra, '{}'::jsonb) || jsonb_build_object(%L,
          (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM (
            SELECT DISTINCT value::bigint AS id FROM (
              SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.extra->%L) = 'array' THEN r.extra->%L ELSE '[]'::jsonb END) AS value
              UNION ALL SELECT %s
              UNION ALL SELECT t.id::text FROM %I t WHERE
                CASE WHEN jsonb_typeof(t.extra->%L) = 'array' THEN t.extra->%L ELSE '[]'::jsonb END @> jsonb_build_array(r.id)
                OR CASE WHEN jsonb_typeof(t.extra->%L) = 'array' THEN t.extra->%L ELSE '[]'::jsonb END @> jsonb_build_array(r.id::text)
            ) raw WHERE value ~ '^[0-9]{1,15}$' AND value::numeric > 0
          ) ids))
      $sql$, object_kind, 'assoc_' || target_kind, 'assoc_' || target_kind, 'assoc_' || target_kind,
        primary_expr, target_kind, 'assoc_' || object_kind, 'assoc_' || object_kind, 'assoc_' || object_kind, 'assoc_' || object_kind);
    END LOOP;
  END LOOP;
END $$;
COMMIT;

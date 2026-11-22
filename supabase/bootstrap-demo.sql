-- Independent of email cleanup: install before enabling the RPC bootstrap.
BEGIN;
CREATE OR REPLACE FUNCTION public.bootstrap_demo_v1(payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE t text; expected integer; cols text; seq text;
BEGIN
  PERFORM pg_advisory_xact_lock(714025, 1);
  -- Same ordering in every call; lock survives until the RPC transaction commits.
  LOCK TABLE public.companies, public.contacts, public.deals, public.tickets, public.tasks
    IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.contacts) OR EXISTS (SELECT 1 FROM public.companies)
    OR EXISTS (SELECT 1 FROM public.deals) OR EXISTS (SELECT 1 FROM public.tickets)
    OR EXISTS (SELECT 1 FROM public.tasks) THEN RETURN false; END IF;
  FOREACH t IN ARRAY ARRAY['companies','contacts','deals','tickets','tasks'] LOOP
    expected := CASE t WHEN 'companies' THEN 36 WHEN 'contacts' THEN 420 WHEN 'deals' THEN 150 WHEN 'tickets' THEN 84 ELSE 64 END;
    IF jsonb_typeof(payload->t) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid seed table %', t; END IF;
    IF jsonb_array_length(payload->t) <> expected OR
      (SELECT count(DISTINCT (v->>'id')::bigint) FROM jsonb_array_elements(payload->t) v
       WHERE (v->>'id')::bigint BETWEEN 1 AND expected) <> expected THEN
      RAISE EXCEPTION 'Invalid seed ids/count for %', t;
    END IF;
    -- Only supplied columns: preserve database defaults for other columns.
    SELECT string_agg(format('%I', key), ', ' ORDER BY key) INTO cols
      FROM jsonb_object_keys(payload->t->0) key;
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)', t, cols, cols, t)
      USING payload->t;
    seq := pg_get_serial_sequence('public.' || t, 'id');
    IF seq IS NOT NULL THEN PERFORM setval(seq::regclass, expected, true); END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bootstrap_demo_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_demo_v1(jsonb) TO anon, authenticated;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.activities, public.contacts, public.companies, public.deals, public.tickets IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE backfill_before ON COMMIT DROP AS SELECT 'contacts' AS record_type, r.id, r.last_activity, r.last_activity_type AS last_activity_type,
  latest.occurred_at AS real_max, latest.type AS real_type,
  nullif(r.extra->>'notes_last_contacted','')::timestamptz AS notes_last_contacted,
  contacted.real_contact_max,
  (r.last_activity IS NULL OR r.last_activity < latest.occurred_at) AS behind,
  (r.last_activity > latest.occurred_at) AS ahead
FROM public.contacts r
JOIN LATERAL (SELECT a.occurred_at, a.type FROM public.activities a
 WHERE a.record_type = 'contacts' AND a.record_id = r.id AND a.type IN ('note','email','call','meeting','task','message','sms','whatsapp','linkedin') AND a.occurred_at IS NOT NULL
 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT max(a.occurred_at) AS real_contact_max FROM public.activities a
 WHERE a.record_type = 'contacts' AND a.record_id = r.id AND a.type IN ('call','email','meeting','message') AND NOT (a.extra->'marketingEmailId' IS NOT NULL AND a.extra->'marketingEmailId' NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb))) contacted ON true
WHERE r.deleted_at IS NULL
UNION ALL
SELECT 'companies' AS record_type, r.id, r.last_activity, r.last_activity_type AS last_activity_type,
  latest.occurred_at AS real_max, latest.type AS real_type,
  NULL::timestamptz AS notes_last_contacted,
  contacted.real_contact_max,
  (r.last_activity IS NULL OR r.last_activity < latest.occurred_at) AS behind,
  (r.last_activity > latest.occurred_at) AS ahead
FROM public.companies r
JOIN LATERAL (SELECT a.occurred_at, a.type FROM public.activities a
 WHERE a.record_type = 'companies' AND a.record_id = r.id AND a.type IN ('note','email','call','meeting','task','message','sms','whatsapp','linkedin') AND a.occurred_at IS NOT NULL
 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT max(a.occurred_at) AS real_contact_max FROM public.activities a
 WHERE a.record_type = 'companies' AND a.record_id = r.id AND a.type IN ('call','email','meeting','message') AND NOT (a.extra->'marketingEmailId' IS NOT NULL AND a.extra->'marketingEmailId' NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb))) contacted ON true
WHERE r.deleted_at IS NULL
UNION ALL
SELECT 'deals' AS record_type, r.id, r.last_activity, r.extra->>'lastActivityType' AS last_activity_type,
  latest.occurred_at AS real_max, latest.type AS real_type,
  NULL::timestamptz AS notes_last_contacted,
  contacted.real_contact_max,
  (r.last_activity IS NULL OR r.last_activity < latest.occurred_at) AS behind,
  (r.last_activity > latest.occurred_at) AS ahead
FROM public.deals r
JOIN LATERAL (SELECT a.occurred_at, a.type FROM public.activities a
 WHERE a.record_type = 'deals' AND a.record_id = r.id AND a.type IN ('note','email','call','meeting','task','message','sms','whatsapp','linkedin') AND a.occurred_at IS NOT NULL
 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT max(a.occurred_at) AS real_contact_max FROM public.activities a
 WHERE a.record_type = 'deals' AND a.record_id = r.id AND a.type IN ('call','email','meeting','message') AND NOT (a.extra->'marketingEmailId' IS NOT NULL AND a.extra->'marketingEmailId' NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb))) contacted ON true
WHERE r.deleted_at IS NULL
UNION ALL
SELECT 'tickets' AS record_type, r.id, r.last_activity, r.extra->>'lastActivityType' AS last_activity_type,
  latest.occurred_at AS real_max, latest.type AS real_type,
  NULL::timestamptz AS notes_last_contacted,
  contacted.real_contact_max,
  (r.last_activity IS NULL OR r.last_activity < latest.occurred_at) AS behind,
  (r.last_activity > latest.occurred_at) AS ahead
FROM public.tickets r
JOIN LATERAL (SELECT a.occurred_at, a.type FROM public.activities a
 WHERE a.record_type = 'tickets' AND a.record_id = r.id AND a.type IN ('note','email','call','meeting','task','message','sms','whatsapp','linkedin') AND a.occurred_at IS NOT NULL
 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT max(a.occurred_at) AS real_contact_max FROM public.activities a
 WHERE a.record_type = 'tickets' AND a.record_id = r.id AND a.type IN ('call','email','meeting','message') AND NOT (a.extra->'marketingEmailId' IS NOT NULL AND a.extra->'marketingEmailId' NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb))) contacted ON true
WHERE r.deleted_at IS NULL;
UPDATE public.contacts r SET last_activity = s.real_max,
    last_activity_type = s.real_type, extra = jsonb_set(coalesce(r.extra,'{}'::jsonb), '{notes_last_contacted}', coalesce(to_jsonb(s.real_contact_max), 'null'::jsonb), true)
    FROM backfill_before s WHERE s.record_type = 'contacts' AND s.id = r.id
    AND (s.last_activity IS DISTINCT FROM s.real_max OR s.last_activity_type IS DISTINCT FROM s.real_type OR s.notes_last_contacted IS DISTINCT FROM s.real_contact_max);
UPDATE public.companies r SET last_activity = s.real_max,
    last_activity_type = s.real_type
    FROM backfill_before s WHERE s.record_type = 'companies' AND s.id = r.id
    AND (s.last_activity IS DISTINCT FROM s.real_max OR s.last_activity_type IS DISTINCT FROM s.real_type);
UPDATE public.deals r SET last_activity = s.real_max,
    extra = jsonb_set(coalesce(r.extra,'{}'::jsonb), '{lastActivityType}', to_jsonb(s.real_type), true)
    FROM backfill_before s WHERE s.record_type = 'deals' AND s.id = r.id
    AND (s.last_activity IS DISTINCT FROM s.real_max OR s.last_activity_type IS DISTINCT FROM s.real_type);
UPDATE public.tickets r SET last_activity = s.real_max,
    extra = jsonb_set(coalesce(r.extra,'{}'::jsonb), '{lastActivityType}', to_jsonb(s.real_type), true)
    FROM backfill_before s WHERE s.record_type = 'tickets' AND s.id = r.id
    AND (s.last_activity IS DISTINCT FROM s.real_max OR s.last_activity_type IS DISTINCT FROM s.real_type);
CREATE TEMP TABLE backfill_after ON COMMIT DROP AS SELECT 'contacts' AS record_type, r.id, r.last_activity, r.last_activity_type AS last_activity_type,
  latest.occurred_at AS real_max, latest.type AS real_type,
  nullif(r.extra->>'notes_last_contacted','')::timestamptz AS notes_last_contacted,
  contacted.real_contact_max,
  (r.last_activity IS NULL OR r.last_activity < latest.occurred_at) AS behind,
  (r.last_activity > latest.occurred_at) AS ahead
FROM public.contacts r
JOIN LATERAL (SELECT a.occurred_at, a.type FROM public.activities a
 WHERE a.record_type = 'contacts' AND a.record_id = r.id AND a.type IN ('note','email','call','meeting','task','message','sms','whatsapp','linkedin') AND a.occurred_at IS NOT NULL
 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT max(a.occurred_at) AS real_contact_max FROM public.activities a
 WHERE a.record_type = 'contacts' AND a.record_id = r.id AND a.type IN ('call','email','meeting','message') AND NOT (a.extra->'marketingEmailId' IS NOT NULL AND a.extra->'marketingEmailId' NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb))) contacted ON true
WHERE r.deleted_at IS NULL
UNION ALL
SELECT 'companies' AS record_type, r.id, r.last_activity, r.last_activity_type AS last_activity_type,
  latest.occurred_at AS real_max, latest.type AS real_type,
  NULL::timestamptz AS notes_last_contacted,
  contacted.real_contact_max,
  (r.last_activity IS NULL OR r.last_activity < latest.occurred_at) AS behind,
  (r.last_activity > latest.occurred_at) AS ahead
FROM public.companies r
JOIN LATERAL (SELECT a.occurred_at, a.type FROM public.activities a
 WHERE a.record_type = 'companies' AND a.record_id = r.id AND a.type IN ('note','email','call','meeting','task','message','sms','whatsapp','linkedin') AND a.occurred_at IS NOT NULL
 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT max(a.occurred_at) AS real_contact_max FROM public.activities a
 WHERE a.record_type = 'companies' AND a.record_id = r.id AND a.type IN ('call','email','meeting','message') AND NOT (a.extra->'marketingEmailId' IS NOT NULL AND a.extra->'marketingEmailId' NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb))) contacted ON true
WHERE r.deleted_at IS NULL
UNION ALL
SELECT 'deals' AS record_type, r.id, r.last_activity, r.extra->>'lastActivityType' AS last_activity_type,
  latest.occurred_at AS real_max, latest.type AS real_type,
  NULL::timestamptz AS notes_last_contacted,
  contacted.real_contact_max,
  (r.last_activity IS NULL OR r.last_activity < latest.occurred_at) AS behind,
  (r.last_activity > latest.occurred_at) AS ahead
FROM public.deals r
JOIN LATERAL (SELECT a.occurred_at, a.type FROM public.activities a
 WHERE a.record_type = 'deals' AND a.record_id = r.id AND a.type IN ('note','email','call','meeting','task','message','sms','whatsapp','linkedin') AND a.occurred_at IS NOT NULL
 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT max(a.occurred_at) AS real_contact_max FROM public.activities a
 WHERE a.record_type = 'deals' AND a.record_id = r.id AND a.type IN ('call','email','meeting','message') AND NOT (a.extra->'marketingEmailId' IS NOT NULL AND a.extra->'marketingEmailId' NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb))) contacted ON true
WHERE r.deleted_at IS NULL
UNION ALL
SELECT 'tickets' AS record_type, r.id, r.last_activity, r.extra->>'lastActivityType' AS last_activity_type,
  latest.occurred_at AS real_max, latest.type AS real_type,
  NULL::timestamptz AS notes_last_contacted,
  contacted.real_contact_max,
  (r.last_activity IS NULL OR r.last_activity < latest.occurred_at) AS behind,
  (r.last_activity > latest.occurred_at) AS ahead
FROM public.tickets r
JOIN LATERAL (SELECT a.occurred_at, a.type FROM public.activities a
 WHERE a.record_type = 'tickets' AND a.record_id = r.id AND a.type IN ('note','email','call','meeting','task','message','sms','whatsapp','linkedin') AND a.occurred_at IS NOT NULL
 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT max(a.occurred_at) AS real_contact_max FROM public.activities a
 WHERE a.record_type = 'tickets' AND a.record_id = r.id AND a.type IN ('call','email','meeting','message') AND NOT (a.extra->'marketingEmailId' IS NOT NULL AND a.extra->'marketingEmailId' NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb))) contacted ON true
WHERE r.deleted_at IS NULL;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM backfill_after WHERE behind OR ahead OR last_activity_type IS DISTINCT FROM real_type OR (record_type = 'contacts' AND notes_last_contacted IS DISTINCT FROM real_contact_max)) THEN
 RAISE EXCEPTION 'Backfill invariant failed; transaction rolled back'; END IF;
END $$;
SELECT jsonb_build_object('applied', true,
 'before', (SELECT coalesce(jsonb_agg(b ORDER BY record_type,id),'[]'::jsonb) FROM backfill_before b),
 'after', (SELECT coalesce(jsonb_agg(a ORDER BY record_type,id),'[]'::jsonb) FROM backfill_after a),
 'counts', (SELECT jsonb_agg(c ORDER BY record_type) FROM (
 SELECT t.record_type, count(a.id) AS with_engagement,
 count(a.id) FILTER (WHERE a.behind) AS behind, count(a.id) FILTER (WHERE a.ahead) AS ahead
 FROM (VALUES ('contacts'),('companies'),('deals'),('tickets')) t(record_type)
 LEFT JOIN backfill_after a USING(record_type) GROUP BY t.record_type) c)) AS evidence;
COMMIT;

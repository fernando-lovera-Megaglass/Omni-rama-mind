BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
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

SELECT jsonb_build_object('applied', false,
 'before', (SELECT coalesce(jsonb_agg(b ORDER BY record_type,id),'[]'::jsonb) FROM backfill_before b),
 'after', (SELECT coalesce(jsonb_agg(a ORDER BY record_type,id),'[]'::jsonb) FROM backfill_after a),
 'counts', (SELECT jsonb_agg(c ORDER BY record_type) FROM (
 SELECT t.record_type, count(a.id) AS with_engagement,
 count(a.id) FILTER (WHERE a.behind) AS behind, count(a.id) FILTER (WHERE a.ahead) AS ahead
 FROM (VALUES ('contacts'),('companies'),('deals'),('tickets')) t(record_type)
 LEFT JOIN backfill_after a USING(record_type) GROUP BY t.record_type) c)) AS evidence;
COMMIT;
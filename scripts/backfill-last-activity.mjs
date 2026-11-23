// Local maintenance CLI. Default: read-only audit; --apply explicitly writes data, never deploys.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSql } from './mgmt-sql.mjs';

const source = readFileSync(new URL('../src/data.js', import.meta.url), 'utf8');
const match = source.match(/export const ENGAGEMENT_TYPES = new Set\(\[([^\]]+)\]\)/);
if (!match) throw new Error('No se pudo leer ENGAGEMENT_TYPES');
export const engagementTypes = [...match[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);
const typesSql = engagementTypes.map(t => `'${t}'`).join(',');
export const tables = ['contacts', 'companies', 'deals', 'tickets'];
// Equivalent to Boolean(extra.marketingEmailId), including JSON false/0/empty string.
const marketing = `(a.extra->'marketingEmailId' IS NOT NULL AND a.extra->'marketingEmailId' NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '\"\"'::jsonb))`;
const typeExpr = t => ['contacts', 'companies'].includes(t) ? 'r.last_activity_type' : "r.extra->>'lastActivityType'";
export const auditSql = tables.map(t => `SELECT '${t}' AS record_type, r.id, r.last_activity, ${typeExpr(t)} AS last_activity_type,
  latest.occurred_at AS real_max, latest.type AS real_type,
  ${t === 'contacts' ? "nullif(r.extra->>'notes_last_contacted','')::timestamptz" : 'NULL::timestamptz'} AS notes_last_contacted,
  contacted.real_contact_max,
  (r.last_activity IS NULL OR r.last_activity < latest.occurred_at) AS behind,
  (r.last_activity > latest.occurred_at) AS ahead
FROM public.${t} r
JOIN LATERAL (SELECT a.occurred_at, a.type FROM public.activities a
 WHERE a.record_type = '${t}' AND a.record_id = r.id AND a.type IN (${typesSql}) AND a.occurred_at IS NOT NULL
 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL (SELECT max(a.occurred_at) AS real_contact_max FROM public.activities a
 WHERE a.record_type = '${t}' AND a.record_id = r.id AND a.type IN ('call','email','meeting','message') AND NOT ${marketing}) contacted ON true
WHERE r.deleted_at IS NULL`).join('\nUNION ALL\n');

export function buildSql(apply = false) {
  const updates = tables.map(t => {
    const extra = t === 'contacts'
      ? "jsonb_set(coalesce(r.extra,'{}'::jsonb), '{notes_last_contacted}', coalesce(to_jsonb(s.real_contact_max), 'null'::jsonb), true)"
      : "jsonb_set(coalesce(r.extra,'{}'::jsonb), '{lastActivityType}', to_jsonb(s.real_type), true)";
    return `UPDATE public.${t} r SET last_activity = s.real_max,
    ${['contacts','companies'].includes(t) ? 'last_activity_type = s.real_type' : `extra = ${extra}`}${t === 'contacts' ? `, extra = ${extra}` : ''}
    FROM backfill_before s WHERE s.record_type = '${t}' AND s.id = r.id
    AND (s.last_activity IS DISTINCT FROM s.real_max OR s.last_activity_type IS DISTINCT FROM s.real_type${t === 'contacts' ? ' OR s.notes_last_contacted IS DISTINCT FROM s.real_contact_max' : ''});`;
  }).join('\n');
  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
${apply ? 'LOCK TABLE public.activities, public.contacts, public.companies, public.deals, public.tickets IN SHARE ROW EXCLUSIVE MODE;' : 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;'}
CREATE TEMP TABLE backfill_before ON COMMIT DROP AS ${auditSql};
${apply ? updates : ''}
CREATE TEMP TABLE backfill_after ON COMMIT DROP AS ${auditSql};
${apply ? `DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM backfill_after WHERE behind OR ahead OR last_activity_type IS DISTINCT FROM real_type OR (record_type = 'contacts' AND notes_last_contacted IS DISTINCT FROM real_contact_max)) THEN
 RAISE EXCEPTION 'Backfill invariant failed; transaction rolled back'; END IF;
END $$;` : ''}
SELECT jsonb_build_object('applied', ${apply},
 'before', (SELECT coalesce(jsonb_agg(b ORDER BY record_type,id),'[]'::jsonb) FROM backfill_before b),
 'after', (SELECT coalesce(jsonb_agg(a ORDER BY record_type,id),'[]'::jsonb) FROM backfill_after a),
 'counts', (SELECT jsonb_agg(c ORDER BY record_type) FROM (
 SELECT t.record_type, count(a.id) AS with_engagement,
 count(a.id) FILTER (WHERE a.behind) AS behind, count(a.id) FILTER (WHERE a.ahead) AS ahead
 FROM (VALUES ('contacts'),('companies'),('deals'),('tickets')) t(record_type)
 LEFT JOIN backfill_after a USING(record_type) GROUP BY t.record_type) c)) AS evidence;
COMMIT;`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(a => !['--apply','--emit-sql'].includes(a))) throw new Error('Uso: node scripts/backfill-last-activity.mjs [--apply] [--emit-sql]');
    const apply = args.includes('--apply');
    const sql = buildSql(apply);
    if (args.includes('--emit-sql')) console.log(sql);
    else {
      const dir = resolve('docs/evidencia/gap-backend-re-ultima-actividad-backfill');
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const prefix = `${dir}/${stamp}-${apply ? 'apply' : 'audit'}`;
      writeFileSync(`${prefix}.sql`, sql);
      const result = await runSql(sql);
      writeFileSync(`${prefix}.json`, JSON.stringify(result, null, 2));
      console.log(`Evidencia guardada en ${prefix}.json`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

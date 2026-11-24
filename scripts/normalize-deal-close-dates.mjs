// Local SQL generator only. Does not connect to or mutate production.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export const auditSql = `SELECT count(*)::int AS remaining FROM public.deals d
WHERE d.deleted_at IS NULL AND d.close_date > now() + interval '2 days'
AND EXISTS (SELECT 1 FROM public.pipeline_stages ps WHERE ps.clave=d.stage AND ps.probabilidad=0)`;
export const normalizationSql = `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'America/Mexico_City';
LOCK TABLE public.deals, public.pipelines, public.pipeline_stages IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE deal_close_before ON COMMIT DROP AS
SELECT d.id, d.stage, d.pipeline, d.close_date AS before,
 LEAST(coalesce(nullif(to_jsonb(d)->>'updated_at','')::timestamptz,
 nullif(to_jsonb(d)->>'updated','')::timestamptz, d.created, now()), now()) AS replacement
FROM public.deals d
WHERE d.deleted_at IS NULL AND d.close_date >= date_trunc('day', now()) + interval '1 day'
AND EXISTS (SELECT 1 FROM public.pipeline_stages ps WHERE ps.clave=d.stage AND ps.probabilidad=0);
-- A shared key alone is not proof that this deal is lost. Abort rather than normalize another pipeline.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM deal_close_before b WHERE NOT EXISTS (
 SELECT 1 FROM public.pipeline_stages ps JOIN public.pipelines p ON p.id=ps.pipeline_id
 WHERE p.objeto='deal' AND p.nombre=b.pipeline AND ps.clave=b.stage AND ps.probabilidad=0)) THEN
 RAISE EXCEPTION 'Etapa prob-0 ambigua para el pipeline: revisar antes de normalizar';
 END IF;
END $$;
UPDATE public.deals d SET close_date=b.replacement FROM deal_close_before b WHERE d.id=b.id;
DO $$ BEGIN
 IF (${auditSql}) <> 0 THEN RAISE EXCEPTION 'Persisten fechas futuras: rollback'; END IF;
END $$;
SELECT jsonb_build_object('updated', (SELECT count(*) FROM deal_close_before),
 'remaining', (${auditSql}),
 'rows', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'stage',b.stage,
 'pipeline',b.pipeline,'before',b.before,'after',d.close_date) ORDER BY b.id),'[]'::jsonb)
 FROM deal_close_before b JOIN public.deals d USING(id))) AS evidence;
COMMIT;`;
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 if (process.argv.slice(2).some(a => !['--audit','--emit-sql'].includes(a))) {
  console.error('Uso: node scripts/normalize-deal-close-dates.mjs [--audit | --emit-sql]. Solo emite SQL.');
  process.exitCode = 1;
 } else console.log(process.argv.includes('--audit') ? auditSql : normalizationSql);
}

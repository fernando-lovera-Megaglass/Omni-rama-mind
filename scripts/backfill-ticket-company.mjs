// Default only emits SQL. --audit reads remote data; --apply explicitly mutates it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSql } from './mgmt-sql.mjs';

export const evidenceDir = 'docs/evidencia/gap-backend-tickets-empresa-sin-backfill';
export const candidatesSql = `SELECT t.id, t.extra AS old_extra, p.company_id, p.name, p.primary_count
FROM public.tickets t
JOIN LATERAL (
 SELECT c.id AS company_id, c.name, count(*) OVER () AS primary_count
 FROM public.contact_companies cc JOIN public.companies c ON c.id = cc.company_id
 WHERE cc.contact_id = t.contact_id AND cc.is_primary AND c.deleted_at IS NULL
 ORDER BY c.id LIMIT 1
) p ON true
WHERE t.deleted_at IS NULL AND t.contact_id IS NOT NULL
 AND (t.extra->'assoc_companies' IS NULL OR t.extra->'assoc_companies' IN ('null'::jsonb, '[]'::jsonb))`;
export const auditSql = `SELECT count(*)::int AS remaining FROM (${candidatesSql}) candidates`;

export function batchSql(size = 50) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 1000) throw new Error('batch-size debe ser entero entre 1 y 1000');
  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Protect both the association source and destination for this short batch.
LOCK TABLE public.tickets, public.contact_companies, public.companies IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE ticket_company_before ON COMMIT DROP AS
 ${candidatesSql} ORDER BY t.id LIMIT ${size};
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM ticket_company_before WHERE primary_count <> 1
 OR (old_extra IS NOT NULL AND jsonb_typeof(old_extra) NOT IN ('object','null'))
 OR (nullif(old_extra->>'companyId','') IS NOT NULL AND old_extra->>'companyId' <> company_id::text)) THEN
 RAISE EXCEPTION 'Empresa principal ambigua o companyId existente distinto: revisar antes de continuar';
 END IF;
END $$;
UPDATE public.tickets t SET extra = coalesce(nullif(t.extra, 'null'::jsonb), '{}'::jsonb) || jsonb_build_object(
 'companyId', b.company_id, 'company', coalesce(b.name,''),
 'assoc_companies', jsonb_build_array(b.company_id),
 'assoc_labels_companies', jsonb_build_object(b.company_id::text, 'Principal'))
FROM ticket_company_before b WHERE t.id = b.id;
SELECT jsonb_build_object('updated', (SELECT count(*) FROM ticket_company_before),
 'remaining', (${auditSql}),
 'rows', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'before',b.old_extra,'after',t.extra) ORDER BY b.id),'[]'::jsonb)
 FROM ticket_company_before b JOIN public.tickets t USING(id))) AS evidence;
COMMIT;`;
}

export async function backfill(execute, { batchSize = 50, onReport = () => {} } = {}) {
  const sql = batchSql(batchSize);
  const before = await execute(auditSql);
  await onReport({ phase: 'before', result: before });
  let updated = 0;
  for (;;) {
    const result = await execute(sql);
    const report = result.find(r => r.evidence)?.evidence;
    if (!report) throw new Error('Respuesta de lote sin evidencia; comprobar estado antes de reintentar');
    updated += report.updated;
    await onReport({ phase: 'batch', result: report });
    if (report.remaining === 0) break;
    if (!report.updated) throw new Error('Quedan tickets sin asociar y el lote no avanzó');
  }
  const after = await execute(auditSql);
  await onReport({ phase: 'after', result: after, updated });
  if (after[0]?.remaining !== 0) throw new Error('Verificación final: quedan tickets elegibles sin asociar');
  return { before, after, updated };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(a => !['--apply','--audit','--emit-sql'].includes(a) && !/^--batch-size=\d+$/.test(a))) throw new Error('Uso: [--emit-sql | --audit | --apply] [--batch-size=50]');
    if (args.filter(a => ['--apply','--audit','--emit-sql'].includes(a)).length > 1) throw new Error('Selecciona un solo modo');
    const batchSize = Number(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || 50);
    const sql = batchSql(batchSize);
    if (!args.includes('--apply') && !args.includes('--audit')) console.log(sql);
    else {
      mkdirSync(evidenceDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      let index = 0;
      const onReport = report => {
        const file = resolve(evidenceDir, `${stamp}-${index++}-${report.phase}.json`);
        writeFileSync(file, JSON.stringify(report, null, 2));
        console.log(file);
      };
      if (args.includes('--audit')) onReport({ phase: 'audit', result: await runSql(auditSql) });
      else await backfill(runSql, { batchSize, onReport });
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

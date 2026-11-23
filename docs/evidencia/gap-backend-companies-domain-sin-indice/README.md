# Índice de dominio de empresas — 23-nov-2026

## Reapertura: comprobación real del 23-nov-2026, 01:50 America/Mexico_City

**No resuelta: criterio de aceptación de producción incumplido.** Se consultó el proyecto `xysgvxnieigpaxtmxiui` mediante `scripts/mgmt-sql.mjs`, en transacciones `BEGIN READ ONLY … COMMIT`. No se aplicó DDL ni se desplegó la aplicación. La instrucción solicita aplicar SQL en vivo y también indica «No despliegues nada a producción; solo código local»; se solicitó aclaración explícita antes de efectuar esa mutación. No se marca la migración como aplicada ni se cierra la cola.

Catálogo real: `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='companies' ORDER BY indexname` devolvió únicamente:

- `companies_deleted_at_idx`: btree (deleted_at), parcial WHERE deleted_at IS NOT NULL.
- `companies_parent_company_id_idx`: btree (parent_company_id).
- `companies_pkey`: UNIQUE btree (id).
- `companies_user_id_idx`: btree (user_id).

No existe `companies_domain_idx` ni otro índice sobre domain. Consulta real de diagnóstico, con literal sintético y sin leer registros de clientes:

```sql
EXPLAIN SELECT id FROM public.companies
WHERE lower(domain)=lower('omni-index-check.invalid') AND deleted_at IS NULL;
```

```text
Seq Scan on companies  (cost=0.00..3.60 rows=1 width=8)
  Filter: ((deleted_at IS NULL) AND (lower(domain) = 'omni-index-check.invalid'::text))
```

Verificaciones repetidas en esta reapertura, todas con salida 0:

- `node scripts/test-company-domain-index.mjs`: aplicación local doble, catálogo, EXPLAIN natural con índice, duplicados, mayúsculas y papelera: PASS.
- `node scripts/smoke-company-auto.mjs`: OK.
- `node scripts/smoke-import.mjs`: OK.
- `npm run build --script-shell=/tmp/omni-build-shell.sh`: Vite 5.4.21, 254 módulos, 2.09 s.

Se utilizó Node de `/Applications/Kimi.app/Contents/Resources/resources/runtime/tool-node/bin/node` porque el wrapper de comandos falló con EPERM al registrar su lease. El build usó el shell temporal ya existente. No se modificó código de UI. Existe Playwright; no se cambió comportamiento de pantallas, por lo que no se solicita ejecución UI ni gap visual.

Pendiente: autorización que resuelva la contradicción, aplicación de `supabase/company-domain-index.sql`, nueva comprobación de catálogo y EXPLAIN parametrizado en producción, y registro fechado de la aplicación real en `scripts/applied-migrations.json`. La verificación PGlite siguiente no sustituye esos pasos. Si el plan natural remoto sigue prefiriendo Seq Scan por tamaño de tabla, debe documentarse sin presentarlo como aceptación satisfecha ni forzar el plan silenciosamente.

## Evidencia local anterior

Implementación local lista. Aplicación y aceptación en producción pendientes, por instrucción explícita «No despliegues nada a producción; solo código local». No se llamó a la API de Supabase ni se cerró la tarea en build-queue.json.

## Cambios

- `supabase/company-domain-index.sql`: `CREATE INDEX IF NOT EXISTS companies_domain_idx ON public.companies (lower(domain)) WHERE deleted_at IS NULL`. No único; conserva duplicados y excluye papelera.
- `scripts/apply-migration.mjs`: opción explícita `--local <directorio>` aplica a PGlite sin llamar a Supabase ni registrar falsamente una aplicación remota. El modo remoto existente se conserva.
- `scripts/applied-migrations.json`: pendiente remoto, con verificación local separada.
- `scripts/test-company-domain-index.mjs`: base desechable, 10004 filas sintéticas, aplicación dos veces mediante el script solicitado, verificación de catálogo, plan y resultados; elimina la base al finalizar.
- `contact-integrity.sql` actualmente solo crea contacts_live_email_unique: no contiene índice de companies. No se modifica ni depende de su desbloqueo por duplicados.

## Pruebas ejecutadas

Todas terminaron con código 0:

- `node scripts/test-company-domain-index.mjs`: idempotencia; índice no único; coincidencias sin distinguir mayúsculas; duplicados activos preservados; papelera excluida.
- `node scripts/smoke-company-auto.mjs`: OK.
- `node scripts/smoke-import.mjs`: OK, incluye dedupe/importación de empresas.
- `npm run build --script-shell=/tmp/omni-build-shell.sh`: Vite 5.4.21, 254 módulos, build correcto en 1.98 s. El wrapper inicial de Node de Kimi falló con EPERM al registrar su lease; se usó el binario Node incluido en Kimi y un shell temporal con node_modules/.bin en PATH. Sin cambios al build del proyecto.

Salida real local de catálogo y EXPLAIN (tras ANALYZE; no se deshabilitó seqscan):

```text
CREATE INDEX companies_domain_idx ON public.companies USING btree (lower(domain)) WHERE (deleted_at IS NULL)
Index Scan using companies_domain_idx on companies (cost=0.29..57.94 rows=50 width=4)
  Index Cond: (lower(domain) = 'target.example'::text)
```

Consulta: `SELECT id FROM public.companies WHERE lower(domain) = lower($1) AND deleted_at IS NULL`, parámetro `Target.Example`. Devuelve ambos duplicados activos, omite el eliminado.

## Límites y pendientes

No se verifica el criterio en el Supabase vivo: queda para una ejecución autorizada en ese entorno. Con 39 empresas PostgreSQL puede preferir un recorrido secuencial por coste; la prueba local demuestra elección natural con volumen representativo. El índice solo beneficia consultas SQL compatibles con su expresión y predicado: no elimina fetchTable ni los barridos en memoria actuales. Optimizar ese flujo requiere trabajo adicional.

No hay cambios visuales ni solicitud gap-ui. Existe Playwright; este cambio no modifica pantallas ni lógica de ejecución del frontend, por lo que no requiere E2E del carril UI para esta entrega. Los smoke DOM existentes sí se ejecutaron.

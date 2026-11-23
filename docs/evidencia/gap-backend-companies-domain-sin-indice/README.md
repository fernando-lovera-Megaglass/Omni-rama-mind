# Índice de dominio de empresas — 23-nov-2026

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

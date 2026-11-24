# gap-backend-re-companies-domain-sin-indice

Verificación: 2026-11-24 00:31 CST (America/Mexico_City).

## Estado: pendiente de aplicación en producción

La tarea solicita aplicar el índice vivo, pero termina con «No despliegues nada a producción; solo código local». Se solicitó aclaración y no se ejecutó DDL remoto. No se cumple todavía el criterio de aceptación de producción; esta evidencia no autoriza el cierre.

## Trabajo y evidencia

- Revisada `supabase/company-domain-index.sql`: contiene el índice parcial no único solicitado sobre `lower(domain)` con `deleted_at IS NULL`. No requiere cambios.
- Consultado el proyecto `xysgvxnieigpaxtmxiui` mediante `scripts/mgmt-sql.mjs`, dentro de transacciones `BEGIN READ ONLY`.
- `production-indexes.log`: solo existen `companies_pkey`, `companies_user_id_idx`, `companies_parent_company_id_idx` y `companies_deleted_at_idx`; falta `companies_domain_idx`.
- `production-explain.log`: consulta parametrizada mediante PREPARE/EXPLAIN EXECUTE, `SELECT id FROM public.companies WHERE lower(domain) = lower($1) AND deleted_at IS NULL`, con dominio sintético `omni-index-verification.invalid`. Plan natural: `Seq Scan on companies`. No se forzaron opciones del planificador.
- Actualizado `scripts/applied-migrations.json` con la verificación local y la observación remota fechadas. Se conserva `status: pendiente`; no se registra una aplicación real inexistente.

## Pruebas ejecutadas

Todas finalizaron con código 0 usando Node v24.16.0 instalado en `.nvm`:

| Comando | Resultado | Evidencia |
| --- | --- | --- |
| `npm run build` | PASS | `build.log` |
| `node scripts/test-company-domain-index.mjs` | PASS: aplicación dos veces en PGlite desechable, pg_indexes, Index Scan natural, mayúsculas/minúsculas, duplicados y exclusión de eliminados | `test-company-domain-index.log` |
| `node scripts/smoke-company-auto.mjs` | PASS | `smoke-company-auto.log` |
| `node scripts/smoke-import-multifile.mjs` | PASS | `smoke-import-multifile.log` |

El primer intento con el wrapper Node de Kimi falló por EPERM al registrar procesos fuera del workspace; se resolvió usando directamente el Node instalado. Los logs contienen la ejecución posterior efectiva.

## Pendiente

Con autorización explícita para modificar la base viva, ejecutar `node scripts/apply-migration.mjs supabase/company-domain-index.sql`, verificar otra vez `pg_indexes` y el plan natural parametrizado, y registrar la fecha real de aplicación y los resultados. Un índice existente no garantiza que el optimizador lo elija para tablas pequeñas; se debe conservar el plan real como evidencia, sin presentar un plan forzado como natural.

No se modificaron archivos UI, funciones de Omni ni la cola. No hay cambio visual solicitado a Claude. Existe Playwright; no se ejecutó porque solo se actualizó documentación y metadatos de verificación, sin cambios de comportamiento ni pantallas.

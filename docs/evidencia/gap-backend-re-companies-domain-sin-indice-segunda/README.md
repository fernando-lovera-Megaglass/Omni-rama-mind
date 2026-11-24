# Reapertura: índice de dominio de empresas

Verificación: 2026-11-24T05:36:34-06:00. Estado: pendiente de aclaración del alcance remoto; no terminada.

## Evidencia real

- Consulta de solo lectura mediante `scripts/mgmt-sql.mjs` al proyecto `xysgvxnieigpaxtmxiui`: `pg_indexes` lista únicamente `companies_pkey`, `companies_user_id_idx`, `companies_deleted_at_idx` y `companies_parent_company_id_idx`. Falta `companies_domain_idx`. Resultado con fecha del servidor en `live-indexes-before.json`.
- `EXPLAIN` de la búsqueda por `lower(domain)` con `deleted_at IS NULL`: `Seq Scan on companies`; ver `live-explain-before.json`.
- `supabase/company-domain-index.sql` ya contiene exactamente el índice parcial no único solicitado. No se ejecutó DDL remoto ni se desplegó la aplicación.
- `scripts/applied-migrations.json` conserva su estado pendiente: no corresponde registrar una aplicación real que no ocurrió.

## Pruebas ejecutadas

- `npm run build`: PASS, salida en `build.log`. El lanzador administrado falló inicialmente al registrar el proceso fuera del sandbox; la ejecución con escalación autorizada terminó correctamente.
- `node scripts/test-company-domain-index.mjs`: PASS. PGlite desechable, aplicación idempotente dos veces, presencia en `pg_indexes`, exclusión de eliminados, comparación sin distinción de mayúsculas y plan natural `Index Scan using companies_domain_idx` sobre 10004 filas. Ver `test-company-domain-index.log`.
- `node scripts/smoke-import-multifile.mjs`: PASS. Importación local de contactos, empresas y negocios, segunda ejecución actualiza la empresa existente sin duplicarla; ver `smoke-import-multifile.log`.
- `node scripts/smoke-company-auto.mjs`: PASS. Asociación por dominio, dominios adicionales y reglas de creación; ver `smoke-company-auto.log`.

Estas pruebas no constituyen una importación en vivo ni demuestran que el importador use el índice SQL: `planImport` en `src/import-engine.js` construye mapas desde `ALL[type]()`, y `companiesByDomain` en `src/data.js` filtra `allCompanies()` en memoria. El índice beneficia consultas SQL compatibles; no elimina esos recorridos en memoria. Además, PostgreSQL puede elegir un recorrido secuencial para tablas pequeñas aun existiendo un índice.

## Pendiente

Se solicitó aclaración porque el mismo encargo pide aplicar en la base viva y termina con «No despliegues nada a producción; solo código local». Falta confirmar si la migración SQL remota es la excepción autorizada. Tras esa aclaración: aplicar únicamente el SQL solicitado, verificar catálogo y plan reales, registrar la fecha real en `applied-migrations.json` y actualizar esta evidencia. El criterio de aceptación remoto sigue incumplido.

No se modificaron archivos de UI ni `scripts/build-queue.json`; no hace falta cambio visual. Existe Playwright; no se ejecutó al no haber cambios de aplicación ni de pantallas. Si el carril UI valida posteriormente la importación en pantalla, debe ejecutar sus pruebas Playwright correspondientes. El cierre queda en manos del orquestador.

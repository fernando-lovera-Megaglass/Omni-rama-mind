# Reapertura: personalización compartida

Fecha: 2026-11-23. Estado: pendiente de aceptación remota; no cerrar.

## Trabajo local

- Revisada `supabase/account-settings-team.sql`: reemplaza la política admin por `account_settings_team`, usa `is_team_member()` y exige `scope = 'account'` en WITH CHECK. Lectura para authenticated; anon sin privilegios.
- Reforzado `scripts/smoke-record-customize.mjs`: antes del guardado compartido comprueba que el JWT pertenece al usuario de prueba y no tiene rol admin, y que su membresía está activa. Después del guardado exige recuperar scope y contenido mediante el cliente autenticado de Supabase, además de la comprobación SQL existente.
- Sin cambios en UI, funciones de producto ni cola. No se requiere cambio visual.

## Pruebas

- `npm run build`: PASS, Vite compiló en 2.03 s. Ver `build.log`.
- `node scripts/smoke-settings-rls.mjs`: PASS. SQL local PGlite: idempotencia, CRUD compartido sin JWT admin, lectura entre usuarios, rechazo de no miembros/inactivos y anon, aislamiento personal. Ver `smoke-settings-rls.log`.
- `node scripts/smoke-record-customize.mjs`: PASS, regresión local JSDOM. Ver `smoke-record-customize-local.log`.
- El wrapper inicial de Node/npm falló por EPERM al registrar un proceso de Kimi. Las ejecuciones finales usaron el Node independiente instalado y el launcher npm con ese intérprete; finalizaron con código 0.
- Existe Playwright: el carril UI debe ejecutar las pruebas de pantallas de personalización compartida tras aplicar la migración. No se ejecutó Playwright en esta intervención.

## Pendiente y autorización

La petición exige aplicar SQL a la base real, pero también ordena «No despliegues nada a producción; solo código local». Se solicitó aclaración explícita para autorizar únicamente la migración y el smoke remoto, sin despliegue de la aplicación.

Hasta recibir esa respuesta no se aplicó SQL remoto ni se ejecutó SMOKE_LIVE. No se consultaron políticas remotas en esta intervención. El registro `scripts/applied-migrations.json` conserva honestamente el estado pendiente.

Tras autorización: aplicar `node scripts/apply-migration.mjs supabase/account-settings-team.sql`, verificar `pg_policies`, ejecutar `SMOKE_LIVE=1 node scripts/smoke-record-customize.mjs`, comprobar limpieza de datos temporales y registrar fecha y evidencia real. Los resultados locales no satisfacen todavía los criterios de aceptación remotos.

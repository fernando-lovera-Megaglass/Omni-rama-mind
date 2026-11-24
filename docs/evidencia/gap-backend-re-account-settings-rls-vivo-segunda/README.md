# gap-backend-re-account-settings-rls-vivo-segunda

Fecha: 24-nov-2026, America/Mexico_City.

Estado: pendiente de aclaración de autorización remota; no completada.

## Diagnóstico verificado

Consulta de solo lectura mediante scripts/mgmt-sql.mjs contra el proyecto configurado: account_settings mantiene únicamente account_settings_admin (ALL, exige app_metadata.role=admin) y account_settings_read (SELECT). No existe account_settings_team. Resultado completo en policies-before.log; preflight adicional en remote-preflight.log.

La migración supabase/account-settings-team.sql ya contiene la corrección: escritura para miembros activos mediante is_team_member() y WITH CHECK scope='account'. No fue necesario cambiar código ni UI.

## Pruebas ejecutadas

- node scripts/smoke-settings-rls.mjs: PASS, salida 0; SQL real local en PGlite, idempotencia, CRUD compartido sin JWT admin, aislamiento personal y rechazo anónimo. Ver smoke-settings-rls.log.
- node scripts/smoke-record-customize.mjs: PASS, salida 0. Ver smoke-record-customize-local.log.
- npm run build: PASS, salida 0. Ver build.log.

Se usó Node v24.16.0 desde ~/.nvm/versions/node/v24.16.0/bin porque el wrapper de Kimi del PATH inicial no podía registrar procesos dentro del sandbox. Los logs corresponden a las ejecuciones posteriores con Node.

## Pendiente

La instrucción solicita aplicar SQL en la base real y ejecutar el smoke live, pero termina con «No despliegues nada a producción; solo código local». Se pidió aclarar si autoriza la migración remota sin desplegar la aplicación. Hasta recibir respuesta no se realizaron escrituras remotas ni se ejecutó SMOKE_LIVE=1, que crea un usuario y datos temporales.

Tras autorización: aplicar con scripts/apply-migration.mjs, verificar pg_policies, registrar la fecha real de éxito en scripts/applied-migrations.json y ejecutar SMOKE_LIVE=1 node scripts/smoke-record-customize.mjs. El smoke existente exige JWT sin admin, miembro activo y SELECT autenticado de la fila compartida antes de eliminarla. No se afirma aceptación remota con las pruebas locales.

Playwright está disponible. El carril UI debe ejecutar las pruebas de pantallas para «Aplicar a todos», vistas de equipo y layouts compartidos después de aplicar la migración; no se ejecutaron aquí. No se identificó un cambio visual que requiera un gap-ui.

No se modificó scripts/build-queue.json ni scripts/applied-migrations.json. No se desplegó la aplicación ni se modificaron archivos de UI.

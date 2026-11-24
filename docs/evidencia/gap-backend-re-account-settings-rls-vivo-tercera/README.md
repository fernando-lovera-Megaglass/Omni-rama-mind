# gap-backend-re-account-settings-rls-vivo-tercera — reapertura

Fecha de revisión: 2026-11-24, aproximadamente 05:41 CST (America/Mexico_City). Estado: pendiente de aclaración del alcance remoto; no completada.

## Diagnóstico verificado en vivo

Consulta de solo lectura mediante scripts/mgmt-sql.mjs contra el proyecto xysgvxnieigpaxtmxiui. Evidencia: live-before.json con fecha devuelta por la base.

- account_settings conserva únicamente account_settings_read (SELECT) y account_settings_admin (ALL, exige app_metadata.role=admin).
- account_settings tiene 0 filas.
- El único miembro activo tiene team_members.role=admin, pero no tiene app_metadata.role. Por tanto, no satisface la política de escritura vigente. No hay un miembro de rol member disponible para aceptación; debe distinguirse admin de equipo de admin en JWT.
- supabase/account-settings-team.sql ya contiene la corrección: reemplaza la política admin por account_settings_team, exige is_team_member() y scope='account' para escritura. No se necesita modificar UI.

## Pruebas realizadas

- npm run build: PASS; salida en build.log. Se ejecutó con npm incluido en Kimi y un script-shell temporal que antepone el binario Node real al PATH. El wrapper Node por defecto fallaba con EPERM al intentar registrar su proceso fuera del workspace; no se cambiaron permisos ni archivos de Kimi.
- node scripts/smoke-settings-rls.mjs: PASS; salida en smoke-settings-rls.log. SQL real local en PGlite: idempotencia, CRUD compartido sin rol admin JWT, lecturas entre usuarios, rechazo de scope inválido, miembros inactivos, externos y anon; aislamiento personal.
- node scripts/smoke-settings-sync.mjs: PASS; salida en smoke-settings-sync.log. Sincronización entre almacenes de navegador, aislamiento personal, escritura compartida y reintentos.

## Pendiente y límite de esta evidencia

La instrucción solicita aplicar SQL contra la base real y a la vez termina con «No despliegues nada a producción; solo código local». Se pidió aclarar si la migración y la fila de aceptación remotas están exceptuadas de ese límite. No se realizaron escrituras remotas mientras esa pregunta está pendiente.

No se aplicó la migración ni se escribió una fila de aceptación remota. No se cambió applied-migrations.json: registrar una fecha de aplicación ahora sería incorrecto. No se desplegó la aplicación, no se modificó UI y no se editó build-queue.json ni se marcó la tarea como terminada.

Una vez aclarado el alcance: aplicar con scripts/apply-migration.mjs, verificar pg_policies, comprobar escritura y lectura persistida bajo rol authenticated y claims sin app_metadata.role=admin, y registrar el resultado real. No confundir una escritura con privilegios de gestión con aceptación RLS.

Existe Playwright. El carril UI debe comprobar, después de aplicar la migración, guardar y recargar «Aplicar a todos los usuarios de la cuenta», vistas de equipo y layouts compartidos en dos sesiones. Las pruebas locales aprobadas no demuestran esa aceptación de pantalla ni persistencia en vivo. No se requiere un cambio visual y no se agregó gap-ui.

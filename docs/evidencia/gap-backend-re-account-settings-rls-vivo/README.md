# gap-backend-re-account-settings-rls-vivo

Fecha de revisión: 2026-11-23T01:46:31-06:00.

Estado: pendiente de aceptación remota. No cerrar esta tarea.

## Trabajo realizado

Se revisaron supabase/account-settings-team.sql, el registro de migraciones y el smoke live existente. La migración ya elimina account_settings_admin y crea account_settings_team con is_team_member() y WITH CHECK que exige scope='account'. Conserva lectura autenticada y revoca privilegios de anon. No fue necesario modificar código ni UI.

Se creó esta carpeta de evidencia faltante. No se modificó scripts/build-queue.json ni se marcó la tarea como terminada. No se desplegó la aplicación.

## Pruebas ejecutadas

- Build: PASS, exit 0; ver build.log. Se ejecutó npm run build con --script-shell=/tmp/omni-build-shell.sh para usar el binario Node instalado y evitar el wrapper de Kimi que fallaba con EPERM al registrar procesos. El shell conserva node_modules/.bin; el script build del proyecto no cambió.
- node scripts/smoke-settings-rls.mjs: PASS, exit 0; ver smoke-settings-rls.log. SQL real en PGlite local: idempotencia, CRUD de miembro sin JWT admin, lectura entre usuarios, rechazo de miembros inactivos/no miembros y anon, aislamiento personal.
- node scripts/smoke-record-customize.mjs: PASS, exit 0; ver smoke-record-customize-local.log. Regresión JSDOM de personalización, persistencia simulada, recarga y restablecimiento.
- SMOKE_LIVE=1 node scripts/smoke-record-customize.mjs: NO EJECUTADO; requiere escrituras remotas y creación de un usuario temporal. No se presenta la prueba local como aceptación remota.

## Pendiente y límite de autorización

La petición exige aplicar la migración a la base real y también dice «No despliegues nada a producción; solo código local». Se solicitó aclarar si la migración y la prueba remotas están autorizadas. Mientras no exista respuesta, no se modifica la base ni se registra una fecha de aplicación ficticia: account-settings-team.sql permanece pendiente en applied-migrations.json.

Después de autorizar: aplicar únicamente supabase/account-settings-team.sql, consultar pg_policies, ejecutar el smoke live y guardar sus resultados y fecha efectiva en el registro. El smoke existente verifica escritura y lectura remotas con JWT sin admin y elimina su clave aislada al terminar; cero filas después de esa limpieza no implica por sí solo pérdida de persistencia. Sigue pendiente verificar el resultado real, no inferirlo de este código.

Existe Playwright. El carril UI debe ejecutar su comprobación de «Aplicar a todos», vistas de equipo y layouts después de la aplicación remota, incluyendo recarga. No se requiere un cambio visual identificado ni se agregó gap-ui.

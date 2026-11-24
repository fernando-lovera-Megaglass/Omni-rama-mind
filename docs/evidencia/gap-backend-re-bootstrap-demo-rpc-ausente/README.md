# Reapertura: bootstrap_demo_v1 ausente

Fecha: 2026-11-24 00:40 CST (America/Mexico_City).

**Aceptación remota pendiente; no cerrar.**

## Verificación actual

Consulta de solo lectura ejecutada mediante scripts/mgmt-sql.mjs sobre el proyecto xysgvxnieigpaxtmxiui:

```sql
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
AND p.proname IN ('bootstrap_demo_v1','commit_app_sync','is_team_member');
```

Resultado: únicamente commit_app_sync e is_team_member. bootstrap_demo_v1 no existe. No se realizó una llamada autenticada: la función está ausente.

Se revisó supabase/bootstrap-demo.sql: instala la función y sus permisos en una transacción; no ejecuta schema.sql ni vacía tablas. La función retorna false antes de procesar el payload si alguna tabla principal contiene filas. El SQL existente está listo para aplicar sin cambios.

## Alcance pendiente de aclaración

La solicitud exige aplicar la migración en la base real y también ordena «No despliegues nada a producción; solo código local». Se preguntó explícitamente si la migración SQL es una excepción autorizada. Hasta recibir respuesta no se ejecuta DDL remoto. No se registra una aplicación inexistente: bootstrap-demo.sql permanece pendiente en scripts/applied-migrations.json.

Tras autorización: aplicar exclusivamente supabase/bootstrap-demo.sql, repetir pg_proc y comprobar una llamada autenticada con resultado false sin error. Registrar la aplicación real y sus resultados. No aplicar schema.sql ni eliminar datos.

## Pruebas de esta reapertura

- scripts/smoke-bootstrap-failure.mjs: PASS; cubre RPC ausente, red, respuesta inválida y resultados true/false. Los errores simulados impresos son esperados.
- npm run build --script-shell=/tmp/omni-build-shell.sh: PASS; Vite 5.4.21, 255 módulos, 1.42 s. Se usó npm del runtime /Applications/Kimi.app/Contents/Resources/resources/runtime/npm y Node real tool-node/bin. El wrapper inicial falló por EPERM al registrar leases; un intento de ruta npm-cli inexistente también falló antes del build exitoso.
- No se repitió concurrencia local: no se modificó la migración ni la lógica; la evidencia original contiene esa prueba y no sustituye aceptación remota.
- Playwright está instalado. El carril UI debe verificar el arranque autenticado y el aviso de error del ítem existente gap-ui-bootstrap-demo-aviso-explicito. No se duplicó ese ítem.

Único archivo añadido por esta reapertura: este README. No se modificaron UI, cola, estados del orquestador ni registro de migraciones; sus cambios previos se conservaron. No se desplegó aplicación ni se aplicó SQL remoto.

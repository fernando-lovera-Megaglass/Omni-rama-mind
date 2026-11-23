# Persistencia del monitor de importaciones

Fecha: 2026-11-23. Alcance: código local, sin aplicar SQL remoto ni desplegar.

## Cambios

- `supabase/import_jobs.sql`: migración idempotente con identificador compatible con el monitor, autor, equipo, objeto, nombre, fuente/sistema, estado, cuatro conteos, ledger JSONB, detalle completo, fila original y fecha. RLS exige miembro activo del mismo equipo. El trigger asigna equipo/autor desde la sesión y los conserva en actualizaciones. Requiere `rls_team.sql` previamente aplicado.
- `src/import-jobs.js`: lectura paginada, escritura serializada, migración idempotente de historial antiguo sin sobrescribir filas existentes y cola local por usuario para reintentar escrituras fallidas al abrir otra vez la aplicación. Conserva el detalle completo sin el recorte de `user_settings`.
- `src/import-engine.js`: carga el historial y ledger antes de que los consumidores rendericen; escribe al registrar, actualizar conteos y cambiar estado; espera la cola al finalizar importaciones simples y múltiples, también en error/cancelación. Conserva las APIs síncronas de deshacer. `flushImportSync()` permite esperar la persistencia y consultar su resultado; `importSyncStatus()` expone errores. La asociación explícita de un registro nuevo se cuenta después de confirmar su creación.
- `src/integration.js`: únicamente se cambió el proveedor de datos a `importHistory()`. No se tocaron HTML, componentes visuales, estilos, columnas ni formato de filas.
- Se conservan localStorage y `user_settings` como compatibilidad/fallback. La migración no borra el respaldo local; en nuevas sesiones se recuperan las filas y el ledger desde `import_jobs`.

## Verificación

- `npm run build`: PASS (`build.log`). Se usó `--script-shell=/tmp/omni-build-shell` para seleccionar el Node real y evitar que el wrapper de Kimi intentara escribir leases fuera del sandbox. No se modificó la configuración del proyecto.
- `node scripts/smoke-import-jobs.mjs`: PASS. Ejecuta el SQL dos veces en PostgreSQL embebido PGlite, prueba lecturas/escrituras con rol authenticated, aislamiento de equipo e inactividad, migración sin sobrescribir, fallo de escritura y recuperación al reiniciar, recuperación sin localStorage y ledger. Ejecuta una importación real del motor local y compara sus registros/conteos con SELECT de la tabla mediante un adaptador de pruebas.
- PASS: `smoke-import-e2e`, `smoke-import-undo`, `smoke-import-multifile`, `smoke-import-drain`, `smoke-import-owners`, `smoke-import-transfer`, `smoke-integration-history`. Todos en modo local; logs adjuntos.
- `git diff --check`: PASS.

## Pendientes y límites de aceptación

No se ejecutó una importación contra un servidor Supabase/PostgREST ni se aplicó la migración remota: el usuario pidió solo código local. PGlite valida SQL/RLS y el adaptador, pero no sustituye esa aceptación. En un entorno de prueba autorizado, aplicar la migración, ejecutar una importación y comparar `SELECT id, estado, new_count, updated_count, associations_count, errors_count, undo_ledger FROM public.import_jobs WHERE id = <id>` con los registros escritos; abrir otra sesión sin localStorage y comprobar monitor, detalle y deshacer.

Existe Playwright. El carril de UI debe correr sus pruebas del monitor/revisión/deshacer y verificar la nueva sesión sin localStorage; no se ejecutó Playwright ni se cambiaron pantallas en este carril. No hace falta un cambio visual, por lo que no se agregó gap-ui.

Las escrituras normales de registros actualizados siguen usando la cola existente de `data.js`, cuyo `dbIdle()` drena la cola pero absorbe errores de escritura. Esta tarea no cambia esa semántica global: una auditoría remota de fallos parciales requiere comprobar también esos registros. Los errores de persistencia de import_jobs conservan el historial/ledger local y quedan disponibles mediante las APIs indicadas.

No se editó `scripts/build-queue.json` ni se marcó la tarea como terminada. Los cambios preexistentes de archivos build-status y audit-shots no pertenecen a esta tarea.

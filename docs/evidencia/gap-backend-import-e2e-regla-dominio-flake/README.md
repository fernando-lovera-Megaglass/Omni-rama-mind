# gap-backend-import-e2e-regla-dominio-flake

## Alcance

Solo backend/lógica, fixtures y pruebas; sin despliegue, migración ni cambios de UI o de la cola. Los archivos de estado/migraciones ya estaban modificados al comenzar y no se tocaron. Durante las pruebas aparecieron cambios concurrentes en build-queue.json, también preservados sin intervención.

## Hallazgos y corrección

- La corrida inicial instrumentada (`baseline-1.log`) pasó: no se reprodujo el check intermitente histórico. Registra para cada fila sin empresa su correo, companyId, dominio aplicable y candidatos (incluido si existían antes), más el estado SQL. No se atribuye el fallo histórico a una causa demostrada en vivo.
- `dbIdle()` esperaba únicamente la cola existente al invocarlo; una escritura podía añadir otra y quedar fuera de esa espera. Ahora espera hasta que la cola permanezca estable. La regresión determinista falla con el código anterior (`drain-baseline-fails.log`) y pasa con el nuevo (`local-import-drain.log`).
- `runImport` y `runBatchImport` esperan `dbIdle()` antes de publicar DONE. El smoke ya no añade una espera compensatoria después de DONE.
- Los correos live usan un dominio `smoke-<stamp>-auto.test` exclusivo de la corrida. Evita depender de empresas ajenas o residuos en el dominio compartido `ejemplo.com`.
- La limpieza anterior solo reconocía ciertos nombres y correos. La empresa importada cuyo nombre es su dominio `smoke-…-aluminios-centro.com` quedaba fuera. La corrida inicial volvió a dejar ese residuo; se eliminó con dominio exacto (`baseline-residue-cleaned.json`).
- `import-smoke-cleanup.mjs` drena la cola y elimina empresas/contactos por los IDs de importación de la corrida, dominio de la corrida o correo de origen, incluidos los registros en papelera. Limpia asociaciones y actividades en la misma transacción y verifica cero coincidencias por SQL. Se ejecuta en finally; un error de limpieza hace fallar el smoke. El helper general también devuelve fallo si su limpieza falla.
- IDs 47 y 56 enviados a papelera mediante UPDATE condicionado por ID y dominio exactos, sin borrado físico (`residue-trashed.json`).

## Validación

- `npm run build`: PASS (`build.log`). El lanzador administrado necesitó ejecución fuera del sandbox para registrar el proceso; no hubo despliegue.
- Smokes locales PASS: import-e2e, import-undo, import-multifile, import-transfer, import-owners, company-auto e import-drain.
- Cinco corridas live consecutivas: **PASS, salida 0 en las cinco**, con la misma versión del código, cada una con los seis imports completos y limpieza SQL verificada (`live-1.log` … `live-5.log`).
- Auditoría SQL final (`audit.sql`, `audit-final.json`, 23-nov-2026 00:47 CST): **0 empresas SMOKE activas, 0 contactos SMOKE activos, 0 empresas SMOKE físicas aparte de los IDs 47/56 y 0 contactos SMOKE físicos**. Los IDs 47 y 56 conservan deleted_at y están en papelera.
- Contrapruebas: restaurar el dbIdle anterior hace fallar la espera de escrituras anidadas; quitar la barrera de DONE hace fallar el estado PROCESSING mientras hay una escritura pendiente (`drain-baseline-fails.log`, `done-baseline-fails.log`). Son fallos intencionales para verificar que la regresión detecta ambos defectos.
- `git diff --check`: PASS.

## Carril UI

Existe Playwright (`playwright.config.js`). El cambio de cuándo se publica DONE puede afectar el estado de progreso/revisión: el carril UI debe correr Playwright para ese flujo. No se necesita un cambio visual y no se agregó un gap UI. El flujo del wizard se ejercita en JSDOM tanto local como live.

## Límites

`dbIdle()` sigue siendo una barrera de finalización de la cola, no una transacción ni una garantía nueva de éxito de cada escritura: conserva el manejo de errores de persistencia existente. Los dos residuos históricos deben permanecer físicamente en papelera por instrucción del usuario; el criterio de cero SMOKE se verifica sobre registros activos y cero residuos físicos de las nuevas corridas.

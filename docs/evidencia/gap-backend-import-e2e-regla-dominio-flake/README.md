# gap-backend-import-e2e-regla-dominio-flake

> Corrección de evidencia, reapertura 23-nov-2026: la validación anterior NO demostraba cero actividades residuales. Solo contaba contactos y empresas; las actividades 522, 868 y 1045 confirmaron ese hueco. Los resultados históricos de abajo se conservan como antecedente, no como prueba de ausencia de actividades huérfanas. Véase la sección de reapertura al final.

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

## Reapertura: actividades huérfanas (23-nov-2026)

### Cambios locales

- `scripts/import-smoke-cleanup.mjs`: espera `dbIdle()` antes de seleccionar los registros y justo antes de borrar. El `dbIdle()` existente en `src/data.js` ya itera hasta que la cola conserva la misma promesa final; la regresión `smoke-import-drain.mjs` comprueba escrituras anidadas. No se modificó código de producción.
- Conserva los IDs de los cinco objetos fuera de la transacción y añade los IDs del ledger de importación, incluidos registros físicamente eliminados por Deshacer. Borra actividades por `record_type/record_id`, asociaciones y registros en una misma transacción.
- Tras COMMIT vuelve a esperar la cola y verifica por SQL registros, asociaciones, actividades residuales de la corrida y actividades globales de empresas sin padre físico. Cualquier contador distinto de cero hace fallar el smoke; no se excluyen empresas en papelera del conjunto de padres existentes.
- `scripts/smoke-live.mjs` admite limpieza limitada al stamp, activada por `smoke-import-e2e.mjs`. Evita que el fallback global `SMOKE %` elimine las empresas históricas 47/56. La limpieza del usuario retira sus propios `import_jobs` si existe esa tabla, antes de retirar el usuario temporal.
- `scripts/smoke-import-cleanup.mjs`: prueba SQL real con PGlite; actividad pendiente antes del borrado, actividad de un padre ya borrado por Undo, conservación de empresa/actividad histórica y contraprueba de actividad tardía insertada después de COMMIT que debe producir fallo.

### Reparación live autorizada

Se eliminaron solamente las actividades 522→47, 868→56 y 1045→65, con guardas por ID, tipo de objeto y tipo system. `reapertura/historical-cleanup.sql` y `historical-cleanup.json` registran la operación. Las empresas 47/56 se conservaron físicamente y con el mismo `deleted_at` (2026-11-23 06:32:34.297625+00), comparado antes/después. No hubo despliegue ni migración.

### Pruebas

- Build: PASS (`reapertura/build.log`). El lanzador administrado requirió ejecución fuera del sandbox por su registro de procesos.
- Smokes locales import-e2e, import-drain e import-cleanup: PASS (logs `reapertura/local-*.log`). La contraprueba de actividad tardía falla intencionalmente y es capturada mediante `assert.rejects`.
- Intento live inicial: flujo completo y todos los contadores de limpieza en cero, pero salida 1 al retirar el usuario por FK `import_jobs_user_id_fkey` (`reapertura/live-initial-user-fk.log`). Se corrigió esa dependencia y se retiraron los datos y el usuario de ese intento antes de reiniciar la serie.

- Tres corridas live consecutivas con la versión final: **PASS, salida 0 en 1/2/3** (`reapertura/live-1.log`, `live-2.log`, `live-3.log`, `acceptance.json`). En cada una: contacts=0, companies=0, deals=0, tickets=0, tasks=0, activities=0, associations=0, orphan_company_activities=0. Los tres usuarios temporales fueron eliminados.
- Auditoría SQL final: **0 actividades de empresas sin padre físico, 0 actividades históricas 522/868/1045, 0 empresas SMOKE adicionales y 0 contactos SMOKE** (`reapertura/audit.sql`, `audit-final.json`). Empresas 47/56 presentes físicamente, dominios y fecha de papelera idénticos al estado inicial. Para comparar la fecha exacta, el SQL convierte deleted_at a texto; JSON de PostgreSQL usaba otra representación ISO del mismo instante.
- `git diff --check`: PASS.

### UI y cierre

No se modificaron UI, estilos ni plantillas, ni se eliminaron funciones. Existe Playwright; estos cambios están limitados a scripts de limpieza/prueba y no alteran pantallas. Sigue pendiente del carril UI la validación Playwright del flujo DONE/revisión indicada en la evidencia original. No se requiere cambio visual ni se agregó gap UI. No se modificó `scripts/build-queue.json` ni se marcó la tarea como hecha; el cierre corresponde al orquestador. Se preservaron cambios ajenos preexistentes y concurrentes en archivos de estado/migraciones y archivos temporales de auditoría.

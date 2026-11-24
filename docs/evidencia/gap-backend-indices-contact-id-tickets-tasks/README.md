# Índices de asociaciones por contact_id

Estado: implementación local verificada; aceptación en producción pendiente. No cerrar la tarea.

## Cambios

- `supabase/contact-id-indexes.sql`: transacción con los dos CREATE INDEX IF NOT EXISTS solicitados. Tickets usa índice parcial WHERE deleted_at IS NULL; tasks usa índice completo, sin deleted_at.
- `scripts/test-contact-id-indexes.mjs`: PostgreSQL local desechable (PGlite), aplicación doble, definiciones en pg_indexes, consultas parametrizadas y resultados con asociaciones repetidas y tickets en papelera.
- `scripts/applied-migrations.json`: registrada como pendiente, con verificación local y consulta remota de solo lectura. No se afirma que esté aplicada.
- Sin modificaciones de UI, funciones de la aplicación o build-queue.json. Sin despliegue.

## Pruebas

Todas terminaron con código 0:

- `node scripts/test-contact-id-indexes.mjs`: PASS. Véase `test-contact-id-indexes.log`; ambas consultas usan Index Scan natural con 10 000 filas base por tabla, sin desactivar seqscan.
- `node scripts/smoke-ticket-rules.mjs`: PASS, `smoke-ticket-rules.log`.
- `node scripts/smoke-import-undo.mjs`: PASS, `smoke-import-undo.log`.
- `npm run build --script-shell=/tmp/omni-index-build-shell`: PASS, `build.log`. El primer intento falló por el wrapper de Node de Kimi al registrar un lease fuera del sandbox. Se ejecutó el mismo script build mediante un shell temporal que antepone el binario Node disponible en `/Applications/Kimi.app/Contents/Resources/resources/runtime/tool-node/bin` al PATH. No cambió package.json.

## Evidencia de producción y límite de aceptación

`production-before.log` contiene pg_indexes real del proyecto `xysgvxnieigpaxtmxiui`: los dos índices siguen ausentes. `production-explain-before.json` contiene fecha, columnas, conteos reales y planes previos de ambas tablas; solo se ejecutaron lecturas.

La petición exige aplicar a la base real, pero termina con «No despliegues nada a producción; solo código local». Se solicitó aclaración de esa contradicción antes de ejecutar DDL remoto; sigue pendiente la respuesta. No se aplicó la migración ni se marcó la tarea como hecha.

Para completar tras la aclaración: ejecutar `node scripts/apply-migration.mjs supabase/contact-id-indexes.sql`, verificar ambos índices en pg_indexes, guardar EXPLAIN remoto y actualizar este registro con resultados reales.

El índice parcial de tickets exige `WHERE contact_id=$1 AND deleted_at IS NULL`. Una consulta solo por contact_id que incluya papelera no puede utilizarlo para recuperar todas las filas. Con tablas pequeñas el planificador puede preferir Seq Scan incluso después de crear índices. Un EXPLAIN con `SET LOCAL enable_seqscan=off` solo demostraría elegibilidad y debe identificarse como forzado; no prueba selección natural ni una mejora de latencia. No se modificaron parámetros del planificador de producción.

Playwright está disponible. No se cambiaron pantallas ni su comportamiento; si el carril UI valida la ficha de contacto, debe correr los recorridos Tickets/Tareas, cronología y «Ver todos». No se necesita un cambio visual ni un ítem gap-ui.

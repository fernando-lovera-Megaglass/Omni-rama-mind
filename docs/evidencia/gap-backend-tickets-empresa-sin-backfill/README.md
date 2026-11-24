# Backfill de empresa principal en tickets históricos

Estado: backfill ejecutado y verificado en la base viva el **24 de noviembre de 2026, 05:45:42 CST (America/Mexico_City, UTC−06:00)**. Verificación independiente completada a las **05:46:02 CST**. No hubo despliegue, cambios de UI ni modificación de la cola; el cierre corresponde al orquestador.

## Implementación

`scripts/backfill-ticket-company.mjs` selecciona tickets vivos con contacto y `assoc_companies` ausente, null o vacío. Busca `contact_companies.is_primary` con empresa viva. Persiste `companyId` numérico, `company`, `assoc_companies: [id]` y `assoc_labels_companies: { [id]: 'Principal' }`, con el formato de `src/create-ticket.js`. Conserva las otras claves de `extra` y no modifica asociaciones no vacías, tickets eliminados ni contactos sin empresa principal viva.

Lotes de 50 por defecto (configurable de 1 a 1000), cada uno con BEGIN/COMMIT, límites de espera y bloqueo de las tres tablas durante el lote para estabilizar origen y destino. Cada lote reporta IDs y extra antes/después, número actualizado y pendientes. Varias principales vivas, un companyId explícito distinto o extra de tipo inválido abortan el lote completo. Los lotes anteriores permanecen confirmados; la reejecución es idempotente. No se reintentan automáticamente errores de red: revisar el estado y la evidencia antes de reanudar.

La selección usa empresas vivas; una consulta que no excluya empresas eliminadas puede contar tickets que deliberadamente no deben rellenarse. El reporte final exige cero candidatos según la selección anterior.

## Validación local — 24 nov 2026

- `node scripts/smoke-backfill-ticket-company.mjs`: PASS sobre PostgreSQL PGlite desechable. Cuatro candidatos → cero, dos lotes; segunda ejecución actualiza cero. Verifica nombres, IDs, etiquetas, conservación de extras y asociaciones existentes, tickets eliminados, empresa eliminada, ausencia de contacto/principal, extra null, conflicto y múltiples principales con rollback. [Log](smoke-backfill.log).
- `SMOKE_LIVE=0 node scripts/smoke-create-ticket.mjs`: PASS, regresión del writer y panel existentes en JSDOM. [Log](smoke-create-ticket.log).
- `npm run build --script-shell=/tmp/omni-backfill-build-shell`: PASS. [Log](build.log). Se usó un shell temporal con el Node real y node_modules/.bin en PATH porque el wrapper de Kimi intentaba registrar un lease fuera del sandbox y fallaba con EPERM. No se cambió la configuración del proyecto.

`scripts/applied-migrations.json` registra ahora el backfill como **aplicado**, con fecha, proyecto, conteos y ruta de evidencia.

## Comandos disponibles

Sin flags imprime el SQL, sin conectarse. Los modos remotos requieren el token habitual de `mgmt-sql.mjs` y apuntan al proyecto definido allí.

```sh
node scripts/backfill-ticket-company.mjs --emit-sql
node scripts/backfill-ticket-company.mjs --audit
node scripts/backfill-ticket-company.mjs --apply --batch-size=50
node scripts/backfill-ticket-company.mjs --audit
```

Los modos remotos guardan JSON con sello de tiempo en este directorio: auditoría, antes, cada lote y después. La ejecución --apply falla si la consulta final no devuelve cero. Los reportes contienen datos de tickets y deben permanecer en el entorno autorizado.

## Reapertura: ejecución real — 24 nov 2026

La instrucción explícita de esta reapertura autorizó ejecutar el backfill en la base viva. La restricción de despliegue se respetó: se ejecutó el script existente, sin publicar código ni aplicar cambios de esquema.

- Proyecto: `xysgvxnieigpaxtmxiui`, mediante `scripts/mgmt-sql.mjs` y el token local, sin exponer credenciales.
- Consulta original: tickets vivos con contacto, `assoc_companies` ausente/null/vacío y `EXISTS contact_companies` con `is_primary`, **sin excluir empresas eliminadas en esta verificación**. Resultado **74 → 0**. SQL completo, hora y resultados: [antes](original-query-before.json) y [después](original-query-after.json).
- Ejecución: `node scripts/backfill-ticket-company.mjs --apply --batch-size=100`, iniciada a las **2026-11-24T11:45:42.154Z / 05:45:42.154 CST**. Los 74 candidatos se actualizaron en **una sola transacción BEGIN/COMMIT** con las protecciones del script. [Antes](2026-11-24T11-45-42-154Z-0-before.json), [lote con IDs y extra antes/después](2026-11-24T11-45-42-154Z-1-batch.json), [auditoría posterior](2026-11-24T11-45-42-154Z-2-after.json).
- Lectura independiente posterior al COMMIT: **74 de 74** tickets tienen `extra.companyId` y `extra.assoc_companies` correspondientes a la empresa principal del contacto. Resultado registrado en `original-query-after.json` a las **2026-11-24T11:46:02.401Z**.
- `node scripts/smoke-backfill-ticket-company.mjs`: **PASS**, incluyendo conservación, exclusiones, idempotencia y rollback por conflicto/ambigüedad. [Log](smoke-backfill-reapertura.log).
- `SMOKE_LIVE=0 node scripts/smoke-create-ticket.mjs`: **PASS**. [Log](smoke-create-ticket-reapertura.log).
- `npm run build --script-shell=/tmp/omni-backfill-build-shell`: **PASS**, Vite completó en 1.50 s. [Log](build-reapertura.log). Se utilizó el binario Node real y el shell temporal existente para evitar el wrapper de Kimi, que falla al escribir su lease fuera del sandbox. No se cambió la configuración del proyecto.

## Revisión pendiente para el carril UI

Existe Playwright. El carril UI debe ejecutar las pruebas aplicables y recargar la ficha de uno de los IDs del reporte para comprobar que Empresas muestra su empresa y la etiqueta Principal. Esta comprobación visual en vivo no se ejecutó desde backend; la persistencia sí quedó verificada. No se necesita cambio visual ni ítem gap-ui: la ficha existente consume los datos corregidos.

No se marcaron tareas como hechas ni se editó `scripts/build-queue.json`. El orquestador revisa esta evidencia y decide el cierre.

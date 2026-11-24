# Backfill de empresa principal en tickets históricos

Estado: código y pruebas locales listos; aceptación en producción pendiente. No se ejecutó SQL remoto, no se desplegó y no se cerró la tarea en la cola.

## Implementación

`scripts/backfill-ticket-company.mjs` selecciona tickets vivos con contacto y `assoc_companies` ausente, null o vacío. Busca `contact_companies.is_primary` con empresa viva. Persiste `companyId` numérico, `company`, `assoc_companies: [id]` y `assoc_labels_companies: { [id]: 'Principal' }`, con el formato de `src/create-ticket.js`. Conserva las otras claves de `extra` y no modifica asociaciones no vacías, tickets eliminados ni contactos sin empresa principal viva.

Lotes de 50 por defecto (configurable de 1 a 1000), cada uno con BEGIN/COMMIT, límites de espera y bloqueo de las tres tablas durante el lote para estabilizar origen y destino. Cada lote reporta IDs y extra antes/después, número actualizado y pendientes. Varias principales vivas, un companyId explícito distinto o extra de tipo inválido abortan el lote completo. Los lotes anteriores permanecen confirmados; la reejecución es idempotente. No se reintentan automáticamente errores de red: revisar el estado y la evidencia antes de reanudar.

La selección usa empresas vivas; una consulta que no excluya empresas eliminadas puede contar tickets que deliberadamente no deben rellenarse. El reporte final exige cero candidatos según la selección anterior.

## Validación local — 24 nov 2026

- `node scripts/smoke-backfill-ticket-company.mjs`: PASS sobre PostgreSQL PGlite desechable. Cuatro candidatos → cero, dos lotes; segunda ejecución actualiza cero. Verifica nombres, IDs, etiquetas, conservación de extras y asociaciones existentes, tickets eliminados, empresa eliminada, ausencia de contacto/principal, extra null, conflicto y múltiples principales con rollback. [Log](smoke-backfill.log).
- `SMOKE_LIVE=0 node scripts/smoke-create-ticket.mjs`: PASS, regresión del writer y panel existentes en JSDOM. [Log](smoke-create-ticket.log).
- `npm run build --script-shell=/tmp/omni-backfill-build-shell`: PASS. [Log](build.log). Se usó un shell temporal con el Node real y node_modules/.bin en PATH porque el wrapper de Kimi intentaba registrar un lease fuera del sandbox y fallaba con EPERM. No se cambió la configuración del proyecto.

`applied-migrations.json` registra el script como **pendiente**, con validación local; no como aplicado.

## Ejecución futura por operador autorizado

Sin flags imprime el SQL, sin conectarse. Los modos remotos requieren el token habitual de `mgmt-sql.mjs` y apuntan al proyecto definido allí.

```sh
node scripts/backfill-ticket-company.mjs --emit-sql
node scripts/backfill-ticket-company.mjs --audit
node scripts/backfill-ticket-company.mjs --apply --batch-size=50
node scripts/backfill-ticket-company.mjs --audit
```

Los modos remotos guardan JSON con sello de tiempo en este directorio: auditoría, antes, cada lote y después. La ejecución --apply falla si la consulta final no devuelve cero. Los reportes contienen datos de tickets y deben permanecer en el entorno autorizado.

## Pendientes de aceptación

La instrucción final «No despliegues nada a producción; solo código local» impide ejecutar el backfill remoto en esta tarea. Los 84/74 indicados por el hallazgo son datos aportados por el usuario, no mediciones nuevas. Falta ejecutar con autorización y adjuntar antes/después real con cero pendientes; registrar entonces la aplicación efectiva.

Existe Playwright. El carril UI debe recargar la app tras el backfill y verificar en la ficha de uno de los IDs del reporte que Empresas muestra el nombre y la etiqueta Principal; ejecutar sus pruebas Playwright aplicables. El smoke JSDOM no sustituye esa verificación en vivo. No se requiere un cambio visual: la ficha existente consume las asociaciones persistidas, por lo que no se añadió un gap-ui ni se modificaron archivos de UI.

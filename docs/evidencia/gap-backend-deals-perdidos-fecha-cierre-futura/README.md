# gap-backend-deals-perdidos-fecha-cierre-futura

Fecha: 2026-11-24 (America/Mexico_City).

## Alcance y resultado

Código local preparado y probado. **Pendiente el criterio en vivo**: no se ejecutó ninguna mutación ni despliegue remoto, respetando «solo código local». Los 14 registros del hallazgo del usuario no se presentan aquí como corregidos. El resultado 14 → 0 corresponde exclusivamente a fixtures PostgreSQL locales.

- `src/data.js`: el writer `setField` también fija la fecha a hoy al transitar a una etapa con probabilidad 0, aunque su categoría de previsión sea `pipeline`. Consulta la probabilidad dentro del pipeline del negocio. Conserva fechas pasadas y comportamiento previo para cierres ganados/perdidos.
- `scripts/normalize-deal-close-dates.mjs`: generador local de SQL; no importa credenciales ni ejecuta conexiones. Emite transacción con bloqueo de tablas, límites de tiempo, reporte por ID de fecha antes/después y comprobación de cero antes de commit. Normaliza fechas posteriores al día actual de México (también cubre mañana, más estricto que el hallazgo de +2 días).
- Usa `updated_at`, `updated` o `created`, en ese orden; si faltan usa ahora. Limita al presente si el timestamp histórico también está en futuro. No usa `extra.stageEnteredAt`: sin historial comprobado puede pertenecer a una transición anterior. La columna `created` sí existe en el esquema local; las columnas opcionales se leen mediante `to_jsonb`.
- Excluye eliminados lógicamente. Si una clave prob-0 pertenece a otro pipeline y no al del negocio, aborta toda la transacción para no alterar registros ajenos por colisión de claves. Repetirlo sin candidatos no modifica registros.

## Validación ejecutada

- `npm run build --script-shell=/tmp/omni-local-node-shell.sh`: PASS (`build.log`). El shell temporal selecciona el Node real incluido en Kimi; el wrapper normal fallaba con EPERM al registrar leases fuera del workspace. No se cambiaron dependencias ni configuración del proyecto.
- `node scripts/smoke-normalize-deal-close-dates.mjs`: PASS (`normalization.log`). PGlite: 14 → 0 con SQL real, reporte de 14 filas, prioridad updated/created, conservación de otras columnas, exclusiones, idempotencia y rollback por pipeline ambiguo.
- `node scripts/smoke-deal-close-date.mjs`: PASS (`close-date.log`). Futuro/vacío a hoy en prob-0 con categoría abierta, fecha pasada conservada y misma clave con probabilidad positiva en otro pipeline sin cambios; regresiones existentes de cierre y automatización.
- `node scripts/smoke-deal-close.mjs`: PASS (`close.log`).
- `node scripts/smoke-deals-board.mjs`: PASS (`board.log`).
- `git diff --check`: PASS.

## SQL para la operación pendiente

Generar sin ejecutar: `node scripts/normalize-deal-close-dates.mjs --emit-sql`.
Consulta de aceptación (también se emite con `--audit`):

```sql
SELECT count(*)::int AS remaining FROM public.deals d
WHERE d.deleted_at IS NULL AND d.close_date > now() + interval '2 days'
AND EXISTS (SELECT 1 FROM public.pipeline_stages ps
            WHERE ps.clave=d.stage AND ps.probabilidad=0);
```

Resultado local probado: `remaining = 0`. Resultado en vivo: **no ejecutado ni verificado**. El orquestador debe coordinar la ejecución autorizada del SQL, guardar su reporte y repetir la consulta en vivo antes de cerrar.

Existe Playwright. El carril UI debe correr sus pruebas de cierre desde ficha/tablero/edición masiva porque cambia la fecha persistida que muestran esas pantallas. No hace falta cambio visual; no se agregó gap-ui. No se modificaron archivos visuales ni `scripts/build-queue.json`. Los cambios preexistentes en applied-migrations/build-status no pertenecen a esta tarea.

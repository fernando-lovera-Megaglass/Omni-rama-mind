# gap-backend-deals-perdidos-fecha-cierre-futura — reapertura

24-nov-2026, America/Mexico_City. **Implementación local probada; aceptación en vivo pendiente. No cerrar.**

## Hallazgo verificado en vivo (solo SELECT)

`live-audit-reapertura.json` conserva el resultado y hora de consulta: consulta original = **20**, consulta con objeto y pipeline correctos = **14**.

Los otros seis son negocios abiertos: IDs 6, 20, 92, 132 y 146 en `Ventas Extranjero / generacion_cotizacion` (probabilidad 20), e ID 46 en `JFC Cargo Destino / envio_cotizacion` (40). Comparten clave con etapas de tickets de probabilidad 0. La consulta original mezcla pipelines y objetos; reducirla a cero alteraría fechas válidas de negocios abiertos. El salto 14→20 no prueba seis nuevas pérdidas defectuosas.

El esquema vivo de `deals` **no tiene `updated_at`**. La inspección de los 20 candidatos tampoco encontró `extra.updated_at`, `extra.stageEnteredAt` ni actividades con etapa. Los 14 perdidos carecen de la transición o fallback pedidos. `created` no demuestra cuándo se perdieron. La versión anterior del normalizador sustituía por creación y podía abortar por las colisiones; se corrigió ese comportamiento.

## Código backend local

- `src/data.js`: normaliza antes de persistir en `addRecord` y `setField` para altas perdidas, cambios de etapa, cambios de pipeline y edición posterior de fecha. Usa la etapa del pipeline correspondiente. Guarda etapa/pipeline y fecha en el mismo UPDATE, evitando la ventana entre dos escrituras. Mantiene fechas pasadas, reapertura, automatización y cronología.
- `supabase/deal-close-date-guard.sql`: migración **sin aplicar** con trigger para INSERT/UPDATE directos (incluidas importaciones y procesos que omiten el cliente). Probabilidad 0 dentro del pipeline de negocios, día de México, excluye eliminados, conserva fecha válida anterior y registra nuevas transiciones con etapa y pipeline. No pretende reconstruir fechas históricas ni normalizar filas existentes al instalarse. Cambiar definiciones de probabilidad requiere una auditoría posterior de negocios ya existentes.
- `scripts/normalize-deal-close-dates.mjs`: solo genera SQL, no conecta. Conserva `auditSql` original y añade `scopedAuditSql`. Normaliza transaccionalmente únicamente pérdidas del pipeline correspondiente; usa última transición registrada a la etapa actual o `updated_at`. **Aborta y hace rollback si no hay fecha fiable o es futura**, sin sustituirla por creación/ahora. Reporta fuente, antes/después y ambos conteos. Es idempotente.

Consulta correcta para el criterio semántico:

```sql
SELECT count(*)::int AS remaining FROM public.deals d
WHERE d.deleted_at IS NULL AND d.close_date > now() + interval '2 days'
AND EXISTS (
 SELECT 1 FROM public.pipeline_stages ps
 JOIN public.pipelines p ON p.id=ps.pipeline_id
 WHERE p.objeto='deal' AND p.nombre=d.pipeline
 AND ps.clave=d.stage AND ps.probabilidad=0
);
```

## Pruebas ejecutadas

- `npm run build --script-shell=/tmp/omni-local-node-shell.sh`: PASS (`build-reapertura.log`). Se usó `/Applications/Kimi.app/Contents/Resources/resources/runtime/npm`; el wrapper de npm del entorno falla con EPERM al registrar leases. El shell temporal usa el Node real de Kimi. Sin cambios en dependencias/configuración.
- `scripts/smoke-normalize-deal-close-dates.mjs`: PASS (`normalization-reapertura.log`). PostgreSQL local PGlite: 14→0 con seis falsos positivos conservados, prioridad de historial, fallback, idempotencia y rollback si falta historia. Trigger probado con alta perdida, fecha vacía, transición, cambio de pipeline, edición posterior, fecha pasada y reapertura.
- `scripts/smoke-deal-close-date.mjs`: PASS (`close-date-reapertura.log`), incluidas nuevas regresiones de alta perdida, edición de fecha y pipeline.
- `scripts/smoke-deal-close.mjs`: PASS (`close-reapertura.log`).
- `scripts/smoke-deals-board.mjs`: PASS (`board-reapertura.log`).
- `git diff --check`: PASS.

Existe Playwright. **El carril UI debe correr las pruebas de pantallas de creación, ficha, tablero, inline y edición masiva**, porque cambia la fecha persistida que muestran. No hace falta cambio visual; no se agregó gap-ui.

## Pendientes para el orquestador

1. Resolver la contradicción entre normalizar la base real y «solo código local». Se solicitó aclaración; no hubo mutación remota ni despliegue.
2. Proporcionar fechas históricas fiables para los 14 registros o autorizar explícitamente otra política documentada para fechas desconocidas. El script actualmente abortaría en vivo de forma intencional.
3. Aplicar la normalización autorizada y verificar cero con la consulta por pipeline; conservar también la consulta original y explicar sus seis falsos positivos.
4. Desplegar la protección backend en un trabajo autorizado posterior; el código local no protege todavía la base real.

No se modificaron archivos visuales ni `scripts/build-queue.json`, ni se marcó la tarea hecha. Los cambios preexistentes en applied-migrations/build-status no son de esta tarea. Los logs sin sufijo reapertura pertenecen al intento anterior.

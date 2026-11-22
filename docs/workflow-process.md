# Ejecutor de workflows (workflow-process)

Implementación escrita como código local, sin desplegar la Edge Function ni aplicar la
migración. Reutiliza el patrón del ejecutor de secuencias (`docs/sequence-process.md`):
RPC `security definer` solo para la service role, reserva con `for update skip locked`,
una Edge Function que las invoca y los mismos planificadores.

## El problema que corrige

El motor de workflows de la app (`src/workflow-engine.js`) guarda cada inscripción en
`workflow_runs` (`step_actual`, `estado`, `proxima_ejecucion`, `log`) y reanuda los
retrasos vencidos **solo mientras la app está abierta** (al cargar y cada minuto). Sin
nadie en la app, un run en `waiting` no continúa nunca. Además, el motor anterior
(`workflow_enrollments`) simulaba los retrasos: comprobado con SQL de solo lectura el
2026-11-21, la tabla tiene 2 inscripciones `in_progress` desde el 1-2 de noviembre cuyo
log termina en `{ action: delay, result: "Esperando 2 días" }` y `workflow_runs` está vacía.
No existía ninguna función `workflow-*`, trigger ni `pg_cron`.

## Piezas (todas locales)

- `supabase/workflow-process.sql` (**pendiente** en `scripts/applied-migrations.json`):
  - `workflow_runs.claimed_until`: reserva del ejecutor mientras avanza un run.
  - `workflow_due(p_now)`: runs vencidos (`waiting` con `proxima_ejecucion` cumplida, o
    `active` sin cambios desde hace 2 minutos: pestaña cerrada a medias), de workflows no
    eliminados y sin reserva vigente; lotes de 100.
  - `workflow_claim(p_id)`: reserva el run (`skip locked`, 5 minutos) y lo devuelve.
  - `workflow_finish(p_id, p_step, p_estado, p_next, p_log, p_jumps)`: guarda el avance y
    libera la reserva; si la app lo canceló mientras tanto, conserva la cancelación.
  - Migración de las inscripciones históricas `in_progress`: cada una pasa a
    `workflow_runs` como `waiting` con `proxima_ejecucion = now()`, `step_actual` = acciones
    ya registradas (el recorrido de esos workflows es lineal), el log convertido (el retraso
    queda `pending`, con `wait` «2 días») y la marca `migratedFrom` en la primera entrada;
    la inscripción original queda `status = 'migrated'` (la app la oculta y la lista como
    run). Repetible: no duplica.
- `supabase/functions/workflow-process/`:
  - `processor.mjs`: el mismo recorrido que el motor de la app (orden del editor, ramas
    por condición con la misma semántica de `evalCondition`, «Ir a» con máximo 3 saltos,
    60 pasos por invocación, tokens `{{contacto.nombre|predeterminado}}`). Un retraso
    deja el run en `waiting` con `proxima_ejecucion = ahora + retraso` y anota la
    cronología; al reanudar marca el retraso pendiente como completado. Acciones:
    crear tarea / registro (tareas, tickets, negocios), notificación interna por correo y
    en la app (entrada de cronología con `extra.notification`; las notificaciones de la
    app viven en el navegador y no se generan desde el servidor), editar propiedad
    (columna real o `extra`), asignar propietario, copiar propiedad entre asociados,
    correo de marketing (solo anotado, como en la app) y «Enviar correo» por Gmail con la
    primera cuenta conectada activa (mismo transporte que `gmail-send`). Cada acción
    escribe su entrada en la cronología del registro (`activities`, `who = Workflow`).
  - `store.mjs`: las RPC y las tablas CRM con el cliente de Supabase.
  - `index.ts`: `POST {}` con `Authorization: Bearer <service role>` →
    `{ ok, results: [{ id, status: waiting|completed|failed|cancelled|error }] }`.
- Planificadores: `scripts/local-scheduler.mjs` incluye ya `workflow-process` en sus
  funciones por defecto; `scripts/remote-scheduler.mjs --functions workflow-process`
  (opt-in explícito por variables de entorno, ver `docs/sequence-process.md`).
- Cliente: `src/workflow-engine.js` no toca un run con `claimed_until` vigente y
  `src/workflows-data.js` oculta las inscripciones `migrated`.

## Smoke test aislado

`npm run test:workflow-process` (`scripts/smoke-workflow-process.mjs`): PGlite (PostgreSQL en
WASM, en memoria) con `workflows.sql`, `workflow_runs.sql` y `workflow-process.sql` (dos
veces: repetible), tablas CRM mínimas y el mismo `processor.mjs` + `store.mjs` de la
función sobre un cliente falso. Comprueba: un run con un retraso de 2 días vencido hace 20
días se reserva, se reanuda, evalúa la rama (Sí → notificación), se detiene en el siguiente
retraso con `proxima_ejecucion = ahora + 1 h` y, en el tic siguiente, crea la tarea final y
termina `completed`; dos invocaciones simultáneas lo procesan una sola vez; runs futuros,
completados, cancelados, reservados o activos recientes no se tocan; una cancelación
escrita mientras se procesa gana; un registro inexistente deja `failed` con su log; un run
`active` abandonado se reanuda; un workflow eliminado nunca vence; y las 2 inscripciones
históricas `in_progress` se migran (una sola vez) y se reanudan hasta completarse.

## Activación en producción (cuando se decida; nada ejecutado)

1. Aplicar la migración y verificar:
   ```sh
   node scripts/apply-migration.mjs supabase/workflow-process.sql
   node scripts/mgmt-sql.mjs "select estado, count(*), min(proxima_ejecucion) from public.workflow_runs group by 1"
   node scripts/mgmt-sql.mjs "select status, count(*) from public.workflow_enrollments group by 1"
   ```
   Tras aplicarla deben aparecer 2 runs `waiting` (los históricos) y las 2 inscripciones
   originales como `migrated`.
2. Desplegar la función (reutiliza `_shared/gmail.ts`; los secretos de Gmail ya existen):
   `npx supabase functions deploy workflow-process`.
3. Invocarla: `node scripts/remote-scheduler.mjs --dry-run` no cubre workflows (lista
   secuencias); usar `node scripts/remote-scheduler.mjs --once --functions workflow-process`
   con las variables de opt-in y después el bucle con
   `--functions sequence-process,marketing-process,workflow-process`.
4. Verificar: `select id, estado, step_actual, proxima_ejecucion, log from public.workflow_runs order by updated_at desc`
   y la cronología de los registros afectados.

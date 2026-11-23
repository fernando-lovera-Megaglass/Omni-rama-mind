# Ejecutor local de secuencias

Cambios de esta ronda exclusivamente locales. Estado remoto reportado y pasos pendientes abajo.

## Smoke test aislado

`npm run test:sequence-process`

Usa PGlite (PostgreSQL en WASM, en memoria), carga `sequences.sql` y la nueva
`sequence-process.sql`, ejecuta las RPC reales y el mismo motor que usa la Edge Function.
Simula únicamente el transporte Gmail y los datos del contacto; no usa `.env`, claves,
Supabase remoto ni envía correos. Comprueba avance, último paso, tareas, terminales,
futuros, concurrencia, fallo de envío, cancelación, permisos y días laborables.
Los cinco tipos manuales se comprueban con un siguiente paso sin retraso: ninguno
avanza mientras espera la tarea, ni duplica tareas en ticks posteriores. Dos
solicitudes simultáneas de finalización solo reanudan una vez.
El comando también ejecuta el smoke de interfaz local: verifica Programado y el
hook real de `completeTask` para los cinco tipos manuales, con finalización en
viernes y siguiente paso el lunes, cronología única y reapertura sin nuevo avance.

## Configuración e invocación programada local

1. En una instancia **local** de Supabase, cargar las tablas base de contactos,
   empresas y tareas, `gmail.sql`, `sequences.sql` y después `sequence-process.sql`.
   No usar `scripts/apply-migration.mjs`: ese script apunta al proyecto remoto.
2. Servir `sequence-process` con Supabase CLI local. La función necesita las variables
   locales `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y, para Gmail real, las mismas
   credenciales OAuth que `gmail-send`. El smoke no necesita estos servicios.
3. En otra terminal, exportar `SEQUENCE_LOCAL_SERVICE_ROLE_KEY` de esa instancia local
   y ejecutar `node scripts/sequence-scheduler.mjs`. Ejecuta una vez por minuto,
   sin solapar peticiones. `--once` sirve para una invocación aislada.
   `SEQUENCE_LOCAL_URL` es opcional (por defecto `http://127.0.0.1:54321`).
   El scheduler rechaza hosts remotos y no carga archivos de credenciales.

El scheduler es un proceso persistente opt-in: debe mantenerse activo. No se instala
un cron ni se activa automáticamente. La función requiere POST y la clave service role;
ni la anon key ni una sesión normal de usuario pueden ejecutarla.

## Activación en producción (runbook)

Estado reportado por el usuario el **23-nov-2026 ~03:15 CST**, no consultado de nuevo
ni modificado durante esta tarea: función sin desplegar, sin pg_cron, 26 inscripciones
activas vencidas (mínima 9-nov 06:00 UTC), `sequence_step_runs` existe con cero filas.
`sequence-process.sql` figura aplicada y sus RPC fueron verificadas el 22-nov.
Los cierres anteriores acreditaban código local, no ejecución en producción.

### Preparación autorizada por el operador

Estos pasos quedan pendientes; este cambio NO despliega ni aplica SQL remoto.
Revisar primero remitentes Gmail activos y el historial del primer correo de cada
inscripción antigua para evitar reenvíos. No asignar un remitente arbitrario.

1. Desplegar la versión local, que incorpora GET autenticado de salud sin procesar pasos:
   `npx supabase functions deploy sequence-process --project-ref xysgvxnieigpaxtmxiui`.
   Mantener las credenciales OAuth de Gmail configuradas. La clave debe ser el JWT
   `service_role` que coincide exactamente con `SUPABASE_SERVICE_ROLE_KEY` de la función;
   una clave nueva `sb_secret_…` distinta no supera esta autenticación.
2. Aplicar `supabase/sequence-cron.sql` como postgres en SQL Editor. Instala pg_cron,
   pg_net y Vault y crea/reemplaza un único trabajo `omni-sequence-process`, cada minuto,
   **inactivo**. Reaplicar pausa también un trabajo existente. Si la plataforma exige
   habilitar Cron desde Integrations primero, hacerlo y volver a aplicar la migración.
3. Crear los secretos `sequence_project_url` y `sequence_service_role_key` en Vault
   desde el panel de Supabase, con URL `https://xysgvxnieigpaxtmxiui.supabase.co` y el JWT
   anterior. Actualizarlos por nombre si existen. No poner claves en archivos versionados.
   Exportar en la terminal `SEQUENCE_REMOTE_URL` y `SEQUENCE_REMOTE_SERVICE_ROLE_KEY`
   con esos mismos valores; disponer de `.supabase-mgmt-token` para Management API.
   El activador compara secretos dentro de SQL y solo recibe booleanos.

### Un comando de activación, después de preparar y autorizar

```sh
node scripts/sequence-activate.mjs --yes
```

Sin `--yes` o sin el opt-in de entorno no actúa. Verifica que el proyecto coincida
con el destino SQL, exige GET de salud autenticado de la versión local y falla con
el comando exacto de despliegue si falta. Verifica cron y Vault, pausa el trabajo,
ejecuta `sequence-backfill.mjs --from-db --apply --yes` y comprueba por SQL que no
quedan activas vencidas. El backfill escalona las congeladas desde al menos 15 minutos
a futuro, una cada 5 minutos, días laborables UTC; conserva terminales, pausadas,
futuras y espera de tareas. Finalmente habilita el cron y confirma la fila activa.
Si falla después de la pausa, el cron queda pausado: corregir la causa y repetir.
Una petición que ya estaba en vuelo no se cancela al pausar.

El conteo de reprogramadas es dinámico (26 en la medición reportada), no una
constante. Repetir no vuelve a desplazar las fechas futuras. La reprogramación no
crea filas ficticias en `sequence_step_runs` ni demuestra entrega de correos.

### Verificación de aceptación pendiente en producción

Tras alcanzar la primera fecha reprogramada, y luego durante todo el escalonado:

```sql
select count(*) as congeladas from public.sequence_enrollments
where status = 'active' and next_step_at < now() - interval '1 day'; -- debe ser 0
select count(*) as futuras from public.sequence_enrollments
where status = 'active' and next_step_at > now(); -- 26 inmediatamente tras backfill si nada cambió
select jobid, jobname, schedule, active from cron.job
where jobname = 'omni-sequence-process'; -- una fila activa, cada minuto
select status, count(*) from public.sequence_step_runs group by status;
select enrollment_id, step_number, status, last_error
from public.sequence_step_runs order by updated_at desc limit 30;
select d.status, d.start_time, d.return_message from cron.job_run_details d
join cron.job j using (jobid) where j.jobname = 'omni-sequence-process'
order by d.start_time desc limit 10;
select id, status_code, timed_out, error_msg, content from net._http_response
order by created desc limit 10;
```

`cron.job_run_details` exitoso solo demuestra que se encoló HTTP. Correlacionar su
request ID (return_message) con `net._http_response` y revisar logs de la función:
HTTP 2xx con `ok: true`, pasos `done` y avance real (los manuales dejan además `extra.waiting_task` en la inscripción).
Las respuestas de pg_net son temporales. No aceptar cero pasos tras su vencimiento,
ni considerar `error` como entrega. El cron vive en PostgreSQL y no depende de una
terminal. Los scripts local/remote-scheduler quedan para diagnóstico, no como servicio
persistente de producción. No mantener ambos invocadores encendidos.

### Rollback y pausa

```sql
select cron.alter_job(jobid, active := false) from cron.job
where jobname = 'omni-sequence-process';
-- Para quitar solo este trabajo, de forma repetible:
select cron.unschedule(jobid) from cron.job where jobname = 'omni-sequence-process';
```

No desinstalar extensiones compartidas. Los secretos exclusivos se pueden eliminar
manualmente desde Vault después de quitar el trabajo. El rollback no desenvía correos,
no borra tareas/recibos y no restaura fechas vencidas. Conservar `sequence_step_runs`.
Para reanudar, reaplicar la migración si se quitó el trabajo y repetir el activador.

Diseño basado en la [guía oficial de Supabase para programar Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
y [Cron](https://supabase.com/docs/guides/cron/quickstart).

## Semántica y operación

- `current_step` es el ordinal **pendiente**, desde 1, ordenando por `position`.
  Las posiciones pueden tener huecos. Cada invocación ejecuta como máximo un paso por
  inscripción, en lotes de 100. El siguiente plazo parte del procesamiento actual,
  usa días laborables UTC (sin festivos); cero días significa un minuto después.
- Solo se procesan inscripciones activas vencidas y secuencias no eliminadas.
  El último paso deja `finished`, `next_step_at = null` y suma uno a `current_step`.
- Un paso manual crea una tarea vinculada por `sequenceId`, `enrollmentId` y
  `stepPosition` (posición desde 0), conserva `current_step` y queda con
  `next_step_at = null` y `extra.waiting_task` (ID de tarea). Programado muestra
  «Manual · esperando la tarea». Completar la tarea reanuda una sola vez: el retraso
  laborable del siguiente paso parte de la finalización (cero días = ese momento).
  Si era el último paso, termina la inscripción. Reabrir no retrocede la secuencia.
  El guardado común de tareas invoca este hook también desde fichas y colas.
- La UI ya no envía el primer correo ni crea tareas en modo conectado: guarda la
  inscripción y `sender_account_id`. El backend reutiliza OAuth, MIME y transporte de
  `gmail-send`, cuyo endpoint HTTP exige JWT de usuario. Replies usan el recibo previo
  y Message-ID de Gmail. Los tokens ausentes sin valor predeterminado producen error.
- Las inscripciones antiguas no tienen remitente fiable. Asignar explícitamente
  `sender_account_id` de `connected_accounts` tras revisar propietario y correo.
  No se elige una cuenta arbitraria ni se reenvían automáticamente históricos cuyo
  primer paso pudo haber sido enviado por la UI. Revisar ese historial antes de activar.
- `sequence_step_runs` registra una reserva única por inscripción/paso. Evita doble
  envío en invocaciones concurrentes. Un error o caída deja el paso reservado y visible;
  consultar filas `error` o `processing` antiguas. Otros registros siguen avanzando.
  **No hay reintento automático**: Gmail no ofrece una transacción con PostgreSQL.
  Si se envió y se perdió la respuesta/confirmación, reenviar podría duplicarlo.
  Tras comprobar Gmail, reconciliar avance/recibo o, solo si no hubo envío, borrar la
  reserva fallida para reintentar. No borrar reservas a ciegas.
- Se revalida el estado antes de enviar y se preserva cualquier estado terminal
  escrito durante el envío. No se puede cancelar un envío ya en vuelo.
  Las **respuestas** sí se detectan: todo mensaje entrante de un contacto (sincronización
  de Gmail o bandeja, vía `createConversation`/`sendMessage` en `src/conversations-data.js`)
  llama a `unenrollByReason(contactId, 'replied')` de `src/sequences-data.js`, que pasa a
  «Respondió» las inscripciones activas o en pausa de las secuencias con el criterio
  «Cancelar la inscripción cuando el contacto responde», anota la cronología y refresca la
  ficha (`crm:enrolled`); el ejecutor ya no las toca.
  Los **negocios** y las **bajas** también detienen la secuencia desde el cliente:
  `src/data.js` llama a `cancelOnDeal` al crear un negocio con contacto (`addRecord`, punto
  único del panel «Crear negocio», la ficha, los workflows y la importación) y a
  `cancelOnUnsubscribe` cuando «No recibir correos de marketing» pasa a «Sí». Ambos usan
  `unenrollByReason` con `'deal'` / `'unsubscribed'`: la inscripción queda `unenrolled`
  («Cancelada») sin `nextStepAt`, con `extra.reason` («Negocio creado» / «Suscripción
  cancelada») y `stats.deal` / `stats.unsubscribed`, y la cronología recibe «Inscripción
  cancelada en «X»: se creó el negocio Y» / «…: canceló la suscripción». Un negocio o una
  baja escritos solo en la base (sin pasar por el cliente) no se detectan; los rebotes
  siguen sin inferirse.
- Las políticas abiertas existentes de las tablas CRM no se modifican aquí.
  Las RPC de ejecución y la tabla de ejecuciones están restringidas a service role.
  `sequence_complete_task` admite los roles CRM existentes y valida tarea completada,
  vínculo, paso y marcador bajo bloqueo antes de avanzar.

## Pausa y reanudación
Programado y la tarjeta Secuencias del contacto permiten pausar, reanudar y cancelar.
Programado también permite seleccionar inscripciones para operaciones masivas.
La pausa conserva el paso y guarda el plazo restante en extra.pauseRemainingMs.
Reanudar calcula ahora + plazo restante y desplaza sábados y domingos al lunes
a la misma hora local. Las tareas pendientes conservan su marcador y fecha nula.
Ambas transiciones registran una actividad en la cronología. Las pausadas siguen
visibles sin cuenta atrás y el filtro de estado de Análisis incluye «En pausa».
Las consultas y RPC del ejecutor exigen status = 'active': una inscripción pausada
no se ejecuta aunque su fecha anterior haya vencido. Un envío ya en vuelo no puede
retirarse.

## Personalización desde el compositor

El selector de Secuencias mantiene el buscador visible y resume los tipos de pasos.
El diálogo muestra una línea de tiempo editable y opciones de propietario, remitente
 e inicio inmediato/programado. La vista previa permite alternar contactos.
Los cambios de asunto/cuerpo se guardan en `sequence_enrollments.extra.stepOverrides`,
un objeto por ID estable de paso (`{ "<step-id>": { "subject": "…", "body": "…" } }`).
Solo se admiten esos dos campos y solo en pasos de correo. En selección múltiple se
copia la personalización a cada inscripción; los tokens se resuelven por contacto.
Las plantillas y `sequence_steps` no se modifican. Reabrir una nueva inscripción
parte de la plantilla; cambiar de secuencia dentro del diálogo conserva sus ediciones.

El procesador aplica los overrides antes de resolver tokens/marcadores. Para correos
manuales conserva el contenido resuelto en `tasks.extra.email` mediante la misma
transacción de `sequence_finish` que crea la tarea y pausa la inscripción. Los automáticos
usan el transporte existente. Se requiere la versión local actualizada de
`sequence-process.sql` y del procesador; no se aplicaron cambios remotos.

Verificación aislada: `node scripts/smoke-compose.mjs` comprueba ficha → Correo →
Secuencias → edición → inscripción, persistencia, plantilla intacta, cronología y tarjeta.
`node scripts/smoke-sequence-process.mjs` comprueba overrides persistidos con PostgreSQL
local en memoria para correo automático y manual. Gmail se simula.

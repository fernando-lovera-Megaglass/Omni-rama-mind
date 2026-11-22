# Ejecutor local de secuencias

Implementación local, sin despliegue ni migraciones aplicadas a producción.

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

Estado a 2026-11-21: la función `sequence-process` **no está desplegada** (no aparece en
`npx supabase functions list`), `supabase/sequence-process.sql` sigue **pendiente** en
`scripts/applied-migrations.json` (la tabla `sequence_step_runs` no existe en la base) y
hay 26 inscripciones `active` congeladas con `next_step_at` vencido desde el 9-11 de
noviembre. Nada de lo que sigue se ha ejecutado: son los pasos, en orden, para que lo
haga quien tenga acceso al proyecto. Cada paso deja comprobación.

Herramientas locales ya listas (sin credenciales dentro, sin tocar `.env`):

- `scripts/remote-scheduler.mjs`: invocador del proyecto remoto con opt-in explícito por
  variables de entorno (`SEQUENCE_REMOTE_URL` + `SEQUENCE_REMOTE_SERVICE_ROLE_KEY`).
  Exige https y una clave service role (JWT con rol `service_role` o `sb_secret_…`);
  rechaza claves publishable/anon y nunca imprime la clave. `--dry-run` no invoca nada:
  lista por PostgREST las inscripciones activas vencidas que la función procesaría.
  `--once` invoca una vez; sin opciones, un tic por minuto sin solapar.
- `scripts/sequence-backfill.mjs`: genera el plan y el SQL que reprograma las
  inscripciones activas congeladas (escalonadas a futuro, una cada 5 min, solo días
  laborables UTC) sin tocar terminales (`replied`, `meeting`, `bounced`,
  `unsubscribed`, `finished`, `unenrolled`), pausadas, activas con fecha futura ni
  activas esperando tarea. Lee las filas con `--from-db` (SELECT de solo lectura con el
  token de gestión) o `--from-json`. Solo escribe en la base con `--apply --yes` y si
  la migración figura como aplicada. Cada UPDATE lleva su guarda: repetirlo no cambia nada.
- Pruebas: `npm run test:sequence-remote` (scheduler contra un Supabase falso en
  loopback y backfill sobre PGlite con las 26 congeladas).

Pasos (desde `app/`, con `npx supabase login` y el proyecto enlazado):

1. **Revisar el histórico** antes de activar nada: qué inscripciones activas tienen ya
   un primer correo enviado por la interfaz y cuáles carecen de remitente.
   ```sh
   node scripts/mgmt-sql.mjs "select status, count(*), min(next_step_at), max(next_step_at) from public.sequence_enrollments group by 1 order by 1"
   node scripts/mgmt-sql.mjs "select id, contact_name, current_step, next_step_at, sender_account_id from public.sequence_enrollments where status = 'active' order by next_step_at"
   ```
2. **Aplicar la migración** (crea `sequence_step_runs`, `extra`, el índice y las RPC;
   es repetible). Queda anotada en `scripts/applied-migrations.json`.
   ```sh
   node scripts/apply-migration.mjs supabase/sequence-process.sql
   node scripts/mgmt-sql.mjs "select to_regclass('public.sequence_step_runs') as tabla, to_regprocedure('public.sequence_due(timestamptz)') as rpc"
   ```
   Alternativa sin token de gestión: pegar el archivo en el SQL Editor y anotar la
   entrada a mano en `scripts/applied-migrations.json`.
3. **Asignar remitente** a las inscripciones activas que vayan a seguir: un
   `sender_account_id` de `connected_accounts` (Gmail activo) elegido por propietario
   y correo, nunca una cuenta arbitraria. Las que no deban continuar, cancelarlas
   (`status = 'unenrolled'`) en lugar de dejarlas sin remitente: sin remitente, el
   primer paso de correo de esa inscripción quedará en `sequence_step_runs` con `error`.
   ```sh
   node scripts/mgmt-sql.mjs "select id, email, status from public.connected_accounts where provider = 'gmail'"
   node scripts/mgmt-sql.mjs "update public.sequence_enrollments set sender_account_id = '<uuid de la cuenta>' where status = 'active' and enrolled_by = '<propietario>' and sender_account_id is null"
   ```
4. **Desplegar la función** (usa `_shared/gmail.ts`; `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase; los secretos de Gmail ya existen
   para `gmail-send`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
   ```sh
   npx supabase functions deploy sequence-process
   npx supabase functions list
   npx supabase secrets list
   ```
   Si la pasarela rechazara la clave `sb_secret_…` con JWT obligatorio, usar la clave
   `service_role` heredada (JWT) del panel Project Settings › API, o fijar
   `[functions.sequence-process] verify_jwt = false` en `supabase/config.toml` y volver
   a desplegar: la función comprueba por sí misma el service role.
5. **Comprobar conectividad sin ejecutar nada** (la clave se exporta solo en esa
   terminal; no va a `.env` ni a ningún archivo):
   ```sh
   export SEQUENCE_REMOTE_URL=https://<ref>.supabase.co
   export SEQUENCE_REMOTE_SERVICE_ROLE_KEY=<clave service role>
   node scripts/remote-scheduler.mjs --dry-run
   ```
   Debe listar las inscripciones activas vencidas (hoy, 26).
6. **Reprogramar las congeladas** para que no salgan todas en el primer tic:
   ```sh
   node scripts/sequence-backfill.mjs --from-db --out /tmp/sequence-backfill.sql
   ```
   Revisar el plan impreso y el SQL; luego aplicarlo con
   `node scripts/sequence-backfill.mjs --from-db --apply --yes` (o pegar el SQL en el
   SQL Editor). Verificar con la consulta del paso 1: ninguna `active` con fecha pasada.
   `--start 2026-11-24T09:00:00Z --spacing 10` ajustan inicio y ritmo.
7. **Primera invocación controlada** y verificación:
   ```sh
   node scripts/remote-scheduler.mjs --once
   node scripts/mgmt-sql.mjs "select status, count(*) from public.sequence_step_runs group by 1"
   node scripts/mgmt-sql.mjs "select enrollment_id, step_number, status, last_error from public.sequence_step_runs where status <> 'done' order by updated_at desc limit 20"
   ```
   Con el escalonado del paso 6 el primer tic procesará solo lo ya vencido (nada o
   muy poco). Un `error` con `Missing sender_account_id` señala el paso 3.
8. **Dejar el invocador en marcha** en una máquina que permanezca encendida:
   `node scripts/remote-scheduler.mjs` (un tic por minuto; `--functions
   sequence-process,marketing-process` cubre también los correos de marketing
   programados). Sin opciones de cron en el proyecto, este proceso es el único
   invocador: si se detiene, las secuencias vuelven a congelarse (sin pérdida: se
   retoman al relanzarlo). Alternativa sin proceso propio, pendiente de decidir:
   `pg_cron` + `pg_net` llamando a la función cada minuto con la clave guardada en
   Vault.

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

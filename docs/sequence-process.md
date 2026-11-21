# Ejecutor local de secuencias

Implementación local, sin despliegue ni migraciones aplicadas a producción.

## Smoke test aislado

`npm run test:sequence-process`

Usa PGlite (PostgreSQL en WASM, en memoria), carga `sequences.sql` y la nueva
`sequence-process.sql`, ejecuta las RPC reales y el mismo motor que usa la Edge Function.
Simula únicamente el transporte Gmail y los datos del contacto; no usa `.env`, claves,
Supabase remoto ni envía correos. Comprueba avance, último paso, tareas, terminales,
futuros, concurrencia, fallo de envío, cancelación, permisos y días laborables.

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
  Detectar automáticamente respuestas, rebotes o bajas requiere integrarlo con el
  sincronizador/webhooks; este ejecutor respeta esos estados, no los infiere.
- Las políticas abiertas existentes de las tablas CRM no se modifican aquí.
  Las RPC de ejecución y la tabla de ejecuciones están restringidas a service role.
  `sequence_complete_task` admite los roles CRM existentes y valida tarea completada,
  vínculo, paso y marcador bajo bloqueo antes de avanzar.

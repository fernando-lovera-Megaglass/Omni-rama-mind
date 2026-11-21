# Worker de correos de marketing programados

Implementación local, sin despliegue ni migraciones aplicadas a producción. Reutiliza el
patrón del ejecutor de secuencias (`docs/sequence-process.md`): RPC `security definer`
solo para la service role, una Edge Function que las invoca y el mismo planificador local.

## El problema

«Programar» en Marketing › Correo dejaba el correo con `estado = 'programado'` y
`programado_para`, pero el envío era 100 % del lado del cliente: nadie lo recogía al
llegar la hora. Ahora lo hace un worker del servidor.

## Piezas

- `supabase/marketing-process.sql` (pendiente): tabla `marketing_email_runs` (una
  ejecución por correo: reserva única, cursor `next_index`, `sent`/`failed`,
  `lease_until`, `last_error`) y las RPC `marketing_due`, `marketing_claim`,
  `marketing_recipients`, `marketing_progress` y `marketing_finish`. Ni anon ni
  authenticated pueden ejecutarlas ni leer la tabla.
- `supabase/functions/marketing-process/`: la Edge Function (`index.ts`, exige POST con
  la service role key), el motor independiente del runtime (`processor.mjs`) y el
  acceso a datos (`store.mjs`). Envía con los mismos helpers OAuth/MIME que `gmail-send`
  (cuyo endpoint HTTP exige JWT de usuario, por eso no se llama por HTTP).
- `src/marketing-data.js`: al programar, la app congela en `destinatarios` la
  instantánea `ids` (contactos con correo del segmento o de «todos»), `snapshotAt` y
  `senderAccountId` (la cuenta de Gmail real y activa cuya dirección es el remitente).
  Cambiar la audiencia o el remitente de un correo que sigue programado la renueva.
  No hace falta ninguna columna nueva en `marketing_emails`.
- `scripts/local-scheduler.mjs`: planificador local genérico (un tic por minuto, sin
  solapar) para `sequence-process` y `marketing-process`. `scripts/sequence-scheduler.mjs`
  delega en él y conserva sus variables.

## Smoke test aislado (el «worker corriendo localmente»)

`npm run test:marketing-process`

Usa PGlite (PostgreSQL en WASM, en memoria), carga `activities.sql`,
`marketing-emails.sql` y `marketing-process.sql`, ejecuta las RPC reales y el mismo
motor que la Edge Function con Gmail simulado. Comprueba el criterio de aceptación
(una campaña con `programado_para` en el pasado pasa a `enviado` con `enviado_at` y
`enviados > 0`; una con fecha futura no se toca) y además borradores, instantáneas de
segmentos activos, segmentos estáticos, lotes entre tics, fallos por destinatario,
cancelación en vuelo, presupuesto diario, remitente ausente, migración repetible,
tics concurrentes y permisos.

## Invocación programada local

1. En una instancia **local** de Supabase cargar contactos, `activities.sql`,
   `segments.sql`, `gmail.sql`, `marketing-emails.sql` y después `marketing-process.sql`.
   No usar `scripts/apply-migration.mjs`: apunta al proyecto remoto.
2. Servir `marketing-process` con Supabase CLI local (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` y, para Gmail real, las credenciales OAuth de `gmail-send`).
3. `LOCAL_SERVICE_ROLE_KEY=<clave local> node scripts/local-scheduler.mjs` ejecuta
   `sequence-process` y `marketing-process` una vez por minuto; `--once` para un solo tic,
   `--functions marketing-process` para una sola función. Solo acepta hosts locales por HTTP.

En producción la misma función la puede invocar **pg_cron + pg_net** cada minuto con la
URL y la service role key leídas de Vault: el bloque está al final de
`marketing-process.sql`, comentado a propósito. No se activa con la migración.

## Semántica y límites

- Se procesan correos con `estado = 'programado'` y `programado_para <= now()`, por orden
  de fecha, hasta 20 por tic. `marketing_claim` usa `for update skip locked` y una fila
  de ejecución con lease de 10 minutos: dos tics simultáneos nunca envían lo mismo.
- Destinatarios: `destinatarios.ids` (instantánea de la app) → `member_ids` de un segmento
  estático → todos los contactos con correo. Un segmento **activo sin instantánea** no se
  puede evaluar en SQL: la ejecución queda en `error` («vuelve a programar desde la app»).
- Remitente: `destinatarios.senderAccountId` si sigue activa; si no, la cuenta de Gmail
  activa cuyo correo es `de_email`. Nunca una cuenta arbitraria; sin cuenta → `error`.
- Límites (variables de la función): `MARKETING_SEND_LIMIT` mensajes por invocación (50),
  `MARKETING_DAILY_LIMIT` por día UTC entre todas las campañas (400, por debajo del tope
  de 500/día de Gmail personal; aproximado con las ejecuciones tocadas ese día) y
  `MARKETING_SEND_PAUSE_MS` entre mensajes (250). Una campaña que no cabe queda `partial`
  (lease liberado) y el siguiente tic continúa desde `next_index`; solo pasa a `enviado`
  cuando se intentó con todos los destinatarios.
- Cada índice se reserva en la base **antes** del envío externo: como mucho un intento por
  destinatario; una caída pierde como máximo ese mensaje, nunca lo duplica. Un fallo de
  Gmail con un destinatario se cuenta en `failed`/`last_error` y la campaña sigue.
- Al terminar: `estado = 'enviado'`, `enviado_at = now()`, `enviados = entregados = sent`
  (aperturas y clics siguen en 0: no hay seguimiento real). `programado_para` se conserva
  como registro. Cada destinatario recibe la actividad «Correo de marketing: …» en su
  cronología (`extra.marketingEmailId`, `opened: false`), igual que el envío inmediato.
- Si la app quita el correo de «programado» durante el envío, se respeta: la ejecución
  queda `cancelled` y no se envía más. Un envío ya en vuelo no se puede cancelar.
- **No hay reintento automático** de ejecuciones en `error`: revisar `marketing_email_runs`
  (`last_error`) con la service role. Para reintentar desde donde quedó, volver a poner
  `status = 'processing'` y `lease_until = null`; borrar la fila solo si no se envió nada.
- Las políticas abiertas de `marketing_emails`, `contacts` y `activities` no cambian aquí.

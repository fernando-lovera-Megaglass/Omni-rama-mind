# Estados de llamada (twilio-voice → twilio-call-status)

Solo código local: ninguna función se ha desplegado ni se ha tocado la configuración de Twilio.

## Qué fallaba (comprobado en el código y con SQL de solo lectura, 2026-11-21)

- `call_logs`: 32 inbound en «ringing», 6 outbound en «initiated», 3 «completed» sin duración; 2 inbound
  «failed» el 20-nov 00:53–00:54 UTC.
- Causa raíz: `twilio-voice` escribía `statusCallback` / `statusCallbackEvent` como atributos de `<Dial>`.
  En TwiML esos atributos pertenecen al **sustantivo** (`<Number>`, `<Client>`, `<Sip>`); sobre `<Dial>`
  Twilio los ignora. Como ni el número ni la TwiML App llevan `status_callback`, nadie llamaba a
  `twilio-call-status` por las llamadas salientes del SDK ni por las entrantes que suenan en el navegador:
  el registro se quedaba en el estado con el que se insertó. La versión v5 de `twilio-call-status` (firma,
  resolución del SID padre) era correcta pero no recibía peticiones.
- Las 2 inbound «failed» de las 00:53 no son un fallo del webhook: las escribió `twilio-incoming` en el
  propio insert (`ended_at = started_at`, `duration_sec = 0`) porque en ese momento `canForward` era falso
  (conexión no activa o `incoming_forward_number` vacío/igual al número). Hoy la conexión está activa con un
  número de desvío válido, así que no se repetirá; no hace falta mirar más en Twilio.

## El arreglo

- `supabase/functions/twilio-voice/index.ts`: los callbacks van en `<Number>` (saliente) y `<Client>`
  (entrante): `statusCallback=…/twilio-call-status`, `statusCallbackMethod="POST"`,
  `statusCallbackEvent="initiated ringing answered completed"`; `<Dial>` lleva `action=…/twilio-call-status`
  `method="POST"` para reportar `DialCallStatus` / `DialCallDuration` al terminar (y `timeout="30"` en la
  entrante). La grabación (`record` + `recordingStatusCallback`) no cambia.
- `supabase/functions/twilio-call-status/index.ts`: resuelve el registro también por `ParentCallSid` (los
  callbacks del tramo hijo lo traen; antes había que preguntar a Twilio por el padre), prefiere
  `DialCallStatus` sobre `CallStatus` (en el `action` del `<Dial>` el padre sigue «in-progress»), valida el
  estado y es monotónico: un evento tardío o duplicado nunca retrocede una llamada terminada ni una etapa.
- Pruebas locales: `node scripts/test-twilio-voice.mjs` (nuevo: TwiML saliente/entrante y los inserts) y
  `node scripts/test-twilio-call-status.mjs` (firmas, SIDs, padre/hijo, grabación; ampliado con
  `ParentCallSid`, `DialCallStatus` y la guardia monotónica).

## Qué hace falta en producción (no hecho aquí)

1. Desplegar `twilio-voice` y `twilio-call-status` (`supabase functions deploy twilio-voice twilio-call-status`).
2. Prueba de aceptación: una llamada saliente desde el marcador y una entrante al número. En `call_logs` el
   registro debe pasar por `initiated`/`ringing` → `in-progress` → `completed` (o `no-answer`/`busy`/`failed`)
   con `duration_sec > 0` en las contestadas, sin intervención manual.
3. Las 38 llamadas ya atascadas no se corrigen solas: `node scripts/backfill-call-status.mjs` pregunta a Twilio
   su estado real y actualiza las filas (lee el token desde la base; ejecutarlo a propósito, una vez).

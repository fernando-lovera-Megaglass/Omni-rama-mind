# Estados de SMS y WhatsApp salientes

`twilio-send` crea el intento antes de llamar a Twilio y envía `StatusCallback`
con el ID local. El SID se guarda al recibir la respuesta de Twilio o un callback
anterior a esa respuesta. Los rechazos se guardan como `failed`; la columna `error`
existente conserva el código del proveedor y el detalle. No requiere migración.

`twilio-message-status` verifica la firma con el token de la conexión del mensaje,
comprueba AccountSid/MessageSid y actualiza estados con filtros atómicos para no
retroceder ante eventos desordenados. Un fallo de persistencia devuelve HTTP 500.
El endpoint no requiere JWT (config.toml); sí requiere X-Twilio-Signature.
La URL firmada se reconstruye con SUPABASE_URL, igual que la URL enviada a Twilio.
El webhook entrante del número no cambia.

## Verificación local

`node scripts/test-twilio-message-status.mjs`

Ejecuta los handlers con base de datos y API simuladas, firmas HMAC reales y sin
credenciales ni tráfico a Twilio. Incluye envío, rechazo 21608, fallo de transporte,
callbacks tempranos/duplicados/desordenados, aislamiento y errores de persistencia.

## Aceptación real pendiente

Este cambio no se ha desplegado ni ha enviado SMS reales. En un entorno de pruebas
con webhook HTTPS accesible, enviar un SMS a un destino autorizado y comprobar en
menos de 60 segundos la fila por el SID devuelto: sent/delivered, o failed con causa
(undelivered también registra el fallo reportado por el operador). El tiempo real
depende de Twilio, del operador y de la accesibilidad del callback.

Las filas antiguas no reciben retroactivamente este StatusCallback; se deben
reconciliar por su message_sid consultando Twilio en un trabajo autorizado aparte.
Un fallo de transporte puede ser ambiguo: failed registra el error observado,
pero no demuestra que Twilio no aceptara el SMS. No se reenvía automáticamente.

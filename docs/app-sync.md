# Sincronizaciones manuales de aplicaciones

Implementación local; no se han aplicado migraciones ni desplegado funciones.

## Preparación de un entorno de prueba

Requiere las migraciones existentes `schema.sql`, `activities.sql`, `auth.sql`, `rls_team.sql` y `gmail.sql`. Aplicar después `supabase/app-sync.sql` en el entorno de prueba. La función nueva es `app-sync`; `gmail-auth-url` incorpora la autorización opcional de Calendar. El callback y los tokens protegidos existentes de Gmail se reutilizan. No hay tokens en localStorage.

Habilitar Google Calendar API en el proyecto OAuth y permitir el scope `https://www.googleapis.com/auth/calendar.events.readonly`. Autorizar Calendar desde Integración de datos, incluso si Gmail ya estaba conectado. No basta con tener una cuenta de Gmail: los permisos concedidos se verifican en servidor. Se mantienen los requisitos de secretos, callback y orígenes descritos en `gmail-setup.md`.

La función requiere una sesión válida y membresía activa en el equipo; las búsquedas de contactos usan el JWT del usuario y sus políticas RLS. Solo el servidor puede escribir estados y mappings; el usuario solo puede leer su estado. La función SQL no es ejecutable desde el navegador.

## Alcance visible en la interfaz

- Sincronización manual de una vía. No hay sincronización programada ni escritura en Google.
- Calendar principal: eventos → tareas. Cada serie recurrente se representa como una tarea con su regla original en `extra.recurrence`; las excepciones se guardan separadamente. No se expanden infinitas ocurrencias. Las cancelaciones marcan la tarea como completada y conservan su procedencia. Las fechas de día completo se guardan a medianoche UTC, junto al valor original de Google. No se importan calendarios secundarios.
- Gmail: enviados y recibidos de los últimos 90 días, excluyendo borradores, papelera y spam. Por cada contacto visible cuyo correo coincide con From, To o Cc, se registra una actividad con texto, asunto, dirección y fecha reales. No crea contactos ni descarga adjuntos. No usa el importador de conversaciones de la bandeja de entrada.
- Un clic procesa una página: hasta 100 eventos o 25 mensajes. Si hay más, aparece «Continuar sincronización». El cursor persiste entre dispositivos. Los contadores muestran el último lote confirmado, no un total histórico ni una estimación. Un correo con varios contactos puede crear varias actividades; los correos sin coincidencia cuentan como consultados, no creados.
- Calendar utiliza el sync token de Google al completar todas las páginas. Un 410 inicia una nueva lectura completa, conservando los mappings para evitar duplicados. Gmail recorre de nuevo la ventana al terminar un ciclo; esto permite asociar mensajes con contactos recién creados.
- Cada lote guarda registros, mappings, cursor y conteos en una transacción. Las peticiones concurrentes se controlan con versión; la perdedora debe reintentarse. Los errores no avanzan el cursor ni la fecha de éxito.
- Outlook, WhatsApp, Mailchimp, Zapier y QuickBooks muestran «Disponible próximamente» sin acciones ficticias. Se ignoran por completo las antiguas conexiones de `crm:apps`.

## Comprobación local

`node scripts/smoke-app-sync.mjs` ejecuta SQL en PGlite y el handler real con respuestas controladas de Google. Comprueba migración repetible, duplicados, actualizaciones, cancelaciones, rollback, concurrencia, permisos, páginas, 410, correos entrantes/salientes y fallos de almacenamiento.

`node scripts/smoke-app-sync-ui.mjs` comprueba cuentas reales, datos antiguos falsos ignorados, ausencia de acciones en aplicaciones futuras, contadores confirmados y errores de sincronización.

`node scripts/smoke-integration.mjs`, `node scripts/smoke-gmail.mjs` y `npm run build` cubren regresiones de interfaz, OAuth y compilación.

Las pruebas con proveedores controlados no certifican autorización o funcionamiento en la cuenta real. La prueba con Google requiere preparar un entorno de prueba y otorgar el permiso de Calendar; no se realizó contra producción.

Referencias oficiales: [Calendar events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) y [Gmail messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list).

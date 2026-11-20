# Sincronización de configuración

Migración local preparada: `supabase/user_settings.sql`. No se ha aplicado a ningún servidor.

El modelo actual es una cuenta CRM por proyecto Supabase. Todos los usuarios autenticados leen los ajustes de cuenta; solo `app_metadata.role = admin`, asignado por un servidor de confianza, puede escribirlos. Los roles de `crm:users` y `user_metadata` no conceden permisos. Para múltiples organizaciones será necesario incorporar membresías e identificador de cuenta.

`crm:profile`, `crm:notif`, `crm:settings:general-*` y el estado del menú son personales. `crm:account`, `crm:integrations` y los demás toggles `crm:settings:*` son de cuenta. Las conexiones Gmail/Twilio conservan su persistencia OAuth existente; un toggle no crea una conexión.

La página espera la carga inicial. Las escrituras se reflejan inmediatamente en memoria y se serializan a Supabase. El respaldo y la cola offline están aislados por usuario; se reintentan al abrir la página o recuperar conexión. El servidor prevalece sobre una copia local sin cambios pendientes. Los errores muestran un aviso de falta de sincronización. No se importan automáticamente las antiguas claves locales sin identidad para evitar atribuir datos de otro usuario; siguen disponibles en modo demo. Los demás almacenes de objetos/pipelines quedan fuera de este cambio.

Validación local:

- `node scripts/smoke-settings-sync.mjs`: sesiones simuladas con almacenamientos independientes, toggle persistente, aislamiento, cuenta compartida y cola offline.
- `node scripts/smoke-settings-rls.mjs`: PostgreSQL embebido (PGlite), migración repetible y políticas RLS.
- `node scripts/smoke-settings.mjs`: regresión DOM de configuración.
- `npm run build`.

Smoke real pendiente en Supabase de desarrollo: aplicar migración allí, configurar un administrador de prueba, abrir dos navegadores con el mismo usuario, cambiar un toggle en General > Correo, esperar escritura y recargar el segundo. Repetir con un ajuste de cuenta y otro usuario; comprobar lectura compartida y rechazo de escritura sin rol admin. No usar producción.

# Sincronización de configuración

El registro local indica que `supabase/user_settings.sql` se aplicó el 22-nov-2026. La nueva migración `supabase/account-settings-authenticated.sql` está **pendiente**, preparada solo localmente; no se ejecutó SQL remoto en este cambio.

El modelo actual es una cuenta CRM por proyecto Supabase. Decisión del 22-nov-2026: opción (b), todos los usuarios autenticados pueden leer y escribir los ajustes de cuenta tras aplicar la nueva migración. Esto incluye reemplazar y borrar ajustes compartidos. No requiere asignar roles admin ni renovar JWT; los usuarios anónimos siguen sin acceso. Los roles de `crm:users` y `user_metadata` no conceden permisos. Para múltiples organizaciones será necesario incorporar membresías e identificador de cuenta.

`crm:profile`, `crm:notif`, `crm:settings:general-*` y el estado del menú son personales. `crm:account`, `crm:integrations` y los demás toggles `crm:settings:*` son de cuenta. Las conexiones Gmail/Twilio conservan su persistencia OAuth existente; un toggle no crea una conexión.

La página espera la carga inicial. Las escrituras se reflejan inmediatamente en memoria y se serializan a Supabase. El respaldo y la cola offline están aislados por usuario; se reintentan al abrir la página o recuperar conexión. El servidor prevalece sobre una copia local sin cambios pendientes. Los errores muestran un aviso de falta de sincronización. No se importan automáticamente las antiguas claves locales sin identidad para evitar atribuir datos de otro usuario; siguen disponibles en modo demo. Los demás almacenes de objetos/pipelines quedan fuera de este cambio.

Validación local:

- `node scripts/smoke-settings-sync.mjs`: sesiones simuladas con almacenamientos independientes, toggle persistente, aislamiento, cuenta compartida y cola offline.
- `node scripts/smoke-settings-rls.mjs`: PostgreSQL embebido (PGlite), migración repetible y políticas RLS.
- `node scripts/smoke-settings.mjs`: regresión DOM de configuración.
- `npm run build`.

## Aplicación y aceptación pendientes

La evidencia aportada indica que el usuario real no tiene `app_metadata.role` y la política anterior rechaza sus escrituras. Se retiran también los bloqueos admin del almacén del frontend; las escrituras siguen sujetas a RLS. Esta decisión asume que todos los usuarios autenticados del proyecto pertenecen a la única cuenta CRM. No proporciona aislamiento entre organizaciones.

Aplicar la nueva migración **después** de `user_settings.sql` y `rls_team.sql`. Reaplicar esas migraciones históricas puede restablecer restricciones anteriores; en ese caso volver a aplicar esta migración. La migración nueva es repetible y no modifica datos ni permisos de `user_settings`.

Cuando se autorice un entorno de destino, comprobar primero el proyecto configurado en `scripts/mgmt-sql.mjs`; ejecutar `node scripts/apply-migration.mjs supabase/account-settings-authenticated.sql`. Ese comando modifica el servidor y registra el éxito en `scripts/applied-migrations.json`; deliberadamente no se ejecutó en esta tarea.

Aceptación en ese entorno (pendiente, no sustituida por los tests locales):

1. Con usuario sin rol admin, personalizar «Acerca de» de Contactos, marcar «Aplicar a todos» y guardar. Esperar a que termine la escritura sin toast de error.
2. Verificar mediante SQL: `select scope, key, value, updated_at from public.account_settings where key = 'crm:contacts:cardprops';` Debe contener los campos elegidos y `scope = 'account'`.
3. Abrir otra sesión independiente sin personalización propia de esa clave y recargar el registro: debe aplicar los campos compartidos. Los ajustes personales existentes tienen precedencia y no se eliminan al guardar globalmente.
4. Crear y guardar una vista de equipo y una vista previa con nombre. Recargar y verificar que persisten sin toast. Consultar `select key, value from public.account_settings where key in ('crm:contacts:recordviews', 'crm:contacts:previewviews') or key like 'crm:contacts:layout:%' or key like 'crm:contacts:preview:%';`.

El smoke SQL local reproduce el rechazo anterior, aplica dos veces la corrección y verifica INSERT/UPSERT/DELETE sin rol, lectura con otra identidad, claves de tarjeta/vistas/preview, rechazo anónimo y aislamiento personal. El smoke del almacén verifica persistencia entre sesiones simuladas y cola offline sin rol admin. No equivalen a aceptación E2E con navegador y Supabase real.

## Personalización del índice

Las claves `crm:<type>:defaultcolumns`, `crm:<type>:quickfilters` y `crm:<type>:boardcard`
son ajustes de cuenta gestionados por `settings-store` para contactos, empresas,
negocios, tickets y tareas. La configuración y las listas priorizan el valor remoto;
si no existe, leen la clave local antigua, sin subirla automáticamente. Las columnas
personales de la lista conservan precedencia sobre las predeterminadas de cuenta.
Restablecer guarda los valores predeterminados de columnas/filtros y una lista vacía
para tarjetas, evitando que resurja una personalización local antigua.

Requiere la política de `account-settings-authenticated.sql` descrita arriba para
usuarios sin rol admin. Este cambio no aplica migraciones ni despliega código.
Los smoke de sincronización y RLS cubren estas claves con almacenes independientes
y PostgreSQL local. La aceptación en Supabase real sigue pendiente: guardar columnas
de Contactos, consultar
`select scope, key, value from public.account_settings where key = 'crm:contacts:defaultcolumns';`
y abrir Contactos en otro navegador sin almacenamiento local ni columnas personales.

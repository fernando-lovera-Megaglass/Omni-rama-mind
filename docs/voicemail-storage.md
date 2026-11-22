# Storage de mensajes de voz

Estado: aplicada en el proyecto (verificado con SQL de solo lectura el 2026-11-22:
el bucket `voicemails` existe desde el 2026-11-18, con las políticas
`voicemails_insert_own`, `voicemails_update_own` y `voicemails_delete_own` y las
columnas `voicemail_text` / `voicemail_url` en `twilio_connections`). La aplicación se
hizo fuera del registro `scripts/applied-migrations.json`, que quedó `pendiente` por
error hasta esa verificación; la fecha exacta no consta. Este documento conserva los
pasos por si hay que reaplicarla (es repetible).

`supabase/voicemail-storage.sql` es la única fuente del esquema: conserva las
columnas `voicemail_text` y `voicemail_url`, crea el bucket público `voicemails`
y recrea las políticas de escritura por carpeta `auth.uid()`. Puede ejecutarse
de nuevo sin duplicar el bucket o las políticas. Twilio necesita acceso público
al audio; las escrituras requieren un usuario autenticado y su propia carpeta.

## Aplicación futura

Solo cuando se autorice modificar el proyecto remoto y exista un token de gestión
válido, ejecutar desde la raíz del proyecto:

```sh
node scripts/apply-migration.mjs supabase/voicemail-storage.sql
```

El comando histórico `node scripts/apply-voicemail-schema.mjs` delega en ese mismo
aplicador, conserva su código de salida y no contiene SQL propio. Ambos apuntan
al proyecto remoto. El aplicador marca `voicemail-storage.sql` como `aplicada`
con fecha únicamente después de que la API confirme el SQL. Un fallo mantiene
la entrada pendiente.

## Verificación después de aplicar

1. Consultar `GET /storage/v1/bucket/voicemails` con credenciales autorizadas para
   consultar metadatos de buckets: debe devolver 200 y `public: true`. La anon key
   por sí sola puede no tener permiso para esta consulta; no usar esa respuesta
   como única prueba de existencia.
2. Con sesión de usuario en la UI de mensajes de voz, seleccionar un MP3 de prueba
   menor de 10 MB y guardar. Confirmar que la subida termina correctamente y que
   la configuración conserva la URL al recargar.
3. Abrir la URL `/storage/v1/object/public/voicemails/<uid>/mensaje-….mp3` sin sesión:
   debe devolver 200 y audio reproducible. `getPublicUrl()` solo construye la URL;
   no demuestra que el archivo exista.
4. Confirmar la entrada `aplicada` con fecha en `scripts/applied-migrations.json`.

Para ensayar sin producción, ejecutar el SQL en una instancia local de Supabase
con `public.twilio_connections` creada. No utilizar el wrapper remoto para ello.

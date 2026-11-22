# Ajustes compartidos: escritura por equipo

Migración local pendiente: `supabase/account-settings-team.sql`. No se ha aplicado a producción.
Requiere `user_settings.sql` y `rls_team.sql`; debe ejecutarse después de ambas.
Sustituye la alternativa `account-settings-authenticated.sql`, que no debe aplicarse después.
Reaplicar las migraciones históricas puede restaurar políticas anteriores: ejecutar esta al final.

La política usa `public.is_team_member()` tanto en USING como en WITH CHECK.
Un miembro activo puede insertar, actualizar y borrar sin `app_metadata.role`.
La lectura continúa abierta para authenticated (USING true); anon conserva sus privilegios revocados.
No modifica usuarios, membresías, datos existentes ni user_settings.

## Verificación local

- `node scripts/smoke-settings-rls.mjs`: SQL real en PGlite, migración repetida, CRUD sin rol admin, lectura entre usuarios, rechazo de miembros inactivos/no miembros incluso con JWT admin, rechazo anónimo y aislamiento personal.
- `node scripts/smoke-record-customize.mjs`: regresión del editor y personalización.

## Aceptación remota pendiente de autorización

1. Verificar que el usuario real `8a54b581-dfc4-4949-aa01-9279548a73db` es miembro activo de team_members; no asignar rol admin al JWT.
2. Aplicar la migración mediante scripts/apply-migration.mjs en el destino autorizado (actualiza el registro solo al tener éxito).
3. Con su sesión, crear una vista de equipo desde layout/?type=contacts; cambiar y guardar el diseño. Crear también un panel de vista previa con nombre desde Configuración › Objetos.
4. Consultar `select key, value from public.account_settings where key like 'crm:contacts:%';` y comprobar diseño, lista de vistas y panel con nombre.
5. Abrir la misma cuenta en otro navegador, recargar y comprobar el diseño y panel guardados; editar y eliminar la vista y verificar los cambios en SQL.
6. Ejecutar `SMOKE_LIVE=1 node scripts/smoke-record-customize.mjs` solo con autorización de escritura remota. Ya exige persistencia compartida y falla ante el rechazo 42501. El helper usa un usuario SMOKE temporal, por lo que no sustituye la aceptación manual con la sesión real.

No se ejecutó ninguna de estas operaciones remotas durante la preparación local.

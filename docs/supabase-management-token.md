# Renovar el token de gestión de Supabase

`scripts/mgmt-sql.mjs` y `scripts/apply-migration.mjs` leen el token personal de
gestión desde `app/.supabase-mgmt-token`, independientemente del directorio de
ejecución. No es la clave pública ni la clave `service_role` del proyecto.

Si la API responde HTTP 401, ambos scripts terminan con código 1 y muestran:

> token de gestión expirado: renuévalo en https://supabase.com/dashboard/account/tokens y guárdalo en app/.supabase-mgmt-token

Un 401 también puede indicar un token inválido o revocado. Para recuperarlo:

1. Inicia sesión en https://supabase.com/dashboard/account/tokens con una cuenta
   que tenga acceso al proyecto `xysgvxnieigpaxtmxiui`.
2. Genera un nuevo token personal de acceso.
3. Reemplaza el contenido de `app/.supabase-mgmt-token` con el token, sin comillas
   ni prefijo `Bearer`. Desde la raíz `app/`, restringe sus permisos con
   `chmod 600 .supabase-mgmt-token`. No lo publiques ni lo incluyas en Git.
4. Desde `app/`, verifica el acceso con una consulta que no modifica datos:

   ```sh
   node scripts/mgmt-sql.mjs "select 1"
   ```

   Con un token válido y acceso al proyecto, debe devolver un resultado con el
   valor `1` y terminar con código 0. Si persiste el 401, revisa que hayas guardado
   el nuevo token en el archivo correcto. Otros errores HTTP conservan su diagnóstico.

La renovación es manual. Un fallo de autenticación no registra la migración como
aplicada en `scripts/applied-migrations.json`. Renovar el token o ejecutar
`select 1` tampoco aplica las migraciones pendientes: su ejecución debe realizarse
por separado cuando esté autorizada. No ejecutes migraciones para probar el token.

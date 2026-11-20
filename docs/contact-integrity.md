# Reparación local de contactos

No se ha ejecutado contra Supabase ni producción. No usar `apply-migration.mjs` para estas pruebas: ese comando apunta al proyecto remoto.

Requisitos: una copia local de PostgreSQL, `psql`, esquema actual (incluyendo `soft_delete.sql`, `company_hierarchy.sql` y las tablas de relaciones), y una conexión propietaria de las tablas para ver todos los registros sin filtros RLS.

1. Guardar un backup de la copia local.
2. Simular y revisar el mapa de IDs y las asociaciones que colisionan:
   ```sh
   DATABASE_URL=postgres://localhost/omni_local node scripts/dedupe-contacts.mjs > /tmp/dedupe-review.log 2>&1
   ```
3. Aplicar a esa copia local:
   ```sh
   DATABASE_URL=postgres://localhost/omni_local node scripts/dedupe-contacts.mjs --apply > /tmp/dedupe-applied.log 2>&1
   psql -X -v ON_ERROR_STOP=1 postgres://localhost/omni_local -f supabase/contact-integrity.sql
   ```

La reparación bloquea las tablas durante una única transacción. Agrupa contactos activos por `lower(btrim(email))`, omite emails vacíos/null y conserva el menor ID activo. Conserva las copias con `deleted_at`, reapunta las columnas `contact_id`, las referencias polimórficas `record_id` con discriminador `record_type`/`object_type` y las FK simples declaradas hacia contactos, incluso en otros esquemas. Una FK compuesta o una restricción desconocida incompatible aborta toda la transacción para permitir su revisión explícita. Referencias arbitrarias dentro de JSON no son FK y no se modifican.

Cuando varias asociaciones apuntan a la misma empresa, conserva la asociación canónica (o la de menor ID), combina `is_primary` mediante OR y conserva su etiqueta. Las filas anteriores, incluidas las etiquetas de asociaciones redundantes, quedan en el log de auditoría. Las asociaciones redundantes se eliminan para respetar su restricción única; los contactos duplicados solo reciben soft delete. Proteger los logs porque contienen datos de contactos.

El índice es más estricto que `lower(email)`: también recorta espacios. Los contactos en papelera no participan en la unicidad; restaurar uno que colisione produce un error de unicidad.

El bootstrap requiere la nueva función SQL. La función toma bloqueos, verifica las cinco tablas (incluida la papelera), valida los IDs/cantidades y siembra todo en una transacción. Una base parcialmente poblada se conserva sin rellenarla ni sobrescribirla. Los errores se propagan al manejo existente del arranque; no existe fallback a inserts de seed. La función tiene privilegios de su propietario para que RLS no confunda datos ocultos con una base vacía, y su ejecución está limitada a los roles de la aplicación existentes. Se preservan las fechas/defaults y se avanzan las secuencias de identidad.

La fórmula anterior producía 77 emails repetidos dentro de una sola generación de 420 contactos. Las apariciones posteriores ahora reciben `+seed<ID>`; la primera mantiene su dirección. Esto solo cambia datos demo generados, no los emails de contactos existentes.

## Verificación

Las pruebas usan dependencias temporales fuera del repositorio:

```sh
npm install --prefix /tmp/contact-integrity-test @electric-sql/pglite embedded-postgres
PGLITE_MODULE=/tmp/contact-integrity-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-contact-integrity.mjs
EPG_MODULE=/tmp/contact-integrity-test/node_modules/embedded-postgres/dist/index.js node scripts/test-bootstrap-concurrency.mjs
npm run build
```

La primera prueba comprueba rollback, emails normalizados, IDs canónicos, FK adicional, referencias numéricas/texto, discriminadores polimórficos, colisiones de asociaciones, repetición de reparación, índice, rollback de seed inválido y secuencias. La segunda levanta PostgreSQL desechable en el puerto 25439 y observa que una segunda sesión espera el bloqueo de la primera; tras el commit quedan exactamente 420 contactos.

Consulta de aceptación (solo activos, pues las copias permanecen en papelera):

```sql
SELECT lower(btrim(email)), count(*)
FROM public.contacts
WHERE deleted_at IS NULL AND btrim(email) <> ''
GROUP BY 1 HAVING count(*) > 1;
```

El script verifica en la misma transacción que ninguna relación inspeccionada apunte a los IDs que suprime y muestra `duplicate_groups = 0` antes del commit/rollback.

# Reparación local de contactos

## Verificación local del 22 de noviembre

Revalidado en esta intervención: prueba PGlite con 77 pares sintéticos, cero grupos duplicados activos, 77 copias en papelera y cero referencias restantes a esas copias en deals, tickets, activities y contact_companies. La prueba PostgreSQL con dos sesiones independientes observó espera por bloqueo y una sola siembra de 420 contactos. El reparador ahora adquiere el mismo advisory lock que el bootstrap antes de bloquear tablas, evitando órdenes de adquisición incompatibles entre ambos procesos.

El ítem original y su reapertura quedan pendientes en la cola local, sin completedAt: la aceptación de datos reales sigue pendiente. No se ejecutó mgmt-sql.mjs, no se aplicaron migraciones remotas y no se desplegó código. Estos resultados sintéticos no verifican los 423 contactos reportados en producción.

No se ha ejecutado contra Supabase ni producción. No usar `apply-migration.mjs` para estas pruebas: ese comando apunta al proyecto remoto.

Requisitos: una copia local de PostgreSQL, `psql`, esquema actual (incluyendo `soft_delete.sql`, `company_hierarchy.sql` y las tablas de relaciones), y una conexión propietaria de las tablas para ver todos los registros sin filtros RLS.

1. Guardar un backup de la copia local.
2. Simular y revisar el mapa de IDs y las asociaciones que colisionan:
   ```sh
   DATABASE_URL=postgres://localhost/omni_local node scripts/dedupe-contacts.mjs > /tmp/dedupe-review.log 2>&1
   ```
3. Instalar la protección del bootstrap y aplicar a esa copia local:
   ```sh
   psql -X -v ON_ERROR_STOP=1 postgres://localhost/omni_local -f supabase/bootstrap-demo.sql
   DATABASE_URL=postgres://localhost/omni_local node scripts/dedupe-contacts.mjs --apply > /tmp/dedupe-applied.log 2>&1
   psql -X -v ON_ERROR_STOP=1 postgres://localhost/omni_local -f supabase/contact-integrity.sql
   ```

La reparación bloquea las tablas durante una única transacción. Agrupa contactos activos por `lower(btrim(email))`, omite emails vacíos/null y conserva siempre el contacto activo de menor ID, aunque una copia tenga más campos persistidos. Conserva las copias con `deleted_at`, reapunta las columnas `contact_id`, las referencias polimórficas `record_id` con discriminador `record_type`/`object_type` y las FK simples declaradas hacia contactos, incluso en otros esquemas. Una FK compuesta o una restricción desconocida incompatible aborta toda la transacción para permitir su revisión explícita. Referencias arbitrarias dentro de JSON no son FK y no se modifican.

Cuando varias asociaciones apuntan a la misma empresa, conserva la asociación canónica (o la de menor ID), combina `is_primary` mediante OR y conserva su etiqueta. Las filas anteriores, incluidas las etiquetas de asociaciones redundantes, quedan en el log de auditoría. Las asociaciones redundantes se eliminan para respetar su restricción única; los contactos duplicados solo reciben soft delete. Proteger los logs porque contienen datos de contactos.

El índice es más estricto que `lower(email)`: también recorta espacios. Los contactos en papelera no participan en la unicidad; restaurar uno que colisione produce un error de unicidad.

El bootstrap requiere `supabase/bootstrap-demo.sql`, ahora separado del índice para que los duplicados existentes no bloqueen la protección frente a nuevas carreras. Adquiere un advisory lock transaccional compartido por todas las llamadas antes de comprobar las tablas. La función toma bloqueos, verifica las cinco tablas (incluida la papelera), valida los IDs/cantidades y siembra todo en una transacción. Una base parcialmente poblada se conserva sin rellenarla ni sobrescribirla. Los errores se propagan al manejo existente del arranque; no existe fallback a inserts de seed. La función tiene privilegios de su propietario para que RLS no confunda datos ocultos con una base vacía, y su ejecución está limitada a los roles de la aplicación existentes. Se preservan las fechas/defaults y se avanzan las secuencias de identidad.

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

## Estado de esta corrección

No se ejecutó la reparación contra la base real: la instrucción vigente limita el trabajo a código local y prohíbe cambios en producción. `dedupe-contacts.mjs` rechaza conexiones remotas. `mgmt-sql.mjs` usa un token de gestión de Supabase (no una cuenta de servicio SQL); no fue invocado. Los 423 contactos y 77 grupos reportados por el usuario no se presentan como una medición nueva ni como resueltos.

Orden de aplicación futura: `bootstrap-demo.sql`, reparación transaccional y `contact-integrity.sql`. El registro local mantiene ambas migraciones como pendientes, nunca como aplicadas. El índice aborta si quedan duplicados; el reparador también aborta si la verificación final no da cero grupos. El estado histórico `done` no acredita una reparación de la base viva.

La consulta original sin `deleted_at IS NULL` seguirá mostrando correos repetidos después de un soft delete correcto. La aceptación debe usar la consulta de activos de arriba; las copias se conservan para auditoría.


## Reapertura del 21 de noviembre: 77 pares

Estado: pendiente de ejecución y aceptación en los datos reales. Fusiones reales realizadas en esta intervención: **0**. Pares ambiguos reales: **no evaluados**, porque no se consultó ni modificó la base remota y no se proporcionó una copia local. Los 77 pares reportados equivalen a 154 filas implicadas y 77 copias sobrantes, no 154 copias sobrantes.

El inventario transaccional imprime ambos IDs, fechas de creación, datos completos anteriores, puntuación de campos y conteos de negocios, tickets, tareas, actividades e inscripciones (si existe `sequence_enrollments`). La selección conserva siempre el menor ID activo; la puntuación de campos es solo informativa; las asociaciones se trasladan independientemente de esa selección. Completa campos escalares vacíos y propiedades escalares de `extra`, preservando los valores del principal. Nombres o apellidos contradictorios se imprimen como ambiguos y abortan toda la reparación para revisión, sin fusiones parciales. Restricciones de inscripciones incompatibles también abortan y requieren revisión; no se borran inscripciones para forzar su traslado.

El resultado muestra grupos y copias fusionados y exige cero huérfanos en negocios/tickets, además de cero grupos duplicados vivos y cero referencias inspeccionadas a las copias. Las imágenes anteriores permiten revisar conflictos; la restauración del contacto desde papelera no revierte automáticamente sus asociaciones. JSON de asociaciones requiere revisión explícita, como ya se indica arriba.

Validación local con PGlite: rollback, repetibilidad, principal de menor ID aunque la copia tenga más datos, completado de teléfono y propiedad personalizada, contactos conservados físicamente, relaciones trasladadas y rechazo de huérfanos preexistentes. Esto valida el código, no acredita que los 77 pares reales estén resueltos.

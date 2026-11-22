# Integridad de contactos

## Reapertura actual: selección por menor ID

El reparador conserva siempre el contacto activo de menor ID. `filled_fields` es solo un dato diagnóstico. El inventario incluye la regla aplicada, IDs, fechas, campos y conteos de relaciones. La puntuación cuenta campos persistidos no vacíos y propiedades de `extra`, excluyendo metadatos técnicos; los conteos de relaciones se muestran aparte y no sustituyen la riqueza del contacto. Los valores contradictorios permanecen en las imágenes anteriores y en la copia en papelera.

**0 pares reales fusionados; pares ambiguos reales no evaluados.** No se dispone de un inventario real en esta intervención de solo código local. El ítem permanece pendiente de aceptación real. 77 grupos de dos filas representan 154 filas implicadas y 77 copias sobrantes.

La selección no depende de la cantidad de campos ni de asociaciones.

## Revalidación local del 22 de noviembre

`test-contact-integrity.mjs` pasó: 77 pares sintéticos, las seis relaciones requeridas, cero grupos vivos duplicados, cero referencias a copias y conservación de los campos originales excepto `deleted_at`. Incluye selección de la canónica de menor ID aunque la copia tenga más datos, rollback, FK adicionales, índice único y restauración tras resolver el conflicto de email. Restaurar no revierte el traslado de asociaciones.

`test-bootstrap-concurrency.mjs` pasó con dos conexiones a PostgreSQL temporal: se observó espera por bloqueo y exactamente una siembra de 420 contactos. La prueba necesitó memoria compartida fuera del sandbox. Ambas pruebas emitieron un aviso de `localStorage` al importar el módulo en Node y finalizaron con código 0.

Los cuatro ítems relacionados y el resumen de Codex quedan `pending`, sin metadatos de finalización. No se consultó ni modificó producción. El bootstrap y el índice siguen pendientes de aplicación remota. Las pruebas locales no cumplen la aceptación sobre la base real.

# Reparación local de contactos

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

La reparación bloquea las tablas durante una única transacción. Agrupa contactos activos por `lower(btrim(email))`, omite emails vacíos/null y conserva el contacto activo de menor ID. Conserva las copias con `deleted_at`, reapunta las columnas `contact_id`, las referencias polimórficas `record_id` con discriminador `record_type`/`object_type` y las FK simples declaradas hacia contactos, incluso en otros esquemas. Una FK compuesta o una restricción desconocida incompatible aborta toda la transacción para permitir su revisión explícita. Referencias arbitrarias dentro de JSON no son FK y no se modifican.

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

El inventario transaccional imprime ambos IDs, fechas de creación, datos completos anteriores, puntuación de campos y conteos de negocios, tickets, tareas, actividades e inscripciones (si existe `sequence_enrollments`). La selección usa siempre el menor ID activo; las asociaciones se trasladan independientemente de esa selección. Completa campos escalares vacíos y propiedades escalares de `extra`, preservando los valores del principal. Nombres o apellidos contradictorios se imprimen para revisión; se conservan los valores no vacíos de la canónica y los originales de la copia en papelera. Restricciones de inscripciones incompatibles también abortan y requieren revisión; no se borran inscripciones para forzar su traslado.

El resultado muestra grupos y copias fusionados y exige cero huérfanos en negocios/tickets, además de cero grupos duplicados vivos y cero referencias inspeccionadas a las copias. Las imágenes anteriores permiten revisar conflictos; la restauración del contacto desde papelera no revierte automáticamente sus asociaciones. JSON de asociaciones requiere revisión explícita, como ya se indica arriba.

Validación local con PGlite: rollback, repetibilidad, principal de menor ID aunque la copia tenga más datos, completado de teléfono y propiedad personalizada, contactos conservados físicamente, relaciones trasladadas y rechazo de huérfanos preexistentes. Esto valida el código, no acredita que los 77 pares reales estén resueltos.

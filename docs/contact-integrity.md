# Integridad de contactos

## Reapertura actual: selección por datos persistidos

El reparador conserva ahora el contacto con mayor `filled_fields`; en empate conserva el menor ID. El inventario incluye la regla aplicada, IDs, fechas, campos y conteos de relaciones. La puntuación cuenta campos persistidos no vacíos y propiedades de `extra`, excluyendo metadatos técnicos; los conteos de relaciones se muestran aparte y no sustituyen la riqueza del contacto. Los valores contradictorios permanecen en las imágenes anteriores y en la copia en papelera.

**0 pares reales fusionados; pares ambiguos reales no evaluados.** No se dispone de un inventario real en esta intervención de solo código local. El ítem permanece pendiente de aceptación real. 77 grupos de dos filas representan 154 filas implicadas y 77 copias sobrantes.

Las secciones históricas que mencionan selección obligatoria por menor ID quedan sustituidas por la regla anterior.

## Resultado de la revisión anterior (22 de noviembre)

La reparación real sigue **pendiente**, no completada. No se invocó `mgmt-sql.mjs`: esta solicitud limita los cambios a código local. Además, `dedupe-contacts.mjs` rechaza deliberadamente hosts remotos. No se desplegó ni se aplicaron migraciones remotas. Los 423 contactos y 77 grupos son evidencia aportada por el usuario, no una medición de esta revisión.

Se volvió a ejecutar `test-contact-integrity.mjs` satisfactoriamente (77 pares sintéticos, menor ID, soft delete y relaciones trasladadas). Se amplió y ejecutó `test-bootstrap-concurrency.mjs` con dos conexiones PostgreSQL: espera por bloqueo, una llamada devuelve `true`, la otra `false`, exactamente una siembra en las cinco tablas y cero grupos de emails activos duplicados. PostgreSQL temporal necesitó ejecución fuera del sandbox por su uso de memoria compartida. Ambas pruebas emitieron un aviso de `localStorage` desde la purga del módulo de datos al importarlo en Node, pero terminaron con código 0.

Se corrigieron los estados `done` reaparecidos en la cola y el resumen de Codex: los cuatro ítems de duplicación quedan `pending`, sin metadatos de finalización. `bootstrap-demo.sql` y `contact-integrity.sql` continúan pendientes de aplicación. Las pruebas locales no autorizan cerrar la aceptación real.

La política vigente conserva siempre el **menor ID activo** por `lower(btrim(email))` no vacío, conforme a la solicitud. La puntuación de campos solo informa el inventario. Se completan campos vacíos de la canónica y se conservan sus valores ante conflictos de nombres; las copias mantienen sus datos originales y reciben `deleted_at`.

El bootstrap utiliza un RPC transaccional con bloqueo advisory y de tablas; no recurre a inserts desde el cliente si falta la migración. El índice parcial aplica la misma normalización que la deduplicación, incluidos espacios exteriores.

Trabajo exclusivamente local; no se ha reparado ni consultado producción. Las pruebas sintéticas no acreditan la reparación de las 423 filas reportadas.

## Registro histórico

## Revalidación de esta revisión (22 de noviembre)

Se ejecutaron nuevamente `test-contact-integrity.mjs` y `test-bootstrap-concurrency.mjs`: ambas pasaron. La segunda utilizó dos conexiones a PostgreSQL temporal y comprobó espera por bloqueo y exactamente 420 contactos. El estado local del ítem original había vuelto a `done` pese a sus notas de aceptación pendiente; se reabrieron los cuatro ítems relacionados y se corrigió también `build-status-codex.json`. La canónica implementada y requerida en esta solicitud es el menor ID activo. No se consultó ni modificó la base remota: el límite explícito de solo código local impide acreditar reparación real.

# Tercera reapertura: aceptación real pendiente

Verificación de esta intervención: `test-contact-integrity.mjs` pasó en PGlite y `test-bootstrap-concurrency.mjs` pasó con dos sesiones de PostgreSQL desechable (420 contactos, una sola siembra).

Los cuatro ítems relacionados están pendientes, sin completedAt ni completedBy. Esta intervención modifica únicamente código local. No acredita reparación ni aplicación del índice en producción.

La regresión local cubre 77 pares y las seis relaciones requeridas: deals, tickets, contact_companies, activities, tasks y sequence_enrollments. Comprueba cero duplicados vivos, cero referencias a las copias y conservación íntegra de sus campos excepto deleted_at. También se rechazan referencias preexistentes a contactos en papelera. La canónica es la fila activa de menor ID; se completan sus campos vacíos, incluidos nombre y apellido.

Restaurar una copia con el mismo email de una canónica viva contradice el índice único. Se conserva el payload original completo, pero antes de restaurar debe resolverse ese conflicto (por ejemplo, cambiar o vaciar explícitamente su email). La prueba verifica tanto el rechazo del email repetido como la restauración tras resolverlo, sin cambiar los datos reales. Restaurar no deshace el traslado de asociaciones.

# Reparación local de contactos

## Verificación local del 22 de noviembre

Revisión adicional de relaciones: el reparador incluye tablas particionadas y trata las FK declaradas hacia contactos como referencias incondicionales, incluso cuando la columna se llama `record_id` y existe un discriminador con otro valor. La prueba local cubre ambos casos para evitar que una copia suprimida conserve referencias por un filtro polimórfico incorrecto.

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

La reparación bloquea las tablas durante una única transacción. Agrupa contactos activos por `lower(btrim(email))`, omite emails vacíos/null y conserva el contacto activo con más campos persistidos no vacíos (menor ID en empate). Conserva las copias con `deleted_at`, reapunta las columnas `contact_id`, las referencias polimórficas `record_id` con discriminador `record_type`/`object_type` y las FK simples declaradas hacia contactos, incluso en otros esquemas. Una FK compuesta o una restricción desconocida incompatible aborta toda la transacción para permitir su revisión explícita. Referencias arbitrarias dentro de JSON no son FK y no se modifican.

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

El inventario transaccional imprime ambos IDs, fechas de creación, datos completos anteriores, puntuación de campos y conteos de negocios, tickets, tareas, actividades e inscripciones (si existe `sequence_enrollments`). La selección usa la mayor puntuación de campos persistidos y el menor ID en empate; las asociaciones se trasladan independientemente de esa selección. Completa campos escalares vacíos y propiedades escalares de `extra`, preservando los valores del principal. Nombres o apellidos contradictorios se imprimen para revisión; se conservan los valores no vacíos de la canónica y los originales de la copia en papelera. Restricciones de inscripciones incompatibles también abortan y requieren revisión; no se borran inscripciones para forzar su traslado.

El resultado muestra grupos y copias fusionados y exige cero huérfanos en negocios/tickets, además de cero grupos duplicados vivos y cero referencias inspeccionadas a las copias. Las imágenes anteriores permiten revisar conflictos; la restauración del contacto desde papelera no revierte automáticamente sus asociaciones. JSON de asociaciones requiere revisión explícita, como ya se indica arriba.

Validación local con PGlite: rollback, repetibilidad, principal con más datos aunque tenga mayor ID, completado de teléfono y propiedad personalizada, contactos conservados físicamente, relaciones trasladadas y rechazo de huérfanos preexistentes. Esto valida el código, no acredita que los 77 pares reales estén resueltos.

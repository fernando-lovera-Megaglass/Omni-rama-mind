# Séptima reapertura: pendiente de aplicación real

Fecha: 24-nov-2026, America/Mexico_City.

**No cumple todavía los criterios de cierre.** Esta intervención no ejecutó la fusión remota ni registró una migración como aplicada. Se solicitó aclaración porque la misma orden exige modificar la base real y termina con «solo código local». La evidencia de la sexta documenta una solicitud sin respuesta, no una autorización confirmada. La pregunta sigue pendiente.

## Revisión y medición

Se revisaron `scripts/dedupe-contacts.mjs`, `scripts/sql/dedupe-contacts.sql`, las pruebas y la evidencia de la sexta. El SQL existente incluye una transacción con bloqueo, selección del contacto principal, traslado de referencias relacionales y JSON, conservación de copias en papelera y sustitución del índice por UNIQUE. No se necesitó modificar código ni archivos visuales en esta intervención.

Se consultó la base real mediante `scripts/mgmt-sql.mjs` en una transacción `BEGIN READ ONLY`. `antes.json` contiene la medición con hora del servidor: 423 contactos activos, 0 en papelera, 385 con email no vacío, 77 grupos duplicados con email no vacío. Incluyendo el email vacío aparecen 78 grupos; el reparador convierte emails vacíos a NULL antes de crear el índice único. `pg_indexes` confirma que `contacts_email_idx` continúa siendo NO único.

## Pruebas locales

Todas terminaron con código de salida 0:

- `npm run build`: `build.log`.
- `node scripts/smoke-dedupe.mjs`: `dedupe.log`.
- `node scripts/test-contact-integrity.mjs`: `integrity.log`. Incluye rollback, traslado de referencias, colisiones de puente, JSON e índice único sobre PostgreSQL local PGlite.
- `SMOKE_LIVE=0 node scripts/smoke-record-merge.mjs`: `merge.log`.

El lanzador administrado inicialmente falló por EPERM al registrar procesos. El build se volvió a ejecutar con escalación aprobada; las pruebas se ejecutaron con el Node incluido en Kimi. Integridad muestra el aviso de `localStorage` al importar data.js y termina PASS. Estos resultados no acreditan una fusión ni integridad posterior en la base real.

## Trabajo pendiente

Tras aclarar el alcance remoto: ejecutar el ensayo transaccional con rollback, revisar su auditoría, aplicar la fusión y comprobar en vivo 0 grupos duplicados, índice UNIQUE, 0 referencias colgadas y copias en papelera. Solo después registrar la aplicación confirmada en `scripts/applied-migrations.json`. No se modificó ese registro para afirmar una aplicación inexistente.

Existe Playwright: el carril UI debe correr las pruebas de contactos, asociaciones y papelera después de aplicar la reparación, porque cambia los registros mostrados. No hace falta solicitar un cambio visual y no se añadió ningún gap UI.

No se desplegó nada ni se modificó la cola o los archivos de estado. Los cambios de cola/estado y reports presentes al inicio son ajenos a esta intervención. El orquestador debe mantener pendiente la tarea.

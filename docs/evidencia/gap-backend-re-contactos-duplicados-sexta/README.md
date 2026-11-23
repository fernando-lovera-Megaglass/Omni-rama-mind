# Sexta reapertura — pendiente de fusión real

Fecha: 23-nov-2026 (America/Mexico_City). No completada. No se modificó la cola ni se desplegó código.

## Medición real antes

Consulta de solo lectura al proyecto `xysgvxnieigpaxtmxiui` mediante `scripts/mgmt-sql.mjs`. Resultado guardado en `antes.json`: 423 filas totales, 423 activas, 0 en papelera, 77 grupos duplicados. Son 154 filas involucradas y 77 copias sobrantes.

```sql
BEGIN READ ONLY;
SELECT now() AS observed_at,
 count(*) AS total,
 count(*) FILTER (WHERE deleted_at IS NULL) AS vivos,
 count(*) FILTER (WHERE deleted_at IS NOT NULL) AS papelera,
 (SELECT count(*) FROM (
   SELECT lower(email) FROM contacts
   WHERE email IS NOT NULL AND email<>'' AND deleted_at IS NULL
   GROUP BY lower(email) HAVING count(*)>1
 ) d) AS grupos_duplicados
FROM contacts;
COMMIT;
```

## Cambio local

El reparador existente ya selecciona por cantidad de campos persistidos y traslada referencias dentro de una transacción. Se amplió la comprobación de huérfanos a todas las relaciones descubiertas (incluidas columnas sin FK y referencias polimórficas), no solo deals, tickets, tasks y contact_companies. Se añadieron regresiones para calls, activities y workflow_enrollments: cualquier huérfano aborta la transacción.

## Pruebas ejecutadas

- `node scripts/test-contact-integrity.mjs`: PASS, salida 0 (`integrity.log`). Incluye 77 pares sintéticos, conservación de copias, traslado de seis tipos de relación, rollback, selección de registro más completo, índice y restauración con conflicto resuelto.
- `node scripts/smoke-dedupe.mjs`: PASS, salida 0 (`dedupe.log`).
- `SMOKE_LIVE=0 node scripts/smoke-record-merge.mjs`: PASS, salida 0 (`merge.log`).
- `npm run build`: PASS, salida 0 (`build.log`). Se ejecutó fuera del sandbox porque el lanzador administrado necesita registrar el proceso. Las pruebas usaron el Node incluido en Kimi directamente por el mismo problema del lanzador.

Existe Playwright. El carril UI debe ejecutar las comprobaciones de pantallas de contactos, asociaciones y papelera cuando se autorice y aplique la reparación de datos. No se modificó UI ni se requiere un cambio visual.

## Después y pendientes

No existe medición posterior a una fusión: fusiones remotas ejecutadas en esta intervención = 0. La instrucción exige ejecutar contra la base viva y termina con “solo código local”; se solicitó aclaración expresa antes de modificar datos remotos. No se interpreta la ausencia de respuesta como autorización.

Pendiente: confirmar alcance, revisar referencias JSON (el reparador SQL actual no las traslada), preservar auditoría de asociaciones, ejecutar la fusión transaccional autorizada y verificar nuevamente 0 grupos, 0 huérfanos, 0 referencias a copias suprimidas y copias conservadas en papelera. Las pruebas locales no acreditan estos resultados en la base real. No se aplicó el índice ni ninguna migración remota.

El orquestador debe mantener la tarea pendiente; esta evidencia no acredita cierre.

## Reapertura 23-nov-2026: reparación JSON e índice atómico

Estado: **pendiente de ejecución remota; no cerrar**. Se solicitó aclaración del alcance porque la orden pide modificar la base real y termina con «solo código local». No se recibió respuesta durante esta intervención. Fusiones remotas ejecutadas = **0**; no hubo despliegue ni escritura remota.

Cambios locales en `scripts/sql/dedupe-contacts.sql`:

- El contacto conservado hereda arrays `extra.assoc_*` y mapas `assoc_labels_*` de las copias; se mantienen los valores del principal cuando una etiqueta entra en conflicto.
- Se descubren tablas públicas con `id` y `extra` JSONB. Se remapean `assoc_contacts` y sus etiquetas; se eliminan IDs repetidos considerando equivalentes números y cadenas. Se validan los destinos de todos los arrays `assoc_*`, incluidos `assoc_deals`; destinos desconocidos, formatos incompatibles o referencias a registros inexistentes/en papelera abortan la transacción.
- Las copias suprimidas conservan su JSON original como histórico en papelera. Las comprobaciones operativas excluyen esas copias; no deben confundirse sus valores históricos con asociaciones activas.
- La auditoría final incorpora cambios JSON e información del índice, además de las imágenes previas de contactos y el mapa de fusión existentes.
- En la misma transacción y bajo los bloqueos existentes se sustituye `contacts_email_idx` por `CREATE UNIQUE INDEX contacts_email_idx ON public.contacts (lower(email)) WHERE deleted_at IS NULL`. Los emails vacíos activos se convierten en NULL y un trigger hace lo mismo en nuevas escrituras, permitiendo varios contactos sin correo con el índice exacto solicitado.

Verificación local final (todos salida 0):

- `node scripts/test-contact-integrity.mjs`: PASS (`reapertura-integrity.log`). Añade casos de asociaciones JSON, etiquetas, herencia de negocios, IDs numéricos/cadena, huérfano JSON con rollback, definición UNIQUE en pg_indexes y rechazo de duplicados por el índice. Mantiene las regresiones de 77 pares y conservación en papelera. PGlite serializa llamadas; no acredita concurrencia entre sesiones remotas.
- `node scripts/smoke-dedupe.mjs`: PASS (`reapertura-dedupe.log`).
- `SMOKE_LIVE=0 node scripts/smoke-record-merge.mjs`: PASS (`reapertura-merge.log`).
- `npm run build`: PASS (`reapertura-build.log`).

El lanzador administrado de Node requirió ejecución fuera del sandbox para registrar los procesos; esto no implicó despliegue. La prueba de integridad muestra el aviso preexistente de `localStorage` no definido al importar data.js, pero finaliza PASS.

Nueva medición remota **solo lectura**, guardada en `reapertura-antes.json`: 423 contactos activos, 0 en papelera, 77 grupos duplicados; `contacts_email_idx` sigue siendo **no único**. Por tanto los criterios de aceptación en vivo siguen sin cumplirse. Tras aclarar la autorización, queda ejecutar dry-run transaccional, revisar su auditoría privada, aplicar la reparación y medir nuevamente grupos, índice y referencias. Un formato JSON o un huérfano preexistente puede impedir la aplicación y requerir investigación; no se elimina información automáticamente para superar esas comprobaciones.

Existe Playwright: el carril UI debe correr las pruebas de contactos, asociaciones y papelera después de la reparación. No se editaron archivos visuales, no se requiere cambio visual, no se añadieron gaps UI ni se modificó la cola por esta intervención. Los cambios previos de cola/status ya estaban presentes al iniciar.

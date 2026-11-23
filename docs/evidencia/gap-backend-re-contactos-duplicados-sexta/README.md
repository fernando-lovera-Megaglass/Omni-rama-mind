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

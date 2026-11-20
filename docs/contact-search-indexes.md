# Índices de búsqueda de contactos

Migración local: `supabase/contact-search-indexes.sql`. Requiere el esquema existente y `soft_delete.sql`. No ejecutar de nuevo `schema.sql` sobre una base existente: es destructivo.

Incluye `contacts_email_idx` sobre `lower(email)` para contactos activos y dos índices sobre `deals.contact_id` y `deals.company_id`, ausentes en las migraciones locales revisadas. No impone unicidad ni elimina duplicados. El índice de `contact-integrity.sql` usa otra expresión (`lower(btrim(email))`) y otro predicado; no sustituye este acceso.

Validación sin red ni credenciales:

```sh
node scripts/test-contact-search-indexes.mjs
```

La prueba ejecuta la migración dos veces en PostgreSQL local en memoria (PGlite), carga 20 000 contactos sintéticos y comprueba con `EXPLAIN ANALYZE` el uso de los tres índices sin desactivar los scans secuenciales. Comprueba también mayúsculas y exclusión de contactos eliminados. Con solo 423 filas, PostgreSQL puede preferir legítimamente un scan secuencial por coste.

Consulta compatible:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, email FROM public.contacts
WHERE lower(email) = lower('persona@example.invalid')
  AND deleted_at IS NULL;
```

Limitación: las consultas actuales de Gmail y alta de contactos usan `ILIKE`; las búsquedas parciales de listas también. Este índice no acelera esas consultas sin adaptar su acceso a igualdad sobre `lower(email)` (por ejemplo mediante RPC). Tampoco evita un scan de un dedupe que lea toda la tabla. No se ha modificado ese comportamiento en esta migración.

No se ha aplicado a ningún proyecto remoto. El registro queda `pendiente`; solo después de una aplicación autorizada y exitosa debe pasar a `aplicada` con su fecha real mediante el mecanismo existente `scripts/apply-migration.mjs`.

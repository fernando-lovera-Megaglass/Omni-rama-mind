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

## Estado en producción

Aplicada al proyecto el 2026-11-22 (01:34 UTC) con `node scripts/apply-migration.mjs supabase/contact-search-indexes.sql`, a petición expresa, y registrada en `scripts/applied-migrations.json` con fecha y verificación. Antes de aplicarla, `pg_indexes` solo tenía `contacts_pkey`, `contacts_user_id_idx` y `contacts_deleted_at_idx` (423 contactos, 308 correos distintos vivos). Comprobación de solo lectura después:

```sh
node scripts/mgmt-sql.mjs "select indexname, indexdef from pg_indexes where schemaname='public' and tablename in ('contacts','deals') and indexname in ('contacts_email_idx','deals_contact_id_idx','deals_company_id_idx')"
node scripts/mgmt-sql.mjs "explain (analyze, buffers) select id, email from public.contacts where lower(email) = lower('persona@example.invalid') and deleted_at is null"
```

Resultado: los tres índices existen y el plan es `Index Scan using contacts_email_idx … Index Cond: (lower(email) = '…')` con 2 páginas leídas. La migración es idempotente (`create index if not exists`) y puede repetirse sin efecto. La limitación de las consultas `ILIKE` del apartado anterior sigue vigente.

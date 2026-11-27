-- Residuo de importaciones (decisión del usuario, 27-nov-2026, hallazgo 3 de la auditoría backend 26-nov-0512):
-- empresas en la papelera con sello hs_import_ids de corridas de prueba cuyo historial (import_jobs) ya no existe.
-- Solo se retira el sello huérfano; no se borra ninguna fila (prohibido borrar datos). Idempotente.
begin;

-- Respaldo previo: copia íntegra de las filas afectadas (no se borra nunca; sirve para revertir el UPDATE).
create table if not exists public.companies_import_stamp_backup_20261127 (like public.companies including all);
insert into public.companies_import_stamp_backup_20261127
select c.* from public.companies c
where c.deleted_at is not null
  and coalesce(c.extra->>'hs_import_ids', '') <> ''
  and not exists (
    select 1 from public.import_jobs j
    where j.id::text = any(string_to_array(c.extra->>'hs_import_ids', ';'))
  )
  and not exists (select 1 from public.companies_import_stamp_backup_20261127 b where b.id = c.id);

-- Retira el sello huérfano (deja intacto el resto de extra y la fila en la papelera).
update public.companies c
set extra = c.extra - 'hs_import_ids'
where c.deleted_at is not null
  and coalesce(c.extra->>'hs_import_ids', '') <> ''
  and not exists (
    select 1 from public.import_jobs j
    where j.id::text = any(string_to_array(c.extra->>'hs_import_ids', ';'))
  );

commit;

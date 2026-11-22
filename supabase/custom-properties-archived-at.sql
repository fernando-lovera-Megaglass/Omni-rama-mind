-- Omni CRM · Fecha de archivado de las propiedades personalizadas (archived_at)
-- Aplicar con: node scripts/apply-migration.mjs supabase/custom-properties-archived-at.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Idempotente. Estado de aplicación: scripts/applied-migrations.json.
--
-- Configuración › Propiedades › «Propiedades archivadas» promete «Se eliminan definitivamente a los 90 días».
-- La purga de la app (purgeExpiredTrash en src/data.js: al iniciar, una vez al día) borra las filas archivadas
-- cuyo archived_at tenga más de 90 días. La app escribe archived_at al archivar (y lo limpia al restaurar);
-- mientras esta columna no exista, la purga de propiedades se omite (la de registros y actividades no depende
-- de ella) y las escrituras siguen funcionando sin la columna.

alter table public.custom_properties add column if not exists archived_at timestamptz;
-- Las archivadas antes de existir la columna cuentan desde ahora, no desde una fecha desconocida.
update public.custom_properties set archived_at = now() where archived and archived_at is null;
create index if not exists custom_properties_archived_at_idx on public.custom_properties (archived_at) where archived;

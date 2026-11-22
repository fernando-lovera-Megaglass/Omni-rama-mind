-- Omni CRM · Archivos adjuntos de las fichas (tarjeta «Archivos adjuntos» de contactos, empresas, negocios y tickets)
-- Aplicar con: node scripts/apply-migration.mjs supabase/attachments.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Idempotente. Estado de aplicación: scripts/applied-migrations.json.
--
-- Antes, «+ Subir» guardaba solo el nombre en localStorage y descartaba el archivo. Ahora el binario va al bucket
-- privado `attachments` (ruta <objeto>/<id del registro>/<uuid>-<nombre>) y su fila a public.attachments; la app abre
-- el archivo con una URL firmada y «Eliminar» borra el objeto y la fila (src/attachments.js). Acceso: miembros activos
-- del equipo (public.is_team_member(), supabase/rls_team.sql), igual que el resto de tablas de datos.
-- Se ejecuta como una sola transacción para evitar una aplicación parcial.
begin;

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check (object_type in ('contacts', 'companies', 'deals', 'tickets')),
  record_id bigint not null,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  content_type text not null default '',
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists attachments_record_idx on public.attachments (object_type, record_id);

alter table public.attachments enable row level security;
drop policy if exists "team access" on public.attachments;
create policy "team access" on public.attachments for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

-- Bucket privado: nada es público; la app pide una URL firmada para abrir o descargar.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists attachments_team_select on storage.objects;
create policy attachments_team_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_team_member());

drop policy if exists attachments_team_insert on storage.objects;
create policy attachments_team_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_team_member());

drop policy if exists attachments_team_delete on storage.objects;
create policy attachments_team_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.is_team_member());

commit;

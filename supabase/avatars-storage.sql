-- Omni CRM · Fotos de perfil (Configuración › General › Perfil › Imagen de perfil)
-- Aplicar con: node scripts/apply-migration.mjs supabase/avatars-storage.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Requiere supabase/auth.sql (tabla profiles).
--
-- · Bucket público `avatars`: cada usuario escribe solo en su carpeta (<user id>/avatar.jpg); cualquiera
--   puede leer la URL pública (la foto se muestra en toda la app: menús de propietario, equipos, barra superior).
-- · profiles.avatar_url guarda la URL pública de la foto del usuario; los usuarios autenticados leen los
--   perfiles del equipo para mostrar las fotos de los demás (la escritura sigue siendo solo del dueño).
-- Idempotente. Se ejecuta como una sola transacción.
begin;

alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Teammates' photos: every signed-in user reads the profiles (id, email, name, avatar_url).
drop policy if exists "authenticated reads profiles" on public.profiles;
create policy "authenticated reads profiles" on public.profiles for select to authenticated using (true);

commit;

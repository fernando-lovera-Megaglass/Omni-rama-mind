-- Omni CRM · migración: autenticación (Supabase Auth) y políticas por usuario
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo una sola vez.
-- Proyecto: https://xysgvxnieigpaxtmxiui.supabase.co
--
-- ============ QUÉ HACE (PASO 1, SEGURO: NO ROMPE EL ACCESO ACTUAL) ============
--  1. Deja intactas las políticas "anon full access" de todas las tablas: la app sigue funcionando con
--     la clave anónima exactamente como hasta ahora.
--  2. Añade políticas "authenticated full access": cuando un usuario inicia sesión, sus peticiones ya
--     no van como "anon" sino como "authenticated"; sin estas políticas vería un CRM vacío
--     (la app lo detecta y muestra un aviso pidiendo ejecutar este archivo).
--  3. Añade la columna user_id (uuid, por defecto auth.uid()) a cada tabla: las filas creadas por un
--     usuario con sesión quedan marcadas con su id; las filas que ya existen quedan en NULL.
--  4. Crea la tabla profiles (id = auth.users.id, email, name) y un disparador que la rellena al
--     registrarse, para mostrar el nombre del usuario en la app más adelante.
--
-- ============ ANTES DE EJECUTAR (panel de Supabase) ============
--  · Authentication › Providers › Email: "Enable Email provider" activado. Si "Confirm email" está
--    activo, cada cuenta nueva recibe un correo de confirmación antes de poder entrar (para probar,
--    puedes desactivarlo).
--  · Authentication › URL Configuration: pon la URL de la app en "Site URL" y añádela a
--    "Redirect URLs" (por ejemplo https://tu-dominio.vercel.app/ y http://localhost:5173/), para que
--    funcionen los enlaces de confirmación y de restablecer contraseña.
--  · Después, abre la app: te llevará a la pantalla de inicio de sesión. Pulsa "crear una cuenta",
--    registra tu correo y contraseña, y entra.
--
-- ============ PASO 2 (OPCIONAL): AISLAR LOS DATOS POR USUARIO ============
--  Cuando todos tengan cuenta y quieras que cada usuario vea solo sus registros, ejecuta el bloque
--  comentado al final de este archivo. Antes asigna las filas existentes a su dueño (ver allí).

-- ---------- 1 y 2: políticas para usuarios autenticados (además de las anónimas) ----------
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'contacts', 'deals', 'tickets', 'tasks', 'activities', 'segments'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'La tabla % no existe todavía (ejecuta antes su migración); se omite.', t;
      continue;
    end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "authenticated full access" on %I', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- 3: dueño de cada fila (NULL en las filas anteriores a la autenticación) ----------
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'contacts', 'deals', 'tickets', 'tasks', 'activities', 'segments'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table %I add column if not exists user_id uuid default auth.uid()', t);
    execute format('create index if not exists %I on %I (user_id)', t || '_user_id_idx', t);
  end loop;
end $$;

-- ---------- 4: perfiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text default '',
  created timestamptz default now()
);
alter table profiles enable row level security;
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ PASO 2 (OPCIONAL): SOLO CUANDO QUIERAS AISLAR POR USUARIO ============
-- Descomenta y ejecuta este bloque cuando:
--   a) todos los usuarios tengan cuenta (Authentication › Users muestra sus UUID), y
--   b) hayas asignado las filas existentes a su dueño, por ejemplo:
--        update contacts set user_id = '00000000-0000-0000-0000-000000000000' where user_id is null;
--      (repite con companies, deals, tickets, tasks, activities y segments, con el UUID real).
-- Quita el acceso anónimo y deja que cada usuario vea y edite solo sus filas. Para volver atrás,
-- vuelve a ejecutar el PASO 1 de este archivo y la política "anon full access" de supabase/schema.sql.
/*
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'contacts', 'deals', 'tickets', 'tasks', 'activities', 'segments'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "anon full access" on %I', t);
    execute format('drop policy if exists "authenticated full access" on %I', t);
    execute format('drop policy if exists "owner only" on %I', t);
    execute format('create policy "owner only" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
*/

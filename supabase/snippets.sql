-- Omni CRM · Fragmentos (CRM › Fragmentos)
-- Aplicar con: node scripts/apply-migration.mjs supabase/snippets.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- snippets:        un fragmento por fila (name = nombre interno, body en HTML con tokens {{contacto.nombre|predeterminado}}…,
--                  shortcut = atajo que se escribe tras «#», folder, owner_id = quien lo creó).
-- snippet_folders: las carpetas creadas con «Nueva carpeta».
-- Misma seguridad que el resto de tablas. Idempotente: no duplica la semilla.

create table if not exists public.snippet_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.snippets (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  body text not null default '',
  shortcut text not null default '',
  folder text not null default '',
  owner_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists snippets_shortcut_idx on public.snippets (lower(shortcut));
create index if not exists snippets_updated_idx on public.snippets (updated_at desc);

alter table public.snippets enable row level security;
alter table public.snippet_folders enable row level security;
do $$
declare t text;
begin
  foreach t in array array['snippets', 'snippet_folders'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'anon full access') then
      execute format('create policy "anon full access" on public.%I for all to anon using (true) with check (true)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'authenticated full access') then
      execute format('create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- ===== Semilla [Prueba] =====
insert into public.snippet_folders (id, name) values
  ('d4000000-0000-4000-8000-000000000001', 'Ventas'),
  ('d4000000-0000-4000-8000-000000000002', 'Soporte')
on conflict (name) do nothing;

insert into public.snippets (id, name, body, shortcut, folder, owner_id, created_at, updated_at) values
  ('d3000000-0000-4000-8000-000000000001', '[Prueba] Horario de atención', '<p>Nuestro horario de atención es de lunes a viernes, de 9:00 a 18:00.</p>', 'horario', 'Soporte', 'Fernando L.', now() - interval '12 days', now() - interval '2 days'),
  ('d3000000-0000-4000-8000-000000000002', '[Prueba] Garantía', '<p>Hola {{contacto.nombre|cliente}}, todos nuestros vidrios templados tienen 10 años de garantía.</p>', 'garantia', 'Ventas', 'Sofía R.', now() - interval '9 days', now() - interval '4 days'),
  ('d3000000-0000-4000-8000-000000000003', '[Prueba] Plazo de instalación', '<p>El plazo habitual de instalación para {{contacto.empresa|tu empresa}} es de 3 a 4 semanas desde la aceptación del presupuesto.</p>', 'plazo', 'Ventas', 'Fernando L.', now() - interval '5 days', now() - interval '1 day')
on conflict (id) do nothing;

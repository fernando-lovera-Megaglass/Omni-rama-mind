-- Omni CRM · Propiedades personalizadas (Configuración › Propiedades) fuera de localStorage
-- Aplicar con: node scripts/apply-migration.mjs supabase/custom-properties.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- Una fila por propiedad personalizada y objeto. `type` usa los tipos de campo de la app
-- (text, number, date, datetime, enum, bool, url, email, phone, currency, percent); `options` guarda las
-- opciones de las listas desplegables. `in_form` marca las que se piden en el formulario de creación y
-- `archived` las archivadas. La app lee la tabla al arrancar, mueve una sola vez las propiedades que
-- vivían en localStorage y, desde entonces, cada alta/edición/borrado se escribe aquí.
-- Idempotente: no toca nada si la tabla y las filas ya existen.

create table if not exists public.custom_properties (
  id uuid primary key default gen_random_uuid(),
  objeto text not null check (objeto in ('contact', 'company', 'deal', 'ticket')),
  name text not null,
  label text not null,
  type text not null default 'text',
  options jsonb not null default '[]'::jsonb,
  group_name text not null default 'Propiedades personalizadas',
  description text not null default '',
  in_form boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (objeto, name)
);

-- Mismo acceso que el resto de tablas de datos (la clave anónima y los usuarios autenticados).
alter table public.custom_properties enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'custom_properties' and policyname = 'anon full access') then
    create policy "anon full access" on public.custom_properties for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'custom_properties' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on public.custom_properties for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Propiedades personalizadas reales de contactos (Megaglass): texto salvo latitud y longitud (número).
-- Las tres primeras se piden también en el formulario «Crear contacto».
insert into public.custom_properties (objeto, name, label, type, group_name, in_form) values
  ('contact', 'asesor_de_ventas', 'Asesor de ventas', 'text', 'Información de Megaglass', true),
  ('contact', 'nombre_del_proyecto', 'Nombre del proyecto', 'text', 'Información de Megaglass', true),
  ('contact', 'nombre_a_quien_factura', 'Nombre a quien factura', 'text', 'Información de Megaglass', false),
  ('contact', 'notas_sobre_el_contacto', 'Notas sobre el contacto', 'text', 'Información de Megaglass', false),
  ('contact', 'numero_de_telefono_2', 'Número de teléfono 2', 'text', 'Información de Megaglass', false),
  ('contact', 'numero_de_telefono_alternativo', 'Número de teléfono alternativo', 'text', 'Información de Megaglass', false),
  ('contact', 'cell_phone', 'Cell phone', 'text', 'Información de Megaglass', true),
  ('contact', 'latitud', 'Latitud', 'number', 'Información de Megaglass', false),
  ('contact', 'longitud', 'Longitud', 'number', 'Información de Megaglass', false),
  ('contact', 'mapsly', 'Mapsly', 'text', 'Información de Megaglass', false),
  ('contact', 'destino', 'Destino', 'text', 'Información de Megaglass', false),
  ('contact', 'origen', 'Origen', 'text', 'Información de Megaglass', false),
  ('contact', 'calificar_experiencia', 'Calificar experiencia', 'text', 'Información de Megaglass', false),
  ('contact', 'contacto_directo_de_inforte', 'Contacto directo de Inforte', 'text', 'Información de Megaglass', false),
  ('contact', 'independent_sales_rep', 'Independent sales rep', 'text', 'Información de Megaglass', false),
  ('contact', 'material_corresponde_a_cotizacion', 'Material corresponde a cotización', 'text', 'Información de Megaglass', false),
  ('contact', 'en_que_te_podemos_ayudar', '¿En qué te podemos ayudar?', 'text', 'Información de Megaglass', false),
  ('contact', 'adjunto', 'Adjunto', 'text', 'Información de Megaglass', false),
  ('contact', 'files', 'Files', 'text', 'Información de Megaglass', false)
on conflict (objeto, name) do nothing;

-- Omni CRM · Plantillas de mensaje (CRM › Plantillas de mensaje)
-- Aplicar con: node scripts/apply-migration.mjs supabase/message_templates.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- message_templates:        una plantilla por fila (name, subject, body en HTML con tokens {{contacto.nombre}}…,
--                           owner_id = nombre del propietario, folder, shared true = «Compartido con todos»).
-- message_template_folders: las carpetas creadas con «Nueva carpeta» (una carpeta puede estar vacía).
-- Misma seguridad que el resto de tablas. Idempotente: no duplica la semilla.

create table if not exists public.message_template_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  subject text not null default '',
  body text not null default '',
  owner_id text not null default '',
  folder text not null default '',
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_templates_updated_idx on public.message_templates (updated_at desc);

alter table public.message_templates enable row level security;
alter table public.message_template_folders enable row level security;
do $$
declare t text;
begin
  foreach t in array array['message_templates', 'message_template_folders'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'anon full access') then
      execute format('create policy "anon full access" on public.%I for all to anon using (true) with check (true)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'authenticated full access') then
      execute format('create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- ===== Semilla [Prueba] =====
insert into public.message_template_folders (id, name) values
  ('d2000000-0000-4000-8000-000000000001', 'Ventas'),
  ('d2000000-0000-4000-8000-000000000002', 'Soporte')
on conflict (name) do nothing;

insert into public.message_templates (id, name, subject, body, owner_id, folder, shared, created_at, updated_at) values
  ('d1000000-0000-4000-8000-000000000001', '[Prueba] Seguimiento de propuesta', 'Seguimiento: propuesta para {{contacto.empresa}}', '<p>Hola {{contacto.nombre}},</p><p>Quería hacer seguimiento de la propuesta que enviamos a {{contacto.empresa}}. ¿Has tenido ocasión de revisarla?</p><p>Quedo a tu disposición para resolver cualquier duda.</p><p>Un saludo,<br>{{propietario.nombre}}</p>', 'Fernando L.', 'Ventas', true,  now() - interval '20 days', now() - interval '3 days'),
  ('d1000000-0000-4000-8000-000000000002', '[Prueba] Presentación de Megaglass',  'Soluciones de vidrio para {{contacto.empresa}}',   '<p>Hola {{contacto.nombre}},</p><p>Soy {{propietario.nombre}}, de Megaglass. Fabricamos e instalamos soluciones de vidrio para fachadas, cerramientos y mamparas.</p><p>¿Te viene bien una llamada esta semana?</p><p>Saludos,</p>', 'Sofía R.', 'Ventas', true,  now() - interval '15 days', now() - interval '8 days'),
  ('d1000000-0000-4000-8000-000000000003', '[Prueba] Confirmación de visita técnica', 'Confirmación de visita técnica',                '<p>Hola {{contacto.nombre}},</p><p>Te confirmo la visita técnica para tomar medidas en {{contacto.ciudad}}. Si necesitas cambiar la fecha, responde a este correo.</p><p>Gracias,</p>', 'Fernando L.', 'Soporte', false, now() - interval '6 days',  now() - interval '1 day')
on conflict (id) do nothing;

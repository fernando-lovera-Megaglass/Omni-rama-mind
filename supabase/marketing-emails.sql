-- Omni CRM · Correo de marketing (Marketing › Correo)
-- Aplicar con: node scripts/apply-migration.mjs supabase/marketing-emails.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- marketing_emails: un correo de marketing por fila. Columnas pedidas (nombre, asunto, de_nombre, de_email,
-- html_content, estado borrador/programado/enviado/archivado, tipo normal/automatizado/blog, enviados,
-- entregados, aperturas, clics, programado_para, enviado_at, created_by, created_at, updated_at) más las que
-- necesita el editor: contenido (módulos del lienzo, jsonb), destinatarios (segmento o todos, jsonb),
-- plantilla, carpeta y updated_by («Última actualización por»). Misma seguridad que el resto de tablas.
-- Idempotente: no duplica la semilla.

create table if not exists public.marketing_emails (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default '',
  asunto text not null default '',
  de_nombre text not null default '',
  de_email text not null default '',
  html_content text not null default '',
  estado text not null default 'borrador' check (estado in ('borrador', 'programado', 'enviado', 'archivado')),
  tipo text not null default 'normal' check (tipo in ('normal', 'automatizado', 'blog')),
  enviados integer not null default 0,
  entregados integer not null default 0,
  aperturas integer not null default 0,
  clics integer not null default 0,
  programado_para timestamptz,
  enviado_at timestamptz,
  created_by text not null default '',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contenido jsonb not null default '[]'::jsonb,
  destinatarios jsonb not null default '{"kind": "all"}'::jsonb,
  plantilla text not null default '',
  carpeta text not null default ''
);
create index if not exists marketing_emails_estado_idx on public.marketing_emails (estado, updated_at desc);

alter table public.marketing_emails enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'marketing_emails' and policyname = 'anon full access') then
    create policy "anon full access" on public.marketing_emails for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'marketing_emails' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on public.marketing_emails for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ===== Semilla de prueba [Prueba]: enviados con métricas realistas, un borrador, uno programado y uno archivado =====
insert into public.marketing_emails (id, nombre, asunto, de_nombre, de_email, estado, tipo, enviados, entregados, aperturas, clics, programado_para, enviado_at, created_by, updated_by, created_at, updated_at, plantilla, carpeta, contenido) values
  ('c1000000-0000-4000-8000-000000000001', '[Prueba] Boletín de noviembre',          'Novedades de noviembre en vidrio y aluminio', 'Megaglass', 'hola@megaglass.us',   'enviado',   'normal', 420, 407, 112, 9,  null,                      now() - interval '9 days',  'Fernando L.', 'Fernando L.', now() - interval '12 days', now() - interval '9 days',  'newsletter', 'Boletines',   '[{"id":"m1","type":"text","props":{"html":"<h1>Novedades de noviembre</h1><p>Nuevas líneas de vidrio templado y perfiles de aluminio para proyectos comerciales.</p>"}},{"id":"m2","type":"button","props":{"label":"Ver catálogo","url":"https://example.com/catalogo","align":"center"}}]'),
  ('c1000000-0000-4000-8000-000000000002', '[Prueba] Promoción fachadas Q4',          '15 % en fachadas de vidrio hasta diciembre',   'Megaglass', 'hola@megaglass.us',   'enviado',   'normal', 180, 175, 61,  7,  null,                      now() - interval '20 days', 'Sofía R.',    'Sofía R.',    now() - interval '22 days', now() - interval '20 days', 'promo',      'Promociones', '[{"id":"m1","type":"text","props":{"html":"<h1>Promoción de fachadas</h1><p>Hasta el 31 de diciembre, 15 % de descuento en fachadas de vidrio para obra nueva.</p>"}},{"id":"m2","type":"button","props":{"label":"Solicitar presupuesto","url":"https://example.com/presupuesto","align":"center"}}]'),
  ('c1000000-0000-4000-8000-000000000003', '[Prueba] Invitación: jornada técnica',    'Te invitamos a la jornada técnica de instaladores', 'Megaglass', 'eventos@megaglass.us', 'enviado', 'normal', 96, 93, 31, 3, null,                      now() - interval '35 days', 'Fernando L.', 'Laura M.',    now() - interval '40 days', now() - interval '35 days', 'event',      'Eventos',     '[{"id":"m1","type":"text","props":{"html":"<h1>Jornada técnica para instaladores</h1><p>Jueves 20 · 10:00 · Planta Monterrey. Cupo limitado.</p>"}},{"id":"m2","type":"button","props":{"label":"Reservar plaza","url":"https://example.com/jornada","align":"center"}}]'),
  ('c1000000-0000-4000-8000-000000000004', '[Prueba] Boletín de diciembre (borrador)', 'Cerramos el año con nuevas instalaciones',    'Megaglass', 'hola@megaglass.us',   'borrador',  'normal', 0, 0, 0, 0,          null,                      null,                       'Fernando L.', 'Fernando L.', now() - interval '2 days',  now() - interval '1 day',   'newsletter', 'Boletines',   '[{"id":"m1","type":"text","props":{"html":"<h1>Cerramos el año</h1><p>Un repaso a los proyectos de 2026.</p>"}}]'),
  ('c1000000-0000-4000-8000-000000000005', '[Prueba] Felicitación de fin de año',     '¡Felices fiestas de parte de Megaglass!',      'Megaglass', 'hola@megaglass.us',   'programado','normal', 0, 0, 0, 0,          now() + interval '20 days',null,                       'Sofía R.',    'Sofía R.',    now() - interval '3 days',  now() - interval '3 days',  'greeting',   'Saludos',     '[{"id":"m1","type":"text","props":{"html":"<h1>¡Felices fiestas!</h1><p>Gracias por confiar en nosotros un año más.</p>"}}]'),
  ('c1000000-0000-4000-8000-000000000006', '[Prueba] Aviso de mantenimiento (archivado)', 'Mantenimiento de ventanas antes del invierno', 'Megaglass', 'hola@megaglass.us', 'archivado', 'automatizado', 240, 232, 48, 2, null,                 now() - interval '80 days', 'Laura M.',    'Laura M.',    now() - interval '85 days', now() - interval '60 days', 'plain',      '',            '[{"id":"m1","type":"text","props":{"html":"<p>Recuerda revisar juntas y herrajes antes del frío.</p>"}}]')
on conflict (id) do nothing;

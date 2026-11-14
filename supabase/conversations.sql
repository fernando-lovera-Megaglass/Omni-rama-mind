-- Omni CRM · Bandeja de entrada (conversaciones y mensajes)
-- Aplicar con: node scripts/apply-migration.mjs supabase/conversations.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- conversations:          una conversación por hilo (asunto, canal email/whatsapp/chat/form, estado
--                         open/closed/snoozed, asignado, contacto, último mensaje). contact_id es bigint
--                         porque contacts.id es bigint en este esquema. read_at marca hasta cuándo se ha leído
--                         (contador de no leídos del menú).
-- conversation_messages:  mensajes del hilo (in = del contacto, out = nuestro), con autor y fecha.
-- Misma seguridad que el resto de tablas. Idempotente: no duplica la semilla.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  subject text not null default '',
  channel text not null default 'email' check (channel in ('email', 'whatsapp', 'chat', 'form')),
  status text not null default 'open' check (status in ('open', 'closed', 'snoozed')),
  assigned_to text not null default '',
  contact_id bigint references public.contacts (id) on delete set null,
  last_message_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null default 'in' check (direction in ('in', 'out')),
  body text not null default '',
  author text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_conversation_idx on public.conversation_messages (conversation_id, created_at);
create index if not exists conversations_last_message_idx on public.conversations (last_message_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
do $$
declare t text;
begin
  foreach t in array array['conversations', 'conversation_messages'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'anon full access') then
      execute format('create policy "anon full access" on public.%I for all to anon using (true) with check (true)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'authenticated full access') then
      execute format('create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- ===== Semilla de prueba: 5 conversaciones [Prueba] con contactos existentes (ids 1 a 5) =====
insert into public.conversations (id, subject, channel, status, assigned_to, contact_id, last_message_at, read_at, created_at) values
  ('a1000000-0000-4000-8000-000000000001', '[Prueba] Cotización de ventanas para oficina', 'email',    'open',    'Fernando L.', 1, now() - interval '2 hours',  null,                      now() - interval '2 days'),
  ('a1000000-0000-4000-8000-000000000002', '[Prueba] Medidas para la mampara',            'whatsapp', 'open',    '',            2, now() - interval '5 hours',  null,                      now() - interval '1 day'),
  ('a1000000-0000-4000-8000-000000000003', '[Prueba] Consulta desde el chat de la web',   'chat',     'snoozed', 'Sofía R.',    3, now() - interval '1 day',    now() - interval '1 day',  now() - interval '3 days'),
  ('a1000000-0000-4000-8000-000000000004', '[Prueba] Formulario: presupuesto de fachada', 'form',     'open',    '',            4, now() - interval '26 hours', null,                      now() - interval '26 hours'),
  ('a1000000-0000-4000-8000-000000000005', '[Prueba] Garantía de doble acristalamiento',  'email',    'closed',  'Fernando L.', 5, now() - interval '4 days',   now() - interval '4 days', now() - interval '6 days')
on conflict (id) do nothing;

insert into public.conversation_messages (id, conversation_id, direction, body, author, created_at) values
  ('b1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'in',  'Hola, necesito una cotización para 12 ventanas de aluminio con doble vidrio para nuestra oficina de Monterrey. ¿Me pueden ayudar?', 'Ana Ruiz',     now() - interval '2 days'),
  ('b1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'out', 'Claro, Ana. ¿Nos compartes las medidas aproximadas y si prefieren corredizas o abatibles?',                                         'Fernando L.',  now() - interval '1 day 20 hours'),
  ('b1000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000001', 'in',  'Son 8 corredizas de 1.5 x 1.2 m y 4 abatibles de 0.9 x 1.2 m. Adjunto el plano en el siguiente correo.',                             'Ana Ruiz',     now() - interval '2 hours'),

  ('b1000000-0000-4000-8000-000000000021', 'a1000000-0000-4000-8000-000000000002', 'in',  'Buenas tardes, ¿cuándo pueden venir a tomar medidas de la mampara del baño?',                                                       'Diego Serrano', now() - interval '1 day'),
  ('b1000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000002', 'in',  'Estamos disponibles jueves o viernes por la mañana.',                                                                                 'Diego Serrano', now() - interval '5 hours'),

  ('b1000000-0000-4000-8000-000000000031', 'a1000000-0000-4000-8000-000000000003', 'in',  '¿Hacen instalaciones fuera de la ciudad?',                                                                                           'Nuria Prieto', now() - interval '3 days'),
  ('b1000000-0000-4000-8000-000000000032', 'a1000000-0000-4000-8000-000000000003', 'out', 'Sí, cubrimos todo el estado. ¿En qué localidad sería el proyecto?',                                                                 'Sofía R.',     now() - interval '2 days 22 hours'),
  ('b1000000-0000-4000-8000-000000000033', 'a1000000-0000-4000-8000-000000000003', 'in',  'En Saltillo. Les escribo la semana que viene con los detalles.',                                                                    'Nuria Prieto', now() - interval '2 days 21 hours'),
  ('b1000000-0000-4000-8000-000000000034', 'a1000000-0000-4000-8000-000000000003', 'out', 'Perfecto, quedamos atentos. Dejo la conversación pospuesta hasta entonces.',                                                        'Sofía R.',     now() - interval '1 day'),

  ('b1000000-0000-4000-8000-000000000041', 'a1000000-0000-4000-8000-000000000004', 'in',  'Nombre: Andrés Garduño · Empresa: Fachadas del Sur · Mensaje: Quiero un presupuesto para una fachada de vidrio de 120 m² en un edificio de 3 plantas.', 'Formulario web', now() - interval '26 hours'),
  ('b1000000-0000-4000-8000-000000000042', 'a1000000-0000-4000-8000-000000000004', 'in',  'Teléfono de contacto: +52 55 1234 5678. Horario preferido: tardes.',                                                                 'Formulario web', now() - interval '26 hours'),

  ('b1000000-0000-4000-8000-000000000051', 'a1000000-0000-4000-8000-000000000005', 'in',  'Hola, una de las unidades de doble acristalamiento presenta condensación entre vidrios. ¿Entra en garantía?',                         'Alicia Ruiz',  now() - interval '6 days'),
  ('b1000000-0000-4000-8000-000000000052', 'a1000000-0000-4000-8000-000000000005', 'out', 'Hola Alicia, sí: la condensación interna está cubierta. Programamos la visita técnica para el martes.',                               'Fernando L.',  now() - interval '5 days'),
  ('b1000000-0000-4000-8000-000000000053', 'a1000000-0000-4000-8000-000000000005', 'in',  'Perfecto, muchas gracias.',                                                                                                            'Alicia Ruiz',  now() - interval '4 days 2 hours'),
  ('b1000000-0000-4000-8000-000000000054', 'a1000000-0000-4000-8000-000000000005', 'out', 'Unidad sustituida. Cerramos la conversación; cualquier cosa nos escribes.',                                                           'Fernando L.',  now() - interval '4 days')
on conflict (id) do nothing;

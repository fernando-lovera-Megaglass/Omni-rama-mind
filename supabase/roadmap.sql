-- Omni CRM · Lista de construcción visible en la app (el diálogo «en construcción» la consulta)
-- Aplicar con: node scripts/apply-migration.mjs supabase/roadmap.sql
-- roadmap_sections: una fila por sección pendiente del producto, con su lugar en la lista
-- (position) y su estado (pending | building | done). La app solo lee; el orden lo cambia
-- el equipo con SQL o con el mapa de trabajo.

create table if not exists public.roadmap_sections (
  key text primary key,
  label text not null,
  position integer not null,
  status text not null default 'pending' check (status in ('pending', 'building', 'done')),
  updated_at timestamptz not null default now()
);

alter table public.roadmap_sections enable row level security;
drop policy if exists roadmap_read on public.roadmap_sections;
create policy roadmap_read on public.roadmap_sections for select using (auth.role() = 'authenticated');

-- Semilla: las secciones marcadas con «#» en la navegación, en orden de prioridad de construcción.
insert into public.roadmap_sections (key, label, position) values
  ('formularios', 'Formularios', 1),
  ('campanas', 'Campañas', 2),
  ('llamadas', 'Llamadas', 3),
  ('programador-reuniones', 'Programador de reuniones', 4),
  ('documentos', 'Documentos', 5),
  ('archivos', 'Archivos', 6),
  ('chatflows', 'Chatflows', 7),
  ('cotizaciones', 'Cotizaciones', 8),
  ('productos', 'Productos', 9),
  ('facturas', 'Facturas', 10),
  ('pagos', 'Pagos', 11),
  ('suscripciones', 'Suscripciones', 12),
  ('pronostico', 'Pronóstico', 13),
  ('objetivos', 'Objetivos', 14),
  ('analisis-marketing', 'Análisis de marketing', 15),
  ('redes-sociales', 'Redes sociales', 16),
  ('anuncios', 'Anuncios', 17),
  ('cta', 'CTA', 18),
  ('paginas-web', 'Páginas web', 19),
  ('landing-pages', 'Landing pages', 20),
  ('blog', 'Blog', 21),
  ('base-conocimientos', 'Base de conocimientos', 22),
  ('diseno', 'Diseño', 23),
  ('portal-cliente', 'Portal del cliente', 24),
  ('encuestas-feedback', 'Encuestas de feedback', 25),
  ('agente-datos', 'Agente de datos', 26),
  ('gestion-eventos', 'Gestión de eventos', 27),
  ('calidad-datos', 'Calidad de los datos', 28),
  ('data-studio', 'Data Studio', 29),
  ('modelo-datos', 'Modelo de datos', 30),
  ('enriquecimiento-datos', 'Enriquecimiento de datos', 31),
  ('copilot', 'Copilot', 32),
  ('marketplace', 'Marketplace', 33),
  ('marcadores', 'Marcadores', 34),
  ('mejorar', 'Mejorar', 35),
  ('comunidad', 'Comunidad', 36),
  ('soporte', 'Contactar con soporte', 37)
on conflict (key) do nothing;

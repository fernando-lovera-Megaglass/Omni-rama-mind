-- Omni CRM · Etiquetas de Negocio (Ajustes › Objetos › Negocios › Pipelines › Etiquetas de Negocio)
-- Aplicar con: node scripts/apply-migration.mjs supabase/deal_tags.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Idempotente.
--
-- deal_tags: una etiqueta por fila. Se aplica automáticamente a los negocios que cumplen sus filtros
--   (mismo formato que las condiciones de los filtros avanzados de las vistas: [{ key, op, value, value2, group }]).
--   pipeline_ids: [] = todos los pipelines; si no, los ids públicos de los pipelines a los que se asigna.
--   color: pastel de la paleta (p. ej. #FBDDD8) · emoji opcional · position: orden en la tabla.
-- Misma seguridad que el resto de tablas de datos.

create table if not exists public.deal_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '',
  color text not null default '#EBEBEB',
  description text not null default '',
  pipeline_ids jsonb not null default '[]',
  filters jsonb not null default '[]',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deal_tags_position_idx on public.deal_tags (position);

alter table public.deal_tags enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deal_tags' and policyname = 'anon full access') then
    create policy "anon full access" on public.deal_tags for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deal_tags' and policyname = 'authenticated full access') then
    create policy "authenticated full access" on public.deal_tags for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Omni CRM · Jerarquía de empresas (matriz / secundarias)
-- Aplicar con: node scripts/apply-migration.mjs supabase/company_hierarchy.sql
-- (o pegando este archivo en el SQL Editor de Supabase).
--
-- parent_company_id apunta a la empresa matriz (otra fila de companies). La ficha de empresa muestra la
-- tarjeta «Empresa matriz» (asignar/cambiar/quitar) y «Empresas secundarias» (las que cuelgan de ella); la
-- lista puede anidar las secundarias bajo su matriz. Idempotente.

alter table public.companies add column if not exists parent_company_id bigint;
create index if not exists companies_parent_company_id_idx on public.companies (parent_company_id);

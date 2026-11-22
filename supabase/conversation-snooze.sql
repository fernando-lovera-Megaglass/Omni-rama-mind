-- Omni CRM · Bandeja de entrada: «Posponer» con plazo.
-- Local/pendiente. Aplicar con: node scripts/apply-migration.mjs supabase/conversation-snooze.sql
-- (o pegando este archivo en el SQL Editor). Requiere supabase/conversations.sql. Repetible.
--
-- conversations.extra: { "snoozeUntil": "<ISO>" } mientras la conversación está pospuesta con plazo. La app la
-- reabre sola cuando vence (verificador de la bandeja) o cuando entra un mensaje nuevo. Sin esta columna la app
-- sigue funcionando: guarda el plazo en el navegador y avisa en consola.
alter table public.conversations add column if not exists extra jsonb not null default '{}'::jsonb;
create index if not exists conversations_snooze_idx on public.conversations ((extra->>'snoozeUntil')) where status = 'snoozed';

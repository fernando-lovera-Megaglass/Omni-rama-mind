-- Omni CRM · Propiedades personalizadas reales de tickets (Megaglass) en custom_properties
-- Aplicar con: node scripts/apply-migration.mjs supabase/custom-properties-tickets.sql
-- (requiere supabase/custom-properties.sql; o pegar este archivo en el SQL Editor de Supabase).
--
-- Las 4 propiedades NO definidas por HubSpot de GET /crm/v3/properties/tickets (instantánea en
-- scripts/hubspot-ticket-properties.snapshot.json), en el grupo «Información del ticket» (ticketinformation):
--   municipio                 → texto
--   source_incoming_expired   → número (oculta en HubSpot: la rellena el canal de entrada)
--   source_incoming_phone     → texto  (oculta en HubSpot)
--   vendedor_solicitante      → lista desplegable; en HubSpot no tiene opciones todavía, aquí se ofrecen los vendedores
-- Los valores viven en la columna `extra` (jsonb) de `tickets`: no hace falta columna nueva.
-- Idempotente: no duplica (unique(objeto, name)). La app también las conoce (src/custom-properties.js) y las
-- vuelve a sembrar si faltan.

insert into public.custom_properties (objeto, name, label, type, options, group_name, description, in_form) values
  ('ticket', 'municipio',               'Municipio',               'text',   '{"values": [], "rules": {}}'::jsonb, 'Información del ticket', '', false),
  ('ticket', 'source_incoming_expired', 'Source Incoming Expired', 'number', '{"values": [], "rules": {}}'::jsonb, 'Información del ticket', 'Source Incoming Expired · oculta en HubSpot (la rellena el canal de entrada).', false),
  ('ticket', 'source_incoming_phone',   'Source Incoming Phone',   'text',   '{"values": [], "rules": {}}'::jsonb, 'Información del ticket', 'Source Incoming Phone · oculta en HubSpot (la rellena el canal de entrada).', false),
  ('ticket', 'vendedor_solicitante',    'Vendedor solicitante',    'enum',   '{"values": ["Fernando L.", "Sofía R.", "Diego G.", "Laura M."], "rules": {}}'::jsonb, 'Información del ticket', 'Vendedor que pidió la cotización. Se deja vacío cuando el lead entra por página web u otro canal sin vendedor asignado. (La lista no tiene opciones en HubSpot; aquí se ofrecen los vendedores de la cuenta.)', false)
on conflict (objeto, name) do nothing;

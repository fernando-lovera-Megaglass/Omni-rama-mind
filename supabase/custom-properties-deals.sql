-- Omni CRM · Propiedades personalizadas reales de negocios (Megaglass) en custom_properties
-- Aplicar con: node scripts/apply-migration.mjs supabase/custom-properties-deals.sql
-- (requiere supabase/custom-properties.sql; o pegar este archivo en el SQL Editor de Supabase).
--
-- Texto salvo «Fecha ganado» (fecha). Idempotente: no duplica (unique(objeto, name)). La app también las
-- conoce (src/custom-properties.js) y las vuelve a sembrar si faltan.

insert into public.custom_properties (objeto, name, label, type, options, group_name, in_form) values
  ('deal', 'cotizador',                 'Cotizador',                 'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'ciudad',                    'Ciudad',                    'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'estado',                    'Estado',                    'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'colonia',                   'Colonia',                   'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'acabados',                  'Acabados',                  'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'avance_de_obra',            'Avance de obra',            'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'cimentacion',               'Cimentación',               'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'clase_de_proyecto',         'Clase de proyecto',         'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'clave_id',                  'Clave ID',                  'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'cliente',                   'Cliente',                   'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'contactado',                'Contactado',                'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'descripcion',               'Descripción',               'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'detalles',                  'Detalles',                  'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'duplicado',                 'Duplicado',                 'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'estatus_de_obra',           'Estatus de obra',           'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'estatus_llamada',           'Estatus de llamada',        'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'fecha_ganado',              'Fecha ganado',              'date', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'folio_aw_management',       'Folio AW Management',       'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'folio_easy_glass',          'Folio Easy Glass',          'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'formato_cotizacion',        'Formato de cotización',     'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'fuente_origen',             'Fuente de origen',          'text', '[]'::jsonb, 'Información de Megaglass', false),
  ('deal', 'informacion_del_proyecto',  'Información del proyecto',  'text', '[]'::jsonb, 'Información de Megaglass', false)
on conflict (objeto, name) do nothing;

-- Omni CRM · Propiedades personalizadas reales de empresas (Megaglass) en custom_properties
-- Aplicar con: node scripts/apply-migration.mjs supabase/custom-properties-companies.sql
-- (requiere supabase/custom-properties.sql; o pegar este archivo en el SQL Editor de Supabase).
--
-- Texto salvo «Tipo de cliente» (lista desplegable) y latitud / longitud (número). Idempotente: no duplica
-- (unique(objeto, name)). La app también las conoce (src/custom-properties.js) y las vuelve a sembrar si faltan.

insert into public.custom_properties (objeto, name, label, type, options, group_name, in_form) values
  ('company', 'rfc',                                  'RFC',                                  'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'tipo_de_cliente',                      'Tipo de cliente',                      'enum',   '["Instalador", "50 Top Glazier", "Desarrollador", "Arquitecto"]'::jsonb, 'Información de Megaglass', false),
  ('company', 'tipo_principal_de_cliente_de_vidrio',  'Tipo principal de cliente de vidrio',  'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'especialidad_de_la_empresa',           'Especialidad de la empresa',           'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'grupo',                                'Grupo',                                'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'productos_de_interes',                 'Productos de interés',                 'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'proyectos_recientes',                  'Proyectos recientes',                  'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'direccion_factura',                    'Dirección de factura',                 'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'nombre_a_quien_factura',               'Nombre a quien factura',               'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'numero_de_telefono_2',                 'Número de teléfono 2',                 'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'paisregion',                           'País/región',                          'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'latitud',                              'Latitud',                              'number', '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'longitud',                             'Longitud',                             'number', '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'mapsly',                               'Mapsly',                               'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'contactado',                           'Contactado',                           'text',   '[]'::jsonb, 'Información de Megaglass', false),
  ('company', 'rol',                                  'Rol',                                  'text',   '[]'::jsonb, 'Información de Megaglass', false)
on conflict (objeto, name) do nothing;

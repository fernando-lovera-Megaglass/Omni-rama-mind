// The account's real custom contact properties (Megaglass), as seeded by supabase/custom-properties.sql.
// properties.js adds them to the catalog in local mode (no table) and data.js makes sure the table has
// them when it starts. Text unless noted; the first three are also asked in the «Crear contacto» panel.
export const SEED_GROUP = 'Información de Megaglass';
export const SEED_CONTACT_PROPERTIES = [
  ['asesor_de_ventas', 'Asesor de ventas', 'text', true],
  ['nombre_del_proyecto', 'Nombre del proyecto', 'text', true],
  ['nombre_a_quien_factura', 'Nombre a quien factura', 'text'],
  ['notas_sobre_el_contacto', 'Notas sobre el contacto', 'text'],
  ['numero_de_telefono_2', 'Número de teléfono 2', 'text'],
  ['numero_de_telefono_alternativo', 'Número de teléfono alternativo', 'text'],
  ['cell_phone', 'Cell phone', 'text', true],
  ['latitud', 'Latitud', 'number'],
  ['longitud', 'Longitud', 'number'],
  ['mapsly', 'Mapsly', 'text'],
  ['destino', 'Destino', 'text'],
  ['origen', 'Origen', 'text'],
  ['calificar_experiencia', 'Calificar experiencia', 'text'],
  ['contacto_directo_de_inforte', 'Contacto directo de Inforte', 'text'],
  ['independent_sales_rep', 'Independent sales rep', 'text'],
  ['material_corresponde_a_cotizacion', 'Material corresponde a cotización', 'text'],
  ['en_que_te_podemos_ayudar', '¿En qué te podemos ayudar?', 'text'],
  ['adjunto', 'Adjunto', 'text'],
  ['files', 'Files', 'text'],
].map(([key, label, kind, visible]) => ({ key, label, kind, group: SEED_GROUP, desc: '', visible: Boolean(visible), archived: false }));

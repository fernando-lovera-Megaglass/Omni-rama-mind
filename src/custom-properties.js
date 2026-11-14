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
// The account's real custom company properties (supabase/custom-properties-companies.sql): text unless
// noted; «Tipo de cliente» is a dropdown, latitud / longitud are numbers.
export const SEED_COMPANY_PROPERTIES = [
  ['rfc', 'RFC', 'text'],
  ['tipo_de_cliente', 'Tipo de cliente', 'enum', false, ['Instalador', '50 Top Glazier', 'Desarrollador', 'Arquitecto']],
  ['tipo_principal_de_cliente_de_vidrio', 'Tipo principal de cliente de vidrio', 'text'],
  ['especialidad_de_la_empresa', 'Especialidad de la empresa', 'text'],
  ['grupo', 'Grupo', 'text'],
  ['productos_de_interes', 'Productos de interés', 'text'],
  ['proyectos_recientes', 'Proyectos recientes', 'text'],
  ['direccion_factura', 'Dirección de factura', 'text'],
  ['nombre_a_quien_factura', 'Nombre a quien factura', 'text'],
  ['numero_de_telefono_2', 'Número de teléfono 2', 'text'],
  ['paisregion', 'País/región', 'text'],
  ['latitud', 'Latitud', 'number'],
  ['longitud', 'Longitud', 'number'],
  ['mapsly', 'Mapsly', 'text'],
  ['contactado', 'Contactado', 'text'],
  ['rol', 'Rol', 'text'],
].map(([key, label, kind, visible, options]) => ({ key, label, kind, options, group: SEED_GROUP, desc: '', visible: Boolean(visible), archived: false }));
// The account's real custom deal properties (supabase/custom-properties-deals.sql): text except «Fecha ganado».
export const SEED_DEAL_PROPERTIES = [
  ['cotizador', 'Cotizador', 'text'],
  ['ciudad', 'Ciudad', 'text'],
  ['estado', 'Estado', 'text'],
  ['colonia', 'Colonia', 'text'],
  ['acabados', 'Acabados', 'text'],
  ['avance_de_obra', 'Avance de obra', 'text'],
  ['cimentacion', 'Cimentación', 'text'],
  ['clase_de_proyecto', 'Clase de proyecto', 'text'],
  ['clave_id', 'Clave ID', 'text'],
  ['cliente', 'Cliente', 'text'],
  ['contactado', 'Contactado', 'text'],
  ['descripcion', 'Descripción', 'text'],
  ['detalles', 'Detalles', 'text'],
  ['duplicado', 'Duplicado', 'text'],
  ['estatus_de_obra', 'Estatus de obra', 'text'],
  ['estatus_llamada', 'Estatus de llamada', 'text'],
  ['fecha_ganado', 'Fecha ganado', 'date'],
  ['folio_aw_management', 'Folio AW Management', 'text'],
  ['folio_easy_glass', 'Folio Easy Glass', 'text'],
  ['formato_cotizacion', 'Formato de cotización', 'text'],
  ['fuente_origen', 'Fuente de origen', 'text'],
  ['informacion_del_proyecto', 'Información del proyecto', 'text'],
].map(([key, label, kind]) => ({ key, label, kind, group: SEED_GROUP, desc: '', visible: false, archived: false }));
export const SEED_BY_TYPE = { contacts: SEED_CONTACT_PROPERTIES, companies: SEED_COMPANY_PROPERTIES, deals: SEED_DEAL_PROPERTIES };

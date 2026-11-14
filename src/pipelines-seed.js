// The account's real deal pipelines (Megaglass), with their stages in order: [key, label, probability %].
// Seeded in Supabase by supabase/pipelines.sql; data.js uses them as the built-in defaults (local mode) and
// inserts them when the tables are empty. Closed stages always use the keys won / lost / deleted so the
// lists, boards and reports can tell open deals from closed ones in every pipeline.
export const REAL_DEAL_PIPELINES = [
  { id: 102418, name: 'FUERZA DE VENTAS', labels: 2, stages: [
    ['oferta', 'OFERTA A+W', 10], ['cotizacion', 'Proyecto en Cotización por parte del cliente', 30], ['ganado_cliente', 'Proyecto Ganado por el cliente', 40], ['evalua', 'Evalua', 80],
    ['won', 'Ganado', 100], ['lost', 'Perdido', 0], ['deleted', 'Eliminado', 0],
  ] },
  { id: 740211, name: 'SACA SUMINISTRO', labels: 1, stages: [
    ['oferta_aw', 'Oferta A+W', 10], ['presupuesto', 'Entrega de presupuesto', 25], ['negociacion', 'Negociación con el cliente', 40], ['recotizacion', 'Re-Cotizacion', 50],
    ['contrato_factura', 'Generacion de contrato y factura', 75], ['produccion', 'En Producción', 90], ['won', 'Ganados', 100], ['lost', 'Perdidos', 0], ['deleted', 'Eliminación', 0],
  ] },
  { id: 203877, name: 'SACA Instalaciones', labels: 0, stages: [
    ['compra_materiales', 'Compra de Materiales', 20], ['toma_medidas', 'Toma de Medidas', 30], ['fabricacion_vidrio', 'Fabricación Vidrio', 40], ['fabricacion_aluminio', 'Fabricación Aluminio (Corte, Armado, Envidriado)', 50],
    ['instalacion', 'Instalacion', 60], ['limpieza_entrega', 'Limpieza y entrega', 70], ['factura', 'Generación de factura', 80], ['cobranza', 'Cobranza', 90],
    ['won', 'Ganado', 100], ['lost', 'PERDIDO', 0], ['deleted', 'ELIMINADO', 0], ['proceso_cotizacion', 'Proceso de Cotizacion', 10],
  ] },
  { id: 121930, name: 'Proyectos Nacionales Desarrolladores', labels: 0, stages: [
    ['presentacion_empresa', 'Presentación de la empresa', 10], ['obtener_contactos', 'Obtener contactos', 20], ['especificacion_productos', 'Especificacion de Productos', 35], ['entrega_cotizacion', 'Entrega de la cotización', 50],
    ['recotizacion', 'Re-cotizacion', 60], ['contratos', 'Contratos', 85], ['won', 'Ganados', 100], ['lost', 'Perdidos', 0],
  ] },
  { id: 740562, name: 'Ventas Extranjero', labels: 2, stages: [
    ['generacion_cotizacion', 'Generación de cotización', 10], ['cotizacion_enviada', 'Cotizacion Enviada', 30], ['ganado_cliente', 'Proyecto ganado por el cliente', 50], ['envio_muestra', 'Envio de muestra', 60],
    ['envio_orden_compra', 'Envio de orden de compra', 85], ['won', 'Ganado', 100], ['lost', 'Perdido', 0], ['cotizacion_duplicada', 'Cotizacion Duplicada', 0], ['muestras', 'Muestras', 20],
  ] },
  { id: 740988, name: 'JFC Cargo Destino', labels: 0, stages: [
    ['cotizacion', 'Cotización', 20], ['envio_cotizacion', 'Envio de Cotizacion', 50], ['won', 'Ganada', 100], ['lost', 'Perdida', 0],
  ] },
  { id: 741320, name: 'Acristala obras', labels: 0, stages: [
    ['base_datos', 'Base de Datos', 5], ['contacto_concretado', 'Contacto concretado', 15], ['informacion_recibida', 'Información recibida', 30], ['cotizacion_enviada', 'Cotización trabajada (Enviada)', 50],
    ['contrato_factura', 'Contrato-Factura', 80], ['won', 'Cierre ganado', 100], ['lost', 'Cierre perdido', 0], ['instaladores', 'Instaladores', 90], ['cierre_obra', 'Cierre de obra', 100],
  ] },
  { id: 929114, name: 'Acristala Proyectos', labels: 0, stages: [
    ['appointment', 'Cita programada', 20], ['qualified', 'Calificado para comprar', 40], ['presentation', 'Presentación programada', 60], ['propuesta_aceptada', 'Propuesta aceptada', 80],
    ['contract', 'Contrato enviado', 90], ['won', 'Cierre ganado', 100], ['lost', 'Cierre perdido', 0],
  ] },
].map((p) => ({ ...p, desc: '' }));

// Where a deal that still carries one of the sample stage keys lands in its real pipeline (won / lost keep
// their keys). Applied by the app when reading (normalizeDealStage) and by supabase/pipelines.sql to the
// stored deals.
export const LEGACY_STAGE_MAP = {
  'FUERZA DE VENTAS': { appointment: 'oferta', qualified: 'cotizacion', presentation: 'ganado_cliente', decision: 'evalua', contract: 'evalua' },
  'SACA SUMINISTRO': { appointment: 'oferta_aw', qualified: 'presupuesto', quote: 'presupuesto', presentation: 'presupuesto', negotiation: 'negociacion', decision: 'recotizacion', contract: 'contrato_factura' },
  'SACA Instalaciones': { appointment: 'proceso_cotizacion', qualified: 'proceso_cotizacion', quote: 'proceso_cotizacion', presentation: 'compra_materiales', visit: 'toma_medidas', measure: 'toma_medidas', decision: 'fabricacion_vidrio', production: 'fabricacion_aluminio', install: 'instalacion', contract: 'factura' },
  'Proyectos Nacionales Desarrolladores': { appointment: 'presentacion_empresa', qualified: 'obtener_contactos', presentation: 'especificacion_productos', quote: 'entrega_cotizacion', decision: 'recotizacion', contract: 'contratos' },
  'Ventas Extranjero': { appointment: 'generacion_cotizacion', qualified: 'generacion_cotizacion', quote: 'cotizacion_enviada', presentation: 'cotizacion_enviada', negotiation: 'ganado_cliente', decision: 'envio_muestra', contract: 'envio_orden_compra' },
  'JFC Cargo Destino': { appointment: 'cotizacion', qualified: 'cotizacion', presentation: 'envio_cotizacion', decision: 'envio_cotizacion', contract: 'envio_cotizacion' },
  'Acristala obras': { appointment: 'base_datos', qualified: 'contacto_concretado', visit: 'informacion_recibida', measure: 'informacion_recibida', presentation: 'cotizacion_enviada', decision: 'cotizacion_enviada', contract: 'contrato_factura' },
  'Acristala Proyectos': { decision: 'propuesta_aceptada' },
};
export const DEFAULT_PIPELINE_NAME = REAL_DEAL_PIPELINES[0].name;

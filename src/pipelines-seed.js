// The account's real deal pipelines (Megaglass), with their stages in order: [key, label, probability %].
// Labels and probabilities match the HubSpot API (GET /crm/v3/pipelines/deals, snapshot in
// scripts/hubspot-pipelines.snapshot.json; refresh with `node scripts/hubspot-pipelines.mjs deals`). The
// account's own spellings are kept on purpose («coreo», «Re - cotizacion», «( Corte, …»).
// Seeded in Supabase by supabase/pipelines.sql (probabilities re-aligned by supabase/pipeline_stages_real.sql);
// data.js uses them as the built-in defaults (local mode) and inserts them when the tables are empty. Closed
// stages use the keys won / lost / deleted plus the pipeline-specific closed ones listed in data.js
// (CLOSED_STAGES: muestras, cotizacion_duplicada, instaladores, cierre_obra) so the lists, boards and reports
// can tell open deals from closed ones in every pipeline.
export const REAL_DEAL_PIPELINES = [
  { id: 102418, name: 'FUERZA DE VENTAS', labels: 2, stages: [
    ['oferta', 'OFERTA A+W', 10], ['cotizacion', 'Proyecto en Cotización por parte del cliente', 30], ['ganado_cliente', 'Proyecto Ganado por el cliente', 40], ['evalua', 'Evalua', 80],
    ['won', 'Ganado', 100], ['lost', 'Perdido', 0], ['deleted', 'Eliminado', 0],
  ] },
  { id: 740211, name: 'SACA SUMINISTRO', labels: 1, stages: [
    ['oferta_aw', 'Oferta A+W', 10], ['presupuesto', 'Entrega de presupuesto', 20], ['negociacion', 'Negociación con el cliente', 60], ['recotizacion', 'Re-Cotizacion', 70],
    ['contrato_factura', 'Generacion de contrato y factura', 90], ['produccion', 'En Producción', 90], ['won', 'Ganados', 100], ['lost', 'Perdidos', 0], ['deleted', 'Eliminación', 0],
  ] },
  { id: 203877, name: 'SACA Instalaciones', labels: 0, stages: [
    ['compra_materiales', 'Compra de Materiales', 10], ['toma_medidas', 'Toma de Medidas', 10], ['fabricacion_vidrio', 'Fabricación Vidrio', 10], ['fabricacion_aluminio', 'Fabricación Aluminio ( Corte, Armado, Envidriado)', 10],
    ['instalacion', 'Instalacion', 10], ['limpieza_entrega', 'Limpieza y entrega', 10], ['factura', 'Generación de factura', 10], ['cobranza', 'Cobranza', 10],
    ['won', 'Ganado', 100], ['lost', 'PERDIDO', 0], ['deleted', 'ELIMINADO', 0], ['proceso_cotizacion', 'Proceso de Cotizacion', 10],
  ] },
  { id: 121930, name: 'Proyectos Nacionales Desarrolladores', labels: 0, stages: [
    ['presentacion_empresa', 'Presentación de la empresa', 10], ['obtener_contactos', 'Obtener contactos', 10], ['especificacion_productos', 'Especificacion de Productos', 30], ['entrega_cotizacion', 'Entrega de la cotización', 50],
    ['recotizacion', 'Re - cotizacion', 80], ['contratos', 'Contratos', 90], ['won', 'Ganados', 100], ['lost', 'Perdidos', 0],
  ] },
  { id: 740562, name: 'Ventas Extranjero', labels: 2, stages: [
    ['generacion_cotizacion', 'Generación de cotización', 20], ['cotizacion_enviada', 'Cotizacion Enviada', 30], ['ganado_cliente', 'Proyecto ganado por el cliente', 60], ['envio_muestra', 'Envio de muestra', 70],
    ['envio_orden_compra', 'Envio de orden de compra', 90], ['won', 'Ganado', 100], ['lost', 'Perdido', 0], ['cotizacion_duplicada', 'Cotizacion Duplicada', 0], ['muestras', 'Muestras', 0],
  ] },
  { id: 740988, name: 'JFC Cargo Destino', labels: 0, stages: [
    ['cotizacion', 'Cotización', 20], ['envio_cotizacion', 'Envio de Cotizacion', 40], ['won', 'Ganada', 100], ['lost', 'Perdida', 0],
  ] },
  { id: 741320, name: 'Acristala obras', labels: 0, stages: [
    ['base_datos', 'Base de Datos', 10], ['contacto_concretado', 'Contacto concretado (llamada, coreo, visita)', 25], ['informacion_recibida', 'Información recibida', 40], ['cotizacion_enviada', 'Cotización trabajada (Enviada)', 80],
    ['contrato_factura', 'Contrato-Factura', 90], ['won', 'Cierre ganado', 100], ['lost', 'Cierre perdido', 0], ['instaladores', 'Instaladores', 100], ['cierre_obra', 'Cierre de obra', 100],
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

// The account's real ticket pipelines (GET /crm/v3/pipelines/tickets): 4 pipelines, 27 statuses in order,
// [key, label, 'open' | 'closed'] with the account's own spellings and the HubSpot pipeline id. The keys are
// stable slugs saved in tickets.status; a key may repeat across pipelines (each pipeline owns its statuses).
export const REAL_TICKET_PIPELINES = [
  { id: 1652313, name: 'Cotizaciones Proyectos', stages: [
    ['sin_contactar', 'Sin Contactar', 'open'], ['primer_contacto', 'Primer contacto', 'open'], ['asignado_vendedor', 'Asignado a un Vendedor', 'open'], ['generacion_cotizacion', 'Generación de cotizacion', 'open'],
    ['instalacion_saca', 'Instalación (S.A.C.A.)', 'open'], ['generacion_negocio', 'Generación de Negocio', 'open'], ['cerrado', 'Cerrado', 'closed'],
  ] },
  { id: 1652307, name: 'Cotizaciones SACA', stages: [
    ['sin_contactar', 'Sin Contactar', 'open'], ['asignado_vendedor', 'Asignado a un vendedor', 'open'], ['generacion_cotizacion', 'Generación de cotizacion', 'open'], ['envio_cotizacion', 'Envio de cotización', 'open'],
    ['analisis_costos', 'Análisis de Costos', 'open'], ['envio_analisis', 'Envió de Análisis/Cotización', 'open'], ['generacion_negocio', 'Generación de Negocio', 'open'], ['cerrado', 'Cerrado', 'closed'],
  ] },
  { id: 931354724, name: 'Cotizaciones Acristala', stages: [
    ['recepcion_informacion', 'Recepción de información', 'open'], ['asignacion_cotizador', 'Asignación a un cotizador', 'open'], ['generacion_cotizacion', 'Generación de cotización', 'open'], ['espera_informacion', 'Espera de informacion Pendiente', 'open'],
    ['cotizacion_materiales', 'Cotización de Materiales', 'open'], ['modificacion_cotizacion', 'Modificación de cotización', 'closed'], ['analisis_costos', 'Análisis de costos', 'open'], ['envio_cotizacion', 'Envió de cotizacion', 'open'],
  ] },
  { id: 931362903, name: 'Cotizaciones Kafer', stages: [
    ['solicitud_cotizacion', 'Solicitud de Cotizacion', 'open'], ['vendedor_asignado', 'Vendedor Asignado', 'open'], ['cotizacion_realizada', 'Cotizacion Realizada', 'open'], ['cotizacion_enviada', 'Cotizacion Enviada', 'closed'],
  ] },
].map((p) => ({ ...p, desc: '' }));
// Where the sample pipelines / statuses of earlier versions land (applied by the app when reading a ticket and
// by supabase/pipeline_stages_real.sql to the stored tickets): the sample status index maps onto the n-th
// open status of the real pipeline, «closed» onto its first closed one.
export const LEGACY_TICKET_MAP = {
  pipelines: { 'Pipeline de soporte': 'Cotizaciones Proyectos', Cotizaciones: 'Cotizaciones SACA', Garantías: 'Cotizaciones Acristala', Instalaciones: 'Cotizaciones Kafer' },
  statuses: { new: 0, waiting: 1, progress: 2 },
};

-- Omni CRM · etapas de negocios y pipelines de tickets alineados con el HubSpot real de la cuenta
-- Generado por scripts/pipelines-sql.mjs a partir de src/pipelines-seed.js (fuente: GET /crm/v3/pipelines/{deals,tickets},
-- instantánea en scripts/hubspot-pipelines.snapshot.json). Aplicar con: node scripts/apply-migration.mjs supabase/pipeline_stages_real.sql
-- Idempotente: actualiza nombres y probabilidades de las etapas de negocios existentes, crea los pipelines de tickets
-- que falten con sus estados, y mueve los tickets guardados con los pipelines / estados de muestra a los reales.

-- ===== Negocios: nombre y probabilidad real de cada etapa (por pipeline + clave) =====
with s(pipeline, orden, clave, nombre, probabilidad) as (values
  ('FUERZA DE VENTAS', 0, 'oferta', 'OFERTA A+W', 10),
  ('FUERZA DE VENTAS', 1, 'cotizacion', 'Proyecto en Cotización por parte del cliente', 30),
  ('FUERZA DE VENTAS', 2, 'ganado_cliente', 'Proyecto Ganado por el cliente', 40),
  ('FUERZA DE VENTAS', 3, 'evalua', 'Evalua', 80),
  ('FUERZA DE VENTAS', 4, 'won', 'Ganado', 100),
  ('FUERZA DE VENTAS', 5, 'lost', 'Perdido', 0),
  ('FUERZA DE VENTAS', 6, 'deleted', 'Eliminado', 0),
  ('SACA SUMINISTRO', 0, 'oferta_aw', 'Oferta A+W', 10),
  ('SACA SUMINISTRO', 1, 'presupuesto', 'Entrega de presupuesto', 20),
  ('SACA SUMINISTRO', 2, 'negociacion', 'Negociación con el cliente', 60),
  ('SACA SUMINISTRO', 3, 'recotizacion', 'Re-Cotizacion', 70),
  ('SACA SUMINISTRO', 4, 'contrato_factura', 'Generacion de contrato y factura', 90),
  ('SACA SUMINISTRO', 5, 'produccion', 'En Producción', 90),
  ('SACA SUMINISTRO', 6, 'won', 'Ganados', 100),
  ('SACA SUMINISTRO', 7, 'lost', 'Perdidos', 0),
  ('SACA SUMINISTRO', 8, 'deleted', 'Eliminación', 0),
  ('SACA Instalaciones', 0, 'compra_materiales', 'Compra de Materiales', 10),
  ('SACA Instalaciones', 1, 'toma_medidas', 'Toma de Medidas', 10),
  ('SACA Instalaciones', 2, 'fabricacion_vidrio', 'Fabricación Vidrio', 10),
  ('SACA Instalaciones', 3, 'fabricacion_aluminio', 'Fabricación Aluminio ( Corte, Armado, Envidriado)', 10),
  ('SACA Instalaciones', 4, 'instalacion', 'Instalacion', 10),
  ('SACA Instalaciones', 5, 'limpieza_entrega', 'Limpieza y entrega', 10),
  ('SACA Instalaciones', 6, 'factura', 'Generación de factura', 10),
  ('SACA Instalaciones', 7, 'cobranza', 'Cobranza', 10),
  ('SACA Instalaciones', 8, 'won', 'Ganado', 100),
  ('SACA Instalaciones', 9, 'lost', 'PERDIDO', 0),
  ('SACA Instalaciones', 10, 'deleted', 'ELIMINADO', 0),
  ('SACA Instalaciones', 11, 'proceso_cotizacion', 'Proceso de Cotizacion', 10),
  ('Proyectos Nacionales Desarrolladores', 0, 'presentacion_empresa', 'Presentación de la empresa', 10),
  ('Proyectos Nacionales Desarrolladores', 1, 'obtener_contactos', 'Obtener contactos', 10),
  ('Proyectos Nacionales Desarrolladores', 2, 'especificacion_productos', 'Especificacion de Productos', 30),
  ('Proyectos Nacionales Desarrolladores', 3, 'entrega_cotizacion', 'Entrega de la cotización', 50),
  ('Proyectos Nacionales Desarrolladores', 4, 'recotizacion', 'Re - cotizacion', 80),
  ('Proyectos Nacionales Desarrolladores', 5, 'contratos', 'Contratos', 90),
  ('Proyectos Nacionales Desarrolladores', 6, 'won', 'Ganados', 100),
  ('Proyectos Nacionales Desarrolladores', 7, 'lost', 'Perdidos', 0),
  ('Ventas Extranjero', 0, 'generacion_cotizacion', 'Generación de cotización', 20),
  ('Ventas Extranjero', 1, 'cotizacion_enviada', 'Cotizacion Enviada', 30),
  ('Ventas Extranjero', 2, 'ganado_cliente', 'Proyecto ganado por el cliente', 60),
  ('Ventas Extranjero', 3, 'envio_muestra', 'Envio de muestra', 70),
  ('Ventas Extranjero', 4, 'envio_orden_compra', 'Envio de orden de compra', 90),
  ('Ventas Extranjero', 5, 'won', 'Ganado', 100),
  ('Ventas Extranjero', 6, 'lost', 'Perdido', 0),
  ('Ventas Extranjero', 7, 'cotizacion_duplicada', 'Cotizacion Duplicada', 0),
  ('Ventas Extranjero', 8, 'muestras', 'Muestras', 0),
  ('JFC Cargo Destino', 0, 'cotizacion', 'Cotización', 20),
  ('JFC Cargo Destino', 1, 'envio_cotizacion', 'Envio de Cotizacion', 40),
  ('JFC Cargo Destino', 2, 'won', 'Ganada', 100),
  ('JFC Cargo Destino', 3, 'lost', 'Perdida', 0),
  ('Acristala obras', 0, 'base_datos', 'Base de Datos', 10),
  ('Acristala obras', 1, 'contacto_concretado', 'Contacto concretado (llamada, coreo, visita)', 25),
  ('Acristala obras', 2, 'informacion_recibida', 'Información recibida', 40),
  ('Acristala obras', 3, 'cotizacion_enviada', 'Cotización trabajada (Enviada)', 80),
  ('Acristala obras', 4, 'contrato_factura', 'Contrato-Factura', 90),
  ('Acristala obras', 5, 'won', 'Cierre ganado', 100),
  ('Acristala obras', 6, 'lost', 'Cierre perdido', 0),
  ('Acristala obras', 7, 'instaladores', 'Instaladores', 100),
  ('Acristala obras', 8, 'cierre_obra', 'Cierre de obra', 100),
  ('Acristala Proyectos', 0, 'appointment', 'Cita programada', 20),
  ('Acristala Proyectos', 1, 'qualified', 'Calificado para comprar', 40),
  ('Acristala Proyectos', 2, 'presentation', 'Presentación programada', 60),
  ('Acristala Proyectos', 3, 'propuesta_aceptada', 'Propuesta aceptada', 80),
  ('Acristala Proyectos', 4, 'contract', 'Contrato enviado', 90),
  ('Acristala Proyectos', 5, 'won', 'Cierre ganado', 100),
  ('Acristala Proyectos', 6, 'lost', 'Cierre perdido', 0)
)
update public.pipeline_stages st set nombre = s.nombre, probabilidad = s.probabilidad, orden = s.orden
  from s join public.pipelines p on p.objeto = 'deal' and p.nombre = s.pipeline
  where st.pipeline_id = p.id and st.clave = s.clave
    and (st.nombre is distinct from s.nombre or st.probabilidad is distinct from s.probabilidad or st.orden is distinct from s.orden);

-- ===== Tickets: los 4 pipelines reales (id público de HubSpot en extra.publicId) =====
insert into public.pipelines (objeto, nombre, orden, extra) values
  ('ticket', 'Cotizaciones Proyectos', 0, '{"publicId": 1652313}'),
  ('ticket', 'Cotizaciones SACA', 1, '{"publicId": 1652307}'),
  ('ticket', 'Cotizaciones Acristala', 2, '{"publicId": 931354724}'),
  ('ticket', 'Cotizaciones Kafer', 3, '{"publicId": 931362903}')
on conflict (objeto, nombre) do nothing;

-- Estados en orden (clave, nombre, 'open' | 'closed' en descripcion). Solo se insertan los que falten.
with s(pipeline, orden, clave, nombre, tipo) as (values
  ('Cotizaciones Proyectos', 0, 'sin_contactar', 'Sin Contactar', 'open'),
  ('Cotizaciones Proyectos', 1, 'primer_contacto', 'Primer contacto', 'open'),
  ('Cotizaciones Proyectos', 2, 'asignado_vendedor', 'Asignado a un Vendedor', 'open'),
  ('Cotizaciones Proyectos', 3, 'generacion_cotizacion', 'Generación de cotizacion', 'open'),
  ('Cotizaciones Proyectos', 4, 'instalacion_saca', 'Instalación (S.A.C.A.)', 'open'),
  ('Cotizaciones Proyectos', 5, 'generacion_negocio', 'Generación de Negocio', 'open'),
  ('Cotizaciones Proyectos', 6, 'cerrado', 'Cerrado', 'closed'),
  ('Cotizaciones SACA', 0, 'sin_contactar', 'Sin Contactar', 'open'),
  ('Cotizaciones SACA', 1, 'asignado_vendedor', 'Asignado a un vendedor', 'open'),
  ('Cotizaciones SACA', 2, 'generacion_cotizacion', 'Generación de cotizacion', 'open'),
  ('Cotizaciones SACA', 3, 'envio_cotizacion', 'Envio de cotización', 'open'),
  ('Cotizaciones SACA', 4, 'analisis_costos', 'Análisis de Costos', 'open'),
  ('Cotizaciones SACA', 5, 'envio_analisis', 'Envió de Análisis/Cotización', 'open'),
  ('Cotizaciones SACA', 6, 'generacion_negocio', 'Generación de Negocio', 'open'),
  ('Cotizaciones SACA', 7, 'cerrado', 'Cerrado', 'closed'),
  ('Cotizaciones Acristala', 0, 'recepcion_informacion', 'Recepción de información', 'open'),
  ('Cotizaciones Acristala', 1, 'asignacion_cotizador', 'Asignación a un cotizador', 'open'),
  ('Cotizaciones Acristala', 2, 'generacion_cotizacion', 'Generación de cotización', 'open'),
  ('Cotizaciones Acristala', 3, 'espera_informacion', 'Espera de informacion Pendiente', 'open'),
  ('Cotizaciones Acristala', 4, 'cotizacion_materiales', 'Cotización de Materiales', 'open'),
  ('Cotizaciones Acristala', 5, 'modificacion_cotizacion', 'Modificación de cotización', 'closed'),
  ('Cotizaciones Acristala', 6, 'analisis_costos', 'Análisis de costos', 'open'),
  ('Cotizaciones Acristala', 7, 'envio_cotizacion', 'Envió de cotizacion', 'open'),
  ('Cotizaciones Kafer', 0, 'solicitud_cotizacion', 'Solicitud de Cotizacion', 'open'),
  ('Cotizaciones Kafer', 1, 'vendedor_asignado', 'Vendedor Asignado', 'open'),
  ('Cotizaciones Kafer', 2, 'cotizacion_realizada', 'Cotizacion Realizada', 'open'),
  ('Cotizaciones Kafer', 3, 'cotizacion_enviada', 'Cotizacion Enviada', 'closed')
)
insert into public.pipeline_stages (pipeline_id, clave, nombre, probabilidad, orden, descripcion)
  select p.id, s.clave, s.nombre, case when s.tipo = 'closed' then 100 else 0 end, s.orden, s.tipo
  from s join public.pipelines p on p.objeto = 'ticket' and p.nombre = s.pipeline
on conflict (pipeline_id, clave) do update set nombre = excluded.nombre, orden = excluded.orden, descripcion = excluded.descripcion;

-- ===== Tickets guardados con los pipelines / estados de muestra → los reales =====
update public.tickets set pipeline = 'Cotizaciones Proyectos', status = case
    when status = 'new' then 'sin_contactar'
    when status = 'waiting' then 'primer_contacto'
    when status = 'progress' then 'asignado_vendedor'
    when status = 'closed' then 'cerrado'
    when status in ('sin_contactar', 'primer_contacto', 'asignado_vendedor', 'generacion_cotizacion', 'instalacion_saca', 'generacion_negocio', 'cerrado') then status
    else 'sin_contactar' end
  where pipeline = 'Pipeline de soporte';
update public.tickets set pipeline = 'Cotizaciones SACA', status = case
    when status = 'new' then 'sin_contactar'
    when status = 'waiting' then 'asignado_vendedor'
    when status = 'progress' then 'generacion_cotizacion'
    when status = 'closed' then 'cerrado'
    when status in ('sin_contactar', 'asignado_vendedor', 'generacion_cotizacion', 'envio_cotizacion', 'analisis_costos', 'envio_analisis', 'generacion_negocio', 'cerrado') then status
    else 'sin_contactar' end
  where pipeline = 'Cotizaciones';
update public.tickets set pipeline = 'Cotizaciones Acristala', status = case
    when status = 'new' then 'recepcion_informacion'
    when status = 'waiting' then 'asignacion_cotizador'
    when status = 'progress' then 'generacion_cotizacion'
    when status = 'closed' then 'modificacion_cotizacion'
    when status in ('recepcion_informacion', 'asignacion_cotizador', 'generacion_cotizacion', 'espera_informacion', 'cotizacion_materiales', 'modificacion_cotizacion', 'analisis_costos', 'envio_cotizacion') then status
    else 'recepcion_informacion' end
  where pipeline = 'Garantías';
update public.tickets set pipeline = 'Cotizaciones Kafer', status = case
    when status = 'new' then 'solicitud_cotizacion'
    when status = 'waiting' then 'vendedor_asignado'
    when status = 'progress' then 'cotizacion_realizada'
    when status = 'closed' then 'cotizacion_enviada'
    when status in ('solicitud_cotizacion', 'vendedor_asignado', 'cotizacion_realizada', 'cotizacion_enviada') then status
    else 'solicitud_cotizacion' end
  where pipeline = 'Instalaciones';


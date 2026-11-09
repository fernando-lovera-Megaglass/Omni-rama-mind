// Property catalog: every property that can be added as a table column, grouped
// the way the column editor shows them. Each item: [key, label, type, options].
// Types: text, number, currency, percent, date, datetime, enum, bool, user, email, phone, url, id.

const OWNER_OPTS = ['Fernando L.', 'Sofía R.', 'Sin asignar'];
const YESNO = ['Sí', 'No'];
const SOURCES = ['Búsqueda orgánica', 'Búsqueda de pago', 'Redes sociales', 'Referencias', 'Tráfico directo', 'Marketing por correo', 'Redes sociales de pago', 'Otras campañas', 'Fuentes sin conexión'];
const LIFECYCLE = ['Suscriptor', 'Lead', 'Lead calificado por marketing', 'Lead calificado por ventas', 'Oportunidad', 'Cliente', 'Evangelista', 'Otro'];
const LEAD_STATUS = ['Nuevo', 'Abierto', 'En progreso', 'Negocio abierto', 'No calificado', 'Intento de contacto', 'Conectado', 'Momento inoportuno'];
const COUNTRIES = ['España', 'México', 'Argentina', 'Colombia', 'Chile', 'Perú', 'Portugal'];
const REGIONS = ['Madrid', 'Cataluña', 'Comunidad Valenciana', 'Andalucía', 'País Vasco', 'Galicia'];
const INDUSTRIES = ['Construcción', 'Arquitectura', 'Reformas', 'Inmobiliaria', 'Decoración', 'Fabricación de vidrio'];
const TIMEZONES = ['Europa/Madrid', 'Europa/Lisboa', 'América/Ciudad_de_México', 'América/Bogotá', 'América/Buenos_Aires'];
const LANGS = ['Español', 'Inglés', 'Portugués', 'Catalán'];
const PERSONAS = ['Persona 1: Gerente de obra', 'Persona 2: Arquitecta', 'Persona 3: Propietario particular', 'Persona 4: Compras'];
const BUYING_ROLES = ['Responsable de la decisión', 'Influencer', 'Bloqueador', 'Campeón', 'Responsable del presupuesto', 'Usuario final'];
const FORECAST = ['Pipeline', 'Mejor caso', 'Compromiso', 'Omitir', 'Cerrado ganado'];
const LOST_REASONS = ['Precio', 'Competencia', 'Sin presupuesto', 'Sin respuesta', 'Plazo', 'Otro'];
const WON_REASONS = ['Precio', 'Relación', 'Calidad del producto', 'Plazo de entrega', 'Recomendación'];
const DEAL_TYPES = ['Nuevo negocio', 'Negocio existente'];
const CURRENCIES = ['EUR', 'USD', 'MXN'];
const TICKET_CATEGORIES = ['Problema con el producto', 'Solicitud de función', 'Facturación', 'Consulta general'];
const CHANNELS = ['Correo', 'Formulario', 'Chat', 'Teléfono', 'WhatsApp'];

const g = (title, items) => ({ title, items });

export const PROPERTIES = {
  contacts: [
    g('Información del contacto', [
      ['first', 'Nombre', 'text'],
      ['last', 'Apellidos', 'text'],
      ['name', 'Nombre completo', 'text'],
      ['email', 'Correo', 'email'],
      ['alt_email', 'Correo Alternativo', 'email'],
      ['phone', 'Número de teléfono', 'phone'],
      ['mobilephone', 'Número de móvil', 'phone'],
      ['alt_phone', 'Numero de Telefono alternativo', 'phone'],
      ['customer_type', 'Tipo de Cliente', 'enum', ['Instalador', 'Distribuidor', 'Arquitecto', 'Constructor', 'Particular']],
      ['sales_rep', 'Independent Sales Rep', 'enum', ['Fernando L.', 'Sofía R.', 'Agente externo 1', 'Agente externo 2']],
      ['lead_stage', 'Etapa del lead', 'enum', ['Nuevo', 'Intentando contactar', 'Conectado', 'Calificado']],
      ['lead_type', 'Tipo de lead', 'enum', ['Nueva empresa', 'Venta adicional', 'Venta cruzada', 'Renovación']],
      ['fax', 'Número de fax', 'phone'],
      ['jobTitle', 'Cargo', 'text'],
      ['hs_department', 'Departamento', 'enum', ['Dirección', 'Compras', 'Obra', 'Administración', 'Comercial', 'Técnico']],
      ['seniority', 'Antigüedad', 'enum', ['Junior', 'Intermedio', 'Senior', 'Dirección', 'Ejecutivo']],
      ['salutation', 'Salutación', 'enum', ['Sr.', 'Sra.', 'Dr.', 'Dra.']],
      ['owner', 'Propietario del contacto', 'user', OWNER_OPTS],
      ['hubspot_team', 'Equipo del propietario', 'enum', ['Ventas Norte', 'Ventas Sur', 'Soporte']],
      ['lifecycle', 'Etapa del ciclo de vida', 'enum', LIFECYCLE],
      ['status', 'Estado del lead', 'enum', LEAD_STATUS],
      ['hs_persona', 'Persona', 'enum', PERSONAS],
      ['hs_buying_role', 'Rol de compra', 'enum', BUYING_ROLES],
      ['hs_lead_status_date', 'Fecha del estado del lead', 'date'],
      ['company', 'Empresa principal', 'text'],
      ['associatedcompany', 'Nombre de la empresa', 'text'],
      ['industry', 'Sector', 'enum', INDUSTRIES],
      ['website', 'URL del sitio web', 'url'],
      ['address', 'Dirección', 'text'],
      ['city', 'Ciudad', 'text'],
      ['state', 'Estado/Región', 'enum', REGIONS],
      ['zip', 'Código postal', 'text'],
      ['country', 'País/Región', 'enum', COUNTRIES],
      ['hs_timezone', 'Zona horaria', 'enum', TIMEZONES],
      ['hs_language', 'Idioma preferido', 'enum', LANGS],
      ['date_of_birth', 'Fecha de nacimiento', 'date'],
      ['gender', 'Sexo', 'enum', ['Mujer', 'Hombre', 'Prefiere no decirlo']],
      ['marital_status', 'Estado civil', 'enum', ['Soltero/a', 'Casado/a', 'Otro']],
      ['numemployees', 'Número de empleados', 'enum', ['1-5', '5-25', '25-50', '50-100', '100-500']],
      ['annualrevenue', 'Ingresos anuales', 'currency'],
      ['message', 'Mensaje', 'text'],
      ['hs_content_membership_status', 'Estado de membresía', 'enum', ['Activo', 'Inactivo', 'Sin membresía']],
      ['created', 'Fecha de creación', 'datetime'],
      ['lastmodifieddate', 'Fecha de última modificación', 'datetime'],
      ['hs_object_id', 'ID del registro', 'id'],
      ['hs_object_source_label', 'Fuente del registro', 'enum', ['CRM UI', 'Importación', 'Formulario', 'API', 'Chat', 'Integración']],
      ['hs_created_by_user_id', 'Creado por el usuario', 'user', OWNER_OPTS],
      ['hs_updated_by_user_id', 'Actualizado por el usuario', 'user', OWNER_OPTS],
      ['hs_merged_object_ids', 'IDs de registros fusionados', 'text'],
    ]),
    g('Información de la actividad de ventas', [
      ['lastActivity', 'Fecha de la última actividad', 'datetime'],
      ['notes_last_contacted', 'Fecha del último contacto', 'datetime'],
      ['notes_next_activity_date', 'Fecha de la próxima actividad', 'date'],
      ['num_contacted_notes', 'Número de veces contactado', 'number'],
      ['num_notes', 'Número de actividades de ventas', 'number'],
      ['engagements_last_meeting_booked', 'Fecha de la última reunión reservada', 'datetime'],
      ['engagements_last_meeting_booked_source', 'Fuente de la última reunión reservada', 'enum', ['Enlace de reunión', 'Manual', 'Chat']],
      ['hs_last_sales_activity_timestamp', 'Última fecha de actividad de ventas', 'datetime'],
      ['hs_sales_email_last_replied', 'Último correo de ventas respondido', 'datetime'],
      ['hs_sales_email_last_opened', 'Último correo de ventas abierto', 'datetime'],
      ['hs_sales_email_last_clicked', 'Último correo de ventas con clic', 'datetime'],
      ['hs_sequences_is_enrolled', 'Actualmente en secuencia', 'bool', YESNO],
      ['hs_sequences_enrolled_count', 'Número de secuencias inscritas', 'number'],
      ['hs_calls_count', 'Número de llamadas', 'number'],
      ['hs_meetings_count', 'Número de reuniones', 'number'],
      ['hs_tasks_count', 'Número de tareas abiertas', 'number'],
      ['num_associated_deals', 'Número de negocios asociados', 'number'],
      ['total_revenue', 'Ingresos totales', 'currency'],
      ['recent_deal_amount', 'Importe del negocio reciente', 'currency'],
      ['recent_deal_close_date', 'Fecha de cierre del negocio reciente', 'date'],
      ['first_deal_created_date', 'Fecha de creación del primer negocio', 'date'],
      ['closedate', 'Fecha de cierre', 'date'],
      ['days_to_close', 'Días para cerrar', 'number'],
    ]),
    g('Información del ciclo de vida', [
      ['hs_lifecyclestage_subscriber_date', 'Conversión en suscriptor', 'datetime'],
      ['hs_lifecyclestage_lead_date', 'Conversión en lead', 'datetime'],
      ['hs_lifecyclestage_marketingqualifiedlead_date', 'Conversión en lead calificado por marketing', 'datetime'],
      ['hs_lifecyclestage_salesqualifiedlead_date', 'Conversión en lead calificado por ventas', 'datetime'],
      ['hs_lifecyclestage_opportunity_date', 'Conversión en oportunidad', 'datetime'],
      ['hs_lifecyclestage_customer_date', 'Conversión en cliente', 'datetime'],
      ['hs_lifecyclestage_evangelist_date', 'Conversión en evangelista', 'datetime'],
      ['hs_date_entered_lead', 'Fecha de entrada en "Lead"', 'datetime'],
      ['hs_time_in_lead', 'Tiempo en "Lead" (días)', 'number'],
      ['hs_time_to_first_engagement', 'Tiempo hasta la primera interacción (días)', 'number'],
      ['hs_time_between_contact_creation_and_deal_creation', 'Tiempo entre creación de contacto y negocio (días)', 'number'],
      ['hs_time_between_contact_creation_and_deal_close', 'Tiempo entre creación de contacto y cierre (días)', 'number'],
    ]),
    g('Puntuación y cualificación', [
      ['hubspotscore', 'Puntuación de HubSpot', 'number'],
      ['hs_predictivecontactscore_v2', 'Puntuación de probabilidad de cierre', 'number'],
      ['hs_predictivescoringtier', 'Nivel de probabilidad de cierre', 'enum', ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4']],
      ['hs_likelihood_to_close', 'Probabilidad de cierre', 'percent'],
      ['hs_is_unworked', 'Sin trabajar', 'bool', YESNO],
      ['hs_ideal_customer_profile', 'Nivel de perfil de cliente ideal', 'enum', ['Nivel 1', 'Nivel 2', 'Nivel 3']],
    ]),
    g('Análisis web', [
      ['source', 'Fuente original', 'enum', SOURCES],
      ['hs_analytics_source_data_1', 'Datos adicionales de la fuente original 1', 'text'],
      ['hs_analytics_source_data_2', 'Datos adicionales de la fuente original 2', 'text'],
      ['hs_latest_source', 'Fuente más reciente', 'enum', SOURCES],
      ['hs_latest_source_data_1', 'Datos adicionales de la fuente más reciente 1', 'text'],
      ['hs_latest_source_data_2', 'Datos adicionales de la fuente más reciente 2', 'text'],
      ['hs_latest_source_timestamp', 'Fecha de la fuente más reciente', 'datetime'],
      ['hs_analytics_num_visits', 'Número de sesiones', 'number'],
      ['hs_analytics_num_page_views', 'Número de páginas vistas', 'number'],
      ['hs_analytics_num_event_completions', 'Número de eventos completados', 'number'],
      ['hs_analytics_average_page_views', 'Promedio de páginas vistas por sesión', 'number'],
      ['hs_analytics_first_visit_timestamp', 'Fecha de la primera visita', 'datetime'],
      ['hs_analytics_last_visit_timestamp', 'Fecha de la última visita', 'datetime'],
      ['hs_analytics_first_timestamp', 'Fecha de la primera actividad', 'datetime'],
      ['hs_analytics_last_timestamp', 'Fecha de la última actividad web', 'datetime'],
      ['hs_analytics_first_url', 'URL de la primera página vista', 'url'],
      ['hs_analytics_last_url', 'URL de la última página vista', 'url'],
      ['hs_analytics_first_referrer', 'URL de referencia de la primera visita', 'url'],
      ['hs_analytics_last_referrer', 'URL de referencia de la última visita', 'url'],
      ['hs_analytics_first_touch_converting_campaign', 'Campaña de conversión de primer contacto', 'text'],
      ['hs_analytics_last_touch_converting_campaign', 'Campaña de conversión de último contacto', 'text'],
      ['ip', 'Dirección IP', 'text'],
      ['hs_ip_timezone', 'Zona horaria según IP', 'enum', TIMEZONES],
      ['ip_city', 'Ciudad según IP', 'text'],
      ['ip_state', 'Estado/Región según IP', 'enum', REGIONS],
      ['ip_country', 'País según IP', 'enum', COUNTRIES],
      ['hs_google_click_id', 'ID de clic de Google Ads', 'text'],
      ['hs_facebook_click_id', 'ID de clic de Facebook', 'text'],
    ]),
    g('Información de la conversión', [
      ['first_conversion_event_name', 'Primera conversión', 'enum', ['Formulario de contacto', 'Solicitar presupuesto', 'Descarga de catálogo', 'Suscripción al boletín']],
      ['first_conversion_date', 'Fecha de la primera conversión', 'datetime'],
      ['recent_conversion_event_name', 'Conversión reciente', 'enum', ['Formulario de contacto', 'Solicitar presupuesto', 'Descarga de catálogo', 'Suscripción al boletín']],
      ['recent_conversion_date', 'Fecha de la conversión reciente', 'datetime'],
      ['num_conversion_events', 'Número de envíos de formularios', 'number'],
      ['num_unique_conversion_events', 'Número de formularios únicos enviados', 'number'],
      ['hs_first_outreach_date', 'Fecha del primer contacto saliente', 'datetime'],
    ]),
    g('Información del correo electrónico', [
      ['hs_email_delivered', 'Correos de marketing entregados', 'number'],
      ['hs_email_open', 'Correos de marketing abiertos', 'number'],
      ['hs_email_click', 'Correos de marketing con clics', 'number'],
      ['hs_email_bounce', 'Correos de marketing rebotados', 'number'],
      ['hs_email_replied', 'Correos de marketing respondidos', 'number'],
      ['hs_email_last_send_date', 'Fecha del último correo de marketing enviado', 'datetime'],
      ['hs_email_last_open_date', 'Fecha del último correo de marketing abierto', 'datetime'],
      ['hs_email_last_click_date', 'Fecha del último correo de marketing con clic', 'datetime'],
      ['hs_email_first_send_date', 'Fecha del primer correo de marketing enviado', 'datetime'],
      ['hs_email_last_email_name', 'Nombre del último correo de marketing', 'enum', ['Novedades de otoño', 'Guía de ventanas', 'Boletín mensual', 'Oferta de primavera']],
      ['hs_email_optout', 'Se dio de baja de todos los correos', 'bool', YESNO],
      ['hs_email_bad_address', 'Correo con rebote permanente', 'bool', YESNO],
      ['hs_email_quarantined', 'Correo en cuarentena', 'bool', YESNO],
      ['hs_email_is_ineligible', 'Correo no apto para envíos', 'bool', YESNO],
      ['hs_emailconfirmationstatus', 'Estado de confirmación del correo', 'enum', ['Confirmado', 'Pendiente', 'No confirmado']],
      ['hs_email_domain', 'Dominio del correo', 'text'],
      ['currentlyinworkflow', 'Actualmente en workflow', 'bool', YESNO],
      ['hs_marketable_status', 'Estado de contacto de marketing', 'enum', ['Contacto de marketing', 'Contacto que no es de marketing']],
      ['hs_marketable_reason_type', 'Motivo del estado de marketing', 'enum', ['Formulario', 'Importación', 'Manual', 'Workflow']],
      ['hs_marketable_until_renewal', 'De marketing hasta la próxima renovación', 'bool', YESNO],
    ]),
    g('Interacciones en redes sociales', [
      ['twitterhandle', 'Nombre de usuario de Twitter', 'text'],
      ['twitterbio', 'Biografía de Twitter', 'text'],
      ['followercount', 'Seguidores', 'number'],
      ['twitterprofilephoto', 'Foto de perfil de Twitter', 'url'],
      ['hs_twitter_clicks', 'Clics desde Twitter', 'number'],
      ['hs_facebook_clicks', 'Clics desde Facebook', 'number'],
      ['hs_linkedin_clicks', 'Clics desde LinkedIn', 'number'],
      ['hs_linkedinbio', 'Biografía de LinkedIn', 'text'],
      ['hs_social_num_broadcast_clicks', 'Clics en publicaciones sociales', 'number'],
      ['hs_social_last_engagement', 'Última interacción social', 'datetime'],
    ]),
    g('Información del portal del cliente y conversaciones', [
      ['hs_conversations_visitor_email', 'Correo del visitante de conversaciones', 'email'],
      ['hs_last_message_received', 'Último mensaje recibido', 'datetime'],
      ['hs_last_message_sent', 'Último mensaje enviado', 'datetime'],
      ['hs_whatsapp_phone_number', 'Número de WhatsApp', 'phone'],
      ['hs_sa_first_engagement_date', 'Primera interacción de servicio', 'datetime'],
      ['hs_content_membership_registered_at', 'Fecha de registro en el portal', 'datetime'],
    ]),
  ],

  deals: [
    g('Información del negocio', [
      ['name', 'Nombre del negocio', 'text'],
      ['amount', 'Importe', 'currency'],
      ['deal_currency_code', 'Moneda', 'enum', CURRENCIES],
      ['amount_in_home_currency', 'Importe en moneda de la empresa', 'currency'],
      ['pipeline', 'Pipeline', 'enum', ['Pipeline de ventas', 'Pipeline de renovaciones']],
      ['stage', 'Etapa del negocio', 'stage'],
      ['closeDate', 'Fecha de cierre', 'date'],
      ['owner', 'Propietario del negocio', 'user', OWNER_OPTS],
      ['hubspot_team', 'Equipo del propietario', 'enum', ['Ventas Norte', 'Ventas Sur']],
      ['type', 'Tipo de negocio', 'enum', DEAL_TYPES],
      ['priority', 'Prioridad', 'priority'],
      ['description', 'Descripción del negocio', 'text'],
      ['hs_next_step', 'Siguiente paso', 'enum', ['Enviar propuesta', 'Llamar al cliente', 'Visita técnica', 'Esperar firma', 'Reunión de cierre']],
      ['closed_lost_reason', 'Motivo de pérdida', 'enum', LOST_REASONS],
      ['closed_won_reason', 'Motivo de ganancia', 'enum', WON_REASONS],
      ['hs_deal_stage_probability', 'Probabilidad del negocio', 'percent'],
      ['hs_deal_score', 'Puntuación del negocio', 'number'],
      ['hs_campaign', 'Campaña', 'enum', ['Promoción otoño', 'Guía de ventanas', 'Feria Construmat', 'Sin campaña']],
      ['hs_tag_ids', 'Etiquetas del negocio', 'enum', ['Urgente', 'Gran cuenta', 'Reforma', 'Obra nueva']],
      ['company', 'Empresa asociada', 'text'],
      ['num_associated_contacts', 'Número de contactos asociados', 'number'],
      ['hs_num_of_associated_line_items', 'Número de líneas de pedido', 'number'],
      ['created', 'Fecha de creación', 'datetime'],
      ['hs_lastmodifieddate', 'Fecha de última modificación', 'datetime'],
      ['hs_object_id', 'ID del registro', 'id'],
      ['hs_object_source_label', 'Fuente del registro', 'enum', ['CRM UI', 'Importación', 'API', 'Workflow']],
      ['hs_created_by_user_id', 'Creado por el usuario', 'user', OWNER_OPTS],
      ['hs_updated_by_user_id', 'Actualizado por el usuario', 'user', OWNER_OPTS],
      ['hs_is_closed', 'Está cerrado', 'bool', YESNO],
      ['hs_is_closed_won', 'Está cerrado ganado', 'bool', YESNO],
      ['hs_closed_won_date', 'Fecha de cierre ganado', 'datetime'],
      ['hs_closed_lost_date', 'Fecha de cierre perdido', 'datetime'],
      ['days_to_close', 'Días para cerrar', 'number'],
      ['hs_deal_collaborators', 'Colaboradores del negocio', 'user', OWNER_OPTS],
    ]),
    g('Información de la actividad del negocio', [
      ['lastActivity', 'Fecha de la última actividad', 'datetime'],
      ['notes_last_contacted', 'Fecha del último contacto', 'datetime'],
      ['notes_next_activity_date', 'Fecha de la próxima actividad', 'date'],
      ['num_contacted_notes', 'Número de veces contactado', 'number'],
      ['num_notes', 'Número de actividades de ventas', 'number'],
      ['engagements_last_meeting_booked', 'Fecha de la última reunión reservada', 'datetime'],
      ['hs_sales_email_last_replied', 'Último correo de ventas respondido', 'datetime'],
      ['hs_latest_meeting_activity', 'Última actividad de reunión', 'datetime'],
      ['hs_calls_count', 'Número de llamadas', 'number'],
      ['hs_open_tasks_count', 'Número de tareas abiertas', 'number'],
    ]),
    g('Pronóstico e ingresos', [
      ['hs_forecast_amount', 'Importe del pronóstico', 'currency'],
      ['hs_forecast_category', 'Categoría de pronóstico', 'enum', FORECAST],
      ['hs_forecast_probability', 'Probabilidad del pronóstico', 'percent'],
      ['hs_projected_amount', 'Importe ponderado', 'currency'],
      ['hs_projected_amount_in_home_currency', 'Importe ponderado en moneda de la empresa', 'currency'],
      ['hs_manual_forecast_category', 'Categoría de pronóstico manual', 'enum', FORECAST],
      ['hs_arr', 'Ingresos recurrentes anuales', 'currency'],
      ['hs_mrr', 'Ingresos recurrentes mensuales', 'currency'],
      ['hs_acv', 'Valor anual del contrato', 'currency'],
      ['hs_tcv', 'Valor total del contrato', 'currency'],
      ['hs_exchange_rate', 'Tipo de cambio', 'number'],
      ['hs_likelihood_to_close', 'Probabilidad de cierre (IA)', 'percent'],
    ]),
    g('Etapas del pipeline', [
      ['hs_date_entered_current_stage', 'Fecha de entrada en la etapa actual', 'datetime'],
      ['hs_time_in_current_stage', 'Tiempo en la etapa actual (días)', 'number'],
      ['hs_date_entered_appointment', 'Fecha de entrada en "Cita programada"', 'datetime'],
      ['hs_time_in_appointment', 'Tiempo en "Cita programada" (días)', 'number'],
      ['hs_date_entered_qualified', 'Fecha de entrada en "Calificado para comprar"', 'datetime'],
      ['hs_time_in_qualified', 'Tiempo en "Calificado para comprar" (días)', 'number'],
      ['hs_date_entered_presentation', 'Fecha de entrada en "Presentación programada"', 'datetime'],
      ['hs_time_in_presentation', 'Tiempo en "Presentación programada" (días)', 'number'],
      ['hs_date_entered_decision', 'Fecha de entrada en "Decisión pendiente"', 'datetime'],
      ['hs_time_in_decision', 'Tiempo en "Decisión pendiente" (días)', 'number'],
      ['hs_date_entered_contract', 'Fecha de entrada en "Contrato enviado"', 'datetime'],
      ['hs_time_in_contract', 'Tiempo en "Contrato enviado" (días)', 'number'],
      ['hs_date_entered_won', 'Fecha de entrada en "Cerrado ganado"', 'datetime'],
      ['hs_date_entered_lost', 'Fecha de entrada en "Cerrado perdido"', 'datetime'],
      ['hs_v2_cumulative_time_in_stage', 'Tiempo acumulado en etapas (días)', 'number'],
      ['hs_num_times_stage_changed', 'Número de cambios de etapa', 'number'],
    ]),
    g('Información de análisis', [
      ['hs_analytics_source', 'Fuente original', 'enum', SOURCES],
      ['hs_analytics_source_data_1', 'Datos adicionales de la fuente original 1', 'text'],
      ['hs_analytics_source_data_2', 'Datos adicionales de la fuente original 2', 'text'],
      ['hs_analytics_latest_source', 'Fuente más reciente', 'enum', SOURCES],
      ['hs_analytics_latest_source_timestamp', 'Fecha de la fuente más reciente', 'datetime'],
      ['hs_analytics_latest_source_contact', 'Fuente más reciente (contacto)', 'enum', SOURCES],
      ['hs_analytics_latest_source_company', 'Fuente más reciente (empresa)', 'enum', SOURCES],
    ]),
    g('Pagos y cotizaciones', [
      ['hs_total_payments', 'Pagos totales', 'currency'],
      ['hs_last_payment_date', 'Fecha del último pago', 'date'],
      ['hs_num_quotes', 'Número de cotizaciones', 'number'],
      ['hs_latest_quote_status', 'Estado de la última cotización', 'enum', ['Borrador', 'Pendiente de aprobación', 'Publicada', 'Firmada', 'Caducada']],
      ['hs_invoice_status', 'Estado de la factura', 'enum', ['Sin factura', 'Borrador', 'Enviada', 'Pagada', 'Vencida']],
    ]),
  ],

  companies: [
    g('Información de la empresa', [
      ['name', 'Nombre de la empresa', 'text'],
      ['domain', 'Nombre de dominio de la empresa', 'url'],
      ['website', 'URL del sitio web', 'url'],
      ['phone', 'Número de teléfono', 'phone'],
      ['owner', 'Propietario de la empresa', 'user', OWNER_OPTS],
      ['industry', 'Sector', 'enum', INDUSTRIES],
      ['type', 'Tipo', 'enum', ['Cliente potencial', 'Socio', 'Revendedor', 'Proveedor', 'Otro']],
      ['description', 'Descripción', 'text'],
      ['address', 'Dirección', 'text'],
      ['city', 'Ciudad', 'text'],
      ['state', 'Estado/Región', 'enum', REGIONS],
      ['zip', 'Código postal', 'text'],
      ['country', 'País/Región', 'enum', COUNTRIES],
      ['employees', 'Número de empleados', 'number'],
      ['revenue', 'Ingresos anuales', 'currency'],
      ['founded_year', 'Año de fundación', 'number'],
      ['lifecycle', 'Etapa del ciclo de vida', 'enum', LIFECYCLE],
      ['hs_lead_status', 'Estado del lead', 'enum', LEAD_STATUS],
      ['is_public', 'Cotiza en bolsa', 'bool', YESNO],
      ['linkedin_company_page', 'Página de LinkedIn', 'url'],
      ['twitterhandle', 'Nombre de usuario de Twitter', 'text'],
      ['hs_parent_company_id', 'Empresa matriz', 'text'],
      ['hs_num_child_companies', 'Número de empresas secundarias', 'number'],
      ['created', 'Fecha de creación', 'datetime'],
      ['hs_lastmodifieddate', 'Fecha de última modificación', 'datetime'],
      ['hs_object_id', 'ID del registro', 'id'],
    ]),
    g('Actividad y ventas', [
      ['lastActivity', 'Fecha de la última actividad', 'datetime'],
      ['notes_last_contacted', 'Fecha del último contacto', 'datetime'],
      ['notes_next_activity_date', 'Fecha de la próxima actividad', 'date'],
      ['num_contacted_notes', 'Número de veces contactado', 'number'],
      ['num_associated_contacts', 'Número de contactos asociados', 'number'],
      ['num_associated_deals', 'Número de negocios asociados', 'number'],
      ['total_revenue', 'Ingresos totales', 'currency'],
      ['recent_deal_amount', 'Importe del negocio reciente', 'currency'],
      ['recent_deal_close_date', 'Fecha de cierre del negocio reciente', 'date'],
      ['hs_analytics_source', 'Fuente original', 'enum', SOURCES],
      ['hs_analytics_num_visits', 'Número de sesiones', 'number'],
      ['hs_analytics_num_page_views', 'Número de páginas vistas', 'number'],
    ]),
  ],

  tickets: [
    g('Información del ticket', [
      ['name', 'Nombre del ticket', 'text'],
      ['description', 'Descripción del ticket', 'text'],
      ['pipeline', 'Pipeline', 'enum', ['Pipeline de soporte']],
      ['status', 'Estado del ticket', 'status'],
      ['priority', 'Prioridad', 'priority'],
      ['owner', 'Propietario del ticket', 'user', OWNER_OPTS],
      ['source', 'Fuente', 'enum', CHANNELS],
      ['hs_ticket_category', 'Categoría', 'enum', TICKET_CATEGORIES],
      ['hs_resolution', 'Resolución', 'enum', ['Problema resuelto', 'Función solicitada', 'Sin acción', 'Duplicado']],
      ['created', 'Fecha de creación', 'datetime'],
      ['closed_date', 'Fecha de cierre', 'datetime'],
      ['hs_lastmodifieddate', 'Fecha de última modificación', 'datetime'],
      ['hs_object_id', 'ID del ticket', 'id'],
    ]),
    g('Tiempos y actividad', [
      ['lastActivity', 'Fecha de la última actividad', 'datetime'],
      ['time_to_first_agent_reply', 'Tiempo hasta la primera respuesta (horas)', 'number'],
      ['time_to_close', 'Tiempo hasta el cierre (horas)', 'number'],
      ['hs_last_message_from_visitor', 'Último mensaje del visitante', 'datetime'],
      ['hs_num_times_contacted', 'Número de veces contactado', 'number'],
      ['hs_nps_score', 'Puntuación de satisfacción', 'number'],
      ['hs_sla_status', 'Estado del SLA', 'enum', ['Dentro del SLA', 'En riesgo', 'Fuera del SLA']],
    ]),
  ],

  tasks: [
    g('Información de la tarea', [
      ['name', 'Título', 'text'],
      ['type', 'Tipo de tarea', 'enum', ['Llamada', 'Correo', 'Tarea']],
      ['status', 'Estado', 'status'],
      ['priority', 'Prioridad', 'priority'],
      ['owner', 'Asignada a', 'user', OWNER_OPTS],
      ['due', 'Fecha de vencimiento', 'datetime'],
      ['hs_task_reminders', 'Recordatorio', 'datetime'],
      ['hs_queue_membership_ids', 'Cola de tareas', 'enum', ['Seguimientos', 'Presupuestos', 'Sin cola']],
      ['hs_task_body', 'Notas', 'text'],
      ['created', 'Fecha de creación', 'datetime'],
      ['hs_lastmodifieddate', 'Fecha de última modificación', 'datetime'],
      ['hs_object_id', 'ID de la tarea', 'id'],
    ]),
  ],
};

// Custom properties created from Configuración › Propiedades live in localStorage and join the catalog.
const CUSTOM_KEY = (type) => `crm:customprops:${type}`;
export function customProperties(type) {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY(type))) || [];
  } catch {
    return [];
  }
}
export function saveCustomProperties(type, list) {
  localStorage.setItem(CUSTOM_KEY(type), JSON.stringify(list));
}
export function propertyGroups(type) {
  const base = PROPERTIES[type] || [];
  const custom = customProperties(type);
  if (!custom.length) return base;
  const byGroup = {};
  custom.forEach((p) => {
    const title = p.group || 'Propiedades personalizadas';
    (byGroup[title] = byGroup[title] || []).push([p.key, p.label, p.kind, p.options]);
  });
  const groups = base.map((g) => (byGroup[g.title] ? { title: g.title, items: [...g.items, ...byGroup[g.title]] } : g));
  Object.entries(byGroup).forEach(([title, items]) => {
    if (!base.some((g) => g.title === title)) groups.push({ title, items });
  });
  return groups;
}

export function propertyList(type) {
  return propertyGroups(type).flatMap((grp) => grp.items.map(([key, label, kind, options]) => ({ key, label, kind, options, group: grp.title })));
}

export function propertyMap(type) {
  return Object.fromEntries(propertyList(type).map((p) => [p.key, p]));
}

// Record page layout: which cards sit in each column, in which sections and tabs.
// Shared by the record page (renders it) and the layout editor (edits it).

const TYPE_META = {
  contacts: { s: 'Contacto', p: 'Contactos' },
  companies: { s: 'Empresa', p: 'Empresas' },
  deals: { s: 'Negocio', p: 'Negocios' },
  tickets: { s: 'Ticket', p: 'Tickets' },
  tasks: { s: 'Tarea', p: 'Tareas' },
};

const ASSOC_KINDS = {
  contacts: ['companies', 'deals', 'tickets', 'tasks'],
  companies: ['contacts', 'deals', 'tickets'],
  deals: ['contacts', 'companies'],
  tickets: ['contacts'],
  tasks: ['contacts'],
};

export function cardCatalog(type) {
  const m = TYPE_META[type] || TYPE_META.contacts;
  const cards = {
    about: { label: `Acerca de este objeto ${m.s}`, desc: `Acerca de este objeto ${m.s.toLowerCase()} - 1`, zone: 'left' },
    insights: { label: `Información de ${m.p.toLowerCase()}`, desc: 'Record insights (valor predeterminado)', zone: 'middle' },
    recent: { label: 'Interacciones recientes', desc: 'Recent interactions (valor predeterminado)', zone: 'middle' },
    highlights: { label: 'Aspectos destacados de los datos', desc: 'Data highlights (valor predeterminado)', zone: 'middle' },
    sentiment: { label: 'Sentimiento', desc: 'Sentiment (valor predeterminado)', zone: 'middle' },
    challenges: { label: 'Desafíos', desc: 'Challenges (valor predeterminado)', zone: 'middle' },
    positive: { label: 'Comentarios positivos', desc: 'Positive feedback (valor predeterminado)', zone: 'middle' },
    missing: { label: 'Datos faltantes', desc: 'Missing data (valor predeterminado)', zone: 'middle' },
    duplicates: { label: 'Registros duplicados', desc: 'Duplicate records (valor predeterminado)', zone: 'middle' },
    summary: { label: 'Resumen de registros', desc: 'Record summary (valor predeterminado)', zone: 'right' },
    attachments: { label: 'Archivos adjuntos', desc: 'Archivos adjuntos (valor predeterminado)', zone: 'right' },
    playbooks: { label: 'Guías prácticas', desc: 'Guías prácticas (valor predeterminado)', zone: 'right' },
  };
  if (type === 'contacts') cards.lead = { label: 'Seguimiento de etapa de lead', desc: 'Seguimiento de etapa de lead (valor predeterminado)', zone: 'right' };
  (ASSOC_KINDS[type] || []).forEach((k) => {
    const km = TYPE_META[k];
    cards[`assoc-${k}`] = { label: km.p, desc: `${km.p} Tarjeta de asociación (valor predeterminado)`, zone: 'right', assoc: k };
  });
  // Extra cards available to team views (as in the original editor).
  cards.collaborators = { label: 'Colaboradores', desc: 'Colaboradores (valor predeterminado)', zone: 'left' };
  if (type === 'deals') cards.dealscore = { label: 'Calificación de negocios', desc: 'Calificación de negocios (valor predeterminado)', zone: 'middle' };
  const extraAssoc = type === 'deals' ? ['Cotizaciones', 'Tickets', 'Enlaces de pago', 'Pagos', 'Negocios', 'Facturas', 'Suscripciones', 'Pedidos', 'Carritos', 'Contratos', 'Notas de crédito'] : type === 'companies' ? ['Cotizaciones', 'Facturas', 'Suscripciones', 'Pedidos', 'Contratos'] : type === 'contacts' ? ['Cotizaciones', 'Pagos', 'Suscripciones', 'Pedidos', 'Carritos'] : ['Negocios', 'Empresas'];
  extraAssoc.forEach((label, i) => { cards[`x-${i}-${label.toLowerCase().replace(/[^a-z]+/g, '')}`] = { label, desc: `${label} Tarjeta de asociación (valor predeterminado)`, zone: 'right', extra: true }; });
  cards.gdrive = { label: 'Archivos adjuntos de Google Drive', desc: 'Google Drive Attachments (valor predeterminado)', zone: 'right' };
  return cards;
}

// Layout of a brand-new team view: the original starts with a slimmer page than the default view.
export function teamViewLayout(type, name) {
  const cards = cardCatalog(type);
  const right = (ASSOC_KINDS[type] || []).map((k) => `assoc-${k}`).concat(Object.keys(cards).filter((id) => cards[id].extra), ['gdrive']);
  return {
    name,
    teams: [],
    isDefault: false,
    left: ['about', 'collaborators'],
    tabs: [
      { id: 'overview', label: 'Información destacada', sections: [{ title: 'Vista general', cards: ['summary'] }, { title: 'Salud', cards: type === 'deals' ? ['dealscore'] : ['sentiment'] }] },
      { id: 'description', label: 'Información', fixed: true },
      { id: 'activity', label: 'Actividades', fixed: true },
    ],
    right,
  };
}
// ---------- Preview panel ("Vista previa" sidebar on the lists) ----------
export const PREVIEW_PROPS = {
  contacts: ['mobilephone', 'phone', 'email', 'status', 'owner', 'company', 'lifecycle', 'city', 'jobTitle', 'source'],
  companies: ['domain', 'phone', 'owner', 'industry', 'city', 'lifecycle', 'employees', 'revenue'],
  deals: ['amount', 'stage', 'pipeline', 'closeDate', 'owner', 'company', 'priority', 'type', 'created'],
  tickets: ['status', 'priority', 'owner', 'contact', 'source', 'pipeline', 'created'],
  tasks: ['status', 'due', 'type', 'priority', 'owner', 'contact', 'created'],
};
export function previewCatalog(type) {
  const m = TYPE_META[type] || TYPE_META.contacts;
  const cards = {
    about: { label: `Acerca de este objeto ${m.s}`, desc: 'Propiedades del registro (valor predeterminado)', zone: 'right', props: true },
    activity: { label: 'Actividad reciente', desc: 'Última actividad y próximos pasos (valor predeterminado)', zone: 'right' },
    summary: { label: 'Resumen de registros', desc: 'Resumen generado automáticamente', zone: 'right' },
    attachments: { label: 'Archivos adjuntos', desc: 'Archivos adjuntos (valor predeterminado)', zone: 'right' },
    tasks: { label: 'Tareas', desc: 'Tareas pendientes del registro', zone: 'right' },
  };
  (ASSOC_KINDS[type] || []).forEach((k) => { const km = TYPE_META[k]; cards[`assoc-${k}`] = { label: km.p, desc: `${km.p} asociados (valor predeterminado)`, zone: 'right', assoc: k }; });
  return cards;
}
export function defaultPreview(type, name = 'Vista predeterminada') {
  return { name, teams: [], isDefault: name === 'Vista predeterminada', props: [...(PREVIEW_PROPS[type] || PREVIEW_PROPS.contacts)], left: [], tabs: [], right: ['about', ...(ASSOC_KINDS[type] || []).slice(0, 2).map((k) => `assoc-${k}`), 'activity'] };
}
export const PREVIEW_KEY = (type, name) => `crm:${type}:preview:${name || 'default'}`;
export function loadPreview(type, name) {
  try {
    const saved = JSON.parse(localStorage.getItem(PREVIEW_KEY(type, name)));
    if (saved && Array.isArray(saved.right) && Array.isArray(saved.props)) return saved;
  } catch {
    /* ignore */
  }
  return defaultPreview(type, name || 'Vista predeterminada');
}
export function savePreview(type, name, layout) {
  localStorage.setItem(PREVIEW_KEY(type, name), JSON.stringify(layout));
}

export const VIEW_KEY = (type, name) => `crm:${type}:layout:${name}`;
export function loadViewLayout(type, name) {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY(type, name)));
    if (saved && Array.isArray(saved.tabs)) return saved;
  } catch {
    /* ignore */
  }
  return teamViewLayout(type, name);
}
export function saveViewLayout(type, name, layout) {
  localStorage.setItem(VIEW_KEY(type, name), JSON.stringify(layout));
}

export function defaultLayout(type) {
  const right = ['summary'];
  if (type === 'contacts') right.push('lead');
  (ASSOC_KINDS[type] || []).forEach((k) => right.push(`assoc-${k}`));
  right.push('attachments', 'playbooks');
  return {
    name: 'Vista predeterminada',
    teams: [],
    isDefault: true,
    left: ['about'],
    tabs: [
      {
        id: 'overview',
        label: 'Información destacada',
        sections: [
          { title: 'Vista general', cards: ['insights', 'recent'] },
          { title: 'Salud', cards: ['sentiment', 'challenges', 'positive'] },
          { title: 'Calidad de los datos', cards: ['missing', 'duplicates'] },
        ],
      },
      { id: 'description', label: 'Descripción', fixed: true },
      { id: 'activity', label: 'Actividades', fixed: true },
      { id: 'advanced', label: 'Información avanzada', fixed: true },
    ],
    right,
  };
}

export const LAYOUT_KEY = (type) => `crm:${type}:layout`;

export function loadLayout(type) {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY(type)));
    if (saved && Array.isArray(saved.tabs) && Array.isArray(saved.right)) return saved;
  } catch {
    /* ignore */
  }
  return defaultLayout(type);
}

export function saveLayout(type, layout) {
  localStorage.setItem(LAYOUT_KEY(type), JSON.stringify(layout));
  // Shown as "Última actualización" of the default view in Configuración › Objetos.
  localStorage.setItem(`crm:${type}:layout-updated`, JSON.stringify(new Date().toISOString()));
}

export const TEAMS = ['Acristala', 'Gerentes', 'JFC cargo destino', 'Mercadotecnia', 'Proyectos', 'SACA', 'Sistemas', 'Ventas en el Extranjero'];
export { TYPE_META };

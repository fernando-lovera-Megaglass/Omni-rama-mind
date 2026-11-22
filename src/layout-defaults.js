// Record page layout: which cards sit in each column, in which sections and tabs.
// Shared by the record page (renders it) and the layout editor (edits it).

const TYPE_META = {
  contacts: { s: 'Contacto', p: 'Contactos' },
  companies: { s: 'Empresa', p: 'Empresas' },
  deals: { s: 'Negocio', p: 'Negocios' },
  tickets: { s: 'Ticket', p: 'Tickets' },
  tasks: { s: 'Tarea', p: 'Tareas' },
};

// Every record shows its tasks card (bulk «Crear tareas» and the task form tie tasks to any of the four objects).
const ASSOC_KINDS = {
  contacts: ['companies', 'deals', 'tickets', 'tasks'],
  companies: ['contacts', 'deals', 'tickets', 'tasks'],
  deals: ['contacts', 'companies', 'tasks'],
  tickets: ['contacts', 'companies', 'tasks'],
  tasks: ['contacts', 'companies', 'deals', 'tickets'],
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
  if (type === 'companies') {
    cards.parent = { label: 'Empresa matriz', desc: 'Empresa matriz (valor predeterminado)', zone: 'right' };
    cards.subsidiaries = { label: 'Empresas secundarias', desc: 'Empresas secundarias (valor predeterminado)', zone: 'right' };
  }
  (ASSOC_KINDS[type] || []).forEach((k) => {
    const km = TYPE_META[k];
    cards[`assoc-${k}`] = { label: km.p, desc: `${km.p} Tarjeta de asociación (valor predeterminado)`, zone: 'right', assoc: k };
  });
  // Extra cards available to team views (as in the original editor).
  cards.collaborators = { label: 'Colaboradores', desc: 'Colaboradores (valor predeterminado)', zone: 'left' };
  if (type === 'deals') cards.dealscore = { label: 'Calificación de negocios', desc: 'Calificación de negocios (valor predeterminado)', zone: 'middle' };
  // The deal's line items (deal_line_items), as added from the "Crear negocio" panel.
  if (type === 'deals') cards.lineitems = { label: 'Elementos de pedido', desc: 'Elementos de pedido del negocio (valor predeterminado)', zone: 'right' };
  // Document association cards stay unavailable until backed by persistent objects.
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
    about: { label: 'Datos Generales', desc: `Acerca de este objeto ${m.s.toLowerCase()} (valor predeterminado)`, zone: 'right', props: true },
    activity: { label: 'Actividades recientes', desc: `Actividades recientes - ${m.s} (valor predeterminado)`, zone: 'right' },
    upcoming: { label: 'Próximas actividades', desc: `Próximas actividades - ${m.s} (valor predeterminado)`, zone: 'right' },
    summary: { label: 'Resumen de registros', desc: 'Resumen generado automáticamente', zone: 'right' },
    attachments: { label: 'Archivos adjuntos', desc: 'Archivos adjuntos (valor predeterminado)', zone: 'right' },
    tasks: { label: 'Tareas', desc: 'Tareas pendientes del registro', zone: 'right' },
  };
  const assoc = [...(ASSOC_KINDS[type] || [])];
  if (type === 'deals' && !assoc.includes('tickets')) assoc.push('tickets');
  assoc.forEach((k) => { const km = TYPE_META[k]; cards[`assoc-${k}`] = { label: km.p, desc: `${km.p} Tarjeta de asociación (valor predeterminado)`, zone: 'right', assoc: k }; });
  return cards;
}
export function defaultPreview(type, name = 'Vista predeterminada') {
  // The preview panel keeps its three record cards; the tasks card stays available in its catalogue.
  const assoc = [...(ASSOC_KINDS[type] || [])].filter((k) => k !== 'tasks');
  if (type === 'deals' && !assoc.includes('tickets')) assoc.push('tickets');
  return { name, teams: [], isDefault: name === 'Vista predeterminada', props: [...(PREVIEW_PROPS[type] || PREVIEW_PROPS.contacts)], left: [], tabs: [], right: ['about', 'activity', 'upcoming', ...assoc.slice(0, 3).map((k) => `assoc-${k}`)] };
}
// ---------- persistence ----------
// Every layout (record page, preview panel, team views and their lists) is kept per user in Supabase through
// the interface-settings store of data.js (user_settings; account_settings for the shared team views) with a
// localStorage copy as the offline / signed-out fallback. data.js binds the store with bindLayoutSettings; until
// it does (or without a session) only localStorage is used.
let settings = null; // { live, get, set }
export function bindLayoutSettings(s) { settings = s; }
const live = () => Boolean(settings && settings.live && settings.live());
function readStored(key) {
  if (live()) { const v = settings.get(key); if (v !== null && v !== undefined) return v; }
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeStored(key, value, scope = 'user') {
  if (value === null || value === undefined) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
  if (live()) settings.set(key, value, { scope });
}
export const layoutsLive = () => live();

export const PREVIEW_KEY = (type, name) => `crm:${type}:preview:${name || 'default'}`;
export function loadPreview(type, name) {
  const saved = readStored(PREVIEW_KEY(type, name));
  if (saved && Array.isArray(saved.right) && Array.isArray(saved.props)) return saved;
  return defaultPreview(type, name || 'Vista predeterminada');
}
export function savePreview(type, name, layout) {
  writeStored(PREVIEW_KEY(type, name), layout, name ? 'global' : 'user');
  if (!name) writeStored(`crm:${type}:preview-updated`, new Date().toISOString());
}
export function resetPreview(type) {
  writeStored(PREVIEW_KEY(type, null), null);
  writeStored(`crm:${type}:preview-updated`, null);
}

export const VIEW_KEY = (type, name) => `crm:${type}:layout:${name}`;
export function loadViewLayout(type, name) {
  const saved = readStored(VIEW_KEY(type, name));
  if (saved && Array.isArray(saved.tabs)) return { ...saved, right: (saved.right || []).filter((id) => !id.startsWith('x-')) };
  return teamViewLayout(type, name);
}
// Team views are shared by the account (scope global).
export function saveViewLayout(type, name, layout) {
  writeStored(VIEW_KEY(type, name), layout, 'global');
}
export function deleteViewLayout(type, name) {
  writeStored(VIEW_KEY(type, name), null, 'global');
}
// The lists of team views shown in Configuración › Objetos (record page views and preview views).
export const VIEWS_LIST_KEY = (type, kind) => `crm:${type}:${kind === 'preview' ? 'previewviews' : 'recordviews'}`;
export function loadViewsList(type, kind, fallback = []) {
  const v = readStored(VIEWS_LIST_KEY(type, kind));
  return Array.isArray(v) ? v : fallback;
}
export function saveViewsList(type, kind, list) {
  writeStored(VIEWS_LIST_KEY(type, kind), list, 'global');
}
// The saved preview panel of the lists (null when the person never customised it: the list keeps its own fields).
export function loadSavedPreview(type, name) {
  const saved = readStored(PREVIEW_KEY(type, name));
  return saved && Array.isArray(saved.right) && Array.isArray(saved.props) ? saved : null;
}
// The «Acerca de» card properties of the record page ({ title, keys }): the same setting the record's
// «Personalizar» writes (crm:<type>:cardprops), so the layout editor's pencil and the record agree.
export const CARD_PROPS_KEY = (type) => `crm:${type}:cardprops`;
export function loadCardProps(type) {
  const v = readStored(CARD_PROPS_KEY(type));
  return v && Array.isArray(v.keys) ? v : null;
}
export function saveCardProps(type, card) {
  writeStored(CARD_PROPS_KEY(type), card);
}
// When the default view was last saved («Última actualización» in Configuración › Objetos).
export const layoutUpdatedAt = (type, kind = 'record') => { const v = readStored(kind === 'preview' ? `crm:${type}:preview-updated` : `crm:${type}:layout-updated`); return typeof v === 'string' ? v : null; };

export function defaultLayout(type) {
  const right = ['summary'];
  if (type === 'contacts') right.push('lead');
  if (type === 'companies') right.push('parent', 'subsidiaries');
  (ASSOC_KINDS[type] || []).forEach((k) => right.push(`assoc-${k}`));
  if (type === 'deals') right.push('lineitems');
  right.push('attachments', 'playbooks');
  return {
    name: 'Vista predeterminada',
    teams: [],
    isDefault: true,
    left: ['about'],
    tabs: [
      {
        id: 'overview',
        label: type === 'companies' ? 'Información' : 'Información destacada',
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

// A saved layout is used only when it is well formed (tabs, right and left lists); anything else falls back.
const validLayout = (saved) => Boolean(saved && Array.isArray(saved.tabs) && Array.isArray(saved.right));
export function loadLayout(type) {
  const saved = readStored(LAYOUT_KEY(type));
  if (validLayout(saved)) return { ...saved, right: saved.right.filter((id) => !id.startsWith('x-')), left: Array.isArray(saved.left) ? saved.left : ['about'] };
  return defaultLayout(type);
}

export function saveLayout(type, layout) {
  writeStored(LAYOUT_KEY(type), layout);
  // Shown as "Última actualización" of the default view in Configuración › Objetos.
  writeStored(`crm:${type}:layout-updated`, new Date().toISOString());
}
// Back to the built-in design (Configuración › Objetos › «Restablecer» and the editor's «Restablecer diseño»).
export function resetLayout(type) {
  writeStored(LAYOUT_KEY(type), null);
  writeStored(`crm:${type}:layout-updated`, null);
}

export const TEAMS = ['Acristala', 'Gerentes', 'JFC cargo destino', 'Mercadotecnia', 'Proyectos', 'SACA', 'Sistemas', 'Ventas en el Extranjero'];
export { TYPE_META };

// Standard (built-in) saved views of each object and the account-level default tabs.
// Labels must match the `views` of each list module; the filters live there.
export const STD_VIEWS = {
  contacts: [['all', 'Todos los contactos'], ['mine', 'Mis contactos'], ['unassigned', 'Contactos sin asignar'], ['recent', 'Creados este mes']],
  companies: [['all', 'Todas las empresas'], ['mine', 'Mis empresas'], ['customers', 'Clientes']],
  deals: [
    ['mine', 'Mis negocios'],
    ['won-month', 'Mis negocios ganados este mes'],
    ['assigned', 'Mis negocios recientemente asignados'],
    ['collab', 'Negocios en los que estoy colaborando'],
    ['new-month', 'Nuevos negocios este mes'],
    ['forecast', 'Previsión'],
    ['followups', 'Seguimientos sugeridos'],
    ['open', 'Negocios abiertos'],
    ['won', 'Ganados'],
    ['month', 'Cierre este mes'],
    ['all', 'Todos negocios'],
  ],
  tickets: [['all', 'Todos los tickets'], ['open', 'Tickets abiertos'], ['mine', 'Mis tickets'], ['high', 'Prioridad alta']],
  tasks: [['all', 'Todas las tareas'], ['today', 'Para hoy'], ['overdue', 'Atrasadas'], ['upcoming', 'Próximas'], ['done', 'Completadas']],
};
export const TYPE_LABELS = { contacts: 'Contactos', companies: 'Empresas', deals: 'Negocios', tickets: 'Tickets', tasks: 'Tareas' };
// Tabs a user sees the first time they open the object (before personalising their own).
const BUILTIN_DEFAULT_TABS = {
  contacts: ['std:all', 'std:mine', 'std:unassigned', 'std:recent'],
  companies: ['std:all', 'std:mine', 'std:customers'],
  deals: ['std:mine', 'std:all', 'std:collab'],
  tickets: ['std:all', 'std:open', 'std:mine', 'std:high'],
  tasks: ['std:all', 'std:today', 'std:overdue', 'std:upcoming', 'std:done'],
};
export const DEFAULT_TABS_KEY = (type) => `crm:${type}:defaulttabs`;
export const DELETED_VIEWS_KEY = (type) => `crm:${type}:deletedviews`;
export function defaultTabs(type) {
  try {
    const saved = JSON.parse(localStorage.getItem(DEFAULT_TABS_KEY(type)));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {
    /* ignore */
  }
  return [...(BUILTIN_DEFAULT_TABS[type] || [])];
}
export function saveDefaultTabs(type, ids) {
  localStorage.setItem(DEFAULT_TABS_KEY(type), JSON.stringify(ids));
}
export function deletedViews(type) {
  try {
    return JSON.parse(localStorage.getItem(DELETED_VIEWS_KEY(type))) || [];
  } catch {
    return [];
  }
}
export function saveDeletedViews(type, list) {
  localStorage.setItem(DELETED_VIEWS_KEY(type), JSON.stringify(list));
}

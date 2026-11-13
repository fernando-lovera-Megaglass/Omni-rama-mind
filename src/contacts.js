import { boot } from './page.js';
import { mountList, tag, link, avatarName, ownerHtml } from './list.js';
import { allContacts, allDeals, STATUSES, LIFECYCLES, SOURCES, OWNERS, formatDate, formatShortDate, TODAY, lifecycleTag } from './data.js';
import { mountCreateContact } from './create-contact.js';

boot({ root: '../', active: 'crm', sub: 'Contactos', title: 'Contactos' });

const days = (iso) => (TODAY - new Date(iso)) / 86400000;

let createPanel = null; // the original's "Crear contacto" slide-over (mounted after the list)
const list = mountList({
  type: 'contacts',
  title: 'Contactos',
  singular: 'Contacto',
  // "Agregar contactos" opens the slide-over right away (imports live in Gestión de datos).
  addDirect: true,
  openCreate: (prefill) => createPanel && createPanel.open(prefill),
  plural: 'contactos',
  addLabel: 'Agregar contactos',
  createLabel: 'Crear contacto',
  defaultWidths: { name: 280, email: 280, phone: 200, owner: 220, assoc_company: 240, status: 170, created: 180 },
  // Metrics card above the table ("Mostrar métricas" in the gear menu); hidden until the person turns it on.
  metricsDefault: false,
  summary: (rows) => {
    const withOpenDeal = new Set(allDeals().filter((d) => d.stage !== 'won' && d.stage !== 'lost').map((d) => Number(d.contactId)));
    const n = (f) => String(rows.filter(f).length);
    return [
      ['Contactos en la vista', String(rows.length), 'Número de contactos que cumplen los filtros actuales.'],
      ['Nuevos este mes', n((r) => days(r.created) <= 30), 'Contactos creados en los últimos 30 días.'],
      ['Con actividad reciente', n((r) => days(r.lastActivity) <= 7), 'Contactos con alguna actividad en los últimos 7 días.'],
      ['Con negocios abiertos', n((r) => withOpenDeal.has(Number(r.id))), 'Contactos asociados a al menos un negocio sin cerrar.'],
      ['Clientes', n((r) => r.lifecycle === 'Cliente'), 'Contactos en la etapa del ciclo de vida "Cliente".'],
      ['Sin propietario', n((r) => r.owner === 'Sin asignar'), 'Contactos que todavía no tienen propietario.'],
    ];
  },
  board: {
    key: 'lifecycle',
    groups: LIFECYCLES.map((l) => [l, l]),
    lines: (r) => [
      ['Propietario del contacto', r.owner],
      ['Número de negocios asociados', String(allDeals().filter((d) => Number(d.contactId) === Number(r.id)).length)],
      ['Último contacto', formatShortDate(r.lastActivity)],
    ],
    sub: (r) => (r.company ? { name: r.company, href: `../companies/record/?id=${r.companyId || ''}` } : null),
  },
  editors: {
    status: Object.entries(STATUSES).map(([k, [l]]) => [k, l]),
    lifecycle: LIFECYCLES.map((l) => [l, l]),
    owner: OWNERS.map((o) => [o, o]),
    source: SOURCES.map((s) => [s, s]),
  },
  previewFields: ['mobilephone', 'phone', ['alt_phone', 'Numero de Telefono 2'], 'email', 'status', ['country', 'País/región'], 'customer_type', ['company', 'Nombre de la empresa'], ['state', 'Estado o región'], 'sales_rep', ['hs_buying_role', 'Rol de compra']],
  searchPlaceholder: 'Buscar nombre, teléfono, correo...',
  searchKeys: ['name', 'email', 'phone', 'company', 'city'],
  rows: allContacts,
  views: [
    { key: 'all', label: 'Todos los contactos' },
    { key: 'mine', label: 'Mis contactos', filter: (r) => r.owner === 'Fernando L.' },
    { key: 'unassigned', label: 'Contactos sin asignar', filter: (r) => r.owner === 'Sin asignar' },
    { key: 'recent', label: 'Creados este mes', filter: (r) => days(r.created) <= 30 },
  ],
  filters: [
    { key: 'owner', label: 'Propietario del contacto', options: OWNERS.map((o) => [o, o]), test: (r, v) => r.owner === v },
    { key: 'created', label: 'Fecha de creación', options: [['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['365', 'Este año']], test: (r, v) => days(r.created) <= Number(v) },
    { key: 'activity', label: 'Última actividad', options: [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días']], test: (r, v) => days(r.lastActivity) <= Number(v) },
    { key: 'status', label: 'Estado del lead', options: Object.entries(STATUSES).map(([k, [l]]) => [k, l]), test: (r, v) => r.status === v },
    { key: 'lifecycle', label: 'Etapa del ciclo de vida', options: LIFECYCLES.map((l) => [l, l]), test: (r, v) => r.lifecycle === v },
  ],
  columns: [
    { key: 'name', label: 'Nombre', render: (r) => avatarName(r.id, r.name, `./record/?id=${r.id}`) },
    { key: 'email', label: 'Correo' },
    { key: 'phone', label: 'Número de teléfono' },
    { key: 'owner', label: 'Propietario del contacto', render: (r) => ownerHtml(r.owner) },
    { key: 'assoc_company', label: 'Contacto → Empresas', editable: false, text: (r) => r.company || '', sortValue: (r) => r.company || '', render: (r) => (r.company ? `<span class="name"><span class="avatar avatar--sm avatar--soft">${r.company.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>${link(`../companies/record/?id=${r.companyId || ''}`, r.company)}</span>` : '<span class="muted">--</span>') },
    { key: 'company', label: 'Empresa principal', default: false },
    { key: 'status', label: 'Estado del lead', text: (r) => STATUSES[r.status]?.[0] || r.status, render: (r) => tag(...(STATUSES[r.status] || [r.status, 'tag--none'])) },
    { key: 'lifecycle', label: 'Etapa del ciclo de vida', default: false, text: (r) => r.lifecycle || '', render: (r) => lifecycleTag(r.lifecycle) },
    { key: 'jobTitle', label: 'Cargo', default: false },
    { key: 'city', label: 'Ciudad', default: false },
    { key: 'source', label: 'Fuente original', default: false },
    { key: 'lastActivity', label: 'Última actividad', default: false, text: (r) => formatDate(r.lastActivity), sortValue: (r) => new Date(r.lastActivity).getTime() },
    { key: 'created', label: 'Fecha de creación', text: (r) => formatDate(r.created), sortValue: (r) => new Date(r.created).getTime() },
  ],
  createFields: [
    { name: 'email', label: 'Correo', type: 'email', placeholder: 'correo@ejemplo.com' },
    { name: 'first', label: 'Nombre', required: true },
    { name: 'last', label: 'Apellidos', required: true },
    { name: 'phone', label: 'Número de teléfono', type: 'tel' },
    { name: 'company', label: 'Empresa principal' },
    { name: 'jobTitle', label: 'Cargo' },
    { name: 'owner', label: 'Propietario del contacto', type: 'select', options: OWNERS.map((o) => [o, o]) },
    { name: 'status', label: 'Estado del lead', type: 'select', options: Object.entries(STATUSES).map(([k, [l]]) => [k, l]) },
    { name: 'lifecycle', label: 'Etapa del ciclo de vida', type: 'select', options: LIFECYCLES.map((l) => [l, l]) },
  ],
  normalize: (d) => ({
    ...d,
    name: `${d.first || ''} ${d.last || ''}`.trim() || d.name || 'Sin nombre',
    status: d.status || 'new',
    owner: d.owner || 'Sin asignar',
    lifecycle: d.lifecycle || 'Lead',
    source: 'Creación manual',
    lastActivity: TODAY.toISOString(),
  }),
});
createPanel = mountCreateContact({ list });

export { SOURCES, list, createPanel };

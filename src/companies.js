import { boot } from './page.js';
import { mountList, avatarName, ownerHtml } from './list.js';
import { allCompanies, allContacts, allDeals, OWNERS, LIFECYCLES, formatDate, formatMoney, formatShortDate, TODAY, lifecycleTag, toHomeCurrency, homeCurrency } from './data.js';

boot({ root: '../', active: 'crm', sub: 'Empresas', title: 'Empresas' });

const days = (iso) => (TODAY - new Date(iso)) / 86400000;
const contactCount = (id) => allContacts().filter((c) => Number(c.companyId) === Number(id)).length;
const openDeals = (id) => allDeals().filter((d) => Number(d.companyId) === Number(id) && d.stage !== 'won' && d.stage !== 'lost').length;

mountList({
  type: 'companies',
  title: 'Empresas',
  singular: 'Empresa',
  plural: 'empresas',
  addLabel: 'Agregar empresas',
  createLabel: 'Crear empresa',
  // Metrics card above the table ("Mostrar métricas" in the gear menu); hidden until the person turns it on.
  metricsDefault: false,
  summary: (rows) => {
    const ids = new Set(rows.map((r) => Number(r.id)));
    const open = allDeals().filter((d) => ids.has(Number(d.companyId)) && d.stage !== 'won' && d.stage !== 'lost');
    const n = (f) => String(rows.filter(f).length);
    return [
      ['Empresas en la vista', String(rows.length), 'Número de empresas que cumplen los filtros actuales.'],
      ['Nuevas este mes', n((r) => days(r.created) <= 30), 'Empresas creadas en los últimos 30 días.'],
      ['Con negocios abiertos', n((r) => openDeals(r.id) > 0), 'Empresas con al menos un negocio sin cerrar.'],
      ['Valor de negocios abiertos', formatMoney(open.reduce((s, d) => s + toHomeCurrency(d.amount, d.deal_currency_code), 0)), `Importe de los negocios abiertos de estas empresas, en ${homeCurrency()}.`],
      ['Contactos asociados', String(rows.reduce((s, r) => s + contactCount(r.id), 0)), 'Contactos vinculados a las empresas de la vista.'],
      ['Sin propietario', n((r) => r.owner === 'Sin asignar'), 'Empresas que todavía no tienen propietario.'],
    ];
  },
  board: {
    key: 'lifecycle',
    groups: LIFECYCLES.map((l) => [l, l]),
    lines: (r) => [
      ['Propietario de la empresa', r.owner],
      ['Número de contactos asociados', String(contactCount(r.id))],
      ['Negocios abiertos', String(openDeals(r.id))],
      ['Último contacto', formatShortDate(r.lastActivity)],
    ],
    sub: (r) => (r.domain ? { name: r.domain, href: '#' } : null),
  },
  editors: {
    owner: OWNERS.map((o) => [o, o]),
    lifecycle: LIFECYCLES.map((l) => [l, l]),
    industry: ['Construcción', 'Arquitectura', 'Reformas', 'Inmobiliaria', 'Decoración'].map((x) => [x, x]),
  },
  readOnly: ['contacts', 'deals'],
  previewFields: ['domain', 'phone', 'owner', 'industry', 'city', 'state', 'country', 'employees', 'revenue', 'lifecycle'],
  searchPlaceholder: 'Buscar nombre, dominio, teléfono...',
  searchKeys: ['name', 'domain', 'phone', 'city', 'industry'],
  rows: allCompanies,
  views: [
    { key: 'all', label: 'Todas las empresas' },
    { key: 'mine', label: 'Mis empresas', filter: (r) => r.owner === 'Fernando L.' },
    { key: 'customers', label: 'Clientes', filter: (r) => r.lifecycle === 'Cliente' },
  ],
  filters: [
    { key: 'owner', label: 'Propietario de la empresa', options: OWNERS.map((o) => [o, o]), test: (r, v) => r.owner === v },
    { key: 'created', label: 'Fecha de creación', options: [['90', 'Últimos 90 días'], ['365', 'Este año']], test: (r, v) => days(r.created) <= Number(v) },
    { key: 'activity', label: 'Última actividad', options: [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días']], test: (r, v) => days(r.lastActivity) <= Number(v) },
    { key: 'industry', label: 'Sector', options: ['Construcción', 'Arquitectura', 'Reformas', 'Inmobiliaria', 'Decoración'].map((x) => [x, x]), test: (r, v) => r.industry === v },
    { key: 'lifecycle', label: 'Etapa del ciclo de vida', options: LIFECYCLES.map((l) => [l, l]), test: (r, v) => r.lifecycle === v },
  ],
  columns: [
    { key: 'name', label: 'Nombre de la empresa', render: (r) => avatarName(r.id, r.name, `./record/?id=${r.id}`) },
    { key: 'domain', label: 'Dominio', render: (r) => (r.domain ? `<a href="#">${r.domain}</a>` : '<span class="muted">—</span>') },
    { key: 'phone', label: 'Número de teléfono' },
    { key: 'owner', label: 'Propietario de la empresa', render: (r) => ownerHtml(r.owner) },
    { key: 'industry', label: 'Sector' },
    { key: 'city', label: 'Ciudad' },
    { key: 'contacts', label: 'Contactos', text: (r) => contactCount(r.id), sortValue: (r) => contactCount(r.id) },
    { key: 'deals', label: 'Negocios abiertos', text: (r) => openDeals(r.id), sortValue: (r) => openDeals(r.id) },
    { key: 'employees', label: 'Empleados', default: false },
    { key: 'revenue', label: 'Ingresos anuales', default: false, text: (r) => formatMoney(r.revenue), sortValue: (r) => Number(r.revenue) || 0 },
    { key: 'lifecycle', label: 'Etapa del ciclo de vida', default: false, text: (r) => r.lifecycle || '', render: (r) => lifecycleTag(r.lifecycle) },
    { key: 'lastActivity', label: 'Última actividad', default: false, text: (r) => formatDate(r.lastActivity), sortValue: (r) => new Date(r.lastActivity).getTime() },
    { key: 'created', label: 'Fecha de creación', text: (r) => formatDate(r.created), sortValue: (r) => new Date(r.created).getTime() },
  ],
  createFields: [
    { name: 'domain', label: 'Dominio', placeholder: 'empresa.es' },
    { name: 'name', label: 'Nombre de la empresa', required: true },
    { name: 'phone', label: 'Número de teléfono', type: 'tel' },
    { name: 'industry', label: 'Sector', type: 'select', options: ['Construcción', 'Arquitectura', 'Reformas', 'Inmobiliaria', 'Decoración'].map((x) => [x, x]) },
    { name: 'city', label: 'Ciudad' },
    { name: 'employees', label: 'Empleados', type: 'number' },
    { name: 'owner', label: 'Propietario de la empresa', type: 'select', options: OWNERS.map((o) => [o, o]) },
    { name: 'lifecycle', label: 'Etapa del ciclo de vida', type: 'select', options: LIFECYCLES.map((l) => [l, l]) },
  ],
  normalize: (d) => ({ ...d, owner: d.owner || 'Sin asignar', lifecycle: d.lifecycle || 'Lead', lastActivity: TODAY.toISOString(), revenue: 0 }),
});

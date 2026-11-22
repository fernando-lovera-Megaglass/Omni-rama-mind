// Source-specific presets share the normal parser, validation and execution engine.
import { autoMap, propByKey } from './import-engine.js';
export const TRANSFER_SOURCES = {
  salesforce: { label: 'Salesforce', instruction: 'Exporta un reporte de Contacts (contactos), Accounts (empresas) u Opportunities (negocios). Selecciona Export → Details Only → CSV, sin agrupaciones ni totales.', url: 'https://help.salesforce.com/s/articleView?id=000206326&language=en_US&type=1' },
  zoho: { label: 'Zoho', instruction: 'Exporta el módulo Contacts, Accounts o Deals desde Configuración → Administración de datos → Exportar. Selecciona CSV o XLSX e incluye los campos indicados.', url: 'https://help.zoho.com/portal/en/kb/crm/data-administration/export-data/articles/export-crm-data' },
  pipedrive: { label: 'Pipedrive', instruction: 'Abre la vista de lista de Personas, Organizaciones o Negocios. Añade las columnas indicadas y usa … → Exportar resultados del filtro en CSV o XLSX.', url: 'https://support.pipedrive.com/en/article/exporting-data-from-pipedrive' },
  spreadsheet: { label: 'Hoja de cálculo genérica', instruction: 'Guarda una hoja con encabezados en la primera fila y un registro por fila como CSV UTF-8 o Excel (.xlsx/.xls). Usa nombres de propiedades de Omni en español o inglés.' },
};
const normalize = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const presets = {
  salesforce: {
    contacts: { first: ['FirstName'], last: ['LastName'], email: ['Email'], phone: ['Phone'], mobilephone: ['MobilePhone'], company: ['Account Name'], jobTitle: ['Title'], address: ['MailingStreet'], city: ['MailingCity'], state: ['MailingState'], zip: ['MailingPostalCode'], country: ['MailingCountry'] },
    companies: { name: ['Account Name'], website: ['Website'], phone: ['Phone'], address: ['BillingStreet'], city: ['BillingCity'], state: ['BillingState'], zip: ['BillingPostalCode'], country: ['BillingCountry'], employees: ['NumberOfEmployees'], revenue: ['AnnualRevenue'] },
    deals: { name: ['Opportunity Name'], amount: ['Amount'], stage: ['StageName'], closeDate: ['CloseDate'], company: ['Account Name'] },
  },
  zoho: {
    contacts: { first: ['First Name'], last: ['Last Name'], email: ['Email'], phone: ['Phone'], mobilephone: ['Mobile'], company: ['Account Name'], jobTitle: ['Title'], address: ['Mailing Street'], city: ['Mailing City'], zip: ['Mailing Zip'] },
    companies: { name: ['Account Name'], website: ['Website'], phone: ['Phone'], revenue: ['Annual Revenue'], employees: ['Employees'], address: ['Billing Street'], city: ['Billing City'] },
    deals: { name: ['Deal Name', 'Potential Name'], amount: ['Amount'], stage: ['Stage'], closeDate: ['Closing Date'], company: ['Account Name'] },
  },
  pipedrive: {
    contacts: { name: ['Person - Name', 'Name'], first: ['Person - First name'], last: ['Person - Last name'], email: ['Person - Email', 'Person - Email - Work', 'Email - Work'], phone: ['Person - Phone', 'Person - Phone - Work', 'Phone - Work'], company: ['Person - Organization', 'Organization - Name'] },
    companies: { name: ['Organization - Name'], address: ['Organization - Address'], website: ['Organization - Website'], domain: ['Organization - Domain'], phone: ['Organization - Phone'] },
    deals: { name: ['Deal - Title', 'Title'], amount: ['Deal - Value'], pipeline: ['Deal - Pipeline'], stage: ['Deal - Stage'], closeDate: ['Deal - Expected close date'], deal_currency_code: ['Deal - Currency'], company: ['Organization - Name'] },
  },
};
export function transferMap(headers, source, object) {
  const aliases = new Map(Object.entries(presets[source]?.[object] || {}).flatMap(([key, names]) => names.map((name) => [normalize(name), key])));
  const used = new Set();
  return autoMap(headers, 'es', object).map((m) => {
    let key = aliases.get(normalize(m.header)) || m.key;
    // External IDs must never update an unrelated Omni record with the same ID.
    const externalId = key === 'hs_object_id' || /^(id|recordid|contactid|accountid|personid|organizationid|dealid|opportunityid|personsystemid|organizationsystemid|dealsystemid)$/.test(normalize(m.header));
    if (externalId || !propByKey(object, key) || used.has(key)) key = '';
    if (key) used.add(key);
    return { ...m, key, skip: !key, ...(externalId ? { ignoredExternalId: true } : {}) };
  });
}
export function transferFields(source, object) {
  const examples = Object.values(presets[source]?.[object] || {}).map((names) => names[0]);
  return examples.length ? examples.join(', ') : ({ contacts: 'Nombre, Apellidos, Correo electrónico, Teléfono', companies: 'Nombre de la empresa, Dominio, Sitio web', deals: 'Nombre del negocio, Pipeline, Etapa del negocio, Importe' })[object];
}

export const ACTIVITY_COMPANY_SETTING = 'crm:settings:general-activity-company';

export const ACTIVITY_RULES_SETTING = 'crm:settings:general-activity-rules';
export const ACTIVITY_KINDS = { note: 'Nota', call: 'Llamada', email: 'Correo', meeting: 'Reunión', message: 'Mensaje' };
export const ACTIVITY_RULE_OPTIONS = { none: 'Ninguna', all: 'Registrar en todos los registros asociados', latest: 'Registrar en 1 asociado más reciente', latest5: 'Registrar en los 5 asociados más recientes', primary: 'Registrar en la empresa principal' };
export function activityRule(rules, type, kind) {
  const rule = rules?.[type]?.[kind];
  return Object.hasOwn(ACTIVITY_RULE_OPTIONS, rule) ? rule : null;
}

// Resolve explicit associations in either direction as well as primary foreign keys.
export function activityAssociations(type, record, records, isClosedTicket, associateCompany = true) {
  const config = typeof associateCompany === 'object' ? associateCompany : null;
  const rule = config && activityRule(config.rules, type, config.kind);
  const companyEnabled = config ? config.associateCompany !== false : associateCompany;
  const fields = { contacts: 'contactId', companies: 'companyId', deals: 'dealId', tickets: 'ticketId' };
  const linked = (aType, a, bType, b) =>
    String(a[fields[bType]]) === String(b.id) ||
    (a[`assoc_${bType}`] || []).some((id) => String(id) === String(b.id)) ||
    String(b[fields[aType]]) === String(a.id) ||
    (b[`assoc_${aType}`] || []).some((id) => String(id) === String(a.id));
  const contacts = type === 'contacts' ? [record] : (records.contacts || []).filter((c) => linked(type, record, 'contacts', c));
  const primaryCompanies = new Set([record.companyId, ...contacts.map((c) => c.companyId)].filter(Boolean).map(String));
  const destination = config?.destinationContactId ?? (type === 'contacts' ? record.id : record.contactId);
  const isDestination = (targetType, id) => ['call', 'email'].includes(config?.kind) && targetType === 'contacts' && destination != null && String(id) === String(destination);
  const result = new Map();
  for (const targetType of Object.keys(fields)) {
    for (const target of records[targetType] || []) {
      if (targetType === type && String(target.id) === String(record.id)) continue;
      if (targetType === 'tickets' && isClosedTicket(target)) continue;
      const direct = linked(type, record, targetType, target);
      const throughContact = ['deals', 'tickets'].includes(type) && targetType !== 'contacts' && contacts.some((c) => linked('contacts', c, targetType, target));
      if (!direct && !throughContact && !isDestination(targetType, target.id)) continue;
      result.set(`${targetType}:${target.id}`, { type: targetType, id: target.id, name: target.name, checked: targetType !== 'companies' || !primaryCompanies.has(String(target.id)) || companyEnabled, created: target.created ?? target.createdAt ?? target.created_at });
    }
  }
  const timestamp = (value) => { const n = typeof value === 'number' ? value : Date.parse(value); return Number.isFinite(n) ? n : 0; };
  const rows = [...result.values()].sort((a, b) => timestamp(b.created) - timestamp(a.created));
  return rows.map((row, index) => {
    const required = isDestination(row.type, row.id);
    const checked = !rule ? row.checked : rule === 'all' ? index < 500 : rule === 'latest' ? index < 1 : rule === 'latest5' ? index < 5 : rule === 'primary' ? row.type === 'companies' && primaryCompanies.has(String(row.id)) : false;
    const { created, ...option } = row;
    return { ...option, checked: checked || required, required };
  });
}

export function saveAssociatedActivity(event, origin, targets, addActivity) {
  const seen = new Set([`${origin.type}:${origin.id}`]);
  addActivity({ ...event, recordType: origin.type, recordId: origin.id });
  for (const target of targets) {
    const key = `${target.type}:${target.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    addActivity({ ...event, recordType: target.type, recordId: target.id,
      extra: { ...event.extra, associatedFrom: { type: origin.type, id: origin.id }, associatedFromName: origin.name } });
  }
}

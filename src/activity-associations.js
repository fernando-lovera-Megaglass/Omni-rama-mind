export const ACTIVITY_COMPANY_SETTING = 'crm:settings:general-activity-company';

// Resolve explicit associations in either direction as well as primary foreign keys.
export function activityAssociations(type, record, records, isClosedTicket, associateCompany = true) {
  const fields = { contacts: 'contactId', companies: 'companyId', deals: 'dealId', tickets: 'ticketId' };
  const linked = (aType, a, bType, b) =>
    String(a[fields[bType]]) === String(b.id) ||
    (a[`assoc_${bType}`] || []).some((id) => String(id) === String(b.id)) ||
    String(b[fields[aType]]) === String(a.id) ||
    (b[`assoc_${aType}`] || []).some((id) => String(id) === String(a.id));
  const contacts = type === 'contacts' ? [record] : (records.contacts || []).filter((c) => linked(type, record, 'contacts', c));
  const primaryCompanies = new Set([record.companyId, ...contacts.map((c) => c.companyId)].filter(Boolean).map(String));
  const result = new Map();
  for (const targetType of Object.keys(fields)) {
    for (const target of records[targetType] || []) {
      if (targetType === type && String(target.id) === String(record.id)) continue;
      if (targetType === 'tickets' && isClosedTicket(target)) continue;
      const direct = linked(type, record, targetType, target);
      const throughContact = ['deals', 'tickets'].includes(type) && targetType !== 'contacts' && contacts.some((c) => linked('contacts', c, targetType, target));
      if (!direct && !throughContact) continue;
      result.set(`${targetType}:${target.id}`, { type: targetType, id: target.id, name: target.name, checked: targetType !== 'companies' || !primaryCompanies.has(String(target.id)) || associateCompany });
    }
  }
  return [...result.values()];
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

// Deals/tickets own their links; scalar keys designate the primary, never the whole set.
export const isMultiAssociation = (type, kind) => ['deals', 'tickets'].includes(type) && ['contacts', 'companies'].includes(kind);
export function associationIds(record, kind) {
  const primary = record?.[kind === 'contacts' ? 'contactId' : 'companyId'];
  return [...new Set([primary, ...(Array.isArray(record?.[`assoc_${kind}`]) ? record[`assoc_${kind}`] : [])].map(Number).filter(n => Number.isSafeInteger(n) && n > 0))];
}
export const hasAssociation = (record, kind, id) => associationIds(record, kind).includes(Number(id));
export function associationPatch(record, kind, other, label = 'Sin etiqueta', remove = false) {
  const key = kind === 'contacts' ? 'contactId' : 'companyId';
  const ids = associationIds(record, kind).filter(id => !remove || id !== Number(other.id));
  if (!remove && !ids.includes(Number(other.id))) ids.push(Number(other.id));
  const labels = { ...record[`assoc_labels_${kind}`] };
  if (remove) delete labels[other.id];
  else {
    if (label === 'Principal') for (const id of Object.keys(labels)) if (labels[id] === 'Principal') labels[id] = 'Sin etiqueta';
    labels[other.id] = label;
  }
  const primary = !remove && label === 'Principal' ? Number(other.id) : ids.includes(Number(record[key])) ? Number(record[key]) : ids[0] || '';
  return { [`assoc_${kind}`]: ids, [`assoc_labels_${kind}`]: labels, [key]: primary };
}

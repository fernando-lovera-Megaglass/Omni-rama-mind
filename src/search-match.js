import { parsePhone } from './phone.js';

export const phoneQuery = (q) => /^[+\d\s().-]+$/.test(String(q).trim()) ? String(q).replace(/\D/g, '') : '';
export function matchesSearch(record, query, keys) {
  const fold = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (fold(keys.map((key) => record[key]).join(' ')).includes(fold(query))) return true;
  const digits = phoneQuery(query);
  return Boolean(digits && keys.some((key) => ['phone', 'mobilephone'].includes(key)
    && parsePhone(record[key]).main.replace(/\D/g, '').includes(digits)));
}

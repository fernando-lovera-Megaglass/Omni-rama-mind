// Export of a list (view or selection) as the original does it: a dialog asks for the file name («<Objeto> -
// <fecha>»), the format (CSV or XLSX, through the `xlsx` package already used by the importer) and which
// properties go out: the columns of the current view, or every property of the object's catalogue
// (src/properties.js) with its label as header. Values are the same display texts the CSV always used
// (a column's `text` when it has one, the raw value otherwise; catalogue properties get a light formatter).
import { propertyList, customProperties } from './properties.js';
import { formatDate, formatMoney, dealStageLabel, ticketStatusLabel, PRIORITIES, labelOf } from './data.js';

export const EXPORT_FORMATS = [['csv', 'CSV'], ['xlsx', 'XLSX']];
export const EXPORT_SCOPES = [['view', 'Solo las propiedades de la vista actual'], ['all', 'Todas las propiedades del objeto']];
const pad = (n) => String(n).padStart(2, '0');
export const todayStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const defaultExportName = (objectLabel, d = new Date()) => `${objectLabel} - ${todayStamp(d)}`;
// A file name the browser accepts (no path separators or control characters), never empty.
export const safeFileName = (s, fallback = 'Exportación') => (String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback);

function formatValue(p, v, r, type) {
  if (v === undefined || v === null || v === '') return '';
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join('; ');
  if (typeof v === 'object') return v.freq ? String(v.freq) : JSON.stringify(v);
  const hs = p.hubspot && p.hubspot.options && p.hubspot.options.length ? p.hubspot.options : null;
  if (hs) return String(v).split(';').map((x) => (hs.find((o) => o.value === x) || { label: x }).label).join('; ');
  if (Array.isArray(p.options) && p.options.length) return String((p.options.find((o) => (Array.isArray(o) ? o[0] : o) === v) || [v, v])[1] ?? v);
  switch (p.kind) {
    case 'date': case 'datetime': return formatDate(v);
    case 'currency': return formatMoney(v, type === 'deals' ? r.deal_currency_code : undefined);
    case 'percent': return `${v} %`;
    case 'bool': return v === true || v === 'true' || v === 'Sí' ? 'Sí' : 'No';
    case 'stage': return dealStageLabel(r.pipeline, v);
    case 'status': return type === 'tickets' ? ticketStatusLabel(r.pipeline, v) : String(v);
    case 'priority': return labelOf(PRIORITIES, v);
    default: return String(v);
  }
}
// The columns to export: the view's own, or the whole catalogue (labels as headers, sensitive ones never).
export function exportColumns(type, viewColumns, scope) {
  if (scope !== 'all') return viewColumns;
  return propertyList(type).filter((p) => !p.sensitive && !p.archived).map((p) => ({ key: p.key, label: p.label, text: (r) => formatValue(p, r[p.key], r, type) }));
}
// Header + rows as plain arrays of strings (what both the CSV and the XLSX sheet contain).
export function exportTable(rows, columns, type) {
  const sensitive = new Set(customProperties(type).filter((p) => p.sensitive).map((p) => p.key));
  const cols = columns.filter((c) => !sensitive.has(c.key));
  const cell = (c, r) => { const v = c.text ? c.text(r) : r[c.key]; return v === undefined || v === null ? '' : String(v); };
  return [cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => cell(c, r)))];
}
export const csvOf = (table) => table.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
// Builds the file: { filename, blob }. XLSX loads the library on demand (same package as the importer).
export async function buildExport({ rows, columns, type, format = 'csv', name = '', sheet = 'Datos' }) {
  const table = exportTable(rows, columns, type);
  const base = safeFileName(name);
  if (format === 'xlsx') {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(table), sheet.slice(0, 31));
    const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return { filename: `${base}.xlsx`, blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), rows: rows.length, columns: table[0].length };
  }
  return { filename: `${base}.csv`, blob: new Blob(['﻿' + csvOf(table)], { type: 'text/csv;charset=utf-8' }), rows: rows.length, columns: table[0].length };
}
export function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch { /* page already gone */ } }, 1000);
}

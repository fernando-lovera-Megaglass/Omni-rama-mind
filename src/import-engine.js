// Contact import engine (rules from especificacion-importacion-contactos-crm.md): file parsing (CSV / XLSX / XLS /
// pasted data), header auto-mapping (Spanish or English, English fallback), value conversion per property type,
// de-duplication by e-mail or record ID, the three import modes, the error catalogue with its impact, the import
// states (STARTED → PROCESSING → DONE / FAILED / CANCELED, DEFERRED when three are running), limits, downloads.
import { allContacts, addRecord, setField, OWNERS, TODAY, getViewStore, setViewStore, strip } from './data.js';
import { propertyList, customProperties, saveCustomProperties } from './properties.js';

export const OBJECT = 'contacts';
export const ME = 'Fernando L.';
export const IMPORTS_KEY = 'crm:imports';
export const DETAIL_KEY = (id) => `crm:imports:detail:${id}`;

// ---------- limits (free tier of the specification) ----------
export const LIMITS = { fileBytes: 20 * 1024 * 1024, importsPerDay: 50, rowsPerDay: 500000, rowsPerFile: 1048576, concurrent: 3, cellBytes: 1024 * 1024, maxColumns: 1000, errorsPerRow: 10 };

// ---------- states ----------
export const STATES = {
  STARTED: 'Iniciada',
  PROCESSING: 'Procesando',
  DONE: 'Completada',
  FAILED: 'Fallida',
  CANCELED: 'Cancelada',
  DEFERRED: 'En cola',
};
export const stateLabel = (s) => STATES[s] || STATES.DONE;

// ---------- error catalogue: code → [meaning, impact] ----------
export const ERRORS = {
  AMBIGUOUS_ENUMERATION_OPTION: ['El valor coincide con más de una opción de la lista.', 'Registro importado, propiedad vacía.'],
  OWNER_NOT_FOUND: ['No hay ningún usuario con ese nombre o correo.', 'Registro importado, propietario vacío.'],
  MULTIPLE_OWNERS_FOUND: ['Varios usuarios coinciden con ese nombre; usa el correo.', 'Registro importado, propietario vacío.'],
  COULD_NOT_PARSE_DATE: ['La fecha no tiene un formato válido.', 'Propiedad vacía.'],
  COULD_NOT_PARSE_NUMBER: ['El número no tiene un formato válido.', 'Propiedad vacía.'],
  COULD_NOT_PARSE_ROW: ['La fila no se pudo leer.', 'Fila no importada.'],
  CREATE_ONLY_IMPORT: ['Modo «Solo crear» y la fila coincide con un registro existente.', 'Fila no importada.'],
  UPDATE_ONLY_IMPORT: ['Modo «Solo actualizar» y el identificador no existe en el CRM.', 'Fila no importada.'],
  DUPLICATE_UNIQUE_PROPERTY_VALUE: ['El identificador único se repite en otra fila del archivo.', 'Fila no importada.'],
  DUPLICATE_ROW_CONTENT: ['La fila es idéntica a otra del archivo.', 'Fila no importada.'],
  DUPLICATE_RECORD_ID: ['El ID de registro se repite en otra fila.', 'Fila no importada.'],
  EMPTY_PROPERTY_VALUES_OBJECT: ['La fila tiene todas las columnas vacías.', 'Fila no importada.'],
  INVALID_EMAIL: ['El correo electrónico no es válido.', 'Fila no importada.'],
  INVALID_ADDITIONAL_EMAIL: ['Un correo adicional no es válido o ya lo usa otro contacto.', 'Registro importado, correo adicional omitido.'],
  INVALID_ENUMERATION_OPTION: ['El valor no coincide con ninguna opción de la lista.', 'Registro importado, propiedad vacía.'],
  INVALID_RECORD_ID: ['El ID de registro no existe en el CRM.', 'Fila no importada.'],
  INVALID_FILE_TYPE: ['El archivo no es .csv, .xlsx ni .xls.', 'Nada importado.'],
  INVALID_SHEET_COUNT: ['El libro tiene más de una hoja.', 'Nada importado.'],
  INVALID_SPREADSHEET: ['La hoja de cálculo no se pudo leer.', 'Nada importado.'],
  FILE_NOT_FOUND: ['No se encontró el archivo.', 'Nada importado.'],
  INCORRECT_COLUMN_COUNT: ['Hay una columna sin encabezado.', 'Esa columna no se importa.'],
  LIMIT_EXCEEDED: ['Se superó un límite de importación.', 'Nada importado.'],
  MISSING_REQUIRED_PROPERTY: ['Falta Nombre, Apellidos o Correo electrónico.', 'Fila no importada.'],
  PROPERTY_VALIDATION_RULE_ERROR: ['El valor incumple las reglas de validación de la propiedad.', 'Registro importado, propiedad vacía.'],
  PROPERTY_DEFINITION_NOT_FOUND: ['El encabezado no corresponde a ninguna propiedad.', 'Esa columna no se importa.'],
  ROW_DATA_TOO_LARGE: ['Una celda supera 1 MB.', 'Fila no importada.'],
  TOO_MANY_ERRORS_IN_ROW: ['La fila tiene más de 10 errores.', 'Fila no importada.'],
  OUT_OF_VALID_DATE_RANGE: ['La fecha está fuera del rango admitido.', 'Propiedad vacía.'],
  GDPR_BLACKLISTED_EMAIL: ['Correo bloqueado por privacidad de datos.', 'Ese contacto no se importa.'],
  UNKNOWN_BAD_REQUEST: ['Error no identificado.', 'No se importa.'],
};
// Errors that drop the whole row; the others only empty the property.
export const ROW_ERRORS = new Set(['COULD_NOT_PARSE_ROW', 'CREATE_ONLY_IMPORT', 'UPDATE_ONLY_IMPORT', 'DUPLICATE_UNIQUE_PROPERTY_VALUE', 'DUPLICATE_ROW_CONTENT', 'DUPLICATE_RECORD_ID', 'EMPTY_PROPERTY_VALUES_OBJECT', 'INVALID_EMAIL', 'INVALID_RECORD_ID', 'MISSING_REQUIRED_PROPERTY', 'ROW_DATA_TOO_LARGE', 'TOO_MANY_ERRORS_IN_ROW', 'GDPR_BLACKLISTED_EMAIL']);
export const errorMeaning = (code) => (ERRORS[code] || ERRORS.UNKNOWN_BAD_REQUEST)[0];
export const errorImpact = (code) => (ERRORS[code] || ERRORS.UNKNOWN_BAD_REQUEST)[1];

// Values of these properties are shown as ELIMINADO in error tables and downloads.
export const SENSITIVE_KEYS = new Set(['date_of_birth', 'gender', 'marital_status']);
export const UNIQUE_KEYS = ['hs_object_id', 'email'];
export const REQUIRED_ANY = ['first', 'last', 'email', 'name'];

// ---------- file parsing ----------
export function sniffFormat(name) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return 'csv';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'xls') return 'xls';
  return null;
}

// CSV / TSV with quotes, any of , ; or tab as separator, CRLF and BOM.
export function parseDelimited(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/)[0] || '';
  const count = (ch) => (firstLine.match(new RegExp(ch === '\t' ? '\t' : `\\${ch}`, 'g')) || []).length;
  const sep = count('\t') > 0 && count('\t') >= count(',') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const headers = (rows.shift() || []).map((h) => h.trim());
  return { headers, rows: rows.map((r) => headers.map((_, i) => (r[i] ?? '').trim())), separator: sep };
}

// Any file: CSV as text; XLSX / XLS through SheetJS (first and only sheet).
export async function parseFile(file) {
  if (!file) throw importError('FILE_NOT_FOUND');
  const format = sniffFormat(file.name);
  if (!format) throw importError('INVALID_FILE_TYPE', `"${file.name}" no es un archivo .csv, .xlsx ni .xls.`);
  if (file.size > LIMITS.fileBytes) throw importError('LIMIT_EXCEEDED', `El archivo pesa ${(file.size / 1048576).toFixed(1)} MB; el máximo es ${LIMITS.fileBytes / 1048576} MB.`);
  let parsed;
  if (format === 'csv') parsed = parseDelimited(await file.text());
  else {
    const XLSX = await import('xlsx');
    let wb;
    try {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    } catch {
      throw importError('INVALID_SPREADSHEET');
    }
    if (!wb.SheetNames.length) throw importError('INVALID_SPREADSHEET');
    if (wb.SheetNames.length > 1) throw importError('INVALID_SHEET_COUNT', `El libro tiene ${wb.SheetNames.length} hojas; deja solo una.`);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
    const headers = (aoa.shift() || []).map((h) => String(h ?? '').trim());
    parsed = { headers, rows: aoa.map((r) => headers.map((_, i) => String(r[i] ?? '').trim())), separator: '' };
  }
  return checkTable({ ...parsed, format, fileName: file.name, size: file.size });
}

export function parsePasted(text) {
  return checkTable({ ...parseDelimited(text), format: 'paste', fileName: 'Datos pegados', size: String(text || '').length });
}

function checkTable(t) {
  if (!t.headers.length) throw importError('INVALID_SPREADSHEET', 'La primera fila debe contener los encabezados.');
  if (t.headers.length >= LIMITS.maxColumns) throw importError('INVALID_SPREADSHEET', `El archivo tiene ${t.headers.length} columnas; el máximo es ${LIMITS.maxColumns - 1}.`);
  if (t.rows.length > LIMITS.rowsPerFile) throw importError('LIMIT_EXCEEDED', `El archivo tiene ${t.rows.length} filas; el máximo por archivo es ${LIMITS.rowsPerFile}.`);
  // Columns without a header are dropped (INCORRECT_COLUMN_COUNT) but the import goes on.
  const warnings = [];
  t.headers.forEach((h, i) => { if (!h) warnings.push({ code: 'INCORRECT_COLUMN_COUNT', column: `Columna ${i + 1}` }); });
  return { ...t, warnings };
}

export function importError(code, detail) {
  const e = new Error(detail || errorMeaning(code));
  e.code = code;
  return e;
}

// ---------- property catalogue and auto-mapping ----------
export const props = () => propertyList(OBJECT);
export const propByKey = (key) => props().find((p) => p.key === key);
const EN_LABELS = {
  first: ['first name', 'first', 'given name'], last: ['last name', 'last', 'surname', 'family name'], name: ['full name', 'name', 'contact name'],
  email: ['email', 'email address', 'e-mail', 'correo electrónico'], alt_email: ['alternate email', 'secondary email'],
  hs_additional_emails: ['additional email addresses', 'additional emails'], phone: ['phone number', 'phone', 'telephone'], mobilephone: ['mobile phone number', 'mobile phone', 'mobile', 'cell phone'],
  company: ['company name', 'company', 'organization'], jobTitle: ['job title', 'title', 'position'], city: ['city'], state: ['state/region', 'state', 'region', 'province'], country: ['country/region', 'country'],
  zip: ['postal code', 'zip', 'zip code'], address: ['street address', 'address'], website: ['website url', 'website', 'web'], owner: ['contact owner', 'owner'],
  lifecycle: ['lifecycle stage', 'lifecycle'], status: ['lead status', 'status'], hs_object_id: ['record id', 'id', 'contact id'], source: ['original source', 'source'], industry: ['industry'],
  customer_type: ['customer type'], hs_department: ['department'], date_of_birth: ['date of birth', 'birthday'], message: ['message', 'notes'], annualrevenue: ['annual revenue'],
  hs_marketable_status: ['marketing contact status'], hs_lead_status_date: ['lead status date'], hs_buying_role: ['buying role'], salutation: ['salutation'],
};
const ES_ALIASES = {
  nombre: 'first', 'primer nombre': 'first', apellido: 'last', apellidos: 'last', 'nombre completo': 'name', correo: 'email', 'correo electronico': 'email', email: 'email', 'e-mail': 'email', 'direccion de correo': 'email',
  'correo alternativo': 'alt_email', 'correos adicionales': 'hs_additional_emails', 'direcciones de correo electronico adicionales': 'hs_additional_emails',
  telefono: 'phone', 'numero de telefono': 'phone', 'telefono fijo': 'phone', movil: 'mobilephone', celular: 'mobilephone', 'numero de movil': 'mobilephone', 'telefono movil': 'mobilephone',
  empresa: 'company', 'nombre de la empresa': 'company', 'empresa principal': 'company', cargo: 'jobTitle', puesto: 'jobTitle', ciudad: 'city', estado: 'state', region: 'state', 'estado/region': 'state', 'estado o region': 'state', provincia: 'state',
  pais: 'country', 'pais/region': 'country', 'codigo postal': 'zip', cp: 'zip', direccion: 'address', 'sitio web': 'website', web: 'website', 'url del sitio web': 'website',
  propietario: 'owner', 'propietario del contacto': 'owner', 'etapa del ciclo de vida': 'lifecycle', 'ciclo de vida': 'lifecycle', 'estado del lead': 'status', 'id de registro': 'hs_object_id', 'id del registro': 'hs_object_id', id: 'hs_object_id',
  'fuente original': 'source', fuente: 'source', sector: 'industry', industria: 'industry', 'tipo de cliente': 'customer_type', departamento: 'hs_department', 'fecha de nacimiento': 'date_of_birth', mensaje: 'message', notas: 'message',
  'ingresos anuales': 'annualrevenue', 'estado de contacto de marketing': 'hs_marketable_status', 'rol de compra': 'hs_buying_role', salutacion: 'salutation',
};
export const isUnique = (key) => UNIQUE_KEYS.includes(key);

// Header → property key; the chosen language first, then English, then the property's own key.
export function matchHeader(header, language = 'es') {
  const h = strip(header);
  if (!h) return '';
  const catalog = props();
  const byLabel = catalog.find((p) => strip(p.label) === h);
  const byAlias = ES_ALIASES[h];
  const byEnglish = Object.entries(EN_LABELS).find(([, labels]) => labels.includes(h));
  const byKey = catalog.find((p) => strip(p.key) === h);
  const order = language === 'en' ? [byEnglish && byEnglish[0], byLabel && byLabel.key, byAlias] : [byLabel && byLabel.key, byAlias, byEnglish && byEnglish[0]];
  return order.find((k) => k && catalog.some((p) => p.key === k)) || (byKey ? byKey.key : '');
}
export function autoMap(headers, language = 'es') {
  const used = new Set();
  return headers.map((header, index) => {
    let key = header ? matchHeader(header, language) : '';
    if (key && used.has(key)) key = '';
    if (key) used.add(key);
    return { index, header, key, skip: !header, noOverwrite: false, replacements: {}, dropped: [] };
  });
}

// Create a property on the fly from the mapping screen; it joins the catalogue right away.
export function createInlineProperty(label, kind = 'text', options) {
  const key = `imp_${strip(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'propiedad'}`;
  const list = customProperties(OBJECT);
  if (!list.some((p) => p.key === key)) {
    list.push({ key, label, kind, options: kind === 'enum' ? options || [] : undefined, group: 'Propiedades personalizadas', custom: true });
    saveCustomProperties(OBJECT, list);
  }
  return key;
}

// ---------- value conversion per property type ----------
const EMAIL_RE = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]{2,}$/;
const MONTHS = { ene: 1, enero: 1, jan: 1, january: 1, feb: 2, febrero: 2, february: 2, mar: 3, marzo: 3, march: 3, abr: 4, abril: 4, apr: 4, april: 4, may: 5, mayo: 5, jun: 6, junio: 6, june: 6, jul: 7, julio: 7, july: 7, ago: 8, agosto: 8, aug: 8, august: 8, sep: 9, sept: 9, septiembre: 9, september: 9, oct: 10, octubre: 10, october: 10, nov: 11, noviembre: 11, november: 11, dic: 12, diciembre: 12, dec: 12, december: 12 };
export const BOOL_TRUE = ['sí', 'si', 'verdadero', 'true', 'yes', '1', 'x'];
export const BOOL_FALSE = ['no', 'falso', 'false', '0', ''];

export function parseNumber(raw, numberFormat = 'auto') {
  let s = String(raw ?? '').trim().replace(/\s/g, '').replace(/[€$£]|MXN|USD|EUR|COP|GBP/gi, '');
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (numberFormat === 'es' || (numberFormat === 'auto' && hasComma && (!hasDot || s.lastIndexOf(',') > s.lastIndexOf('.')))) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Dates: numeric or named months, 2- or 4-digit years, separators / - ., day-month-year / month-day-year /
// year-month-day (dateFormat), optional hh:mm and ±hh:mm offset, or a UNIX timestamp in milliseconds.
export function parseDate(raw, dateFormat = 'dmy') {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{11,14}$/.test(s)) { const d = new Date(Number(s)); return Number.isNaN(d.getTime()) ? null : d; }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; }
  const m = s.match(/^(\d{1,4}|[a-záéíóú]+)[/.\-\s]+(\d{1,2}|[a-záéíóú]+)[/.\-\s]+(\d{1,4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*([+-]\d{2}:?\d{2})?$/i);
  if (!m) return null;
  const parts = [m[1], m[2], m[3]];
  const monthOf = (v) => (MONTHS[strip(v)] ? MONTHS[strip(v)] : /^\d+$/.test(v) ? Number(v) : NaN);
  let day; let month; let year;
  const named = parts.findIndex((p) => /[a-záéíóú]/i.test(p));
  if (/^\d{4}$/.test(parts[0])) { [year, month, day] = [Number(parts[0]), monthOf(parts[1]), Number(parts[2])]; }
  else if (named === 0) { [month, day, year] = [monthOf(parts[0]), Number(parts[1]), Number(parts[2])]; }
  else if (named === 1) { [day, month, year] = [Number(parts[0]), monthOf(parts[1]), Number(parts[2])]; }
  else if (dateFormat === 'mdy') { [month, day, year] = [Number(parts[0]), Number(parts[1]), Number(parts[2])]; }
  else if (dateFormat === 'ymd') { [year, month, day] = [Number(parts[0]), Number(parts[1]), Number(parts[2])]; }
  else { [day, month, year] = [Number(parts[0]), Number(parts[1]), Number(parts[2])]; }
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 100) year += year < 50 ? 2000 : 1900;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const hh = m[4] ? Number(m[4]) : 0;
  const mm = m[5] ? Number(m[5]) : 0;
  let d = new Date(year, month - 1, day, hh, mm, m[6] ? Number(m[6]) : 0);
  if (m[7]) { const off = m[7].replace(':', ''); const sign = off[0] === '-' ? -1 : 1; const oh = Number(off.slice(1, 3)); const om = Number(off.slice(3, 5)); d = new Date(Date.UTC(year, month - 1, day, hh, mm) - sign * (oh * 60 + om) * 60000); }
  if (d.getMonth() !== month - 1 && !m[7]) return null;
  return d;
}
export function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  const ext = (s.match(/ext\.?\s*(\d+)/i) || [])[1] || '';
  const main = s.replace(/ext\.?\s*\d+/i, '');
  const digits = main.replace(/[^\d]/g, '');
  if (digits.length < 6) return null;
  const plus = main.trim().startsWith('+') ? '+' : '';
  let out = `${plus}${digits}`;
  if (!plus && digits.length === 10) out = `+52${digits}`;
  else if (!plus && digits.length === 9) out = `+34${digits}`;
  else if (!plus && digits.length === 11 && digits.startsWith('1')) out = `+${digits}`;
  return ext ? `${out} ext ${ext}` : out;
}
const ownerIndex = () => OWNERS.filter((o) => o !== 'Sin asignar').map((name) => ({ name, email: `${strip(name).replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@omni.crm` }));
export function resolveOwner(raw) {
  const s = strip(raw);
  if (!s) return { value: '' };
  const byEmail = ownerIndex().filter((o) => o.email === s);
  if (byEmail.length === 1) return { value: byEmail[0].name };
  const byName = ownerIndex().filter((o) => strip(o.name) === s || strip(o.name).startsWith(s) || s.startsWith(strip(o.name).split(' ')[0]) && s.includes(strip(o.name).split(' ')[1] || '\u0000'));
  if (byName.length === 1) return { value: byName[0].name };
  if (byName.length > 1) return { value: '', error: 'MULTIPLE_OWNERS_FOUND' };
  return { value: '', error: 'OWNER_NOT_FOUND' };
}
const enumOptions = (p) => (Array.isArray(p.options) ? p.options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : { value: o, label: o })) : []);

// One cell → { value, error? }. Row-level errors are decided by planImport.
export function convertValue(p, raw, opts = {}) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: undefined };
  if (s.length > LIMITS.cellBytes) return { value: undefined, error: 'ROW_DATA_TOO_LARGE' };
  switch (p.kind) {
    case 'email': return EMAIL_RE.test(s) ? { value: s.toLowerCase() } : { value: undefined, error: p.key === 'email' ? 'INVALID_EMAIL' : 'INVALID_ADDITIONAL_EMAIL' };
    case 'phone': { const v = normalizePhone(s); return v ? { value: v } : { value: undefined, error: 'COULD_NOT_PARSE_NUMBER' }; }
    case 'number': case 'currency': case 'id': { const n = parseNumber(s, opts.numberFormat); return Number.isNaN(n) ? { value: undefined, error: 'COULD_NOT_PARSE_NUMBER' } : { value: n }; }
    case 'percent': { const n = parseNumber(s.replace('%', ''), opts.numberFormat); if (Number.isNaN(n)) return { value: undefined, error: 'COULD_NOT_PARSE_NUMBER' }; return { value: s.includes('%') || n > 1 ? n : Math.round(n * 10000) / 100 }; }
    case 'date': case 'datetime': { const d = parseDate(s, opts.dateFormat); if (!d) return { value: undefined, error: 'COULD_NOT_PARSE_DATE' }; const y = d.getFullYear(); if (y < 1900 || y > 2999) return { value: undefined, error: 'OUT_OF_VALID_DATE_RANGE' }; return { value: d.toISOString() }; }
    case 'bool': { const v = strip(s); if (BOOL_TRUE.includes(v)) return { value: 'Sí' }; if (BOOL_FALSE.includes(v)) return { value: 'No' }; return { value: undefined, error: 'INVALID_ENUMERATION_OPTION' }; }
    case 'user': return resolveOwner(s);
    case 'enum': case 'stage': case 'status': case 'priority': {
      const opts2 = enumOptions(p);
      if (!opts2.length) return { value: s };
      const hits = opts2.filter((o) => strip(o.label) === strip(s) || strip(o.value) === strip(s));
      if (hits.length === 1) return { value: hits[0].value };
      if (hits.length > 1) return { value: undefined, error: 'AMBIGUOUS_ENUMERATION_OPTION' };
      const partial = opts2.filter((o) => strip(o.label).startsWith(strip(s)));
      if (partial.length === 1) return { value: partial[0].value };
      return { value: undefined, error: partial.length > 1 ? 'AMBIGUOUS_ENUMERATION_OPTION' : 'INVALID_ENUMERATION_OPTION' };
    }
    case 'url': return { value: /^[a-z]+:\/\//i.test(s) ? s : `https://${s}` };
    default: return { value: s };
  }
}

// ---------- pre-validation for the mapping screen (first 1000 rows) ----------
export function validateColumns(table, mapping, opts = {}) {
  const sample = table.rows.slice(0, 1000);
  return mapping.map((m) => {
    if (!m.key || m.skip) return { ...m, errors: 0, badValues: [], rows: [] };
    const p = propByKey(m.key);
    if (!p) return { ...m, errors: 0, badValues: [], rows: [] };
    const bad = new Map();
    const rows = [];
    sample.forEach((r, i) => {
      const raw = applyReplacement(m, r[m.index]);
      if (raw === null) return;
      const res = convertValue(p, raw, opts);
      if (res.error) { bad.set(raw, { value: raw, code: res.error, count: (bad.get(raw)?.count || 0) + 1 }); rows.push(i + 2); }
    });
    return { ...m, errors: rows.length, badValues: [...bad.values()], rows };
  });
}
// Value replacements set on the mapping screen apply to every row; null means "no importar este valor".
export function applyReplacement(m, raw) {
  const v = String(raw ?? '').trim();
  if (m.dropped && m.dropped.includes(v)) return null;
  if (m.replacements && Object.prototype.hasOwnProperty.call(m.replacements, v)) return m.replacements[v];
  return v;
}

// ---------- plan: rows → create / update / skip with their errors ----------
export function planImport(table, mapping, options = {}) {
  const mode = options.mode || 'create_update';
  const uniqueKey = options.uniqueKey || (mapping.some((m) => m.key === 'hs_object_id' && !m.skip) ? 'hs_object_id' : 'email');
  const existing = allContacts();
  const byEmail = new Map();
  const byAltEmail = new Map();
  const byId = new Map();
  existing.forEach((c) => {
    if (c.email && !byEmail.has(String(c.email).toLowerCase())) byEmail.set(String(c.email).toLowerCase(), c); // the oldest record wins
    byId.set(String(c.id), c);
    String(c.hs_additional_emails || '').split(';').map((x) => x.trim().toLowerCase()).filter(Boolean).forEach((e) => byAltEmail.set(e, c));
    if (c.alt_email) byAltEmail.set(String(c.alt_email).toLowerCase(), c);
  });
  const active = mapping.filter((m) => m.key && !m.skip && propByKey(m.key));
  const unmapped = mapping.filter((m) => m.header && (!m.key || m.skip)).map((m) => m.header);
  const seenEmail = new Set();
  const seenId = new Set();
  const seenContent = new Set();
  const usedAltEmails = new Set([...byAltEmail.keys()]);
  const records = [];
  const errors = [];
  const addErr = (rowNumber, m, code) => errors.push({ row: rowNumber, column: m ? m.header : '', key: m ? m.key : '', code, impact: errorImpact(code), rowDropped: ROW_ERRORS.has(code) });
  table.rows.forEach((cells, i) => {
    const rowNumber = i + 2;
    const data = {};
    const rowErrors = [];
    let anyValue = false;
    active.forEach((m) => {
      const raw = applyReplacement(m, cells[m.index]);
      if (raw === null || raw === '') return;
      anyValue = true;
      const p = propByKey(m.key);
      const res = convertValue(p, raw, options);
      if (res.error) { rowErrors.push([m, res.error]); return; }
      if (res.value !== undefined) data[m.key] = res.value;
    });
    const content = JSON.stringify(cells.map((c) => String(c ?? '').trim()));
    let dropCode = null;
    if (!anyValue) dropCode = 'EMPTY_PROPERTY_VALUES_OBJECT';
    else if (rowErrors.some(([, code]) => code === 'ROW_DATA_TOO_LARGE')) dropCode = 'ROW_DATA_TOO_LARGE';
    else if (rowErrors.some(([m, code]) => m.key === 'email' && code === 'INVALID_EMAIL')) dropCode = 'INVALID_EMAIL';
    else if (rowErrors.length > LIMITS.errorsPerRow) dropCode = 'TOO_MANY_ERRORS_IN_ROW';
    else if (seenContent.has(content)) dropCode = 'DUPLICATE_ROW_CONTENT';
    seenContent.add(content);
    if (data.name && !data.first && !data.last) { const parts = String(data.name).split(' '); data.first = parts.shift(); data.last = parts.join(' '); }
    // additional e-mails: ; separated, each valid and not used by another contact
    if (data.hs_additional_emails !== undefined) {
      const ok = [];
      String(data.hs_additional_emails).split(';').map((e) => e.trim().toLowerCase()).filter(Boolean).forEach((e) => {
        const owner = byAltEmail.get(e) || byEmail.get(e);
        if (!EMAIL_RE.test(e) || (owner && String(owner.email).toLowerCase() !== String(data.email || '').toLowerCase() && !(uniqueKey === 'hs_object_id' && owner && String(owner.id) === String(data.hs_object_id)))) rowErrors.push([active.find((m) => m.key === 'hs_additional_emails'), 'INVALID_ADDITIONAL_EMAIL']);
        else ok.push(e);
      });
      if (ok.length) data.hs_additional_emails = ok.join(';'); else delete data.hs_additional_emails;
    }
    // match an existing contact: record ID prevails, then primary e-mail, then a secondary e-mail
    let match = null;
    if (!dropCode) {
      if (uniqueKey === 'hs_object_id' && data.hs_object_id !== undefined) {
        const id = String(Math.round(Number(data.hs_object_id)));
        if (seenId.has(id)) dropCode = 'DUPLICATE_RECORD_ID';
        else if (!byId.has(id)) dropCode = 'INVALID_RECORD_ID';
        else match = byId.get(id);
        seenId.add(id);
      } else if (data.email) {
        if (seenEmail.has(data.email)) dropCode = 'DUPLICATE_UNIQUE_PROPERTY_VALUE';
        seenEmail.add(data.email);
        match = byEmail.get(data.email) || byAltEmail.get(data.email) || null;
      }
    }
    if (!dropCode && !match && !REQUIRED_ANY.some((k) => data[k])) dropCode = 'MISSING_REQUIRED_PROPERTY';
    if (!dropCode && mode === 'create' && match) dropCode = 'CREATE_ONLY_IMPORT';
    if (!dropCode && mode === 'update' && !match) dropCode = 'UPDATE_ONLY_IMPORT';
    rowErrors.forEach(([m, code]) => addErr(rowNumber, m, code));
    if (dropCode) { if (!rowErrors.some(([, code]) => code === dropCode)) addErr(rowNumber, null, dropCode); records.push({ rowNumber, action: 'skip', code: dropCode, data, cells }); return; }
    delete data.hs_object_id;
    const secondary = match && String(match.email || '').toLowerCase() !== String(data.email || '').toLowerCase();
    if (secondary && uniqueKey !== 'hs_object_id') delete data.email; // a secondary e-mail never replaces the primary one unless the record ID is used
    records.push({ rowNumber, action: match ? 'update' : 'create', matchId: match ? match.id : null, secondary, data, cells });
  });
  unmapped.forEach((h) => errors.push({ row: 0, column: h, key: '', code: 'PROPERTY_DEFINITION_NOT_FOUND', impact: errorImpact('PROPERTY_DEFINITION_NOT_FOUND'), rowDropped: false }));
  (table.warnings || []).forEach((w) => errors.push({ row: 0, column: w.column, key: '', code: w.code, impact: errorImpact(w.code), rowDropped: false }));
  const summary = { rows: table.rows.length, toCreate: records.filter((r) => r.action === 'create').length, toUpdate: records.filter((r) => r.action === 'update').length, skipped: records.filter((r) => r.action === 'skip').length, errors: errors.length };
  return { records, errors, summary, mode, uniqueKey, headers: table.headers };
}

// ---------- history, limits and states ----------
const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
export const importHistory = () => read(IMPORTS_KEY, []);
export const saveHistory = (list) => write(IMPORTS_KEY, list);
export const importDetail = (id) => read(DETAIL_KEY(id), null);
export const saveDetail = (id, d) => write(DETAIL_KEY(id), d);
export function updateImport(id, patch) {
  const list = importHistory();
  const i = list.findIndex((r) => Number(r.id) === Number(id));
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch };
  saveHistory(list);
  return list[i];
}
export function setState(id, state, note) {
  const now = new Date().toISOString();
  const d = importDetail(id) || { timeline: [] };
  d.timeline = [...(d.timeline || []), { state, at: now, note: note || '' }];
  saveDetail(id, d);
  return updateImport(id, { state, ...(state === 'DONE' || state === 'FAILED' || state === 'CANCELED' ? { finishedAt: now } : {}) });
}
export function recentWindow(hours = 24) {
  const since = Date.now() - hours * 3600000;
  return importHistory().filter((r) => r.object === OBJECT && !r.sample && new Date(r.when).getTime() >= since);
}
// Imports left running by a closed tab can't finish: after 10 minutes they count as failed.
export function sweepStale() {
  const cutoff = Date.now() - 10 * 60000;
  importHistory().forEach((r) => {
    if ((r.state === 'PROCESSING' || r.state === 'STARTED') && new Date(r.when).getTime() < cutoff) setState(r.id, 'FAILED', 'Interrumpida: la pestaña se cerró durante el procesamiento.');
  });
}
export function canStart(rowCount) {
  const recent = recentWindow();
  if (recent.length >= LIMITS.importsPerDay) return { ok: false, code: 'LIMIT_EXCEEDED', reason: `Ya se hicieron ${LIMITS.importsPerDay} importaciones en las últimas 24 horas.` };
  const rows = recent.reduce((s, r) => s + (r.rows || 0), 0);
  if (rows + rowCount > LIMITS.rowsPerDay) return { ok: false, code: 'LIMIT_EXCEEDED', reason: `Con esta importación se superarían las ${LIMITS.rowsPerDay.toLocaleString('es-ES')} filas por día.` };
  if (rowCount > LIMITS.rowsPerFile) return { ok: false, code: 'LIMIT_EXCEEDED', reason: `El archivo supera las ${LIMITS.rowsPerFile.toLocaleString('es-ES')} filas por archivo.` };
  return { ok: true };
}
export const processingCount = () => importHistory().filter((r) => r.state === 'PROCESSING').length;

// Register the import (STARTED, or DEFERRED when three are already processing).
export function registerImport({ name, table, plan, options }) {
  const list = importHistory();
  const id = Math.max(0, ...list.map((r) => Number(r.id) || 0)) + 1;
  const deferred = processingCount() >= LIMITS.concurrent;
  const entry = {
    id, name, object: OBJECT, system: table.format === 'paste' ? 'paste' : 'file', source: table.format === 'paste' ? 'paste' : table.format, state: deferred ? 'DEFERRED' : 'STARTED',
    rows: table.rows.length, newRecords: 0, updated: 0, associations: 0, errors: plan.errors.length, by: ME, when: new Date().toISOString(), finishedAt: '', mode: plan.mode, uniqueKey: plan.uniqueKey, options,
  };
  saveHistory([entry, ...list]);
  saveDetail(id, { timeline: [{ state: entry.state, at: entry.when, note: deferred ? 'Hay 3 importaciones en proceso; esta empezará cuando termine una.' : '' }], headers: table.headers, mapping: options.mapping || [], errors: plan.errors, failedRows: plan.records.filter((r) => r.action === 'skip').map((r) => ({ row: r.rowNumber, code: r.code, cells: r.cells })), summary: plan.summary, pendingPlan: null });
  return entry;
}

// Apply the plan in chunks: records are created / updated, the entry moves STARTED → PROCESSING → DONE
// (or CANCELED when asked, FAILED on an unexpected error). Blank cells never clear existing values;
// "no sobrescribir" properties are only written when the contact has no value yet.
export async function runImport(id, plan, { onProgress, isCanceled, chunk = 40, pause = 60, sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const noOverwrite = new Set((plan.noOverwrite || []));
  const marketing = Boolean(plan.marketing);
  const result = { created: 0, updated: 0, failed: plan.records.filter((r) => r.action === 'skip').length, createdIds: [] };
  try {
    setState(id, 'PROCESSING');
    const todo = plan.records.filter((r) => r.action !== 'skip');
    for (let i = 0; i < todo.length; i += chunk) {
      if (isCanceled && isCanceled()) { setState(id, 'CANCELED', `Cancelada por el usuario tras ${result.created + result.updated} registros.`); updateImport(id, { newRecords: result.created, updated: result.updated }); return { ...result, state: 'CANCELED' }; }
      todo.slice(i, i + chunk).forEach((r) => {
        const stamp = { hs_import_ids: String(id) };
        if (marketing) stamp.hs_marketable_status = 'Contacto de marketing';
        if (r.action === 'create') {
          const data = { ...r.data, ...stamp };
          if (!data.name) data.name = [data.first, data.last].filter(Boolean).join(' ') || data.email || 'Sin nombre';
          const rec = addRecord(OBJECT, { owner: 'Sin asignar', status: 'new', lifecycle: 'Lead', source: 'Importación', lastActivity: TODAY.toISOString(), ...data });
          result.created += 1;
          result.createdIds.push(rec.id);
        } else {
          const current = allContacts().find((c) => Number(c.id) === Number(r.matchId));
          Object.entries(r.data).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') return; // blank cells are ignored
            if (noOverwrite.has(k) && current && current[k] !== undefined && current[k] !== null && current[k] !== '') return;
            if (k === 'hs_additional_emails' && current && current.hs_additional_emails) v = [...new Set([...String(current.hs_additional_emails).split(';'), ...String(v).split(';')].filter(Boolean))].join(';');
            setField(OBJECT, r.matchId, k, v);
          });
          if (r.data.first || r.data.last) { const c2 = allContacts().find((c) => Number(c.id) === Number(r.matchId)); if (c2) setField(OBJECT, r.matchId, 'name', [c2.first, c2.last].filter(Boolean).join(' ') || c2.name); }
          const prev = current ? String(current.hs_import_ids || '') : '';
          setField(OBJECT, r.matchId, 'hs_import_ids', [...new Set([...prev.split(';').filter(Boolean), String(id)])].join(';'));
          if (marketing) setField(OBJECT, r.matchId, 'hs_marketable_status', 'Contacto de marketing');
          result.updated += 1;
        }
      });
      updateImport(id, { newRecords: result.created, updated: result.updated });
      if (onProgress) onProgress({ done: Math.min(i + chunk, todo.length), total: todo.length, ...result });
      if (i + chunk < todo.length) await wait(pause);
    }
    setState(id, 'DONE');
    updateImport(id, { newRecords: result.created, updated: result.updated, errors: plan.errors.length });
    if (plan.createSegment) createSegment(id, plan.segmentName);
    return { ...result, state: 'DONE' };
  } catch (e) {
    setState(id, 'FAILED', e && e.message ? e.message : 'Error inesperado');
    updateImport(id, { newRecords: result.created, updated: result.updated });
    return { ...result, state: 'FAILED', error: e };
  }
}

// A saved view of the contacts list with the records of this import.
export function createSegment(id, name) {
  const store = getViewStore(OBJECT);
  const viewId = `imp${id}`;
  if (store.custom.some((v) => v.id === viewId)) return viewId;
  store.custom.push({ id: viewId, name: name || `Importación ${id}`, owner: ME, share: 'private', base: 'all', filters: {}, advanced: [{ key: 'hs_import_ids', op: 'contains', value: String(id), value2: '', group: 0, assoc: '', label: '' }], sort: { key: 'created', dir: -1 }, columns: ['name', 'email', 'phone', 'owner', 'created'], updated: Date.now() });
  store.open = [...(store.open || []), viewId];
  setViewStore(OBJECT, store);
  return viewId;
}

// ---------- downloads ----------
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const maskRow = (headers, mapping, cells) => cells.map((c, i) => { const m = (mapping || []).find((x) => x.index === i); return m && SENSITIVE_KEYS.has(m.key) && c ? 'ELIMINADO' : c; });
export function errorsCsv(detail) {
  const lines = ['Código de error,Tipo de objeto,Razón,Impacto,Fila,Columna,Valores'];
  (detail.errors || []).forEach((e) => {
    const failed = (detail.failedRows || []).find((r) => r.row === e.row);
    const values = failed ? maskRow(detail.headers, detail.mapping, failed.cells).join(' | ') : '';
    lines.push([e.code, 'Contacto', errorMeaning(e.code), e.impact, e.row || '', e.column, values].map(csvCell).join(','));
  });
  return lines.join('\n');
}
export function failedRowsCsv(detail) {
  const headers = ['Fila', 'Código de error', ...(detail.headers || [])];
  const lines = [headers.map(csvCell).join(',')];
  (detail.failedRows || []).forEach((r) => lines.push([r.row, r.code, ...maskRow(detail.headers, detail.mapping, r.cells)].map(csvCell).join(',')));
  return lines.join('\n');
}
export function sampleCsv() {
  return ['Nombre,Apellidos,Correo electrónico,Número de teléfono,Empresa,Cargo,Propietario del contacto,Etapa del ciclo de vida', 'Ana,Ejemplo,ana@ejemplo.com,+52 55 1234 5678,Cristales Ejemplo,Compras,Fernando L.,Lead', 'Luis,Muestra,luis@ejemplo.com,+34 600 000 000,Vidrios Muestra,Dirección,Sofía R.,Cliente'].join('\n');
}

// A .zip with stored (uncompressed) entries, enough for a couple of CSV files.
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zipFiles(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  files.forEach(({ name, text }) => {
    const data = enc.encode('﻿' + text);
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...nameBytes]);
    parts.push(local, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes]));
    offset += local.length + data.length;
  });
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  const total = parts.concat(central, [end]);
  const out = new Uint8Array(total.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  total.forEach((p) => { out.set(p, pos); pos += p.length; });
  return out;
}
export function estimateSeconds(rows) {
  return Math.max(1, Math.round(rows / 40) * 0.06 + 1);
}

// Realistic import files for the end-to-end check of the import wizard (scripts/smoke-import-e2e.mjs) and for
// trying the wizard by hand. `node scripts/import-fixtures.mjs` writes them to scripts/fixtures/import/:
//   contactos-100.xlsx            100 contacts with every edge case (see contactsFixture)
//   empresas-dominios.csv         companies with repeated domains (Excel-style «;» CSV)
//   negocios-pegado.tsv           deals to paste, pipeline and stage as text
//   tickets-pegado.tsv            tickets to paste, pipeline and status as text
//   tareas-pegado.tsv             tasks to paste
//   contactos-asociacion-empresa.csv  contacts with an «empresa por dominio» association column
// Every generator returns { headers, rows, expect }: `expect` says what the engine must do with each row, so
// the smoke never hard-codes counts that the file does not justify.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const XLSX = createRequire(import.meta.url)('xlsx');
const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = resolve(here, 'fixtures', 'import');

const FIRST = ['Ana', 'Luis', 'Marta', 'Jorge', 'Lucía', 'Carlos', 'Elena', 'Pablo', 'Sofía', 'Miguel', 'Laura', 'Diego', 'Carmen', 'Andrés', 'Paula', 'Javier', 'Isabel', 'Raúl', 'Nuria', 'Hugo'];
const LAST = ['Pérez', 'Gómez', 'Ruiz', 'Martín', 'Sánchez', 'López', 'Torres', 'Ramírez', 'Flores', 'Castro', 'Vega', 'Molina', 'Ortega', 'Navarro', 'Delgado', 'Iglesias', 'Serrano', 'Blanco', 'Rubio', 'Medina'];
const JOBS = ['Compras', 'Dirección', 'Arquitecta', 'Jefe de obra', 'Administración', 'Gerente de proyecto'];
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.');

// ---------------------------------------------------------------------------------------------------------------
// (a) 100 contacts: valid rows, malformed e-mails, duplicates inside the file and against the base, rows without
//     any required property, dates in several formats (and real Excel date cells), currency with symbols and
//     thousands separators (and real numeric cells), a custom property column, owners by name and by e-mail
//     (and unknown ones), enumeration values with and without accents, a bad one.
//   existing: 3 contacts of the base [{ email, first }] → rows that update them; companies: [{ name, domain }]
//   of the base → association by name / domain; stamp: live runs give every e-mail the smoke.<stamp>. prefix
//   and every first name the SMOKE prefix so the clean-up finds them.
// ---------------------------------------------------------------------------------------------------------------
export function contactsFixture({ existing = [], companies = [], stamp = '', ownerEmail = 'sofia.r@megaglass.us', customLabel = 'Zona comercial' } = {}) {
  const headers = ['Nombre', 'Apellidos', 'Correo electrónico', 'Número de teléfono', 'Empresa', 'Cargo', 'Propietario del contacto', 'Etapa del ciclo de vida', 'Fecha de nacimiento', 'Ingresos anuales', 'País/Región', customLabel, 'Estado del lead'];
  const rows = [];
  const expect = { rowCodes: {}, propertyErrors: {}, updates: [], ownerOf: {}, revenueOf: {}, birthOf: {}, companyRows: [], noCompanyRows: [], customOf: {}, emailOf: {}, phoneOf: {} };
  const email = (i) => (stamp ? `smoke.${stamp}.${i}@smoke-${stamp}-auto.test` : `${slug(FIRST[i % FIRST.length])}.${slug(LAST[(i * 7) % LAST.length])}${i}@ejemplo.com`);
  const first = (i) => `${stamp ? 'SMOKE ' : ''}${FIRST[i % FIRST.length]}`;
  const last = (i) => LAST[(i * 7) % LAST.length];
  const phones = (i) => [`+52 55 1234 ${String(5600 + i).padStart(4, '0')}`, `55-1234-${String(5600 + i).padStart(4, '0')}`, `(305) 555-${String(100 + i).padStart(4, '0')}`, `+34 600 000 ${String(100 + i).padStart(3, '0')}`][i % 4];
  const owners = ['Sofía R.', 'Diego G.', ownerEmail, '', 'laura m.'];
  const ownerNames = ['Sofía R.', 'Diego G.', 'Sofía R.', '', 'Laura M.'];
  const lifecycles = ['Lead', 'Cliente', 'Oportunidad', 'lead calificado por ventas', ''];
  const births = [['28/10/1990', '1990-10-28'], ['1990-10-28', '1990-10-28'], ['28-oct-1990', '1990-10-28'], ['28 octubre 1990', '1990-10-28'], ['', '']];
  const revenues = [['$1,250,000.50', 1250000.5], ['MXN 850.000,00', 850000], ['€ 12.500,75', 12500.75], ['1.234.567', 1234567], ['USD 99', 99], ['', undefined]];
  const countries = ['México', 'Mexico', 'España', 'Colombia', ''];
  const zones = ['Norte', 'Sur', 'Centro', 'Bajío'];
  const statuses = ['Nuevo', 'Abierto', 'En progreso', ''];
  const INVALID_EMAIL_ROWS = { 9: 'ana.perez@', 27: 'sin-arroba.com', 48: 'luis@@ejemplo.com', 73: 'pepe ejemplo.com' };
  const DUP_ROWS = { 15: (i) => email(i - 10), 33: (i) => `  ${email(i - 13).toUpperCase()} `, 61: (i) => `mailto:${email(i - 17)}` }; // repeats of rows 5, 20 and 44
  const EXISTING_ROWS = [11, 39, 70];
  const MISSING_ROWS = [24, 85];
  for (let n = 2; n <= 101; n += 1) {
    const i = n - 2;
    const co = companies.length ? companies[i % (companies.length + 2)] : null; // every (companies+2)th row: a name, a domain, unknown, blank
    const companyCell = co ? (i % 2 ? co.domain : co.name) : i % (companies.length + 2) === companies.length ? 'Empresa Fantasma' : '';
    let row = [first(i), last(i), email(i), phones(i), companyCell, JOBS[i % JOBS.length], owners[i % owners.length], lifecycles[i % lifecycles.length], births[i % births.length][0], revenues[i % revenues.length][0], countries[i % countries.length], zones[i % zones.length], statuses[i % statuses.length]];
    let code = null;
    const prop = [];
    if (INVALID_EMAIL_ROWS[n]) { row[2] = INVALID_EMAIL_ROWS[n]; code = 'INVALID_EMAIL'; }
    else if (DUP_ROWS[n]) { row[2] = DUP_ROWS[n](i); code = 'DUPLICATE_UNIQUE_PROPERTY_VALUE'; }
    else if (MISSING_ROWS.includes(n)) { row = ['', '', '', phones(i), companyCell, JOBS[i % JOBS.length], '', '', '', '', '', '', '']; code = 'MISSING_REQUIRED_PROPERTY'; }
    else if (EXISTING_ROWS.includes(n) && existing[EXISTING_ROWS.indexOf(n)]) { const ex = existing[EXISTING_ROWS.indexOf(n)]; row[0] = ex.first || row[0]; row[2] = ex.email; row[5] = `Actualizado ${n}`; expect.updates.push({ row: n, email: ex.email, jobTitle: `Actualizado ${n}`, companyId: co ? co.id : null }); }
    if (!code) {
      if (n === 4) { row[8] = new Date(1990, 9, 28); row[9] = 125000.5; } // real Excel date and number cells
      if (n === 30) { row[3] = 5512345678; expect.phoneOf[n] = '+525512345678'; } // a phone typed as a number
      if (n === 7) { row[8] = '10/28/1990'; prop.push('COULD_NOT_PARSE_DATE'); } // month-day-year in a day-month-year file
      if (n === 52) { row[8] = '31/02/1990'; prop.push('COULD_NOT_PARSE_DATE'); }
      if (n === 13) { row[6] = 'Nadie Pérez'; prop.push('OWNER_NOT_FOUND'); }
      if (n === 58) { row[6] = 'nadie@megaglass.us'; prop.push('OWNER_NOT_FOUND'); }
      if (n === 17) { row[7] = 'Astronauta'; prop.push('INVALID_ENUMERATION_OPTION'); }
      if (n === 66) { row[9] = 'mucho'; prop.push('COULD_NOT_PARSE_NUMBER'); }
      const ownerName = [13, 58].includes(n) ? '' : ownerNames[i % owners.length];
      if (!expect.updates.some((u) => u.row === n)) {
        expect.emailOf[n] = String(row[2]).toLowerCase();
        expect.ownerOf[n] = ownerName || 'Sin asignar';
        expect.revenueOf[n] = n === 4 ? 125000.5 : n === 66 ? undefined : revenues[i % revenues.length][1];
        expect.birthOf[n] = [7, 52].includes(n) ? '' : n === 4 ? '1990-10-28' : births[i % births.length][1];
        expect.customOf[n] = zones[i % zones.length];
        if (co) expect.companyRows.push({ row: n, companyId: co.id, name: co.name });
        else expect.noCompanyRows.push(n);
      }
    }
    if (code) expect.rowCodes[n] = code;
    if (prop.length) expect.propertyErrors[n] = prop;
    rows.push(row);
  }
  const skipped = Object.keys(expect.rowCodes).length;
  expect.rows = rows.length;
  expect.skipped = skipped;
  expect.updated = expect.updates.length;
  expect.created = rows.length - skipped - expect.updates.length;
  expect.propertyErrorCount = Object.values(expect.propertyErrors).reduce((s, l) => s + l.length, 0);
  expect.customLabel = customLabel;
  return { headers, rows, expect };
}
export function contactsXlsx(fx) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([fx.headers, ...fx.rows], { cellDates: true }), 'Contactos');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }));
}

// ---------------------------------------------------------------------------------------------------------------
// (b) companies with repeated domains: Excel's «;» CSV with a quoted name that contains «;»
//   existing: one company of the base { name, domain } → updated (new city)
// ---------------------------------------------------------------------------------------------------------------
export function companiesFixture({ existing = null, stamp = '' } = {}) {
  const p = stamp ? 'SMOKE ' : '';
  const d = (s) => (stamp ? `smoke-${stamp}-${s}` : s);
  const headers = ['Nombre de la empresa', 'Nombre de dominio de la empresa', 'Número de teléfono', 'Sector', 'Ciudad', 'Propietario de la empresa', 'Número de empleados', 'Ingresos anuales'];
  const rows = [
    [`${p}Cristales del Norte`, `${d('cristalesdelnorte')}.com`, '+52 81 1234 5678', 'Construcción', 'Monterrey', 'Sofía R.', '120', '2.500.000'],
    [`${p}Cristales del Norte S.A.`, `https://www.${d('cristalesdelnorte')}.com/contacto`, '', 'Construcción', 'Monterrey', '', '', ''],
    [`${p}Vidrios Sur`, `${d('vidriossur')}.mx`, '33 1234 5678', 'Arquitectura', 'Guadalajara', 'Diego G.', '45', '850.000,00'],
    [`${p}VIDRIOS SUR`, `WWW.${d('vidriossur').toUpperCase()}.MX`, '', '', '', '', '', ''],
    existing ? [existing.name, existing.domain, '', '', `Ciudad nueva ${stamp || 'CSV'}`, '', '', ''] : [`${p}Sin Base`, `${d('sinbase')}.com`, '', '', 'Ciudad nueva', '', '', ''],
    ['', `${d('aluminios-centro')}.com`, '+52 55 9999 0000', 'Reformas', 'Ciudad de México', '', '8', ''],
    [`${p}Sin Dominio SA`, '', '+34 600 111 222', 'Decoración', 'Madrid', 'Laura M.', '', ''],
    ['', '', '+34 600 333 444', 'Reformas', 'Valencia', '', '', ''],
    [`${p}Dominio Malo`, 'no es un dominio', '', 'Inmobiliaria', 'Sevilla', '', '', ''],
    [`${p}Ventanas Este`, `${d('ventanaseste')}.es`, '+34 960 000 000', 'Fabricación de vidrio', 'Valencia', 'Sofía R.', '1.200', '€ 3.400.000'],
    [`${p}Vidrios Sur Filial`, `${d('vidriossur')}.mx`, '', '', '', '', '', ''],
    [`${p}Acristalamientos Luz; S.L.`, `${d('acristalamientosluz')}.es`, '+34 910 000 000', 'Arquitectura', 'Madrid', '', '12', '450.000'],
  ];
  const expect = {
    rows: rows.length,
    rowCodes: { 3: 'DUPLICATE_UNIQUE_PROPERTY_VALUE', 5: 'DUPLICATE_UNIQUE_PROPERTY_VALUE', 9: 'MISSING_REQUIRED_PROPERTY', 12: 'DUPLICATE_UNIQUE_PROPERTY_VALUE' },
    propertyErrors: { 10: ['PROPERTY_VALIDATION_RULE_ERROR'] },
    updates: existing ? [{ row: 6, domain: existing.domain, city: `Ciudad nueva ${stamp || 'CSV'}` }] : [],
    domainOf: { 2: `${d('cristalesdelnorte')}.com`, 4: `${d('vidriossur')}.mx`, 7: `${d('aluminios-centro')}.com`, 11: `${d('ventanaseste')}.es`, 13: `${d('acristalamientosluz')}.es` },
    employeesOf: { 2: 120, 4: 45, 7: 8, 11: 1200, 13: 12 },
    revenueOf: { 2: 2500000, 4: 850000, 11: 3400000, 13: 450000 },
    nameOf: { 7: `${d('aluminios-centro')}.com`, 13: `${p}Acristalamientos Luz; S.L.` },
  };
  expect.skipped = Object.keys(expect.rowCodes).length;
  expect.updated = expect.updates.length;
  expect.created = rows.length - expect.skipped - expect.updated;
  return { headers, rows, expect };
}
const csvCell = (v, sep) => { const s = String(v ?? ''); return s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (fx, sep = ',') => '﻿' + [fx.headers, ...fx.rows].map((r) => r.map((c) => csvCell(c instanceof Date ? c.toISOString().slice(0, 10) : c, sep)).join(sep)).join('\r\n') + '\r\n';
export const toTsv = (fx) => [fx.headers, ...fx.rows].map((r) => r.map((c) => String(c ?? '')).join('\t')).join('\n');

// ---------------------------------------------------------------------------------------------------------------
// (c) deals and tickets to paste, with the pipeline and the stage / status written as text (labels, keys, case)
//   pipelines: [{ name, stages: [[key, label], ...] }] (deals: data.dealPipelines / stagesFor; tickets:
//   ticketPipelines / ticketStatusesFor); companies: [{ name, domain }] of the base for the association
// ---------------------------------------------------------------------------------------------------------------
export function dealsFixture({ pipelines, companies = [], stamp = '' } = {}) {
  const p = stamp ? 'SMOKE ' : '';
  const [P1, P2] = pipelines;
  const other = P2 ? P2.stages.find((s) => !P1.stages.some((t) => t[0] === s[0] || t[1].toLowerCase() === s[1].toLowerCase())) : null;
  const headers = ['Nombre del negocio', 'Pipeline', 'Etapa del negocio', 'Importe', 'Moneda', 'Fecha de cierre', 'Propietario del negocio', 'Empresa asociada', 'Prioridad', 'Tipo de negocio'];
  const rows = [
    [`${p}Instalación fachada Torre Norte`, P1.name, P1.stages[0][1], '$1,250,000.50', 'MXN', '31/12/2026', 'Sofía R.', companies[0] ? companies[0].name : '', 'Alta', 'Nuevo negocio'],
    [`${p}Ventanas residencial`, P1.name.toLowerCase(), (P1.stages[1] || P1.stages[0])[1].toLowerCase(), '85.000,00', 'EUR', '2026-11-30', '', companies[1] ? companies[1].domain : '', 'media', 'Negocio existente'],
    [`${p}Etapa de otro pipeline`, P1.name, other ? other[1] : 'Etapa inexistente', '100', '', '', '', '', '', ''],
    [`${p}Pipeline inexistente`, 'Pipeline Fantasma', P1.stages[0][1], '100', '', '', '', '', '', ''],
    [`${p}Sin etapa`, P1.name, '', '100', '', '', '', '', '', ''],
    [`${p}Empresa desconocida`, P1.name, P1.stages[0][0], '5000', '', '15/01/2027', '', 'Empresa Fantasma', '', ''],
    [`${p}Importe raro`, P1.name, P1.stages[0][1], 'mucho', 'USD', '', 'Diego G.', '', 'Baja', ''],
    [`${p}Cierre día-mes`, P1.name, P1.stages[0][1], '100', 'USD', '02/03/2027', '', '', '', ''],
  ];
  const expect = {
    rows: rows.length,
    rowCodes: { 4: 'INVALID_DEAL_STAGE', 5: 'INVALID_PIPELINE', 6: 'MISSING_REQUIRED_PROPERTY' },
    propertyErrors: { 7: ['ASSOCIATION_RECORD_NOT_FOUND'], 8: ['COULD_NOT_PARSE_NUMBER'] },
    stageOf: { 2: P1.stages[0][0], 3: (P1.stages[1] || P1.stages[0])[0], 7: P1.stages[0][0], 8: P1.stages[0][0], 9: P1.stages[0][0] },
    amountOf: { 2: 1250000.5, 3: 85000, 7: 5000, 8: 0, 9: 100 },
    closeOf: { 2: '2026-12-31', 3: '2026-11-30', 7: '2027-01-15', 9: '2027-03-02' },
    currencyOf: { 2: 'MXN', 3: 'EUR', 8: 'USD', 9: 'USD' },
    companyRows: [companies[0] ? { row: 2, companyId: companies[0].id, name: companies[0].name } : null, companies[1] ? { row: 3, companyId: companies[1].id, name: companies[1].name } : null].filter(Boolean),
    ownerOf: { 2: 'Sofía R.', 8: 'Diego G.' },
    priorityOf: { 2: 'high', 3: 'medium', 8: 'low' },
  };
  expect.skipped = Object.keys(expect.rowCodes).length;
  expect.updated = 0;
  expect.created = rows.length - expect.skipped;
  expect.associations = expect.companyRows.length;
  return { headers, rows, expect };
}
export function ticketsFixture({ pipelines, stamp = '' } = {}) {
  const p = stamp ? 'SMOKE ' : '';
  const [P1, P2] = pipelines;
  const other = P2 ? P2.stages.find((s) => !P1.stages.some((t) => t[0] === s[0] || t[1].toLowerCase() === s[1].toLowerCase())) : null;
  const headers = ['Nombre del ticket', 'Pipeline', 'Estado del ticket', 'Prioridad', 'Propietario del ticket', 'Descripción', 'Fuente', 'Categoría'];
  const rows = [
    [`${p}Cristal roto en entrega`, P1.name, P1.stages[0][1], 'Alta', 'Diego G.', 'El cliente pide reposición del cristal templado.', 'Correo', 'Facturación'],
    [`${p}Duda sobre garantía`, P1.name, P1.stages[0][0], 'media', '', 'Pregunta por la garantía del DVH.', 'Teléfono', 'Consulta general'],
    [`${p}Estado de otro pipeline`, P1.name, other ? other[1] : 'Estado inexistente', '', '', '', '', ''],
    [`${p}Pipeline inexistente`, 'Pipeline Fantasma', P1.stages[0][1], '', '', '', '', ''],
    ['', P1.name, P1.stages[0][1], 'Baja', '', 'Sin nombre', '', ''],
    [`${p}Prioridad rara`, P1.name, (P1.stages[1] || P1.stages[0])[1], 'urgente', 'Sofía R.', '', 'Chat', ''],
    [`${p}Medidas incorrectas`, P1.name.toUpperCase(), (P1.stages[1] || P1.stages[0])[1].toUpperCase(), 'baja', 'Laura M.', 'Las medidas del marco no coinciden.', 'WhatsApp', 'Problema con el producto'],
  ];
  const expect = {
    rows: rows.length,
    rowCodes: { 4: 'INVALID_DEAL_STAGE', 5: 'INVALID_PIPELINE', 6: 'MISSING_REQUIRED_PROPERTY' },
    propertyErrors: { 7: ['INVALID_ENUMERATION_OPTION'] },
    statusOf: { 2: P1.stages[0][0], 3: P1.stages[0][0], 7: (P1.stages[1] || P1.stages[0])[0], 8: (P1.stages[1] || P1.stages[0])[0] },
    priorityOf: { 2: 'high', 3: 'medium', 7: 'medium', 8: 'low' },
    ownerOf: { 2: 'Diego G.', 7: 'Sofía R.', 8: 'Laura M.' },
    pipelineOf: { 8: P1.name },
  };
  expect.skipped = Object.keys(expect.rowCodes).length;
  expect.updated = 0;
  expect.created = rows.length - expect.skipped;
  return { headers, rows, expect };
}
export function tasksFixture({ stamp = '' } = {}) {
  const p = stamp ? 'SMOKE ' : '';
  const headers = ['Título', 'Fecha de vencimiento', 'Tipo de tarea', 'Prioridad', 'Asignada a', 'Estado', 'Notas'];
  const rows = [
    [`${p}Llamar a Ana Pérez`, '15/12/2026 10:30', 'Llamada', 'Alta', 'Sofía R.', 'No iniciada', 'Confirmar medidas antes de fabricar.'],
    [`${p}Enviar cotización`, '2026-12-20', 'Correo', 'media', '', 'En curso', ''],
    [`${p}Sin fecha`, '', 'Tarea', '', '', '', ''],
    [`${p}Fecha mala`, '99/99/2026', 'Tarea', '', '', '', ''],
    [`${p}Estado raro`, '1/1/2027', 'Tarea', '', '', 'Volando', ''],
    [`${p}Revisar obra`, '28-feb-2027', 'Tarea', 'Baja', 'Diego G.', 'Completada', ''],
  ];
  const expect = {
    rows: rows.length,
    rowCodes: { 4: 'MISSING_REQUIRED_PROPERTY', 5: 'MISSING_REQUIRED_PROPERTY' },
    propertyErrors: { 5: ['COULD_NOT_PARSE_DATE'], 6: ['INVALID_ENUMERATION_OPTION'] },
    dueOf: { 2: '2026-12-15', 3: '2026-12-20', 6: '2027-01-01', 7: '2027-02-28' },
    statusOf: { 2: 'todo', 3: 'in-progress', 6: 'todo', 7: 'done' },
    ownerOf: { 2: 'Sofía R.', 7: 'Diego G.' },
    typeOf: { 2: 'Llamada', 3: 'Correo', 7: 'Tarea' },
  };
  expect.skipped = Object.keys(expect.rowCodes).length;
  expect.updated = 0;
  expect.created = rows.length - expect.skipped;
  return { headers, rows, expect };
}

// ---------------------------------------------------------------------------------------------------------------
// (d) contacts with an association column: the company by its domain (exact, with https://www, upper case), an
//     unknown domain, a name two companies share (ambiguous: imported, not associated)
//   companies: [{ id, name, domain }] ×2 of the base; ambiguousName: a name two companies of the base share
// ---------------------------------------------------------------------------------------------------------------
export function contactsAssocFixture({ companies = [], ambiguousName = '', stamp = '' } = {}) {
  const p = stamp ? 'SMOKE ' : '';
  const email = (n) => (stamp ? `smoke.${stamp}.a${n}@smoke-${stamp}-auto.test` : `asoc.${n}@ejemplo.com`);
  const [A, B] = companies;
  const headers = ['Nombre', 'Apellidos', 'Correo electrónico', 'Nombre de dominio de la empresa', 'Cargo'];
  const rows = [
    [`${p}Rosa`, 'Campos', email(1), A ? A.domain : 'cristales-a.com', 'Compras'],
    [`${p}Tomás`, 'Lara', email(2), B ? `https://www.${B.domain}/` : 'https://www.vidrios-b.com/', 'Dirección'],
    [`${p}Inés`, 'Prado', email(3), 'empresa-inexistente.com', 'Obra'],
    [`${p}Óscar`, 'Peña', email(4), ambiguousName || 'Empresa Repetida', 'Ventas'],
    [`${p}Celia`, 'Mora', email(5), A ? `WWW.${A.domain.toUpperCase()}` : 'WWW.CRISTALES-A.COM', 'Compras'],
  ];
  const expect = {
    rows: rows.length,
    rowCodes: {},
    propertyErrors: ambiguousName ? { 5: ['MULTIPLE_COMPANIES_WITH_DOMAIN'] } : {},
    companyRows: [A ? { row: 2, companyId: A.id, name: A.name } : null, B ? { row: 3, companyId: B.id, name: B.name } : null, A ? { row: 6, companyId: A.id, name: A.name } : null].filter(Boolean),
    unlinkedRows: [4, 5],
  };
  expect.skipped = 0;
  expect.updated = 0;
  expect.created = rows.length;
  expect.associations = expect.companyRows.length;
  return { headers, rows, expect };
}

// ---------- write the files (for trying the wizard by hand) ----------
export function writeFixtures(dir = FIXTURE_DIR, { pipelines } = {}) {
  mkdirSync(dir, { recursive: true });
  const deals = pipelines?.deals || [{ name: 'Pipeline de ventas', stages: [['appointmentscheduled', 'Cita programada'], ['qualifiedtobuy', 'Calificado para comprar'], ['closedwon', 'Cierre ganado']] }, { name: 'Pipeline secundario', stages: [['presentation', 'Presentación'], ['lost', 'Cierre perdido']] }];
  const tickets = pipelines?.tickets || [{ name: 'Pipeline de soporte', stages: [['new', 'Nuevo'], ['waiting', 'Esperando al contacto'], ['closed', 'Cerrado']] }, { name: 'Pipeline de cotizaciones', stages: [['quote', 'Cotización enviada']] }];
  const companies = [{ id: 1, name: 'Cristales Ejemplo', domain: 'cristalesejemplo.com' }, { id: 2, name: 'Vidrios Muestra', domain: 'vidriosmuestra.es' }];
  const out = {
    'contactos-100.xlsx': contactsXlsx(contactsFixture({ existing: [{ email: 'ana@ejemplo.com', first: 'Ana' }, { email: 'luis@ejemplo.com', first: 'Luis' }, { email: 'eva@ejemplo.com', first: 'Eva' }], companies })),
    'empresas-dominios.csv': toCsv(companiesFixture({ existing: companies[0] }), ';'),
    'negocios-pegado.tsv': toTsv(dealsFixture({ pipelines: deals, companies })),
    'tickets-pegado.tsv': toTsv(ticketsFixture({ pipelines: tickets })),
    'tareas-pegado.tsv': toTsv(tasksFixture()),
    'contactos-asociacion-empresa.csv': toCsv(contactsAssocFixture({ companies, ambiguousName: 'Empresa Repetida' })),
  };
  for (const [name, content] of Object.entries(out)) writeFileSync(resolve(dir, name), content);
  return Object.keys(out).map((n) => resolve(dir, n));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = writeFixtures();
  console.log(`[import-fixtures] ${files.length} archivos en ${FIXTURE_DIR}`);
}

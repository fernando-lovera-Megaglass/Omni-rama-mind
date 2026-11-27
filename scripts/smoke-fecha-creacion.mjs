// Fecha de creación real (decisión del usuario, 27-nov-2026): un registro creado desde la app sella `created` con
// el momento real; los defaults de importación (lastActivity, closeDate) también; un archivo de HubSpot con
// «Create Date» / «Fecha de creación» conserva la fecha original; la siembra demo sigue anclada a TODAY y no
// cambia. Run: node scripts/smoke-fecha-creacion.mjs
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[fecha-creacion]', ...a);
let failures = 0;
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { failures += 1; console.error(`[fecha-creacion] FAIL: ${msg}`); } };
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const dom = new JSDOM('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="imp-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/data/import/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = storage;
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;
globalThis.CSS = dom.window.CSS;
globalThis.history = dom.window.history;
dom.window.confirm = () => true;

const data = await import(resolve(here, '../src/data.js'));
const E = await import(resolve(here, '../src/import-engine.js'));

const DAY = 86400000;
const t0 = Date.now();
const near = (iso, ref = t0, tol = 15000) => Boolean(iso) && Math.abs(new Date(iso).getTime() - ref) <= tol;
const sameDay = (iso, ref) => new Date(iso).toDateString() === new Date(ref).toDateString();
const anchor = data.TODAY.toISOString();

// ---------- 1. la siembra demo no cambia: sigue anclada a TODAY, ningún registro sembrado lleva la fecha de hoy ----------
check(data.TODAY.getFullYear() === 2026 && data.TODAY.getMonth() === 10 && data.TODAY.getDate() === 7, `la siembra demo conserva su ancla TODAY = ${anchor.slice(0, 10)}`);
for (const type of ['contacts', 'companies', 'deals', 'tickets', 'tasks']) {
  const rows = data.ALL[type]();
  const stale = rows.filter((r) => new Date(r.created).getTime() <= data.TODAY.getTime()).length;
  const fresh = rows.filter((r) => near(r.created)).length;
  check(rows.length > 0 && stale === rows.length && fresh === 0, `${type}: ${rows.length} sembrados, todos con fecha ≤ ancla (${stale}) y ninguno con la fecha de hoy (${fresh})`);
}

// ---------- 2. registros creados desde la app: created = momento real ----------
const pipe = data.dealPipelineDefs()[0];
const stage = pipe.stages.find((s) => !data.isClosedStage(s[0]));
const tpipe = data.ticketPipelines()[0];
const made = {
  contacts: data.addRecord('contacts', { first: 'SMOKE', last: 'Fecha real', name: 'SMOKE Fecha real', email: `smoke.fecha.${t0}@ejemplo.com`, owner: 'Sin asignar', lifecycle: 'Lead', status: 'new' }),
  companies: data.addRecord('companies', { name: `SMOKE Empresa fecha ${t0}`, domain: `smoke-fecha-${t0}.test`, owner: 'Sin asignar', lifecycle: 'Lead' }),
  deals: data.addRecord('deals', { name: `SMOKE Negocio fecha ${t0}`, amount: 10, pipeline: pipe.name, stage: stage[0], owner: 'Sin asignar', closeDate: new Date(t0 + 10 * DAY).toISOString() }),
  tickets: data.addRecord('tickets', { name: `SMOKE Ticket fecha ${t0}`, pipeline: tpipe, status: data.firstOpenTicketStatus(tpipe), priority: 'medium', owner: 'Sin asignar', source: 'Correo' }),
  tasks: data.addRecord('tasks', { name: `SMOKE Tarea fecha ${t0}`, type: 'Tarea', status: 'todo', priority: 'medium', owner: 'Sin asignar', due: new Date(t0 + DAY).toISOString() }),
};
for (const [type, rec] of Object.entries(made)) {
  const stored = data.findRecord(type, rec.id);
  check(near(rec.created) && near(stored?.created) && !sameDay(rec.created, anchor), `${type}: addRecord sella created con la hora real (${rec.created}), no con el ancla ${anchor.slice(0, 10)}`);
}
const items = data.addLineItems(made.deals.id, [{ name: 'SMOKE Partida', quantity: 1, price: 5, currency: 'MXN' }]);
check(items.length === 1 && near(items[0].created), `partidas: addLineItems sella created con la hora real (${items[0]?.created})`);
// an explicit created (e.g. the import of a HubSpot file) wins over the stamp
const explicit = data.addRecord('contacts', { first: 'SMOKE', last: 'Fecha explícita', name: 'SMOKE Fecha explícita', email: `smoke.explicita.${t0}@ejemplo.com`, owner: 'Sin asignar', lifecycle: 'Lead', status: 'new', created: '2023-05-04T10:00:00.000Z' });
check(explicit.created === '2023-05-04T10:00:00.000Z', 'addRecord respeta un created explícito (la fecha original de un archivo)');

// ---------- 3. importación: defaults con la fecha real; la fecha original del archivo se conserva ----------
const run = async (type, text, options = {}) => {
  const table = E.parsePasted(text);
  const mapping = E.autoMap(table.headers, options.language || 'es', type);
  const plan = E.planImport(table, mapping, { object: type, mode: 'create_update', dateFormat: 'dmy', ...options });
  if (plan.errors.length) log(`${type}: avisos del plan →`, plan.errors.map((e) => `${e.row}:${e.code}${e.column ? `(${e.column})` : ''}`).join(' '));
  const entry = E.registerImport({ name: `SMOKE fecha ${type}`, table, plan, options: { mode: 'create_update', mapping, object: type } });
  const result = await E.runImport(entry.id, { ...plan, noOverwrite: [], createSegment: false }, { chunk: 10, sleep: () => Promise.resolve() });
  return { mapping, plan, result, records: result.createdIds.map((id) => data.findRecord(type, id)) };
};

// 3a. contactos sin columna de fecha: created y lastActivity = momento de la importación
const a = await run('contacts', ['Nombre\tApellidos\tCorreo electrónico', `Importado\tSinFecha\tsmoke.sinfecha.${t0}@ejemplo.com`].join('\n'));
check(a.result.state === 'DONE' && a.records.length === 1, `importación contactos sin fecha: DONE con ${a.records.length} creado`);
check(near(a.records[0]?.created) && near(a.records[0]?.lastActivity), `  created (${a.records[0]?.created}) y lastActivity (${a.records[0]?.lastActivity}) usan la fecha real, no ${anchor.slice(0, 10)}`);

// 3b. negocios sin fecha de cierre: closeDate = hoy real + 30 días
const d = await run('deals', ['Nombre del negocio\tPipeline\tEtapa del negocio', `SMOKE Negocio importado ${t0}\t${pipe.name}\t${stage[1]}`].join('\n'));
check(d.result.state === 'DONE' && d.records.length === 1, `importación negocios: DONE con ${d.records.length} creado`);
check(near(d.records[0]?.closeDate, t0 + 30 * DAY, 60000) && near(d.records[0]?.lastActivity), `  closeDate = hoy real + 30 días (${d.records[0]?.closeDate?.slice(0, 10)}), lastActivity real`);

// 3c. archivo de HubSpot en inglés: «Create Date» se mapea solo y se conserva la fecha original
const en = await run('contacts', ['First Name\tLast Name\tEmail\tCreate Date', `Hub\tSpot\tsmoke.hubspot.${t0}@ejemplo.com\t2024-03-15 14:22`].join('\n'), { language: 'en' });
check(en.mapping.map((m) => m.key).join(',') === 'first,last,email,created', `HubSpot EN: «Create Date» se mapea a created (${en.mapping.map((m) => m.key || '∅').join(',')})`);
check(en.records.length === 1 && new Date(en.records[0]?.created).getTime() === new Date(2024, 2, 15, 14, 22).getTime(), `  el contacto conserva su fecha original 15-mar-2024 14:22 (${en.records[0]?.created})`);
check(near(en.records[0]?.lastActivity), `  lastActivity sigue siendo el momento real de la importación (${en.records[0]?.lastActivity})`);

// 3d. exportación de HubSpot en español: «Fecha de creación» igual
const es = await run('companies', ['Nombre de la empresa\tNombre de dominio de la empresa\tFecha de creación', `SMOKE Empresa HubSpot ${t0}\tsmoke-hub-${t0}.test\t03/02/2022 09:30`].join('\n'));
check(es.mapping.map((m) => m.key).join(',') === 'name,domain,created', `HubSpot ES: «Fecha de creación» se mapea a created (${es.mapping.map((m) => m.key || '∅').join(',')})`);
check(es.records.length === 1 && new Date(es.records[0]?.created).getTime() === new Date(2022, 1, 3, 9, 30).getTime(), `  la empresa conserva su fecha original 3-feb-2022 09:30 (${es.records[0]?.created})`);

// 3e. una fila que actualiza un registro existente no toca su created si el archivo no trae fecha
const before = data.findRecord('contacts', a.records[0].id).created;
const upd = await run('contacts', ['Nombre\tApellidos\tCorreo electrónico\tCiudad', `Importado\tActualizado\tsmoke.sinfecha.${t0}@ejemplo.com\tMonterrey`].join('\n'));
const after = data.findRecord('contacts', a.records[0].id);
check(upd.result.updated === 1 && after.created === before && after.city === 'Monterrey', `actualizar por importación conserva created (${after.created})`);

// ---------- 4. los sembrados siguen igual después de todo ----------
const seededNow = data.ALL.contacts().filter((r) => !/^SMOKE|^Importado|^Hub /.test(r.name || '') && near(r.created)).length;
check(seededNow === 0, 'ningún registro sembrado cambió de fecha (no se reescribe lo existente)');

if (failures) { console.error(`[fecha-creacion] ${failures} comprobaciones fallaron`); process.exit(1); }
log('todo en verde');

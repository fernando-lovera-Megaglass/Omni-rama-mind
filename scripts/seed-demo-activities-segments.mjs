// Seeds clearly fictional test data into the Supabase tables `activities` and `segments`, respecting their
// current schema, so the timeline and the segments module can be tried with real rows:
//   · ~30 activities of the last three weeks (notes, calls with outcomes/durations, e-mails, meetings),
//     attached to existing sample contacts, companies and deals, with the same `extra` fields the record
//     page writes (outcome, direction, durationMin, locationType, subject).
//   · 12 segments (active and static, over contacts, companies and deals) whose `filters` use the segment
//     editor's real condition format, some inside folders; static ones carry their member ids.
// Every row is tagged with extra.seed so re-running replaces the previous seed without touching anything
// else. Phase 2 loads the app's own modules to compute the live size of each active segment and to confirm
// the timelines read the rows. Run: node --env-file=.env scripts/seed-demo-activities-segments.mjs
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (usa node --env-file=.env).'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const SEED = 'omni-demo-2026-11';
const log = (...a) => console.log('[seed]', ...a);
const fail = (msg) => { console.error(`[seed] FAIL: ${msg}`); process.exit(1); };

// ---------- the sample records the rows attach to (must exist) ----------
const pick = async (table, ids, cols) => {
  const { data, error } = await sb.from(table).select(cols).in('id', ids).order('id');
  if (error) fail(`${table}: ${error.message}`);
  const missing = ids.filter((id) => !data.some((r) => Number(r.id) === id));
  if (missing.length) fail(`${table}: faltan los ids ${missing.join(', ')}`);
  return Object.fromEntries(data.map((r) => [r.id, r]));
};
const CONTACT_IDS = [1, 2, 3, 5, 6, 11, 16, 21, 26];
const COMPANY_IDS = [1, 4, 7, 8, 15, 22];
const DEAL_IDS = [1, 2, 4, 5, 7, 9];
const contacts = await pick('contacts', CONTACT_IDS, 'id,name');
const companies = await pick('companies', COMPANY_IDS, 'id,name');
const deals = await pick('deals', DEAL_IDS, 'id,name');

// ---------- activities ----------
const WHO = ['Fernando L.', 'Sofía R.', 'Diego G.', 'Laura M.'];
const ago = (days, hour, minute = 0) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour, minute, 0, 0); return d.toISOString(); };
const P = '[Prueba] ';
const call = (recordType, recordId, days, hour, who, outcome, direction, durationMin, text) => ({ type: 'call', record_type: recordType, record_id: recordId, who, occurred_at: ago(days, hour), text: P + text, extra: { seed: SEED, outcome, direction, durationMin } });
const email = (recordType, recordId, days, hour, who, direction, subject, text) => ({ type: 'email', record_type: recordType, record_id: recordId, who, occurred_at: ago(days, hour), text: `${P}${subject} — ${text}`, extra: { seed: SEED, direction, subject } });
const meeting = (recordType, recordId, days, hour, who, durationMin, locationType, outcome, text) => ({ type: 'meeting', record_type: recordType, record_id: recordId, who, occurred_at: ago(days, hour), text: P + text, extra: { seed: SEED, durationMin, locationType, ...(outcome ? { outcome } : {}) } });
const note = (recordType, recordId, days, hour, who, text) => ({ type: 'note', record_type: recordType, record_id: recordId, who, occurred_at: ago(days, hour), text: P + text, extra: { seed: SEED } });
const cn = (id) => contacts[id].name;
const con = (id) => companies[id].name;
const dn = (id) => deals[id].name;
const ACTIVITIES = [
  // contacts
  call('contacts', 1, 1, 10, WHO[0], 'Conectado', 'Saliente', 15, `Llamada de seguimiento con ${cn(1)}: pide cotización ficticia de 12 ventanas para una obra de prueba.`),
  email('contacts', 1, 2, 16, WHO[0], 'Saliente', 'Cotización de prueba 12 ventanas', 'Se envía la cotización ficticia; se espera respuesta la próxima semana.'),
  note('contacts', 1, 4, 12, WHO[1], `Nota de prueba: ${cn(1)} prefiere que le llamen por las tardes.`),
  call('contacts', 2, 2, 9, WHO[1], 'No contesta', 'Saliente', 5, `Intento de contacto con ${cn(2)}; no contesta, se reintenta mañana.`),
  call('contacts', 2, 1, 11, WHO[1], 'Dejó mensaje de voz', 'Saliente', 5, `Segundo intento con ${cn(2)}: se deja mensaje de voz de prueba.`),
  meeting('contacts', 3, 6, 17, WHO[2], 45, 'Videoconferencia', 'Conectado', `Presentación ficticia del catálogo de aluminio a ${cn(3)}.`),
  email('contacts', 3, 5, 8, WHO[2], 'Entrante', 'Dudas sobre garantía (prueba)', `${cn(3)} pregunta por la garantía ficticia de 10 años del vidrio templado.`),
  call('contacts', 5, 9, 13, WHO[3], 'Ocupado', 'Saliente', 5, `Línea ocupada al llamar a ${cn(5)}.`),
  call('contacts', 5, 8, 10, WHO[3], 'Conectado', 'Entrante', 30, `${cn(5)} llama para confirmar medidas de prueba del proyecto de la terraza.`),
  note('contacts', 6, 12, 15, WHO[0], `Nota de prueba: ${cn(6)} trabaja con un arquitecto ficticio que decide los materiales.`),
  meeting('contacts', 6, 14, 11, WHO[0], 60, 'Dirección', 'Conectado', `Visita ficticia a obra con ${cn(6)}: toma de medidas de 8 huecos.`),
  email('contacts', 11, 3, 18, WHO[1], 'Saliente', 'Recordatorio de prueba', `Se recuerda a ${cn(11)} la propuesta pendiente de aprobación.`),
  call('contacts', 11, 10, 9, WHO[1], 'Número equivocado', 'Saliente', 5, 'El número de prueba guardado no corresponde al contacto; pedir el correcto.'),
  meeting('contacts', 16, 0, 16, WHO[2], 30, 'Llamada telefónica', '', `Reunión programada: repaso ficticio de la propuesta con ${cn(16)}`),
  call('contacts', 21, 7, 12, WHO[3], 'Dejó mensaje en directo', 'Saliente', 10, `Se deja mensaje con la recepción ficticia de ${cn(21)}.`),
  email('contacts', 26, 13, 10, WHO[0], 'Entrante', 'Solicitud de visita (prueba)', `${cn(26)} solicita visita técnica ficticia para un cerramiento.`),
  // companies
  note('companies', 1, 3, 9, WHO[0], `Nota de prueba: ${con(1)} renueva su contrato ficticio de mantenimiento en enero.`),
  meeting('companies', 1, 15, 10, WHO[0], 60, 'Videoconferencia', 'Conectado', `Reunión trimestral ficticia con el equipo de compras de ${con(1)}.`),
  call('companies', 4, 5, 15, WHO[1], 'Conectado', 'Saliente', 15, `Llamada de prueba a ${con(4)} para presentar la nueva gama de ventanas.`),
  email('companies', 7, 11, 9, WHO[2], 'Saliente', 'Catálogo 2026 (prueba)', `Se envía el catálogo ficticio de perfiles a ${con(7)}.`),
  note('companies', 8, 18, 14, WHO[3], `Nota de prueba: ${con(8)} tiene dos sedes ficticias; facturar a la central.`),
  call('companies', 15, 20, 11, WHO[2], 'No contesta', 'Saliente', 5, `Sin respuesta en ${con(15)}; probar por correo.`),
  meeting('companies', 22, 2, 12, WHO[3], 45, 'Dirección', 'Conectado', `Visita ficticia a la planta de ${con(22)} para revisar instalación de muestra.`),
  // deals
  call('deals', 1, 1, 17, WHO[0], 'Conectado', 'Saliente', 10, `Negociación ficticia del precio en "${dn(1)}": piden 5 % de descuento.`),
  email('deals', 1, 0, 9, WHO[0], 'Saliente', 'Propuesta revisada (prueba)', `Se envía la propuesta ficticia revisada de "${dn(1)}".`),
  note('deals', 2, 6, 10, WHO[1], `Nota de prueba: "${dn(2)}" depende de la licencia ficticia de obra.`),
  meeting('deals', 4, 9, 16, WHO[2], 30, 'Videoconferencia', 'Conectado', `Demostración ficticia de muestras para "${dn(4)}".`),
  call('deals', 5, 16, 12, WHO[3], 'Conectado', 'Entrante', 15, `El cliente ficticio confirma el pedido de "${dn(5)}".`),
  email('deals', 7, 4, 11, WHO[1], 'Entrante', 'Cambio de fechas (prueba)', `Piden retrasar dos semanas la instalación ficticia de "${dn(7)}".`),
  note('deals', 9, 19, 9, WHO[2], `Nota de prueba: "${dn(9)}" compite con otra oferta ficticia; revisar márgenes.`),
];

// ---------- segments ----------
const cond = (key, op, value, group = 0) => ({ key, op, value, value2: '', group, assoc: '', label: '' });
const now = new Date().toISOString();
const daysAgoIso = (n) => new Date(Date.now() - n * 86400000).toISOString();
const seg = (name, object, type, filters, extra = {}) => ({
  name, object, type, description: extra.description || '', folder: extra.folder || '', creator: 'Equipo de pruebas', updated_by: 'Equipo de pruebas',
  filters, member_ids: extra.memberIds || [], size: extra.memberIds ? extra.memberIds.length : null, used_in: extra.usedIn || 0, campaign: extra.campaign || '',
  access: { view: 'all', edit: 'all' }, import_id: null, processed_at: now, created: daysAgoIso(extra.age ?? 7), updated: daysAgoIso(Math.min(extra.age ?? 7, 2)), extra: { seed: SEED },
});
const SEGMENTS = [
  seg('Prueba · Clientes activos', 'contacts', 'active', [cond('lifecycle', 'anyof', ['Cliente'])], { description: 'Segmento ficticio: contactos en la etapa Cliente.', age: 20, usedIn: 1 }),
  seg('Prueba · Instaladores en España', 'contacts', 'active', [cond('customer_type', 'anyof', ['Instalador']), cond('country', 'anyof', ['España'])], { description: 'Dos condiciones en el mismo grupo (Y).', folder: 'Pruebas de filtros', age: 15 }),
  seg('Prueba · Oportunidades o evangelistas', 'contacts', 'active', [cond('lifecycle', 'anyof', ['Oportunidad'], 0), cond('lifecycle', 'anyof', ['Evangelista'], 1)], { description: 'Dos grupos: basta con cumplir uno (O).', folder: 'Pruebas de filtros', age: 12 }),
  seg('Prueba · Leads sin propietario', 'contacts', 'active', [cond('lifecycle', 'anyof', ['Lead']), cond('owner', 'anyof', ['Sin asignar'])], { description: 'Leads ficticios pendientes de asignar.', age: 10 }),
  seg('Prueba · Contactos de referencias o redes', 'contacts', 'active', [cond('source', 'anyof', ['Referencias', 'Redes sociales'])], { description: 'Fuente original con varios valores.', folder: 'Campañas ficticias', campaign: 'Promoción otoño', age: 9, usedIn: 1 }),
  seg('Prueba · Empresas de construcción', 'companies', 'active', [cond('industry', 'anyof', ['Construcción'])], { description: 'Empresas ficticias del sector construcción.', age: 8 }),
  seg('Prueba · Empresas con nombre que contiene "vidrio"', 'companies', 'active', [cond('name', 'contains', 'vidrio')], { description: 'Filtro de texto "contiene".', folder: 'Pruebas de filtros', age: 6 }),
  seg('Prueba · Negocios ganados', 'deals', 'active', [cond('stage', 'anyof', ['won'])], { description: 'Negocios ficticios en Cerrado ganado.', age: 5, usedIn: 1 }),
  seg('Prueba · Negocios grandes (más de 50.000)', 'deals', 'active', [cond('amount', 'gt', '50000')], { description: 'Importe mayor que 50.000.', folder: 'Campañas ficticias', age: 4 }),
  seg('Prueba · Lista fija de contactos VIP', 'contacts', 'static', [], { description: 'Segmento estático ficticio con ocho contactos fijados a mano.', memberIds: [1, 2, 3, 5, 6, 11, 16, 21], age: 14 }),
  seg('Prueba · Empresas visitadas en feria', 'companies', 'static', [], { description: 'Cinco empresas ficticias fijadas tras una feria.', folder: 'Campañas ficticias', campaign: 'Feria Construmat', memberIds: [1, 4, 7, 8, 15], age: 3 }),
  seg('Prueba · Negocios para revisión manual', 'deals', 'static', [], { description: 'Negocios ficticios elegidos a mano para revisar.', memberIds: [1, 2, 4, 5, 7, 9], age: 1 }),
];

// ---------- phase 1: replace the previous seed and insert ----------
for (const table of ['activities', 'segments']) {
  const { error } = await sb.from(table).delete().eq('extra->>seed', SEED);
  if (error) fail(`${table}: no se pudo limpiar la siembra anterior (${error.message})`);
}
const { data: insA, error: errA } = await sb.from('activities').insert(ACTIVITIES).select('id,type,record_type,record_id');
if (errA) fail(`activities: ${errA.message}`);
const { data: insS, error: errS } = await sb.from('segments').insert(SEGMENTS).select('id,name,type,object');
if (errS) fail(`segments: ${errS.message}`);
log(`actividades insertadas: ${insA.length} (${Object.entries(insA.reduce((m, r) => { m[r.type] = (m[r.type] || 0) + 1; return m; }, {})).map(([t, n]) => `${t} ${n}`).join(', ')})`);
log(`segmentos insertados: ${insS.length} (${insS.filter((s) => s.type === 'active').length} activos, ${insS.filter((s) => s.type === 'static').length} estáticos)`);

// ---------- phase 2: the app's own modules compute sizes and read the timelines ----------
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; } };
globalThis.location = { pathname: '/', search: '', hash: '', origin: 'http://localhost', href: 'http://localhost/', replace() {}, reload() {} };
globalThis.document = { body: { innerHTML: '' }, getElementById: () => ({ onclick: null }) };
const auth = await import(resolve(here, '../src/auth.js'));
auth.setAuthClient({ auth: { getSession: async () => ({ data: { session: { user: { email: 'siembra@local' } } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) } });
const data = await import(resolve(here, '../src/data.js'));
const S = await import(resolve(here, '../src/segments-data.js'));
const seeded = S.segments().filter((s) => s.seed === SEED);
if (seeded.length !== SEGMENTS.length) fail(`la app ve ${seeded.length} segmentos sembrados, se esperaban ${SEGMENTS.length}`);
for (const s of seeded) {
  const members = S.segmentMembers(s);
  const { error } = await sb.from('segments').update({ size: members.length, processed_at: now }).eq('id', s.id);
  if (error) fail(`segments ${s.id}: ${error.message}`);
  log(`  ${s.type === 'active' ? 'activo  ' : 'estático'} · ${s.object.padEnd(9)} · ${String(members.length).padStart(3)} miembros · ${s.name}${s.folder ? ` (carpeta: ${s.folder})` : ''}`);
  if (!members.length) fail(`el segmento "${s.name}" no tiene miembros: revisa sus filtros`);
}
const timelines = [['contacts', 1], ['contacts', 2], ['companies', 1], ['deals', 1]];
for (const [t, id] of timelines) {
  const acts = data.activitiesFor(t, id).filter((a) => a.extra && a.extra.seed === SEED);
  log(`  cronología ${t}/${id}: ${acts.length} actividades sembradas · última: ${acts[0] ? `${acts[0].type} · ${acts[0].text.slice(0, 60)}…` : '—'}`);
  if (!acts.length) fail(`la cronología de ${t}/${id} no muestra las actividades`);
}
const count = async (table) => { const { count: n } = await sb.from(table).select('id', { count: 'exact', head: true }); return n; };
log(`tablas pobladas: activities = ${await count('activities')} filas · segments = ${await count('segments')} filas`);
console.log('[seed] OK');

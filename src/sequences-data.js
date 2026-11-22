import { ACT_ICONS } from './action-icons.js';
// Secuencias: the sequences / sequence_steps / sequence_enrollments / sequence_folders tables with Supabase
// (localStorage otherwise), the six pre-built sequences, the step types, the business-day maths, the
// enrolment of a contact (first step scheduled, task created, timeline entry) and the analytics computed
// from the enrolments (simulated but consistent stats seeded once).
import { dbIsLive, allContacts, allCompanies, allDeals, addRecord, addActivity, logSystem, formatDate, TODAY } from './data.js';
import { supabase } from './supabaseClient.js';
import { reportDbError } from './db-report.js';

export const ME = 'Fernando L.';
const OWNERS = ['Fernando L.', 'Sofía R.', 'Diego G.', 'Laura M.'];
const LS = { seq: 'crm:sequences', enr: 'crm:sequence_enrollments', folders: 'crm:sequence_folders', banner: 'crm:sequences:banner' };
const DAY = 86400000;
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- catalogue ----------
export const STEP_TYPES = {
  auto_email: { label: 'Correo automatizado', hint: 'Enviar automáticamente un correo por mí', icon: ACT_ICONS.email, auto: true, email: true },
  manual_email: { label: 'Tarea de correo manual', hint: 'Crear una tarea para enviar un correo yo mismo', icon: ACT_ICONS.email, auto: false, email: true },
  call: { label: 'Tarea de llamada', hint: 'Crear una tarea para llamar al contacto', icon: ACT_ICONS.call, auto: false, email: false },
  task: { label: 'Tarea general', hint: 'Crear una tarea de seguimiento', icon: ACT_ICONS.task, auto: false, email: false },
  inmail: { label: 'Tarea de InMail', hint: 'Crear una tarea para enviar un InMail de LinkedIn', icon: ACT_ICONS.linkedin, auto: false, email: false },
  connection: { label: 'Tarea de solicitud de conexión', hint: 'Crear una tarea para enviar una solicitud de conexión en LinkedIn', icon: ACT_ICONS.linkedin, auto: false, email: false },
};
export const EXCLUSION_CRITERIA = [
  ['replied', 'Cancelar la inscripción cuando el contacto responde'],
  ['meeting', 'Cancelar la inscripción cuando reserva una reunión'],
  ['unsubscribed', 'Cancelar la inscripción cuando cancela la suscripción'],
  ['deal', 'Cancelar la inscripción cuando se crea un negocio'],
];
export const STATUS_LABELS = { active: 'Activa', paused: 'En pausa', finished: 'Completada', replied: 'Respondió', meeting: 'Reunión reservada', unsubscribed: 'Suscripción cancelada', bounced: 'Rebotó', unenrolled: 'Cancelada' };
const PLACEHOLDER = (name) => `[[${name}]]`;
const step = (type, delayDays, extra = {}) => ({ id: uuid(), type, delayDays, title: '', subject: '', body: '', templateName: '', version: 'A', replyToPrevious: false, ...extra });
const email = (delay, n, subject, body, extra = {}) => step(extra.manual ? 'manual_email' : 'auto_email', delay, { templateName: `${extra.tpl} (Correo No. ${n})`, subject, body, replyToPrevious: Boolean(extra.reply) });

// The six pre-built sequences offered when creating ("Comienza con una secuencia preelaborada").
export const PREBUILT = [
  {
    key: 'recent-conversion', name: 'Conversión más reciente', description: 'Haz seguimiento de un contacto que acaba de convertir en tu sitio web: dos correos automatizados y tres tareas en una semana.', exclusion: ['replied', 'meeting'],
    steps: () => [
      email(0, 1, '¿Te ayudo con {{contacto.empresa|tu proyecto}}?', `<p>Hola {{contacto.nombre}},</p><p>Vi que acabas de descargar nuestro catálogo. En el sector {{empresa.sector|de la construcción}} solemos ayudar con ${PLACEHOLDER('X CONTENT')}.</p><p>¿Te viene bien una llamada de 15 minutos esta semana?</p><p>Un saludo,<br>{{propietario.nombre}}</p>`, { tpl: 'Conversión reciente' }),
      step('call', 2, { title: 'Llamar a {{contacto.nombre}} para comentar su descarga', body: 'Preguntar por el proyecto y la fecha prevista de obra.' }),
      email(2, 2, 'Re: ¿Te ayudo con {{contacto.empresa|tu proyecto}}?', `<p>Hola {{contacto.nombre}},</p><p>Te escribo por si no viste mi correo anterior. Te comparto un caso de un cliente de {{empresa.sector|tu sector}}: ${PLACEHOLDER('X CONTENT')}.</p><p>¿Hablamos?</p>`, { tpl: 'Conversión reciente', reply: true }),
      step('connection', 1, { title: 'Enviar solicitud de conexión en LinkedIn a {{contacto.nombre_completo}}' }),
      email(2, 3, 'Último intento: {{contacto.empresa|tu proyecto}}', `<p>Hola {{contacto.nombre}},</p><p>Cierro el hilo por ahora. Si en algún momento quieres retomar el tema de ${PLACEHOLDER('X CONTENT')}, respóndeme a este correo.</p><p>Gracias,<br>{{propietario.nombre}}</p>`, { tpl: 'Conversión reciente', manual: true }),
    ],
  },
  {
    key: 'event-followup', name: 'Seguimiento de eventos', description: 'Da las gracias por la asistencia a un evento o feria y convierte la conversación en una reunión.', exclusion: ['replied', 'meeting'],
    steps: () => [
      email(0, 1, 'Gracias por pasarte por nuestro stand', `<p>Hola {{contacto.nombre}},</p><p>Fue un placer conocerte en ${PLACEHOLDER('EVENT NAME')}. Te dejo el material que comentamos y quedo a tu disposición.</p><p>Un saludo,<br>{{propietario.nombre}}</p>`, { tpl: 'Seguimiento de eventos' }),
      step('task', 2, { title: 'Revisar las notas del evento sobre {{contacto.empresa|la empresa}}' }),
      email(2, 2, 'Re: Gracias por pasarte por nuestro stand', `<p>Hola {{contacto.nombre}},</p><p>¿Tuviste ocasión de ver el material? Me encantaría enseñarte cómo trabajamos en {{empresa.sector|tu sector}}.</p>`, { tpl: 'Seguimiento de eventos', reply: true }),
      step('call', 3, { title: 'Llamar a {{contacto.nombre}} para proponer una visita técnica' }),
    ],
  },
  {
    key: 'demo-request', name: 'Solicitud de productos o demostración', description: 'Responde a quien pide información de producto o una demostración y guíalo hasta la propuesta.', exclusion: ['replied', 'meeting', 'deal'],
    steps: () => [
      email(0, 1, `Tu solicitud de información sobre ${PLACEHOLDER('PRODUCT')}`, `<p>Hola {{contacto.nombre}},</p><p>Gracias por tu interés en ${PLACEHOLDER('PRODUCT')}. Te propongo una demostración de 20 minutos esta semana.</p><p>Un saludo,<br>{{propietario.nombre}}</p>`, { tpl: 'Solicitud de demostración' }),
      step('call', 1, { title: 'Llamar a {{contacto.nombre}} para agendar la demostración' }),
      email(2, 2, 'Re: Tu solicitud de información', `<p>Hola {{contacto.nombre}},</p><p>Te comparto la ficha técnica de ${PLACEHOLDER('PRODUCT')} y los plazos de instalación para {{contacto.empresa|tu empresa}}.</p>`, { tpl: 'Solicitud de demostración', reply: true }),
      step('task', 2, { title: 'Preparar la propuesta para {{contacto.empresa|el contacto}}' }),
      email(3, 3, '¿Seguimos con la propuesta?', `<p>Hola {{contacto.nombre}},</p><p>¿Quieres que te envíe la propuesta formal? Dime qué necesitas para avanzar.</p>`, { tpl: 'Solicitud de demostración', manual: true }),
    ],
  },
  {
    key: 'after-call', name: 'Secuencia de seguimiento tras llamada/reunión', description: 'Después de una llamada o reunión, envía el resumen, comparte los siguientes pasos y mantén el impulso.', exclusion: ['replied'],
    steps: () => [
      email(0, 1, 'Resumen de nuestra conversación', `<p>Hola {{contacto.nombre}},</p><p>Gracias por tu tiempo. Como acordamos: ${PLACEHOLDER('NEXT STEPS')}.</p><p>Un saludo,<br>{{propietario.nombre}}</p>`, { tpl: 'Tras llamada/reunión', manual: true }),
      email(3, 2, 'Re: Resumen de nuestra conversación', `<p>Hola {{contacto.nombre}},</p><p>¿Pudiste revisar los siguientes pasos? Quedo atento a tus comentarios.</p>`, { tpl: 'Tras llamada/reunión', reply: true }),
      step('task', 2, { title: 'Confirmar fecha de visita con {{contacto.nombre}}' }),
    ],
  },
  {
    key: 'prospecting-calls', name: 'Captación de prospectos - Basada en llamadas', description: 'Prospección en frío con la llamada como canal principal, apoyada por correos y LinkedIn.', exclusion: ['replied', 'meeting'],
    steps: () => [
      step('call', 0, { title: 'Primera llamada de prospección a {{contacto.nombre}}', body: 'Presentar Megaglass y detectar proyectos en curso.' }),
      email(1, 1, 'Intenté llamarte, {{contacto.nombre}}', `<p>Hola {{contacto.nombre}},</p><p>Te llamé para hablar de cómo ayudamos a empresas de {{empresa.sector|tu sector}} con ${PLACEHOLDER('X CONTENT')}. ¿Cuándo te viene bien?</p>`, { tpl: 'Captación por llamadas' }),
      step('call', 2, { title: 'Segunda llamada a {{contacto.nombre}}' }),
      step('inmail', 2, { title: 'Enviar InMail a {{contacto.nombre_completo}}' }),
      step('call', 2, { title: 'Tercera llamada a {{contacto.nombre}}' }),
      email(2, 2, 'Cierro el ciclo por ahora', `<p>Hola {{contacto.nombre}},</p><p>No quiero ser insistente. Si en el futuro tienes un proyecto de vidrio, aquí me tienes.</p>`, { tpl: 'Captación por llamadas', manual: true }),
    ],
  },
  {
    key: 'prospecting-emails', name: 'Captación de prospectos - Basada en correos', description: 'Prospección en frío con el correo como canal principal: tres correos automatizados, una llamada y LinkedIn.', exclusion: ['replied', 'meeting', 'unsubscribed'],
    steps: () => [
      email(0, 1, 'Vidrio para {{contacto.empresa|tu próximo proyecto}}', `<p>Hola {{contacto.nombre}},</p><p>Soy {{propietario.nombre}}, de Megaglass. Trabajamos con empresas de {{empresa.sector|tu sector}} en ${PLACEHOLDER('X CONTENT')}.</p><p>¿Te interesa una llamada breve?</p>`, { tpl: 'Captación por correos' }),
      email(2, 2, 'Re: Vidrio para {{contacto.empresa|tu próximo proyecto}}', `<p>Hola {{contacto.nombre}},</p><p>Te dejo un ejemplo reciente: ${PLACEHOLDER('X CONTENT')}. ¿Lo vemos juntos?</p>`, { tpl: 'Captación por correos', reply: true }),
      step('call', 2, { title: 'Llamar a {{contacto.nombre}} tras los correos' }),
      email(2, 3, 'Re: Vidrio para {{contacto.empresa|tu próximo proyecto}}', `<p>Hola {{contacto.nombre}},</p><p>Último correo por mi parte. Si prefieres, reserva directamente una reunión conmigo.</p>`, { tpl: 'Captación por correos', reply: true }),
      step('connection', 1, { title: 'Enviar solicitud de conexión en LinkedIn a {{contacto.nombre_completo}}' }),
    ],
  },
];
// "Crear una secuencia dinámica": automated e-mails first, manual tasks once the contact interacts.
export const DYNAMIC = {
  key: 'dynamic', name: 'Secuencia dinámica', description: 'Correos automatizados al principio y, cuando el contacto interactúa (abre o hace clic), tareas manuales para que el remitente tome el relevo.', exclusion: ['replied', 'meeting'],
  steps: () => [
    email(0, 1, 'Hola {{contacto.nombre}}, una idea para {{contacto.empresa|tu empresa}}', `<p>Hola {{contacto.nombre}},</p><p>Te escribo porque en {{empresa.sector|tu sector}} vemos buenos resultados con ${PLACEHOLDER('X CONTENT')}.</p>`, { tpl: 'Secuencia dinámica' }),
    email(2, 2, 'Re: una idea para {{contacto.empresa|tu empresa}}', '<p>Hola {{contacto.nombre}},</p><p>Por si se te pasó mi anterior correo: ¿hablamos 15 minutos?</p>', { tpl: 'Secuencia dinámica', reply: true }),
    email(3, 3, 'Re: una idea para {{contacto.empresa|tu empresa}}', '<p>Hola {{contacto.nombre}},</p><p>Último correo automático. Si te interesa, responde y lo vemos.</p>', { tpl: 'Secuencia dinámica', reply: true }),
    step('call', 1, { title: 'Llamar a {{contacto.nombre}} (interactuó con los correos)' }),
    step('task', 2, { title: 'Enviar propuesta personalizada a {{contacto.empresa|el contacto}}' }),
  ],
};
export const prebuiltByKey = (key) => (key === 'dynamic' ? DYNAMIC : PREBUILT.find((p) => p.key === key) || null);

// ---------- maths ----------
export const isAuto = (s) => Boolean(STEP_TYPES[s.type] && STEP_TYPES[s.type].auto);
export const isEmail = (s) => Boolean(STEP_TYPES[s.type] && STEP_TYPES[s.type].email);
export const stepDay = (steps, i) => 1 + steps.slice(1, i + 1).reduce((n, s) => n + (Number(s.delayDays) || 0), 0);
export function stats(steps, exclusion = []) {
  const total = steps.length;
  const auto = steps.filter(isAuto).length;
  return { totalSteps: total, days: total ? stepDay(steps, total - 1) - 1 : 0, automatedPct: total ? Math.round((auto / total) * 100) : 0, exclusion: (exclusion || []).length };
}
export function businessDaysFrom(from, n) {
  const d = new Date(from);
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left -= 1; }
  return d;
}
export const placeholdersIn = (text) => [...new Set([...String(text || '').matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()))];
export const placeholdersOf = (seq) => [...new Set((seq.steps || []).flatMap((s) => [...placeholdersIn(s.subject), ...placeholdersIn(s.body), ...placeholdersIn(s.title)]))];
export const fillPlaceholders = (text, values = {}) => String(text || '').replace(/\[\[([^\]]+)\]\]/g, (m, k) => (values[k.trim()] !== undefined && values[k.trim()] !== '' ? values[k.trim()] : ''));
// The e-mail steps count as "RESPUESTA (n)": the n-th reply in the thread of the previous e-mail.
export const replyIndex = (steps, i) => steps.slice(0, i + 1).filter((s, j) => j > 0 && isEmail(s) && s.replyToPrevious).length;

// ---------- storage ----------
let live = dbIsLive();
let rows = [];
let enrollRows = [];
let folderRows = [];
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn).catch((e) => reportDbError('secuencias', e)); return queue; };
export const pending = () => queue;
const seqFromDb = (r, steps) => ({ id: r.id, name: r.name || '', description: r.description || '', folder: r.folder || '', ownerId: r.owner_id || '', templateKey: r.template_key || '', prebuilt: Boolean(r.prebuilt), dynamic: Boolean(r.dynamic), exclusion: Array.isArray(r.exclusion) ? r.exclusion : [], deletedAt: r.deleted_at || null, createdAt: r.created_at, updatedAt: r.updated_at || r.created_at, steps: steps.map(stepFromDb) });
const seqToDb = (s) => ({ id: s.id, name: s.name, description: s.description, folder: s.folder || '', owner_id: s.ownerId, template_key: s.templateKey || '', prebuilt: Boolean(s.prebuilt), dynamic: Boolean(s.dynamic), exclusion: s.exclusion || [], deleted_at: s.deletedAt || null, created_at: s.createdAt, updated_at: s.updatedAt });
const stepFromDb = (r) => ({ id: r.id, type: r.type, delayDays: Number(r.delay_days) || 0, title: r.title || '', subject: r.subject || '', body: r.body || '', templateName: r.template_name || '', templateId: r.template_id || null, version: r.version || 'A', replyToPrevious: Boolean(r.reply_to_previous) });
const stepToDb = (seqId, s, i) => ({ id: s.id, sequence_id: seqId, position: i, type: s.type, delay_days: Number(s.delayDays) || 0, title: s.title || '', subject: s.subject || '', body: s.body || '', template_name: s.templateName || '', template_id: s.templateId || null, version: s.version || 'A', reply_to_previous: Boolean(s.replyToPrevious) });
const enrFromDb = (r) => ({ id: r.id, sequenceId: r.sequence_id, contactId: r.contact_id, contactName: r.contact_name || '', companyId: r.company_id, companyName: r.company_name || '', enrolledBy: r.enrolled_by || '', senderAccountId: r.sender_account_id || null, status: r.status || 'active', currentStep: Number(r.current_step) || 1, nextStepAt: r.next_step_at, placeholders: r.placeholders || {}, stats: r.stats || {}, extra: r.extra || {}, enrolledAt: r.enrolled_at, updatedAt: r.updated_at || r.enrolled_at });
const enrToDb = (e) => ({ id: e.id, sequence_id: e.sequenceId, contact_id: e.contactId == null ? null : Number(e.contactId), contact_name: e.contactName, company_id: e.companyId == null ? null : Number(e.companyId), company_name: e.companyName, enrolled_by: e.enrolledBy, sender_account_id: e.senderAccountId || null, status: e.status, current_step: e.currentStep, next_step_at: e.nextStepAt, placeholders: e.placeholders || {}, stats: e.stats || {}, extra: e.extra || {}, enrolled_at: e.enrolledAt, updated_at: e.updatedAt });
const saveLocal = () => { localStorage.setItem(LS.seq, JSON.stringify(rows)); localStorage.setItem(LS.enr, JSON.stringify(enrollRows)); localStorage.setItem(LS.folders, JSON.stringify(folderRows)); };
const persistSeq = (s) => { if (live) enqueue(async () => { const { error } = await supabase.from('sequences').upsert(seqToDb(s), { onConflict: 'id' }); if (error) throw error; const { error: e2 } = await supabase.from('sequence_steps').delete().eq('sequence_id', s.id); if (e2) throw e2; if (s.steps.length) { const { error: e3 } = await supabase.from('sequence_steps').insert(s.steps.map((x, i) => stepToDb(s.id, x, i))); if (e3) throw e3; } }); else saveLocal(); };
const persistEnr = (e) => { if (live) enqueue(async () => { const { error } = await supabase.from('sequence_enrollments').upsert(enrToDb(e), { onConflict: 'id' }); if (error) throw error; }); else saveLocal(); };

// Deterministic pseudo-random numbers so the simulated stats are stable between loads.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seedSequences() {
  const fixed = (key, id, extra) => { const p = prebuiltByKey(key); return { id, name: p.name, description: p.description, folder: '', ownerId: ME, templateKey: key, prebuilt: true, dynamic: key === 'dynamic', exclusion: p.exclusion, deletedAt: null, createdAt: new Date(TODAY.getTime() - 60 * DAY).toISOString(), updatedAt: new Date(TODAY.getTime() - 60 * DAY).toISOString(), steps: p.steps(), ...extra }; };
  const mine = (key, id, name, folder, ownerId, daysAgo, updatedAgo) => { const p = prebuiltByKey(key); return { id, name, description: p.description, folder, ownerId, templateKey: key, prebuilt: false, dynamic: false, exclusion: p.exclusion, deletedAt: null, createdAt: new Date(TODAY.getTime() - daysAgo * DAY).toISOString(), updatedAt: new Date(TODAY.getTime() - updatedAgo * DAY).toISOString(), steps: p.steps() }; };
  return [
    ...PREBUILT.map((p, i) => fixed(p.key, `d5000000-0000-4000-8000-00000000000${i + 1}`)),
    mine('prospecting-emails', 'd5000000-0000-4000-8000-000000000011', '[Prueba] Prospección instaladores', 'Ventas', 'Fernando L.', 55, 3),
    mine('demo-request', 'd5000000-0000-4000-8000-000000000012', '[Prueba] Seguimiento post-cotización', 'Ventas', 'Sofía R.', 40, 9),
    mine('after-call', 'd5000000-0000-4000-8000-000000000013', '[Prueba] Reactivación de clientes', 'Clientes', 'Diego G.', 30, 1),
  ];
}
function seedEnrollments(seqs) {
  const mine = seqs.filter((s) => !s.prebuilt);
  const contacts = allContacts().slice(0, 48);
  const r = rng(20261114);
  const companies = allCompanies();
  const out = [];
  contacts.forEach((c, i) => {
    const seq = mine[i % mine.length];
    const daysAgo = Math.floor(r() * 56);
    const enrolledAt = new Date(TODAY.getTime() - daysAgo * DAY - Math.floor(r() * 8) * 3600000);
    const p = r();
    const status = p < 0.42 ? 'active' : p < 0.6 ? 'finished' : p < 0.76 ? 'replied' : p < 0.86 ? 'meeting' : p < 0.91 ? 'paused' : p < 0.95 ? 'unsubscribed' : p < 0.98 ? 'bounced' : 'unenrolled';
    const emails = seq.steps.filter(isEmail).length;
    const progress = status === 'active' || status === 'paused' ? Math.min(seq.steps.length, 1 + Math.floor(daysAgo / 2)) : seq.steps.length;
    const sent = status === 'bounced' ? 1 : Math.min(emails, Math.max(1, Math.round((progress / seq.steps.length) * emails)));
    const opens = status === 'bounced' ? 0 : Math.min(sent, Math.floor(r() * (sent + 1)) + (status === 'replied' || status === 'meeting' ? 1 : 0));
    const clicks = Math.min(opens, r() < 0.45 ? Math.floor(r() * (opens + 1)) : 0);
    const replied = status === 'replied' || status === 'meeting' ? 1 : 0;
    const repliedAt = replied ? new Date(enrolledAt.getTime() + (1 + Math.floor(r() * 6)) * DAY).toISOString() : null;
    const company = c.companyId ? companies.find((x) => Number(x.id) === Number(c.companyId)) : companies.find((x) => x.name === c.company);
    out.push({ id: `d7000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, sequenceId: seq.id, contactId: c.id, contactName: c.name, companyId: company ? company.id : null, companyName: company ? company.name : c.company || '', enrolledBy: OWNERS[Math.floor(r() * OWNERS.length)], status, currentStep: Math.min(progress, seq.steps.length), nextStepAt: status === 'active' ? businessDaysFrom(TODAY, 1 + Math.floor(r() * 3)).toISOString() : null, placeholders: { 'X CONTENT': 'fachadas de vidrio templado', PRODUCT: 'vidrio laminado de seguridad', 'NEXT STEPS': 'enviar la cotización y agendar visita', 'EVENT NAME': 'Expo Construcción' }, stats: { sent, opens: Math.min(opens, sent), clicks, replied, repliedAt, meeting: status === 'meeting' ? 1 : 0, meetingAt: status === 'meeting' ? new Date(enrolledAt.getTime() + (2 + Math.floor(r() * 8)) * DAY).toISOString() : null, bounced: status === 'bounced' ? 1 : 0, unsubscribed: status === 'unsubscribed' ? 1 : 0 }, enrolledAt: enrolledAt.toISOString(), updatedAt: enrolledAt.toISOString() });
  });
  return out;
}
function loadLocal() {
  try { const s = JSON.parse(localStorage.getItem(LS.seq)); const e = JSON.parse(localStorage.getItem(LS.enr)); const f = JSON.parse(localStorage.getItem(LS.folders)); if (Array.isArray(s) && Array.isArray(e) && Array.isArray(f)) { rows = s; enrollRows = e; folderRows = f; return; } } catch { /* seed */ }
  rows = seedSequences();
  enrollRows = seedEnrollments(rows);
  folderRows = [{ id: 'd6000000-0000-4000-8000-000000000001', name: 'Ventas', createdAt: new Date(TODAY.getTime() - 60 * DAY).toISOString() }, { id: 'd6000000-0000-4000-8000-000000000002', name: 'Clientes', createdAt: new Date(TODAY.getTime() - 60 * DAY).toISOString() }];
  saveLocal();
}
async function loadLive() {
  const { data: s, error } = await supabase.from('sequences').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  const { data: st, error: e2 } = await supabase.from('sequence_steps').select('*').order('position');
  if (e2) throw e2;
  const { data: en, error: e3 } = await supabase.from('sequence_enrollments').select('*').order('enrolled_at', { ascending: false });
  if (e3) throw e3;
  const { data: f, error: e4 } = await supabase.from('sequence_folders').select('*').order('name');
  if (e4) throw e4;
  rows = (s || []).map((r) => seqFromDb(r, (st || []).filter((x) => x.sequence_id === r.id)));
  enrollRows = (en || []).map(enrFromDb);
  folderRows = (f || []).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  if (!rows.length) {
    rows = seedSequences();
    const { error: e5 } = await supabase.from('sequences').insert(rows.map(seqToDb));
    if (e5) console.error('[supabase] semilla de secuencias', e5);
    const { error: e6 } = await supabase.from('sequence_steps').insert(rows.flatMap((q) => q.steps.map((x, i) => stepToDb(q.id, x, i))));
    if (e6) console.error('[supabase] semilla de pasos', e6);
  }
  if (!enrollRows.length) {
    enrollRows = seedEnrollments(rows);
    const { error: e7 } = await supabase.from('sequence_enrollments').insert(enrollRows.map(enrToDb));
    if (e7) console.error('[supabase] semilla de inscripciones', e7);
  }
}
let loaded = false;
export const ready = (async () => {
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tablas de secuencias no disponibles; secuencias en localStorage.', e); loadLocal(); }
  } else loadLocal();
  loaded = true;
})();
export const sequencesLive = () => live;
export const sequencesLoaded = () => loaded;

// ---------- reads ----------
const out = (s) => clone(s);
export const sequences = () => rows.filter((s) => !s.prebuilt && !s.deletedAt).map(out).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
export const trashedSequences = () => rows.filter((s) => !s.prebuilt && s.deletedAt).map(out);
export const sequenceById = (id) => { const s = rows.find((x) => x.id === id); return s ? out(s) : null; };
export const folders = () => folderRows.map((f) => f.name).sort((a, b) => a.localeCompare(b, 'es'));
export const owners = () => [...new Set(sequences().map((s) => s.ownerId).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
export const enrollments = () => enrollRows.map(out);
export const enrollmentsOf = (sequenceId) => enrollRows.filter((e) => e.sequenceId === sequenceId).map(out);
export const enrollmentsOfContact = (contactId) => enrollRows.filter((e) => String(e.contactId) === String(contactId)).map(out);
export const bannerDismissed = () => localStorage.getItem(LS.banner) === '1';
export const dismissBanner = () => localStorage.setItem(LS.banner, '1');
const replied = (e) => e.status === 'replied' || e.status === 'meeting' || Number((e.stats || {}).replied) > 0;
const metOn = (e) => e.status === 'meeting' || Number((e.stats || {}).meeting) > 0;
export function sequenceMetrics(sequenceId) {
  const list = enrollRows.filter((e) => e.sequenceId === sequenceId);
  const n = list.length;
  return { enrolled: n, replyRate: n ? list.filter(replied).length / n : 0, meetingRate: n ? list.filter(metOn).length / n : 0 };
}

// ---------- writes ----------
export function createFolder(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const existing = folderRows.find((f) => f.name.toLowerCase() === n.toLowerCase());
  if (existing) return existing;
  const f = { id: uuid(), name: n, createdAt: new Date().toISOString() };
  folderRows.push(f);
  if (live) enqueue(async () => { const { error } = await supabase.from('sequence_folders').insert({ id: f.id, name: f.name, created_at: f.createdAt }); if (error) throw error; }); else saveLocal();
  return f;
}
export function createSequence({ name, description = '', folder = '', exclusion = [], steps = [], templateKey = '', dynamic = false, ownerId = ME } = {}) {
  const n = String(name || '').trim();
  if (!n) return null;
  const now = new Date().toISOString();
  const s = { id: uuid(), name: n, description: String(description || ''), folder: folder || '', ownerId, templateKey, prebuilt: false, dynamic: Boolean(dynamic), exclusion: [...exclusion], deletedAt: null, createdAt: now, updatedAt: now, steps: clone(steps).map((x) => ({ ...x, id: x.id || uuid() })) };
  rows.unshift(s);
  persistSeq(s);
  return out(s);
}
export function updateSequence(id, patch) {
  const s = rows.find((x) => x.id === id);
  if (!s) return null;
  const next = { ...s, ...patch };
  if (!String(next.name || '').trim()) return null;
  Object.assign(s, next, { name: String(next.name).trim(), steps: clone(next.steps || s.steps), updatedAt: new Date().toISOString() });
  persistSeq(s);
  return out(s);
}
export function cloneSequence(id, { ownerId = ME } = {}) {
  const src = rows.find((x) => x.id === id);
  if (!src) return null;
  const now = new Date().toISOString();
  const s = { ...clone(src), id: uuid(), name: `${src.name} (copia)`, ownerId, prebuilt: false, deletedAt: null, createdAt: now, updatedAt: now, steps: src.steps.map((x) => ({ ...clone(x), id: uuid() })) };
  rows.unshift(s);
  persistSeq(s);
  return out(s);
}
export function deleteSequences(ids) {
  const set = new Set(ids);
  const now = new Date().toISOString();
  let n = 0;
  rows.forEach((s) => { if (set.has(s.id) && !s.deletedAt) { s.deletedAt = now; s.updatedAt = now; persistSeq(s); n += 1; } });
  return n;
}
export function restoreSequences(ids) {
  const set = new Set(ids);
  let n = 0;
  rows.forEach((s) => { if (set.has(s.id) && s.deletedAt) { s.deletedAt = null; s.updatedAt = new Date().toISOString(); persistSeq(s); n += 1; } });
  return n;
}
export const moveSequences = (ids, folder) => ids.map((id) => { const s = rows.find((x) => x.id === id); if (!s) return null; s.folder = folder || ''; s.updatedAt = new Date().toISOString(); persistSeq(s); return s; }).filter(Boolean).length;
export function sequencesCsv(list = sequences()) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const pct = (x) => `${Math.round(x * 1000) / 10} %`;
  const head = ['Nombre', 'Total inscritos', 'Tasa de respuesta', 'Tasa de reuniones', 'Propietario', 'Carpeta', 'Fecha de modificación'];
  return [head.map(cell).join(','), ...list.map((s) => { const m = sequenceMetrics(s.id); return [s.name, m.enrolled, pct(m.replyRate), pct(m.meetingRate), s.ownerId, s.folder, s.updatedAt].map(cell).join(','); })].join('\n');
}

// Enrols a contact: the enrolment row, the first step scheduled (a task when it is manual) and the timeline entry.
export function enroll({ sequenceId, contact, placeholders = {}, enrolledBy = ME, now = new Date(), from = '', senderAccountId = null } = {}) {
  const seq = rows.find((x) => x.id === sequenceId && !x.deletedAt);
  if (!seq || !contact || !seq.steps.length) return null;
  const first = seq.steps[0];
  const when = new Date(now);
  // A start later than now schedules the first step instead of running it right away.
  const future = when.getTime() > Date.now() + 60000;
  const company = contact.companyId ? allCompanies().find((x) => Number(x.id) === Number(contact.companyId)) : allCompanies().find((x) => x.name && x.name === contact.company);
  const e = { id: uuid(), sequenceId, contactId: contact.id, contactName: contact.name || `${contact.first || ''} ${contact.last || ''}`.trim(), companyId: company ? company.id : null, companyName: company ? company.name : contact.company || '', enrolledBy, senderAccountId, status: 'active', currentStep: 1, nextStepAt: when.toISOString(), placeholders: { ...placeholders }, stats: { sent: 0, opens: 0, clicks: 0, replied: 0, meeting: 0, bounced: 0, unsubscribed: 0 }, enrolledAt: when.toISOString(), updatedAt: new Date().toISOString() };
  enrollRows.unshift(e);
  persistEnr(e);
  const label = STEP_TYPES[first.type].label;
  let task = null;
  if (!live && !isAuto(first)) {
    task = addRecord('tasks', { name: fillPlaceholders(first.title || `${label} · ${seq.name}`, placeholders).replace(/{{[^}]+}}/g, contact.first || contact.name || ''), type: first.type === 'call' ? 'Llamada' : first.type === 'manual_email' ? 'Correo' : 'Tarea', status: 'todo', priority: 'medium', owner: enrolledBy, contactId: contact.id, contact: e.contactName, due: when.toISOString(), lastActivity: when.toISOString(), extra: { sequenceId, enrollmentId: e.id, stepPosition: 0 } });
    e.nextStepAt = null;
    e.extra = { waiting_task: task.id };
    persistEnr(e);
  }
  const timeStr = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  const subject = fillPlaceholders(first.subject, placeholders).replace(/{{[^}]+}}/g, '…');
  const detail = `Paso 1 pendiente, programado para el ${formatDate(when)} a las ${timeStr}.`;
  addActivity({ type: 'system', when: Math.min(when.getTime(), Date.now()), who: enrolledBy, text: `Inscrito en la secuencia «${seq.name}» por ${enrolledBy}. ${detail}${from ? ` Correos enviados desde ${from}.` : ''}`, recordType: 'contacts', recordId: contact.id, extra: { sequenceId, enrollmentId: e.id, subject: `Secuencia: ${seq.name}`, from } });
  return { enrollment: out(e), sequence: out(seq), firstStep: clone(first), task, scheduled: future };
}
// The contact's enrolment still running in that sequence (active or paused), if any.
export const activeEnrollment = (contactId, sequenceId) => { const e = enrollRows.find((x) => String(x.contactId) === String(contactId) && x.sequenceId === sequenceId && (x.status === 'active' || x.status === 'paused')); return e ? out(e) : null; };
export function pauseEnrollment(id) {
  const e = enrollRows.find(x => x.id === id);
  if (!e || e.status !== 'active') return null;
  const now = new Date();
  e.extra = { ...e.extra, pauseRemainingMs: Math.max(0, (Date.parse(e.nextStepAt) || now.getTime()) - now.getTime()) };
  e.status = 'paused';
  e.updatedAt = now.toISOString();
  persistEnr(e);
  enrollmentActivity(e, 'Inscripción en pausa', now);
  return out(e);
}
export function resumeEnrollment(id) {
  const e = enrollRows.find(x => x.id === id);
  if (!e || e.status !== 'paused') return null;
  const now = new Date();
  let next = new Date(now.getTime() + Math.max(0, Number(e.extra?.pauseRemainingMs) || 0));
  if ([0, 6].includes(next.getDay())) next = businessDaysFrom(next, 1);
  e.nextStepAt = e.extra?.waiting_task ? null : next.toISOString();
  e.status = 'active';
  e.updatedAt = now.toISOString();
  delete e.extra?.pauseRemainingMs;
  persistEnr(e);
  enrollmentActivity(e, 'Inscripción reanudada', now);
  return out(e);
}
function enrollmentActivity(e, label, now) {
  addActivity({ type: 'system', when: now.getTime(), who: e.enrolledBy, text: label,
    recordType: 'contacts', recordId: e.contactId,
    extra: { sequenceId: e.sequenceId, enrollmentId: e.id, subject: label } });
}
export function unenroll(enrollmentId) {
  const e = enrollRows.find((x) => x.id === enrollmentId);
  if (!e) return null;
  e.status = 'unenrolled'; e.nextStepAt = null; e.updatedAt = new Date().toISOString();
  persistEnr(e);
  return out(e);
}
// How each exclusion criterion ends an enrolment, as the original does: a reply or a booked meeting is a status
// of its own («Respondió», «Reunión reservada»); a new deal or an unsubscribe is a plain cancellation
// («Cancelada») that keeps its readable reason in extra.reason for the analytics and the record.
export const UNENROLL_REASONS = {
  replied: { status: 'replied' },
  meeting: { status: 'meeting' },
  unsubscribed: { status: 'unenrolled', label: 'Suscripción cancelada' },
  deal: { status: 'unenrolled', label: 'Negocio creado' },
};
// Readable reason of an ended enrolment («Respondió», «Negocio creado»…), or '' while it runs / when it was
// cancelled by hand without one.
export const unenrollReasonOf = (e) => (e && e.extra && e.extra.reason) || (e && (e.status === 'replied' || e.status === 'meeting') ? STATUS_LABELS[e.status] : '');
// The exclusion criteria of a sequence (EXCLUSION_CRITERIA) applied: every active or paused enrolment of the
// contact in a sequence that cancels on `reason` ends with the status of UNENROLL_REASONS, no next step,
// stats.<reason> = 1, stats.<reason>At = now and (deal / unsubscribed) extra.reason with the readable label.
// Returns the enrolments it ended (with the sequence name) so the caller can write the timeline and refresh
// the record. Nothing else is inferred.
// A merged duplicate's enrolments follow the kept contact (src/data.js mergeRecords): same status and step; an
// enrolment in a sequence where the kept contact is already running is cancelled instead of duplicated.
export function moveEnrollments(fromContactIds, keep) {
  const from = new Set((fromContactIds || []).map(String));
  const when = new Date().toISOString();
  let moved = 0;
  for (const e of enrollRows) {
    if (!from.has(String(e.contactId))) continue;
    const running = (e.status === 'active' || e.status === 'paused') && enrollRows.some((x) => x !== e && String(x.contactId) === String(keep.id) && x.sequenceId === e.sequenceId && (x.status === 'active' || x.status === 'paused'));
    e.extra = { ...(e.extra || {}), mergedFrom: e.contactId };
    e.contactId = keep.id;
    e.contactName = keep.name || e.contactName;
    if (running) { e.status = 'unenrolled'; e.nextStepAt = null; e.extra.reason = 'Fusionado con un contacto ya inscrito'; }
    e.updatedAt = when;
    persistEnr(e);
    moved += 1;
  }
  return moved;
}
export function unenrollByReason(contactId, reason, { now = new Date().toISOString() } = {}) {
  const how = UNENROLL_REASONS[reason];
  if (!how || !EXCLUSION_CRITERIA.some(([k]) => k === reason)) return [];
  const when = new Date(now).toISOString();
  const hits = [];
  for (const e of enrollRows) {
    if (String(e.contactId) !== String(contactId) || !(e.status === 'active' || e.status === 'paused')) continue;
    const seq = rows.find((s) => s.id === e.sequenceId && !s.deletedAt);
    if (!seq || !(seq.exclusion || []).includes(reason)) continue;
    e.status = how.status;
    e.nextStepAt = null;
    e.stats = { ...(e.stats || {}), [reason]: 1, [`${reason}At`]: when };
    e.extra = { ...(e.extra || {}) };
    delete e.extra.pauseRemainingMs;
    if (how.label) { e.extra.reason = how.label; e.extra.reasonKey = reason; }
    e.updatedAt = when;
    persistEnr(e);
    hits.push({ ...out(e), sequenceName: seq.name });
  }
  return hits;
}
// The criteria «Cancelar la inscripción cuando se crea un negocio» and «…cuando cancela la suscripción» stop
// the sequence by themselves, as the original does. src/data.js calls these from its single creation hook
// (addRecord of a deal with a contact: slide-over, record, workflows, import) and from the marketing opt-out
// («Sí»), so every path lands here. Each cancelled enrolment gets its system entry on the contact timeline and
// the record refreshes (crm:enrolled). Runs as soon as the sequence data is loaded.
export function cancelOnDeal(contactId, deal, when) {
  return cancelByEvent(contactId, 'deal', (name) => `Inscripción cancelada en «${name}»: se creó el negocio «${deal.name}».`, { deals: deal.id }, when);
}
export function cancelOnUnsubscribe(contactId, when) {
  return cancelByEvent(contactId, 'unsubscribed', (name) => `Inscripción cancelada en «${name}»: canceló la suscripción.`, {}, when);
}
function cancelByEvent(contactId, reason, textOf, extra, when = new Date().toISOString()) {
  const apply = () => {
    let hits = [];
    try { hits = unenrollByReason(contactId, reason, { now: when }); } catch (e) { console.error('[secuencias] criterio de exclusión', e); return []; }
    for (const h of hits) logSystem('contacts', contactId, textOf(h.sequenceName), { sequenceId: h.sequenceId, enrollmentId: h.id, reason, ...extra });
    if (hits.length && typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent('crm:enrolled', { detail: { reason, enrollments: hits } }));
    return hits;
  };
  if (loaded) return apply();
  return ready.then(apply).catch((e) => { console.error('[secuencias] criterio de exclusión', e); return []; });
}

// ---------- analytics ----------
export const FILTER_KEYS = [['company', 'Empresa'], ['sequence', 'Secuencia'], ['status', 'Estado'], ['folder', 'Carpeta'], ['enrolledBy', 'Inscrito por'], ['date', 'Fecha de inscripción']];
export const DATE_RANGES = [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['365', 'Último año']];
export function filterOptions() {
  const seqName = (id) => (rows.find((s) => s.id === id) || {}).name || '';
  const uniq = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es'));
  return {
    company: uniq(enrollRows.map((e) => e.companyName)).map((c) => [c, c]),
    sequence: uniq(enrollRows.map((e) => e.sequenceId)).map((id) => [id, seqName(id)]).filter((x) => x[1]).sort((a, b) => a[1].localeCompare(b[1], 'es')),
    status: Object.entries(STATUS_LABELS),
    folder: folders().map((f) => [f, f]),
    enrolledBy: uniq(enrollRows.map((e) => e.enrolledBy)).map((o) => [o, o]),
    date: DATE_RANGES,
  };
}
export function filteredEnrollments(filters = {}) {
  const seqOf = (id) => rows.find((s) => s.id === id) || {};
  const since = filters.date ? TODAY.getTime() - Number(filters.date) * DAY : null;
  return enrollRows.filter((e) => (!filters.company || e.companyName === filters.company) && (!filters.sequence || e.sequenceId === filters.sequence) && (!filters.status || e.status === filters.status) && (!filters.folder || (seqOf(e.sequenceId).folder || '') === filters.folder) && (!filters.enrolledBy || e.enrolledBy === filters.enrolledBy) && (since === null || new Date(e.enrolledAt).getTime() >= since)).map(out);
}
export function analytics(filters = {}) {
  const list = filteredEnrollments(filters);
  const n = list.length;
  const sum = (k) => list.reduce((a, e) => a + (Number((e.stats || {})[k]) || 0), 0);
  const contacts = new Set(list.map((e) => String(e.contactId))).size;
  const replies = list.filter(replied).length;
  const meetings = list.filter(metOn).length;
  const sent = sum('sent');
  const opens = sum('opens');
  const ids = new Set(list.map((e) => String(e.contactId)));
  const firstEnrolled = {};
  list.forEach((e) => { const t = new Date(e.enrolledAt).getTime(); const k = String(e.contactId); firstEnrolled[k] = Math.min(firstEnrolled[k] || Infinity, t); });
  const deals = allDeals().filter((d) => ids.has(String(d.contactId)) && new Date(d.created || d.closeDate || 0).getTime() >= (firstEnrolled[String(d.contactId)] || 0) - 7 * DAY);
  const won = deals.filter((d) => /ganado|won/i.test(String(d.stage || '')) || d.status === 'won');
  const companyIds = [...new Set(list.map((e) => e.companyName).filter(Boolean))];
  const byCompany = (pred) => companyIds.filter((c) => list.some((e) => e.companyName === c && pred(e))).length;
  const rate = (a, b) => (b ? a / b : 0);
  return {
    total: n, contacts, meetings, meetingRate: rate(meetings, n), replies, replyRate: rate(replies, n), noReply: n - replies, noReplyRate: rate(n - replies, n),
    deals: deals.length, dealsWon: won.length, dealsAmount: deals.reduce((a, d) => a + (Number(d.amount) || 0), 0),
    sent, opens, openRate: rate(opens, sent), clicks: sum('clicks'), clickRate: rate(sum('clicks'), sent), bounces: sum('bounced'), bounceRate: rate(sum('bounced'), sent), unsubscribes: sum('unsubscribed'), unsubscribeRate: rate(sum('unsubscribed'), sent),
    companies: companyIds.length, contactsPerCompany: companyIds.length ? n / companyIds.length : 0, companyInteractionRate: rate(byCompany((e) => Number((e.stats || {}).opens) > 0 || Number((e.stats || {}).clicks) > 0 || replied(e)), companyIds.length), companyMeetingRate: rate(byCompany(metOn), companyIds.length),
  };
}
export const SERIES_METRICS = [['meetings', 'Reuniones programadas'], ['replies', 'Respuestas'], ['enrollments', 'Inscripciones'], ['opens', 'Aperturas de correo']];
export const FREQUENCIES = [['week', 'Semanalmente'], ['day', 'Diariamente'], ['month', 'Mensualmente']];
// Buckets of the chosen metric over the last 8 weeks (or 14 days / 6 months).
export function series(metric = 'meetings', freq = 'week', filters = {}) {
  const list = filteredEnrollments(filters);
  const dateOf = (e) => (metric === 'meetings' ? (e.stats || {}).meetingAt : metric === 'replies' ? (e.stats || {}).repliedAt : e.enrolledAt);
  const valueOf = (e) => (metric === 'opens' ? Number((e.stats || {}).opens) || 0 : metric === 'meetings' ? (metOn(e) ? 1 : 0) : metric === 'replies' ? (replied(e) ? 1 : 0) : 1);
  const buckets = [];
  const end = new Date(TODAY);
  if (freq === 'day') for (let i = 13; i >= 0; i -= 1) { const d = new Date(end.getTime() - i * DAY); buckets.push({ key: d.toISOString().slice(0, 10), label: `${d.getDate()}/${d.getMonth() + 1}`, start: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(), value: 0 }); }
  else if (freq === 'month') for (let i = 5; i >= 0; i -= 1) { const d = new Date(end.getFullYear(), end.getMonth() - i, 1); const e = new Date(end.getFullYear(), end.getMonth() - i + 1, 1); buckets.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('es-ES', { month: 'short' }), start: d.getTime(), end: e.getTime(), value: 0 }); }
  else { const monday = new Date(end); monday.setDate(end.getDate() - ((end.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0); for (let i = 7; i >= 0; i -= 1) { const s = new Date(monday.getTime() - i * 7 * DAY); buckets.push({ key: s.toISOString().slice(0, 10), label: `${s.getDate()}/${s.getMonth() + 1}`, start: s.getTime(), end: s.getTime() + 7 * DAY, value: 0 }); } }
  list.forEach((e) => { const d = dateOf(e); if (!d) return; const t = new Date(d).getTime(); const b = buckets.find((x) => t >= x.start && t < x.end); if (b) b.value += valueOf(e); });
  return buckets;
}
// Scheduled steps (the "Programado" tab): active enrolments and when their next step is due.
export function scheduled() {
  return enrollRows.filter((e) => (e.status === 'active' || e.status === 'paused')).map((e) => { const s = rows.find((x) => x.id === e.sequenceId); const st = s ? s.steps[Math.min(e.currentStep, s.steps.length) - 1] : null; return { ...out(e), sequenceName: s ? s.name : '', stepLabel: st ? `${e.currentStep}. ${STEP_TYPES[st.type].label}` : '', auto: st ? isAuto(st) : false }; }).sort((a, b) => new Date(a.nextStepAt) - new Date(b.nextStepAt));
}

// Task extra is unpacked into top-level fields by data.js in connected mode.
export async function completeSequenceTask(task, now = new Date()) {
  const meta = { ...task, ...task?.extra };
  if (!meta.enrollmentId) return null;
  await ready;
  if (dbIsLive() && !live) throw new Error('No se pudieron cargar las secuencias');
  let e, steps;
  if (live) {
    const result = await supabase.from('sequence_enrollments').select('*').eq('id', meta.enrollmentId).single();
    if (result.error) throw result.error;
    e = enrFromDb(result.data);
    const resultSteps = await supabase.from('sequence_steps').select('*').eq('sequence_id', e.sequenceId).order('position');
    if (resultSteps.error) throw resultSteps.error;
    steps = resultSteps.data.map(r => ({ ...stepFromDb(r), position: r.position }));
  } else {
    e = enrollRows.find(r => r.id === meta.enrollmentId);
    steps = rows.find(r => r.id === e?.sequenceId)?.steps.map((s, position) => ({ ...s, position }));
  }
  if (!e || task.status !== 'done' || e.status !== 'active' || String(e.extra?.waiting_task) !== String(task.id)
      || e.sequenceId !== meta.sequenceId || steps?.[e.currentStep - 1]?.position !== meta.stepPosition) return null;
  const completed = e.currentStep;
  const next = steps[e.currentStep];
  const nextAt = next ? businessDaysFrom(now, Number(next.delayDays) || 0).toISOString() : null;
  if (live) {
    const result = await supabase.rpc('sequence_complete_task', { p_task: task.id, p_next: nextAt });
    if (result.error) throw result.error;
    if (!result.data?.length) return null;
    e = enrFromDb(result.data[0]);
    const index = enrollRows.findIndex(r => r.id === e.id);
    if (index >= 0) enrollRows[index] = e;
  } else {
    e.currentStep += 1;
    e.nextStepAt = nextAt;
    e.status = next ? 'active' : 'finished';
    delete e.extra.waiting_task;
    e.updatedAt = now.toISOString();
    persistEnr(e);
  }
  addActivity({ type: 'system', when: now.getTime(), who: e.enrolledBy, recordType: 'contacts', recordId: e.contactId,
    text: e.nextStepAt ? `Paso ${completed} completado: la secuencia continúa el ${formatDate(new Date(e.nextStepAt))}.` : `Paso ${completed} completado: secuencia finalizada.`,
    extra: { sequenceId: e.sequenceId, enrollmentId: e.id, taskId: task.id } });
  return out(e);
}

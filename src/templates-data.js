// Plantillas de mensaje: the message_templates / message_template_folders tables with Supabase, localStorage
// otherwise (same [Prueba] seed). Also the personalisation tokens ({{contacto.nombre}}…) and their
// resolution against a real contact, the snippets and the template library.
import { dbIsLive } from './data.js';
import { supabase } from './supabaseClient.js';
import { renderTokens, contextFromRecord, ownerRecord } from './tokens.js';

export const ME = 'Fernando L.';
const LS_T = 'crm:message_templates';
const LS_F = 'crm:message_template_folders';
const H = 3600000;
const ago = (hours) => new Date(Date.now() - hours * H).toISOString();
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

// Personalisation tokens offered by "Insertar" (group → [token, label]).
export const TOKEN_GROUPS = [
  ['Contacto', [['contacto.nombre', 'Nombre'], ['contacto.apellidos', 'Apellidos'], ['contacto.nombre_completo', 'Nombre completo'], ['contacto.correo', 'Correo'], ['contacto.cargo', 'Cargo'], ['contacto.telefono', 'Número de teléfono'], ['contacto.ciudad', 'Ciudad'], ['contacto.empresa', 'Nombre de la empresa']]],
  ['Empresa', [['empresa.nombre', 'Nombre de la empresa'], ['empresa.dominio', 'Dominio'], ['empresa.sector', 'Sector'], ['empresa.ciudad', 'Ciudad de la empresa']]],
  ['Propietario', [['propietario.nombre', 'Nombre del propietario'], ['propietario.correo', 'Correo del propietario']]],
];
export const SNIPPETS = [
  ['Horario de atención', 'Nuestro horario de atención es de lunes a viernes, de 9:00 a 18:00.'],
  ['Garantía', 'Todos nuestros vidrios templados tienen 10 años de garantía.'],
  ['Plazo de instalación', 'El plazo habitual de instalación es de 3 a 4 semanas desde la aceptación del presupuesto.'],
];
// Replaces every {{objeto.propiedad|predeterminado}} with the contact's data (src/tokens.js); the legacy
// {{nombre}}, {{empresa}} and {{remitente}} of the first built-in templates still work. The sender stands
// in as the owner when the contact has none.
export function resolveTokens(text, contact, sender = {}) {
  const c = contact || {};
  const c0 = c.first || c.name ? c : { ...c, first: String(c.name || '').split(' ')[0] };
  const senderOwner = sender.name ? { ...(ownerRecord(sender.name) || { first: sender.name.split(' ')[0], last: '', name: sender.name, phone: '', jobTitle: '' }), email: sender.email || (ownerRecord(sender.name) || {}).email || '' } : null;
  const ctx = contextFromRecord('contacts', c0, senderOwner && (!c0.owner || c0.owner === 'Sin asignar') ? { owner: senderOwner } : {});
  const legacy = String(text || '')
    .replace(/{{\s*nombre\s*}}/g, '{{contacto.nombre}}')
    .replace(/{{\s*empresa\s*}}/g, '{{contacto.empresa|tu empresa}}')
    .replace(/{{\s*remitente\s*}}/g, () => (senderOwner ? senderOwner.name : '{{propietario.nombre_completo}}'));
  return renderTokens(legacy, ctx);
}
// Ready-made templates for "Desde biblioteca de plantillas".
export const LIBRARY = [
  { id: 'lib-followup', name: 'Seguimiento tras una reunión', subject: 'Gracias por tu tiempo, {{contacto.nombre}}', body: '<p>Hola {{contacto.nombre}},</p><p>Gracias por la reunión de hoy. Como acordamos, te envío un resumen de los siguientes pasos y quedo atento a tus comentarios.</p><p>Un saludo,<br>{{propietario.nombre}}</p>' },
  { id: 'lib-quote', name: 'Envío de cotización', subject: 'Cotización para {{contacto.empresa}}', body: '<p>Hola {{contacto.nombre}},</p><p>Adjunto la cotización solicitada para {{contacto.empresa}}. Incluye materiales, instalación y plazos de entrega.</p><p>Cualquier ajuste que necesites, dímelo.</p><p>Saludos,<br>{{propietario.nombre}}</p>' },
  { id: 'lib-reactivate', name: 'Reactivación de cliente', subject: '¿Seguimos con tu proyecto, {{contacto.nombre}}?', body: '<p>Hola {{contacto.nombre}},</p><p>Hace tiempo que no hablamos sobre el proyecto de {{contacto.empresa}}. ¿Sigue en marcha? Me encantaría retomarlo contigo.</p><p>Un saludo,<br>{{propietario.nombre}}</p>' },
  { id: 'lib-visit', name: 'Propuesta de visita técnica', subject: 'Visita técnica en {{contacto.ciudad}}', body: '<p>Hola {{contacto.nombre}},</p><p>Para preparar el presupuesto necesitamos tomar medidas en obra. ¿Qué día te viene bien esta semana?</p><p>Gracias,<br>{{propietario.nombre}}</p>' },
  { id: 'lib-thanks', name: 'Agradecimiento por la compra', subject: 'Gracias por confiar en Megaglass', body: '<p>Hola {{contacto.nombre}},</p><p>Gracias por confiar en Megaglass. Tu asesor, {{propietario.nombre}}, estará pendiente de la instalación y de cualquier duda que surja.</p><p>¡Un saludo!</p>' },
];

export function seedTemplates() {
  return {
    folders: [{ id: 'd2000000-0000-4000-8000-000000000001', name: 'Ventas', createdAt: ago(30 * 24) }, { id: 'd2000000-0000-4000-8000-000000000002', name: 'Soporte', createdAt: ago(30 * 24) }],
    templates: [
      { id: 'd1000000-0000-4000-8000-000000000001', name: '[Prueba] Seguimiento de propuesta', subject: 'Seguimiento: propuesta para {{contacto.empresa}}', body: '<p>Hola {{contacto.nombre}},</p><p>Quería hacer seguimiento de la propuesta que enviamos a {{contacto.empresa}}. ¿Has tenido ocasión de revisarla?</p><p>Quedo a tu disposición para resolver cualquier duda.</p><p>Un saludo,<br>{{propietario.nombre}}</p>', ownerId: 'Fernando L.', folder: 'Ventas', shared: true, createdAt: ago(20 * 24), updatedAt: ago(3 * 24) },
      { id: 'd1000000-0000-4000-8000-000000000002', name: '[Prueba] Presentación de Megaglass', subject: 'Soluciones de vidrio para {{contacto.empresa}}', body: '<p>Hola {{contacto.nombre}},</p><p>Soy {{propietario.nombre}}, de Megaglass. Fabricamos e instalamos soluciones de vidrio para fachadas, cerramientos y mamparas.</p><p>¿Te viene bien una llamada esta semana?</p><p>Saludos,</p>', ownerId: 'Sofía R.', folder: 'Ventas', shared: true, createdAt: ago(15 * 24), updatedAt: ago(8 * 24) },
      { id: 'd1000000-0000-4000-8000-000000000003', name: '[Prueba] Confirmación de visita técnica', subject: 'Confirmación de visita técnica', body: '<p>Hola {{contacto.nombre}},</p><p>Te confirmo la visita técnica para tomar medidas en {{contacto.ciudad}}. Si necesitas cambiar la fecha, responde a este correo.</p><p>Gracias,</p>', ownerId: 'Fernando L.', folder: 'Soporte', shared: false, createdAt: ago(6 * 24), updatedAt: ago(24) },
    ],
  };
}

// ---------- storage ----------
let live = dbIsLive();
let rows = [];
let folderRows = [];
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn).catch((e) => console.error('[supabase] plantillas', e)); return queue; };
const fromDb = (r) => ({ id: r.id, name: r.name || '', subject: r.subject || '', body: r.body || '', ownerId: r.owner_id || '', folder: r.folder || '', shared: r.shared !== false, createdAt: r.created_at, updatedAt: r.updated_at || r.created_at });
const toDb = (t) => ({ id: t.id, name: t.name, subject: t.subject, body: t.body, owner_id: t.ownerId, folder: t.folder || '', shared: Boolean(t.shared), created_at: t.createdAt, updated_at: t.updatedAt });
const saveLocal = () => { localStorage.setItem(LS_T, JSON.stringify(rows)); localStorage.setItem(LS_F, JSON.stringify(folderRows)); };
function loadLocal() {
  try { const t = JSON.parse(localStorage.getItem(LS_T)); const f = JSON.parse(localStorage.getItem(LS_F)); if (Array.isArray(t) && Array.isArray(f)) { rows = t; folderRows = f; return; } } catch { /* seed */ }
  const seed = seedTemplates();
  rows = seed.templates;
  folderRows = seed.folders;
  saveLocal();
}
async function loadLive() {
  const { data: t, error } = await supabase.from('message_templates').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  const { data: f, error: e2 } = await supabase.from('message_template_folders').select('*').order('name');
  if (e2) throw e2;
  rows = (t || []).map(fromDb);
  folderRows = (f || []).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  if (!rows.length && !folderRows.length) {
    const seed = seedTemplates();
    rows = seed.templates; folderRows = seed.folders;
    const { error: e3 } = await supabase.from('message_template_folders').insert(folderRows.map((x) => ({ id: x.id, name: x.name, created_at: x.createdAt })));
    if (e3) console.error('[supabase] semilla de carpetas', e3);
    const { error: e4 } = await supabase.from('message_templates').insert(rows.map(toDb));
    if (e4) console.error('[supabase] semilla de plantillas', e4);
  }
}
export const ready = (async () => {
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tablas de plantillas no disponibles; plantillas en localStorage.', e); loadLocal(); }
  } else loadLocal();
})();
export const templatesLive = () => live;
const persist = (t) => { if (live) enqueue(async () => { const { error } = await supabase.from('message_templates').upsert(toDb(t), { onConflict: 'id' }); if (error) throw error; }); else saveLocal(); };

// ---------- reads ----------
export function templates() { return rows.map((t) => ({ ...t })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); }
export function templateById(id) { const t = rows.find((x) => x.id === id); return t ? { ...t } : null; }
export function folders() { return folderRows.map((f) => f.name).sort((a, b) => a.localeCompare(b, 'es')); }
export const owners = () => [...new Set(rows.map((t) => t.ownerId).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
// Plain text of a template body (for the "is there content?" check and excerpts).
export const bodyText = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

// ---------- writes ----------
export function createFolder(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const existing = folderRows.find((f) => f.name.toLowerCase() === n.toLowerCase());
  if (existing) return existing;
  const f = { id: uuid(), name: n, createdAt: new Date().toISOString() };
  folderRows.push(f);
  if (live) enqueue(async () => { const { error } = await supabase.from('message_template_folders').insert({ id: f.id, name: f.name, created_at: f.createdAt }); if (error) throw error; }); else saveLocal();
  return f;
}
export function createTemplate({ name, subject = '', body = '', folder = '', shared = true, ownerId = ME } = {}) {
  const n = String(name || '').trim();
  if (!n || !bodyText(body)) return null;
  const now = new Date().toISOString();
  const t = { id: uuid(), name: n, subject: String(subject || ''), body: String(body || ''), ownerId, folder: folder || '', shared: Boolean(shared), createdAt: now, updatedAt: now };
  rows.unshift(t);
  persist(t);
  return { ...t };
}
export function updateTemplate(id, patch) {
  const t = rows.find((x) => x.id === id);
  if (!t) return null;
  const next = { ...t, ...patch };
  if (!String(next.name || '').trim() || !bodyText(next.body)) return null;
  Object.assign(t, next, { name: String(next.name).trim(), updatedAt: new Date().toISOString() });
  persist(t);
  return { ...t };
}
export function cloneTemplate(id, { ownerId = ME } = {}) {
  const src = rows.find((x) => x.id === id);
  if (!src) return null;
  const now = new Date().toISOString();
  const t = { ...src, id: uuid(), name: `${src.name} (copia)`, ownerId, createdAt: now, updatedAt: now };
  rows.unshift(t);
  persist(t);
  return { ...t };
}
export function deleteTemplates(ids) {
  const set = new Set(ids);
  const doomed = rows.filter((t) => set.has(t.id)).map((t) => t.id);
  if (!doomed.length) return 0;
  rows = rows.filter((t) => !set.has(t.id));
  if (live) enqueue(async () => { const { error } = await supabase.from('message_templates').delete().in('id', doomed); if (error) throw error; }); else saveLocal();
  return doomed.length;
}
export const moveTemplates = (ids, folder) => ids.map((id) => { const t = rows.find((x) => x.id === id); if (!t) return null; t.folder = folder || ''; t.updatedAt = new Date().toISOString(); persist(t); return t; }).filter(Boolean).length;
export const setShared = (id, shared) => { const t = rows.find((x) => x.id === id); if (!t) return null; t.shared = Boolean(shared); t.updatedAt = new Date().toISOString(); persist(t); return { ...t }; };
// CSV for "Exportar" (the list as filtered on screen).
export function templatesCsv(list = templates()) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Nombre', 'Asunto', 'Propietario', 'Carpeta', 'Compartida', 'Fecha de creación', 'Fecha de modificación'];
  return [head.map(cell).join(','), ...list.map((t) => [t.name, t.subject, t.ownerId, t.folder, t.shared ? 'Compartido con todos' : 'Privado', t.createdAt, t.updatedAt].map(cell).join(','))].join('\n');
}
export function stats() {
  const byOwner = {};
  const byFolder = {};
  rows.forEach((t) => { byOwner[t.ownerId || '--'] = (byOwner[t.ownerId || '--'] || 0) + 1; byFolder[t.folder || 'Sin carpeta'] = (byFolder[t.folder || 'Sin carpeta'] || 0) + 1; });
  return { total: rows.length, shared: rows.filter((t) => t.shared).length, privateCount: rows.filter((t) => !t.shared).length, byOwner, byFolder, latest: templates().slice(0, 5) };
}

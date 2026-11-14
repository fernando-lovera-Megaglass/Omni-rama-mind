// Marketing e-mails (Marketing › Correo): the marketing_emails table with Supabase, localStorage otherwise,
// seeded with the same [Prueba] e-mails. Sending is simulated: the e-mail becomes "enviado" with realistic
// metrics and every recipient gets an entry on its timeline. No real e-mail leaves the app.
import { allContacts, addActivities, dbIsLive } from './data.js';
import { supabase } from './supabaseClient.js';
import { segments, segmentMembers } from './segments-data.js';
import { renderEmailHtml, templateById, cloneModules } from './marketing-templates.js';

export const ME = 'Fernando L.';
export const ESTADOS = { borrador: 'Borrador', programado: 'Programado', enviado: 'Enviado', archivado: 'Archivado' };
export const TIPOS = { normal: 'Normal', automatizado: 'Automatizado', blog: 'Blog' };
const LS = 'crm:marketing_emails';
const H = 3600000;
const ago = (hours) => new Date(Date.now() - hours * H).toISOString();
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export function seedEmails() {
  const E = (n, nombre, asunto, de, estado, tipo, m, prog, sentH, by, upBy, createdH, updatedH, plantilla, carpeta, contenido) => ({ id: `c1000000-0000-4000-8000-00000000000${n}`, nombre, asunto, deNombre: 'Megaglass', deEmail: de, htmlContent: '', estado, tipo, enviados: m[0], entregados: m[1], aperturas: m[2], clics: m[3], programadoPara: prog, enviadoAt: sentH === null ? null : ago(sentH), createdBy: by, updatedBy: upBy, createdAt: ago(createdH), updatedAt: ago(updatedH), contenido, destinatarios: { kind: 'all' }, plantilla, carpeta });
  const T = (id, html) => ({ id, type: 'text', props: { html } });
  const B = (id, label) => ({ id, type: 'button', props: { label, url: 'https://example.com/', align: 'center' } });
  return [
    E(1, '[Prueba] Boletín de noviembre', 'Novedades de noviembre en vidrio y aluminio', 'hola@megaglass.us', 'enviado', 'normal', [420, 407, 112, 9], null, 9 * 24, 'Fernando L.', 'Fernando L.', 12 * 24, 9 * 24, 'newsletter', 'Boletines', [T('m1', '<h1>Novedades de noviembre</h1><p>Nuevas líneas de vidrio templado y perfiles de aluminio para proyectos comerciales.</p>'), B('m2', 'Ver catálogo')]),
    E(2, '[Prueba] Promoción fachadas Q4', '15 % en fachadas de vidrio hasta diciembre', 'hola@megaglass.us', 'enviado', 'normal', [180, 175, 61, 7], null, 20 * 24, 'Sofía R.', 'Sofía R.', 22 * 24, 20 * 24, 'promo', 'Promociones', [T('m1', '<h1>Promoción de fachadas</h1><p>Hasta el 31 de diciembre, 15 % de descuento en fachadas de vidrio para obra nueva.</p>'), B('m2', 'Solicitar presupuesto')]),
    E(3, '[Prueba] Invitación: jornada técnica', 'Te invitamos a la jornada técnica de instaladores', 'eventos@megaglass.us', 'enviado', 'normal', [96, 93, 31, 3], null, 35 * 24, 'Fernando L.', 'Laura M.', 40 * 24, 35 * 24, 'event', 'Eventos', [T('m1', '<h1>Jornada técnica para instaladores</h1><p>Jueves 20 · 10:00 · Planta Monterrey. Cupo limitado.</p>'), B('m2', 'Reservar plaza')]),
    E(4, '[Prueba] Boletín de diciembre (borrador)', 'Cerramos el año con nuevas instalaciones', 'hola@megaglass.us', 'borrador', 'normal', [0, 0, 0, 0], null, null, 'Fernando L.', 'Fernando L.', 2 * 24, 24, 'newsletter', 'Boletines', [T('m1', '<h1>Cerramos el año</h1><p>Un repaso a los proyectos de 2026.</p>')]),
    E(5, '[Prueba] Felicitación de fin de año', '¡Felices fiestas de parte de Megaglass!', 'hola@megaglass.us', 'programado', 'normal', [0, 0, 0, 0], new Date(Date.now() + 20 * 24 * H).toISOString(), null, 'Sofía R.', 'Sofía R.', 3 * 24, 3 * 24, 'greeting', 'Saludos', [T('m1', '<h1>¡Felices fiestas!</h1><p>Gracias por confiar en nosotros un año más.</p>')]),
    E(6, '[Prueba] Aviso de mantenimiento (archivado)', 'Mantenimiento de ventanas antes del invierno', 'hola@megaglass.us', 'archivado', 'automatizado', [240, 232, 48, 2], null, 80 * 24, 'Laura M.', 'Laura M.', 85 * 24, 60 * 24, 'plain', '', [T('m1', '<p>Recuerda revisar juntas y herrajes antes del frío.</p>')]),
  ];
}

// ---------- storage ----------
let live = dbIsLive();
let rows = [];
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn).catch((e) => console.error('[supabase] marketing_emails', e)); return queue; };
const fromDb = (r) => ({ id: r.id, nombre: r.nombre || '', asunto: r.asunto || '', deNombre: r.de_nombre || '', deEmail: r.de_email || '', htmlContent: r.html_content || '', estado: r.estado || 'borrador', tipo: r.tipo || 'normal', enviados: Number(r.enviados) || 0, entregados: Number(r.entregados) || 0, aperturas: Number(r.aperturas) || 0, clics: Number(r.clics) || 0, programadoPara: r.programado_para || null, enviadoAt: r.enviado_at || null, createdBy: r.created_by || '', updatedBy: r.updated_by || r.created_by || '', createdAt: r.created_at, updatedAt: r.updated_at || r.created_at, contenido: Array.isArray(r.contenido) ? r.contenido : [], destinatarios: r.destinatarios && typeof r.destinatarios === 'object' ? r.destinatarios : { kind: 'all' }, plantilla: r.plantilla || '', carpeta: r.carpeta || '' });
const toDb = (e) => ({ id: e.id, nombre: e.nombre, asunto: e.asunto, de_nombre: e.deNombre, de_email: e.deEmail, html_content: e.htmlContent || '', estado: e.estado, tipo: e.tipo, enviados: e.enviados, entregados: e.entregados, aperturas: e.aperturas, clics: e.clics, programado_para: e.programadoPara || null, enviado_at: e.enviadoAt || null, created_by: e.createdBy, updated_by: e.updatedBy || e.createdBy, created_at: e.createdAt, updated_at: e.updatedAt, contenido: e.contenido || [], destinatarios: e.destinatarios || { kind: 'all' }, plantilla: e.plantilla || '', carpeta: e.carpeta || '' });
const saveLocal = () => localStorage.setItem(LS, JSON.stringify(rows));
function loadLocal() {
  try { const saved = JSON.parse(localStorage.getItem(LS)); if (Array.isArray(saved)) { rows = saved; return; } } catch { /* seed below */ }
  rows = seedEmails();
  saveLocal();
}
async function loadLive() {
  const { data, error } = await supabase.from('marketing_emails').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  rows = (data || []).map(fromDb);
  if (!rows.length) {
    rows = seedEmails();
    const { error: e2 } = await supabase.from('marketing_emails').insert(rows.map(toDb));
    if (e2) console.error('[supabase] semilla de correos', e2);
  }
}
export const ready = (async () => {
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tabla marketing_emails no disponible; correos en localStorage.', e); loadLocal(); }
  } else loadLocal();
})();
export const marketingLive = () => live;
const persist = (e) => { if (live) enqueue(async () => { const { error } = await supabase.from('marketing_emails').upsert(toDb(e), { onConflict: 'id' }); if (error) throw error; }); else saveLocal(); };

// ---------- reads ----------
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const decorate = (e) => ({ ...e, tasaEntrega: pct(e.entregados, e.enviados), tasaApertura: pct(e.aperturas, e.entregados), tasaClics: pct(e.clics, e.entregados), fechaPublicacion: e.enviadoAt || e.programadoPara || null });
export function emails() { return rows.map(decorate).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); }
export function emailById(id) { const e = rows.find((x) => x.id === id); return e ? decorate(e) : null; }
export const folders = () => [...new Set(rows.map((e) => e.carpeta).filter(Boolean))].sort();
export function countsByEstado() {
  const out = { all: rows.length, borrador: 0, programado: 0, enviado: 0, archivado: 0 };
  rows.forEach((e) => { out[e.estado] = (out[e.estado] || 0) + 1; });
  return out;
}
// Who gets the e-mail: every contact with an e-mail address, or the members of a contacts segment.
export function recipientOptions() {
  const all = allContacts().filter((c) => c.email);
  return [{ value: 'all', label: `Todos los contactos con correo (${all.length})` }, ...segments().filter((s) => s.object === 'contacts').map((s) => ({ value: `segment:${s.id}`, label: `${s.name} (${segmentMembers(s).filter((c) => c.email).length})` }))];
}
export function recipientsOf(email) {
  const d = (email && email.destinatarios) || { kind: 'all' };
  if (d.kind === 'segment') { const seg = segments().find((s) => String(s.id) === String(d.id)); return seg ? segmentMembers(seg).filter((c) => c.email) : []; }
  return allContacts().filter((c) => c.email);
}
export const destinatariosFromValue = (v) => (v && v.startsWith('segment:') ? { kind: 'segment', id: v.slice(8) } : { kind: 'all' });
export const destinatariosValue = (d) => (d && d.kind === 'segment' ? `segment:${d.id}` : 'all');
export function checklist(email) {
  const n = recipientsOf(email).length;
  return [
    { key: 'recipients', ok: n > 0, label: 'Destinatarios', detail: n ? `${n} ${n === 1 ? 'contacto recibirá' : 'contactos recibirán'} el correo` : 'Elige a quién enviarlo' },
    { key: 'subject', ok: Boolean(String(email.asunto || '').trim()), label: 'Asunto', detail: String(email.asunto || '').trim() || 'Escribe el asunto del correo' },
    { key: 'sender', ok: Boolean(String(email.deNombre || '').trim() && /\S+@\S+\.\S+/.test(email.deEmail || '')), label: 'Remitente', detail: email.deNombre && email.deEmail ? `${email.deNombre} <${email.deEmail}>` : 'Indica el nombre y el correo del remitente' },
    { key: 'content', ok: (email.contenido || []).length > 0, label: 'Contenido', detail: (email.contenido || []).length ? `${email.contenido.length} ${email.contenido.length === 1 ? 'módulo' : 'módulos'} en el correo` : 'Añade al menos un módulo' },
  ];
}

// ---------- writes ----------
export function createEmail({ nombre, tipo = 'normal', plantilla = 'blank', asunto = '', deNombre = 'Megaglass', deEmail = 'hola@megaglass.us', carpeta = '', destinatarios = { kind: 'all' }, createdBy = ME } = {}) {
  const t = templateById(plantilla);
  const now = new Date().toISOString();
  const e = { id: uuid(), nombre: nombre || (t ? t.nombre : 'Correo sin título'), asunto, deNombre, deEmail, htmlContent: '', estado: 'borrador', tipo: TIPOS[tipo] ? tipo : 'normal', enviados: 0, entregados: 0, aperturas: 0, clics: 0, programadoPara: null, enviadoAt: null, createdBy, updatedBy: createdBy, createdAt: now, updatedAt: now, contenido: t ? t.modules() : [], destinatarios, plantilla: t ? t.id : 'blank', carpeta };
  e.htmlContent = renderEmailHtml(e);
  rows.unshift(e);
  persist(e);
  return decorate(e);
}
export function updateEmail(id, patch, { by = ME } = {}) {
  const e = rows.find((x) => x.id === id);
  if (!e) return null;
  Object.assign(e, patch, { updatedAt: new Date().toISOString(), updatedBy: by });
  e.htmlContent = renderEmailHtml(e);
  persist(e);
  return decorate(e);
}
export function cloneEmail(id, { by = ME } = {}) {
  const src = rows.find((x) => x.id === id);
  if (!src) return null;
  const now = new Date().toISOString();
  const e = { ...src, id: uuid(), nombre: `${src.nombre} (copia)`, estado: 'borrador', enviados: 0, entregados: 0, aperturas: 0, clics: 0, programadoPara: null, enviadoAt: null, createdBy: by, updatedBy: by, createdAt: now, updatedAt: now, contenido: cloneModules(src.contenido), destinatarios: { ...(src.destinatarios || { kind: 'all' }) } };
  e.htmlContent = renderEmailHtml(e);
  rows.unshift(e);
  persist(e);
  return decorate(e);
}
let prevEstado = new Map();
export function archiveEmail(id, on = true, { by = ME } = {}) {
  const e = rows.find((x) => x.id === id);
  if (!e) return null;
  if (on) { prevEstado.set(id, e.estado); return updateEmail(id, { estado: 'archivado' }, { by }); }
  const back = prevEstado.get(id) || (e.enviadoAt ? 'enviado' : 'borrador');
  return updateEmail(id, { estado: back }, { by });
}
export function deleteEmail(id) {
  const i = rows.findIndex((x) => x.id === id);
  if (i < 0) return false;
  rows.splice(i, 1);
  if (live) enqueue(async () => { const { error } = await supabase.from('marketing_emails').delete().eq('id', id); if (error) throw error; }); else saveLocal();
  return true;
}
// Realistic numbers for a simulated send: ≈97 % delivered, 10-35 % opened, 0-4 % clicked.
export function simulateMetrics(enviados, rnd = Math.random) {
  const entregados = Math.min(enviados, Math.round(enviados * (0.96 + rnd() * 0.02)));
  const aperturas = Math.round(entregados * (0.10 + rnd() * 0.25));
  const clics = Math.min(aperturas, Math.round(entregados * (rnd() * 0.04)));
  return { entregados, aperturas, clics };
}
// "Enviar ahora" / "Programar". Nothing leaves the app: the e-mail is marked sent (or scheduled) and each
// recipient gets a timeline entry.
export function sendEmail(id, { at, by = ME, rnd } = {}) {
  const e = rows.find((x) => x.id === id);
  if (!e) return null;
  if (checklist(e).some((c) => !c.ok)) return null;
  const now = new Date();
  if (at && new Date(at) > now) return updateEmail(id, { estado: 'programado', programadoPara: new Date(at).toISOString() }, { by });
  const people = recipientsOf(e);
  const metrics = simulateMetrics(people.length, rnd);
  const sent = updateEmail(id, { estado: 'enviado', enviadoAt: now.toISOString(), programadoPara: null, enviados: people.length, ...metrics }, { by });
  addActivities(people.map((c) => ({ type: 'email', recordType: 'contacts', recordId: Number(c.id), text: `Correo de marketing: ${e.nombre}`, who: 'Marketing', when: now.getTime(), extra: { subject: e.asunto, marketingEmailId: e.id, channel: 'Correo de marketing' } })));
  return sent;
}
// "Enviar prueba": only a log line and a confirmation; the test e-mail is not delivered anywhere.
export function sendTest(id, to) {
  const e = rows.find((x) => x.id === id);
  if (!e || !/\S+@\S+\.\S+/.test(to || '')) return false;
  console.info(`[marketing] correo de prueba de "${e.nombre}" a ${to} (simulado)`);
  return true;
}
export function analytics() {
  const sent = rows.filter((e) => e.enviadoAt && e.enviados > 0).map(decorate).sort((a, b) => new Date(b.enviadoAt) - new Date(a.enviadoAt));
  const sum = (k) => sent.reduce((s, e) => s + (Number(e[k]) || 0), 0);
  const enviados = sum('enviados');
  const entregados = sum('entregados');
  return { sent, enviados, entregados, aperturas: sum('aperturas'), clics: sum('clics'), tasaEntrega: pct(entregados, enviados), tasaApertura: pct(sum('aperturas'), entregados), tasaClics: pct(sum('clics'), entregados) };
}

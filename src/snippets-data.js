// Fragmentos: the snippets / snippet_folders tables with Supabase, localStorage otherwise (same [Prueba]
// seed). A snippet is a reusable block of text (HTML with personalisation tokens) reached by typing "#" and its
// shortcut in any text editor, or from the "Insertar" menus.
import { dbIsLive } from './data.js';
import { supabase } from './supabaseClient.js';

export const ME = 'Fernando L.';
const LS_S = 'crm:snippets';
const LS_F = 'crm:snippet_folders';
const H = 3600000;
const ago = (hours) => new Date(Date.now() - hours * H).toISOString();
const uuid = () => (globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export function seedSnippets() {
  return {
    folders: [{ id: 'd4000000-0000-4000-8000-000000000001', name: 'Ventas', createdAt: ago(30 * 24) }, { id: 'd4000000-0000-4000-8000-000000000002', name: 'Soporte', createdAt: ago(30 * 24) }],
    snippets: [
      { id: 'd3000000-0000-4000-8000-000000000001', name: '[Prueba] Horario de atención', body: '<p>Nuestro horario de atención es de lunes a viernes, de 9:00 a 18:00.</p>', shortcut: 'horario', folder: 'Soporte', ownerId: 'Fernando L.', createdAt: ago(12 * 24), updatedAt: ago(2 * 24) },
      { id: 'd3000000-0000-4000-8000-000000000002', name: '[Prueba] Garantía', body: '<p>Hola {{contacto.nombre|cliente}}, todos nuestros vidrios templados tienen 10 años de garantía.</p>', shortcut: 'garantia', folder: 'Ventas', ownerId: 'Sofía R.', createdAt: ago(9 * 24), updatedAt: ago(4 * 24) },
      { id: 'd3000000-0000-4000-8000-000000000003', name: '[Prueba] Plazo de instalación', body: '<p>El plazo habitual de instalación para {{contacto.empresa|tu empresa}} es de 3 a 4 semanas desde la aceptación del presupuesto.</p>', shortcut: 'plazo', folder: 'Ventas', ownerId: 'Fernando L.', createdAt: ago(5 * 24), updatedAt: ago(24) },
    ],
  };
}

// ---------- storage ----------
let live = dbIsLive();
let rows = [];
let folderRows = [];
let queue = Promise.resolve();
const enqueue = (fn) => { queue = queue.then(fn).catch((e) => console.error('[supabase] fragmentos', e)); return queue; };
const fromDb = (r) => ({ id: r.id, name: r.name || '', body: r.body || '', shortcut: r.shortcut || '', folder: r.folder || '', ownerId: r.owner_id || '', createdAt: r.created_at, updatedAt: r.updated_at || r.created_at });
const toDb = (s) => ({ id: s.id, name: s.name, body: s.body, shortcut: s.shortcut, folder: s.folder || '', owner_id: s.ownerId, created_at: s.createdAt, updated_at: s.updatedAt });
const saveLocal = () => { localStorage.setItem(LS_S, JSON.stringify(rows)); localStorage.setItem(LS_F, JSON.stringify(folderRows)); };
function loadLocal() {
  try { const s = JSON.parse(localStorage.getItem(LS_S)); const f = JSON.parse(localStorage.getItem(LS_F)); if (Array.isArray(s) && Array.isArray(f)) { rows = s; folderRows = f; return; } } catch { /* seed */ }
  const seed = seedSnippets();
  rows = seed.snippets;
  folderRows = seed.folders;
  saveLocal();
}
async function loadLive() {
  const { data: s, error } = await supabase.from('snippets').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  const { data: f, error: e2 } = await supabase.from('snippet_folders').select('*').order('name');
  if (e2) throw e2;
  rows = (s || []).map(fromDb);
  folderRows = (f || []).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  if (!rows.length && !folderRows.length) {
    const seed = seedSnippets();
    rows = seed.snippets; folderRows = seed.folders;
    const { error: e3 } = await supabase.from('snippet_folders').insert(folderRows.map((x) => ({ id: x.id, name: x.name, created_at: x.createdAt })));
    if (e3) console.error('[supabase] semilla de carpetas de fragmentos', e3);
    const { error: e4 } = await supabase.from('snippets').insert(rows.map(toDb));
    if (e4) console.error('[supabase] semilla de fragmentos', e4);
  }
}
export const ready = (async () => {
  if (live) {
    try { await loadLive(); } catch (e) { live = false; console.error('[supabase] tablas de fragmentos no disponibles; fragmentos en localStorage.', e); loadLocal(); }
  } else loadLocal();
})();
export const snippetsLive = () => live;
const persist = (s) => { if (live) enqueue(async () => { const { error } = await supabase.from('snippets').upsert(toDb(s), { onConflict: 'id' }); if (error) throw error; }); else saveLocal(); };

// ---------- reads ----------
export function snippets() { return rows.map((s) => ({ ...s })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); }
export function snippetById(id) { const s = rows.find((x) => x.id === id); return s ? { ...s } : null; }
export function folders() { return folderRows.map((f) => f.name).sort((a, b) => a.localeCompare(b, 'es')); }
export const owners = () => [...new Set(rows.map((s) => s.ownerId).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
export const bodyText = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
// Snippets whose shortcut starts with what was typed after "#" (all of them for an empty prefix).
export function matchShortcut(prefix) {
  const p = String(prefix || '').toLowerCase();
  return rows.filter((s) => s.shortcut.toLowerCase().startsWith(p)).sort((a, b) => a.shortcut.localeCompare(b.shortcut, 'es')).map((s) => ({ ...s }));
}
export const byShortcut = (shortcut) => { const s = rows.find((x) => x.shortcut.toLowerCase() === String(shortcut || '').toLowerCase()); return s ? { ...s } : null; };
// A shortcut is one word (letters, numbers, - or _) and unique among the snippets; returns the problem or null.
export function validateShortcut(value, excludeId = null) {
  const v = String(value || '').trim();
  if (!v) return 'Escribe un atajo.';
  if (/\s/.test(v)) return 'El atajo debe ser una sola palabra, sin espacios.';
  if (!/^[\p{L}\p{N}_-]+$/u.test(v)) return 'Usa solo letras, números, guiones o guiones bajos.';
  if (rows.some((s) => s.id !== excludeId && s.shortcut.toLowerCase() === v.toLowerCase())) return 'Ya existe un fragmento con ese atajo.';
  return null;
}
const freeShortcut = (base) => { let s = `${base}-copia`; for (let n = 2; rows.some((x) => x.shortcut.toLowerCase() === s.toLowerCase()); n += 1) s = `${base}-copia${n}`; return s; };

// ---------- writes ----------
export function createFolder(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const existing = folderRows.find((f) => f.name.toLowerCase() === n.toLowerCase());
  if (existing) return existing;
  const f = { id: uuid(), name: n, createdAt: new Date().toISOString() };
  folderRows.push(f);
  if (live) enqueue(async () => { const { error } = await supabase.from('snippet_folders').insert({ id: f.id, name: f.name, created_at: f.createdAt }); if (error) throw error; }); else saveLocal();
  return f;
}
export function createSnippet({ name, body = '', shortcut = '', folder = '', ownerId = ME } = {}) {
  const n = String(name || '').trim();
  const sc = String(shortcut || '').trim();
  if (!n || !bodyText(body) || validateShortcut(sc)) return null;
  const now = new Date().toISOString();
  const s = { id: uuid(), name: n, body: String(body || ''), shortcut: sc, folder: folder || '', ownerId, createdAt: now, updatedAt: now };
  rows.unshift(s);
  persist(s);
  return { ...s };
}
export function updateSnippet(id, patch) {
  const s = rows.find((x) => x.id === id);
  if (!s) return null;
  const next = { ...s, ...patch };
  const sc = String(next.shortcut || '').trim();
  if (!String(next.name || '').trim() || !bodyText(next.body) || validateShortcut(sc, id)) return null;
  Object.assign(s, next, { name: String(next.name).trim(), shortcut: sc, updatedAt: new Date().toISOString() });
  persist(s);
  return { ...s };
}
export function cloneSnippet(id, { ownerId = ME } = {}) {
  const src = rows.find((x) => x.id === id);
  if (!src) return null;
  const now = new Date().toISOString();
  const s = { ...src, id: uuid(), name: `${src.name} (copia)`, shortcut: freeShortcut(src.shortcut), ownerId, createdAt: now, updatedAt: now };
  rows.unshift(s);
  persist(s);
  return { ...s };
}
export function deleteSnippets(ids) {
  const set = new Set(ids);
  const doomed = rows.filter((s) => set.has(s.id)).map((s) => s.id);
  if (!doomed.length) return 0;
  rows = rows.filter((s) => !set.has(s.id));
  if (live) enqueue(async () => { const { error } = await supabase.from('snippets').delete().in('id', doomed); if (error) throw error; }); else saveLocal();
  return doomed.length;
}
export const moveSnippets = (ids, folder) => ids.map((id) => { const s = rows.find((x) => x.id === id); if (!s) return null; s.folder = folder || ''; s.updatedAt = new Date().toISOString(); persist(s); return s; }).filter(Boolean).length;

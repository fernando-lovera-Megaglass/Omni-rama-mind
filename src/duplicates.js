// "Gestionar duplicados" and "Corregir problemas de formato" helpers (pure functions used by the lists).
// Duplicates: contacts that share an e-mail or a name, companies that share a domain or a name, grouped
// with a union-find so a record that matches two others by different keys ends up in one group.
import { strip, siteDomain } from './data.js';
import { normalizePhone } from './import-engine.js';

const normName = (s) => strip(String(s || '')).replace(/[^a-z0-9]+/g, ' ').trim();
const normEmail = (s) => String(s || '').trim().toLowerCase();

// [{ keys: ['email'|'name'|'domain'...], records: [...] }], biggest groups first; records ordered by id.
export function findDuplicateGroups(type, rows) {
  const parent = new Map();
  const find = (id) => { let x = id; while (parent.get(x) !== x) x = parent.get(x); return x; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  rows.forEach((r) => parent.set(Number(r.id), Number(r.id)));
  const reasons = new Map(); // id → Set of keys that matched
  const byKey = (keyName, valueOf) => {
    const seen = new Map();
    rows.forEach((r) => {
      const v = valueOf(r);
      if (!v) return;
      if (seen.has(v)) { union(seen.get(v), Number(r.id)); [seen.get(v), Number(r.id)].forEach((id) => { if (!reasons.has(id)) reasons.set(id, new Set()); reasons.get(id).add(keyName); }); } else seen.set(v, Number(r.id));
    });
  };
  if (type === 'companies') {
    byKey('domain', (r) => siteDomain(r.domain || '') || '');
    byKey('name', (r) => normName(r.name));
  } else {
    byKey('email', (r) => normEmail(r.email));
    byKey('name', (r) => { const full = r.first || r.last ? `${r.first || ''} ${r.last || ''}` : r.name; const n = normName(full); return n.includes(' ') ? n : ''; });
  }
  const groups = new Map();
  rows.forEach((r) => { const root = find(Number(r.id)); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(r); });
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({ records: g.slice().sort((a, b) => Number(a.id) - Number(b.id)), keys: [...new Set(g.flatMap((r) => [...(reasons.get(Number(r.id)) || [])]))] }))
    .sort((a, b) => b.records.length - a.records.length || Number(a.records[0].id) - Number(b.records[0].id));
}
// Which record a merge keeps by default: the one with most filled fields, then the oldest.
export function suggestedKeep(records) {
  const filled = (r) => Object.values(r).filter((v) => v !== undefined && v !== null && v !== '').length;
  return records.slice().sort((a, b) => filled(b) - filled(a) || new Date(a.created || 0) - new Date(b.created || 0))[0];
}

// ---- formatting fixes ----
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'di', 'do', 'das', 'dos', 'van', 'von', 'der', 'el', 'al']);
const capWord = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
// People's names: "ANA RUIZ" / "ana ruiz" → "Ana Ruiz"; mixed-case words (McDonald) and particles are respected.
export function fixPersonName(s) {
  const words = String(s || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return words.map((w, i) => {
    const lower = w.toLowerCase();
    if (i > 0 && PARTICLES.has(lower)) return lower;
    if (w === w.toUpperCase() || w === lower) return w.split('-').map(capWord).join('-');
    return w;
  }).join(' ');
}
// Company names: capitalise words written all in lower case; acronyms, numbers and dotted tokens stay.
export function fixCompanyName(s) {
  const words = String(s || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return words.map((w, i) => {
    const lower = w.toLowerCase();
    if (i > 0 && PARTICLES.has(lower)) return lower;
    if (/[\d.]/.test(w) || (w === w.toUpperCase() && w.length <= 4)) return w;
    if (w === lower) return capWord(w);
    return w;
  }).join(' ');
}
export const fixPhone = (s) => { const v = String(s || '').trim(); if (!v) return v; const n = normalizePhone(v); return n || v; };
// Changes a format fix would make to one record: [{ key, label, from, to }].
export function formatFixes(type, r) {
  const out = [];
  const push = (key, label, to) => { if (to !== undefined && to !== null && String(to) !== String(r[key] ?? '') && String(r[key] ?? '').trim()) out.push({ key, label, from: r[key], to }); };
  if (type === 'contacts') {
    push('first', 'Nombre', fixPersonName(r.first));
    push('last', 'Apellidos', fixPersonName(r.last));
    const full = `${fixPersonName(r.first)} ${fixPersonName(r.last)}`.trim();
    if (full && (r.first || r.last)) push('name', 'Nombre completo', full); else push('name', 'Nombre completo', fixPersonName(r.name));
    push('phone', 'Número de teléfono', fixPhone(r.phone));
    push('mobilephone', 'Número de móvil', fixPhone(r.mobilephone));
  } else {
    push('name', 'Nombre de la empresa', fixCompanyName(r.name));
    push('phone', 'Número de teléfono', fixPhone(r.phone));
  }
  return out;
}

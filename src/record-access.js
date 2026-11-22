import { TEAMS } from './layout-defaults.js';
import { ownerHtml } from './owner.js';

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const key = (value) => String(value || '').trim().toLowerCase();
const admin = (u) => u.status === 'Activo' && !u.invitationOnly && ['Administrador', 'Superadministrador'].includes(u.role);

// Same persisted sources as Settings > Users/Teams. Do not generate its demo
// users: invitations alone prove neither membership activation nor permissions.
export function recordAccessHtml(rec, storage = localStorage) {
  const read = (name, fallback) => {
    try { const value = JSON.parse(storage.getItem(name)); return Array.isArray(value) ? value.filter(Boolean) : fallback; } catch { return fallback; }
  };
  const users = read('crm:users', []);
  const teams = new Set(read('crm:teams', TEAMS.map((name) => ({ name }))).map((t) => t.name));
  const owner = String(rec.owner || '').trim();
  const hasOwner = owner && key(owner) !== 'sin asignar';
  const matches = hasOwner ? users.filter((u) => [u.name, u.email, u.id].some((v) => v && key(v) === key(owner))) : [];
  const ownerUser = matches.length === 1 ? matches[0] : null;
  const rows = [];
  const row = (name, u, access) => `<tr><td>${ownerHtml(name)}</td><td>${esc(u && teams.has(u.team) ? u.team : '—')}</td><td>${esc(access)}</td></tr>`;
  if (hasOwner) rows.push(row(owner, ownerUser, admin(ownerUser || {}) ? 'Propietario · Administrador · Control total' : 'Propietario · Permisos no verificados'));
  const seen = new Set();
  for (const u of users) {
    const identity = key(u.email || u.id || u.name);
    if (!identity || !admin(u) || u === ownerUser || seen.has(identity)) continue;
    seen.add(identity);
    rows.push(row(u.name || u.email || u.id, u, 'Administrador · Control total'));
  }
  return `${rows.length ? `<table class="mini-table"><thead><tr><th>Usuario</th><th>Equipo</th><th>Acceso</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p>No hay propietario asignado ni administradores activos registrados.</p>'}<p class="muted">Se muestran el propietario de la ficha y los administradores activos guardados en Configuración › Usuarios. Los equipos indican pertenencia; los permisos de acceso por equipo aún no están implementados. Ser propietario no confirma por sí solo los permisos de edición.</p>`;
}

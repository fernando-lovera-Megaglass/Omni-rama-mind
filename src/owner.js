import { ACT_ICONS } from './action-icons.js';
// Owners and user-type properties look the same everywhere, like in the original: a round avatar with the
// person's initials (its colour derives from the name, so the same person always gets the same one) to the
// left of the name; «Sin asignar» gets the grey placeholder. Sizes: xs in tables, chips and bars, sm in cards
// and panels. Shared by the lists, the record page, the preview, the dialogs, the inbox and the tool lists.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const OWNER_COLORS = ['#006162', '#0091ae', '#6a78d1', '#f2547d', '#00a4bd', '#ff7a59', '#425b76', '#7c98b6'];
export const isUnassigned = (name) => !name || name === 'Sin asignar' || name === '--';
export const ownerInitials = (name) => String(name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export function ownerColor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return OWNER_COLORS[h % OWNER_COLORS.length];
}
// Avatar only (e.g. the foot of a board card); with `titled` it carries the name as tooltip and label.
export function ownerAvatarHtml(name, size = 'xs', { titled = false } = {}) {
  if (isUnassigned(name)) return `<span class="avatar avatar--${size} avatar--empty" ${titled ? 'title="Sin asignar" aria-label="Propietario sin asignar"' : 'aria-hidden="true"'}>${ACT_ICONS.user}</span>`;
  return `<span class="avatar avatar--${size}" style="background:${ownerColor(name)}" ${titled ? `title="${esc(name)}" aria-label="Propietario: ${esc(name)}"` : 'aria-hidden="true"'}>${esc(ownerInitials(name))}</span>`;
}
// Avatar + name (the standard rendering of an owner wherever it is displayed).
export function ownerHtml(name, size = 'xs') {
  if (isUnassigned(name)) return `<span class="owner owner--none">${ownerAvatarHtml('', size)}<span class="owner__name muted">Sin asignar</span></span>`;
  return `<span class="owner">${ownerAvatarHtml(name, size)}<span class="owner__name">${esc(name)}</span></span>`;
}

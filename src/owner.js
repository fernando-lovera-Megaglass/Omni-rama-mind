import { ACT_ICONS } from './action-icons.js';
import { avatarFor, avatarForUser, ME_KEY } from './avatars.js';
// Owners and user-type properties look the same everywhere, like in the original: a round avatar with the
// person's photo when they uploaded one (Configuración › General › Perfil, src/avatars.js) or their initials
// (the colour derives from the name, so the same person always gets the same one) to the left of the name;
// «Sin asignar» gets the grey placeholder. Sizes: xs in tables, chips and bars, sm in cards and panels.
// Shared by the lists, the record page, the preview, the dialogs, the inbox, the tool lists and the top bar.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cssUrl = (u) => String(u).replace(/["'()\\\s]/g, (c) => encodeURIComponent(c));
// A round photo (background image, so it sizes exactly like the initials avatar).
const photoHtml = (url, size, attrs) => `<span class="avatar avatar--${size} avatar--img" style="background-image:url('${cssUrl(url)}')" ${attrs}></span>`;

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
  const attrs = titled ? `title="${esc(name)}" aria-label="Propietario: ${esc(name)}"` : 'aria-hidden="true"';
  const photo = avatarFor(name);
  if (photo) return photoHtml(photo, size, attrs);
  return `<span class="avatar avatar--${size}" style="background:${ownerColor(name)}" ${attrs}>${esc(ownerInitials(name))}</span>`;
}
// The avatar of a person given as a user object ({ id, email, user_metadata.name }) or a name: the photo when
// there is one (the signed-in person's own photo also answers to ME_KEY), the initials otherwise.
export function avatarHtml(user, size = 'sm', { titled = false } = {}) {
  if (typeof user === 'string') return ownerAvatarHtml(user, size, { titled });
  const meta = (user && user.user_metadata) || {};
  const label = (user && (meta.name || meta.full_name || user.name || user.email)) || '';
  const photo = (user && avatarForUser(user)) || avatarFor(ME_KEY);
  const attrs = titled && label ? `title="${esc(label)}" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  if (photo) return photoHtml(photo, size, attrs);
  if (!label) return `<span class="avatar avatar--${size} avatar--empty" ${attrs}>${ACT_ICONS.user}</span>`;
  return `<span class="avatar avatar--${size}" style="background:${ownerColor(label)}" ${attrs}>${esc(ownerInitials(label.includes('@') ? label.split('@')[0] : label))}</span>`;
}
// Updates an existing .avatar element in place (the top bar): photo or initials.
export function applyAvatarTo(el, { photo = '', initials = '', color = '' } = {}) {
  if (!el) return;
  el.classList.toggle('avatar--img', Boolean(photo));
  el.style.backgroundImage = photo ? `url('${cssUrl(photo)}')` : '';
  if (photo) { el.textContent = ''; el.style.background = ''; el.style.backgroundImage = `url('${cssUrl(photo)}')`; } else { el.textContent = initials; if (color) el.style.background = color; }
}
// Avatar + name (the standard rendering of an owner wherever it is displayed).
export function ownerHtml(name, size = 'xs') {
  if (isUnassigned(name)) return `<span class="owner owner--none">${ownerAvatarHtml('', size)}<span class="owner__name muted">Sin asignar</span></span>`;
  return `<span class="owner">${ownerAvatarHtml(name, size)}<span class="owner__name">${esc(name)}</span></span>`;
}

// Initials remain visible while loading and immediately when the public image fails.
export function companyAvatarHtml(company, size = 'sm') {
  const safeSize = ['xs', 'sm', 'lg'].includes(size) ? size : 'sm';
  const url = company.domain && (company.logoUrl || company.extra?.logoUrl);
  const image = typeof url === 'string' && /^https:\/\//i.test(url)
    ? `<img src="${esc(url)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:white;border-radius:inherit;visibility:hidden" onload="this.style.visibility='visible'" onerror="this.remove()" />` : '';
  return `<span class="avatar avatar--${safeSize} avatar--soft" style="position:relative;overflow:hidden" aria-hidden="true">${esc(ownerInitials(company.name))}${image}</span>`;
}

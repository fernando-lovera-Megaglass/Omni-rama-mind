// Profile photos: the registry that maps a person (owner name, full name, e-mail, user id) to the photo shown
// by every avatar in the CRM (src/owner.js), the upload to Supabase Storage (bucket `avatars`, one folder per
// user, public URL saved in profiles.avatar_url — supabase/avatars-storage.sql) with a local copy in
// localStorage so the photo shows right after a reload, Gravatar as the alternative source, and the removal.
// Without Supabase (or without a session) the photo lives in localStorage only.
import { supabase } from './supabaseClient.js';
import { currentUser, authEnabled } from './auth.js';

const LS_KEY = 'crm:avatars';
export const ME_KEY = '__me'; // the signed-in person's own photo (the top bar), whatever name the data uses
let client = supabase;
// Tests inject a fake client (storage.from().upload / getPublicUrl, from('profiles').upsert / select).
export const setAvatarClient = (c) => { client = c; };
const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const avatarKey = (s) => strip(s);
const read = () => { try { const v = JSON.parse(localStorage.getItem(LS_KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
let map = read();
const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch { /* storage full or disabled */ } };
const emit = (detail) => { if (typeof document !== 'undefined' && document.defaultView) document.dispatchEvent(new document.defaultView.CustomEvent('crm:avatar', { detail })); };

// ---------- lookups ----------
export const avatarFor = (nameOrEmail) => (nameOrEmail ? map[avatarKey(nameOrEmail)] || '' : '');
export function avatarForUser(user) {
  if (!user) return '';
  const meta = (user.user_metadata) || {};
  return avatarFor(user.id) || avatarFor(user.email) || avatarFor(meta.name || meta.full_name) || '';
}
export const hasAnyAvatar = () => Object.keys(map).length > 0;
// «Sofía Ramírez» → «Sofía R.» (how the data names its owners).
export const shortOwnerName = (first, last) => { const f = String(first || '').trim(); const l = String(last || '').trim(); return f && l ? `${f} ${l[0]}.` : f; };
// Every key one person is known by: user id, e-mail, full name, short owner name, and the owners of the
// account whose first name matches the person (by first name or by the e-mail's local part).
export function keysForPerson({ id = '', email = '', first = '', last = '', name = '', owners = [] } = {}) {
  const full = name || `${first} ${last}`.trim();
  const [f = '', ...rest] = full.split(' ');
  const firstName = first || f;
  const lastName = last || rest.join(' ');
  const keys = [id, email, full, shortOwnerName(firstName, lastName)];
  const local = strip(String(email || '').split('@')[0]);
  (owners || []).forEach((o) => {
    const of = strip(String(o).split(' ')[0]);
    if (!of || o === 'Sin asignar') return;
    if ((firstName && strip(firstName) === of) || (local && local.startsWith(of))) keys.push(o);
  });
  return [...new Set(keys.map(avatarKey).filter(Boolean))];
}

// ---------- registry ----------
export function registerAvatar(keys, url) {
  if (!url) return;
  [].concat(keys).map(avatarKey).filter(Boolean).forEach((k) => { map[k] = url; });
  persist();
  emit({ url, keys: [].concat(keys) });
}
export function unregisterAvatar(keys) {
  [].concat(keys).map(avatarKey).filter(Boolean).forEach((k) => { delete map[k]; });
  persist();
  emit({ url: '', keys: [].concat(keys) });
}
export const resetAvatars = () => { map = {}; persist(); };

// ---------- Supabase Storage ----------
const dataUrlToBlob = (dataUrl) => {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const type = m[1] || 'application/octet-stream';
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type });
};
const extOf = (type) => ({ 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type] || 'jpg');
// Uploads the (cropped) picture to avatars/<user id>/avatar.<ext>, saves the public URL in the person's profile
// row and registers it. Falls back to the data URL kept locally when there is no session or the upload fails.
export async function saveAvatar(dataUrl, { user = null, keys = [], owners = [] } = {}) {
  const u = user || (authEnabled() ? await currentUser().catch(() => null) : null);
  let url = dataUrl;
  let uploaded = false;
  let error = '';
  if (u && u.id && client && client.storage && typeof client.storage.from === 'function') {
    try {
      const blob = dataUrlToBlob(dataUrl);
      if (!blob) throw new Error('Imagen no válida');
      const path = `${u.id}/avatar.${extOf(blob.type)}`;
      const bucket = client.storage.from('avatars');
      const { error: upErr } = await bucket.upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: '0' });
      if (upErr) throw upErr;
      const { data } = bucket.getPublicUrl(path);
      url = `${data.publicUrl}?v=${Date.now()}`;
      const { error: profErr } = await client.from('profiles').upsert({ id: u.id, email: u.email || '', avatar_url: url }, { onConflict: 'id' });
      if (profErr) throw profErr;
      uploaded = true;
    } catch (e) {
      error = (e && e.message) || String(e);
      url = dataUrl; // keep the local copy so the photo still shows
    }
  }
  const meta = (u && u.user_metadata) || {};
  const all = [ME_KEY, ...keys, ...keysForPerson({ id: u && u.id, email: u && u.email, name: meta.name || meta.full_name || '', owners })];
  registerAvatar(all, url);
  return { url, uploaded, error };
}
export async function removeAvatar({ user = null, keys = [] } = {}) {
  const u = user || (authEnabled() ? await currentUser().catch(() => null) : null);
  if (u && u.id && client && client.storage && typeof client.storage.from === 'function') {
    try {
      await client.storage.from('avatars').remove(['jpg', 'png', 'webp', 'gif'].map((e) => `${u.id}/avatar.${e}`));
      await client.from('profiles').upsert({ id: u.id, email: u.email || '', avatar_url: null }, { onConflict: 'id' });
    } catch (e) { console.error('[avatar] quitar', e); }
  }
  const meta = (u && u.user_metadata) || {};
  unregisterAvatar([ME_KEY, ...keys, ...keysForPerson({ id: u && u.id, email: u && u.email, name: meta.name || meta.full_name || '' })]);
  return true;
}
// Gravatar: the SHA-256 of the lower-cased e-mail; ?d=404 so a missing picture fails instead of showing a default.
export async function gravatarUrl(email, size = 256) {
  const e = strip(email);
  if (!e || typeof crypto === 'undefined' || !crypto.subtle) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(e));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `https://www.gravatar.com/avatar/${hex}?s=${size}&d=404`;
}
// Resolves true when the picture exists (the browser can load it); false when Gravatar has none.
export const imageExists = (url) => new Promise((resolve) => {
  if (typeof Image === 'undefined') { resolve(false); return; }
  const img = new Image();
  img.onload = () => resolve(true);
  img.onerror = () => resolve(false);
  img.src = url;
});

// ---------- the team's photos (profiles.avatar_url), loaded once per page ----------
export async function loadAvatars({ owners = [] } = {}) {
  if (!client || typeof client.from !== 'function') return map;
  try {
    const { data, error } = await client.from('profiles').select('id,email,name,avatar_url');
    if (error || !Array.isArray(data)) return map;
    data.forEach((r) => { if (r && r.avatar_url) [].concat(keysForPerson({ id: r.id, email: r.email, name: r.name || '', owners })).forEach((k) => { map[k] = r.avatar_url; }); });
    persist();
  } catch { /* table or policy missing: local photos only */ }
  return map;
}
// A slow network must never delay the pages: the registry is ready after the fetch or after 1.5 s.
export const ready = Promise.race([loadAvatars(), new Promise((r) => setTimeout(r, 1500))]).then(() => map);

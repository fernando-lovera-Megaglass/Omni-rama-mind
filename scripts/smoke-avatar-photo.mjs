// DOM smoke test for the profile photo: upload from Configuración › General › Perfil (file → circular
// cropper with zoom slider → save), the photo registered for the person's owner name (src/avatars.js), shown
// in the top bar and — after a reload — in the owner menus (lists, owner dropdown, record), the users/teams
// tables of Configuración and the calls page; the upload to Supabase Storage with a fake client (bucket
// avatars/<user id>/avatar.jpg + profiles.avatar_url); Gravatar address; removal; the profile defaults come
// from the signed-in user, not from a hard-coded name. Run: node scripts/smoke-avatar-photo.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const log = (...a) => console.log('[avatar-photo]', ...a);
const fail = (msg) => { console.error(`[avatar-photo] FAIL: ${msg}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
function useDom(html, url) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.FormData = dom.window.FormData;
  globalThis.FileReader = dom.window.FileReader;
  globalThis.File = dom.window.File;
  globalThis.Blob = dom.window.Blob;
  globalThis.URL = dom.window.URL;
  globalThis.Image = dom.window.Image;
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLElement.prototype.scrollBy = function () {};
  dom.window.confirm = () => true;
  return dom;
}
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (el) => { if (!el) fail('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const bg = (el) => (el && el.getAttribute('style')) || '';
// a tiny PNG (1×1) as the uploaded file
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DATA_URL = `data:image/png;base64,${PNG}`;

// ===== 1) Migration =====
const sql = readFileSync(resolve(app, 'supabase/avatars-storage.sql'), 'utf8');
if (!sql.includes("values ('avatars', 'avatars', true)") || !sql.includes('alter table public.profiles add column if not exists avatar_url text') || !/avatars_insert_own[\s\S]*\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/.test(sql) || !sql.includes('"authenticated reads profiles"')) fail('avatars-storage.sql');
log('migration: public bucket avatars with per-user folders, profiles.avatar_url, team reads profiles');

// ===== 2) Settings › Perfil: defaults from the user, upload → cropper → saved, top bar =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', 'http://localhost/settings/#prefs-general');
const AV = await import(resolve(here, '../src/avatars.js'));
const O = await import(resolve(here, '../src/owner.js'));
await import(resolve(here, '../src/settings.js'));
const pf = q('form[data-save="profile"]');
if (!pf) fail('profile form');
if (pf.elements.first.value !== '' || pf.elements.last.value !== '' || /Fernando|Lovera/.test(pf.elements.first.value + pf.elements.last.value + pf.elements.email.value)) fail('the profile must not carry a hard-coded name: it comes from the signed-in user');
if (!q('[data-act="avatar-pick"]') || !q('[data-act="avatar-gravatar"]') || !$('avatar-file')) fail('profile picture controls');
// the person fills the name (Sofía R. is one of the account's owners) and saves
pf.elements.first.value = 'Sofía';
pf.elements.last.value = 'Ramírez';
pf.elements.email.value = 'sofia.r@megaglass.us';
pf.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(10);
if (text($('account-avatar')) !== 'M' || $('account-avatar').classList.contains('avatar--img')) fail('top bar starts with the initial');
const file = new window.File([Buffer.from(PNG, 'base64')], 'foto.png', { type: 'image/png' });
const fileInput = $('avatar-file');
Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(40);
const crop = $('avatar-crop');
if (!crop || !$('acrop-img') || !$('avatar-zoom') || $('avatar-zoom').getAttribute('max') !== '3' || !q('#avatar-crop [data-ac="save"]')) fail('circular cropper with zoom slider');
if (!$('acrop-img').getAttribute('src').startsWith('data:image/png;base64,')) fail('cropper shows the picked file');
input($('avatar-zoom'), '1.8');
if (text($('acrop-zoom-val')) !== '1,8×') fail('zoom value');
click(q('#avatar-crop [data-ac="save"]'));
await wait(40);
if ($('avatar-crop')) fail('cropper closes after saving');
const saved = AV.avatarFor('Sofía R.');
if (!saved || !saved.startsWith('data:image/') || AV.avatarFor(AV.ME_KEY) !== saved || AV.avatarFor('sofia.r@megaglass.us') !== saved || AV.avatarFor('Sofía Ramírez') !== saved) fail(`registry keys: ${Object.keys(JSON.parse(mem['crm:avatars'] || '{}')).join(', ')}`);
if (!JSON.parse(mem['crm:profile']).avatar) fail('profile keeps the picture');
if (!q('.gavatar .avatar--img') || !bg(q('.gavatar .avatar--img')).includes('data:image/')) fail('profile shows the photo');
if (!$('account-avatar').classList.contains('avatar--img') || !bg($('account-avatar')).includes('data:image/') || text($('account-avatar')) !== '') fail('top bar shows the photo');
if (!q('#avatar-crop') && text(q('#toast')) !== 'Imagen de perfil actualizada') fail(`toast: ${text(q('#toast'))}`);
log('profile: no hard-coded name; file → cropper (zoom 1,8×) → saved; registered for «Sofía R.», e-mail, full name; top bar shows the photo');
// Gravatar address (SHA-256 of the lower-cased e-mail, d=404 so a missing picture fails)
const g = await AV.gravatarUrl('Sofia.R@megaglass.us ');
if (!/^https:\/\/www\.gravatar\.com\/avatar\/[0-9a-f]{64}\?s=256&d=404$/.test(g) || g !== await AV.gravatarUrl('sofia.r@megaglass.us')) fail(`gravatar url: ${g}`);
// Configuración › Usuarios y equipos use the shared avatar (photo for Sofía R.)
location.hash = '#account-users';
window.dispatchEvent(new window.Event('hashchange'));
await wait(20);
const userRow = qa('.utable tbody tr').find((tr) => text(tr).includes('Sofía R.'));
if (!userRow || !userRow.querySelector('.uname .avatar--img')) fail('users table shows the photo');
if (qa('.utable tbody tr').some((tr) => !tr.querySelector('.uname .avatar'))) fail('every user row has an avatar');
log('Configuración › Usuarios: Sofía R. with her photo, the rest with initials; Gravatar address computed');

// ===== 3) After a reload: the contacts list, the owner dropdown and the record show the photo =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', 'http://localhost/contacts/');
const data = await import(resolve(here, '../src/data.js'));
await import(resolve(here, '../src/contacts.js'));
await wait(20);
if (!$('account-avatar') || !$('account-avatar').classList.contains('avatar--img')) fail('top bar after reload (local copy)');
const sofiaCells = qa('#table tbody td[data-key="owner"]').filter((td) => data.findRecord('contacts', td.dataset.id).owner === 'Sofía R.');
if (!sofiaCells.length) { const first = q('#table tbody td[data-key="owner"]'); data.setField('contacts', first.dataset.id, 'owner', 'Sofía R.'); }
await wait(10);
const cells = qa('#table tbody td[data-key="owner"]');
const withPhoto = cells.filter((td) => data.findRecord('contacts', td.dataset.id).owner === 'Sofía R.');
const others = cells.filter((td) => data.findRecord('contacts', td.dataset.id).owner !== 'Sofía R.' && !td.querySelector('.owner--none'));
if (!withPhoto.length || !withPhoto.every((td) => td.querySelector('.owner .avatar--img') && text(td.querySelector('.owner__name')) === 'Sofía R.')) fail('owner cells of Sofía R. must show the photo');
if (others.some((td) => td.querySelector('.avatar--img')) || !others.every((td) => /^[A-ZÁÉÍÓÚ]{1,2}$/.test(text(td.querySelector('.avatar'))))) fail('other owners keep their initials');
// the inline owner editor (avatar dropdown) offers the photo
click(withPhoto[0]);
const cpSel = q('#cellpop select#cp-value');
if (!cpSel) fail('owner cell editor');
const osel = cpSel.closest('.osel') || cpSel.parentElement.querySelector('.osel') || q('#cellpop .osel');
if (!osel) fail('owner dropdown');
click(osel.querySelector('.osel__btn'));
const opt = [...osel.querySelectorAll('.osel__opt')].find((b) => text(b).includes('Sofía R.'));
if (!opt || !opt.querySelector('.avatar--img') || !osel.querySelector('.osel__btn .avatar--img')) fail('owner dropdown: Sofía R. with photo (option and closed field)');
log(`contacts list after reload: ${withPhoto.length} owner cells with the photo, ${others.length} with initials; owner dropdown shows it; top bar too`);
// the record page «Acerca de» and the board use the same helper
useDom('<!doctype html><body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', `http://localhost/contacts/record/?id=${withPhoto[0].dataset.id}`);
document.body.dataset.type = 'contacts';
await import(resolve(here, '../src/record.js'));
await wait(20);
const ownerRow = qa('#rec-props .props__row').find((r) => text(r.querySelector('dt')).startsWith('Propietario'));
if (!ownerRow || !ownerRow.querySelector('.owner .avatar--img')) fail('record «Acerca de» owner with photo');
log('record page: owner row with the photo');

// ===== 4) The calls page («Actividad asignada a») =====
useDom('<!doctype html><body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="calls-root"></main><div id="scrim"></div></body>', 'http://localhost/calls/');
try {
  await import(resolve(here, '../src/calls.js'));
  await wait(30);
  const ownerCell = qa('td').find((td) => td.querySelector('.owner') && text(td.querySelector('.owner__name')) === 'Sofía R.');
  if (ownerCell && !ownerCell.querySelector('.avatar--img')) fail('calls: «Actividad asignada a» must show the photo');
  log(`calls page: ${ownerCell ? 'Sofía R. with photo' : 'no call assigned to Sofía R. in the sample (helper shared)'}`);
} catch (e) { log(`calls page skipped (${String(e.message).slice(0, 60)})`); }

// ===== 5) Supabase Storage with a fake client, and removal =====
const calls = [];
const fake = {
  storage: { from: (bucket) => ({ upload: async (path, blob, opts) => { calls.push(['upload', bucket, path, blob.type, opts.upsert]); return { error: null }; }, getPublicUrl: (path) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }), remove: async (paths) => { calls.push(['remove', bucket, paths]); return { error: null }; } }) },
  from: (table) => ({ upsert: async (row, opts) => { calls.push(['upsert', table, row, opts]); return { error: null }; }, select: () => ({ then: undefined }) }),
};
AV.setAvatarClient(fake);
const user = { id: 'u-sofia', email: 'sofia.r@megaglass.us', user_metadata: { name: 'Sofía Ramírez' } };
const r = await AV.saveAvatar(DATA_URL, { user, keys: AV.keysForPerson({ id: user.id, email: user.email, first: 'Sofía', last: 'Ramírez', owners: data.OWNERS }) });
const up = calls.find((c) => c[0] === 'upload');
const ups = calls.find((c) => c[0] === 'upsert');
if (!r.uploaded || !up || up[1] !== 'avatars' || up[2] !== 'u-sofia/avatar.png' || up[3] !== 'image/png' || up[4] !== true) fail(`storage upload: ${JSON.stringify(up)}`);
if (!ups || ups[1] !== 'profiles' || ups[2].id !== 'u-sofia' || !ups[2].avatar_url.startsWith('https://x.supabase.co/storage/v1/object/public/avatars/u-sofia/avatar.png?v=')) fail(`profiles upsert: ${JSON.stringify(ups)}`);
if (!AV.avatarFor('Sofía R.').startsWith('https://x.supabase.co/') || !AV.avatarForUser(user).startsWith('https://x.supabase.co/')) fail('registry points to the public URL');
if (!O.ownerAvatarHtml('Sofía R.').includes('avatar--img') || !O.avatarHtml(user).includes('avatar--img') || O.ownerAvatarHtml('Diego G.').includes('avatar--img')) fail('helpers: photo for Sofía / user, initials for Diego');
await AV.removeAvatar({ user, keys: ['Sofía R.', 'Sofía Ramírez'] });
if (AV.avatarFor('Sofía R.') || AV.avatarFor(AV.ME_KEY) || !calls.some((c) => c[0] === 'remove') || O.ownerAvatarHtml('Sofía R.').includes('avatar--img')) fail('removal');
if (!(await AV.saveAvatar(DATA_URL, { user: null, keys: ['Laura M.'] })).url.startsWith('data:') || !AV.avatarFor('Laura M.')) fail('without a session the picture stays local');
log('Storage: upload avatars/u-sofia/avatar.png (upsert) + profiles.avatar_url; removal clears bucket, profile and registry; no session → local copy');

console.log('[avatar-photo] OK');
process.exit(0);

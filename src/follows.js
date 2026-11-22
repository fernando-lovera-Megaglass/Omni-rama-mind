// «Seguir» a record (the «Más» menu of a record page): who follows what, per user, so the record's activity
// can notify its followers (src/data.js → notifyFollowers in src/notifications.js). Each user's list lives in
// localStorage (crm:follows:<user>) and, when the account settings table is live, in user_settings under the
// key «follows» for the signed-in user (data.js binds the settings store with bindFollowSettings).
import { ACTOR } from './notifications.js';

const KEY = (user) => `crm:follows:${user}`;
const PREFIX = 'crm:follows:';
const SETTING = 'follows';
let settings = null; // { live, get, set } bound by data.js
export function bindFollowSettings(s) { settings = s; }
// The user of this browser (the notifications are addressed by user name, like assignments and mentions).
let current = ACTOR;
export const currentFollower = () => current;
export function setCurrentFollower(name) { current = name || ACTOR; }

const ref = (type, id) => `${type}:${id}`;
const readLocal = (user) => { try { const v = JSON.parse(localStorage.getItem(KEY(user))); return Array.isArray(v) ? v : []; } catch { return []; } };
const live = () => Boolean(settings && settings.live && settings.live());
// What a user follows ('<type>:<id>' refs); the signed-in user's list comes from user_settings when live.
export function followedBy(user = current) {
  if (user === current && live()) { const v = settings.get(SETTING); if (Array.isArray(v)) return [...v]; }
  return readLocal(user);
}
function save(user, list) {
  localStorage.setItem(KEY(user), JSON.stringify(list));
  if (user === current && live()) settings.set(SETTING, list);
}
// The old per-record flag (crm:<type>:follow:<id> = '1') counted as this browser's user following the record.
function migrateLegacy(type, id) {
  const legacyKey = `crm:${type}:follow:${id}`;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy === null || legacy === undefined) return;
  localStorage.removeItem(legacyKey);
  if (legacy === '1') { const list = followedBy(current); if (!list.includes(ref(type, id))) save(current, [...list, ref(type, id)]); }
}
export function isFollowing(type, id, user = current) {
  if (user === current) migrateLegacy(type, id);
  return followedBy(user).includes(ref(type, id));
}
export function follow(type, id, user = current) {
  const list = followedBy(user);
  if (!list.includes(ref(type, id))) save(user, [...list, ref(type, id)]);
  return true;
}
export function unfollow(type, id, user = current) {
  save(user, followedBy(user).filter((x) => x !== ref(type, id)));
  return false;
}
// Returns the new state: true when the user now follows the record.
export function toggleFollow(type, id, user = current) {
  return isFollowing(type, id, user) ? unfollow(type, id, user) : follow(type, id, user);
}
// Every user following the record, from the lists kept in this browser.
export function followersOf(type, id) {
  const users = new Set([current]);
  const n = typeof localStorage.length === 'number' ? localStorage.length : 0;
  for (let i = 0; i < n; i += 1) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) users.add(k.slice(PREFIX.length)); }
  return [...users].filter((u) => followedBy(u).includes(ref(type, id)));
}

// Smoke test for the 90-day purge the interface promises (Configuración › Objetos › «Eliminación», Configuración ›
// Propiedades › «Propiedades archivadas», «Eliminar actividad» / «Restaurar actividades eliminadas» on the record
// page): purgeExpiredTrash (src/data.js) physically removes the records whose deleted_at is older than TRASH_DAYS
// (an added one and a seeded one, with their timeline and line items), the activities in the trash that old and the
// archived custom properties that old (archivedAt), and leaves the recent ones alone; a reload of data.js keeps the
// purged ones out; the sweep runs by itself at start-up (once a day); the four texts use the same TRASH_DAYS.
// Run: node scripts/smoke-trash-purge.mjs
// Live mode (SMOKE_LIVE=1, docs/smoke-live.md): «SMOKE» rows deleted and backdated 91 days with SQL disappear from
// contacts / deals / activities after the sweep while the recent ones stay (verified with SQL); the archived-property
// step reports the pending custom-properties-archived-at.sql migration instead of failing.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { liveSmoke, requireColumns, lit } from './smoke-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TAG = 'trash-purge';
const log = (...a) => console.log(`[${TAG}]`, ...a);
const fail = (msg) => { console.error(`[${TAG}] FAIL: ${msg}`); process.exit(1); };
const DAY = 86400000;
const old = (days) => new Date(Date.now() - days * DAY).toISOString();

// ---- modo live (SMOKE_LIVE=1): backdated «SMOKE» rows leave the database, recent ones stay ----
await liveSmoke(TAG, async ({ data, one, sql, check, log, stamp }) => {
  const real = await one(`select ((select count(*) from public.contacts where deleted_at < now() - interval '90 days') + (select count(*) from public.companies where deleted_at < now() - interval '90 days') + (select count(*) from public.deals where deleted_at < now() - interval '90 days') + (select count(*) from public.tickets where deleted_at < now() - interval '90 days'))::int as n`);
  log(`filas reales caducadas en la base antes de la prueba: ${real ? real.n : '?'} (la purga solo toca lo que la interfaz promete borrar)`);
  const oldC = data.addRecord('contacts', { name: `SMOKE Caducado ${stamp}`, first: 'SMOKE Caducado', last: stamp, email: `smoke.${stamp}.old@ejemplo.com`, phone: '', owner: 'Fernando L.', lifecycle: 'Lead' });
  const newC = data.addRecord('contacts', { name: `SMOKE Reciente ${stamp}`, first: 'SMOKE Reciente', last: stamp, email: `smoke.${stamp}.new@ejemplo.com`, phone: '', owner: 'Fernando L.', lifecycle: 'Lead' });
  const def = data.dealPipelineDefs()[0];
  const stage = def.stages.find((s) => !data.isClosedStage(s[0]))[0];
  const oldD = data.addRecord('deals', { name: `SMOKE Negocio caducado ${stamp}`, amount: 10, deal_currency_code: 'MXN', stage, pipeline: def.name, closeDate: new Date(data.TODAY.getTime() + 30 * DAY).toISOString(), owner: 'Fernando L.', priority: 'medium', type: 'Nuevo negocio', description: 'Prueba live', lastActivity: data.TODAY.toISOString() }, { origin: 'Creación manual' });
  const noteOfOld = `SMOKE nota del caducado ${stamp}`;
  const oldNote = `SMOKE nota caducada ${stamp}`;
  const newNote = `SMOKE nota reciente ${stamp}`;
  data.addActivity({ type: 'note', recordType: 'contacts', recordId: oldC.id, text: noteOfOld, who: 'Tú', when: Date.now() });
  data.addActivity({ type: 'note', recordType: 'contacts', recordId: newC.id, text: oldNote, who: 'Tú', when: Date.now() });
  data.addActivity({ type: 'note', recordType: 'contacts', recordId: newC.id, text: newNote, who: 'Tú', when: Date.now() });
  await data.dbIdle();
  data.deleteRecords('contacts', [oldC.id, newC.id]);
  data.deleteRecords('deals', [oldD.id]);
  await data.dbIdle();
  // what time would do: 91 days in the trash for one contact, one deal and one activity; 1 day for the others
  await sql(`update public.contacts set deleted_at = now() - interval '91 days' where name = ${lit(oldC.name)};
    update public.deals set deleted_at = now() - interval '91 days' where name = ${lit(oldD.name)};
    update public.activities set extra = coalesce(extra, '{}'::jsonb) || jsonb_build_object('deletedAt', (extract(epoch from now() - interval '91 days') * 1000)::bigint) where text = ${lit(oldNote)};
    update public.activities set extra = coalesce(extra, '{}'::jsonb) || jsonb_build_object('deletedAt', (extract(epoch from now() - interval '1 day') * 1000)::bigint) where text = ${lit(newNote)};`);
  const before = await one(`select (select count(*) from public.contacts where name = ${lit(oldC.name)} and deleted_at < now() - interval '90 days')::int as old_contact, (select count(*) from public.activities where text = ${lit(noteOfOld)})::int as notes_of_old`);
  check(before && before.old_contact === 1 && before.notes_of_old === 1, `preparación: contacto caducado con su nota (${JSON.stringify(before)})`);
  const res = await data.purgeExpiredTrash();
  check(!res.errors.length, `la purga no reporta errores (${res.errors.join(' · ')})`);
  check(res.records.contacts >= 1 && res.records.deals >= 1 && res.activities >= 1, `la purga cuenta lo borrado (${JSON.stringify(res)})`);
  const after = await one(`select (select count(*) from public.contacts where name = ${lit(oldC.name)})::int as old_contact, (select count(*) from public.contacts where name = ${lit(newC.name)} and deleted_at is not null)::int as recent_contact, (select count(*) from public.deals where name = ${lit(oldD.name)})::int as old_deal, (select count(*) from public.activities where text = ${lit(noteOfOld)})::int as notes_of_old, (select count(*) from public.activities where text = ${lit(oldNote)})::int as old_note, (select count(*) from public.activities where text = ${lit(newNote)})::int as recent_note`);
  check(after && after.old_contact === 0 && after.old_deal === 0 && after.notes_of_old === 0 && after.old_note === 0, `las filas de hace 91 días desaparecen físicamente (${JSON.stringify(after)})`);
  check(after.recent_contact === 1 && after.recent_note === 1, `las recientes siguen en la papelera (${JSON.stringify(after)})`);
  check(!data.trashedRecords('contacts').some((x) => Number(x.id) === Number(oldC.id)) && data.trashedRecords('contacts').some((x) => Number(x.id) === Number(newC.id)), 'la papelera de la app refleja la purga');
  log(`purga: ${JSON.stringify(res.records)} · actividades ${res.activities} · propiedades ${res.properties} · pendiente: ${res.pending.join(', ') || 'nada'}`);
  log(`SQL después: ${JSON.stringify(after)}`);
  // ---- archived custom properties (custom-properties-archived-at.sql): archived_at saved, cleared, purged ----
  await requireColumns('custom_properties', ['archived', 'archived_at']);
  const P = await import(resolve(here, '../src/properties.js'));
  check(P.customPropertiesLive(), 'las propiedades personalizadas vienen de la tabla');
  const key = `smoke_prop_${stamp}`;
  const propRow = () => one(`select archived, archived_at from public.custom_properties where objeto = 'contact' and name = ${lit(key)}`);
  try {
    // what Configuración › Propiedades does: create, archive, restore, archive again (the whole list is saved each time)
    await P.saveCustomProperties('contacts', [...P.customProperties('contacts'), { key, label: `SMOKE Propiedad ${stamp}`, kind: 'text', group: 'Propiedades personalizadas', custom: true }]);
    await data.dbIdle();
    let p = await propRow();
    check(p && p.archived === false && p.archived_at === null, `propiedad creada sin fecha de archivado (${JSON.stringify(p)})`);
    await P.saveCustomProperties('contacts', P.customProperties('contacts').map((x) => (x.key === key ? { ...x, archived: true } : x)));
    await data.dbIdle();
    p = await propRow();
    check(p && p.archived === true && p.archived_at, `archivar guarda archived_at en la fila (${JSON.stringify(p)})`);
    log(`propiedad «${key}» archivada → archived_at = ${p.archived_at}`);
    await P.saveCustomProperties('contacts', P.customProperties('contacts').map((x) => (x.key === key ? { ...x, archived: false } : x)));
    await data.dbIdle();
    p = await propRow();
    check(p && p.archived === false && p.archived_at === null, `restaurar limpia archived_at (${JSON.stringify(p)})`);
    await P.saveCustomProperties('contacts', P.customProperties('contacts').map((x) => (x.key === key ? { ...x, archived: true } : x)));
    await data.dbIdle();
    // 91 days later: the purge removes it for good; a recently archived one would stay (none here)
    await sql(`update public.custom_properties set archived_at = now() - interval '91 days' where objeto = 'contact' and name = ${lit(key)}`);
    const res2 = await data.purgeExpiredTrash();
    check(!res2.pending.length && !res2.errors.length && res2.properties >= 1, `la purga de propiedades ya no queda pendiente (${JSON.stringify({ properties: res2.properties, pending: res2.pending, errors: res2.errors })})`);
    p = await propRow();
    check(p === null, 'la propiedad archivada hace 91 días desaparece de custom_properties');
    check(!P.customProperties('contacts').some((x) => x.key === key), 'y de la lista de la app');
    log(`propiedad archivada hace 91 días → purgada (propiedades: ${res2.properties}, pendiente: nada)`);
  } finally {
    await sql(`delete from public.custom_properties where name like 'smoke_prop_%'`);
  }
});

// ---- static: migration registered, the four texts share TRASH_DAYS ----
const dataSrc = readFileSync(resolve(here, '../src/data.js'), 'utf8');
const settingsSrc = readFileSync(resolve(here, '../src/settings.js'), 'utf8');
const recordSrc = readFileSync(resolve(here, '../src/record.js'), 'utf8');
if (!/export const TRASH_DAYS = 90;/.test(dataSrc)) fail('data.js: TRASH_DAYS = 90');
if (/definitivamente a los 90 días|guardan 90 días en la papelera|restaurar durante 90 días|eliminadas en los últimos 90 días/.test(settingsSrc + recordSrc)) fail('the four texts must use TRASH_DAYS, not a literal');
if ((settingsSrc.match(/\$\{TRASH_DAYS\} días/g) || []).length !== 2 || (recordSrc.match(/\$\{TRASH_DAYS\} días/g) || []).length !== 2) fail('the four texts (2 in settings.js, 2 in record.js) show TRASH_DAYS');
const migration = readFileSync(resolve(here, '../supabase/custom-properties-archived-at.sql'), 'utf8');
if (!/alter table public\.custom_properties add column if not exists archived_at timestamptz/.test(migration)) fail('migration adds custom_properties.archived_at');
const register = JSON.parse(readFileSync(resolve(here, 'applied-migrations.json'), 'utf8'));
if (!register['custom-properties-archived-at.sql'] || !register['custom-properties-archived-at.sql'].status) fail('register: custom-properties-archived-at.sql recorded');
log(`estático: TRASH_DAYS en los cuatro textos; migración archived_at registrada (${register['custom-properties-archived-at.sql'].status})`);

// ---- local mode ----
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }, clear() { Object.keys(mem).forEach((k) => delete mem[k]); } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText() {} } }, configurable: true });
const dom = new JSDOM('<!doctype html><body class="app"></body>', { url: 'http://localhost/contacts/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'history', 'HTMLElement', 'Event', 'CustomEvent', 'MouseEvent', 'FormData', 'URL', 'Blob', 'MutationObserver']) globalThis[k] = dom.window[k];
const data = await import(resolve(here, '../src/data.js'));
const P = await import(resolve(here, '../src/properties.js'));
if (!mem['crm:trash:purged-at'] || !data.trashPurgedAt()) fail('the sweep runs by itself at start-up (crm:trash:purged-at)');
const total = data.allContacts().length;

// records: an added contact and a seeded one deleted 91 days ago, a recent deletion, a deal (with a line item) 91 days old
const addedOld = data.addRecord('contacts', { name: 'Caducado Añadido', first: 'Caducado', last: 'Añadido', email: 'caducado@ejemplo.com', owner: 'Fernando L.', lifecycle: 'Lead' });
const seededOld = 3;
const recent = data.addRecord('contacts', { name: 'Reciente Papelera', first: 'Reciente', last: 'Papelera', email: 'reciente@ejemplo.com', owner: 'Fernando L.', lifecycle: 'Lead' });
data.addActivity({ type: 'note', recordType: 'contacts', recordId: addedOld.id, text: 'Nota del caducado', who: 'Tú', when: Date.now() });
const deal = data.addRecord('deals', { name: 'Negocio caducado', amount: 100, stage: 'appointment', pipeline: 'Pipeline de ventas', closeDate: '2026-12-31T12:00:00.000Z', owner: 'Fernando L.', companyId: '', company: '', contactId: '' });
data.addLineItems(deal.id, [{ name: 'Vidrio', quantity: 1, price: 10, currency: 'MXN' }]);
if (data.lineItemsFor(deal.id).length !== 1) fail('line item on the deal');
data.deleteRecords('contacts', [addedOld.id, seededOld, recent.id]);
data.deleteRecords('deals', [deal.id]);
const backdate = (type, ids, days) => { const k = `crm:${type}:deletedat`; const m = JSON.parse(mem[k] || '{}'); ids.forEach((id) => { m[id] = old(days); }); mem[k] = JSON.stringify(m); };
backdate('contacts', [addedOld.id, seededOld], 91);
backdate('contacts', [recent.id], 89);
backdate('deals', [deal.id], 91);
if (data.trashedRecords('contacts').length !== 3 || data.trashedRecords('deals').length !== 1) fail('three contacts and one deal in the trash before the sweep');

// activities in the trash on a live contact: one 91 days old, one just deleted
const host = 5;
const addNote = (text) => { data.addActivity({ type: 'note', recordType: 'contacts', recordId: host, text, who: 'Tú', when: Date.now() }); return data.activitiesFor('contacts', host).find((a) => a.text === text); };
const oldNote = addNote('Nota caducada');
const newNote = addNote('Nota reciente');
await data.deleteActivity(oldNote.id);
await data.deleteActivity(newNote.id);
const tk = `crm:contacts:activity-trash:${host}`;
mem[tk] = JSON.stringify(JSON.parse(mem[tk]).map((a) => (a.id === oldNote.id ? { ...a, extra: { ...a.extra, deletedAt: Date.now() - 91 * DAY } } : a)));
if (data.deletedActivitiesFor('contacts', host, true).length !== 2 || data.deletedActivitiesFor('contacts', host).length !== 1) fail('two trashed activities, one already past the restore window');

// archived custom properties: archiving stamps archivedAt, restoring clears it; one archived 91 days ago
const list = P.customProperties('contacts');
list.push({ key: 'prop_caducada', label: 'Prop caducada', kind: 'text', group: 'Propiedades personalizadas', archived: true, custom: true }, { key: 'prop_reciente', label: 'Prop reciente', kind: 'text', group: 'Propiedades personalizadas', archived: true, custom: true });
P.saveCustomProperties('contacts', list);
let props = P.customProperties('contacts');
if (!props.find((p) => p.key === 'prop_caducada').archivedAt || !props.find((p) => p.key === 'prop_reciente').archivedAt) fail('archiving stamps archivedAt');
P.saveCustomProperties('contacts', props.map((p) => (p.key === 'prop_reciente' ? { ...p, archived: false } : p)));
if (P.customProperties('contacts').find((p) => p.key === 'prop_reciente').archivedAt) fail('restoring clears archivedAt');
P.saveCustomProperties('contacts', P.customProperties('contacts').map((p) => (p.key === 'prop_reciente' ? { ...p, archived: true } : p)));
const ck = 'crm:customprops:contacts';
mem[ck] = JSON.stringify(JSON.parse(mem[ck]).map((p) => (p.key === 'prop_caducada' ? { ...p, archivedAt: old(91) } : p)));
P.saveCustomProperties('tasks', [{ key: 'tarea_caducada', label: 'Tarea caducada', kind: 'text', group: 'Propiedades personalizadas', archived: true, archivedAt: old(100), custom: true }]);
log(`preparado: ${total} contactos; papelera con 3 contactos (2 de hace 91 días) y 1 negocio; 2 actividades en papelera; 3 propiedades archivadas (2 de hace más de 90 días)`);

// ---- the sweep ----
const res = await data.purgeExpiredTrash();
if (res.records.contacts !== 2 || res.records.deals !== 1 || res.activities !== 1 || res.properties !== 2 || res.pending.length || res.errors.length) fail(`sweep report (${JSON.stringify(res)})`);
if (data.findRecord('contacts', addedOld.id) || data.findRecord('contacts', seededOld) || data.findRecord('deals', deal.id)) fail('purged records are gone');
const trash = data.trashedRecords('contacts').map((r) => Number(r.id));
if (trash.length !== 1 || trash[0] !== Number(recent.id)) fail(`only the recent deletion stays in the trash (${trash.join()})`);
if (data.trashedRecords('deals').length) fail('the old deal left the trash for good');
if (data.allContacts().length !== total - 1) fail(`the seeded contact is gone from the list (${data.allContacts().length} vs ${total - 1})`);
if (data.activitiesFor('contacts', addedOld.id).length || mem[`crm:contacts:notes:${addedOld.id}`]) fail('the timeline of a purged record goes with it');
if (data.lineItemsFor(deal.id).length) fail('line items of a purged deal go with it');
const left = data.deletedActivitiesFor('contacts', host, true);
if (left.length !== 1 || left[0].id !== newNote.id) fail('the expired activity is purged, the recent one stays');
props = P.customProperties('contacts');
if (props.some((p) => p.key === 'prop_caducada') || !props.some((p) => p.key === 'prop_reciente' && p.archived)) fail('the old archived property is purged, the recent one stays archived');
if (P.customProperties('tasks').some((p) => p.key === 'tarea_caducada')) fail('archived task properties (localStorage) are purged too');
if (data.findRecord('contacts', recent.id)) fail('a trashed record stays out of the list');
data.restoreRecords('contacts', [recent.id]);
if (!data.findRecord('contacts', recent.id)) fail('the recent deletion can still be restored');
log(`purga: ${JSON.stringify(res.records)} · actividades ${res.activities} · propiedades ${res.properties}; la reciente sigue en la papelera y se restaura`);

// ---- reload: a fresh data.js keeps them out, and a second sweep has nothing to do ----
const fresh = await import(resolve(here, '../src/data.js?trash-purge-reload'));
if (fresh.findRecord('contacts', seededOld) || fresh.findRecord('contacts', addedOld.id) || fresh.allContacts().length !== total - 1 + 1) fail(`purged records stay out after a reload (${fresh.allContacts().length})`);
if (fresh.trashedRecords('contacts').length || fresh.trashedRecords('deals').length) fail('trash after reload');
const again = await fresh.purgeExpiredTrash();
if (Object.values(again.records).some(Boolean) || again.activities || again.properties) fail(`nothing left to purge (${JSON.stringify(again)})`);
log('recarga: los purgados no vuelven; una segunda purga no borra nada');
console.log(`[${TAG}] OK`);
process.exit(0);

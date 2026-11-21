import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { activityAssociations, saveAssociatedActivity } from '../src/activity-associations.js';
const dom = new JSDOM('', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'localStorage']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
const { addActivity, activitiesFor, updateActivity } = await import('../src/data.js');
const contact = { id: 91001, name: 'Contacto', companyId: 91002, assoc_companies: [91002, 91002, 91005] };
const records = {
  contacts: [contact], companies: [{ id: 91002, name: 'Principal' }, { id: 91005, name: 'Secundaria' }],
  deals: [{ id: 91003, name: 'Negocio', contactId: contact.id, assoc_contacts: [contact.id] }],
  tickets: [{ id: 91004, name: 'Abierto', contactId: contact.id }, { id: 91006, name: 'Cerrado', contactId: contact.id, status: 'closed' }],
};
const options = (enabled = true) => activityAssociations('contacts', contact, records, (t) => t.status === 'closed', enabled);
assert.equal(options().length, 4);
assert.ok(options().every((r) => r.checked));
assert.equal(options(false).find((r) => r.id === 91002).checked, false);
assert.equal(options(false).find((r) => r.id === 91005).checked, true);
const event = { type: 'call', when: Date.now(), who: 'Tú', text: 'Llamada de prueba', extra: { durationMin: 15 } };
const origin = { type: 'contacts', id: contact.id, name: contact.name };
const selected = options().filter((r) => [91002, 91003].includes(r.id));
saveAssociatedActivity(event, origin, [...selected, ...selected, origin], addActivity);
for (const [type, id] of [['contacts', 91001], ['companies', 91002], ['deals', 91003]]) {
  assert.equal(activitiesFor(type, id).length, 1);
  assert.equal(activitiesFor(type, id)[0].text, event.text);
}
assert.deepEqual(activitiesFor('companies', 91002)[0].extra.associatedFrom, { type: 'contacts', id: contact.id });
assert.equal(activitiesFor('companies', 91002)[0].extra.durationMin, 15);
// A fresh data module reads the persisted rows without generating any new copies.
const reloaded = await import('../src/data.js?activity-associations-reload');
assert.equal(reloaded.activitiesFor('companies', 91002).length, 1);
assert.equal(reloaded.activitiesFor('deals', 91003).length, 1);
saveAssociatedActivity({ ...event, text: 'Sin empresa' }, origin, selected.filter((r) => r.type !== 'companies'), addActivity);
assert.equal(activitiesFor('contacts', 91001).length, 2);
assert.equal(activitiesFor('deals', 91003).length, 2);
assert.equal(activitiesFor('companies', 91002).length, 1);
// Editing a copy must preserve the attribution shown in its timeline.
const companyCall = activitiesFor('companies', 91002)[0];
await updateActivity(companyCall.id, { text: 'Llamada revisada', extra: { notes: 'Revisión' } });
const editedCall = activitiesFor('companies', 91002)[0];
assert.deepEqual(editedCall.extra.associatedFrom, { type: 'contacts', id: contact.id });
assert.equal(editedCall.extra.associatedFromName, contact.name);
assert.equal(activitiesFor('contacts', contact.id)[1].text, event.text);
// Reverse-only associations and string IDs are also selectable, without duplicates.
const reverseOptions = activityAssociations('contacts', { id: '42', name: 'Inverso' }, {
  companies: [{ id: 43, name: 'Empresa inversa', assoc_contacts: [42, '42'] }],
  deals: [{ id: 44, name: 'Negocio inverso', assoc_contacts: ['42'] }],
  tickets: [{ id: 45, name: 'Ticket cerrado', assoc_contacts: [42], status: 'closed' }],
}, (ticket) => ticket.status === 'closed');
assert.deepEqual(reverseOptions.map(({ type, id }) => [type, id]), [['companies', 43], ['deals', 44]]);
for (const type of ['deals', 'tickets']) {
  const rows = activityAssociations(type, records[type][0], records, (t) => t.status === 'closed');
  assert.ok(rows.some((r) => r.type === 'contacts' && r.id === contact.id));
  assert.ok(rows.some((r) => r.type === 'companies' && r.id === contact.companyId));
  assert.ok(!rows.some((r) => r.type === type && r.id === records[type][0].id));
  assert.ok(!rows.some((r) => r.id === 91006));
}
// All manual activity kinds preserve content, origin and independent stored IDs.
for (const kind of ['note', 'email', 'meeting']) {
  const payload = { ...event, type: kind, text: `Prueba ${kind}`, extra: { notes: 'Contenido', subject: 'Asunto' } };
  saveAssociatedActivity(payload, origin, selected, addActivity);
  const copies = [['contacts', 91001], ['companies', 91002], ['deals', 91003]]
    .map(([type, id]) => activitiesFor(type, id).find((row) => row.type === kind));
  assert.equal(new Set(copies.map((row) => row.id)).size, 3);
  assert.ok(copies.every((row) => row.text === payload.text && row.extra.notes === 'Contenido'));
  assert.equal(copies[0].extra.associatedFrom, undefined);
  assert.equal(copies[1].extra.associatedFromName, contact.name);
}
console.log('Activity association acceptance checks passed.');

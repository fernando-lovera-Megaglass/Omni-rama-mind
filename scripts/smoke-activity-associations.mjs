import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { activityAssociations, saveAssociatedActivity } from '../src/activity-associations.js';
const dom = new JSDOM('', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'localStorage']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
const { addActivity, activitiesFor } = await import('../src/data.js');
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
for (const type of ['deals', 'tickets']) {
  const rows = activityAssociations(type, records[type][0], records, (t) => t.status === 'closed');
  assert.ok(rows.some((r) => r.type === 'contacts' && r.id === contact.id));
  assert.ok(rows.some((r) => r.type === 'companies' && r.id === contact.companyId));
  assert.ok(!rows.some((r) => r.type === type && r.id === records[type][0].id));
  assert.ok(!rows.some((r) => r.id === 91006));
}
console.log('Activity association acceptance checks passed.');

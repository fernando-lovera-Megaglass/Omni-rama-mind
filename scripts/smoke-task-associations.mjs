import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<body><aside id="sidenav"></aside><header id="topbar"></header><main id="list-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/tasks/' });
for (const key of ['window', 'document', 'localStorage', 'FormData', 'HTMLElement', 'location']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
const data = await import('../src/data.js');
const assoc = await import('../src/task-associations.js');
const queue = await import('../src/task-queue.js');
await import('../src/tasks.js');
const form = document.getElementById('create-form');
const search = (kind, value) => {
  const input = form.querySelector(`[data-ta-search="${kind}"]`);
  input.value = value;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  return input;
};
const pick = (kind, value) => search(kind, value).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const contact = data.allContacts()[80];
const second = data.allContacts()[81];
const deal = data.allDeals()[0];
const company = data.allCompanies()[0];
const ticket = data.allTickets()[0];
search('contacts', 'a');
assert.ok(document.querySelectorAll('#ta-contacts-results button').length <= 6);
pick('contacts', contact.email);
pick('contacts', second.email);
assert.equal(document.querySelectorAll('#ta-contacts-list li').length, 2);
document.querySelector(`[data-ta-remove="contacts"][data-id="${second.id}"]`).click();
pick('contacts', second.email);
pick('deals', deal.name);
pick('companies', company.name);
pick('tickets', ticket.name);
form.elements.name.value = 'Prueba asociaciones múltiples';
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(r => setTimeout(r, 50));
const task = data.allTasks().find(t => t.name === 'Prueba asociaciones múltiples');
assert.ok(task);
assert.equal(task.contactId, contact.id);
assert.equal(task.contact, contact.name);
assert.deepEqual(task.assoc_contacts, [contact.id, second.id]);
for (const [kind, record] of [['contacts', contact], ['contacts', second], ['deals', deal], ['companies', company], ['tickets', ticket]]) {
  assert.equal(data.activitiesFor(kind, record.id).filter(e => e.type === 'task' && e.extra.taskId === task.id).length, 1);
  assert.ok(assoc.taskAssociationLinks(task, kind).includes(`${kind}/record/?id=${record.id}`));
}
assert.ok(document.querySelector('#rows').textContent.includes(contact.name));
assert.ok(queue.targetFor(task, '../').includes(`contacts/record/?id=${contact.id}`));
const q = queue.startQueue([task.id], 'Prueba');
assert.equal(queue.queueTask(q).id, task.id);
queue.endQueue();
assert.equal(document.querySelectorAll('#ta-contacts-list li').length, 0);
assert.equal(document.querySelector('#ta-contacts-results').hidden, true);
assert.deepEqual(assoc.taskAssociatedRecords({ contactId: contact.id }, 'contacts').map(r => r.id), [contact.id]);
console.log('PASS: email beyond first 30, multiple objects, removal, timeline deduplication, primary contact, queue and reset');

// Render the actual task record to verify both About and association cards.
dom.reconfigure({ url: `http://localhost/tasks/record/?id=${task.id}` });
document.body.dataset.type = 'tasks';
document.getElementById('list-root').id = 'record-root';
await import('../src/record.js');
for (const [kind, record] of [['contacts', contact], ['contacts', second], ['companies', company], ['deals', deal], ['tickets', ticket]]) {
  assert.ok(document.querySelector(`#rec-props a[href="../../${kind}/record/?id=${record.id}"]`), `About link ${kind}`);
  assert.ok([...document.querySelectorAll(`a[href="../../${kind}/record/?id=${record.id}"]`)].length >= 2, `Card link ${kind}`);
}
console.log('PASS: task record About and all four association cards contain linked records');

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ACTIVITY_RULES_SETTING, activityAssociations, saveAssociatedActivity } from '../src/activity-associations.js';
const dom = new JSDOM('<body class="app"><aside id="sidenav"></aside><header id="topbar"></header><main id="settings-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/settings/#prefs-general/actividades' });
for (const key of ['window', 'document', 'localStorage', 'location', 'HTMLElement', 'FormData', 'Option', 'MutationObserver']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const data = await import('../src/data.js');
await import('../src/settings.js');
document.querySelector('[data-general-tab="actividades"]').click();
const form = document.querySelector('[data-save="activity-associations"]');
assert.equal(form.querySelectorAll('select').length, 20);
const select = form.querySelector('[name="rule-contacts-note"]');
select.value = 'latest';
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
assert.equal(JSON.parse(localStorage.getItem(ACTIVITY_RULES_SETTING)).contacts.note, 'latest');
const contact = data.addRecord('contacts', { name: 'Rules contact' });
const deals = [1, 3, 2].map(day => data.addRecord('deals', { name: `Deal ${day}`, contactId: contact.id, created: `2026-01-0${day}T00:00:00Z` }));
const { openLogModal, selectedActivityAssociations } = await import('../src/log-modal.js');
const modal = document.createElement('div');
document.body.append(modal);
const open = () => openLogModal('note', { type: 'contacts', rec: contact, openModal: (_title, body) => { modal.innerHTML = body; }, $: id => document.getElementById(id) });
open();
assert.equal(modal.querySelectorAll('input[type="checkbox"]:checked').length, 2);
assert.deepEqual(selectedActivityAssociations(modal), [{ type: 'deals', id: String(deals[1].id) }]);
saveAssociatedActivity({ type: 'note', text: 'Rule smoke', when: Date.now() }, { type: 'contacts', id: contact.id }, selectedActivityAssociations(modal), data.addActivity);
assert.ok(data.activitiesFor('contacts', contact.id).some(a => a.text === 'Rule smoke'));
for (const deal of deals) assert.equal(data.activitiesFor('deals', deal.id).some(a => a.text === 'Rule smoke'), deal.id === deals[1].id);
select.value = 'none';
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
open();
assert.equal(modal.querySelectorAll('input[type="checkbox"]:checked').length, 1);
assert.deepEqual(selectedActivityAssociations(modal), []);
saveAssociatedActivity({ type: 'note', text: 'Origin only', when: Date.now() }, { type: 'contacts', id: contact.id }, selectedActivityAssociations(modal), data.addActivity);
assert.ok(data.activitiesFor('contacts', contact.id).some(a => a.text === 'Origin only'));
assert.ok(deals.every(deal => !data.activitiesFor('deals', deal.id).some(a => a.text === 'Origin only')));
const records = { contacts: [contact], deals, companies: [{ id: 999, name: 'Primary' }] };
contact.companyId = 999;
for (const [rule, count] of [['none', 0], ['all', 4], ['latest', 1], ['latest5', 4], ['primary', 1]]) {
  const rows = activityAssociations('contacts', contact, records, () => false, { rules: { contacts: { note: rule } }, kind: 'note' });
  assert.equal(rows.filter(r => r.checked).length, count);
  if (rule === 'primary') assert.equal(rows.find(r => r.checked).type, 'companies');
}
for (const kind of ['call', 'email']) {
  const rows = activityAssociations('deals', deals[0], records, () => false, { rules: { deals: { [kind]: 'none' } }, kind });
  assert.deepEqual(rows.filter(r => r.checked).map(r => [r.id, r.required]), [[contact.id, true]]);
}
// The newest five are selected across more than five candidates, independently of input order.
const sixDeals = [2, 6, 1, 5, 3, 4].map(day => ({ id: day, contactId: contact.id, created_at: `2026-02-0${day}` }));
assert.deepEqual(activityAssociations('contacts', contact, { deals: sixDeals }, () => false,
  { rules: { contacts: { note: 'latest5' } }, kind: 'note' }).filter(r => r.checked).map(r => r.id), [6, 5, 4, 3, 2]);
// A destination supplied explicitly is compulsory even without an existing association.
const destination = data.addRecord('contacts', { name: 'Explicit recipient' });
for (const kind of ['call', 'email']) {
  localStorage.setItem(ACTIVITY_RULES_SETTING, JSON.stringify({ deals: { [kind]: 'none' } }));
  openLogModal(kind, { type: 'deals', rec: deals[0], destinationContactId: destination.id,
    openModal: (_title, body) => { modal.innerHTML = body; }, $: id => document.getElementById(id) });
  const required = modal.querySelector(`[data-association-id="${destination.id}"]`);
  assert.ok(required.checked && required.disabled);
  assert.deepEqual(selectedActivityAssociations(modal), [{ type: 'contacts', id: String(destination.id) }]);
}
const alias = form.querySelector('[name="company"]');
for (const enabled of [false, true]) {
  alias.checked = enabled;
  alias.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.ok([...form.querySelectorAll('select')].every(s => s.value === (enabled ? 'primary' : 'none')));
}
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
open();
assert.deepEqual(selectedActivityAssociations(modal), []); // No company on the stored contact.
select.value = 'latest';
select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
assert.equal(alias.checked, false);
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
document.querySelector('[data-general-tab="actividades"]').click();
assert.equal(document.querySelector('[name="rule-contacts-note"]').value, 'latest');
assert.equal(document.querySelector('[name="company"]').checked, false);
open();
assert.deepEqual(selectedActivityAssociations(modal), [{ type: 'deals', id: String(deals[1].id) }]);
console.log('Activity rules settings, modal and timeline checks passed.');

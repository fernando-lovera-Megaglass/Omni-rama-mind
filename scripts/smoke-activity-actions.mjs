import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
const dom = new JSDOM('<body class="app" data-type="contacts"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>', { url: 'http://localhost/contacts/record/?id=1', pretendToBeVisual: true });
for (const key of ['window', 'document', 'localStorage', 'location', 'HTMLElement', 'customElements', 'Option', 'MutationObserver', 'FormData']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const data = await import('../src/data.js');
await import('../src/record.js');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const click = async selector => { const el = document.querySelector(selector); assert.ok(el, selector); el.click(); await tick(); };
const value = (id, v) => { document.getElementById(id).value = v; };
await click('[data-more="log"][data-sub="Llamada"]');
value('log-notes', 'Llamada inicial');
await click('[data-confirm="logact"]');
let call = data.activitiesFor('contacts', 1).find(a => a.type === 'call');
assert.ok(call);
await click('[data-activity-action="edit"]');
assert.equal(document.getElementById('log-notes').value, 'Llamada inicial');
const outcome = document.getElementById('log-outcome').options[1].value;
value('log-outcome', outcome);
value('log-notes', 'Notas corregidas');
await click('[data-confirm="logact"]');
// A fresh module reads persisted storage, rather than the previous objects.
const fresh = await import('../src/data.js?activity-reload');
call = fresh.activitiesFor('contacts', 1).find(a => a.id === call.id);
assert.equal(call.text, 'Notas corregidas');
assert.equal(call.extra.outcome, outcome);
await click('[data-activity-action="delete"]');
assert.equal(data.activitiesFor('contacts', 1).length, 1);
await click('[data-confirm="activity-delete"]');
assert.equal(fresh.activitiesFor('contacts', 1).length, 0);
await click('[data-act="restore-activity"]');
await click('[data-confirm="activity-restore"]');
assert.equal(fresh.activitiesFor('contacts', 1)[0].text, 'Notas corregidas');
data.addActivity({ type: 'note', recordType: 'contacts', recordId: 1, when: 1, text: 'Nota antigua', extra: {} });
const note = data.activitiesFor('contacts', 1).find(a => a.type === 'note');
await data.updateActivity(note.id, { extra: { pinned: true } });
await click('[data-close]');
// Pinning is a timeline action per record (crm:<type>:<id>:pinned): pin the note from its own ⋮ menu → it leads the
// timeline under «Fijado» with the «Fijada» title; pinning it again unpins it (the legacy extra.pinned flag no longer
// decides once the person has pinned or unpinned something).
const notePin = () => document.querySelector(`#rec-timeline [data-activity-action="pin"][data-activity-key^="${note.id}:"]`);
// the note was added through the data layer: refresh the timeline through a UI action (the search box)
document.getElementById('act-search').dispatchEvent(new dom.window.Event('input', { bubbles: true })); await tick();
assert.ok(notePin(), 'the note offers «Fijar»');
// the legacy extra.pinned flag still pins the note while the person has not pinned or unpinned anything
assert.match(document.querySelector('#rec-timeline .timeline__title').textContent, /Fijada/);
assert.ok(document.querySelector('#rec-timeline .timeline__item--pinned').dataset.ev.startsWith(`${note.id}:`), 'the pinned item is the note');
// its ⋮ › «Desfijar» unpins it (an empty key overrides the legacy flag) …
notePin().click(); await tick();
assert.doesNotMatch(document.querySelector('#rec-timeline .timeline__title').textContent, /Fijada/);
assert.equal(document.querySelector('#rec-timeline .timeline__item--pinned'), null, 'unpinned');
assert.equal(localStorage.getItem('crm:contacts:1:pinned'), '');
// … and «Fijar en la parte superior» pins it again, now by key
notePin().click(); await tick();
assert.match(document.querySelector('#rec-timeline .timeline__title').textContent, /Fijada/);
assert.ok(document.querySelector('#rec-timeline .timeline__item--pinned').dataset.ev.startsWith(`${note.id}:`), 'pinned again');
assert.equal(localStorage.getItem('crm:contacts:1:pinned'), `${note.id}:1:note`);
assert.equal(fresh.activitiesFor('contacts', 1)[0].id, note.id);
const created = [...document.querySelectorAll('#rec-timeline .timeline__item')].find(el => el.textContent.includes('Registro creado'));
assert.ok(created);
// system entries can be pinned like any other, but never edited or deleted
assert.equal(created.querySelector('[data-activity-action="edit"], [data-activity-action="delete"]'), null);
assert.ok(created.querySelector('[data-activity-action="pin"]'));
for (const type of ['system', 'prop']) {
  data.addActivity({ type, recordType: 'contacts', recordId: 1, when: 2, text: 'Sistema' });
  const entry = data.activitiesFor('contacts', 1).find(a => a.type === type);
  await assert.rejects(data.deleteActivity(entry.id), /sistema/);
  await assert.rejects(data.updateActivity(entry.id, { text: 'Cambio' }), /sistema/);
}
// Legacy duplicates must remain independently editable after acquiring IDs.
localStorage.setItem('crm:contacts:notes:99', JSON.stringify([
  { type: 'note', when: 1, text: 'Duplicada' }, { type: 'note', when: 1, text: 'Duplicada' },
]));
const legacy = data.activitiesFor('contacts', 99);
assert.notEqual(legacy[0].id, legacy[1].id);
await data.deleteActivity(legacy[0].id);
assert.equal(data.activitiesFor('contacts', 99).length, 1);
assert.equal(data.deletedActivitiesFor('contacts', 99).length, 1);
const deletedAt = data.deletedActivitiesFor('contacts', 99)[0].extra.deletedAt;
await data.deleteActivity(legacy[0].id);
assert.equal(data.deletedActivitiesFor('contacts', 99)[0].extra.deletedAt, deletedAt);
await assert.rejects(data.updateActivity(legacy[0].id, { text: 'Cambio desde una ficha desactualizada' }), /Restaura/);
await data.updateActivity(legacy[1].id, { extra: { deletedAt: Date.now(), pinned: true } });
assert.equal(data.activitiesFor('contacts', 99)[0].extra.deletedAt, undefined);
assert.equal(data.activitiesFor('contacts', 99)[0].extra.pinned, true);
const expired = data.deletedActivitiesFor('contacts', 99)[0];
expired.extra.deletedAt = Date.now() - 91 * 86400000;
localStorage.setItem('crm:contacts:activity-trash:99', JSON.stringify([expired]));
assert.equal(data.deletedActivitiesFor('contacts', 99).length, 0);
await assert.rejects(data.restoreActivity(expired.id), /vencido/);
console.log('Activity actions: edit, persisted reload, delete, restore, pin and system protection passed.');
dom.window.close();

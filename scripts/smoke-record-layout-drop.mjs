// Local DOM regression; no remote services. Run once for each CRM object.
// node scripts/smoke-record-layout-drop.mjs contacts
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as layouts from '../src/layout-defaults.js';

const type = process.argv[2] || 'contacts';
assert(['contacts', 'companies', 'deals', 'tickets'].includes(type));
const mem = new Map();
globalThis.localStorage = {
  getItem: (key) => mem.get(key) ?? null,
  setItem: (key, value) => mem.set(key, String(value)),
  removeItem: (key) => mem.delete(key),
};
let dom;
function boot(id = 1) {
  dom?.window.close();
  dom = new JSDOM(`<!doctype html><body class="app" data-type="${type}"><aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div></body>`, {
    url: `http://localhost/${type}/record/?id=${id}`,
  });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'FormData']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
  globalThis.requestAnimationFrame = (fn) => fn();
}
boot();
const data = await import('../src/data.js');
const records = { contacts: data.allContacts, companies: data.allCompanies, deals: data.allDeals, tickets: data.allTickets };
const id = records[type]()[0].id;
const remote = new Map();
const writes = [];
layouts.bindLayoutSettings({
  live: () => true,
  get: (key) => structuredClone(remote.get(key)),
  set: (key, value, options) => {
    remote.set(key, structuredClone(value));
    writes.push({ key, ...options });
  },
});
layouts.bindLayoutTeam(() => 'Sistemas');
const personal = layouts.defaultLayout(type);
personal.right = ['attachments', 'summary'];
layouts.saveLayout(type, personal);
const name = 'Vista Sistemas';
const team = layouts.teamViewLayout(type, name);
team.right = ['summary', 'attachments', 'playbooks'];
layouts.saveViewLayout(type, name, team);
layouts.saveViewsList(type, 'record', [{ name, teams: ['Sistemas'] }]);
const personalKey = layouts.LAYOUT_KEY(type);
const personalBefore = mem.get(personalKey);
const updatedBefore = mem.get(`crm:${type}:layout-updated`);
writes.length = 0;
boot(id);
await import('../src/record.js');
const order = () => [...document.querySelectorAll('#rec-right > .card[data-lcard]')].map((el) => el.dataset.lcard);
function moveFirstAfterSecond() {
  const cards = document.querySelectorAll('#rec-right > .card[data-lcard]');
  assert(cards.length >= 2);
  const transfer = { setData() {} };
  for (const [eventName, target] of [['dragstart', cards[0].querySelector('.card__grip')], ['dragover', cards[1]], ['drop', cards[1]]]) {
    const event = new dom.window.MouseEvent(eventName, { bubbles: true, cancelable: true, clientY: 1 });
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    target.dispatchEvent(event);
  }
}
moveFirstAfterSecond();
const expected = ['attachments', 'summary', 'playbooks'];
assert.deepEqual(order(), expected);
assert.deepEqual(writes, [{ key: layouts.VIEW_KEY(type, name), scope: 'global' }]);
assert.equal(mem.get(personalKey), personalBefore);
assert.equal(mem.get(`crm:${type}:layout-updated`), updatedBefore);
assert.deepEqual(remote.get(personalKey), personal);
assert(!Object.hasOwn(remote.get(layouts.VIEW_KEY(type, name)), 'teamView'));
assert(!Object.hasOwn(JSON.parse(mem.get(layouts.VIEW_KEY(type, name))), 'teamView'));
// Recreate the page and reload its module using the persisted settings.
boot(id);
await import('../src/record.js?reload=team-drop');
assert.deepEqual(order(), expected);
layouts.bindLayoutTeam(() => '');
assert.deepEqual(layouts.resolveLayout(type), personal);
boot(id);
await import('../src/record.js?reload=personal-drop');
writes.length = 0;
moveFirstAfterSecond();
assert.deepEqual(layouts.loadLayout(type).right, ['summary', 'attachments']);
assert.equal(writes[0].key, personalKey);
assert(writes.every((write) => write.scope === 'user'));
assert(!Object.hasOwn(remote.get(personalKey), 'teamView'));
console.log(`[record-layout-drop] ${type}: team order survives reload; personal layout preserved; default reorder works`);
dom.window.close();

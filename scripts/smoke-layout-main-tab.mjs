import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as layouts from '../src/layout-defaults.js';

const type = process.argv[2] || 'contacts';
const mem = new Map();
globalThis.localStorage = {
  getItem: (key) => mem.get(key) ?? null,
  setItem: (key, value) => mem.set(key, String(value)),
  removeItem: (key) => mem.delete(key),
};
let dom;
function boot(url, body) {
  dom?.window.close();
  dom = new JSDOM(`<!doctype html><body class="app" data-type="${type}">${body}</body>`, { url });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'FormData']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
  globalThis.requestAnimationFrame = (fn) => fn();
}
for (const team of [false, true]) {
  boot(`http://localhost/layout/?type=${type}${team ? '&view=Test' : ''}`, '<div id="layout-root"></div>');
  const layout = team ? layouts.teamViewLayout(type, 'Test') : layouts.defaultLayout(type);
  delete layout.tabs[0].fixed; // Legacy settings must also be protected.
  if (team) layouts.saveViewLayout(type, 'Test', layout);
  else layouts.saveLayout(type, layout);
  await import(`../src/layout.js?main-tab=${type}-${team}`);
  assert.equal(document.querySelector('[data-lc="remove-tab"][data-tab="overview"]'), null);
  assert(document.querySelector('.llist--section .lcard'), 'Main cards remain editable');
  const injected = document.createElement('button');
  injected.dataset.lc = 'remove-tab';
  injected.dataset.tab = 'overview';
  document.getElementById('layout-root').append(injected);
  injected.click();
  assert(document.querySelector('.ltab [data-tab="overview"]'), 'Removal handler protects overview');
}
const data = await import('../src/data.js');
const id = ({ contacts: data.allContacts, companies: data.allCompanies, deals: data.allDeals, tickets: data.allTickets })[type]()[0].id;
for (const first of ['description', 'custom']) {
  const layout = layouts.defaultLayout(type);
  layout.tabs = layout.tabs.filter((tab) => tab.id !== 'overview');
  if (first === 'custom') layout.tabs.unshift({ id: 'custom', label: 'Custom', sections: [{ title: 'Recovery', cards: ['sentiment'] }] });
  layouts.saveLayout(type, layout);
  boot(`http://localhost/${type}/record/?id=${id}`, '<aside id="sidenav"></aside><header id="topbar"></header><main id="record-root"></main><div id="scrim"></div>');
  await import(`../src/record.js?main-tab=${type}-${first}`);
  assert.equal(document.querySelector('.rtabs__tab.is-active')?.dataset.tab, first);
  assert.equal(document.getElementById(`pane-${first}`).hidden, false);
  assert.equal(document.getElementById('pane-overview').hidden, true);
  if (first === 'custom') assert(document.querySelector('#pane-custom [data-lcard="sentiment"]'));
  document.querySelector('.rtabs__tab[data-tab="activity"]').click();
  assert.equal(document.getElementById('pane-activity').hidden, false);
}
dom.window.close();
console.log(`[main-tab] ${type}: default/team deletion protected; saved layouts recover to first tab`);

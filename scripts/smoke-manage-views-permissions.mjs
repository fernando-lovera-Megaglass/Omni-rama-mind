import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;

for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  const dom = new JSDOM('<div id="views-root"></div>', {
    url: `http://localhost/views/?type=${type}&tab=all`,
  });
  for (const key of ['window', 'document', 'location', 'history', 'HTMLElement']) {
    globalThis[key] = key === 'window' ? dom.window : dom.window[key];
  }
  const key = `crm:${type}:views`;
  const trashKey = `crm:${type}:deletedviews`;
  let rejectWrite = false;
  globalThis.localStorage = {
    getItem: (k) => dom.window.localStorage.getItem(k),
    setItem: (k, v) => { if (!rejectWrite || k !== key) dom.window.localStorage.setItem(k, v); },
    removeItem: (k) => dom.window.localStorage.removeItem(k),
  };
  const views = [
    { id: 'own', name: 'Propia', mine: true, share: 'private' },
    { id: 'foreign-all', name: 'Compartida con todos', mine: false, share: 'all' },
    { id: 'foreign-team', name: 'Compartida con equipo', mine: false, share: 'team' },
  ];
  localStorage.setItem(key, JSON.stringify({ custom: views, open: ['own'], active: 'own' }));
  let confirmations = 0;
  dom.window.confirm = () => { confirmations++; return true; };
  await import(`../src/manage-views.js?permissions=${type}`);
  const click = (selector) => document.querySelector(selector).dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true }),
  );
  const stored = () => JSON.parse(localStorage.getItem(key));
  const deleted = () => JSON.parse(localStorage.getItem(trashKey) || '[]');
  for (const id of ['foreign-all', 'foreign-team']) {
    assert.equal(document.querySelector(`[data-del="${id}"]`).disabled, true);
    // Synthetic dispatch also exercises the handler despite the disabled button.
    click(`[data-del="${id}"]`);
    assert.deepEqual(stored().custom, views);
    assert.deepEqual(deleted(), []);
    assert.equal(document.getElementById('toast'), null);
    assert.equal(confirmations, 0);
  }
  click('[data-tab-go="deleted"]');
  assert.equal(document.querySelector('[data-restore]'), null);
  click('[data-tab-go="all"]');
  assert.equal(document.querySelector('[data-del="own"]').disabled, false);
  // A store that retains the view must not generate success or a trash entry.
  rejectWrite = true;
  click('[data-del="own"]');
  assert.deepEqual(deleted(), []);
  assert.equal(document.getElementById('toast'), null);
  rejectWrite = false;
  click('[data-del="own"]');
  assert.deepEqual(stored().custom, views.slice(1));
  assert.deepEqual(stored().open, []);
  assert.equal(stored().active, null);
  assert.deepEqual(deleted().map(v => v.id), ['own']);
  assert.equal(document.getElementById('toast').textContent, 'Vista "Propia" eliminada');
  click('[data-tab-go="deleted"]');
  click('[data-restore="own"]');
  assert.equal(stored().custom.filter(v => v.id === 'own').length, 1);
  assert.deepEqual(deleted(), []);
  dom.window.close();
}
console.log('Manage views permissions: OK (contacts, companies, deals, tickets)');

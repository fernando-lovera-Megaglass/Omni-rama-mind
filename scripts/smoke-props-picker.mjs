import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const store = new Map();
for (const type of ['contacts', 'companies', 'deals', 'tickets']) {
  const dom = new JSDOM('<main id="layout-root"></main>', { url: `http://localhost/layout/?type=${type}&preview=1` });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, HTMLElement: dom.window.HTMLElement,
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } });
  await import(`../src/layout.js?test=${type}`);
  const click = selector => { const el = document.querySelector(selector); assert.ok(el, selector); el.click(); };
  const keys = () => [...document.querySelectorAll('#l-pp-selected .colsel__label')].map(el => el.textContent);
  click('[data-lc="edit"][data-card="about"]');
  const before = keys();
  assert.ok(before.length > 1);
  assert.ok(document.querySelector('[data-pp-move="-1"]').disabled);
  click('[data-index="0"] [data-pp-move="1"]');
  const expected = [before[1], before[0], ...before.slice(2)];
  assert.deepEqual(keys(), expected);
  // Searching must not hide or reorder the selected list.
  const search = document.getElementById('l-pp-q');
  search.value = 'no matching property';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.deepEqual(keys(), expected);
  click('#l-pp-ok');
  click('[data-lc="save"]');
  const saved = JSON.parse(store.get(`crm:${type}:preview:default`));
  assert.ok(saved.props.length > 1);
  // Reload the actual editor from storage and check the displayed order.
  document.body.innerHTML = '<main id="layout-root"></main>';
  await import(`../src/layout.js?reload=${type}`);
  click('[data-lc="edit"][data-card="about"]');
  assert.deepEqual(keys(), expected);
  // Additions follow click order; removing and reselecting appends at the end.
  const options = [...document.querySelectorAll('#l-pp input:not(:checked)')].slice(0, 2);
  options.reverse().forEach(input => input.click());
  const withAdded = keys();
  assert.deepEqual(withAdded.slice(-2), options.map(input => input.nextElementSibling.textContent));
  click('[data-index="0"] [data-pp-remove]');
  assert.equal(keys().length, withAdded.length - 1);
  click('[data-close]');
  click('[data-lc="edit"][data-card="about"]');
  assert.deepEqual(keys(), expected, 'Cancel discards draft');
  console.log(`PASS ${type}: reorder, search, apply/save/reload, selection order, remove, cancel`);
  dom.window.close();
}

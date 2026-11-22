import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<body data-root="../../"></body>', { url: 'http://localhost/contacts/record/?id=1' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
const { toast, recordToastAction } = await import('../src/shell.js');
const originalTimeout = globalThis.setTimeout;
const originalClear = globalThis.clearTimeout;
const timers = [];
const cleared = [];
globalThis.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
globalThis.clearTimeout = id => cleared.push(id);
try {
  toast('Guardado');
  const el = document.getElementById('toast');
  assert.equal(el.textContent, 'Guardado');
  assert.equal(timers.at(-1).delay, 2500);
  toast('Contacto creado', recordToastAction('contacts', 'new id'));
  assert.equal(el.firstChild.textContent, 'Contacto creado');
  assert.equal(el.querySelector('a').textContent, 'Ver contacto');
  assert.equal(el.querySelector('a').href, 'http://localhost/contacts/record/?id=new%20id');
  assert.equal(timers.at(-1).delay, 6000);
  assert.ok(cleared.includes(1));
  toast('Guardado de nuevo');
  assert.equal(el.textContent, 'Guardado de nuevo');
  assert.equal(el.querySelector('a'), null);
  assert.equal(timers.at(-1).delay, 2500);
  timers.at(-1).callback();
  assert.ok(!el.classList.contains('is-visible'));
  toast('<b>Texto</b>', { actionLabel: '<em>Ver</em>', href: '/tasks/record/?id=2' });
  assert.equal(el.querySelector('b, em'), null);
  console.log('PASS: plain toast, action URL, duration, replacement, dismissal and safe text');
} finally {
  globalThis.setTimeout = originalTimeout;
  globalThis.clearTimeout = originalClear;
  dom.window.close();
}

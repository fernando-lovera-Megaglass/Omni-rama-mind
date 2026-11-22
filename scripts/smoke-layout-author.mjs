import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setAuthClient, currentUserName } from '../src/auth.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
let user = { id: 'ana', email: 'ana@example.test', user_metadata: { name: 'Ana García' } };
let profile = null;
setAuthClient({
  auth: { getSession: async () => ({ data: { session: user ? { user } : null } }) },
  from: (table) => {
    assert.equal(table, 'team_members');
    return { select: () => ({ eq: (key, id) => {
      assert.equal(key, 'user_id');
      assert.equal(id, user.id);
      return { maybeSingle: async () => ({ data: profile }) };
    } }) };
  },
});

for (const kind of ['record', 'preview']) {
  const dom = new JSDOM('<div id="layout-root"></div>', { url: `http://localhost/layout/?type=deals&new=1${kind === 'preview' ? '&preview=1' : ''}` });
  for (const key of ['window', 'document', 'location', 'HTMLElement']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
  await import(`../src/layout.js?author=${kind}`);
  const click = (selector) => document.querySelector(selector).click();
  const save = async () => {
    click('[data-lc="save"]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    return JSON.parse(mem.get(`crm:deals:${kind}views`)).at(-1);
  };
  profile = null;
  assert.equal((await save()).by, 'Ana García');
  // Edit the same view under another session: the last editor must replace the original author.
  user = { id: 'lucia', email: 'lucia@example.test', user_metadata: { name: 'Lucía' } };
  profile = { name: 'Lucía Pérez' };
  click('[data-lc="rename-view"]');
  document.getElementById('l-prompt').value = `Vista ${kind} editada`;
  click('#l-ok');
  const edited = await save();
  assert.equal(edited.by, 'Lucía Pérez');
  assert.equal(edited.name, `Vista ${kind} editada`);
  user = { id: 'ana', email: 'ana@example.test', user_metadata: { name: 'Ana García' } };
}
profile = null;
user.user_metadata = {};
assert.equal(await currentUserName(), 'ana@example.test');
user = null;
assert.equal(await currentUserName(), '');
console.log('OK: record and preview views attribute saves to the current editor.');

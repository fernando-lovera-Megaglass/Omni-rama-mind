// Local regression: execute the Edge handlers with mocked Google and Supabase only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
let handler, state, failure, revoked, refreshes;
// Keep expected failure logs concise (data-URL module stack traces are enormous).
const originalError = console.error;
console.error = (...args) => originalError(...args.map(x => x instanceof Error ? x.message : x));
globalThis.Deno = { env: { get: () => 'local-test' }, serve: fn => { handler = fn; } };
const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
  from(table) {
    let operation = 'read', patch, single = false;
    const q = {
      select() { return q; }, eq() { return q; }, order() { return q; }, in() { return q; }, or() { return q; }, is() { return q; },
      maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      update(value) { operation = 'update'; patch = value; return q; },
      upsert(value) { operation = 'insert'; patch = value; return q; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (failure === `${table}:${operation}`) return { data: null, error: new Error('simulated storage failure') };
          if (operation === 'update') Object.assign(state[table][0], patch);
          if (operation === 'insert') state[table].push(...patch);
          return { data: single ? state[table][0] : state[table], error: null };
        }).then(resolve, reject);
      },
    }; return q;
  },
};
globalThis.__gmailTestClient = client;
const source = await readFile(new URL('../supabase/functions/_shared/gmail.ts', import.meta.url), 'utf8');
const shared = (await transform(source.replace(/import .*?from 'npm:@supabase\/supabase-js@2';/, 'const createClient = () => globalThis.__gmailTestClient;'), { loader: 'ts', format: 'esm' })).code;
const sharedUrl = `data:text/javascript;base64,${Buffer.from(shared).toString('base64')}`;
async function load(name) {
  const code = await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
  const js = (await transform(code.replaceAll("'../_shared/gmail.ts'", JSON.stringify(sharedUrl)), { loader: 'ts', format: 'esm' })).code;
  await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  return handler;
}
const sync = await load('gmail-sync');
const account = await load('gmail-account');
const request = method => new Request('https://local.invalid', { method, headers: { Authorization: 'Bearer test' }, ...(method === 'POST' ? { body: JSON.stringify({ accountId: 'account' }) } : {}) });
const reset = () => {
  failure = null; revoked = false; refreshes = 0;
  state = { connected_accounts: [{ id: 'account', user_id: 'user', email: 'test@example.invalid', status: 'active', last_synced_at: null }], connected_account_tokens: [{ account_id: 'account', access_token: 'old', refresh_token: 'refresh', expires_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' }], inbox_messages: [], contacts: [] };
};
globalThis.fetch = async (url, init) => {
  if (url.includes('oauth2.googleapis.com/token')) {
    refreshes++;
    assert.equal(init.body.get('refresh_token'), 'refresh');
    return Response.json(revoked ? { error: 'invalid_grant' } : { access_token: 'new', expires_in: 3600 }, { status: revoked ? 400 : 200 });
  }
  assert.equal(init.headers.Authorization, 'Bearer new');
  if (url.endsWith('profile')) return Response.json({ messagesTotal: 1 });
  if (url.includes('messages?')) return Response.json({ messages: [{ id: 'message' }] });
  return Response.json({ id: 'message', payload: { headers: [{ name: 'From', value: 'sender@example.invalid' }] } });
};
reset();
assert.equal((await sync(request('POST'))).status, 200);
assert.equal(refreshes, 1);
assert.equal(state.connected_account_tokens[0].access_token, 'new');
assert.ok(Date.parse(state.connected_account_tokens[0].expires_at) > Date.now());
assert.notEqual(state.connected_account_tokens[0].updated_at, '2020-01-01T00:00:00Z');
assert.ok(state.connected_accounts[0].last_synced_at);
assert.equal(state.inbox_messages.length, 1);
assert.equal((await sync(request('POST'))).status, 200);
assert.equal(refreshes, 1);
assert.equal(state.inbox_messages.length, 1);
reset(); revoked = true;
assert.equal((await sync(request('POST'))).status, 409);
assert.equal(state.connected_accounts[0].status, 'error');
assert.match(state.connected_accounts[0].last_sync_error, /invalid_grant/);
assert.equal(state.connected_accounts[0].last_synced_at, null);
let result = await (await account(request('GET'))).json();
assert.equal(result.accounts[0].status, 'error');
assert.match(result.accounts[0].lastError, /invalid_grant/);
for (const fault of ['connected_account_tokens:update', 'inbox_messages:insert']) {
  reset(); failure = fault;
  assert.equal((await sync(request('POST'))).status, 500);
  assert.equal(state.connected_accounts[0].status, 'error');
  assert.ok(state.connected_accounts[0].last_sync_error);
  assert.equal(state.connected_accounts[0].last_synced_at, null);
  failure = null;
  result = await (await account(request('GET'))).json();
  assert.equal(result.accounts[0].status, 'error', 'profile success must preserve sync errors');
  assert.equal((await sync(request('POST'))).status, 200);
  assert.equal(state.connected_accounts[0].last_sync_error, null);
}
reset(); state.connected_accounts[0].status = 'disabled';
assert.equal((await sync(request('POST'))).status, 409);
assert.equal(refreshes, 0);
console.log('Gmail sync regression passed: refresh, persistence, revoked grant, account status, recovery, disabled account.');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bootstrapDemo, getDemoBootstrapStatus } from '../src/demo-bootstrap.js';

const payload = { contacts: [] };
for (const failure of [{ code: 'PGRST202', message: 'function missing' }, new Error('network unavailable')]) {
  const client = { async rpc(name, args) {
    assert.equal(name, 'bootstrap_demo_v1');
    assert.equal(args.payload, payload);
    if (failure instanceof Error) throw failure;
    return { error: failure };
  } };
  // Execute the actual init function with isolated dependencies, no network or DOM.
  const source = readFileSync(new URL('../src/data.js', import.meta.url), 'utf8');
  const init = source.slice(source.indexOf('async function initFromSupabase()'), source.indexOf('// Top-level await:'));
  const run = new Function('seedAll', `return (async () => {
    let dbLive = true, settingsUserId, settingsUserEmail, teamReady, pipelineDefsRemote,
      viewRows, settingsMap, contactCompanyRows, contactCompanyIndex, activityRows,
      segmentRows, nextSegmentId, activitiesLive = false, segmentsLive = true;
    const GLOBAL_USER = 'test', BUILDERS = {contacts:1, companies:1, deals:1, tickets:1, tasks:1};
    const dbRows = {}, lazyCounts = {}, nextId = {}, lazyTypes = new Set();
    const LIGHT_ACTIVITIES = true;
    const requireSession = async () => null, fetchMyTeam = async () => [];
    const initCustomProperties = async () => {}, initPipelines = async () => {};
    let fetches = 0;
    const fetchTable = async () => { fetches++; return []; };
    const fetchViews = async () => [], fetchUserSettings = async () => ({}),
      fetchContactCompanies = async () => [], fetchSegments = async () => [];
    ${init}
    await initFromSupabase();
    return {dbLive, dbRows, fetches, nextId};
  })()`);
  const result = await run(() => bootstrapDemo(client, payload));
  assert.equal(result.dbLive, true, 'RPC failure must not enable localStorage demo');
  assert.equal(result.fetches, 5);
  assert.deepEqual(result.dbRows.contacts, [], 'no fabricated records');
  assert.equal(result.nextId.contacts, 1);
  assert.equal(getDemoBootstrapStatus().state, 'failed');
  assert.ok(getDemoBootstrapStatus().message.includes('Supabase'));
}
for (const data of [true, false]) {
  assert.equal((await bootstrapDemo({rpc: async () => ({data})}, payload)).state, data ? 'seeded' : 'skipped');
}
assert.equal((await bootstrapDemo({rpc: async () => ({data: null})}, payload)).state, 'failed');
console.log('PASS: actual init keeps Supabase on missing RPC/network failure; status, seed success and concurrent skip');

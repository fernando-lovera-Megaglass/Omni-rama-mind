import assert from 'node:assert/strict';
import { main, VERIFY } from './sequence-activate.mjs';
import { PROJECT } from './mgmt-sql.mjs';
const env = { SEQUENCE_REMOTE_URL: `https://${PROJECT}.supabase.co`, SEQUENCE_REMOTE_SERVICE_ROLE_KEY: 'sb_secret_fake' };
async function scenario({ argv = ['--yes'], environment = env, health = true, cron = true, vault = true, vaultExtension = true, net = true, overdue = 0, backfillFails = false } = {}) {
  const calls = [];
  const deps = {
    log() {},
    async fetchImpl(url, options) {
      calls.push('health'); assert.equal(options.method, 'GET');
      return { ok: health, status: health ? 200 : 404, json: async () => ({ ok: true, service: 'sequence-process', activationVersion: 1 }) };
    },
    async sql(query) {
      calls.push(query);
      if (query.includes('to_regclass')) {
        assert.ok(query.includes("to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)')"));
        assert.ok(query.includes("to_regclass('net._http_response')"));
        return [{ cron, vault: vaultExtension, net }];
      }
      if (query.includes('url_ok')) return [{ url_ok: vault, key_ok: vault }];
      if (query === VERIFY) return [{ overdue, stale: overdue, future: 26 }];
      if (query.includes('alter_job')) return [{}];
      return [{ jobid: 1, active: true, schedule: '* * * * *', command: 'select net.http_post /functions/v1/sequence-process' }];
    },
    async backfillImpl(args) {
      calls.push('backfill'); assert.deepEqual(args, ['--from-db', '--apply', '--yes']);
      if (backfillFails) throw new Error('backfill failed');
      return { plan: { reschedule: Array(26) } };
    },
  };
  try { return { result: await main(argv, environment, deps), calls }; }
  catch (error) { return { error, calls }; }
}
for (const options of [{ argv: [] }, { environment: {} }, { environment: { ...env, SEQUENCE_REMOTE_URL: 'https://other.supabase.co' } }]) {
  const r = await scenario(options); assert.ok(r.error); assert.equal(r.calls.length, 0);
}
const missing = await scenario({ health: false });
assert.match(missing.error.message, /npx supabase functions deploy sequence-process --project-ref/);
assert.deepEqual(missing.calls, ['health']);
for (const options of [{ cron: false }, { vaultExtension: false }, { net: false }, { vault: false }, { overdue: 1 }, { backfillFails: true }]) {
  const r = await scenario(options); assert.ok(r.error);
  assert.ok(!r.calls.some(q => q.includes('active := true')));
}
const noNet = await scenario({ net: false });
assert.match(noNet.error.message, /pg_net/);
assert.ok(!noNet.calls.includes('backfill'));
assert.ok(!noNet.calls.some(q => q.includes('alter_job')));
const success = await scenario(); assert.ifError(success.error); assert.equal(success.result.rescheduled, 26);
assert.ok(success.calls.findIndex(q => q.includes('active := false')) < success.calls.indexOf('backfill'));
assert.ok(success.calls.indexOf(VERIFY) < success.calls.findIndex(q => q.includes('active := true')));
console.log('[sequence-activate] OK: opt-in, proyecto, despliegue, Vault, cron, fallos y orden de activación; sin red');

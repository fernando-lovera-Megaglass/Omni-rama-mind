import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOKEN_RENEWAL_MESSAGE } from './mgmt-sql.mjs';

test('Management CLI authentication and success paths without network access', () => {
  const root = mkdtempSync(join(tmpdir(), 'mgmt-sql-test-'));
  try {
    mkdirSync(join(root, 'scripts'));
    for (const name of ['mgmt-sql.mjs', 'apply-migration.mjs']) {
      copyFileSync(new URL(name, import.meta.url), join(root, 'scripts', name));
    }
    writeFileSync(join(root, '.supabase-mgmt-token'), 'fake-token');
    writeFileSync(join(root, 'probe.sql'), 'select 1');
    const log = join(root, 'scripts', 'applied-migrations.json');
    const originalLog = '{"existing.sql":{"status":"aplicada"}}\n';
    writeFileSync(log, originalLog);
    const mock = join(root, 'mock.mjs');
    writeFileSync(mock, `
      import assert from 'node:assert/strict';
      globalThis.fetch = async (url, options) => {
        assert.equal(url, 'https://api.supabase.com/v1/projects/xysgvxnieigpaxtmxiui/database/query');
        assert.equal(options.headers.Authorization, 'Bearer fake-token');
        assert.equal(JSON.parse(options.body).query, 'select 1');
        const status = Number(process.env.MGMT_TEST_STATUS);
        return new Response(status === 200 ? '[{"?column?":1}]' : '{"message":"Invalid access token"}', { status });
      };
    `);
    const run = (script, arg, status) => spawnSync(process.execPath,
      ['--import', mock, join(root, 'scripts', script), arg], {
        cwd: tmpdir(), encoding: 'utf8',
        env: { ...process.env, MGMT_TEST_STATUS: String(status) },
      });
    for (const [script, arg] of [['mgmt-sql.mjs', 'select 1'], ['apply-migration.mjs', 'probe.sql']]) {
      const result = run(script, arg, 401);
      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stderr.includes(TOKEN_RENEWAL_MESSAGE));
      assert.ok(!result.stderr.includes('Invalid access token'));
      assert.ok(!result.stderr.includes('fake-token'));
      assert.equal(readFileSync(log, 'utf8'), originalLog);
    }
    const success = run('mgmt-sql.mjs', 'select 1', 200);
    assert.equal(success.status, 0, success.stderr);
    assert.deepEqual(JSON.parse(success.stdout), [{ '?column?': 1 }]);
    const failure = run('mgmt-sql.mjs', 'select 1', 500);
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /HTTP 500/);
    assert.ok(!failure.stderr.includes(TOKEN_RENEWAL_MESSAGE));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

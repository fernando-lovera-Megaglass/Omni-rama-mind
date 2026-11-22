// Local PostgreSQL by default; remote repair requires an explicit project target.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const remote = args.includes('--management');
const allowed = ['--apply', '--management', '--project=xysgvxnieigpaxtmxiui'];
if (args.some(a => !allowed.includes(a)) || (remote !== args.includes('--project=xysgvxnieigpaxtmxiui'))) {
  throw new Error('Usage: node scripts/dedupe-contacts.mjs [--apply] [--management --project=xysgvxnieigpaxtmxiui]');
}
const repair = readFileSync(new URL('./sql/dedupe-contacts.sql', import.meta.url), 'utf8');
const sql = `BEGIN;\nSET LOCAL lock_timeout = '15s';\n${repair}\n${args.includes('--apply') ? 'COMMIT' : 'ROLLBACK'};`;
if (remote) {
  const { runSql, PROJECT } = await import('./mgmt-sql.mjs');
  // Private audit files can contain personal data. Never print before images.
  const path = new URL(`../.dedupe-audit-${Date.now()}.json`, import.meta.url);
  writeFileSync(path, JSON.stringify({ project: PROJECT, apply: args.includes('--apply'), status: 'started' }), { mode: 0o600, flag: 'wx' });
  try {
    const result = await runSql(sql);
    writeFileSync(path, JSON.stringify({ project: PROJECT, apply: args.includes('--apply'), result }, null, 2));
    console.log(`Remote ${args.includes('--apply') ? 'repair committed' : 'dry run rolled back'}. Audit: ${path.pathname}`);
  } catch (error) {
    console.error(error.message);
    console.error('Verify database state before retrying: a transport error may occur after commit.');
    process.exitCode = 1;
  }
} else {
const url = new URL(process.env.DATABASE_URL || 'postgres://localhost/postgres');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Only local databases are allowed');
// Pin the network address too: libpq PGHOSTADDR must not override localhost.
url.searchParams.set('hostaddr', url.hostname === '[::1]' ? '::1' : '127.0.0.1');

console.error(args.includes('--apply') ? 'Applying local repair; save stdout and stderr as audit log.' : 'Dry run: all changes will be rolled back.');
const result = spawnSync('psql', ['-X', '--set', 'ON_ERROR_STOP=1', '--dbname', url.href], { input: sql, encoding: 'utf8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;

}

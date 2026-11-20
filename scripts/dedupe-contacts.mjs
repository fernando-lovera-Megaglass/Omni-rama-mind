// Local PostgreSQL only. No Supabase credentials or management API are used.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (args.some(a => !['--apply'].includes(a))) throw new Error('Usage: DATABASE_URL=postgres://...localhost... node scripts/dedupe-contacts.mjs [--apply]');
const url = new URL(process.env.DATABASE_URL || 'postgres://localhost/postgres');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Only local databases are allowed');
// Pin the network address too: libpq PGHOSTADDR must not override localhost.
url.searchParams.set('hostaddr', url.hostname === '[::1]' ? '::1' : '127.0.0.1');
const repair = readFileSync(new URL('./sql/dedupe-contacts.sql', import.meta.url), 'utf8');
const sql = `BEGIN;\n${repair}\n${args.includes('--apply') ? 'COMMIT' : 'ROLLBACK'};`;
console.error(args.includes('--apply') ? 'Applying local repair; save stdout and stderr as audit log.' : 'Dry run: all changes will be rolled back.');
const result = spawnSync('psql', ['-X', '--set', 'ON_ERROR_STOP=1', '--dbname', url.href], { input: sql, encoding: 'utf8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;

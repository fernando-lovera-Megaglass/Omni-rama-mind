// Runs SQL against the project through the Supabase Management API with the token saved in
// app/.supabase-mgmt-token (never printed). Shared by apply-migration.mjs and the live tests.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT = 'xysgvxnieigpaxtmxiui';
const tokenFile = resolve(here, '..', '.supabase-mgmt-token');
export const hasMgmtToken = () => existsSync(tokenFile);
export const TOKEN_RENEWAL_MESSAGE = 'token de gestión expirado: renuévalo en https://supabase.com/dashboard/account/tokens y guárdalo en app/.supabase-mgmt-token';

export async function runSql(query) {
  if (!hasMgmtToken()) throw new Error('Falta app/.supabase-mgmt-token');
  const token = readFileSync(tokenFile, 'utf8').trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (res.status === 401) throw new Error(TOKEN_RENEWAL_MESSAGE);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

// Importing runSql has no side effects; direct execution accepts an explicit SQL query.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const query = process.argv[2];
  if (!query) {
    console.error('Uso: node scripts/mgmt-sql.mjs "select 1"');
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await runSql(query), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

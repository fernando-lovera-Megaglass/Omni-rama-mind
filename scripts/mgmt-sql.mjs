// Runs SQL against the project through the Supabase Management API with the token saved in
// app/.supabase-mgmt-token (never printed). Shared by apply-migration.mjs and the live tests.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT = 'xysgvxnieigpaxtmxiui';
const tokenFile = resolve(here, '..', '.supabase-mgmt-token');
export const hasMgmtToken = () => existsSync(tokenFile);

export async function runSql(query) {
  if (!hasMgmtToken()) throw new Error('Falta app/.supabase-mgmt-token');
  const token = readFileSync(tokenFile, 'utf8').trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

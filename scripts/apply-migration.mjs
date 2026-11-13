// Applies one SQL file of supabase/ to the project (same effect as pasting it in the SQL Editor) and
// records it in scripts/applied-migrations.json. Run: node scripts/apply-migration.mjs supabase/invitations.sql
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { runSql, hasMgmtToken } from './mgmt-sql.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
if (!file) { console.error('Uso: node scripts/apply-migration.mjs supabase/<archivo>.sql'); process.exit(1); }
if (!hasMgmtToken()) { console.error('Falta app/.supabase-mgmt-token: pega el archivo en el SQL Editor de Supabase en su lugar.'); process.exit(2); }
const sql = readFileSync(resolve(here, '..', file), 'utf8');
try {
  await runSql(sql);
  console.log(`[migración] ${basename(file)} aplicada.`);
  const logFile = resolve(here, 'applied-migrations.json');
  let log = {};
  try { log = JSON.parse(readFileSync(logFile, 'utf8')); } catch { /* new log */ }
  log[basename(file)] = { status: 'aplicada', at: new Date().toISOString() };
  writeFileSync(logFile, `${JSON.stringify(log, null, 2)}\n`);
} catch (e) {
  console.error(`[migración] ${basename(file)} falló: ${e.message}`);
  process.exit(1);
}

// Applies one SQL file of supabase/ to the project (same effect as pasting it in the SQL Editor) and
// With --local <directory>, applies only to a local PGlite database, without remote logging.
// Otherwise records it in scripts/applied-migrations.json. Run: node scripts/apply-migration.mjs supabase/invitations.sql
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { runSql, hasMgmtToken } from './mgmt-sql.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
if (!file) { console.error('Uso: node scripts/apply-migration.mjs supabase/<archivo>.sql'); process.exit(1); }
const localIndex = process.argv.indexOf('--local');
const localDir = localIndex >= 0 ? process.argv[localIndex + 1] : null;
if (localIndex >= 0 && (!localDir || localDir.startsWith('--'))) {
  console.error('--local requiere un directorio PGlite local'); process.exit(1);
}
if (!localDir && !hasMgmtToken()) { console.error('Falta app/.supabase-mgmt-token: pega el archivo en el SQL Editor de Supabase en su lugar.'); process.exit(2); }
const sql = readFileSync(resolve(here, '..', file), 'utf8');
try {
  if (localDir) {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite(resolve(localDir));
    try { await db.exec(sql); } finally { await db.close(); }
    console.log(`[migración local] ${basename(file)} aplicada en PGlite; registro remoto sin cambios.`);
    process.exit(0);
  }
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

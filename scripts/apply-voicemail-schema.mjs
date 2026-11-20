// Compatibilidad: una única migración SQL y el registro del aplicador común.
// Atención: el aplicador apunta al proyecto remoto; no ejecutarlo para validar localmente.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('./apply-migration.mjs', import.meta.url)),
  'supabase/voicemail-storage.sql',
], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;

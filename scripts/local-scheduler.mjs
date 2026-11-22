// Opt-in local scheduler for the Edge Functions that run on a timer: sequence-process (secuencias),
// marketing-process (correos de marketing programados) and workflow-process (retrasos de workflows). One generic
// loop, one tick per minute, no overlap.
// Never reads .env or the linked project's credentials: only a LOCAL Supabase instance over loopback HTTP.
//   LOCAL_SERVICE_ROLE_KEY=<local key> node scripts/local-scheduler.mjs [--once] [--functions a,b] [--every ms]
// LOCAL_SUPABASE_URL is optional (default http://127.0.0.1:54321). The SEQUENCE_LOCAL_* variables of
// scripts/sequence-scheduler.mjs keep working, and that script now delegates here.
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] || '') : ''; };
const base = new URL(process.env.LOCAL_SUPABASE_URL || process.env.SEQUENCE_LOCAL_URL || 'http://127.0.0.1:54321');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') throw new Error('Only local HTTP Supabase is allowed');
const key = process.env.LOCAL_SERVICE_ROLE_KEY || process.env.SEQUENCE_LOCAL_SERVICE_ROLE_KEY;
if (!key) throw new Error('Set LOCAL_SERVICE_ROLE_KEY from your local Supabase instance');
const functions = (flag('--functions') || 'sequence-process,marketing-process,workflow-process').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9-]+$/.test(s));
if (!functions.length) throw new Error('No function names given (--functions sequence-process,marketing-process,workflow-process)');
const once = args.includes('--once');
const every = Math.max(5_000, Number(flag('--every')) || 60_000);

async function tick(name) {
  const response = await fetch(new URL(`/functions/v1/${name}`, base), {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(50_000),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`${name} failed (${response.status}): ${JSON.stringify(body)}`);
  console.log(`[${name}] ${JSON.stringify(body)}`);
}
do {
  for (const name of functions) {
    try { await tick(name); } catch (e) { console.error(`[${name}] ${e.message}`); if (once) process.exitCode = 1; }
  }
  if (!once) await new Promise((resolve) => setTimeout(resolve, every));
} while (!once);

// Opt-in local scheduler. Never reads .env or the linked project's credentials.
const base = new URL(process.env.SEQUENCE_LOCAL_URL || 'http://127.0.0.1:54321');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') throw new Error('Only local HTTP Supabase is allowed');
const key = process.env.SEQUENCE_LOCAL_SERVICE_ROLE_KEY;
if (!key) throw new Error('Set SEQUENCE_LOCAL_SERVICE_ROLE_KEY from your local Supabase instance');
const once = process.argv.includes('--once');
async function tick() {
  const response = await fetch(new URL('/functions/v1/sequence-process', base), {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(50_000),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`Sequence processor failed (${response.status}): ${JSON.stringify(body)}`);
  console.log(JSON.stringify(body));
}
do {
  try { await tick(); } catch (e) { console.error(e.message); if (once) process.exitCode = 1; }
  if (!once) await new Promise((resolve) => setTimeout(resolve, 60_000));
} while (!once);

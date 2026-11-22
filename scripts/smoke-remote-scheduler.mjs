// Smoke test for scripts/remote-scheduler.mjs against a fake Supabase on loopback (no project, no .env, no real
// key): the script refuses to run without the two opt-in variables, with a publishable or anon key or with a plain
// http remote host; --dry-run lists the due enrolments through PostgREST with the key and invokes no function;
// --once POSTs the function exactly once with the service role header and exits 1 when the function reports
// ok:false; the key never shows up in the output. Run: node scripts/smoke-remote-scheduler.mjs
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, 'remote-scheduler.mjs');
const log = (...a) => console.log('[remote-scheduler-smoke]', ...a);
const fail = (msg) => { console.error(`[remote-scheduler-smoke] FAIL: ${msg}`); process.exit(1); };
const KEY = 'sb_secret_smoke_only_not_real_0123456789';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase' })}.sig`;

const calls = [];
let functionOk = true;
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, apikey: req.headers.apikey, body });
    if (req.url.startsWith('/rest/v1/sequence_enrollments')) {
      if (req.headers.authorization !== `Bearer ${KEY}` || req.headers.apikey !== KEY) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"message":"bad key"}'); return; }
      const rows = [
        { id: '11111111-1111-4111-8111-111111111111', sequence_id: 's1', contact_name: 'Ana Prueba', status: 'active', current_step: 1, next_step_at: '2026-11-09T06:00:00+00:00' },
        { id: '22222222-2222-4222-8222-222222222222', sequence_id: 's1', contact_name: 'Beto Prueba', status: 'active', current_step: 2, next_step_at: '2026-11-10T06:00:00+00:00' },
        { id: '33333333-3333-4333-8333-333333333333', sequence_id: 's2', contact_name: 'Caro Prueba', status: 'active', current_step: 1, next_step_at: '2026-11-11T06:00:00+00:00' },
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(rows)); return;
    }
    if (req.url === '/functions/v1/sequence-process' && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${KEY}`) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"Service role required"}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: functionOk, results: functionOk ? [{ id: '1111', status: 'advanced' }] : [{ id: '1111', status: 'error' }] })); return;
    }
    res.writeHead(404); res.end('nope');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const run = (args, env) => new Promise((done) => {
  const child = spawn(process.execPath, [script, ...args], { env: { PATH: process.env.PATH, ...env }, cwd: resolve(here, '..') });
  let out = ''; let err = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { err += c; });
  child.on('close', (code) => done({ code, out, err }));
});

// ---- refusals: nothing is read from .env, so without the variables it stops before any request ----
let r = await run(['--dry-run'], {});
if (r.code !== 1 || !/SEQUENCE_REMOTE_URL/.test(r.err) || calls.length) fail(`refuses without the opt-in variables (${r.code}: ${r.err.trim()})`);
r = await run(['--dry-run'], { SEQUENCE_REMOTE_URL: base, SEQUENCE_REMOTE_SERVICE_ROLE_KEY: 'sb_publishable_abc' });
if (r.code !== 1 || !/publishable/.test(r.err) || calls.length) fail('refuses a publishable key');
r = await run(['--dry-run'], { SEQUENCE_REMOTE_URL: base, SEQUENCE_REMOTE_SERVICE_ROLE_KEY: jwt('anon') });
if (r.code !== 1 || !/role "anon"/.test(r.err) || calls.length) fail('refuses an anon JWT');
r = await run(['--dry-run'], { SEQUENCE_REMOTE_URL: 'http://example.com', SEQUENCE_REMOTE_SERVICE_ROLE_KEY: KEY });
if (r.code !== 1 || !/https/.test(r.err) || calls.length) fail('refuses plain http on a remote host');
r = await run(['--dry-run'], { SEQUENCE_REMOTE_URL: 'not a url', SEQUENCE_REMOTE_SERVICE_ROLE_KEY: KEY });
if (r.code !== 1 || !/valid URL/.test(r.err)) fail('refuses a bad URL');
log('rechaza: sin variables, clave publishable, JWT anon, http remoto, URL inválida (0 peticiones)');

// ---- dry run: lists the due enrolments through PostgREST with the key; invokes no function ----
r = await run(['--dry-run'], { SEQUENCE_REMOTE_URL: base, SEQUENCE_REMOTE_SERVICE_ROLE_KEY: KEY });
if (r.code !== 0) fail(`dry run exit ${r.code}: ${r.err}`);
if (calls.length !== 1 || !calls[0].url.startsWith('/rest/v1/sequence_enrollments?') || calls[0].method !== 'GET') fail(`dry run makes one PostgREST read (${JSON.stringify(calls.map((c) => c.url))})`);
const qs = new URLSearchParams(calls[0].url.split('?')[1]);
if (qs.get('status') !== 'eq.active' || !/^lte\.\d{4}-\d{2}-\d{2}T/.test(qs.get('next_step_at') || '') || qs.get('order') !== 'next_step_at.asc') fail(`dry run predicate (${calls[0].url})`);
if (!/3 inscripciones activas vencidas/.test(r.out) || !/11111111-1111-4111-8111-111111111111 {2}paso 1 {2}vencido 2026-11-09T06:00:00.000Z {2}Ana Prueba/.test(r.out) || !/Caro Prueba/.test(r.out)) fail(`dry run output:\n${r.out}`);
if (!/dry-run \(no se invoca nada\)/.test(r.out) || !r.out.includes(`proyecto 127.0.0.1:${server.address().port}`) || !/clave secret/.test(r.out)) fail('dry run header line');
if (r.out.includes(KEY) || r.err.includes(KEY)) fail('the key must never be printed');
log('dry-run: 1 lectura PostgREST (status=eq.active, next_step_at=lte.ahora), 3 filas listadas, ninguna función invocada, clave no impresa');

// ---- --once: one POST to the function with the service role header ----
calls.length = 0;
r = await run(['--once'], { SEQUENCE_REMOTE_URL: base, SEQUENCE_REMOTE_SERVICE_ROLE_KEY: KEY });
if (r.code !== 0) fail(`--once exit ${r.code}: ${r.err}`);
if (calls.length !== 1 || calls[0].url !== '/functions/v1/sequence-process' || calls[0].method !== 'POST' || calls[0].auth !== `Bearer ${KEY}` || calls[0].apikey !== KEY || calls[0].body !== '{}') fail(`--once invokes the function once (${JSON.stringify(calls)})`);
if (!/\[sequence-process\] \{"ok":true/.test(r.out) || r.out.includes(KEY)) fail(`--once output:\n${r.out}`);
// legacy service_role JWT is accepted too (the fake server only knows KEY, so it answers 401 → exit 1 with the message, no crash)
calls.length = 0;
r = await run(['--once'], { SEQUENCE_REMOTE_URL: base, SEQUENCE_REMOTE_SERVICE_ROLE_KEY: jwt('service_role') });
if (r.code !== 1 || calls.length !== 1 || !/clave service_role/.test(r.out) || !/failed \(401\)/.test(r.err)) fail(`service_role JWT accepted by the script, 401 from the server reported (${r.code}: ${r.err.trim()})`);
// marketing-process on request, in the same tick
calls.length = 0;
r = await run(['--once', '--functions', 'sequence-process,marketing-process'], { SEQUENCE_REMOTE_URL: base, SEQUENCE_REMOTE_SERVICE_ROLE_KEY: KEY });
if (calls.length !== 2 || calls[1].url !== '/functions/v1/marketing-process' || r.code !== 1 || !/\[marketing-process\] marketing-process failed \(404\)/.test(r.err)) fail(`--functions runs both and reports the 404 of the missing one (${r.code}: ${r.err.trim()})`);
// the function answering ok:false → exit code 1
functionOk = false; calls.length = 0;
r = await run(['--once'], { SEQUENCE_REMOTE_URL: base, SEQUENCE_REMOTE_SERVICE_ROLE_KEY: KEY });
if (r.code !== 1 || calls.length !== 1 || !/failed \(200\)/.test(r.err)) fail(`ok:false → exit 1 (${r.code}: ${r.err.trim()})`);
log('--once: 1 POST /functions/v1/sequence-process con Bearer service role; JWT service_role aceptado; --functions sequence-process,marketing-process; ok:false → código 1');

server.close();
console.log('[remote-scheduler-smoke] OK');
process.exit(0);

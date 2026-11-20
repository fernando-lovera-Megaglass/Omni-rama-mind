import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { createHmac, webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const account = 'AC' + 'a'.repeat(32), sid = 'CA' + '1'.repeat(32), child = 'CA' + '2'.repeat(32);
const token = 'local-test-token', publicUrl = 'https://test.supabase.co/functions/v1/twilio-call-status';
let handler, rows, writes, apiCalls, fetches;
const conn = { id: 'connection', account_sid: account };
function from(table) {
  let filters = [], patch;
  const q = { select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; }, update(v) { patch = v; return q; }, maybeSingle() { return q; }, then(resolve) {
    const candidates = table === 'call_logs' ? rows : table === 'twilio_connections' ? [conn] : [{connection_id: conn.id, auth_token: token}];
    const data = candidates.find(r => filters.every(f => f(r))) || null;
    if (patch && data) { writes++; Object.assign(data, patch); }
    resolve({ data, error: null });
  } }; return q;
}
const service = { from };
const Deno = { env: { get: name => name === 'SUPABASE_URL' ? 'https://test.supabase.co' : 'test-key' }, serve: f => { handler = f; } };
const sharedSource = readFileSync('supabase/functions/_shared/twilio.ts', 'utf8').replace(/^import .*;$/mg, '').replace(/^export \{.*;$/mg, '');
const sharedCode = (await transform(sharedSource, {loader: 'ts', format: 'cjs'})).code;
const module = {exports: {}};
new Function('module', 'Deno', 'crypto', 'fetch', sharedCode)(module, Deno, webcrypto, async (url, opts) => { fetches++; if (url === 'https://api.openai.com/v1/audio/transcriptions') return Response.json({text:'Transcripción local'}); assert.equal(opts.redirect, 'error'); assert.equal(opts.headers.Authorization, 'Basic ' + btoa(account + ':' + token)); return new Response('audio'); });
const shared = module.exports;
async function load(file, dependencies) {
  const source = readFileSync(file, 'utf8').replace(/^import .*;$/mg, '');
  const {code} = await transform(source, {loader:'ts'});
  new Function('Deno', ...Object.keys(dependencies), code)(Deno, ...Object.values(dependencies));
  return handler;
}
const deps = { ...shared, handle:f=>f, serviceClient:()=>service, fail:(m,s=400)=>new Response(m,{status:s}), background:()=>{}, transcribeCallLog:async()=>null, twilio:async()=>{apiCalls++; return {parent_call_sid:sid};} };
const statusHandler = await load('supabase/functions/twilio-call-status/index.ts', deps);
function reset() { rows=[{id:'log', call_sid:sid, connection_id:conn.id, user_id:'owner', status:'ringing', recording_url:null}]; writes=apiCalls=fetches=0; }
async function request(extra={}, signature='valid', query='') {
  const params={AccountSid:account, CallSid:sid, CallStatus:'completed', CallDuration:'42', ...extra};
  const signed = createHmac('sha1',token).update(publicUrl+query+Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('base64');
  return statusHandler(new Request('https://internal/twilio-call-status'+query,{method:'POST', headers: signature === 'missing' ? {} : {'X-Twilio-Signature':signature==='valid'?signed:signature}, body:new URLSearchParams(params)}));
}
reset();
for (const signature of ['missing','invalid']) { assert.equal((await request({},signature)).status,403); assert.equal(writes,0); assert.equal(apiCalls,0); }
assert.equal((await request({CallSid:child},'invalid')).status,403); assert.equal(apiCalls,0);
assert.equal((await request({CallSid:'../../evil'})).status,400);
assert.equal((await request()).status,200); assert.equal(rows[0].duration_sec,42); assert.ok(rows[0].ended_at);
reset(); assert.equal((await request({CallSid:child})).status,200); assert.equal(apiCalls,1); assert.equal(writes,1);
reset(); assert.equal((await request({CallSid:child,DialCallSid:sid},'valid','?event=status')).status,200); assert.equal(apiCalls,0); assert.equal(writes,1);
const recording = `https://api.twilio.com/2010-04-01/Accounts/${account}/Recordings/RE${'3'.repeat(32)}`;
const badUrls = ['https://attacker.example/audio', recording.replace('https:','http:'), recording.replace('api.twilio.com','api.twilio.com.evil.test'), recording.replace(account,'AC'+'b'.repeat(32)), recording.replace('api.twilio.com','api.twilio.com:8443'), recording.replace('api.twilio.com','user:pass@api.twilio.com'), recording+'/../../../../evil', 'invalid'];
for (const url of badUrls) { reset(); assert.equal((await request({RecordingSid:'REtest',RecordingUrl:url})).status,400); assert.equal(writes,0); }
reset(); assert.equal((await request({RecordingSid:'REtest',RecordingUrl:recording})).status,200); assert.equal(rows[0].recording_url,recording+'.mp3');
const recordingHandler = await load('supabase/functions/twilio-recording/index.ts',{...deps,userFromRequest:async()=>({id:'owner'}),CORS:{}, fetch:async(url,opts)=>{fetches++; assert.equal(opts.redirect,'error'); return new Response('audio');}});
for (const url of badUrls) { reset(); rows[0].recording_url=url; assert.equal((await recordingHandler(new Request('https://internal?call='+sid))).status,400); await assert.rejects(()=>shared.transcribeCallLog(service,rows[0]),/URL de grabación inválida/); assert.equal(fetches,0); }
reset(); rows[0].recording_url=recording+'.mp3'; assert.equal((await recordingHandler(new Request('https://internal?call='+sid))).status,200); assert.equal(fetches,1);
reset(); rows[0].recording_url=recording+'.mp3'; assert.equal(await shared.transcribeCallLog(service,rows[0]),'Transcripción local'); assert.equal(fetches,2); assert.equal(rows[0].transcript,'Transcripción local');
assert.match(sharedSource,/fetch\(log.recording_url, \{ redirect: 'error'/);
console.log('PASS: real HMAC signatures, unsigned/forged rejection, SID validation, parent/Dial resolution, legitimate status/recording callbacks, unsafe URL rejection at write and both readers, redirect blocking');

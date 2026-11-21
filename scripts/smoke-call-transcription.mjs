// Local only: real helper with mocked database, Twilio audio and OpenAI responses.
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
let key, mode, row, requests, logs, pending;
const account = 'AC' + 'a'.repeat(32);
const service = { from(table) {
  let patch;
  const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return q; }, update(p) { patch=p; return q; }, then(resolve) {
    if (patch && (mode === 'db-down' || (mode === 'save-fail' && patch.transcript))) return resolve({ error: { message: 'database unavailable' } });
    if (patch) Object.assign(row, patch);
    resolve({data: table === 'call_logs' ? row : table === 'twilio_connections' ? { account_sid: account } : { auth_token: 'private-token' }, error:null});
  } }; return q;
} };
const source = readFileSync('supabase/functions/_shared/twilio.ts','utf8').replace(/^import .*;$/mg,'').replace(/^export \{.*;$/mg,'');
const {code} = await transform(source,{loader:'ts',format:'cjs'});
const module = {exports:{}};
new Function('module','Deno','fetch','console','globalThis',code)(module,{env:{get:()=>key}},async url => {
  requests++;
  if (url.includes('api.twilio.com')) {
    if (mode === 'network') throw new Error('private-token');
    return new Response('fake audio',{status:mode === 'download' ? 403 : 200});
  }
  if (mode === 'invalid') return Response.json({error:{message:'secret-key'}},{status:401});
  if (mode === 'empty') return Response.json({text:''});
  return Response.json({text:'  Transcripción de prueba  '});
},{error: value=>logs.push(JSON.parse(value))},{EdgeRuntime:{waitUntil:p=>{pending=p;}}});
const {transcribeCallLog,background}=module.exports;
function reset(next) {
  mode=next; key=next === 'missing' ? undefined : 'fake-key'; requests=0; logs=[];
  row={id:'local-call',connection_id:'connection',recording_url:`https://api.twilio.com/2010-04-01/Accounts/${account}/Recordings/REtest.mp3`,transcript:null,extra:{direction:'inbound'}};
}
for (const [scenario,expected] of [['missing','configuration'],['invalid','openai'],['download','download'],['network','download'],['empty','openai'],['save-fail','save'],['db-down','save']]) {
  reset(scenario);
  background(transcribeCallLog(service,row)); await pending;
  assert.equal(row.transcript,null);
  assert.equal(logs[0].call_log_id,row.id); assert.equal(logs[0].code,expected);
  assert.ok(Date.parse(logs[0].timestamp));
  if (scenario === 'db-down') assert.ok(logs.some(l=>l.event==='call_transcription_error_persist_failed'));
  else { assert.equal(row.extra.transcript_error.code,expected); assert.equal(row.extra.direction,'inbound'); }
  assert.ok(!JSON.stringify(logs).includes('private-token')); assert.ok(!JSON.stringify(logs).includes('secret-key'));
  if (scenario==='missing') assert.equal(requests,0);
}
reset('invalid'); await assert.rejects(()=>transcribeCallLog(service,row));
assert.equal(row.extra.transcript_error.http_status,401);
mode='success'; assert.equal(await transcribeCallLog(service,row),'Transcripción de prueba');
assert.equal(row.transcript,'Transcripción de prueba'); assert.equal(row.extra.transcript_error,undefined); assert.equal(row.extra.direction,'inbound');
const before=requests; key=undefined; assert.equal(await transcribeCallLog(service,row),row.transcript); assert.equal(requests,before);
// Render the actual title cell to check visible errors, retry action and HTML escaping.
const calls=readFileSync('src/calls.js','utf8');
const expression=calls.match(/case 'title': return (.*);/)[1];
const render=new Function('r','esc','state',`return ${expression}`);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const dom=new JSDOM(render({id:'log',title:'Call',callSid:'sid',recording:true,transcriptError:{message:'<img src=x onerror=alert(1)>',timestamp:'2026-11-21T00:00:00Z'}},esc,{openTranscripts:new Set()}));
assert.match(dom.window.document.querySelector('[role=status]').textContent,/Transcripción fallida/);
assert.equal(dom.window.document.querySelector('[data-transcribe]').textContent,'Reintentar transcripción');
assert.equal(dom.window.document.querySelector('img'),null);
assert.match(calls,/recording_url,transcript,extra/);
console.log('PASS: missing/invalid key, download/network/empty response, database failures, background evidence, successful retry and cleanup, idempotency, UI error/retry/escaping. No remote services used.');

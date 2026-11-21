import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { createHmac, webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const account = 'AC' + 'a'.repeat(32), sid = 'SM' + 'b'.repeat(32), token = 'local-token';
const base = 'https://test.supabase.co';
const conn = { id: 'connection', user_id: 'user', account_sid: account, phone_number: '+15550000001', status: 'active' };
let handler, rows, apiResponse, apiFailure, onSend, dbFailure, calls, callback;
const Deno = { env: { get: () => base }, serve: f => { handler = f; } };
const service = { from(table) {
  let filters = [], patch, insertion, single = false;
  const q = {
    select() { return q; }, eq(k,v) { filters.push(r => r[k] === v); return q; },
    is(k,v) { return q.eq(k,v); }, in(k,v) { filters.push(r => v.includes(r[k])); return q; },
    or(v) { const expected = v.split('.eq.')[1]; filters.push(r => r.message_sid === null || r.message_sid === expected); return q; },
    update(v) { patch = v; return q; }, insert(v) { insertion = v; return q; },
    maybeSingle() { single = true; return q; }, single() { single = true; return q; },
    then(resolve) {
      if (dbFailure && (patch || insertion)) return resolve({ error: new Error('database unavailable') });
      const data = table === 'twilio_messages' ? rows : table === 'twilio_connections' ? [conn] : [{connection_id:conn.id,auth_token:token}];
      if (insertion) data.push({...insertion});
      const matches = data.filter(r => filters.every(f => f(r)));
      if (patch) matches.forEach(r => Object.assign(r,patch));
      resolve({data: single ? matches[0] || null : matches,error:null});
    },
  }; return q;
} };
async function moduleAt(path, deps = {}) {
  const source = readFileSync(path,'utf8').replace(/^import .*;$/mg,'').replace(/^export \{.*;$/mg,'');
  const {code} = await transform(source,{loader:'ts',format:'cjs'});
  const module = {exports:{}};
  new Function('module','Deno','crypto',...Object.keys(deps),code)(module,Deno,webcrypto,...Object.values(deps));
  return module.exports;
}
const shared = await moduleAt('supabase/functions/_shared/twilio.ts', {fetch: async(url,opts) => {
  calls++;
  assert.ok(opts.signal instanceof AbortSignal, 'Outgoing send must have a deadline');
  const form = new URLSearchParams(opts.body);
  callback = form.get('StatusCallback');
  assert.equal(form.get('To'),'+15550000002');
  assert.ok(callback.includes('/twilio-message-status?message_id='));
  if (apiFailure) throw apiFailure;
  if (onSend) await onSend();
  return Response.json(apiResponse.body,{status:apiResponse.status});
}});
const gmail = await moduleAt('supabase/functions/_shared/gmail.ts');
const state = await moduleAt('supabase/functions/_shared/twilio-message.ts');
const deps = {...shared,...state, handle:gmail.handle, serviceClient:()=>service,
  userFromRequest:async()=>({id:'user'}), requireEnv:()=>base, json:gmail.json, fail:gmail.fail};
await moduleAt('supabase/functions/twilio-send/index.ts',deps); const send = handler;
await moduleAt('supabase/functions/twilio-message-status/index.ts',deps); const status = handler;
function reset() { rows=[]; apiResponse={status:201,body:{sid,status:'queued'}}; apiFailure=onSend=dbFailure=null; calls=0; callback=''; }
const sendRequest = () => send(new Request(base,{method:'POST',body:JSON.stringify({to:'+15550000002',body:'local test'})}));
async function receipt(value, extra={}, signature='valid') {
  const params = {AccountSid:account,MessageSid:sid,MessageStatus:value,...extra};
  const signed = createHmac('sha1',token).update(callback+Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('base64');
  return status(new Request(callback,{method:'POST',headers: signature === 'missing' ? {} : {'X-Twilio-Signature':signature==='valid'?signed:signature},body:new URLSearchParams(params)}));
}
reset(); assert.equal((await sendRequest()).status,200); assert.equal(rows[0].message_sid,sid);
for (const signature of ['missing','invalid']) assert.equal((await receipt('delivered',{},signature)).status,403);
assert.equal((await receipt('sent',{AccountSid:'AC'+'c'.repeat(32)})).status,403);
assert.equal((await receipt('sent',{MessageSid:'SM'+'c'.repeat(32)})).status,403);
assert.equal((await receipt('unknown')).status,400);
assert.equal(rows[0].status,'queued');
assert.equal((await receipt('sent')).status,204); assert.equal(rows[0].status,'sent');
assert.equal((await receipt('delivered')).status,204); assert.equal(rows[0].status,'delivered');
await Promise.all(['queued','sent','delivered','failed'].map(s=>receipt(s)));
assert.equal(rows[0].status,'delivered'); assert.equal(rows.length,1);
for (const terminal of ['failed','undelivered']) {
  reset(); await sendRequest(); await receipt(terminal,{ErrorCode:'30003',ErrorMessage:'Unreachable destination'});
  assert.equal(rows[0].status,terminal); assert.match(rows[0].error,/30003.*Unreachable/);
  await receipt('sent'); assert.equal(rows[0].status,terminal);
}
// Callback can arrive before the Twilio REST response; that response cannot revert it.
reset(); onSend=async()=>{assert.equal(rows[0].message_sid,null); assert.equal((await receipt('delivered')).status,204);};
assert.equal((await (await sendRequest()).json()).status,'delivered'); assert.equal(rows[0].message_sid,sid);
reset(); apiResponse={status:400,body:{code:21608,message:'Unverified recipient'}};
assert.equal((await sendRequest()).status,502); assert.equal(rows[0].status,'failed'); assert.match(rows[0].error,/21608.*Unverified/); assert.equal(conn.status,'active');
reset(); apiFailure=new Error('Network disconnected'); await sendRequest(); assert.equal(rows[0].status,'failed'); assert.match(rows[0].error,/Network disconnected/);
reset(); apiFailure=new DOMException('Timed out','TimeoutError');
assert.equal((await sendRequest()).status,504); assert.equal(rows[0].status,'failed'); assert.match(rows[0].error,/timeout.*20 segundos/); assert.equal(calls,1);
// A late signed receipt resolves an ambiguous timeout and preserves the provider SID.
assert.equal((await receipt('delivered', {}, 'invalid')).status,403);
assert.equal(rows[0].status,'failed'); assert.equal(rows[0].message_sid,null);
assert.equal((await receipt('sent')).status,204);
assert.equal(rows[0].status,'sent'); assert.equal(rows[0].message_sid,sid); assert.equal(rows[0].error,null);
await receipt('delivered'); assert.equal(rows[0].status,'delivered');
// Provider failures remain terminal when further receipts arrive.
reset(); apiFailure=new DOMException('Timed out','TimeoutError'); await sendRequest();
await receipt('undelivered',{ErrorCode:'30003'});
assert.equal(rows[0].message_sid,sid); assert.match(rows[0].error,/30003/);
await receipt('sent'); assert.equal(rows[0].status,'undelivered'); assert.match(rows[0].error,/30003/);
// Exercise a genuinely hanging HTTP request with a short local deadline.
const hanging = await moduleAt('supabase/functions/_shared/twilio.ts', {fetch: async (_url, opts) => new Promise((_resolve, reject) => {
  opts.signal.addEventListener('abort', () => reject(opts.signal.reason), {once:true});
})});
const keepAlive = setTimeout(()=>{},1000);
try { await assert.rejects(hanging.twilio(account,token,'/Messages.json',{timeoutMs:10}), {name:'TimeoutError'}); }
finally { clearTimeout(keepAlive); }
// No send after a failed insert, and webhook write errors must surface as 500.
const originalError = console.error; console.error=()=>{};
try {
  reset(); dbFailure=true; assert.equal((await sendRequest()).status,500); assert.equal(calls,0);
  reset(); await sendRequest(); dbFailure=true; assert.equal((await receipt('delivered')).status,500); assert.equal(rows[0].status,'queued');
  dbFailure=false; assert.equal((await receipt('delivered')).status,204); assert.equal(rows[0].status,'delivered');
} finally { console.error=originalError; }
console.log('PASS: send, SID persistence, signed callbacks, errors with provider code, early/duplicate/out-of-order callbacks, account/SID isolation, database failures and retry (local mocks; no SMS sent).');

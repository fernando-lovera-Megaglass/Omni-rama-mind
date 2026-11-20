import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import assert from 'node:assert/strict';
const source = readFileSync('supabase/functions/twilio-incoming/index.ts', 'utf8').replace(/^import .*;$/m, '');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
let handler, rows, contacts, signature = true;
const conn = { id: 'connection', user_id: 'owner', account_sid: 'ACtest', phone_number: '+17867418743', incoming_forward_number: '+525555555555', status: 'active' };
function from(table) {
  let op, payload, filters = [];
  const q = { select() { return q; }, eq(k,v) { filters.push(r=>r[k]===v); return q; }, is(k,v) { filters.push(r=>r[k]===v); return q; }, in(k,v) { filters.push(r=>v.includes(r[k])); return q; }, order() { return q; }, range() { return q; }, insert(v) { op='insert'; payload=v; return q; }, update(v) { op='update'; payload=v; return q; }, maybeSingle() { return q; }, then(resolve,reject) { try {
    let data, error=null;
    if(table==='twilio_connections') data=filters.every(f=>f(conn)) ? conn : null;
    if(table==='contacts') data=contacts.filter(c=>filters.every(f=>f(c)));
    if(table==='call_logs') {
      if(op==='insert') { if(rows.some(r=>r.call_sid===payload.call_sid)) error={code:'23505'}; else rows.push({...payload}); }
      if(op==='update') rows.filter(r=>filters.every(f=>f(r))).forEach(r=>Object.assign(r,payload));
    }
    resolve({data,error});
  } catch(e) { reject(e); } } }; return q;
}
const Deno = { env: {get:()=> 'https://test.supabase.co'}, serve:f=>{handler=f;} };
new Function('Deno','handle','serviceClient','fail','authTokenOf','twilioSignatureValid','twiml','xmlEscape',code)(Deno,f=>f,()=>({from}),(m,s=400)=>new Response(m,{status:s}),async()=>'',async()=>signature,s=>new Response(`<Response>${s}</Response>`),s=>s.replaceAll('&','&amp;'));
const sid='CA'+'1'.repeat(32);
const base={AccountSid:'ACtest',CallSid:sid,From:'+527221234567',To:conn.phone_number};
const request=(p={},suffix='')=>handler(new Request('https://internal/twilio-incoming'+suffix,{method:'POST',body:new URLSearchParams({...base,...p})}));
const callback='?event=status&connection=connection&parent='+sid;
rows=[]; contacts=[{id:'contact',user_id:'owner',company_id:'company',phone:'(722) 123-4567',deleted_at:null}];
assert.match(await (await request()).text(), /<Number statusCallback=.*\+525555555555<\/Number>/);
assert.equal(rows[0].contact_id,'contact'); assert.equal(rows[0].company_id,'company'); assert.equal(rows[0].direction,'inbound');
await request(); assert.equal(rows.length,1);
await request({CallSid:'CA'+'2'.repeat(32),ParentCallSid:sid,CallStatus:'in-progress'},callback);
await request({CallStatus:'ringing'},callback); assert.equal(rows[0].status,'in-progress');
await request({CallStatus:'in-progress',DialCallStatus:'completed',DialCallDuration:'42'},callback);
await request({CallStatus:'ringing'},callback); assert.equal(rows[0].status,'completed'); assert.equal(rows[0].duration_sec,42);
signature=false;
const rowsBeforeRejection = structuredClone(rows);
const rejected = async (params = {}, suffix = '') => {
  const response = await request(params, suffix);
  return { status: response.status, body: await response.text() };
};
// Requests carry no signature header: known and unknown numbers must be indistinguishable.
const knownRejection = await rejected();
assert.deepEqual(knownRejection, { status: 403, body: 'Firma inválida' });
assert.deepEqual(await rejected({ To: '+19999999999' }), knownRejection);
assert.deepEqual(await rejected({ AccountSid: 'other' }), knownRejection);
assert.deepEqual(await rejected({}, callback), knownRejection);
assert.deepEqual(await rejected({}, callback.replace('connection=connection', 'connection=unknown')), knownRejection);
assert.deepEqual(rows, rowsBeforeRejection);
signature=true;
assert.equal((await request({AccountSid:'other'})).status,403);
assert.equal((await request({CallSid:'CA'+'3'.repeat(32)},callback)).status,403);
for(const status of ['busy','no-answer','failed','canceled']) { rows[0].status='ringing'; await request({DialCallStatus:status,CallDuration:'0'},callback); assert.equal(rows[0].status,status); assert.equal(rows[0].duration_sec,0); }
rows=[]; contacts=[]; await request({From:'anonymous'}); assert.equal(rows[0].contact_id,null);
rows=[]; conn.incoming_forward_number=conn.phone_number; assert.match(await (await request()).text(), /<Hangup\/>/); assert.equal(rows[0].status,'failed');
console.log('PASS: forwarding, association, duplicate delivery, monotonic callbacks, duration, indistinguishable unsigned rejections, signature/account/parent rejection, terminal outcomes, unknown caller, loop prevention');

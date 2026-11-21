// Local harness for supabase/functions/twilio-voice (same technique as test-twilio-incoming.mjs): the TwiML of an
// outbound browser call and of an inbound call must put the status callbacks on the nouns (<Number> / <Client>),
// not on <Dial> (where Twilio ignores them), and <Dial> must report its outcome through action=twilio-call-status.
// Also checks the call_logs insert of each direction. No network, no Twilio, no Supabase.
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import assert from 'node:assert/strict';

const source = readFileSync('supabase/functions/twilio-voice/index.ts', 'utf8').replace(/^import .*;$/m, '');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
let handler, rows, contacts;
const conn = { id: 'connection', user_id: 'owner', account_sid: 'ACtest', phone_number: '+17867418743', status: 'active' };
function from(table) {
  let op, payload, filters = [];
  const q = {
    select() { return q; }, eq(k, v) { filters.push((r) => r[k] === v); return q; }, is(k, v) { filters.push((r) => r[k] === v); return q; }, limit() { return q; }, maybeSingle() { return q; },
    insert(p) { op = 'insert'; payload = p; return q; },
    then(resolve) {
      let data = null;
      if (table === 'twilio_connections') data = filters.every((f) => f(conn)) ? conn : null;
      if (table === 'twilio_connection_secrets') data = { auth_token: 'token' };
      if (table === 'contacts') data = contacts.filter((c) => filters.every((f) => f(c)));
      if (table === 'call_logs' && op === 'insert') rows.push({ ...payload });
      resolve({ data, error: null });
    },
  };
  return q;
}
const Deno = { env: { get: () => 'https://test.supabase.co' }, serve: (f) => { handler = f; } };
const xmlEscape = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
new Function('Deno', 'handle', 'serviceClient', 'fail', 'twilioSignatureValid', 'twiml', 'xmlEscape', 'e164', code)(
  Deno, (f) => f, () => ({ from }), (m, s = 400) => new Response(m, { status: s }), async () => true, (inner) => new Response(`<Response>${inner}</Response>`, { headers: { 'Content-Type': 'text/xml' } }), xmlEscape, (raw) => raw,
);
const request = (p) => handler(new Request('https://internal/twilio-voice', { method: 'POST', headers: { 'X-Twilio-Signature': 'x' }, body: new URLSearchParams(p) }));
const STATUS = 'https://test.supabase.co/functions/v1/twilio-call-status';
const sid = 'CA' + '1'.repeat(32);

// ---- outbound from the browser ----
rows = []; contacts = [{ id: 7, user_id: 'owner', company_id: 3, phone: '+52 55 1234 5678', mobilephone: '', deleted_at: null }];
let xml = await (await request({ AccountSid: 'ACtest', CallSid: sid, From: 'client:omni-owner', To: '+525512345678', Record: '1' })).text();
assert.match(xml, /^<Response><Dial [^>]*><Number [^>]*>\+525512345678<\/Number><\/Dial><\/Response>$/, 'one <Dial> with one <Number>');
const dial = xml.match(/<Dial ([^>]*)>/)[1];
const number = xml.match(/<Number ([^>]*)>/)[1];
assert.ok(!/statusCallback/.test(dial), '<Dial> carries no statusCallback (Twilio ignores it there)');
assert.match(dial, new RegExp(`action="${STATUS}" method="POST"`), '<Dial action> reports the outcome to twilio-call-status');
assert.match(dial, /callerId="\+17867418743"/);
assert.match(dial, new RegExp(`record="record-from-answer-dual" recordingStatusCallback="${STATUS}"`), 'recording callback kept');
assert.match(number, new RegExp(`statusCallback="${STATUS}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`), '<Number> reports every leg event');
assert.equal(rows.length, 1);
assert.deepEqual([rows[0].direction, rows[0].status, rows[0].call_sid, rows[0].to_number, rows[0].contact_id, rows[0].company_id], ['outbound', 'initiated', sid, '+525512345678', '7', '3']);
// without Record the recording attributes are absent, the callbacks stay
rows = [];
xml = await (await request({ AccountSid: 'ACtest', CallSid: sid, From: 'client:omni-owner', To: '+525512345678' })).text();
assert.ok(!/record=/.test(xml) && /<Number statusCallback=/.test(xml) && /<Dial [^>]*action=/.test(xml));

// ---- inbound to the Twilio number: ring the browser ----
rows = [];
xml = await (await request({ AccountSid: 'ACtest', CallSid: sid, From: '+525512345678', To: conn.phone_number })).text();
assert.match(xml, /^<Response><Dial [^>]*><Client [^>]*>omni-owner<\/Client><\/Dial><\/Response>$/, 'one <Dial> with one <Client>');
const idial = xml.match(/<Dial ([^>]*)>/)[1];
const client = xml.match(/<Client ([^>]*)>/)[1];
assert.ok(!/statusCallback/.test(idial));
assert.match(idial, new RegExp(`answerOnBridge="true" timeout="30" action="${STATUS}" method="POST"`));
assert.match(client, new RegExp(`statusCallback="${STATUS}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`));
assert.deepEqual([rows[0].direction, rows[0].status, rows[0].from_number, rows[0].contact_id], ['inbound', 'ringing', '+525512345678', '7']);

// ---- unknown number: polite hangup, nothing logged ----
rows = [];
xml = await (await request({ AccountSid: 'ACtest', CallSid: sid, From: '+525512345678', To: '+10000000000' })).text();
assert.match(xml, /Número no configurado en Omni/);
assert.equal(rows.length, 0);
console.log('PASS: twilio-voice puts the status callbacks on <Number>/<Client> and the outcome on <Dial action> for outbound and inbound calls; recording attributes kept; call_logs inserts per direction.');

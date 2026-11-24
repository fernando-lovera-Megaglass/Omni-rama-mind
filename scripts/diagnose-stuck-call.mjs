// Read-only live diagnosis. Never prints credentials, phone numbers or TwiML bodies.
import { readFileSync } from 'node:fs';
import { runSql, PROJECT } from './mgmt-sql.mjs';
const sid = process.argv[2];
if (!/^CA[0-9a-f]{32}$/i.test(sid || '')) throw new Error('Uso: node scripts/diagnose-stuck-call.mjs <CallSid>');
const [row] = await runSql(`select call_sid, connection_id, status, created_at from call_logs where call_sid='${sid}'`);
if (!row) throw new Error('Llamada no encontrada');
const [conn] = await runSql(`select c.account_sid, s.auth_token, s.twiml_app_sid from twilio_connections c join twilio_connection_secrets s on s.connection_id=c.id join call_logs l on l.connection_id=c.id where l.call_sid='${sid}'`);
async function get(url, authorization) {
  const r = await fetch(url, { headers: { Authorization: authorization }, redirect: 'error' });
  if (!r.ok) throw new Error(`Read-only API HTTP ${r.status}`);
  return r.json();
}
const auth = 'Basic ' + Buffer.from(conn.account_sid + ':' + conn.auth_token).toString('base64');
const base = `https://api.twilio.com/2010-04-01/Accounts/${conn.account_sid}`;
const call = await get(`${base}/Calls/${sid}.json`, auth);
const app = await get(`${base}/Applications/${conn.twiml_app_sid}.json`, auth);
const events = await get(`${base}/Calls/${sid}/Events.json`, auth);
const management = 'Bearer ' + readFileSync(new URL('../.supabase-mgmt-token', import.meta.url), 'utf8').trim();
const functions = await get(`https://api.supabase.com/v1/projects/${PROJECT}/functions`, management);
const logsUrl = new URL(`https://api.supabase.com/v1/projects/${PROJECT}/analytics/endpoints/logs`);
const start = new Date(row.created_at).getTime();
logsUrl.searchParams.set('iso_timestamp_start', new Date(start - 5*60000).toISOString());
logsUrl.searchParams.set('iso_timestamp_end', new Date(start + 15*60000).toISOString());
logsUrl.searchParams.set('sql', "select timestamp, event_message from logs where source = 'function_edge_logs' and (event_message like '%/twilio-call-status%' or event_message like '%/twilio-voice%') order by timestamp limit 100");
const logs = await get(logsUrl, management);
const counts = await runSql(`select now() as measured_at,
 (select count(*) from call_logs where status in ('ringing','initiated') and created_at < now()-interval '1 hour') as stuck_calls,
 (select count(*) from call_logs where status in ('queued','initiated','ringing','in-progress') and created_at < now()-interval '1 hour') as all_old_transient_calls,
 (select count(*) from twilio_messages where status='queued' and created_at < now()-interval '1 hour') as all_old_queued_messages`);
console.log(JSON.stringify({ measured_at:new Date().toISOString(), database:row,
 provider:{status:call.status,duration:call.duration,start_time:call.start_time,end_time:call.end_time},
 application:{voice_url:app.voice_url,status_callback:app.status_callback},
 functions:functions.filter(f=>['twilio-voice','twilio-call-status'].includes(f.slug)).map(({slug,version,verify_jwt,updated_at})=>({slug,version,verify_jwt,updated_at})),
 events:events.events.map(e=>{const xml=e.response?.response_body || ''; return {url:e.request?.url,response_code:e.response?.response_code,
 dial_has_status_callback:/<Dial\b[^>]*\sstatusCallback=/.test(xml),dial_has_action:/<Dial\b[^>]*\saction=/.test(xml),
 noun_has_status_callback:/<(Number|Client)\b[^>]*\sstatusCallback=/.test(xml)};}),
 events_has_next_page:!!events.next_page_uri, logs, counts },null,2));

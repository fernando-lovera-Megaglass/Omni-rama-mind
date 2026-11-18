// Una sola vez: las llamadas viejas quedaron en «initiated» porque los callbacks del <Dial>
// traían el SID del tramo hijo. Les preguntamos a Twilio su estado real y actualizamos.
import { runSql } from './mgmt-sql.mjs';

const [{ account_sid, auth_token }] = await runSql("select c.account_sid, s.auth_token from twilio_connections c join twilio_connection_secrets s on s.connection_id = c.id limit 1");
const auth = 'Basic ' + Buffer.from(`${account_sid}:${auth_token}`).toString('base64');

const stuck = await runSql("select id, call_sid, started_at from call_logs where status in ('initiated','ringing','in-progress','queued') and started_at < now() - interval '15 minutes'");
console.log(`${stuck.length} llamadas atascadas`);

for (const row of stuck) {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Calls/${row.call_sid}.json`, { headers: { Authorization: auth } });
    if (!res.ok) { console.log(row.call_sid, '→ Twilio', res.status); continue; }
    const call = await res.json();
    const dur = Number(call.duration || 0);
    await runSql(`update call_logs set status = '${call.status}', ${dur > 0 ? `duration_sec = ${dur},` : ''} ended_at = coalesce(ended_at, '${call.end_time || call.date_updated}') where id = '${row.id}'`);
    console.log(row.call_sid, '→', call.status, dur ? `${dur}s` : '');
  } catch (e) { console.log(row.call_sid, 'error:', e.message); }
}
console.log('listo');

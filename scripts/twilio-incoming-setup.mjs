// Usage: node scripts/twilio-incoming-setup.mjs <Twilio +number> <personal +number>
// Deploy twilio-incoming and apply supabase/twilio-incoming.sql first.
import { runSql, PROJECT } from './mgmt-sql.mjs';
const [number, target] = process.argv.slice(2);
if (![number, target].every(n => /^\+[1-9]\d{7,14}$/.test(n || '')) || number === target) {
  throw new Error('Indica el número Twilio y un destino personal distinto, ambos en E.164.');
}
const rows = await runSql(`select c.id,c.account_sid,c.incoming_forward_number,s.auth_token from twilio_connections c join twilio_connection_secrets s on s.connection_id=c.id where c.phone_number='${number}' and c.status='active'`);
if (rows.length !== 1) throw new Error('Se requiere una única conexión activa para ese número.');
const c = rows[0];
const url = `https://${PROJECT}.supabase.co/functions/v1/twilio-incoming`;
const auth = 'Basic ' + Buffer.from(`${c.account_sid}:${c.auth_token}`).toString('base64');
async function tw(path, form) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.account_sid}${path}`, {
    method: form ? 'POST' : 'GET', headers: { Authorization: auth, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `Twilio ${res.status}`);
  return body;
}
const nums = await tw(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`);
const num = nums.incoming_phone_numbers?.find(n => n.phone_number === number);
if (!num?.capabilities?.voice) throw new Error('Número sin capacidad de voz.');
await runSql(`update twilio_connections set incoming_forward_number='${target}',updated_at=now() where id='${c.id}'`);
try {
  // VoiceApplicationSid overrides VoiceUrl; clear it only on this phone number, not the outbound app.
  await tw(`/IncomingPhoneNumbers/${num.sid}.json`, { VoiceUrl: url, VoiceMethod: 'POST', VoiceApplicationSid: '' });
  const checked = await tw(`/IncomingPhoneNumbers/${num.sid}.json`);
  if (checked.voice_url !== url || checked.voice_method !== 'POST' || checked.voice_application_sid) throw new Error('No se confirmó el webhook.');
} catch (error) {
  await tw(`/IncomingPhoneNumbers/${num.sid}.json`, { VoiceUrl: num.voice_url || '', VoiceMethod: num.voice_method || 'POST', VoiceApplicationSid: num.voice_application_sid || '' });
  const old = c.incoming_forward_number;
  if (old && !/^\+[1-9]\d{7,14}$/.test(old)) throw error;
  await runSql(`update twilio_connections set incoming_forward_number=${old ? `'${old}'` : 'null'} where id='${c.id}'`);
  throw error;
}
console.log(`Verificado: ${number} → ${target}; webhook POST ${url}`);

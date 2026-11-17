// Crea en Twilio (vía REST API) lo necesario para llamar desde el navegador:
// una API Key (firma los tokens del navegador) y una TwiML App (dice qué webhook
// contesta al llamar). Guarda todo en twilio_connection_secrets. Uso:
//   node scripts/twilio-voice-setup.mjs
import { readFileSync } from 'node:fs';

const MGMT = 'https://api.supabase.com/v1/projects/xysgvxnieigpaxtmxiui/database/query';
const token = readFileSync(new URL('../.supabase-mgmt-token', import.meta.url), 'utf8').trim();
const sql = async (query) => {
  const r = await fetch(MGMT, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j;
};

const [conn] = await sql(`select c.id, c.account_sid, c.phone_number, s.auth_token, s.api_key_sid, s.twiml_app_sid from twilio_connections c join twilio_connection_secrets s on s.connection_id = c.id limit 1`);
if (!conn) throw new Error('No hay conexión de Twilio.');
const auth = 'Basic ' + Buffer.from(`${conn.account_sid}:${conn.auth_token}`).toString('base64');
const tw = async (path, form) => {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${conn.account_sid}${path}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || `Twilio ${r.status}`);
  return j;
};

let keySid = conn.api_key_sid;
let keySecret = null;
if (!keySid) {
  const k = await tw('/Keys.json', { FriendlyName: 'Omni CRM (navegador)' });
  keySid = k.sid;
  keySecret = k.secret; // solo se muestra UNA vez; hay que guardarlo ya
  console.log('API Key creada:', keySid);
} else {
  console.log('API Key ya existía:', keySid);
}

const voiceUrl = 'https://xysgvxnieigpaxtmxiui.supabase.co/functions/v1/twilio-voice';
let appSid = conn.twiml_app_sid;
if (!appSid) {
  const a = await tw('/Applications.json', { FriendlyName: 'Omni CRM', VoiceUrl: voiceUrl, VoiceMethod: 'POST' });
  appSid = a.sid;
  console.log('TwiML App creada:', appSid, '→', voiceUrl);
} else {
  console.log('TwiML App ya existía:', appSid);
}

if (keySecret) {
  const esc = (s) => s.replace(/'/g, "''");
  await sql(`update twilio_connection_secrets set api_key_sid = '${esc(keySid)}', api_key_secret = '${esc(keySecret)}', twiml_app_sid = '${esc(appSid)}', updated_at = now() where connection_id = '${conn.id}'`);
  console.log('Guardado en twilio_connection_secrets ✓ (el secreto jamás sale al navegador)');
} else if (appSid && !conn.twiml_app_sid) {
  await sql(`update twilio_connection_secrets set twiml_app_sid = '${appSid}', updated_at = now() where connection_id = '${conn.id}'`);
  console.log('TwiML App guardada ✓');
}
console.log('Listo. Número de salida:', conn.phone_number);

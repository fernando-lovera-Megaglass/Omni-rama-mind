import { supabase } from './supabaseClient.js';
import { callFunction, startConnect } from './gmail.js';
export const CATALOG = [
 {id:'gmail',name:'Gmail',kind:'Correo',object:'contacts',scope:'https://www.googleapis.com/auth/gmail.readonly',description:'Correos enviados y recibidos de los últimos 90 días → cronología de contactos. Lotes de hasta 25 correos; continúa hasta terminar.'},
 {id:'gcal',name:'Google Calendar',kind:'Calendario',object:'tasks',scope:'https://www.googleapis.com/auth/calendar.events.readonly',description:'Calendario principal → tareas. Una tarea por evento o serie recurrente, con excepciones separadas. Cancelaciones marcadas como completadas. Fechas de día completo conservadas en UTC. Lotes de hasta 100 eventos.'},
 ...[['whatsapp','WhatsApp Business'],['outlook','Outlook'],['mailchimp','Mailchimp'],['zapier','Zapier'],['quickbooks','QuickBooks']].map(([id,name])=>({id,name,kind:'Disponible próximamente',object:''})),
];
let client=supabase;
export const setAppSyncClient=c=>{client=c;};
export async function loadApps() {
 if(!client) throw new Error('Configura Supabase e inicia sesión para consultar conexiones reales.');
 const {data:{user},error:authError}=await client.auth.getUser();
 if(authError || !user) throw new Error('Inicia sesión para consultar tus aplicaciones.');
 const [accounts,states]=await Promise.all([
  client.from('connected_accounts').select('id,email,status,scopes,last_error').eq('provider','gmail').eq('user_id',user.id),
  client.from('app_sync_state').select('*').eq('user_id',user.id),
 ]);
 if(accounts.error) throw new Error('No se pudieron consultar las cuentas conectadas. Vuelve a intentar.');
 if(states.error) throw new Error('Sincronización no preparada: falta la migración app-sync.sql o acceso a su estado.');
 return CATALOG.flatMap(app=>{
  if(!app.scope) return [{...app,key:app.id}];
  const connected=(accounts.data||[]).filter(a=>a.status!=='disabled' && a.scopes?.includes(app.scope));
  if(!connected.length) return [{...app,key:app.id}];
  return connected.map(a=>({...app,key:`${app.id}:${a.id}`,accountId:a.id,email:a.email,connected:true,accountStatus:a.status,accountError:a.last_error,sync:(states.data||[]).find(s=>s.account_id===a.id && s.app===app.id)}));
 });
}
export const connectApp=app=>startConnect({app});
export const syncApp=app=>callFunction('app-sync',{body:{app:app.id,accountId:app.accountId}});

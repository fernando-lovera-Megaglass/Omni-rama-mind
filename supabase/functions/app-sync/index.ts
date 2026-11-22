// Manual, resumable provider pages. Tokens stay server-side; every write is atomic.
import { handle, userFromRequest, serviceClient, accountFor, withAccount, gmail, headerOf, extractBodies, htmlToText, json, fail, GmailError } from '../_shared/gmail.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from '../_shared/gmail.ts';

Deno.serve(handle(async (req) => {
 if (req.method !== 'POST') return fail('Usa POST',405);
 const user=await userFromRequest(req);
 const {app,accountId}=await req.json();
 if (!['gmail','gcal'].includes(app)) return fail('Aplicación no compatible');
 // Use the caller's RLS permissions for CRM visibility, never service-role contact searches.
 const scoped=createClient(requireEnv('SUPABASE_URL'),requireEnv('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:req.headers.get('Authorization')!}}});
 const {data:member,error:memberError}=await scoped.rpc('is_team_member');
 if(memberError || !member) return fail('Se requiere acceso activo al equipo del CRM.',403);
 const db=serviceClient();
 const account=await accountFor(db,user.id,accountId);
 if(!account || account.status==='disabled') return fail('Conecta o reactiva tu cuenta de Google.',409);
 const scope=app==='gcal'?'https://www.googleapis.com/auth/calendar.events.readonly':'https://www.googleapis.com/auth/gmail.readonly';
 if(!account.scopes?.includes(scope)) return fail('Falta permiso de lectura. Vuelve a autorizar esta aplicación con Google.',409);
 const {data:s,error:se}=await db.from('app_sync_state').select('*').eq('account_id',account.id).eq('app',app).maybeSingle();
 if(se) return fail('No está preparada la sincronización: falta aplicar app-sync.sql.',503);
 try {
  const result=await withAccount(db,account,async token=>{
   let cursor=s?.cursor || {};
   let fetched=0;
   const rows:Record<string,unknown>[]=[];
   if(app==='gcal') {
    const params=new URLSearchParams({maxResults:'100',showDeleted:'true',singleEvents:'false'});
    if(cursor.sync) params.set('syncToken',cursor.sync);
    if(cursor.page) params.set('pageToken',cursor.page);
    let res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,{headers:{Authorization:`Bearer ${token}`}});
    if(res.status===410) { cursor={}; params.delete('syncToken'); params.delete('pageToken'); res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,{headers:{Authorization:`Bearer ${token}`}}); }
    const body=await res.json();
    if(!res.ok) throw new GmailError(body.error?.message || 'Google Calendar rechazó la consulta. Revisa los permisos y que la API esté habilitada.','calendar',res.status);
    fetched=(body.items || []).length;
    for(const e of body.items || []) {
     const cancelled=e.status==='cancelled';
     const due=e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
     rows.push({key:e.id,name:cancelled?'[Cancelado] '+(e.summary || 'Evento de Calendar'):(e.summary || 'Evento sin título'),due,cancelled,
      extra:{source:'gcal',googleEventId:e.id,calendarId:'primary',notes:e.description || '',location:e.location || '',start:e.start || null,end:e.end || null,recurrence:e.recurrence || [],cancelled,htmlLink:e.htmlLink || ''}});
    }
    cursor={sync:body.nextSyncToken || cursor.sync || null,page:body.nextPageToken || null};
   } else {
    // Fixed lower bound across pages; each fresh scan revisits 90 days for new contact matches.
    const since=cursor.since || Math.floor((Date.now()-90*86400000)/1000);
    const params=new URLSearchParams({maxResults:'25',q:`after:${since} -in:trash -in:spam -in:drafts`});
    if(cursor.page) params.set('pageToken',cursor.page);
    const listing=await gmail(token,`messages?${params}`) as any;
    fetched=(listing.messages || []).length;
    for(const item of listing.messages || []) {
     const m=await gmail(token,`messages/${encodeURIComponent(item.id)}?format=full`) as any;
     const headers=m.payload?.headers || [];
     const from=headerOf(headers,'From');
     const to=headerOf(headers,'To');
     const cc=headerOf(headers,'Cc');
     const emails=[...new Set((`${from} ${to} ${cc}`.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(e=>e.toLowerCase()))].filter(e=>e!==account.email.toLowerCase());
     const contacts:any[]=[];
     // Equality filters, not interpolated PostgREST OR expressions. RLS limits matches.
     for(const email of emails) {
      const {data,error}=await scoped.from('contacts').select('id,email').ilike('email',email.replace(/[%_\\]/g,'\\$&')).is('deleted_at',null);
      if(error) throw error;
      contacts.push(...(data||[]));
     }
     const bodies=extractBodies(m.payload);
     for(const c of contacts) rows.push({key:`${m.id}:${c.id}`,contact_id:c.id,text:bodies.text || htmlToText(bodies.html) || String(m.snippet || ''),who:from,
      at:new Date(Number(m.internalDate)).toISOString(),extra:{source:'gmail',gmailId:m.id,accountId:account.id,threadId:m.threadId,subject:headerOf(headers,'Subject'),body:bodies.text || htmlToText(bodies.html),from,to,cc,direction:(m.labelIds||[]).includes('SENT')?'outbound':'inbound'}});
    }
    cursor=listing.nextPageToken?{page:listing.nextPageToken,since}:{};
   }
   const {data,error}=await db.rpc('commit_app_sync',{p_account:account.id,p_app:app,p_user:user.id,p_version:s?.version || 0,p_rows:rows,p_fetched:fetched,p_cursor:cursor});
   if(error) throw error;
   return data;
  });
  return json({ok:true,...result});
 } catch(e) {
  // Do not overwrite cursor/counts/last success on failure or a concurrency conflict.
  if(s) await db.from('app_sync_state').update({last_error:(e as Error).message}).eq('account_id',account.id).eq('app',app).eq('version',s.version);
  else await db.from('app_sync_state').insert({account_id:account.id,app,user_id:user.id,last_error:(e as Error).message});
  throw e;
 }
}));

-- Requires gmail.sql, schema.sql, activities.sql, auth.sql and rls_team.sql.
-- Apply locally first. No production migration is performed by this change.
create table if not exists public.app_sync_state (
 account_id uuid not null references public.connected_accounts(id) on delete cascade,
 app text not null check (app in ('gmail','gcal')),
 user_id uuid not null references auth.users(id),
 version integer not null default 0,
 cursor jsonb not null default '{}',
 last_sync_at timestamptz,
 last_error text,
 fetched integer,
 created integer,
 updated integer,
 primary key(account_id,app)
);
create table if not exists public.app_sync_records (
 account_id uuid not null references public.connected_accounts(id) on delete cascade,
 app text not null,
 external_id text not null,
 target_id bigint not null,
 payload jsonb not null,
 primary key(account_id,app,external_id)
);
alter table public.app_sync_state enable row level security;
alter table public.app_sync_records enable row level security;
drop policy if exists "owner reads sync" on public.app_sync_state;
create policy "owner reads sync" on public.app_sync_state for select to authenticated using(user_id=auth.uid());
-- Writes and mapping rows are service-role only. One transaction per provider page:
-- data, deduplication mapping, counts and continuation cursor commit together.
create or replace function public.commit_app_sync(p_account uuid, p_app text, p_user uuid,
 p_version integer, p_rows jsonb, p_fetched integer, p_cursor jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sync_state; r jsonb; old app_sync_records; target bigint; n integer:=0; u integer:=0;
begin
 if p_app not in ('gmail','gcal') or not exists(select 1 from connected_accounts where id=p_account and user_id=p_user and status<>'disabled') then
  raise exception 'Cuenta no disponible';
 end if;
 insert into app_sync_state(account_id,app,user_id) values(p_account,p_app,p_user) on conflict do nothing;
 select * into s from app_sync_state where account_id=p_account and app=p_app for update;
 if s.version<>p_version then raise exception 'Otra sincronización avanzó. Vuelve a intentar.'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select * into old from app_sync_records where account_id=p_account and app=p_app and external_id=r->>'key';
  if found and old.payload=r then continue; end if;
  target:=old.target_id;
  if p_app='gcal' then
   if target is null and r->>'cancelled'='true' then continue; end if;
   if target is null then
    insert into tasks(name,type,status,due,extra,user_id) values(r->>'name','Tarea','todo',nullif(r->>'due','')::timestamptz,r->'extra',p_user) returning id into target;
    n:=n+1;
   else
    update tasks set name=coalesce(r->>'name',name), due=coalesce(nullif(r->>'due','')::timestamptz,due),
     status=case when r->>'cancelled'='true' then 'done' when old.payload->>'cancelled'='true' then 'todo' else status end,
     extra=extra || (r->'extra') where id=target;
    if not found then raise exception 'La tarea sincronizada ya no existe'; end if;
    u:=u+1;
   end if;
  else
   if target is null then
    insert into activities(type,record_type,record_id,text,who,occurred_at,extra,user_id)
     values('email','contacts',(r->>'contact_id')::bigint,r->>'text',r->>'who',(r->>'at')::timestamptz,r->'extra',p_user) returning id into target;
    n:=n+1;
   else
    update activities set text=r->>'text',extra=r->'extra' where id=target;
    if not found then raise exception 'La actividad sincronizada ya no existe'; end if;
    u:=u+1;
   end if;
  end if;
  insert into app_sync_records values(p_account,p_app,r->>'key',target,r)
   on conflict(account_id,app,external_id) do update set target_id=excluded.target_id,payload=excluded.payload;
 end loop;
 update app_sync_state set version=version+1,cursor=p_cursor,last_sync_at=now(),last_error=null,
 fetched=p_fetched,created=n,updated=u where account_id=p_account and app=p_app;
 return jsonb_build_object('fetched',p_fetched,'created',n,'updated',u,'more',coalesce(p_cursor->>'page','')<>'');
end $$;
revoke all on function public.commit_app_sync(uuid,text,uuid,integer,jsonb,integer,jsonb) from public,anon,authenticated;
grant execute on function public.commit_app_sync(uuid,text,uuid,integer,jsonb,integer,jsonb) to service_role;

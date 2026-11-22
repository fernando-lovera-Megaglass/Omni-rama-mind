// Real database check, rolled back. Does not replace the authenticated list UI test.
import { runSql } from './mgmt-sql.mjs';
await runSql(`begin;
create temporary table ticket_trash_probe(id bigint) on commit drop;
with inserted as (
  insert into public.tickets(id,name,pipeline,status)
  values (-202611220601,'QA soft delete transaction','QA pipeline','QA status') returning id
) insert into ticket_trash_probe select id from inserted;
update public.tickets set deleted_at=now() where id in (select id from ticket_trash_probe);
do $$ begin
  if not exists(select 1 from public.tickets where id in (select id from ticket_trash_probe) and deleted_at is not null)
    then raise exception 'Soft deleted row missing'; end if;
  if exists(select 1 from public.tickets where id in (select id from ticket_trash_probe) and deleted_at is null)
    then raise exception 'Deleted row in active query'; end if;
end $$;
update public.tickets set deleted_at=null where id in (select id from ticket_trash_probe);
do $$ begin
  if not exists(select 1 from public.tickets where id in (select id from ticket_trash_probe)
    and deleted_at is null and pipeline='QA pipeline' and status='QA status')
    then raise exception 'Restore lost ticket or pipeline/status'; end if;
end $$;
rollback;`);
console.log('SQL OK: row retained with deleted_at, excluded from active query, restored with original pipeline/status. Transaction rolled back. UI/RLS not tested.');

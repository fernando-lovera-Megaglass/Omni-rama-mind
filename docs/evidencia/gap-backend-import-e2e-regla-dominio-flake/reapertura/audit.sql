select
 (select count(*)::int from public.activities a where record_type = 'companies' and not exists (select 1 from public.companies c where c.id = a.record_id)) as orphan_company_activities,
 (select count(*)::int from public.activities where id in (522,868,1045)) as historical_activities,
 (select json_agg(json_build_object('id',id,'domain',domain,'deleted_at',deleted_at::text) order by id) from public.companies where id in (47,56)) as preserved_trash,
 (select count(*)::int from public.companies where id not in (47,56) and (name like 'SMOKE %' or domain like 'smoke-%')) as other_smoke_companies,
 (select count(*)::int from public.contacts where name like 'SMOKE %' or email like 'smoke.%') as smoke_contacts;

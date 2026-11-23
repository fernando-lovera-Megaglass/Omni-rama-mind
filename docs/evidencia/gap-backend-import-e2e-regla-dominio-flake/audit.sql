select
 (select count(*) from public.companies where deleted_at is null and (name ilike 'smoke%' or domain ilike 'smoke-%' or extra->>'hs_created_from_email' ilike 'smoke.%')) as active_smoke_companies,
 (select count(*) from public.contacts where deleted_at is null and (name ilike 'smoke%' or email ilike 'smoke.%' or email ilike '%@smoke-%')) as active_smoke_contacts,
 (select count(*) from public.companies where (name ilike 'smoke%' or domain ilike 'smoke-%' or extra->>'hs_created_from_email' ilike 'smoke.%') and id not in (47,56)) as other_physical_smoke_companies,
 (select count(*) from public.contacts where name ilike 'smoke%' or email ilike 'smoke.%' or email ilike '%@smoke-%') as physical_smoke_contacts,
 (select json_agg(json_build_object('id',id,'domain',domain,'deleted_at',deleted_at) order by id) from public.companies where id in (47,56)) as historical_trash;

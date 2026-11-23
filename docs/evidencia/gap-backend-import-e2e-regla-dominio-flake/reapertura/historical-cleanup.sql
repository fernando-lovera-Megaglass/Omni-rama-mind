begin;
delete from public.activities
where record_type = 'companies' and type = 'system'
and ((id = 522 and record_id = 47) or (id = 868 and record_id = 56) or (id = 1045 and record_id = 65))
returning id, record_type, record_id;
commit;

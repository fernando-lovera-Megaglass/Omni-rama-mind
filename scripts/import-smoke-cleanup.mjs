// Cleanup is scoped by run IDs and stamp, including soft-deleted rows and domain-created companies.
import { lit } from './smoke-live.mjs';
export async function cleanupImportSmoke({ sql, data, E, stamp, log }) {
  await data.dbIdle();
  const ids = E.importHistory().filter(e => String(e.name || '').includes(stamp)).map(e => String(e.id));
  const importMatch = ids.length ? `string_to_array(coalesce(extra->>'hs_import_ids', ''), ';') && ARRAY[${ids.map(lit).join(',')}]::text[]` : 'false';
  const contacts = `(${importMatch} or email like ${lit(`smoke.${stamp}.%`)} or email like ${lit(`%@smoke-${stamp}-%`)})`;
  const companies = `(${importMatch} or domain like ${lit(`smoke-${stamp}-%`)} or extra->>'hs_created_from_email' like ${lit(`smoke.${stamp}.%`)})`;
  await sql(`begin;
    create temporary table smoke_contacts on commit drop as select id from public.contacts where ${contacts};
    create temporary table smoke_companies on commit drop as select id from public.companies where ${companies};
    delete from public.contact_companies where contact_id in (select id from smoke_contacts) or company_id in (select id from smoke_companies);
    delete from public.activities where (record_type = 'contacts' and record_id in (select id from smoke_contacts)) or (record_type = 'companies' and record_id in (select id from smoke_companies));
    delete from public.contacts where id in (select id from smoke_contacts);
    delete from public.companies where id in (select id from smoke_companies);
    delete from public.custom_properties where name = 'imp_zona_comercial';
    commit;`);
  const remaining = await sql(`select (select count(*) from public.contacts where ${contacts})::int as contacts, (select count(*) from public.companies where ${companies})::int as companies`);
  if (remaining[0].contacts || remaining[0].companies) throw new Error(`Residuos del import: ${JSON.stringify(remaining)}`);
  log(`limpieza extra verificada: ${JSON.stringify(remaining[0])}; imports=${ids.join(',')}`);
}

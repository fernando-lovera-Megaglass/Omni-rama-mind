// Cleanup is scoped by run IDs and stamp, including soft-deleted rows and domain-created companies.
import { lit } from './smoke-live.mjs';
export async function cleanupImportSmoke({ sql, data, E, stamp, log }) {
  // dbIdle drains until writeQueue keeps the same tail, including nested activity writes.
  await data.dbIdle();
  const ids = E.importHistory().filter(e => String(e.name || '').includes(stamp)).map(e => String(e.id));
  const importMatch = ids.length ? `string_to_array(coalesce(extra->>'hs_import_ids', ''), ';') && ARRAY[${ids.map(lit).join(',')}]::text[]` : 'false';
  const contacts = `(${importMatch} or email like ${lit(`smoke.${stamp}.%`)} or email like ${lit(`%@smoke-${stamp}-%`)})`;
  const companies = `(${importMatch} or domain like ${lit(`smoke-${stamp}-%`)} or extra->>'hs_created_from_email' like ${lit(`smoke.${stamp}.%`)})`;
  // Keep IDs outside the transaction: deleted parents cannot identify orphan activities later.
  // The ledger also covers records already physically removed by Undo.
  const types = ['contacts', 'companies', 'deals', 'tickets', 'tasks'];
  const targets = {};
  for (const type of types) {
    const ledger = ids.flatMap(id => E.importDetail(id)?.createdIds?.[type] || []);
    const match = type === 'contacts' ? contacts : type === 'companies' ? companies : importMatch;
    const rows = await sql(`select id from public.${type} where ${match} or name like ${lit(`SMOKE %${stamp}%`)}`);
    targets[type] = [...new Set([...ledger, ...rows.map(r => r.id)].map(Number))];
    if (targets[type].some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid cleanup ID');
  }
  const inIds = type => targets[type].length ? targets[type].join(',') : 'NULL';
  const activityMatch = types.map(type => `(record_type = ${lit(type)} and record_id in (${inIds(type)}))`).join(' or ');
  await data.dbIdle();
  await sql(`begin;
    delete from public.contact_companies where contact_id in (${inIds('contacts')}) or company_id in (${inIds('companies')});
    delete from public.activities where ${activityMatch};
    delete from public.deal_line_items where deal_id in (${inIds('deals')});
    ${['tasks', 'tickets', 'deals', 'contacts', 'companies'].map(type => `delete from public.${type} where id in (${inIds(type)});`).join('\n')}
    delete from public.custom_properties where name = 'imp_zona_comercial';
    commit;`);
  await data.dbIdle();
  const remaining = await sql(`select
    ${types.map(type => `(select count(*) from public.${type} where id in (${inIds(type)}))::int as ${type}`).join(',')},
    (select count(*) from public.activities where ${activityMatch})::int as activities,
    (select count(*) from public.contact_companies where contact_id in (${inIds('contacts')}) or company_id in (${inIds('companies')}))::int as associations,
    (select count(*) from public.activities a where record_type = 'companies' and not exists (select 1 from public.companies c where c.id = a.record_id))::int as orphan_company_activities`);
  if (!remaining?.[0] || Object.values(remaining[0]).some(n => Number(n) !== 0)) throw new Error(`Residuos del import: ${JSON.stringify(remaining)}`);
  log(`limpieza extra verificada: ${JSON.stringify(remaining[0])}; imports=${ids.join(',')}`);
}

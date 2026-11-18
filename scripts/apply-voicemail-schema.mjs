// Aplica el esquema del buzón de voz: columnas en twilio_connections y bucket público
// `voicemails` (Twilio necesita una URL pública para <Play>) con políticas por usuario.
import { runSql } from './mgmt-sql.mjs';

const sql = `
alter table public.twilio_connections
  add column if not exists voicemail_text text,
  add column if not exists voicemail_url text;

insert into storage.buckets (id, name, public)
values ('voicemails', 'voicemails', true)
on conflict (id) do nothing;

drop policy if exists voicemails_insert_own on storage.objects;
create policy voicemails_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'voicemails' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists voicemails_update_own on storage.objects;
create policy voicemails_update_own on storage.objects for update to authenticated
  using (bucket_id = 'voicemails' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists voicemails_delete_own on storage.objects;
create policy voicemails_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'voicemails' and (storage.foldername(name))[1] = auth.uid()::text);
`;

console.log(await runSql(sql));
console.log('[buzón] esquema aplicado');

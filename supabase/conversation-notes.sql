-- Omni CRM · Comentarios internos en la Bandeja de entrada («Responder | Comentario», como el original)
-- Aplicar con: node scripts/apply-migration.mjs supabase/conversation-notes.sql
-- (o pegando este archivo en el SQL Editor de Supabase). Idempotente. Escrita como código local: NO aplicada.
--
-- conversation_messages.kind: 'message' (enviado o recibido) o 'note' (comentario interno del equipo: no se envía,
-- se ve en amarillo en el hilo con su autor, no marca la conversación como respondida ni la reabre). Mientras la
-- columna no exista, la app guarda los comentarios solo en el navegador (ver src/conversations-data.js).

alter table public.conversation_messages add column if not exists kind text not null default 'message';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversation_messages_kind_check') then
    alter table public.conversation_messages add constraint conversation_messages_kind_check check (kind in ('message', 'note'));
  end if;
end $$;

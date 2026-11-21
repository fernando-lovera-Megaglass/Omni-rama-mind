-- Omni CRM · Worker de correos de marketing programados (Marketing › Correo).
-- Migración LOCAL / PENDIENTE: no aplicada a producción. Aplicar después de marketing-emails.sql, activities.sql,
-- segments.sql y gmail.sql. Ver docs/marketing-process.md. Idempotente (se puede ejecutar dos veces).
--
-- Hasta ahora un correo «programado» se quedaba en la tabla: el envío era 100 % del lado del cliente y nadie lo
-- recogía cuando llegaba la hora. Este archivo añade lo que necesita un worker del lado del servidor (la Edge
-- Function supabase/functions/marketing-process, invocada por scripts/local-scheduler.mjs o por pg_cron):
--
-- marketing_email_runs: una ejecución por correo programado. Reserva única (evita el doble envío entre invocaciones
--   concurrentes), cursor de destinatarios (next_index) para enviar por lotes respetando los límites de Gmail,
--   contadores sent/failed, arrendamiento (lease_until) para reanudar un lote y último error. Solo la service role
--   la lee o escribe: ninguna política para el navegador.
-- marketing_due(p_now):        ids de correos con estado 'programado' y programado_para vencida sin ejecución
--                              terminada (las ejecuciones 'processing' con el lease caducado se reanudan).
-- marketing_claim(p_id):       reserva el correo (for update skip locked + fila de ejecución) y lo devuelve.
-- marketing_recipients(p_id):  resuelve los destinatarios: la instantánea destinatarios.ids que congela la app al
--                              programar, la foto fija (member_ids) de un segmento estático, o todos los contactos
--                              con correo. Un segmento activo sin instantánea no se puede evaluar en SQL.
-- marketing_progress(...):     reserva el índice de un destinatario antes de enviar (como mucho un envío por
--                              destinatario) y después anota el resultado; con éxito deja la actividad «Correo de
--                              marketing» en la cronología del contacto, igual que el envío inmediato de la app.
-- marketing_finish(...):       cierra la ejecución: 'sent' (estado 'enviado', enviado_at y contadores), 'partial'
--                              (lote completo, sigue en el próximo tic), 'cancelled' (el correo dejó de estar
--                              programado durante el envío) o 'error' (queda a revisión; no se reintenta a ciegas).
-- Ninguna de las funciones es ejecutable por anon/authenticated: solo service_role.

create table if not exists public.marketing_email_runs (
  email_id uuid primary key references public.marketing_emails(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'done', 'error', 'cancelled')),
  next_index int not null default 0,
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_email_runs enable row level security;
grant all on public.marketing_email_runs to service_role;
-- No browser policies: only the service role may access execution records.
create index if not exists marketing_emails_due_idx on public.marketing_emails (programado_para) where estado = 'programado';

create or replace function public.marketing_recipients(p_id uuid)
returns table(contact_id bigint, email text, name text) language plpgsql security definer set search_path = public as $$
declare d jsonb; seg public.segments;
begin
  select m.destinatarios into d from public.marketing_emails m where m.id = p_id;
  if d is null then return; end if;
  if jsonb_typeof(d->'ids') = 'array' then
    -- Snapshot frozen by the app when the e-mail was scheduled (active segments are evaluated in the browser).
    return query select c.id, c.email, c.name from public.contacts c
      where c.id in (select value::bigint from jsonb_array_elements_text(d->'ids') where value ~ '^\d+$')
        and coalesce(c.email, '') ~ '\S+@\S+\.\S+' order by c.id;
  elsif d->>'kind' = 'segment' then
    select * into seg from public.segments s where s.id::text = d->>'id';
    if not found or seg.type <> 'static' then return; end if;
    return query select c.id, c.email, c.name from public.contacts c
      where c.id in (select value::bigint from jsonb_array_elements_text(seg.member_ids) where value ~ '^\d+$')
        and coalesce(c.email, '') ~ '\S+@\S+\.\S+' order by c.id;
  else
    return query select c.id, c.email, c.name from public.contacts c where coalesce(c.email, '') ~ '\S+@\S+\.\S+' order by c.id;
  end if;
end $$;

-- Exclude finished/errored runs before LIMIT so a campaign under review cannot starve later ones.
create or replace function public.marketing_due(p_now timestamptz)
returns table(id uuid) language sql security definer set search_path = public as $$
  select m.id from public.marketing_emails m
  left join public.marketing_email_runs r on r.email_id = m.id
  where m.estado = 'programado' and m.programado_para is not null and m.programado_para <= least(p_now, now())
    and (r.email_id is null or (r.status = 'processing' and (r.lease_until is null or r.lease_until < now())))
  order by m.programado_para, m.id limit 20;
$$;

create or replace function public.marketing_claim(p_id uuid)
returns setof public.marketing_emails language plpgsql security definer set search_path = public as $$
declare m public.marketing_emails; claimed int;
begin
  select * into m from public.marketing_emails
    where id = p_id and estado = 'programado' and programado_para is not null and programado_para <= now() for update skip locked;
  if not found then return; end if;
  insert into public.marketing_email_runs(email_id, total, lease_until)
    values (m.id, (select count(*) from public.marketing_recipients(m.id)), now() + interval '10 minutes')
    on conflict (email_id) do update set lease_until = now() + interval '10 minutes', updated_at = now()
      where marketing_email_runs.status = 'processing'
        and (marketing_email_runs.lease_until is null or marketing_email_runs.lease_until < now());
  get diagnostics claimed = row_count;
  if claimed = 1 then return next m; end if;
end $$;

-- p_ok null = reserve the index before the external send (at most one attempt per recipient);
-- p_ok true/false = record the result afterwards. Returns false once the e-mail is no longer 'programado'.
create or replace function public.marketing_progress(p_id uuid, p_index int, p_ok boolean, p_error text, p_contact_id bigint, p_receipt jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare m public.marketing_emails;
begin
  select * into m from public.marketing_emails where id = p_id for update;
  if not found or m.estado <> 'programado' then return false; end if;
  if not exists (select 1 from public.marketing_email_runs r where r.email_id = p_id and r.status = 'processing') then return false; end if;
  update public.marketing_email_runs set
    next_index = greatest(next_index, p_index),
    sent = sent + case when p_ok then 1 else 0 end,
    failed = failed + case when p_ok is false then 1 else 0 end,
    last_error = coalesce(p_error, last_error),
    lease_until = now() + interval '10 minutes', updated_at = now()
    where email_id = p_id;
  if p_ok and p_contact_id is not null then
    insert into public.activities(type, record_type, record_id, text, who, occurred_at, extra)
      values ('email', 'contacts', p_contact_id, 'Correo de marketing: ' || m.nombre, 'Marketing', now(),
        jsonb_build_object('subject', m.asunto, 'marketingEmailId', m.id, 'channel', 'Correo de marketing', 'opened', false, 'gmail', coalesce(p_receipt, 'null'::jsonb)));
  end if;
  return true;
end $$;

create or replace function public.marketing_finish(p_id uuid, p_status text, p_error text default null)
returns text language plpgsql security definer set search_path = public as $$
declare m public.marketing_emails; r public.marketing_email_runs;
begin
  select * into m from public.marketing_emails where id = p_id for update;
  if not found then return 'missing'; end if;
  select * into r from public.marketing_email_runs where email_id = p_id and status = 'processing' for update;
  if not found then return 'unchanged'; end if;
  -- Preserve a state written by the app while the batch was in flight (unscheduled, archived, deleted…).
  if m.estado <> 'programado' then
    update public.marketing_email_runs set status = 'cancelled', lease_until = null, last_error = coalesce(p_error, last_error), updated_at = now() where email_id = p_id;
    return 'cancelled';
  end if;
  if p_status = 'partial' then
    -- Batch limit reached: release the lease so the next tick continues from next_index.
    update public.marketing_email_runs set lease_until = null, updated_at = now() where email_id = p_id;
    return 'partial';
  end if;
  if p_status = 'done' and r.sent > 0 then
    update public.marketing_email_runs set status = 'done', lease_until = null, updated_at = now() where email_id = p_id;
    update public.marketing_emails set estado = 'enviado', enviado_at = now(), enviados = r.sent, entregados = r.sent, updated_at = now() where id = p_id;
    return 'sent';
  end if;
  update public.marketing_email_runs set status = 'error', lease_until = null, updated_at = now(),
    last_error = coalesce(p_error, case when p_status = 'done' then 'Ningún destinatario recibió el correo' else last_error end)
    where email_id = p_id;
  return 'error';
end $$;

revoke all on function public.marketing_recipients(uuid) from public, anon, authenticated;
revoke all on function public.marketing_due(timestamptz) from public, anon, authenticated;
revoke all on function public.marketing_claim(uuid) from public, anon, authenticated;
revoke all on function public.marketing_progress(uuid, int, boolean, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_finish(uuid, text, text) from public, anon, authenticated;
grant execute on function public.marketing_recipients(uuid) to service_role;
grant execute on function public.marketing_due(timestamptz) to service_role;
grant execute on function public.marketing_claim(uuid) to service_role;
grant execute on function public.marketing_progress(uuid, int, boolean, text, bigint, jsonb) to service_role;
grant execute on function public.marketing_finish(uuid, text, text) to service_role;

-- ===== Planificador en producción (OPCIONAL, comentado a propósito: no se activa con esta migración) =====
-- La misma Edge Function la puede invocar pg_cron cada minuto con pg_net, leyendo la URL del proyecto y la service
-- role key de Vault (nunca en claro en SQL). Sirve igual para sequence-process (cambia el nombre de la función).
-- Activar solo tras desplegar la función y guardar los secretos 'project_url' y 'service_role_key' en Vault:
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('marketing-process', '* * * * *', $cron$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/marketing-process',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
--     body := '{}'::jsonb, timeout_milliseconds := 50000)
-- $cron$);
-- -- Desactivar: select cron.unschedule('marketing-process');
